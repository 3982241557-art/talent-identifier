import type { CSSProperties, ReactElement } from 'react'

/* ============================================================
 *  天文观测级矢量图标（v17.0）
 * ============================================================
 *
 *  【为什么废除 Unicode 星座符号】
 *  旧版用 ♈ ♉ ♊ 这类 Unicode 字符直接渲染。
 *  它们的问题：
 *    1. **字形不可控** —— 渲染成 emoji 时会变成彩色卡通圆圈
 *       （Windows / iOS 尤其明显），彻底毁掉深空质感
 *    2. **颜色无法精确控制** —— 只能用 fill 一个色值，
 *       做不到「暗金线条 + 微弱辉光」这种天文仪器感
 *    3. **字重不可控** —— 想要纤细线条，但 Unicode 只有 Bold
 *
 *  现在全部换成**手绘 SVG path**：
 *    · 统一的 1.1px 描边（细如刻蚀线）
 *    · 暗金 / 星光银双色，无饱和度
 *    · 可控辉光（drop-shadow）
 *    · 矢量缩放不失真
 * ============================================================ */

/** 图标通用属性 */
interface GlyphProps {
  /** 尺寸（px） */
  size?: number
  /** 线条颜色 */
  color?: string
  /** 额外 class */
  className?: string
  style?: CSSProperties
}

/** 统一的 SVG 外壳 */
function Glyph({
  size = 22,
  color = 'currentColor',
  className = '',
  style,
  children,
}: GlyphProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.1}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden
    >
      {children}
    </svg>
  )
}

/* ============================================================
 *  十二星座 —— 天文仪器风格线条图
 * ============================================================ */

/** 白羊 · 羊角 */
export function AriesGlyph(p: GlyphProps) {
  return (
    <Glyph {...p}>
      <path d="M5.5 20c0-5 1.4-9 3.2-11.4 1.2-1.6 2.6-2.1 3.4-1.2.9 1 .5 3-1.2 4.6-1.4 1.4-2 2.4-1.6 3.4.5 1.2 2.4 1 3.4-.9 1.2-2.2 1.6-4.4 1.6-6.5" />
      <path d="M14.3 7.5c1.3.6 2.6 2.2 3.3 4.2.6 1.9.6 3.9-.1 5.6" />
    </Glyph>
  )
}

/** 金牛 · 牛头与角 */
export function TaurusGlyph(p: GlyphProps) {
  return (
    <Glyph {...p}>
      <path d="M4.5 8.5c1.4-2 3.2-3 4.6-2.4M19.5 8.5c-1.4-2-3.2-3-4.6-2.4" />
      <path d="M9.1 6.1c-.6 1.5-.4 3 .4 4.2" />
      <path d="M14.9 6.1c.6 1.5.4 3-.4 4.2" />
      <path d="M7.6 13.5c0-2.6 2-4.6 4.4-4.6s4.4 2 4.4 4.6c0 2.2-1.2 3.8-2.6 4.6v2h-3.6v-2c-1.4-.8-2.6-2.4-2.6-4.6z" />
    </Glyph>
  )
}

/** 双子 · 双柱 */
export function GeminiGlyph(p: GlyphProps) {
  return (
    <Glyph {...p}>
      <path d="M7 4v16M17 4v16" />
      <path d="M7 8h10M7 16h10" />
      <path d="M4 4h6M14 4h6M4 20h6M14 20h6" />
    </Glyph>
  )
}

/** 巨蟹 · 蟹钳与腹 */
export function CancerGlyph(p: GlyphProps) {
  return (
    <Glyph {...p}>
      <path d="M6 8.5c-1.6-1.4-3.4-1.6-4.4-.6-1 1-.6 2.8.8 3.8 1.2.9 2.7 1 3.6.4" />
      <path d="M18 8.5c1.6-1.4 3.4-1.6 4.4-.6 1 1 .6 2.8-.8 3.8-1.2.9-2.7 1-3.6.4" />
      <path d="M4.6 15.6c2.4-1.6 4.8-1.6 7.4 0s5 1.6 7.4 0" />
      <path d="M4.6 19.4c2.4-1.6 4.8-1.6 7.4 0s5 1.6 7.4 0" />
    </Glyph>
  )
}

/** 狮子 · 狮鬃与尾 */
export function LeoGlyph(p: GlyphProps) {
  return (
    <Glyph {...p}>
      <path d="M8.5 6.5c2-1.8 4.6-2 6.6-.6 1.6 1.2 2 3.2 1.2 5-.8 1.8-.4 3.8 1 5 1.4 1.2 3.4 1.4 4.8.4" />
      <path d="M8.5 6.5c-1.4 1-2 2.6-1.6 4.2M8.5 6.5C6.8 5.4 6 3.8 6.2 2.4" />
      <path d="M8.5 6.5c.4-1.6 1.6-2.6 3-2.8" />
    </Glyph>
  )
}

/** 处女 · 麦穗 */
export function VirgoGlyph(p: GlyphProps) {
  return (
    <Glyph {...p}>
      <path d="M5 20V9.5c0-1.6 1.4-2.6 2.8-2.1 1.2.4 1.9 1.6 1.9 3V20" />
      <path d="M9.7 20v-8.2c0-1.6 1.3-2.6 2.7-2.1 1.2.4 1.9 1.6 1.9 3V20" />
      <path d="M14.3 20v-6.6c0-1.6 1.3-2.6 2.7-2.1 1.2.4 1.9 1.6 1.9 3V20" />
      <path d="M6.5 9.5c1.6-1.4 3.2-1.4 4.4 0M11 11.2c1.6-1.4 3.2-1.4 4.4 0" />
    </Glyph>
  )
}

/** 天秤 · 天平 */
export function LibraGlyph(p: GlyphProps) {
  return (
    <Glyph {...p}>
      <path d="M12 4v16M7 20h10" />
      <path d="M4 8h16M4 8l-2 5.5h4L4 8zM20 8l-2 5.5h4L20 8z" />
    </Glyph>
  )
}

/** 天蝎 · 蝎尾 */
export function ScorpioGlyph(p: GlyphProps) {
  return (
    <Glyph {...p}>
      <path d="M6 4v9c0 1.4.8 2.6 2 3.2" />
      <path d="M6 4h4.5M6 4L3.5 7M6 4l2.5 3" />
      <path d="M8 16.2c1.6 1.6 3.6 2.4 5.6 2.4 2.6 0 4.4-1.2 4.4-3 0-1.4-1.2-2.2-2.4-2.2-1 0-1.8.6-1.8 1.4 0 .6.4 1.2 1.2 1.2.8 0 1.4-.6 1.4-1.4" />
    </Glyph>
  )
}

/** 射手 · 弓与箭 */
export function SagittariusGlyph(p: GlyphProps) {
  return (
    <Glyph {...p}>
      <path d="M4 20L20 4M13 4h7v7" />
      <path d="M4 13v7h7" />
    </Glyph>
  )
}

/** 摩羯 · 羊角与鱼尾 */
export function CapricornGlyph(p: GlyphProps) {
  return (
    <Glyph {...p}>
      <path d="M5 4c1.4-1.2 3-1.4 4-.4.9.9.7 2.4-.6 3.4" />
      <path d="M8.4 7c1.6 1 2.4 2.4 2 4-.4 1.8-1.8 2.8-3.4 2.4" />
      <path d="M7 13.4c1.6.4 2.6 1.6 2.8 3 .2 1.6-.6 2.8-2 3.6" />
      <path d="M16.4 20c-1.6-.6-2.4-1.8-2.2-3.2.2-1.4 1.4-2.2 2.8-2 .8.1 1.4.6 1.6 1.2" />
    </Glyph>
  )
}

/** 水瓶 · 波浪与肩 */
export function AquariusGlyph(p: GlyphProps) {
  return (
    <Glyph {...p}>
      <path d="M6 3v18M18 3v18" />
      <path d="M6 8c1-1.4 2-1.4 3 0s2 1.4 3 0 2-1.4 3 0" />
      <path d="M6 14c1-1.4 2-1.4 3 0s2 1.4 3 0 2-1.4 3 0" />
    </Glyph>
  )
}

/** 双鱼 · 双鱼与带 */
export function PiscesGlyph(p: GlyphProps) {
  return (
    <Glyph {...p}>
      <path d="M7 5.5c-2 2.4-2 4.2 0 6.5s2 4.1 0 6.5M17 5.5c2 2.4 2 4.2 0 6.5s-2 4.1 0 6.5" />
      <path d="M7.6 10h8.8M7.6 14h8.8" />
    </Glyph>
  )
}

/* ============================================================
 *  大三星专用图标（日月升）
 * ============================================================ */

/** 太阳 —— 圆盘 + 光芒 */
export function SunGlyph(p: GlyphProps) {
  return (
    <Glyph {...p}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2.4M12 19.6V22M2 12h2.4M19.6 12H22M4.9 4.9l1.7 1.7M17.4 17.4l1.7 1.7M19.1 4.9l-1.7 1.7M6.6 17.4l-1.7 1.7" />
    </Glyph>
  )
}

/** 月亮 —— 蛾眉月 */
export function MoonGlyph(p: GlyphProps) {
  return (
    <Glyph {...p}>
      <path d="M20 14.5A8.5 8.5 0 019.5 4a8.5 8.5 0 1010.5 10.5z" />
    </Glyph>
  )
}

/** 上升 —— 地平线与箭头 */
export function AscendantGlyph(p: GlyphProps) {
  return (
    <Glyph {...p}>
      <path d="M2 19h20" />
      <path d="M12 16V4M12 4l-4 4M12 4l4 4" />
    </Glyph>
  )
}

/* ============================================================
 *  十二星座映射表
 * ============================================================ */

export const SIGN_GLYPH_COMPONENT: Record<string, (p: GlyphProps) => ReactElement> = {
  白羊: AriesGlyph,
  金牛: TaurusGlyph,
  双子: GeminiGlyph,
  巨蟹: CancerGlyph,
  狮子: LeoGlyph,
  处女: VirgoGlyph,
  天秤: LibraGlyph,
  天蝎: ScorpioGlyph,
  射手: SagittariusGlyph,
  摩羯: CapricornGlyph,
  水瓶: AquariusGlyph,
  双鱼: PiscesGlyph,
}

/** 取某个星座（中文名，可带「座」）的图标组件 */
export function signGlyphComponent(cn: string) {
  const key = cn.replace('座', '')
  return SIGN_GLYPH_COMPONENT[key] ?? AriesGlyph
}

/* ============================================================
 *  今日运势四维图标（替代 Emoji）
 * ============================================================ */

/** 事业 / 学业 —— 靶心与箭 */
export function CareerGlyph(p: GlyphProps) {
  return (
    <Glyph {...p}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" />
      <path d="M12 12l6.5-6.5M18.5 5.5h-3M18.5 5.5v3" />
    </Glyph>
  )
}

/** 财富 —— 上升折线 */
export function WealthGlyph(p: GlyphProps) {
  return (
    <Glyph {...p}>
      <path d="M3 18l5-5.5 3.5 3.5L21 6" />
      <path d="M15.5 6H21v5.5" />
    </Glyph>
  )
}

/** 健康 —— 脉搏 */
export function HealthGlyph(p: GlyphProps) {
  return (
    <Glyph {...p}>
      <path d="M2 12h4l2.2-5.5L11 17l2.6-6 1.6 3h6.8" />
    </Glyph>
  )
}

/** 感情 —— 双环交织 */
export function LoveGlyph(p: GlyphProps) {
  return (
    <Glyph {...p}>
      <circle cx="9.5" cy="12" r="5.5" />
      <circle cx="14.5" cy="12" r="5.5" />
    </Glyph>
  )
}

/** 抽牌 —— 塔罗牌 */
export function TarotGlyph(p: GlyphProps) {
  return (
    <Glyph {...p}>
      <rect x="5" y="3" width="14" height="18" rx="1.6" />
      <path d="M12 8.5l1.6 3.3 3.6.5-2.6 2.5.6 3.6-3.2-1.7-3.2 1.7.6-3.6-2.6-2.5 3.6-.5z" />
    </Glyph>
  )
}

/** 望远镜 —— 出生星空入口 */
export function TelescopeGlyph(p: GlyphProps) {
  return (
    <Glyph {...p}>
      <path d="M3 12l10-5 2 4-10 5z" />
      <path d="M15 7l3-1.5 3 6-3 1.5" />
      <path d="M8 15.5V21M4 21h9" />
    </Glyph>
  )
}

/** 优势链条 —— 环形箭头 */
export function CycleGlyph(p: GlyphProps) {
  return (
    <Glyph {...p}>
      <path d="M20.5 12a8.5 8.5 0 11-2.6-6.1" />
      <path d="M20.5 4v5h-5" />
      <circle cx="12" cy="12" r="2.6" />
    </Glyph>
  )
}

/** 星盘 —— 天文仪器 */
export function AstrolabeGlyph(p: GlyphProps) {
  return (
    <Glyph {...p}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <path d="M12 3v18M3 12h18" />
      <path d="M5.6 5.6l12.8 12.8M18.4 5.6L5.6 18.4" />
    </Glyph>
  )
}

/** 灯泡 —— 灵感 */
export function SparkGlyph(p: GlyphProps) {
  return (
    <Glyph {...p}>
      <path d="M9 17.5h6M10 20.5h4" />
      <path d="M12 3a6 6 0 00-3.4 10.9c.5.4.9 1 .9 1.6h5c0-.6.4-1.2.9-1.6A6 6 0 0012 3z" />
    </Glyph>
  )
}
