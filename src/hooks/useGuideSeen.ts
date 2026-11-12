import { useCallback, useState } from 'react'

const STORAGE_KEY = 'life-script:guide-seen'

/**
 * 全局游戏向导：记录用户是否已看过某板块的新手引导
 */
export function useGuideSeen() {
  const [seen, setSeen] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      return raw ? (JSON.parse(raw) as Record<string, boolean>) : {}
    } catch {
      return {}
    }
  })

  const markSeen = useCallback((id: string) => {
    setSeen((prev) => {
      if (prev[id]) return prev
      const next = { ...prev, [id]: true }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      } catch {
        /* 忽略隐私模式写入失败 */
      }
      return next
    })
  }, [])

  const reset = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      /* noop */
    }
    setSeen({})
  }, [])

  return { seen, markSeen, reset }
}
