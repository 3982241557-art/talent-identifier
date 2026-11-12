import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import type { Chart, ChatTurn, MbtiProfile } from '../../types'
import { postChat } from '../../lib/api'

/* ============================================================
 *  苏格拉底问答 —— 带长记忆的对话
 *  历史记录由上层负责持久化（localStorage）
 * ============================================================ */

interface ChatDockProps {
  chart: Chart
  mbti: MbtiProfile | null
  /** 历史（不含本次新消息） */
  history: ChatTurn[]
  /** 发送新消息，父组件负责写入历史 */
  onSend: (turn: ChatTurn) => void
  /** 当日运势，作为 AI 的长期记忆素材 */
  fortune?: { title: string; body: string } | null
  /** AI 不可用时的本地应答 */
  fallback: (message: string) => string
}

export function ChatDock({
  chart,
  mbti,
  history,
  onSend,
  fortune,
  fallback,
}: ChatDockProps) {
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [history.length])

  const send = useCallback(async () => {
    const text = input.trim()
    if (!text || busy) return
    setInput('')
    setBusy(true)

    const userTurn: ChatTurn = { role: 'user', content: text, ts: Date.now() }
    onSend(userTurn)

    try {
      const res = await postChat({
        message: text,
        chart,
        mbti,
        history: history
          .concat(userTurn)
          .map((h) => ({ role: h.role, content: h.content })),
        fortune,
      })
      onSend({
        role: 'assistant',
        content: res.reply || fallback(text),
        ts: Date.now(),
      })
    } catch {
      onSend({
        role: 'assistant',
        content: fallback(text),
        ts: Date.now(),
      })
    } finally {
      setBusy(false)
    }
  }, [input, busy, onSend, chart, mbti, history, fortune, fallback])

  return (
    <div className="flex h-full flex-col">
      {/* 消息区 */}
      <div
        ref={scrollRef}
        className="thin-scroll max-h-[420px] min-h-[180px] flex-1 space-y-6 overflow-y-auto pr-2"
      >
        {history.length === 0 && (
          <div className="pt-2">
            <p className="serif-body text-[24.8px] font-medium leading-[1.62] text-mist/70">
              我在这儿。你可以问我是谁，可以问网页怎么用，
              也可以只是说说今天的心情 —— 我会听。
            </p>
            <p className="serif-body mt-4 text-[24.8px] font-medium leading-[1.62] text-mist/70">
              无论是星盘的困惑，还是今天晚餐该吃什么，
              任何微小的问题都可以问我。
            </p>
          </div>
        )}

        {history.map((t, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
            className={t.role === 'user' ? 'text-right' : 'text-left'}
          >
            {t.role === 'user' ? (
              <span className="inline-block max-w-[82%] border border-white/14 px-4 py-2 text-[23.3px] font-medium leading-[1.55] text-mist/90">
                {t.content}
              </span>
            ) : (
              <div className="border-l-2 border-white/16 pl-5">
                <p className="serif-body text-[24.8px] font-medium leading-[1.62] text-mist/85">
                  {t.content}
                </p>
              </div>
            )}
          </motion.div>
        ))}

        {busy && (
          <p className="serif-body text-[24px] font-medium text-mist/50">
            智者正在斟酌…
          </p>
        )}
      </div>

      {/* 输入区 */}
      <div className="mt-6 flex items-end gap-4 border-t border-white/10 pt-5">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void send()
            }
          }}
          rows={2}
          placeholder="无论是星盘的困惑，还是今天晚餐该吃什么，任何微小的问题都可以问我。"
          className="thin-scroll flex-1 resize-none border-0 bg-transparent text-[24px] font-medium leading-[1.55] text-mist/90 outline-none placeholder:text-mist/35"
        />
        <button
          onClick={() => void send()}
          disabled={!input.trim() || busy}
          className="shrink-0 border-0 bg-transparent pb-1 text-[21px] font-semibold tracking-[0.28em] text-mist/70 transition-colors duration-500 hover:text-mist focus:outline-none disabled:opacity-40"
        >
          发送 →
        </button>
      </div>
    </div>
  )
}
