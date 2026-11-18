import express from 'express'
import cors from 'cors'
import { existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { callDeepSeek, isConfigured, isPlaceholderKey, DEEPSEEK_MODEL, ERR } from './deepseek.mjs'
import {
  buildSystemPrompt,
  buildHistory,
  describeChart,
  describeMbti,
  buildQuestionPrompt,
  normalizeAnswerHistory,
  TALENT_DUAL_SYSTEM_PROMPT,
  SOUL_DUAL_SYSTEM_PROMPT,
  FORTUNE_DUAL_SYSTEM_PROMPT,
  TAROT_DUAL_SYSTEM_PROMPT,
  describeSoulMaterial,
  normalizeSoulPortrait,
  hasAstroTerms,
  stripAstroTerms,
} from './prompt.mjs'
import { sanitize, scrubToToday } from './sanitize.mjs'
import { registerEphemerisRoutes } from './routes/chart.mjs'
import { pickFallbackQuestion } from './mbtiFallback.mjs'
import {
  CAREER_SYSTEM_PROMPT,
  buildCareerUserPrompt,
  normalizeCareerPayload,
  normalizeCareerResult,
} from './career.mjs'
import { getPrototypes } from './mbtiCanon.mjs'
import { DOMAINS, DOMAIN_LABEL, retrieve, pickClassic } from './corpus.mjs'

/* ============================================================
 *  应用实例（v15.0）
 *
 *  这个 app 同时服务于两个运行形态：
 *    · 本地开发 —— server/index.mjs 里 app.listen(PORT)
 *    · 云端部署 —— 传统 Node 容器（Zeabur / Webify 等）
 *
 *  业务逻辑与路由**只写一份**，两边共用。
 *
 *  v15.1：平台从 Vercel serverless 切换为「长驻 Node 容器」，
 *  因此不再需要 serverless handler 导出 ——
 *  监听逻辑回到 server/index.mjs，app 只负责装配。
 * ============================================================ */
export const app = express()
/* ============================================================
 *  v16.0 · 双版本规范化 + 文案净化
 *
 *  与 functions/_lib/api-handler.js 保持一致 ——
 *  同一份 Prompt，两个环境出来的结果应当相同。
 * ============================================================ */

/** 净化 AI 返回的文本（去违禁句式、去术语、去 AI 腔） */
function scrub(text) {
  return sanitize(text)
}

/** 双版本规范化：缺哪版就用另一版顶上 */
function normalizeDual(parsed, fallbackMin, fallbackDeep) {
  const p = parsed && typeof parsed === 'object' ? parsed : {}
  const pick = (v, fb) => {
    if (typeof v === 'string' && v.trim()) return scrub(v)
    if (Array.isArray(v) && v.length) {
      return v.map((x) => scrub(String(x ?? ''))).filter(Boolean)
    }
    if (v && typeof v === 'object') return v
    return fb
  }
  return {
    minimal: pick(p.minimal, fallbackMin),
    deep: pick(p.deep, fallbackDeep),
  }
}

app.use(cors())
app.use(express.json({ limit: '256kb' }))

/* ============================================================
 *  静态资源托管（v15.1）
 * ============================================================
 *
 *  【为什么必须加这一段】
 *  云平台（Zeabur / Webify）跑的是**一个长驻 Node 容器**，
 *  容器里只有 `node server/index.mjs` 这一个进程。
 *
 *  如果只挂 API 路由而不托管静态文件：
 *    → 访问 https://xxx.zeabur.app/ 会 404（根路径没有响应）
 *    → 页面打不开，但 /api/health 却是通的 —— 极难排查
 *
 *  所以：**同一个 Express 同时提供 API 与前端静态资源**，
 *  浏览器访问根域名即拿到页面，前端请求 /api/xxx 时
 *  又会命中同一进程里的 API 路由。
 *
 *  关键点：
 *   1. 静态目录是 `dist/`（Vite 构建产物），不是 `public/`。
 *      public/ 是构建时的输入，dist/ 才是最终产物。
 *   2. 挂载点必须在**所有 API 路由之后**，
 *      否则 express.static 会把 /api/* 也当成文件去找。
 *   3. SPA 兜底：非 API 的未知路径一律回 index.html，
 *      否则用户刷新 /dashboard 这类前端路由会 404。
 *   4. 本地开发时 dist/ 可能不存在 —— 判空跳过即可，
 *      开发环境走 Vite dev server，不受影响。
 * ============================================================ */
const DIST_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist')

if (existsSync(DIST_DIR)) {
  /* 静态资源（带 hash 的 JS/CSS，浏览器强缓存） */
  app.use(
    express.static(DIST_DIR, {
      index: false,
      maxAge: '1y',
      setHeaders(res, filePath) {
        /* index.html 绝不能长缓存，否则发版后用户拿到旧页面 */
        if (filePath.endsWith('index.html')) {
          res.setHeader('Cache-Control', 'no-cache')
        }
      },
    }),
  )
  console.log(`[life-script] 静态资源已挂载 → ${DIST_DIR}`)
}

/* ---------------- 真实星历（Swiss Ephemeris） ---------------- */
registerEphemerisRoutes(app)

/* ---------------- 健康检查 ---------------- */
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    configured: isConfigured() && !isPlaceholderKey(),
    placeholder: isPlaceholderKey(),
    model: DEEPSEEK_MODEL,
    /** v6.0：暴露错误分类常量，便于前端调试 */
    errors: ERR,
  })
})

/* ---------------- 苏格拉底对话 ---------------- */
app.post('/api/chat', async (req, res) => {
  const { message, chart, mbti, history, fortune } = req.body ?? {}

  if (typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: '缺少 message 字段。' })
  }
  if (message.length > 2000) {
    return res.status(413).json({ error: '问题过长。' })
  }

  const system = buildSystemPrompt({ chart, mbti, fortune })
  const messages = [
    { role: 'system', content: system },
    ...buildHistory(history),
    { role: 'user', content: message.trim() },
  ]

  try {
    const reply = await callDeepSeek(messages, { timeout: 75_000, retries: 1 })
    /* v16.0：返回前洗掉违禁句式与术语 */
    res.json({ reply: scrub(reply) })
  } catch (err) {
    res.status(err?.statusCode ?? 500).json({
      error: err?.message ?? '与智者的对话中断了。',
      code: err?.code ?? 'unknown',
    })
  }
})

/* ---------------- 主动提问 ---------------- */
app.post('/api/reflect', async (req, res) => {
  const { chart, mbti, fortune } = req.body ?? {}
  const chartContext = describeChart(chart)
  const mbtiContext = describeMbti(mbti)
  const prompt = `请根据下面这位旅人的星盘特质${
    fortune ? `与当日运势（${fortune}）` : ''
  }，提出一个关于他的反思问题。要求：温和、具体、贴近当下的生活经验；只用一句话；不给出答案，只提问。\n${chartContext}\n${mbtiContext}`

  try {
    const reply = await callDeepSeek(
      [
        {
          role: 'system',
          content:
            '你现在是数字哲学家苏格拉底，深谙占星学运行逻辑。请用极其温柔、深邃、具有哲学视角的语言与这位旅人对话。',
        },
        { role: 'user', content: prompt },
      ],
      { temperature: 0.9, maxTokens: 160 },
    )
    res.json({ reflection: scrub(reply) })
  } catch (err) {
    res.status(err?.statusCode ?? 500).json({
      error: err?.message ?? '无法生成今日提问。',
    })
  }
})

/* ---------------- MBTI 动态出题 ---------------- */

/** 四个维度的出题轮转表，保证 20 题覆盖每个维度 5 次 */
const AXIS_CYCLE = ['EI', 'NS', 'TF', 'JP', 'EI', 'NS', 'TF', 'JP', 'EI', 'NS',
  'TF', 'JP', 'EI', 'NS', 'TF', 'JP', 'EI', 'NS', 'TF', 'JP']

/**
 * POST /api/mbti-question
 *
 * 依据用户「历史问答记录」动态生成下一道题。
 * 请求体：
 *   { answeredCount, total, axis?, history: [{question, answer, axis}] }
 * 响应体：
 *   { question, options: [{label, value}], bridge, degraded? }
 *
 * v6.0 关键改动：
 *   · 云端失败时 **不再报错**，而是自动降级到本地题库，
 *     保证 20 题测评流程永远不会中断。
 *   · 返回 degraded 标记，前端据此显示「离线题库」提示。
 *   · 错误分类（限流 / 超时 / 网络 / 未配置 Key）细化。
 */
app.post('/api/mbti-question', async (req, res) => {
  const { answeredCount, total, history } = req.body ?? {}

  const count = Number.isFinite(answeredCount) ? Math.max(0, answeredCount) : 0
  const target = Number.isFinite(total) ? total : AXIS_CYCLE.length
  const transcript = normalizeAnswerHistory(history)

  // 维度：优先用前端指定，否则按轮转表推进
  const axis =
    typeof req.body?.axis === 'string' && req.body.axis
      ? req.body.axis
      : (AXIS_CYCLE[count % AXIS_CYCLE.length] ?? 'EI')

  const system = [
    '你是一位资深的 MBTI 测评设计师，擅长根据受测者的历史回答，' +
      '即时设计出能最大区分性格维度的场景化问题。',
    '你的题目必须具体、贴近真实生活、承接前文，且两个选项都同样有吸引力。',
    '【绝对约束】你只能围绕 Prompt 中给出的「母题原型」做情境变体，' +
      '严禁替换题目内核、严禁自由发挥新维度。',
  ].join('')

  const prompt = buildQuestionPrompt({
    axis,
    answeredCount: count,
    total: target,
    history: transcript,
    // v7.0：把该轴的母题原型交给模型，锁死题目内核
    prototype: getPrototypes(axis, Math.floor(count / 4)),
  })

  try {
    const raw = await callDeepSeek(
      [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
      {
        temperature: 0.95,
        maxTokens: 700,
        timeout: 75_000,
        retries: 1,
        jsonMode: true,
      },
    )
    const parsed = parseJson(raw)
    const question = parsed?.question
    const options = Array.isArray(parsed?.options) ? parsed.options : []
    if (typeof question !== 'string' || !question.trim() || options.length < 2) {
      // 模型返回结构不完整 —— 同样降级到本地题库
      const fb = pickFallbackQuestion(axis, count)
      return res.json({ ...fb, degraded: true, reason: 'malformed' })
    }
    res.json({
      question: question.trim(),
      bridge:
        typeof parsed.bridge === 'string' ? parsed.bridge.trim() : undefined,
      options: options.slice(0, 2).map((o) => ({
        label: String(o?.label ?? '').trim(),
        value: o?.value === 1 ? 1 : -1,
      })),
      axis,
      degraded: false,
    })
  } catch (err) {
    /* ---------- v6.0：降级而不是报错 ---------- */
    const fb = pickFallbackQuestion(axis, count)
    console.warn(
      `[life-script] MBTI 出题降级到本地题库（${err?.code ?? 'unknown'}）：${err?.message ?? err}`,
    )
    res.status(200).json({
      ...fb,
      degraded: true,
      reason: err?.code ?? 'unknown',
    })
  }
})

/* ============================================================
 *  天赋深度测算（v12.0 · 任务 1 + 任务 3）
 * ============================================================
 *
 *  【v12.0 的两处根本改变】
 *
 *  一、数据绑定修复（任务 1）
 *    旧版返回的是 `categories: [{key, label, score, direction, field, ...}]`，
 *    其中 `direction` / `field` 由服务端从**同一张全局表**里取，
 *    于是四个领域的副标题与引言一模一样 —— 这就是数据穿模。
 *
 *    新版强制四个领域各自返回**绝对独立的对象**：
 *      career        → { title, subtitle, field, description, ... }
 *      academic      → { title, subtitle, field, description, ... }
 *      interpersonal → { title, subtitle, field, description, ... }
 *      wealth        → { title, subtitle, field, description, ... }
 *    每个对象的所有字段都必须**只属于自己**。
 *
 *  二、静态语料库引接（任务 3）
 *    旧版让模型自由发挥长文 → 文字同质化、AI 味浓。
 *    新版先从本地语料库检索出**人类写过的句子**，
 *    再让 AI 只写「连接词」把它们串起来。
 *    AI 严禁自己造段 —— 服务端会做长度与相似度校验，
 *    不合格就直接丢弃 AI 的文本，退回语料库原句。
 * ============================================================ */

app.post('/api/talent', async (req, res) => {
  const { chart, mbti, extra } = req.body ?? {}
  const chartContext = describeChart(chart)
  const mbtiContext = describeMbti(mbti)
  const extraText = typeof extra === 'string' ? extra.trim() : ''

  /* ---------- 从星盘里取检索用的关键词 ---------- */
  const sunSign = chart?.bigThree?.sun?.sign ?? {}
  const element = sunSign.element ?? 'air'
  const signKey = sunSign.key ?? 'aries'
  const salt = Date.now() % 9973

  /* ---------- v12.0：先检索语料库 ----------
   *
   * usedSubtitles 跨领域共享 ——
   * 保证四个领域的角色副标题在结构上就**不可能相同**。
   */
  const usedSubtitles = new Set()
  const packs = DOMAINS.map((domain, i) =>
    retrieve(domain, element, signKey, salt + i, usedSubtitles),
  )

  /* 每个领域的语料包，单独写进 prompt，互不混合 */
  const packBlocks = packs.map((p, i) => {
    const domain = DOMAINS[i]
    return [
      `【${DOMAIN_LABEL[domain]} · ${domain}】`,
      `· 角色名（必须原样使用）：${p.role.title}`,
      `· 角色定义 subtitle（必须原样使用）：${p.role.subtitle}`,
      `· 方向说明 field（原样使用）：${p.role.field}`,
      `· 人类原句（必须**一字不改**地作为 quote 字段输出）：${p.passage.text}`,
      `· 出处（原样使用）：${p.passage.source}`,
      `· 原句的白话转写（原样使用）：${p.passage.modern}`,
      `· 落在读者身上的表现（原样使用）：${p.passage.scene}`,
      `· 可选动作池（原样使用其一）：${p.action}`,
    ].join('\n')
  }).join('\n\n')

  const prompt = [
    '为这位旅人做一份【天赋解析】。四个领域各有各的样子，不许互相复制。',
    '',
    '【最重要 · 你的角色只是「连接者」】',
    '下面给了你四个**人类写过的**文字包。内容主体已经由人写好了 ——',
    '原句、白话转写、表现、角色定义，全部是现成的人类文本。',
    '**你只写连接词**：把给定的原句与这位旅人连起来的那一两句话。',
    '严禁自己另写一段长文来「替代」那些原句。严禁改写、引申、扩写原句的意思。',
    '你能写的只有：description（专属解析，一到两句，把原句落到他身上）',
    '与 strength / practice（各一句，温和、具体、第二人称）。',
    '',
    '【四个领域的字段契约 · 每个对象完全独立】',
    '· career        事业',
    '· academic      学业',
    '· interpersonal 人际',
    '· wealth        财富',
    '**每个对象必须带齐下列全部字段，且只能写自己的内容**：',
    '· title       = 该领域的角色名（原样照抄）',
    '· subtitle    = 该领域的角色定义（原样照抄）',
    '· field       = 该领域的方向说明（原样照抄）',
    '· description = 一到两句「专属解析」，把该领域的原句落到这位旅人身上',
    '· quote       = 该领域的**人类原句**，一字不改',
    '· quoteSource = 出处，一字不改',
    '· quoteModern = 白话转写，一字不改',
    '· quoteScene  = 具体表现，一字不改',
    '· score       = 0-100',
    '· strength    = 一句优势，写具体行为',
    '· practice    = 一句练习，来自上面的动作池',
    '',
    '【防止数据穿模 · 写完必须逐条自检】',
    '· 四段的 subtitle 必须**互不相同**（那是四个不同角色的定义）。',
    '· 四段的 quote 必须是**四句不同的原句**，不许重复同一句。',
    '· 四段的 description 讲的事必须不一样：',
    '  事业讲做事的方式和位置；学业讲怎么学与怎么输出；',
    '  人际讲关系与他人感受；财富讲资源与风险。',
    '· 事业里不许出现「学习」「钻研」；人际里不许出现「人脉」；',
    '  财富里不许出现「规划目标」；学业里不许写「扛责任」。',
    '· **句式不能雷同**。不许四段都以「你擅长…」或都以「把…」开头。',
    '',
    '【语气】',
    '· 全程第二人称「你」。',
    '· **绝对不许出现星座名或占星词**（双子、天蝎、上升、太阳、月亮、命盘、宫位等一律不许）。',
    '  想表达「你的另一半」就说「你的另一半」「你骨子里的那部分」「跟你相反的那面」。',
    '· 字数：description 40 字以内，strength 45 字以内，practice 45 字以内。',
    '· 禁止连接词：首先、其次、最后、总之、综上所述、值得注意的是、换句话说。',
    '· 禁止说教口吻（「你应该」「建议您」「必须」开头）。',
    '· 一句话只说一件事。',
    '',
    chartContext,
    mbtiContext,
    extraText ? `【用户补充的现状】${extraText}` : '【用户补充的现状】（未填写）',
    '',
    '【人类文本包 · 按领域分好，不要混用】',
    packBlocks,
    '',
    '【经典补充】',
    (() => {
      const c = pickClassic(signKey + salt)
      return c ? `${c.text} —— ${c.source}` : ''
    })(),
    '',
    '严格只输出 JSON，不要任何解释文字或 markdown 代码块。',
    '',
    '输出格式：',
    '{"categories":[{"key":"career","label":"事业","score":78,"title":"...","subtitle":"...","field":"...","description":"...","quote":"...","quoteSource":"...","quoteModern":"...","quoteScene":"...","strength":"...","practice":"..."},{"key":"academic","label":"学业","score":82,"title":"...","subtitle":"...","field":"...","description":"...","quote":"...","quoteSource":"...","quoteModern":"...","quoteScene":"...","strength":"...","practice":"..."},{"key":"interpersonal","label":"人际","score":74,"title":"...","subtitle":"...","field":"...","description":"...","quote":"...","quoteSource":"...","quoteModern":"...","quoteScene":"...","strength":"...","practice":"..."},{"key":"wealth","label":"财富","score":70,"title":"...","subtitle":"...","field":"...","description":"...","quote":"...","quoteSource":"...","quoteModern":"...","quoteScene":"...","strength":"...","practice":"..."}],"yearly":[{"year":2026,"focus":"...","action":"..."}],"advice":["...","...","...","..."],"minimal":["...","...","...","...","..."],"deep":["...","...","...","...","..."]}',
  ]
    .filter(Boolean)
    .join('\n')

  try {
    const raw = await callDeepSeek(
      [
        { role: 'system', content: TALENT_DUAL_SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      { temperature: 0.6, maxTokens: 2600 },
    )
    const parsed = parseJson(raw)
    if (!parsed) {
      return res.status(502).json({ error: '模型返回的内容看不懂。' })
    }

    /* ============================================================
     *  v16.0 · 双版本
     *
     *  categories（四个领域的详细解析）保持原样，
     *  另外补上 minimal（3-5 条短句）与 deep（3-5 段话）。
     * ============================================================ */
    const base = normalizeTalentPayload(parsed, packs, DOMAINS)

    const asList = (v) => {
      if (Array.isArray(v)) {
        return v.map((x) => scrub(String(x ?? ''))).filter(Boolean)
      }
      if (typeof v === 'string' && v.trim()) {
        return v.split(/\n+/).map((x) => scrub(x)).filter(Boolean)
      }
      return []
    }

    const minimalList = asList(parsed.minimal)
    const deepList = asList(parsed.deep)

    res.json({
      ...base,
      minimal: minimalList.length ? minimalList : [],
      deep: deepList.length ? deepList : [],
    })
  } catch (err) {
    res.status(err?.statusCode ?? 500).json({
      error: err?.message ?? '天赋测算中断了。',
    })
  }
})

/* ============================================================
 *  v12.0 · 天赋结果归一化（服务端最后一道防线）
 * ============================================================
 *
 *  三道防线：
 *   1. **四个领域必须齐全** —— 缺一个就用地料库补上。
 *   2. **原句字段不可被改写** —— quote / quoteSource /
 *      quoteModern / quoteScene 一律以语料库为准，
 *      模型给的版本只在它与语料库完全一致时才被保留（实际等于丢弃）。
 *   3. **角色字段必须来自对应领域** —— subtitle / title / field
 *      一律用该领域语料包里的角色定义，
 *      从根上杜绝「一个全局变量 map 到四张卡」。
 * ============================================================ */

/** 字符级 Jaccard 相似度 */
function textSimilarity(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return 0
  const sa = new Set(a.replace(/[，。、；：？！「」…—\s]/g, ''))
  const sb = new Set(b.replace(/[，。、；：？！「」…—\s]/g, ''))
  if (!sa.size || !sb.size) return 0
  let inter = 0
  for (const c of sa) if (sb.has(c)) inter++
  return inter / (sa.size + sb.size - inter)
}

/** 跨领域相似度阈值 —— 中文短句的实测分界 */
const TALENT_DUP_THRESHOLD = 0.42

/**
 * 天赋模块专用的占星术语表。
 *
 * 比全局 ASTRO_TERMS 更严 —— 这里连「太阳」「月亮」「上升」都不放过。
 * 原因：天赋解析里出现「双子太阳」这种词，
 * 对懂行的人是速记，对普通用户就是乱码。
 */
const TALENT_ASTRO_TERMS = [
  '星座', '白羊', '金牛', '双子', '巨蟹', '狮子', '处女', '天秤', '天蝎',
  '射手', '摩羯', '水瓶', '双鱼', '宫位', '宫', '行星', '本命盘', '星盘',
  '占星', '命理', '相位', '黄道', '天顶', '上升', '落座', '宫头',
  '太阳', '月亮', '金星', '木星', '土星', '火星', '水星', '海王', '天王',
]

/** 是否命中占星术语 */
function talentHasAstroTerms(text) {
  if (typeof text !== 'string' || !text) return false
  return TALENT_ASTRO_TERMS.some((t) => text.includes(t))
}

/** 单条文本的硬上限（超出即视为模型在长篇大论） */
const TALENT_TEXT_LIMIT = {
  description: 46,
  strength: 48,
  practice: 48,
}

/**
 * 归一化 AI 返回的天赋结果。
 *
 * @param parsed AI 的原始 JSON
 * @param packs  语料库检索结果（与 DOMAINS 同序）
 */
function normalizeTalentPayload(parsed, packs, domains) {
  const list = Array.isArray(parsed?.categories) ? parsed.categories : []
  const byKey = new Map()
  for (const c of list) {
    if (c && typeof c === 'object' && typeof c.key === 'string') {
      byKey.set(c.key, c)
    }
  }

  const seenDescription = []
  const seenStrength = []
  const seenPractice = []
  const seenQuote = []

  const categories = domains.map((domain, i) => {
    const pack = packs[i]
    const raw = byKey.get(domain) ?? {}

    /* ---------- 原句：语料库说了算 ---------- */
    const quote = pack.passage.text
    const quoteSource = pack.passage.source
    const quoteModern = pack.passage.modern
    const quoteScene = pack.passage.scene

    /* ---------- 角色：语料库说了算（杜绝穿模） ---------- */
    const title = pack.role.title
    const subtitle = pack.role.subtitle
    const field = pack.role.field

    /* ---------- 连接词：取 AI 的，但要过质检 ---------- */
    const take = (aiText, pool, seen, limit) => {
      const t = typeof aiText === 'string' ? aiText.trim() : ''
      if (!t) return ''
      /* 太长 —— 模型在长篇大论 */
      if (t.length > limit) return ''
      /* 与别的领域太像 —— 跨领域复制 */
      if (seen.length && Math.max(...seen.map((s) => textSimilarity(t, s))) > TALENT_DUP_THRESHOLD) {
        return ''
      }
      /*
       * v12.0：占星术语防线。
       * 模型常常在连接词里塞进「双子太阳」「上升摩羯」这类词 ——
       * 对占星爱好者是速记，对普通用户是乱码。
       * 命中就整句丢弃，退回语料库的白话转写。
       */
      if (talentHasAstroTerms(t)) return ''
      return t
    }

    const description = take(
      raw.description,
      null,
      seenDescription,
      TALENT_TEXT_LIMIT.description,
    )
    const strength = take(
      raw.strength,
      null,
      seenStrength,
      TALENT_TEXT_LIMIT.strength,
    )
    const practice = take(
      raw.practice,
      null,
      seenPractice,
      TALENT_TEXT_LIMIT.practice,
    )

    if (description) seenDescription.push(description)
    if (strength) seenStrength.push(strength)
    if (quote) seenQuote.push(quote)

    const score =
      typeof raw.score === 'number' && Number.isFinite(raw.score)
        ? Math.max(0, Math.min(100, Math.round(raw.score)))
        : 60

    return {
      key: domain,
      label: DOMAIN_LABEL[domain],
      score,
      title,
      subtitle,
      field,
      description: description || quoteModern,
      quote,
      quoteSource,
      quoteModern,
      quoteScene,
      strength: strength || quoteScene,
      practice: practice || pack.action,
    }
  })

  /* ---------- 每年适合做的事 ---------- */
  const years = Array.isArray(parsed?.yearly) ? parsed.yearly : []
  const thisYear = new Date().getFullYear()
  /* 每年焦点池 —— AI 少给的那几年，用本地池补齐，绝不留空 */
  const FOCUS_POOL = [
    ['把专业做深', '带一支小队', '开一条新线', '把经验变成产品'],
    ['补一门硬课', '做一次公开讲解', '把方法写成文', '跨领域取材'],
    ['把需求说清楚', '建立稳定的节奏', '修复一段旧关系', '学会给空间'],
    ['理清收支', '盘活一笔资源', '做一次长期定投', '砍掉一项浪费'],
  ]
  const yearly = Array.from({ length: 4 }, (_, i) => {
    const y = years[i]
    const year = typeof y?.year === 'number' ? y.year : thisYear + i
    let focus = typeof y?.focus === 'string' ? y.focus.trim() : ''
    let action = typeof y?.action === 'string' ? y.action.trim() : ''
    /* 模型有时把 focus 写成了一整句话 —— 太长就退回本地池 */
    if (focus.length > 16) focus = ''
    if (action.length > 60) action = ''
    if (!focus) {
      const pool = FOCUS_POOL[i % FOCUS_POOL.length]
      focus = pool[(year + i) % pool.length]
    }
    if (!action) {
      action = `把「${focus}」做掉，并给它一个能验收的期限。`
    }
    return { year, focus, action }
  })

  /* ---------- 落地建议 ---------- */
  const adv = Array.isArray(parsed?.advice) ? parsed.advice : []
  const advice = adv
    .filter((a) => typeof a === 'string' && a.trim())
    .map((a) => a.trim())
    .filter((a) => !talentHasAstroTerms(a))
    .slice(0, 4)
  /* 少于四条就用各领域的练习补齐 */
  if (advice.length < 4) {
    for (const c of categories) {
      if (advice.length >= 4) break
      const line = c.practice || c.quoteScene
      if (line && !advice.includes(line)) advice.push(line)
    }
  }

  return { categories, yearly, advice }
}

/* ============================================================
 *  灵魂底色（性格素描）· 单句生成（v5.0）
 *
 *  硬性契约：
 *   · 输出必须且只能是一句话
 *   · 长度 50-80 汉字
 *   · 一句话内串联：外在表现 + MBTI + 日月升特质 + 出生地影响
 * ============================================================ */
app.post('/api/soul', async (req, res) => {
  const { chart, mbti, place } = req.body ?? {}
  const material = describeSoulMaterial(chart, mbti, place)

    .filter(Boolean)
    .join('\n')

  try {
    /* ============================================================
     *  v16.0 · 双版本：一次调用返回极简版 + 深度版
     * ============================================================ */
    const dualPrompt = [
      '请依据下面的写作素材，为这位旅人写一段速写。',
      '按 System Prompt 的要求，同时给出 minimal 与 deep 两个版本。',
      '',
      material,
    ]
      .filter(Boolean)
      .join('\n')

    const raw = await callDeepSeek(
      [
        { role: 'system', content: SOUL_DUAL_SYSTEM_PROMPT },
        { role: 'user', content: dualPrompt },
      ],
      { temperature: 0.95, maxTokens: 700, timeout: 60_000, retries: 1 },
    )

    const parsed = parseJson(raw)

    if (parsed && (parsed.minimal || parsed.deep)) {
      const dual = normalizeDual(
        parsed,
        '你慢热，熟了之后比谁都重感情。',
        '你跟谁都客气三分，熟起来却能给到底。\n\n刚认识你的人会觉得你有点距离感。你只是还没决定要不要认真。\n\n挑准了人你会特别护短，值得你花时间的事你从不嫌慢。',
      )
      if (typeof dual.minimal === 'string' && hasAstroTerms(dual.minimal)) {
        const stripped = stripAstroTerms(dual.minimal)
        if (stripped.length >= 20) dual.minimal = stripped
      }
      return res.json({
        text: dual.minimal,
        minimal: dual.minimal,
        deep: dual.deep,
      })
    }

    /* ---------- 降级：单版本 ---------- */
    let text = normalizeSoulPortrait(raw)

    /* v6.0：占星术语防线 —— 命中就剥离，剥离后不成句则直接判失败 */
    if (hasAstroTerms(text)) {
      const stripped = stripAstroTerms(text)
      text = stripped.length >= 30 ? normalizeSoulPortrait(stripped) : ''
    }

    if (!text) {
      return res.status(502).json({
        error: '模型没有给出可用的速写。',
        code: 'malformed',
      })
    }
    res.json({ text, minimal: text, deep: text })
  } catch (err) {
    res.status(err?.statusCode ?? 500).json({
      error: err?.message ?? '灵魂底色生成中断了。',
      code: err?.code ?? 'unknown',
    })
  }
})

/* ============================================================
 *  每日灵感抽牌（v6.0 · 任务 5）
 *
 *  硬性约束（中立性）：
 *   · 必须是绝对中立、客观的生活小建议（Tip）
 *   · 不允许任何正向 / 负向的情绪倾向
 *   · 不预测吉凶、不做预言、不给情绪价值判断
 *   · 只提供一个「微小的生活视角切入」
 * ============================================================ */

/** 抽牌提示词的 System Prompt —— 严格约束中立性 */
const TIP_SYSTEM_PROMPT = `你是一位提供生活小建议的卡片文案作者。你写的东西必须像一张随手抽到的生活小卡片。

【绝对约束】
1. 只输出 60 到 90 个汉字，一段话，不换行，不分段，不加引号。
2. 语气绝对中立：既不鼓励也不劝阻，不夸奖也不批评。
3. 绝不预测吉凶、运气、时运、趋势或任何结果。
4. 绝不做情绪评价（不说"你会成功""你将失去""很棒""糟糕"）。
5. 不提及星盘、星座、命理、占星或任何玄学概念。
6. 只描述一个具体、微小、可立刻执行的生活动作或观察角度。
7. 内容必须具体到动作层面（做什么、看哪里、留心什么），不能是空泛的道理。

【写法示例（只示范结构，不要抄内容）】
「留意今天你第三次拿起杯子时的间隔 —— 那通常是你在犹豫的时刻，比日程表更早告诉你状态。」`

/** 本地兜底提示池（云端不可用时使用，同样保持中立） */
const FALLBACK_TIPS = [
  '留意你今天打开手机的那一次 —— 那一刻你真正想找的是什么，往往比答案更值得清楚。',
  '把今天要做的三件事写在同一张纸上，完成后划掉它们，笔触比清单更能安定情绪。',
  '注意你今天第一次停顿下来的时刻，多数重要的小决定都是在那个停顿里做出的。',
  '把今天喝掉的第一杯水放在手边，渴了再喝 —— 一个微小的节奏，能把一天拉回正轨。',
  '观察今天谁对你多说了一句，多半是这个人今天比平时更需要被听见。',
  '给今天遇到的某个小事起一个具体的名字，被命名的事，会变得容易处理得多。',
  '留意你今天想说却没说的那半句话，它的长度，就是你当下留给自己的空间。',
  '把今天最枯燥的一段工作切得更细一点，只做其中最小的一格，然后停下来看看。',
  '注意你今天走过的路，有一段你记得比别的清楚 —— 身体的记忆往往比脑子诚实。',
  '今天若有件事让你犹豫，不妨只把它写下来，不急着决定，写完就先去睡一觉。',
]

/* ============================================================
 *  优势挖掘 · AI 职位与行动方向推演（v17.0）
 *
 *  与 Cloudflare Workers 的 /api/career-advice 完全同源。
 * ============================================================ */
app.post('/api/career-advice', async (req, res) => {
  const payload = normalizeCareerPayload(req.body ?? {})

  try {
    const raw = await callDeepSeek(
      [
        { role: 'system', content: CAREER_SYSTEM_PROMPT },
        { role: 'user', content: buildCareerUserPrompt(payload) },
      ],
      { temperature: 0.85, maxTokens: 2200, timeout: 60_000, retries: 1 },
    )

    /* ---------- 解析 JSON（容忍 markdown 代码块包裹） ---------- */
    let parsed = null
    const cleaned = String(raw ?? '')
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/i, '')
    try {
      parsed = JSON.parse(cleaned)
    } catch {
      const start = cleaned.indexOf('{')
      const end = cleaned.lastIndexOf('}')
      if (start >= 0 && end > start) {
        try {
          parsed = JSON.parse(cleaned.slice(start, end + 1))
        } catch {
          parsed = null
        }
      }
    }

    res.json(normalizeCareerResult(parsed))
  } catch (err) {
    console.warn(
      `[life-script] 职位建议生成失败（${err?.code ?? 'unknown'}）：${err?.message ?? err}`,
    )
    res.status(500).json({
      error: err?.message ?? '建议生成中断了。',
      code: err?.code ?? 'unknown',
    })
  }
})

app.post('/api/tip', async (req, res) => {
  const { chart, mbti } = req.body ?? {}
  const context = describeChart(chart)
  const mbtiContext = describeMbti(mbti)

  const prompt = [
    '请写一张「每日灵感卡」，给这位旅人一个绝对中立的生活小建议。',
    '',
    '严格遵守 System Prompt 的格式与中立性约束。',
    '',
    context,
    mbtiContext,
  ]
    .filter(Boolean)
    .join('\n')

  try {
    const raw = await callDeepSeek(
      [
        { role: 'system', content: TIP_SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      { temperature: 0.9, maxTokens: 260, timeout: 60_000, retries: 1 },
    )
    const text = normalizeTip(raw)
    if (!text) {
      return res.json({
        text: FALLBACK_TIPS[Math.floor(Math.random() * FALLBACK_TIPS.length)],
        degraded: true,
      })
    }
    res.json({ text, degraded: false })
  } catch (err) {
    console.warn(
      `[life-script] 抽牌降级到本地提示池（${err?.code ?? 'unknown'}）：${err?.message ?? err}`,
    )
    res.status(200).json({
      text: FALLBACK_TIPS[Math.floor(Math.random() * FALLBACK_TIPS.length)],
      degraded: true,
    })
  }
})

/**
 * 把抽牌输出压成单段、去掉换行与多余标点。
 */
function normalizeTip(raw) {
  if (typeof raw !== 'string') return ''
  let t = raw
    .replace(/```[\s\S]*?```/g, '')
    .replace(/^[\s"'「『【(（]+/, '')
    .replace(/[\s"'」』】)）]+$/, '')
    .replace(/[\r\n]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!t) return ''
  t = t.replace(/[。！？!?…]+$/g, '')
  return t ? `${t}。` : ''
}

/* ============================================================
 *  v8.0 · 塔罗牌三段式解析
 *
 *  抽到的牌只是一个「核心词语」，
 *  真正的内容由这里生成：
 *    1. essence  —— 牌面本质
 *    2. guidance —— 今日具体指引（多条可执行动作）
 *    3. chartLink —— 星盘连结（结合本命盘数据背书）
 *
 *  云端失败时返回 degraded:true，前端用本地生成器兜底，
 *  保证展开后的文字量永远足够充实。
 * ============================================================ */
app.post('/api/tarot-reading', async (req, res) => {
  const { card, chart, mbti } = req.body ?? {}

  const cardName = typeof card?.name === 'string' ? card.name.trim() : ''
  const cardMeaning =
    typeof card?.meaning === 'string' ? card.meaning.trim() : ''
  const cardEssence =
    typeof card?.essence === 'string' ? card.essence.trim() : ''

  if (!cardName) {
    return res.status(400).json({ error: '缺少 card.name 字段。' })
  }

  /*
   * ============================================================
   *  v11.0 · 任务 4 · 动态防重（Dynamic Seed）
   * ============================================================
   *
   *  旧版问题：同一张牌，每次生成的解析几乎一样。
   *  用户连续两天抽到同一张牌（22 张牌库里必然会反复发生），
   *  会觉得「又是这句」—— 神秘感当场崩塌。
   *
   *  现在把**时间戳**与**星盘变量**一起喂给模型，
   *  并明确要求：即使牌相同，侧重点也必须完全不同。
   * ============================================================
   */
  const seedTs = Number.isFinite(req.body?.seed)
    ? Number(req.body.seed)
    : Date.now()
  const seedDate = new Date(seedTs)
  const seedKey = `${seedDate.getFullYear()}-${String(seedDate.getMonth() + 1).padStart(2, '0')}-${String(seedDate.getDate()).padStart(2, '0')} ${String(seedDate.getHours()).padStart(2, '0')}:${String(seedDate.getMinutes()).padStart(2, '0')}`
  const seedHash = (() => {
    let h = 2166136261
    for (let i = 0; i < seedKey.length; i++) {
      h ^= seedKey.charCodeAt(i)
      h = Math.imul(h, 16777619)
    }
    return (h >>> 0) % 10000
  })()

  const prompt = [
    `读者今日抽到的塔罗牌是「${cardName}」。`,
    cardMeaning ? `这张牌的核心意涵是：${cardMeaning}` : '',
    cardEssence ? `牌面本质参考：${cardEssence}` : '',
    '',
    '请严格按 System Prompt 要求，输出极简 JSON。',
    '',
    '【v11.0 · 动态种子 · 必须结合它来写】',
    `当前时间戳：${seedKey}`,
    `时间种子：${seedHash}`,
    '这个种子会随着每一次翻牌而变化。',
    '你必须把它当成「今天的独特语境」——',
    '用它来决定这一次提示的**切入角度**（例如：从工作切入 / 从身体切入 /',
    '从某个具体时段切入 / 从一个反直觉的角度切入）。',
    '同一个牌在不同时间戳下，必须是**完全不同的侧重点**。',
    '',
    describeChart(chart),
    describeMbti(mbti),
  ]
    .filter(Boolean)
    .join('\n')

  try {
    const raw = await callDeepSeek(
      [
        { role: 'system', content: TAROT_DUAL_SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      { temperature: 0.8, maxTokens: 1400, timeout: 75_000, retries: 1 },
    )
    const parsed = parseJson(raw)

    /* ============================================================
     *  v16.0 · 双版本
     * ============================================================ */
    const fb = {
      gist: '有件事正在悄悄改变你的节奏。',
      action: '今天挑一件小事把它做完。',
    }
    const pickVersion = (v, fallback) => {
      if (!v || typeof v !== 'object') return fallback
      const g =
        typeof v.gist === 'string' && v.gist.trim() ? scrub(v.gist) : fallback.gist
      const a =
        typeof v.action === 'string' && v.action.trim()
          ? scrub(v.action)
          : fallback.action
      return { gist: g, action: a }
    }

    const minimal = pickVersion(parsed?.minimal, fb)
    const deep = pickVersion(parsed?.deep, minimal)

    if (!minimal.gist || !minimal.action) {
      return res.status(502).json({
        error: '模型返回的内容不完整。',
        code: 'malformed',
      })
    }

    res.json({
      gist: minimal.gist,
      action: minimal.action,
      minimal,
      deep,
      degraded: false,
    })
  } catch (err) {
    console.warn(
      `[life-script] 塔罗解析降级到本地生成器（${err?.code ?? 'unknown'}）：${err?.message ?? err}`,
    )
    res.status(200).json({
      gist: cardMeaning || cardName,
      action: card.tip ?? '',
      degraded: true,
      code: err?.code ?? 'unknown',
    })
  }
})

/* ============================================================
 *  多维运势测算（v4.0）
 *
 *  把「年 / 月 / 日」三种时间尺度，都拆成四个独立维度：
 *  事业学业 / 财富 / 健康 / 爱情，
 *  并要求模型体现周期性变化趋势与未来观测预警。
 * ============================================================ */
app.post('/api/fortune', async (req, res) => {
  const { chart, mbti } = req.body ?? {}
  const chartContext = describeChart(chart)
  const mbtiContext = describeMbti(mbti)

  /*
   * ============================================================
   *  v11.0 · 任务 3 · 提示词去占星术语化
   * ============================================================
   *
   *  旧版这里直接告诉模型「以行星长期行运（土星、木星）为背景」
   *  —— 模型听话的概率很高，于是运势文案里开始出现
   *  「土星刑克」「木星过境」这类用户完全无法消化的词。
   *
   *  现在把「推导依据」和「输出措辞」彻底分离：
   *  · 依据仍然来自星盘（你可以用土星去推导）
   *  · 但措辞只允许落在「生活层面发生了什么」
   * ============================================================
   */
  /*
   * v17.0 · 彻底纯粹化
   *
   * 【为什么砍掉年 / 月】
   * 旧版运势面板把「年度运势」「月度运势」「前半月 vs 后半月」
   * 混在一起，结果是：
   *   · 每个格子的句式都一样（复读机凑版面）
   *   · 用户在「今天该注意什么」的时候读到一堆长周期废话
   *   · 四张卡长得一模一样，看不出差别
   *
   * 现在**只讲今天这 24 小时**。
   */
  const guide = {
    label: '今日',
    span: '今天的 24 小时（从现在到今天结束）',
    rule:
      '只说今天。给出今天整体的状态基调，' +
      '以及今天最该注意的一个生活切面和一件具体的小事。' +
      '**绝对不许**出现「今年」「这个月」「本季度」「未来几天」这类长周期表述。',
  }

  const prompt = [
    `请依据以下材料，为这位旅人做一份【${guide.label}运势】的四维测算。`,
    '',
    '【硬性要求】',
    '1. 必须拆分为四个独立维度：career（事业/学业）、wealth（财富）、health（健康）、love（爱情）。',
    '2. 每个维度都要写三句话：',
    '   · summary —— 当期的主线判断（一句话，具体、不空泛）。',
    '   · trend —— 接下来会怎么走（说明这个维度是在上行、平台期还是回落，并指出变化的原因）。',
    '   · warning —— 需要留意什么（指出具体的信号与应对动作）。',
    '3. 四个维度都要出现，不能省略任何一个。',
    `4. 时间跨度参考：${guide.span}。${guide.rule}`,
    '5. 语气温和、具体、可执行，禁止宿命论与恐吓式表达。',
    '6. 严格只输出 JSON，不要任何解释文字或 markdown 代码块。',
    '',
    '【v11.0 · 绝对禁令 · 不许出现任何占星术语 · 最重要】',
    '你**可以用星盘推导**结论，但**绝不能把推导过程写出来**。',
    '以下词汇一个字都不许出现在输出里：',
    '· 星座名：白羊座、金牛座、双子座、巨蟹座、狮子座、处女座、天秤座、天蝎座、射手座、摩羯座、水瓶座、双鱼座',
    '  （也包括不带「座」的白羊、金牛、双子、巨蟹、狮子、处女、天秤、天蝎、射手、摩羯、水瓶、双鱼）',
    '· 行星名：太阳、月亮、金星、火星、木星、土星、水星、海王星、天王星、冥王星',
    '· 宫位：第 N 宫、命宫、财帛宫、事业宫、宫头、宫主星、宫位',
    '· 其他：本命盘、星盘、占星、命理、相位、黄道、天顶、上升、落座、行经、刑克、拱、冲',
    '正确的写法是直接说**生活层面的结论**：',
    '  ✗ 「太阳落在白羊座，木星过境事业宫，适合扩张」',
    '  ✓ 「这一年你会想把手上的事做得更大。适合主动一些，别等别人安排。」',
    '  ✗ 「金星在财帛宫，月亮刑克健康宫」',
    '  ✓ 「你花钱看的是值不值，不太看贵不贵。这阵子身体会先给你信号，别硬撑。」',
    '用户不需要懂原理，只需要懂自己。',
    '',
    '【v9.0 · 语气与字数硬性要求】',
    '· 全程第二人称「你」，直接对读者说话。',
    '· 字数上限：summary 45 字以内，trend 55 字以内，warning 55 字以内，overview 40 字以内。',
    '· 绝对禁止这些 AI 腔连接词：首先、其次、最后、总之、总的来说、综上所述、换句话说、值得注意的是、需要注意的是。',
    '· 绝对禁止说教口吻（"你应该""建议您""必须""应当""不妨"开头）。',
    '· 用短句。一句话只说一件事，别用分号和破折号把三件事串起来。',
    '· 语气像一个有经验的朋友在轻声提醒你，不是分析师在念报告。',
    '',
    chartContext,
    mbtiContext,
    '',
    '输出格式：',
    '{"scope":"day","label":"每日运势","dimensions":[{"key":"career","label":"事业/学业","summary":"...","trend":"...","warning":"..."},{"key":"wealth","label":"财富","summary":"...","trend":"...","warning":"..."},{"key":"health","label":"健康","summary":"...","trend":"...","warning":"..."},{"key":"love","label":"爱情","summary":"...","trend":"...","warning":"..."}],"overview":"一句话总览（40字内）"}',
  ]
    .filter(Boolean)
    .join('\n')

  try {
    const raw = await callDeepSeek(
      [
        { role: 'system', content: FORTUNE_DUAL_SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      { temperature: 0.75, maxTokens: 2400 },
    )
    const parsed = parseJson(raw)

    /* ============================================================
     *  v16.0 · 双版本规范化
     *
     *  两个版本的 dimensions 结构**必须一致** ——
     *  这样前端切换时只是换数据，布局完全不动。
     * ============================================================ */
    const shape = (v) => {
      if (!v || typeof v !== 'object') return null
      if (!Array.isArray(v.dimensions)) return null
      return {
        /* v17.0：scrubToToday 把长周期表述收回「今天」 */
        overview: scrubToToday(scrub(typeof v.overview === 'string' ? v.overview : '')),
        dimensions: v.dimensions.map((d) => ({
          key: d?.key ?? '',
          label: d?.label ?? '',
          summary: scrubToToday(scrub(d?.summary ?? '')),
          trend: scrubToToday(scrub(d?.trend ?? '')),
          warning: scrubToToday(scrub(d?.warning ?? '')),
        })),
      }
    }

    const minShape = shape(parsed?.minimal)
    const deepShape = shape(parsed?.deep)

    if (minShape || deepShape) {
      const fallback = minShape ?? deepShape
      return res.json({
        scope: 'day',
        label: guide.label,
        ...fallback,
        minimal: minShape ?? fallback,
        deep: deepShape ?? fallback,
      })
    }

    /* ---------- 降级：单版本 ---------- */
    if (!parsed || !Array.isArray(parsed.dimensions)) {
      return res.status(502).json({ error: '模型返回的内容看不懂。' })
    }
    const single = {
      overview: scrubToToday(scrub(typeof parsed.overview === 'string' ? parsed.overview : '')),
      dimensions: parsed.dimensions.map((d) => ({
        key: d?.key ?? '',
        label: d?.label ?? '',
        summary: scrubToToday(scrub(d?.summary ?? '')),
        trend: scrubToToday(scrub(d?.trend ?? '')),
        warning: scrubToToday(scrub(d?.warning ?? '')),
      })),
    }
    res.json({
      scope: 'day',
      label: guide.label,
      ...single,
      minimal: single,
      deep: single,
    })
  } catch (err) {
    res.status(err?.statusCode ?? 500).json({
      error: err?.message ?? '运势测算中断了。',
    })
  }
})

/* ---------- 工具：容错解析 JSON ---------- */
function parseJson(raw) {
  if (!raw) return null
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim()
  try {
    return JSON.parse(cleaned)
  } catch {
    /* 尝试截取最外层对象 */
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1))
      } catch {
        return null
      }
    }
    return null
  }
}

/* ============================================================
 *  SPA 兜底（v15.1）
 * ============================================================
 *
 *  必须是**最后一个**中间件 —— 它会捕获所有没被前面处理掉的请求。
 *
 *  作用：用户刷新 /dashboard、/talent 这类前端路由时，
 *  这些路径在服务器磁盘上并不存在（Vite 是单页应用），
 *  没有兜底就会 404。回 index.html 让前端路由接管。
 *
 *  注意：以 /api/ 开头的必须放行，
 *  否则拼错的 API 路径会拿到一坨 HTML，前端 JSON.parse 直接炸。
 * ============================================================ */
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({
      error: '接口不存在。',
      path: req.path,
    })
  }
  const indexFile = resolve(DIST_DIR, 'index.html')
  if (!existsSync(indexFile)) {
    return res
      .status(503)
      .type('text/plain; charset=utf-8')
      .send('前端尚未构建。请先执行 npm run build。')
  }
  res.sendFile(indexFile)
})
