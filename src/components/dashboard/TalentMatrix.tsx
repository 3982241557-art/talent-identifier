import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import type {
  Chart,
  MbtiProfile,
  TalentCategory,
  TalentResult,
} from '../../types'
import { ELEMENT_THEMES } from '../../data/elementThemes'
import { computeTalent } from '../../lib/talent'
import { postTalent } from '../../lib/api'
import {
  VersionToggle,
  DEFAULT_VERSION,
  type ReportVersion,
} from '../common/VersionToggle'

/* ============================================================
 *  天赋解析 · 几何天赋矩阵（v12.0）
 *
 *  图形：梅尔卡巴（八芒星）+ 四轴雷达
 *  排版：**2×2 CSS Grid 矩阵**（v12.0 · 任务 2）
 *  数据：四个领域各自独立的对象（v12.0 · 任务 1）
 *  文案：人类语料库直出 + AI 连接词（v12.0 · 任务 3）
 * ============================================================ */

interface TalentMatrixProps {
  chart: Chart
  mbti: MbtiProfile | null
  onResult?: (result: TalentResult) => void
  /** 在覆盖层中始终展开（省略折叠开关） */
  alwaysOpen?: boolean
}

export function TalentMatrix({
  chart,
  mbti,
  onResult,
  alwaysOpen = false,
}: TalentMatrixProps) {
  const [open, setOpen] = useState(false)
  const [extra, setExtra] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<TalentResult>(() =>
    computeTalent(chart, mbti),
  )
  const [note, setNote] = useState('')

  const theme = ELEMENT_THEMES[chart.bigThree.sun.sign.element]

  /* ---------- 几何图形：八芒星 ---------- */
  const star = useMemo(() => {
    const cx = 0
    const cy = 0
    const R = 100
    const r = 38
    const points: Array<[number, number]> = []
    for (let i = 0; i < 8; i++) {
      const a = (i * 45 - 90) * (Math.PI / 180)
      points.push([cx + R * Math.cos(a), cy + R * Math.sin(a)])
    }
    for (let i = 0; i < 8; i++) {
      const a = (i * 45 - 90 + 22.5) * (Math.PI / 180)
      points.push([cx + r * Math.cos(a), cy + r * Math.sin(a)])
    }
    // 交替连成 16 边星形
    const d = points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0].toFixed(2)} ${p[1].toFixed(2)}`)
      .join(' ')
    return { d, points }
  }, [])

  /**
   * 雷达图数据 —— v11.0：三条轴改为四条轴。
   *
   * 三个维度用 120° 等分，四个维度用 90° 等分，
   * 起始角都从正上方（-90°）开始，这样「事业」永远在最上。
   */
  const radar = useMemo(() => {
    const cx = 0
    const cy = 0
    const R = 88
    const n = result.categories.length
    const values = result.categories.map((c) => c.score)
    const step = 360 / n
    const pts = values.map((v, i) => {
      const a = (-90 + i * step) * (Math.PI / 180)
      const rr = (v / 100) * R
      return [cx + rr * Math.cos(a), cy + rr * Math.sin(a)] as [number, number]
    })
    const d =
      pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(' ') +
      ' Z'
    /* 轴线（从中心指向各标签） */
    const spokes = result.categories.map((_, i) => {
      const a = (-90 + i * step) * (Math.PI / 180)
      return {
        x1: cx,
        y1: cy,
        x2: cx + 112 * Math.cos(a),
        y2: cy + 112 * Math.sin(a),
      }
    })
    return { pts, d, spokes, step }
  }, [result])

  /*
   * v16.0 · 双版本切换
   *
   * 后端一次返回 minimal（3-5 条短句）与 deep（3-5 段话），
   * 这里只切数据 —— 不发请求，切换 0 延迟。
   */
  const [version, setVersion] = useState<ReportVersion>(DEFAULT_VERSION)

  const handleAnalyse = async () => {
    setLoading(true)
    setNote('')
    try {
      const ai = await postTalent({ chart, mbti, extra })
      if (ai?.categories?.length) {
        /*
         * v12.0 · 任务 1：按 key 精准绑定。
         *
         * 旧版把 ai.categories 直接 map 到卡片，
         * 而 title / subtitle 是从**同一个全局角色变量**里取的 ——
         * 于是四张卡的副标题一模一样。
         *
         * 现在：先按 key 建索引，每个领域只认自己那个对象。
         * 缺失的字段由本地语料库补齐（fillFromCorpus）。
         */
        const byKey = new Map(ai.categories.map((c) => [c.key, c]))
        const order: TalentCategory[] = [
          'career',
          'academic',
          'interpersonal',
          'wealth',
        ]
        const merged: TalentResult = {
          categories: order.map((key) => {
            const src = byKey.get(key)
            const local = result.categories.find((c) => c.key === key)
            if (!src) {
              /* 服务端没给这个领域 —— 用本地那份顶上，绝不留空 */
              return local!
            }
            return {
              key,
              label: src.label || local?.label || key,
              score: typeof src.score === 'number' ? src.score : (local?.score ?? 60),
              title: src.title || local?.title || '',
              subtitle: src.subtitle || local?.subtitle || '',
              field: src.field || local?.field || '',
              description: src.description || local?.description || '',
              quote: src.quote || local?.quote || '',
              quoteSource: src.quoteSource || local?.quoteSource || '',
              quoteModern: src.quoteModern || local?.quoteModern || '',
              quoteScene: src.quoteScene || local?.quoteScene || '',
              strength: src.strength || local?.strength || '',
              practice: src.practice || local?.practice || '',
            }
          }),
          yearly: (ai.yearly ?? []).map((y) => ({
            ...y,
            action: y.action ?? '',
          })),
          advice: (ai.advice ?? []).map((a) => a ?? ''),
          source: 'ai',
          /* v16.0：把双版本一并带过来 */
          minimal: ai.minimal,
          deep: ai.deep,
        }
        setResult(merged)
        onResult?.(merged)
        setNote('已经结合你写下的现状，重新算了一遍。')
      } else {
        throw new Error('empty')
      }
    } catch {
      const local = computeTalent(chart, mbti, extra)
      setResult(local)
      onResult?.(local)
      setNote('智者暂时不在，我先按你的星盘推了一版。')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="w-full">
      {/* ---------- 标题 ---------- */}
      <div className="flex items-end justify-between">
        <div>
          <p className="text-[18px] font-semibold tracking-[0.5em] text-mist/45">
            TALENT MATRIX
          </p>
          <h3 className="serif-title mt-3 text-[clamp(1.75rem,2.2vw,2.9rem)] font-semibold tracking-[0.12em] text-mist">
            天赋解析
          </h3>
        </div>
        {!alwaysOpen && (
          <button
            onClick={() => setOpen((v) => !v)}
            className="border-0 bg-transparent pb-1 text-[21px] font-semibold tracking-[0.3em] text-mist/60 transition-colors duration-700 hover:text-mist focus:outline-none"
          >
            {open ? '收起 ▲' : '展开 ▼'}
          </button>
        )}
      </div>

      {/* ---------- 几何图形 ---------- */}
      {!alwaysOpen && (
        <div className="mt-9 flex flex-col items-center">
          <motion.button
            onClick={() => setOpen((v) => !v)}
            whileHover={{ scale: 1.03 }}
            className="relative border-0 bg-transparent p-0 focus:outline-none"
            aria-label="天赋解析"
          >
          <svg
            width={260}
            height={260}
            viewBox="-130 -130 260 260"
            className="block"
          >
            <defs>
              <radialGradient id="tm-core">
                <stop offset="0%" stopColor={theme.ambient} />
                <stop offset="72%" stopColor="rgba(0,0,0,0)" />
              </radialGradient>
            </defs>

            {/* 背景圆 */}
            <circle r={112} fill="url(#tm-core)" />
            <circle
              r={112}
              fill="none"
              stroke="rgba(255,255,255,0.10)"
              strokeWidth="0.8"
            />
            <circle
              r={88}
              fill="none"
              stroke="rgba(255,255,255,0.07)"
              strokeWidth="0.6"
            />
            <circle
              r={44}
              fill="none"
              stroke="rgba(255,255,255,0.05)"
              strokeWidth="0.6"
            />

            {/* 放射刻度 */}
            {Array.from({ length: 24 }, (_, i) => {
              const a = (i * 15 - 90) * (Math.PI / 180)
              const r1 = i % 2 === 0 ? 100 : 106
              return (
                <line
                  key={i}
                  x1={r1 * Math.cos(a)}
                  y1={r1 * Math.sin(a)}
                  x2={112 * Math.cos(a)}
                  y2={112 * Math.sin(a)}
                  stroke="rgba(255,255,255,0.14)"
                  strokeWidth="0.5"
                />
              )
            })}

            {/* 八芒星（两重三角交叠） */}
            {[
              { rot: 0, op: 0.5 },
              { rot: 60, op: 0.28 },
            ].map((tri, i) => (
              <polygon
                key={i}
                points={(() => {
                  const p: string[] = []
                  for (let k = 0; k < 3; k++) {
                    const a = (k * 120 - 90 + tri.rot) * (Math.PI / 180)
                    p.push(
                      `${(96 * Math.cos(a)).toFixed(2)} ${(96 * Math.sin(a)).toFixed(2)}`,
                    )
                  }
                  return p.join(' ')
                })()}
                fill="none"
                stroke={theme.primary}
                strokeOpacity={tri.op}
                strokeWidth="1"
              />
            ))}

            {/* 八芒星（16 边交替星形，源自梅尔卡巴） */}
            <path
              d={star.d}
              fill="none"
              stroke={theme.primary}
              strokeOpacity="0.32"
              strokeWidth="0.9"
            />

            {/* 轴线 —— v11.0：四轴 */}
            {radar.spokes.map((sp, i) => (
              <line
                key={i}
                x1={sp.x1}
                y1={sp.y1}
                x2={sp.x2}
                y2={sp.y2}
                stroke="rgba(255,255,255,0.09)"
                strokeWidth="0.5"
              />
            ))}

            {/* 雷达层 */}
            <path
              d={radar.d}
              fill={theme.primary}
              fillOpacity="0.14"
              stroke={theme.primary}
              strokeOpacity="0.72"
              strokeWidth="1.1"
            />
            {radar.pts.map((p, i) => (
              <circle
                key={i}
                cx={p[0]}
                cy={p[1]}
                r={3.2}
                fill={theme.primary}
                fillOpacity="0.9"
              />
            ))}

            {/* 四轴标签 —— v11.0 */}
            {result.categories.map((c, i) => {
              const a = (-90 + i * radar.step) * (Math.PI / 180)
              const x = 128 * Math.cos(a)
              const y = 128 * Math.sin(a)
              return (
                <text
                  key={c.key}
                  x={x}
                  y={y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize="13"
                  fill="rgba(230,236,247,0.62)"
                  letterSpacing="0.1em"
                >
                  {c.label}
                </text>
              )
            })}
          </svg>
        </motion.button>

        <p className="mt-5 text-center text-[19.5px] tracking-[0.24em] text-mist/45">
          点击图形 · 展开深度分析
        </p>
        </div>
      )}

      {/* ---------- 展开面板 ---------- */}
      {(alwaysOpen || open) && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="mt-10 overflow-hidden"
        >
          {/*
            v12.0 · 任务 2 · 2×2 CSS Grid 矩阵
            ------------------------------------------------
            · grid-template-columns: repeat(2, 1fr)
            · 每张卡 h-full —— 同一排高度绝对一致
            · min-h-[320px] —— 四张卡的下限对齐
            · 窄屏（<768px）退化为单列，不挤压内容
          */}
          <div data-talent-grid className="grid">
            {result.categories.map((c) => (
              <article
                key={c.key}
                data-talent-card={c.key}
                className="border border-white/10 bg-white/5 px-7 py-7 backdrop-blur-md"
              >
                {/* ---------- 头部：领域名 + 分数 ---------- */}
                <div className="flex items-baseline justify-between gap-4">
                  <div>
                    <p className="text-[12.5px] font-bold tracking-[0.34em] text-mist/45">
                      {c.label}
                    </p>
                    <h4 className="serif-title mt-1.5 text-[clamp(1.25rem,1.5vw,1.9rem)] font-semibold tracking-[0.1em] text-mist">
                      {c.title}
                    </h4>
                  </div>
                  <span
                    className="serif-title shrink-0 text-[clamp(1.5rem,1.9vw,2.4rem)] font-semibold"
                    style={{ color: theme.primary }}
                  >
                    {c.score}
                  </span>
                </div>

                {/* ---------- 角色定义（v12.0：每个领域独有） ---------- */}
                <div className="mt-3 h-px w-full bg-white/10">
                  <div
                    className="h-px transition-all duration-[1200ms]"
                    style={{
                      width: `${c.score}%`,
                      background: theme.primary,
                    }}
                  />
                </div>

                <div
                  className="mt-6 border-l-2 pl-4"
                  style={{ borderColor: theme.primary }}
                >
                  <p className="text-[12.5px] font-bold tracking-[0.32em] text-mist/55">
                    适 合 做 什 么
                  </p>
                  <p
                    data-talent-subtitle
                    className="serif-title mt-2 text-[clamp(1.125rem,1.35vw,1.7rem)] font-semibold tracking-[0.06em]"
                    style={{ color: theme.primary }}
                  >
                    {c.subtitle || c.field}
                  </p>
                  {c.field && (
                    <p className="serif-body mt-2 text-[18px] font-medium leading-[1.58] text-mist/82">
                      {c.field}
                    </p>
                  )}
                </div>

                {/*
                  v12.0 · 任务 3 · 人类先哲原句
                  --------------------------------
                  语料库直出，一字不改。
                  出处用小字标注，保留文化厚度。
                */}
                {c.quote && (
                  <figure className="mt-6 border-t border-white/8 pt-5">
                    <blockquote
                      className="serif-title text-[clamp(1.0625rem,1.25vw,1.45rem)] font-medium leading-[1.72] tracking-[0.04em] text-mist/88"
                    >
                      「{c.quote}」
                    </blockquote>
                    <figcaption className="mt-2 text-[13.5px] font-semibold tracking-[0.22em] text-mist/38">
                      —— {c.quoteSource}
                    </figcaption>
                  </figure>
                )}

                {/* ---------- 专属解析 ---------- */}
                {c.description && (
                  <p
                    data-talent-description
                    className="serif-body mt-5 text-[19.5px] font-medium leading-[1.62] text-mist/78"
                  >
                    {c.description}
                  </p>
                )}

                {/* ---------- 优势 ---------- */}
                {c.strength && (
                  <p
                    data-talent-strength
                    className="serif-body mt-4 text-[18.5px] font-medium leading-[1.6] text-mist/58"
                  >
                    {c.strength}
                  </p>
                )}

                {/* ---------- 练习 ---------- */}
                <p className="serif-body mt-auto pt-6 text-[19.5px] font-medium leading-[1.62] text-mist/68">
                  <span style={{ color: theme.primary }}>练习：</span>
                  {c.practice}
                </p>
              </article>
            ))}
          </div>

          {/* 补充现状 + 重新测算 */}
          <div className="mt-12 border-t border-white/8 pt-8">
            <h4 className="text-[22.5px] font-semibold tracking-[0.16em] text-mist/85">
              补充你此刻的现状
            </h4>
            <p className="mt-3 text-[19.5px] leading-[1.58] text-mist/42">
              正在做什么、卡在哪里、想去哪里。写下来，推演会跟着变。
            </p>
            <textarea
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
              rows={3}
              placeholder="例如：现在在一家中型公司做产品，明年底想转去做研究，卡在不知道该选哪条路……"
              className="mt-5 w-full resize-none border-0 bg-transparent pb-2 text-[22.5px] leading-[1.58] text-mist/85 outline-none placeholder:text-mist/25"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.12)' }}
            />
            <div className="mt-6 flex flex-wrap items-center gap-5">
              <button
                onClick={handleAnalyse}
                disabled={loading}
                className="border-0 px-7 py-3 text-[21px] tracking-[0.28em] text-paper transition-opacity duration-500 hover:opacity-80 focus:outline-none disabled:opacity-45"
                style={{ background: theme.primary }}
              >
                {loading ? '推演中…' : '重新测算'}
              </button>
              {note && (
                <span className="text-[19.5px] tracking-[0.1em] text-mist/45">
                  {note}
                </span>
              )}
              {result.source === 'local' && !note && (
                <span className="text-[18px] tracking-[0.16em] text-mist/28">
                  当前为本地星盘推演
                </span>
              )}
            </div>
          </div>

          {/* 每年适合做的事 */}
          {result.yearly.length > 0 && (
            <div className="mt-12 border-t border-white/8 pt-8">
              <h4 className="text-[22.5px] font-semibold tracking-[0.16em] text-mist/85">
                每一年适合做的事
              </h4>
              <div className="mt-7 space-y-7">
                {result.yearly.map((y) => (
                  <div key={y.year} className="flex gap-6">
                    <span
                      className="serif-title shrink-0 pt-0.5 text-[28.5px] tracking-[0.1em]"
                      style={{ color: theme.primary }}
                    >
                      {y.year}
                    </span>
                    <div>
                      <p className="text-[24px] tracking-[0.1em] text-mist/88">
                        {y.focus}
                      </p>
                      <p className="serif-body mt-2 text-[21px] leading-[1.6] text-mist/50">
                        {y.action}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ══════════ v16.0 · 双版本切换 + 摘要 ══════════ */}
          {(() => {
            const minimal = result.minimal ?? []
            const deep = result.deep ?? []
            /* 只要有一版内容就显示切换器 —— 本地兜底也有两版 */
            const hasBoth = minimal.length > 0 || deep.length > 0

            if (!hasBoth) return null

            const list = version === 'minimal' ? minimal : deep

            return (
              <div className="mt-12 border-t border-white/8 pt-8">
                {/* 切换胶囊 —— sticky，用户随时能切 */}
                <div className="sticky top-2 z-20 mb-8 flex justify-center">
                  <VersionToggle value={version} onChange={setVersion} />
                </div>

                <h4 className="text-[22.5px] font-semibold tracking-[0.16em] text-mist/85">
                  {version === 'minimal' ? '一眼看清' : '把来龙去脉聊透'}
                </h4>

                <ul className="mt-6 space-y-4">
                  {list.map((line, i) => (
                    <li key={i} className="flex gap-4">
                      <span
                        className="mt-[13px] block h-1 w-1 shrink-0 rounded-full"
                        style={{ background: theme.primary }}
                      />
                      <p
                        className="serif-body leading-[1.62] text-mist"
                        style={{
                          fontSize:
                            version === 'minimal'
                              ? 'clamp(1.15rem,1.3vw,1.5rem)'
                              : 'clamp(1rem,1.15vw,1.3rem)',
                          color:
                            version === 'minimal'
                              ? 'var(--color-mist)'
                              : 'rgba(244,246,250,0.78)',
                        }}
                      >
                        {line}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })()}

          {/* 落地建议 */}
          {result.advice.length > 0 && (
            <div className="mt-12 border-t border-white/8 pt-8">
              <h4 className="text-[22.5px] font-semibold tracking-[0.16em] text-mist/85">
                落地建议
              </h4>
              <ul className="mt-6 space-y-4">
                {result.advice.map((a, i) => (
                  <li key={i} className="flex gap-4">
                    <span
                      className="mt-[13px] block h-1 w-1 shrink-0 rounded-full"
                      style={{ background: theme.primary }}
                    />
                    <p className="serif-body text-[21px] leading-[1.62] text-mist/55">
                      {a}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </motion.div>
      )}
    </section>
  )
}
