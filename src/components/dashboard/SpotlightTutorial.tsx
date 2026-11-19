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
  },
  {
    n: 2,
    title: '右上角三个小方块',
    desc: '你最常被问到的三个问题，答案就在这儿。',
    emphasis:
      '太阳是你给别人看的那一面，月亮是你自己心里想要什么，上升是别人第一眼看你是什么印象',
    selector: '[data-spot="bigthree"]',
    fallback: '右上角的太阳 / 月亮 / 上升',
  },
  {
    n: 3,
    title: '顶栏的星空入口',
    desc: '随时能回看出生那天的宇宙，也能把烦心事扔进去。',
    emphasis:
      '点开是哈勃在你生日那天拍下的真宇宙；看完可以把心里的负担写下来丢进星空',
    selector: '[data-spot="birthsky"]',
    fallback: '右上角「出生那天的星空 / 丢掉烦恼」',
  },
  {
    n: 4,
    title: '左边：MBTI 解码',
    desc: '你是什么性格类型，以及它怎么影响你做事。',
    emphasis:
      '比如你总习惯把话憋着、心里先想三遍才开口 —— 这就是它给你的解释',
    selector: '[data-spot="mbti"]',
    fallback: '左上的「MBTI 解码」卡片',
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
  },
  {
    n: 6,
    title: '右边：天赋解析',
    desc: '你身上真正拿得出手的本事，拆成四块给你看。',
    emphasis:
      '每块都写了「适合做什么」，还有一句可以马上练的小动作',
    selector: '[data-spot="talent"]',
    fallback: '右上的「天赋解析」卡片',
  },
  {
    n: 7,
    title: '左下：优势挖掘实践',
    desc: '看完天赋，接着把它变成能做的事。',
    emphasis:
      '填满五个格子你就知道自己优势长什么样，再把不擅长的划掉，剩下的就是方向',
    selector: '[data-spot="advantage"]',
    fallback: '左下的「优势挖掘实践」卡片',
  },
  {
    n: 8,
    title: '今天能用的两块',
    desc: '每天瞄一眼，看看今天该注意哪件小事。',
    emphasis:
      '运势只讲今天这二十四小时；纠结的时候抽一张牌，跟自己聊两句',
    selector: '[data-spot="fortune"], [data-spot="tip"]',
    fallback: '右侧的「今日运势」与「每日灵感抽牌」',
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
  const [bubbleSize, setBubbleSize] = useState<BubbleSize>({ w: 380, h: 300 })
  /** 气泡落位 */
  const [bubblePos, setBubblePos] = useState({ left: 24, top: 24 })

  const bubbleRef = useRef<HTMLDivElement>(null)

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
   *  测量目标位置
   *
   *  目标元素可能一直在动（卡片在浮动、星盘在轻微歪头），
   *  所以除了初次测量，还要定期重测。
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
    window.addEventListener('resize', measure)
    const timer = window.setInterval(measure, 500)
    return () => {
      window.removeEventListener('resize', measure)
      window.clearInterval(timer)
    }
  }, [active, step])

  /* ============================================================
   *  测量气泡尺寸
   * ============================================================ */
  useLayoutEffect(() => {
    if (active === null) return
    const el = bubbleRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    if (r.width > 0 && r.height > 0) {
      setBubbleSize({ w: r.width, h: r.height })
    }
  }, [active, step])

  /* ============================================================
   *  计算气泡落位 —— 避开所有目标元素
   * ============================================================ */
  useLayoutEffect(() => {
    if (active === null) return
    const vw = window.innerWidth
    const vh = window.innerHeight
    setBubblePos(placeBubble(rects, bubbleSize, vw, vh))
  }, [active, rects, bubbleSize])

  /* ---------- 关闭 ---------- */
  const finish = useCallback(() => {
    setActive(null)
    setRects([])
    try {
      localStorage.setItem(SEEN_KEY, '1')
    } catch {
      /* 隐私模式：忽略 */
    }
    onDone?.()
  }, [onDone])

  /* ---------- 下一步（一步一进） ---------- */
  const next = useCallback(() => {
    setActive((v) => {
      if (v === null) return v
      if (v >= SPOTLIGHT_STEPS.length - 1) {
        finish()
        return null
      }
      return v + 1
    })
  }, [finish])

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

  if (active === null) return null

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

      {/* ---------- 压暗层（挖洞） ---------- */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: 'rgba(3, 5, 8, 0.74)',
          WebkitMask: `url(#${cssMaskId})`,
          mask: `url(#${cssMaskId})`,
        }}
      />

      {/* ---------- 轻微模糊层（挖洞） ----------
          洞里的元素保持锐利，洞外的一切轻轻虚化 ——
          视线自然被吸到正在讲的那一处。 */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backdropFilter: 'blur(2.5px)',
          WebkitBackdropFilter: 'blur(2.5px)',
          WebkitMask: `url(#${cssMaskId})`,
          mask: `url(#${cssMaskId})`,
        }}
      />

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

      {/* 遮罩层本身要能接收点击（关闭） */}
      {clickCatcherPath && (
        <svg
          className="absolute inset-0 h-full w-full"
          style={{ pointerEvents: 'auto' }}
          onClick={finish}
        >
          <path d={clickCatcherPath} fillRule="evenodd" fill="transparent" />
        </svg>
      )}

      {/* ============================================================
          气泡 —— 紧贴目标，自动避让，按钮长在里面
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
              width: bubbleSize.w,
              pointerEvents: 'auto',
            }}
          >
            <div
              className="rounded-[20px] border px-7 py-6"
              style={{
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
                  ============================================================ */}
              <div className="mt-6 flex items-center gap-3 border-t border-white/10 pt-5">
                {/* 进度点 */}
                <div className="flex items-center gap-2">
                  {SPOTLIGHT_STEPS.map((s, i) => (
                    <button
                      key={s.n}
                      onClick={(e) => {
                        e.stopPropagation()
                        setActive(i)
                      }}
                      aria-label={`第 ${i + 1} 步：${s.title}`}
                      className="h-1.5 rounded-full transition-all duration-500"
                      style={{
                        width: active === i ? 26 : 9,
                        background: active === i ? accent : 'rgba(255,255,255,0.26)',
                        boxShadow: active === i ? `0 0 12px ${accent}99` : 'none',
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
                  className="border-0 bg-transparent px-2 py-2 text-[0.875rem] font-semibold tracking-[0.16em] text-mist/55 transition-opacity duration-500 hover:text-mist focus:outline-none"
                >
                  跳过
                </button>

                {active > 0 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      prev()
                    }}
                    className="border-0 bg-transparent px-2 py-2 text-[0.875rem] font-semibold tracking-[0.16em] text-mist/55 transition-opacity duration-500 hover:text-mist focus:outline-none"
                  >
                    上一步
                  </button>
                )}

                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    next()
                  }}
                  className="border-0 px-5 py-2.5 text-[0.875rem] font-semibold tracking-[0.16em] transition-opacity duration-500 hover:opacity-88 focus:outline-none"
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
 *  气泡落位算法
 *
 *  目标：从 8 个候选位置里挑一个「与所有目标元素重叠面积最小」的。
 *  这样气泡永远紧贴目标，又绝不会盖住它，更不会盖住
 *  目标附近的任何文字（按钮都在气泡里）。
 * ============================================================ */
function placeBubble(
  rects: TargetRect[],
  size: BubbleSize,
  vw: number,
  vh: number,
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

  const candidates: Array<{ left: number; top: number }> = []

  if (anchor) {
    const cx = anchor.left + anchor.width / 2
    const cy = anchor.top + anchor.height / 2
    candidates.push(
      /* 右侧 */
      { left: anchor.left + anchor.width + GAP, top: anchor.top },
      /* 左侧 */
      { left: anchor.left - GAP - bw, top: anchor.top },
      /* 下方 */
      { left: cx - bw / 2, top: anchor.top + anchor.height + GAP },
      /* 上方 */
      { left: cx - bw / 2, top: anchor.top - GAP - bh },
      /* 右中 */
      { left: anchor.left + anchor.width + GAP, top: cy - bh / 2 },
      /* 左中 */
      { left: anchor.left - GAP - bw, top: cy - bh / 2 },
      /* 右下 */
      { left: anchor.left + anchor.width + GAP, top: anchor.top + anchor.height - bh },
      /* 左下 */
      { left: anchor.left - GAP - bw, top: anchor.top + anchor.height - bh },
    )
  }

  /* 四角兜底 */
  candidates.push(
    { left: PAD, top: PAD },
    { left: vw - PAD - bw, top: PAD },
    { left: PAD, top: vh - PAD - bh },
    { left: vw - PAD - bw, top: vh - PAD - bh },
    { left: vw / 2 - bw / 2, top: vh / 2 - bh / 2 },
  )

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

  /** 到主目标的距离（越小越贴） */
  const distance = (c: { left: number; top: number }) => {
    if (!anchor) return 0
    const ax = anchor.left + anchor.width / 2
    const ay = anchor.top + anchor.height / 2
    const bx = c.left + bw / 2
    const by = c.top + bh / 2
    return Math.hypot(ax - bx, ay - by)
  }

  const visible = candidates.filter(inView)
  const pool = visible.length > 0 ? visible : candidates

  let best = pool[0]
  let bestScore = Infinity
  for (const c of pool) {
    /* 重叠面积权重最高，其次才看距离 */
    const score = overlapArea(c) * 1000 + distance(c)
    if (score < bestScore) {
      bestScore = score
      best = c
    }
  }

  return {
    left: Math.max(PAD, Math.min(best.left, vw - PAD - bw)),
    top: Math.max(PAD, Math.min(best.top, vh - PAD - bh)),
  }
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
