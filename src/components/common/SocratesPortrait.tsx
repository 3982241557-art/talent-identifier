import { useEffect, useState } from 'react'
import { socratesUrl } from '../../lib/assets'

/* ============================================================
 *  苏格拉底立绘（v7.0 · 任务 1 · 资源抢修）
 *
 *  1. 图片 URL 走 ES import（见 lib/assets.ts），
 *     由 Vite 生成带哈希的路径 —— 部署到任何子路径都不会 404。
 *  2. 内置 onError 兜底：万一资源真的取不到，
 *     不再显示浏览器默认的「破图图标 + 替代文字」，
 *     而是渲染一个纯 CSS 绘制的剪影，绝不留残影。
 * ============================================================ */

interface SocratesPortraitProps {
  /** 高度（任意 CSS 长度） */
  height: string
  className?: string
  /** 附加内联样式（滤镜、遮罩等） */
  style?: React.CSSProperties
}

export function SocratesPortrait({
  height,
  className = '',
  style,
}: SocratesPortraitProps) {
  const [failed, setFailed] = useState(false)

  /* 资源地址变化时重置失败态 */
  useEffect(() => {
    setFailed(false)
  }, [socratesUrl])

  if (failed) {
    /* ---------- 兜底：纯 CSS 剪影 ---------- */
    return (
      <div
        className={`relative flex items-end justify-center ${className}`}
        style={{ height }}
        aria-label="苏格拉底"
        role="img"
      >
        <div
          className="relative"
          style={{
            width: 'calc(var(--soc-w, 0.72) * 1em)',
            height: '100%',
            opacity: 0.55,
          }}
        >
          {/* 头 */}
          <div
            className="absolute left-1/2 top-[4%] -translate-x-1/2 rounded-full bg-ink/70"
            style={{ width: '38%', aspectRatio: '1 / 1.12' }}
          />
          {/* 肩 */}
          <div
            className="absolute inset-x-0 bottom-0 h-[56%] rounded-t-[46%] bg-ink/70"
            style={{
              clipPath:
                'polygon(22% 100%, 32% 18%, 68% 18%, 78% 100%)',
            }}
          />
        </div>
      </div>
    )
  }

  return (
    <img
      src={socratesUrl}
      alt="苏格拉底"
      draggable={false}
      onError={() => setFailed(true)}
      className={`select-none object-contain ${className}`}
      style={{ height, ...style }}
    />
  )
}
