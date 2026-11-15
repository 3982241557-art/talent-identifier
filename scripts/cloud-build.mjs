/* ============================================================
 *  云端构建入口（v15.3）
 * ============================================================
 *
 *  【为什么需要这个脚本】
 *  Cloudflare Pages 的构建环境默认设置 `NODE_ENV=production`，
 *  于是 `npm install` / `npm ci` 会**跳过 devDependencies**。
 *
 *  本项目的构建链依赖 devDependencies：
 *    · typescript  → `tsc -b`（类型检查）
 *    · vite        → 构建前端
 *    · @vitejs/plugin-react / @tailwindcss/vite → 插件
 *
 *  一旦它们没装上，构建会在 `sh: tsc: command not found` 处中断，
 *  `dist/` 根本不会生成，
 *  Cloudflare 随后报：
 *
 *    [ERROR] Missing entry-point to Worker script or to assets directory
 *
 *  这个报错具有很强的迷惑性 —— 它说的是「找不到产物」，
 *  真实原因却是「构建工具没装上」。
 *
 *  【本脚本做什么】
 *  1. 检查构建工具是否可用（tsc / vite）
 *  2. 缺失则用 `npm install --include=dev` 补装
 *  3. 补装后重新检查，还缺就给出清晰的错误提示
 *  4. 依次执行：语料库生成 → 类型检查 → Vite 构建
 *
 *  【为什么不用 `npm ci --include=dev` 直接写在 Build command】
 *  放在脚本里更稳 —— 无论控制台填的是
 *  `npm run build`、`npm run build:ci` 还是 `npm ci && npm run build`，
 *  都能走到同一条可靠的路径。
 * ============================================================ */

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')

/* ============================================================
 *  工具
 * ============================================================ */

/** 执行一条命令，继承 stdio */
function run(command, args, label) {
  console.log(`\n[build] ${label}：${command} ${args.join(' ')}`)
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      /*
       * 关键：显式要求安装 devDependencies。
       * 即便父进程带着 NODE_ENV=production，
       * 这一条命令也会把 typescript / vite 装上。
       */
      NODE_ENV: 'development',
    },
  })
  if (result.status !== 0) {
    console.error(`\n[build] ✗ ${label} 失败（退出码 ${result.status}）`)
    process.exit(result.status ?? 1)
  }
}

/** 某个可执行文件是否可用 */
function hasBin(name) {
  const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', [name], {
    stdio: 'ignore',
  })
  return r.status === 0
}

/* ============================================================
 *  1 · 确保构建工具就位
 * ============================================================ */

const NEEDED = ['tsc', 'vite']

console.log('[build] ================================================')
console.log('[build] 天赋识别器 · 云端构建')
console.log('[build] ================================================')
console.log(`[build] NODE_ENV = ${process.env.NODE_ENV ?? '(未设置)'}`)

let missing = NEEDED.filter((bin) => !hasBin(bin))

if (missing.length) {
  console.log(
    `\n[build] 缺少构建工具：${missing.join(', ')}` +
      (process.env.NODE_ENV === 'production'
        ? '\n[build] （NODE_ENV=production 导致 npm 跳过了 devDependencies）'
        : ''),
  )
  console.log('[build] 正在补装 devDependencies…')

  /*
   * --include=dev 强制安装 devDependencies，
   * 无论 NODE_ENV 是什么。
   */
  run('npm', ['install', '--include=dev', '--no-audit', '--no-fund'], '补装依赖')

  missing = NEEDED.filter((bin) => !hasBin(bin))
  if (missing.length) {
    console.error(
      `\n[build] ✗ 仍然缺少：${missing.join(', ')}\n` +
        `[build] 请检查 package.json 的 devDependencies 是否完整，以及网络是否可达 npm registry。`,
    )
    process.exit(1)
  }
  console.log('[build] ✓ 构建工具已就位')
} else {
  console.log('[build] ✓ 构建工具已就位')
}

/* ============================================================
 *  1.5 · 部署配置一致性检查
 * ============================================================
 *
 *  在真正开跑之前，先确认各处配置互相对得上。
 *  宁可在构建阶段就红掉，也不要部署完才发现线上 404。
 */
run('node', ['scripts/check-config.mjs'], '部署配置检查')

/* ============================================================
 *  2 · 生成语料库静态模块
 * ============================================================
 *
 * Workers 运行时读不了文件系统，
 * 所以要把 src/data/archetypes_corpus.json 编译成纯 ESM 模块。
 */
if (!existsSync(resolve(root, 'src', 'data', 'archetypes_corpus.data.mjs'))) {
  console.log('[build] 语料库模块不存在，先生成')
}
run('node', ['scripts/build-corpus.mjs'], '生成语料库模块')

/* ============================================================
 *  3 · 类型检查
 * ============================================================ */
run('npx', ['tsc', '-b'], 'TypeScript 类型检查')

/* ============================================================
 *  4 · 构建前端
 * ============================================================ */
run('npx', ['vite', 'build'], 'Vite 构建')

/* ============================================================
 *  5 · 产物校验（提前发现 "Missing entry-point"）
 * ============================================================ */

const DIST = resolve(root, 'dist')
const INDEX = resolve(DIST, 'index.html')

console.log('\n[build] 校验构建产物…')
if (!existsSync(INDEX)) {
  console.error('[build] ✗ dist/index.html 不存在 —— Cloudflare 会报 "Missing entry-point"')
  process.exit(1)
}

console.log(`[build] ✓ dist/index.html 已生成`)
console.log('[build] ================================================')
console.log('[build] 构建完成 ✓')
console.log('[build] ================================================')
