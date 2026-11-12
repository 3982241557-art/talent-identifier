/* ============================================================
 *  天赋识别器 · 核心类型定义
 * ============================================================ */

/** 流程阶段（v3.0：出生信息 → MBTI 分支 → 灵魂底色 → 主页） */
export type Stage = 'intro' | 'form' | 'mbti' | 'verdict' | 'dashboard'

/* ---------------- v3.0 · 路由栈 ---------------- */

/** MBTI 内部的三个子视图 */
export type MbtiView = 'branch' | 'manual' | 'explore'

/**
 * 路由节点。
 * 采用「历史栈（History Stack）」而非单值 stage，
 * 保证「返回」永远只退一级，且中途填写的所有数据都保留。
 */
export interface Route {
  name: Stage
  /** 仅 mbti 节点使用：内部子视图 */
  view?: MbtiView
}

/** MBTI 会话状态 —— 提升到全局，保证返回时不丢答题进度 */
export interface MbtiSession {
  answers: MbtiAnswer[]
  manualType: string
  question: {
    text: string
    options: Array<{ label: string; value: 1 | -1 }>
    bridge?: string
  } | null
  /** 已出过的题目文本，避免模型自我重复 */
  asked: string[]
  /** 当前题目的维度 */
  currentAxis: MbtiAxis
  finished: boolean
  /**
   * v7.0：题目序号。
   *
   * 只在**新题目真正到达**时递增，绝不随答题进度变化。
   * 它是 AnimatePresence 的唯一 key 来源 ——
   * 旧实现用 `index + question.text` 做 key，而 index 在点击瞬间就变了，
   * 导致同一道题被当成「新块」重新挂载，触发 exit→enter 动画，
   * 于是出现「答完一题，题目闪现又消失」的残影。
   */
  qSeq: number
}

/** 星座元素（火/土/风/水）与模式（基本/固定/变动） */
export type Element = 'fire' | 'earth' | 'air' | 'water'
export type Modality = 'cardinal' | 'fixed' | 'mutable'

export interface SignMeta {
  key: string
  cn: string
  en: string
  glyph: string
  element: Element
  modality: Modality
  ruler: string
  /** 星座关键词，用于灵魂底色生成 */
  keyword: string
}

/** 性别（必填项） */
export type Gender = 'female' | 'male' | 'other' | 'undisclosed'

export const GENDER_CN: Record<Gender, string> = {
  female: '女',
  male: '男',
  other: '其他',
  undisclosed: '不便透露',
}

/* ---------------- v9.0 · 历法与时辰 ---------------- */

/** 历法类型 */
export type CalendarSystem = 'solar' | 'lunar'

export const CALENDAR_CN: Record<CalendarSystem, string> = {
  solar: '公历',
  lunar: '农历',
}

/**
 * 出生时间的输入方式。
 *  · 'clock'  —— 用户知道确切钟点
 *  · 'shichen' —— 用户只知道时辰（如「午时」），按两小时区间中点计算
 */
export type TimeMode = 'clock' | 'shichen'

export interface BirthInput {
  /** 公历日期 YYYY-MM-DD（无论用户用哪种历法录入，最终都归一到公历） */
  date: string
  /** 选填：HH:mm */
  time: string
  /**
   * v9.0：用户选择的时辰 key（'zi' … 'hai'）。
   * 选填；与 `time` 互斥 —— 填了时辰就用时辰的中点，忽略 time。
   */
  shichen?: string
  /** v9.0：录入时使用的历法，仅用于回显与说明 */
  calendar?: CalendarSystem
  /**
   * v9.0：是否只知道时辰（两小时宽泛区间）。
   * 为 true 时后端按中点计算，并在界面上标注「上升宫位有 ±1 小时误差」。
   */
  timeIsApproximate?: boolean
  place: string
  latitude: number
  longitude: number
  gender: Gender
}

/** 带绝对黄经的星座落点 */
export interface Placement {
  sign: SignMeta
  /** 绝对黄经 0~360 */
  longitude: number
  /** 星座内度数 0~30 */
  degree: number
}

export interface BigThree {
  sun: Placement
  moon: Placement
  rising: Placement
}

export interface PlanetPlacement extends Placement {
  planet: string
  planetCn: string
  glyph: string
  house: number
  retrograde: boolean
}

/** 十二宫 —— v4.0 起由 Swiss Ephemeris 的 Placidus 宫制给出真实宫头 */
export interface House {
  house: number
  sign: SignMeta
  degree: number
  /** 该宫头的绝对黄经 */
  longitude: number
}

export interface Chart {
  bigThree: BigThree
  planets: PlanetPlacement[]
  houses: House[]
  risingLongitude: number
  /** 天顶（第十宫头）黄经 */
  midheavenLongitude: number
  elements: Record<Element, number>
  aspects: { a: string; b: string; aCn?: string; bCn?: string; type: string; cn: string; orb?: number }[]
  /** 是否有出生时辰（无时辰则上升星座为推算值） */
  hasTime: boolean
  /** 灵魂底色（结合 MBTI + 星盘） */
  verdict: Verdict
  /** 数据来源：后端真实星历 或 本地推演 */
  source: 'ephemeris' | 'local'
  /** 星历引擎标识 */
  engine?: string
  /** 宫位系统名称 */
  houseSystemName?: string
  /** 出生地经纬度 */
  coordinates?: { latitude: number; longitude: number; timezone: number }
  /**
   * v9.0：出生时间精度。
   *  · 'exact'   —— 用户给了确切钟点
   *  · 'shichen' —— 用户只知时辰，按两小时区间中点计算
   *  · 'unknown' —— 用户未提供时间，按正午推算
   */
  timePrecision?: 'exact' | 'shichen' | 'unknown'
  /** v9.0：所用时辰的中文名（如「午时」） */
  shichenName?: string
}

/* ---------------- MBTI ---------------- */

/** 四轴 */
export type MbtiAxis = 'EI' | 'NS' | 'TF' | 'JP'

export interface MbtiOption {
  label: string
  /** +1 / -1 */
  value: 1 | -1
  /** 该选项的倾听反馈标签 */
  echo: string
}

export interface MbtiQuestion {
  id: string
  axis: MbtiAxis
  /** 题干主体 */
  prompt: string
  /** 依据上一题作答结果追加的追问前缀（体现 AI 倾听反馈） */
  bridge: Record<MbtiAxis, Record<1 | -1, string>>
  options: [MbtiOption, MbtiOption]
}

export interface MbtiAnswer {
  questionId: string
  axis: MbtiAxis
  value: 1 | -1
  label: string
  /** 题干原文 —— 动态生成的题目需要留档，用于后续复盘 */
  question?: string
}

export interface MbtiProfile {
  /** 四字母类型，如 INFJ */
  type: string
  /** 每个字母 */
  letters: Record<MbtiAxis, 'E' | 'I' | 'N' | 'S' | 'T' | 'F' | 'J' | 'P'>
  answers: MbtiAnswer[]
  /** 由作答提炼的性格关键词 */
  traits: string[]
  /** 一句话性格底色 */
  summary: string
}

/* ---------------- 灵魂底色 ---------------- */

export interface Verdict {
  /** 完整句子 */
  text: string
  /** 需要主题色高亮的关键词（必须出现在 text 中） */
  highlights: string[]
  /** 一句引导语 */
  coda: string
  /** 灵魂底色所依据的核心词 */
  keywords: string[]
}

/* ---------------- 天赋矩阵 ---------------- */

/**
 * 天赋矩阵的四个维度（v12.0 · 任务 1）。
 *
 * v11.0 的 key 是 career / study / social / wealth，
 * 但服务端「维度 → 文案」的映射用的是另一套名字，
 * 加上前端把同一个全局角色变量 map 到所有卡片上，
 * 于是四个领域的副标题与引言完全相同（数据穿模）。
 *
 * v12.0 起 key 本身就是**唯一真相**：
 *   career        —— 事业
 *   academic      —— 学业
 *   interpersonal —— 人际
 *   wealth        —— 财富
 *
 * 每个 key 对应一个**绝对独立**的对象，
 * 对象内部自带 title / subtitle / description，
 * 前端只做 key → 对象的精准绑定，绝不跨卡片复用。
 */
export type TalentCategory =
  | 'career'
  | 'academic'
  | 'interpersonal'
  | 'wealth'

export interface TalentAxis {
  key: string
  label: string
  category: TalentCategory
  /** 0~100 评分 */
  score: number
}

/**
 * 单个天赋领域的完整描述。
 *
 * 四个领域之间**字段不共享**：
 *   title       —— 这一块的天赋名（来自人类语料库的角色定义）
 *   subtitle    —— 角色定义（你是哪种位置的人）
 *   field       —— 这个方向具体意味着做什么
 *   description —— 专属解析（只属于这个领域，绝不复用）
 *   quote       —— 人类先哲的原句（语料库直出，AI 不得改写）
 *   quoteSource —— 出处
 *   quoteModern —— 原句的白话转写
 *   quoteScene  —— 落在你身上的具体表现
 *   strength    —— 优势
 *   practice    —— 练习
 */
export interface TalentCategoryDetail {
  key: TalentCategory
  label: string
  score: number
  title: string
  subtitle: string
  field: string
  description: string
  quote: string
  quoteSource: string
  quoteModern: string
  quoteScene: string
  strength: string
  practice: string
}

export interface TalentResult {
  categories: TalentCategoryDetail[]
  /** 每年适合做的事 */
  yearly: Array<{ year: number; focus: string; action: string }>
  /** 落地建议 */
  advice: string[]
  /** 数据来源：AI 或本地推演 */
  source: 'ai' | 'local'
}

/* ---------------- 历史与存档 ---------------- */

export interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
  ts: number
}

export interface DayRecord {
  /** YYYY-MM-DD */
  date: string
  title: string
  body: string
  /** 当日与 AI 的对话 */
  turns: ChatTurn[]
}

export interface SavedProfile {
  /** 账号标识（本地生成，同一浏览器即同一账号） */
  accountId: string
  accountName: string
  birth: BirthInput | null
  mbti: MbtiProfile | null
  chart: Chart | null
  /** 往日运势 / 聊天历史 */
  days: DayRecord[]
  createdAt: number
  updatedAt: number
}

/* ---------------- 板块标识 ---------------- */

export type PanelId = 'year' | 'month' | 'day' | 'chart' | 'talent' | 'about'

export interface GuideScript {
  title: string
  body: string
}
