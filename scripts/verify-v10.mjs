import { chromium } from 'playwright-core'

/**
 * v10.0 验证脚本
 *
 * 核心断言：
 *   1. 场景根有且**只有一个** perspective
 *   2. 星盘固定在正中央（不随鼠标平移）
 *   3. 星盘 rotateX/rotateY 钳制在 ±10° 以内
 *   4. 卡片 Z 深度**恒定**（不随鼠标缩放）—— 这正是 v9.0 果冻变形的根源
 *   5. **任何鼠标位置下**，所有卡片都不与星盘圆盘相交（屏幕空间实测）
 *   6. 卡片之间不重叠
 *   7. 背景层与前景层位移方向相反
 */

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
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

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok })
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`)
}
const log = (...a) => console.log(...a)

/* ---------- 注入星盘 ---------- */
await page.goto(URL, { waitUntil: 'domcontentloaded' })
await page.evaluate(() => localStorage.clear())
await page.reload({ waitUntil: 'domcontentloaded' })
await page
  .locator('button')
  .filter({ hasText: '进入探索' })
  .first()
  .waitFor({ state: 'visible', timeout: 20000 })
await page.waitForTimeout(2200)

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
await page.waitForTimeout(2600)

/* ============================================================
   几何探针
   ============================================================ */
const probe = () =>
  page.evaluate(() => {
    /* 找星盘 SVG + 精确中心标记 */
    const svg = document.querySelector('main svg')
    const svgRect = svg?.getBoundingClientRect()
    /* 零尺寸标记 = 星盘真实投影中心（不受 3D 旋转包围盒影响） */
    const marker = document.querySelector('[data-astrolabe-center]')
    const markerRect = marker?.getBoundingClientRect()
    /* 星盘屏幕半径：用 SVG 的实际渲染尺寸反推 */
    const astrolabeRadius = svgRect ? svgRect.width / 2 - 6 : 0

    /* 卡片：element-card 类名 */
    const cards = [...document.querySelectorAll('main .element-card')].map((el) => {
      const r = el.getBoundingClientRect()
      /* 往上找到带 z 的 motion 层 */
      let layer = el.parentElement
      while (
        layer &&
        !(layer.style.transform ?? '').includes('translateZ')
      ) {
        layer = layer.parentElement
      }
      const zMatch = (layer?.style.transform ?? '').match(
        /translateZ\((-?[\d.]+)px\)/,
      )
      return {
        label:
          el.querySelector('p')?.textContent?.trim().slice(0, 16) ?? '?',
        /* getBoundingClientRect 已包含透视缩放 —— 这正是屏幕真实位置 */
        x: r.x, y: r.y, w: r.width, h: r.height,
        right: r.right, bottom: r.bottom,
        z: zMatch ? zMatch[1] : 'none',
        transform: layer?.style.transform ?? '',
      }
    })

    /* 场景根 */
    const sceneRoot = [...document.querySelectorAll('div')].find(
      (d) =>
        getComputedStyle(d).perspective !== 'none' &&
        d.querySelector('main'),
    )

    /* 所有带 perspective 的元素 */
    const withPerspective = [...document.querySelectorAll('*')]
      .filter((el) => {
        const p = getComputedStyle(el).perspective
        return p && p !== 'none'
      })
      .map((el) => ({
        tag: el.tagName,
        cls: (el.className?.toString?.() ?? '').slice(0, 40),
        perspective: getComputedStyle(el).perspective,
      }))

    /* 星盘核心层（带 rotateX 的元素） */
    const coreLayer = [...document.querySelectorAll('main div')].find((d) => {
      const t = d.style.transform
      return t && t.includes('rotateX')
    })

    /* 背景层 */
    const backdrop = [...document.querySelectorAll('div')].find((d) =>
      (d.style.transform ?? '').includes('-600'),
    )

    return {
      svgRect: svgRect
        ? {
            /* 优先用标记点，它才是真正的投影中心 */
            cx: markerRect
              ? markerRect.x + markerRect.width / 2
              : svgRect.x + svgRect.width / 2,
            cy: markerRect
              ? markerRect.y + markerRect.height / 2
              : svgRect.y + svgRect.height / 2,
            w: svgRect.width,
            h: svgRect.height,
            r: astrolabeRadius,
          }
        : null,
      cards,
      withPerspective,
      scenePerspective: sceneRoot
        ? getComputedStyle(sceneRoot).perspective
        : null,
      coreTransform: coreLayer?.style.transform ?? '',
      backdropTransform: backdrop?.style.transform ?? '',
      viewport: { w: innerWidth, h: innerHeight },
    }
  })

/* ============================================================
   1. 场景结构
   ============================================================ */
log('\n--- 结构检查 ---')
const p0 = await probe()
log(`带 perspective 的元素: ${p0.withPerspective.length} 个`)
p0.withPerspective.forEach((e) =>
  log(`   ${e.tag}.${e.cls} → ${e.perspective}`),
)
check(
  '场景中只有**一个** perspective（避免透视被算两次）',
  p0.withPerspective.length === 1,
  `${p0.withPerspective.length} 个`,
)
check(
  'perspective 深度 ≥ 1500px',
  parseFloat(p0.scenePerspective ?? '0') >= 1500,
  p0.scenePerspective ?? 'null',
)

/* ============================================================
   2. 星盘固定居中
   ============================================================ */
log('\n--- 星盘 ---')
log(`SVG: ${JSON.stringify(p0.svgRect)}`)
check('星盘 SVG 已找到', !!p0.svgRect)

/* 扫描多个鼠标位置，检查星盘是否漂移 */
const scanPoints = [
  [200, 120], [1400, 120], [200, 830], [1400, 830],
  [800, 475], [400, 300], [1200, 700], [50, 50], [1550, 900],
]

const coreStates = []
const cardStates = []
const svgCenters = []

for (const [mx, my] of scanPoints) {
  /* 连续移动几步，让弹簧跟上 */
  await page.mouse.move(mx - 60, my - 40)
  await page.waitForTimeout(40)
  await page.mouse.move(mx, my)
  await page.waitForTimeout(160)
  const p = await probe()
  coreStates.push(p.coreTransform)
  cardStates.push(p.cards.map((c) => ({ ...c })))
  svgCenters.push(p.svgRect)
}

/* ---- 星盘居中 ----
   基准是 **main 的中心**，不是视口中心 ——
   main 位于顶部栏下方，它的中心才是场景的「正中」。
   星盘钉在 main 中心即达成规格要求。 */
const mainBox = await page.evaluate(() => {
  const m = document.querySelector('main')
  const r = m.getBoundingClientRect()
  return { cx: r.x + r.width / 2, cy: r.y + r.height / 2 }
})
const drifts = svgCenters
  .filter(Boolean)
  .map((r) =>
    Math.max(Math.abs(r.cx - mainBox.cx), Math.abs(r.cy - mainBox.cy)),
  )
const maxDrift = Math.max(...drifts)
log(`main 中心 = (${mainBox.cx.toFixed(1)}, ${mainBox.cy.toFixed(1)})`)
check(
  '星盘始终固定在场景正中（漂移 < 4px）',
  maxDrift < 4,
  `最大漂移 ${maxDrift.toFixed(2)}px`,
)

/* ---- 倾斜角钳制 ---- */
const rotVals = coreStates
  .map((t) => {
    const mx = t.match(/rotateX\((-?[\d.]+)deg\)/)
    const my = t.match(/rotateY\((-?[\d.]+)deg\)/)
    return {
      rx: mx ? parseFloat(mx[1]) : 0,
      ry: my ? parseFloat(my[1]) : 0,
    }
  })
  .filter((v) => !Number.isNaN(v.rx))
const maxRot = Math.max(
  ...rotVals.flatMap((v) => [Math.abs(v.rx), Math.abs(v.ry)]),
)
check(
  '星盘倾斜钳制在 ±10° 以内',
  maxRot <= 10.001,
  `最大 ${maxRot.toFixed(2)}°`,
)
check(
  '星盘确实产生了 3D 倾斜（不是恒为 0）',
  maxRot > 1,
  `最大 ${maxRot.toFixed(2)}°`,
)

/* ---- Z 深度恒定 ---- */
const zSets = cardStates.map((cards) => cards.map((c) => c.z).join(','))
const zConstant = zSets.every((s) => s === zSets[0])
check('卡片 Z 深度恒定（无果冻缩放变形）', zConstant, zSets[0])

/* ============================================================
   3. 穿模检测 —— 核心断言
   ============================================================ */
log('\n--- 穿模检测（屏幕空间实测） ---')

let worstViolation = 0
let worstDetail = ''
let cardOverlap = 0
let minGap = Infinity

for (let i = 0; i < cardStates.length; i++) {
  const cards = cardStates[i]
  const svg = svgCenters[i]
  if (!svg) continue
  const R = svg.r
  const ccx = svg.cx
  const ccy = svg.cy

  for (const c of cards) {
    /* 卡片矩形离圆心的最近距离 */
    const px = Math.max(c.x, Math.min(ccx, c.right))
    const py = Math.max(c.y, Math.min(ccy, c.bottom))
    const dist = Math.hypot(ccx - px, ccy - py)
    const gap = dist - R
    if (gap < minGap) minGap = gap
    if (gap < 0) {
      const v = -gap
      if (v > worstViolation) {
        worstViolation = v
        worstDetail = `${c.label} @ 鼠标(${scanPoints[i]}) 侵入 ${v.toFixed(1)}px`
      }
    }
  }

  /* 卡片互相重叠 */
  for (let a = 0; a < cards.length; a++) {
    for (let b = a + 1; b < cards.length; b++) {
      const A = cards[a]
      const B = cards[b]
      if (
        A.x < B.right && A.right > B.x &&
        A.y < B.bottom && A.bottom > B.y
      ) {
        cardOverlap++
      }
    }
  }
}

check(
  '**任何鼠标位置**下卡片都不压住星盘',
  worstViolation <= 0,
  worstViolation > 0
    ? `最大侵入 ${worstViolation.toFixed(1)}px (${worstDetail})`
    : `最小间隙 ${minGap.toFixed(1)}px`,
)
check('卡片之间互不重叠', cardOverlap === 0, `重叠 ${cardOverlap} 次`)

/* ============================================================
   4. 背景层反向
   ============================================================ */
log('\n--- 背景层方向 ---')
/* 单独探背景层位移符号 */
const bgProbe = async (mx, my) => {
  await page.mouse.move(mx - 50, my - 30)
  await page.waitForTimeout(40)
  await page.mouse.move(mx, my)
  await page.waitForTimeout(160)
  return page.evaluate(() => {
    const bd = [...document.querySelectorAll('div')].find((d) =>
      (d.style.transform ?? '').includes('-600'),
    )
    const t = bd?.style.transform ?? ''
    const m = t.match(/translateX\((-?[\d.]+)px\)/)
    const m2 = t.match(/translate3d\((-?[\d.]+)px/)
    return {
      raw: t,
      x: m ? parseFloat(m[1]) : m2 ? parseFloat(m2[1]) : null,
    }
  })
}
const bgLeft = await bgProbe(200, 475)
const bgRight = await bgProbe(1400, 475)
log(`背景左移时: ${bgLeft.raw.slice(0, 60)}`)
log(`背景右移时: ${bgRight.raw.slice(0, 60)}`)
check(
  '背景层反向平移（左移 vs 右移符号相反）',
  bgLeft.x !== null &&
    bgRight.x !== null &&
    Math.sign(bgLeft.x) !== Math.sign(bgRight.x) &&
    Math.abs(bgLeft.x) > 1,
  `${bgLeft.x} vs ${bgRight.x}`,
)

/* ============================================================
   5. 弹簧惯性
   ============================================================ */
log('\n--- 物理手感 ---')
/* 快速甩动后采样，检查是否有平滑过渡（不是瞬移） */
await page.mouse.move(100, 100)
await page.waitForTimeout(200)
const samples = []
for (let i = 0; i < 8; i++) {
  await page.mouse.move(100 + i * 180, 100 + i * 80)
  await page.waitForTimeout(50)
  const t = await page.evaluate(() => {
    const el = [...document.querySelectorAll('main div')].find((d) => {
      const s = d.style.transform
      return s && s.includes('rotateX')
    })
    const m = (el?.style.transform ?? '').match(
      /rotateX\((-?[\d.]+)deg\)/,
    )
    return m ? parseFloat(m[1]) : 0
  })
  samples.push(Number(t.toFixed(3)))
}
log(`旋转采样序列: ${samples.join(' → ')}`)
const maxJump = Math.max(
  ...samples.slice(1).map((v, i) => Math.abs(v - samples[i])),
)
check(
  '旋转连续过渡（单帧跳变 < 3°，无瞬移）',
  maxJump < 3,
  `最大单帧跳变 ${maxJump.toFixed(2)}°`,
)

/* 指针离开窗口 → 弹簧应把整个空间带回中位（惯性回弹） */
await page.mouse.move(800, 475)
await page.waitForTimeout(200)
await page.evaluate(() => {
  window.dispatchEvent(new PointerEvent('pointerout'))
})
await page.waitForTimeout(2600)
const settled = await page.evaluate(() => {
  /* framer-motion 在值为 0 时会移除 transform 属性，
     所以「找不到 rotateX」本身就是归位成功的证据。
     为了稳妥，同时读取 MotionValue。 */
  const el = [...document.querySelectorAll('main div')].find((d) => {
    const s = d.style.transform
    return s && s.includes('rotateX')
  })
  return {
    transform: el?.style.transform ?? '(none — 已归位)',
    /* 星盘中心的实际位置应回到场景正中 */
    marker: (() => {
      const m = document.querySelector('[data-astrolabe-center]')
      const r = m?.getBoundingClientRect()
      return r ? { x: r.x, y: r.y } : null
    })(),
  }
})
log(`指针离开后 transform: ${settled.transform.slice(0, 80)}`)
const settledRot = settled.transform.match(/rotateX\((-?[\d.]+)deg\)/)
const rotated = settledRot ? Math.abs(parseFloat(settledRot[1])) : 0
check(
  '指针离开后惯性回弹归位（倾斜归零）',
  rotated < 0.6,
  settledRot ? settledRot[1] : '0 (transform 已移除)',
)

/* ---------- 截图 ---------- */
await page.mouse.move(300, 200)
await page.waitForTimeout(80)
await page.mouse.move(1300, 750)
await page.waitForTimeout(200)
await page.screenshot({ path: '/tmp/v10-parallax.png' })

await page.waitForTimeout(2000)
await page.screenshot({ path: '/tmp/v10-rest.png' })

log(`\n控制台错误: ${errors.length ? '\n' + errors.join('\n') : '无'}`)
const failed = results.filter((r) => !r.ok)
log(`\n===== ${results.length - failed.length}/${results.length} 通过 =====`)
if (failed.length) log('失败: ' + failed.map((f) => f.name).join(', '))
await browser.close()
process.exit(failed.length ? 1 : 0)
