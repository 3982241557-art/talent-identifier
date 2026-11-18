import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { hubbleForBirthday, type HubbleBirthdayEntry } from '../../data/hubbleBirthday'

/* ============================================================
 *  出生那天的真实宇宙（v17.0）
 * ============================================================
 *
 *  【它在流程里的位置】
 *  用户填完出生信息 → **不直接跳星盘**，
 *  而是先进入这个全屏震撼页：
 *
 *    1. 根据出生【月-日】调出哈勃/韦伯当天拍下的**真实深空影像**
 *    2. Ken Burns 电影感缓慢推进（22s 循环）
 *    3. 底部浮出天体介绍 + 距离
 *    4. 按钮：[ 走进这片星空，开启我的星盘 → ]
 *    5. 底部还有「把烦恼丢进宇宙」输入框
 *
 *  【为什么要有这一页】
 *  旧版是「填完表 → 啪，直接星盘」，中间没有任何情绪缓冲。
 *  这一页是整个产品**唯一一次**让用户真正屏住呼吸的地方 ——
 *  它把「你的出生日期」翻译成一张真实的宇宙照片，
 *  让抽象的星盘突然有了具体的重量。
 * ============================================================ */

interface BirthSkyProps {
  /** 出生月（1-12） */
  month: number
  /** 出生日（1-31） */
  day: number
  /** 关闭并进入星盘 */
  onEnter: () => void
  /** 关闭并回到出生信息 */
  onBack?: () => void
  /** 主题强调色 */
  accent: string
}

/* ---------- Ken Burns 参数 ---------- */
/**
 * v17.2：推近动画交给 CSS `@keyframes slowZoom`（40s，scale 1 → 1.1）。
 * 淡入关键帧 `kenburns-fade` 同样定义在 index.css 里。
 */

export function BirthSky({ month, day, onEnter, onBack, accent }: BirthSkyProps) {
  /** 出生那天的真实影像 */
  const field = useMemo<HubbleBirthdayEntry>(
    () => hubbleForBirthday(month, day),
    [month, day],
  )

  /** 图片加载状态 —— 失败时降级为纯星云氛围，绝不裂图 */
  const [imgOk, setImgOk] = useState(true)

  /** 烦恼输入 */
  const [worry, setWorry] = useState('')
  /** 已丢弃的烦恼（用于播放消散动效） */
  const [released, setReleased] = useState<{
    text: string
    id: number
  } | null>(null)
  const releaseId = useRef(0)

  /* ============================================================
   *  Ken Burns
   * ============================================================
   *
   *  v17.2：推近动画改由 CSS `@keyframes slowZoom`（40s）承担，
   *  这里不再需要 JS 定时器 —— 少一个 setInterval，
   *  也避免 React 状态更新打断动画。
   */

  /* ============================================================
   *  「把烦恼丢进宇宙」
   * ============================================================ */
  const release = useCallback(() => {
    const text = worry.trim()
    if (!text) return
    setReleased({ text, id: ++releaseId.current })
    setWorry('')
  }, [worry])

  return (
    <div className="screen-col relative">
      {/*
       * ============================================================
       *  v17.2 · 全屏沉浸式影像层
       * ============================================================
       *
       *  【v17.0 的问题】
       *  旧版用 `<motion.img className="object-cover">`：
       *    · `<img>` 是 inline 元素，父级 line-height 会在底边留出空隙
       *    · 想把边缘「融进黑色背景」，只能额外铺 3~4 层渐变 div
       *    · 结果是层层叠叠、边缘仍是硬矩形，像贴图
       *
       *  【v17.2 的解法】
       *  改成 **background-image** 承载影像：
       *    · `background-size: cover` + `background-position: center` —— 零间隙铺满
       *    · 同一层叠 `radial-gradient` + `inset` box-shadow 做深空融合
       *    · `.kenburns-layer` 挂 `@keyframes slowZoom`（40s scale 1 → 1.1）
       *      极慢推近，让静谧的星云有真实的流动感
       *
       *  整层仍是 `pointer-events-none` —— 纯装饰，不能挡住底部按钮。
       */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden bg-void">
        {/* ---------- 影像本体（background-image + Ken Burns） ---------- */}
        {imgOk && field.image && (
          <div
            key={field.id}
            className="kenburns-layer"
            role="img"
            aria-label={`${field.title} —— ${field.en}`}
            style={{
              backgroundImage: `url("${field.image}")`,
              filter: 'saturate(122%) contrast(104%) brightness(88%)',
              opacity: 0,
              animation:
                'slowZoom 40s ease-in-out infinite alternate, kenburns-fade 1.6s ease-out forwards',
            }}
            onError={() => setImgOk(false)}
          />
        )}

        {/* ---------- 深空融合滤镜：径向渐变 + inset 暗角 ---------- */}
        <div className="deepspace-fusion" />

        {/* ---------- 上下压暗带（给文字让出呼吸空间） ---------- */}
        <div
          className="absolute inset-x-0 top-0 h-40"
          style={{
            background: 'linear-gradient(to bottom, rgba(3,5,8,0.78), transparent)',
          }}
        />
        <div
          className="absolute inset-x-0 bottom-0 h-72"
          style={{
            background: 'linear-gradient(to top, rgba(3,5,8,0.92), transparent)',
          }}
        />

        {/* 影像本身的星光晕染（与天体色呼应） */}
        <div
          className="pointer-events-none absolute inset-0 mix-blend-screen"
          style={{
            background: `radial-gradient(ellipse 60% 48% at 50% 46%, ${field.accent}22 0%, transparent 70%)`,
          }}
        />

        {/* 主题环境光（跟随全局元素色） */}
        {accent && (
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background: `radial-gradient(ellipse 90% 70% at 50% 50%, ${accent}18 0%, transparent 72%)`,
            }}
          />
        )}
      </div>

      {/* ========== 天体信息（居中） ========== */}
      <div className="screen-center flex-col text-center">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.6, ease: [0.22, 1, 0.36, 1], delay: 0.4 }}
          className="max-w-[760px]"
        >
          <p
            className="text-[clamp(0.6875rem,0.78vw,0.8125rem)] font-bold tracking-[0.46em]"
            style={{ color: field.accent }}
          >
            YOUR BIRTHDAY SKY
          </p>

          <h1
            className="serif-title mt-5 font-semibold tracking-[0.12em] text-mist"
            style={{
              fontSize: 'clamp(2.25rem, 4.6vw, 4.5rem)',
              textShadow: '0 0 46px rgba(3,5,8,0.92)',
            }}
          >
            {field.title}
          </h1>

          <p
            className="mt-2 font-medium tracking-[0.24em] text-ink-mute"
            style={{ fontSize: 'clamp(0.875rem, 1.05vw, 1.125rem)' }}
          >
            {field.en}
          </p>

          <p
            className="serif-body mt-7 font-medium leading-[1.92] text-ink-soft"
            style={{ fontSize: 'clamp(1.0625rem, 1.35vw, 1.5rem)' }}
          >
            {field.caption}
          </p>

          <p
            className="mt-6 font-semibold tracking-[0.2em]"
            style={{
              fontSize: 'clamp(0.8125rem, 0.95vw, 1rem)',
              color: `${field.accent}cc`,
            }}
          >
            {field.distance}
          </p>
        </motion.div>
      </div>

      {/* ============================================================
          底部：烦恼粉碎舱 + **主按钮（在其下方）**
          ============================================================
          v17.2：按需求把「走进这片星空，开启我的星盘 →」放到
          烦恼输入框**下方** —— 用户先倾诉，再启程。
          按钮是这一页唯一的主 CTA，做成醒目的发光药丸。
          ============================================================ */}
      <div className="screen-bottom shrink-0 px-6 pb-8">
        {/* ---------- 烦恼粉碎舱 ---------- */}
        <motion.div
          initial={{ opacity: 0, y: 26 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1], delay: 0.6 }}
          className="mx-auto w-full max-w-[680px]"
        >
          <WorryRelease
            value={worry}
            onChange={setWorry}
            onRelease={release}
            released={released}
            accent={field.accent}
          />
        </motion.div>

        {/* ---------- 主 CTA：走进这片星空 ---------- */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1], delay: 1.1 }}
          className="mt-8 flex flex-col items-center gap-5"
        >
          <button
            onClick={onEnter}
            data-enter-chart
            className="btn-photon group relative rounded-full px-12 py-5 text-[clamp(1.05rem,1.25vw,1.45rem)] font-semibold tracking-[0.18em]"
            style={{
              boxShadow: `0 16px 60px ${field.accent}55, 0 0 0 1px ${field.accent}44 inset, 0 0 40px ${field.accent}33`,
            }}
          >
            {/* 呼吸光晕 */}
            <span
              className="pointer-events-none absolute inset-0 rounded-full"
              style={{
                boxShadow: `0 0 34px ${field.accent}44`,
                animation: 'photon-breathe 4.2s ease-in-out infinite',
              }}
            />
            <span className="relative">
              走进这片星空，开启我的星盘
              <span className="ml-3 inline-block text-[1.1em] transition-transform duration-700 group-hover:translate-x-1.5">
                →
              </span>
            </span>
          </button>

          <p className="text-[clamp(0.75rem,0.85vw,0.9375rem)] font-medium tracking-[0.22em] text-ink-mute">
            {month} 月 {day} 日 · 那天哈勃看到的宇宙
          </p>
        </motion.div>
      </div>

      {/* ========== 返回 ========== */}
      {onBack && (
        <div className="screen-fixed absolute left-6 top-6">
          <button onClick={onBack} className="btn-ghost tracking-[0.24em]">
            ← 改一下出生日期
          </button>
        </div>
      )}
    </div>
  )
}

/* ============================================================
 *  烦恼粉碎舱 —— 文字坍缩成星尘，飞向深空
 * ============================================================ */
interface WorryReleaseProps {
  value: string
  onChange: (v: string) => void
  onRelease: () => void
  released: { text: string; id: number } | null
  accent: string
}

function WorryRelease({
  value,
  onChange,
  onRelease,
  released,
  accent,
}: WorryReleaseProps) {
  return (
    <div className="relative">
      {/* ---------- 输入区 ---------- */}
      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onRelease()
          }}
          placeholder="写下你此刻的一个烦恼，把它丢进亿万光年的深空里……"
          maxLength={120}
          className="min-w-0 flex-1 border-0 bg-transparent px-5 py-3.5 text-[clamp(0.9375rem,1.05vw,1.125rem)] font-medium text-mist placeholder:text-ink-mute/70 focus:outline-none"
          style={{
            background: 'rgba(8,13,26,0.62)',
            backdropFilter: 'blur(18px) saturate(140%)',
            borderRadius: '999px',
            border: '1px solid rgba(255,255,255,0.14)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.42)',
          }}
        />
        <button
          onClick={onRelease}
          disabled={!value.trim()}
          className="shrink-0 rounded-full border-0 px-7 py-3.5 text-[clamp(0.9375rem,1.05vw,1.125rem)] font-semibold tracking-[0.14em] transition-opacity duration-500 disabled:opacity-35"
          style={{
            background: `linear-gradient(135deg, ${accent}dd, ${accent}88)`,
            color: '#04070e',
            boxShadow: `0 8px 30px ${accent}44`,
          }}
        >
          丢进宇宙 ✨
        </button>
      </div>

      {/* ---------- 消散动效层 ---------- */}
      <AnimatePresence>
        {released && (
          <WorryDissolve key={released.id} text={released.text} accent={accent} />
        )}
      </AnimatePresence>
    </div>
  )
}

/* ============================================================
 *  星尘坍缩动效
 * ============================================================ */
interface WorryDissolveProps {
  text: string
  accent: string
}

/**
 * 文字 → 细碎星光 → 飞向画面深处 → 消散。
 *
 * 实现要点：
 *   1. 文字本体：缩放 + 上浮 + 模糊（1.2s）
 *   2. 星尘粒子：从文字位置生成，向中心收敛（2.3s）
 *   3. 治愈文案：在粒子消散后浮现
 */
function WorryDissolve({ text, accent }: WorryDissolveProps) {
  const [stage, setStage] = useState<'shrink' | 'particles' | 'gone'>('shrink')
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rafRef = useRef(0)

  useEffect(() => {
    const t1 = window.setTimeout(() => setStage('particles'), 900)
    const t2 = window.setTimeout(() => setStage('gone'), 3400)
    return () => {
      window.clearTimeout(t1)
      window.clearTimeout(t2)
    }
  }, [])

  /* ---------- 粒子：向画面中心收敛 ---------- */
  useEffect(() => {
    if (stage !== 'particles') return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const w = window.innerWidth
    const h = window.innerHeight
    canvas.width = w * dpr
    canvas.height = h * dpr
    canvas.style.width = `${w}px`
    canvas.style.height = `${h}px`
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    /* 起点：底部输入框附近 */
    const originX = w / 2
    const originY = h - 150
    /* 终点：画面深处的星云中心 */
    const targetX = w / 2
    const targetY = h * 0.42

    const COUNT = 220
    const particles = Array.from({ length: COUNT }, (_, i) => {
      const a = (i / COUNT) * Math.PI * 2 + Math.random() * 0.6
      const spread = 40 + Math.random() * 190
      return {
        x: originX + Math.cos(a) * spread * 0.5,
        y: originY + Math.sin(a) * spread * 0.22,
        sx: originX + Math.cos(a) * spread * 0.5,
        sy: originY + Math.sin(a) * spread * 0.22,
        vx: (Math.random() - 0.5) * 2.4,
        vy: (Math.random() - 0.5) * 1.8 - 0.8,
        r: 0.7 + Math.random() * 2.1,
        life: Math.random() * 0.42,
        hue: Math.random(),
      }
    })

    let t = 0
    const DURATION = 2.3

    const draw = () => {
      t += 1 / 60
      const p = Math.min(1, t / DURATION)
      /* 缓动：先快后慢 —— 越飞越慢，像被引力拽住 */
      const ease = 1 - Math.pow(1 - p, 2.4)

      ctx.clearRect(0, 0, w, h)
      ctx.globalCompositeOperation = 'lighter'

      for (const pt of particles) {
        /* 向目标点收敛 + 一点湍流 */
        const tx = pt.sx + (targetX - pt.sx) * ease
        const ty = pt.sy + (targetY - pt.sy) * ease
        pt.x += (tx - pt.x) * 0.09 + pt.vx * (1 - ease) * 0.4
        pt.y += (ty - pt.y) * 0.09 + pt.vy * (1 - ease) * 0.4

        /* 越接近中心越暗（被深空吞没） */
        const alpha = Math.max(0, 1 - ease * 0.92) * (0.75 + pt.life * 0.5)
        if (alpha <= 0.01) continue

        const size = pt.r * (1 - ease * 0.55)
        const g = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, size * 5)
        g.addColorStop(0, `rgba(255,248,232,${alpha})`)
        g.addColorStop(
          0.4,
          `rgba(${pt.hue > 0.5 ? '212,180,140' : '180,205,235'},${alpha * 0.55})`,
        )
        g.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = g
        ctx.fillRect(pt.x - size * 5, pt.y - size * 5, size * 10, size * 10)
      }

      ctx.globalCompositeOperation = 'source-over'

      if (t < DURATION) {
        rafRef.current = requestAnimationFrame(draw)
      } else {
        ctx.clearRect(0, 0, w, h)
      }
    }

    rafRef.current = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(rafRef.current)
    }
  }, [stage])

  return (
    <>
      {/* 粒子画布 */}
      <canvas
        ref={canvasRef}
        className="pointer-events-none fixed inset-0 z-[120]"
        style={{
          opacity: stage === 'particles' ? 1 : 0,
          transition: 'opacity 400ms',
        }}
      />

      {/* ---------- 文字坍缩 ---------- */}
      <AnimatePresence>
        {stage !== 'gone' && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{
              opacity: stage === 'shrink' ? 1 : 0,
              y: stage === 'shrink' ? 0 : -46,
              scale: stage === 'shrink' ? 1 : 0.42,
              filter: stage === 'shrink' ? 'blur(0px)' : 'blur(6px)',
            }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
            className="pointer-events-none fixed inset-x-0 bottom-[132px] z-[121] flex justify-center px-8"
          >
            <p
              className="max-w-[560px] text-center font-semibold leading-[1.7] text-mist"
              style={{
                fontSize: 'clamp(1rem,1.2vw,1.3rem)',
                textShadow: `0 0 30px ${accent}55, 0 2px 14px rgba(0,0,0,0.9)`,
              }}
            >
              {text}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---------- 治愈反馈 ---------- */}
      <AnimatePresence>
        {stage === 'gone' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.6, ease: [0.22, 1, 0.36, 1] }}
            className="pointer-events-none fixed inset-x-0 bottom-[128px] z-[121] flex justify-center px-8"
          >
            <p
              className="max-w-[620px] text-center font-medium leading-[1.9] text-mist/90"
              style={{
                fontSize: 'clamp(1rem,1.2vw,1.35rem)',
                textShadow: '0 2px 20px rgba(0,0,0,0.92)',
              }}
            >
              它已经飞向 130 亿光年外，
              <br />
              <span className="text-mist">不再困扰今天的你了。</span>
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
