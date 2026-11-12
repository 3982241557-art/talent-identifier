import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { Chart, ChatTurn, MbtiProfile } from '../../types'
import { Astrolabe } from '../dashboard/Astrolabe'
import { TalentMatrix } from '../dashboard/TalentMatrix'
import {
  FortuneCard,
  FortuneDimensions,
  TransitScale,
  fortuneText,
  localFortune,
  type FortuneScope,
} from '../dashboard/FortuneCard'
import { HistoryPanel } from '../dashboard/HistoryPanel'
import { ChatDock } from '../chat/ChatDock'
import { StarOrbits } from '../dashboard/StarOrbits'
import { MbtiHub } from '../dashboard/MbtiHub'
import { AstrologyDrawer } from '../dashboard/AstrologyDrawer'
import { AuroraBackdrop } from '../dashboard/AuroraBackdrop'
import { TarotOverlay } from '../dashboard/TarotOverlay'
import { SpaceGuide } from '../dashboard/SpaceGuide'
import {
  ParallaxBackdrop,
  ParallaxCard,
  ParallaxCore,
  ParallaxSpace,
} from '../dashboard/ParallaxSpace'
import { blendedTheme } from '../../data/elementThemes'
import { MBTI_TYPES } from '../../data/mbtiTypes'
import { useApp } from '../../store/AppContext'
import {
  appendTurn,
  recordFortune,
  saveProfile,
  todayKey,
} from '../../lib/storage'
import { postFortune, type MultiFortuneResult } from '../../lib/api'
import { readTodayTarot } from '../../lib/tarot'
import {
  FLOAT_AMPLITUDE,
  ORBIT_AMPLITUDE,
  SCENE_CARDS,
  solveScene,
  type PlacedCard,
  type SceneCardSpec,
} from '../../lib/sceneLayout'

/* ============================================================
 *  P4 · 主页 —— 3D 立体环绕星盘仪表盘（v7.0）
 *
 *  v7.0 变更（任务 4：彻底打破 Flow Layout）：
 *   · **放弃一切流式布局**。整个主体是一个 `position: relative` 的
 *     绝对定位坐标系，容器本身 `perspective: 1400px` 建立 Z 轴。
 *   · 星盘放在**绝对正中央**，尺寸由求解器尽可能放大（接近容器极限）。
 *   · 5~6 张功能卡片不再是「左右两翼对齐的网格」，
 *     而是按**方位角**摆到与星盘偏移圆**相切**的位置上 ——
 *     v8.0「引力聚拢」：卡片紧贴星盘外发光边缘，形成一圈卫星带。
 *   · 每张卡片的 **尺寸 / 宽高 / Z 深度 / 浮动周期 / 延迟** 全都不同，
 *     形成真正的「错落 + 立体悬浮」质感。
 *   · 单屏锁定：容器 `overflow: hidden`，绝不出现滚动条。
 * ============================================================ */

interface DashboardStageProps {
  chart: Chart
  onRestart: () => void
  onEditMbti: () => void
}

/** 可展开的覆盖层面板 */
type Overlay = 'mbti' | 'talent' | 'fortune' | 'history' | 'chat' | null

/** 布局槽位 */
type SlotId = Exclude<Overlay, null> | 'tip'

export function DashboardStage({
  chart,
  onRestart,
  onEditMbti,
}: DashboardStageProps) {
  const { state, dispatch } = useApp()
  const [overlay, setOverlay] = useState<Overlay>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  /** 塔罗抽牌浮层（v7.0 · 任务 5） */
  const [tarotOpen, setTarotOpen] = useState(false)

  const element = chart.bigThree.sun.sign.element
  /*
   * v9.0 · 任务 3：双元素混合主题。
   * 太阳星座给主调（骨架），上升星座给辅调（外在呈现）。
   * accent 是为核心标题准备的**高对比强调色**。
   */
  const theme = useMemo(
    () => blendedTheme(chart.bigThree.sun.sign, chart.bigThree.rising.sign),
    [chart.bigThree.sun.sign, chart.bigThree.rising.sign],
  )
  const mbti = state.mbti as MbtiProfile | null

  const year = useMemo(() => fortuneText(chart, 'year'), [chart])
  const month = useMemo(() => fortuneText(chart, 'month'), [chart])
  const day = useMemo(() => fortuneText(chart, 'day'), [chart])

  /* ---------- 四维运势（AI 优先，本地兜底） ---------- */
  const [fortunes, setFortunes] = useState<
    Record<FortuneScope, MultiFortuneResult | null>
  >({ year: null, month: null, day: null })

  const loadFortune = useCallback(
    async (scope: FortuneScope) => {
      try {
        const res = await postFortune({ chart, mbti, scope })
        setFortunes((prev) => ({ ...prev, [scope]: res }))
      } catch {
        setFortunes((prev) => ({ ...prev, [scope]: localFortune(chart, scope) }))
      }
    },
    [chart, mbti],
  )

  /* ---------- 当日聊天记录 ---------- */
  const today = todayKey()
  const dayRecord = state.profile.days.find((d) => d.date === today)
  const turns: ChatTurn[] = dayRecord?.turns ?? []

  /* ---------- v7.0 · 今日是否已抽过塔罗 ---------- */
  const tarotRecord = useMemo(() => readTodayTarot(today), [today])

  const handleSend = useCallback(
    (turn: ChatTurn) => {
      const next = appendTurn(state.profile, turn, today)
      dispatch({ type: 'setProfile', profile: next })
      saveProfile(next)
    },
    [state.profile, dispatch, today],
  )

  /* ---------- 记录当日运势快照 ---------- */
  const handleRecordFortune = useCallback(() => {
    const next = recordFortune(state.profile, today, day.title, day.body)
    dispatch({ type: 'setProfile', profile: next })
    saveProfile(next)
  }, [state.profile, dispatch, today, day.title, day.body])

  /* ---------- 本地兜底应答 ---------- */
  const fallback = useCallback(
    (message: string) => {
      const m = message.trim()
      if (/星盘|宫|星座|行星|上升|太阳|月亮/.test(m)) {
        return `你星盘中央的圆盘就是答案本身：外圈是黄道十二宫，刻度标出每一度；` +
          `圆环上的点是行星的真实落点。你的太阳在${chart.bigThree.sun.sign.cn}，` +
          `月亮在${chart.bigThree.moon.sign.cn}，上升在${chart.bigThree.rising.sign.cn}。` +
          `想深挖哪一个？`
      }
      if (/运势|今天|今日|年度|日子/.test(m)) {
        return `今日的提示是：${day.body}` +
          `天空给的是倾向，不是判决 —— 迈不迈步，始终由你决定。`
      }
      if (/mbti|性格|解码|类型/i.test(m)) {
        return `你的性格底色是 ${mbti?.type ?? '未记录'}。` +
          `环绕星盘的「MBTI 解码」卡片里有完整的类型解释、优势清单，` +
          `还有一群和你同类型的代表人物。`
      }
      if (/怎么|哪里|点击|功能|页面/.test(m)) {
        return `你可以从中央的星盘开始读：外圈是十二宫，折线锚点标出火土风水四大元素的占比；` +
          `四周浮动的卡片是「MBTI 解码」「天赋解析」「运势」等入口，点开就能展开；` +
          `右上角的「何为星盘？」随时能调出计算逻辑。`
      }
      return `我听见了。你的话我记下了 —— 把这件事再说一遍，或者试着问它与星盘的关系。` +
        `不过别急，先说说，是什么让你今天想开口？`
    },
    [chart, day.body, mbti],
  )

  /* ---------- Esc 关闭覆盖层 ---------- */
  useEffect(() => {
    if (!overlay) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOverlay(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [overlay])

  /* ---------- 打开运势面板时按需拉取四维运势 ---------- */
  useEffect(() => {
    if (overlay !== 'fortune') return
    for (const scope of ['year', 'month', 'day'] as FortuneScope[]) {
      if (!fortunes[scope]) void loadFortune(scope)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlay])

  const bigThree = [
    { k: '太阳', s: chart.bigThree.sun.sign },
    { k: '月亮', s: chart.bigThree.moon.sign },
    { k: '上升', s: chart.bigThree.rising.sign },
  ] as const

  /* ---------- 主体容器尺寸测量 ---------- */
  const mainRef = useRef<HTMLDivElement>(null)
  /* v10.0：星盘中心 —— 3D 倾斜的支点。
     指针正落在星盘上时，倾斜恰好为零（最自然的手感）。 */
  const coreRef = useRef<HTMLDivElement>(null)
  const [mainSize, setMainSize] = useState({ w: 1200, h: 700 })

  useEffect(() => {
    const el = mainRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      setMainSize({ w: el.clientWidth, h: el.clientHeight })
    })
    ro.observe(el)
    setMainSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  /* ============================================================
   *  3D 环绕布局求解器（v7.0 · 任务 4）
   *
   *  【设计思路】
   *  卡片不再按「左翼 / 右翼」堆叠，而是分配到一圈**极坐标锚点**：
   *    · angle  —— 相对中心的角度（0° = 正上方，顺时针）
   *    · rad    —— 距中心的距离（以星盘视觉半径的倍数计）
   *    · z      —— Z 轴深度（translateZ，>0 更靠近观众）
   *
   *  求解器的目标：**让中央星盘尽可能大**，
   *  同时保证：
   *    1. 所有卡片不越出容器
   *    2. 卡片之间不重叠
   *    3. 卡片不压住星盘圆盘
   *
   *  实现：对星盘尺寸做二分搜索，取最大可行值。
   * ============================================================ */

  /* ============================================================
   *  3D 场景布局（v10.0）
   *
   *  全部在**屏幕空间**求解，再反投影回 2D 定位坐标。
   *  这样透视放大被精确抵消 —— 卡片绝不会穿模压到星盘。
   * ============================================================ */
  const layout = useMemo(() => {
    const W = mainSize.w
    const H = mainSize.h

    /* 小屏时整体缩放卡片，优先保证文字可读 */
    const scale = Math.max(
      0.46,
      Math.min(1, Math.min(W / 1500, H / 760)),
    )
    const specs: SceneCardSpec[] = SCENE_CARDS.map((c) => ({
      ...c,
      w: Math.round(c.w * scale),
      h: Math.round(c.h * scale),
    }))

    const solved = solveScene(W, H, specs)
    const byId = new Map(solved.cards.map((c) => [c.id, c]))
    return { ...solved, byId, specs }
  }, [mainSize])

  const astrolabeSize = layout.astrolabeSize

  /* ---------- 环绕卡片的内容 ---------- */
  const orbits = useMemo<Array<{
    id: SlotId
    label: string
    title: string
    hint: string
    accent: string
  }>>(() => [
    {
      id: 'mbti',
      label: 'MBTI RESONANCE',
      title: 'MBTI 解码',
      hint: mbti
        ? `${mbti.type} · ${MBTI_TYPES[mbti.type]?.nickname ?? ''}`
        : '还没有性格底色记录',
      accent: theme.primary,
    },
    {
      id: 'talent',
      label: 'TALENT MATRIX',
      title: '天赋解析',
      hint: '战略规划 · 艺术创想 · 资源整合',
      accent: theme.secondary,
    },
    {
      id: 'fortune',
      label: 'FORTUNE',
      title: '运势',
      hint: '事业 · 财富 · 健康 · 感情',
      accent: theme.primary,
    },
    {
      id: 'history',
      label: 'PAST',
      title: '往日运势',
      hint: `${state.profile.days.length} 条记录`,
      accent: theme.secondary,
    },
    {
      id: 'chat',
      label: 'CHAT',
      title: '与智者对话',
      hint: `${turns.length} 条消息`,
      accent: theme.primary,
    },
  ], [theme.primary, theme.secondary, mbti, state.profile.days.length, turns.length])

  /** 环绕卡片（不含塔罗入口）—— 带上屏幕空间落位 */
  const orbitPositions = useMemo(
    () =>
      orbits
        .map((o) => {
          const placed = layout.byId.get(o.id)
          if (!placed) return null
          const spec = layout.specs.find((x) => x.id === o.id)
          if (!spec) return null
          return { ...o, placed, spec }
        })
        .filter(Boolean) as Array<
        (typeof orbits)[number] & {
          placed: PlacedCard
          spec: SceneCardSpec
        }
      >,
    [layout, orbits],
  )

  /** 塔罗入口卡片 */
  const tipCard = useMemo(() => {
    const placed = layout.byId.get('tip')
    const spec = layout.specs.find((x) => x.id === 'tip')
    if (!placed || !spec) return null
    return { placed, spec }
  }, [layout])

  return (
    <div className="relative h-screen w-full overflow-hidden bg-[#080d1e]">
      {/* ============================================================
           v10.0 · 3D 立体空间（framer-motion 物理引擎）
             · 单一指针源 + 一根物理弹簧，全场景同步
             · 背景层（Z -600）反向微移 → 推远
             · 星盘核心（Z 0）固定正中央，只做 ±8° 轻微歪头
             · 悬浮卡片（Z -24 ~ 118）沿切线公转，永不侵入星盘
           ============================================================ */}
      {/* v10.0：perspective-origin 对齐到 main 的中心 ——
          main 中心 === 透视原点 === 布局求解原点 === 星盘旋转支点，
          四者必须完全重合，否则投影会把卡片整体拉偏。 */}
      <ParallaxSpace originRef={mainRef}>
        {/* ---------- 背景层（最远） ---------- */}
        <ParallaxBackdrop>
          <AuroraBackdrop
            primary={theme.primary}
            secondary={theme.secondary}
            ambient={theme.ambient}
          />
          <StarOrbits />
        </ParallaxBackdrop>

        {/* ---------- 内容层 ----------
             v10.0：**不能**加 overflow-hidden ——
             MDN：overflow 会把 preserve-3d 压平成 flat，
             星盘的厚度感会彻底消失。裁切交给最外层容器。 */}
        <div
          className="relative flex h-full w-full flex-col px-6 py-5 sm:px-10"
          style={{ transformStyle: 'preserve-3d' }}
        >
          {/* ---------- 顶部栏 ---------- */}
          <header className="screen-fixed flex shrink-0 items-start justify-between gap-6">
            <div className="flex flex-col gap-3">
              {/* ---------- 主标题 + 太阳星座（强调色） ----------
                  v9.0：星座名用独立的 accent 强调色，
                  与主题主调形成高对比，一眼就能抓住。 */}
              <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
                <div className="flex flex-col gap-1">
                  <p className="serif-title text-[clamp(1.25rem,1.6vw,1.85rem)] font-semibold tracking-[0.2em] text-mist">
                    天赋识别器
                  </p>
                  <p className="text-[clamp(0.625rem,0.7vw,0.8125rem)] font-semibold tracking-[0.4em] text-mist/55">
                    TALENT IDENTIFIER
                  </p>
                </div>

                {/* ---------- 你的底色 · 强调色大字 ----------
                    v11.0 · 任务 3：把「太阳星座」换成「你的底色」——
                    星座名本身仍然保留（它是大众文化里最好懂的符号），
                    但不再要求用户理解「太阳星座」这个概念。 */}
                <div className="flex items-baseline gap-2">
                  <span
                    className="serif-title text-[clamp(1.5rem,2.1vw,2.6rem)] font-bold leading-none"
                    style={{
                      color: theme.accent,
                      textShadow: `0 0 26px ${theme.accent}88`,
                    }}
                  >
                    {chart.bigThree.sun.sign.cn}
                  </span>
                  <span className="text-[clamp(0.6875rem,0.75vw,0.875rem)] font-semibold tracking-[0.24em] text-mist/55">
                    你的底色
                  </span>
                </div>

                {mbti && (
                  <span
                    className="hidden text-[clamp(0.9375rem,1.05vw,1.25rem)] font-semibold tracking-[0.24em] sm:inline"
                    style={{ color: theme.primary }}
                  >
                    {mbti.type}
                  </span>
                )}
              </div>
              <ConceptNote accent={theme.primary} />
            </div>

          <div className="flex items-center gap-6">
            {/* ---------- 右上角：三巨头星座图标 ---------- */}
            <div className="flex items-center gap-2 sm:gap-3">
              {bigThree.map((item) => (
                <div
                  key={item.k}
                  title={`${item.k} · ${item.s.cn}`}
                  className="flex flex-col items-center rounded-sm px-2.5 py-1.5 transition-colors duration-500 hover:bg-white/8"
                  style={{ boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.10)' }}
                >
                  <span
                    className="serif-title text-[clamp(1.375rem,1.7vw,2rem)] font-semibold leading-none"
                    style={{
                      color: theme.primary,
                      textShadow: `0 0 18px ${theme.primary}99`,
                    }}
                  >
                    {item.s.glyph}
                  </span>
                  <span className="mt-1 text-[clamp(0.625rem,0.68vw,0.8125rem)] font-semibold tracking-[0.12em] text-mist/85">
                    {item.k}
                  </span>
                </div>
              ))}
            </div>

            <span className="hidden h-8 w-px bg-white/12 sm:block" />

            <button
              onClick={() => setDrawerOpen(true)}
              className="border-0 bg-transparent pb-1 text-[clamp(0.875rem,0.95vw,1.125rem)] font-semibold tracking-[0.2em] text-mist/80 transition-colors duration-700 hover:text-mist focus:outline-none"
            >
              何为星盘？
            </button>
            <button
              onClick={() => setConfirmOpen(true)}
              className="border-0 bg-transparent pb-1 text-[clamp(0.875rem,0.95vw,1.125rem)] font-semibold tracking-[0.2em] text-mist/65 transition-colors duration-700 hover:text-mist focus:outline-none"
            >
              重新开始
            </button>
          </div>
        </header>

        {/* ============================================================
             主体：绝对定位坐标系 + 3D 透视
             —— 这里彻底放弃 Flow Layout，一切靠 absolute + transform
             ============================================================ */}
        <main
          ref={mainRef}
          className="relative mt-3 min-h-0 flex-1"
          style={{ transformStyle: 'preserve-3d' }}
        >
          {/* ---------- 中央星盘（绝对正中央 · 最大尺寸） ----------
               v9.0：包在 ParallaxCore 里 —— 跟随鼠标做 3D 倾斜，
               星盘的「厚度感」由此而来。 */}
          {/* ---------- 中央星盘（Z = 0，固定正中央） ----------
               v10.0：ParallaxCore 只做 ±8° 的轻微歪头，
               绝不平移、绝不缩放 —— 星盘永远钉在正中央。 */}
          <ParallaxCore className="absolute inset-0">
            {/*
              v10.0：外层 absolute inset-0 负责定位；
              ParallaxCore 内部用 flex 居中并绕**星盘自身中心**做 ±8° 歪头。
              星盘因此真正钉在正中央，不会随鼠标甩偏。
            */}
            {/*
              入场动画放在**最内层**（星盘本体），
              不用 scale —— 因为 framer-motion 会用 scale 覆写
              整条 inline transform，把 ParallaxCore 的定位吃掉。
              这里用 opacity + filter 制造「浮现」感，零 transform 冲突。
            */}
            <motion.div
              initial={{ opacity: 0, filter: 'blur(14px)' }}
              animate={{ opacity: 1, filter: 'blur(0px)' }}
              transition={{ duration: 2.2, ease: 'easeOut' }}
              className="relative"
              style={{ transformStyle: 'preserve-3d' }}
            >
              {/* 背后柔光 —— 建立 Z 轴纵深
               *
               * v8.0：光晕从 1.42× 收到 **1.10×**。
               * 之前那圈巨大的光雾扩散到了卡片之外，
               * 让「星盘的外发光边缘」远在卡片身后，
               * 聚拢感荡然无存。收紧后，光晕的可见边缘
               * 正好落在卡片内边缘附近，形成真正的引力场。
               */}
              <div
                className="breathe pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{
                  width: astrolabeSize * 1.1,
                  height: astrolabeSize * 1.1,
                  background: `radial-gradient(circle, ${theme.ambient} 0%, ${theme.primary}26 42%, rgba(0,0,0,0) 72%)`,
                  opacity: 0.62,
                  filter: 'blur(14px)',
                }}
              />
              {/* 星盘本体 —— drop-shadow 建立立体感 */}
              <div
                ref={coreRef}
                className="relative"
                style={{
                  filter: `drop-shadow(0 0 46px ${theme.primary}33) drop-shadow(0 22px 60px rgba(0,0,0,0.62))`,
                }}
              >
                <Astrolabe chart={chart} size={astrolabeSize} />
                {/* 零尺寸的中心标记 —— 用来精确测量星盘的投影中心。
                    （SVG 被 3D 旋转后 getBoundingClientRect 会给出
                      旋转后包围盒，其中心不再等于真实投影中心。） */}
                <span
                  data-astrolabe-center
                  className="pointer-events-none absolute left-1/2 top-1/2 block h-0 w-0"
                />
              </div>
            </motion.div>
          </ParallaxCore>

          {/* ---------- 悬浮前景卡片（v10.0） ----------
               Z 深度恒定（不随鼠标缩放）；
               视差位移沿**切线**方向 —— 只会离圆心更远，
               结构上不可能压到中心星盘。 */}
          {orbitPositions.map((o) => (
            <ParallaxCard
              key={o.id}
              depth={o.spec.z}
              angle={o.spec.angle}
              orbit={ORBIT_AMPLITUDE}
              className="absolute"
              /* v11.0 · 任务 5：新手引导靠这个属性定位高亮框 */
              data-guide-id={o.id}
              style={{
                left: o.placed.layout.left,
                top: o.placed.layout.top,
                width: o.placed.layout.width,
                height: o.placed.layout.height,
              }}
            >
              <OrbitCard
                label={o.label}
                title={o.title}
                hint={o.hint}
                accent={o.accent}
                floatDur={o.spec.floatDur}
                floatDelay={o.spec.floatDelay}
                tilt={o.spec.tilt}
                onOpen={() => setOverlay(o.id as Overlay)}
              />
            </ParallaxCard>
          ))}

          {/* ---------- 每日灵感抽牌（塔罗入口） ---------- */}
          {tipCard && (
            <ParallaxCard
              depth={tipCard.spec.z}
              angle={tipCard.spec.angle}
              orbit={ORBIT_AMPLITUDE}
              className="absolute"
              /* v11.0 · 任务 5 */
              data-guide-id="tip"
              style={{
                left: tipCard.placed.layout.left,
                top: tipCard.placed.layout.top,
                width: tipCard.placed.layout.width,
                height: tipCard.placed.layout.height,
              }}
            >
              <OrbitCard
                label="TAROT"
                title="每日灵感抽牌"
                hint={
                  tarotRecord
                    ? '今日已抽 · 明日重洗'
                    : '七张牌背朝上 · 点开翻一张'
                }
                accent={theme.secondary}
                floatDur={tipCard.spec.floatDur}
                floatDelay={tipCard.spec.floatDelay}
                tilt={tipCard.spec.tilt}
                onOpen={() => setTarotOpen(true)}
                badge={tarotRecord ? '今日已抽' : undefined}
              />
            </ParallaxCard>
          )}
        </main>

        {/* ---------- 页脚 ---------- */}
        <footer className="shrink-0 pt-3 text-center">
          <p className="text-[clamp(0.6875rem,0.75vw,0.875rem)] font-semibold tracking-[0.26em] text-mist/50">
            {chart.source === 'ephemeris'
              ? `真实星历 · ${chart.engine ?? 'Swiss Ephemeris'} · ${
                  chart.houseSystemName ?? 'Placidus'
                } · 经纬度 ${chart.coordinates?.latitude?.toFixed(2)}, ${chart.coordinates?.longitude?.toFixed(2)}`
              : '本地推演星盘 · 星象给的是倾向，不是判决'}
          </p>
        </footer>
        </div>
      </ParallaxSpace>

      {/* ============================================================
           v11.0 · 任务 5 · 3D 空间新手视觉指引
           首次进入主页时，逐个高亮四周的悬浮卡片，
           配一句话说明这个板块是干嘛的。
           ============================================================ */}
      <SpaceGuide accent={theme.primary} />

      {/* ---------- 展开覆盖层 ---------- */}
      <AnimatePresence>
        {overlay && (
          <OverlayPanel
            title={
              overlay === 'mbti'
                ? 'MBTI 解码'
                : overlay === 'talent'
                  ? '天赋解析'
                  : overlay === 'fortune'
                    ? '运势'
                    : overlay === 'history'
                      ? '往日运势'
                      : '与智者对话'
            }
            accent={theme.primary}
            onClose={() => setOverlay(null)}
          >
            {overlay === 'mbti' && (
              <MbtiHub
                mbti={mbti}
                accent={theme.primary}
                accent2={theme.secondary}
                onEdit={onEditMbti}
              />
            )}

            {overlay === 'talent' && (
              <TalentMatrix
                chart={chart}
                mbti={mbti}
                alwaysOpen
                onResult={(t) => dispatch({ type: 'setTalent', talent: t })}
              />
            )}

            {overlay === 'fortune' && (
              <div className="space-y-14">
                {/* ---- 年度 ---- */}
                <section>
                  <FortuneCard
                    subtitle={year.subtitle}
                    title={year.title}
                    body={year.body}
                    index={0}
                    accent={theme.primary}
                  >
                    <div className="mt-7 border-t border-white/10 pt-6">
                      <FortuneDimensions
                        result={fortunes.year}
                        accent={theme.primary}
                      />
                    </div>
                    <div className="mt-6 border-t border-white/10 pt-6">
                      <TransitScale chart={chart} />
                    </div>
                  </FortuneCard>
                </section>

                {/* ---- 月度 ---- */}
                <section>
                  <FortuneCard
                    subtitle={month.subtitle}
                    title={month.title}
                    body={month.body}
                    index={1}
                    accent={theme.secondary}
                  >
                    <div className="mt-7 border-t border-white/10 pt-6">
                      <FortuneDimensions
                        result={fortunes.month}
                        accent={theme.secondary}
                      />
                    </div>
                    {/*
                      v11.0 · 任务 3：去占星术语化。
                      旧版：「水星 · 双子座 · 第 9 宫 · 逆行」——
                      这行字对占星爱好者是速记，对普通用户是乱码。
                      现在只说它在**做什么**。
                    */}
                    <div className="mt-6 space-y-2.5 border-t border-white/10 pt-6">
                      <p className="text-[12.5px] font-bold tracking-[0.32em] text-mist/50">
                        本 月 的 四 份 力 量
                      </p>
                      {chart.planets.slice(0, 4).map((p) => (
                        <p
                          key={p.planet}
                          className="text-[15.5px] font-medium leading-[1.6] text-mist/70"
                        >
                          {planetPlain(p.planetCn, p.retrograde)} ——{' '}
                          {housePlain(p.house)}，带着{p.sign.cn}的劲。
                        </p>
                      ))}
                    </div>
                  </FortuneCard>
                </section>

                {/* ---- 每日 ---- */}
                <section>
                  <FortuneCard
                    subtitle={day.subtitle}
                    title={day.title}
                    body={day.body}
                    index={2}
                    accent={theme.primary}
                  >
                    <div className="mt-7 border-t border-white/10 pt-6">
                      <FortuneDimensions
                        result={fortunes.day}
                        accent={theme.primary}
                      />
                    </div>
                    <div className="mt-6 border-t border-white/10 pt-6">
                      {/* v11.0 · 任务 3：相位术语换成白话 */}
                      <p className="serif-body text-[16px] font-semibold leading-[1.6] text-mist/80">
                        {chart.aspects[0]
                          ? `今天你身上有两种力量在互相拉扯：${
                              aspectPlain(chart.aspects[0].aCn ?? chart.aspects[0].a)
                            }和${
                              aspectPlain(chart.aspects[0].bCn ?? chart.aspects[0].b)
                            }。`
                          : '今天你身上的力量很统一，没有互相拉扯。'}
                        {chart.aspects[0]
                          ? '天空安静的时候，正好听听自己。'
                          : '安静的一天，留给自己。'}
                      </p>
                      <button
                        onClick={handleRecordFortune}
                        className="mt-5 border-0 bg-transparent pb-0.5 text-[15px] font-bold tracking-[0.28em] text-mist/70 transition-colors duration-700 hover:text-mist focus:outline-none"
                      >
                        存入往日运势 →
                      </button>
                    </div>
                  </FortuneCard>
                </section>
              </div>
            )}

            {overlay === 'history' && (
              <HistoryPanel days={state.profile.days} element={element} />
            )}

            {overlay === 'chat' && (
              <ChatDock
                chart={chart}
                mbti={mbti}
                history={turns}
                onSend={handleSend}
                fortune={{ title: day.title, body: day.body }}
                fallback={fallback}
              />
            )}
          </OverlayPanel>
        )}
      </AnimatePresence>

      {/* ---------- 何为星盘？科普方框 ---------- */}
      <AstrologyDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        accent={theme.primary}
        bigThree={{
          sun: chart.bigThree.sun.sign.cn,
          moon: chart.bigThree.moon.sign.cn,
          rising: chart.bigThree.rising.sign.cn,
        }}
      />

      {/* ---------- 塔罗抽牌浮层（任务 5） ---------- */}
      <AnimatePresence>
        {tarotOpen && (
          <TarotOverlay
            open={tarotOpen}
            chart={chart}
            mbti={mbti}
            accent={theme.secondary}
            onClose={() => setTarotOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* ---------- 重新开始确认弹窗 ---------- */}
      <AnimatePresence>
        {confirmOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-[120] flex items-center justify-center bg-black/45 px-8 backdrop-blur-[6px]"
            onClick={() => setConfirmOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 24, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.97 }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
              className="w-[min(560px,92vw)] border border-white/12 bg-white/8 px-10 py-11 backdrop-blur-md"
              style={{ boxShadow: '0 30px 90px rgba(0,0,0,0.6)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-[13.5px] font-bold tracking-[0.5em] text-mist/60">
                CONFIRM
              </p>
              <h3 className="serif-title mt-2 text-[clamp(1.5rem,1.9vw,2.4rem)] font-semibold tracking-[0.1em] text-mist">
                确认重新开始？
              </h3>
              <span className="mt-6 block h-px w-full bg-white/12" />
              <p className="serif-body mt-6 text-[19px] font-semibold leading-[1.62] text-mist/90">
                重新开始将清除您当前的所有星盘与答题数据，是否确认继续？
              </p>
              <p className="mt-4 text-[16.5px] font-semibold leading-[1.58] text-mist/70">
                出生信息、MBTI 答案、本命星盘、往日运势与对话记录都会被清空，
                且无法恢复。
              </p>
              <div className="mt-9 flex items-center justify-end gap-6">
                <button
                  onClick={() => setConfirmOpen(false)}
                  className="border-0 bg-transparent pb-1 text-[18px] font-semibold tracking-[0.26em] text-mist/75 transition-colors duration-500 hover:text-mist focus:outline-none"
                >
                  取消
                </button>
                <button
                  onClick={() => {
                    setConfirmOpen(false)
                    onRestart()
                  }}
                  className="border border-white/20 bg-white/12 px-9 py-4 text-[18px] font-semibold tracking-[0.22em] text-mist backdrop-blur-md transition-colors duration-500 hover:bg-white/20 focus:outline-none"
                >
                  确认清除
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ============================================================
 *  概念区分提示
 * ============================================================ */
function ConceptNote({ accent }: { accent: string }) {
  return (
    <div
      className="pointer-events-none inline-flex max-w-[min(560px,52vw)] items-center gap-3 border border-white/10 bg-white/5 px-4 py-1.5 backdrop-blur-md"
      style={{ boxShadow: '0 8px 26px rgba(0,0,0,0.32)' }}
    >
      <span
        className="shrink-0 text-[clamp(0.5625rem,0.6vw,0.6875rem)] font-bold tracking-[0.22em]"
        style={{ color: accent }}
      >
        NOTE
      </span>
      <p className="text-[clamp(0.6875rem,0.75vw,0.875rem)] font-semibold tracking-[0.04em] text-mist/70">
        日常说的「星座」通常只是其中一块。
        <span className="font-semibold text-mist/90">而这张是完整的一幅</span>
        —— 你的情绪、你的外在、你的人生十二个方面都在里面
      </p>
    </div>
  )
}

/* ============================================================
 *  3D 环绕浮动卡片（v7.0 · 任务 4）
 *
 *  三层结构，每层只负责一件事：
 *    外层 —— 绝对定位（left / top）
 *    中层 —— Z 轴深度 + 微倾（translateZ / rotateZ）
 *    内层 —— 浮动动画（translateY）
 *
 *  这样 transform 不会互相覆盖，
 *  卡片才能真正「悬浮」在三维宇宙里。
 * ============================================================ */
function OrbitCard({
  tilt,
  floatDur,
  floatDelay,
  label,
  title,
  hint,
  accent,
  onOpen,
  badge,
}: {
  tilt: number
  floatDur: number
  floatDelay: number
  label: string
  title: string
  hint: string
  accent: string
  onOpen: () => void
  badge?: string
}) {
  /*
   * v10.0：位置与 Z 深度由外层 <ParallaxCard> 负责，
   * 这里只做**浮动呼吸**（垂直方向的轻微起伏）。
   *
   * 浮动幅度必须小于布局求解时预留的 SAFE_CLEARANCE，
   * 否则卡片会在呼吸时蹭到星盘边缘。
   */
  return (
    <motion.div
      className="h-full w-full"
      animate={{ y: [0, -FLOAT_AMPLITUDE, 0] }}
      transition={{
        duration: floatDur,
        repeat: Infinity,
        ease: 'easeInOut',
        delay: floatDelay,
      }}
      style={{ transformStyle: 'preserve-3d' }}
    >
      <button
        onClick={onOpen}
        className="element-card group relative flex h-full w-full cursor-pointer flex-col border border-white/12 bg-white/5 px-5 py-4 text-left backdrop-blur-md transition-colors duration-500 hover:bg-white/10 focus:outline-none"
        style={{
          transform: `rotateZ(${tilt}deg)`,
          boxShadow:
            '0 22px 60px rgba(0,0,0,0.58), 0 2px 0 rgba(255,255,255,0.07) inset, 0 0 44px rgba(0,0,0,0.42)',
        }}
      >
        <span
          className="absolute left-0 top-0 h-px w-9 transition-all duration-700 group-hover:w-20"
          style={{ background: accent }}
        />
        <p className="text-[clamp(0.5625rem,0.6vw,0.6875rem)] font-bold tracking-[0.28em] text-mist/55">
          {label}
        </p>
        <h3 className="serif-title mt-1.5 text-[clamp(1.125rem,1.35vw,1.7rem)] font-semibold tracking-[0.06em] text-mist">
          {title}
        </h3>
        <p className="mt-1.5 text-[clamp(0.75rem,0.82vw,0.95rem)] font-semibold leading-[1.65] text-mist/70">
          {hint}
        </p>
        <span className="mt-auto flex items-center gap-3 pt-2.5">
          <span className="text-[clamp(0.6875rem,0.74vw,0.8125rem)] font-bold tracking-[0.2em] text-mist/60 transition-colors duration-700 group-hover:text-mist">
            展开 →
          </span>
          {badge && (
            <span
              className="border border-white/15 px-2 py-0.5 text-[clamp(0.5625rem,0.6vw,0.6875rem)] font-bold tracking-[0.14em]"
              style={{ color: accent }}
            >
              {badge}
            </span>
          )}
        </span>
      </button>
    </motion.div>
  )
}

/* ============================================================
 *  v11.0 · 任务 3 · 占星术语 → 白话 映射
 * ============================================================
 *
 *  底层数据不变，只是换一种说法。
 *  「第 9 宫」→ 「你的哪一块人生」；「逆行」→ 「往回收」。
 * ============================================================ */

/** 十二宫 → 白话 */
const HOUSE_PLAIN: Record<number, string> = {
  1: '给别人看的那一面',
  2: '你挣钱的本事',
  3: '你脑子的转速',
  4: '你安心的地方',
  5: '你玩得尽兴的部分',
  6: '你日常的节奏',
  7: '你一对一的关系',
  8: '你交出去的部分',
  9: '你信念撑起来的地方',
  10: '你往上走的那条路',
  11: '你一起往前走的人',
  12: '你独自消化的部分',
}

/** 宫位 → 白话短语 */
function housePlain(house: number): string {
  return HOUSE_PLAIN[house] ?? '你的人生里的一块'
}

/**
 * 行星 → 白话描述。
 *
 * 重点是「逆行」—— 这是最容易被误解的术语，
 * 用户常以为它是不祥的，其实只是「能量往回收、事情反复」。
 */
function planetPlain(planetCn: string, retrograde: boolean): string {
  const base: Record<string, string> = {
    太阳: '你的主心骨',
    月亮: '你的情绪',
    水星: '你的想法',
    金星: '你想要的东西',
    火星: '你的行动力',
    木星: '你的扩张力',
    土星: '你的耐力',
  }
  const label = base[planetCn] ?? planetCn
  return retrograde ? `${label}在往回收` : `${label}正往外走`
}

/**
 * 相位里的星体名 → 白话。
 *
 * 「太阳四分相土星」→ 「你的主心骨」和「你的耐力」在拉扯。
 */
function aspectPlain(name: string): string {
  const map: Record<string, string> = {
    太阳: '你的主心骨',
    月亮: '你的情绪',
    水星: '你的想法',
    金星: '你想要的东西',
    火星: '你的行动力',
    木星: '你的扩张力',
    土星: '你的耐力',
    海王星: '你的想象',
    天王星: '你的求新',
    冥王星: '你的深层渴望',
  }
  return map[name] ?? '一股力量'
}

/* ============================================================
 *  展开覆盖层 —— 高透毛玻璃，星空自然透出
 * ============================================================ */
function OverlayPanel({
  title,
  accent,
  onClose,
  children,
}: {
  title: string
  accent: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
      className="fixed inset-0 z-[110] flex items-end justify-center"
    >
      {/* 遮罩：极淡，不发灰 */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[5px]"
        onClick={onClose}
      />

      {/* 面板：从下方优雅升起 */}
      <motion.div
        initial={{ y: '100%', opacity: 0.4 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: '100%', opacity: 0.3 }}
        transition={{ duration: 0.62, ease: [0.32, 0.72, 0, 1] }}
        className="relative flex h-[88vh] w-full max-w-[1240px] flex-col overflow-hidden border-t bg-white/5 backdrop-blur-md"
        style={{
          borderTopColor: `${accent}66`,
          boxShadow: '0 -30px 90px rgba(0,0,0,0.55)',
        }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        {/* 面板头 */}
        <header className="flex shrink-0 items-center justify-between border-b border-white/10 px-10 py-6">
          <h3 className="serif-title text-[clamp(1.375rem,1.6vw,2rem)] font-semibold tracking-[0.1em] text-mist">
            {title}
          </h3>
          <button
            onClick={onClose}
            aria-label="关闭"
            className="border border-white/16 px-5 py-2 text-[15px] font-semibold tracking-[0.22em] text-mist/80 transition-colors duration-500 hover:border-white/35 hover:text-mist focus:outline-none"
          >
            收起 ▲
          </button>
        </header>

        {/* 面板内容 */}
        <div className="thin-scroll min-h-0 flex-1 overflow-y-auto px-10 py-9">
          {children}
        </div>
      </motion.div>
    </motion.div>
  )
}
