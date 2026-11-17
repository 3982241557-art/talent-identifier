import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { MockAstrolabe } from './MockAstrolabe'

/* ============================================================
 *  何为星盘？—— 剧场比喻教学模块
 *
 *  v4.0：
 *  · 材质彻底切换为「全透明 + 毛玻璃」（bg-white/5 + backdrop-blur-md
 *    + border-white/10），纯黑底与星空自然透出，绝不发灰发脏。
 *  · 文本内容完全替换为硬编码的白话版教学文案。
 *  · 字体整体加大加粗，保证高对比度易读。
 * ============================================================ */

interface AstrologyDrawerProps {
  open: boolean
  onClose: () => void
  /** 主题色（来自元素引擎） */
  accent?: string
  /** 用户真实的三巨头，用于把解释锚定到本人星盘 */
  bigThree?: {
    sun: string
    moon: string
    rising: string
  } | null
}

/* ============================================================
 *  微缩模型的四条图例（v5.0）
 *  编号与 MockAstrolabe 上的一号锚点一一对应。
 *
 *  v9.0 · 任务 4：文案砍掉约三分之一。
 *  旧版每条 50~70 字，像说明书；新版 25~35 字，
 *  短句、留白、像朋友在旁边讲给你听。
 * ============================================================ */
const MOCK_LEGEND = [
  {
    n: '1',
    title: '行星',
    role: '演员',
    desc: '内圈每个符号都是一颗真实存在的行星，各自代表你身上的一种人格。',
  },
  {
    n: '2',
    title: '星座',
    role: '戏服',
    desc: '最外圈的十二星座，决定这些人格用什么方式说出来。',
  },
  {
    n: '3',
    title: '宫位',
    role: '舞台',
    desc: '切开的扇形是十二宫。人生的几块场地，各演各的戏。',
  },
  {
    n: '4',
    title: '相位',
    role: '剧情',
    desc: '穿过中心的连线是相位，写的是演员之间怎么对戏。',
  },
]

/* ============================================================
 *  教学文案（硬编码）
 * ============================================================ */

/** 底层逻辑公式 */
const FORMULA = [
  { part: '星体（谁）', desc: '行星与三巨头，你身上的不同人格' },
  { part: '星座（怎么做）', desc: '十二种表达风格，戏服与表演方式' },
  { part: '宫位（在哪里）', desc: '十二个人生领域，人生的舞台布景' },
]

/** 剧场四要素 */
const THEATER = [
  {
    icon: '🎭',
    name: '行星（Planets）',
    role: '演员',
    desc: '你身上的不同人格：理智的、感性的、愤怒的、温柔的。',
  },
  {
    icon: '👘',
    name: '星座（Signs）',
    role: '戏服与表演风格',
    desc: '这些人格怎么表达：冲动地说，还是克制地说。',
  },
  {
    icon: '🏛️',
    name: '宫位（Houses）',
    role: '舞台布景',
    desc: '人生的具体场地：事业的台、婚姻的台、金钱的台。',
  },
  {
    icon: '🎬',
    name: '相位（Aspects）',
    role: '互动剧情',
    desc: '演员之间怎么对戏：互相帮衬，还是互相消耗。',
  },
]

/** 核心教学：认识核心演员 */
const CORE_ACTORS = [
  {
    icon: '☀️',
    name: '太阳（核心自我）',
    desc: '你的追求、尊严，以及你想成为什么样的人。',
  },
  {
    icon: '🌙',
    name: '月亮（内在小孩）',
    desc: '你的潜意识、安全感从哪来，情绪在哪里会炸。',
  },
  {
    icon: '⬆️',
    name: '上升点（人格面具）',
    desc: '别人对你的第一印象，你面对世界的第一反应。',
    note: '太阳、月亮、上升叫「三巨头」。看懂这三个，就懂了大半的自己。',
  },
  {
    icon: '💬',
    name: '水星',
    desc: '你怎么沟通、怎么学、怎么想。',
  },
  {
    icon: '❤️',
    name: '金星',
    desc: '你喜欢什么、怎么爱人、怎么花钱。',
  },
  {
    icon: '🔥',
    name: '火星',
    desc: '你的欲望、执行力，和脾气。',
  },
]

/** 核心教学：四大元素 */
const ELEMENTS = [
  {
    icon: '🔥',
    name: '火象',
    signs: '白羊 / 狮子 / 射手',
    desc: '靠热情驱动，直来直去，容易上头。',
    color: '#f08a3c',
  },
  {
    icon: '🌍',
    name: '土象',
    signs: '金牛 / 处女 / 摩羯',
    desc: '靠实感驱动，踏实、稳、认死理。',
    color: '#6fae7d',
  },
  {
    icon: '💨',
    name: '风象',
    signs: '双子 / 天秤 / 水瓶',
    desc: '靠思考驱动，理性、爱聊、抽离感强。',
    color: '#8fc9d6',
  },
  {
    icon: '💧',
    name: '水象',
    signs: '巨蟹 / 天蝎 / 双鱼',
    desc: '靠感受驱动，敏感、直觉强、共情快。',
    color: '#5ba3e0',
  },
]

/** 核心教学：四大核心宫位 */
const HOUSES = [
  {
    n: '第 1 宫',
    name: '命宫',
    quote: '「我」',
    desc: '外貌、气质、怎么认自己。',
  },
  {
    n: '第 4 宫',
    name: '田宅宫',
    quote: '「家」',
    desc: '原生家庭、内心的归处。',
  },
  {
    n: '第 7 宫',
    name: '伴侣宫',
    quote: '「他」',
    desc: '婚姻、一对一的关系。',
  },
  {
    n: '第 10 宫',
    name: '事业宫',
    quote: '「业」',
    desc: '成就、社会地位。',
  },
]

/** 自我实操步骤 */
const STEPS = [
  {
    n: '第一步',
    t: '先看「三巨头」',
    d: '太阳是目标，月亮是安全感，上升是别人看到的样子。',
  },
  {
    n: '第二步',
    t: '落到具体问题',
    d: '感情看金星和第 7 宫，事业看第 10 宫和火星。',
  },
  {
    n: '第三步',
    t: '选高阶表达',
    d: '每种配置都有高阶和低阶两种活法。认出它，然后往舒服的那侧走。',
  },
]

/* ============================================================
 *  组件
 * ============================================================ */

export function AstrologyDrawer({
  open,
  onClose,
  accent,
  bigThree,
}: AstrologyDrawerProps) {
  /* Esc 关闭 */
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const sun = bigThree?.sun ?? '你的星座'
  const moon = bigThree?.moon ?? '你的星座'
  const rising = bigThree?.rising ?? '你的星座'

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center px-4 py-6 sm:px-8">
          {/* 遮罩：极淡，不发灰 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/42 backdrop-blur-[8px]"
          />

          {/* ============================================================
              v6.0（任务 8）· 巨大的居中悬浮磨砂方框
              —— 不再是全屏 / 半屏的侧边抽屉
              —— 边缘柔和朦胧：大范围柔和投影 + backdrop-blur
              —— 左图右文：中间偏左放大版微缩星盘，右侧是解释与用法
              ============================================================ */}
          <motion.div
            initial={{ opacity: 0, y: 34, scale: 0.965 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.975 }}
            transition={{ duration: 0.68, ease: [0.22, 0.72, 0, 1] }}
            className="relative flex h-[min(92vh,1040px)] w-full max-w-[1480px] flex-col overflow-hidden rounded-[26px] border border-white/12 bg-white/[0.055] backdrop-blur-2xl"
            style={{
              boxShadow:
                '0 44px 130px rgba(0,0,0,0.66), 0 12px 40px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,255,255,0.16)',
            }}
            role="dialog"
            aria-modal="true"
            aria-label="何为星盘"
          >
            {/* ---------- 头部 ---------- */}
            <header className="flex shrink-0 items-start justify-between gap-6 border-b border-white/10 px-8 pb-6 pt-7 sm:px-12 sm:pt-9">
              <div className="min-w-0">
                <p className="text-[clamp(0.6875rem,0.75vw,0.9375rem)] font-semibold tracking-[0.42em] text-mist/60">
                  HOW TO READ
                </p>
                <h2 className="serif-title t-sub mt-2 text-mist">何为星盘？</h2>
                <p className="serif-body mt-3 max-w-[640px] text-[clamp(0.9375rem,1vw,1.2rem)] font-medium leading-[1.7] text-mist/85">
                  把你的星盘想象成一个大剧院。
                  左边是它的骨架，右边告诉你每一块分别在演什么。
                </p>
              </div>
              <button
                onClick={onClose}
                aria-label="关闭"
                className="shrink-0 border border-white/20 px-4 py-2 text-[clamp(0.8125rem,0.85vw,1rem)] font-semibold tracking-[0.16em] text-mist/85 transition-colors duration-500 hover:border-white/40 hover:text-mist focus:outline-none"
              >
                关闭
              </button>
            </header>

            {/* ---------- 左图右文 ---------- */}
            <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:overflow-hidden">
              {/* ---------- 左：放大的微缩模型（居中偏左，sticky） ---------- */}
              <aside className="relative flex flex-col items-center justify-center border-b border-white/10 px-6 py-10 lg:border-b-0 lg:border-r lg:px-10 lg:py-12">
                {/* 模型背后的柔光 */}
                <div
                  className="pointer-events-none absolute left-1/2 top-1/2 h-[72%] w-[78%] -translate-x-1/2 -translate-y-1/2 rounded-full"
                  style={{
                    background: `radial-gradient(circle, ${accent ?? '#c9a86a'}22 0%, rgba(0,0,0,0) 68%)`,
                    filter: 'blur(30px)',
                  }}
                />
                <div className="relative flex flex-col items-center">
                  <MockAstrolabe accent={accent} size={420} />
                  <p className="mt-5 text-center text-[clamp(0.6875rem,0.72vw,0.8125rem)] font-semibold tracking-[0.3em] text-mist/45">
                    MOCK ASTROLABE
                  </p>
                  <p className="mt-2 max-w-[340px] text-center text-[clamp(0.75rem,0.8vw,0.9375rem)] font-medium leading-[1.7] text-mist/55">
                    一个简化到极致的模型。里面没有你的数据，
                    只有星盘的四层骨架。看懂这四层，整张盘就通了。
                  </p>
                </div>
              </aside>

              {/* ---------- 右：解释文本与使用说明 ---------- */}
              <div className="thin-scroll min-h-0 overflow-y-auto px-8 pb-16 pt-10 sm:px-12">
                {/* ---------- 四条锚点说明（与左侧模型上的编号一一对应） ---------- */}
                <section>
                  <h3 className="serif-title t-sub text-mist">
                    怎样看这个星盘？
                  </h3>

                  <ul className="mt-6 flex flex-col gap-3.5">
                    {MOCK_LEGEND.map((m) => (
                      <li
                        key={m.n}
                        className="flex items-start gap-4 border border-white/10 bg-white/5 px-5 py-4 backdrop-blur-md"
                      >
                        <span
                          className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[14px] font-bold"
                          style={{
                            borderColor: accent ?? '#c9a86a',
                            color: accent ?? '#c9a86a',
                          }}
                        >
                          {m.n}
                        </span>
                        <div className="min-w-0">
                          <p className="text-[clamp(1rem,1.1vw,1.3rem)] font-bold tracking-[0.08em] text-mist">
                            {m.title}
                            <span
                              className="ml-2 text-[clamp(0.8125rem,0.85vw,1rem)] font-semibold tracking-[0.14em]"
                              style={{ color: accent ?? '#c9a86a' }}
                            >
                              {m.role}
                            </span>
                          </p>
                          <p className="serif-body mt-1.5 text-[clamp(0.9375rem,0.95vw,1.125rem)] font-medium leading-[1.65] text-mist/78">
                            {m.desc}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>

                <span className="mt-9 block h-px w-full bg-white/10" />

                {/* ---------- 它到底怎么算的 ---------- */}
                <section className="mt-9">
                  <h3 className="serif-title t-sub text-mist">
                    星盘到底是怎么算出来的
                  </h3>
                  <div className="mt-5 flex flex-col gap-3">
                    {FORMULA.map((f) => (
                      <div
                        key={f.part}
                        className="border-l-2 bg-white/5 py-4 pl-6 pr-5 backdrop-blur-md"
                        style={{ borderColor: accent ?? 'rgba(230,236,247,0.4)' }}
                      >
                        <p className="text-[clamp(1.0625rem,1.15vw,1.35rem)] font-bold tracking-[0.06em] text-mist">
                          {f.part}
                        </p>
                        <p className="serif-body mt-1.5 text-[clamp(0.9375rem,0.95vw,1.125rem)] font-medium leading-[1.65] text-mist/72">
                          {f.desc}
                        </p>
                      </div>
                    ))}
                  </div>
                  <p className="serif-title mt-6 text-[24px] font-semibold tracking-[0.14em] text-mist">
                    星体（谁） + 星座（怎么做） + 宫位（在哪里）
                    <span className="text-mist/55"> = </span>
                    <span style={{ color: accent ?? '#e6ecf7' }}>你的生命体验</span>
                  </p>
                </section>

              <span className="mt-9 block h-px w-full bg-white/10" />

              {/* ---------- 剧场比喻 ---------- */}
              <section className="mt-9">
                <h3 className="serif-title t-sub text-mist">
                  剧场里的四个角色
                </h3>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {THEATER.map((t) => (
                    <div
                      key={t.name}
                      className="border border-white/10 bg-white/5 px-5 py-5 backdrop-blur-md"
                    >
                      <div className="flex items-baseline gap-3">
                        <span className="text-[clamp(1.25rem,1.4vw,1.65rem)] leading-none">{t.icon}</span>
                        <span className="serif-title text-[clamp(1rem,1.1vw,1.3rem)] font-semibold tracking-[0.06em] text-mist">
                          {t.name}
                        </span>
                      </div>
                      <p
                        className="mt-2 text-[clamp(0.75rem,0.78vw,0.9375rem)] font-bold tracking-[0.18em]"
                        style={{ color: accent ?? '#e6ecf7' }}
                      >
                        {t.role}
                      </p>
                      <p className="serif-body mt-2 text-[clamp(0.9375rem,0.95vw,1.125rem)] font-medium leading-[1.65] text-mist/80">
                        {t.desc}
                      </p>
                    </div>
                  ))}
                </div>
              </section>

              <span className="mt-9 block h-px w-full bg-white/10" />

              {/* ---------- 核心教学内容 1：核心演员 ---------- */}
              <section className="mt-9">
                <h3 className="serif-title t-sub text-mist">
                  核心教学内容
                </h3>
                <p className="mt-4 text-[clamp(0.9375rem,1vw,1.2rem)] font-bold tracking-[0.1em] text-mist/90">
                  1. 认识「核心演员」
                </p>
                <div className="mt-4 flex flex-col gap-2.5">
                  {CORE_ACTORS.map((a) => (
                    <div
                      key={a.name}
                      className="border border-white/10 bg-white/5 px-5 py-4 backdrop-blur-md"
                    >
                      <div className="flex items-baseline gap-3">
                        <span className="text-[clamp(1.125rem,1.3vw,1.55rem)] leading-none">{a.icon}</span>
                        <span className="text-[clamp(0.9375rem,1vw,1.2rem)] font-bold tracking-[0.05em] text-mist">
                          {a.name}
                        </span>
                      </div>
                      <p className="serif-body mt-1.5 text-[clamp(0.9375rem,0.95vw,1.125rem)] font-medium leading-[1.65] text-mist/80">
                        {a.desc}
                      </p>
                      {a.note && (
                        <p className="mt-2.5 border-l-2 border-white/20 pl-4 text-[clamp(0.8125rem,0.85vw,1rem)] font-semibold leading-[1.65] text-mist/70">
                          {a.note}
                        </p>
                      )}
                    </div>
                  ))}
                </div>

                {/* ---------- 你的三巨头 ---------- */}
                <div className="mt-4 grid gap-2.5 sm:grid-cols-3">
                  {[
                    { k: '太阳', v: sun },
                    { k: '月亮', v: moon },
                    { k: '上升', v: rising },
                  ].map((b) => (
                    <div
                      key={b.k}
                      className="border border-white/10 bg-white/5 px-4 py-4 text-center backdrop-blur-md"
                    >
                      <p className="text-[clamp(0.6875rem,0.72vw,0.8125rem)] font-bold tracking-[0.22em] text-mist/60">
                        {b.k}
                      </p>
                      <p
                        className="serif-title mt-1.5 text-[clamp(1rem,1.1vw,1.3rem)] font-semibold tracking-[0.06em]"
                        style={{ color: accent ?? '#e6ecf7' }}
                      >
                        {b.v}
                      </p>
                    </div>
                  ))}
                </div>
              </section>

              <span className="mt-9 block h-px w-full bg-white/10" />

              {/* ---------- 核心教学内容 2：戏服风格 ---------- */}
              <section className="mt-9">
                <p className="text-[clamp(0.9375rem,1vw,1.2rem)] font-bold tracking-[0.1em] text-mist/90">
                  2. 认识「戏服风格」（四大元素）
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {ELEMENTS.map((e) => (
                    <div
                      key={e.name}
                      className="border border-white/10 bg-white/5 px-5 py-5 backdrop-blur-md"
                    >
                      <div className="flex items-baseline gap-3">
                        <span className="text-[clamp(1.125rem,1.3vw,1.55rem)] leading-none">{e.icon}</span>
                        <span
                          className="serif-title text-[clamp(1rem,1.1vw,1.3rem)] font-semibold tracking-[0.06em]"
                          style={{ color: e.color }}
                        >
                          {e.name}
                        </span>
                      </div>
                      <p className="mt-2 text-[clamp(0.75rem,0.78vw,0.9375rem)] font-semibold tracking-[0.1em] text-mist/60">
                        {e.signs}
                      </p>
                      <p className="serif-body mt-2 text-[clamp(0.9375rem,0.95vw,1.125rem)] font-medium leading-[1.65] text-mist/80">
                        {e.desc}
                      </p>
                    </div>
                  ))}
                </div>
              </section>

              <span className="mt-9 block h-px w-full bg-white/10" />

              {/* ---------- 核心教学内容 3：人生舞台 ---------- */}
              <section className="mt-9">
                <p className="text-[clamp(0.9375rem,1vw,1.2rem)] font-bold tracking-[0.1em] text-mist/90">
                  3. 认识「人生舞台」（四大核心宫位）
                </p>
                <div className="mt-4 flex flex-col gap-2.5">
                  {HOUSES.map((h) => (
                    <div
                      key={h.n}
                      className="flex items-baseline gap-6 border border-white/10 bg-white/5 px-5 py-4 backdrop-blur-md"
                    >
                      <span
                        className="serif-title shrink-0 text-[clamp(0.9375rem,1vw,1.2rem)] font-semibold tracking-[0.06em] text-mist/70"
                      >
                        {h.n}
                      </span>
                      <span
                        className="serif-title shrink-0 text-[clamp(1rem,1.1vw,1.3rem)] font-semibold tracking-[0.06em]"
                        style={{ color: accent ?? '#e6ecf7' }}
                      >
                        {h.name}
                      </span>
                      <span className="shrink-0 text-[clamp(0.875rem,0.92vw,1.1rem)] font-bold text-mist/50">
                        {h.quote}
                      </span>
                      <span className="serif-body text-[clamp(0.9375rem,0.95vw,1.125rem)] font-medium leading-[1.6] text-mist/80">
                        {h.desc}
                      </span>
                    </div>
                  ))}
                </div>
              </section>

              <span className="mt-9 block h-px w-full bg-white/10" />

              {/* ---------- 自我实操步骤 ---------- */}
              <section className="mt-9">
                <h3 className="serif-title t-sub text-mist">
                  自我实操步骤
                </h3>
                <ol className="mt-5 flex flex-col gap-3">
                  {STEPS.map((s) => (
                    <li
                      key={s.n}
                      className="border border-white/10 bg-white/5 px-5 py-5 backdrop-blur-md"
                    >
                      <div className="flex items-baseline gap-4">
                        <span
                          className="text-[clamp(0.6875rem,0.72vw,0.8125rem)] font-bold tracking-[0.24em]"
                          style={{ color: accent ?? '#e6ecf7' }}
                        >
                          {s.n}
                        </span>
                        <span className="serif-title text-[clamp(1rem,1.1vw,1.3rem)] font-semibold tracking-[0.06em] text-mist">
                          {s.t}
                        </span>
                      </div>
                      <p className="serif-body mt-2 text-[clamp(0.9375rem,0.95vw,1.125rem)] font-medium leading-[1.65] text-mist/80">
                        {s.d}
                      </p>
                    </li>
                  ))}
                </ol>
              </section>

              <span className="mt-9 block h-px w-full bg-white/10" />

              {/* ---------- 免责 ---------- */}
              <p className="serif-body mt-7 text-[clamp(0.875rem,0.9vw,1.0625rem)] font-medium leading-[1.7] text-mist/65">
                占星给的是倾向，不是判决。
                天空只描述能量怎么分布，怎么用它，始终由你决定。
                把它当镜子看，别当命令书。
              </p>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
