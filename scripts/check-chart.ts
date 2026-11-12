/**
 * 占星引擎自检脚本
 */
import { computeChart } from '../src/lib/chart.ts'

const cases = [
  { date: '1998-06-15', time: '14:30', place: '北京', latitude: 39.9042, longitude: 116.4074 },
  { date: '2000-01-01', time: '00:00', place: '伦敦', latitude: 51.5074, longitude: -0.1278 },
  { date: '1985-11-23', time: '07:45', place: '纽约', latitude: 40.7128, longitude: -74.006 },
]

for (const c of cases) {
  const chart = computeChart(c)
  console.log('-'.repeat(60))
  console.log(`${c.date} ${c.time} ${c.place}`)
  console.log(
    `  太阳 ${chart.bigThree.sun.sign.cn} ${chart.bigThree.sun.degree.toFixed(1)}°`,
  )
  console.log(
    `  月亮 ${chart.bigThree.moon.sign.cn} ${chart.bigThree.moon.degree.toFixed(1)}°`,
  )
  console.log(
    `  上升 ${chart.bigThree.rising.sign.cn} ${chart.bigThree.rising.degree.toFixed(1)}°`,
  )
  console.log(`  判词: ${chart.verdict.text}`)
  console.log(`  元素:`, chart.elements)
  console.log(
    `  行星:`,
    chart.planets.map((p) => `${p.planetCn}${p.sign.cn}${p.house}宫`).join(' '),
  )
  console.log(
    `  相位:`,
    chart.aspects.slice(0, 5).map((a) => `${a.a}-${a.b}${a.cn}`).join(' '),
  )
  console.log(`  形象: ${chart.avatar}`)
}
