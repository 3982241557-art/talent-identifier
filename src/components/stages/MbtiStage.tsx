import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { MbtiAnswer, MbtiAxis, MbtiProfile, MbtiView } from '../../types'
import { MBTI_TYPES, MBTI_TYPE_LIST } from '../../data/mbtiTypes'
import { AXIS_PLAIN, splitType } from '../../data/mbtiPlain'
import {
  SIMPLE_QUESTION_COUNT,
  getSimpleQuestion,
} from '../../data/mbtiSimple'
import { buildMbtiProfile } from '../../lib/mbti'
import { postMbtiQuestion, type AnswerRecord, ApiError, API_ERR } from '../../lib/api'
import { TypewriterLine } from '../common/TypewriterLine'
import { SocratesPortrait } from '../common/SocratesPortrait'
import { useApp } from '../../store/AppContext'

/* ============================================================
 *  P2 · MBTI 动态问答流
 *
 *  v5.0：
 *  1. 三个子视图（branch / manual / explore）由全局路由栈驱动。
 *  2. 全部子视图改用「页头 + 弹性主体」的单屏布局，
 *     主体内部滚动，页面本身零滚动条。
 *  3. 字号改用 clamp() 弹性刻度，行高收紧，彻底消除文字重叠。
 * ============================================================ */

interface MbtiStageProps {
  /** 当前子视图 */
  view: MbtiView
  onComplete: (profile: MbtiProfile) => void
  /** 返回上一级页面 */
  onBack: () => void
  /** 切换子视图（不压栈，保持在 mbti 节点内） */
  onViewChange: (view: MbtiView) => void
}

/** 题目总数（v11.0：本地静态题库，20 道直白二元题） */
const TOTAL_QUESTIONS = SIMPLE_QUESTION_COUNT

/**
 * v11.0 · 题序表 —— 刻意打乱轴向顺序。
 *
 * 不按 EI→NS→TF→JP 连排，是为了不让用户察觉
 * 「每四题在测同一个东西」，否则他会刻意改变答案。
 */
const AXIS_CYCLE: MbtiAxis[] = Array.from(
  { length: TOTAL_QUESTIONS },
  (_, i) => getSimpleQuestion(i).axis,
)

/** 开场白 —— v11.0：极简、说人话 */
const OPENING =
  '二十个问题，一分钟左右。' +
  '没有标准答案，凭第一反应选就行 —— ' +
  '想都不用想的那一下，通常最准。'

/** 收尾语 —— v11.0 */
const CLOSING =
  '好了。你的轮廓已经很清楚了 —— ' +
  '接下来，把它放到星盘里看看。'

/** 分支选择文案 */
const BRANCH_INTRO =
  '你已经知道自己是什么类型了吗？' +
  '知道的话直接选；不知道的话，我用二十个问题问出来。'

/* ============================================================
 *  v6.0 · 错误分类 → 用户可读文案
 *
 *  旧版把所有异常都显示成「此刻智者尚未与云端连上」，
 *  但实际原因可能是限流、超时、Key 未配置或后端没启动。
 *  现在按类型给出不同的引导，用户才知道该做什么。
 * ============================================================ */
function describeApiError(e: unknown): string {
  if (e instanceof ApiError) {
    switch (e.code) {
      case API_ERR.RATE_LIMIT:
        return '云端此刻有点繁忙 —— 我已经换成本地题库在等你了，若仍失败，稍等片刻再试。'
      case API_ERR.TIMEOUT:
        return '云端响应慢了一点。已经重试过，若仍失败，稍等片刻再试。'
      case API_ERR.NO_KEY:
      case API_ERR.PLACEHOLDER_KEY:
        return '智者还没有拿到云端的钥匙。请在 server/.env 中填入真实的 DEEPSEEK_API_KEY。'
      case API_ERR.NETWORK:
        return '连不上后端服务。请确认后端已启动（npm run server），端口默认为 8787。'
      case API_ERR.UPSTREAM:
        return '云端暂时无法响应。请稍后再试一次。'
      default:
        return '这一题没能顺利问出来，再试一次就好。'
    }
  }
  return '这一题没能顺利问出来，再试一次就好。'
}

export function MbtiStage({
  view,
  onComplete,
  onBack,
  onViewChange,
}: MbtiStageProps) {
  const { state, dispatch } = useApp()
  const session = state.mbtiSession

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  /** v6.0：是否降级到本地题库（云端不可用时自动接管） */
  const [degraded, setDegraded] = useState(false)

  const { answers, question, finished } = session
  const index = answers.length

  /**
   * v7.0 · 状态流转修复
   *
   * 旧实现的两个 BUG：
   *
   * 【BUG 1 · 残影】
   *   AnimatePresence 的 key 用的是 `${index}-${question.text}`。
   *   用户点击选项时，`patch({answers: next})` 立刻把 index 加一，
   *   但此时 `question` 还是**旧的那道题**。
   *   → key 变了 → AnimatePresence 认为「旧块退场、新块进场」
   *   → 同一道题被 exit 一次再 enter 一次
   *   → 用户看到「问题闪一下又消失」。
   *
   * 【BUG 2 · 选项重复可点】
   *   点击后没有立刻锁住，用户可以在网络返回前连点多次，
   *   导致 answers 被追加多次、index 跳位。
   *
   * 【v7.0 解法】
   *   · key 改用 `session.qSeq` —— 只在新题真正到达时递增，永不抖动。
   *   · 新增 `picked` 状态：点击瞬间锁定，记录已选项，
   *     该选项高亮、其余选项淡出并禁用，形成「被选中 → 等待下一题」的连续感。
   *   · 题目在下一题到达前**不卸载**，而是原地进入「过渡态」，
   *     避免 exit/enter 造成的高度塌陷。
   */
  const [picked, setPicked] = useState<{ label: string; value: 1 | -1 } | null>(
    null,
  )
  /** 已点选但下一题尚未到达 —— 锁定交互 */
  const [advancing, setAdvancing] = useState(false)

  /** 防止并发重复取题 */
  const fetching = useRef(false)

  /* ---------- 更新会话 ---------- */
  const patch = useCallback(
    (s: Partial<typeof session>) =>
      dispatch({ type: 'setMbtiSession', session: s }),
    [dispatch],
  )

  /* ============================================================
   *  v11.0 · 本地出题（零网络等待）
   *
   *  旧版每题都走一次云端往返，平均 3~8 秒，
   *  20 题累计 1~3 分钟 —— 而用户的直觉反应只有前 10 秒。
   *
   *  现在题目全部来自本地静态题库（src/data/mbtiSimple.ts），
   *  点一下就出下一题，一分钟能点完 20 题。
   *
   *  【云端仍保留为可选增强】
   *  用户点「换一道问法」时，才调用 AI 重新措辞这一题 ——
   *  题目内核仍锁死在本地母题上，不会跑偏。
   * ============================================================ */
  const loadLocal = useCallback(
    (count: number) => {
      const q = getSimpleQuestion(count)
      patch({
        question: {
          text: q.text,
          options: q.options.map((o) => ({ ...o })),
        },
        asked: session.asked,
        currentAxis: q.axis,
        qSeq: session.qSeq + 1,
      })
      setError('')
      setLoading(false)
      fetching.current = false
    },
    [patch, session.asked, session.qSeq],
  )

  /* ---------- 拉取下一题（本地优先，失败才走云端） ---------- */
  const fetchNext = useCallback(
    async (count: number, _history: AnswerRecord[]) => {
      if (fetching.current) return
      fetching.current = true
      setLoading(false)
      setError('')
      try {
        /*
         * v11.0：默认走本地题库，**不发网络请求**。
         * 只有用户主动点「换一道问法」时才会走云端分支。
         */
        loadLocal(count)
      } catch (e) {
        setError(describeApiError(e))
        fetching.current = false
      }
    },
    [loadLocal],
  )

  /**
   * 【可选增强】用 AI 重新措辞当前这道题。
   *
   * 题目内核不变（后端锁定母题原型），只是换个说法，
   * 用来打破「二十道题都一个味」的疲劳感。
   */
  const rewordCurrent = useCallback(async () => {
    if (!question || fetching.current) return
    fetching.current = true
    setLoading(true)
    setError('')
    const axis = session.currentAxis
    const history: AnswerRecord[] = answers.map((a) => ({
      question: a.question ?? '',
      answer: a.label,
      axis: a.axis,
    }))
    try {
      const res = await postMbtiQuestion({
        answeredCount: index,
        total: TOTAL_QUESTIONS,
        axis,
        history,
      })
      const text = (res.question ?? '').trim()
      if (!text) throw new Error('empty')
      patch({
        question: {
          text,
          options: res.options?.filter((o) => o?.label) ?? question.options,
          bridge: res.bridge,
        },
        asked: [...session.asked, text],
        qSeq: session.qSeq + 1,
      })
      setDegraded(Boolean(res.degraded))
    } catch (e) {
      setError(describeApiError(e))
    } finally {
      setLoading(false)
      fetching.current = false
    }
  }, [
    answers,
    index,
    patch,
    question,
    session.asked,
    session.currentAxis,
    session.qSeq,
  ])

  /* ---------- 进入探索模式：取第一题 ---------- */
  useEffect(() => {
    if (view === 'explore' && !question && !loading && !error && !fetching.current) {
      void fetchNext(0, [])
    }
  }, [view, question, loading, error, fetchNext])

  /* ---------- v7.0：离开探索模式时清掉过渡态 ---------- */
  useEffect(() => {
    if (view !== 'explore') {
      setPicked(null)
      setAdvancing(false)
    }
  }, [view])

  /* ---------- 选择答案 ---------- */
  const handlePick = (value: 1 | -1, label: string) => {
    // v7.0：锁定，防止连点造成 answers 重复追加
    if (!question || advancing) return

    // 立刻记录选中项并锁定交互 —— 给出即时的视觉反馈
    setPicked({ label, value })
    setAdvancing(true)

    const next: MbtiAnswer[] = [
      ...answers,
      {
        questionId: `q${index + 1}`,
        axis: session.currentAxis,
        value,
        label,
        question: question.text,
      },
    ]
    patch({ answers: next })

    if (next.length >= TOTAL_QUESTIONS) {
      patch({ finished: true })
      window.setTimeout(() => onComplete(buildMbtiProfile(next)), 2600)
      return
    }
    // 依据历史回答动态生成下一题
    const history: AnswerRecord[] = next.map((a) => ({
      question: a.question ?? '',
      answer: a.label,
      axis: a.axis,
    }))
    void fetchNext(next.length, history).finally(() => {
      // 新题到位后解锁，并清空选中态
      setPicked(null)
      setAdvancing(false)
    })
  }

  /* ---------- 手动填写：构造一个完整的 profile ---------- */
  const handleManual = () => {
    const type = session.manualType.trim().toUpperCase()
    if (!MBTI_TYPE_LIST.includes(type)) {
      setError('请选择一个有效的 MBTI 类型。')
      return
    }
    const letters = {
      EI: type[0] as 'E' | 'I',
      NS: type[1] as 'N' | 'S',
      TF: type[2] as 'T' | 'F',
      JP: type[3] as 'J' | 'P',
    }
    onComplete({
      type,
      letters,
      answers: [],
      traits: MBTI_TYPES[type].strengths.slice(0, 3).map((s) => s.slice(0, 6)),
      summary: MBTI_TYPES[type].essence,
    })
  }

  /* ---------- 分支选择页 ---------- */
  if (view === 'branch') {
    return (
      <div className="screen-col">
        <PageHeader
          eyebrow="MBTI"
          title="看看你骨子里是个什么样的人"
          onBack={onBack}
        />

        <div className="screen-scroll">
          <div className="mx-auto flex w-full max-w-[860px] flex-col gap-10 px-6 py-8 sm:px-10 sm:py-12">
            {/* ---------- v16.0 · 深空玻璃壳 ---------- */}
            <div className="glass-panel flex flex-col gap-10 rounded-[28px] px-6 py-8 sm:px-9 sm:py-10">
            <motion.p
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1.2 }}
              className="serif-body t-lead font-medium text-ink"
            >
              <TypewriterLine text={BRANCH_INTRO} speed={32} />
            </motion.p>

            <div className="flex flex-col gap-6">
              {/* 分支一：知道自己的类型 */}
              <motion.button
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 1.1, delay: 0.2 }}
                onClick={() => onViewChange('manual')}
                className="group block w-full border-0 bg-transparent p-7 text-left focus:outline-none"
                style={{ boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.12), 0 18px 46px rgba(0,0,0,0.42)' }}
              >
                <p className="eyebrow text-ink-mute">选一</p>
                <p className="serif-title t-sub mt-3 text-ink">我知道自己的 MBTI，直接选</p>
                <p className="serif-body t-body mt-3 font-medium text-ink-soft">
                  从 16 型人格中选出你确定的那一个，跳过问答。
                </p>
                <span className="mt-4 block text-[clamp(0.9375rem,1.05vw,1.25rem)] font-semibold tracking-[0.2em] text-ink-mute transition-colors duration-500 group-hover:text-ink">
                  选择类型 →
                </span>
              </motion.button>

              {/* 分支二：不清楚 → 做 20 个快问快答 */}
              <motion.button
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 1.1, delay: 0.35 }}
                onClick={() => {
                  patch({ question: null })
                  onViewChange('explore')
                }}
                className="group block w-full border-0 bg-transparent p-7 text-left focus:outline-none"
                style={{ boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.12), 0 18px 46px rgba(0,0,0,0.42)' }}
              >
                <p className="eyebrow text-ink-mute">选二</p>
                <p className="serif-title t-sub mt-3 text-ink">不清楚？做 20 个快问快答测一下</p>
                <p className="serif-body t-body mt-3 font-medium text-ink-soft">
                  {TOTAL_QUESTIONS} 道很简单的选择题，一分钟点完。
                  凭第一反应选，不用想标准答案。
                </p>
                <span className="mt-4 block text-[clamp(0.9375rem,1.05vw,1.25rem)] font-semibold tracking-[0.2em] text-ink-mute transition-colors duration-500 group-hover:text-ink">
                  开始探索 →
                </span>
              </motion.button>
            </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  /* ---------- 手动填写页 ---------- */
  if (view === 'manual') {
    return (
      <div className="screen-col">
        <PageHeader
          eyebrow="MBTI · 手动填写"
          title="你的类型"
          onBack={() => {
            setError('')
            onViewChange('branch')
          }}
        />

        <div className="screen-scroll">
          <div className="mx-auto flex w-full max-w-[960px] flex-col gap-8 px-6 py-8 sm:px-10 sm:py-12">
            {/* ---------- v16.0 · 深空玻璃壳 ---------- */}
            <div className="glass-panel flex flex-col gap-8 rounded-[28px] px-6 py-8 sm:px-9 sm:py-10">
            {/* 16 型下拉 */}
            <label className="flex flex-col gap-2">
              <span className="text-[clamp(0.9375rem,1.05vw,1.25rem)] font-semibold tracking-[0.24em] text-ink-soft">
                选择你的 MBTI 类型
              </span>
              <span className="underline-glow block">
                <select
                  value={session.manualType}
                  onChange={(e) => {
                    patch({ manualType: e.target.value })
                    setError('')
                  }}
                  className="w-full bg-transparent pb-3 text-[clamp(1.375rem,1.7vw,2rem)] font-semibold text-ink outline-none [color-scheme:dark]"
                >
                  <option value="">请选择</option>
                  {MBTI_TYPE_LIST.map((t) => (
                    <option key={t} value={t}>
                      {t} · {MBTI_TYPES[t].nickname}
                    </option>
                  ))}
                </select>
              </span>
            </label>

            {/* 预览 */}
            {session.manualType && MBTI_TYPES[session.manualType] && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8 }}
                className="flex flex-col gap-6"
              >
                <p className="serif-body t-lead font-medium text-ink">
                  {MBTI_TYPES[session.manualType].essence}
                </p>
                <div className="grid gap-6 sm:grid-cols-2">
                  {(['EI', 'NS', 'TF', 'JP'] as MbtiAxis[]).map((ax) => {
                    const plain = AXIS_PLAIN[ax]
                    const letter = splitType(session.manualType)[ax]
                    const side = plain.sides[letter]
                    return (
                      <div key={ax} className="flex flex-col gap-2">
                        <p className="text-[clamp(0.8125rem,0.85vw,1rem)] font-semibold tracking-[0.28em] text-ink-mute">
                          {plain.name}
                        </p>
                        <p className="text-[clamp(1.0625rem,1.15vw,1.375rem)] font-semibold leading-[1.6] text-ink">
                          {side.label}
                        </p>
                        <p className="text-[clamp(0.9375rem,1.02vw,1.1875rem)] font-medium leading-[1.68] text-ink-soft">
                          {side.desc}
                        </p>
                      </div>
                    )
                  })}
                </div>
              </motion.div>
            )}

            {error && (
              <p className="text-[clamp(1rem,1.15vw,1.35rem)] font-semibold tracking-[0.06em] text-ink-soft">
                {error}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-6">
              <button
                onClick={handleManual}
                disabled={!session.manualType}
                className="btn-photon border-0 rounded-full px-8 py-3.5 text-[clamp(1.0625rem,1.25vw,1.45rem)] font-semibold tracking-[0.2em] focus:outline-none disabled:opacity-35"
              >
                就用它
              </button>
              <button
                onClick={() => {
                  patch({ question: null })
                  onViewChange('explore')
                }}
                className="btn-ghost border-0 pb-1 text-[clamp(0.9375rem,1.05vw,1.25rem)] font-semibold tracking-[0.2em] focus:outline-none"
              >
                其实我也不知道，还是问答 →
              </button>
            </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  /* ---------- 问答页 ---------- */
  const currentAxis: MbtiAxis = AXIS_CYCLE[index % AXIS_CYCLE.length]

  return (
    <div className="screen-col">
      {/* 顶部：标题 + 进度 */}
      <header className="screen-fixed flex shrink-0 flex-col gap-4 px-8 pt-8 sm:pt-10">
        <div className="mx-auto flex w-full max-w-[1200px] items-end justify-between gap-6">
          <div className="flex flex-col gap-1.5">
            <p className="text-[clamp(0.8125rem,0.85vw,1rem)] font-semibold tracking-[0.4em] text-ink-mute">
              {Math.min(index + 1, TOTAL_QUESTIONS)} / {TOTAL_QUESTIONS}
            </p>
            {/* v11.0：不再显示「精力来源 / 信息偏好」这类术语，
                改显示这一维度的白话提问。 */}
            <h2 className="serif-title t-sub text-ink">
              {AXIS_PLAIN[currentAxis].question}
            </h2>
          </div>
          <div className="flex shrink-0 items-center gap-6">
            {/* v11.0：可选增强 —— 让 AI 换个说法重述当前这题 */}
            <button
              onClick={() => void rewordCurrent()}
              disabled={loading || advancing}
              className="border-0 bg-transparent pb-1 text-[clamp(0.8125rem,0.9vw,1.0625rem)] font-semibold tracking-[0.16em] text-ink-mute/70 transition-colors duration-500 hover:text-ink focus:outline-none disabled:opacity-35"
            >
              {loading ? '换一句…' : '换一道问法'}
            </button>
            <button
              onClick={() => {
                patch({ question: null })
                onViewChange('branch')
              }}
              className="shrink-0 border-0 bg-transparent pb-1 text-[clamp(0.9375rem,1.05vw,1.25rem)] font-semibold tracking-[0.2em] text-ink-mute transition-colors duration-500 hover:text-ink focus:outline-none"
            >
              返回
            </button>
          </div>
        </div>
        {/* 进度条 */}
        <div className="mx-auto h-px w-full max-w-[1200px] bg-white/10">
          <motion.div
            className="h-px bg-gold"
            animate={{
              width: `${((index + (finished ? 1 : 0)) / TOTAL_QUESTIONS) * 100}%`,
            }}
            transition={{ duration: 0.7, ease: 'easeOut' }}
          />
        </div>
      </header>

      {/* 主体：左头像 + 右对话 */}
      <div className="screen-center">
        <div className="flex w-full max-w-[1320px] flex-col items-center justify-center gap-8 lg:flex-row lg:items-center lg:gap-14">
          {/* 苏格拉底 */}
          <motion.div
            initial={{ opacity: 0, x: -24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 1.4 }}
            className="flex shrink-0 flex-col items-center"
          >
            <div className="relative">
              <div
                className="breathe absolute left-1/2 top-1/2 h-[280px] w-[280px] -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{
                  background:
                    'radial-gradient(circle, rgba(124,224,249,0.16) 0%, rgba(255,255,255,0) 68%)',
                }}
              />
              <SocratesPortrait
                height="clamp(150px,17vh,230px)"
                className="float-slow relative w-auto lg:h-[clamp(190px,24vh,300px)]"
                style={{
                  filter: 'grayscale(0.35) brightness(1.16) contrast(1.05) drop-shadow(0 0 24px rgba(124,224,249,0.28))',
                  maskImage: 'linear-gradient(to bottom, #000 78%, transparent 100%)',
                  WebkitMaskImage:
                    'linear-gradient(to bottom, #000 78%, transparent 100%)',
                }}
              />
            </div>
            <p className="mt-3 text-center text-[clamp(1.125rem,1.35vw,1.6rem)] font-semibold tracking-[0.2em] text-ink">
              苏格拉底
            </p>
            <p className="mt-1 text-center text-[clamp(0.75rem,0.9vw,1rem)] font-medium tracking-[0.24em] text-ink-mute">
              SOCRATES
            </p>
          </motion.div>

          {/* 对话区 —— v16.0：深空玻璃卡片 */}
          <div className="glass-panel w-full max-w-[720px] rounded-[26px] px-7 py-8 sm:px-10 sm:py-10">
            {/* v7.0：mode="wait" → mode="popLayout"
                旧版在 wait 模式下，exit 动画期间新块完全不渲染，
                加上 key 抖动就成了「闪一下消失」；
                popLayout 让退场块脱离文档流，新块立刻顶上，
                高度不会塌陷，视觉上彻底无缝。 */}
            <AnimatePresence mode="popLayout" initial={false}>
              {finished ? (
                <motion.div
                  key="closing"
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 1.2, ease: 'easeOut' }}
                  className="border-l-4 border-white/12 pl-7"
                >
                  <p className="serif-body t-lead font-medium text-ink">
                    <TypewriterLine text={CLOSING} speed={38} />
                  </p>
                </motion.div>
              ) : loading && !question ? (
                <motion.div
                  key="loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="border-l-4 border-white/12 pl-7"
                >
                  {/* v11.0：只在「换一道问法」时出现 */}
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1.5">
                      {[0, 1, 2].map((i) => (
                        <motion.span
                          key={i}
                          className="block h-2 w-2 rounded-full bg-ink/60"
                          animate={{ opacity: [0.25, 1, 0.25], y: [0, -4, 0] }}
                          transition={{
                            duration: 1.1,
                            repeat: Infinity,
                            delay: i * 0.16,
                            ease: 'easeInOut',
                          }}
                        />
                      ))}
                    </span>
                    <p className="serif-body t-lead font-medium text-ink-mute">
                      正在换个说法问你这题…
                    </p>
                  </div>
                </motion.div>
              ) : question ? (
                <motion.div
                  /* v7.0：key 只用 qSeq —— 只在新题到达时变化，
                     点击选项时 key 不变 → 不会触发退场/进场 → 没有残影 */
                  key={`q-${session.qSeq}`}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.75, ease: 'easeOut' }}
                  className="border-l-4 border-white/12 pl-7"
                >
                  {/* 倾听反馈 */}
                  {(question.bridge || index === 0) && (
                    <p className="serif-body t-body mb-4 font-medium text-ink-mute">
                      <TypewriterLine
                        text={question.bridge || OPENING}
                        speed={30}
                      />
                    </p>
                  )}

                  {/* v6.0：降级到本地题库时的轻提示（不打断流程） */}
                  {degraded && (
                    <p className="mb-3 inline-flex items-center gap-2 border border-white/10 px-3 py-1.5 text-[clamp(0.75rem,0.8vw,0.9rem)] font-semibold tracking-[0.1em] text-ink/50">
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-ink/40" />
                      云端暂不可用 · 用的是本地题库
                    </p>
                  )}

                  {/* 问题 */}
                  <p className="serif-body t-lead font-semibold text-ink">
                    <TypewriterLine
                      key={`qt-${session.qSeq}`}
                      text={question.text}
                      speed={34}
                    />
                  </p>

                  {/* 选项
                      v7.0：点击后进入「已选中」态 ——
                      选中项高亮并向左轻移，其余项淡出并禁用。
                      视觉上形成「被选中 → 等待下一题」的连续感，
                      而不是瞬间消失重来。 */}
                  <div className="mt-7 flex flex-col gap-3">
                    {question.options.map((opt) => {
                      const isPicked = picked?.label === opt.label
                      const isDimmed = advancing && !isPicked
                      return (
                        <motion.button
                          key={opt.label}
                          data-mbti-option={opt.label}
                          onClick={() => handlePick(opt.value, opt.label)}
                          disabled={advancing}
                          animate={{
                            opacity: isDimmed ? 0.28 : 1,
                            x: isPicked ? 10 : 0,
                          }}
                          transition={{ duration: 0.45, ease: 'easeOut' }}
                          className="group flex w-full items-start gap-5 border-0 bg-transparent p-6 text-left focus:outline-none disabled:cursor-default"
                          style={{
                            boxShadow: isPicked
                              ? 'inset 0 0 0 1.5px rgba(10,10,10,0.55)'
                              : 'inset 0 0 0 1px rgba(255,255,255,0.16)',
                            background: isPicked
                              ? 'rgba(10,10,10,0.05)'
                              : 'transparent',
                          }}
                        >
                          <span
                            className="mt-[0.9em] block h-2 w-2 shrink-0 rounded-full transition-colors duration-500"
                            style={{
                              background: isPicked
                                ? 'rgba(10,10,10,0.75)'
                                : 'rgba(10,10,10,0.3)',
                            }}
                          />
                          <span
                            className="text-[clamp(1.0625rem,1.25vw,1.5rem)] font-medium leading-[1.6] transition-colors duration-500"
                            style={{
                              color: isPicked
                                ? 'var(--color-ink)'
                                : 'var(--color-ink-soft)',
                            }}
                          >
                            {opt.label}
                          </span>
                          {isPicked && (
                            <motion.span
                              initial={{ opacity: 0, scale: 0.7 }}
                              animate={{ opacity: 1, scale: 1 }}
                              transition={{ duration: 0.4, delay: 0.08 }}
                              className="ml-auto shrink-0 self-center text-[clamp(0.75rem,0.8vw,0.9rem)] font-bold tracking-[0.2em] text-ink-mute"
                            >
                              已记下
                            </motion.span>
                          )}
                        </motion.button>
                      )
                    })}
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="error"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="border-l-4 border-white/12 pl-7"
                >
                  <p className="serif-body t-body font-medium text-ink-soft">
                    {error || '这一题没能顺利问出来。'}
                  </p>
                  <button
                    onClick={() => {
                      setError('')
                      const history: AnswerRecord[] = answers.map((a) => ({
                        question: a.question ?? '',
                        answer: a.label,
                        axis: a.axis,
                      }))
                      void fetchNext(answers.length, history)
                    }}
                    className="mt-5 border-0 bg-transparent pb-0.5 text-[clamp(0.9375rem,1.05vw,1.25rem)] font-semibold tracking-[0.2em] text-ink-mute transition-colors duration-500 hover:text-ink focus:outline-none"
                  >
                    再试一次 →
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ============================================================
 *  统一页头 —— 眉题 + 标题 + 返回
 * ============================================================ */
function PageHeader({
  eyebrow,
  title,
  onBack,
}: {
  eyebrow: string
  title: string
  onBack: () => void
}) {
  return (
    <header className="screen-fixed flex shrink-0 items-end justify-between gap-6 px-8 pt-8 sm:pt-12">
      <div className="flex flex-col gap-1.5">
        <p className="text-[clamp(0.8125rem,0.85vw,1rem)] font-semibold tracking-[0.4em] text-ink-mute">
          {eyebrow}
        </p>
        <h2 className="serif-title t-page text-ink">{title}</h2>
      </div>
      <button
        onClick={onBack}
        className="shrink-0 border-0 bg-transparent pb-1 text-[clamp(0.9375rem,1.05vw,1.25rem)] font-semibold tracking-[0.2em] text-ink-mute transition-colors duration-500 hover:text-ink focus:outline-none"
      >
        返回
      </button>
    </header>
  )
}
