/* ============================================================
 *  部署配置一致性检查（v15.3）
 * ============================================================
 *
 *  【为什么需要】
 *  Cloudflare Pages 的 "Missing entry-point to Worker script or to
 *  assets directory" 这类报错，根因往往在配置之间不一致：
 *
 *    · vite.config.ts 的 build.outDir
 *    · wrangler.toml 的 pages_build_output_dir
 *    · Cloudflare 控制台的 Build output directory
 *    · package.json 的 build 脚本是否真的产出该目录
 *
 *  这四处只要有一处对不上，线上就是 404，而且报错信息完全指不到症结。
 *
 *  本脚本在**构建前**就把它们对齐检查一遍，
 *  任何不一致直接以非 0 退出码失败 —— 宁可在构建阶段红掉，
 *  也不要等到部署后才发现线上 404。
 * ============================================================ */

import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')

let pass = 0
let fail = 0
function check(name, ok, detail = '') {
  if (ok) {
    pass++
    console.log(`  ✓ ${name}`)
  } else {
    fail++
    console.log(`  ✗ ${name}${detail ? `\n      → ${detail}` : ''}`)
  }
}

console.log('\n【部署配置一致性检查】\n')

/* ---------- 1. Vite 输出目录 ---------- */
let viteOutDir = null
{
  const file = resolve(root, 'vite.config.ts')
  const src = readFileSync(file, 'utf-8')
  const m = src.match(/outDir:\s*['"]([^'"]+)['"]/)
  viteOutDir = m?.[1] ?? null
  check(
    'vite.config.ts 显式声明 build.outDir',
    viteOutDir !== null,
    '未找到 outDir 配置 —— 必须显式声明，否则与 Cloudflare 配置可能对不上',
  )
  check(
    `vite.config.ts 的 build.outDir = "${viteOutDir}"`,
    viteOutDir === 'dist',
    `期望 "dist"，实际 "${viteOutDir}"`,
  )
}

/* ---------- 2. wrangler.toml ---------- */
let pagesOutDir = null
{
  const file = resolve(root, 'wrangler.toml')
  if (!existsSync(file)) {
    check('wrangler.toml 存在', false, '文件缺失 —— Cloudflare 将无法定位静态资源目录')
  } else {
    const src = readFileSync(file, 'utf-8')
    /*
     * v15.4：同时支持两种部署形态
     *
     *  · Pages 形态 → pages_build_output_dir = "./dist"
     *  · Workers 形态 → main = "functions/_worker.js"
     *                 + [assets] directory = "./dist"
     *
     * 两者都必须把静态资源指到 dist/，
     * 只是字段名不同 —— 检查器要把两种都认。
     */
    const m = src.match(/pages_build_output_dir\s*=\s*['"]([^'"]+)['"]/)
    pagesOutDir = m?.[1] ?? null

    const main = src.match(/^main\s*=\s*['"]([^'"]+)['"]/m)?.[1] ?? null
    const assetsDir = src.match(/^directory\s*=\s*['"]([^'"]+)['"]/m)?.[1] ?? null
    const assetsBinding = src.match(/^binding\s*=\s*['"]([^'"]+)['"]/m)?.[1] ?? null

    const isPagesMode = pagesOutDir !== null
    const isWorkersMode = main !== null && assetsDir !== null

    check('wrangler.toml 存在', true)

    /*
     * v15.6：项目已被 Cloudflare 迁移到 Workers 平台
     * （Pages 正在被自动统一到 Workers）。
     *
     * 判定依据（线上实测）：
     *   · 域名是 <worker名>.<账户ID>.workers.dev —— Worker 的命名规则
     *   · <项目名>.pages.dev 的 DNS 不存在 —— Pages 域名从未生效
     *   · 控制台有 "workers.dev Disabled" 开关 —— 只有 Worker 才有
     *
     * 所以这里**只允许 Worker 形态**：
     *   main      → Worker 入口
     *   [assets]  → 静态资源绑定
     *
     * 两种形态不能混用：
     *   · Pages 项目里带 Workers 字段 → wrangler 按 Workers 解析 → 发布失败
     *   · Worker 项目里用 pages_build_output_dir → 缺入口 → 报 Missing entry-point
     */
    check(
      'wrangler.toml 是 Worker 形态（有 main + [assets]）',
      isWorkersMode,
      '项目已迁移到 Workers 平台，必须配 main 与 [assets]，否则报 Missing entry-point',
    )

    check(
      'wrangler.toml 不含 Pages 专用字段（pages_build_output_dir）',
      !isPagesMode,
      'Worker 项目里出现 pages_build_output_dir 会让配置被判为无效',
    )

    if (isPagesMode) {
      check(
        `wrangler.toml 的 pages_build_output_dir = "${pagesOutDir}"`,
        pagesOutDir?.replace(/^\.\//, '') === 'dist',
        `期望 "./dist" 或 "dist"，实际 "${pagesOutDir}"`,
      )
    }

    if (isWorkersMode) {
      check(
        `wrangler.toml 的 main = "${main}"`,
        true,
      )
      check(
        `wrangler.toml 的 [assets] directory = "${assetsDir}"`,
        assetsDir?.replace(/^\.\//, '') === 'dist',
        `期望 "./dist" 或 "dist"，实际 "${assetsDir}"`,
      )
      check(
        `wrangler.toml 的 [assets] binding = "${assetsBinding}"`,
        Boolean(assetsBinding),
        '缺少 binding —— Worker 拿不到静态资源',
      )

      /* main 指向的文件必须真实存在 */
      const mainFile = resolve(root, main)
      check(
        `main 指向的文件存在（${main}）`,
        existsSync(mainFile),
        '文件不存在 —— 部署时会报找不到 Worker 入口',
      )
    }

    /*
     * 【v15.5 · 关键陷阱】Pages 项目**不支持 [build] 段**！
     *
     * wrangler 遇到不支持的段会**直接忽略整个配置文件**：
     *   [WARNING] We detected a configuration file... but it is missing the
     *             "pages_build_output_dir" field... Ignoring configuration file
     *   [ERROR] Missing Pages project name.
     *
     * 报错信息极具误导性 —— 它说「缺少 pages_build_output_dir」，
     * 但那个字段明明就在文件里。真相是**整个文件被丢弃了**，
     * 原因就是里面有个 [build] 段。
     *
     * 官方原文：Configuration file for Pages projects does not support "build"
     */
    const wranglerHasBuild = /^\s*\[build\]\s*$/m.test(src)
    if (isPagesMode) {
      check(
        'wrangler.toml 不含 [build] 段（Pages 项目不支持，会导致整个文件被忽略）',
        !wranglerHasBuild,
        'Pages 的 wrangler 会拒绝含 [build] 的配置，并静默忽略整个文件 → 报 Missing Pages project name',
      )
    } else {
      check(
        'wrangler.toml 的 compatibility_date 在顶层（[assets] 之前）',
        /^compatibility_date\s*=/m.test(src.split(/^\[/m)[0]),
        '放在 [assets] 之后会被 TOML 归入 assets 段 → 报 compatibility_date is required',
      )
    }

    /* [vars] 会与控制台环境变量互相覆盖，应由控制台单一管理 */
    const wranglerHasVars = /^\s*\[vars\]/m.test(src)
    check(
      'wrangler.toml 不含 [vars]（密钥单一真相源在控制台）',
      !wranglerHasVars,
      'wrangler.toml 的 [vars] 会与控制台环境变量合并覆盖，建议移到控制台',
    )

    /*
     *  注意：**不检查 build.command**
     *
     *  Pages 的 wrangler 配置文件不支持 [build] 段，
     *  写了会导致整个文件被忽略（详见上面的说明）。
     *  构建命令的唯一真相源是 Cloudflare 控制台的 Build command
     *  与 package.json 的 scripts.build。
     */
  }
}

/* ---------- 3. package.json 脚本 ---------- */
{
  const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf-8'))
  const build = pkg.scripts?.build
  check('package.json 存在 build 脚本', Boolean(build), '缺少 scripts.build')
  check(
    `build 脚本使用自愈构建器（${build}）`,
    String(build).includes('cloud-build'),
    '建议改为 "node scripts/cloud-build.mjs" —— 它会在 devDependencies 缺失时自动补装',
  )

  const devDeps = Object.keys(pkg.devDependencies ?? {})
  const prodDeps = Object.keys(pkg.dependencies ?? {})
  for (const dep of ['typescript', 'vite']) {
    check(
      `${dep} 在 devDependencies 中`,
      devDeps.includes(dep),
      `当前在 dependencies: ${prodDeps.includes(dep)}`,
    )
  }
}

/* ---------- 4. Functions 与静态资源 ---------- */
{
  check(
    'functions/ 目录存在（Pages Functions 才会启用）',
    existsSync(resolve(root, 'functions', 'api')),
    '缺少 functions/api —— /api/* 会 404',
  )

  const routes = resolve(root, 'public', '_routes.json')
  if (existsSync(routes)) {
    const r = JSON.parse(readFileSync(routes, 'utf-8'))
    check(
      'public/_routes.json 让 /api/* 走 Functions',
      Array.isArray(r.include) && r.include.includes('/api/*'),
      `include 应包含 "/api/*"，实际 ${JSON.stringify(r.include)}`,
    )
  } else {
    check('public/_routes.json 存在', false, '缺失 —— /api/* 可能被静态资源抢走')
  }
}

/* ---------- 4.5 · Node 版本 ---------- */
{
  const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf-8'))

  check(
    `package.json 声明 engines.node = "${pkg.engines?.node}"`,
    typeof pkg.engines?.node === 'string',
    '未声明 engines —— Cloudflare 可能用 Node 18/20，而 wrangler 要求 >=22.12.0',
  )

  check(
    'engines.node 满足 >=22.12.0',
    Boolean(pkg.engines?.node?.includes('22')),
    `当前 "${pkg.engines?.node}"`,
  )

  /* .node-version / .nvmrc 会被 Cloudflare 用来选 Node 版本 */
  const nv = resolve(root, '.node-version')
  const nvmrc = resolve(root, '.nvmrc')
  check('.node-version 存在（锁定 Cloudflare 的 Node 版本）', existsSync(nv))
  check('.nvmrc 存在', existsSync(nvmrc))

  if (existsSync(nv)) {
    const v = readFileSync(nv, 'utf-8').trim()
    check(
      `.node-version = ${v}`,
      v.startsWith('22'),
      '建议锁定 22.x —— wrangler / vite 8 都要求 >=22.12.0',
    )
  }
}

/* ---------- 4.6 · 部署脚本必须与 cwd 解耦 ---------- */
{
  /*
   * v15.8 教训：
   *
   * wrangler **只在当前工作目录**查找 wrangler.toml，
   * 不会向上查找父目录。
   *
   * Cloudflare Workers Builds 的 Deploy command
   * 并不保证在仓库根目录执行 —— 那里执行时 wrangler 找不到配置，
   * 于是报：
   *   "Missing entry-point to Worker script or to assets directory"
   *   （并建议加 main / [assets]，但字段其实就在文件里）
   *
   * 已在本地用对照实验证实：
   *   仓库根执行   → ✓ Read 14 files from the assets directory
   *   父目录执行   → ✗ 完全找不到配置
   *   加 --cwd     → ✓ 恢复正常
   *
   * 所以部署脚本必须：
   *   1. 基于自身位置定位仓库根（不依赖 cwd）
   *   2. 用 --cwd 显式指定
   *   3. 用命令行参数显式传入 name / assets / compatibility-date
   */
  const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf-8'))
  const deployScript = pkg.scripts?.deploy ?? ''
  const cfDeployScript = pkg.scripts?.['deploy:cloudflare'] ?? ''

  /*
   * v18.0 · 部署目标已切换到 GitHub Pages
   * ------------------------------------------------------------
   * Cloudflare / Vercel 在国内网络不可达，静态站点改由 GitHub Pages 托管。
   *
   * 契约：
   *   npm run deploy        → predeploy(build) → gh-pages -d dist
   *   npm run deploy:cloudflare → 保留原 wrangler 链路（随时可回退）
   *
   * 检查项随之调整：
   *   · deploy 必须走 gh-pages
   *   · predeploy 必须先 build（否则推的是上一次的旧产物）
   *   · --nojekyll 必须带上（否则 Pages 会跑 Jekyll，_ 开头的目录被吞）
   *   · 分支必须是 gh-pages
   */
  check(
    'package.json 的 deploy 脚本走 gh-pages',
    deployScript.includes('gh-pages') && deployScript.includes('-d dist'),
    `deploy 脚本应把 dist/ 推到 gh-pages 分支，实际："${deployScript}"`,
  )

  check(
    'package.json 的 predeploy 脚本 = "npm run build"',
    (pkg.scripts?.predeploy ?? '').includes('npm run build'),
    '缺少 predeploy → 推上 gh-pages 的是上一次构建的旧产物',
  )

  check(
    'gh-pages 发布带 --nojekyll',
    deployScript.includes('--nojekyll'),
    '缺少 --nojekyll → GitHub Pages 会启用 Jekyll，_headers 等下划线目录/文件被吞',
  )

  check(
    'gh-pages 发布指定 gh-pages 分支',
    /-b\s+gh-pages/.test(deployScript),
    '缺少 -b gh-pages → 会推到默认分支，Pages 无从读取',
  )

  check(
    'gh-pages 发布强制无历史（-f）',
    /-f\s/.test(deployScript),
    '缺少 -f → gh-pages 分支会继承 main 的源码树（server/、.gitignore 等被一起推上线）',
  )

  check(
    'gh-pages 发布带 --before-add 清理钩子',
    deployScript.includes('--before-add'),
    '缺少清理钩子 → .gitignore / server/.env.example 等源码碎片会混进 gh-pages 分支',
  )

  check(
    'gh-pages 发布指定目标仓库',
    /-r\s+https:\/\/github\.com\/3982241557-art\/talent-identifier/.test(
      deployScript,
    ),
    '缺少 -r <repo> → 无法确定推到哪个仓库',
  )

  check(
    'Cloudflare 发布链路保留在 deploy:cloudflare',
    cfDeployScript.includes('scripts/deploy.mjs'),
    '建议保留 deploy:cloudflare 作为回退通道',
  )

  /* 旧的 stub 必须已被移除 */
  check(
    'scripts/deploy-stub.mjs 已移除（它只 exit 0，不会真的发布）',
    !existsSync(resolve(root, 'scripts', 'deploy-stub.mjs')),
    'deploy-stub 会让 Cloudflare 显示绿色 Ready，但实际什么都没上传',
  )
}

/* ---------- 4.7 · 部署脚本必须真正上传 ---------- */
{
  /*
   * v18.0 · 部署目标改为 GitHub Pages
   *
   * 旧检查针对 Cloudflare（deploy → scripts/deploy.mjs → wrangler deploy）。
   * 现在静态站点由 GitHub Pages 托管，
   * 但 **wrangler 链路仍需保留**（后端 API 还住在 Worker 上），
   * 所以这里校验的是「两条链路都在」，而不是「只留一条」。
   */
  const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf-8'))
  const cfDeployScript = pkg.scripts?.['deploy:cloudflare'] ?? ''
  check(
    `package.json 的 deploy:cloudflare 脚本 = "${cfDeployScript}"`,
    cfDeployScript.includes('scripts/deploy.mjs'),
    'deploy:cloudflare 应指向 scripts/deploy.mjs —— 它会真正执行 wrangler deploy',
  )

  const deployFile = resolve(root, 'scripts', 'deploy.mjs')
  if (existsSync(deployFile)) {
    const src = readFileSync(deployFile, 'utf-8')
    check(
      'scripts/deploy.mjs 真的调用了 wrangler deploy',
      /wrangler['\s,]+deploy/.test(src),
      '未调用 wrangler deploy → Cloudflare 只会显示绿色 Ready，但什么都没上传',
    )
    check(
      'scripts/deploy.mjs 部署后验证了线上响应',
      src.includes('Hello world'),
      '应检测线上是否仍返回模板 Worker 的 "Hello world"',
    )

    check(
      'scripts/deploy.mjs 打印了当前 commit（用于确认部署的是最新版本）',
      src.includes('git rev-parse'),
      '应打印 commit 号 —— 改完 Deploy command 后 Cloudflare 常会用旧 commit 重发布，' +
        '报 "Cannot find module" 但文件其实早已 push',
    )
  } else {
    check('scripts/deploy.mjs 存在', false, '缺失 —— 无法保证部署真的上传了内容')
  }

  /* 旧的 stub 必须已被移除 */
  check(
    'scripts/deploy-stub.mjs 已移除（它只 exit 0，不会真的发布）',
    !existsSync(resolve(root, 'scripts', 'deploy-stub.mjs')),
    'deploy-stub 会让 Cloudflare 显示绿色 Ready，但实际什么都没上传',
  )
}

/* ---------- 4.8 · 无 Vercel 等废弃平台残留 ---------- */
{
  const serverPkg = resolve(root, 'server', 'package.json')
  if (existsSync(serverPkg)) {
    const d = JSON.parse(readFileSync(serverPkg, 'utf-8'))
    check(
      'server/package.json 无 vercel deploy 脚本',
      !d.scripts?.deploy,
      '废弃平台的脚本应清理，避免误触发',
    )
  }

  const residue = []
  for (const f of ['package.json', 'server/package.json']) {
    const src = readFileSync(resolve(root, f), 'utf-8')
    if (/vercel/i.test(src)) residue.push(f)
  }
  check(
    '无 Vercel 配置残留',
    residue.length === 0,
    `仍含 vercel 引用：${residue.join(', ')}`,
  )
}

/* ---------- 4.9 · Functions 依赖链不含 Node 内置模块 ---------- */
{
  /*
   * Workers 运行时没有 node:fs / node:path 等内置模块。
   * Functions 的整条依赖链一旦引入，Functions 构建就会失败 ——
   * 而且报错发生在 bundling 阶段，很容易被误判成「入口文件问题」。
   */
  const files = [
    'functions/api/[[path]].js',
    'functions/_lib/api-handler.js',
    'functions/_lib/chart-workers.js',
    'functions/_lib/deepseek-workers.js',
    'functions/_lib/talent-workers.js',
    'server/prompt.mjs',
    'server/mbtiCanon.mjs',
    'server/mbtiFallback.mjs',
    'server/corpus-workers.mjs',
  ]
  const bad = []
  for (const f of files) {
    const p = resolve(root, f)
    if (!existsSync(p)) continue
    const src = readFileSync(p, 'utf-8')
    if (/from\s+['"](node:|fs['"]|path['"]|url['"]|os['"]|child_process['"])/.test(src)) {
      bad.push(f)
    }
  }
  check(
    'Functions 依赖链无 Node 内置模块',
    bad.length === 0,
    `这些文件引入了 node: 内置模块：${bad.join(', ')}`,
  )
}

/* ---------- 5. 构建产物（若已构建） ---------- */
{
  const dist = resolve(root, 'dist')
  if (existsSync(dist)) {
    check('dist/index.html 存在', existsSync(resolve(dist, 'index.html')))
  } else {
    console.log('  ○ dist/ 尚未构建（跳过产物检查）')
  }
}

/* ---------- 6. 密钥安全 ---------- */
{
  const ignored = readFileSync(resolve(root, '.gitignore'), 'utf-8')
  check('.gitignore 排除 .env', /^\.env$/m.test(ignored))
  check('.gitignore 排除 server/.env', /^server\/\.env$/m.test(ignored))
  check('.gitignore 排除 .dev.vars', /^\.dev\.vars$/m.test(ignored))
}

console.log(`\n${'='.repeat(50)}`)
console.log(`通过 ${pass} 项，失败 ${fail} 项`)
console.log('='.repeat(50))

if (fail > 0) {
  console.error('\n[check-config] 配置不一致 —— 部署一定会失败，请先修正。')
  process.exit(1)
}
console.log('\n[check-config] 全部一致 ✓')
