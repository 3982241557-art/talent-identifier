import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

/* ============================================================
 *  SpotlightTutorial —— 游戏化聚光灯新手指引（v17.0）
 * ============================================================
 *
 *  【形态】
 *  全屏暗夜遮罩 rgba(3,5,8,0.78)，只对当前讲解的目标做**高光挖空**
 *  （SVG mask 的真挖空，不是描边高亮），
 *  目标外围一圈流光脉冲边框，其余区域压暗 + 轻微模糊。
 *
 *  【与旧版 SpaceGuide 的区别】
 *  旧版是「四张卡片依次描边 + 提示框」，
 *  视觉上只是圈了个框，用户依然看不清被讲的东西。
 *
 *  这一版是真正的**聚光灯**：
 *  · 挖空区域亮度 100%，遮罩区域亮度 12% —— 视线被强制引导
 *  · 边框是「流光」而非静态描边（渐变描边循环扫过）
 *  · 文案用「划线重点」的方式呈现：一句话 + 斜体重音
 *
 *  【多目标挖空】
 *  一步可能涉及**多个分散的元素**（步骤 1 的星盘 + 顶部日月升，
 *  步骤 2 的左 MBTI + 右天赋）。
 *  所以遮罩支持**多个独立挖空**，而不是一个大包围盒 ——
 *  大包围盒会把中间无关的内容也点亮，视线反而被稀释。
 * ============================================================ */

/** 引导步骤定义 */
export interface SpotlightStep {
  /** 步骤序号（1 起） */
  n: number
  /** 标题 */
  title: string
  /** 一句话说明：这个板块是干嘛的 */
  desc: string
  /** 划线重点 —— 斜体重音部分 */
  emphasis: string
  /** 目标选择器（CSS）—— 支持多个，用逗号分隔 */
  selector: string
  /** 目标说明（定位失败时的兜底文案） */
  fallback: string
}

/** 六步引导文案 */
export const SPOTLIGHT_STEPS: SpotlightStep[] = [
  {
    n: 1,
    title: '你的本命星盘',
    desc: '告诉你出生那一刻，天上的星星都在哪。',
    emphasis:
      '太阳是你的外在状态，月亮是你藏在心里的情绪需求，上升是别人第一眼看你的样子',
    selector: '[data-spot="astrolabe"], [data-spot="bigthree"]',
    fallback: '中央的星盘与右上角的太阳 / 月亮 / 上升',
  },
  {
    n: 2,
    title: '性格 + 天赋',
    desc: '先认清自己。把星盘和性格测试结合起来看。',
    emphasis: '直接看你老天爷赏饭吃的看家本事是什么',
    selector: '[data-spot="mbti"], [data-spot="talent"]',
    fallback: '左侧的「MBTI 解码」与右侧的「天赋解析」',
  },
  {
    n: 3,
    title: '极简版 / 深度版',
    desc: '赶时间还是想深聊，你自己选。',
    emphasis:
      '点「极简版」3 秒看懂核心结论；点「深度版」把你的性格来龙去脉聊透',
    selector: '[data-version-toggle]',
    fallback: '面板里的「⚡️ 极简直给版 | 🔭 深度剖析版」切换键',
  },
  {
    n: 4,
    title: '优势挖掘实践',
    desc: '看懂了天赋怎么用？在这里把它变成行动。',
    emphasis:
      '在这里点亮你的优势飞轮，划掉不擅长的事，让 AI 帮你算出最适合干什么职位和副业',
    selector: '[data-spot="advantage-float"], [data-spot="advantage-panel"]',
    fallback: '右侧的「优势挖掘实践」板块',
  },
  {
    n: 5,
    title: '今日运势 & 每日灵感',
    desc: '每天来瞄一眼，给今天找个抓手。',
    emphasis: '只看今天这一天该注意什么具体小事，纠结时抽张牌找找灵感',
    selector: '[data-spot="fortune"], [data-spot="tip"]',
    fallback: '右侧的「今日运势」与「每日灵感抽牌」',
  },
  {
    n: 6,
    title: '出生那天的星空',
    desc: '累了或者烦了，就回来看一眼。',
    emphasis:
      '随时回看哈勃在你生日那天拍下的真实宇宙，把心里的烦恼写下来丢进星空里',
    selector: '[data-spot="birthsky"]',
    fallback: '顶部的「🔭 出生那天的星空 / 丢掉烦恼」小标',
  },
]

/** 本地存储键 */
const SEEN_KEY = 'talent-identifier:spotlight-seen-v17'

interface SpotlightTutorialProps {
  /** 强制展示（右上角「新手引导」按钮触发） */
  force?: boolean
  /** 关闭回调 */
  onDone?: () => void
  /** 主题强调色 */
  accent: string
}

/** 目标矩形 */
interface TargetRect {
  top: number
  left: number
  width: number
  height: number
}

export function SpotlightTutorial({
  force = false,
  onDone,
  accent,
}: SpotlightTutorialProps) {
  const [active, setActive] = useState<number | null>(null)
  /** 当前步骤命中的**所有**目标矩形 */
  const [rects, setRects] = useState<TargetRect[]>([])

  const step = active !== null ? SPOTLIGHT_STEPS[active] : null

  /* ---------- 首次进入自动触发 ---------- */
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
    const t = window.setTimeout(() => setActive(0), 1400)
    return () => window.clearTimeout(t)
  }, [force])

  /* ============================================================
   *  测量目标位置
   *
   *  一步可能命中多个元素，**每个元素单独挖一个洞**，
   *  而不是合并成一个大包围盒。
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
    /* 卡片在浮动 + 星盘在缓慢自转 —— 定期重测 */
    const timer = window.setInterval(measure, 500)
    return () => {
      window.removeEventListener('resize', measure)
      window.clearInterval(timer)
    }
  }, [active, step])

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

  /* ---------- 下一步 ---------- */
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
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1440
  const vh = typeof window !== 'undefined' ? window.innerHeight : 900

  /** 每个目标的圆角矩形路径 */
  const cutoutPaths = useMemo(
    () =>
      rects.map((rect) => {
        const pad = 12
        const x = rect.left - pad
        const y = rect.top - pad
        const w = rect.width + pad * 2
        const h = rect.height + pad * 2
        const r = 16
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
   * 文案卡的位置参考。
   *
   * 优先用**最大的那个目标**做锚点 ——
   * 多目标步骤里，最重要的那个（星盘 / 天赋卡）才是视觉主体。
   */
  const primary = useMemo(() => {
    if (rects.length === 0) return null
    return rects.reduce((a, b) => (b.width * b.height > a.width * a.height ? b : a))
  }, [rects])

  if (active === null) return null

  return (
    <div className="fixed inset-0 z-[300]">
      {/* ============================================================
          遮罩层：SVG mask 真挖空
          —— 挖出来的区域**完全透明**，
             所以被讲解的东西能被完整看清，
             而不是「被压暗后加个框」。
          ============================================================ */}
      <svg
        className="absolute inset-0 h-full w-full"
        style={{ pointerEvents: 'none' }}
      >
        <defs>
          <mask id={maskId}>
            {/* 遮罩默认全黑 = 全不透明 */}
            <rect x="0" y="0" width={vw} height={vh} fill="black" />
            {/* 挖空区 = 白色 = 全透明（每个目标一个洞） */}
            {cutoutPaths.map((d, i) => (
              <path key={i} d={d} fill="white" />
            ))}
          </mask>
        </defs>

        {/* 压暗 + 轻微模糊的整屏层 */}
        <rect
          x="0"
          y="0"
          width={vw}
          height={vh}
          fill="rgba(3, 5, 8, 0.78)"
          mask={`url(#${maskId})`}
          style={{ backdropFilter: 'blur(1.5px)' }}
        />
      </svg>

      {/* 遮罩层本身要能接收点击（关闭） */}
      <div
        className="absolute inset-0"
        onClick={finish}
        style={{ pointerEvents: 'auto' }}
      />

      {/* ============================================================
          聚光灯边框 —— 每个目标一圈流光脉冲
          ============================================================ */}
      {rects.map((rect, i) => (
        <motion.div
          key={`ring-${step?.n}-${i}`}
          initial={{ opacity: 0, scale: 1.04 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.98 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="pointer-events-none absolute"
          style={{
            top: rect.top - 12,
            left: rect.left - 12,
            width: rect.width + 24,
            height: rect.height + 24,
            borderRadius: 16,
            boxShadow: `0 0 0 1.5px ${accent}bb, 0 0 34px ${accent}55, inset 0 0 26px ${accent}18`,
            animation: 'spotlight-pulse 2.4s ease-in-out infinite',
          }}
        />
      ))}

      {/* ============================================================
          文案卡 —— 贴在主目标旁
          ============================================================ */}
      <AnimatePresence mode="wait">
        {step && (
          <motion.div
            key={step.n}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            className="absolute z-[301]"
            style={cardPosition(primary, vw, vh)}
          >
            <div
              className="max-w-[420px] rounded-[20px] border px-7 py-6"
              style={{
                borderColor: `${accent}44`,
                background:
                  'linear-gradient(155deg, rgba(12,18,32,0.96), rgba(6,9,18,0.94))',
                boxShadow: `0 24px 70px rgba(0,0,0,0.7), 0 0 0 1px ${accent}22 inset`,
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
                  （目标位置：{step.fallback}）
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ============================================================
          底部控制条
          ============================================================ */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.25 }}
        className="absolute inset-x-0 bottom-0 z-[302] flex flex-col items-center gap-5 pb-8"
      >
        {/* 进度点 */}
        <div className="flex items-center gap-2.5">
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
                width: active === i ? 32 : 11,
                background: active === i ? accent : 'rgba(255,255,255,0.26)',
                boxShadow: active === i ? `0 0 12px ${accent}99` : 'none',
              }}
            />
          ))}
        </div>

        {/* 按钮组 */}
        <div className="flex items-center gap-3">
          <button
            onClick={(e) => {
              e.stopPropagation()
              finish()
            }}
            aria-label="跳过新手引导"
            className="rounded-full border-0 bg-transparent px-6 py-2.5 text-[0.9375rem] font-semibold tracking-[0.2em] text-mist/55 transition-opacity duration-500 hover:text-mist focus:outline-none"
          >
            跳过
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation()
              prev()
            }}
            disabled={active === 0}
            className="rounded-full border-0 bg-transparent px-6 py-2.5 text-[0.9375rem] font-semibold tracking-[0.2em] text-mist/55 transition-opacity duration-500 disabled:opacity-25"
          >
            上一步
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation()
              next()
            }}
            className="rounded-full border-0 px-8 py-3 text-[0.9375rem] font-semibold tracking-[0.22em] transition-opacity duration-500 hover:opacity-88"
            style={{
              background: `linear-gradient(135deg, ${accent}, ${accent}bb)`,
              color: '#05080f',
              boxShadow: `0 10px 34px ${accent}44`,
            }}
          >
            {active === SPOTLIGHT_STEPS.length - 1
              ? '我知道了'
              : `下一步 [${active! + 1}/${SPOTLIGHT_STEPS.length}]`}
          </button>
        </div>
      </motion.div>
    </div>
  )
}

/* ============================================================
 *  文案卡定位
 *
 *  优先贴在主目标**下方**（下方空间够）；
 *  下��不够就放上方；左右则夹在视口内。
 * ============================================================ */
function cardPosition(
  rect: TargetRect | null,
  vw: number,
  vh: number,
): React.CSSProperties {
  if (!rect) {
    /* 找不到目标 → 居中显示，保证文案一定看得见 */
    return {
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
    }
  }

  const CARD_W = 420
  const GAP = 20

  const belowSpace = vh - (rect.top + rect.height)
  const aboveSpace = rect.top
  const putBelow = belowSpace > 280 || aboveSpace < 240

  let top = putBelow
    ? rect.top + rect.height + GAP
    : rect.top - 230 - GAP

  top = Math.max(20, Math.min(top, vh - 250))

  let left = rect.left + rect.width / 2 - CARD_W / 2
  left = Math.max(20, Math.min(left, vw - CARD_W - 20))

  return { top, left, width: CARD_W }
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
