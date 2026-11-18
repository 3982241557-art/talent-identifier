/**
 * 端到端视觉验证脚本（v17.0）
 *
 * 依次走完完整链路并截图，同时捕获控制台错误。
 *
 * v17.0 流程变更：
 *   Intro → Form → **BirthSky（出生那天的真实宇宙）** → MBTI → Verdict → Dashboard
 *   旧脚本还停留在 Intro 直接出表单的旧流程，会在第一步就超时。
 *
 * 用法：node scripts/verify.mjs
 */
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'

const OUT = '/tmp/ls-shots'
mkdirSync(OUT, { recursive: true })

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5180/'

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

const shot = async (name) => {
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false })
  console.log(`  📸 ${name}.png`)
}

/** 点击含指定文案的元素（等待可见后再点） */
const clickText = async (text, timeout = 15000) => {
  const loc = page.locator(`text=${text}`).first()
  await loc.waitFor({ state: 'visible', timeout })
  await loc.click()
}

/* ---------- 阶段 1：苏格拉底破冰 ---------- */
console.log('阶段 1 · Intro')
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForTimeout(2500)
await shot('01-intro-greet')

/*
 * v17.0：开场是点击触发的宇宙对话序列，共三个阶段：
 *   starlight → reveal → warp → (1.5s 后) form
 * 每一次点击推进一段，最后出现「开始」按钮才是真正的表单入口。
 */
console.log('  · 点击推进对话 1/3')
await page.mouse.click(800, 500)
await page.waitForTimeout(2200)
await shot('01-intro-dialog')

console.log('  · 点击推进对话 2/3')
await page.mouse.click(800, 500)
await page.waitForTimeout(3000)
await shot('01-intro-warp')

console.log('  · 点击推进对话 3/3')
await page.mouse.click(800, 500)
await page.waitForTimeout(1500)
await shot('01-intro-ready')

console.log('  · 点击「开始」进入出生信息表单')
await clickText('开始')
await page.waitForTimeout(1200)

/* ---------- 阶段 2：出生信息表单 ---------- */
console.log('阶段 2 · Form')
await page.waitForSelector('input[type="date"]', { timeout: 20000 })
await page.waitForTimeout(1000)
await shot('02-form-empty')

await page.fill('input[type="date"]', '1998-06-15')

/* 出生地：省份 + 城市 两级 Cascader */
const selects = page.locator('select')
const selCount = await selects.count()
if (selCount >= 1) {
  await selects.nth(0).selectOption({ index: 1 }).catch(() => {})
  await page.waitForTimeout(900)
}
if (selCount >= 2) {
  await selects.nth(1).selectOption({ index: 1 }).catch(() => {})
  await page.waitForTimeout(500)
}

/* 出生时辰：TimePicker 有 clock / shichen 两种模式 */
await clickText('具体时刻').catch(() => {})
await page.waitForTimeout(400)
const timeInput = page.locator('input[type="time"]').first()
if (await timeInput.count()) {
  await timeInput.fill('14:30').catch(() => {})
}

/* 性别（必填） */
await clickText('男').catch(() => {})
await page.waitForTimeout(500)
await shot('02-form-filled')

await clickText('下一步')
await page.waitForTimeout(2000)

/* ---------- 阶段 3：出生那天的真实宇宙 ---------- */
console.log('阶段 3 · BirthSky（NASA 哈勃生日深空）')
await page.waitForTimeout(4000)
await shot('03-birthsky-hubble')

/* 烦恼粉碎舱 */
const worryInput = page
  .locator('input[placeholder*="烦恼"], textarea[placeholder*="烦恼"]')
  .first()
if (await worryInput.count()) {
  await worryInput.fill('今天被一件小事烦到了')
  await page.waitForTimeout(400)
  await shot('03-birthsky-worry-typed')
  await clickText('丢进宇宙')
  await page.waitForTimeout(2500)
  await shot('03-birthsky-worry-dissolve')
} else {
  console.log('  · 未找到烦恼输入框，跳过粉碎舱')
}

/* 进入星盘 */
await clickText('走进这片星空')
await page.waitForTimeout(1500)
await shot('03-birthsky-cta')

/* ---------- 阶段 4：MBTI ---------- */
console.log('阶段 4 · MBTI')
await page.waitForTimeout(2000)
await shot('04-mbti')

/* ---------- 阶段 5：天赋解析 ---------- */
console.log('阶段 5 · Verdict')
await page.waitForTimeout(1200)

/* ---------- 阶段 6：主页 ---------- */
console.log('阶段 6 · Dashboard')
await page.waitForTimeout(3000)
await shot('06-dashboard-top')

/* ---------- 优势挖掘实践入口 ---------- */
const advEntry = page.locator('text=优势挖掘实践').first()
if (await advEntry.count()) {
  console.log('  · 打开优势挖掘实践')
  await advEntry.scrollIntoViewIfNeeded().catch(() => {})
  await page.waitForTimeout(800)
  await shot('06-advantage-entry')
  await advEntry.click().catch(() => {})
  await page.waitForTimeout(2000)
  await shot('06-advantage-panel')
}

/* 新手引导（聚光灯） —— 按钮是右上角「?」 */
const guideBtn = page.locator('[aria-label="新手引导"]').first()
if (await guideBtn.count()) {
  console.log('  · 打开新手引导')
  await guideBtn.click().catch(() => {})
  await page.waitForTimeout(2200)
  await shot('06-spotlight-step1')
  for (const i of [2, 3]) {
    await clickText('下一步', 8000).catch(() => {})
    await page.waitForTimeout(1600)
    await shot(`06-spotlight-step${i}`)
  }
}

console.log('\n控制台错误：', errors.length ? errors : '无')
await browser.close()
