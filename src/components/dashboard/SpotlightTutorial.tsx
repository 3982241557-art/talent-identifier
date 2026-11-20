import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

/* ============================================================
 *  SpotlightTutorial —— 原位高亮新手指引（v18.0）
 * ============================================================
 *
 *  【v18.0 解决的问题】
 *  v17.0 的做法是「遮罩挖洞 + 在洞的边缘另画一圈发光方框」。
 *  问题出在那个方框上：
 *   · 它是**独立画上去**的框，尺寸靠 padding 猜，
 *     经常比元素大一圈，框边压住元素自己的文字；
 *   · 文案卡又贴着框摆位，于是「跳过 / 下一步」按钮
 *     和元素文字挤在一起，谁也看不清。
 *
 *  【v18.0 的做法】
 *  1. **不再画框**。只保留一层全屏暗夜遮罩，
 *     用 SVG mask 把目标所在的区域**挖成完全透明** ——
 *     目标元素以 100% 亮度原样呈现，
 *     周围的界面被压暗 + 轻微模糊，视线自然被吸过去。
 *  2. **原位高亮**：目标是页面里真实存在的元素，
 *     我们不复制、不替换、不套框，只是「把它从暗夜里挖出来」。
 *  3. **气泡紧贴但绝不重叠**：
 *     气泡会测量自己的实际尺寸，然后从 8 个候选位置里
 *     挑一个「与所有目标元素重叠面积最小」的位置。
 *  4. **按钮长在气泡里**（不再有独立的底部控制条）——
 *     这样「跳过 / 下一步」永远和文案在一起，
 *     绝对不可能压到页面的任何文字上。
 *  5. **一步一进**：点「下一步」才切到下一个高亮目标。
 * ============================================================ */

/** 引导步骤定义 */
export interface SpotlightStep {
  /** 步骤序号（1 起） */
  n: number
  /** 标题 */
  title: string
  /** 一句话说明：这个板块是干嘛的 */
  desc: string
  /** 划线重点 —— 具体到场景的一句话 */
  emphasis: string
  /** 目标选择器（CSS）—— 支持多个，用逗号分隔 */
  selector: string
  /** 目标说明（定位失败时的兜底文案） */
  fallback: string
  /**
   * 这一步的**固定停靠方向**。
   *
   * v18.1：星盘在漂浮、卡片在轻微晃动，
   * 如果每次测量都重新算落位，气泡就会在左右之间反复横跳。
   * 所以每一步都写死一个方向（像相机的对焦锁），
   * 只在「切换步骤」和「窗口 resize」时算一次坐标。
   */
  dock?: 'left' | 'right' | 'top' | 'bottom'
  /**
   * 这一步需要先打开某个面板才能看到目标。
   *
   * v18.0：版本切换键已经顶置到**面板头**，
   * 所以讲它之前得先把面板打开 —— 否则星盘界面上根本没有这颗胶囊。
   */
  needsOverlay?: 'mbti'
}

/** 七步引导文案 —— 全部改成「朋友聊天」的口吻 */
export const SPOTLIGHT_STEPS: SpotlightStep[] = [
  {
    n: 1,
    title: '这是你的本命星盘',
    desc: '出生那一刻天上星星在哪，全画在这张圆盘上。',
    emphasis:
      '外圈十二块是你人生的几件事，圆上那些点是行星的落点 —— 太阳管你外在的样子，月亮管你心情和习惯',
    selector: '[data-spot="astrolabe"]',
    fallback: '正中央那张圆盘',
    dock: 'right',
  },
  {
    n: 2,
    title: '右上角三个小方块',
    desc: '你最常被问到的三个问题，答案就在这儿。',
    emphasis:
      '太阳是你给别人看的那一面，月亮是你自己心里想要什么，上升是别人第一眼看你是什么印象',
    selector: '[data-spot="bigthree"]',
    fallback: '右上角的太阳 / 月亮 / 上升',
    dock: 'bottom',
  },
  {
    n: 3,
    title: '顶栏的星空入口',
    desc: '随时能回看出生那天的宇宙，也能把烦心事扔进去。',
    emphasis:
      '点开是哈勃在你生日那天拍下的真宇宙；看完可以把心里的负担写下来丢进星空',
    selector: '[data-spot="birthsky"]',
    fallback: '右上角「出生那天的星空 / 丢掉烦恼」',
    dock: 'bottom',
  },
  {
    n: 4,
    title: '左边：MBTI 解码',
    desc: '你是什么性格类型，以及它怎么影响你做事。',
    emphasis:
      '比如你总习惯把话憋着、心里先想三遍才开口 —— 这就是它给你的解释',
    selector: '[data-spot="mbti"]',
    fallback: '左上的「MBTI 解码」卡片',
    dock: 'right',
  },
  {
    n: 5,
    title: '面板顶上的两颗按钮',
    desc: '每个解读面板都能在两种深浅之间随便切。',
    emphasis:
      '「⚡️ 极简直给版」三秒扫完核心结论；「🔭 深度剖析版」把来龙去脉一步步聊透',
    /*
     * 注意：这里**不能**再叠加 `[data-version-toggle]` ——
     * 遮罩的挖洞用的是 SVG evenodd 规则，
     * 嵌套的洞会互相抵消（洞套洞 = 又变回实心），
     * 结果就是切换键被压暗、还点不动。
     * 只挖面板头这一个洞就够 —— 切换键就在里面。
     */
    selector: '[data-spot="panel-header"]',
    fallback: '面板右上角那两颗切换按钮',
    needsOverlay: 'mbti',
    dock: 'bottom',
  },
  {
    n: 6,
    title: '右边：天赋解析',
    desc: '你身上真正拿得出手的本事，拆成四块给你看。',
    emphasis:
      '每块都写了「适合做什么」，还有一句可以马上练的小动作',
    selector: '[data-spot="talent"]',
    fallback: '右上的「天赋解析」卡片',
    dock: 'left',
  },
  {
    n: 7,
    title: '左下：优势挖掘实践',
    desc: '看完天赋，接着把它变成能做的事。',
    emphasis:
      '填满五个格子你就知道自己优势长什么样，再把不擅长的划掉，剩下的就是方向',
    selector: '[data-spot="advantage"]',
    fallback: '左下的「优势挖掘实践」卡片',
    dock: 'right',
  },
  {
    n: 8,
    title: '今天能用的两块',
    desc: '每天瞄一眼，看看今天该注意哪件小事。',
    emphasis:
      '运势只讲今天这二十四小时；纠结的时候抽一张牌，跟自己聊两句',
    selector: '[data-spot="fortune"], [data-spot="tip"]',
    fallback: '右侧的「今日运势」与「每日灵感抽牌」',
    dock: 'left',
  },
]

/** 本地存储键 —— v18 换键，让老用户也能再看到一次新版引导 */
const SEEN_KEY = 'talent-identifier:spotlight-seen-v18'

interface SpotlightTutorialProps {
  /** 强制展示（右上角「?」按钮触发） */
  force?: boolean
  /** 关闭回调 */
  onDone?: () => void
  /** 主题强调色 */
  accent: string
  /**
   * v18.0：某一步需要先打开某个面板才能看到目标。
   *
   * 引导走到那一步时，调用它把面板打开；
   * 面板关掉时，引导也一并结束。
   */
  onOpenOverlay?: (id: 'mbti') => void
  /** 面板被关闭时回调 —— 引导需要收尾 */
  onOverlayClosed?: () => void
}

/** 目标矩形 */
interface TargetRect {
  top: number
  left: number
  width: number
  height: number
}

/** 气泡尺寸 */
interface BubbleSize {
  w: number
  h: number
}

export function SpotlightTutorial({
  force = false,
  onDone,
  accent,
  onOpenOverlay,
  onOverlayClosed,
}: SpotlightTutorialProps) {
  const [active, setActive] = useState<number | null>(null)
  /** 当前步骤命中的**所有**目标矩形 */
  const [rects, setRects] = useState<TargetRect[]>([])
  /** 气泡的实际尺寸（用于避让计算） */
  const [bubbleSize, setBubbleSize] = useState<BubbleSize>({ w: 420, h: 320 })
  /** 视口宽度 —— 气泡宽度跟着视口走，窄屏自动收窄 */
  const [viewportW, setViewportW] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 1440,
  )
  /** 气泡落位 */
  const [bubblePos, setBubblePos] = useState({ left: 24, top: 24 })
  /** 冻结的锚点 —— 气泡位置只在它变化时重算 */
  const [dock, setDock] = useState<{
    anchor: TargetRect
    rects: TargetRect[]
  } | null>(null)
  /** 收尾确认态 —— 最后一步点完成后展示 */
  const [showOutro, setShowOutro] = useState(false)

  const bubbleRef = useRef<HTMLDivElement>(null)

  /**
   * 【v18.1 · 防抖核心】
   *
   * 目标元素（星盘、卡片）一直在轻微浮动，
   * 如果气泡位置跟着每帧重算，就会左右乱跳。
   *
   * 所以把两件事彻底分开：
   *   · `rects` —— **遮罩挖洞**用的矩形，需要跟着目标实时走（否则洞会错位）；
   *   · `bubblePos` —— **气泡落位**，只在三种时刻重算：
   *       1. 切换步骤
   *       2. 窗口 resize
   *       3. 气泡自身尺寸确定（首次渲染后）
   *     其余时间一律锁死。
   */
  /** resize 计数器 —— 窗口尺寸变化时 +1，触发落位重算 */
  const [resizeTick, setResizeTick] = useState(0)

  const step = active !== null ? SPOTLIGHT_STEPS[active] : null

  /* ============================================================
   *  首次进入自动触发（右上角「?」可随时重看）
   * ============================================================ */
  useEffect(() => {
    if (force) {
      setActive(0)
      return
    }
    let seen = false
    try {
      seen = localStorage.getItem(SEEN_KEY) === '1'
    } catch {
      seen = false
    }
    if (seen) return
    /* 延后一点，等星盘和卡片完成入场动画 */
    const t = window.setTimeout(() => setActive(0), 1500)
    return () => window.clearTimeout(t)
  }, [force])

  /* ============================================================
   *  需要先打开面板的步骤
   *
   * 版本切换键住在面板头，所以讲它之前得先把面板打开；
   * 讲完这一步，再回到星盘界面继续。
   * ============================================================ */
  const prevActive = useRef<number | null>(null)
  useEffect(() => {
    const prev = prevActive.current
    prevActive.current = active

    if (active === null || !step) {
      /* 引导结束 → 关掉可能还开着的面板 */
      if (prev !== null) onOverlayClosed?.()
      return
    }

    if (step.needsOverlay) {
      /* 进入需要面板的步骤 → 打开 */
      if (prev !== active) onOpenOverlay?.(step.needsOverlay)
    } else if (prev !== null && prev !== active) {
      /* 从需要面板的步骤离开 → 收掉面板 */
      const prevStep = SPOTLIGHT_STEPS[prev]
      if (prevStep?.needsOverlay) onOverlayClosed?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  /* ============================================================
   *  实时测量目标位置
   *
   *  这份数据只喂给**遮罩挖洞**和**光晕** ——
   *  它们必须紧跟目标，所以要持续更新。
   *  注意：气泡位置**不**依赖它（见下面的「冻结锚点」）。
   * ============================================================ */
  useLayoutEffect(() => {
    if (active === null || !step) return

    const measure = () => {
      const els = Array.from(
        document.querySelectorAll<HTMLElement>(step.selector),
      ).filter((el) => {
        const r = el.getBoundingClientRect()
        return r.width > 4 && r.height > 4
      })

      if (els.length === 0) {
        setRects([])
        return
      }

      setRects(
        els.map((el) => {
          const r = el.getBoundingClientRect()
          return {
            top: r.top,
            left: r.left,
            width: r.width,
            height: r.height,
          }
        }),
      )
    }

    measure()
    const timer = window.setInterval(measure, 400)
    return () => window.clearInterval(timer)
  }, [active, step])

  /* ============================================================
   *  冻结锚点（v18.1 · 防抖核心）
   *
   *  气泡落位只在这里算，且**每一步只算一次**：
   *   · 切换步骤 → 重新冻结
   *   · 窗口 resize → 重新冻结
   *
   *  为什么要「等元素出现」：
   *  第 5 步要讲面板头，而面板是异步打开的，
   *  刚进这一步时 DOM 里还没有那个元素 ——
   *  所以这里轮询一小会儿，一找到就锁死。
   * ============================================================ */
  useLayoutEffect(() => {
    if (active === null || !step) {
      setDock(null)
      return
    }

    let locked = false

    const tryLock = () => {
      if (locked) return
      const els = Array.from(
        document.querySelectorAll<HTMLElement>(step.selector),
      ).filter((el) => {
        const r = el.getBoundingClientRect()
        return r.width > 4 && r.height > 4
      })
      if (els.length === 0) return

      const frozen = els.map((el) => {
        const r = el.getBoundingClientRect()
        return {
          top: r.top,
          left: r.left,
          width: r.width,
          height: r.height,
        }
      })
      /* 主目标 —— 面积最大的那个 */
      const anchor = frozen.reduce((a, b) =>
        b.width * b.height > a.width * a.height ? b : a,
      )

      locked = true
      setDock({ anchor, rects: frozen })
    }

    tryLock()
    const timer = window.setInterval(tryLock, 120)
    return () => window.clearInterval(timer)
  }, [active, step, resizeTick])

  /* ---------- 窗口 resize → 重新冻结 + 落位重算 ---------- */
  useEffect(() => {
    const onResize = () => {
      setViewportW(window.innerWidth)
      setResizeTick((t) => t + 1)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  /** 气泡宽度 —— 随视口自适应，但**只在 resize 时变** */
  const bubbleWidth = useMemo(
    () => Math.max(280, Math.min(420, viewportW - 48)),
    [viewportW],
  )

  /* ============================================================
   *  测量气泡尺寸
   *
   *  宽度是**写死**的（bubbleSize.w），这里只测高度。
   *  宽度写死 → 测量与渲染解耦 → 不会自反馈抖动。
   * ============================================================ */
  useLayoutEffect(() => {
    if (active === null) return
    const el = bubbleRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    if (r.width > 0 && r.height > 0) {
      setBubbleSize((prev) =>
        Math.abs(prev.h - r.height) > 1 ? { w: prev.w, h: r.height } : prev,
      )
    }
  }, [active, step])

  /* ============================================================
   *  计算气泡落位 —— 固定方向 + 一次性锁定
   * ============================================================ */
  useLayoutEffect(() => {
    if (active === null || !dock || !step) return
    const vw = window.innerWidth
    const vh = window.innerHeight
    setBubblePos(
      placeBubble(
        dock.rects,
        { w: bubbleWidth, h: bubbleSize.h },
        vw,
        vh,
        step.dock ?? 'right',
      ),
    )
  }, [active, dock, bubbleSize, bubbleWidth, step])

  /* ---------- 关闭（真正收起整个教程） ---------- */
  const finish = useCallback(() => {
    setActive(null)
    setRects([])
    setDock(null)
    setShowOutro(false)
    try {
      localStorage.setItem(SEEN_KEY, '1')
    } catch {
      /* 隐私模式：忽略 */
    }
    onDone?.()
  }, [onDone])

  /**
   * 【v18.1】最后一步点「我知道了」时**不直接关闭**，
   * 先切到收尾确认态 —— 让用户知道教程结束了、
   * 以及以后还能从右上角的「?」重开。
   */
  const goOutro = useCallback(() => {
    setShowOutro(true)
    setRects([])
    setDock(null)
    try {
      localStorage.setItem(SEEN_KEY, '1')
    } catch {
      /* 隐私模式：忽略 */
    }
  }, [])

  /* ---------- 下一步（一步一进） ---------- */
  const next = useCallback(() => {
    setActive((v) => {
      if (v === null) return v
      if (v >= SPOTLIGHT_STEPS.length - 1) {
        goOutro()
        return null
      }
      return v + 1
    })
  }, [goOutro])

  const prev = useCallback(() => {
    setActive((v) => (v === null ? v : Math.max(v - 1, 0)))
  }, [])

  /* ---------- 键盘 ---------- */
  useEffect(() => {
    if (active === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish()
      else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault()
        next()
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault()
        prev()
      } else if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        next()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, finish, next, prev])

  /* ============================================================
   *  遮罩路径 —— SVG mask 多洞真挖空
   * ============================================================ */
  const maskId = 'spotlight-cutout'
  const cssMaskId = 'spotlight-cutout-css'
  /** 点击捕手用的裁剪区 —— 把「洞」从可点击范围里真正剪掉 */
  const catcherClipId = 'spotlight-catcher-clip'
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1440
  const vh = typeof window !== 'undefined' ? window.innerHeight : 900

  /** 每个目标的圆角矩形路径 */
  const cutoutPaths = useMemo(
    () =>
      rects.map((rect) => {
        const pad = 10
        const x = rect.left - pad
        const y = rect.top - pad
        const w = rect.width + pad * 2
        const h = rect.height + pad * 2
        const r = 18
        return [
          `M ${x + r} ${y}`,
          `H ${x + w - r}`,
          `Q ${x + w} ${y} ${x + w} ${y + r}`,
          `V ${y + h - r}`,
          `Q ${x + w} ${y + h} ${x + w - r} ${y + h}`,
          `H ${x + r}`,
          `Q ${x} ${y + h} ${x} ${y + h - r}`,
          `V ${y + r}`,
          `Q ${x} ${y} ${x + r} ${y}`,
          'Z',
        ].join(' ')
      }),
    [rects],
  )

  /**
   * 【点击穿透遮罩 —— SVG evenodd 填充规则】
   *
   * 遮罩层要吃掉「洞外」的点击（点空白处 = 关闭教程），
   * 但「洞里」的点击必须落到真实界面上。
   * 用 `<path fill-rule="evenodd">` 把外框矩形与所有洞写进同一个 path：
   *   · 洞内 → 交叉偶数次 → 不填充 → 点击穿透 ✓
   *   · 洞外 → 交叉奇数次 → 填充 → 点击关闭 ✓
   */
  const clickCatcherPath = useMemo(() => {
    if (cutoutPaths.length === 0) return ''
    return `M 0 0 H ${vw} V ${vh} H 0 Z ${cutoutPaths.join(' ')}`
  }, [cutoutPaths, vw, vh])

  if (active === null && !showOutro) return null

  /* ============================================================
   *  收尾确认态（v18.1）
   *
   *  最后一步点完不直接消失 —— 先给一句收尾，
   *  顺便告诉用户以后能从右上角的「?」再打开。
   * ============================================================ */
  if (showOutro) {
    return (
      <div
        className="fixed inset-0 z-[310] flex items-center justify-center px-6"
        style={{
          pointerEvents: 'auto',
          background: 'rgba(4, 7, 14, 0.72)',
          backdropFilter: 'blur(3px)',
          WebkitBackdropFilter: 'blur(3px)',
        }}
        onClick={finish}
      >
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-[520px] rounded-[26px] border px-12 py-11 text-center"
          style={{
            borderColor: `${accent}44`,
            background:
              'linear-gradient(155deg, rgba(14,21,38,0.98), rgba(6,9,18,0.97))',
            boxShadow: `0 34px 100px rgba(0,0,0,0.78), 0 0 0 1px ${accent}1f inset`,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* 完成标记 */}
          <div
            className="mx-auto flex h-16 w-16 items-center justify-center rounded-full"
            style={{
              background: `radial-gradient(circle, ${accent}33, transparent 72%)`,
              border: `1px solid ${accent}55`,
            }}
          >
            <span
              className="text-[1.75rem] font-bold leading-none"
              style={{ color: accent }}
            >
              ✓
            </span>
          </div>

          {/* 主文案 */}
          <h3 className="serif-title mt-7 text-[clamp(1.375rem,1.9vw,1.875rem)] font-semibold tracking-[0.1em] text-mist">
            准备好了，现在开始体验吧
          </h3>

          {/* 副提示 */}
          <p className="serif-body mx-auto mt-4 max-w-[400px] text-[clamp(0.9375rem,1.05vw,1.0625rem)] font-medium leading-[1.85] text-mist/62">
            之后如果忘了怎么用，随时点右上角的「?」图标，就能再次打开新手教程。
          </p>

          {/* 主按钮 */}
          <button
            onClick={finish}
            className="mt-9 border-0 px-10 py-3.5 text-[0.9375rem] font-semibold tracking-[0.2em] transition-opacity duration-500 hover:opacity-88 focus:outline-none"
            style={{
              background: `linear-gradient(135deg, ${accent}, ${accent}bb)`,
              color: '#05080f',
              boxShadow: `0 12px 34px ${accent}44`,
              whiteSpace: 'nowrap',
            }}
          >
            开始体验
          </button>
        </motion.div>
      </div>
    )
  }

  return (
    /*
     * 根容器 pointer-events: none ——
     * 纯布局壳。真正的点击由遮罩层（hole catcher）处理。
     */
    <div className="fixed inset-0 z-[300]" style={{ pointerEvents: 'none' }}>
      {/* ============================================================
          遮罩层：SVG mask 真挖空
          —— 挖出来的区域**完全透明**，
             被讲解的元素以 100% 亮度原样呈现，
             其余区域压暗 + 轻微模糊。
             **这里不画任何框。**
          ============================================================ */}
      <svg
        className="absolute inset-0 h-full w-full"
        style={{ pointerEvents: 'none' }}
      >
        <defs>
          {/*
            mask 一：给 SVG 矩形用。
            SVG 的 <mask> 默认是 luminance 模式：
              黑色 = 完全透明（不画）
              白色 = 完全不透明（照画）
            所以这里：整屏黑 + 洞白 → 洞的位置**不画暗色**。
          */}
          <mask id={maskId} maskUnits="userSpaceOnUse">
            <rect x="0" y="0" width={vw} height={vh} fill="black" />
            {cutoutPaths.map((d, i) => (
              <path key={i} d={d} fill="white" />
            ))}
          </mask>

          {/*
            mask 二：给 CSS mask 用（模糊层）。
            CSS 的 mask-image 引用 SVG <mask> 时，
            「白色 = 显示」的方向跟 SVG 内部用法相反，
            所以要反过来：整屏白 + 洞黑 → 洞的位置不显示模糊层。
          */}
          <mask id={cssMaskId} maskUnits="userSpaceOnUse">
            <rect x="0" y="0" width={vw} height={vh} fill="white" />
            {cutoutPaths.map((d, i) => (
              <path key={i} d={d} fill="black" />
            ))}
          </mask>
        </defs>
      </svg>

      {/* ---------- 压暗层（挖洞） ----------
          v18.1：透明度从 0.74 降到 0.55 ——
          高亮某一块时，周围星盘和卡片仍能隐约看见轮廓，
          用户一眼就知道「现在讲的这块在页面什么位置」。 */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: 'rgba(4, 7, 14, 0.55)',
          WebkitMask: `url(#${cssMaskId})`,
          mask: `url(#${cssMaskId})`,
        }}
      />

      {/*
        v18.1：**取消全屏模糊层**。

        之前那层 `backdrop-filter: blur(2.5px)` 会把周围的星盘
        和卡片糊成一片，用户就看不出「现在高亮的是页面上哪一块」。
        现在只保留 0.55 的暗夜遮罩 ——
        周围轮廓依然可辨，视线也能被吸过来。
      */}

      {/* ============================================================
          原位高亮 —— 一团柔和的光晕
          不是框，是光。中心跟着目标走，边缘自然散开。
          ============================================================ */}
      {rects.map((rect, i) => (
        <motion.div
          key={`halo-${step?.n}-${i}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="pointer-events-none absolute"
          style={{
            left: rect.left - rect.width * 0.25,
            top: rect.top - rect.height * 0.35,
            width: rect.width * 1.5,
            height: rect.height * 1.7,
            background: `radial-gradient(ellipse at center, ${accent}30 0%, ${accent}12 42%, transparent 72%)`,
            filter: 'blur(26px)',
            mixBlendMode: 'screen',
          }}
        />
      ))}

      {/*
        遮罩层本身要能接收点击（关闭）。

        【v18.2 · 点击穿透修复】
        旧写法：`<path fillRule="evenodd" fill="transparent" />`
        —— `transparent` 在 SVG 里依然是**已绘制**状态，
        evenodd 挖出来的洞**照样会被命中**，
        于是「洞里的目标」点不动（用户看到的正是这个症状）。

        新写法：用 `clipPath` 把「洞」从可点击区域里**真正剪掉**。
        剪掉之后，洞里的坐标不再属于任何可点击形状，
        事件直接落到下层的真实卡片上 —— 引导时也能点开面板。
      */}
      {clickCatcherPath && (
        <svg
          className="absolute inset-0 h-full w-full"
          style={{ pointerEvents: 'auto' }}
          onClick={finish}
        >
          <defs>
            {/*
              注意：clipPath 里的多个子元素是**并集**，
              那样只会把洞「加」回来。
              要让洞真正被剪掉，必须：
                · 整条路径写成**一个** <path>（外框 + 所有洞）
                · 配合 clipRule="evenodd"（奇偶规则 → 洞内不填充）
            */}
            <clipPath id={catcherClipId} clipPathUnits="userSpaceOnUse">
              <path d={clickCatcherPath} clipRule="evenodd" />
            </clipPath>
          </defs>
          <path
            d={`M 0 0 H ${vw} V ${vh} H 0 Z`}
            fill="transparent"
            clipPath={`url(#${catcherClipId})`}
          />
        </svg>
      )}

      {/* ============================================================
          气泡 —— 紧贴目标，固定停靠方向，按钮长在里面
          ============================================================ */}
      <AnimatePresence mode="wait">
        {step && (
          <motion.div
            key={step.n}
            ref={bubbleRef}
            initial={{ opacity: 0, y: 14, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="absolute z-[302]"
            style={{
              left: bubblePos.left,
              top: bubblePos.top,
              pointerEvents: 'auto',
            }}
          >
            <div
              className="rounded-[20px] border px-7 py-6"
              style={{
                /* 宽度写死 —— 测量与渲染解耦，避免宽度自反馈 */
                width: bubbleWidth,
                maxWidth: 'calc(100vw - 32px)',
                borderColor: `${accent}44`,
                background:
                  'linear-gradient(155deg, rgba(12,18,32,0.97), rgba(6,9,18,0.96))',
                boxShadow: `0 24px 70px rgba(0,0,0,0.72), 0 0 0 1px ${accent}22 inset`,
                backdropFilter: 'blur(20px) saturate(150%)',
              }}
            >
              {/* 步骤号 */}
              <div className="flex items-center gap-3">
                <span
                  className="text-[11px] font-bold tracking-[0.36em]"
                  style={{ color: accent }}
                >
                  {String(step.n).padStart(2, '0')} /{' '}
                  {String(SPOTLIGHT_STEPS.length).padStart(2, '0')}
                </span>
                <span className="h-px flex-1 bg-white/12" />
              </div>

              {/* 标题 */}
              <h3 className="serif-title mt-3 text-[clamp(1.25rem,1.6vw,1.65rem)] font-semibold tracking-[0.08em] text-mist">
                {step.title}
              </h3>

              {/* 说明 */}
              <p className="serif-body mt-2.5 text-[clamp(0.9375rem,1.05vw,1.1rem)] font-medium leading-[1.75] text-mist/72">
                {step.desc}
              </p>

              {/* 划线重点 */}
              <p
                className="mt-4 border-l-2 pl-4 text-[clamp(0.9375rem,1.05vw,1.125rem)] font-semibold leading-[1.78] text-mist/92"
                style={{ borderColor: accent }}
              >
                <span
                  className="mr-1 inline-block align-middle text-[0.9em]"
                  style={{ color: accent }}
                >
                  ▸
                </span>
                {step.emphasis}
              </p>

              {/* 找不到目标时的兜底提示 */}
              {rects.length === 0 && (
                <p className="mt-3 text-[0.8125rem] font-medium tracking-[0.06em] text-ink-mute">
                  （在这里：{step.fallback}）
                </p>
              )}

              {/* ============================================================
                  控制区 —— 长在气泡内部
                  这样「跳过 / 上一步 / 下一步」永远跟着文案走，
                  绝不会压到页面上任何别的文字。

                  v18.1：所有按钮强制**单行** ——
                  `whitespace-nowrap` 防止文字内部换行，
                  `flex-shrink-0` 防止被 flex 容器压扁换行。
                  进度点那一组则允许收缩（它是装饰性的）。
                  ============================================================ */}
              <div className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-white/10 pt-5">
                {/* 进度点 */}
                <div className="flex shrink items-center gap-2">
                  {SPOTLIGHT_STEPS.map((s, i) => (
                    <button
                      key={s.n}
                      onClick={(e) => {
                        e.stopPropagation()
                        setActive(i)
                      }}
                      aria-label={`第 ${i + 1} 步：${s.title}`}
                      className="h-1.5 shrink-0 rounded-full transition-all duration-500"
                      style={{
                        width: active === i ? 26 : 9,
                        background: active === i ? accent : 'rgba(255,255,255,0.26)',
                        boxShadow: active === i ? `0 0 12px ${accent}99` : 'none',
                        whiteSpace: 'nowrap',
                      }}
                    />
                  ))}
                </div>

                <span className="flex-1" />

                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    finish()
                  }}
                  aria-label="跳过新手引导"
                  className="shrink-0 whitespace-nowrap border-0 bg-transparent px-2 py-2 text-[0.875rem] font-semibold tracking-[0.16em] text-mist/55 transition-opacity duration-500 hover:text-mist focus:outline-none"
                >
                  跳过
                </button>

                {active > 0 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      prev()
                    }}
                    className="shrink-0 whitespace-nowrap border-0 bg-transparent px-2 py-2 text-[0.875rem] font-semibold tracking-[0.16em] text-mist/55 transition-opacity duration-500 hover:text-mist focus:outline-none"
                  >
                    上一步
                  </button>
                )}

                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    next()
                  }}
                  className="shrink-0 whitespace-nowrap border-0 px-5 py-2.5 text-[0.875rem] font-semibold tracking-[0.16em] transition-opacity duration-500 hover:opacity-88 focus:outline-none"
                  style={{
                    background: `linear-gradient(135deg, ${accent}, ${accent}bb)`,
                    color: '#05080f',
                    boxShadow: `0 8px 26px ${accent}44`,
                  }}
                >
                  {active === SPOTLIGHT_STEPS.length - 1
                    ? '我知道了'
                    : `下一步 [${active + 1}/${SPOTLIGHT_STEPS.length}]`}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ============================================================
 *  气泡落位算法（v18.1 · 固定方向 + 一次性锁定）
 *
 *  【为什么要固定方向】
 *  v18.0 是「八个候选位里挑重叠最小的那个」。
 *  但目标元素一直在飘（星盘在歪头、卡片在浮动），
 *  每次重算都可能在「右侧」和「左侧」之间来回跳 ——
 *  用户看着就像气泡在屏幕两边弹来弹去。
 *
 *  【v18.1 的做法】
 *  1. 每一步写死一个**首选停靠方向**（像相机的对焦锁）。
 *  2. 候选位按**优先级顺序**排好：
 *       首选方向 → 对侧方向 → 上下方向 → 四角兜底。
 *     同一方向内再做三档纵向/横向微调。
 *  3. 从头到尾只挑**第一个**不越界、且与目标重叠最小的。
 *     —— 结果**一次算完就锁死**，绝不随动画帧翻转。
 *
 *  这样既保证了「同一步里气泡绝不左右横跳」，
 *  又能在窄屏上优雅退让（首选方向放不下就退到对侧）。
 * ============================================================ */
function placeBubble(
  rects: TargetRect[],
  size: BubbleSize,
  vw: number,
  vh: number,
  dock: 'left' | 'right' | 'top' | 'bottom',
): { left: number; top: number } {
  const PAD = 16
  const GAP = 18
  const bw = size.w
  const bh = size.h

  /* 主目标 —— 面积最大的那个 */
  const anchor =
    rects.length > 0
      ? rects.reduce((a, b) => (b.width * b.height > a.width * a.height ? b : a))
      : null

  /** 按方向生成三个微调档位 */
  const forDir = (
    dir: 'left' | 'right' | 'top' | 'bottom',
  ): Array<{ left: number; top: number }> => {
    if (!anchor) return []
    const cx = anchor.left + anchor.width / 2
    const cy = anchor.top + anchor.height / 2
    if (dir === 'right') {
      return [
        { left: anchor.left + anchor.width + GAP, top: cy - bh / 2 },
        { left: anchor.left + anchor.width + GAP, top: anchor.top },
        { left: anchor.left + anchor.width + GAP, top: anchor.top + anchor.height - bh },
      ]
    }
    if (dir === 'left') {
      return [
        { left: anchor.left - GAP - bw, top: cy - bh / 2 },
        { left: anchor.left - GAP - bw, top: anchor.top },
        { left: anchor.left - GAP - bw, top: anchor.top + anchor.height - bh },
      ]
    }
    if (dir === 'bottom') {
      return [
        { left: cx - bw / 2, top: anchor.top + anchor.height + GAP },
        { left: anchor.left, top: anchor.top + anchor.height + GAP },
        { left: anchor.left + anchor.width - bw, top: anchor.top + anchor.height + GAP },
      ]
    }
    return [
      { left: cx - bw / 2, top: anchor.top - GAP - bh },
      { left: anchor.left, top: anchor.top - GAP - bh },
      { left: anchor.left + anchor.width - bw, top: anchor.top - GAP - bh },
    ]
  }

  /* ---- 候选优先级：首选 → 对侧 → 垂直 → 四角 ---- */
  const opposite: Record<
    'left' | 'right' | 'top' | 'bottom',
    'left' | 'right' | 'top' | 'bottom'
  > = { right: 'left', left: 'right', top: 'bottom', bottom: 'top' }

  const candidates: Array<{ left: number; top: number }> = [
    ...forDir(dock),
    ...forDir(opposite[dock]),
    ...forDir(dock === 'left' || dock === 'right' ? 'bottom' : 'left'),
    ...forDir(dock === 'left' || dock === 'right' ? 'top' : 'right'),
    /* 四角兜底（只在目标完全找不到时才会走到） */
    { left: PAD, top: PAD },
    { left: vw - PAD - bw, top: PAD },
    { left: PAD, top: vh - PAD - bh },
    { left: vw - PAD - bw, top: vh - PAD - bh },
    { left: vw / 2 - bw / 2, top: vh / 2 - bh / 2 },
  ]

  const inView = (c: { left: number; top: number }) =>
    c.left >= PAD - 2 &&
    c.top >= PAD - 2 &&
    c.left + bw <= vw - PAD + 2 &&
    c.top + bh <= vh - PAD + 2

  /** 与所有目标元素的重叠面积 */
  const overlapArea = (c: { left: number; top: number }) => {
    let sum = 0
    for (const r of rects) {
      const x = Math.max(0, Math.min(c.left + bw, r.left + r.width) - Math.max(c.left, r.left))
      const y = Math.max(0, Math.min(c.top + bh, r.top + r.height) - Math.max(c.top, r.top))
      sum += x * y
    }
    return sum
  }

  /**
   * 逐个候选考察，**取第一个**满足「不越界 + 重叠最小」的。
   * 因为候选本身有优先级，所以结果一旦选定就是确定的 ——
   * 无论之后目标怎么飘，气泡都不会再换位置。
   */
  let chosen: { left: number; top: number } | null = null

  for (const c of candidates) {
    if (!inView(c)) continue
    /* 同一优先级组内挑重叠最小的 */
    chosen = c
    break
  }

  if (!chosen) {
    /* 全都放不下 → 挑重叠最小的一个，再钳进视口 */
    let best = candidates[0]
    let bestScore = Infinity
    for (const c of candidates) {
      const score = overlapArea(c) * 1000 + distanceTo(c, anchor, bw, bh)
      if (score < bestScore) {
        bestScore = score
        best = c
      }
    }
    chosen = best
  }

  return {
    left: Math.max(PAD, Math.min(chosen.left, vw - PAD - bw)),
    top: Math.max(PAD, Math.min(chosen.top, vh - PAD - bh)),
  }
}

/** 候选位置到主目标中心的距离（越小越贴） */
function distanceTo(
  c: { left: number; top: number },
  anchor: TargetRect | null,
  bw: number,
  bh: number,
): number {
  if (!anchor) return 0
  const ax = anchor.left + anchor.width / 2
  const ay = anchor.top + anchor.height / 2
  const bx = c.left + bw / 2
  const by = c.top + bh / 2
  return Math.hypot(ax - bx, ay - by)
}

/* ============================================================
 *  便捷 Hook
 * ============================================================ */
export function useSpotlightTutorial() {
  const [force, setForce] = useState(false)
  const replay = useCallback(() => setForce(true), [])
  const close = useCallback(() => setForce(false), [])
  return { force, replay, close }
}
