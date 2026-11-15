/* ============================================================
 *  Workers API 处理器（v15.2）
 * ============================================================
 *
 *  复刻 server/app.mjs 的 12 条路由，但用 Workers 的
 *  Request / Response 对象实现。
 *
 *  【路由表】
 *    GET  /api/health          健康检查
 *    POST /api/chat             苏格拉底对话
 *    POST /api/reflect          主动提问
 *    POST /api/mbti-question    MBTI 动态出题
 *    POST /api/talent           天赋深度测算
 *    POST /api/soul             灵魂底色
 *    POST /api/tip              每日灵感抽牌
 *    POST /api/tarot-reading    塔罗牌阵
 *    POST /api/fortune          四维运势
 *    POST /api/chart            本命盘（纯 JS 星历）
 *    POST /api/transit          行运
 *
 *  【与 Express 版的差异】
 *    1. 星历：sweph → 纯 JS astro 引擎（Workers 无法加载原生模块）
 *    2. 语料：readFileSync → 静态 import
 *    3. 环境变量：process.env → context.env
 *    4. 超时：Workers 有 CPU 时间限制，DeepSeek 超时压到 55s
 * ============================================================ */

import {
  buildSystemPrompt,
  buildHistory,
  describeChart,
  describeMbti,
  buildQuestionPrompt,
  SOUL_PORTRAIT_SYSTEM_PROMPT,
  TAROT_READING_SYSTEM_PROMPT,
  describeSoulMaterial,
  normalizeSoulPortrait,
  hasAstroTerms,
  stripAstroTerms,
} from '../../server/prompt.mjs'
import { pickFallbackQuestion } from '../../server/mbtiFallback.mjs'
import {
  DOMAINS,
  DOMAIN_LABEL,
  retrieve,
  pickClassic,
} from '../../server/corpus-workers.mjs'
import {
  callDeepSeekWorkers,
  isConfiguredWorkers,
  isPlaceholderKeyWorkers,
  DEEPSEEK_MODEL_WORKERS,
  ERR_WORKERS,
} from './deepseek-workers.js'
import { computeChartWorkers } from './chart-workers.js'
import { normalizeTalentPayload } from './talent-workers.js'

/* ============================================================
 *  基础工具
 * ============================================================ */

/** CORS 响应头（同域部署时其实用不到，但保留以便独立调试） */
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' },
  })
}

/** 宽松的 JSON 解析 —— 模型经常在 JSON 外面包一层说明文字 */
export function parseJson(text) {
  if (typeof text !== 'string') return null
  let cleaned = text.trim()
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '')
  try {
    return JSON.parse(cleaned)
  } catch {
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

/** 读取请求体（容错） */
async function readBody(request) {
  try {
    return await request.json()
  } catch {
    return {}
  }
}

/* ============================================================
 *  路由分发
 * ============================================================ */

export async function handleApi(context) {
  const { request, env } = context

  /* ---------- CORS 预检 ---------- */
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  /* ---------- 路径归一化 ---------- */
  const url = new URL(request.url)
  /* context.params.path 在 catch-all 路由里是数组 */
  const rawPath = Array.isArray(context.params?.path)
    ? context.params.path.join('/')
    : (context.params?.path ?? '')
  const path = `/api/${rawPath}`.replace(/\/+$/, '') || '/api'

  try {
    /* ---------- 健康检查 ---------- */
    if (path === '/api/health' && request.method === 'GET') {
      return json({
        ok: true,
        configured: isConfiguredWorkers(env),
        placeholder: isPlaceholderKeyWorkers(env),
        model: DEEPSEEK_MODEL_WORKERS(env),
        runtime: 'cloudflare-worker',
        errors: ERR_WORKERS,
      })
    }

    if (request.method !== 'POST') {
      return json({ error: '方法不被允许。' }, 405)
    }

    const body = await readBody(request)

    /* ============================================================
     *  苏格拉底对话
     * ============================================================ */
    if (path === '/api/chat') {
      const { message, chart, mbti, history, fortune } = body
      if (typeof message !== 'string' || !message.trim()) {
        return json({ error: '缺少 message 字段。' }, 400)
      }
      if (message.length > 2000) {
        return json({ error: '问题过长。' }, 413)
      }
      const messages = [
        { role: 'system', content: buildSystemPrompt({ chart, mbti, fortune }) },
        ...buildHistory(history),
        { role: 'user', content: message.trim() },
      ]
      try {
        const reply = await callDeepSeekWorkers(env, messages, {
          timeout: 55_000,
          retries: 1,
        })
        return json({ reply })
      } catch (err) {
        return json(
          { error: err?.message ?? '与智者的对话中断了。', code: err?.code ?? 'unknown' },
          err?.statusCode ?? 500,
        )
      }
    }

    /* ============================================================
     *  主动提问
     * ============================================================ */
    if (path === '/api/reflect') {
      const { chart, mbti, fortune } = body
      try {
        const raw = await callDeepSeekWorkers(
          env,
          [
            { role: 'system', content: buildSystemPrompt({ chart, mbti, fortune }) },
            {
              role: 'user',
              content: '请给我一个值得今天想一想的反思问题。只输出问题本身，不要解释。',
            },
          ],
          { temperature: 0.95, maxTokens: 120, timeout: 40_000 },
        )
        return json({ reflection: raw.trim().slice(0, 120) })
      } catch (err) {
        return json(
          { error: err?.message ?? '反思中断了。', code: err?.code ?? 'unknown' },
          err?.statusCode ?? 500,
        )
      }
    }

    /* ============================================================
     *  MBTI 动态出题
     * ============================================================ */
    if (path === '/api/mbti-question') {
      const { axis, count, history } = body
      try {
        const raw = await callDeepSeekWorkers(
          env,
          [
            {
              role: 'system',
              content:
                '你是一名 MBTI 测评设计师。基于母题原型生成情境变体题，' +
                '只改变具体场景与措辞，不改变考察的维度。' +
                '只输出 JSON：{"question":"...","options":[{"label":"...","value":1},{"label":"...","value":-1}]}',
            },
            { role: 'user', content: buildQuestionPrompt(axis, count, history) },
          ],
          { temperature: 0.9, maxTokens: 400, timeout: 25_000 },
        )
        const parsed = parseJson(raw)
        if (!parsed || typeof parsed.question !== 'string') {
          const fb = pickFallbackQuestion(axis, count)
          return json({ ...fb, degraded: true, reason: 'malformed' })
        }
        const options = Array.isArray(parsed.options) ? parsed.options : []
        if (options.length < 2) {
          const fb = pickFallbackQuestion(axis, count)
          return json({ ...fb, degraded: true, reason: 'malformed' })
        }
        return json({
          question: parsed.question.trim(),
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
        const fb = pickFallbackQuestion(axis, count)
        return json({
          ...fb,
          degraded: true,
          reason: err?.code ?? 'unknown',
        })
      }
    }

    /* ============================================================
     *  天赋深度测算
     * ============================================================ */
    if (path === '/api/talent') {
      const { chart, mbti, extra } = body
      const chartContext = describeChart(chart)
      const mbtiContext = describeMbti(mbti)
      const extraText = typeof extra === 'string' ? extra.trim() : ''

      const sunSign = chart?.bigThree?.sun?.sign ?? {}
      const element = sunSign.element ?? 'air'
      const signKey = sunSign.key ?? 'aries'
      const salt = Date.now() % 9973

      const usedSubtitles = new Set()
      const packs = DOMAINS.map((domain, i) =>
        retrieve(domain, element, signKey, salt + i, usedSubtitles),
      )

      const packBlocks = packs
        .map((p, i) => {
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
        })
        .join('\n\n')

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
        extraText
          ? `【用户补充的现状】${extraText}`
          : '【用户补充的现状】（未填写）',
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
        '{"categories":[{"key":"career","label":"事业","score":78,"title":"...","subtitle":"...","field":"...","description":"...","quote":"...","quoteSource":"...","quoteModern":"...","quoteScene":"...","strength":"...","practice":"..."},{"key":"academic","label":"学业","score":82,"title":"...","subtitle":"...","field":"...","description":"...","quote":"...","quoteSource":"...","quoteModern":"...","quoteScene":"...","strength":"...","practice":"..."},{"key":"interpersonal","label":"人际","score":74,"title":"...","subtitle":"...","field":"...","description":"...","quote":"...","quoteSource":"...","quoteModern":"...","quoteScene":"...","strength":"...","practice":"..."},{"key":"wealth","label":"财富","score":70,"title":"...","subtitle":"...","field":"...","description":"...","quote":"...","quoteSource":"...","quoteModern":"...","quoteScene":"...","strength":"...","practice":"..."}],"yearly":[{"year":2026,"focus":"...","action":"..."}],"advice":["...","...","...","..."]}',
      ]
        .filter(Boolean)
        .join('\n')

      try {
        const raw = await callDeepSeekWorkers(
          env,
          [
            {
              role: 'system',
              content:
                '你是一位文字编辑。你的工作**不是**创作，而是把人类写过的句子与读者连起来。' +
                '给定的经典原句、白话转写、表现与角色定义都是人写的，必须原样保留。' +
                '你只补一两句温和的第二人称连接，绝不自己另写一段替代它们。' +
                '四个领域的内容必须彻底不同。只输出严格 JSON。',
            },
            { role: 'user', content: prompt },
          ],
          { temperature: 0.55, maxTokens: 1400, timeout: 55_000 },
        )
        const parsed = parseJson(raw)
        if (!parsed) {
          return json({ error: '模型返回内容无法解析为 JSON。' }, 502)
        }
        return json(normalizeTalentPayload(parsed, packs, DOMAINS))
      } catch (err) {
        return json({ error: err?.message ?? '天赋测算中断了。' }, err?.statusCode ?? 500)
      }
    }

    /* ============================================================
     *  灵魂底色
     * ============================================================ */
    if (path === '/api/soul') {
      const { chart, mbti, place } = body
      const material = describeSoulMaterial(chart, mbti, place)
      const prompt = [
        '请依据下面的写作素材，为这位旅人写一句「灵魂底色」。',
        '',
        '务必严格遵守 System Prompt 中的输出格式：只输出一句话，50-80 字，不换行。',
        '',
        material,
      ]
        .filter(Boolean)
        .join('\n')

      try {
        const raw = await callDeepSeekWorkers(
          env,
          [
            { role: 'system', content: SOUL_PORTRAIT_SYSTEM_PROMPT },
            { role: 'user', content: prompt },
          ],
          { temperature: 0.95, maxTokens: 220, timeout: 50_000, retries: 1 },
        )
        let text = normalizeSoulPortrait(raw)
        if (hasAstroTerms(text)) {
          const stripped = stripAstroTerms(text)
          text = stripped.length >= 30 ? normalizeSoulPortrait(stripped) : ''
        }
        if (!text) {
          return json(
            { error: '模型未返回可用的灵魂底色。', code: 'malformed' },
            502,
          )
        }
        return json({ text })
      } catch (err) {
        return json(
          { error: err?.message ?? '灵魂底色生成中断了。', code: err?.code ?? 'unknown' },
          err?.statusCode ?? 500,
        )
      }
    }

    /* ============================================================
     *  每日灵感抽牌
     * ============================================================ */
    if (path === '/api/tip') {
      const { chart, mbti, fortune } = body
      try {
        const raw = await callDeepSeekWorkers(
          env,
          [
            {
              role: 'system',
              content:
                '你是一位提供中立生活小建议的观察者。' +
                '不预测吉凶、不给情绪价值判断、不做预言。' +
                '只提供一个「微小的生活视角切入」。' +
                '只输出 JSON：{"tip":"...","action":"..."}',
            },
            {
              role: 'user',
              content: [
                '请给这位旅人一个今天可以试试的小建议。',
                describeChart(chart),
                describeMbti(mbti),
                fortune ? `当前运势：${fortune.title} —— ${fortune.body}` : '',
              ]
                .filter(Boolean)
                .join('\n'),
            },
          ],
          { temperature: 0.9, maxTokens: 200, timeout: 40_000 },
        )
        const parsed = parseJson(raw)
        return json({
          tip: parsed?.tip ?? '今天适合做一件小事。',
          action: parsed?.action ?? '只做十五分钟。',
        })
      } catch (err) {
        return json(
          { error: err?.message ?? '灵感中断了。', code: err?.code ?? 'unknown' },
          err?.statusCode ?? 500,
        )
      }
    }

    /* ============================================================
     *  塔罗牌阵
     * ============================================================ */
    if (path === '/api/tarot-reading') {
      const { chart, mbti, fortune, spreadSize = 3 } = body
      try {
        const raw = await callDeepSeekWorkers(
          env,
          [
            { role: 'system', content: TAROT_READING_SYSTEM_PROMPT },
            {
              role: 'user',
              content: [
                '请为这位旅人抽三张牌，并给出解读。',
                `牌阵数量：${spreadSize}`,
                describeChart(chart),
                describeMbti(mbti),
                fortune ? `当前运势：${fortune.title} —— ${fortune.body}` : '',
              ]
                .filter(Boolean)
                .join('\n'),
            },
          ],
          { temperature: 0.9, maxTokens: 900, timeout: 50_000 },
        )
        const parsed = parseJson(raw)
        if (!parsed || !Array.isArray(parsed.cards)) {
          return json({ cards: [], gist: '', action: '' })
        }
        return json({
          cards: parsed.cards.map((c) => ({
            name: c?.name ?? '',
            upright: c?.upright !== false,
            meaning: c?.meaning ?? '',
          })),
          gist: parsed.gist ?? '',
          action: parsed.action ?? '',
        })
      } catch (err) {
        return json(
          { error: err?.message ?? '抽牌中断了。', code: err?.code ?? 'unknown' },
          err?.statusCode ?? 500,
        )
      }
    }

    /* ============================================================
     *  四维运势
     * ============================================================ */
    if (path === '/api/fortune') {
      const { chart, mbti, scope = 'day' } = body
      const SCOPE_GUIDE = {
        year: {
          label: '年度',
          span: '未来 12 个月',
          rule:
            '这一年的主线趋势已经定下来了（可依据长期行运推导），' +
            '请指出年内几个明显的转折节点（通常是季末或月初），' +
            '并说明那段时间生活上会有什么具体变化。',
        },
        month: {
          label: '月度',
          span: '未来 30 天',
          rule:
            '这个月的重心每半个月会换一次（可依据月亮周期推导），' +
            '请说明前半月与后半月分别更适合处理哪一类事情，' +
            '以及哪些事情会自然退潮、不必强推。',
        },
        day: {
          label: '每日',
          span: '未来 7 天',
          rule:
            '今天的状态由当下的实际状态定调（可依据当日星象推导），' +
            '请给出今天最值得注意的一个生活切面，以及一件具体的小事。',
        },
      }
      const guide = SCOPE_GUIDE[scope] ?? SCOPE_GUIDE.day

      const prompt = [
        `请为这位旅人做【${guide.label}运势】推演，覆盖以下四个维度：`,
        '事业学业 / 财富 / 健康 / 爱情。',
        '',
        `【时间范围】${guide.span}`,
        `【推演要求】${guide.rule}`,
        '',
        '【措辞硬性要求】',
        '· **绝对不许出现占星术语** —— 星座名、行星名、宫位、宫头、相位，一律不许。',
        '  想表达「行星影响」就说「你身上那股力量」「这段时间的节奏」。',
        '· 全程第二人称「你」。',
        '· 每个维度三段：',
        '  summary（主线判断，≤ 50 字）、trend（接下来会怎样，≤ 55 字）、',
        '  warning（需要留意的一点，≤ 55 字）。',
        '· **绝对禁止**吉凶断语与情绪评价（不写「运势」「大吉」「你会成功」）。',
        '· **绝对禁止**连接词：首先、其次、最后、总之、总的来说、值得注意的是。',
        '',
        describeChart(chart),
        describeMbti(mbti),
        '',
        '只输出 JSON，格式：',
        '{"overview":"...","dimensions":[{"key":"career","label":"事业 / 学业","summary":"...","trend":"...","warning":"..."},{"key":"wealth","label":"财富","summary":"...","trend":"...","warning":"..."},{"key":"health","label":"健康","summary":"...","trend":"...","warning":"..."},{"key":"love","label":"爱情","summary":"...","trend":"...","warning":"..."}]}',
      ]
        .filter(Boolean)
        .join('\n')

      try {
        const raw = await callDeepSeekWorkers(
          env,
          [
            {
              role: 'system',
              content:
                '你是一位生活观察者。只描述生活层面会发生什么，不做吉凶断语，' +
                '不出现任何占星术语。只输出严格 JSON。',
            },
            { role: 'user', content: prompt },
          ],
          { temperature: 0.8, maxTokens: 1200, timeout: 50_000 },
        )
        const parsed = parseJson(raw)
        if (!parsed || !Array.isArray(parsed.dimensions)) {
          return json({ error: '模型返回内容无法解析为 JSON。' }, 502)
        }
        return json({
          scope,
          label: guide.label,
          overview: typeof parsed.overview === 'string' ? parsed.overview : '',
          dimensions: parsed.dimensions.map((d) => ({
            key: d?.key ?? '',
            label: d?.label ?? '',
            summary: d?.summary ?? '',
            trend: d?.trend ?? '',
            warning: d?.warning ?? '',
          })),
        })
      } catch (err) {
        return json(
          { error: err?.message ?? '运势推演中断了。', code: err?.code ?? 'unknown' },
          err?.statusCode ?? 500,
        )
      }
    }

    /* ============================================================
     *  本命盘（纯 JS 星历）
     * ============================================================ */
    if (path === '/api/chart') {
      try {
        const result = computeChartWorkers(body)
        return json(result)
      } catch (err) {
        return json(
          { error: err?.message ?? '星历计算失败。' },
          err?.statusCode ?? 500,
        )
      }
    }

    /* ============================================================
     *  行运
     * ============================================================ */
    if (path === '/api/transit') {
      try {
        const { computeTransitWorkers } = await import('./chart-workers.js')
        return json(computeTransitWorkers(body))
      } catch (err) {
        return json(
          { error: err?.message ?? '行运计算失败。' },
          err?.statusCode ?? 500,
        )
      }
    }

    return json({ error: '接口不存在。', path }, 404)
  } catch (err) {
    return json(
      { error: err?.message ?? '服务内部错误。' },
      err?.statusCode ?? 500,
    )
  }
}
