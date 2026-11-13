/* ============================================================
 *  Cloudflare Pages Functions 入口（v15.2）
 * ============================================================
 *
 *  【与 Express 后端的关系】
 *  Cloudflare Pages 的 Functions 跑在 **Workers 运行时**（V8 隔离环境），
 *  不是 Node.js。它有自己的 Request / Response 对象，
 *  且**没有** node:fs、node:net 这些内置模块。
 *
 *  所以本文件是**第三套运行形态**：
 *
 *    · 本地 Node     → server/index.mjs   （Express，app.listen）
 *    · Docker/容器   → Dockerfile          （同上，npm start）
 *    · Cloudflare    → functions/api/[[path]].js （本文件，Workers 运行时）
 *
 *  三者共用**同一份业务逻辑**：
 *    · 提示词     → server/prompt.mjs
 *    · MBTI 题库  → server/mbtiCanon.mjs / mbtiFallback.mjs
 *    · 语料库检索 → server/corpus-workers.mjs（Workers 版，见该文件）
 *    · DeepSeek   → server/deepseek.mjs（只依赖 fetch，天然兼容）
 *
 *  【关键差异：星历】
 *  server/ephemeris.mjs 依赖 `sweph`（Swiss Ephemeris 的原生 C++ 模块）。
 *  Workers 运行时**无法加载 .node 原生二进制**，所以这里走
 *  src/lib/astro.ts 的纯 JS 引擎（开普勒轨道要素 + Schlyter 月亮摄动）。
 *
 *  纯 JS 版精度略低于 Swiss Ephemeris（行星黄经误差约 0.1°~0.5°），
 *  但对占星用途完全够用 —— 而且它本来就是前端的兜底引擎，
 *  本地 Node 与 Cloudflare 的结果会高度一致。
 * ============================================================ */

import { handleApi } from '../_lib/api-handler.js'

export async function onRequest(context) {
  return handleApi(context)
}
