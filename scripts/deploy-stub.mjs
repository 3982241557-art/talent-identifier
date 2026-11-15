/* ============================================================
 *  发布占位脚本（v15.5）
 * ============================================================
 *
 *  【为什么需要这个脚本】
 *  Cloudflare Pages 的 Git 集成流程：
 *
 *    1. Initializing → 2. Cloning → 3. Installing
 *    4. Building     → 跑 Build command，产出到 Build output directory
 *    5. Deploying    → 上传 Build output directory + 打包 functions/
 *
 *  第 5 步本来**完全由 Cloudflare 内部完成**，
 *  不需要 wrangler、不需要任何 API token。
 *  所以 Deploy command **留空**才是最省事、最可靠的写法。
 *
 *  但有些控制台界面不允许清空这一栏（或清空后被回退成默认值）。
 *  这时如果填 `npx wrangler pages deploy dist`，
 *  会遇到两个问题：
 *
 *    ① 报 \"Missing Pages project name\"
 *       —— wrangler 在非交互环境读不到项目名
 *    ② 报 \"it's necessary to set a CLOUDFLARE_API_TOKEN\"
 *       —— Git 集成的构建环境**不会**自动注入这个变量
 *          （官方文档列出的默认注入变量只有
 *           CI / CF_PAGES / CF_PAGES_COMMIT_SHA /
 *           CF_PAGES_BRANCH / CF_PAGES_URL，没有 token）
 *
 *  【本脚本的解法】
 *  做一次**零副作用的幂等校验**然后正常退出（exit 0）：
 *
 *    · 检查 Build output directory 里有没有 index.html
 *    · 检查 functions/ 目录里有没有 API 路由入口
 *    · 打印一份清晰的部署摘要
 *    · exit 0
 *
 *  exit 0 会被 Cloudflare 判定为\"发布步骤成功\"，
 *  而真正的上传由 Cloudflare 内部接着完成 ——
 *  既不需要 token，也不需要项目名，还能在发布前抓出真实问题。
 *
 *  用法（填进 Cloudflare 的 Deploy command）：
 *    node scripts/deploy-stub.mjs
 * ============================================================ */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')

/* ============================================================
 *  读取部署目标
 * ============================================================ */

/** 从 wrangler.toml 里读 pages_build_output_dir（读不到就用 dist） */
function readOutputDir() {
  const toml = resolve(root, 'wrangler.toml')
  if (!existsSync(toml)) return 'dist'
  const src = readFileSync(toml, 'utf-8')
  const m = src.match(/pages_build_output_dir\s*=\s*['"]([^'"]+)['"]/)
  return m?.[1]?.replace(/^\.\//, '') ?? 'dist'
}

const outDir = readOutputDir()
const DIST = resolve(root, outDir)

console.log('[deploy] ================================================')
console.log('[deploy] 天赋识别器 · 发布前置校验')
console.log('[deploy] ================================================')
console.log(`[deploy] 输出目录   : ${outDir}/`)
console.log(`[deploy] 分支       : ${process.env.CF_PAGES_BRANCH ?? '(本地)'}`)
console.log(`[deploy] 提交       : ${process.env.CF_PAGES_COMMIT_SHA?.slice(0, 7) ?? '(本地)'}`)

/* ============================================================
 *  校验 1 · 静态资源
 * ============================================================ */
let ok = true

if (!existsSync(DIST)) {
  console.error(`[deploy] ✗ ${outDir}/ 不存在 —— 构建没有产出静态资源`)
  ok = false
} else {
  const files = readdirSync(DIST)
  const size = files.reduce((sum, f) => {
    try {
      return sum + statSync(join(DIST, f)).size
    } catch {
      return sum
    }
  }, 0)

  if (!existsSync(join(DIST, 'index.html'))) {
    console.error('[deploy] ✗ 缺少 index.html —— 发布的将不是一个可用的站点')
    ok = false
  } else {
    console.log(`[deploy] ✓ index.html 就位（${files.length} 个条目）`)
  }

  if (files.includes('assets')) {
    console.log('[deploy] ✓ assets/ 构建产物就位')
  } else {
    console.warn('[deploy] ! 未发现 assets/ —— 前端脚本可能没打出来')
  }

  console.log(`[deploy] ✓ 静态资源总量约 ${(size / 1024).toFixed(1)} KB`)
}

/* ============================================================
 *  校验 2 · Pages Functions
 * ============================================================ */
const fnEntry = resolve(root, 'functions', 'api', '[[path]].js')
if (!existsSync(fnEntry)) {
  console.error('[deploy] ✗ functions/api/[[path]].js 缺失 —— /api/* 会 404')
  ok = false
} else {
  console.log('[deploy] ✓ Pages Functions 入口就位（/api/*）')
}

const libDir = resolve(root, 'functions', '_lib')
if (existsSync(libDir)) {
  const libs = readdirSync(libDir).filter((f) => f.endsWith('.js'))
  console.log(`[deploy] ✓ 辅助模块 ${libs.length} 个（_lib/ 不建路由）`)
}

/* ============================================================
 *  校验 3 · 路由声明
 * ============================================================ */
const routes = resolve(root, 'public', '_routes.json')
if (existsSync(routes)) {
  const r = JSON.parse(readFileSync(routes, 'utf-8'))
  if (Array.isArray(r.include) && r.include.includes('/api/*')) {
    console.log('[deploy] ✓ _routes.json 已声明 /api/* 走 Functions')
  } else {
    console.warn('[deploy] ! _routes.json 未把 /api/* 指向 Functions')
  }
}

/* ============================================================
 *  结论
 * ============================================================ */
console.log('[deploy] ================================================')

if (!ok) {
  console.error('[deploy] 校验未通过 —— 请先修正上面的问题。')
  process.exit(1)
}

/*
 * exit 0 → Cloudflare 判定\"发布步骤成功\"，
 * 随后的静态资源上传与 Functions 打包由 Cloudflare 内部完成。
 *
 * 这一步刻意**不调用 wrangler deploy**：
 * 那需要 CLOUDFLARE_API_TOKEN，而 Git 集成的构建环境不会注入它。
 */
console.log('[deploy] ✓ 校验通过')
console.log('[deploy] （静态资源上传与 Functions 发布由 Cloudflare 内部完成）')
console.log('[deploy] ================================================')
