/* ============================================================
 *  Worker 入口（v15.4）
 * ============================================================
 *
 *  【与 Pages Functions 的关系】
 *  Pages 的 `functions/` 目录会被平台自动扫描；
 *  Workers 则需要**显式的入口脚本** —— 一个导出
 *  `fetch(request, env, ctx)` 的 JS 文件。
 *
 *  本文件就是那个入口：
 *    · /api/*  → 交给 api-handler.js 处理
 *    · 其余     → 交给 Workers Assets（dist/）服务
 *
 *  【为什么要手写这个胶水层】
 *  Pages 的自动路由不适用于 Workers：
 *    · Pages 会自己扫 functions/ 目录、生成路由表
 *    · Workers 只有一个入口，路由要自己判断
 *
 *  好处是**行为完全可控**，而且静态资源交给
 *  Workers Assets（Cloudflare 的边缘缓存），
 *  比自己从内存读快得多。
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
     * ASSETS 绑定由 wrangler.toml 的 [assets] 段注入，
     * 指向 dist/ 目录。
     *
     * not_found_handling = "single-page-application" 时，
     * 未命中的路径会回 index.html（SPA 兜底），
     * 并在命中静态文件时自动带上正确的 Content-Type 与缓存头。
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
