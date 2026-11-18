/* ============================================================
 *  微缩星盘教学模型（Mock Astrolabe Model）
 *
 *  v5.0 · 任务 3
 *
 *  一个极简、透气的静态 SVG，用来在「何为星盘？」科普面板里
 *  直观地展示：
 *    1. 内圈符号 → 行星（演员）
 *    2. 最外圈符号 → 星座（戏服）
 *    3. 切分的扇形 → 宫位（舞台）
 *    4. 中心的连线 → 相位（剧情）
 *
 *  设计约束：
 *   · 完全静态，不接入任何真实数据
 *   · 不复用真实星盘的绘制逻辑（那是 Astrolabe.tsx 的事）
 *   · 线条极简、留白充足，只做教学示意
 * ============================================================ */

interface MockAstrolabeProps {
  /** 主题色（来自元素引擎） */
  accent?: string
  /** 画布尺寸（正方形） */
  size?: number
}

const VIEW = 320
const C = VIEW / 2

/** 十二个扇区的角度边界（30° 一个） */
const SECTOR = 30

/** 微缩模型上的假数据（纯示意，不对应任何真实星盘） */
const FAKE_PLANETS = [
  { lon: 62, glyph: '☉' },
  { lon: 168, glyph: '☽' },
  { lon: 214, glyph: '♀' },
  { lon: 302, glyph: '♂' },
]

/** 外圈假星座（每隔 45° 放一个，共 8 个） */
const FAKE_SIGNS = [
  { lon: 15, glyph: '♈' },
  { lon: 105, glyph: '♊' },
  { lon: 150, glyph: '♍' },
  { lon: 195, glyph: '♏' },
  { lon: 240, glyph: '♑' },
  { lon: 330, glyph: '♓' },
]

/** 中心假相位连线 */
const FAKE_ASPECTS = [
  [62, 214],
  [168, 302],
  [62, 168],
]

/** 黄经 → 坐标（0° 在 12 点方向，顺时针） */
function toXY(lon: number, radius: number) {
  const ang = ((90 - lon) * Math.PI) / 180
  return {
    x: C + radius * Math.cos(ang),
    y: C - radius * Math.sin(ang),
  }
}

export function MockAstrolabe({ accent = '#c9a86a', size = 320 }: MockAstrolabeProps) {
  const rOuter = 132
  const rSign = 112
  const rHouse = 92
  const rPlanet = 58
  const rCore = 40

  return (
    <div
      className="relative mx-auto shrink-0"
      style={{ width: size, height: size }}
      role="img"
      aria-label="微缩星盘教学模型：内圈为行星、外圈为星座、扇形为宫位、中心连线为相位"
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${VIEW} ${VIEW}`}
        className="absolute inset-0"
      >
        <defs>
          <radialGradient id="mock-core" cx="50%" cy="50%">
            <stop offset="0%" stopColor={accent} stopOpacity="0.16" />
            <stop offset="100%" stopColor={accent} stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* ---------- 中心柔光 ---------- */}
        <circle cx={C} cy={C} r={rCore * 1.8} fill="url(#mock-core)" />

        {/* ---------- 宫位扇区（舞台） ---------- */}
        <g key="mock-sectors">
          {Array.from({ length: 12 }, (_, i) => {
            const a1 = i * SECTOR
            const a2 = a1 + SECTOR
            const p1 = toXY(a1, rHouse)
            const p2 = toXY(a2, rHouse)
            return (
              <path
                key={`sector-${i}`}
                d={`M ${C} ${C} L ${p1.x.toFixed(2)} ${p1.y.toFixed(
                  2,
                )} A ${rHouse} ${rHouse} 0 0 1 ${p2.x.toFixed(2)} ${p2.y.toFixed(
                  2,
                )} Z`}
                fill={accent}
                fillOpacity={i % 2 === 0 ? 0.07 : 0.025}
                stroke={accent}
                strokeOpacity={0.28}
                strokeWidth={0.8}
              />
            )
          })}
        </g>

        {/* ---------- 三层圆环 ---------- */}
        <circle
          cx={C}
          cy={C}
          r={rOuter}
          fill="none"
          stroke={accent}
          strokeOpacity={0.5}
          strokeWidth={1.1}
        />
        <circle
          cx={C}
          cy={C}
          r={rSign}
          fill="none"
          stroke={accent}
          strokeOpacity={0.34}
          strokeWidth={0.8}
        />
        <circle
          cx={C}
          cy={C}
          r={rHouse}
          fill="none"
          stroke={accent}
          strokeOpacity={0.42}
          strokeWidth={0.9}
        />
        <circle
          cx={C}
          cy={C}
          r={rPlanet}
          fill="none"
          stroke={accent}
          strokeOpacity={0.22}
          strokeWidth={0.7}
          strokeDasharray="2 4"
        />

        {/* ---------- 十二宫刻度（外圈短线） ---------- */}
        <g key="mock-ticks">
          {Array.from({ length: 72 }, (_, i) => {
            const lon = i * 5
            const isMajor = i % 6 === 0
            const r1 = rOuter
            const r2 = rOuter + (isMajor ? 7 : 3.5)
            const a = toXY(lon, r1)
            const b = toXY(lon, r2)
            return (
              <line
                key={`tick-${i}`}
                x1={a.x.toFixed(2)}
                y1={a.y.toFixed(2)}
                x2={b.x.toFixed(2)}
                y2={b.y.toFixed(2)}
                stroke={accent}
                strokeOpacity={isMajor ? 0.6 : 0.28}
                strokeWidth={isMajor ? 1.1 : 0.6}
              />
            )
          })}
        </g>

        {/* ---------- 假星座符号（最外圈 · 戏服） ---------- */}
        <g key="mock-signs">
          {FAKE_SIGNS.map((s) => {
            const p = toXY(s.lon, rSign)
            return (
              <text
                key={`sign-${s.lon}`}
                x={p.x}
                y={p.y}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={17}
                fill={accent}
                fillOpacity={0.92}
              >
                {s.glyph}
              </text>
            )
          })}
        </g>

        {/* ---------- 假行星符号（内圈 · 演员） ---------- */}
        <g key="mock-planets">
          {FAKE_PLANETS.map((p, i) => {
            const pos = toXY(p.lon, rPlanet)
            return (
              <g key={`planet-${p.lon}`}>
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={8.5}
                  fill="#000"
                  fillOpacity={0.55}
                  stroke={accent}
                  strokeOpacity={0.85}
                  strokeWidth={1.1}
                />
                <text
                  x={pos.x}
                  y={pos.y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={11}
                  fill="#fff"
                  fillOpacity={0.95}
                >
                  {p.glyph}
                </text>
                {/* 从行星到中心的细线（暗示落点归属） */}
                <line
                  x1={pos.x}
                  y1={pos.y}
                  x2={C}
                  y2={C}
                  stroke={accent}
                  strokeOpacity={0.14}
                  strokeWidth={0.6}
                />
                {i === 0 && (
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r={13}
                    fill="none"
                    stroke={accent}
                    strokeOpacity={0.4}
                    strokeWidth={0.8}
                    strokeDasharray="2 3"
                  />
                )}
              </g>
            )
          })}
        </g>

        {/* ---------- 中心相位连线（剧情） ---------- */}
        <g key="mock-aspects">
          {FAKE_ASPECTS.map(([a, b], i) => {
            const p1 = toXY(a, rPlanet)
            const p2 = toXY(b, rPlanet)
            return (
              <line
                key={`aspect-${i}`}
                x1={p1.x.toFixed(2)}
                y1={p1.y.toFixed(2)}
                x2={p2.x.toFixed(2)}
                y2={p2.y.toFixed(2)}
                stroke={accent}
                strokeOpacity={0.7}
                strokeWidth={1.2}
                strokeDasharray={i === 0 ? '4 3' : undefined}
              />
            )
          })}
          <circle
            cx={C}
            cy={C}
            r={rCore}
            fill="#000"
            fillOpacity={0.35}
            stroke={accent}
            strokeOpacity={0.3}
            strokeWidth={0.8}
          />
        </g>

        {/* ============================================================
             四个教学锚点 —— 发光圆点 + 引出线 + 序号
             与右侧文字说明一一对应。
             ============================================================ */}
        <g key="mock-anchors">
          {ANCHORS.map((a) => {
            const p = toXY(a.lon, a.r)
            // 引出方向：指向画布外侧
            const ang = ((90 - a.lon) * Math.PI) / 180
            const tipX = p.x + Math.cos(ang) * a.len
            const tipY = p.y - Math.sin(ang) * a.len
            const labelX = p.x + Math.cos(ang) * (a.len + 14)
            const labelY = p.y - Math.sin(ang) * (a.len + 14)
            return (
              <g key={a.n}>
                {/* 引出线 */}
                <line
                  x1={p.x.toFixed(2)}
                  y1={p.y.toFixed(2)}
                  x2={tipX.toFixed(2)}
                  y2={tipY.toFixed(2)}
                  stroke={accent}
                  strokeOpacity={0.75}
                  strokeWidth={1}
                />
                {/* 发光锚点 */}
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={8}
                  fill={accent}
                  fillOpacity={0.18}
                  stroke={accent}
                  strokeOpacity={0.95}
                  strokeWidth={1.3}
                />
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={3.2}
                  fill={accent}
                  fillOpacity={1}
                />
                {/* 序号 */}
                <text
                  x={labelX}
                  y={labelY}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={12}
                  fontWeight="700"
                  fill={accent}
                >
                  {a.n}
                </text>
              </g>
            )
          })}
        </g>
      </svg>
    </div>
  )
}

/** 四个教学锚点的位置定义（与图上的编号一一对应） */
const ANCHORS = [
  /** 1 · 行星（演员）—— 指向内圈的一个行星符号 */
  { n: '1', lon: 168, r: 58, len: 40 },
  /** 2 · 星座（戏服）—— 指向最外圈的一个星座符号 */
  { n: '2', lon: 105, r: 112, len: 30 },
  /** 3 · 宫位（舞台）—— 指向一个被切分的扇区边缘 */
  { n: '3', lon: 255, r: 92, len: 32 },
  /** 4 · 相位（剧情）—— 指向中心的一条连线 */
  { n: '4', lon: 42, r: 30, len: 34 },
]

