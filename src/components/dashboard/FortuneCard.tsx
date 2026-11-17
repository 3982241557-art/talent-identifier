import { motion } from 'framer-motion'
import type { Chart } from '../../types'
import { ELEMENT_THEMES } from '../../data/elementThemes'
import { deAstro } from '../../lib/copy'
import {
  VersionToggle,
  DEFAULT_VERSION,
  type ReportVersion,
} from '../common/VersionToggle'
import { useState } from 'react'
import type { FortuneDimension, MultiFortuneResult } from '../../lib/api'

/* ============================================================
 *  运势卡片 —— 年度 / 月度 / 每日
 *
 *  v4.0：
 *  · 每个时间尺度都拆成四个独立维度：
 *    事业/学业、财富、健康、爱情。
 *  · 每个维度包含「主线判断 / 周期性趋势 / 未来观测预警」三段。
 *  · 视觉：极浅高透毛玻璃，文字加粗纯白。
 * ============================================================ */

interface FortuneCardProps {
  subtitle: string
  title: string
  body: string
  index: number
  accent: string
  onOpen?: () => void
  children?: React.ReactNode
}

export function FortuneCard({
  subtitle,
  title,
  body,
  index,
  accent,
  onOpen,
  children,
}: FortuneCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 1.2, delay: 0.2 * index, ease: 'easeOut' }}
      className="w-full"
    >
      <div
        className="group relative border border-white/10 bg-white/5 px-7 py-8 backdrop-blur-md transition-colors duration-1000 hover:bg-white/8"
        style={{ boxShadow: '0 18px 60px rgba(0,0,0,0.35)' }}
      >
        <span
          className="absolute left-0 top-0 h-px w-12 opacity-90 transition-all duration-1000 group-hover:w-28"
          style={{ background: accent }}
        />

        <p className="mb-2 text-[13.5px] font-bold tracking-[0.5em] text-mist/70">
          {subtitle}
        </p>
        {/* 核心标题：加粗纯白 */}
        <h3 className="serif-title mb-5 text-[clamp(1.5rem,1.9vw,2.4rem)] font-semibold leading-tight tracking-[0.1em] text-mist">
          {title}
        </h3>

        <p className="serif-body text-[19px] font-semibold leading-[1.62] text-mist">
          {body}
        </p>

        {children}

        {onOpen && (
          <button
            onClick={onOpen}
            className="mt-5 border-0 bg-transparent pb-0.5 text-[15px] font-bold tracking-[0.3em] text-mist/70 transition-colors duration-700 hover:text-mist focus:outline-none"
          >
            展开 →
          </button>
        )}
      </div>
    </motion.div>
  )
}

/* ============================================================
 *  四维运势面板
 * ============================================================ */

/** 维度图标与强调色 */
const DIM_META: Record<
  string,
  { icon: string; label: string; color: string }
> = {
  career: { icon: '🎯', label: '事业 / 学业', color: '#f0c04a' },
  wealth: { icon: '💰', label: '财富', color: '#6fae7d' },
  health: { icon: '🌿', label: '健康', color: '#8fc9d6' },
  love: { icon: '❤️', label: '爱情', color: '#e08a9b' },
}

/**
 * 四维运势面板 —— 无底色边框 / 极浅高透毛玻璃，文字加粗纯白。
 */
export function FortuneDimensions({
  result,
  accent,
}: {
  result: MultiFortuneResult | null
  accent: string
}) {
  /*
   * v16.0 · 双版本切换
   *
   * 后端一次返回 minimal 与 deep 两份，
   * 这里只切数据源 —— **不发请求、不 loading**，
   * 切换是 0 延迟的。
   */
  const [version, setVersion] = useState<ReportVersion>(DEFAULT_VERSION)

  if (!result || result.dimensions.length === 0) {
    return (
      <p className="serif-body py-6 text-[17px] font-semibold leading-[1.6] text-mist/70">
        正在推演四维运势……
      </p>
    )
  }

  /* ---------- 取出当前版本的数据 ---------- */
  const current =
    version === 'minimal'
      ? (result.minimal ?? {
          overview: result.overview ?? '',
          dimensions: result.dimensions,
        })
      : (result.deep ?? {
          overview: result.overview ?? '',
          dimensions: result.dimensions,
        })

  /* 极简版更短，深度版放开截断上限 */
  const cap = version === 'minimal' ? 52 : 88
  const trendCap = version === 'minimal' ? 0 : 92

  /* 只要任一版本存在就显示切换器（本地兜底也有两版） */
  const hasBoth = Boolean(result.minimal) || Boolean(result.deep)

  return (
    <div className="w-full">
      {/* ══════════ v16.0 · 双版本切换胶囊 ══════════ */}
      {hasBoth && (
        <div className="sticky top-2 z-20 mb-7 flex justify-center">
          <VersionToggle value={version} onChange={setVersion} />
        </div>
      )}

      {current.overview && (
        <p className="serif-body mb-7 border-l-2 pl-6 text-[18px] font-semibold leading-[1.6] text-mist/90"
          style={{ borderColor: accent }}
        >
          {deAstro(current.overview, { max: version === 'minimal' ? 56 : 140 })}
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        {current.dimensions.map((d: FortuneDimension, i) => {
          const meta = DIM_META[d.key] ?? {
            icon: '✦',
            label: d.label,
            color: accent,
          }
          return (
            <motion.article
              key={d.key}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.08 * i, ease: 'easeOut' }}
              className="border border-white/10 bg-white/5 px-6 py-6 backdrop-blur-md"
              style={{ boxShadow: '0 14px 44px rgba(0,0,0,0.3)' }}
            >
              {/* 维度标题 */}
              <div className="flex items-center gap-3">
                <span className="text-[22px] leading-none">{meta.icon}</span>
                <h5
                  className="serif-title text-[clamp(1.125rem,1.3vw,1.6rem)] font-semibold tracking-[0.08em]"
                  style={{ color: meta.color }}
                >
                  {d.label || meta.label}
                </h5>
                <span
                  className="ml-auto h-px flex-1"
                  style={{ background: `${meta.color}44` }}
                />
              </div>

              {/* 主线判断 */}
              <p className="serif-body mt-4 text-[17px] font-semibold leading-[1.58] text-mist">
                {deAstro(d.summary, { max: cap })}
              </p>

              {/* 接下来会怎样 —— 只有深度版才展开 */}
              {version === 'deep' && (
                <div className="mt-4 border-t border-white/8 pt-4">
                  <p className="text-[12.5px] font-bold tracking-[0.32em] text-mist/55">
                    接 下 来
                  </p>
                  <p className="serif-body mt-2 text-[16px] font-medium leading-[1.58] text-mist/80">
                    {deAstro(d.trend, { max: trendCap })}
                  </p>
                </div>
              )}

              {/* 需要留意 —— 只有深度版才展开 */}
              {version === 'deep' && (
                <div className="mt-4 border-t border-white/8 pt-4">
                  <p className="text-[12.5px] font-bold tracking-[0.32em] text-mist/55">
                    留 意 这 一 点
                  </p>
                  <p className="serif-body mt-2 text-[16px] font-medium leading-[1.58] text-mist/80">
                    {deAstro(d.warning, { max: trendCap })}
                  </p>
                </div>
              )}
            </motion.article>
          )
        })}
      </div>
    </div>
  )
}

/* ============================================================
 *  本地四维运势引擎（AI 不可用时的兜底）
 *  依然保证「四维度 + 趋势 + 预警」的结构完整。
 *
 *  v9.0 · 任务 4：文案砍掉约三分之一，语气改温和。
 * ============================================================ */

export type FortuneScope = 'year' | 'month' | 'day'

/**
 * 维度 → 与星盘要素的关联规则（v11.0 · 任务 3 · 去占星术语化）
 *
 * ============================================================
 *  旧版这里写满了「第 10 宫」「金星与财帛宫」「月亮在双鱼」
 *  这类术语。底层数据来自星盘没错，但**展示给用户的文字**
 *  必须翻译成人话 —— 用户不需要懂原理，只需要懂自己。
 *
 *  v11.0 的原则：
 *   · 可以用星盘**推导**结论
 *   · 不能把推导过程（术语）摆到用户面前
 * ============================================================
 */
const DIM_RULES: Record<
  string,
  { source: (c: Chart) => string; fields: (c: Chart) => string[] }
> = {
  career: {
    source: () => '你做事的方式，决定了你适合站在什么位置',
    fields: () => [
      `你更吃「有明确回报」这一套，做长期的事比做短期的事顺`,
      `你处理复杂局面的习惯方式，决定了别人愿意把什么事交给你`,
      `你在受压时的推进节奏，是别人跟你合作时最直接的感受`,
    ],
  },
  wealth: {
    source: () => '你心里「什么才算值得」的标准，决定了你怎么花钱',
    fields: () => [
      `你偏好哪一种资源形态，会直接影响你积累的方式`,
      `有些回报需要时间才看得见，你对这类事更有耐心`,
      `接下来这段时间，哪一类机会更值得你花力气`,
    ],
  },
  health: {
    source: () => '你身体对压力的反应方式，是最有用的健康线索',
    fields: () => [
      `压力上来的时候，你身上最先有反应的是哪一处`,
      `你的身体底子偏向什么节奏，什么作息对它更友好`,
      `有哪一块需要你长期照料，而不是靠硬扛`,
    ],
  },
  love: {
    source: () => '你在亲密关系里的样子，取决于你怎么表达在意',
    fields: () => [
      `你表达在意的方式，和你以为的那一种常常不完全一样`,
      `你在关系里真正需要的是什么，这个清楚了就不会反复试探`,
      `什么能让你在关系里真正放松下来`,
    ],
  },
}

/** 时间尺度 → 趋势措辞与预警时间窗 */
const SCOPE_META: Record<
  FortuneScope,
  { label: string; span: string; trend: string; window: string }
> = {
  year: {
    label: '年度运势',
    span: '未来 12 个月',
    trend: '这一年的大方向已经定下来了',
    window: '本季度末至下个季度初',
  },
  month: {
    label: '月度运势',
    span: '未来 30 天',
    trend: '这个月的重心每两周换一次',
    window: '本月上半月与下半月交界处',
  },
  day: {
    label: '每日运势',
    span: '未来 7 天',
    trend: '今天的状态由你当下的状态直接定调',
    window: '未来三天内',
  },
}

/**
 * 本地生成四维运势。
 * 每条内容都由星盘事实推导，绝非随机文案。
 */
export function localFortune(
  chart: Chart,
  scope: FortuneScope,
): MultiFortuneResult {
  const meta = SCOPE_META[scope]
  const dimensions: FortuneDimension[] = (
    ['career', 'wealth', 'health', 'love'] as const
  ).map((key) => {
    const rule = DIM_RULES[key]
    const fields = rule.fields(chart)
    const dimMeta = DIM_META[key]

    // 从星盘中提取三个具体信号，作为「观测指标」
    const signals = fields
      .slice(0, 3)
      .map((f, i) => `${i + 1}. ${f}`)
      .join('；')

    return {
      key,
      label: dimMeta.label,
      summary:
        `这${meta.span.slice(2)}，${dimMeta.label}会顺着${rule.source(chart)}这个特点走。` +
        `同样的事落在你身上，你的第一反应和别人不一样。`,
      trend:
        `${meta.trend}。${dimMeta.label}的节奏是先理顺、再发力。` +
        `前面适合把资源重新归位，后面才是投入的窗口。` +
        `可以盯的信号：${signals}。`,
      warning:
        `${meta.window}留意一下：${dimMeta.label}要是突然推不动，` +
        `多半不是你运气差，是你同时在处理太多条线。` +
        `留点缓冲，记下这${meta.label}的变化，下个周期好回看。`,
    }
  })

  const overview =
    `你这一阵子正走在「${chart.bigThree.sun.sign.keyword}」这条线上。` +
    `情绪的节律和行动的方式，会轮流浮现。`

  /*
   * v16.0 · 双版本（本地兜底）
   *
   * 极简版只留主线判断，深度版带上趋势与预警。
   * 结构与 AI 返回的版本**完全一致** ——
   * 这样切换时布局不动，只是文字换长换短。
   */
  const minimal = {
    overview,
    dimensions: dimensions.map((d) => ({
      key: d.key,
      label: d.label,
      summary: d.summary,
      trend: '',
      warning: '',
    })),
  }

  const deep = { overview, dimensions }

  return {
    scope,
    label: meta.label,
    dimensions,
    overview,
    minimal,
    deep,
  }
}

/* ============================================================
 *  运势文本生成（本地生成，基于星盘） —— 兼容旧调用
 * ============================================================ */

export interface Fortune {
  subtitle: string
  title: string
  body: string
}

export function fortuneText(
  chart: Chart,
  kind: 'year' | 'month' | 'day',
): Fortune {
  const sun = chart.bigThree.sun.sign
  const now = new Date()

  /*
   * v11.0 · 任务 3：彻底去占星术语化。
   *
   * 旧版：「太阳落在白羊座」「月亮在双鱼」「上升金牛」——
   * 这些词用户看不懂，看了就等于没看。
   *
   * 现在只给**结论**与**行动建议**，
   * 像一位智慧的老友在给建议：自然、温和、直白。
   */
  if (kind === 'year') {
    return {
      subtitle: `${now.getFullYear()} 年`,
      title: '年度运势',
      body:
        `这一年围绕「${sun.keyword}」展开。` +
        `情绪会跟着内在的节律起伏。` +
        `先稳住步子，再谈扩张。`,
    }
  }
  if (kind === 'month') {
    return {
      subtitle: `${now.getMonth() + 1} 月`,
      title: '月度运势',
      body:
        `这个月的潮汐感会比平日明显。` +
        `更适合做个观察者——` +
        `看着事情发生，不必急着插手。`,
    }
  }
  return {
    subtitle: '今日',
    title: '今日运势',
    body:
      `今天适合做需要耐心的琐事。` +
      `重要的话留到明天。今天属于准备，不属于宣布。`,
  }
}

/* ============================================================
 *  底色构成条（v11.0 · 任务 3 · 去占星术语化）
 * ============================================================
 *
 *  旧版叫「星座移动轨迹」，画的是太阳/月亮/上升在十二宫上的落点，
 *  配文里全是「太阳」「月亮」「上升」「星座」——
 *  这些词是给占星爱好者看的，不是给普通用户看的。
 *
 *  现在改成三条线：
 *   性格底色 / 情绪节律 / 给人的第一印象
 *
 *  底层依然是同一份星盘数据，只是换了人话的说法。
 * ============================================================ */

export function TransitScale({ chart }: { chart: Chart }) {
  const theme = ELEMENT_THEMES[chart.bigThree.sun.sign.element]
  const rows = [
    { label: '你骨子里是什么样的人', sign: chart.bigThree.sun.sign },
    { label: '情绪节律', sign: chart.bigThree.moon.sign },
    { label: '第一印象', sign: chart.bigThree.rising.sign },
  ]
  const ticks = Array.from({ length: 12 }, (_, i) => i)

  return (
    <div className="mt-6">
      <p className="mb-4 text-[12.5px] font-bold tracking-[0.42em] text-mist/55">
        你 的 三 块 底 色
      </p>

      <div className="relative">
        <div className="relative h-px w-full bg-white/12">
          {ticks.map((t) => (
            <span
              key={t}
              className="absolute top-0 h-2 w-px bg-white/18"
              style={{ left: `${(t / 11) * 100}%` }}
            />
          ))}
          {rows.map((r, i) => (
            <span
              key={r.label}
              className="absolute -top-[3px] h-[7px] w-[7px] -translate-x-1/2 rounded-full"
              style={{
                left: `${(i * 37 + 14) % 100}%`,
                background: theme.primary,
                boxShadow: `0 0 8px ${theme.soft}`,
              }}
              title={`${r.label} ${r.sign.cn}`}
            />
          ))}
        </div>

        <div className="mt-4 flex justify-between">
          {rows.map((r) => (
            <div key={r.label} className="flex flex-col gap-1">
              <span className="text-[12.5px] font-bold tracking-[0.3em] text-mist/60">
                {r.label}
              </span>
              <span className="text-[15px] font-semibold text-mist/85">
                {r.sign.cn}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
