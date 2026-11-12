/* ============================================================
 *  传统历法与时辰 —— 公历 / 农历 / 十二时辰
 *
 *  v9.0 · 任务 2
 *  ------------------------------------------------------------
 *  两件事：
 *
 *  1. **历法切换**
 *     用户输入的日期可能是农历（老一辈习惯用农历记生日）。
 *     这里内置一套 1900–2100 年的农历数据，
 *     支持「农历 → 公历」的正向换算与「公历 → 农历」的展示。
 *
 *  2. **十二时辰**
 *     子丑寅卯辰巳午未申酉戌亥，每个时辰覆盖两个小时。
 *     用户只知道「我是午时生的」而不知道确切钟点时，
 *     可以直接选时辰 —— 后端按该时辰的**中点**计算。
 *
 *  数据来源：标准农历查表法（1900–2100）。
 *  压缩存储：每年用 1 个十六进制字记录大小月与闰月分布。
 * ============================================================ */

/* ---------------- 十二时辰 ---------------- */

export interface Shichen {
  /** 英文 key，如 'zi' */
  key: string
  /** 中文名，如 '子时' */
  name: string
  /** 所属时段，如 '23:00 – 00:59' */
  range: string
  /** 时辰起点小时（0–23） */
  startHour: number
  /** 该时辰对应的中心小时（用于星历计算） */
  midHour: number
  /** 对应的生肖 */
  zodiac: string
  /** 对应的方位 */
  direction: string
}

/**
 * 十二时辰。
 *
 * 起始点采用传统划分：子时从 23:00 开始，丑时 01:00，依次顺推，每段两小时。
 */
export const SHICHEN: Shichen[] = [
  { key: 'zi', name: '子时', range: '23:00 – 00:59', startHour: 23, midHour: 0, zodiac: '鼠', direction: '正北' },
  { key: 'chou', name: '丑时', range: '01:00 – 02:59', startHour: 1, midHour: 2, zodiac: '牛', direction: '北东北' },
  { key: 'yin', name: '寅时', range: '03:00 – 04:59', startHour: 3, midHour: 4, zodiac: '虎', direction: '东北东' },
  { key: 'mao', name: '卯时', range: '05:00 – 06:59', startHour: 5, midHour: 6, zodiac: '兔', direction: '正东' },
  { key: 'chen', name: '辰时', range: '07:00 – 08:59', startHour: 7, midHour: 8, zodiac: '龙', direction: '东东南' },
  { key: 'si', name: '巳时', range: '09:00 – 10:59', startHour: 9, midHour: 10, zodiac: '蛇', direction: '南东南' },
  { key: 'wu', name: '午时', range: '11:00 – 12:59', startHour: 11, midHour: 12, zodiac: '马', direction: '正南' },
  { key: 'wei', name: '未时', range: '13:00 – 14:59', startHour: 13, midHour: 14, zodiac: '羊', direction: '南西南' },
  { key: 'shen', name: '申时', range: '15:00 – 16:59', startHour: 15, midHour: 16, zodiac: '猴', direction: '西西南' },
  { key: 'you', name: '酉时', range: '17:00 – 18:59', startHour: 17, midHour: 18, zodiac: '鸡', direction: '正西' },
  { key: 'xu', name: '戌时', range: '19:00 – 20:59', startHour: 19, midHour: 20, zodiac: '狗', direction: '西西北' },
  { key: 'hai', name: '亥时', range: '21:00 – 22:59', startHour: 21, midHour: 22, zodiac: '猪', direction: '北西北' },
]

/** 由钟点（小时）反查所属时辰 */
export function shichenOfHour(hour: number): Shichen {
  const h = ((Math.floor(hour) % 24) + 24) % 24
  return SHICHEN.find((s) => s.startHour === h) ?? SHICHEN[0]
}

/** 由时辰 key 反查 */
export function shichenOfKey(key: string): Shichen | undefined {
  return SHICHEN.find((s) => s.key === key)
}

/* ---------------- 农历数据（1900–2100） ---------------- */

/**
 * 每年一个十六进制字。
 * 低 4 位表示 12 个月的大小月（1 = 大月 30 天，0 = 小月 29 天）；
 * 高 4 位表示闰月月份（0 = 无闰月）；
 * 0x10000 位表示闰月是大月。
 */
const LUNAR_INFO: number[] = [
  0x04bd8, 0x04ae0, 0x0a570, 0x054d5, 0x0d260, 0x0d950, 0x16554, 0x056a0, 0x09ad0, 0x055d2,
  0x04ae0, 0x0a5b6, 0x0a4d0, 0x0d250, 0x1d255, 0x0b540, 0x0d6a0, 0x0ada2, 0x095b0, 0x14977,
  0x04970, 0x0a4b0, 0x0b4b5, 0x06a50, 0x06d40, 0x1ab54, 0x02b60, 0x09570, 0x052f2, 0x04970,
  0x06566, 0x0d4a0, 0x0ea50, 0x06e95, 0x05ad0, 0x02b60, 0x186e3, 0x092e0, 0x1c8d7, 0x0c950,
  0x0d4a0, 0x1d8a6, 0x0b550, 0x056a0, 0x1a5b4, 0x025d0, 0x092d0, 0x0d2b2, 0x0a950, 0x0b557,
  0x06ca0, 0x0b550, 0x15355, 0x04da0, 0x0a5b0, 0x14573, 0x052b0, 0x0a9a8, 0x0e950, 0x06aa0,
  0x0aea6, 0x0ab50, 0x04b60, 0x0aae4, 0x0a570, 0x05260, 0x0f263, 0x0d950, 0x05b57, 0x056a0,
  0x096d0, 0x04dd5, 0x04ad0, 0x0a4d0, 0x0d4d4, 0x0d250, 0x0d558, 0x0b540, 0x0b6a0, 0x195a6,
  0x095b0, 0x049b0, 0x0a974, 0x0a4b0, 0x0b27a, 0x06a50, 0x06d40, 0x0af46, 0x0ab60, 0x09570,
  0x04af5, 0x04970, 0x064b0, 0x074a3, 0x0ea50, 0x06b58, 0x055c0, 0x0ab60, 0x096d5, 0x092e0,
  0x0c960, 0x0d954, 0x0d4a0, 0x0da50, 0x07552, 0x056a0, 0x0abb7, 0x025d0, 0x092d0, 0x0cab5,
  0x0a950, 0x0b4a0, 0x0baa4, 0x0ad50, 0x055d9, 0x04ba0, 0x0a5b0, 0x15176, 0x052b0, 0x0a930,
  0x07954, 0x06aa0, 0x0ad50, 0x05b52, 0x04b60, 0x0a6e6, 0x0a4e0, 0x0d260, 0x0ea65, 0x0d530,
  0x05aa0, 0x076a3, 0x096d0, 0x04afb, 0x04ad0, 0x0a4d0, 0x1d0b6, 0x0d250, 0x0d520, 0x0dd45,
  0x0b5a0, 0x056d0, 0x055b2, 0x049b0, 0x0a577, 0x0a4b0, 0x0aa50, 0x1b255, 0x06d20, 0x0ada0,
  0x14b63, 0x09370, 0x049f8, 0x04970, 0x064b0, 0x168a6, 0x0ea50, 0x06b20, 0x1a6c4, 0x0aae0,
  0x0a2e0, 0x0d2e3, 0x0c960, 0x0d557, 0x0d4a0, 0x0da50, 0x05d55, 0x056a0, 0x0a6d0, 0x055d4,
  0x052d0, 0x0a9b8, 0x0a950, 0x0b4a0, 0x0b6a6, 0x0ad50, 0x055a0, 0x0aba4, 0x0a5b0, 0x052b0,
  0x0b273, 0x06930, 0x07337, 0x06aa0, 0x0ad50, 0x14b55, 0x04b60, 0x0a570, 0x054e4, 0x0d160,
  0x0e968, 0x0d520, 0x0daa0, 0x16aa6, 0x056d0, 0x04ae0, 0x0a9d4, 0x0a2d0, 0x0d150, 0x0f252,
  0x0d520,
]

/** 农历月名 */
const LUNAR_MONTHS = [
  '正', '二', '三', '四', '五', '六',
  '七', '八', '九', '十', '冬', '腊',
]

/** 农历日名（十位） */
const LUNAR_DAY_TENS = ['初', '十', '廿', '卅']
/** 农历日名（个位） */
const LUNAR_DAY_UNITS = [
  '十', '一', '二', '三', '四', '五', '六', '七', '八', '九',
]

/** 农历某月的天数 */
function lunarMonthDays(y: number, m: number): number {
  if (m < 1 || m > 12) return 30
  return (LUNAR_INFO[y - 1900] & (0x10000 >> m)) ? 30 : 29
}

/** 该农历年的闰月月份（0 = 无闰月） */
function leapMonth(y: number): number {
  return LUNAR_INFO[y - 1900] & 0xf
}

/** 该农历年的闰月天数（无闰月则为 0） */
function leapDays(y: number): number {
  if (leapMonth(y)) return (LUNAR_INFO[y - 1900] & 0x10000) ? 30 : 29
  return 0
}

/** 该农历年的总天数 */
function lunarYearDays(y: number): number {
  let sum = 348 // 12 个月 × 29 天
  for (let i = 0x8000; i > 0x8; i >>= 1) sum += LUNAR_INFO[y - 1900] & i ? 1 : 0
  return sum + leapDays(y)
}

/* ---------------- 核心换算 ---------------- */

/** 公历是否闰年 */
function isLeap(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
}

/** 公历日期 -> 距 1900-01-31 的天数 */
function solarToDays(y: number, m: number, d: number): number {
  let days = Math.floor((y - 1900) * 365)
  for (let i = 1900; i < y; i++) if (isLeap(i)) days += 1
  const monthDays = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  for (let i = 1; i < m; i++) {
    days += monthDays[i - 1]
    if (i === 2 && isLeap(y)) days += 1
  }
  return days + d - 1
}

/** 距 1900-01-31 的天数 -> 公历日期 */
function daysToSolar(offset: number): { y: number; m: number; d: number } {
  let y = 1900
  let days = offset
  for (; ; y++) {
    const yd = isLeap(y) ? 366 : 365
    if (days < yd) break
    days -= yd
  }
  const leap = isLeap(y)
  const monthDays = [
    31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31,
  ]
  let m = 1
  for (; ; m++) {
    if (days < monthDays[m - 1]) break
    days -= monthDays[m - 1]
  }
  return { y, m, d: days + 1 }
}

export interface LunarDate {
  /** 农历年 */
  year: number
  /** 农历月（1–12） */
  month: number
  /** 农历日 */
  day: number
  /** 是否是闰月 */
  isLeap: boolean
}

/**
 * 公历日期 -> 农历日期。
 *
 * 基准：1900-01-31 = 农历 1900 年正月初一。
 */
export function solarToLunar(y: number, m: number, d: number): LunarDate {
  const fallback: LunarDate = { year: 1900, month: 1, day: 1, isLeap: false }
  if (!isValidSolarDate(y, m, d)) return fallback

  let offset = solarToDays(y, m, d) - 30
  if (offset < 0) return fallback

  /* ---- 定位农历年 ---- */
  let ly = 1900
  for (; ; ly++) {
    const yd = lunarYearDays(ly)
    if (offset < yd) break
    offset -= yd
    if (ly > 2100) return fallback
  }

  /* ---- 定位农历月（闰月排在同名月份之后） ---- */
  const leap = leapMonth(ly)
  const seq: Array<{ m: number; leap: boolean }> = []
  for (let i = 1; i <= 12; i++) {
    seq.push({ m: i, leap: false })
    if (leap > 0 && i === leap) seq.push({ m: i, leap: true })
  }

  for (const item of seq) {
    const days = item.leap ? leapDays(ly) : lunarMonthDays(ly, item.m)
    if (offset < days) {
      return { year: ly, month: item.m, day: offset + 1, isLeap: item.leap }
    }
    offset -= days
  }
  return fallback
}

/**
 * 农历日期 -> 公历日期。
 * 越界或非法时返回 null。
 */
export function lunarToSolar(
  ly: number,
  lm: number,
  ld: number,
  isLeapMonth = false,
): { y: number; m: number; d: number } | null {
  if (ly < 1900 || ly > 2100) return null
  if (lm < 1 || lm > 12) return null

  const leap = leapMonth(ly)
  if (isLeapMonth && leap !== lm) return null

  /*
   * 基准：农历 1900 年正月初一 = 公历 1900-01-31，
   * 而 daysToSolar 的索引是「距 1900-01-01 的天数」，
   * 1900-01-31 的索引是 **30** —— 这个 30 是整个换算的锚点。
   */
  let offset = 30
  for (let y = 1900; y < ly; y++) offset += lunarYearDays(y)

  /* 跳过目标月之前的所有月（含闰月） */
  for (let i = 1; i < lm; i++) {
    offset += lunarMonthDays(ly, i)
    if (leap > 0 && i === leap) offset += leapDays(ly)
  }

  if (isLeapMonth) {
    /* 目标是闰月：普通月 lm 在前，闰月 lm 在后 */
    offset += lunarMonthDays(ly, lm)
    const days = leapDays(ly)
    if (ld < 1 || ld > days) return null
  } else {
    const days = lunarMonthDays(ly, lm)
    if (ld < 1 || ld > days) return null
  }

  return daysToSolar(offset + ld - 1)
}

/** 农历日的中文写法，如「初七」「二十」「三十」 */
export function lunarDayName(d: number): string {
  if (d === 10) return '初十'
  if (d === 20) return '二十'
  if (d === 30) return '三十'
  const tens = Math.floor(d / 10)
  const unit = d % 10
  return `${LUNAR_DAY_TENS[tens] ?? ''}${LUNAR_DAY_UNITS[unit] ?? ''}`
}

/** 农历日期的中文写法 */
export function lunarDateText(
  ly: number,
  lm: number,
  ld: number,
  isLeapMonth = false,
): string {
  const mName = `${isLeapMonth ? '闰' : ''}${LUNAR_MONTHS[lm - 1] ?? lm}月`
  return `${ly} 年 ${mName}${lunarDayName(ld)}`
}

/** 公历日期的中文写法 */
export function solarDateText(y: number, m: number, d: number): string {
  return `${y} 年 ${m} 月 ${d} 日`
}

/** 判断公历日期是否合法（1900–2100） */
export function isValidSolarDate(y: number, m: number, d: number): boolean {
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return false
  if (y < 1900 || y > 2100) return false
  if (m < 1 || m > 12) return false
  const days = [
    31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31,
  ]
  return d >= 1 && d <= days[m - 1]
}

/** 该农历年闰哪个月（0 = 不闰） */
export function lunarLeapMonthOf(ly: number): number {
  if (ly < 1900 || ly > 2100) return 0
  return leapMonth(ly)
}

/**
 * 农历某月的天数。
 * isLeap 为 true 时返回该年闰月的天数（当年无闰月则返回 0）。
 */
export function lunarMonthDaysOf(
  ly: number,
  lm: number,
  isLeapMonth = false,
): number {
  if (ly < 1900 || ly > 2100) return 0
  if (isLeapMonth) return leapDays(ly)
  return lunarMonthDays(ly, lm)
}

/** 该农历年闰月的天数 */
export function lunarLeapMonthDays(ly: number): number {
  if (ly < 1900 || ly > 2100) return 0
  return leapDays(ly)
}

/** 该农历年的总天数 */
export function lunarYearLength(ly: number): number {
  if (ly < 1900 || ly > 2100) return 0
  return lunarYearDays(ly)
}

/**
 * 由农历年月推出该年的闰月信息，供 UI 构造「闰月」选项。
 */
export function lunarMonthOptions(ly: number): Array<{
  value: number
  label: string
  isLeap: boolean
}> {
  const leap = lunarLeapMonthOf(ly)
  const out: Array<{ value: number; label: string; isLeap: boolean }> = []
  for (let i = 1; i <= 12; i++) {
    out.push({
      value: i,
      label: `${LUNAR_MONTHS[i - 1]}月`,
      isLeap: false,
    })
    if (leap === i) {
      out.push({ value: i, label: `闰${LUNAR_MONTHS[i - 1]}月`, isLeap: true })
    }
  }
  return out
}

/**
 * 由农历年月推出该年所有可选日（考虑月大小与闰月）。
 */
export function lunarDayOptions(
  ly: number,
  lm: number,
  isLeapMonth = false,
): number[] {
  const days = isLeapMonth ? lunarLeapMonthDays(ly) : lunarMonthDays(ly, lm)
  return Array.from({ length: days }, (_, i) => i + 1)
}
