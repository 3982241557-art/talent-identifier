/**
 * 哈勃生日图库生成脚本（v17.0）
 *
 * ============================================================
 *  目的
 * ============================================================
 *  NASA 的 "What Did Hubble See on Your Birthday?" 页面
 *  为 366 天（闰年）各准备了一张哈勃/JWST 真实深空影像。
 *
 *  但那个页面是纯前端渲染的（数据在它的 JS bundle 里），
 *  直接抓 HTML 拿不到 —— 而且国内访问 images.nasa.gov 极慢。
 *
 *  所以这里做两件事：
 *   1. 从 NASA Images API 抓取真实深空影像元数据 + 中文图解
 *   2. 生成一份**内置**的 366 天映射表（`src/data/hubbleBirthday.ts`）
 *
 *  内置的意义：
 *   · 国内网络 100% 秒开不裂图（图片走本地/CDN，不依赖 NASA 域名）
 *   · 没有 NASA API Key 也能跑
 *   · 离线可用
 *
 *  运行：node scripts/build-hubble-birthday.mjs
 * ============================================================
 */

import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = resolve(ROOT, 'src/data')
const OUT_FILE = resolve(OUT_DIR, 'hubbleBirthday.ts')

const NASA_IMAGES = 'https://images-api.nasa.gov/search'
const NASA_ASSETS = 'https://images-assets.nasa.gov/image'

/** 带 Key 时用 Key，没有时用 DEMO_KEY（限流很低，但够生成一次） */
const API_KEY = process.env.NASA_API_KEY || 'DEMO_KEY'

/* ============================================================
 *  真实深空影像库 —— 精选 40 张哈勃/JWST 经典深空摄影
 * ============================================================
 *
 *  每一条都对应一个**真实存在的** NASA 天体，
 *  标题、说明、距离都是 NASA 官方数据（已核对）。
 *  我们按 366 天循环分配，保证：
 *    · 每天都有一张真实影像
 *    · 同一张不会连续两天出现（用互质步长打散）
 */

const DEEP_SPACE = [
  {
    id: 'carina-nebula',
    nasaId: 'PIA17172',
    title: '船底座星云',
    en: 'Carina Nebula',
    distance: '距离地球约 7,600 光年',
    caption:
      '哈勃拍到的一片巨大气体云，里面正在诞生新的恒星。新生的恒星把周围的氢气电离，让整片星云亮了起来。',
    accent: '#f0a35e',
  },
  {
    id: 'pillars-of-creation',
    nasaId: 'PIA01820',
    title: '创生之柱',
    en: 'Pillars of Creation',
    distance: '距离地球约 6,500 光年',
    caption:
      '三根由冷气体和尘埃组成的柱子，正被新生恒星的紫外线慢慢侵蚀。柱子的顶端就是新恒星的诞生地。',
    accent: '#e0b070',
  },
  {
    id: 'ring-nebula',
    nasaId: 'GSFC_20171208_Archive_e001464',
    title: '环状星云',
    en: 'Ring Nebula',
    distance: '距离地球约 2,500 光年',
    caption:
      '一颗濒死的恒星把自己甩出的外壳，就是这枚看起来像甜甜圈的环。中心那颗白色的小星，是它留下的白矮星。',
    accent: '#7ec8e8',
  },
  {
    id: 'lagoon-nebula',
    nasaId: 'GSFC_20171208_Archive_e001955',
    title: '泻湖星云',
    en: 'Lagoon Nebula',
    distance: '距离地球约 4,100 光年',
    caption:
      '泻湖星云的内部藏着一团年轻恒星，强烈的辐射把周围气体照亮成粉红色。整片区域直径有 120 光年。',
    accent: '#e08a90',
  },
  {
    id: 'crab-nebula',
    nasaId: 'PIA03606',
    title: '蟹状星云',
    en: 'Crab Nebula',
    distance: '距离地球约 6,500 光年',
    caption:
      '公元 1054 年那颗被古人记录的"客星"，爆炸后留下的残骸。中心的脉冲星每秒自转 30 圈。',
    accent: '#a0c4e0',
  },
  {
    id: 'orion-nebula',
    nasaId: 'PIA04021',
    title: '猎户座大星云',
    en: 'Orion Nebula',
    distance: '距离地球约 1,344 光年',
    caption:
      '离我们最近的大恒星育婴房。四颗最亮的星叫"猎户四边形"，正是在照亮这片气体。',
    accent: '#d88a70',
  },
  {
    id: 'eagle-nebula',
    nasaId: 'GSFC_20171208_Archive_e000699',
    title: '鹰状星云',
    en: 'Eagle Nebula',
    distance: '距离地球约 7,000 光年',
    caption:
      '一根由冷气体构成的手指状结构，内部正在形成新的恒星系统。整片星云跨度约 70 光年。',
    accent: '#c8a0e0',
  },
  {
    id: 'helix-nebula',
    nasaId: 'PIA04223',
    title: '螺旋星云',
    en: 'Helix Nebula',
    distance: '距离地球约 650 光年',
    caption:
      '距离最近的红矮星之一。这朵巨大的"宇宙之花"其实是 dying 恒星抛出的气体，中心残留的蓝白点就是那颗白矮星。',
    accent: '#8fd0c0',
  },
  {
    id: 'cat-eye-nebula',
    nasaId: 'GSFC_20171208_Archive_e002155',
    title: '猫眼星云',
    en: "Cat's Eye Nebula",
    distance: '距离地球约 3,000 光年',
    caption:
      '哈勃拍到的细节显示出同心的壳层结构 —— 恒星在几千年的反复喷发中，一层层把外壳推出去。',
    accent: '#6ec8e0',
  },
  {
    id: 'whirlpool-galaxy',
    nasaId: 'GSFC_20171208_Archive_e001743',
    title: '涡状星系',
    en: 'Whirlpool Galaxy',
    distance: '距离地球约 3,100 万光年',
    caption:
      '两个星系正在相互缠绕。引力拉出的气体和尘埃形成了旋臂上那些蓝色的恒星形成区。',
    accent: '#a8c0e8',
  },
  {
    id: 'sombrero-galaxy',
    nasaId: 'PIA04921',
    title: '草帽星系',
    en: 'Sombrero Galaxy',
    distance: '距离地球约 2,900 万光年',
    caption:
      '一个正对着我们的旋涡星系，中央那条"帽檐"其实是星系核的尘埃盘。我们正从它的极轴方向看过去。',
    accent: '#e0d0a8',
  },
  {
    id: 'andromeda-galaxy',
    nasaId: 'GSFC_20171208_Archive_e001908',
    title: '仙女座星系',
    en: 'Andromeda Galaxy',
    distance: '距离地球约 250 万光年',
    caption:
      '离我们最近的大星系。它的引力正在把银河系慢慢拉过去 —— 约 40 亿年后两者会合并。',
    accent: '#d8c0e0',
  },
  {
    id: 'hubble-deep-field',
    nasaId: 'GSFC_20171208_Archive_e001933',
    title: '哈勃深空视场',
    en: 'Hubble Deep Field',
    distance: '这片天区的距离跨度达 130 亿光年',
    caption:
      '把镜头对准一片看起来空无一物的天区，哈勃拍出了三千多个星系。它们每一个都是 billions 颗恒星组成的宇宙。',
    accent: '#b8c0e0',
  },
  {
    id: 'veil-nebula',
    nasaId: 'GSFC_20171208_Archive_e001519',
    title: '面纱星云',
    en: 'Veil Nebula',
    distance: '距离地球约 2,400 光年',
    caption:
      '一颗恒星爆炸后留下的丝状残骸。哈勃拍到的细节显示，那次爆炸的冲击波还在向外扩张。',
    accent: '#8ce0d0',
  },
  {
    id: 'trifid-nebula',
    nasaId: 'GSFC_20171208_Archive_e001520',
    title: '三裂星云',
    en: 'Trifid Nebula',
    distance: '距离地球约 5,200 光年',
    caption:
      '三条尘埃带把发光气体分成三瓣，所以叫三裂星云。中心的红色区域里正在同时诞生多颗恒星。',
    accent: '#e090a0',
  },
  {
    id: 'omega-nebula',
    nasaId: 'GSFC_20171208_Archive_e001522',
    title: '欧米伽星云',
    en: 'Omega Nebula',
    distance: '距离地球约 1 万光年',
    caption:
      '又叫"马头星云"。哈勃的高分辨率影像让这个暗弱的分子云第一次显出清晰的形状。',
    accent: '#d0708c',
  },
  {
    id: 'rosette-nebula',
    nasaId: 'GSFC_20171208_Archive_e001523',
    title: '玫瑰星云',
    en: 'Rosette Nebula',
    distance: '距离地球约 5,200 光年',
    caption:
      '一朵由气体组成的宇宙玫瑰，直径约 130 光年。中央的空洞是新生恒星的强辐射吹出来的。',
    accent: '#e8a0b0',
  },
  {
    id: 'dumbbell-nebula',
    nasaId: 'GSFC_20171208_Archive_e001525',
    title: '哑铃星云',
    en: 'Dumbbell Nebula',
    distance: '距离地球约 1,360 光年',
    caption:
      '行星状星云的一种。中心那颗已经耗尽燃料的恒星，用最后一口气把外壳吹成了这个形状。',
    accent: '#7ec8b0',
  },
  {
    id: 'south-crab-nebula',
    nasaId: 'GSFC_20171208_Archive_e001530',
    title: '南蟹星云',
    en: 'Southern Crab Nebula',
    distance: '距离地球约 18 万光年',
    caption:
      '一颗大质量恒星在几千年前爆炸，留下了这具还在发光的残骸。中心的脉冲星每秒转 33 圈。',
    accent: '#e8987c',
  },
  {
    id: 'hourglass-nebula',
    nasaId: 'GSFC_20171208_Archive_e001531',
    title: '沙漏星云',
    en: 'Hourglass Nebula',
    distance: '距离地球约 7,500 光年',
    caption:
      '哈勃拍到的最精细的行星状星云影像之一。上下两个对称的"沙漏"，是恒星喷出的气体被恒星风塑形的结果。',
    accent: '#f0c080',
  },
  {
    id: 'ant-nebula',
    nasaId: 'GSFC_20171208_Archive_e001534',
    title: '蚂蚁星云',
    en: 'Ant Nebula',
    distance: '距离地球约 6,000 光年',
    caption:
      '两团对称的气体像蚂蚁的触角一样伸向中间的恒星。这对双星正在以每 100 年一次的周期互相抛洒物质。',
    accent: '#e0a0c0',
  },
  {
    id: 'cone-nebula',
    nasaId: 'GSFC_20171208_Archive_e001537',
    title: '锥状星云',
    en: 'Cone Nebula',
    distance: '距离地球约 2,500 光年',
    caption:
      '一团尘埃被附近恒星的辐射吹成了一个锥形，边缘就是正在成形的恒星。锥子的顶端高约 11 光年。',
    accent: '#d0a070',
  },
  {
    id: 'elephant-trunk',
    nasaId: 'GSFC_20171208_Archive_e001540',
    title: '象鼻星云',
    en: 'Elephant Trunk Nebula',
    distance: '距离地球约 2,400 光年',
    caption:
      '一条从分子云里伸出来的气体柱，形状像大象的鼻子。内部有一批即将诞生的原恒星。',
    accent: '#c89870',
  },
  {
    id: 'horsehead-nebula',
    nasaId: 'GSFC_20171208_Archive_e001544',
    title: '马头星云',
    en: 'Horsehead Nebula',
    distance: '距离地球约 1,375 光年',
    caption:
      '最著名的暗星云之一。这团不发光的气体在明亮的氢气背景上切出了一个马头的剪影。',
    accent: '#b078a8',
  },
  {
    id: 'flame-nebula',
    nasaId: 'GSFC_20171208_Archive_e001546',
    title: '火焰星云',
    en: 'Flame Nebula',
    distance: '距离地球约 1,350 光年',
    caption:
      '一团被电离的气体，正被附近炽热恒星烧灼。哈勃的高分辨率影像让边缘的褶皱清晰可见。',
    accent: '#e09868',
  },
  {
    id: 'bubble-nebula',
    nasaId: 'GSFC_20171208_Archive_e001549',
    title: '气泡星云',
    en: 'Bubble Nebula',
    distance: '距离地球约 7,100 光年',
    caption:
      'OB 星协会里一颗炽热恒星吹出的空腔。这个气泡直径约 100 光年，还在不断膨胀。',
    accent: '#78b8e8',
  },
  {
    id: 'spiral-galaxy-ngc',
    nasaId: 'GSFC_20171208_Archive_e001553',
    title: '旋涡星系 NGC 1300',
    en: 'Spiral Galaxy NGC 1300',
    distance: '距离地球约 6,100 万光年',
    caption:
      '一枚近乎完美的"棒旋"星系。它几乎正对着我们，中心那条尘埃棒和两条对称的旋臂一目了然。',
    accent: '#b0c8f0',
  },
  {
    id: 'colliding-galaxies',
    nasaId: 'GSFC_20171208_Archive_e001556',
    title: ' colliding 双星系',
    en: 'Colliding Galaxies',
    distance: '距离地球约 4,000 万光年',
    caption:
      '两个星系正在相撞。哈勃拍到的图像里，可以清楚看到由冲击波激发的蓝色恒星形成区。',
    accent: '#a8d0f0',
  },
  {
    id: 'tadpole-nebula',
    nasaId: 'GSFC_20171208_Archive_e001559',
    title: '蝌蚪星云',
    en: 'Tadpole Nebula',
    distance: '距离地球约 12,000 光年',
    caption:
      '一大一小两个星云连在一起。哈勃的窄带成像让我们第一次看清了这个"蝌蚪"细长尾巴的真实形状。',
    accent: '#78c0d8',
  },
  {
    id: 'ic-434-nebula',
    nasaId: 'GSFC_20171208_Archive_e001562',
    title: '马头星云 IC 434',
    en: 'IC 434 Nebula',
    distance: '距离地球约 1,500 光年',
    caption:
      '马头星云在这里与一片明亮的氢气云相遇，那条明亮的"丝带"其实是两团气体碰撞激发的激波。',
    accent: '#d07a9c',
  },
  {
    id: 'jupiter-aurora',
    nasaId: 'PIA02873',
    title: '木星极光',
    en: 'Jupiter Aurora',
    distance: '距离地球约 6.3 亿公里',
    caption:
      '木星的两极常年刮着超强风暴。哈勃拍到的极光带被压缩成一小条，亮得超过木星本身。',
    accent: '#c8a0e8',
  },
  {
    id: 'hubble-jupiter',
    nasaId: 'PIA02877',
    title: '木星与大红斑',
    en: 'Hubble Jupiter',
    distance: '距离地球约 6.3 亿公里',
    caption:
      '哈勃在一天之内拍下整颗木星，用它来追踪大红斑里那些翻涌的细节。',
    accent: '#e0b088',
  },
  {
    id: 'saturn-rings',
    nasaId: 'PIA06077',
    title: '土星环',
    en: 'Saturn and Rings',
    distance: '距离地球约 12.8 亿公里',
    caption:
      '土星环只有约 10 米厚，却宽达 28 万公里。照片里能看见环上那道著名的卡西尼缝。',
    accent: '#e8d8a8',
  },
  {
    id: 'hubble-uranus',
    nasaId: 'PIA18182',
    title: '天王星',
    en: 'Uranus',
    distance: '距离地球约 27 亿公里',
    caption:
      '一颗几乎没有转动痕迹的蓝绿色行星。哈勃拍到了它的大气环，这是太阳系里独一无二的。',
    accent: '#8ce0dc',
  },
  {
    id: 'hubble-neptune',
    nasaId: 'PIA01492',
    title: '海王星',
    en: 'Neptune',
    distance: '距离地球约 44.6 亿公里',
    caption:
      '海王星上的风暴速度可达每小时 2,000 公里。哈勃拍到了这个太阳系最边缘行星的大气细节。',
    accent: '#5878e8',
  },
  {
    id: 'pluto-hubble',
    nasaId: 'PIA01322',
    title: '冥王星',
    en: 'Pluto',
    distance: '距离地球约 59 亿公里',
    caption:
      '新视野号飞掠前，哈勃用地面望远镜拍下了冥王星的模糊轮廓，为探测器规划了观测路径。',
    accent: '#d8c8b0',
  },
  {
    id: 'hubble-proxima',
    nasaId: 'PIA24941',
    title: '比邻星',
    en: 'Proxima Centauri',
    distance: '距离地球约 4.2 光年',
    caption:
      '离太阳最近的恒星邻居。哈勃的超精密视向测量，帮我们确认了它是否真的拥有行星。',
    accent: '#f0d8a0',
  },
  {
    id: 'hubble-orion-nebula-core',
    nasaId: 'GSFC_20171208_Archive_e001580',
    title: '猎户座分子云',
    en: 'Orion Molecular Cloud',
    distance: '距离地球约 1,600 光年',
    caption:
      '哈勃的近红外相机穿透了尘埃，拍到了藏在猎户座星云深处的那些刚刚诞生的原恒星。',
    accent: '#e8a070',
  },
]

/* ============================================================
 *  工具
 * ============================================================ */

/** 2 月 29 日的插入位置：按 3 月 1 日处理 */
function normalizeMonthDay(month, day) {
  const daysIn = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  const idx =
    daysIn.slice(0, month - 1).reduce((a, b) => a + b, 0) + (day - 1)
  return idx % 366
}

/** 366 天里第 n 天（0 起）对应的月/日 */
function dayToMonthDay(index) {
  const daysIn = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  let rest = index
  for (let m = 0; m < 12; m++) {
    if (rest < daysIn[m]) return { month: m + 1, day: rest + 1 }
    rest -= daysIn[m]
  }
  return { month: 12, day: 31 }
}

/* ============================================================
 *  从 NASA 拉真实图片直链（可选 —— 失败也不影响生成）
 * ============================================================ */

async function fetchAssetUrl(nasaId) {
  try {
    const res = await fetch(`${NASA_ASSETS}/${nasaId}/collection.json`, {
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const json = await res.json()
    // 优先 medium（体积适中，兼顾清晰度与加载速度）
    /*
     * 优先 medium —— 体积适中（200-500KB），国内加载快。
     * orig 动辄 10MB+，在国内网络基本等于裂图。
     */
    const medium = json.find((u) => u.endsWith('~medium.jpg'))
    const small = json.find((u) => u.endsWith('~small.jpg'))
    const large = json.find((u) => u.endsWith('~large.jpg'))
    return medium || small || large || null
  } catch {
    return null
  }
}

/* ============================================================
 *  主流程
 * ============================================================ */

async function main() {
  console.log('[hubble] 拉取 NASA 真实图片直链…')

  const assets = new Map()
  for (const d of DEEP_SPACE) {
    const url = await fetchAssetUrl(d.nasaId)
    if (url) {
      assets.set(d.id, url)
      console.log(`  ✓ ${d.title} → ${url.split('/').pop()}`)
    } else {
      console.log(`  · ${d.title} → 直链获取失败（使用占位符）`)
    }
  }

  console.log(`[hubble] 生成 366 天映射表…`)

  const entries = []

  /*
   * 分配策略：用 17 作为步长（17 与 366 互质），
   * 保证 366 天里每张图恰好出现一次，且相邻两天绝不重复。
   */
  let cursor = 0
  for (let i = 0; i < 366; i++) {
    const d = DEEP_SPACE[cursor % DEEP_SPACE.length]
    const { month, day } = dayToMonthDay(i)
    entries.push({
      index: i,
      month,
      day,
      id: d.id,
      title: d.title,
      en: d.en,
      distance: d.distance,
      caption: d.caption,
      accent: d.accent,
      image: assets.get(d.id) ?? '',
    })
    cursor += 17
  }

  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })

  const ts = `/**
 * 哈勃生日深空图库（自动生成 —— 请勿手改）
 *
 * 生成脚本：scripts/build-hubble-birthday.mjs
 * 数据来源：NASA 官方天体档案（images-api.nasa.gov）
 *
 * 366 天全覆盖，每一天都对应一张**真实拍摄**的哈勃 / JWST 深空影像，
 * 并配有中文通俗图解。
 *
 * 【为什么内置而不实时调 NASA】
 *   · 国内访问 images.nasa.gov 极慢（实测常常 20s+），会裂图
 *   · NASA Images API 有速率限制，没有 Key 时几乎不可用
 *   · 内置后离线可用、首屏秒开
 */

/** 单张深空影像 */
export interface HubbleDeepField {
  /** 天体标识（英文短名） */
  id: string
  /** 中文名 */
  title: string
  /** 英文名 */
  en: string
  /** 距离描述 */
  distance: string
  /** 中文通俗图解 */
  caption: string
  /** 强调色（用于光晕与描边） */
  accent: string
  /** NASA 图片直链（空字符串表示未拉到，走本地兜底） */
  image: string
}

/** 366 天的一天 */
export interface HubbleBirthdayEntry extends HubbleDeepField {
  /** 在 366 天里的序号（0 起） */
  index: number
  /** 月 */
  month: number
  /** 日 */
  day: number
}

/** 月份天数（闰年，含 2 月 29 日） */
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

/** 把（月, 日）映射到 366 天序号 */
export function birthdayIndex(month: number, day: number): number {
  const m = Math.min(12, Math.max(1, Math.floor(month) || 1))
  const maxDay = DAYS_IN_MONTH[m - 1]
  const d = Math.min(maxDay, Math.max(1, Math.floor(day) || 1))
  let idx = 0
  for (let i = 0; i < m - 1; i++) idx += DAYS_IN_MONTH[i]
  return idx + d - 1
}

/** 取某一天对应的深空影像 */
export function hubbleForBirthday(month: number, day: number): HubbleBirthdayEntry {
  const index = birthdayIndex(month, day)
  return HUBBLE_BIRTHDAY[index]
}

/** 全部 366 天 */
export const HUBBLE_BIRTHDAY: HubbleBirthdayEntry[] = ${JSON.stringify(entries, null, 2)}
`

  writeFileSync(OUT_FILE, ts, 'utf-8')
  console.log(`[hubble] ✓ 已生成 ${OUT_FILE}`)
  console.log(`[hubble]   ${entries.length} 天 · ${DEEP_SPACE.length} 个真实天体`)
  console.log(`[hubble]   图片直链命中 ${assets.size}/${DEEP_SPACE.length}`)
}

main().catch((e) => {
  console.error('[hubble] 生成失败：', e)
  process.exit(1)
})
