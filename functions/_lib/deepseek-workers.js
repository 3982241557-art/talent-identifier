/* ============================================================
 *  DeepSeek 客户端 —— Workers 版（v15.2）
 * ============================================================
 *
 *  与 server/deepseek.mjs 的区别只有两点：
 *    1. 配置来源：process.env → context.env（Workers 的绑定）
 *    2. 超时上限：Workers 有 CPU 时间限制，DeepSeek 超时压到 55 秒
 *
 *  其余逻辑（错误分类、退避重试、JSON 解析）完全一致 ——
 *  fetch 是 Workers 的原生能力，没有任何兼容问题。
 * ============================================================ */

/** 错误分类常量（与 server/deepseek.mjs 的 ERR 保持一致） */
export const ERR_WORKERS = {
  NO_KEY: 'no_key',
  PLACEHOLDER_KEY: 'placeholder_key',
  NETWORK: 'network',
  TIMEOUT: 'timeout',
  RATE_LIMIT: 'rate_limit',
  UPSTREAM: 'upstream',
  BAD_REQUEST: 'bad_request',
  MALFORMED: 'malformed',
}

/** 从 Workers env 读取 DeepSeek 配置 */
export function DEEPSEEK_MODEL_WORKERS(env) {
  return env?.DEEPSEEK_MODEL || 'deepseek-chat'
}

function baseUrl(env) {
  return (env?.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '')
}

function apiKey(env) {
  return (env?.DEEPSEEK_API_KEY || '').trim()
}

/** Key 是否已配置 */
export function isConfiguredWorkers(env) {
  return apiKey(env).length > 0
}

/** Key 是否仍是示例占位符 */
export function isPlaceholderKeyWorkers(env) {
  const key = apiKey(env)
  if (!key) return true
  return !/^sk-[A-Za-z0-9_-]{16,}$/.test(key)
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
    code === ERR_WORKERS.NETWORK ||
    code === ERR_WORKERS.TIMEOUT ||
    code === ERR_WORKERS.RATE_LIMIT ||
    code === ERR_WORKERS.UPSTREAM
  )
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** 默认超时阈值（毫秒） */
const DEFAULT_TIMEOUT = 55_000
/** 最大重试次数（不含首次） */
const MAX_RETRY = 1

/**
 * 调用 DeepSeek Chat Completions，返回 assistant 文本。
 *
 * @param env      Workers 的 env 绑定
 * @param messages 对话消息
 * @param options  temperature / maxTokens / timeout / retries
 */
export async function callDeepSeekWorkers(env, messages, options = {}) {
  const key = apiKey(env)
  if (!key) {
    throw makeError(
      ERR_WORKERS.NO_KEY,
      '尚未配置 DEEPSEEK_API_KEY，智者暂时无法连接云端。',
      503,
    )
  }
  if (isPlaceholderKeyWorkers(env)) {
    throw makeError(
      ERR_WORKERS.PLACEHOLDER_KEY,
      'DEEPSEEK_API_KEY 仍是占位符，请在 Cloudflare Pages 的环境变量中填入真实 Key。',
      503,
    )
  }

  const {
    temperature = 0.85,
    maxTokens = 800,
    timeout = DEFAULT_TIMEOUT,
    retries = MAX_RETRY,
  } = options

  let lastErr = null

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeout)

    try {
      const res = await fetch(`${baseUrl(env)}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: DEEPSEEK_MODEL_WORKERS(env),
          messages,
          temperature,
          max_tokens: maxTokens,
          stream: false,
        }),
        signal: controller.signal,
      })

      /* ---------- 上游错误 ---------- */
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        const snippet = text.slice(0, 300) || res.statusText
        if (res.status === 429) {
          throw makeError(
            ERR_WORKERS.RATE_LIMIT,
            `云端请求过于频繁（429）：${snippet}`,
            429,
          )
        }
        if (res.status >= 500) {
          throw makeError(
            ERR_WORKERS.UPSTREAM,
            `云端暂时不可用（${res.status}）：${snippet}`,
            502,
          )
        }
        throw makeError(
          ERR_WORKERS.BAD_REQUEST,
          `请求被云端拒绝（${res.status}）：${snippet}`,
          502,
        )
      }

      /* ---------- 解析响应 ---------- */
      const data = await res.json()
      const content = data?.choices?.[0]?.message?.content
      if (typeof content !== 'string' || !content.trim()) {
        throw makeError(ERR_WORKERS.MALFORMED, '云端未返回有效内容。', 502)
      }
      return content.trim()
    } catch (err) {
      if (err?.name === 'AbortError') {
        lastErr = makeError(
          ERR_WORKERS.TIMEOUT,
          `云端响应超过 ${Math.round(timeout / 1000)} 秒仍未返回。`,
          504,
        )
      } else if (err?.code) {
        lastErr = err
      } else {
        lastErr = makeError(
          ERR_WORKERS.NETWORK,
          `无法连接云端：${err?.message ?? '未知网络错误'}`,
          503,
        )
      }

      const canRetry = attempt < retries && isRetryable(lastErr.code)
      if (!canRetry) throw lastErr

      const backoff = Math.min(6000, 900 * 2 ** attempt) + Math.random() * 400
      await sleep(backoff)
    } finally {
      clearTimeout(timer)
    }
  }

  throw lastErr ?? makeError(ERR_WORKERS.UPSTREAM, '云端无响应。', 502)
}
