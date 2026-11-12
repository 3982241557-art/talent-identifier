/* ============================================================
 *  图片资源统一出口（v7.0 · 任务 1）
 *
 *  【原 Bug 的根因】
 *  vite.config.ts 使用 `base: './'`（为了能部署到任意子路径），
 *  但组件里写的是绝对路径 `/socrates.png`。
 *  开发服务器下根路径恰好能命中，所以本地看不出问题；
 *  一旦打包部署到子路径（GitHub Pages / 对象存储 / Nginx 子目录），
 *  浏览器会把 `/socrates.png` 解析到**域名根目录**，必然 404 → 图片裂开。
 *
 *  【修法】
 *  把图片移进 `src/assets/`，用 ES import 引入。
 *  Vite 会把它当作模块依赖处理：
 *   · 构建时输出到 `dist/assets/` 并带内容哈希
 *   · 自动按 `base` 生成正确的相对/绝对 URL
 *   · 打包体积统计与 tree-shaking 也能正确工作
 *
 *  这样无论部署到根路径还是子路径，URL 都不会错。
 * ============================================================ */

import socratesAsset from '../assets/socrates.png'
import bgAsset from '../assets/bg.png'

/** 苏格拉底立绘（IntroStage / MbtiStage 使用） */
export const socratesUrl: string = socratesAsset

/** 星空背景图（AuroraBackdrop 使用） */
export const bgUrl: string = bgAsset
