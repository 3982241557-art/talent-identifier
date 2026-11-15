/* ============================================================
 *  Cloudflare 部署脚本（v15.7）
 * ============================================================
 *
 *  ============================================================
 *  v15.7 · 修复「绿色 Ready 但线上是 Hello World」
 *  ============================================================
 *
 *  【症状】
 *  Cloudflare 构建全绿、状态 Ready，但线上访问：
 *    · <body></body> 完全空白
 *    · 所有路径（/、/api/health、/anything）返回**同样的 11 字节** "Hello world"
 *
 *  【根因】
 *  v15.5 引入的 deploy-stub 只做校验然后 exit 0。
 *  Cloudflare 看到 exit 0 → 判定「发布步骤成功」→ 显示绿色 Ready，
 *  但**实际上一个字节都没上传**。
 *  Worker 一直保持着「创建项目时 Cloudflare 生成的 Hello World 模板」。
 *
 *  那个模板对所有路径无条件返回 "Hello world"，
 *  且没有 ASSETS 绑定 —— 所以既没有 index.html，也没有任何 API。
 *
 *  【本脚本做什么】
 *  真正执行 `wrangler deploy`：
 *    1. 先跑部署前置校验（复用 check-config 的结论）
 *    2. 确认 dist/index.html 存在且含挂载点
 *    3. 执行 npx wrangler deploy
 *    4. 部署后验证：读取 wrangler 输出的 URL 并请求它，
 *       确认返回的是我们的 index.html 而不是 Hello world
 *
 *  用法（填进 Cloudflare 的 Deploy command）：
 *    node scripts/deploy.mjs
 * ============================================================ */

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')

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
    if (opts.capture && result.stdout) {
      console.error(result.stdout.toString().slice(-1500))
    }
    process.exit(result.status ?? 1)
  }
  return result
}

/* ============================================================
 *  0 · 读配置
 * ============================================================ */

const tomlPath = resolve(root, 'wrangler.toml')
if (!existsSync(tomlPath)) {
  console.error('[deploy] ✗ 找不到 wrangler.toml')
  process.exit(1)
}
const toml = readFileSync(tomlPath, 'utf-8')

const workerName = toml.match(/^name\s*=\s*["']([^"']+)["']/m)?.[1] ?? 'talent-identifier'
const assetsDir = toml.match(/^directory\s*=\s*["']([^"']+)["']/m)?.[1]?.replace(/^\.\//, '') ?? 'dist'
const mainFile = toml.match(/^main\s*=\s*["']([^"']+)["']/m)?.[1]
const workersDev = toml.match(/^workers_dev\s*=\s*(\w+)/m)?.[1]

console.log('[deploy] ================================================')
console.log('[deploy] 天赋识别器 · Cloudflare 部署')
console.log('[deploy] ================================================')
console.log(`[deploy] Worker 名   : ${workerName}`)
console.log(`[deploy] 入口         : ${mainFile ?? '(缺失!)'}`)
console.log(`[deploy] 静态资源目录 : ${assetsDir}/`)
console.log(`[deploy] workers_dev  : ${workersDev ?? '(未指定)'} `)

/* ============================================================
 *  1 · 配置检查
 * ============================================================ */
run('node', ['scripts/check-config.mjs'], '部署配置检查')

/* ============================================================
 *  2 · 产物检查（这一段直接对应「白色空 body」的根因）
 * ============================================================ */

if (!mainFile) {
  console.error(
    '[deploy] ✗ wrangler.toml 缺少 main —— Worker 没有入口脚本，\n' +
      '        Cloudflare 会保留创建项目时的 Hello World 模板。',
  )
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
 *  3 · 真正部署
 * ============================================================ */
const result = run('npx', ['wrangler', 'deploy'], '发布到 Cloudflare', { capture: true })

/* ============================================================
 *  4 · 部署后验证
 * ============================================================ */

const output = (result.stdout?.toString() ?? '') + (result.stderr?.toString() ?? '')

/* 从 wrangler 输出里抓取线上地址 */
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

/* 等一小会儿让边缘节点生效 */
await new Promise((r) => setTimeout(r, 3000))

try {
  const res = await fetch(`${deployedUrl}/`, { headers: { 'User-Agent': 'deploy-verify' } })
  const text = await res.text()

  if (text.includes('Hello world')) {
    console.error(
      '[deploy] ✗ 线上仍返回 "Hello world" ——\n' +
        '        说明部署的仍是 Cloudflare 的模板 Worker。\n' +
        '        请检查控制台的 Deploy command 是否真的执行了 wrangler deploy。',
    )
    process.exit(1)
  }

  if (!text.includes('id="root"')) {
    console.error('[deploy] ✗ 线上 HTML 缺少 id="root" —— 静态资源没有正确绑定')
    process.exit(1)
  }

  console.log(`[deploy] ✓ 线上首页已返回我们的 index.html（${text.length} 字节）`)

  /* 再验一下 API */
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
