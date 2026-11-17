import { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { Chart, MbtiProfile } from '../../types'
import { CardBack } from './CardBack'
import {
  buildLocalReading,
  pickTarotCard,
  readTodayTarot,
  writeTodayTarot,
  TAROT_DECK,
  type TarotCard,
  type TarotReading,
} from '../../lib/tarot'
import { todayKey } from '../../lib/storage'
import { postTarotReading } from '../../lib/api'
import {
  VersionToggle,
  DEFAULT_VERSION,
  type ReportVersion,
} from '../common/VersionToggle'

/* ============================================================
 *  塔罗抽牌交互（v8.0）
 *
 *  v8.0 变更：
 *   · 牌阵由 5 张扩充至 **7 张**，改为**向上微微拱起**的扇形排布
 *     （rotateZ + translateY 组合，不是死板的直线）。
 *   · **聚光灯动效**：点击某张牌后，其余 6 张淡出消失，
 *     被选中的牌通过**手动 FLIP**（测量原位置 → 换算成位移与缩放）
 *     平滑移动到**屏幕正中央**并放大，随后执行 3D 翻转。
 *   · 翻牌同时背景压暗到 rgba(0,0,0,0.60)，视觉焦点完全集中。
 *   · 解析面板改为**三段式**（牌面本质 / 今日具体指引 / 星盘连结），
 *     严格纵向绝对居中排版。
 * ============================================================ */

interface TarotOverlayProps {
  open: boolean
  chart: Chart
  mbti: MbtiProfile | null
  accent: string
  onClose: () => void
}

/** 抽牌模块里展示的卡牌数量（v8.0：5 → 7） */
const CARD_COUNT = 7

/**
 * 扇形排布参数。
 *
 * v8.0：**向上微微拱起** —— 越靠外的牌 `dy` 越大（往下沉）、
 * `rot` 越大（向外倾斜），形成一道向上拱起的弧，而不是直线排列。
 */
const FAN = [
  { dx: -212, rot: -19, dy: 42 },
  { dx: -142, rot: -13, dy: 27 },
  { dx: -71, rot: -6.5, dy: 12 },
  { dx: 0, rot: 0, dy: 0 },
  { dx: 71, rot: 6.5, dy: 12 },
  { dx: 142, rot: 13, dy: 27 },
  { dx: 212, rot: 19, dy: 42 },
]

/** 解析面板浮现后，居中牌上浮的距离（px）—— 让出下半屏 */
const FOCUS_LIFT = 210

/** 聚光灯下被选中的牌的最终尺寸 */
const FOCUS_W = 'clamp(150px, 15vw, 208px)'
const FOCUS_ASPECT = 1.52

/** 聚光灯状态：被选中的牌从原位飞向屏幕中央所需的参数 */
interface FocusState {
  cardId: string
  /** 相对屏幕中心的位移（px） */
  dx: number
  dy: number
  /** 起始缩放：原宽度 / 目标宽度 */
  scale: number
}

export function TarotOverlay({
  open,
  chart,
  mbti,
  accent,
  onClose,
}: TarotOverlayProps) {
  const today = todayKey()
  const [record, setRecord] = useState(() => readTodayTarot(today))
  /** 已翻开的卡牌下标 */
  const [flippedIdx, setFlippedIdx] = useState<number | null>(null)
  /** 洗牌中 */
  const [shuffling, setShuffling] = useState(true)
  /** 抽牌后浮现的卡牌（洗牌结束时确定） */
  const [cards, setCards] = useState<TarotCard[]>([])
  /** v8.0：三段式解析 */
  const [reading, setReading] = useState<TarotReading | null>(null)
  /** v16.0：极简 / 深度 切换 */
  const [version, setVersion] = useState<ReportVersion>(DEFAULT_VERSION)
  const [readingLoading, setReadingLoading] = useState(false)
  /** v8.0：聚光灯状态 */
  const [focus, setFocus] = useState<FocusState | null>(null)
  /**
   * v8.0：解析面板是否已浮现。
   * 翻牌瞬间牌**绝对居中**；解析浮现后牌才轻微上浮让位。
   */
  const [readingVisible, setReadingVisible] = useState(false)

  const alreadyDrawn = Boolean(record)

  /* ---------- 洗牌：进入时播放一段洗牌动画 ---------- */
  useEffect(() => {
    if (!open) return
    setShuffling(true)
    setFlippedIdx(null)
    setFocus(null)
    setReading(null)
    setReadingVisible(false)

    const t = window.setTimeout(() => {
      setCards(pickSpread(chart, mbti, today, CARD_COUNT))
      setShuffling(false)
    }, 1100)
    return () => window.clearTimeout(t)
  }, [open, chart, mbti, today])

  /* ---------- Esc 关闭 ---------- */
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  /** 抽中的那张牌 */
  const drawnCard = useMemo(() => {
    if (alreadyDrawn && record) {
      const found = cards.find((c) => c.id === record.cardId)
      if (found) return found
    }
    if (flippedIdx !== null) return cards[flippedIdx] ?? null
    return null
  }, [alreadyDrawn, record, cards, flippedIdx])

  /* ============================================================
   *  v8.0 · 三段式解析拉取
   *
   *  云端优先；失败则用本地生成器（buildLocalReading）兜底，
   *  保证文字量永远足够充实。
   * ============================================================ */
  useEffect(() => {
    if (!drawnCard) return
    let cancelled = false
    setReadingLoading(true)

    /*
     * v11.0 · 动态种子
     *
     * 在 effect 内取时间戳（而不是 render 期间），
     * 既避免了在 render 里调用 impure function，
     * 又保证每次抽牌拿到的是**那一刻**的时间戳。
     */
    const seed = Date.now()

    postTarotReading({
      card: {
        name: drawnCard.name,
        meaning: drawnCard.meaning,
        essence: drawnCard.essence,
      },
      chart,
      mbti,
      /* 同牌不同天 → 不同侧重点 */
      seed,
    })
      .then((res) => {
        if (cancelled) return
        setReading({
          gist: res.gist || drawnCard.meaning,
          action: res.action || drawnCard.tip,
          degraded: res.degraded,
          /* v16.0：双版本一并带过来 */
          minimal: res.minimal,
          deep: res.deep,
        })
      })
      .catch(() => {
        if (cancelled) return
        setReading(buildLocalReading(drawnCard, chart, mbti, seed))
      })
      .finally(() => {
        if (!cancelled) setReadingLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [drawnCard, chart, mbti])

  /* ============================================================
   *  v8.0 · 点击卡牌 → 聚光灯 + 翻牌
   *
   *  关键：**手动 FLIP**。
   *  先用 getBoundingClientRect 量出被点中的牌在屏幕上的真实位置，
   *  再把它换算成「相对屏幕中心的位移」与「起始缩放」，
   *  交给 Framer Motion 从这个状态补间到 (0, 0, 1) ——
   *  这样牌就会精确地飞向**屏幕正中央**，而不是停在牌阵的中间。
   * ============================================================ */
  const handleFlip = useCallback(
    (idx: number, el: HTMLElement | null) => {
      if (shuffling) return
      // 一天只能抽一次
      if (alreadyDrawn) return
      if (flippedIdx !== null) return

      const card = cards[idx]
      if (!card) return

      /* ---- 测量原位置 ---- */
      const targetW = el
        ? el.getBoundingClientRect().width
        : 0
      const focusW = el ? Math.min(208, Math.max(150, window.innerWidth * 0.15)) : 150

      if (el) {
        const r = el.getBoundingClientRect()
        const cx = r.left + r.width / 2
        const cy = r.top + r.height / 2
        setFocus({
          cardId: card.id,
          dx: cx - window.innerWidth / 2,
          dy: cy - window.innerHeight / 2,
          scale: targetW > 0 ? targetW / focusW : 1,
        })
      } else {
        setFocus({ cardId: card.id, dx: 0, dy: 0, scale: 1 })
      }

      setFlippedIdx(idx)
      // 记录：把抽中的这张牌写入 localStorage
      writeTodayTarot(today, card.id)
      setRecord(readTodayTarot(today))

      /* 时序（关键）：
       *   0.00s  点击 —— 牌从原位起飞
       *   0.85s  牌精确落在屏幕正中央
       *   0.50~1.30s 牌在中央完成翻转
       *   1.40s  解析面板开始浮现
       *   1.50s  牌轻微上浮，给下半屏的解析让位
       * —— 保证「翻牌的那一瞬间，牌是锁死在正中央的」。
       */
      window.setTimeout(() => setReadingVisible(true), 1500)
    },
    [shuffling, alreadyDrawn, flippedIdx, cards, today],
  )

  /** 今日剩余时间提示 */
  const resetHint = useMemo(() => {
    const now = new Date()
    const tomorrow = new Date(now)
    tomorrow.setDate(now.getDate() + 1)
    tomorrow.setHours(0, 0, 0, 0)
    const mins = Math.max(
      0,
      Math.round((tomorrow.getTime() - now.getTime()) / 60000),
    )
    const h = Math.floor(mins / 60)
    return h > 0 ? `${h} 小时 ${mins % 60} 分后` : `${mins} 分钟后`
  }, [])

  if (!open) return null

  const shownCard = drawnCard
  const focusedCard =
    focus && shownCard && focus.cardId === shownCard.id ? shownCard : null
  /** 已抽过时，牌阵里那张已经翻开的牌 */
  const revealedId =
    alreadyDrawn && shownCard ? shownCard.id : flippedIdx !== null ? cards[flippedIdx]?.id : null
  /** 是否处于聚光灯（翻牌）状态 */
  const spotlight = Boolean(focusedCard)

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
      className="fixed inset-0 z-[130] flex items-center justify-center px-6"
      style={{ perspective: '1600px' }}
    >
      {/* ---------- 遮罩（聚光灯时压暗到 60%） ---------- */}
      <motion.div
        className="absolute inset-0 backdrop-blur-[6px]"
        animate={{
          backgroundColor: spotlight ? 'rgba(0,0,0,0.60)' : 'rgba(0,0,0,0.45)',
        }}
        transition={{ duration: 0.6 }}
        onClick={onClose}
      />

      {/* ============================================================
           聚光灯层：被选中的牌 + 底部解析（脱离面板，绝对居中）
           ============================================================ */}
      <AnimatePresence>
        {spotlight && focusedCard && focus && (
          <>
            {/* ---- 飞向屏幕正中央的牌（手动 FLIP） ----
             *
             * 两段式：
             *   ① 0 → 0.85s：从原位飞到**屏幕正中央**（x/y 归零）。
             *   ② 0.85s 后：解析面板浮现，牌轻微**上浮**到画面上半区，
             *      把下半屏完整让给三段式解析。
             *      —— 这保证「翻牌瞬间绝对居中」，随后才为阅读让位。
             */}
            <motion.div
              key="focus-card"
              className="pointer-events-none absolute inset-0 z-[140] flex items-center justify-center"
              style={{ perspective: '1600px' }}
            >
              <motion.div
                initial={{ x: focus.dx, y: focus.dy, scale: focus.scale }}
                animate={{
                  x: 0,
                  y: readingVisible ? -FOCUS_LIFT : 0,
                  scale: 1,
                }}
                transition={{
                  duration: readingVisible ? 0.9 : 0.85,
                  ease: [0.22, 0.9, 0.24, 1],
                }}
                style={{
                  width: FOCUS_W,
                  height: `calc(${FOCUS_W} * ${FOCUS_ASPECT})`,
                  transformStyle: 'preserve-3d',
                }}
              >
                {/* 翻转：牌到位后再转，露出正面 */}
                <motion.div
                  className="relative h-full w-full"
                  style={{ transformStyle: 'preserve-3d' }}
                  initial={{ rotateY: 0 }}
                  animate={{ rotateY: 180 }}
                  transition={{
                    duration: 0.8,
                    delay: 0.5,
                    ease: [0.22, 0.9, 0.24, 1],
                  }}
                >
                  <CardFaces card={focusedCard} flipped />
                </motion.div>
              </motion.div>
            </motion.div>

            {/* ---- 底部解析面板：严格纵向居中 ---- */}
            <motion.div
              key="focus-reading"
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 24 }}
              transition={{ duration: 0.8, ease: 'easeOut', delay: 1.4 }}
              className="pointer-events-none absolute inset-x-0 bottom-0 z-[141] flex justify-center px-6 pb-7"
            >
              <ReadingPanel
                card={focusedCard}
                reading={reading}
                loading={readingLoading}
                version={version}
                onVersionChange={setVersion}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ============================================================
           牌阵面板（聚光灯时淡出）
           ============================================================ */}
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 24 }}
        animate={{ opacity: spotlight ? 0 : 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 16 }}
        transition={{ duration: 0.55, ease: [0.22, 0.9, 0.24, 1] }}
        className="relative flex max-h-[92vh] w-full max-w-[1180px] flex-col items-center gap-6 border border-white/12 bg-white/5 px-8 py-8 backdrop-blur-md"
        style={{ boxShadow: '0 40px 120px rgba(0,0,0,0.7)' }}
        role="dialog"
        aria-modal="true"
        aria-label="每日灵感抽牌"
      >
        {/* ---------- 顶部标题 ---------- */}
        <header className="flex w-full flex-col items-center gap-2 text-center">
          <p
            className="text-[clamp(0.5625rem,0.62vw,0.6875rem)] font-bold tracking-[0.5em]"
            style={{ color: accent }}
          >
            TAROT · DAILY DRAW
          </p>
          <h3 className="serif-title text-[clamp(1.375rem,1.9vw,2.35rem)] font-semibold tracking-[0.12em] text-mist">
            {alreadyDrawn ? '今日已抽' : shuffling ? '洗牌中' : '选一张'}
          </h3>
          <span className="block h-px w-24 bg-white/15" />
        </header>

        {/* ---------- 牌阵区（向上微微拱起的扇形） ---------- */}
        <div
          className="relative flex w-full shrink-0 items-center justify-center"
          style={{ height: 'clamp(190px, 22vh, 260px)' }}
        >
          <div className="relative flex h-full items-center justify-center">
            {cards.map((card, i) => {
              const fan = FAN[i % FAN.length]
              const showFront = card.id === revealedId
              const disabled = shuffling || alreadyDrawn || flippedIdx !== null
              /* 聚光灯时，未被选中的牌淡出并消失 */
              const dimmed = spotlight && card.id !== focusedCard?.id

              return (
                <motion.button
                  key={`${card.id}-${i}`}
                  onClick={(e) => handleFlip(i, e.currentTarget)}
                  disabled={disabled}
                  initial={{
                    opacity: 0,
                    x: fan.dx * 0.35,
                    y: fan.dy + 40,
                    rotateZ: fan.rot * 0.4,
                    scale: 0.9,
                  }}
                  animate={{
                    opacity: dimmed ? 0 : 1,
                    x: fan.dx,
                    /* 向上拱起的弧：中间高、两侧低 */
                    y: fan.dy + (shuffling ? Math.sin(i * 1.4) * 9 : 0),
                    rotateZ: dimmed ? 0 : fan.rot,
                    scale: dimmed ? 0.82 : 1,
                  }}
                  transition={{
                    duration: shuffling ? 0.45 : 0.75,
                    delay: shuffling ? i * 0.07 : 0,
                    ease: [0.22, 0.9, 0.24, 1],
                  }}
                  whileHover={
                    disabled
                      ? undefined
                      : { y: fan.dy - 26, scale: 1.05, zIndex: 30 }
                  }
                  className="relative cursor-pointer border-0 bg-transparent p-0 focus:outline-none disabled:cursor-default"
                  style={{
                    width: 'clamp(92px, 9.6vw, 130px)',
                    height: 'clamp(140px, 14.8vw, 198px)',
                    marginLeft: i === 0 ? 0 : 'clamp(-108px, -8.4vw, -74px)',
                    transformStyle: 'preserve-3d',
                    zIndex: i,
                  }}
                  aria-label={
                    showFront ? `${card.name}（已翻开）` : '翻开这张牌'
                  }
                >
                  <motion.div
                    className="relative h-full w-full"
                    style={{ transformStyle: 'preserve-3d' }}
                    initial={{ rotateY: 0 }}
                    animate={{ rotateY: showFront ? 180 : 0 }}
                    transition={{ duration: 0.85, ease: [0.22, 0.9, 0.24, 1] }}
                  >
                    <CardFaces card={card} flipped={showFront} />
                  </motion.div>
                </motion.button>
              )
            })}
          </div>
        </div>

        {/* ---------- 已抽过：直接展示静态解析（不再抽牌） ---------- */}
        {alreadyDrawn && shownCard && !spotlight && (
          <div className="flex w-full justify-center">
            <ReadingPanel
              card={shownCard}
              reading={reading}
              loading={readingLoading}
              version={version}
              onVersionChange={setVersion}
            />
          </div>
        )}

        {/* ---------- 底部操作 ---------- */}
        <footer className="flex shrink-0 items-center gap-6">
          <button
            onClick={onClose}
            className="border-0 bg-transparent pb-1 text-[clamp(0.875rem,0.95vw,1.125rem)] font-semibold tracking-[0.24em] text-mist/70 transition-colors duration-500 hover:text-mist focus:outline-none"
          >
            收起
          </button>
          {alreadyDrawn && (
            <span className="text-[clamp(0.75rem,0.82vw,0.9375rem)] font-semibold tracking-[0.18em] text-mist/40">
              明日重洗 · {resetHint}
            </span>
          )}
        </footer>
      </motion.div>

      {/* ---------- 聚光灯时右下角的关闭按钮 ---------- */}
      <AnimatePresence>
        {spotlight && (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute bottom-7 right-8 z-[142] border-0 bg-transparent pb-1 text-[clamp(0.875rem,0.95vw,1.125rem)] font-semibold tracking-[0.24em] text-mist/70 transition-colors duration-500 hover:text-mist focus:outline-none"
          >
            收起
          </motion.button>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

/* ============================================================
 *  牌面（卡背 + 牌面），正反两面共用同一套结构
 * ============================================================ */
function CardFaces({
  card,
  flipped,
}: {
  card: TarotCard
  /** 翻面是否已完成 —— 用它做正反面的显隐 */
  flipped: boolean
}) {
  return (
    <>
      {/* ---- 卡背 ----
       *
       * 【重要】这里**不能**用 backdrop-blur：
       * backdrop-filter 会强制把元素所在的 3D 上下文展平，
       * 导致 backface-visibility 失效 —— 翻牌时卡背不会消失。
       * 遮罩层已经有整体 backdrop-blur，卡面用半透明纯色即可。
       */}
      <div
        className="absolute inset-0 flex items-center justify-center border border-white/14 bg-[#0d1428]/92"
        style={{
          backfaceVisibility: 'hidden',
          WebkitBackfaceVisibility: 'hidden',
          /* 兜底：backface-visibility 在部分上下文不生效，用 opacity 硬切 */
          opacity: flipped ? 0 : 1,
          transition: 'opacity 120ms linear',
          boxShadow:
            '0 18px 48px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.1)',
        }}
      >
        <CardBack totem={card.totem} color={card.hue} className="h-[84%] w-[84%]" />
      </div>

      {/* ---- 牌面（预旋转 180°，随父级 rotateY 翻出） ----
       * 同样**不能**用 backdrop-blur，理由同卡背。
       */}
      <div
        className="absolute inset-0 flex flex-col items-center justify-center gap-2 border border-white/20 bg-[#141d38]/96 px-3 py-4"
        style={{
          backfaceVisibility: 'hidden',
          WebkitBackfaceVisibility: 'hidden',
          transform: 'rotateY(180deg)',
          /* 兜底显隐 */
          opacity: flipped ? 1 : 0,
          transition: 'opacity 120ms linear',
          boxShadow:
            '0 22px 60px rgba(0,0,0,0.68), inset 0 1px 0 rgba(255,255,255,0.12)',
        }}
      >
        <span
          className="text-[clamp(0.5rem,0.54vw,0.625rem)] font-bold tracking-[0.42em]"
          style={{ color: card.hue }}
        >
          {card.numeral}
        </span>
        <h4
          className="serif-title text-center text-[clamp(1rem,1.3vw,1.5rem)] font-semibold tracking-[0.1em] text-mist"
          style={{ textShadow: `0 0 16px ${card.hue}55` }}
        >
          {card.name}
        </h4>
        <span className="block h-px w-8" style={{ background: `${card.hue}66` }} />
        <p className="text-center text-[clamp(0.5625rem,0.62vw,0.75rem)] font-medium leading-[1.6] text-mist/60">
          {card.meaning}
        </p>
      </div>
    </>
  )
}

/* ============================================================
 *  三段式解析面板 —— 严格纵向绝对居中
 * ============================================================ */
/**
 * v11.0 · 极简解析面板 —— 只有一两句话。
 *
 * 旧版是三段式，翻牌后要读 300 多字。
 * 用户读不完就直接跳过 —— 于是整个抽牌模块形同虚设。
 *
 * 现在只给：
 *   · 牌名（视觉锚点）
 *   · 一句点题
 *   · 一个今天就能做的微小动作
 */
function ReadingPanel({
  card,
  reading,
  loading,
  version,
  onVersionChange,
}: {
  card: TarotCard
  reading: TarotReading | null
  loading: boolean
  version?: ReportVersion
  onVersionChange?: (v: ReportVersion) => void
}) {
  /* v16.0：取当前版本的内容 */
  const v = version ?? DEFAULT_VERSION
  const src =
    v === 'minimal'
      ? (reading?.minimal ?? reading)
      : (reading?.deep ?? reading)

  const hasBoth =
    Boolean(reading?.minimal) && Boolean(reading?.deep)

  return (
    <div className="flex w-full max-w-[640px] flex-col items-center text-center">
      {/* ══════════ v16.0 · 双版本切换胶囊 ══════════ */}
      {hasBoth && onVersionChange && (
        <div className="sticky top-2 z-20 mb-6 flex justify-center">
          <VersionToggle value={v} onChange={onVersionChange} />
        </div>
      )}

      {/* ---------- 牌名 ---------- */}
      <h4
        className="serif-title text-[clamp(1.75rem,2.6vw,2.75rem)] font-semibold tracking-[0.16em]"
        style={{
          color: card.hue,
          textShadow: `0 0 30px ${card.hue}66`,
        }}
      >
        {card.name}
      </h4>

      {/* ---------- 一句点题 ---------- */}
      <p className="serif-body mt-3 text-[clamp(1.0625rem,1.2vw,1.375rem)] font-medium leading-[1.7] text-mist/80">
        {src?.gist ?? card.meaning}
      </p>

      {/* ---------- 分割线 ---------- */}
      <span
        className="my-5 block h-px w-24"
        style={{
          background: `linear-gradient(90deg, transparent, ${card.hue}88, transparent)`,
        }}
      />

      {/* ---------- 今日微小行动 ---------- */}
      <p
        className="text-[clamp(0.5625rem,0.62vw,0.6875rem)] font-bold tracking-[0.42em]"
        style={{ color: card.hue }}
      >
        今 日 一 件 小 事
      </p>
      <p className="serif-body mt-2.5 text-[clamp(1.0625rem,1.25vw,1.5rem)] font-semibold leading-[1.72] text-mist">
        {src
          ? src.action
          : loading
            ? '正在为你挑一件小事……'
            : card.tip}
      </p>
    </div>
  )
}

/**
 * 抽出一手牌（7 张）。
 *
 * 第一张由星盘精确决定（pickTarotCard），
 * 其余六张从牌库中**紧邻第一张**的位置依次取，
 * 保证这一手牌在语义上是连贯的一组，而不是随机乱抽。
 */
function pickSpread(
  chart: Chart,
  mbti: MbtiProfile | null,
  date: string,
  count: number,
): TarotCard[] {
  const anchor = pickTarotCard(chart, mbti, date)
  const anchorIdx = TAROT_DECK.findIndex((c) => c.id === anchor.id)
  const base = anchorIdx >= 0 ? anchorIdx : 0

  const out: TarotCard[] = [anchor]
  // 以 anchor 为中心向两侧交替展开，步长递增
  let step = 1
  while (out.length < count) {
    const offset = step * (step % 2 === 1 ? 1 : -1)
    const idx =
      (base + offset + TAROT_DECK.length * 4) % TAROT_DECK.length
    const card = TAROT_DECK[idx]
    if (!out.some((c) => c.id === card.id)) out.push(card)
    step++
    if (step > TAROT_DECK.length * 2) break
  }
  return out
}
