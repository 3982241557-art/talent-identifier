import { useMemo, useState } from 'react'
import type { Chart } from '../../types'
import { SIGNS } from '../../data/signs'
import { ELEMENT_THEMES, blendedTheme } from '../../data/elementThemes'

/* ============================================================
 *  专业星盘（Astrolabe）· v4.0
 *
 *  结构（自外向内）：
 *    1. 外圈 —— 黄道十二宫，每 30° 一座，附刻度与星座符号
 *    2. 二圈 —— 宫位分割线（自上升点起算，真实 Placidus 宫头）
 *    3. 三圈 —— 元素能量弧
 *    4. 内盘 —— 行星落点（后端真实星历黄经）
 *    5. 中心 —— 三巨头摘要
 *
 *  v4.0 变更：
 *    · 尺寸放大两倍，成为页面绝对的视觉中心。
 *    · 【任务 3】删除独立的元素面板，改为在火/土/风/水象星座区域
 *      引出细折线 + Tooltip 锚点，悬浮显示该元素在命盘中的占比与含义。
 *    · 【任务 4】太阳与月亮使用独立的径向高光，其余刻度保持冷冽。
 * ============================================================ */

interface AstrolabeProps {
  chart: Chart
  size?: number
}

const DEG = Math.PI / 180

/** 元素在命盘中的具体含义（Tooltip 正文） */
const ELEMENT_MEANING: Record<string, string> = {
  fire: '火象能量主导：行动力、热情与开拓性是你最直接的燃料。占比越高，你越需要「先动起来」，越难忍受长期停滞。',
  earth: '土象能量主导：现实感、耐心与可落地的执行是你的底色。占比越高，你越相信看得见的成果，警惕把想象当计划。',
  air: '风象能量主导：理性、交流与抽象思考是你的加速器。占比越高，你越依赖信息与交流，越容易被情绪化决策打断。',
  water: '水象能量主导：感受、直觉与共情是你最灵敏的天线。占比越高，你越能读懂他人，也越容易被情绪暗流卷走。',
}

export function Astrolabe({ chart, size = 620 }: AstrolabeProps) {
  const cx = size / 2
  const cy = size / 2

  /* 任务 3：元素锚点需要画在盘外，因此为 viewBox 预留边距 */
  const PAD = size * 0.075
  const viewSize = size + PAD * 2
  const vcx = viewSize / 2
  const vcy = viewSize / 2

  /**
   * v7.0：所有半径改为**按 size 比例计算**。
   *
   * 旧版用的是固定像素偏移（-26 / -30 / -26 …），
   * 当星盘被缩到 200px 以下时，内层半径会变成负数 → SVG 报
   * `<circle> attribute r: A negative value is not valid`。
   * 比例化之后，无论星盘多小都不会出现负半径。
   */
  const rOuter = Math.max(24, size * 0.5 - 6)
  const rSign = Math.max(18, rOuter - size * 0.042)
  const rHouse = Math.max(14, rSign - size * 0.018)
  const rElement = Math.max(11, rHouse - size * 0.046)
  const rPlanet = Math.max(9, rElement - size * 0.052)
  const rInner = Math.max(6, rPlanet - size * 0.046)
  /** 中心圆盘半径 */
  const rCore = Math.max(4, rInner - size * 0.02)

  /*
   * v9.0 · 任务 3：双元素混合主题。
   * 中心星座名用 **accent**（与主调形成高对比的独立强调色），
   * 打破整页只有一种色调的沉闷。
   */
  const theme = useMemo(
    () => blendedTheme(chart.bigThree.sun.sign, chart.bigThree.rising.sign),
    [chart.bigThree.sun.sign, chart.bigThree.rising.sign],
  )
  const accent = theme.accent

  /** 悬浮中的元素锚点（任务 3） */
  const [hovered, setHovered] = useState<string | null>(null)

  /** 黄经 -> 坐标（0° 白羊起于 12 点方向，顺时针） */
  const toXY = useMemo(
    () =>
      (lon: number, radius: number) => {
        const ang = (90 - lon) * DEG
        return {
          x: vcx + radius * Math.cos(ang),
          y: vcy - radius * Math.sin(ang),
        }
      },
    [vcx, vcy],
  )

  /** 元素能量弧：自上升点起顺时针分配 */
  const arcs = useMemo(() => {
    const entries = (Object.entries(chart.elements) as Array<
      [keyof typeof chart.elements, number]
    >).filter(([, v]) => v > 0)
    let cursor = chart.risingLongitude
    return entries.map(([el, pct]) => {
      const span = (pct / 100) * 360
      const start = cursor
      const end = cursor + span
      cursor = end
      const a1 = (90 - start) * DEG
      const a2 = (90 - end) * DEG
      const large = span > 180 ? 1 : 0
      const rr = rElement
      const x1 = cx + rr * Math.cos(a1)
      const y1 = cy - rr * Math.sin(a1)
      const x2 = cx + rr * Math.cos(a2)
      const y2 = cy - rr * Math.sin(a2)
      return {
        el,
        pct,
        d: `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${rr} ${rr} 0 ${large} 0 ${x2.toFixed(2)} ${y2.toFixed(2)}`,
        color: ELEMENT_THEMES[el].primary,
      }
    })
  }, [chart.elements, chart.risingLongitude, cx, cy, rElement])

  /**
   * 十二宫起始黄经。
   * v4.0：使用真实宫头（Placidus），本地推演时回落到 30° 均分。
   */
  const houseStarts = useMemo(
    () =>
      chart.houses.length === 12
        ? chart.houses.map((h) => h.longitude)
        : chart.houses.map((h) => (h.house - 1) * 30 + chart.risingLongitude),
    [chart.houses, chart.risingLongitude],
  )

  /**
   * 元素锚点：每个元素取其星座区域的中点，
   * 从星座符号处引出一条细折线，指向盘外侧的占比标签。
   */
  const elementAnchors = useMemo(() => {
    const byElement = new Map<string, { lons: number[]; pct: number }>()
    for (const [el, pct] of Object.entries(chart.elements)) {
      const lons = SIGNS.filter((s) => s.element === el).map(
        (s) => SIGNS.indexOf(s) * 30 + 15,
      )
      byElement.set(el, { lons, pct })
    }
    return (Object.keys(chart.elements) as Array<keyof typeof chart.elements>)
      .map((el) => {
        const info = byElement.get(el)!
        // 选该元素中黄经最靠前的一个星座作为锚点（保证锚点分散）
        const lon = info.lons[0]
        return {
          el,
          pct: info.pct,
          lon,
          color: ELEMENT_THEMES[el].primary,
          label: ELEMENT_THEMES[el].label,
          mood: ELEMENT_THEMES[el].mood,
        }
      })
      .filter((a) => a.pct > 0)
  }, [chart.elements])

  return (
    <div
      className="relative select-none"
      style={{ width: viewSize, height: viewSize }}
      role="img"
      aria-label="本命星盘"
    >
      {/* ---------- 太阳 / 月亮 专属径向高光（任务 4） ---------- */}
      <SunMoonGlow chart={chart} size={size} toXY={toXY} rPlanet={rPlanet} />

      <svg
        width={viewSize}
        height={viewSize}
        viewBox={`0 0 ${viewSize} ${viewSize}`}
        className="absolute inset-0"
      >
        <defs>
          <radialGradient id="ast-core" cx="50%" cy="42%">
            <stop offset="0%" stopColor={theme.ambient} />
            <stop offset="70%" stopColor="rgba(0,0,0,0)" />
          </radialGradient>
          <filter id="ast-glow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="2" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="ast-soft-glow" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="6" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* 中心柔光（保持克制，避免洗掉刻度） */}
        <circle cx={vcx} cy={vcy} r={rOuter} fill="url(#ast-core)" />

        {/* 元素能量弧 */}
        {arcs.map((a) => (
          <path
            key={a.el}
            d={a.d}
            fill="none"
            stroke={a.color}
            strokeOpacity="0.62"
            strokeWidth="4.5"
            strokeLinecap="butt"
          />
        ))}

        {/* 圆环组 */}
        <circle
          cx={vcx}
          cy={vcy}
          r={rOuter}
          fill="none"
          stroke="rgba(255,255,255,0.34)"
          strokeWidth="1"
        />
        <circle
          cx={vcx}
          cy={vcy}
          r={rSign}
          fill="none"
          stroke="rgba(255,255,255,0.20)"
          strokeWidth="0.7"
        />
        <circle
          cx={vcx}
          cy={vcy}
          r={rHouse}
          fill="none"
          stroke="rgba(255,255,255,0.15)"
          strokeWidth="0.6"
        />
        <circle
          cx={vcx}
          cy={vcy}
          r={rInner}
          fill="none"
          stroke="rgba(255,255,255,0.17)"
          strokeWidth="0.7"
        />

        {/* 每 1° 细刻度（每 5° 加长） */}
        {Array.from({ length: 360 }, (_, i) => {
          const ang = (90 - i) * DEG
          const major = i % 5 === 0
          const len = major ? 8 : 3.5
          return (
            <line
              key={`t${i}`}
              x1={vcx + (rOuter - len) * Math.cos(ang)}
              y1={vcy - (rOuter - len) * Math.sin(ang)}
              x2={vcx + rOuter * Math.cos(ang)}
              y2={vcy - rOuter * Math.sin(ang)}
              stroke={major ? 'rgba(255,255,255,0.42)' : 'rgba(255,255,255,0.18)'}
              strokeWidth={major ? 0.7 : 0.4}
            />
          )
        })}

        {/* 十二星座符号（自黄道 0° 起，每 30° 一个） */}
        {SIGNS.map((s, i) => {
          const lon = i * 30 + 15
          const { x, y } = toXY(lon, rSign)
          const sColor = ELEMENT_THEMES[s.element].primary
          return (
            <g key={s.key}>
              <text
                x={x}
                y={y}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={size * 0.036}
                fontWeight="700"
                fill={sColor}
                fillOpacity="1"
                style={{
                  filter: `drop-shadow(0 0 8px ${sColor}99)`,
                }}
              >
                {s.glyph}
              </text>
              <text
                x={x}
                y={y + size * 0.033}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={size * 0.0155}
                fontWeight="700"
                fill="rgba(240,244,252,0.9)"
                letterSpacing="0.08em"
              >
                {s.cn.replace('座', '')}
              </text>
            </g>
          )
        })}

        {/* ============================================================
             任务 3：元素锚点 —— 细折线 + 占比标签 + Tooltip
             在对应元素的星座区域旁引出锚点，悬浮即见含义
             ============================================================ */}
        {elementAnchors.map((a) => {
          const from = toXY(a.lon, rSign)
          const midR = rOuter + size * 0.022
          const endR = rOuter + size * 0.062
          const mid = toXY(a.lon, midR)
          const end = toXY(a.lon, endR)
          const isOn = hovered === a.el
          return (
            <g
              key={a.el}
              onMouseEnter={() => setHovered(a.el)}
              onMouseLeave={() => setHovered(null)}
              style={{ cursor: 'help' }}
            >
              {/* 折线：从星座符号 → 折点 → 标签 */}
              <path
                d={`M ${from.x.toFixed(2)} ${from.y.toFixed(2)} L ${mid.x.toFixed(2)} ${mid.y.toFixed(2)} L ${end.x.toFixed(2)} ${end.y.toFixed(2)}`}
                fill="none"
                stroke={a.color}
                strokeOpacity={isOn ? 1 : 0.7}
                strokeWidth={isOn ? 1.8 : 1.3}
              />
              {/* 锚点小圆点 */}
              <circle
                cx={from.x}
                cy={from.y}
                r={isOn ? 4.5 : 3}
                fill="none"
                stroke={a.color}
                strokeOpacity={isOn ? 1 : 0.8}
                strokeWidth={isOn ? 1.8 : 1.3}
              />
              {/* 标签底 */}
              <circle
                cx={end.x}
                cy={end.y}
                r={size * 0.028}
                fill="rgba(0,0,0,0.45)"
                stroke={a.color}
                strokeOpacity={isOn ? 1 : 0.65}
                strokeWidth={isOn ? 1.6 : 1.1}
                style={{ transition: 'all 0.35s ease' }}
              />
              {/* 元素名 */}
              <text
                x={end.x}
                y={end.y - size * 0.008}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={size * 0.019}
                fontWeight="700"
                fill={a.color}
              >
                {a.label}
              </text>
              {/* 占比 */}
              <text
                x={end.x}
                y={end.y + size * 0.012}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={size * 0.015}
                fontWeight="700"
                fill="rgba(240,244,252,0.85)"
              >
                {a.pct}%
              </text>
            </g>
          )
        })}

        {/* 十二宫分割线 + 宫位编号 */}
        {houseStarts.map((lon, i) => {
          const ang = (90 - lon) * DEG
          const x1 = vcx + rInner * Math.cos(ang)
          const y1 = vcy - rInner * Math.sin(ang)
          const x2 = vcx + rSign * Math.cos(ang)
          const y2 = vcy - rSign * Math.sin(ang)
          // 宫位编号放在该宫中线
          const next = houseStarts[(i + 1) % 12]
          const mid = normLon(lon + ((next - lon + 360) % 360) / 2)
          const { x, y } = toXY(mid, rHouse + 1)
          return (
            <g key={i}>
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="rgba(255,255,255,0.22)"
                strokeWidth="0.6"
              />
              <text
                x={x}
                y={y}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={size * 0.016}
                fill="rgba(230,236,247,0.52)"
              >
                {i + 1}
              </text>
            </g>
          )
        })}

        {/* 上升点标记（ASC） */}
        {(() => {
          const ang = (90 - chart.risingLongitude) * DEG
          const x1 = vcx + (rInner - 2) * Math.cos(ang)
          const y1 = vcy - (rInner - 2) * Math.sin(ang)
          const x2 = vcx + (rOuter - 2) * Math.cos(ang)
          const y2 = vcy - (rOuter - 2) * Math.sin(ang)
          const { x, y } = toXY(chart.risingLongitude + 4, rSign)
          return (
            <g>
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={theme.primary}
                strokeOpacity="0.75"
                strokeWidth="1.3"
              />
              <text
                x={x}
                y={y}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={size * 0.019}
                fill={theme.primary}
                letterSpacing="0.1em"
              >
                ASC
              </text>
            </g>
          )
        })()}

        {/* 行星落点 */}
        {(
          [
            {
              lon: chart.bigThree.sun.longitude,
              cn: '太阳',
              color: '#fff4d0',
              r: 5,
              glow: true,
            },
            {
              lon: chart.bigThree.moon.longitude,
              cn: '月亮',
              color: '#cfe0f7',
              r: 4.4,
              glow: true,
            },
            {
              lon: chart.bigThree.rising.longitude,
              cn: '上升',
              color: theme.primary,
              r: 3.2,
              glow: false,
            },
          ] as const
        ).map(({ lon, cn, color, r, glow }) => {
          const { x, y } = toXY(lon, rPlanet)
          return (
            <g key={cn}>
              <circle
                cx={x}
                cy={y}
                r={r}
                fill={color}
                fillOpacity="0.96"
                filter={glow ? 'url(#ast-soft-glow)' : 'url(#ast-glow)'}
              />
              <text
                x={x}
                y={y - r - 5}
                textAnchor="middle"
                fontSize={size * 0.0165}
                fontWeight="700"
                fill={color}
                fillOpacity="0.95"
                letterSpacing="0.08em"
              >
                {cn}
              </text>
            </g>
          )
        })}

        {chart.planets.map((p) => {
          const { x, y } = toXY(p.longitude, rPlanet)
          const c = 'rgba(230,236,247,0.68)'
          return (
            <g key={p.planet}>
              <circle cx={x} cy={y} r={2.6} fill={c} />
              {p.retrograde && (
                <circle
                  cx={x}
                  cy={y}
                  r={5.4}
                  fill="none"
                  stroke={c}
                  strokeOpacity="0.5"
                  strokeWidth="0.6"
                />
              )}
              <text
                x={x}
                y={y + 10}
                textAnchor="middle"
                fontSize={size * 0.0145}
                fontWeight="600"
                fill="rgba(230,236,247,0.5)"
              >
                {p.planetCn}
                {p.retrograde ? ' ᴿ' : ''}
              </text>
            </g>
          )
        })}

        {/* 中心三巨头 */}
        <g>
          <circle
            cx={vcx}
            cy={vcy}
            r={rCore}
            fill="rgba(0,0,0,0.34)"
            stroke="rgba(255,255,255,0.17)"
            strokeWidth="0.6"
          />
          <text
            x={vcx}
            y={vcy - size * 0.042}
            textAnchor="middle"
            fontSize={size * 0.016}
            fontWeight="700"
            fill="rgba(240,244,252,0.6)"
            letterSpacing="0.34em"
          >
            NATAL CHART
          </text>
          <text
            x={vcx}
            y={vcy + size * 0.006}
            textAnchor="middle"
            fontSize={size * 0.056}
            fontWeight="700"
            fill={accent}
            fontFamily="var(--font-display)"
            letterSpacing="0.1em"
            style={{ filter: `drop-shadow(0 0 16px ${accent}88)` }}
          >
            {chart.bigThree.rising.sign.cn}
          </text>
          <text
            x={vcx}
            y={vcy + size * 0.042}
            textAnchor="middle"
            fontSize={size * 0.016}
            fontWeight="700"
            fill="rgba(240,244,252,0.6)"
            letterSpacing="0.24em"
          >
            上升星座
          </text>
          <text
            x={vcx}
            y={vcy + size * 0.078}
            textAnchor="middle"
            fontSize={size * 0.0175}
            fontWeight="700"
            fill="rgba(240,244,252,0.9)"
            letterSpacing="0.1em"
          >
            {chart.bigThree.sun.sign.cn} · {chart.bigThree.moon.sign.cn}
          </text>
        </g>
      </svg>

      {/* ---------- 元素 Tooltip（任务 3） ---------- */}
      {hovered &&
        (() => {
          const a = elementAnchors.find((x) => x.el === hovered)
          if (!a) return null
          const end = toXY(a.lon, rOuter + size * 0.062)
          const flip = end.x > vcx
          return (
            <div
              className="pointer-events-none absolute z-20 w-[268px] border border-white/12 bg-white/8 px-5 py-4 backdrop-blur-md"
              style={{
                left: flip ? end.x - 282 : end.x + 14,
                top: end.y - 60,
                boxShadow: '0 18px 50px rgba(0,0,0,0.55)',
              }}
            >
              <div className="flex items-baseline justify-between">
                <span
                  className="serif-title text-[19px] font-semibold tracking-[0.1em]"
                  style={{ color: a.color }}
                >
                  {a.label}象
                </span>
                <span
                  className="text-[19px] font-bold"
                  style={{ color: a.color }}
                >
                  {a.pct}%
                </span>
              </div>
              <p className="mt-2 text-[13.5px] font-semibold tracking-[0.16em] text-mist/65">
                {a.mood}
              </p>
              <p className="serif-body mt-3 text-[15px] font-medium leading-[1.55] text-mist/85">
                {ELEMENT_MEANING[a.el]}
              </p>
            </div>
          )
        })()}
    </div>
  )
}

/* ============================================================
 *  太阳 / 月亮 专属径向高光
 *  任务 4：环境高光 ONLY 集中在太阳和月亮两个核心天体上，
 *  绝不让光晕覆盖星盘刻度导致画面发灰。
 * ============================================================ */
function SunMoonGlow({
  chart,
  size,
  toXY,
  rPlanet,
}: {
  chart: Chart
  size: number
  toXY: (lon: number, radius: number) => { x: number; y: number }
  rPlanet: number
}) {
  const sun = toXY(chart.bigThree.sun.longitude, rPlanet)
  const moon = toXY(chart.bigThree.moon.longitude, rPlanet)
  const r = size * 0.13
  // viewBox 中心相对于容器左上角的偏移（容器边距 PAD）
  const pad = size * 0.075

  return (
    <>
      <div
        className="pointer-events-none absolute"
        style={{
          left: sun.x - pad - r,
          top: sun.y - pad - r,
          width: r * 2,
          height: r * 2,
          background:
            'radial-gradient(circle, rgba(255,226,150,0.5) 0%, rgba(255,196,96,0.2) 26%, rgba(0,0,0,0) 64%)',
        }}
      />
      <div
        className="pointer-events-none absolute"
        style={{
          left: moon.x - pad - r,
          top: moon.y - pad - r,
          width: r * 2,
          height: r * 2,
          background:
            'radial-gradient(circle, rgba(190,214,250,0.42) 0%, rgba(140,180,240,0.17) 26%, rgba(0,0,0,0) 64%)',
        }}
      />
    </>
  )
}

/** 黄经归一化 */
function normLon(d: number): number {
  return ((d % 360) + 360) % 360
}
