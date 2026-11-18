import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import type { Chart, MbtiProfile } from '../../types'
import { buildSoulPortrait, toSecondPerson } from '../../lib/soul'
import {
  VersionToggle,
  DEFAULT_VERSION,
  type ReportVersion,
} from '../common/VersionToggle'
import { postSoul } from '../../lib/api'
import { MBTI_TYPES } from '../../data/mbtiTypes'
import { TypewriterLine } from '../common/TypewriterLine'

/* ============================================================
 *  P3 · 灵魂底色（过渡页）
 *
 *  v6.0（任务 3）：
 *  · **不含任何占星术语** —— 这一页只谈 MBTI 与出生地。
 *    星盘术语一律留到 P4（主页）才登场。
 *  · 一句话由后端 AI 生成（失败则回落本地同规格引擎）。
 *  · 「看看我的星盘」按钮做得更大、更吸睛，直接把人推向 P4。
 *  · 单屏锁定 + flex/gap 自适应排版。
 * ============================================================ */

interface VerdictStageProps {
  chart: Chart
  mbti: MbtiProfile | null
  /** 出生地（用于过渡页的地理描述） */
  place?: string
  onContinue: () => void
}

export function VerdictStage({
  chart,
  mbti,
  place,
  onContinue,
}: VerdictStageProps) {
  /** 本地兜底（永远先算出来，避免闪烁） */
  const fallback = buildSoulPortrait(mbti, chart, place)
  const [text, setText] = useState(fallback.text)
  /**
   * v16.0：深度版速写（段落），极简版用 text
   *
   * v16.1：本地兜底也必须产出合格的深度版 ——
   * 否则后端超时 / 降级时，双版本切换胶囊会整个消失，
   * 用户就再也回不到「深度剖析版」了。
   */
  const [deepText, setDeepText] = useState(fallback.deep ?? '')
  /** v16.0：当前版本 */
  const [version, setVersion] = useState<ReportVersion>(DEFAULT_VERSION)

  const info = mbti ? MBTI_TYPES[mbti.type] : null
  const tags = fallback.keywords

  /* ---------- 拉取 AI 单句速写 ---------- */
  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const res = await postSoul({ chart, mbti, place })
        if (!alive) return
        const raw = res.text?.trim()
        if (!raw) return
        /* v7.0：第二人称兜底 —— 服务端已转换，这里再保险一次 */
        setText(toSecondPerson(raw))
        /* v16.0：深度版（可能是多段） */
        const deep = res.deep?.trim()
        if (deep) setDeepText(deep)
      } catch {
        /* 保持本地兜底 */
      }
    })()
    return () => {
      alive = false
    }
  }, [chart, mbti, place])

  return (
    <div className="screen-col">
      <div className="screen-scroll">
        {/* v17.0：严格居中 —— 容器自身占满视口高度并双向居中 */}
        <div className="mx-auto flex min-h-full w-full max-w-[1000px] flex-col items-center justify-center gap-8 px-8 py-8 sm:py-12">
          <motion.p
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1.2 }}
            className="eyebrow text-ink-mute"
          >
            YOUR SOUL PORTRAIT
          </motion.p>

          <motion.h2
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1.3, delay: 0.15 }}
            className="serif-title t-page text-center text-ink"
          >
            你骨子里是个什么样的人
          </motion.h2>

          {/* MBTI 标签 */}
          {mbti && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 1.2, delay: 0.35 }}
              className="flex flex-wrap items-center justify-center gap-4"
            >
              <span className="serif-title text-[clamp(1.75rem,2.4vw,2.8rem)] font-semibold tracking-[0.16em] text-ink">
                {mbti.type}
              </span>
              {info && (
                <>
                  <span className="h-4 w-px bg-ink/20" />
                  <span className="text-[clamp(1rem,1.2vw,1.5rem)] font-medium tracking-[0.16em] text-ink-mute">
                    {info.nickname}
                  </span>
                </>
              )}
            </motion.div>
          )}

          {/* ---------- 核心关键词标签（仅 MBTI / 地理，绝无星座） ---------- */}
          {tags.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1.3, delay: 0.5, ease: 'easeOut' }}
              className="flex max-w-[860px] flex-wrap items-center justify-center gap-3"
            >
              {tags.map((t, i) => (
                <motion.span
                  key={t}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.7, delay: 0.6 + i * 0.09 }}
                  className="border border-white/12 bg-transparent px-4 py-2 text-[clamp(0.9375rem,1.1vw,1.35rem)] font-semibold tracking-[0.1em] text-ink"
                >
                  {t}
                </motion.span>
              ))}
            </motion.div>
          )}

          <span className="block h-px w-full max-w-[760px] bg-white/10" />

          {/* ══════════ v16.0 · 双版本切换胶囊 ══════════ */}
          {deepText && (
            <div className="sticky top-3 z-20 mb-8 flex justify-center">
              <VersionToggle value={version} onChange={setVersion} />
            </div>
          )}

          {/* ---------- 主体：速写（极简 / 深度） ---------- */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1.5, delay: 0.9, ease: 'easeOut' }}
            className="w-full max-w-[900px] text-center"
          >
            {version === 'deep' && deepText ? (
              <div className="space-y-5 text-left">
                {deepText.split(/\n+/).filter(Boolean).map((line, i) => (
                  <p
                    key={i}
                    className="serif-body text-[clamp(1.05rem,1.2vw,1.4rem)] font-medium leading-[1.85] text-ink-soft"
                  >
                    {line}
                  </p>
                ))}
              </div>
            ) : (
              <p className="serif-body t-lead font-medium text-ink">
                <TypewriterLine text={text} speed={26} />
              </p>
            )}
          </motion.div>

          {/* 引导语 */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1.4, delay: 1.6 }}
            className="serif-body t-body max-w-[760px] text-center font-medium text-ink-mute"
          >
            {fallback.coda}
          </motion.p>

          {/* ---------- CTA：更大、更吸睛 ---------- */}
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1.4, delay: 1.8 }}
            className="mt-2 flex flex-col items-center gap-4"
          >
            <button
              onClick={onContinue}
              className="btn-photon group border-0 rounded-full px-14 py-5 text-[clamp(1.375rem,1.75vw,2rem)] font-semibold tracking-[0.22em] focus:outline-none"
              style={{ boxShadow: '0 10px 34px rgba(10,10,10,0.16)' }}
            >
              看看我的星盘
              <span className="ml-4 inline-block text-[1.15em] transition-transform duration-700 group-hover:translate-x-1.5">
                →
              </span>
            </button>
            <p className="text-[clamp(0.8125rem,0.88vw,1rem)] font-medium tracking-[0.18em] text-ink-mute">
              接下来，你会看到一整张属于你的天空
            </p>
          </motion.div>
        </div>
      </div>
    </div>
  )
}

/* ============================================================
 *  高亮渲染（供主页复用）
 * ============================================================ */
export function VerdictText({
  text,
  highlights,
  accent,
}: {
  text: string
  highlights: string[]
  accent: string
}) {
  let nodes: React.ReactNode[] = []
  let rest = text
  let key = 0
  while (rest.length > 0) {
    const hit = highlights
      .map((h) => ({ h, idx: rest.indexOf(h) }))
      .filter((x) => x.idx >= 0)
      .sort((a, b) => a.idx - b.idx)[0]
    if (!hit) {
      nodes.push(rest)
      break
    }
    nodes.push(rest.slice(0, hit.idx))
    nodes.push(
      <span key={`g${key++}`} style={{ color: accent }}>
        {hit.h}
      </span>,
    )
    rest = rest.slice(hit.idx + hit.h.length)
  }
  return <>{nodes}</>
}
