import { existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

/* ============================================================
 *  环境变量加载（唯一入口）
 *
 *  为什么不用 `import 'dotenv/config'`：
 *  dotenv 默认从 `process.cwd()` 找 .env，也就是「启动命令所在目录」。
 *  这导致同一份代码在不同启动方式下会读到不同的文件：
 *    npm run server            → cwd = server/   → 读到 server/.env ✅
 *    node server/index.mjs     → cwd = 项目根目录  → 读到根 .env ❌（里面没有 Key）
 *    从别处启动 / 被守护进程拉起 → cwd = 未知      → 读不到 ❌
 *
 *  这里改为以「本文件所在目录」为基准，解析出绝对路径，
 *  保证无论从哪里启动，都只读 server/.env。
 * ============================================================ */

const here = dirname(fileURLToPath(import.meta.url))

/** server/.env 的绝对路径 */
export const ENV_FILE = resolve(here, '.env')

/** 项目根目录下的 .env（前端 VITE_* 变量用，后端一般不读） */
export const ROOT_ENV_FILE = resolve(here, '..', '.env')

/**
 * 加载环境变量。
 * 已存在的真实环境变量优先（不覆盖），便于用系统环境变量临时覆盖 Key。
 */
export function loadEnv() {
  const loaded = dotenv.config({ path: ENV_FILE })

  if (!loaded.error && !existsSync(ENV_FILE)) {
    console.warn(
      `[life-script] 未找到 ${ENV_FILE}，请复制 server/.env.example 为 server/.env 并填入 DEEPSEEK_API_KEY。`,
    )
  }

  return {
    file: ENV_FILE,
    loaded: Boolean(loaded.parsed),
  }
}

loadEnv()

/* ---------- 读取配置项 ---------- */

export const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY?.trim() ?? ''

export const DEEPSEEK_BASE_URL =
  process.env.DEEPSEEK_BASE_URL?.replace(/\/+$/, '') ?? 'https://api.deepseek.com'

export const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL ?? 'deepseek-chat'

export const PORT = Number(process.env.PORT ?? 8787)
