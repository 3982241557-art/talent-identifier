/* ============================================================
 *  Worker 入口（v15.6）
 * ============================================================
 *
 *  【与 Pages Functions 的关系】
 *  Pages 的 `functions/` 目录会被平台自动扫描并生成路由表；
 *  Workers 则只有**一个**入口脚本 —— 一个导出
 *  `fetch(request, env, ctx)` 的 JS 文件。
 *
 *  本文件就是那个入口：
 *    · /api/*  → 交给 api-handler.js 处理
 *    · 其余     → 交给 Workers Assets（dist/）服务
 *
 *  【为什么静态资源要走 ASSETS 绑定】
 *  Workers Assets 由 Cloudflare 的边缘网络直接托管，
 *  带正确的 Content-Type 与缓存头，且不占用 Worker 的 CPU 时间。
 *  比自己在代码里读文件快得多，也更省配额。
 *
 *  【为什么要手写这个胶水层】
 *  Workers 只有一个入口，路由要自己判断，
 *  这样行为完全可控。
 * ============================================================ */

import { handleApi } from './_lib/api-handler.js'

/** API 前缀 */
const API_PREFIX = '/api/'

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)

    /* ---------- API 请求 ---------- */
    if (url.pathname.startsWith(API_PREFIX) || url.pathname === '/api') {
      return handleApi({
        request,
        env,
        params: { path: url.pathname.replace(/^\/api\/?/, '') },
        waitUntil: ctx?.waitUntil?.bind(ctx),
        passThroughOnException: ctx?.passThroughOnException,
      })
    }

    /* ---------- 静态资源 ---------- */
    /*
     * ASSETS 绑定由 wrangler.toml 的 [assets] 段注入，指向 dist/。
     *
     * not_found_handling = "single-page-application" 时，
     * 未命中的路径会回 index.html（SPA 兜底），
     * 命中静态文件时自动带上正确的 Content-Type 与缓存头。
     */
    if (env?.ASSETS) {
      return env.ASSETS.fetch(request)
    }

    /* ---------- 兜底 ---------- */
    return new Response(
      '静态资源未绑定。请检查 wrangler.toml 的 [assets] 配置与 dist/ 是否存在。',
      { status: 500, headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
    )
  },
}
