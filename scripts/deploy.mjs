/* ============================================================
 *  Cloudflare 部署脚本（v15.8）
 * ============================================================
 *
 *  ============================================================
 *  v15.8 · 修复「Missing entry-point to Worker script or to assets directory」
 *  ============================================================
 *
 *  【症状】
 *  Cloudflare 的 Deploy command 跑 `npx wrangler deploy` 时报：
 *
 *    [ERROR] Missing entry-point to Worker script or to assets directory
 *            - Specify an entry-point to your Worker script via the command line
 *              (ex: `npx wrangler deploy src/index.ts`)
 *            - Or add the following to your "wrangler.toml" file:
 *              main = "src/index.ts"
 *            - If are uploading a directory of assets, ...
 *              [assets] directory = "./dist"
 *
 *  但仓库里的 wrangler.toml **明明有** main 与 [assets]。
 *
 *  【根因】
 *  wrangler 只在**当前工作目录**查找 wrangler.toml / wrangler.jsonc。
 *  Cloudflare Workers Builds 的 Deploy command
 *  并不保证在仓库根目录执行 ——
 *  在别处执行时，wrangler 找不到配置文件，
 *  于是认为「没有入口、没有 assets」，报上面那个错。
 *
 *  已用对照实验证实：
 *    在仓库根执行 npx wrangler deploy  → ✓ Read 1 file from the assets directory
 *    在父目录执行 npx wrangler deploy  → ✗ 完全找不到配置
 *    加 --cwd <仓库根>                → ✓ 恢复正常
 *
 *  【本脚本的解法 —— 三重保险】
 *    1. 自己定位仓库根目录（基于 import.meta.url，不依赖 cwd）
 *    2. 用 --cwd <仓库根> 显式告诉 wrangler 去哪找配置
 *    3. 用命令行参数显式传入 name / assets / main
 *       —— 即使 toml 彻底读不到，部署依然能成功
 *
 *  同时保留部署后验证：检测线上是否仍是 Hello World 模板。
 * ============================================================ */

import { spawnSync, execSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/* ============================================================
 *  0 · 定位仓库根目录
 * ============================================================
 *
 * 基于本脚本自身的位置推导，**完全不依赖当前工作目录**。
 * 这正是 v15.8 踩坑的核心：cwd 不一定是仓库根。
 */
const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')

console.log('[deploy] ================================================')
console.log('[deploy] 天赋识别器 · Cloudflare 部署')
console.log('[deploy] ================================================')
console.log(`[deploy] 仓库根目录：${root}`)
console.log(`[deploy] 当前工作目录：${process.cwd()}`)
if (process.cwd() !== root) {
  console.log('[deploy] （cwd 与仓库根不同 —— 将用 --cwd 显式指定）')
}

/*
 * 打印当前 commit —— 用来一眼确认「这次部署用的是哪个版本」。
 *
 * v15.9 教训：改完 Deploy command 后 Cloudflare 常常会
 * **用同一个旧 commit 重新发布**，而不是拉取最新代码。
 * 于是报 "Cannot find module '/opt/buildhome/repo/scripts/deploy.mjs'
 * —— 明明文件早就 push 过了。
 *
 * 有了这行 commit 号，对照 GitHub 的提交历史，
 * 一眼就能看出部署的是不是最新版本。
 */
const gitSha = (() => {
  try {
    return execSync('git rev-parse --short HEAD', {
      cwd: root,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim()
  } catch {
    return '(未知)'
  }
})()
console.log(`[deploy] 当前 commit：${gitSha}`)

/* ============================================================
 *  工具
 * ============================================================ */

function run(command, args, label, opts = {}) {
  console.log(`\n[deploy] ${label}：${command} ${args.join(' ')}`)
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: opts.capture ? 'pipe' : 'inherit',
    shell: process.platform === 'win32',
    env: process.env,
  })
  if (result.status !== 0) {
    console.error(`\n[deploy] ✗ ${label} 失败（退出码 ${result.status}）`)
    if (opts.capture) {
      const out = (result.stdout?.toString() ?? '') + (result.stderr?.toString() ?? '')
      console.error(out.slice(-2000))
    }
    process.exit(result.status ?? 1)
  }
  return result
}

/* ============================================================
 *  1 · 读配置
 * ============================================================ */

const tomlPath = resolve(root, 'wrangler.toml')
if (!existsSync(tomlPath)) {
  console.error('[deploy] ✗ 找不到 wrangler.toml')
  process.exit(1)
}
const toml = readFileSync(tomlPath, 'utf-8')

const workerName = toml.match(/^name\s*=\s*["']([^"']+)["']/m)?.[1] ?? 'talent-identifier'
const assetsDir =
  toml.match(/^directory\s*=\s*["']([^"']+)["']/m)?.[1]?.replace(/^\.\//, '') ?? 'dist'
const mainFile = toml.match(/^main\s*=\s*["']([^"']+)["']/m)?.[1]
const compatDate = toml.match(/^compatibility_date\s*=\s*["']([^"']+)["']/m)?.[1] ?? '2025-01-01'

console.log(`[deploy] Worker 名   : ${workerName}`)
console.log(`[deploy] 入口         : ${mainFile ?? '(缺失!)'}`)
console.log(`[deploy] 静态资源目录 : ${assetsDir}/`)
console.log(`[deploy] 兼容日期     : ${compatDate}`)

/* ============================================================
 *  2 · 配置检查
 * ============================================================ */
run('node', ['scripts/check-config.mjs'], '部署配置检查')
run('node', ['scripts/check-metafiles.mjs'], '元文件格式检查')

/* ============================================================
 *  3 · 产物检查（对应「白色空 body」与「Hello World」两个症状）
 * ============================================================ */

if (!mainFile) {
  console.error('[deploy] ✗ wrangler.toml 缺少 main —— Worker 没有入口脚本')
  process.exit(1)
}
if (!existsSync(resolve(root, mainFile))) {
  console.error(`[deploy] ✗ 入口文件不存在：${mainFile}`)
  process.exit(1)
}

const DIST = resolve(root, assetsDir)
if (!existsSync(DIST)) {
  console.error(`[deploy] ✗ ${assetsDir}/ 不存在 —— 构建没有产出静态资源`)
  process.exit(1)
}
if (!existsSync(join(DIST, 'index.html'))) {
  console.error(`[deploy] ✗ ${assetsDir}/index.html 不存在 —— 线上会是空页面`)
  process.exit(1)
}

const html = readFileSync(join(DIST, 'index.html'), 'utf-8')
if (!html.includes('id="root"')) {
  console.error('[deploy] ✗ index.html 缺少 id="root" 挂载点 —— React 不会渲染')
  process.exit(1)
}
if (!/\/assets\/[^"']+\.(js|css)/.test(html)) {
  console.error('[deploy] ✗ index.html 没有引用 /assets/ 下的构建产物 —— 脚本不会加载')
  process.exit(1)
}

const fileCount = readdirSync(DIST).length
const totalSize = readdirSync(DIST).reduce((sum, f) => {
  try {
    return sum + statSync(join(DIST, f)).size
  } catch {
    return sum
  }
}, 0)

console.log(`[deploy] ✓ 入口就位：${mainFile}`)
console.log(`[deploy] ✓ index.html 含挂载点与资源引用（${fileCount} 个条目，${(totalSize / 1024).toFixed(1)} KB）`)

/* ============================================================
 *  4 · 真正部署
 * ============================================================
 *
 * 三重保险：
 *   · --cwd <仓库根>       → 保证能找到 wrangler.toml
 *   · --name               → 即使 toml 没读到也知道 Worker 名
 *   · --assets <绝对路径>  → 即使 toml 没读到也知道静态资源在哪
 *   · --compatibility-date → 不依赖 toml 的顶层字段
 *
 * main 仍由 toml 提供（它需要相对仓库根解析），
 * 但因为 --cwd 已把 cwd 固定到仓库根，main 一定能被找到。
 */
const deployArgs = [
  'wrangler',
  'deploy',
  '--cwd',
  root,
  '--name',
  workerName,
  '--assets',
  DIST,
  '--compatibility-date',
  compatDate,
]

const result = run('npx', deployArgs, '发布到 Cloudflare', { capture: true })

/* ============================================================
 *  5 · 部署后验证
 * ============================================================ */

const output = (result.stdout?.toString() ?? '') + (result.stderr?.toString() ?? '')

const urlMatch = output.match(/https:\/\/[^\s]+\.workers\.dev/)

console.log('')
console.log('[deploy] ================================================')

if (!urlMatch) {
  console.log('[deploy] 未从输出中解析到 workers.dev 地址')
  console.log('[deploy] 请手动打开控制台确认部署结果')
  console.log('[deploy] ================================================')
  process.exit(0)
}

const deployedUrl = urlMatch[0].replace(/\/+$/, '')
console.log(`[deploy] 线上地址：${deployedUrl}`)

/* 等边缘节点生效 */
await new Promise((r) => setTimeout(r, 3000))

try {
  const res = await fetch(`${deployedUrl}/`, { headers: { 'User-Agent': 'deploy-verify' } })
  const text = await res.text()

  if (text.includes('Hello world')) {
    console.error(
      '[deploy] ✗ 线上仍返回 "Hello world" ——\n' +
        '        说明部署的仍是 Cloudflare 的模板 Worker。',
    )
    process.exit(1)
  }

  if (!text.includes('id="root"')) {
    console.error('[deploy] ✗ 线上 HTML 缺少 id="root" —— 静态资源没有正确绑定')
    process.exit(1)
  }

  console.log(`[deploy] ✓ 线上首页已返回我们的 index.html（${text.length} 字节）`)

  const health = await fetch(`${deployedUrl}/api/health`).catch(() => null)
  if (health && health.ok) {
    console.log('[deploy] ✓ /api/health 正常响应')
  } else {
    console.warn('[deploy] ! /api/health 未通过（可能需要几秒生效，或缺少 DEEPSEEK_API_KEY）')
  }
} catch (e) {
  console.warn(`[deploy] ! 部署后验证失败：${e.message}`)
  console.warn('[deploy]   这通常只是边缘节点尚未生效，稍后重试即可')
}

console.log('[deploy] ================================================')
console.log('[deploy] 部署完成 ✓')
console.log('[deploy] ================================================')
