import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { TutorialDialog } from './TutorialDialog'

/* ============================================================
 *  v16.0 · 开场叙事 —— 点击触发的宇宙对话
 * ============================================================
 *
 *  【核心变化】
 *  旧版是一个死板的标题首页 + 苏格拉底对话框 + 按钮。
 *  新版把用户直接丢进缓缓流动的深空，
 *  用**点击**推进叙事 —— 每一句都由用户的动作点亮。
 *
 *  【四个阶段】
 *    1. 初见星空   —— 只有一句话浮在中央
 *    2. 点击       —— 星辰扩散涟漪 + 第一句淡出 + 第二句浮现
 *    3. 再点击     —— 镜头向深空推进（Warp）+ 出生信息卡浮现
 *    4. 填写完成   —— 表化作星尘散开，交给 App 切到星盘
 *
 *  【与旧版的兼容】
 *  保留「新手教程」与「读取存档」两个入口 ——
 *  但它们被收进了右上角的极简角标里，
 *  不再是开场画面的主角（开场的主角是星空本身）。
 * ============================================================ */

interface IntroStageProps {
  onTutorial: () => void
  onStart: () => void
  hasSaved: boolean
  onResume: () => void
}

/* ---------- 阶段常量 ---------- */
type Phase = 'starlight' | 'reveal' | 'warp' | 'form'

/** 阶段一：初见星空 */
const LINE_1 = '你想看看你出生那一天的星空吗'

/** 阶段二：揭示未来 */
const LINE_2 = '你知道吗，这片星空能让你看见未来'

/** 阶段三：穿梭至出生时刻 */
const LINE_3 = '现在，把那一刻交给我'

export function IntroStage({
  onTutorial,
  onStart,
  hasSaved,
  onResume,
}: IntroStageProps) {
  const [phase, setPhase] = useState<Phase>('starlight')
  const [tutorialOpen, setTutorialOpen] = useState(false)

  /* ---------- 点击涟漪 ---------- */
  const [ripples, setRipples] = useState<
    Array<{ id: number; x: number; y: number }>
  >([])
  const rippleId = useRef(0)

  /* ---------- 阶段推进 ---------- */
  const advance = useCallback(() => {
    setPhase((p) => {
      if (p === 'starlight') return 'reveal'
      if (p === 'reveal') return 'warp'
      return p
    })
  }, [])

  /**
   * 阶段三的镜头推进结束后，
   * 才让「出生信息卡」浮现 —— 让用户先感受到穿梭。
   */
  useEffect(() => {
    if (phase !== 'warp') return
    const t = setTimeout(() => setPhase('form'), 1500)
    return () => clearTimeout(t)
  }, [phase])

  /* ---------- 涟漪 ---------- */
  const spawnRipple = useCallback((e: React.MouseEvent) => {
    const id = ++rippleId.current
    setRipples((r) => [...r, { id, x: e.clientX, y: e.clientY }])
    setTimeout(() => {
      setRipples((r) => r.filter((x) => x.id !== id))
    }, 1600)
  }, [])

  /* ---------- 键盘可达性 ---------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        if (phase === 'starlight' || phase === 'reveal') {
          e.preventDefault()
          advance()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, advance])

  const clickable = phase === 'starlight' || phase === 'reveal'

  return (
    <div
      className="screen-col relative"
      onClick={
        clickable
          ? (e) => {
              spawnRipple(e)
              advance()
            }
          : undefined
      }
    >
      {/* ========== 阶段一 / 二：中央的一句话 ========== */}
      <AnimatePresence mode="wait">
        {(phase === 'starlight' || phase === 'reveal') && (
          <motion.div
            key={phase === 'starlight' ? 'l1' : 'l2'}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -26 }}
            transition={{ duration: 1.1, ease: 'easeOut' }}
            className="screen-body flex items-center justify-center px-8"
          >
            <p
              className="starlight-breathe max-w-[22ch] text-center font-semibold leading-[1.9] tracking-[0.1em] text-mist"
              style={{ fontSize: 'clamp(2.05rem, 3.6vw, 3.9rem)' }}
            >
              {phase === 'starlight' ? LINE_1 : LINE_2}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ========== 阶段三：镜头推进 ========== */}
      {phase === 'warp' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="screen-body flex items-center justify-center px-8"
        >
          <p
            className="starlight-breathe max-w-[20ch] text-center font-semibold leading-[1.9] tracking-[0.1em] text-mist"
            style={{ fontSize: 'clamp(2.05rem, 3.6vw, 3.9rem)' }}
          >
            {LINE_3}
          </p>
        </motion.div>
      )}

      {/* ========== 阶段四：出生信息卡浮现 ========== */}
      {phase === 'form' && (
        <motion.div
          initial={{ opacity: 0, y: 40, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
          className="screen-body flex items-center justify-center px-8"
        >
          <div className="glass-panel w-full max-w-[560px] rounded-[26px] px-10 py-12 text-center">
            <p className="eyebrow text-gold">YOUR BIRTH</p>
            <h2 className="serif-title t-sub mt-4 text-mist">
              告诉我你出生的那一刻
            </h2>
            <p className="serif-body t-body mt-4 text-ink-soft">
              日期、时间、出生地 —— 有多准就填多准，
              记不清也没关系，先填个大概。
            </p>

            <div className="mt-9 flex flex-wrap items-center justify-center gap-5">
              <button
                onClick={onStart}
                className="btn-photon rounded-full px-9 py-3.5 text-[clamp(1rem,1.2vw,1.35rem)] font-semibold tracking-[0.16em]"
              >
                开始
              </button>

              {hasSaved && (
                <button
                  onClick={onResume}
                  className="btn-pulsar rounded-full px-7 py-3 text-[clamp(0.9375rem,1.05vw,1.2rem)] font-semibold tracking-[0.16em]"
                >
                  读上次的
                </button>
              )}
            </div>
          </div>
        </motion.div>
      )}

      {/* ========== 底部引导 ========== */}
      <AnimatePresence>
        {clickable && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8, delay: 0.6 }}
            className="screen-fixed shrink-0 px-8 pb-8 text-center text-[clamp(0.8125rem,0.95vw,1.05rem)] font-medium tracking-[0.28em] text-ink-mute"
          >
            <span className="hint-float inline-block">
              [ 轻触屏幕任意处继续 ]
            </span>
          </motion.p>
        )}
      </AnimatePresence>

      {/* ========== 右上角：教程 / 存档（收进角标） ========== */}
      <div className="screen-fixed absolute right-6 top-6 flex items-center gap-4">
        <button
          onClick={(e) => {
            e.stopPropagation()
            setTutorialOpen(true)
            onTutorial()
          }}
          className="btn-ghost text-[clamp(0.75rem,0.85vw,0.95rem)] tracking-[0.24em]"
        >
          教程
        </button>
        {hasSaved && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onResume()
            }}
            className="btn-ghost text-[clamp(0.75rem,0.85vw,0.95rem)] tracking-[0.24em]"
          >
            存档
          </button>
        )}
      </div>

      {/* ========== 点击涟漪 ========== */}
      {ripples.map((r) => (
        <span
          key={r.id}
          className="grav-ripple"
          style={{
            left: r.x,
            top: r.y,
            width: 340,
            height: 340,
            marginLeft: -170,
            marginTop: -170,
          }}
        />
      ))}

      <AnimatePresence>
        {tutorialOpen && (
          <TutorialDialog onClose={() => setTutorialOpen(false)} />
        )}
      </AnimatePresence>
    </div>
  )
}
