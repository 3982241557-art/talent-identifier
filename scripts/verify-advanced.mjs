/**
 * 优势挖掘实践 + 聚光灯新手指引 专项验证
 *
 * 用法：node scripts/verify-advanced.mjs
 */
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'

const OUT = '/tmp/ls-shots'
mkdirSync(OUT, { recursive: true })
const BASE = process.env.BASE_URL ?? 'http://localhost:5180/'

const browser = await chromium.launch({
  executablePath:
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--disable-gpu', '--hide-scrollbars'],
})
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
const errors = []
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`[console] ${m.text()}`)
})
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`))

const shot = async (n) => {
  await page.screenshot({ path: `${OUT}/${n}.png` })
  console.log(`  📸 ${n}.png`)
}
const clickText = async (t, timeout = 15000) => {
  const l = page.locator(`text=${t}`).first()
  await l.waitFor({ state: 'visible', timeout })
  await l.click({ timeout })
}

/* 直接注入存档，跳过开场 —— 专注验证新模块 */
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForTimeout(2000)

console.log('· 推进开场 3 段')
for (let i = 0; i < 3; i++) {
  await page.mouse.click(800, 500)
  await page.waitForTimeout(2000)
}
await clickText('开始')
await page.waitForTimeout(1200)

console.log('· 填表')
await page.fill('input[type="date"]', '1998-06-15')
const selects = page.locator('select')
if ((await selects.count()) >= 1) {
  await selects.nth(0).selectOption({ index: 1 }).catch(() => {})
  await page.waitForTimeout(900)
}
if ((await selects.count()) >= 2) {
  await selects.nth(1).selectOption({ index: 1 }).catch(() => {})
}
await clickText('具体时刻').catch(() => {})
const ti = page.locator('input[type="time"]').first()
if (await ti.count()) await ti.fill('14:30').catch(() => {})
await clickText('男').catch(() => {})
await page.waitForTimeout(500)
await clickText('下一步')
await page.waitForTimeout(3000)

console.log('· 哈勃生日星空')
await shot('adv-01-birthsky')
await clickText('走进这片星空')
await page.waitForTimeout(2500)

console.log('· MBTI')
await shot('adv-02-mbti')

/*
 * MBTI 问答视图：每题点第一个选项，一直点到进入主页。
 * 选项是 `motion.button`，用 text 定位容易歧义 —— 改用结构定位：
 * 找出所有含「已记下 / 记下」之外、且宽度铺满的按钮。
 * 更稳的做法：直接点选项容器里的第一个 span 文本节点。
 */
console.log('· 作答 MBTI')
/* 分支页 → 点「开始探索 →」进入 20 题快问快答 */
const explore = page.locator('text=开始探索').first()
if (await explore.count()) {
  await explore.click({ force: true }).catch(() => {})
  await page.waitForTimeout(1500)
}

for (let i = 0; i < 30; i++) {
  /* 若已经进入主页（出现优势入口）就停 */
  if (await page.locator('[data-spot="advantage-float"]').count()) break

  const opt = page.locator('[data-mbti-option]').first()
  if (await opt.count()) {
    await opt.click({ force: true }).catch(() => {})
    await page.waitForTimeout(2200)
  } else {
    await page.waitForTimeout(1500)
  }
}

/* ---------- 灵魂底色页 → 主页 ---------- */
console.log('· 灵魂底色页')
await page.waitForTimeout(2500)
await shot('adv-02b-verdict')
const seeChart = page.locator('text=看看我的星盘').first()
if (await seeChart.count()) {
  await seeChart.click({ force: true }).catch(() => {})
  await page.waitForTimeout(6000)
}

console.log('· 主页')
await page.waitForTimeout(6000)
await shot('adv-03-dashboard')

/* ---------- 新手引导（聚光灯） ----------
 *
 * 首次进入主页时**自动触发**，
 * 它会盖住整个视口 —— 所以必须先把引导走完（或关掉），
 * 否则下面的优势挖掘入口根本点不到。
 */
console.log('· 新手引导')
{
  const guide = page.locator('[aria-label^="第 "]').first()
  const started = (await guide.count()) > 0
  if (!started) {
    console.log('  · 未自动触发（可能已看过），手动点右上角「?」')
    const g = page.locator('[aria-label="新手引导"]').first()
    if (await g.count()) {
      await g.click({ force: true }).catch(() => {})
      await page.waitForTimeout(2200)
    }
  }

  if (await page.locator('[aria-label^="第 "]').count()) {
    await shot('adv-08-spotlight-1')
    /* 走完 6 步：最后一步按钮是「我知道了」 */
    for (let i = 2; i <= 6; i++) {
      const next = page.locator('button:has-text("下一步")').first()
      if (!(await next.count())) break
      await next.click({ force: true }).catch(() => {})
      await page.waitForTimeout(1700)
      await shot(`adv-08-spotlight-${i}`)
    }
    /* 最后一步：点「我知道了」关闭 */
    const done = page.locator('button:has-text("我知道了")').first()
    if (await done.count()) {
      await done.click({ force: true }).catch(() => {})
      await page.waitForTimeout(1200)
    }
  }

  /* 兜底：若引导仍在，点「跳过」 */
  if (await page.locator('[aria-label="跳过新手引导"]').count()) {
    await page.locator('[aria-label="跳过新手引导"]').first().click({ force: true }).catch(() => {})
    await page.waitForTimeout(1200)
  }
  await page.waitForTimeout(1500)
}

/* ---------- 优势挖掘实践 ---------- */
console.log('· 打开优势挖掘实践')
const advBtn = page.locator('[data-spot="advantage-float"]')
if (await advBtn.count()) {
  await advBtn.scrollIntoViewIfNeeded()
  await page.waitForTimeout(600)
  await shot('adv-04-advantage-open')
  await advBtn.click({ force: true })
  await page.waitForTimeout(2200)
  await shot('adv-05-advantage-panel')

  /* 填 5 个节点，检查点亮 */
  const inputs = page.locator('input[data-adv-node]')
  const n = await inputs.count()
  console.log(`  · 优势链条输入框 ${n} 个`)
  for (let i = 0; i < Math.min(n, 5); i++) {
    await inputs.nth(i).fill(`第 ${i + 1} 步的示例内容`)
    await page.waitForTimeout(350)
  }
  await page.waitForTimeout(1200)
  await shot('adv-06-cycle-lit')

  /* 技能库划掉 */
  const skill = page.locator('[data-skill-tag]').first()
  if (await skill.count()) {
    await skill.click()
    await page.waitForTimeout(800)
    await shot('adv-07-skill-crossed')
  }
} else {
  console.log('  · 未找到优势入口')
}

console.log('\n控制台错误：', errors.length ? errors : '无')
await browser.close()
