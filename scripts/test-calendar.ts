import {
  solarToLunar,
  lunarToSolar,
  lunarDateText,
  SHICHEN,
  shichenOfHour,
} from '../src/lib/calendar.ts'

/* 权威对照表（公历 -> 农历），来自通用农历查表法 */
const CASES = [
  ['1900-01-31', ' 1900年正月初一'],
  ['1949-10-01', ' 1949年八月初十'],
  ['2000-01-01', ' 1999年冬月廿五'],
  ['2020-01-25', ' 2020年正月初一'], // 春节
  ['2021-02-12', ' 2021年正月初一'], // 春节
  ['2022-02-01', ' 2022年正月初一'], // 春节
  ['2023-01-22', ' 2023年正月初一'], // 春节
  ['2024-02-10', ' 2024年正月初一'], // 春节
  ['2025-01-29', ' 2025年正月初一'], // 春节
  ['2026-02-17', ' 2026年正月初一'], // 春节
  ['1995-06-15', ' 1995年五月十八'], // 农历五月十八
  ['1988-02-17', ' 1988年正月初一'], // 春节
]

let pass = 0
let fail = 0
for (const [solar, expect] of CASES) {
  const [y, m, d] = solar.split('-').map(Number)
  const l = solarToLunar(y, m, d)
  const got = lunarDateText(l.year, l.month, l.day, l.isLeap)
  const norm = (s: string) => s.replace(/\s+/g, '')
  const ok = norm(got) === norm(expect)
  ok ? pass++ : fail++
  console.log(
    `${ok ? '✓' : '✗'} ${solar} → ${got}${ok ? '' : `  (期望 ${expect})`}`,
  )
}

/* 往返一致性 */
console.log('\n--- 往返换算 ---')
let rtFail = 0
for (const [solar] of CASES) {
  const [y, m, d] = solar.split('-').map(Number)
  const l = solarToLunar(y, m, d)
  const back = lunarToSolar(l.year, l.month, l.day, l.isLeap)
  const got = back ? `${back.y}-${String(back.m).padStart(2, '0')}-${String(back.d).padStart(2, '0')}` : 'null'
  if (got !== solar) {
    rtFail++
    console.log(`✗ ${solar} → 农历${l.year}/${l.month}/${l.day} → ${got}`)
  }
}
console.log(rtFail === 0 ? '✓ 全部往返一致' : `✗ ${rtFail} 个往返不一致`)

/* 连续 400 天抽样，检查不崩且不越界 */
console.log('\n--- 连续扫描 1950-01-01 起 40000 天 ---')
const start = Date.UTC(1950, 0, 1)
let bad = 0
let prevDay = 0
for (let i = 0; i < 40000; i++) {
  const dt = new Date(start + i * 86400000)
  const y = dt.getUTCFullYear()
  const m = dt.getUTCMonth() + 1
  const d = dt.getUTCDate()
  const l = solarToLunar(y, m, d)
  if (l.year < 1900 || l.year > 2100 || l.month < 1 || l.month > 12) {
    bad++
    if (bad < 4) console.log(`✗ ${y}-${m}-${d} → 越界 ${JSON.stringify(l)}`)
  }
  const back = lunarToSolar(l.year, l.month, l.day, l.isLeap)
  if (!back || back.y !== y || back.m !== m || back.d !== d) {
    bad++
    if (bad < 4) console.log(`✗ ${y}-${m}-${d} → 往返失败 ${JSON.stringify(back)}`)
  }
  /* 月份应单调递增或在 12→1 时进位 */
  if (l.day < 1 || l.day > 30) {
    bad++
    console.log(`✗ ${y}-${m}-${d} → 日非法 ${l.day}`)
  }
  prevDay = l.day
}
console.log(bad === 0 ? '✓ 40000 天全部通过' : `✗ ${bad} 处异常`)

/* 十二时辰 */
console.log('\n--- 十二时辰 ---')
for (const s of SHICHEN) {
  const byHour = shichenOfHour(s.startHour)
  const ok = byHour.key === s.key
  console.log(`${ok ? '✓' : '✗'} ${s.name} ${s.range} → ${s.zodiac} / ${s.direction}`)
}
console.log('子时跨日检查:', shichenOfHour(23).name, shichenOfHour(0).name)

console.log(`\n通过 ${pass} / 失败 ${fail}`)
