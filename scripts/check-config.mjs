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
     * v15.5：项目形态必须是 Pages。
     *
     * Cloudflare 的判定逻辑：
     *   toml 里有 main + [assets] → 当成 Workers 项目
     *   只有 pages_build_output_dir → 当成 Pages 项目
     *
     * 如果在 Pages 项目里带了 Workers 字段，
     * 或者反过来用 `wrangler deploy`（Workers 命令），
     * Cloudflare 会直接拒绝：
     *   "It looks like you've run a Workers-specific command in a Pages project.
     *    For Pages, please run `wrangler pages deploy` instead."
     *
     * 所以这里**只允许 Pages 形态**，出现 Workers 字段即判定失败。
     */
    check(
      'wrangler.toml 是纯 Pages 形态（有 pages_build_output_dir）',
      isPagesMode,
      '缺少 pages_build_output_dir —— Pages 找不到静态资源目录',
    )

    check(
      'wrangler.toml 不含 Workers 专用字段（main / [assets]）',
      !isWorkersMode,
      '带有 main 或 [assets] → Cloudflare 会按 Workers 项目解析，导致 Pages 发布失败',
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

    /* [vars] 会与控制台环境变量互相覆盖，应由控制台单一管理 */
    const wranglerHasVars = /^\s*\[vars\]/m.test(src)
    check(
      'wrangler.toml 不含 [vars]（密钥单一真相源在控制台）',
      !wranglerHasVars,
      'wrangler.toml 的 [vars] 会与控制台环境变量合并覆盖，建议移到控制台',
    )

    const cmd = src.match(/command\s*=\s*["']([^"']+)["']/)?.[1]
    check(
      `wrangler.toml 的 build.command = "${cmd}"`,
      Boolean(cmd),
      '缺少 build.command',
    )
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

/* ---------- 4.6 · 无 Vercel 等废弃平台残留 ---------- */
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

/* ---------- 4.7 · Functions 依赖链不含 Node 内置模块 ---------- */
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
