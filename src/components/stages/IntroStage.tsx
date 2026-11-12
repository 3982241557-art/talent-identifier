import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { TypewriterLine } from '../common/TypewriterLine'
import { SocratesPortrait } from '../common/SocratesPortrait'
import { TutorialDialog } from './TutorialDialog'

/* ============================================================
 *  P1 · 起始页 —— 天赋识别器
 *
 *  v5.0：
 *  · 全局单屏锁定：改用 flex + gap 自适应排版，
 *    绝不使用会互相挤压的绝对定位 padding。
 *  · 字号改用 clamp() 弹性刻度（.t-hero / .t-body），
 *    标题与副标题靠 gap 分离，不再重叠。
 * ============================================================ */

interface IntroStageProps {
  onTutorial: () => void
  onStart: () => void
  hasSaved: boolean
  onResume: () => void
}

const GREETING =
  '旅人，欢迎来到天赋识别器。我叫苏格拉底。' +
  '在你踏上星盘之前，我需要先认识你 —— ' +
  '先告诉我你出生在哪里，然后我们再决定，是直接聊起你的性格，还是让我慢慢问出来。'

export function IntroStage({
  onTutorial,
  onStart,
  hasSaved,
  onResume,
}: IntroStageProps) {
  const [tutorialOpen, setTutorialOpen] = useState(false)

  return (
    <div className="screen-col bg-paper text-ink">
      {/* ---------- 大标题：视觉重心上移至屏幕 1/3 处 ---------- */}
      <motion.header
        initial={{ opacity: 0, y: -18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.4, ease: 'easeOut' }}
        className="screen-fixed flex shrink-0 flex-col items-center gap-5 px-8"
        style={{ marginTop: 'clamp(2rem, 8vh, 5.5rem)' }}
      >
        <h1 className="serif-title t-hero text-ink">天赋识别器</h1>
        <p className="eyebrow text-ink-mute">TALENT IDENTIFIER</p>
        <span className="block h-px w-32 bg-ink/18" />
      </motion.header>

      {/* ---------- 主体：左头像 + 右对话框 ---------- */}
      <div className="screen-body flex items-center justify-center px-8 py-6">
        <div className="flex w-full max-w-[1280px] flex-col items-center justify-center gap-10 lg:flex-row lg:items-center lg:gap-16">
          {/* 苏格拉底 —— 紧贴对话框左侧 */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 1.8, ease: 'easeOut', delay: 0.3 }}
            className="flex shrink-0 flex-col items-center"
          >
            <div className="relative">
              <div
                className="breathe absolute left-1/2 top-1/2 h-[300px] w-[300px] -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{
                  background:
                    'radial-gradient(circle, rgba(10,10,10,0.06) 0%, rgba(255,255,255,0) 68%)',
                }}
              />
              <SocratesPortrait
                height="clamp(160px,18vh,260px)"
                className="float-slow relative w-auto lg:h-[clamp(200px,26vh,320px)]"
                style={{
                  filter: 'grayscale(0.7) brightness(0.92) contrast(1.08)',
                  maskImage: 'linear-gradient(to bottom, #000 78%, transparent 100%)',
                  WebkitMaskImage:
                    'linear-gradient(to bottom, #000 78%, transparent 100%)',
                }}
              />
            </div>
            <p className="mt-4 text-center text-[clamp(1.25rem,1.7vw,1.9rem)] font-semibold tracking-[0.2em] text-ink">
              苏格拉底
            </p>
            <p className="mt-1 text-center text-[clamp(0.75rem,0.9vw,1.05rem)] font-medium tracking-[0.24em] text-ink-mute">
              SOCRATES
            </p>
          </motion.div>

          {/* 对话框 */}
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1.6, ease: 'easeOut', delay: 0.7 }}
            className="w-full max-w-[720px]"
          >
            {/* v6.0：放大气泡文字，用更大的字间距 + 行高营造呼吸感 */}
            <div className="border-l-4 border-ink/25 pl-8">
              <p
                className="serif-body font-semibold text-ink"
                style={{
                  fontSize: 'clamp(1.5rem, 1.9vw, 2.35rem)',
                  lineHeight: 1.95,
                  letterSpacing: '0.08em',
                }}
              >
                <TypewriterLine text={GREETING} speed={42} />
              </p>
            </div>

            {/* 入口按钮 */}
            <div className="mt-9 flex flex-wrap items-center gap-6">
              <button
                onClick={() => {
                  setTutorialOpen(true)
                  onTutorial()
                }}
                className="border-0 bg-transparent pb-1 text-[clamp(1.0625rem,1.35vw,1.55rem)] font-semibold tracking-[0.2em] text-ink-soft transition-colors duration-500 hover:text-ink focus:outline-none"
              >
                新手教程
              </button>

              {/* 实体 CTA —— 纯黑底纯白字 */}
              <button
                onClick={onStart}
                className="group border-0 bg-ink px-8 py-3.5 text-[clamp(1.0625rem,1.35vw,1.55rem)] font-semibold tracking-[0.2em] text-paper transition-all duration-500 hover:bg-ink/85 hover:shadow-[0_10px_30px_rgba(10,10,10,0.22)] focus:outline-none"
              >
                进入探索
                <span className="ml-3 inline-block transition-transform duration-500 group-hover:translate-x-1">
                  →
                </span>
              </button>

              {hasSaved && (
                <button
                  onClick={onResume}
                  className="border-0 bg-transparent pb-1 text-[clamp(0.9375rem,1.05vw,1.25rem)] font-medium tracking-[0.2em] text-ink-mute transition-colors duration-500 hover:text-ink focus:outline-none"
                >
                  读取上次存档
                </button>
              )}
            </div>
          </motion.div>
        </div>
      </div>

      {/* ---------- 底部提示 ---------- */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.4, delay: 1.6 }}
        className="screen-fixed shrink-0 px-8 pb-6 text-center text-[clamp(0.875rem,1vw,1.15rem)] font-medium tracking-[0.24em] text-ink-mute"
      >
        你的资料仅保存在本机 · 刷新不会丢失
      </motion.p>

      <AnimatePresence>
        {tutorialOpen && (
          <TutorialDialog onClose={() => setTutorialOpen(false)} />
        )}
      </AnimatePresence>
    </div>
  )
}
