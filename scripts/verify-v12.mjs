/**
 * v12.0 端到端验证脚本
 *
 * 验证三件事：
 *   1. 任务 1 · 天赋矩阵数据穿模修复
 *      —— 四个领域的 title / subtitle / quote / description 必须**互不相同**
 *   2. 任务 2 · CSS Grid 2×2 矩阵排版
 *      —— grid-template-columns 为两列，同排卡片高度一致
 *   3. 任务 3 · 静态语料库引接
 *      —— 每个领域都带人类先哲原句 + 出处，且原文一字不改
 *
 * 用法：node scripts/verify-v12.mjs
 */
import { chromium } from 'playwright-core'
import { writeFileSync, mkdirSync } from 'node:fs'

const BASE = process.env.BASE_URL ?? 'http://localhost:5180'
const OUT = 'screenshots/v12'
mkdirSync(OUT, { recursive: true })

const results = []
const log = (ok, name, detail = '') => {
  results.push({ ok, name, detail })
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox'],
})
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
page.on('pageerror', (e) => console.log('   [pageerror]', e.message))

try {
  /* ---------- 注入一份带星盘的存档，直接进主页 ---------- */
  /*
   * Vite 冷启动 / HMR 期间首个请求偶尔很慢 —— 重试一次。
   */
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.evaluate(() => localStorage.clear())

  const chart = await page.evaluate(async () => {
    const mod = await import('/src/lib/chart.ts')
    const eph = await fetch('/api/chart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: '1995-06-15',
        time: '12:00',
        latitude: 30.2741,
        longitude: 120.1551,
        timezone: 8,
      }),
    }).then((r) => r.json())
    return mod.chartFromEphemeris(eph, null, true)
  })

  await page.evaluate((c) => {
    /*
     * 账号 ID 必须显式写入并保持一致 ——
     * 存档是按 `profile:${accountId}` 存的，
     * 如果注入用的 id 跟 App 启动时生成的不一致，页面就会当成新用户。
     */
    const acc = 'acc_v12_test'
    localStorage.setItem('talent-identifier:account', acc)
    localStorage.setItem('talent-identifier:accounts', JSON.stringify([acc]))
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
        mbti: { type: 'INTJ' },
        chart: c,
        days: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    )
  }, chart)

  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(3000)

  /* 关掉新手引导 */
  const known = page.getByRole('button', { name: '我知道了' })
  if (await known.count()) {
    await known.first().click({ force: true })
    await page.waitForTimeout(900)
  }

  /* ---------- 打开天赋解析面板 ---------- */
  const talentCard = page.locator('[data-guide-id="talent"] button').first()
  if (!(await talentCard.count())) {
    log(false, '找到天赋解析入口卡片')
    throw new Error('未找到天赋卡片')
  }
  await talentCard.click({ force: true })
  const panel = page
    .locator('[role="dialog"][aria-label="天赋解析"] .thin-scroll')
    .first()
  await panel.waitFor({ state: 'attached', timeout: 20000 })
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${OUT}/01-talent.png` })

  /* ============================================================
   *  任务 2 · 2×2 CSS Grid
   * ============================================================ */
  const grid = await page.evaluate(() => {
    const g = document.querySelector('[data-talent-grid]')
    if (!g) return null
    const cs = getComputedStyle(g)
    const cards = [...g.querySelectorAll('[data-talent-card]')]
    return {
      display: cs.display,
      cols: cs.gridTemplateColumns,
      autoRows: cs.gridAutoRows,
      gap: cs.gap,
      count: cards.length,
      keys: cards.map((c) => c.getAttribute('data-talent-card')),
      rects: cards.map((c) => {
        const r = c.getBoundingClientRect()
        return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
      }),
    }
  })

  log(!!grid, '天赋矩阵渲染出网格')
  if (grid) {
    log(grid.count === 4, '四个领域卡片齐全', `${grid.count} 张`)
    const colCount = grid.cols.split(' ').filter(Boolean).length
    log(colCount === 2, 'grid-template-columns 为两列', grid.cols)
    log(grid.display === 'grid', 'display: grid', grid.display)

    /* 两行两列 —— 按 y 坐标聚类 */
    const rows = [...new Set(grid.rects.map((r) => r.y))]
    log(rows.length === 2, '排版为 2 行', `y = ${rows.join(', ')}`)

    /* 同排高度一致 */
    const rowA = grid.rects.filter((r) => r.y === rows[0])
    const rowB = grid.rects.filter((r) => r.y === rows[1])
    const sameA = new Set(rowA.map((r) => r.h)).size === 1
    const sameB = new Set(rowB.map((r) => r.h)).size === 1
    log(sameA, '第一排两张卡高度一致', rowA.map((r) => r.h).join(' / '))
    log(sameB, '第二排两张卡高度一致', rowB.map((r) => r.h).join(' / '))

    /* 同排左对齐、右对齐 */
    const sameX = new Set(grid.rects.map((r) => r.x)).size === 2
    log(sameX, '两列对齐', `x = ${[...new Set(grid.rects.map((r) => r.x))].join(', ')}`)
  }

  /* ============================================================
   *  任务 1 · 数据穿模修复
   * ============================================================ */
  const cards = await page.evaluate(() => {
    const out = []
    for (const el of document.querySelectorAll('[data-talent-card]')) {
      const q = el.querySelector('blockquote')
      const fig = el.querySelector('figcaption')
      const ps = [...el.querySelectorAll('p')].map((p) => p.textContent.trim())
      out.push({
        key: el.getAttribute('data-talent-card'),
        h4: el.querySelector('h4')?.textContent.trim() ?? '',
        /* 副标题 —— 角色定义 */
        subtitle: el.querySelector('[data-talent-subtitle]')?.textContent.trim() ?? '',
        description:
          el.querySelector('[data-talent-description]')?.textContent.trim() ?? '',
        quote: q?.textContent.replace(/[「」]/g, '').trim() ?? '',
        source: fig?.textContent.replace(/^——\s*/, '').trim() ?? '',
        texts: ps,
      })
    }
    return out
  })

  log(cards.length === 4, '读取到四个卡片', `${cards.length} 张`)

  /* 每个领域的副标题必须不同 */
  const subtitles = cards.map((c) => c.subtitle)
  const uniqSubtitles = new Set(subtitles)
  log(
    uniqSubtitles.size === 4 && subtitles.every(Boolean),
    '四个副标题互不相同（无数据穿模）',
    subtitles.join(' / '),
  )

  /* 每个领域的专属解析必须不同 —— 这正是「数据穿模」的症状 */
  const descriptions = cards.map((c) => c.description)
  log(
    new Set(descriptions).size === 4 && descriptions.every((d) => d.length > 8),
    '四段专属解析互不相同',
    descriptions.map((d) => d.slice(0, 12)).join(' / '),
  )

  /* 每个领域的引言/原句必须不同 */
  const quotes = cards.map((c) => c.quote)
  log(
    new Set(quotes).size === 4 && quotes.every(Boolean),
    '四段原句互不相同',
    quotes.map((q) => q.slice(0, 10)).join(' / '),
  )

  /* 每个领域的天赋名必须不同 */
  const titles = cards.map((c) => c.h4)
  log(
    new Set(titles).size === 4 && titles.every(Boolean),
    '四个天赋名互不相同',
    titles.join(' / '),
  )

  /* 出处必须存在 */
  log(
    cards.every((c) => c.source && c.source.length > 2),
    '每张卡都标注了原句出处',
    cards.map((c) => c.source).join(' / '),
  )

  /* 领域 key 必须是那四个 */
  const keys = cards.map((c) => c.key).sort()
  log(
    JSON.stringify(keys) ===
      JSON.stringify(['academic', 'career', 'interpersonal', 'wealth']),
    '四个领域 key 正确',
    keys.join(', '),
  )

  /* ============================================================
   *  任务 3 · 语料库引接
   * ============================================================ */
  const corpus = await page.evaluate(async () => {
    const mod = await import('/src/lib/corpus.ts')
    const raw = await fetch('/src/data/archetypes_corpus.json').then((r) => r.json())
    return {
      domains: Object.keys(raw.domains),
      order: mod.CORPUS_ORDER,
      labels: mod.CORPUS_LABEL,
      passages: Object.fromEntries(
        Object.entries(raw.domains).map(([k, v]) => [k, v.passages.length]),
      ),
      classics: Object.keys(raw.classics ?? {}).length,
      mbti: Object.keys(raw.mbti ?? {}).length,
    }
  })
  log(
    JSON.stringify(corpus.order) ===
      JSON.stringify(['career', 'academic', 'interpersonal', 'wealth']),
    '语料库四个分区与前端顺序一致',
    corpus.order.join(', '),
  )
  log(
    Object.values(corpus.passages).every((n) => n >= 6),
    '每个分区都有足够的原句',
    JSON.stringify(corpus.passages),
  )
  log(corpus.classics >= 6, '经典文本分组就绪', `${corpus.classics} 组`)
  log(corpus.mbti >= 16, 'MBTI 原生释义就绪', `${corpus.mbti} 条`)

  /* 卡片上的原句必须能在语料库里找到 —— 一字不改 */
  const quoteFound = await page.evaluate(async (quotes) => {
    const raw = await fetch('/src/data/archetypes_corpus.json').then((r) => r.json())
    const pool = Object.values(raw.domains).flatMap((d) => d.passages.map((p) => p.text))
    return quotes.map((q) => pool.includes(q))
  }, quotes)
  log(
    quoteFound.every(Boolean),
    '卡片原句与语料库逐字一致',
    quoteFound.join(', '),
  )

  /* 不该出现占星术语 */
  const allText = cards.map((c) => c.texts.join(' ')).join(' ')
  const JARGON = ['双子', '天蝎', '摩羯', '宫位', '星盘', '上升点', '逆行']
  const hits = JARGON.filter((w) => allText.includes(w))
  log(hits.length === 0, '天赋面板无占星术语', hits.length ? hits.join(',') : '干净')

  /* ---------- 窄屏单列 ---------- */
  await page.setViewportSize({ width: 420, height: 900 })
  await page.waitForTimeout(700)
  const mobile = await page.evaluate(() => {
    const g = document.querySelector('[data-talent-grid]')
    const cs = getComputedStyle(g)
    return {
      cols: cs.gridTemplateColumns.split(' ').filter(Boolean).length,
      rows: new Set(
        [...g.querySelectorAll('[data-talent-card]')].map(
          (c) => Math.round(c.getBoundingClientRect().y),
        ),
      ).size,
    }
  })
  log(mobile.cols === 1 && mobile.rows === 4, '窄屏退化为单列 4 行', `col=${mobile.cols} row=${mobile.rows}`)
  await page.screenshot({ path: `${OUT}/02-mobile.png` })

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
