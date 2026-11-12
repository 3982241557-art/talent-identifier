import { PORT, ENV_FILE } from './env.mjs'
import { isPlaceholderKey } from './deepseek.mjs'
import { app } from './app.mjs'

/* ============================================================
 *  本地开发入口（v15.0）
 * ============================================================
 *
 *  app 的装配全部在 app.mjs 里 ——
 *  这里只负责「启动监听」这一件事。
 *
 *  为什么要拆开：
 *    · 本地：需要固定端口 + 启动日志 + 端口占用检测
 *    · 云端：同一个入口也能直接跑（Zeabur / Webify 等长驻容器）
 *
 *  两边共用同一个 app 实例，路由与业务逻辑零重复。
 *
 *  【云端端口约定】
 *  云平台会注入 PORT 环境变量，app.listen(PORT) 直接用它即可，
 *  不需要为不同平台写不同代码。
 * ============================================================ */

const server = app.listen(PORT, () => {
  console.log(`[life-script] 后端已启动 → http://localhost:${PORT}`)
  console.log(`[life-script] 环境变量文件 → ${ENV_FILE}`)
  if (isPlaceholderKey()) {
    console.warn(
      '[life-script] 警告：DEEPSEEK_API_KEY 尚未填入真实 Key，请在 server/.env 中配置（当前为占位符）。',
    )
  }
})

/* ---------------- 端口占用等致命错误 ----------------
 * Express 的 listen 回调在 EADDRINUSE 时依然会被触发，
 * 只打印「后端已启动」而进程实际并未监听，会造成「明明重启了却没生效」的假象。
 * 这里显式处理并以非 0 退出码退出，让问题立刻暴露。
 */
server.on('error', (err) => {
  if (err?.code === 'EADDRINUSE') {
    console.error(
      `[life-script] 端口 ${PORT} 已被占用 —— 旧的后端进程还在运行，新进程无法启动。\n` +
        `请先结束占用该端口的进程（例如 lsof -ti tcp:${PORT} | xargs kill），再重新启动。`,
    )
  } else {
    console.error('[life-script] 后端启动失败：', err?.message ?? err)
  }
  process.exit(1)
})
