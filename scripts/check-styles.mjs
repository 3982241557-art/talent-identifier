/**
 * 样式断言：验证暗金高亮、衬线体、毛玻璃等视觉红线
 */
import { chromium } from 'playwright-core'

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5180/'

const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--disable-gpu'],
})
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })

await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForSelector('input[type="date"]', { timeout: 15000 })
await page.fill('input[type="date"]', '1998-06-15')
await page.fill('input[type="time"]', '14:30')
await page.selectOption('select', '北京')
await page.click('text=让星盘显影')
await page.waitForTimeout(2000)

// 判词暗金高亮
const gold = await page.evaluate(() => {
  const el = document.querySelector('.gold-text')
  if (!el) return null
  const cs = getComputedStyle(el)
  return { text: el.textContent, color: cs.color, font: cs.fontFamily }
})
console.log('判词高亮：', gold)

// 衬线体
const serif = await page.evaluate(() => {
  const p = document.querySelector('.serif-body')
  if (!p) return null
  const cs = getComputedStyle(p)
  return {
    font: cs.fontFamily,
    lineHeight: cs.lineHeight,
    letterSpacing: cs.letterSpacing,
  }
})
console.log('衬线排版：', serif)

// 进入主页，检查毛玻璃
await page.waitForTimeout(5000)
await page.click('text=进入星盘')
await page.waitForTimeout(1500)
// 等待科普段字幕播完（约 26s）后点击进入主页
await page.waitForTimeout(28000)
await page.click('body')
await page.waitForTimeout(3000)

const glass = await page.evaluate(() => {
  const el = document.querySelector('.glass-panel')
  if (!el) return null
  const cs = getComputedStyle(el)
  return {
    background: cs.backgroundColor,
    backdropFilter: cs.backdropFilter || cs.webkitBackdropFilter,
    border: cs.borderTopWidth + ' ' + cs.borderTopStyle,
  }
})
console.log('毛玻璃面板：', glass)

const bg = await page.evaluate(() => {
  const img = document.querySelector('img[src="/bg.png"]')
  const overlay = document.querySelector('.bg-black\\/40')
  return {
    hasBg: Boolean(img),
    overlay: overlay ? getComputedStyle(overlay).backgroundColor : null,
  }
})
console.log('背景层：', bg)

await browser.close()
