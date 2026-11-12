import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

/* ============================================================
 *  3D 空间新手视觉指引（v11.0 · 任务 5）
 *
 * ============================================================
 *  为什么需要它
 * ============================================================
 *  主页是一个**纯 3D 空间**：星盘在正中央，五张功能卡片悬浮在四周，
 *  没有传统的导航栏、没有菜单。
 *
 *  对熟悉 3D 界面的人，这很酷。
 *  对第一次打开的人，这是灾难 ——
 *  「那些飘着的小方块是干什么的？我该点哪个？」
 *
 *  于是用户会随便乱点，或者干脆关掉。
 *
 * ============================================================
 *  v11.0 的做法
 * ============================================================
 *  1. **遮罩层** —— 半透明黑色覆盖全屏，其余内容压暗。
 *  2. **逐个高亮** —— 依次点亮四张功能卡片（运势 / 天赋 / MBTI / 抽牌），
 *     其余保持压暗。
 *  3. **连线 + Tooltip** —— 从高亮卡片拉一条细线到提示框，
 *     提示框里只写一句话：这个板块是干嘛的。
 *  4. **点击任意处关闭** —— 或者点「我知道了」。
 *
 *  【技术要点】
 *  卡片是 3D 变换的（translateZ / rotateZ），用 getBoundingClientRect
 *  量出来的是**投影后的屏幕矩形** —— 正好就是高亮框该在的位置。
 * ============================================================ */

/** 引导步骤 —— 顺序刻意从「最核心」开始 */
export interface GuideStep {
  /** 对应卡片的 data-guide-id */
  id: string
  /** 卡片标题 */
  title: string
  /** 一句话说明：这个板块是干嘛的 */
  desc: string
}

/** 四步引导文案 —— 每个都极简，一句话说清 */
export const GUIDE_STEPS: GuideStep[] = [
  {
    id: 'fortune',
    title: '运势',
    desc: '看今天、这个月、这一年，哪块该动、哪块该等。',
  },
  {
    id: 'talent',
    title: '天赋',
    desc: '你在哪四个方向上有天赋，以及下一步练什么。',
  },
  {
    id: 'mbti',
    title: 'MBTI',
    desc: '你的性格底色 —— 四个字母分别代表什么。',
  },
  {
    id: 'tip',
    title: '抽牌',
    desc: '每天一张牌，只给一件今天能做的小事。',
  },
]

/** 本地存储键 */
const SEEN_KEY = 'life-script:space-guide-seen'

interface SpaceGuideProps {
  /** 是否强制展示（用于「重新看一遍」） */
  force?: boolean
  /** 关闭回调 */
  onDone?: () => void
  /** 主题强调色 */
  accent: string
}

export function SpaceGuide({ force = false, onDone, accent }: SpaceGuideProps) {
  const [active, setActive] = useState<number | null>(null)
  /** 高亮框的屏幕坐标 */
  const [rect, setRect] = useState<{
    top: number
    left: number
    width: number
    height: number
  } | null>(null)
  const [seen, setSeen] = useState<boolean>(() => {
    if (force) return false
    try {
      return localStorage.getItem(SEEN_KEY) === '1'
    } catch {
      return false
    }
  })

  /** 当前步骤 */
  const step = active !== null ? GUIDE_STEPS[active] : null

  /* ---------- 首次进入：开始引导 ---------- */
  useEffect(() => {
    if (seen) return
    const t = window.setTimeout(() => setActive(0), 900)
    return () => window.clearTimeout(t)
  }, [seen])

  /* ---------- 测量高亮目标的位置 ---------- */
  useLayoutEffect(() => {
    /* active 为 null 时组件本身已 return null，无需清空 rect */
    if (active === null || !step) return
    const measure = () => {
      const el = document.querySelector<HTMLElement>(
        `[data-guide-id="${step.id}"]`,
      )
      if (!el) {
        setRect(null)
        return
      }
      const r = el.getBoundingClientRect()
      setRect({
        top: r.top,
        left: r.left,
        width: r.width,
        height: r.height,
      })
    }
    measure()
    /* 3D 卡片会随鼠标轻微浮动 —— 监听窗口变化重新测量 */
    window.addEventListener('resize', measure)
    const timer = window.setInterval(measure, 400)
    return () => {
      window.removeEventListener('resize', measure)
      window.clearInterval(timer)
    }
  }, [active, step])

  /* ---------- 关闭 ---------- */
  const finish = useCallback(() => {
    setActive(null)
    setSeen(true)
    try {
      localStorage.setItem(SEEN_KEY, '1')
    } catch {
      /* 隐私模式：忽略 */
    }
    onDone?.()
  }, [onDone])

  /* ---------- 键盘：Esc / 空格 / 方向键 ---------- */
  useEffect(() => {
    if (active === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        finish()
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault()
        setActive((v) => (v === null ? v : Math.min(v + 1, GUIDE_STEPS.length - 1)))
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault()
        setActive((v) => (v === null ? v : Math.max(v - 1, 0)))
      } else if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        if (active === GUIDE_STEPS.length - 1) finish()
        else setActive((v) => (v === null ? v : v + 1))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, finish])

  /* ---------- Tooltip 位置 ----------
   *
   * 默认放在高亮框的**上方**；如果上方空间不够（卡片靠屏幕顶部），
   * 就翻到下方。左右方向则夹在视口内。
   */
  const tooltip = useMemo(() => {
    if (!rect) return null
    const vw = window.innerWidth
    const TW = 300
    const above = rect.top > 190
    const top = above ? rect.top - 118 : rect.top + rect.height + 118
    let left = rect.left + rect.width / 2 - TW / 2
    left = Math.max(20, Math.min(left, vw - TW - 20))
    return { top, left, width: TW, above }
  }, [rect])

  if (seen || active === null) return null

  return (
    <div className="fixed inset-0 z-[200]">
      {/* ---------- 遮罩 ---------- */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.6 }}
        className="absolute inset-0 bg-black/72 backdrop-blur-[2px]"
        onClick={finish}
      />

      {/* ---------- 高亮框（挖洞 + 发光描边） ---------- */}
      <AnimatePresence>
        {rect && (
          <motion.div
            key={`ring-${step?.id}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.45 }}
            className="pointer-events-none absolute"
            style={{
              top: rect.top - 6,
              left: rect.left - 6,
              width: rect.width + 12,
              height: rect.height + 12,
              boxShadow: `0 0 0 2px ${accent}, 0 0 34px ${accent}66`,
              borderRadius: '4px',
            }}
          >
            {/* 四角标记 */}
            {(
              [
                'left-0 top-0 border-l-2 border-t-2',
                'right-0 top-0 border-r-2 border-t-2',
                'left-0 bottom-0 border-l-2 border-b-2',
                'right-0 bottom-0 border-r-2 border-b-2',
              ] as const
            ).map((cls, i) => (
              <span
                key={i}
                className={`absolute h-4 w-4 ${cls}`}
                style={{ borderColor: accent }}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---------- 连线 + Tooltip ---------- */}
      <AnimatePresence>
        {rect && tooltip && step && (
          <motion.div
            key={`tip-${step.id}`}
            initial={{ opacity: 0, y: tooltip.above ? 12 : -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="pointer-events-none absolute"
            style={{
              top: tooltip.top,
              left: tooltip.left,
              width: tooltip.width,
            }}
          >
            {/* 连线 */}
            <svg
              className="pointer-events-none absolute"
              style={{
                left: '50%',
                transform: 'translateX(-50%)',
                top: tooltip.above ? '100%' : 'auto',
                bottom: tooltip.above ? 'auto' : '100%',
                width: 1,
                height: 40,
                overflow: 'visible',
              }}
            >
              <line
                x1="0.5"
                y1="0"
                x2="0.5"
                y2="40"
                stroke={accent}
                strokeWidth="1"
                strokeDasharray="3 4"
                opacity="0.7"
              />
              <circle cx="0.5" cy="40" r="2.5" fill={accent} />
            </svg>

            {/* 提示框 */}
            <div
              className="border border-white/15 bg-[#0d1428]/94 px-6 py-5 backdrop-blur-md"
              style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}
            >
              <div className="flex items-center gap-3">
                <span
                  className="text-[11px] font-bold tracking-[0.34em]"
                  style={{ color: accent }}
                >
                  {String(active + 1).padStart(2, '0')} /{' '}
                  {String(GUIDE_STEPS.length).padStart(2, '0')}
                </span>
                <span className="h-px flex-1 bg-white/12" />
                <span className="serif-title text-[19px] font-semibold tracking-[0.1em] text-mist">
                  {step.title}
                </span>
              </div>
              <p className="serif-body mt-3 text-[19px] font-medium leading-[1.68] text-mist/85">
                {step.desc}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---------- 底部：进度点 + 我知道了 ---------- */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.3 }}
        className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-5 pb-8"
      >
        <div className="flex items-center gap-3">
          {GUIDE_STEPS.map((s, i) => (
            <button
              key={s.id}
              onClick={(e) => {
                e.stopPropagation()
                setActive(i)
              }}
              aria-label={`第 ${i + 1} 步：${s.title}`}
              className="h-1.5 rounded-full transition-all duration-500"
              style={{
                width: active === i ? 34 : 12,
                background: active === i ? accent : 'rgba(255,255,255,0.28)',
              }}
            />
          ))}
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation()
            finish()
          }}
          className="border-0 px-7 py-2.5 text-[15px] font-semibold tracking-[0.28em] text-paper transition-opacity duration-500 hover:opacity-85 focus:outline-none"
          style={{ background: accent }}
        >
          我知道了
        </button>
      </motion.div>
    </div>
  )
}

/* ============================================================
 *  便捷 Hook —— 让上层决定要不要显示
 * ============================================================ */
export function useSpaceGuide() {
  const [force, setForce] = useState(false)

  /** 重看一遍 */
  const replay = useCallback(() => setForce(true), [])
  const close = useCallback(() => setForce(false), [])

  return { force, replay, close }
}
