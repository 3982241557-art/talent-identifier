/* ============================================================
 *  Cloudflare 部署模拟器（Workers + Assets）（v15.2）
 * ============================================================
 *
 *  在本地完整复刻 Cloudflare Pages 的运行时行为：
 *
 *    1. 读取 public/_routes.json 的 exclude 规则
 *    2. 路径命中 exclude → 交给 Pages Function 处理
 *    3. 路径未命中 → 走静态资源（dist/）
 *    4. 静态资源找不到 → SPA 兜底（回 index.html）
 *
 *  然后按真实部署的方式逐条打请求，验证：
 *    · 页面能打开
 *    · /api/* 进 Function 而不是被静态资源抢走
 *    · SPA 路由刷新不 404
 *    · 环境变量注入生效
 * ============================================================ */

import { createServer } from 'node:http'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { resolve, dirname, extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { handleApi } from '../functions/_lib/api-handler.js'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const DIST = resolve(root, 'dist')

/* ---------- 读取 _routes.json ---------- *
 *
 * Cloudflare Pages 的语义（**与直觉相反**，务必注意）：
 *   · include —— 由 **Pages Functions** 处理的路径
 *   · exclude —— **不**由 Functions 处理、走静态资源的路径
 *
 * 也就是说：命中 include 的走函数，
 * 命中 exclude 的走静态文件，两者都不命中则由 Pages 默认逻辑处理
 * （有文件给文件，没有文件回 index.html 的 SPA 兜底）。
 */
let includeRules = []
let excludeRules = []
const routesFile = resolve(DIST, '_routes.json')
if (existsSync(routesFile)) {
  const r = JSON.parse(readFileSync(routesFile, 'utf-8'))
  includeRules = r.include ?? []
  excludeRules = r.exclude ?? []
  console.log(
    `[sim] 读取 _routes.json：include ${includeRules.length} 条，exclude ${excludeRules.length} 条`,
  )
}

/** 把带 * 通配的规则编译成正则 */
function toRegExp(rule) {
  const escaped = rule.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  return new RegExp('^' + escaped.replace(/\*/g, '.*') + '$')
}

/**
 * 判断某路径是否由 Pages Functions 处理。
 *
 * 规则：
 *   1. 命中 exclude → 不由 Functions 处理（走静态资源）
 *   2. 命中 include → 由 Functions 处理
 *   3. 都没命中 → 走静态资源 + SPA 兜底
 */
function isFunctionRoute(pathname) {
  /*
   * Cloudflare Pages 的优先级：
   *   1. 命中 exclude → 静态资源（Functions 不介入）
   *   2. 命中 include → Pages Functions
   *   3. 都没命中   → 静态资源 + SPA 兜底
   *
   * 所以配置成 include=["/api/*"], exclude=[] 时，
   * 只有 /api/* 进 Functions，其余全部走静态资源。
   */
  if (excludeRules.some((rule) => toRegExp(rule).test(pathname))) return false
  if (includeRules.some((rule) => toRegExp(rule).test(pathname))) return true
  return false
}

/* ---------- MIME 类型 ---------- */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

/** 从 URL 中安全地解析出 dist 内的文件路径 */
function resolveStatic(pathname) {
  const rel = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '')
  const file = join(DIST, rel)
  if (!file.startsWith(DIST)) return null
  if (existsSync(file) && statSync(file).isFile()) return file
  return null
}

/* ---------- 模拟 Pages 服务器 ---------- */
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost')
  const pathname = url.pathname

  /* ---- 1. Functions 优先 ---- */
  if (isFunctionRoute(pathname)) {
    /* 把 pathname 映射回 /api/* 的形式（Pages Functions 的 params.path 只含剩余段） */
    const apiPath = pathname.replace(/^\/api\/?/, '')
    const body =
      req.method === 'POST'
        ? await new Promise((resolve) => {
            let data = ''
            req.on('data', (c) => (data += c))
            req.on('end', () => resolve(data))
          })
        : undefined

    const request = new Request(`https://sim.pages.dev${pathname}`, {
      method: req.method,
      headers: { 'Content-Type': 'application/json' },
      body: body || undefined,
    })

    const out = await handleApi({
      request,
      env: { DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY ?? '' },
      params: { path: apiPath ? apiPath.split('/') : [] },
    })

    res.writeHead(out.status, Object.fromEntries(out.headers.entries()))
    res.end(await out.text())
    return
  }

  /* ---- 2. 静态资源 ---- */
  const file = resolveStatic(pathname)
  if (file) {
    res.writeHead(200, {
      'Content-Type': MIME[extname(file)] ?? 'application/octet-stream',
    })
    res.end(readFileSync(file))
    return
  }

  /* ---- 3. SPA 兜底 ---- */
  const index = resolve(DIST, 'index.html')
  if (existsSync(index)) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(readFileSync(index))
    return
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' })
  res.end('404')
})

/* ---------- 断言 ---------- */
let pass = 0
let fail = 0
const check = (name, ok, detail = '') => {
  if (ok) {
    pass++
    console.log(`  ✓ ${name}`)
  } else {
    fail++
    console.log(`  ✗ ${name}${detail ? ` —— ${detail}` : ''}`)
  }
}

server.listen(8899, async () => {
  const base = 'http://127.0.0.1:8899'

  console.log('\n【A】静态资源与 SPA')
  {
    const r = await fetch(`${base}/`)
    const html = await r.text()
    check('根路径返回 index.html', r.status === 200 && html.includes('<div id="root"') || html.includes('id="root"'))
    check('index.html 引用了构建后的 assets', html.includes('/assets/'))
  }
  {
    const r = await fetch(`${base}/dashboard`)
    check('SPA 路由刷新回 index.html（不 404）', r.status === 200)
  }
  {
    const asset = readFileSync(resolve(DIST, 'index.html'), 'utf-8').match(/\/assets\/[^"']+\.js/)?.[0]
    if (asset) {
      const r = await fetch(base + asset)
      check(`静态 JS 资源可访问（${asset}）`, r.status === 200)
    }
  }

  console.log('\n【B】Functions 优先于静态资源')
  {
    const r = await fetch(`${base}/api/health`)
    const j = await r.json()
    check('/api/health 进 Function', r.status === 200 && j.ok === true, JSON.stringify(j).slice(0, 100))
    check('返回 runtime 标识', j.runtime === 'cloudflare-worker')
  }
  {
    const r = await fetch(`${base}/api/nope`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
    const j = await r.json()
    check(
      '未知 API 返回 JSON 404（不是 HTML）',
      r.status === 404 && typeof j.error === 'string' && !j.path?.endsWith('.html'),
    )
  }

  console.log('\n【C】星历与时辰')
  {
    const r = await fetch(`${base}/api/chart`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: '1995-06-15', time: '12:00',
        latitude: 30.27, longitude: 120.15, timezone: 8,
      }),
    })
    const j = await r.json()
    check('本命盘计算成功', r.status === 200 && Array.isArray(j.planets) && j.planets.length === 9)
    check('使用 astronomy-engine', j.source === 'astronomy-engine')
    const sun = j.planets.find((p) => p.planet === 'sun')
    check('太阳落在双子座', sun?.sign.cn === '双子座', sun?.sign.cn)
  }
  {
    const r = await fetch(`${base}/api/chart`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: '1995-06-15', latitude: 30.27, longitude: 120.15, shichen: 'wu',
      }),
    })
    const j = await r.json()
    check('时辰模式 timePrecision=shichen', j.timePrecision === 'shichen' && j.shichenName === '午时')
  }

  console.log('\n【D】环境变量注入')
  {
    const r = await fetch(`${base}/api/health`)
    const j = await r.json()
    const hasKey = Boolean(process.env.DEEPSEEK_API_KEY)
    check(
      hasKey ? '注入 Key 后 configured=true' : '未注入 Key 时 configured=false',
      hasKey ? j.configured === true : j.configured === false,
    )
  }

  console.log('\n【E】无 Key 降级（页面仍可用）')
  {
    const r = await fetch(`${base}/api/mbti-question`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ axis: 'EI', count: 0 }),
    })
    const j = await r.json()
    check('MBTI 出题降级到本地题库', r.status === 200 && j.degraded === true && j.question)
  }

  console.log(`\n${'='.repeat(50)}`)
  console.log(`通过 ${pass} 项，失败 ${fail} 项`)
  console.log('='.repeat(50))

  server.close()
  process.exit(fail > 0 ? 1 : 0)
})
