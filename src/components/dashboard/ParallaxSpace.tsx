import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
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
 *  3D 立体空间（v10.0）
 *
 *  ------------------------------------------------------------
 *  v9.0 的手写原生实现被整体废弃，原因：
 *
 *    1. **自造弹簧 + rAF + DOM 直写** —— 与 framer-motion 重复造轮子，
 *       调参困难，且无法享受库的成熟手感。
 *    2. **深度被"能量"缩放** —— 卡片随鼠标移动不断缩放，
 *       视觉上像果冻变形，而不是视差。
 *    3. **两层嵌套 perspective** —— 透视被算了两次，关系全乱。
 *    4. **overflow-hidden 压平 3D** —— MDN 明确警告：
 *       overflow 会 flatten `preserve-3d`，星盘的厚度感荡然无存。
 *    5. **translateZ 的放大没算进布局** —— 卡片被透视放大 8~10%，
 *       而布局按 2D 尺寸贴边，于是精准地压进了星盘。
 *
 *  ============================================================
 *  v10.0 遵循 Awwwards 级实践：
 *
 *    · **单一指针源** —— 一个归一化坐标（-0.5 ~ 0.5），
 *      全场景共享同一份采样，所有图层天然同步。
 *    · **一根物理弹簧** —— `useSpring` 平滑，停止移动后有惯性回弹。
 *    · **派生而非绑定** —— 每个图层用 `useTransform` 从弹簧派生
 *      自己的位移，绝不把原始 mouse 数值直接塞进 transform。
 *    · **单一 perspective 容器** —— 深度常量，不随鼠标变化。
 *    · **切向公转** —— 卡片绕星盘切线方向移动，
 *      距离只会变远，**结构上不可能侵入星盘**。
 * ============================================================ */

/**
 * 场景透视深度（px）。
 *
 * 与布局求解器共用同一个常量 —— 这是「卡片不穿模」的关键：
 * 求解器必须用同一个值来计算透视放大系数。
 */
export const SCENE_PERSPECTIVE = 1500

/* ---------------- 物理参数 ---------------- */

/** 指针弹簧：手感偏"沉"，跟随但不神经质 */
const POINTER_SPRING = {
  stiffness: 140,
  damping: 24,
  mass: 0.6,
} as const

/** 星盘最大倾斜角（度）—— 规格要求钳制在 ±10 以内 */
const CORE_TILT = 8

/** 背景层反向平移幅度（px） */
const BACKDROP_SHIFT = 18

/** 卡片公转幅度（px） */
const CARD_ORBIT = 16

/* ============================================================
 *  Context
 * ============================================================ */

interface ParallaxContextValue {
  /** 平滑后的指针横坐标（-0.5 ~ 0.5） */
  sx: MotionValue<number>
  /** 平滑后的指针纵坐标（-0.5 ~ 0.5） */
  sy: MotionValue<number>
  /** 是否启用（尊重 prefers-reduced-motion） */
  enabled: boolean
}

const ParallaxContext = createContext<ParallaxContextValue | null>(null)

/** 场景内部使用 */
export function useParallaxContext(): ParallaxContextValue {
  const ctx = useContext(ParallaxContext)
  if (!ctx) {
    throw new Error('useParallaxContext 必须在 <ParallaxSpace> 内使用')
  }
  return ctx
}

/* ============================================================
 *  ParallaxSpace —— 指针源 + 弹簧
 * ============================================================ */

interface ParallaxSpaceProps {
  children: ReactNode
  /** 是否启用视差 */
  enabled?: boolean
  /**
   * **透视原点**所在的元素（通常是主体区 main）。
   *
   * 这一条极其关键：
   *
   * CSS 的 perspective 是围绕 `perspective-origin` 投影的。
   * 若场景根（视口）与内容区（main）的中心不一致，
   * 那么「屏幕空间 ↔ 布局空间」的换算就会整体偏移，
   * 卡片的位置与实际渲染位置对不上 —— 这正是 v9.0 穿模的深层原因。
   *
   * 这里把 `perspective-origin` 动态对齐到该元素的中心，
   * 让 **main 的中心 === 透视原点 === 布局求解原点**，三者合一。
   */
  originRef?: RefObject<HTMLElement | null>
  className?: string
  style?: CSSProperties
}

export function ParallaxSpace({
  children,
  enabled = true,
  originRef,
  className = '',
  style,
}: ParallaxSpaceProps) {
  const reduceMotion = useReducedMotion()
  const active = enabled && !reduceMotion

  /* ---- 原始指针（不触发渲染） ---- */
  const px = useMotionValue(0)
  const py = useMotionValue(0)

  /* ---- 物理弹簧：一次平滑，全场景共用 ---- */
  const sx = useSpring(px, POINTER_SPRING)
  const sy = useSpring(py, POINTER_SPRING)

  /* ============================================================
   *  透视原点 —— 动态对齐到 originRef 的中心
   *
   * 用 ResizeObserver + 滚动监听保持同步。
   * 变化极低频（只在窗口尺寸/布局改变时），不会影响动画性能。
   * ============================================================ */
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const sync = () => {
      const root = rootRef.current
      const el = originRef?.current
      if (!root || !el) {
        setOrigin(null)
        return
      }
      const rr = root.getBoundingClientRect()
      const er = el.getBoundingClientRect()
      setOrigin({
        x: er.left + er.width / 2 - rr.left,
        y: er.top + er.height / 2 - rr.top,
      })
    }

    sync()
    const ro = new ResizeObserver(sync)
    if (rootRef.current) ro.observe(rootRef.current)
    if (originRef?.current) ro.observe(originRef.current)
    window.addEventListener('resize', sync)
    window.addEventListener('scroll', sync, true)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', sync)
      window.removeEventListener('scroll', sync, true)
    }
  }, [originRef])

  useEffect(() => {
    if (!active) {
      px.set(0)
      py.set(0)
      return
    }

    const onMove = (e: PointerEvent) => {
      /*
       * 指针归一化以**透视原点**为中心：
       * 指针正落在星盘上时 → 值为 0 → 倾斜恰好为零。
       * 这是最自然的 3D 倾斜手感。
       */
      const root = rootRef.current
      let cx = window.innerWidth / 2
      let cy = window.innerHeight / 2
      if (root) {
        const rr = root.getBoundingClientRect()
        cx = rr.left + (origin?.x ?? rr.width / 2)
        cy = rr.top + (origin?.y ?? rr.height / 2)
      }
      const vw = Math.max(1, window.innerWidth)
      const vh = Math.max(1, window.innerHeight)
      px.set((e.clientX - cx) / vw)
      py.set((e.clientY - cy) / vh)
    }

    /* 指针离开 → 回中位，弹簧负责惯性归位 */
    const onLeave = () => {
      px.set(0)
      py.set(0)
    }

    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('blur', onLeave)
    window.addEventListener('pointerout', onLeave)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('blur', onLeave)
      window.removeEventListener('pointerout', onLeave)
    }
  }, [active, origin, px, py])

  const value = useMemo(
    () => ({ sx, sy, enabled: active }),
    [sx, sy, active],
  )

  return (
    <ParallaxContext.Provider value={value}>
      {/*
       * 场景根 —— **唯一**持有 perspective 的元素。
       *
       * v9.0 的教训：场景里不能出现第二个 perspective，
       * 否则透视被投影两次，深度关系全乱。
       * 同时 transformStyle: preserve-3d 让子层的 z 真正生效。
       *
       * 注意：这里**必须**撑满父容器 ——
       * 否则 main 的 flex-1 高度会塌成 0，
       * 整个场景（星盘 + 卡片）会挤成一团。
       */}
      <div
        ref={rootRef}
        data-parallax="scene"
        className={`relative h-full w-full ${className}`}
        style={{
          perspective: SCENE_PERSPECTIVE,
          perspectiveOrigin: origin
            ? `${origin.x}px ${origin.y}px`
            : '50% 50%',
          transformStyle: 'preserve-3d',
          ...style,
        }}
      >
        {children}
      </div>
    </ParallaxContext.Provider>
  )
}

/* ============================================================
 *  背景层 —— Z < 0，反向微移
 * ============================================================ */

interface LayerProps {
  children: ReactNode
  className?: string
  style?: CSSProperties
}

/**
 * 深层背景（星空 / 元素色彩）。
 *
 * Z = -600：透视把它推远、缩小。
 * 为了仍然铺满容器，额外做一次反向缩放补偿
 * （1500 / (1500 - 600) ≈ 1.67，但视觉大小按 1500/(1500+600) ≈ 0.714 缩小，
 *  所以放大 1.42 即可基本抵消）。
 *
 * 平移方向与前景**相反** —— 鼠标右移，背景左退，
 * 产生"被拉向无限深"的错觉。
 *
 * 注意：这里**不能**再挂自己的 perspective ——
 * 场景根已经有唯一的 perspective，再嵌套会把深度算两次。
 */
export function ParallaxBackdrop({ children, className = '', style }: LayerProps) {
  const { sx, sy, enabled } = useParallaxContext()

  const x = useTransform(
    sx,
    [-0.5, 0.5],
    enabled ? [BACKDROP_SHIFT, -BACKDROP_SHIFT] : [0, 0],
  )
  const y = useTransform(
    sy,
    [-0.5, 0.5],
    enabled ? [BACKDROP_SHIFT * 0.8, -BACKDROP_SHIFT * 0.8] : [0, 0],
  )

  return (
    <motion.div
      data-parallax-layer="backdrop"
      className={`absolute inset-0 ${className}`}
      style={{
        x,
        y,
        z: -600,
        scale: 1.42,
        transformStyle: 'preserve-3d',
        ...style,
      }}
      aria-hidden
    >
      {children}
    </motion.div>
  )
}

/* ============================================================
 *  核心层 —— Z = 0，固定在正中央
 * ============================================================ */

/**
 * 绝对中心：星盘。
 *
 * · Z 恒为 0（绝不前后跑）
 * · 只做 rotateX / rotateY，最大 ±8°（规格上限 ±10°）
 * · 旋转支点 = 元素自身中心 = 星盘中心
 *
 * 它**不会平移**，只"歪头"——就像你歪头看一张桌上的圆盘。
 */
export function ParallaxCore({ children, className = '', style }: LayerProps) {
  const { sx, sy, enabled } = useParallaxContext()

  const rotateX = useTransform(
    sy,
    [-0.5, 0.5],
    enabled ? [CORE_TILT, -CORE_TILT] : [0, 0],
  )
  const rotateY = useTransform(
    sx,
    [-0.5, 0.5],
    enabled ? [-CORE_TILT, CORE_TILT] : [0, 0],
  )

  /*
   * 【v10.0 关键修正】
   *
   * v9.0 把 rotateX/rotateY 直接挂在 `absolute inset-0` 的**整层**上，
   * 于是旋转的是「整个 main 区域」—— 星盘也跟着被甩偏几十像素。
   *
   * 现在拆成两层：
   *   外层 —— 只负责定位（absolute inset-0 + flex 居中），**不旋转**
   *   内层 —— 包住星盘本体，围绕**自身中心**做 ±8° 歪头
   *
   * 内层是 flex item，会自动收缩包裹住星盘，
   * 于是它的旋转中心 == 星盘中心 —— 星盘真正"钉"在原地。
   */
  return (
    <div className={className} style={style}>
      {/*
        内层用 absolute + left-1/2/top-1/2 锚定中心，
        再用 translate(-50%, -50%) 把自身拉回去。

        这样内层的**变换原点**（transform-origin）就是星盘中心，
        旋转绕星盘中心发生 —— 星盘真正原地歪头，不位移。

        注意：这里的 translate 是内联 transform 的一部分，
        与 framer-motion 的 rotateX/rotateY 组合时，
        framer-motion 会把整条 transform 一起接管，
        两者顺序固定为「translate → rotate」，符合 CSS 语义。
      */}
      <motion.div
        data-parallax-layer="core"
        className="absolute left-1/2 top-1/2"
        style={{
          x: '-50%',
          y: '-50%',
          rotateX,
          rotateY,
          transformStyle: 'preserve-3d',
        }}
      >
        {children}
      </motion.div>
    </div>
  )
}

/* ============================================================
 *  悬浮层 —— Z > 50，切向公转
 * ============================================================ */

interface ParallaxCardProps {
  children: ReactNode
  /** Z 深度（px）—— **恒定**，不随鼠标变化 */
  depth: number
  /**
   * 卡片相对场景中心的方位角（度）。
   *
   * 用来确定公转方向：**沿切线**（垂直于半径）移动。
   * 这样卡片只会绕着星盘打转、越转越远，
   * **结构上不可能压到星盘本体**。
   */
  angle: number
  /** 公转幅度（px） */
  orbit?: number
  className?: string
  style?: CSSProperties
  /**
   * v11.0 · 任务 5：新手引导的高亮定位锚点。
   * 引导层用 querySelector(`[data-guide-id="..."]`) 定位这张卡。
   */
  'data-guide-id'?: string
}

/**
 * 悬浮前景卡片。
 *
 * 三个关键约束：
 *   1. `z` 是常量 —— 卡片不会随鼠标缩放（v9.0 的果冻变形就是这么来的）
 *   2. 位移沿**切线** —— 只会远离中心，永不侵入星盘
 *   3. 面向屏幕 —— 不做 rotateX/rotateY，保持平面阅读性
 */
export function ParallaxCard({
  children,
  depth,
  angle,
  orbit = CARD_ORBIT,
  className = '',
  style,
  'data-guide-id': guideId,
}: ParallaxCardProps) {
  const { sx, sy, enabled } = useParallaxContext()

  const rad = (angle * Math.PI) / 180
  /* 切向单位向量：垂直于径向 */
  const tx = -Math.sin(rad)
  const ty = Math.cos(rad)

  const x = useTransform(sx, (v) => (enabled ? v * orbit * tx * 2 : 0))
  const y = useTransform(sy, (v) => (enabled ? v * orbit * ty * 2 : 0))

  return (
    <motion.div
      data-parallax-layer="card"
      data-guide-id={guideId}
      className={className}
      style={{
        x,
        y,
        z: depth,
        transformStyle: 'preserve-3d',
        ...style,
      }}
    >
      {children}
    </motion.div>
  )
}
