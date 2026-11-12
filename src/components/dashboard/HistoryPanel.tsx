import { useState } from 'react'
import { motion } from 'framer-motion'
import type { DayRecord } from '../../types'
import { ELEMENT_THEMES } from '../../data/elementThemes'
import type { Element } from '../../types'

/* ============================================================
 *  往日运势 —— 历史记录列表 + 当日聊天复盘
 * ============================================================ */

interface HistoryPanelProps {
  days: DayRecord[]
  element: Element
}

export function HistoryPanel({ days, element }: HistoryPanelProps) {
  const theme = ELEMENT_THEMES[element]
  const [openDate, setOpenDate] = useState<string | null>(
    days.length ? days[days.length - 1].date : null,
  )

  if (days.length === 0) {
    return (
      <p className="serif-body pt-4 text-[24px] font-medium leading-[1.62] text-mist/60">
        还没有往日的记录。
        <br />
        每当你与智者说过一句话、当日运势被记录一次，这里就会留下一格 ——
        供你在未来回头看。
      </p>
    )
  }

  return (
    <div className="pt-4">
      <ul className="space-y-3">
        {[...days].reverse().map((d) => {
          const open = openDate === d.date
          return (
            <li key={d.date}>
              <button
                onClick={() => setOpenDate(open ? null : d.date)}
                className="flex w-full items-center justify-between border-0 bg-transparent py-2 text-left focus:outline-none"
              >
                <span
                  className="text-[22.5px] font-semibold tracking-[0.2em]"
                  style={{ color: open ? theme.primary : 'rgba(240,244,252,0.72)' }}
                >
                  {d.date}
                </span>
                <span className="text-[19.5px] font-medium tracking-[0.16em] text-mist/50">
                  {d.turns.length > 0 ? `${d.turns.length} 条对话` : '运势存档'}
                  {open ? ' ▲' : ' ▼'}
                </span>
              </button>

              {open && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="overflow-hidden"
                >
                  <div className="mt-2 border-l-2 border-white/12 pl-4 pb-3">
                    {d.title && (
                      <p className="text-[24px] font-semibold tracking-[0.08em] text-mist/85">
                        {d.title}
                      </p>
                    )}
                    {d.body && (
                      <p className="serif-body mt-2 text-[22.5px] font-medium leading-[1.58] text-mist/60">
                        {d.body}
                      </p>
                    )}
                    {d.turns.length > 0 && (
                      <div className="mt-4 space-y-3">
                        {d.turns.map((t, i) => (
                          <p
                            key={i}
                            className="serif-body text-[21.8px] font-medium leading-[1.58]"
                            style={{
                              color:
                                t.role === 'user'
                                  ? 'rgba(240,244,252,0.60)'
                                  : 'rgba(240,244,252,0.85)',
                            }}
                          >
                            {t.role === 'user' ? '你：' : '苏格拉底：'}
                            {t.content}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
