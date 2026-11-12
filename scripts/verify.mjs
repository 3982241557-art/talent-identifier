/**
 * 端到端视觉验证脚本
 * 依次走完 5 个阶段并截图，同时捕获控制台错误。
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

// ---------- 阶段 1：苏格拉底破冰 ----------
console.log('阶段 1 · Intro')
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForTimeout(2500)
await shot('01-intro-greet')

// 等待表单出现
await page.waitForSelector('input[type="date"]', { timeout: 15000 })
await page.waitForTimeout(1200)
await shot('01-intro-form')

// 填写表单
await page.fill('input[type="date"]', '1998-06-15')
await page.fill('input[type="time"]', '14:30')
await page.selectOption('select', '北京')
await page.waitForTimeout(600)
await shot('01-intro-filled')

await page.click('text=让星盘显影')
await page.waitForTimeout(2500)
await shot('01-intro-verdict')

// 进入形象阶段
await page.waitForTimeout(5000)
await shot('01-intro-avatar')

await page.click('text=进入星盘')
await page.waitForTimeout(1500)

// ---------- 阶段 2：科普过场 ----------
console.log('阶段 2 · Cinematic')
await page.waitForTimeout(6000)
await shot('02-cinematic')

// 等字幕播完
await page.waitForTimeout(20000)
await shot('02-cinematic-end')

await page.click('body')
await page.waitForTimeout(2000)

// ---------- 阶段 3：宿命主页 ----------
console.log('阶段 3 · Dashboard')
await page.waitForTimeout(2500)
await shot('03-dashboard-top')

await page.evaluate(() => {
  document.querySelector('.thin-scroll')?.scrollTo({
    top: 900,
    behavior: 'instant',
  })
})
await page.waitForTimeout(1200)
await shot('03-dashboard-cards')

// ---------- 阶段 4：全局向导 ----------
console.log('阶段 4 · Guide')
await page.click('text=展开 →')
await page.waitForTimeout(3000)
await shot('04-guide-overlay')

await page.click('text=继续 →')
await page.waitForTimeout(1200)

await page.evaluate(() => {
  document.querySelector('.thin-scroll')?.scrollTo({
    top: 1900,
    behavior: 'instant',
  })
})
await page.waitForTimeout(1000)
await shot('03-dashboard-wheel')

await page.evaluate(() => {
  const el = document.querySelector('.thin-scroll')
  if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'instant' })
})
await page.waitForTimeout(1200)
await shot('03-dashboard-chat')

// ---------- 阶段 5：AI 问答 ----------
console.log('阶段 5 · Chat')
await page.fill('input[placeholder="我有疑问……"]', '我总是害怕被人误解，怎么办？')
await page.click('text=请教')
await page.waitForTimeout(9000)
await shot('05-chat-reply')

console.log('\n控制台错误：', errors.length ? errors : '无')
await browser.close()
