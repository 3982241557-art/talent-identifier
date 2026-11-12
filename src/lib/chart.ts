import type {
  BirthInput,
  Chart,
  Element,
  House,
  MbtiProfile,
  PlanetPlacement,
  SignMeta,
  Verdict,
} from '../types.ts'
import { SIGNS } from '../data/signs.ts'
import {
  planetaryLongitude,
  toJulianDay,
  ascendantLongitude,
  PLANET_CN,
} from './astro.ts'
import { shichenOfKey } from './calendar.ts'
import { postChart, type EphemerisChart } from './api.ts'

/* ============================================================
 *  命盘推演：落座 / 宫位 / 相位 / 元素 / 灵魂底色
 *
 *  v4.0：数据源升级为「后端真实星历」。
 *  · 优先请求后端 Swiss Ephemeris（真实黄经 + Placidus 宫位 + 上升点）。
 *  · 后端不可用时回落到本地 Meeus 近似算法，功能永不中断。
 * ============================================================ */

const MOD = 360
const norm = (d: number) => ((d % MOD) + MOD) % MOD

/** 黄经 -> 星座 */
export function signOf(lon: number): SignMeta {
  return SIGNS[Math.floor(norm(lon) / 30)]
}

/** 黄经 -> 星座内度数 */
export function degreeInSign(lon: number): number {
  return norm(lon) % 30
}

/** 本地恒星时（度） */
export function localSiderealTime(jd: number, longitude: number): number {
  const d = jd - 2451545.0
  const gmst = norm(280.46061837 + 360.98564736629 * d)
  return norm(gmst + longitude)
}

/**
 * 上升点黄经（Ascendant）
 * 委托 astro 模块的迭代求解（本地兜底路径）
 */
export function risingLongitude(
  jd: number,
  longitude: number,
  latitude: number,
): number {
  return ascendantLongitude(jd, longitude, latitude)
}

/** 12 宫：自上升点起每 30 度（本地兜底路径） */
export function computeHouses(risingLon: number): House[] {
  return Array.from({ length: 12 }, (_, i) => {
    const lon = norm(risingLon + i * 30)
    return {
      house: i + 1,
      sign: signOf(lon),
      degree: degreeInSign(lon),
      longitude: lon,
    }
  })
}

/**
 * 黄经落在第几宫。
 * v4.0：支持真实宫头 —— 用「下一个宫头」来界定宫位范围，
 * 而非简单的 30° 均分。
 */
export function houseOf(lon: number, risingLon: number, cusps?: number[]): number {
  if (!cusps || cusps.length !== 12) {
    return Math.floor(norm(lon - risingLon) / 30) + 1
  }
  const l = norm(lon)
  for (let i = 0; i < 12; i++) {
    const start = norm(cusps[i])
    const end = norm(cusps[(i + 1) % 12])
    const span = norm(end - start)
    const offset = norm(l - start)
    if (offset < span) return i + 1
  }
  return 12
}

/* ---------- 相位 ---------- */
const ASPECTS: Array<[number, string, string]> = [
  [0, '合相', 'Conjunction'],
  [60, '六分相', 'Sextile'],
  [90, '四分相', 'Square'],
  [120, '三分相', 'Trine'],
  [180, '对分相', 'Opposition'],
]

export function computeAspects(
  positions: Array<{ key: string; lon: number; cn?: string }>,
): Chart['aspects'] {
  const out: Chart['aspects'] = []
  for (let i = 0; i < positions.length; i++) {
    for (let j = i + 1; j < positions.length; j++) {
      const a = positions[i]
      const b = positions[j]
      const raw = Math.abs(norm(a.lon - b.lon))
      const sep = raw > 180 ? 360 - raw : raw
      for (const [angle, cn, en] of ASPECTS) {
        if (Math.abs(sep - angle) <= 6) {
          out.push({
            a: a.key,
            b: b.key,
            aCn: a.cn,
            bCn: b.cn,
            type: en,
            cn,
          })
          break
        }
      }
    }
  }
  return out
}

/* ---------- 元素能量 ---------- */
export function computeElements(
  placements: PlanetPlacement[],
): Record<Element, number> {
  const base: Record<Element, number> = { fire: 20, earth: 20, air: 20, water: 20 }
  const weights: Record<string, number> = {
    sun: 6,
    moon: 5,
    mercury: 2,
    venus: 3,
    mars: 3,
    jupiter: 2.5,
    saturn: 2.5,
    uranus: 1.5,
    neptune: 1.5,
  }
  for (const p of placements) {
    base[p.sign.element] += weights[p.planet] ?? 1
  }
  const total = Object.values(base).reduce((a, b) => a + b, 0)
  const out = {} as Record<Element, number>
  for (const k of Object.keys(base) as Element[]) {
    out[k] = Math.round((base[k] / total) * 100)
  }
  return out
}

/* ============================================================
 *  灵魂底色生成 —— 去魔幻化
 *
 *  要求：基于用户的 5 个 MBTI 答案 + 星盘基础，
 *  生成一句「高度凝练、具体且具有描述性词汇」的专属灵魂底色。
 *  结构：<星盘事实> + <性格事实> + <张力>，
 *  核心词汇会被抽出用于主题色高亮。
 * ============================================================ */

/** 星座 → 具体描述性词汇（不是"如火"这类意象，而是行为描述） */
const SIGN_BEHAVIOR: Record<string, string> = {
  aries: '先动手再解释',
  taurus: '把决定做得很慢',
  gemini: '同时开好几条线',
  cancer: '先确认关系是否安全',
  leo: '需要被看见才安心',
  virgo: '把细节做到挑不出错',
  libra: '反复衡量别人的感受',
  scorpio: '不碰到底线就不放手',
  sagittarius: '留出随时出发的余地',
  capricorn: '把结果放在感受之前',
  aquarius: '和所有人保持一点距离',
  pisces: '边界感天然稀薄',
}

/** MBTI 字母 → 具体描述性词汇 */
const MBTI_BEHAVIOR: Record<string, string> = {
  E: '先从人群里获得能量',
  I: '先独处才能想清楚',
  N: '习惯先找背后的意义',
  S: '只信看得见的证据',
  T: '把判断放在情绪之前',
  F: '先照顾关系再谈对错',
  J: '喜欢提前把路铺好',
  P: '留白处才有活路',
}

/** 元素 → 与 MBTI 张力关系的一句话 */
const ELEMENT_TENSION: Record<Element, string> = {
  fire: '热情和克制在同一个身体里拉扯',
  earth: '想要的安稳和不肯停下的脚步互相牵制',
  air: '通透的想法和迟迟不落地的手感并存',
  water: '感受很深，边界却很薄',
}

export function buildVerdict(
  sun: SignMeta,
  moon: SignMeta,
  mbti: MbtiProfile | null,
): Verdict {
  const sunBehavior = SIGN_BEHAVIOR[sun.key] ?? sun.keyword
  const moonBehavior = SIGN_BEHAVIOR[moon.key] ?? moon.keyword

  const mbtiBits = mbti
    ? [
        MBTI_BEHAVIOR[mbti.letters.EI] ?? '',
        MBTI_BEHAVIOR[mbti.letters.TF] ?? '',
      ].filter(Boolean)
    : []

  const tension = ELEMENT_TENSION[sun.element]

  let text: string
  if (mbti) {
    text =
      `你的太阳在${sun.cn}，${sunBehavior}；` +
      `月亮在${moon.cn}，${moonBehavior}；` +
      `${mbti.type} 让你${mbtiBits[0] ?? '有自己的节奏'}，` +
      `却也让你${mbtiBits[1] ?? '难以迁就别人的标准'}——` +
      `${tension}。`
  } else {
    text =
      `你的太阳在${sun.cn}，${sunBehavior}；` +
      `月亮在${moon.cn}，${moonBehavior}——${tension}。`
  }

  // 抽取核心词汇用于主题色高亮
  const keywords = [
    sun.cn,
    moon.cn,
    ...(mbti ? [mbti.type] : []),
    ...(mbti ? mbti.traits.slice(0, 2) : []),
  ].filter(Boolean)

  const highlights = keywords.filter((k) => text.includes(k))

  const coda = mbti
    ? `这不是判决，只是你目前的起点——${mbti.summary}`
    : '这不是判决，只是你目前的起点。'

  return { text, highlights, coda, keywords }
}

/* ============================================================
 *  本地兜底推演（Meeus 近似算法）
 * ============================================================ */
function computeLocalChart(
  input: BirthInput,
  mbti: MbtiProfile | null,
): Chart {
  const [y, mo, d] = input.date.split('-').map(Number)
  const hasTime = Boolean(input.time || input.shichen)

  /*
   * v9.0：时辰输入。
   * 用户选时辰时，按该时辰的中点小时计算（与后端逻辑一致），
   * 保证本地兜底与真实星历给出的结果不会互相矛盾。
   */
  let clock = input.time
  let timePrecision: 'exact' | 'shichen' | 'unknown' = 'unknown'
  let shichenName = ''

  if (input.shichen) {
    const s = shichenOfKey(input.shichen)
    if (s) {
      clock = `${String(s.midHour).padStart(2, '0')}:00`
      timePrecision = 'shichen'
      shichenName = s.name
    }
  } else if (input.time) {
    clock = input.time
    timePrecision = 'exact'
  }

  const [h, mi] = clock ? clock.split(':').map(Number) : [12, 0]

  // 本地时间（默认 UTC+8）转世界时
  const jdLocal = toJulianDay(y, mo, d) + (h + mi / 60) / 24
  const jdUT = jdLocal - 8 / 24

  const sunLon = planetaryLongitude('sun', jdUT).lon
  const moonLon = planetaryLongitude('moon', jdUT).lon
  const risingLon = risingLongitude(jdLocal, input.longitude, input.latitude)

  const sunSign = signOf(sunLon)
  const moonSign = signOf(moonLon)
  const risingSign = signOf(risingLon)

  const planets: PlanetPlacement[] = []
  const positions: Array<{ key: string; lon: number; cn: string }> = [
    { key: 'sun', lon: sunLon, cn: '太阳' },
    { key: 'moon', lon: moonLon, cn: '月亮' },
  ]

  for (const key of [
    'mercury',
    'venus',
    'mars',
    'jupiter',
    'saturn',
    'uranus',
    'neptune',
  ]) {
    const { lon, retrograde } = planetaryLongitude(key, jdUT)
    positions.push({ key, lon, cn: PLANET_CN[key] })
    planets.push({
      planet: key,
      planetCn: PLANET_CN[key],
      glyph: '',
      sign: signOf(lon),
      longitude: lon,
      degree: degreeInSign(lon),
      house: houseOf(lon, risingLon),
      retrograde,
    })
  }

  const houses = computeHouses(risingLon)

  return {
    bigThree: {
      sun: { sign: sunSign, longitude: sunLon, degree: degreeInSign(sunLon) },
      moon: { sign: moonSign, longitude: moonLon, degree: degreeInSign(moonLon) },
      rising: {
        sign: risingSign,
        longitude: risingLon,
        degree: degreeInSign(risingLon),
      },
    },
    planets,
    houses,
    risingLongitude: risingLon,
    midheavenLongitude: norm(risingLon + 270),
    elements: computeElements(planets),
    aspects: computeAspects(positions),
    hasTime,
    verdict: buildVerdict(sunSign, moonSign, mbti),
    source: 'local',
    houseSystemName: 'Equal 等分宫（本地推演）',
    coordinates: {
      latitude: input.latitude,
      longitude: input.longitude,
      timezone: 8,
    },
    /* v9.0：时间精度 */
    timePrecision,
    shichenName,
  }
}

/* ============================================================
 *  真实星历 → Chart
 * ============================================================ */
export function chartFromEphemeris(
  eph: EphemerisChart,
  mbti: MbtiProfile | null,
  hasTime: boolean,
): Chart {
  const byKey = new Map(eph.planets.map((p) => [p.key, p]))

  const sunLon = byKey.get('sun')?.longitude ?? 0
  const moonLon = byKey.get('moon')?.longitude ?? 0
  const risingLon = eph.ascendant

  const sunSign = signOf(sunLon)
  const moonSign = signOf(moonLon)
  const risingSign = signOf(risingLon)

  const planets: PlanetPlacement[] = []
  const positions: Array<{ key: string; lon: number; cn: string }> = []

  for (const p of eph.planets) {
    positions.push({ key: p.key, lon: p.longitude, cn: p.cn })
    if (p.key === 'sun' || p.key === 'moon') continue
    planets.push({
      planet: p.key,
      planetCn: p.cn,
      glyph: p.glyph,
      sign: signOf(p.longitude),
      longitude: p.longitude,
      degree: degreeInSign(p.longitude),
      house: houseOf(p.longitude, risingLon, eph.cusps),
      retrograde: p.retrograde,
    })
  }

  const houses: House[] = eph.cusps.map((lon, i) => ({
    house: i + 1,
    sign: signOf(lon),
    degree: degreeInSign(lon),
    longitude: norm(lon),
  }))

  return {
    bigThree: {
      sun: { sign: sunSign, longitude: sunLon, degree: degreeInSign(sunLon) },
      moon: { sign: moonSign, longitude: moonLon, degree: degreeInSign(moonLon) },
      rising: {
        sign: risingSign,
        longitude: risingLon,
        degree: degreeInSign(risingLon),
      },
    },
    planets,
    houses,
    risingLongitude: risingLon,
    midheavenLongitude: eph.midheaven,
    elements: computeElements(planets),
    aspects: computeAspects(positions),
    hasTime,
    verdict: buildVerdict(sunSign, moonSign, mbti),
    source: 'ephemeris',
    engine: eph.engine,
    houseSystemName: eph.houseSystemName,
    coordinates: eph.coordinates,
    /* v9.0：时间精度 */
    timePrecision: eph.timePrecision ?? (hasTime ? 'exact' : 'unknown'),
    shichenName: eph.shichenName,
  }
}

/* ---------- 主入口 ---------- */

/**
 * 计算本命盘。
 *
 * v4.0：优先使用后端真实星历（Swiss Ephemeris）。
 * 后端不可用时自动回落到本地近似算法，保证界面永远可用。
 *
 * v9.0：支持时辰输入。
 *  · 用户选了时辰（子丑寅卯…）→ 传给后端，按该时辰中点计算。
 *  · 用户没给任何时间 → 按正午推算，标记 timePrecision = 'unknown'。
 */
export async function computeChart(
  input: BirthInput,
  mbti: MbtiProfile | null = null,
): Promise<Chart> {
  const hasTime = Boolean(input.time || input.shichen)

  try {
    const eph = await postChart({
      date: input.date,
      time: input.time || '12:00',
      /* v9.0：时辰优先 —— 有时辰时后端按时辰中点算 */
      shichen: input.shichen || undefined,
      latitude: input.latitude,
      longitude: input.longitude,
      timezone: 8,
      place: input.place,
    })
    return chartFromEphemeris(eph, mbti, hasTime)
  } catch {
    return computeLocalChart(input, mbti)
  }
}

/** 同步版本：仅本地推演（用于不需要真实星历的场景） */
export function computeChartLocal(
  input: BirthInput,
  mbti: MbtiProfile | null = null,
): Chart {
  return computeLocalChart(input, mbti)
}

/* ---------- 主动提问机制 ---------- */
const DAILY_QUESTIONS = [
  '昨日星象火元素躁动，你是否有感到心烦意乱的时候？是怎样让自己平静下来的？',
  '今天的水象格外柔软，你最近有没有一件迟迟无法开口的心事？',
  '风象带来消息与变数，你最近是否听见了某种久违的召唤？',
  '土象提醒你回到地面，你最近是否在为一件事默默积蓄力量？',
  '星盘提示今日适合回望，你有多久没有和自己好好坐一会儿了？',
  '月亮正在换相，你是否感到情绪如潮汐般起伏？是什么在推着你走？',
  '今日的相位安静而深远，你此刻最想向智者请教的问题是什么？',
]

export function dailyQuestion(date = new Date()): string {
  const seed =
    date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate()
  return DAILY_QUESTIONS[seed % DAILY_QUESTIONS.length]
}
