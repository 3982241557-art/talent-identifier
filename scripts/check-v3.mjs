import { chromium } from 'playwright-core'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const BASE = 'http://127.0.0.1:5173/'

const shots = process.argv[2] ?? '/tmp/v3'

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})
const ctx = await browser.newContext({
  viewport: { width: 1600, height: 900 },
  deviceScaleFactor: 1,
})
const page = await ctx.newPage()
const errors = []
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text())
})
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))

const log = (...a) => console.log('[check]', ...a)

await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForTimeout(2500)

// ---------- P1 ----------
await page.screenshot({ path: `${shots}-p1.png` })
log('P1 title:', await page.locator('h1').innerText())

// ---------- Tutorial (Task 2) ----------
await page.getByRole('button', { name: '新手教程' }).click()
await page.waitForTimeout(900)
const tut = await page.locator('body').innerText()
log('tutorial contains 判词:', tut.includes('判词'))
log('tutorial contains 灵魂底色:', tut.includes('灵魂底色'))
await page.screenshot({ path: `${shots}-tutorial.png` })
await page.getByRole('button', { name: '我明白了' }).click()
await page.waitForTimeout(700)

// ---------- Form ----------
await page.getByRole('button', { name: /进入探索/ }).click()
await page.waitForTimeout(1200)
await page.locator('input[type=date]').fill('1992-06-15')
await page.locator('select').first().selectOption('浙江省')
await page.waitForTimeout(300)
await page.locator('select').nth(1).selectOption('杭州市')
await page.getByRole('button', { name: '男', exact: true }).click()
await page.screenshot({ path: `${shots}-form.png` })
const nSelects = await page.locator('select').count()
log('form select count (expect 2, no district):', nSelects)
await page.getByRole('button', { name: /下一步/ }).click()
await page.waitForTimeout(1500)

// ---------- MBTI branch (Task 4) ----------
await page.screenshot({ path: `${shots}-mbti-branch.png` })
log('at branch page:', await page.locator('h2').first().innerText())

// ---------- Task 5: back-button stack test ----------
// Go into manual, then hit 返回 -> should return to branch (not intro)
await page.getByRole('button', { name: /已知 MBTI/ }).click()
await page.waitForTimeout(700)
log('at manual page:', await page.locator('h2').first().innerText())
await page.getByRole('button', { name: '返回' }).click()
await page.waitForTimeout(1500)
const afterBack = await page.locator('h2').first().innerText()
log('after 返回 from manual ->', afterBack, '(expect 性格底色 = branch, NOT 你的出生坐标)')
log('form data preserved?', await page.evaluate(() => {
  const raw = localStorage.getItem('talent-identifier:account')
  return raw ? 'account present' : 'none'
}))

// Now go back from branch -> should land on form with data intact
await page.getByRole('button', { name: '返回' }).click()
await page.waitForTimeout(2000)
const formState = await page.evaluate(() => {
  const sels = [...document.querySelectorAll('select')]
  const male = [...document.querySelectorAll('button')].find(
    (b) => b.textContent.trim() === '男' && b.className.includes('bg-ink'),
  )
  return {
    h2: document.querySelector('h2')?.textContent,
    date: document.querySelector('input[type=date]')?.value,
    province: sels[0]?.value,
    city: sels[1]?.value,
    genderKept: Boolean(male),
  }
})
log('after 返回 from branch -> form:', JSON.stringify(formState))
await page.screenshot({ path: `${shots}-form-kept.png` })

// forward again
await page.getByRole('button', { name: /下一步/ }).click()
await page.waitForTimeout(1600)
log('forward again at:', await page.locator('h2').first().innerText())

// ---------- Manual MBTI ----------
await page.getByRole('button', { name: /已知 MBTI/ }).click()
await page.waitForTimeout(600)
await page.locator('select').first().selectOption('INTJ')
await page.waitForTimeout(500)
await page.getByRole('button', { name: '就用它' }).click()
await page.waitForTimeout(2500)

// ---------- P5 verdict (Task 6 + 7) ----------
await page.screenshot({ path: `${shots}-verdict.png` })
const vText = await page.locator('body').innerText()
log('P5 has 灵魂底色:', vText.includes('你的灵魂底色'))
log('P5 tags:', (vText.match(/[^\n]{2,8}/g) || []).slice(0, 12).join(' | '))
const bg = await page.evaluate(() => getComputedStyle(document.querySelector('main')?.parentElement || document.body).backgroundColor)
log('P5 bg color (expect white):', bg)

await page.getByRole('button', { name: /看看我的星盘/ }).click()
await page.waitForTimeout(2500)

// ---------- P6 dashboard (Task 10) ----------
await page.screenshot({ path: `${shots}-dash.png` })
const layout = await page.evaluate(() => {
  const sc = [...document.querySelectorAll('*')]
    .filter((e) => e.scrollHeight > e.clientHeight + 4 && ['auto', 'scroll'].includes(getComputedStyle(e).overflowY))
    .map((e) => ({ cls: String(e.className).slice(0, 60), sh: e.scrollHeight, ch: e.clientHeight }))
  return {
    win: [innerWidth, innerHeight],
    docScroll: document.documentElement.scrollHeight,
    docClient: document.documentElement.clientHeight,
    scrollables: sc,
  }
})
log('dashboard layout:', JSON.stringify(layout))
const dText = await page.locator('body').innerText()
log('dashboard has 星盘 widgets:', ['MBTI 解码', '天赋解析', '运势'].every((k) => dText.includes(k)))

// ---------- Task 8: confirm modal ----------
await page.getByRole('button', { name: '重新开始' }).click()
await page.waitForTimeout(700)
await page.screenshot({ path: `${shots}-confirm.png` })
const cText = await page.locator('body').innerText()
log('confirm modal text present:', cText.includes('重新开始将清除您当前的所有星盘与答题数据'))
await page.getByRole('button', { name: '取消' }).click()
await page.waitForTimeout(500)

// ---------- Task 9: drawer ----------
await page.getByRole('button', { name: '何为星盘？' }).click()
await page.waitForTimeout(1200)
await page.screenshot({ path: `${shots}-drawer.png` })
const drText = await page.locator('body').innerText()
log('drawer has 怎样看这个星盘:', drText.includes('怎样看这个星盘'))
log('drawer has 三巨头解释:', drText.includes('你是谁') && drText.includes('别人怎么看你'))
const drBg = await page.evaluate(() => {
  const a = document.querySelector('aside')
  return a ? getComputedStyle(a).backgroundColor : 'none'
})
log('drawer bg (expect translucent white):', drBg)
await page.keyboard.press('Escape')
await page.waitForTimeout(700)

// ---------- Task 10: overlay panels ----------
await page.getByRole('button', { name: /MBTI 解码/ }).click()
await page.waitForTimeout(1200)
await page.screenshot({ path: `${shots}-overlay-mbti.png` })
log('mbti overlay open:', (await page.locator('body').innerText()).includes('和你同类型的他们'))
await page.keyboard.press('Escape')
await page.waitForTimeout(800)

await page.getByRole('button', { name: /天赋解析/ }).click()
await page.waitForTimeout(1200)
await page.screenshot({ path: `${shots}-overlay-talent.png` })
log('talent overlay open:', (await page.locator('body').innerText()).includes('天赋解析'))

// ---------- Task 10: fortune overlay (by exact title) ----------
await page.keyboard.press('Escape')
await page.waitForTimeout(800)
await page.locator('main button', { hasText: '运势' }).first().click()
await page.waitForTimeout(1500)
await page.screenshot({ path: `${shots}-overlay-fortune.png` })
const fText = await page.locator('body').innerText()
log('fortune overlay has all three:', ['年度运势', '月度运势', '今日运势'].every((k) => fText.includes(k)))

log('CONSOLE ERRORS:', errors.length ? errors.slice(0, 8) : 'none')
await browser.close()
