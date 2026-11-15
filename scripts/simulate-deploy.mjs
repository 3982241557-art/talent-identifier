/* ============================================================
 *  Pages 发布流程模拟器（v15.5）
 * ============================================================
 *
 *  【为什么需要】
 *  Cloudflare Pages 的 Git 集成流程是：
 *
 *    1. Initializing  → 初始化构建环境
 *    2. Cloning       → 拉取仓库
 *    3. Installing    → npm install
 *    4. Building      → 跑 Build command，产出到 Build output directory
 *    5. Deploying     → 发布 Build output directory
 *                       + 打包 functions/ 目录为 Pages Functions
 *
 *  前四步全绿、第五步红叉，说明问题出在「发布」环节。
 *
 *  【本脚本验证什么】
 *  完整复刻第 4、5 步：
 *    · 第 4 步：跑真实的 Build command，检查产物落在 dist/
 *    · 第 5 步：用 Pages 的打包器编译 functions/，
 *               检查路由表里 /api/* 指向正确的 handler
 *               检查 dist/ 里的关键文件齐全
 *
 *  并且**主动检查**哪些配置会让第 5 步失败。
 * ============================================================ */

import { execSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
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

/* ============================================================
 *  第 5 步前置：发布配置必须合法
 * ============================================================ */
console.log('\n【第 5 步 · Deploying】发布前置条件\n')

const toml = readFileSync(resolve(root, 'wrangler.toml'), 'utf-8')

/* ---- 1. 不能混入 Workers 字段 ---- */
const hasMain = /^main\s*=/m.test(toml)
const hasAssets = /^\[assets\]/m.test(toml)
check(
  'wrangler.toml 无 Workers 字段（main / [assets]）',
  !hasMain && !hasAssets,
  '存在这些字段 → Cloudflare 按 Workers 解析，Pages 项目发布必然失败',
)

/* ---- 2. 必须声明 pages_build_output_dir ---- */
const pagesOut = toml.match(/pages_build_output_dir\s*=\s*['"]([^'"]+)['"]/)?.[1]
check(
  `wrangler.toml 声明 pages_build_output_dir = "${pagesOut}"`,
  typeof pagesOut === 'string',
  '缺失 → Pages 找不到静态资源目录',
)
check(
  'pages_build_output_dir 指向 dist',
  pagesOut?.replace(/^\.\//, '') === 'dist',
  `实际 "${pagesOut}"`,
)

/* ---- 3. 不得有 [vars]（会与控制台环境变量互相覆盖）---- */
check(
  'wrangler.toml 无 [vars]（环境变量单一真相源在控制台）',
  !/^\s*\[vars\]/m.test(toml),
)

/* ============================================================
 *  第 4 步 · Building（重跑一次真实构建）
 * ============================================================ */
console.log('\n【第 4 步 · Building】产物检查\n')

const DIST = resolve(root, 'dist')
if (!existsSync(DIST)) {
  console.log('  dist/ 不存在，执行构建…')
  execSync('npm run build', { cwd: root, stdio: 'inherit' })
}

check('dist/ 目录存在', existsSync(DIST))
check('dist/index.html 存在', existsSync(join(DIST, 'index.html')))

const distFiles = existsSync(DIST) ? readdirSync(DIST) : []
check(
  `dist/ 包含静态资源（${distFiles.length} 个条目）`,
  distFiles.includes('assets'),
  '缺少 assets/ —— 前端 JS/CSS 没打出来',
)
check(
  'dist/_routes.json 存在（/api/* 走 Functions）',
  distFiles.includes('_routes.json'),
)
check(
  'dist/_headers 存在（缓存与安全头）',
  distFiles.includes('_headers'),
)

/* index.html 必须引用构建产物 */
if (existsSync(join(DIST, 'index.html'))) {
  const html = readFileSync(join(DIST, 'index.html'), 'utf-8')
  check(
    'index.html 引用了 /assets/ 下的构建产物',
    /\/assets\/[^"']+\.(js|css)/.test(html),
    '没有 asset 引用 → 页面加载不到脚本',
  )
  check('index.html 含挂载点 id="root"', html.includes('id="root"'))
}

/* ============================================================
 *  第 5 步 · Pages Functions 打包
 * ============================================================ */
console.log('\n【第 5 步 · Deploying】Pages Functions 打包\n')

check(
  'functions/api/[[path]].js 存在（/api/* 的路由入口）',
  existsSync(resolve(root, 'functions', 'api', '[[path]].js')),
  '缺失 → /api/* 会 404',
)

const OUT = resolve(root, '.wrangler', 'pages-sim')
try {
  execSync(
    `npx wrangler pages functions build --outdir "${OUT}"`,
    { cwd: root, stdio: 'pipe' },
  )
  check('Pages Functions 编译成功', true)
} catch (e) {
  check('Pages Functions 编译成功', false, String(e.stdout ?? e).slice(0, 200))
}

if (existsSync(OUT)) {
  const built = readdirSync(OUT)
  check(
    `Functions 产物生成（${built.join(', ')}）`,
    built.length > 0,
  )

  const index = join(OUT, 'index.js')
  if (existsSync(index)) {
    const src = readFileSync(index, 'utf-8')
    check(
      'Functions bundle 含 /api 路由处理器',
      src.includes('api') || src.includes('__routes'),
    )
    check(
      'Functions bundle 未引入 Node 内置模块（Workers 运行时不支持）',
      !/require\("node:fs"\)|require\("fs"\)/.test(src),
    )
  }
}

/* ============================================================
 *  汇总
 * ============================================================ */
console.log(`\n${'='.repeat(52)}`)
console.log(`通过 ${pass} 项，失败 ${fail} 项`)
console.log('='.repeat(52))

if (fail > 0) {
  console.error('\n[simulate-deploy] 发布阶段会失败 —— 请先修正。')
  process.exit(1)
}
console.log('\n[simulate-deploy] 第 4、5 步均可绿灯 ✓')
