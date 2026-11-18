/* ============================================================
 *  优势挖掘 · AI 职位与行动方向推演（本地 Node 服务端）
 * ============================================================
 *
 *  【为什么不复制一份代码】
 *  `functions/_lib/career-workers.js` 本身就是标准 ESM，
 *  Node 的 .mjs 运行时可以直接 import 它。
 *
 *  所以这里只做**转发** ——
 *  保证本地开发（server/app.mjs）与 Cloudflare Workers
 *  （functions/_lib/api-handler.js）跑的是**同一份逻辑**，
 *  永远不会出现「本地能过、线上不一样」的漂移。
 * ============================================================ */

export {
  CAREER_SYSTEM_PROMPT,
  buildCareerUserPrompt,
  describeAdvantageForCareer,
  describeChartForCareer,
  describeMbtiForCareer,
  normalizeCareerPayload,
  normalizeCareerResult,
  scrubComparative,
  scrubLong,
  scrubPointList,
} from '../functions/_lib/career-workers.js'
