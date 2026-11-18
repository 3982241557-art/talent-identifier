import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  VersionToggle,
  type ReportVersion,
} from '../common/VersionToggle'
import type { MbtiProfile } from '../../types'
import { MBTI_TYPES } from '../../data/mbtiTypes'
import { AXIS_PLAIN, splitType } from '../../data/mbtiPlain'

/* ============================================================
 *  MBTI 解码 · 专属枢纽
 *
 *  v2.0 新增板块，包含三部分：
 *  1. 该 MBTI 的具体含义与性格优势
 *  2. 「重新测算」/「手动修改」MBTI 的入口
 *  3. 名人共鸣库 —— 同类型的代表人物，建立群体归属感
 * ============================================================ */

interface MbtiHubProps {
  mbti: MbtiProfile | null
  /** 主题色 */
  accent: string
  /** 副主题色 */
  accent2: string
  /** 重新测算 / 手动修改 */
  onEdit: () => void
}

export function MbtiHub({ mbti, accent, accent2, onEdit }: MbtiHubProps) {
  /*
   * v17.0 · 双版本切换
   *
   * ⚡️ 极简直给版：一句话结论 + 三个白话优势 + 今日行动
   * 🔭 深度剖析版：完整含义 + 优势清单 + 盲区 + 四个字母详解 + 名人共鸣
   *
   * 极简版的内容**全部来自本地数据**（MBTI_TYPES），
   * 不需要额外请求 —— 切换是 0 延迟秒切。
   */
  const [version, setVersion] = useState<ReportVersion>('minimal')

  if (!mbti) {
    return (
      <section className="w-full">
        <p className="text-[18px] font-semibold tracking-[0.5em] text-mist/45">
          MBTI RESONANCE
        </p>
        <h3 className="serif-title mt-3 text-[clamp(2rem,2.6vw,3.4rem)] font-semibold tracking-[0.12em] text-mist">
          MBTI 解码
        </h3>
        <p className="serif-body mt-5 text-[25.5px] font-medium leading-[1.62] text-mist/65">
          还没测过。回到出生信息那一步，重新走一遍就好。
        </p>
        <button
          onClick={onEdit}
          className="mt-7 border-0 px-7 py-3 text-[22.5px] font-semibold tracking-[0.24em] text-paper transition-opacity duration-500 hover:opacity-80 focus:outline-none"
          style={{ background: accent }}
        >
          去测算 →
        </button>
      </section>
    )
  }

  const info = MBTI_TYPES[mbti.type]

  return (
    <section className="w-full">
      {/* ---------- 标题 ---------- */}
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="text-[18px] font-semibold tracking-[0.5em] text-mist/45">
            MBTI RESONANCE HUB
          </p>
          <h3 className="serif-title mt-3 text-[clamp(2rem,2.6vw,3.4rem)] font-semibold tracking-[0.12em] text-mist sm:text-[60px]">
            MBTI 解码
          </h3>
        </div>
        <div className="flex items-center gap-5">
          <div className="text-right">
            <p
              className="serif-title text-[clamp(2.5rem,3.4vw,4.5rem)] font-semibold leading-none tracking-[0.12em]"
              style={{ color: accent }}
            >
              {mbti.type}
            </p>
            {info && (
              <p className="mt-2 text-[21px] font-medium tracking-[0.24em] text-mist/60">
                {info.nickname}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ---------- v17.0 · 双版本切换 ---------- */}
      <div className="mt-6 flex justify-end">
        <VersionToggle value={version} onChange={setVersion} />
      </div>

      <span
        className="mt-6 block h-px w-full"
        style={{ background: accent }}
      />

      {/* ============================================================
          ⚡️ 极简直给版
          一句话结论 + 三张白话短卡 + 一条今日行动
          ============================================================ */}
      {version === 'minimal' && info && (
        <motion.div
          key="mbti-minimal"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="mt-9"
        >
          {/* ---------- v17.2 · 极简版标识 ----------
           * 与深度版的门头形成对称，
           * 但体量刻意更小 —— 暗示「三秒读完」。 */}
          <div className="mb-6 flex items-center gap-3">
            <span
              className="rounded-full px-3 py-0.5 text-[0.625rem] font-bold tracking-[0.26em]"
              style={{
                background: 'rgba(255,255,255,0.07)',
                color: 'rgba(244,246,250,0.62)',
                border: '1px solid rgba(255,255,255,0.13)',
              }}
            >
              ⚡️ 极简直给版
            </span>
            <span className="text-[0.75rem] font-medium tracking-[0.18em] text-ink-mute">
              一句话 + 三个长处 + 今天能做的一件事
            </span>
          </div>

          {/* 大字号结论句 */}
          <p
            className="serif-body max-w-[820px] font-semibold leading-[1.55] text-mist"
            style={{ fontSize: 'clamp(1.5rem, 2.3vw, 2.3rem)' }}
          >
            {info.essence}
          </p>

          {/* 三张短卡 */}
          {info.strengths.length > 0 && (
            <div className="mt-7 grid gap-3.5 sm:grid-cols-3">
              {info.strengths.slice(0, 3).map((st, i) => (
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
                    {st}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* 一条今日行动 */}
          <div
            className="mt-6 flex items-start gap-4 rounded-[18px] px-6 py-5"
            style={{
              background: `linear-gradient(120deg, ${accent}1f, transparent)`,
              border: '1px solid rgba(255,255,255,0.10)',
            }}
          >
            <div>
              <p className="mb-1 text-[0.6875rem] font-bold tracking-[0.3em] text-ink-mute">
                今天就能做
              </p>
              <p className="text-[clamp(1rem,1.2vw,1.3rem)] font-semibold leading-[1.6] text-mist">
                {info.blindspot
                  ? `留意「${info.blindspot.split('。')[0]}」这一点，别让它替你做决定。`
                  : '今天照常发挥就好，不用刻意表现。'}
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {/* ============================================================
          🔭 深度剖析版
          完整含义 + 优势清单 + 盲区 + 四个字母详解 + 名人共鸣
          ============================================================ */}
      {version === 'deep' && (
      <motion.div
        key="mbti-deep"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -12 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
      {/* ---------- v17.2 · 深度版标识条 ----------
       * 与极简版形成**明确的视觉反差**：
       * 极简版 = 一屏读完的三张短卡；
       * 深度版 = 带门头的双栏长文布局。 */}
      <div
        className="mt-8 flex items-center gap-4 border-b pb-4"
        style={{ borderColor: `${accent}33` }}
      >
        <span
          className="rounded-full px-3.5 py-1 text-[0.6875rem] font-bold tracking-[0.28em]"
          style={{
            background: `${accent}22`,
            color: accent,
            border: `1px solid ${accent}44`,
          }}
        >
          🔭 深度剖析版
        </span>
        <span className="text-[0.8125rem] font-medium tracking-[0.2em] text-ink-mute">
          逐层拆开 · 含四个字母详解与历史人物共鸣
        </span>
      </div>

      {/* ---------- 一句话底色 ---------- */}
      {info && (
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.1, ease: 'easeOut' }}
          className="serif-body mt-8 max-w-[760px] text-[30px] font-medium leading-[1.62] text-mist"
        >
          {info.essence}
        </motion.p>
      )}

        <div className="mt-12 grid gap-12 lg:grid-cols-[1.25fr_1fr]">
        {/* ---------- 左：含义 + 优势 ---------- */}
        <div>
          {info && (
            <>
              <h4 className="text-[21px] font-semibold tracking-[0.4em] text-mist/55">
                这个类型意味着什么
              </h4>
              <p className="serif-body mt-5 text-[24.8px] font-medium leading-[1.65] text-mist/80">
                {info.meaning}
              </p>

              <h4 className="mt-11 text-[21px] font-semibold tracking-[0.4em] text-mist/55">
                你的性格优势
              </h4>
              <ul className="mt-5 space-y-4">
                {info.strengths.map((s) => (
                  <li key={s} className="flex gap-4">
                    <span
                      className="mt-[13px] block h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ background: accent }}
                    />
                    <p className="serif-body text-[24px] font-medium leading-[1.62] text-mist/80">
                      {s}
                    </p>
                  </li>
                ))}
              </ul>

              {/* 盲区 */}
              <div
                className="mt-10 border-l-2 pl-6"
                style={{ borderColor: accent2 }}
              >
                <p className="text-[19.5px] font-semibold tracking-[0.34em] text-mist/50">
                  值得留意的地方
                </p>
                <p className="serif-body mt-3 text-[23.3px] font-medium leading-[1.62] text-mist/65">
                  {info.blindspot}
                </p>
              </div>
            </>
          )}
        </div>

        {/* ---------- 右：四个字母的白话解释 + 重新测算 ----------
            v11.0：彻底废除「内倾直觉 Ni / 外倾情感 Fe」这类
            认知功能术语，换成大众一看就懂的四个维度。 */}
        <div>
          {info && (
            <>
              <h4 className="text-[21px] font-semibold tracking-[0.4em] text-mist/55">
                你的四个字母
              </h4>
              <p className="mt-3 text-[19.5px] font-medium leading-[1.6] text-mist/50">
                每个字母代表你身上一个很具体的习惯。
              </p>
              <div className="mt-7 space-y-7">
                {(['EI', 'NS', 'TF', 'JP'] as const).map((ax, i) => {
                  const plain = AXIS_PLAIN[ax]
                  const letter = splitType(mbti.type)[ax]
                  const side = plain.sides[letter]
                  return (
                    <div
                      key={ax}
                      className="border-b border-white/8 pb-6 last:border-0"
                    >
                      <div className="flex items-baseline justify-between gap-4">
                        <span
                          className="text-[19.5px] font-semibold tracking-[0.1em] text-mist/60"
                        >
                          {plain.name}
                        </span>
                        <span
                          className="serif-title text-[30px] font-semibold tracking-[0.1em]"
                          style={{ color: i % 2 === 0 ? accent : accent2 }}
                        >
                          {letter}
                        </span>
                      </div>
                      <p
                        className="mt-2.5 text-[22px] font-semibold leading-[1.5]"
                        style={{ color: i % 2 === 0 ? accent : accent2 }}
                      >
                        {side.label}
                      </p>
                      <p className="serif-body mt-2 text-[21px] font-medium leading-[1.68] text-mist/78">
                        {side.desc}
                      </p>
                    </div>
                  )
                })}
              </div>
            </>
          )}

          {/* 重新测算 / 手动修改 */}
          <div className="mt-11">
            <h4 className="text-[21px] font-semibold tracking-[0.4em] text-mist/55">
              重新测算
            </h4>
            <p className="serif-body mt-4 text-[23.3px] font-medium leading-[1.62] text-mist/65">
              如果你想再测一次，或直接手动改成另一个类型，
              这里都可以。改完会同步更新你的星盘与灵魂底色。
            </p>
            <button
              onClick={onEdit}
              className="mt-6 border-0 px-7 py-3 text-[22.5px] font-semibold tracking-[0.24em] text-paper transition-opacity duration-500 hover:opacity-80 focus:outline-none"
              style={{ background: accent }}
            >
              重新测算 / 手动修改
            </button>
          </div>
        </div>
      </div>

      {/* ---------- 名人共鸣库 ---------- */}
      {info && info.figures.length > 0 && (
        <div className="mt-16">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[18px] font-semibold tracking-[0.5em] text-mist/45">
                SAME WAVE · 名人共鸣
              </p>
              <h4 className="serif-title mt-3 text-[clamp(1.75rem,2.2vw,3rem)] font-semibold tracking-[0.12em] text-mist">
                和你同类型的他们
              </h4>
            </div>
            <p className="max-w-[360px] text-right text-[21px] font-medium leading-[1.58] text-mist/55">
              历史上、文艺界与虚构世界里的 {mbti.type} 们。
              看到熟悉的名字时，那多半不是巧合。
            </p>
          </div>

          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {info.figures.map((f, i) => (
              <motion.article
                key={f.name}
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 1,
                  delay: 0.06 * i,
                  ease: 'easeOut',
                }}
                className="group relative px-5 py-6 transition-colors duration-700 hover:bg-white/6"
                style={{ boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.10)' }}
              >
                <span
                  className="absolute left-0 top-0 h-px w-8 transition-all duration-700 group-hover:w-16"
                  style={{ background: i % 2 === 0 ? accent : accent2 }}
                />
                <p className="text-[16.5px] font-semibold tracking-[0.34em] text-mist/45">
                  {f.field}
                </p>
                <p className="serif-title mt-3 text-[30px] font-semibold leading-snug tracking-[0.06em] text-mist">
                  {f.name}
                </p>
                <p className="serif-body mt-3 text-[21.8px] font-medium leading-[1.58] text-mist/65">
                  {f.note}
                </p>
              </motion.article>
            ))}
          </div>
        </div>
      )}
      </motion.div>
      )}
    </section>
  )
}
