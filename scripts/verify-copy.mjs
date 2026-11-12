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

// 注入星盘
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

/* ---- 任务 4：文案体检 ---- */
const copy = await page.evaluate(() => {
  const text = document.body.innerText
  const banned = [
    '首先', '其次', '总之', '综上所述', '总而言之',
    '值得注意的是', '需要注意的是', '总的来说', '换句话说',
  ]
  const hits = banned.filter((w) => text.includes(w))
  /* 统计正文段落长度 */
  const paras = [...document.querySelectorAll('p')]
    .map((p) => p.innerText.trim())
    .filter((t) => t.length > 12)
  const lens = paras.map((t) => t.length)
  return {
    bannedHits: hits,
    paraCount: paras.length,
    avgLen: lens.length ? Math.round(lens.reduce((a, b) => a + b, 0) / lens.length) : 0,
    maxLen: lens.length ? Math.max(...lens) : 0,
    over80: lens.filter((l) => l > 80).length,
    sample: paras.slice(0, 6),
  }
})
console.log('【任务4 · 文案体检】')
console.log('  AI 连接词残留:', copy.bannedHits.length ? copy.bannedHits.join(',') : '无 ✓')
console.log(`  段落数 ${copy.paraCount}，平均 ${copy.avgLen} 字，最长 ${copy.maxLen} 字，超 80 字段数 ${copy.over80}`)
console.log('  样本:')
copy.sample.forEach((s) => console.log('   · ' + s.replace(/\n/g, ' ')))

/* ---- 视差视觉截图（持续移动中） ---- */
for (let i = 0; i < 14; i++) {
  const x = 400 + Math.cos(i / 2) * 900
  const y = 470 + Math.sin(i / 2) * 380
  await page.mouse.move(x, y)
  await page.waitForTimeout(90)
}
await page.screenshot({ path: '/tmp/v9-parallax-active.png' })

/* 静止后的 2D 平面截图 */
await page.waitForTimeout(2600)
await page.screenshot({ path: '/tmp/v9-parallax-rest.png' })

/* 抽取所有图层的最终状态 */
const layers = await page.evaluate(() =>
  [...document.querySelectorAll('[data-parallax-layer]')].map((l) => ({
    depth: l.getAttribute('data-parallax-layer'),
    t: l.style.transform,
  })),
)
console.log('\n【视差图层】')
layers.forEach((l) => console.log(`  depth=${l.depth}  ${l.t}`))

await browser.close()
