import { useEffect, useRef, useState } from 'react'

interface TypewriterState {
  /** 当前正在输出的文本（用于判定是否需要重置） */
  source: string
  /** 当前 active 状态 */
  enabled: boolean
  /** 已输出的字符数 */
  index: number
  shown: string
  done: boolean
}

/**
 * 打字机效果 —— 逐字符打印
 *
 * 文本或开关变化时重置进度（渲染阶段调整 state，React 推荐做法）。
 */
export function useTypewriter(
  text: string,
  speed = 45,
  active = true,
): { shown: string; done: boolean } {
  const [state, setState] = useState<TypewriterState>({
    source: text,
    enabled: active,
    index: 0,
    shown: active ? '' : text,
    done: !active,
  })

  // 渲染阶段同步：输入变化则重置
  if (state.source !== text || state.enabled !== active) {
    setState({
      source: text,
      enabled: active,
      index: 0,
      shown: active ? '' : text,
      done: !active,
    })
  }

  const timer = useRef<number | undefined>(undefined)

  /**
   * v6.0 修复：把 `state.source` 加入依赖。
   *
   * 旧实现只依赖 [speed, active]，于是：
   *   1. 首屏用短文本渲染，间隔器跑完即 clearInterval（done=true）
   *   2. 之后 AI 返回长文本，渲染期重置把 shown 清空、done 置回 false
   *   3. 但依赖没变 → 间隔器不会重建 → 文本永远停在空字符串
   *
   * 现象就是「一句话速写」区域一片空白。
   * 加入 state.source 后，文本一变就重建间隔器，行为符合直觉。
   */
  useEffect(() => {
    if (!active) return

    timer.current = window.setInterval(() => {
      setState((prev) => {
        const next = prev.index + 1
        if (next >= prev.source.length) {
          window.clearInterval(timer.current)
          return {
            ...prev,
            index: next,
            shown: prev.source,
            done: true,
          }
        }
        return {
          ...prev,
          index: next,
          shown: prev.source.slice(0, next),
          done: false,
        }
      })
    }, speed)

    return () => window.clearInterval(timer.current)
  }, [speed, active, state.source])

  return { shown: state.shown, done: state.done }
}
