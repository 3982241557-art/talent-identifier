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
    const m = src.match(/pages_build_output_dir\s*=\s*['"]([^'"]+)['"]/)
    pagesOutDir = m?.[1] ?? null
    check('wrangler.toml 存在', true)
    check(
      'wrangler.toml 声明了 pages_build_output_dir',
      pagesOutDir !== null,
      '缺少该字段 —— 这是 "Missing entry-point" 的直接原因',
    )
    check(
      `wrangler.toml 的 pages_build_output_dir = "${pagesOutDir}"`,
      pagesOutDir?.replace(/^\.\//, '') === 'dist',
      `期望 "./dist" 或 "dist"，实际 "${pagesOutDir}"`,
    )

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
