import { createRequire } from 'node:module'

/* ============================================================
 *  真实天体星历引擎（Swiss Ephemeris / sweph）
 *
 *  v4.0：
 *  · 彻底告别前端「视觉模型」占星 —— 所有黄经、宫位、上升点
 *    均由专业天文算法包在 Node.js 后端计算。
 *  · sweph 捆绑了 Moshier 星历表，无需任何外部 .se1 文件，
 *    因此完全离线可用（行星黄经误差 < 0.01°）。
 *  · 宫位系统使用 Placidus（占星界最通用的时相宫制），
 *    严格依赖用户出生地的经纬度。
 * ============================================================ */

const require = createRequire(import.meta.url)
const sweph = require('sweph')
const { constants } = sweph

/* ---------------- 行星映射 ---------------- */

/** 行星编号 → 内部键 / 中文名 / 符号 */
export const PLANETS = [
  { id: 0, key: 'sun', cn: '太阳', glyph: '☉' },
  { id: 1, key: 'moon', cn: '月亮', glyph: '☽' },
  { id: 2, key: 'mercury', cn: '水星', glyph: '☿' },
  { id: 3, key: 'venus', cn: '金星', glyph: '♀' },
  { id: 4, key: 'mars', cn: '火星', glyph: '♂' },
  { id: 5, key: 'jupiter', cn: '木星', glyph: '♃' },
  { id: 6, key: 'saturn', cn: '土星', glyph: '♄' },
  { id: 7, key: 'uranus', cn: '天王星', glyph: '♅' },
  { id: 8, key: 'neptune', cn: '海王星', glyph: '♆' },
]

/**
 * 计算标志。
 *
 * sweph 捆绑了 Moshier 星历表（无需外部 .se1 文件），行星黄经精度
 * 优于 0.01°，对占星用途绰绰有余，且完全离线可用。
 * 显式指定 SEFLG_MOSEPH 可避免 Swiss 星历缺失文件时的回退告警。
 */
const FLAGS = constants.SEFLG_MOSEPH | constants.SEFLG_SPEED

/* ---------------- 基础工具 ---------------- */

const norm = (d) => ((d % 360) + 360) % 360

/** 把「本地日期 + 本地时间 + 时区偏移」转换为世界时儒略日 */
export function localToJulianDay(date, time, timezoneOffsetHours) {
  const [y, mo, d] = date.split('-').map(Number)
  const [h, mi] = (time && time.trim() ? time : '12:00').split(':').map(Number)
  const hour = Number.isFinite(h) ? h : 12
  const minute = Number.isFinite(mi) ? mi : 0

  // 先把本地时间换算成世界时（UTC）的日期分量，再交给儒略日算法
  const utcMs =
    Date.UTC(y, mo - 1, d, hour, minute, 0) -
    (Number(timezoneOffsetHours) || 0) * 3600_000
  const utc = new Date(utcMs)

  return sweph.julday(
    utc.getUTCFullYear(),
    utc.getUTCMonth() + 1,
    utc.getUTCDate(),
    utc.getUTCHours() + utc.getUTCMinutes() / 60 + utc.getUTCSeconds() / 3600,
    constants.SE_GREG_CAL,
  )
}

/** 儒略日 -> JS Date（世界时） */
export function julianToDate(jd) {
  return new Date((jd - 2440587.5) * 86_400_000)
}

/**
 * 计算一组天体的地心视黄经。
 * @returns {Array<{key,cn,glyph,longitude,speed,retrograde}>}
 */
export function planetaryPositions(jd) {
  return PLANETS.map((p) => {
    const res = sweph.calc_ut(jd, p.id, FLAGS)
    if (!res || !res.data) {
      throw new Error(`星历计算失败：${p.cn}`)
    }
    const longitude = norm(res.data[0])
    const speed = res.data[3]
    return {
      key: p.key,
      cn: p.cn,
      glyph: p.glyph,
      longitude,
      speed,
      // 太阳与月亮不会逆行；其余行星速度为负即逆行
      retrograde:
        p.key === 'sun' || p.key === 'moon' ? false : speed < 0,
    }
  })
}

/**
 * 计算宫位系统（Placidus）与上升点 / 天顶。
 * 经纬度直接决定上升星座与十二宫划分 —— 这是地理算法介入的核心。
 */
export function houseSystem(jd, latitude, longitude, hsys = 'P') {
  const res = sweph.houses(jd, latitude, longitude, hsys)
  if (res.flag !== constants.OK) {
    throw new Error(`宫位计算失败：${res.error ?? '未知错误'}`)
  }
  const cusps = Array.from(res.data.houses).map((v) => norm(v))
  const points = Array.from(res.data.points)
  return {
    cusps,
    ascendant: norm(points[0]),
    midheaven: norm(points[1]),
    armc: norm(points[2]),
    vertex: norm(points[3]),
    system: hsys,
    systemName: HOUSE_SYSTEM_CN[hsys] ?? hsys,
  }
}

/** 宫制中文名 */
export const HOUSE_SYSTEM_CN = {
  P: 'Placidus 时相宫',
  K: 'Koch 出生宫',
  W: 'Whole Sign 整象宫',
  E: 'Equal 等分宫',
  B: 'Equal (Birch) 等分宫',
  C: 'Campanus 坎帕努斯宫',
  M: 'Morinus 莫里纽斯宫',
  R: 'Regiomontanus 雷吉奥蒙塔努斯宫',
  O: 'Porphyry 波菲里宫',
  A: 'Alcabitius 阿尔卡比提斯宫',
  V: 'Equal Vehlow 等分宫',
}

/**
 * 主入口：由出生信息计算完整本命盘。
 *
 * @param {object} input
 * @param {string} input.date         出生日期 YYYY-MM-DD
 * @param {string} [input.time]       出生时刻 HH:mm（缺省按正午 12:00）
 * @param {number} input.latitude     纬度（北纬为正）
 * @param {number} input.longitude    经度（东经为正）
 * @param {number} [input.timezone]   时区偏移（小时，东八区为 8）
 */
export function computeNatalChart(input) {
  const {
    date,
    time = '12:00',
    latitude,
    longitude,
    timezone = 8,
  } = input

  if (!date) throw new Error('缺少出生日期')
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error('缺少出生地经纬度')
  }

  const jd = localToJulianDay(date, time, timezone)
  const planets = planetaryPositions(jd)
  const houses = houseSystem(jd, latitude, longitude, 'P')

  return {
    source: 'swiss-ephemeris',
    engine: `sweph ${sweph.version?.() ?? ''}`.trim(),
    jd,
    utc: julianToDate(jd).toISOString(),
    houseSystem: houses.system,
    houseSystemName: houses.systemName,
    ascendant: houses.ascendant,
    midheaven: houses.midheaven,
    armc: houses.armc,
    vertex: houses.vertex,
    cusps: houses.cusps,
    planets,
    coordinates: { latitude, longitude, timezone },
  }
}

/**
 * 行运（Transit）—— 用于日 / 月 / 年运势的周期趋势。
 * 返回「此刻」「30 天后」「365 天后」三组天体位置，
 * 前端据此判断每个维度是在上升、平台期还是回落。
 */
export function computeTransits(input) {
  const {
    latitude = 0,
    longitude = 0,
    timezone = 8,
    date = new Date().toISOString().slice(0, 10),
    time = '12:00',
  } = input

  const jd = localToJulianDay(date, time, timezone)
  const now = planetaryPositions(jd)
  const month = planetaryPositions(jd + 30)
  const year = planetaryPositions(jd + 365)

  return {
    source: 'swiss-ephemeris',
    jd,
    now,
    month,
    year,
  }
}

/**
 * 相位检测（占星相位容许角）。
 * @param {Array<{key:string,cn:string,longitude:number}>} positions
 */
export function computeAspects(positions) {
  const ASPECTS = [
    [0, '合相', 'Conjunction', 8],
    [60, '六分相', 'Sextile', 4],
    [90, '四分相', 'Square', 7],
    [120, '三分相', 'Trine', 7],
    [180, '对分相', 'Opposition', 7],
  ]

  const out = []
  for (let i = 0; i < positions.length; i++) {
    for (let j = i + 1; j < positions.length; j++) {
      const a = positions[i]
      const b = positions[j]
      const raw = Math.abs(norm(a.longitude - b.longitude))
      const sep = raw > 180 ? 360 - raw : raw
      for (const [angle, cn, en, orb] of ASPECTS) {
        if (Math.abs(sep - angle) <= orb) {
          out.push({
            a: a.key,
            b: b.key,
            aCn: a.cn,
            bCn: b.cn,
            type: en,
            cn,
            orb: Number(Math.abs(sep - angle).toFixed(2)),
            angle: Number(angle.toFixed(1)),
          })
          break
        }
      }
    }
  }
  return out
}
