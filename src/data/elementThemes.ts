import type { Element, SignMeta } from '../types'

/* ============================================================
 *  四象元素动态色彩引擎
 *
 *  v9.0 · 任务 3
 *  ------------------------------------------------------------
 *  v2.0 只有「单一元素主题」—— 只看太阳星座，整页一个色调。
 *
 *  v9.0 升级为**双元素混合**：
 *  太阳星座给出**主调**（性格的骨架），
 *  上升星座给出**辅调**（外在的呈现方式）。
 *  两者混合后仍然保持纯净 —— 严格限制在四个象限内，
 *  绝不出现紫色 / 粉色 / 霓虹绿这类俗艳色。
 *
 *  四象色系：
 *    火象 → 橙红、暖黄      （能量、热烈）
 *    土象 → 深绿、棕褐      （森林、大地的沉稳）
 *    风象 → 青绿、天蓝、银灰 （轻快、空气感）
 *    水象 → 通透海蓝、深海蓝  （想象力、晕染）
 *
 *  另外提供**独立强调色**（accent）：
 *  它与主题色形成高对比，专门用于「中心星座名称」这类
 *  核心标题，避免主题色本身在深色背景上不够清晰。
 * ============================================================ */

export interface ElementTheme {
  element: Element
  label: string
  /** 主色：控件 / 高亮文字 / 刻度 */
  primary: string
  /** 次色：图表的第二数据系列 */
  secondary: string
  /** 环境光罩主层（大幅径向渐变中心色） */
  ambient: string
  /** 环境光罩第二层 */
  ambient2: string
  /** 环境光罩第三层（底部铺底） */
  ambient3: string
  /** 线条 / 分隔 */
  line: string
  /** 柔和底色 */
  soft: string
  /** 一句话气质描述 */
  mood: string
}

/** 单元素的基础色板 */
const BASE: Record<Element, Omit<ElementTheme, 'element' | 'label' | 'mood'>> = {
  fire: {
    primary: '#f08a3c',
    secondary: '#f0c04a',
    ambient: 'rgba(240, 138, 60, 0.34)',
    ambient2: 'rgba(240, 192, 74, 0.20)',
    ambient3: 'rgba(190, 78, 38, 0.26)',
    line: 'rgba(240, 138, 60, 0.42)',
    soft: 'rgba(240, 138, 60, 0.16)',
  },
  earth: {
    primary: '#6fae7d',
    secondary: '#b8843f',
    ambient: 'rgba(111, 174, 125, 0.36)',
    ambient2: 'rgba(184, 132, 63, 0.26)',
    ambient3: 'rgba(74, 112, 82, 0.32)',
    line: 'rgba(111, 174, 125, 0.46)',
    soft: 'rgba(111, 174, 125, 0.18)',
  },
  air: {
    primary: '#8fc9d6',
    secondary: '#a9c6e0',
    ambient: 'rgba(143, 201, 214, 0.30)',
    ambient2: 'rgba(169, 198, 224, 0.20)',
    ambient3: 'rgba(96, 130, 160, 0.26)',
    line: 'rgba(143, 201, 214, 0.40)',
    soft: 'rgba(143, 201, 214, 0.14)',
  },
  water: {
    primary: '#5ba3e0',
    secondary: '#3a76b3',
    ambient: 'rgba(91, 163, 224, 0.38)',
    ambient2: 'rgba(58, 118, 179, 0.28)',
    ambient3: 'rgba(30, 74, 126, 0.32)',
    line: 'rgba(91, 163, 224, 0.46)',
    soft: 'rgba(91, 163, 224, 0.18)',
  },
}

/** 元素气质 */
const MOOD: Record<Element, string> = {
  fire: '热情、张力、直面',
  earth: '踏实、稳重、长线',
  air: '理性、空灵、轻盈',
  water: '通透、想象、深沉',
}

/** 元素中文名 */
const LABEL: Record<Element, string> = {
  fire: '火',
  earth: '土',
  air: '风',
  water: '水',
}

/** 元素符号（用于界面标识） */
export const ELEMENT_GLYPH: Record<Element, string> = {
  fire: '🔥',
  earth: '🌍',
  air: '💨',
  water: '💧',
}

/** 单独取某元素的完整主题 */
export function themeOf(element: Element): ElementTheme {
  return {
    element,
    label: LABEL[element],
    mood: MOOD[element],
    ...BASE[element],
  }
}

/**
 * 宇宙主题的基准底色。
 * 强调色（accent）必须在这个底色上有足够对比度。
 */
export const COSMOS_BG = '#0b1428'

/* ---------------- 颜色工具 ---------------- */

/** #rrggbb -> [r, g, b] */
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ]
}

/** [r, g, b] -> #rrggbb */
function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}

/**
 * 两个颜色按比例混合。
 * t = 0 取 a，t = 1 取 b。
 */
export function mixHex(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a)
  const [r2, g2, b2] = hexToRgb(b)
  const k = Math.max(0, Math.min(1, t))
  return rgbToHex(r1 + (r2 - r1) * k, g1 + (g2 - g1) * k, b1 + (b2 - b1) * k)
}

/**
 * 相对亮度（WCAG 定义）。
 * 用于判断前景色该用黑还是白。
 */
export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/**
 * 对比度（WCAG）：返回 1 ~ 21。
 */
export function contrastRatio(a: string, b: string): number {
  const l1 = luminance(a)
  const l2 = luminance(b)
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1]
  return (hi + 0.05) / (lo + 0.05)
}

/**
 * 保证一个颜色在**深色底**上有足够对比度。
 *
 * v9.0 修复：
 * 旧实现用 `readableOn(candidate)` 挑颜色，
 * 那是「在 candidate 上能读什么颜色」，
 * 结果把强调色算成了黑色 —— 黑字压在深蓝背景上直接看不见。
 *
 * 现在：candidate **本身**就是强调色，
 * 它要跟深色底 (#0b1428) 比对比度；
 * 不够就沿着「提亮」方向推，直到达标。
 */
export function ensureContrastOnDark(
  color: string,
  bg = '#0b1428',
  minRatio = 4.5,
): string {
  if (contrastRatio(color, bg) >= minRatio) return color

  const [r, g, b] = hexToRgb(color)
  /* 沿亮度方向推到接近纯白，但保留一点色相 */
  for (let k = 0.08; k <= 1.0001; k += 0.04) {
    const mix = rgbToHex(
      r + (255 - r) * k,
      g + (255 - g) * k,
      b + (255 - b) * k,
    )
    if (contrastRatio(mix, bg) >= minRatio) return mix
  }
  return '#ffffff'
}

/**
 * 在给定底色上挑一个**高对比**的前景色。
 * 先按亮度决定黑白，再微调直到对比度达标。
 */
export function readableOn(bg: string, minRatio = 4.5): string {
  const white = '#ffffff'
  const black = '#0a0a0a'
  const best =
    contrastRatio(bg, white) >= contrastRatio(bg, black) ? white : black
  if (contrastRatio(bg, best) >= minRatio) return best

  /* 微调：把颜色朝目标方向推 */
  const target = best === white ? [255, 255, 255] : [10, 10, 10]
  const [r, g, b] = hexToRgb(bg)
  for (let k = 0.1; k <= 1.0001; k += 0.1) {
    const mix = rgbToHex(
      r + (target[0] - r) * k,
      g + (target[1] - g) * k,
      b + (target[2] - b) * k,
    )
    if (contrastRatio(mix, best) >= minRatio) return mix
  }
  return best
}

/* ---------------- 双元素混合主题 ---------------- */

/**
 * 由太阳 + 上升星座合成完整主题。
 *
 * @param sun    太阳星座 —— 主调
 * @param rising 上升星座 —— 辅调（可为 null）
 */
export function blendedTheme(
  sun: SignMeta,
  rising?: SignMeta | null,
): ElementTheme & { accent: string } {
  const a = sun.element
  const b = rising?.element ?? a
  const base = BASE[a]
  const baseB = BASE[b]

  /* 同元素时直接用原色板；异元素时按 7:3 混合 */
  const same = a === b
  const k = same ? 0 : 0.3

  const primary = same
    ? base.primary
    : mixHex(base.primary, baseB.primary, k)
  const secondary = same
    ? base.secondary
    : mixHex(base.secondary, baseB.secondary, k)

  /*
   * 强调色（accent）—— 核心标题专用。
   *
   * 规则：取**辅调元素**的主色（与主调拉开差异），
   * 但必须保证它在深色底上有足够对比度；
   * 不够就整体提亮，直到达到 WCAG AA。
   *
   * 例：太阳白羊（火）+ 上升天蝎（水）→ 主调橙红，强调色取通透的湖蓝，
   * 中心星座名就会是冷蓝撞在暖橙背景上，视觉张力立刻出来。
   */
  const accentCandidate = baseB.primary
  const accent = ensureContrastOnDark(accentCandidate, COSMOS_BG, 5)

  return {
    element: a,
    label: LABEL[a],
    mood: MOOD[a],
    primary,
    secondary,
    ambient: same
      ? base.ambient
      : mixRgba(base.ambient, baseB.ambient, k),
    ambient2: same
      ? base.ambient2
      : mixRgba(base.ambient2, baseB.ambient2, k),
    ambient3: same
      ? base.ambient3
      : mixRgba(base.ambient3, baseB.ambient3, k),
    line: same ? base.line : mixRgba(base.line, baseB.line, k),
    soft: same ? base.soft : mixRgba(base.soft, baseB.soft, k),
    accent,
  }
}

/** 混合两个 rgba 字符串 */
function mixRgba(a: string, b: string, t: number): string {
  const pa = parseRgba(a)
  const pb = parseRgba(b)
  if (!pa || !pb) return a
  const k = Math.max(0, Math.min(1, t))
  return `rgba(${Math.round(pa.r + (pb.r - pa.r) * k)}, ${Math.round(
    pa.g + (pb.g - pa.g) * k,
  )}, ${Math.round(pa.b + (pb.b - pa.b) * k)}, ${(
    pa.a + (pb.a - pa.a) * k
  ).toFixed(3)})`
}

/** 解析 rgba() */
function parseRgba(s: string): { r: number; g: number; b: number; a: number } | null {
  const m = s.match(
    /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)/,
  )
  if (!m) return null
  return {
    r: Number(m[1]),
    g: Number(m[2]),
    b: Number(m[3]),
    a: m[4] === undefined ? 1 : Number(m[4]),
  }
}

/* ---------------- 兼容旧调用 ---------------- */

export const ELEMENT_THEMES: Record<Element, ElementTheme> = {
  fire: themeOf('fire'),
  earth: themeOf('earth'),
  air: themeOf('air'),
  water: themeOf('water'),
}

/**
 * 将主题变量注入到根元素，供 CSS 变量使用。
 *
 * v9.0：新增 `--el-accent`（核心标题强调色）。
 * 传入 null 表示回到初始态（白底黑字）。
 */
export function applyElementTheme(
  el: Element | null,
  accent?: string,
  secondaryAccent?: string,
) {
  const root = document.documentElement
  if (!el) {
    root.removeAttribute('data-theme')
    root.removeAttribute('data-element')
    root.style.removeProperty('--el-accent')
    root.style.removeProperty('--el-accent-2')
    return
  }
  const t = ELEMENT_THEMES[el]
  root.setAttribute('data-theme', 'cosmos')
  root.setAttribute('data-element', el)
  root.style.setProperty('--el-primary', t.primary)
  root.style.setProperty('--el-secondary', t.secondary)
  root.style.setProperty('--el-ambient', t.ambient)
  root.style.setProperty('--el-ambient-2', t.ambient2)
  root.style.setProperty('--el-ambient-3', t.ambient3)
  root.style.setProperty('--el-line', t.line)
  root.style.setProperty('--el-soft', t.soft)
  if (accent) root.style.setProperty('--el-accent', accent)
  if (secondaryAccent)
    root.style.setProperty('--el-accent-2', secondaryAccent)
}

/**
 * 元素环境光背景层 —— 大面积径向渐变。
 *
 * v3.0：提纯色彩。
 * 之前的版本偏灰偏脏，会让底图与前景文字糊在一起。
 * 现在改用「高亮度、低饱和」的清透色晕染，
 * 自然融入太阳 / 月亮的真实图像，同时不抢前景。
 */
export function elementBackdrop(theme: ElementTheme): React.CSSProperties {
  return {
    background: [
      // 中心主光 —— 清透的中心亮区
      `radial-gradient(ellipse 74% 58% at 50% 32%, ${theme.ambient} 0%, rgba(0,0,0,0) 68%)`,
      // 右下副光 —— 微��提亮的暖色晕染
      `radial-gradient(ellipse 58% 48% at 86% 88%, ${theme.ambient2} 0%, rgba(0,0,0,0) 66%)`,
      // 左上铺底 —— 极淡的冷调，不发灰
      `radial-gradient(ellipse 66% 56% at 10% 6%, ${theme.ambient3} 0%, rgba(0,0,0,0) 70%)`,
    ].join(', '),
  }
}
