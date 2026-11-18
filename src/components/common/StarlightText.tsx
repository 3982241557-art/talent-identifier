import { useEffect, useRef, useState } from 'react'

/* ============================================================
 *  StarlightText —— 文字单向浮现状态机（v17.0）
 * ============================================================
 *
 *  【要根治的 Bug】
 *  旧版切换文案时，上一行的文字会在切换瞬间**再次闪现**。
 *
 *  根因有两层：
 *   1. **AnimatePresence 的 enter / exit 并发**
 *      framer-motion 会让 exit 与 enter 在**同一帧**开始 ——
 *      于是旧文字在淡出、新文字在淡入，两层叠在同一位置。
 *   2. **React 状态变更与 CSS Animation 生命周期冲突**
 *      key 换掉的瞬间，浏览器还没跑完旧元素的 animation，
 *      新元素的 animation 就被挂上了 —— 两者抢同一个 opacity。
 *
 *  【本组件的解法：严格单向状态锁】
 *
 *    entering ──(1.4s 淡入)──► visible ──(触发)──► exiting
 *        ▲                      │                    │
 *        │                      │                    ▼
 *        └──────────────────────┴──── unmounted ◄───┘
 *                              （onAnimationEnd 触发）
 *
 *  铁律：
 *   · 任何时刻 DOM 里**只存在一段文字**
 *   · 换文案时先走 exiting，等 `animationend` 确认 opacity 归零，
 *     **才**把 key 换掉挂载下一段
 *   · 用 CSS animation（不是 framer-motion）——
 *     因为 animationend 是确定性的浏览器事件，
 *     而 framer-motion 的 exit 完成时机依赖内部调度。
 * ============================================================ */

/** 状态机的三个阶段 */
type Phase = 'entering' | 'visible' | 'exiting'

interface StarlightTextProps {
  /** 当前要显示的文字 */
  text: string
  /** 额外的 class */
  className?: string
  /** 额外的 style */
  style?: React.CSSProperties
  /** 停留时长（毫秒）—— 传 0 表示不自动切换 */
  dwell?: number
  /** 文字切换完成的回调 */
  onSettled?: () => void
}

export function StarlightText({
  text,
  className = '',
  style,
  dwell = 0,
  onSettled,
}: StarlightTextProps) {
  /*
   * 显示中的文字与它所处的阶段是**分离**的：
   *   displayed —— 当前 DOM 里渲染的那一段
   *   phase    —— 它正在做什么
   *   pending  —— 用户已经要求切换、但还没轮到的新文字
   */
  const [displayed, setDisplayed] = useState(text)
  const [phase, setPhase] = useState<Phase>('entering')
  const pendingRef = useRef<string | null>(null)
  const timerRef = useRef<number>(0)

  /* ---------- 外部文字变化 → 请求切换 ---------- */
  useEffect(() => {
    if (text === displayed) return
    pendingRef.current = text

    /*
     * 如果当前正在淡出，说明已经在切换流程里了 —— 什么都不做，
     * 等 exiting 结束后统一处理。
     */
    if (phase === 'exiting') return

    setPhase('exiting')
  }, [text, displayed, phase])

  /* ---------- 停留计时 ---------- */
  useEffect(() => {
    if (dwell <= 0) return
    window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => {
      pendingRef.current = null
      setPhase('exiting')
    }, dwell)
    return () => window.clearTimeout(timerRef.current)
  }, [displayed, phase, dwell])

  /* ---------- 动画结束 → 推进状态机 ---------- */
  const handleAnimationEnd = () => {
    if (phase === 'exiting') {
      /*
       * 淡出完成 —— 此时旧文字的 opacity 已经归零。
       * 只有这一刻才允许挂载新文字。
       */
      const next = pendingRef.current
      pendingRef.current = null
      if (next) {
        setDisplayed(next)
        setPhase('entering')
      } else {
        setPhase('visible')
      }
      return
    }

    if (phase === 'entering') {
      setPhase('visible')
      onSettled?.()
    }
  }

  return (
    <span
      key={displayed}
      className={`${phase === 'exiting' ? 'starlight-exit' : 'starlight-enter'} ${className}`}
      style={style}
      onAnimationEnd={handleAnimationEnd}
    >
      {displayed}
    </span>
  )
}

/* ============================================================
 *  便捷 Hook —— 返回「当前应显示的文字 + 是否在切换中」
 * ============================================================ */
export function useStarlightSequence(lines: string[], intervalMs = 0) {
  const [index, setIndex] = useState(0)
  const [settled, setSettled] = useState(false)

  useEffect(() => {
    if (index >= lines.length - 1) return
    const t = window.setTimeout(() => {
      setIndex((v) => v + 1)
      setSettled(false)
    }, intervalMs)
    return () => window.clearTimeout(t)
  }, [index, lines.length, intervalMs])

  return {
    text: lines[index] ?? '',
    index,
    settled,
    setSettled,
  }
}
