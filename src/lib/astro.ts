/* ============================================================
 *  天文基础计算
 *
 *  行星位置：J2000 轨道要素 → 开普勒方程 → 日心黄道直角坐标
 *  月亮位置：Schlyter 轨道要素 + 主要摄动项
 *  上升点：迭代求解地平线交点
 * ============================================================ */

const J2000 = 2451545.0
const MOD = 360
const DEG = Math.PI / 180

const rad = (d: number) => d * DEG
const deg = (r: number) => r / DEG
const norm = (d: number) => ((d % MOD) + MOD) % MOD

interface Orbit {
  /** 半长轴（AU） */
  a: number
  /** 偏心率 */
  e: number
  /** 轨道倾角（度） */
  I: number
  /** J2000 平黄经 L（度） */
  L: number
  /** 近日点黄经 ϖ（度） */
  peri: number
  /** 升交点黄经 Ω（度） */
  node: number
  /** 平近点角速率（度/天），由开普勒第三定律推得 */
  n: number
  cn: string
}

/** 由半长轴计算平近点角速率（度/天） */
function meanMotion(a: number): number {
  const periodDays = 365.256363004 * Math.pow(a, 1.5)
  return 360 / periodDays
}

/** 行星轨道要素（J2000） */
const ORBITS: Record<string, Orbit> = {
  earth: {
    a: 1.00000011, e: 0.01671022, I: 0,
    L: 100.46435, peri: 102.93768, node: 0, n: 0, cn: '地球',
  },
  mercury: {
    a: 0.387098, e: 0.205635, I: 7.0049,
    L: 252.250323, peri: 77.45645, node: 48.330765, n: 0, cn: '水星',
  },
  venus: {
    a: 0.723335, e: 0.006776, I: 3.3946,
    L: 181.979099, peri: 131.602467, node: 76.679842, n: 0, cn: '金星',
  },
  mars: {
    a: 1.523710, e: 0.093394, I: 1.8497,
    L: -4.553432, peri: -23.943629, node: 49.559538, n: 0, cn: '火星',
  },
  jupiter: {
    a: 5.202887, e: 0.048386, I: 1.3043,
    L: 34.396440, peri: 14.728479, node: 100.473909, n: 0, cn: '木星',
  },
  saturn: {
    a: 9.536676, e: 0.053862, I: 2.4859,
    L: 49.954244, peri: 92.598878, node: 113.662424, n: 0, cn: '土星',
  },
  uranus: {
    a: 19.189165, e: 0.047257, I: 0.7726,
    L: 313.238104, peri: 170.954276, node: 74.016925, n: 0, cn: '天王星',
  },
  neptune: {
    a: 30.069923, e: 0.008590, I: 1.7700,
    L: -55.120029, peri: 44.964762, node: 131.784225, n: 0, cn: '海王星',
  },
}

for (const key of Object.keys(ORBITS)) {
  ORBITS[key].n = meanMotion(ORBITS[key].a)
}

export const PLANET_CN: Record<string, string> = Object.fromEntries(
  Object.entries(ORBITS)
    .filter(([k]) => k !== 'earth')
    .map(([k, v]) => [k, v.cn]),
)

/** 由年月日计算儒略日（格里高利历） */
export function toJulianDay(year: number, month: number, day: number): number {
  let y = year
  let m = month
  if (m <= 2) {
    y -= 1
    m += 12
  }
  const a = Math.floor(y / 100)
  const b = 2 - a + Math.floor(a / 4)
  return (
    Math.floor(365.25 * (y + 4716)) +
    Math.floor(30.6001 * (m + 1)) +
    day +
    b -
    1524.5
  )
}

/** 解开普勒方程（牛顿迭代） */
function solveKepler(M: number, e: number): number {
  const m = norm(M)
  let E = m + (e * Math.sin(rad(m)) * (1 + e * Math.cos(rad(m)))) / (1 - e)
  for (let i = 0; i < 12; i++) {
    const dM = m - (E - e * Math.sin(rad(E)))
    const dE = dM / (1 - e * Math.cos(rad(E)))
    E += dE
    if (Math.abs(dE) < 1e-10) break
  }
  return E
}

/** 日心黄道直角坐标 */
function heliocentricRect(
  key: string,
  jd: number,
): { x: number; y: number } {
  const el = ORBITS[key]
  const d = jd - J2000
  const M = norm(el.L - el.peri)
  const E = solveKepler(M + el.n * d, el.e)
  const xp = el.a * (Math.cos(rad(E)) - el.e)
  const yp = el.a * Math.sqrt(1 - el.e * el.e) * Math.sin(rad(E))

  const w = rad(el.peri - el.node) // 近日点相对升交点的角距
  const O = rad(el.node)
  const I = rad(el.I)

  const cw = Math.cos(w), sw = Math.sin(w)
  const cO = Math.cos(O), sO = Math.sin(O)
  const cI = Math.cos(I)

  const x =
    (cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp
  const y =
    (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp
  return { x, y }
}

/** 太阳的地心黄经 */
export function sunLongitude(jd: number): number {
  const e = heliocentricRect('earth', jd)
  return norm(deg(Math.atan2(-e.y, -e.x)))
}

/** 行星的地心黄经 */
export function planetLongitude(key: string, jd: number): number {
  const p = heliocentricRect(key, jd)
  const e = heliocentricRect('earth', jd)
  return norm(deg(Math.atan2(p.y - e.y, p.x - e.x)))
}

/**
 * 月亮的地心视黄经
 * 采用 Jean Meeus《Astronomical Algorithms》第 47 章的截断 ELP-2000/82 级数
 * 精度约 ±0.3°，满足占星用途。
 */
export function moonLongitude(jd: number): number {
  const d = jd - J2000
  const t = d / 36525

  // 基本天文参数
  const Lp = norm(218.3164477 + 13.17639648 * d) // 月亮平黄经
  const Mm = norm(134.9633964 + 13.0649929509 * d) // 月亮平近点角 M'
  const Ms = norm(357.5291092 + 0.98560028 * d) // 太阳平近点角 M
  const F = norm(93.272095 + 13.22935024 * d) // 升交点角距
  const D = norm(297.8501921 + 12.19074912 * d) // 平距角

  const A1 = norm(119.75 + 131.849 * t)
  const A2 = norm(53.09 + 479264.29 * t)
  const A3 = norm(313.45 + 481266.484 * t)

  // 偏心率修正因子（随时间缓慢变化）
  const E = 1 - 0.002516 * t - 0.0000074 * t * t

  // Meeus 表 47.A：[D, M, M', F, Σl(1e-6 度), 偏心率指数]
  type Term = [number, number, number, number, number, number]
  const TERMS: Term[] = [
    [0, 0, 1, 0, 6288774, 0],
    [2, 0, -1, 0, 1274027, 0],
    [2, 0, 0, 0, 658314, 0],
    [0, 0, 2, 0, 213618, 0],
    [0, 1, 0, 0, -185116, 1],
    [0, 0, 0, 2, -114332, 0],
    [2, 0, -2, 0, 58793, 0],
    [2, -1, -1, 0, 57066, 0],
    [2, 0, 1, 0, 53322, 0],
    [0, 1, -1, 0, 45758, 1],
    [0, 1, 1, 0, -40923, 1],
    [1, 0, 0, 0, -34720, 0],
    [0, 0, 1, 2, -30383, 1],
    [2, 0, 0, -2, 15327, 0],
    [0, 0, 1, -2, 12528, 0],
    [0, 0, 1, 2, 10980, 0],
    [4, 0, -1, 0, 10675, 0],
    [0, 0, 3, 0, 10034, 0],
    [4, 0, -2, 0, 8548, 0],
    [2, 1, -1, 0, -7888, 0],
    [2, 1, 0, 0, -6766, 0],
    [1, 0, -1, 0, -5163, 0],
    [1, 1, 0, 0, 4987, 1],
    [2, -1, 0, 0, 4036, 1],
    [2, 0, 2, 0, 3994, 0],
    [4, 0, 0, 0, 3861, 0],
    [2, 0, -3, 0, 3665, 0],
    [0, 1, -2, 0, -2689, 0],
    [2, 0, -1, 2, -2602, 0],
    [2, -1, -2, 0, 2392, 0],
    [1, 0, 1, 0, -2348, 0],
    [2, -2, 0, 0, 2236, 1],
    [0, 1, 2, 0, -2120, 0],
    [0, 2, 0, 0, -2069, 0],
    [2, -2, -1, 0, 2048, 0],
    [2, 0, 1, -2, -1773, 0],
    [2, 0, 0, 2, -1595, 0],
    [0, 0, 2, 2, -1215, 0],
    [4, -1, -1, 0, 1110, 0],
    [0, 0, 0, 2, -892, 0],
    [4, -1, -2, 0, 810, 0],
    [0, 0, 1, -2, 759, 0],
    [2, 0, -2, 2, -713, 0],
    [2, -1, 0, -2, -700, 0],
    [2, 0, 2, -2, 0, 0],
    [2, -1, -1, 2, 0, 0],
    [2, 0, 2, 2, -514, 0],
    [2, 0, -3, 2, 0, 0],
    [2, 1, -1, 2, 0, 0],
    [2, -1, 0, 2, 492, 0],
    [4, 0, 1, 0, 0, 0],
    [2, 0, 0, -4, 0, 0],
    [3, 0, -1, 0, 0, 0],
    [0, 2, -1, 0, 0, 0],
    [2, 1, 0, 2, 0, 0],
    [2, 0, 3, 0, 0, 0],
    [2, 0, -1, -2, 0, 0],
    [2, 0, 1, 2, 0, 0],
    [2, 0, 0, 2, 0, 0],
    [4, -1, 0, 0, 0, 0],
    [2, -2, 0, -2, 0, 0],
    [0, 1, 0, -2, 0, 0],
    [2, 0, -2, -2, 0, 0],
    [2, 0, 3, -2, 0, 0],
    [2, 0, -1, -4, 0, 0],
    [1, 0, 0, -2, 0, 0],
    [2, -1, 0, -4, 0, 0],
    [0, 0, 0, -2, 0, 0],
    [2, -1, -2, -2, 0, 0],
    [1, 0, 1, 2, 0, 0],
    [2, 0, 0, 4, 0, 0],
    [4, -1, -1, -2, 0, 0],
    [0, 0, 1, 4, 0, 0],
  ]

  let sum = 0
  for (const [dD, dM, dMm, dF, coef, eccExp] of TERMS) {
    if (coef === 0) continue
    const factor = eccExp === 0 ? 1 : eccExp === 1 ? E : E * E
    const arg = dD * D + dM * Ms + dMm * Mm + dF * F
    sum += coef * factor * Math.sin(rad(arg))
  }

  // 金星与木星的附加摄动项
  sum +=
    3958 * Math.sin(rad(A1)) +
    1962 * Math.sin(rad(Lp - F)) +
    318 * Math.sin(rad(A2))

  // 地球扁率的附加项
  sum +=
    -2235 * Math.sin(rad(Lp)) +
    382 * Math.sin(rad(A3)) +
    175 * Math.sin(rad(A1 - F)) +
    175 * Math.sin(rad(A1 + F)) +
    127 * Math.sin(rad(Lp - Mm)) -
    115 * Math.sin(rad(Lp + Mm))

  return norm(Lp + sum / 1_000_000)
}

/**
 * 统一入口：返回地心视黄经
 */
export function geocentricLongitude(key: string, jd: number): number {
  if (key === 'sun') return sunLongitude(jd)
  if (key === 'moon') return moonLongitude(jd)
  return planetLongitude(key, jd)
}

/** 地心黄经 + 逆行判定（有限差分） */
export function planetaryLongitude(
  key: string,
  jd: number,
): { lon: number; retrograde: boolean } {
  const lon = geocentricLongitude(key, jd)
  const lonNext = geocentricLongitude(key, jd + 0.5)
  let delta = norm(lonNext - lon)
  if (delta > 180) delta -= 360
  return { lon, retrograde: delta < 0 }
}

/* ---------- 上升点 ---------- */

/** 本地恒星时（度） */
export function localSiderealTime(jd: number, longitude: number): number {
  const d = jd - 2451545.0
  const gmst = norm(280.46061837 + 360.98564736629 * d)
  return norm(gmst + longitude)
}

/**
 * 上升点黄经（Ascendant）
 *
 * 黄道坐标 (λ, β) -> 赤道坐标 (α, δ)：
 *   sin δ = sin β·cos ε + cos β·sin ε·sin λ
 *   α    = atan2(sin λ·cos ε - tan β·sin ε, cos λ)
 *
 * 上升点位于东方地平线：其时角 H = -H0，其中
 *   cos H0 = (sin φ·sin δ + sin ε·sin β) / (cos φ·cos δ)
 *   H0     = RAMC - α  （升出）
 *
 * 由 H 反推黄经：给定 RAMC 与 H，反算 α = RAMC - H，
 * 再由 α 与 δ 求 λ（β=0 时有解析解）。
 */
export function ascendantLongitude(
  jd: number,
  longitude: number,
  latitude: number,
): number {
  const eps = rad(23.4392911)
  const phi = rad(latitude)
  const ramc = localSiderealTime(jd, longitude) // 赤经（度）

  // 以 λ = ramc + 90° 作为初值，迭代 12 次
  let lambda = norm(ramc + 90)

  for (let i = 0; i < 12; i++) {
    const sl = Math.sin(rad(lambda))
    const cl = Math.cos(rad(lambda))

    // 赤道坐标
    const delta = Math.asin(sl * Math.sin(eps))
    const alpha = deg(Math.atan2(sl * Math.cos(eps), cl))

    // 时角 H = RAMC - alpha（东为负）
    let H = ramc - alpha
    if (H > 180) H -= 360
    if (H < -180) H += 360

    // 上升条件：cos H = tan φ · tan δ
    const target = Math.atan2(
      Math.tan(phi) * Math.tan(delta),
      1,
    )

    // 直接求解：要求 H = -H0 且 H0 ∈ (-90°, 90°)
    // cos(-H0) = tan φ tan δ  =>  H0 = acos(tan φ tan δ)
    const cosH0 = Math.tan(phi) * Math.tan(delta)
    if (cosH0 <= -1 || cosH0 >= 1) break
    const H0 = deg(Math.acos(cosH0))

    // 上升点：alpha = RAMC - H0  =>  H = -H0
    const targetAlpha = norm(ramc - H0)

    // 由赤经反推黄经（β = 0）
    const nextLambda = norm(
      deg(
        Math.atan2(
          Math.sin(rad(targetAlpha)) * Math.cos(eps),
          Math.cos(rad(targetAlpha)),
        ),
      ),
    )

    if (Math.abs(norm(nextLambda - lambda + 180) - 180) < 1e-7) {
      lambda = nextLambda
      break
    }
    lambda = nextLambda
    void H
    void target
  }

  return norm(lambda)
}
