/* ============================================================
 *  3D 场景布局求解器（v10.0）
 *
 *  ------------------------------------------------------------
 *  【v9.0 穿模的根因】
 *
 *  v9.0 的求解器在**2D 平面**上把卡片贴到星盘圆弧上：
 *
 *      innerOffset = sqrt(R² - dy²)
 *
 *  但卡片同时带着 `translateZ(118px)`。
 *  在 `perspective: 1500px` 下，Z=118 的元素会被**放大**：
 *
 *      k = perspective / (perspective - z) = 1500 / 1382 ≈ 1.085
 *
 *  也就是说：布局按 264px 摆位，实际渲染出来是 **286px**。
 *  多出来的 22px 精准地压进了星盘圆盘 —— 这就是「严重穿模」。
 *
 *  【v10.0 的解法】
 *
 *  1. **在屏幕空间求解** —— 先算出卡片最终**应该看起来**多大、多宽，
 *     全部用屏幕像素思考。
 *  2. **最后再反投影** —— 由屏幕坐标反推 2D 布局坐标：
 *
 *      layout.left = ccx + (screen.x - ccx) / k
 *      layout.width = screen.w / k
 *
 *     这样透视放大被精确抵消，卡片落到星盘边界外就是真的在边界外。
 *
 *  3. **切向公转** —— 卡片的视差位移沿**切线**方向（垂直于半径）。
 *     切线方向移动只会让卡片**离圆心更远**，
 *     所以结构上不可能侵入星盘。
 * ============================================================ */

/** 场景透视深度（px）—— 与 ParallaxSpace 保持一致 */
export const SCENE_PERSPECTIVE = 1500

/**
 * 星盘最大倾斜角（度）—— 与 ParallaxSpace 的 CORE_TILT 一致。
 */
export const CORE_TILT = 8

/**
 * 安全间隙（屏幕像素）。
 *
 * 需要吸收**四类**残余位移：
 *   1. 卡片自身的浮动呼吸（±FLOAT_AMPLITUDE，垂直）
 *   2. 视差切向公转（±ORBIT_AMPLITUDE，沿切线）
 *   3. 卡片透视放大后向外扩出（z 越大越明显）
 *   4. **星盘倾斜后的椭圆投影涨大** —— ±8° 倾斜让竖直方向
 *      半径从 r 涨到 r / cos(8°) ≈ r × 1.0096
 *
 * 第 4 项常被忽略，却是最后几像素侵入的真凶。
 */
export const SAFE_CLEARANCE = 34

/** 卡片浮动呼吸幅度（px） */
export const FLOAT_AMPLITUDE = 8

/** 视差公转幅度（px） */
export const ORBIT_AMPLITUDE = 14

export interface SceneCardSpec {
  id: string
  /** 屏幕空间宽度（px） */
  w: number
  /** 屏幕空间高度（px） */
  h: number
  /** 所属侧：-1 左，+1 右 */
  side: -1 | 1
  /** 垂直锚点：卡片中心的归一化高度（0 顶 → 1 底） */
  vy: number
  /** 垂直错落偏移（px） */
  yJitter: number
  /** Z 深度（px） */
  z: number
  /** 相对中心的方位角（度）：0 = 正右，180 = 正左 */
  angle: number
  /** 浮动周期（秒） */
  floatDur: number
  /** 浮动延迟（秒） */
  floatDelay: number
  /** 静止微倾角（度） */
  tilt: number
}

export interface PlacedCard {
  id: string
  /** 屏幕空间矩形（求解结果） */
  screen: { x: number; y: number; w: number; h: number }
  /** 2D 布局矩形（反投影后，直接用于定位） */
  layout: { left: number; top: number; width: number; height: number }
  /** 透视放大系数 */
  k: number
}

/**
 * 透视放大系数。
 * z=0 → 1；z 越大 → 越大。
 */
export function perspectiveScale(z: number, p = SCENE_PERSPECTIVE): number {
  return p / Math.max(1, p - z)
}

/**
 * 星盘实心圆半径（屏幕像素）。
 * 与 Astrolabe 的 rOuter = size/2 - 6 保持一致。
 */
export function astrolabeRadius(size: number): number {
  return Math.max(24, size * 0.5 - 6)
}

/**
 * 星盘**外标注带**宽度（屏幕像素）。
 *
 * Astrolabe 的元素锚点刻度画在 rOuter + size*0.062 处，
 * 所以真正需要留空的是 rOuter 之外这一圈。
 */
export function astrolabeLabelBand(size: number): number {
  return size * 0.062
}

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/**
 * 矩形与圆是否相交（矩形完全在圆外才算安全）。
 */
function rectHitsCircle(r: Rect, ccx: number, ccy: number, radius: number) {
  const px = Math.max(r.x, Math.min(ccx, r.x + r.w))
  const py = Math.max(r.y, Math.min(ccy, r.y + r.h))
  return Math.hypot(ccx - px, ccy - py) < radius
}

/** 两个矩形是否重叠 */
function rectsOverlap(a: Rect, b: Rect) {
  return (
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
  )
}

export interface SceneLayout {
  /** 星盘尺寸（px） */
  astrolabeSize: number
  /** 卡片落位 */
  cards: PlacedCard[]
}

/**
 * 求解整个 3D 场景的布局。
 *
 * 全部在**屏幕空间**完成，最后统一反投影到 2D 布局坐标。
 */
export function solveScene(
  W: number,
  H: number,
  specs: SceneCardSpec[],
  p = SCENE_PERSPECTIVE,
): SceneLayout {
  const ccx = W / 2
  const ccy = H / 2

  /**
   * 星盘倾斜后的**最大**屏幕半径。
   *
   * 星盘绕自身中心倾斜 θ 后，投影是椭圆：
   *   · 竖直方向半径 = r / cos(θ)
   *   · 水平方向半径 = r（不变）
   *
   * 取竖直方向（更大的那个）作为禁入半径，
   * 这样无论鼠标在哪个方向倾斜，卡片都不会蹭到星盘。
   */
  const tiltedRadius = (size: number) =>
    astrolabeRadius(size) / Math.cos((CORE_TILT * Math.PI) / 180)

  /** 把一组卡片按给定星盘尺寸摆到屏幕上 */
  const placeOnScreen = (size: number): Rect[] => {
    /* 星盘的"禁入半径"：实心圆（按倾斜后最坏情况放大）+ 外标注带 */
    const rSolid = tiltedRadius(size)
    const rKeep = rSolid + astrolabeLabelBand(size)

    return specs.map((s) => {
      /* 卡片纵向中心 → 顶部 */
      const cardCy = s.vy * H + s.yJitter
      const y = cardCy - s.h / 2

      /* dyMin：卡片纵向范围离圆心最近的那条边 */
      const dyMin = Math.max(
        0,
        Math.min(Math.abs(y - ccy), Math.abs(y + s.h - ccy)),
      )

      /* 内边缘竖线 ↔ 圆弧的水平切距 */
      const dx =
        dyMin >= rKeep ? 0 : Math.sqrt(Math.max(0, rKeep * rKeep - dyMin * dyMin))

      /* 加上安全间隙 */
      const innerOffset = dx + SAFE_CLEARANCE

      const x = s.side < 0 ? ccx - innerOffset - s.w : ccx + innerOffset
      return { x, y, w: s.w, h: s.h }
    })
  }

  /**
   * 真实透视投影：把「屏幕矩形」反推回「布局坐标」。
   *
   * CSS perspective 的投影公式（围绕 perspective-origin）：
   *
   *     screen = origin + (layout - origin) * k
   *     其中 k = p / (p - z)
   *
   * 反解：
   *
   *     layout = origin + (screen - origin) / k
   *
   * 【关键】这里 origin 必须与 CSS 的 perspective-origin 完全一致。
   * v10.0 把 perspective-origin 对齐到了 main 的中心，
   * 所以布局求解原点也就是 main 的中心 —— 两者严格重合。
   */
  const project = (
    rect: Rect,
    z: number,
  ): Rect => {
    const k = perspectiveScale(z, p)
    const cx = rect.x + rect.w / 2
    const cy = rect.y + rect.h / 2
    return {
      x: ccx + (cx - ccx) / k - rect.w / k / 2,
      y: ccy + (cy - ccy) / k - rect.h / k / 2,
      w: rect.w / k,
      h: rect.h / k,
    }
  }

  /** 是否都在容器内（含透视放大后的外扩余量） */
  const inBounds = (rects: Rect[]): boolean =>
    rects.every((r, i) => {
      const s = specs[i]
      const k = perspectiveScale(s.z, p)
      /* 透视放大后向外扩出的余量 */
      const grow = (k - 1) * Math.max(r.w, r.h) * 0.5
      return (
        r.x - grow >= 0 &&
        r.y - grow >= 0 &&
        r.x + r.w + grow <= W &&
        r.y + r.h + grow <= H
      )
    })

  /** 卡片之间不重叠 */
  const noOverlap = (rects: Rect[]): boolean => {
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        if (rectsOverlap(rects[i], rects[j])) return false
      }
    }
    return true
  }

  /** 卡片绝不压住星盘本体（按倾斜后的最坏半径判定） */
  const discClear = (rects: Rect[], size: number): boolean => {
    const rSolid = tiltedRadius(size)
    return !rects.some((r) => rectHitsCircle(r, ccx, ccy, rSolid))
  }

  /* ---------- 二分搜索最大的星盘尺寸 ---------- */
  let lo = 160
  let hi = Math.min(1400, Math.floor(Math.min(W, H) * 1.6))
  let bestSize = 0
  let bestRects: Rect[] = []

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2)
    const rects = placeOnScreen(mid)
    if (inBounds(rects) && noOverlap(rects) && discClear(rects, mid)) {
      bestSize = mid
      bestRects = rects
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }

  /* ---------- 兜底：极小屏幕 ---------- */
  if (bestSize < 160) {
    const size = Math.max(140, Math.min(220, Math.min(W, H) * 0.4))
    const rects = placeOnScreen(size).map((r) => ({
      ...r,
      x: Math.max(0, Math.min(r.x, W - r.w)),
      y: Math.max(0, Math.min(r.y, H - r.h)),
    }))
    bestSize = size
    bestRects = rects
  }

  /* ---------- 屏幕坐标 → 2D 布局坐标（精确反投影） ---------- */
  const cards: PlacedCard[] = specs.map((s, i) => {
    const r = bestRects[i]
    const k = perspectiveScale(s.z, p)
    /* 用与 CSS 完全一致的公式反解 */
    const l = project(r, s.z)
    return {
      id: s.id,
      screen: r,
      layout: {
        left: l.x,
        top: l.y,
        width: l.w,
        height: l.h,
      },
      k,
    }
  })

  return { astrolabeSize: bestSize, cards }
}

/* ============================================================
 *  六张功能卡片的规格
 *
 *  全部为**屏幕空间**尺寸。
 *  Z 深度刻意错开（-24 ~ 118），形成前后层次。
 * ============================================================ */
export const SCENE_CARDS: SceneCardSpec[] = [
  {
    id: 'mbti',
    w: 264, h: 198, side: -1, vy: 0.17, yJitter: -14,
    z: 92, angle: 180, floatDur: 9.5, floatDelay: 0, tilt: -1.7,
  },
  {
    id: 'chat',
    w: 226, h: 174, side: -1, vy: 0.5, yJitter: 16,
    z: 34, angle: 180, floatDur: 12.4, floatDelay: 1.4, tilt: 2.2,
  },
  {
    id: 'advantage',
    w: 234, h: 182, side: -1, vy: 0.83, yJitter: -8,
    /*
     * 【v18.2 · 点击穿透修复】
     *
     * 原来是 **z: -24（负值）** ——
     * 在 `preserve-3d` 上下文里，负 Z 深度会让这张卡片
     * 渲染到 `main` 自身的背景平面**之后**，
     * 于是鼠标命中测试直接落到 main 上，
     * 卡片点起来「完全没反应」。
     *
     * 改成正值后，它仍然排在 chat(34) / mbti(92) / talent(118) 之后，
     * 前后的层次感一点没丢，但不再被 main 挡住。
     */
    z: 8, angle: 180, floatDur: 13.2, floatDelay: 3.4, tilt: 2.9,
  },
  {
    id: 'talent',
    w: 286, h: 228, side: 1, vy: 0.16, yJitter: 12,
    z: 118, angle: 0, floatDur: 10.8, floatDelay: 2.6, tilt: 1.5,
  },
  {
    id: 'fortune',
    w: 240, h: 188, side: 1, vy: 0.49, yJitter: -14,
    z: 58, angle: 0, floatDur: 11.6, floatDelay: 0.9, tilt: -1.2,
  },
  {
    id: 'tip',
    w: 248, h: 210, side: 1, vy: 0.82, yJitter: 8,
    z: 76, angle: 0, floatDur: 9.1, floatDelay: 4.2, tilt: -2.4,
  },
]
