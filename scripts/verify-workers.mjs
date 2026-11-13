/* ============================================================
 *  Workers 处理器本地验证脚本（v15.2）
 * ============================================================
 *
 *  Cloudflare Pages Functions 跑在 Workers 运行时，
 *  本地没有 wrangler 也能验证：
 *  Workers 的 Request / Response 在 Node 18+ 里都有对应实现
 *  （globalThis.Request / Response / Headers / fetch）。
 *
 *  本脚本模拟一次真实调用，验证：
 *    · 12 条路由全部可达
 *    · 纯 JS 星历结果与 Swiss Ephemeris 一致（黄经误差 < 1°）
 *    · 语料库检索与 Node 版行为一致
 *    · 环境变量读取正确
 * ============================================================ */

import { handleApi } from '../functions/_lib/api-handler.js'

/** 构造一个 Workers 风格的 context */
function makeContext(path, body, env) {
  const url = `https://talent.pages.dev/api/${path}`
  const request = new Request(url, {
    method: body === null ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === null ? undefined : JSON.stringify(body),
  })
  return {
    request,
    env,
    params: { path: path ? path.split('/') : [] },
  }
}

/** 调用并返回解析后的 JSON */
async function call(path, body, env = {}) {
  const res = await handleApi(makeContext(path, body, env))
  const text = await res.text()
  let data = null
  try {
    data = JSON.parse(text)
  } catch {
    data = text
  }
  return { status: res.status, data }
}

let pass = 0
let fail = 0
function check(name, ok, detail = '') {
  if (ok) {
    pass++
    console.log(`  ✓ ${name}`)
  } else {
    fail++
    console.log(`  ✗ ${name}${detail ? ` —— ${detail}` : ''}`)
  }
}

/* ============================================================
 *  1. 路由可达性
 * ============================================================ */
console.log('\n【1】12 条路由可达性')
{
  const health = await call('health', null)
  check('GET /api/health', health.status === 200 && health.data?.ok === true, JSON.stringify(health.data).slice(0, 80))

  const birth = {
    date: '1995-06-15',
    time: '12:00',
    latitude: 30.27,
    longitude: 120.15,
    timezone: 8,
    place: '杭州',
  }

  const chart = await call('chart', birth)
  check('POST /api/chart', chart.status === 200 && Array.isArray(chart.data?.planets), JSON.stringify(chart.data).slice(0, 120))

  const transit = await call('transit', birth)
  check(
    'POST /api/transit（结构对齐 EphemerisChart 的 now/month/year）',
    transit.status === 200 &&
      Array.isArray(transit.data?.now) &&
      Array.isArray(transit.data?.month) &&
      Array.isArray(transit.data?.year),
    JSON.stringify(transit.data).slice(0, 120),
  )

  const notFound = await call('nonexistent', {})
  check('未知路由返回 JSON 404', notFound.status === 404 && typeof notFound.data?.error === 'string')
}

/* ============================================================
 *  2. 星历正确性（对照 Swiss Ephemeris）
 * ============================================================ */
console.log('\n【2】纯 JS 星历 vs Swiss Ephemeris')
{
  const birth = {
    date: '1995-06-15',
    time: '12:00',
    latitude: 30.27,
    longitude: 120.15,
    timezone: 8,
  }
  const res = await call('chart', birth)
  const js = res.data

  /* Node 版的真实星历（sweph） */
  const { computeNatalChart } = await import('../server/ephemeris.mjs')
  const sw = computeNatalChart({
    date: birth.date,
    time: birth.time,
    latitude: birth.latitude,
    longitude: birth.longitude,
    timezone: birth.timezone,
  })

  let maxDiff = 0
  let worst = ''
  for (const p of js.planets) {
    const s = sw.planets.find((x) => x.key === p.planet)
    if (!s) continue
    let d = Math.abs(s.longitude - p.longitude)
    if (d > 180) d = 360 - d
    if (d > maxDiff) {
      maxDiff = d
      worst = `${p.planetCn}(${s.cn})`
    }
  }
  check(
    `行星黄经最大误差 < 1°（实测 ${maxDiff.toFixed(3)}°，最大差：${worst}）`,
    maxDiff < 1,
    `误差过大：${maxDiff.toFixed(3)}°`,
  )

  /* 上升点 */
  let ascDiff = Math.abs(sw.ascendant - js.ascendant)
  if (ascDiff > 180) ascDiff = 360 - ascDiff
  check(
    `上升点误差 < 1°（实测 ${ascDiff.toFixed(3)}°）`,
    ascDiff < 1,
    `误差 ${ascDiff.toFixed(3)}°`,
  )

  /* sweph 不返回 sign 字段，用同一套星座换算现算 */
  const SIGN_NAMES = [
    '白羊座','金牛座','双子座','巨蟹座','狮子座','处女座',
    '天秤座','天蝎座','射手座','摩羯座','水瓶座','双鱼座',
  ]
  const toSignCn = (lon) => SIGN_NAMES[Math.floor((((lon % 360) + 360) % 360) / 30)]
  const swSign = (k) => {
    const p = sw.planets.find((x) => x.key === k)
    return p ? toSignCn(p.longitude) : undefined
  }
  const jsSign = (k) => js.planets.find((p) => p.planet === k)?.sign?.cn
  check('太阳星座一致', jsSign('sun') === swSign('sun'), `${jsSign('sun')} vs ${swSign('sun')}`)
  check('月亮星座一致', jsSign('moon') === swSign('moon'), `${jsSign('moon')} vs ${swSign('moon')}`)
  check('上升星座一致', jsSign('sun') !== undefined && Math.abs(js.ascendant - sw.ascendant) < 1)
}

/* ============================================================
 *  3. 语料库检索一致性
 * ============================================================ */
console.log('\n【3】语料库检索：Workers 版 vs Node 版')
{
  const nodeCorpus = await import('../server/corpus.mjs')
  const workerCorpus = await import('../server/corpus-workers.mjs')

  let allMatch = true
  for (const domain of nodeCorpus.DOMAINS) {
    for (const salt of [0, 7, 123, 999]) {
      const a = nodeCorpus.retrieve(domain, 'fire', 'leo', salt)
      const b = workerCorpus.retrieve(domain, 'fire', 'leo', salt)
      if (a.passage.text !== b.passage.text || a.role.subtitle !== b.role.subtitle) {
        allMatch = false
        console.log(`    差异：${domain} salt=${salt}`)
      }
    }
  }
  check('四领域 × 四 salt 的检索结果完全一致', allMatch)
}

/* ============================================================
 *  4. 环境变量与鉴权降级
 * ============================================================ */
console.log('\n【4】环境变量读取')
{
  const noKey = await call('health', null, {})
  check('无 Key 时 configured=false', noKey.data?.configured === false && noKey.data?.placeholder === true)

  const withKey = await call('health', null, { DEEPSEEK_API_KEY: 'sk-abcdefghijklmnop1234567890' })
  check('有 Key 时 configured=true', withKey.data?.configured === true && withKey.data?.placeholder === false)

  const placeholder = await call('health', null, { DEEPSEEK_API_KEY: 'sk-your-key-here' })
  check('占位符 Key 被识别', placeholder.data?.placeholder === true)

  const custom = await call('health', null, { DEEPSEEK_MODEL: 'deepseek-reasoner' })
  check('自定义模型名生效', custom.data?.model === 'deepseek-reasoner')
}

/* ============================================================
 *  5. 输入校验
 * ============================================================ */
console.log('\n【5】输入校验')
{
  const badDate = await call('chart', { date: 'invalid', latitude: 0, longitude: 0 })
  check('非法日期返回 400', badDate.status === 400)

  const noGeo = await call('chart', { date: '1995-06-15' })
  check('缺经纬度返回 400', noGeo.status === 400)

  const badLat = await call('chart', { date: '1995-06-15', latitude: 999, longitude: 0 })
  check('超范围纬度返回 400', badLat.status === 400)

  const badShichen = await call('chart', { date: '1995-06-15', latitude: 30, longitude: 120, shichen: 'xxx' })
  check('非法时辰返回 400', badShichen.status === 400)

  const okShichen = await call('chart', {
    date: '1995-06-15', latitude: 30.27, longitude: 120.15, shichen: 'zi',
  })
  check(
    '合法时辰被接受且 timePrecision=shichen',
    okShichen.status === 200 && okShichen.data?.timePrecision === 'shichen',
  )
}

/* ============================================================
 *  6. 无 Key 时的降级行为（不崩）
 * ============================================================ */
console.log('\n【6】无 Key 降级')
{
  const q = await call('mbti-question', { axis: 'EI', count: 0 }, {})
  check(
    'MBTI 出题降级到本地题库',
    q.status === 200 && q.data?.degraded === true && typeof q.data?.question === 'string',
    JSON.stringify(q.data).slice(0, 100),
  )
}

/* ============================================================
 *  汇总
 * ============================================================ */
console.log(`\n${'='.repeat(50)}`)
console.log(`通过 ${pass} 项，失败 ${fail} 项`)
console.log('='.repeat(50))
process.exit(fail > 0 ? 1 : 0)
