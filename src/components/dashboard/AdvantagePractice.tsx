import { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  CYCLE_NODES,
  SKILL_LIBRARY,
  SKILL_CATEGORIES,
  EMPTY_ADVANTAGE,
  loadAdvantage,
  saveAdvantage,
  litCount,
  isCycleComplete,
  nodeOffset,
  type AdvantageState,
} from '../../lib/advantage'

/* ============================================================
 *  优势挖掘实践（v17.0）
 * ============================================================
 *
 *  【上半区】五步环形优势链条
 *    一个 SVG 环图，五个节点环绕，箭头按理论流向连接：
 *      ① → ② → ③ → ④ → ⑤ → ②（闭环回到「发展」）
 *
 *    交互：每个节点旁边一个输入框。写完一个，
 *    该节点 + 它射出的箭头立刻点亮成恒星金（带呼吸发光）。
 *    5 个全写完 → 整个环贯通流光 + 提示「你的正向优势链条已完整闭合」。
 *
 *  【下半区】三大核心技能 + 划掉排除法技能库
 *    三个发光横线（01/02/03）+ 38 个技能标签。
 *    点标签 = 划掉（星光删除线 + 变暗退后）；
 *    点标签旁的 + = 填入上方第一条空的核心技能横线。
 *
 *  【底部】AI 职位推演（双版本）
 * ============================================================ */

/** 环的半径（px，SVG 坐标系） */
const RADIUS = 132
/** 圆心 */
const CENTER = 170

interface AdvantagePracticeProps {
  /** 主题强调色 */
  accent: string
  /** 用户的星盘（喂给 AI 用） */
  chart: unknown
  /** MBTI */
  mbti: unknown
  /** 用户填写完成后的回调（用于生成 AI 建议） */
  onRequestAdvice?: (payload: AdvantageState) => void
}

export function AdvantagePractice({
  accent,
  onRequestAdvice,
}: AdvantagePracticeProps) {
  /* ---------- 状态 ---------- */
  const [state, setState] = useState<AdvantageState>(EMPTY_ADVANTAGE)
  const [loaded, setLoaded] = useState(false)

  /* ---------- 读档 ---------- */
  useEffect(() => {
    setState(loadAdvantage())
    setLoaded(true)
  }, [])

  /* ---------- 自动保存 ---------- */
  useEffect(() => {
    if (!loaded) return
    saveAdvantage(state)
  }, [state, loaded])

  /* ---------- 点亮的节点数 ---------- */
  const lit = useMemo(() => litCount(state.cycle), [state.cycle])
  const complete = useMemo(() => isCycleComplete(state.cycle), [state.cycle])

  /* ---------- 更新循环节点 ---------- */
  const setCycleNode = useCallback((n: number, text: string) => {
    setState((s) => ({
      ...s,
      cycle: { ...s.cycle, [String(n)]: text },
    }))
  }, [])

  /* ---------- 划掉 / 取消划掉 ---------- */
  const toggleCross = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      crossedOut: s.crossedOut.includes(id)
        ? s.crossedOut.filter((x) => x !== id)
        : [...s.crossedOut, id],
    }))
  }, [])

  /* ---------- 从技能库填入核心技能横线 ---------- */
  const assignSkill = useCallback((label: string) => {
    setState((s) => {
      /* 找第一个空位；全满则替换第一个 */
      const idx = s.coreSkills.findIndex((x) => !x.trim())
      const target = idx >= 0 ? idx : 0
      const next: [string, string, string] = [...s.coreSkills]
      next[target] = label
      return { ...s, coreSkills: next }
    })
  }, [])

  /* ---------- 设置核心技能 ---------- */
  const setCoreSkill = useCallback((idx: number, text: string) => {
    setState((s) => {
      const next: [string, string, string] = [...s.coreSkills]
      next[idx] = text
      return { ...s, coreSkills: next }
    })
  }, [])

  /* ---------- 剩余技能（没被划掉的） ---------- */
  const remaining = useMemo(
    () => SKILL_LIBRARY.filter((s) => !state.crossedOut.includes(s.id)),
    [state.crossedOut],
  )

  return (
    <div className="space-y-14">
      {/* ============================================================
          上半区：五步环形优势链条
          ============================================================ */}
      <section className="advantage-cycle">
        <header className="mb-8 text-center">
          <p className="eyebrow text-gold">ADVANTAGE CYCLE</p>
          <h3 className="serif-title t-sub mt-3 text-mist">你的优势飞轮</h3>
          <p className="serif-body mt-3 text-ink-soft">
            优势不是一次性找到的 —— 它是个越转越快的圈。
            <br />
            每填完一格，那一格和它射出的箭头就会亮起来。
          </p>
        </header>

        <div className="relative mx-auto flex max-w-[980px] flex-col items-center gap-10 lg:flex-row lg:items-start lg:justify-center lg:gap-4">
          {/* ---------- 环图 ---------- */}
          <div className="relative shrink-0">
            <svg
              width={CENTER * 2}
              height={CENTER * 2}
              viewBox={`0 0 ${CENTER * 2} ${CENTER * 2}`}
              className="advantage-ring"
              style={{ maxWidth: '100%', height: 'auto' }}
            >
              <defs>
                {/* 底环 */}
                <radialGradient id="adv-ring-bg">
                  <stop offset="0%" stopColor="rgba(228,214,182,0)" />
                  <stop offset="70%" stopColor="rgba(228,214,182,0.05)" />
                  <stop offset="100%" stopColor="rgba(228,214,182,0.14)" />
                </radialGradient>

                {/* 完整闭环的金色渐变 */}
                <linearGradient id="adv-gold" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#f5c26b" />
                  <stop offset="50%" stopColor="#fff4dc" />
                  <stop offset="100%" stopColor="#e8a84c" />
                </linearGradient>

                {/* 节点辉光 */}
                <filter id="adv-glow" x="-120%" y="-120%" width="340%" height="340%">
                  <feGaussianBlur stdDeviation="5" result="b" />
                  <feMerge>
                    <feMergeNode in="b" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {/* 底环 */}
              <circle
                cx={CENTER}
                cy={CENTER}
                r={RADIUS}
                fill="url(#adv-ring-bg)"
                stroke="rgba(228,214,182,0.18)"
                strokeWidth="1"
                strokeDasharray="3 6"
              />

              {/* 五条箭头（节点 → 下一节点） */}
              {CYCLE_NODES.map((node, i) => {
                const next = CYCLE_NODES[(i + 1) % CYCLE_NODES.length]
                /*
                 * v17.0：闭环回到 ②（优势与技能发展），
                 * 而不是 ① —— 这是「飞轮」与「一次性清单」的本质区别。
                 */
                const target =
                  i === CYCLE_NODES.length - 1 ? CYCLE_NODES[1] : next

                const a = nodeOffset(node.angle, RADIUS)
                const b = nodeOffset(target.angle, RADIUS)
                const x1 = CENTER + a.x
                const y1 = CENTER + a.y
                const x2 = CENTER + b.x
                const y2 = CENTER + b.y

                /* 弧线（向外鼓出，避免穿过中心） */
                const mx = (x1 + x2) / 2
                const my = (y1 + y2) / 2
                const dx = x2 - x1
                const dy = y2 - y1
                const len = Math.hypot(dx, dy) || 1
                /* 法线方向，向外偏移 18px */
                const nx = -dy / len
                const ny = dx / len
                const cx = mx + nx * 18
                const cy = my + ny * 18

                /* 该箭头点亮 = 起点节点已写 */
                const isLit = Boolean((state.cycle[String(node.n)] ?? '').trim())
                return (
                  <g key={`arrow-${node.n}`}>
                    <path
                      d={`M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`}
                      fill="none"
                      stroke={
                        isLit
                          ? 'url(#adv-gold)'
                          : 'rgba(228,214,182,0.20)'
                      }
                      strokeWidth={isLit ? 2 : 1}
                      strokeDasharray={isLit ? 'none' : '4 5'}
                      opacity={isLit ? 0.95 : 1}
                      filter={isLit ? 'url(#adv-glow)' : undefined}
                      style={{
                        transition: 'stroke 900ms ease, stroke-width 900ms ease',
                      }}
                    />
                    {/* 箭头头部 */}
                    <circle
                      cx={x2}
                      cy={y2}
                      r={isLit ? 3 : 2}
                      fill={isLit ? '#fff4dc' : 'rgba(228,214,182,0.35)'}
                      style={{ transition: 'fill 900ms ease' }}
                    />
                  </g>
                )
              })}

              {/* 完整闭环时的流光环 */}
              {complete && (
                <motion.circle
                  cx={CENTER}
                  cy={CENTER}
                  r={RADIUS}
                  fill="none"
                  stroke="url(#adv-gold)"
                  strokeWidth="2"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 0.85 }}
                  transition={{ duration: 2.2, ease: 'easeInOut' }}
                  filter="url(#adv-glow)"
                />
              )}

              {/* 五个节点 */}
              {CYCLE_NODES.map((node) => {
                const isLit = Boolean((state.cycle[String(node.n)] ?? '').trim())
                const { x, y } = nodeOffset(node.angle, RADIUS)
                const cx = CENTER + x
                const cy = CENTER + y

                return (
                  <g key={node.n} style={{ transition: 'opacity 600ms ease' }}>
                    {/* 节点圆盘 */}
                    <motion.circle
                      cx={cx}
                      cy={cy}
                      r={isLit ? 24 : 20}
                      fill={
                        isLit
                          ? 'rgba(245,194,107,0.14)'
                          : 'rgba(10,15,28,0.55)'
                      }
                      stroke={isLit ? '#f5c26b' : 'rgba(228,214,182,0.28)'}
                      strokeWidth={isLit ? 1.6 : 1}
                      animate={
                        isLit
                          ? { scale: [1, 1.06, 1] }
                          : { scale: 1 }
                      }
                      transition={
                        isLit
                          ? {
                              duration: 2.6,
                              repeat: Infinity,
                              ease: 'easeInOut',
                            }
                          : { duration: 0.4 }
                      }
                      style={{ transformOrigin: `${cx}px ${cy}px` }}
                      filter={isLit ? 'url(#adv-glow)' : undefined}
                    />
                    {/* 序号 */}
                    <text
                      x={cx}
                      y={cy}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize="15"
                      fontWeight="700"
                      fill={isLit ? '#fff4dc' : 'rgba(228,214,182,0.55)'}
                    >
                      {node.n}
                    </text>
                  </g>
                )
              })}

              {/* 中心：进度 */}
              <text
                x={CENTER}
                y={CENTER - 8}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize="30"
                fontWeight="700"
                fill={complete ? '#fff4dc' : 'rgba(240,244,252,0.9)'}
                style={{ letterSpacing: '0.04em' }}
              >
                {lit}/5
              </text>
              <text
                x={CENTER}
                y={CENTER + 18}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize="11"
                fontWeight="600"
                fill="rgba(228,214,182,0.6)"
                style={{ letterSpacing: '0.3em' }}
              >
                已点亮
              </text>
            </svg>

            {/* 闭环提示 */}
            <AnimatePresence>
              {complete && (
                <motion.p
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.8 }}
                  className="absolute inset-x-0 -bottom-2 text-center text-[clamp(0.8125rem,0.9vw,1rem)] font-semibold tracking-[0.06em]"
                  style={{ color: '#f5c26b' }}
                >
                  你的正向优势链条已完整闭合（支持随时点击修改，自动保存）
                </motion.p>
              )}
            </AnimatePresence>
          </div>

          {/* ---------- 五个输入框 ---------- */}
          <div className="w-full max-w-[520px] space-y-3.5">
            {CYCLE_NODES.map((node) => {
              const value = state.cycle[String(node.n)] ?? ''
              const isLit = Boolean(value.trim())
              return (
                <div
                  key={node.n}
                  className="adv-node"
                  data-lit={String(isLit)}
                >
                  <div className="flex items-start gap-3">
                    {/* 序号徽标 */}
                    <span
                      className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[0.8125rem] font-bold transition-all duration-700"
                      style={{
                        background: isLit
                          ? 'linear-gradient(135deg,#f5c26b,#e8a84c)'
                          : 'rgba(228,214,182,0.08)',
                        color: isLit ? '#0a0d16' : 'rgba(228,214,182,0.55)',
                        boxShadow: isLit ? '0 0 16px rgba(245,194,107,0.55)' : 'none',
                      }}
                    >
                      {node.n}
                    </span>

                    <div className="min-w-0 flex-1">
                      <label
                        className="mb-1.5 block text-[clamp(0.8125rem,0.9vw,1rem)] font-semibold tracking-[0.08em] transition-colors duration-700"
                        style={{
                          color: isLit ? '#fff4dc' : 'rgba(240,244,252,0.62)',
                        }}
                      >
                        {node.title}
                      </label>
                      <input
                        data-adv-node={node.n}
                        aria-label={node.title}
                        value={value}
                        onChange={(e) => setCycleNode(node.n, e.target.value)}
                        placeholder={node.placeholder}
                        maxLength={160}
                        className="adv-input"
                        style={{
                          borderColor: isLit
                            ? 'rgba(245,194,107,0.42)'
                            : 'rgba(255,255,255,0.10)',
                          boxShadow: isLit
                            ? '0 0 22px rgba(245,194,107,0.16) inset'
                            : 'none',
                        }}
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ============================================================
          下半区：三大核心技能 + 划掉排除法
          ============================================================ */}
      <section className="advantage-skills">
        {/* ---------- 温柔提醒 ---------- */}
        <div
          className="mb-9 rounded-[20px] border px-7 py-6 text-center"
          style={{
            borderColor: `${accent}33`,
            background:
              'linear-gradient(150deg, rgba(12,18,32,0.72), rgba(6,9,18,0.55))',
          }}
        >
          <p className="serif-body text-[clamp(1rem,1.25vw,1.375rem)] font-medium leading-[1.85] text-mist/90">
            迷茫的时候，回来低头看看你拥有的优势。
            <br className="sm:hidden" />
            <span className="text-gold">
              真正能帮你解决问题、创造价值的本事，一直都在你身上。
            </span>
          </p>
        </div>

        {/* ---------- 三条核心技能横线 ---------- */}
        <div className="mx-auto max-w-[720px]">
          <p className="eyebrow mb-4 text-center text-gold">CORE SKILLS</p>
          <h3 className="serif-title t-sub mb-7 text-center text-mist">
            你最核心的三个本事
          </h3>

          <div className="space-y-4">
            {state.coreSkills.map((value, i) => (
              <div key={i} className="adv-core-line">
                <span className="adv-core-num">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <input
                  data-core-skill={i}
                  aria-label={`核心技能 ${i + 1}`}
                  value={value}
                  onChange={(e) => setCoreSkill(i, e.target.value)}
                  placeholder={
                    i === 0
                      ? '比如：把乱糟糟的事理出头绪'
                      : i === 1
                        ? '比如：让不同的人愿意合作'
                        : '比如：死磕细节不放过'
                  }
                  maxLength={40}
                  className="adv-input flex-1"
                  style={{
                    borderColor: value.trim()
                      ? 'rgba(245,194,107,0.40)'
                      : 'rgba(255,255,255,0.10)',
                    boxShadow: value.trim()
                      ? '0 0 20px rgba(245,194,107,0.14) inset'
                      : 'none',
                  }}
                />
              </div>
            ))}
          </div>
        </div>

        {/* ---------- 技能排查库 ---------- */}
        <div className="mx-auto mt-12 max-w-[1000px]">
          <div className="mb-6 text-center">
            <h3 className="serif-title t-sub text-mist">技能优势排查库</h3>
            <p className="serif-body mt-3 text-ink-soft">
              不知道自己擅长什么？
              <br className="sm:hidden" />
              把下面你
              <span className="font-semibold text-gold">
                明显不擅长或讨厌
              </span>
              的技能一个个划掉，剩下的就是你的宝藏！
            </p>
          </div>

          {/* 剩余统计 */}
          <div className="mb-6 flex items-center justify-center gap-4 text-[clamp(0.8125rem,0.9vw,1rem)] font-semibold tracking-[0.1em]">
            <span className="text-ink-mute">
              已划掉{' '}
              <span className="text-mist">{state.crossedOut.length}</span> 项
            </span>
            <span className="h-3 w-px bg-white/15" />
            <span className="text-ink-mute">
              剩下{' '}
              <span className="text-gold">{remaining.length}</span> 项
              <span className="ml-2 font-normal text-ink-mute">
                （这就是你的方向）
              </span>
            </span>
          </div>

          {/* 按分类分组 */}
          {SKILL_CATEGORIES.map((cat) => {
            const items = SKILL_LIBRARY.filter((s) => s.category === cat)
            if (items.length === 0) return null
            return (
              <div key={cat} className="mb-6">
                <p className="mb-2.5 text-[clamp(0.6875rem,0.78vw,0.8125rem)] font-bold tracking-[0.28em] text-ink-mute">
                  {cat}
                </p>
                <div className="flex flex-wrap gap-2.5">
                  {items.map((skill) => {
                    const crossed = state.crossedOut.includes(skill.id)
                    return (
                      <div
                        key={skill.id}
                        className="adv-chip"
                        data-crossed={String(crossed)}
                      >
                        {/* 点击标签 = 划掉 */}
                        <button
                          data-skill-tag={skill.id}
                          onClick={() => toggleCross(skill.id)}
                          className="adv-chip-label"
                          title={crossed ? '点一下取消划掉' : '点一下划掉'}
                        >
                          <span className="adv-chip-text">{skill.label}</span>
                          {/* 星光删除线 */}
                          <span className="adv-chip-slash" />
                        </button>
                        {/* + 号 = 填入核心技能横线 */}
                        <button
                          onClick={() => assignSkill(skill.label)}
                          className="adv-chip-plus"
                          title="填入上方核心技能"
                          aria-label={`把「${skill.label}」填入核心技能`}
                        >
                          +
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* ============================================================
          底部：AI 职位推演入口
          ============================================================ */}
      <section className="advantage-cta">
        <button
          onClick={() => onRequestAdvice?.(state)}
          className="advantage-cta-btn group"
          style={{
            background:
              'linear-gradient(135deg, rgba(245,194,107,0.96), rgba(232,168,76,0.92))',
            boxShadow: `0 16px 52px ${accent}44, 0 0 0 1px rgba(255,248,232,0.25) inset`,
          }}
        >
          <span className="text-[clamp(1rem,1.2vw,1.35rem)] font-semibold tracking-[0.1em] text-[#0a0d16]">
            ✨ 结合我的星盘与优势链条，一键生成适合我的职位与行动方向
          </span>
          <span className="mt-1 block text-[clamp(0.8125rem,0.9vw,1rem)] font-medium tracking-[0.08em] text-[#0a0d16]/70">
            3 个具体岗位 · 1 个副业方向 · 下周就能做的 1 件小事
          </span>
        </button>
      </section>
    </div>
  )
}
