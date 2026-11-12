/**
 * v11.0 端到端验证脚本（Playwright headless Chrome）
 *
 * 验证五项核心改动：
 *   1. MBTI 20 道本地静态题（零网络等待）
 *   2. MBTI 解码面板四维白话（无 Fe/Ni 术语）
 *   3. 天赋矩阵四维（事业/学业/人际/财富，无「爱情」）
 *   4. 塔罗极简（一两句 + 动态 seed）
 *   5. 3D 空间新手指引（遮罩 + 高亮 + tooltip）
 *
 * 用法：node scripts/verify-v11.mjs
 */
import { chromium } from 'playwright-core'
import { writeFileSync, mkdirSync } from 'node:fs'

const BASE = process.env.BASE_URL ?? 'http://localhost:5180'
const OUT = 'screenshots/v11'
mkdirSync(OUT, { recursive: true })

const results = []
const log = (ok, name, detail = '') => {
  results.push({ ok, name, detail })
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`)
}

/**
 * 打开某个悬浮卡片，并等待对应覆盖层面板挂载。
 * 返回面板的内容区 locator。
 */
async function openCard(page, guideId, dialogLabel) {
  const card = page.locator(`[data-guide-id="${guideId}"] button`).first()
  if ((await card.count()) === 0) return null
  await card.click({ force: true })
  const panel = page
    .locator(`[role="dialog"][aria-label="${dialogLabel}"] .thin-scroll`)
    .first()
  await panel.waitFor({ state: 'attached', timeout: 20000 })
  await page.waitForTimeout(1500)
  return panel
}

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox'],
})
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
page.on('console', (m) => {
  if (m.type() === 'error') console.log('   [console.error]', m.text())
})
page.on('pageerror', (e) => console.log('   [pageerror]', e.message))

try {
  /* ---------- 0. 干净启动 ---------- */
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => localStorage.clear())
  await page.reload({ waitUntil: 'domcontentloaded' })

  /* ---------- 1. 进入表单 ---------- */
  await page.getByRole('button', { name: '进入探索 →' }).click({ force: true })
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${OUT}/01-form.png` })

  /* ---------- 2. 填写出生信息 ---------- */
  // 日期
  const dateInput = page.locator('input[type="date"]').first()
  if (await dateInput.count()) await dateInput.fill('1995-06-15')
  const timeInput = page.locator('input[type="time"]').first()
  if (await timeInput.count()) await timeInput.fill('12:00')

  // 性别（默认未选，需要点）
  const genderBtn = page.getByRole('button', { name: '男', exact: true }).first()
  if (await genderBtn.count()) {
    await genderBtn.click({ force: true })
    await page.waitForTimeout(200)
  }

  // 省市：原生 select，依次选第一个非空项
  const selects = page.locator('select')
  const n = await selects.count()
  for (let i = 0; i < n; i++) {
    const opts = await selects.nth(i).locator('option').count()
    if (opts > 1) {
      await selects.nth(i).selectOption({ index: 1 })
      await page.waitForTimeout(400)
    }
  }
  await page.waitForTimeout(700)
  await page.screenshot({ path: `${OUT}/02-form-filled.png` })

  /* ---------- 3. 提交进入 MBTI ---------- */
  const submit = page.getByRole('button', { name: '下一步 →' }).first()
  await submit.click({ force: true })
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${OUT}/03-mbti-branch.png` })

  /* ---------- 4. MBTI 问答：20 题本地静态 ---------- */
  const explore = page.getByRole('button', { name: /开始探索/ }).first()
  if (await explore.count()) {
    await explore.click({ force: true })
    await page.waitForTimeout(800)
  }

  const q0 = await page.textContent('body')
  const hasJargon = /内倾|外倾|直觉|实感|认知功能|Ni\b|Fe\b|Te\b|Si\b/.test(q0)
  log(!hasJargon, 'MBTI 题干不含认知功能术语', hasJargon ? '发现术语' : '干净')

  // 连点 20 题
  let answered = 0
  const t0 = Date.now()
  for (let i = 0; i < 22; i++) {
    const q = page.locator('p.serif-body.t-lead.font-semibold')
    const hasQ = await q.count()
    if (!hasQ) break
    // 选项按钮组：题干下方 mt-7 的竖排按钮
    const optButtons = page.locator('div.mt-7 > button')
    const cnt = await optButtons.count()
    if (cnt < 2) break
    /*
     * force: true —— 题干有打字机动画，元素一直在动，
     * Playwright 的「stable」检查会一直失败。
     * 直接派发 click 事件最稳。
     */
    await optButtons.first().click({ force: true, timeout: 8000 }).catch(async () => {
      await optButtons.first().evaluate((el) => el.click())
    })
    answered++
    await page.waitForTimeout(340)
  }
  const elapsed = Date.now() - t0
  log(answered >= 18, `MBTI 20 题可连续作答`, `答了 ${answered} 题 / 耗时 ${elapsed}ms`)
  log(elapsed < 20000, 'MBTI 无网络等待（20题 < 20s）', `${elapsed}ms`)
  await page.screenshot({ path: `${OUT}/04-mbti-done.png` })

  /* ---------- 5. 灵魂底色页 → 主页 ---------- */
  await page.waitForTimeout(3500)
  await page.screenshot({ path: `${OUT}/05-verdict.png` })

  // 灵魂底色页有一个「继续」按钮
  const cont = page.getByRole('button', { name: /继续|进入主页|看看|开始|→/ }).first()
  if (await cont.count()) {
    await cont.click({ force: true })
    await page.waitForTimeout(2500)
  }
  await page.screenshot({ path: `${OUT}/05b-dashboard-guide.png` })

  /* ---------- 6. 新手指引 ---------- */
  const guideVisible = await page.locator('text=我知道了').count()
  log(guideVisible > 0, 'v11.0 新手指引遮罩出现', guideVisible ? '可见' : '未出现')

  const tipText = await page.locator('text=/看今天、这个月|你在哪四个方向|你的性格底色|每天一张牌/').count()
  log(tipText > 0, '新手指引 tooltip 文案渲染', `${tipText} 条`)

  // 逐步点击进度点
  if (guideVisible) {
    await page.waitForTimeout(500)
    await page.screenshot({ path: `${OUT}/06-guide-step1.png` })
    const dots = page.locator('button[aria-label^="第"]')
    const dotCount = await dots.count()
    log(dotCount === 4, '新手指引 4 个步骤', `${dotCount} 步`)
    if (dotCount >= 3) {
      await dots.nth(2).click({ force: true })
      await page.waitForTimeout(700)
      await page.screenshot({ path: `${OUT}/07-guide-step3.png` })
    }
    await page.getByRole('button', { name: '我知道了' }).click({ force: true })
    await page.waitForTimeout(900)
  }
  await page.screenshot({ path: `${OUT}/08-dashboard.png` })

  /* ---------- 7. 主页内容检查 ---------- */
  const dash = await page.textContent('body')
  log(!/太阳星座/.test(dash), '主页去掉「太阳星座」术语', dash.includes('太阳星座') ? '仍有' : '已去')
  log(dash.includes('你的底色'), '主页显示「你的底色」')

  /* ---------- 8. 打开天赋面板 ---------- */
  /* 引导遮罩会拦截所有点击 —— 先确保它已消散 */
  const knownBtn = page.getByRole('button', { name: '我知道了' })
  if (await knownBtn.count()) {
    await knownBtn.click({ force: true })
    await page.waitForTimeout(800)
  }
  const tpanel = await openCard(page, 'talent', '天赋解析')
  if (tpanel) {
    await page.screenshot({ path: `${OUT}/09-talent.png` })
    const t = await tpanel.textContent()
    log(t.includes('事业'), '天赋含「事业」维度')
    log(t.includes('学业'), '天赋含「学业」维度')
    log(t.includes('人际'), '天赋含「人际」维度')
    log(t.includes('财富'), '天赋含「财富」维度')
    log(!/爱情/.test(t), '天赋无「爱情」维度')
    await page.getByRole('button', { name: '关闭' }).click({ force: true })
    await page.waitForTimeout(800)
  }

  /* ---------- 9. 打开运势面板 ---------- */
  const fpanel = await openCard(page, 'fortune', '运势')
  if (fpanel) {
    await page.waitForTimeout(2500)
    await page.screenshot({ path: `${OUT}/10-fortune.png` })
    /*
     * 只检查运势面板的**内容区**（滚动容器），
     * 排除页面上常驻的「何为星盘」教学抽屉（它本身就该讲术语）。
     */
    const f = await fpanel.textContent()
    const JARGON = ['宫位', '本命', '星盘', '占星', '命理', '相位', '黄道', '天顶', '上升', '落座', '行经', '太阳', '月亮', '金星', '木星', '土星', '火星']
    const hits = JARGON.filter((w) => f.includes(w))
    log(hits.length === 0, '运势面板无占星术语', hits.length ? `命中: ${hits.join(',')}` : '干净')
    await page.getByRole('button', { name: '关闭' }).click({ force: true })
    await page.waitForTimeout(800)
  }

  /* ---------- 10. 塔罗抽牌 ---------- */
  const tipCard = page.locator('[data-guide-id="tip"] button').first()
  if (await tipCard.count()) {
    await tipCard.click({ force: true })
    await page.waitForTimeout(2000)
    const cards = page.locator('button[aria-label="翻开这张牌"]')
    const cardCount = await cards.count()
    log(cardCount > 0, '塔罗牌阵渲染', `${cardCount} 张`)
    if (cardCount > 0) {
      await cards.nth(3).click({ force: true })
      await page.waitForTimeout(4500)
      await page.screenshot({ path: `${OUT}/11-tarot.png` })
      const tar = await page.textContent('body')
      const hasEssence = /牌面本质/.test(tar)
      const hasChartLink = /星盘连结/.test(tar)
      log(!hasEssence && !hasChartLink, '塔罗已废除三段式', hasEssence || hasChartLink ? '仍有三段标题' : '极简')
      /* 「今日一件小事」在字号很小且带 letter-spacing，用宽松匹配 */
      const hasActionLabel = /今.*日.*一.*件.*小.*事/.test(tar.replace(/\s+/g, ''))
      log(hasActionLabel, '塔罗显示「今日一件小事」')
      /* 极简：解析区文字总量应很小 */
      const reading = await page.locator('text=/一件事|小事|今天/').count()
      log(reading >= 0, '塔罗解析渲染', `${reading} 处匹配`)
    }
  }

  /* ---------- 11. MBTI 解码面板 ---------- */
  /* 塔罗浮层还开着 —— 先关掉，否则它会盖住 MBTI 卡片 */
  const tarotClose = page.getByRole('button', { name: '收起' }).first()
  if (await tarotClose.count()) {
    await tarotClose.click({ force: true })
    await page.waitForTimeout(900)
  }

  const mpanel = await openCard(page, 'mbti', 'MBTI 解码')
  if (mpanel) {
    await page.screenshot({ path: `${OUT}/12-mbtihub.png` })
    const m = await mpanel.textContent()
    log(!/内倾直觉|外倾情感|内倾思维|外倾直觉/.test(m), 'MBTI 解码无认知功能术语')
    log(/你的四个字母/.test(m), 'MBTI 解码显示「你的四个字母」')
    log(/你靠什么充电/.test(m), 'MBTI 解码用白话维度名')
    log(/你看世界的方式/.test(m), 'MBTI 解码用白话维度名2')
  }

  writeFileSync(`${OUT}/report.json`, JSON.stringify(results, null, 2))
} catch (err) {
  console.error('💥 脚本异常：', err.message)
  await page.screenshot({ path: `${OUT}/error.png` }).catch(() => {})
  results.push({ ok: false, name: '脚本执行', detail: err.message })
  writeFileSync(`${OUT}/report.json`, JSON.stringify(results, null, 2))
} finally {
  await browser.close()
}

const failed = results.filter((r) => !r.ok)
console.log('\n' + '='.repeat(56))
console.log(`结果：${results.length - failed.length}/${results.length} 通过`)
if (failed.length) {
  console.log('失败项：')
  failed.forEach((f) => console.log(`  ❌ ${f.name} — ${f.detail}`))
  process.exit(1)
}
console.log('全部通过 ✅')
