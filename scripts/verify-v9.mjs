import { chromium } from 'playwright-core'

const CHROME =
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const URL = process.env.TARGET_URL ?? 'http://localhost:5180/'

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox'],
})
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } })
const errors = []
page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text().slice(0, 200))
})

const log = (...a) => console.log(...a)
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok })
  log(`${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`)
}

/* ============================================================ */
await page.goto(URL, { waitUntil: 'domcontentloaded' })
await page.evaluate(() => localStorage.clear())
await page.reload({ waitUntil: 'domcontentloaded' })
/* 等 intro 真正渲染出来再体检（开场有淡入动画，等它落定） */
await page
  .locator('button')
  .filter({ hasText: '进入探索' })
  .first()
  .waitFor({ state: 'visible', timeout: 20000 })
await page.waitForTimeout(2200)

/* ---------- 起始页纯白底黑字 ---------- */
const intro = await page.evaluate(() => ({
  theme: document.documentElement.getAttribute('data-theme'),
  bg: getComputedStyle(document.body).backgroundColor,
  color: getComputedStyle(document.body).color,
}))
check(
  '任务3 · 起始页纯白底黑字',
  intro.theme !== 'cosmos' &&
    intro.bg === 'rgb(255, 255, 255)' &&
    intro.color === 'rgb(10, 10, 10)',
  JSON.stringify(intro),
)

await page
  .locator('button')
  .filter({ hasText: '进入探索' })
  .first()
  .click({ force: true })
await page.waitForTimeout(2000)

/* ============================================================
   任务 1：省市级联
   ============================================================ */
await page.waitForFunction(
  () => document.querySelectorAll('select')[0]?.options.length > 5,
  undefined,
  { timeout: 20000 },
)
const prov = page.locator('select').nth(0)
const city = page.locator('select').nth(1)
const provCount = await prov.locator('option').count()
check('任务1 · 省份数据载入成功', provCount > 30, `${provCount} 个省份`)

await prov.selectOption({ label: '浙江省' })
await page.waitForTimeout(600)
const cityCount = await city.locator('option').count()
const cityDisabled = await city.isDisabled()
check(
  '任务1 · 选省份后城市级联填充',
  cityCount > 1 && !cityDisabled,
  `${cityCount} 个城市`,
)

await city.selectOption({ label: '杭州市' })
await page.waitForTimeout(300)

/* ============================================================
   任务 2：历法 / 时辰
   ============================================================ */
log('\n--- 任务 2 · 历法与时辰 ---')
await page.locator('input[type="date"]').fill('1995-06-15')
await page.waitForTimeout(400)

const lunarTab = page.locator('button[role="tab"]').filter({ hasText: '农历' })
await lunarTab.click({ force: true })
await page.waitForTimeout(800)

const lunarUi = await page.evaluate(() => ({
  dateInputGone: !document.querySelector('input[type="date"]'),
  selectCount: document.querySelectorAll('select').length,
  lunarSelected: [...document.querySelectorAll('button[role="tab"]')].some(
    (t) => t.textContent.includes('农历') && t.getAttribute('aria-selected') === 'true',
  ),
}))
check('任务2 · 农历 Tab 切换生效', lunarUi.lunarSelected)
check(
  '任务2 · 农历模式切换为分段选择器',
  lunarUi.dateInputGone && lunarUi.selectCount >= 4,
  `selects=${lunarUi.selectCount}`,
)

const lunarVal = await page.evaluate(() => {
  const out = {}
  for (const l of document.querySelectorAll('label')) {
    const t = l.innerText.split('\n').map((s) => s.trim())
    if (t.length >= 2 && ['年', '月', '日'].includes(t[0])) {
      const sel = l.querySelector('select')
      if (sel) out[t[0]] = sel.options[sel.selectedIndex]?.text
    }
  }
  return out
})
check(
  '任务2 · 1995-06-15 → 农历 1995年五月',
  lunarVal.年 === '1995' && lunarVal.月 === '五月',
  JSON.stringify(lunarVal),
)

await page
  .locator('button[role="tab"]')
  .filter({ hasText: '公历' })
  .click({ force: true })
await page.waitForTimeout(800)
const backDate = await page.locator('input[type="date"]').inputValue()
check('任务2 · 切回公历日期保留', backDate === '1995-06-15', backDate)

await page
  .locator('button[role="tab"]')
  .filter({ hasText: '传统时辰' })
  .click({ force: true })
await page.waitForTimeout(600)
const shichenSel = page.locator('select').last()
const shichenOpts = await shichenSel.locator('option').count()
check('任务2 · 十二时辰下拉（12+占位）', shichenOpts === 13, `${shichenOpts} 项`)

const shichenList = await shichenSel.locator('option').allTextContents()
check(
  '任务2 · 子丑寅卯…齐全',
  ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'].every(
    (z) => shichenList.some((t) => t.includes(z)),
  ),
  shichenList.join(' '),
)

await shichenSel.selectOption('wu')
await page.waitForTimeout(500)
const bodyTxt = await page.evaluate(() => document.body.innerText)
const i = bodyTxt.indexOf('午时')
check(
  '任务2 · 午时区间提示可见',
  i >= 0 && /11:00|13:00/.test(bodyTxt.slice(i, i + 120)),
  i >= 0 ? bodyTxt.slice(i, i + 60).replace(/\n+/g, ' ') : '未找到',
)

await page.locator('button').filter({ hasText: '女' }).first().click({ force: true })
await page.waitForTimeout(200)

/* ============================================================
   任务 3&5：直接造 chart 注入存档，跳到主页
   ============================================================ */
log('\n--- 任务 3&5 · 主题与 3D 视差 ---')

const api = await page.evaluate(async () => {
  const post = async (body) => {
    const r = await fetch('/api/chart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return r.ok ? await r.json() : { error: r.status }
  }
  const base = {
    date: '1995-06-15',
    latitude: 30.2741,
    longitude: 120.1551,
    timezone: 8,
  }
  return {
    solar: await post({ ...base, time: '12:00' }),
    shichen: await post({ ...base, shichen: 'wu' }),
  }
})
check('任务2 · 后端 /api/chart 正常', !api.solar.error, JSON.stringify(api.solar).slice(0, 120))
check(
  '任务2 · 后端支持时辰 + timePrecision',
  !!api.shichen.shichenName && !!api.shichen.timePrecision,
  `${api.shichen.shichenName} / ${api.shichen.timePrecision}`,
)

const chart = await page.evaluate(async (eph) => {
  // 用应用自身的归一化逻辑把星历转成 Chart，避免注入原始 API 响应
  const mod = await import('/src/lib/chart.ts')
  return mod.chartFromEphemeris(eph, null, true)
}, api.solar)

await page.evaluate((c) => {
  const acc = localStorage.getItem('talent-identifier:account') ?? 'acc_test'
  const key = `talent-identifier:profile:${acc}`
  localStorage.setItem(
    key,
    JSON.stringify({
      accountId: acc,
      accountName: '测试',
      birth: {
        date: '1995-06-15',
        time: '12:00',
        place: '浙江省 杭州市',
        latitude: 30.2741,
        longitude: 120.1551,
        gender: 'female',
      },
      mbti: null,
      chart: c,
      days: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
  )
}, chart)
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2500)

const dash = await page.evaluate(() => {
  const el = document.documentElement
  const cs = getComputedStyle(el)
  const p = document.querySelector('[data-parallax]')
  return {
    theme: el.getAttribute('data-theme'),
    element: el.getAttribute('data-element'),
    primary: cs.getPropertyValue('--el-primary').trim(),
    accent: cs.getPropertyValue('--el-accent').trim(),
    bg: getComputedStyle(document.body).backgroundColor,
    perspective: p ? getComputedStyle(p).perspective : null,
    parallaxEls: document.querySelectorAll('[data-parallax]').length,
    text: document.body.innerText.slice(0, 240).replace(/\n+/g, ' | '),
  }
})
log(`  theme=${dash.theme} element=${dash.element} primary=${dash.primary} accent=${dash.accent}`)
log(`  perspective=${dash.perspective} parallaxEls=${dash.parallaxEls}`)
log(`  ${dash.text}`)
check('任务3 · 主页切换为 cosmos 主题', dash.theme === 'cosmos')
check('任务5 · 3D perspective 已建立', dash.perspective && dash.perspective !== 'none', dash.perspective)
check('任务3 · 元素 CSS 变量已注入', !!dash.primary && !!dash.accent)

/* ---------- 视差交互 ---------- */
const readLayers = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-parallax-layer]')].map((l) => ({
      depth: l.getAttribute('data-parallax-layer'),
      transform: l.style.transform ?? '',
    })),
  )

/**
 * 提取平移/旋转量（忽略常量 Z 深度）。
 *
 * v10.0 起 framer-motion 会把 transform 拆成
 * translateX / translateY / translateZ / rotateX / rotateY 若干独立函数，
 * 所以不能再用单一的 translate3d 正则去匹配。
 */
const motionOf = (transform) => {
  const tx = transform.match(/translateX\((-?[\d.]+)px\)/)
  const ty = transform.match(/translateY\((-?[\d.]+)px\)/)
  const rx = transform.match(/rotateX\((-?[\d.]+)deg\)/)
  const ry = transform.match(/rotateY\((-?[\d.]+)deg\)/)
  return {
    x: tx ? +tx[1] : 0,
    y: ty ? +ty[1] : 0,
    rx: rx ? +rx[1] : 0,
    ry: ry ? +ry[1] : 0,
  }
}

/* 静止状态：应为纯 2D 平面（无位移、无旋转） */
const rest = await readLayers()
log(`\n  视差图层数: ${rest.length}`)
check('任务5 · 存在多层视差元素', rest.length >= 3, `${rest.length} 层`)

const flat = rest.every((l) => {
  const m = motionOf(l.transform)
  return (
    Math.abs(m.x) < 0.5 &&
    Math.abs(m.y) < 0.5 &&
    Math.abs(m.rx) < 0.05 &&
    Math.abs(m.ry) < 0.05
  )
})
check('任务5 · 鼠标静止时呈纯 2D 平面', flat, rest[0]?.transform?.slice(0, 80))

/* 移动 → 应展开 3D（持续移动，边动边采样） */
await page.mouse.move(160, 120)
await page.waitForTimeout(120)
await page.mouse.move(1450, 830)
await page.waitForTimeout(120)
await page.mouse.move(200, 900)
await page.waitForTimeout(120)
await page.mouse.move(1400, 150)
await page.waitForTimeout(200)
const m1 = await readLayers()

/* 继续移动到另一处，采样对比 */
await page.mouse.move(300, 780)
await page.waitForTimeout(120)
await page.mouse.move(1200, 300)
await page.waitForTimeout(200)
const m2 = await readLayers()

check(
  '任务5 · 鼠标移动后图层 transform 改变',
  m1.map((l) => l.transform).join('|') !== rest.map((l) => l.transform).join('|'),
)
check(
  '任务5 · 不同鼠标位置 transform 不同',
  m1.map((l) => l.transform).join('|') !== m2.map((l) => l.transform).join('|'),
)
const rot = m1.find((l) => /rotate[XY]\([1-9]/.test(l.transform))
check(
  '任务5 · 含 rotateX/rotateY 3D 倾斜',
  !!rot,
  rot?.transform?.slice(0, 100),
)
/* v10.0：星盘倾斜必须钳制在 ±10° 以内 */
const maxTilt = Math.max(
  ...m1.flatMap((l) => {
    const m = motionOf(l.transform)
    return [Math.abs(m.rx), Math.abs(m.ry)]
  }),
)
check(
  '任务5 · 倾斜钳制在 ±10° 内',
  maxTilt <= 10.001,
  `最大 ${maxTilt.toFixed(2)}°`,
)

const depths = m1
  .map((l) => {
    const mm = (l.transform ?? '').match(/translateZ\((-?[\d.]+)px\)/)
    return mm ? Number(mm[1]) : null
  })
  .filter((v) => v !== null)
log(`  各层 Z 深度: ${JSON.stringify(depths)}`)
check(
  '任务5 · 多层不同 Z 景深（交错遮挡）',
  new Set(depths.map((d) => Math.round(d / 10))).size >= 3,
  JSON.stringify(depths),
)

/* 静止后应退回 2D
 *
 * 把指针移到**场景正中**（main 中心），
 * 这样归一化坐标恰好为 0，所有图层都应完全归位。
 * 注意：不能移到视口中心 —— main 中心在顶部栏下方，
 * 与视口中心差了几十像素，会留下正常的微小视差偏移。 */
const originPos = await page.evaluate(() => {
  const m = document.querySelector('main')
  const r = m.getBoundingClientRect()
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
})
await page.mouse.move(originPos.x, originPos.y)
await page.waitForTimeout(2600)
const settled = await readLayers()
const flatAgain = settled.every((l) => {
  const m = motionOf(l.transform)
  return (
    Math.abs(m.x) < 0.5 &&
    Math.abs(m.y) < 0.5 &&
    Math.abs(m.rx) < 0.05 &&
    Math.abs(m.ry) < 0.05
  )
})
check(
  '任务5 · 停止移动后收回 2D 平面',
  flatAgain,
  settled[0]?.transform?.slice(0, 80),
)

/* 强调色对比度 */
const accentInfo = await page.evaluate(() => {
  const el = document.documentElement
  const cs = getComputedStyle(el)
  const accent = cs.getPropertyValue('--el-accent').trim()
  const lum = (hex) => {
    const h = hex.replace('#', '')
    const v = [0, 2, 4].map((off) => parseInt(h.slice(off, off + 2), 16) / 255)
    const l = v.map((ch) =>
      ch <= 0.03928 ? ch / 12.92 : ((ch + 0.055) / 1.055) ** 2.4,
    )
    return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2]
  }
  const L1 = lum(accent)
  const L2 = lum('#0b1428')
  const ratio =
    (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05)
  return { accent, ratio: Number(ratio.toFixed(2)) }
})
log(`  强调色 ${accentInfo.accent} 对比度 ${accentInfo.ratio}`)
check(
  '任务3 · 强调色在深底上高对比（≥4.5）',
  accentInfo.ratio >= 4.5,
  `${accentInfo.accent} / ${accentInfo.ratio}`,
)

await page.screenshot({ path: '/tmp/v9-dashboard.png' })

/* ---------- 重新开始 → 白底黑字 ---------- */
/*
 * 注意：SpaceGuide 引导遮罩是 fixed z-[200]，会盖住整个视口并吃掉点击。
 * 所以先关掉引导，再操作「重新开始」。
 */
const guideDone = page.getByRole('button', { name: '我知道了' })
if (await guideDone.count()) {
  await guideDone.first().click({ force: true })
  await page.waitForTimeout(800)
}

const restart = page.locator('button').filter({ hasText: '重新开始' })
if (await restart.count()) {
  await restart.first().click({ force: true })
  await page.waitForTimeout(900)
  const confirm = page.locator('button').filter({ hasText: /确认清除|确认重新开始/ })
  if (await confirm.count()) {
    await confirm.first().click({ force: true })
  } else {
    log('  ⚠️ 未找到确认按钮，无法完成重置')
  }
  await page.waitForTimeout(2500)
  const reset = await page.evaluate(() => ({
    theme: document.documentElement.getAttribute('data-theme'),
    bg: getComputedStyle(document.body).backgroundColor,
    color: getComputedStyle(document.body).color,
    text: document.body.innerText.slice(0, 120).replace(/\n+/g, ' | '),
  }))
  log(`  重置后: ${JSON.stringify(reset)}`)
  check(
    '任务3 · 重新开始回到白底黑字',
    reset.theme !== 'cosmos' && reset.bg === 'rgb(255, 255, 255)',
    JSON.stringify(reset),
  )
} else {
  log('  (未找到「重新开始」按钮)')
}

/* ============================================================ */
log(`\n控制台错误: ${errors.length ? '\n' + errors.join('\n') : '无'}`)
const failed = results.filter((r) => !r.ok)
log(`\n===== ${results.length - failed.length}/${results.length} 通过 =====`)
if (failed.length) log('失败项: ' + failed.map((f) => f.name).join(', '))
await browser.close()
process.exit(failed.length ? 1 : 0)
