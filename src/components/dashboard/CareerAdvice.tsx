import { motion } from 'framer-motion'
import { usePanelVersion } from '../common/PanelVersionContext'
import { CareerGlyph, CycleGlyph, SparkGlyph } from '../common/AstroGlyphs'
import type { CareerAdviceResult } from '../../lib/api'

/* ============================================================
 *  优势挖掘 · AI 职位与行动方向（v17.0）
 * ============================================================
 *
 *  【双版本的极致反差】
 *
 *  ⚡️ 极简直给版
 *     · 一句大字号高光结论（clamp 1.6-2.4rem）
 *     · 三张极简要点短卡（每条 ≤ 25 字）
 *     · 一条今日行动指令
 *     → 3 秒扫完立刻抓重点
 *
 *  🔭 深度剖析版
 *     · 分段式深度叙事：为什么你会这样 / 最容易踩的坑 / 怎么破局
 *     · 三个具体岗位 + 每个岗位「为什么是你」
 *     · 副业切入点 + 下周就能做的 1 件小事
 *     → 层层递进，信息密度高一个量级
 *
 *  【有据可依】
 *  后端没返回的段落**直接不渲染** ——
 *  宁可少一块，也不拿废话凑版面。
 * ============================================================ */

interface CareerAdviceProps {
  /** 后端返回 */
  result: CareerAdviceResult
  /** 主题强调色 */
  accent: string
}

export function CareerAdvice({ result, accent }: CareerAdviceProps) {
  /*
   * v18.0 · 版本状态来自面板头
   *
   * 面板头那颗「⚡️ 极简直给版 | 🔭 深度剖析版」胶囊
   * 与这里的结果区共用同一份状态 —— 切一下，整页跟着换。
   */
  const { version } = usePanelVersion()

  const { minimal, deep } = result

  /* ---------- 深度版有多少段可用 ---------- */
  const deepSections = [
    { key: 'origins', label: '你为什么会这样', text: deep.origins },
    { key: 'friction', label: '最容易踩的坑', text: deep.friction },
    { key: 'solution', label: '具体怎么破局', text: deep.solution },
  ].filter((s) => s.text.trim())

  const hasJobs = deep.jobs.length > 0
  const hasSide = deep.sideProject.trim()
  const hasNext = deep.nextWeek.trim()

  /* 深度版完全没内容 → 强制回落到极简版 */
  const showDeep =
    version === 'deep' &&
    (deepSections.length > 0 || hasJobs || hasSide || hasNext)

  return (
    <div className="career-advice">
      {/* ---------- 头部 ---------- */}
      <header className="mb-8 flex flex-col items-center gap-5 sm:flex-row sm:justify-between">
        <div className="text-center sm:text-left">
          <p className="eyebrow text-gold">CAREER DIRECTION</p>
          <h3 className="serif-title t-sub mt-2.5 text-mist">
            适合你的职位与行动方向
          </h3>
        </div>
        {/* ---------- v18.0 · 版本标识条 ---------- */}
        <span
          className="shrink-0 rounded-full px-4 py-2 text-[0.8125rem] font-bold tracking-[0.18em]"
          style={
            version === 'minimal'
              ? {
                  background: 'rgba(255,255,255,0.07)',
                  color: 'rgba(244,246,250,0.62)',
                  border: '1px solid rgba(255,255,255,0.13)',
                }
              : {
                  background: `${accent}22`,
                  color: accent,
                  border: `1px solid ${accent}44`,
                }
          }
        >
          {version === 'minimal' ? '⚡️ 极简直给版' : '🔭 深度剖析版'}
        </span>
      </header>

      {/* ============================================================
          ⚡️ 极简直给版
          ============================================================ */}
      {version === 'minimal' && (
        <motion.div
          key="minimal"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
          {/* 大字号高光结论 */}
          {minimal.headline && (
            <div
              className="mb-7 rounded-[22px] border px-8 py-8 text-center"
              style={{
                borderColor: `${accent}3d`,
                background:
                  'linear-gradient(150deg, rgba(245,194,107,0.13), rgba(8,13,26,0.55))',
                boxShadow: `0 18px 54px ${accent}1f`,
              }}
            >
              <p
                className="font-semibold leading-[1.55] text-mist"
                style={{ fontSize: 'clamp(1.6rem, 2.5vw, 2.4rem)' }}
              >
                {minimal.headline}
              </p>
            </div>
          )}

          {/* 三张要点短卡 */}
          {minimal.points.length > 0 && (
            <div className="mb-7 grid gap-3.5 sm:grid-cols-3">
              {minimal.points.map((p, i) => (
                <div
                  key={i}
                  className="rounded-[18px] border px-6 py-5"
                  style={{
                    borderColor: 'rgba(255,255,255,0.11)',
                    background: 'rgba(9,14,26,0.6)',
                  }}
                >
                  <span
                    className="mb-2.5 block text-[0.6875rem] font-bold tracking-[0.3em]"
                    style={{ color: accent }}
                  >
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <p className="text-[clamp(0.9375rem,1.05vw,1.125rem)] font-semibold leading-[1.7] text-mist/92">
                    {p}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* 一条行动指令 */}
          {minimal.action && (
            <div
              className="flex items-center gap-4 rounded-[18px] px-6 py-5"
              style={{
                background: `linear-gradient(120deg, ${accent}1f, transparent)`,
                border: '1px solid rgba(255,255,255,0.10)',
              }}
            >
              <span style={{ color: accent }}>
                <SparkGlyph size={24} />
              </span>
              <div>
                <p className="mb-1 text-[0.6875rem] font-bold tracking-[0.3em] text-ink-mute">
                  现在就做
                </p>
                <p className="text-[clamp(1rem,1.2vw,1.3rem)] font-semibold leading-[1.6] text-mist">
                  {minimal.action}
                </p>
              </div>
            </div>
          )}

          {/* 兜底：如果连极简版都是空的 */}
          {!minimal.headline &&
            !minimal.points.length &&
            !minimal.action && (
              <p className="py-8 text-center text-ink-mute">
                信息还不够，先把上面的优势链条和核心技能填一填。
              </p>
            )}
        </motion.div>
      )}

      {/* ============================================================
          🔭 深度剖析版
          ============================================================ */}
      {showDeep && (
        <motion.div
          key="deep"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="space-y-9"
        >
          {/* ---------- 分段式深度叙事 ---------- */}
          {deepSections.map((sec) => (
            <section key={sec.key} className="career-section">
              <h4 className="serif-title mb-3 flex items-center gap-3 text-[clamp(1.0625rem,1.25vw,1.375rem)] font-semibold tracking-[0.06em] text-mist">
                <span className="h-4 w-px" style={{ background: accent }} />
                {sec.label}
              </h4>
              <p className="serif-body whitespace-pre-line text-[clamp(0.9375rem,1.05vw,1.125rem)] font-medium leading-[1.95] text-mist/78">
                {sec.text}
              </p>
            </section>
          ))}

          {/* ---------- 三个具体岗位 ---------- */}
          {hasJobs && (
            <section className="career-section">
              <h4 className="serif-title mb-4 flex items-center gap-3 text-[clamp(1.0625rem,1.25vw,1.375rem)] font-semibold tracking-[0.06em] text-mist">
                <span className="h-4 w-px" style={{ background: accent }} />
                最契合你的三个岗位
              </h4>

              <div className="space-y-3.5">
                {deep.jobs.map((job, i) => (
                  <div
                    key={i}
                    className="rounded-[18px] border px-6 py-5"
                    style={{
                      borderColor: 'rgba(255,255,255,0.10)',
                      background: 'rgba(9,14,26,0.55)',
                    }}
                  >
                    <div className="mb-2 flex items-center gap-3">
                      <span
                        className="text-[0.6875rem] font-bold tracking-[0.3em]"
                        style={{ color: accent }}
                      >
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <span className="text-[clamp(1.0625rem,1.25vw,1.375rem)] font-bold tracking-[0.06em] text-mist">
                        {job.role}
                      </span>
                    </div>
                    {job.why && (
                      <p className="serif-body pl-8 text-[clamp(0.9375rem,1.02vw,1.0625rem)] font-medium leading-[1.85] text-mist/72">
                        {job.why}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ---------- 副业 + 下周行动 ---------- */}
          {(hasSide || hasNext) && (
            <div className="grid gap-4 lg:grid-cols-2">
              {hasSide && (
                <div
                  className="rounded-[18px] border px-6 py-6"
                  style={{
                    borderColor: `${accent}30`,
                    background: 'linear-gradient(150deg, rgba(12,18,32,0.75), rgba(6,9,18,0.5))',
                  }}
                >
                  <p className="mb-3 flex items-center gap-2.5 text-[0.6875rem] font-bold tracking-[0.3em] text-ink-mute">
                    <span style={{ color: accent }}>
                      <CycleGlyph size={16} />
                    </span>
                    副业切入点
                  </p>
                  <p className="serif-body whitespace-pre-line text-[clamp(0.9375rem,1.02vw,1.0625rem)] font-medium leading-[1.9] text-mist/82">
                    {deep.sideProject}
                  </p>
                </div>
              )}

              {hasNext && (
                <div
                  className="rounded-[18px] border px-6 py-6"
                  style={{
                    borderColor: `${accent}44`,
                    background: `linear-gradient(150deg, ${accent}18, rgba(6,9,18,0.5))`,
                  }}
                >
                  <p className="mb-3 flex items-center gap-2.5 text-[0.6875rem] font-bold tracking-[0.3em] text-ink-mute">
                    <span style={{ color: accent }}>
                      <CareerGlyph size={16} />
                    </span>
                    下周就能做的 1 件小事
                  </p>
                  <p className="serif-body whitespace-pre-line text-[clamp(0.9375rem,1.02vw,1.0625rem)] font-semibold leading-[1.9] text-mist/92">
                    {deep.nextWeek}
                  </p>
                </div>
              )}
            </div>
          )}
        </motion.div>
      )}
    </div>
  )
}
