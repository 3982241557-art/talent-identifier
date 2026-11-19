import type { Chart, MbtiProfile, SoulDual } from '../types'

/* ============================================================
 *  后端 API 客户端（v6.0）
 *
 *  v6.0 关键改动：
 *   · 统一走 request() —— 自带超时控制与错误分类。
 *   · 前端能区分「限流 / 超时 / 断网 / 未配置 Key / 上游故障」，
 *     从而给用户不同的引导文案，而不是笼统的「未与云端连上」。
 *
 *  v8.0 关键改动 —— **同源相对路径**：
 *   默认用 `/api/xxx`（与页面同源），由 Vite 反向代理转发到后端。
 *   这样在临时公网分享场景下，浏览器不会对跨域 API 发起
 *   带预检的 CORS 请求，localtunnel 的拦截页也就不会卡住接口调用。
 *   若部署环境没有反向代理，可用 VITE_API_BASE 指定完整地址。
 * ============================================================ */

const BASE = import.meta.env.VITE_API_BASE ?? ''

/* ============================================================
 *  错误分类（与后端 server/deepseek.mjs 的 ERR 保持一致）
 * ============================================================ */
export const API_ERR = {
  NETWORK: 'network',
  TIMEOUT: 'timeout',
  RATE_LIMIT: 'rate_limit',
  UPSTREAM: 'upstream',
  BAD_REQUEST: 'bad_request',
  MALFORMED: 'malformed',
  NO_KEY: 'no_key',
  PLACEHOLDER_KEY: 'placeholder_key',
  UNKNOWN: 'unknown',
} as const

export type ApiErrCode = (typeof API_ERR)[keyof typeof API_ERR]

/** 带分类信息的错误 */
export class ApiError extends Error {
  code: ApiErrCode
  status: number
  constructor(code: ApiErrCode, message: string, status = 0) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
  }
}

/** 默认超时（毫秒） */
const DEFAULT_TIMEOUT = 80_000

/**
 * 统一的 fetch 封装：超时 + 错误分类 + JSON 解析。
 */
async function request<T>(
  path: string,
  body: unknown,
  timeout = DEFAULT_TIMEOUT,
): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)

  try {
    const res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    if (!res.ok) {
      const raw = await res.text().catch(() => '')
      let code: ApiErrCode = API_ERR.UNKNOWN
      let msg = `服务不可用 (${res.status})`
      try {
        const parsed = JSON.parse(raw)
        if (typeof parsed?.error === 'string') msg = parsed.error
        if (typeof parsed?.code === 'string') code = parsed.code as ApiErrCode
      } catch {
        /* 非 JSON 错误体 */
      }
      if (res.status === 429) code = API_ERR.RATE_LIMIT
      else if (res.status === 504) code = API_ERR.TIMEOUT
      else if (res.status === 502 || res.status === 503) code = API_ERR.UPSTREAM
      throw new ApiError(code, msg, res.status)
    }

    return (await res.json()) as T
  } catch (err) {
    if (err instanceof ApiError) throw err
    if ((err as Error)?.name === 'AbortError') {
      throw new ApiError(
        API_ERR.TIMEOUT,
        `请求超过 ${Math.round(timeout / 1000)} 秒仍未返回。`,
        408,
      )
    }
    throw new ApiError(
      API_ERR.NETWORK,
      `连不上后端服务：${(err as Error)?.message ?? '未知网络错误'}`,
      0,
    )
  } finally {
    clearTimeout(timer)
  }
}

/* ============================================================
 *  对话
 * ============================================================ */

export interface ChatPayload {
  message: string
  chart?: Chart
  mbti?: MbtiProfile | null
  history?: { role: 'user' | 'assistant'; content: string }[]
  /** 当日运势，作为 AI 的长期记忆的一部分 */
  fortune?: { title: string; body: string } | null
}

export interface ChatResponse {
  reply: string
  reflection?: string
}

/** 与苏格拉底对话 */
export async function postChat(payload: ChatPayload): Promise<ChatResponse> {
  return request<ChatResponse>('/api/chat', payload, 90_000)
}

/** 请求一条依据星盘与当日运势生成的反思问题 */
export async function postReflect(payload: {
  chart?: Chart
  mbti?: MbtiProfile | null
  fortune?: string
}): Promise<{ reflection: string }> {
  return request<{ reflection: string }>('/api/reflect', payload, 60_000)
}

/* ============================================================
 *  天赋测算
 * ============================================================ */

/**
 * v12.0 · 四个领域各自独立的对象。
 *
 * 关键变化：每个领域自带 title / subtitle / description，
 * 服务端**不得**把同一个变量 map 到多个领域。
 */
export interface TalentCategoryResult {
  /** v12.0：四个绝对独立的领域 */
  key: 'career' | 'academic' | 'interpersonal' | 'wealth'
  label: string
  score: number
  /** 这一块的天赋名 */
  title: string
  /** 角色定义 */
  subtitle: string
  /** 这个方向具体意味着做什么 */
  field: string
  /** 专属解析 */
  description: string
  /** 人类先哲原句（语料库直出） */
  quote: string
  quoteSource: string
  quoteModern: string
  quoteScene: string
  strength: string
  practice: string
}

export interface TalentPayloadResult {
  categories: TalentCategoryResult[]
  yearly: Array<{ year: number; focus: string; action: string }>
  advice: string[]
  /* ---------------- v16.0 · 双版本 ---------------- */
  /** ⚡️ 极简版：3-5 条短句 */
  minimal?: string[]
  /** 🔭 深度版：3-5 段话 */
  deep?: string[]
}

/**
 * 天赋深度测算 —— 由 AI 结合本命盘 + MBTI + 用户补充信息重新推演
 * 返回结构与本地引擎一致，便于无缝替换。
 */
export async function postTalent(payload: {
  chart?: Chart
  mbti?: MbtiProfile | null
  extra?: string
}): Promise<TalentPayloadResult> {
  return request<TalentPayloadResult>('/api/talent', payload, 90_000)
}

/* ============================================================
 *  优势挖掘 · AI 职位与行动方向推演
 * ============================================================ */

/** 极简版结构 */
export interface CareerMinimal {
  /** 一句高光结论 */
  headline: string
  /** 三条极简要点 */
  points: string[]
  /** 一条当下行动 */
  action: string
}

/** 深度版结构 */
export interface CareerDeep {
  /** 为什么会这样 */
  origins: string
  /** 最容易踩的坑 */
  friction: string
  /** 怎么破局 */
  solution: string
  /** 三个具体岗位 */
  jobs: Array<{ role: string; why: string }>
  /** 副业切入点 */
  sideProject: string
  /** 下周能做的 1 件小事 */
  nextWeek: string
}

/** 完整返回 */
export interface CareerAdviceResult {
  minimal: CareerMinimal
  deep: CareerDeep
}

/** 用户填写的优势数据 */
export interface AdvantagePayload {
  cycle: Record<string, string>
  coreSkills: [string, string, string]
  crossedOut: string[]
}

export async function postCareerAdvice(payload: {
  chart?: Chart
  mbti?: MbtiProfile | null
  advantage: AdvantagePayload
}): Promise<CareerAdviceResult> {
  return request<CareerAdviceResult>('/api/career-advice', payload, 90_000)
}

/* ============================================================
 *  健康检查
 * ============================================================ */
export async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/api/health`)
    return res.ok
  } catch {
    return false
  }
}

/* ============================================================
 *  MBTI 动态出题
 * ============================================================ */

/** 前端传给后端的一条历史问答 */
export interface AnswerRecord {
  question: string
  answer: string
  axis?: string
}

export interface DynamicQuestion {
  question: string
  options: Array<{ label: string; value: 1 | -1 }>
  bridge?: string
  axis?: string
  /** v6.0：是否降级到本地题库 */
  degraded?: boolean
  /** 降级原因 */
  reason?: string
}

/**
 * 依据历史问答记录，向后端索取下一道动态生成的题目。
 * 题目由 DeepSeek 即时推演，不是静态题库。
 *
 * v6.0：云端失败时后端会自动降级到本地题库并返回 degraded:true，
 * 因此这里**几乎不会抛错** —— 只有后端整个挂掉才会失败。
 */
export async function postMbtiQuestion(payload: {
  answeredCount: number
  total: number
  axis?: string
  history: AnswerRecord[]
}): Promise<DynamicQuestion> {
  return request<DynamicQuestion>('/api/mbti-question', payload, 90_000)
}

/* ============================================================
 *  真实星历（v4.0）
 * ============================================================ */

/**
 * 后端返回的行星位置。
 *
 * v18.1：**两套后端的字段名不一样**，这里都认：
 *   · Express 版 → `{ key, cn, ... }`
 *   · Workers 版 → `{ planet, planetCn, ... }`
 * 归一化在 `chart.ts / chartFromEphemeris` 里做。
 */
export interface EphemerisPlanet {
  /** Express 版字段 */
  key?: string
  /** Express 版字段 */
  cn?: string
  /** Workers 版字段 */
  planet?: string
  /** Workers 版字段 */
  planetCn?: string
  glyph?: string
  longitude: number
  speed?: number
  retrograde?: boolean
}

/** 后端 Swiss Ephemeris 返回的本命盘 */
export interface EphemerisChart {
  source: string
  engine: string
  jd: number
  utc: string
  houseSystem: string
  houseSystemName: string
  ascendant: number
  midheaven: number
  armc?: number
  vertex?: number
  cusps: number[]
  planets: EphemerisPlanet[]
  aspects: Array<{
    a: string
    b: string
    aCn: string
    bCn: string
    type: string
    cn: string
    orb: number
    angle: number
  }>
  coordinates: { latitude: number; longitude: number; timezone: number }
  /** v9.0：本次计算的时间精度 */
  timePrecision?: 'exact' | 'shichen' | 'unknown'
  /** v9.0：所用时辰的中文名（如「午时」） */
  shichenName?: string
}

/**
 * 请求后端计算真实本命盘。
 *
 * 经纬度是上升星座与宫位系统（Placidus）的决定性变量 ——
 * 没有它们，天空的位置只能靠猜。
 */
export async function postChart(payload: {
  date: string
  time?: string
  /** v9.0：时辰 key（子丑寅卯…）。有值时后端按时辰中点计算 */
  shichen?: string
  latitude: number
  longitude: number
  timezone?: number
  place?: string
}): Promise<EphemerisChart> {
  return request<EphemerisChart>('/api/chart', payload, 30_000)
}

/** 行运数据（用于日 / 月 / 年运势的周期趋势） */
export interface TransitSnapshot {
  source: string
  jd: number
  now: EphemerisPlanet[]
  month: EphemerisPlanet[]
  year: EphemerisPlanet[]
}

export async function postTransit(payload: {
  latitude?: number
  longitude?: number
  timezone?: number
  date?: string
  time?: string
}): Promise<TransitSnapshot> {
  return request<TransitSnapshot>('/api/transit', payload, 30_000)
}

/* ============================================================
 *  灵魂底色（v5.0 · 单句）
 * ============================================================ */

/**
 * 请求「灵魂底色」—— 一句话的人物速写。
 * 后端已做严格校验：单句、50-80 字、无换行。
 */
export async function postSoul(payload: {
  chart?: Chart
  mbti?: MbtiProfile | null
  place?: string
}): Promise<SoulDual> {
  return request<SoulDual>('/api/soul', payload, 60_000)
}

/* ============================================================
 *  每日灵感抽牌（v6.0）
 * ============================================================ */

export interface TipResult {
  /** 绝对中立的生活小建议 */
  text: string
  /** 是否使用了本地兜底提示 */
  degraded?: boolean
}

/** 抽一张「每日灵感卡」 */
export async function postTip(payload: {
  chart?: Chart
  mbti?: MbtiProfile | null
}): Promise<TipResult> {
  return request<TipResult>('/api/tip', payload, 60_000)
}

/* ============================================================
 *  塔罗牌三段式解析（v8.0）
 * ============================================================ */

/**
 * v11.0 · 极简解析结果 —— 只有两句话。
 *
 * 旧版是三段式（essence / guidance / chartLink），
 * 翻一次牌要读 300 多字，用户读不完就直接跳过。
 */
export interface TarotReadingResult {
  /** 一句点题 */
  gist: string
  /** 今日微小行动指南 */
  action: string
  /** 是否使用了本地兜底 */
  degraded?: boolean
  /* ---------------- v16.0 · 双版本 ---------------- */
  /** ⚡️ 极简版 */
  minimal?: { gist: string; action: string }
  /** 🔭 深度版 */
  deep?: { gist: string; action: string }
}

/**
 * 请求塔罗牌的极简解析。
 *
 * v11.0：请求里带上 **seed**（时间戳 + 星盘变量），
 * 保证同一个用户连续两天抽到同一张牌时，
 * 后端给出的侧重点提示**完全不同**。
 */
export async function postTarotReading(payload: {
  card: { name: string; meaning?: string; essence?: string }
  chart?: Chart
  mbti?: MbtiProfile | null
  /** v11.0：动态种子（时间戳） */
  seed?: number
}): Promise<TarotReadingResult> {
  return request<TarotReadingResult>('/api/tarot-reading', payload, 80_000)
}

/* ============================================================
 *  多维运势（v4.0）
 * ============================================================ */

export type FortuneDimensionKey = 'career' | 'wealth' | 'health' | 'love'

export interface FortuneDimension {
  key: FortuneDimensionKey
  label: string
  summary: string
  trend: string
  warning: string
}

export interface MultiFortuneResult {
  scope: 'year' | 'month' | 'day'
  label: string
  dimensions: FortuneDimension[]
  overview?: string
  /* ---------------- v16.0 · 双版本 ---------------- */
  /** ⚡️ 极简版 */
  minimal?: { overview: string; dimensions: FortuneDimension[] }
  /** 🔭 深度版 */
  deep?: { overview: string; dimensions: FortuneDimension[] }
}

/** 请求四维运势（事业学业 / 财富 / 健康 / 爱情） */
export async function postFortune(payload: {
  chart?: Chart
  mbti?: MbtiProfile | null
  scope: 'year' | 'month' | 'day'
}): Promise<MultiFortuneResult> {
  return request<MultiFortuneResult>('/api/fortune', payload, 90_000)
}
