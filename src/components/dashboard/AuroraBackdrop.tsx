/* ============================================================
 *  极光背景层（v6.0 · 任务 4）
 *
 *  v4.0 的背景被压得太暗（bg-[#02040a]/78 + 边缘渐隐），
 *  主页看起来像一块死黑。
 *
 *  v6.0 的目标：
 *   · 大幅提高背景亮度，但**绝不遮挡前景文字**
 *   · 用多层极光（Aurora）带 + 径向渐变营造纵深
 *   · 太阳与月亮的图像要清晰、通透、引人注目
 *   · 中心区域保持克制（那里是星盘与密集文字）
 *
 *  v9.0：整个背景层被包进 ParallaxBackdrop，
 *  鼠标移动时会做**反向**微移 —— 制造纵深。
 * ============================================================ */

interface AuroraBackdropProps {
  /** 元素主色 */
  primary: string
  /** 元素次色 */
  secondary: string
  /** 元素环境光（主层） */
  ambient: string
}

/* v7.0：图片走 ES import，Vite 会按 base 生成正确路径 */
import { bgUrl } from '../../lib/assets'

export function AuroraBackdrop({
  primary,
  secondary,
  ambient,
}: AuroraBackdropProps) {
  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden>
      {/* ---------- 底色：不再是死黑，而是深空蓝紫 ---------- */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(178deg, #0a1024 0%, #0d1430 34%, #111a3c 62%, #0a1226 100%)',
        }}
      />

      {/* ---------- 底图：星空照片 ---------- */}
      <img
        src={bgUrl}
        alt=""
        className="absolute inset-0 h-full w-full object-cover opacity-[0.62]"
        aria-hidden
        draggable={false}
        onError={(e) => {
          // 资源取不到时静默隐藏，绝不留破图图标
          e.currentTarget.style.display = 'none'
        }}
      />

      {/* ---------- 极光带 1：左上 → 右下的斜向光幕 ---------- */}
      <div
        className="absolute -left-[18%] -top-[28%] h-[86%] w-[92%] animate-[aurora-drift_34s_ease-in-out_infinite] opacity-[0.62]"
        style={{
          background: `radial-gradient(ellipse 52% 50% at 50% 50%, ${ambient} 0%, ${primary}55 38%, rgba(0,0,0,0) 72%)`,
          filter: 'blur(38px)',
        }}
      />

      {/* ---------- 极光带 2：右下 → 左上的对向光幕 ---------- */}
      <div
        className="absolute -right-[16%] top-[24%] h-[82%] w-[86%] animate-[aurora-drift-2_41s_ease-in-out_infinite] opacity-[0.5]"
        style={{
          background: `radial-gradient(ellipse 48% 46% at 50% 50%, ${secondary}44 0%, ${primary}33 40%, rgba(0,0,0,0) 74%)`,
          filter: 'blur(46px)',
        }}
      />

      {/* ---------- 极光带 3：底部铺底的第三色 ---------- */}
      <div
        className="absolute -bottom-[30%] left-[14%] h-[70%] w-[76%] animate-[aurora-drift-3_47s_ease-in-out_infinite] opacity-[0.42]"
        style={{
          background: `radial-gradient(ellipse 50% 46% at 50% 50%, ${secondary}38 0%, ${ambient} 46%, rgba(0,0,0,0) 76%)`,
          filter: 'blur(52px)',
        }}
      />

      {/* ---------- 中心柔光：托起星盘，不做硬高光 ---------- */}
      <div
        className="absolute left-1/2 top-1/2 h-[74%] w-[56%] -translate-x-1/2 -translate-y-1/2"
        style={{
          background:
            'radial-gradient(ellipse 50% 50% at 50% 50%, rgba(190,214,255,0.16) 0%, rgba(120,150,210,0.07) 42%, rgba(0,0,0,0) 72%)',
          filter: 'blur(30px)',
        }}
      />

      {/* ---------- 太阳与月亮：背景图里的两处高光源，
             单独加一层通透的光晕，让它们在极光中清晰可见。
             位置取自 bg.png 的实际像素：
               太阳 ≈ (22.5%, 73%)  月亮 ≈ (74%, 30%)
             两处都在卡片与星盘的外侧，不会遮挡任何前景文字。 ---------- */}
      <div
        className="pointer-events-none absolute h-[46%] w-[26%] animate-[aurora-drift-3_51s_ease-in-out_infinite]"
        style={{
          left: '10%',
          top: '50%',
          background:
            'radial-gradient(circle at 50% 50%, rgba(255,248,214,0.72) 0%, rgba(255,228,150,0.34) 16%, rgba(255,196,96,0.12) 36%, rgba(0,0,0,0) 68%)',
          filter: 'blur(14px)',
        }}
      />
      <div
        className="pointer-events-none absolute h-[38%] w-[22%] animate-[aurora-drift-2_57s_ease-in-out_infinite]"
        style={{
          right: '10%',
          top: '13%',
          background:
            'radial-gradient(circle at 50% 50%, rgba(226,238,255,0.66) 0%, rgba(178,206,246,0.30) 18%, rgba(120,160,220,0.11) 38%, rgba(0,0,0,0) 70%)',
          filter: 'blur(16px)',
        }}
      />

      {/* ---------- 四角压暗：保证前景文字对比度 ---------- */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 96% 88% at 50% 46%, rgba(0,0,0,0) 42%, rgba(4,7,18,0.52) 84%, rgba(3,5,14,0.78) 100%)',
        }}
      />

      {/* ---------- 上下缘再压一层，护住页眉页脚 ---------- */}
      <div
        className="absolute inset-x-0 top-0 h-[22%]"
        style={{
          background:
            'linear-gradient(to bottom, rgba(3,6,16,0.62) 0%, rgba(0,0,0,0) 100%)',
        }}
      />
      <div
        className="absolute inset-x-0 bottom-0 h-[18%]"
        style={{
          background:
            'linear-gradient(to top, rgba(3,6,16,0.58) 0%, rgba(0,0,0,0) 100%)',
        }}
      />
    </div>
  )
}
