import {
  createContext,
  useContext,
  useMemo,
  useRef,
  type ReactNode,
  type CSSProperties,
} from 'react'
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  type MotionValue,
} from 'framer-motion'

/* ============================================================
 *  3D 空间场景（v10.0 · 任务 2 & 3）
 *
 *  ------------------------------------------------------------
 *  v9.0 用的是手写 rAF 弹簧 + 直接写 DOM style。
 *  问题很明确：
 *    · 物理参数全靠手调，鼠标一动就是"生硬"的位移；
 *    · 没有统一的"观察者"模型 —— 各层各算各的，
 *      于是透视关系是错的（看起来像贴纸在乱晃，而不是空间在转）；
 *    · 卡片用 translateZ 却没有配套的层级约束，
 *      于是边缘卡片会穿模压住中心星盘。
 *
 *  v10.0 换成 Motion 的正统做法（参考 Awwwards 级实现）：
 *
 *    ┌ 一个归一化指针源 (-0.5 ~ 0.5)
 *    │   ↓ useSpring（唯一的物理来源）
 *    │ 一对平滑后的 MotionValue：sx / sy
 *    │   ↓ useTransform（每层按自己的深度派生）
 *    │ 各图层独立的 translate / rotate
 *
 *  关键约束：
 *    1. **perspective 只挂在场景根节点**。
 *       每层自己再挂 perspective 会得到「双重透视」—— 那是错觉的元凶。
 *    2. **一切都在 MotionValue 里**。
 *       指针移动不进入 React，浏览器直接合成，零重渲染、零掉帧。
 *    3. **图层必须是独立组件**。
 *       useTransform 是 hook，不能写在 .map() 回调里。
 *    4. **reduced-motion** 用户直接不启用任何位移。
 * ============================================================ */

/** 场景的透视深度 —— 布局求解器也要用它来算缩放，必须保持一致 */
export const SCENE_PERSPECTIVE = 1500

/** 星盘最大倾斜角（度）—— 规格要求钳制在 ±10 以内 */
export const MAX_TILT = 10

interface SceneCtx {
  /** 平滑后的指针横坐标（-0.5 ~ 0.5） */
  sx: MotionValue<number>
  /** 平滑后的指针纵坐标（-0.5 ~ 0.5） */
  sy: MotionValue<number>
  /** 用户是否要求减少动效 */
  reduced: boolean
}

const SceneContext = createContext<SceneCtx | null>(null)

/** 钳制到 [-0.5, 0.5] */
const clamp01 = (v: number) => Math.max(-0.5, Math.min(0.5, v))

interface ParallaxSceneProps {
  children: ReactNode
  /**
   * **枢轴元素**（通常是中心星盘）。
   * 指针偏移以它为中心计算 —— 这样"鼠标停在星盘正中"
   * 就等于零倾斜，而不是"鼠标停在视口正中"。
   */
  pivotRef?: React.RefObject<HTMLElement | null>
  className?: string
  style?: CSSProperties
}

/**
 * 3D 场景根节点。
 *
 * 它负责三件事：
 *   1. 建立**唯一**的透视坐标系（perspective + preserve-3d）
 *   2. 捕获指针，归一化成 -0.5~0.5
 *   3. 用一根弹簧把原始指针平滑掉
 */
export function ParallaxScene({
  children,
  pivotRef,
  className = '',
  style,
}: ParallaxSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  /* ---------- 原始指针（不进 React） ---------- */
  const px = useMotionValue(0)
  const py = useMotionValue(0)

  /* ---------- 弹簧：整座空间唯一的物理来源 ---------- *
   *
   * stiffness 120 / damping 19 / mass 1
   *   → 阻尼比 ζ ≈ 0.87（略欠阻尼）
   *   → 停下时有一点点「丝滑的惯性回弹」，但绝不晃悠
   */
  const sx = useSpring(px, { stiffness: 120, damping: 19, mass: 1 })
  const sy = useSpring(py, { stiffness: 120, damping: 19, mass: 1 })

  const reduced = useReducedMotion() ?? false

  const ctx = useMemo<SceneCtx>(
    () => ({ sx, sy, reduced }),
    [sx, sy, reduced],
  )

  /* ---------- 指针捕获 ---------- */
  const handleMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (reduced) return
    const container = containerRef.current
    if (!container) return

    const cr = container.getBoundingClientRect()
    if (cr.width === 0 || cr.height === 0) return

    /* 枢轴优先：中心是星盘，就以星盘为原点 */
    const pivot = pivotRef?.current
    const pr = pivot?.getBoundingClientRect()
    const pivotCx = pr ? pr.left + pr.width / 2 : cr.left + cr.width / 2
    const pivotCy = pr ? pr.top + pr.height / 2 : cr.top + cr.height / 2

    px.set(clamp01((e.clientX - pivotCx) / cr.width))
    py.set(clamp01((e.clientY - pivotCy) / cr.height))
  }

  /* ---------- 指针离开：回中 ---------- */
  const handleLeave = () => {
    px.set(0)
    py.set(0)
  }

  return (
    <SceneContext.Provider value={ctx}>
      <div
        ref={containerRef}
        onPointerMove={handleMove}
        onPointerLeave={handleLeave}
        className={className}
        style={{
          /* 唯一的透视坐标系 —— 只有这一处 */
          perspective: SCENE_PERSPECTIVE,
          perspectiveOrigin: '50% 50%',
          transformStyle: 'preserve-3d',
          ...style,
        }}
      >
        {children}
      </div>
    </SceneContext.Provider>
  )
}

/* ============================================================
 *  图层
 * ============================================================ */

interface ParallaxLayerProps {
  children: ReactNode
  /** Z 轴深度（px）—— 负数在后，正数在前 */
  depth?: number
  /** 绕 X 轴最大倾斜（度）—— 内部会钳制在 ±MAX_TILT */
  tiltX?: number
  /** 绕 Y 轴最大倾斜（度）—— 内部会钳制在 ±MAX_TILT */
  tiltY?: number
  /** 随指针横向位移的最大像素数 */
  parallaxX?: number
  /** 随指针纵向位移的最大像素数 */
  parallaxY?: number
  /** 是否反向位移（背景层用） */
  reverse?: boolean
  className?: string
  style?: CSSProperties
}

/**
 * 视差图层。
 *
 * 每个图层都是**独立组件**（useTransform 是 hook，不能写在 map 里）。
 * 它的位移 / 倾斜全部由共享的 sx / sy 派生，
 * 所以所有图层永远「同相」—— 这是空间感成立的根基。
 */
export function ParallaxLayer({
  children,
  depth = 0,
  tiltX = 0,
  tiltY = 0,
  parallaxX = 0,
  parallaxY = 0,
  reverse = false,
  className = '',
  style,
}: ParallaxLayerProps) {
  const ctx = useContext(SceneContext)
  if (!ctx) {
    throw new Error('ParallaxLayer 必须放在 ParallaxScene 内部')
  }
  const { sx, sy, reduced } = ctx

  /* 倾斜角钳制 —— 规格要求绝不超过 ±10° */
  const capTilt = (v: number) =>
    Math.max(-MAX_TILT, Math.min(MAX_TILT, Math.abs(v)))

  const dir = reverse ? -1 : 1

  /*
   * 位移：sx ∈ [-0.5, 0.5]，乘 2 得到 ±1，再乘 parallaxX 得到像素值。
   */
  const x = useTransform(sx, (v) =>
    reduced ? 0 : v * 2 * parallaxX * dir,
  )
  const y = useTransform(sy, (v) =>
    reduced ? 0 : v * 2 * parallaxY * dir,
  )

  /*
   * 倾斜（球体轨道隐喻）：
   *   指针右移 → 星盘左侧转向观众 → rotateY 为正
   *   指针下移 → 星盘上侧转向观众 → rotateX 为负
   */
  const rotateY = useTransform(sx, [-0.5, 0.5], [-capTilt(tiltY), capTilt(tiltY)])
  const rotateX = useTransform(sy, [-0.5, 0.5], [capTilt(tiltX), -capTilt(tiltX)])

  return (
    <motion.div
      className={className}
      style={{
        x,
        y,
        rotateX,
        rotateY,
        z: depth,
        transformStyle: 'preserve-3d',
        willChange: 'transform',
        ...style,
      }}
    >
      {children}
    </motion.div>
  )
}

/* ============================================================
 *  语义化快捷层
 * ============================================================ */

/**
 * 深层背景层（Z < 0）。
 * 星空底图，跟随鼠标做**极小幅度反向**平移 —— 制造纵深而非晃动。
 */
export function ParallaxBackdrop({
  children,
  depth = -420,
  className = '',
  style,
}: {
  children: ReactNode
  depth?: number
  className?: string
  style?: CSSProperties
}) {
  return (
    <ParallaxLayer
      depth={depth}
      parallaxX={18}
      parallaxY={14}
      reverse
      className={`absolute ${className}`}
      style={{ zIndex: 0, ...style }}
    >
      {children}
    </ParallaxLayer>
  )
}

/**
 * 绝对中心层（Z = 0）。
 * 星盘固定在正中央 —— **只做小幅 3D 倾斜，绝不平移**。
 */
export function ParallaxCore({
  children,
  tiltX = 7,
  tiltY = 9,
  className = '',
  style,
}: {
  children: ReactNode
  tiltX?: number
  tiltY?: number
  className?: string
  style?: CSSProperties
}) {
  return (
    <ParallaxLayer
      depth={0}
      tiltX={tiltX}
      tiltY={tiltY}
      className={className}
      style={{ zIndex: 10, ...style }}
    >
      {children}
    </ParallaxLayer>
  )
}

/**
 * 悬浮前景层（Z > 50）。
 * 卡片面向屏幕（不做 3D 旋转，避免文字被透视扭曲），
 * 只做轻微的视差偏移 —— 近的动得多，远的动得少。
 */
export function ParallaxCard({
  children,
  depth = 100,
  parallaxX = 10,
  parallaxY = 8,
  className = '',
  style,
}: {
  children: ReactNode
  depth?: number
  parallaxX?: number
  parallaxY?: number
  className?: string
  style?: CSSProperties
}) {
  return (
    <ParallaxLayer
      depth={depth}
      parallaxX={parallaxX}
      parallaxY={parallaxY}
      className={className}
      style={style}
    >
      {children}
    </ParallaxLayer>
  )
}
