/* ============================================================
 *  CosmicCanvas · 全局唯一宇宙画布（v16.0）
 * ============================================================
 *
 *  【核心约束】
 *  整个应用必须 100% 发生在**同一个持续渲染**的全屏 3D 星空背景之上。
 *  切换功能模块时，背景星空**绝不能中断或重置** ——
 *  只能通过镜头推拉（Camera Zoom / Pan）与悬浮玻璃层的淡入淡出来过渡。
 *
 *  【实现】
 *  · 这是一个**常驻**组件，挂在 App 的最外层，
 *    永远不随路由切换而卸载。
 *  · 内部用 requestAnimationFrame 驱动一个 Canvas 星空，
 *    星光有真实的视差深度（多层，不同速度与亮度）。
 *  · 镜头变换（zoom / pan）由外部通过 ref 暴露的 API 控制，
 *    切换模块时平滑插值，不会重置星星。
 *
 *  【视觉参考 · NASA JWST / Hubble】
 *  · 深空底色不是死黑，而是 #030508 → #070B14 的径向渐层
 *  · 星云是低饱和的多层色雾（琥珀金 / 深红棕 / 电离蓝）
 *  · 恒星是冷白到暖金的连续谱，带衍射星芒
 * ============================================================ */

import { useEffect, useRef } from 'react'

/* ============================================================
 *  镜头状态 —— 供外部平滑操控
 * ============================================================ */

export interface CosmicCamera {
  /** 镜头缩放（1 = 默认，越大越"深入"） */
  zoom: number
  /** 镜头横移（视口宽度的比例） */
  panX: number
  /** 镜头纵移 */
  panY: number
}

export const DEFAULT_CAMERA: CosmicCamera = { zoom: 1, panX: 0, panY: 0 }

/* ============================================================
 *  星星数据
 * ============================================================ */

/** 恒星色谱（冷白 → 暖金），按温度分布 */
const STAR_COLORS = [
  'rgba(255,255,255,',
  'rgba(232,240,255,',
  'rgba(210,228,255,',
  'rgba(255,246,224,',
  'rgba(255,232,186,',
  'rgba(255,214,150,',
]

interface Star {
  /** 归一化坐标 */
  x: number
  y: number
  /** 视差深度 0（远）~ 1（近） */
  depth: number
  /** 半径 */
  r: number
  /** 基础亮度 */
  base: number
  /** 闪烁相位 */
  phase: number
  /** 闪烁速度 */
  speed: number
  /** 颜色 */
  color: string
}

function makeStars(count: number): Star[] {
  // 固定种子的伪随机，保证每次渲染的星空一致（不闪烁跳变）
  let seed = 20261117
  const rnd = () => {
    seed = (seed * 9301 + 49297) % 233280
    return seed / 233280
  }

  return Array.from({ length: count }, () => {
    const depth = rnd()
    const mag = rnd()
    return {
      x: rnd(),
      y: rnd(),
      depth,
      r: 0.4 + mag * mag * 1.7 + depth * 1.0,
      base: 0.30 + mag * 0.70,
      phase: rnd() * Math.PI * 2,
      speed: 0.25 + rnd() * 0.9,
      color: STAR_COLORS[Math.floor(rnd() * STAR_COLORS.length)],
    }
  })
}

/* ============================================================
 *  组件
 * ============================================================ */

interface CosmicCanvasProps {
  /** 镜头控制句柄 —— 外部改这里，画面会平滑跟上 */
  cameraRef?: React.MutableRefObject<CosmicCamera>
  /** 额外的元素环境光（rgba 字符串） */
  ambient?: string
  className?: string
}

export function CosmicCanvas({
  cameraRef,
  ambient = 'rgba(72,138,199,0.16)',
  className = '',
}: CosmicCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rafRef = useRef<number>(0)
  const starsRef = useRef<Star[]>([])

  /* ---------- 镜头目标值与当前值 ---------- */
  const targetRef = useRef<CosmicCamera>({ ...DEFAULT_CAMERA })
  const currentRef = useRef<CosmicCamera>({ ...DEFAULT_CAMERA })

  /* ---------- 外部通过 cameraRef 改目标值 ---------- */
  useEffect(() => {
    if (!cameraRef) return
    // 用 getter 把外部赋值同步到 target
    Object.defineProperty(cameraRef, 'current', {
      configurable: true,
      get: () => targetRef.current,
      set: (v: CosmicCamera) => {
        targetRef.current = { ...v }
      },
    })
    return () => {
      // 还原成普通属性，避免污染调用方
      delete (cameraRef as unknown as Record<string, unknown>).current
    }
  }, [cameraRef])

  /* ---------- 主渲染循环 ---------- */
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) return

    let w = 0
    let h = 0
    let dpr = 1

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = window.innerWidth
      h = window.innerHeight
      canvas.width = Math.floor(w * dpr)
      canvas.height = Math.floor(h * dpr)
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      starsRef.current = makeStars(Math.round((w * h) / 3000))
    }

    resize()
    window.addEventListener('resize', resize)

    let t = 0

    const draw = () => {
      t += 0.006

      /* ---- 镜头平滑插值 ---- */
      const cur = currentRef.current
      const tgt = targetRef.current
      const k = 0.045
      cur.zoom += (tgt.zoom - cur.zoom) * k
      cur.panX += (tgt.panX - cur.panX) * k
      cur.panY += (tgt.panY - cur.panY) * k

      /* ---- 清屏：深空底色（不是死黑） ---- */
      const g = ctx.createRadialGradient(
        w * 0.5,
        h * 0.42,
        0,
        w * 0.5,
        h * 0.42,
        Math.max(w, h) * 0.78,
      )
      g.addColorStop(0, '#0a1020')
      g.addColorStop(0.55, '#070b16')
      g.addColorStop(1, '#04070e')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, w, h)

      /* ---- 星云色雾：三层低饱和晕染 ---- */
      const nebulae: Array<[number, number, number, string]> = [
        [0.24, 0.68, 0.62, 'rgba(212,145,93,0.26)'], // 创生之柱 · 琥珀金
        [0.78, 0.28, 0.58, 'rgba(168,74,62,0.20)'], // 卡利纳 · 深红棕
        [0.52, 0.86, 0.70, 'rgba(72,138,199,0.30)'], // 超新星遗迹 · 电离蓝
      ]
      ctx.globalCompositeOperation = 'screen'
      for (const [nx, ny, nr, col] of nebulae) {
        const cx = (nx + cur.panX * 0.4) * w
        const cy = (ny + cur.panY * 0.4) * h
        const rad = nr * Math.max(w, h) * cur.zoom
        const ng = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad)
        ng.addColorStop(0, col)
        ng.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = ng
        ctx.fillRect(0, 0, w, h)
      }

      /* ---- 元素环境光（跟随星盘元素） ---- */
      if (ambient && ambient !== 'transparent') {
        const eg = ctx.createRadialGradient(
          w * 0.5,
          h * 0.48,
          0,
          w * 0.5,
          h * 0.48,
          Math.max(w, h) * 0.52 * cur.zoom,
        )
        eg.addColorStop(0, ambient)
        eg.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = eg
        ctx.fillRect(0, 0, w, h)
      }
      ctx.globalCompositeOperation = 'source-over'

      /* ---- 恒星：多层视差 ---- */
      const stars = starsRef.current
      for (const s of stars) {
        /* 视差偏移：深度越大，镜头移动时位移越多 */
        const px = (s.x - 0.5) * (0.35 + s.depth * 1.5)
        const py = (s.y - 0.5) * (0.35 + s.depth * 1.5)
        const sx = (0.5 + px * cur.panX) * w
        const sy = (0.5 + py * cur.panY) * h

        /* 缩放：靠近中心越靠里（越"远"） */
        const z = 1 / cur.zoom
        const cx = w * 0.5 + (sx - w * 0.5) * z
        const cy = h * 0.5 + (sy - h * 0.5) * z

        if (cx < -20 || cx > w + 20 || cy < -20 || cy > h + 20) continue

        /* 闪烁 */
        const tw = 0.62 + 0.38 * Math.sin(t * s.speed + s.phase)
        const alpha = s.base * tw * (0.55 + s.depth * 0.6)
        const radius = s.r * (0.75 + s.depth * 0.5)

        /* 亮星的衍射星芒 */
        if (radius > 1.35) {
          ctx.strokeStyle = `${s.color}${alpha * 0.28})`
          ctx.lineWidth = 0.6
          const spike = radius * 5.5
          ctx.beginPath()
          ctx.moveTo(cx - spike, cy)
          ctx.lineTo(cx + spike, cy)
          ctx.moveTo(cx, cy - spike)
          ctx.lineTo(cx, cy + spike)
          ctx.stroke()
        }

        /* 本体 */
        ctx.fillStyle = `${s.color}${alpha})`
        ctx.beginPath()
        ctx.arc(cx, cy, radius, 0, Math.PI * 2)
        ctx.fill()

        /* 亮星的柔和光晕 */
        if (radius > 1.05) {
          const hg = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * 7)
          hg.addColorStop(0, `${s.color}${alpha * 0.22})`)
          hg.addColorStop(1, 'rgba(0,0,0,0)')
          ctx.fillStyle = hg
          ctx.fillRect(cx - radius * 7, cy - radius * 7, radius * 14, radius * 14)
        }
      }

      rafRef.current = requestAnimationFrame(draw)
    }

    rafRef.current = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(rafRef.current)
      window.removeEventListener('resize', resize)
    }
  }, [ambient])

  return (
    <div
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
      aria-hidden
    >
      <canvas ref={canvasRef} className="absolute inset-0" />
    </div>
  )
}
