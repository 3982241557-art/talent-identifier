import { DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL, DEEPSEEK_MODEL } from './env.mjs'

/* ============================================================
 *  DeepSeek API 客户端
 *
 *  配置环境变量（在 server/.env 中填写）：
 *    DEEPSEEK_API_KEY   —— 必填，DeepSeek 控制台创建，形如 sk-xxxxxxxx
 *    DEEPSEEK_BASE_URL  —— 选填，默认 https://api.deepseek.com
 *    DEEPSEEK_MODEL     —— 选填，默认 deepseek-chat
 * ============================================================ */

export { DEEPSEEK_BASE_URL, DEEPSEEK_MODEL }

/** Key 是否已填写（长度合理即可，不做过度校验） */
export function isConfigured() {
  return DEEPSEEK_API_KEY.length > 0
}

/**
 * 校验 Key 是否仍是示例占位符。
 * 占位符若直接发出去，fetch 的 header 会抛出难以理解的 ByteString 错误。
 */
export function isPlaceholderKey() {
  if (!DEEPSEEK_API_KEY) return true
  return !/^sk-[A-Za-z0-9_-]{16,}$/.test(DEEPSEEK_API_KEY)
}

/* ============================================================
 *  v6.0 · 错误分类
 *
 *  旧实现把所有异常都笼统地报成「未与云端连上」，
 *  导致前端无法区分「网络断了」「被限流」「模型抽风」「超时」。
 *  现在给每类失败打上明确的 code 与 httpStatus，
 *  前端据此显示不同的引导文案。
 * ============================================================ */
export const ERR = {
  /** 未配置 Key */
  NO_KEY: 'no_key',
  /** Key 仍是占位符 */
  PLACEHOLDER_KEY: 'placeholder_key',
  /** 网络不可达 / DNS / 连接被拒 */
  NETWORK: 'network',
  /** 请求超时（超过阈值） */
  TIMEOUT: 'timeout',
  /** 被上游限流 */
  RATE_LIMIT: 'rate_limit',
  /** 上游 5xx */
  UPSTREAM: 'upstream',
  /** 上游返回了 4xx（除限流外） */
  BAD_REQUEST: 'bad_request',
  /** 上游返回体无法解析 */
  MALFORMED: 'malformed',
}

/** 构造一个带分类信息的错误 */
function makeError(code, message, statusCode = 500) {
  const err = new Error(message)
  err.code = code
  err.statusCode = statusCode
  return err
}

/** 是否值得重试 */
function isRetryable(code) {
  return (
    code === ERR.NETWORK ||
    code === ERR.TIMEOUT ||
    code === ERR.RATE_LIMIT ||
    code === ERR.UPSTREAM
  )
}

/* ============================================================
 *  v6.0 · 退避重试
 * ============================================================ */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** 默认超时阈值（毫秒）—— 由各调用方按需覆盖 */
export const DEFAULT_TIMEOUT = 90_000
/** 最大重试次数（不含首次） */
const MAX_RETRY = 2

/**
 * 调用 DeepSeek Chat Completions，返回 assistant 文本。
 *
 * @param {Array<{role: string, content: string}>} messages
 * @param {{
 *   temperature?: number,
 *   maxTokens?: number,
 *   signal?: AbortSignal,
 *   timeout?: number,
 *   retries?: number,
 *   jsonMode?: boolean,
 * }} options
 * @returns {Promise<string>}
 */
export async function callDeepSeek(messages, options = {}) {
  if (!DEEPSEEK_API_KEY) {
    throw makeError(
      ERR.NO_KEY,
      '尚未配置 DEEPSEEK_API_KEY，智者暂时无法连接云端。',
      503,
    )
  }
  if (isPlaceholderKey()) {
    throw makeError(
      ERR.PLACEHOLDER_KEY,
      'DEEPSEEK_API_KEY 仍是占位符，请在 server/.env 中填入真实的 DeepSeek Key（形如 sk-...）。',
      503,
    )
  }

  const {
    temperature = 0.85,
    maxTokens = 800,
    signal,
    timeout = DEFAULT_TIMEOUT,
    retries = MAX_RETRY,
    jsonMode = false,
  } = options

  let lastErr = null

  for (let attempt = 0; attempt <= retries; attempt++) {
    /* ---------- 每次尝试都用独立的 AbortController ---------- */
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeout)
    const onOuterAbort = () => controller.abort()
    if (signal) {
      if (signal.aborted) {
        clearTimeout(timer)
        throw makeError(ERR.NETWORK, '请求已被取消。', 499)
      }
      signal.addEventListener('abort', onOuterAbort, { once: true })
    }

    try {
      const res = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
        },
        body: JSON.stringify({
          model: DEEPSEEK_MODEL,
          messages,
          temperature,
          max_tokens: maxTokens,
          stream: false,
          ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
        }),
        signal: controller.signal,
      })

      /* ---------- 上游错误 ---------- */
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        const snippet = text.slice(0, 300) || res.statusText
        if (res.status === 429) {
          throw makeError(
            ERR.RATE_LIMIT,
            `云端请求过于频繁（429）：${snippet}`,
            429,
          )
        }
        if (res.status >= 500) {
          throw makeError(
            ERR.UPSTREAM,
            `云端暂时不可用（${res.status}）：${snippet}`,
            502,
          )
        }
        throw makeError(
          ERR.BAD_REQUEST,
          `请求被云端拒绝（${res.status}）：${snippet}`,
          502,
        )
      }

      /* ---------- 解析响应 ---------- */
      const data = await res.json()
      const content = data?.choices?.[0]?.message?.content
      if (typeof content !== 'string' || !content.trim()) {
        throw makeError(ERR.MALFORMED, '云端未返回有效内容。', 502)
      }
      return content.trim()
    } catch (err) {
      /* ---------- AbortError：区分「超时」与「外部取消」 ---------- */
      if (err?.name === 'AbortError') {
        if (signal?.aborted) {
          throw makeError(ERR.NETWORK, '请求已被取消。', 499)
        }
        lastErr = makeError(
          ERR.TIMEOUT,
          `云端响应超过 ${Math.round(timeout / 1000)} 秒仍未返回。`,
          504,
        )
      } else if (err?.code) {
        /* 已经分类过的错误 */
        lastErr = err
      } else {
        /* fetch 层面的网络错误 */
        lastErr = makeError(
          ERR.NETWORK,
          `无法连接云端：${err?.message ?? '未知网络错误'}`,
          503,
        )
      }

      /* ---------- 是否重试 ---------- */
      const canRetry = attempt < retries && isRetryable(lastErr.code)
      if (!canRetry) throw lastErr

      /* ---------- 指数退避 + 抖动 ---------- */
      const backoff = Math.min(8000, 900 * 2 ** attempt) + Math.random() * 400
      await sleep(backoff)
    } finally {
      clearTimeout(timer)
      if (signal) signal.removeEventListener('abort', onOuterAbort)
    }
  }

  throw lastErr ?? makeError(ERR.UPSTREAM, '云端无响应。', 502)
}
