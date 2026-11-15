import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

/**
 * v8.0 · 临时公网分享
 *
 * 背景：localtunnel 对**所有浏览器请求**都会返回 511 拦截页
 * （"Tunnel website ahead!"），除非请求带有 `bypass-tunnel-reminder` 头，
 * 或浏览器已经点过一次 "Click to Continue"（服务端会下发同名 Cookie）。
 *
 * 而前端如果直接跨域调用后端隧道：
 *   1. 浏览器会先发 OPTIONS 预检；
 *   2. 预检请求**无法携带自定义头**（浏览器不允许）；
 *   3. 于是预检被 localtunnel 拦掉 → CORS 失败 → 所有 API 调用报错。
 *
 * 解决方案：**让 Vite 做同源反向代理**。
 *   - 前端一律请求 `/api/xxx`（相对路径，与页面同源）。
 *   - Vite 在服务端把 `/api` 转发到后端隧道，并补上 bypass 头。
 *   - 浏览器只需对**页面本身**点一次 Continue，
 *     之后的同源 XHR 请求不会再触发拦截页。
 *
 * 这样朋友只需要点一次 "Click to Continue"，整个应用就能正常使用。
 */

/** localtunnel 绕过拦截页所需的自定义头 */
const LT_HEADERS = { 'bypass-tunnel-reminder': 'true' }

/** 本地后端（永远作为兜底） */
const LOCAL_BACKEND = 'http://localhost:8787'

/**
 * v9.0 · 后端探测
 *
 * 依次尝试候选地址，返回第一个 /api/health 可达的那个。
 * 全部不可达时返回最后一个候选（保持原有行为）。
 */
async function pickBackend(
  candidates: string[],
): Promise<string> {
  for (const c of candidates) {
    try {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 1500)
      const res = await fetch(`${c.replace(/\/$/, '')}/api/health`, {
        signal: ctrl.signal,
      })
      clearTimeout(timer)
      if (res.ok) {
        if (c !== candidates[candidates.length - 1]) {
          console.log(`[vite] 后端就绪：${c}`)
        }
        return c
      }
    } catch {
      /* 不可达，试下一个 */
    }
  }
  const fallback = candidates[candidates.length - 1]
  console.warn(`[vite] 未探测到可用后端，回退到 ${fallback}`)
  return fallback
}

/**
 * v9.0 · 代理自动降级
 * ------------------------------------------------------------
 * 之前的问题：`.env` 里残留了一个已失效的 cloudflare 隧道地址，
 * Vite 把 /api 全量转发过去 → 502 Bad Gateway，
 * 于是「星盘计算」「时辰接口」在前端全挂。
 *
 * 现在：用插件的 `config` 钩子（支持 async）在启动时探测后端，
 * 探测不到就自动切到本地后端。
 * 一个过期隧道再也拖不垮本地开发。
 */
function backendFallbackPlugin(candidates: string[]) {
  return {
    name: 'backend-fallback',
    async config(config: any) {
      const picked = await pickBackend(candidates)
      if (config.server?.proxy?.['/api']) {
        config.server.proxy['/api'].target = picked
      }
      if (config.preview?.proxy?.['/api']) {
        config.preview.proxy['/api'].target = picked
      }
    },
  }
}

export default defineConfig(({ mode }) => {
  /* 手动加载 .env，让 VITE_TUNNEL_BACKEND 在 vite.config 里可用 */
  const env = loadEnv(mode, process.cwd(), '')

  /**
   * 后端候选地址（按优先级）：
   *   · VITE_TUNNEL_BACKEND 优先（公网分享时指向后端隧道）
   *   · 其次 VITE_API_BASE（如果它是个完整地址）
   *   · 最后本地 http://localhost:8787（永远兜底）
   */
  const preferredBackend =
    env.VITE_TUNNEL_BACKEND || env.VITE_API_BASE || LOCAL_BACKEND

  /** 反向代理：/api → 后端（启动时自动降级） */
  const apiProxy = {
    '/api': {
      target: preferredBackend,
      changeOrigin: true,
      headers: LT_HEADERS,
    },
  }

  return {
    plugins: [
      react(),
      tailwindcss(),
      backendFallbackPlugin([preferredBackend, LOCAL_BACKEND]),
    ],
    // 使用相对路径，便于以 file:// 或任意子路径部署
    base: './',
    /*
     * v15.3 · 显式声明构建输出目录
     *
     * Vite 默认就是 dist，但**显式写出来**很重要：
     * Cloudflare Pages 的 Build output directory 必须与这里一致，
     * 否则平台找不到产物就会报
     *   "Missing entry-point to Worker script or to assets directory"
     *
     * 三处必须一致：
     *   1. vite.config.ts     → build.outDir        （这里）
     *   2. wrangler.toml      → pages_build_output_dir
     *   3. Cloudflare 控制台  → Build output directory
     */
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      emptyOutDir: true,
    },
    server: {
      host: true,
      port: 5180,
      // v8.0：允许 localtunnel 生成的 *.loca.lt 域名访问，
      // 否则公网链接会被 Vite 的 host 白名单拦下（403）。
      allowedHosts: true,
      proxy: apiProxy,
    },
    preview: {
      host: true,
      port: 5180,
      // 同上：分享用的公网链接需要放行隧道域名
      allowedHosts: true,
      proxy: apiProxy,
    },
  }
})
