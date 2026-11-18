import socratesAsset from '../assets/socrates.png'
import bgAsset from '../assets/bg.png'

/** 苏格拉底立绘（IntroStage / MbtiStage 使用） */
export const socratesUrl: string = socratesAsset

/** 星空背景图（AuroraBackdrop 使用） */
export const bgUrl: string = bgAsset

/* ============================================================
 *  公共目录资源路径解析（v18.0 · GitHub Pages）
 * ============================================================
 *
 *  【问题】
 *  哈勃影像的路径在数据文件里是写死的 "/hubble/xxx.jpg"（根绝对路径）。
 *  在 Cloudflare 部署时根路径就是站点根，没问题；
 *  但 GitHub Pages 的站点根是
 *    https://3982241557-art.github.io/
 *  真正的应用挂在
 *    https://3982241557-art.github.io/talent-identifier/
 *  于是 "/hubble/xxx.jpg" 会解析到
 *    https://3982241557-art.github.io/hubble/xxx.jpg → 404
 *
 *  【解法】
 *  运行时用 import.meta.env.BASE_URL 拼前缀。
 *  BASE_URL 由 Vite 依据 vite.config.ts 的 base 自动注入，
 *  改部署目标时不需要动任何业务代码。
 *
 *  【外部直链】
 *  NASA 直链（http/https 开头）原样返回，不加前缀。
 */

/** BASE_URL —— 总是以 / 结尾 */
const BASE = import.meta.env.BASE_URL || '/'

/**
 * 把一个「公共目录资源路径」解析成可直接用于
 * background-image / src 的最终 URL。
 *
 * @param path 形如 "/hubble/sombrero-galaxy.jpg" 或 "hubble/xxx.jpg"
 */
export function publicUrl(path: string): string {
  if (!path) return ''
  /* 外部直链 / data URI / blob —— 原样返回 */
  if (/^(https?:)?\/\//.test(path) || path.startsWith('data:')) return path
  /* 去掉前导斜杠，避免与 BASE 拼出双斜杠 */
  const rel = path.replace(/^\/+/, '')
  return `${BASE}${rel}`
}
