import { chromium } from 'playwright-core'

const browser = await chromium.launch({
  executablePath:
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--no-sandbox'],
})
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } })
await page.goto('http://localhost:5180/', { waitUntil: 'domcontentloaded' })
await page.evaluate(() => localStorage.clear())
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1000)

const chart = await page.evaluate(async () => {
  const r = await fetch('/api/chart', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      date: '1995-06-15',
      time: '12:00',
      latitude: 30.2741,
      longitude: 120.1551,
      timezone: 8,
    }),
  })
  const eph = await r.json()
  const mod = await import('/src/lib/chart.ts')
  return mod.chartFromEphemeris(eph, null, true)
})
await page.evaluate((c) => {
  const acc = localStorage.getItem('talent-identifier:account')
  localStorage.setItem(
    `talent-identifier:profile:${acc}`,
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

/* ---- 静止 2D ---- */
await page.screenshot({ path: '/tmp/p2d.png' })

/* ---- 运动中 3D（截图时保持运动） ---- */
await page.evaluate(() => {
  /* 持续派发 mousemove，让能量维持在 1 */
  let t = 0
  const id = setInterval(() => {
    t += 0.25
    window.dispatchEvent(
      new MouseEvent('mousemove', {
        clientX: 800 + Math.cos(t) * 700,
        clientY: 470 + Math.sin(t * 1.3) * 350,
      }),
    )
  }, 16)
  window.__stop = () => clearInterval(id)
})
await page.waitForTimeout(1200)
await page.screenshot({ path: '/tmp/p3d.png' })
const live = await page.evaluate(() =>
  [...document.querySelectorAll('[data-parallax-layer]')].map((l) => ({
    depth: l.getAttribute('data-parallax-layer'),
    t: l.style.transform,
  })),
)
await page.evaluate(() => window.__stop())

console.log('【运动中的图层状态】')
live.forEach((l) => console.log(`  depth=${l.depth}  ${l.t}`))

/* ---- 像素差分（用 sharp 或跳过） ---- */

/* ---- 中心星座名的实际颜色 ---- */
const titleColor = await page.evaluate(() => {
  const root = getComputedStyle(document.documentElement)
  const accent = root.getPropertyValue('--el-accent').trim()
  /* 找中心大标题 */
  const nodes = [...document.querySelectorAll('h1,h2,h3,div,span')]
  const big = nodes
    .filter((n) => {
      const s = getComputedStyle(n)
      const size = parseFloat(s.fontSize)
      return size >= 28 && n.innerText?.trim().length <= 8 && n.innerText?.trim()
    })
    .map((n) => ({
      text: n.innerText.trim(),
      size: getComputedStyle(n).fontSize,
      color: getComputedStyle(n).color,
      shadow: getComputedStyle(n).textShadow?.slice(0, 60),
    }))
  return { accent, big: big.slice(0, 8) }
})
console.log('\n【标题颜色】accent =', titleColor.accent)
titleColor.big.forEach((b) => console.log(`  "${b.text}" ${b.size} ${b.color} shadow:${b.shadow}`))

await browser.close()
