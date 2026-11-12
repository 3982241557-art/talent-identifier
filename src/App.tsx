import { useCallback, useEffect, useMemo, useReducer } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AppContext, type AppAction, type AppState } from './store/AppContext'
import { applyElementTheme, blendedTheme } from './data/elementThemes'
import {
  emptyProfile,
  getAccountId,
  loadProfile,
  saveProfile,
} from './lib/storage'
import { computeChart } from './lib/chart'
import { IntroStage } from './components/stages/IntroStage'
import { MbtiStage } from './components/stages/MbtiStage'
import { FormStage } from './components/stages/FormStage'
import { VerdictStage } from './components/stages/VerdictStage'
import { DashboardStage } from './components/stages/DashboardStage'
import type { MbtiSession, Route } from './types'

/* ============================================================
 *  天赋识别器 · 应用外壳与状态机
 *
 *  v3.0 流程（历史栈模型）：
 *    intro → form（出生信息）→ mbti（分支/手动/探索）
 *          → verdict（灵魂底色）→ dashboard（主页）
 *
 *  「返回」语义：只退回栈中的上一级，
 *  出生信息与 MBTI 答题进度全程常驻内存 + localStorage，绝不丢失。
 * ============================================================ */

const emptySession: MbtiSession = {
  answers: [],
  manualType: '',
  question: null,
  asked: [],
  currentAxis: 'EI',
  finished: false,
  qSeq: 0,
}

/** 出生信息草稿的字段级比较 */
function sameBirth(
  a: (typeof initialState)['birthDraft'],
  b: (typeof initialState)['birthDraft'],
): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return (
    a.date === b.date &&
    a.time === b.time &&
    a.shichen === b.shichen &&
    a.calendar === b.calendar &&
    a.place === b.place &&
    a.latitude === b.latitude &&
    a.longitude === b.longitude &&
    a.gender === b.gender
  )
}

const initialState: AppState = {
  route: { name: 'intro' },
  stack: [],
  accountId: 'acc_ephemeral',
  profile: emptyProfile('acc_ephemeral'),
  birth: null,
  birthDraft: null,
  mbti: null,
  chart: null,
  talent: null,
  mbtiSession: emptySession,
  guidePanel: null,
  toast: null,
}

function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'restore':
      return { ...state, ...action.payload }

    case 'navigate': {
      if (action.replace) {
        return {
          ...state,
          route: action.route,
          stack:
            state.stack.length > 0
              ? [...state.stack.slice(0, -1), action.route]
              : [action.route],
        }
      }
      return {
        ...state,
        route: action.route,
        stack: [...state.stack, action.route],
      }
    }

    case 'replace':
      return {
        ...state,
        route: action.route,
        stack:
          state.stack.length > 0
            ? [...state.stack.slice(0, -1), action.route]
            : [action.route],
      }

    case 'back': {
      if (state.stack.length === 0) return state
      const stack = state.stack.slice(0, -1)
      return {
        ...state,
        stack,
        route: stack[stack.length - 1] ?? { name: 'intro' },
      }
    }

    case 'setMbti':
      return { ...state, mbti: action.mbti }
    case 'setBirth':
      return { ...state, birth: action.birth, birthDraft: action.birth }
    case 'setBirthDraft': {
      // 深度比对：草稿不变时不产生新对象，避免下游 effect 反复触发
      if (sameBirth(state.birthDraft, action.birth)) return state
      return { ...state, birthDraft: action.birth }
    }
    case 'setChart':
      return { ...state, chart: action.chart }
    case 'setTalent':
      return { ...state, talent: action.talent }
    case 'setProfile':
      return { ...state, profile: action.profile }
    case 'setMbtiSession':
      return { ...state, mbtiSession: { ...state.mbtiSession, ...action.session } }
    case 'setGuide':
      return { ...state, guidePanel: action.panel }
    case 'toast':
      return { ...state, toast: action.message }
    case 'reset':
      return {
        ...initialState,
        accountId: state.accountId,
        profile: state.profile,
      }
    default:
      return state
  }
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, initialState)

  /* ---------- 启动时恢复存档 ---------- */
  useEffect(() => {
    const accountId = getAccountId()
    const profile = loadProfile(accountId)

    dispatch({
      type: 'restore',
      payload: {
        accountId,
        profile,
        birth: profile.birth,
        birthDraft: profile.birth,
        mbti: profile.mbti,
        chart: profile.chart,
        route: profile.chart ? { name: 'dashboard' } : { name: 'intro' },
        stack: profile.chart ? [{ name: 'dashboard' }] : [],
      },
    })
  }, [])

  /* ---------- 主题随星座变化（仅主页进入宇宙暗色态） ----------
   * v3.0：进入主星盘（P6）之前的所有页面一律纯黑白，
   * 因此只有当路由停在 dashboard 时才注入元素主题。
   *
   * v9.0：改用**双元素混合主题** —— 太阳给主调、上升给辅调，
   * 并额外注入 `--el-accent`（核心标题用的独立强调色）。
   * 「重新开始」时传 null —— 退回纯白底纯黑字。
   */
  const isDashboard = state.route.name === 'dashboard'
  useEffect(() => {
    if (!isDashboard || !state.chart) {
      applyElementTheme(null)
      return
    }
    const t = blendedTheme(
      state.chart.bigThree.sun.sign,
      state.chart.bigThree.rising.sign,
    )
    applyElementTheme(t.element, t.accent, t.secondary)
  }, [state.chart, isDashboard])

  /* ---------- 存档持久化 ---------- */
  useEffect(() => {
    if (state.chart || state.birth || state.mbti) {
      saveProfile({
        ...state.profile,
        birth: state.birth ?? state.profile.birth,
        mbti: state.mbti ?? state.profile.mbti,
        chart: state.chart ?? state.profile.chart,
      })
    }
  }, [state.chart, state.birth, state.mbti, state.profile])

  /* ---------- 重新开始：退回白底黑字初始态 ---------- */
  const handleRestart = useCallback(() => {
    dispatch({
      type: 'setProfile',
      profile: {
        ...state.profile,
        birth: null,
        mbti: null,
        chart: null,
        days: [],
      },
    })
    dispatch({ type: 'reset' })
    applyElementTheme(null)
  }, [state.profile])

  /**
   * 重新测算 / 手动修改 MBTI。
   * 保留已有出生信息，只重走性格问卷这一步，随后自动重算星盘。
   */
  const handleEditMbti = useCallback(() => {
    dispatch({
      type: 'navigate',
      route: { name: 'mbti', view: 'branch' },
    })
  }, [])

  /**
   * MBTI 完成后重算星盘（灵魂底色依赖 MBTI），再进入总结页。
   * v4.0：星盘计算是异步的（后端真实星历）。
   */
  const handleMbtiComplete = useCallback(
    async (mbti: NonNullable<typeof state.mbti>) => {
      dispatch({ type: 'setMbti', mbti })
      if (state.birth) {
        const chart = await computeChart(state.birth, mbti)
        dispatch({ type: 'setChart', chart })
      }
      dispatch({ type: 'navigate', route: { name: 'verdict' } })
    },
    [state.birth],
  )

  const value = useMemo(() => ({ state, dispatch }), [state])

  const stage = state.route.name
  const mbtiView = state.route.view ?? 'branch'

  return (
    <AppContext.Provider value={value}>
      {/* v5.0：全局单屏锁定 —— 物理上杜绝原生滚动条 */}
      <div
        className="relative h-screen w-screen overflow-hidden"
        data-theme={isDashboard ? 'cosmos' : 'paper'}
      >
        <AnimatePresence mode="wait">
          {stage === 'intro' && (
            <StageShell key="intro">
              <IntroStage
                onTutorial={() =>
                  dispatch({ type: 'setGuide', panel: 'tutorial' })
                }
                onStart={() =>
                  dispatch({ type: 'navigate', route: { name: 'form' } })
                }
                hasSaved={Boolean(state.profile.chart)}
                onResume={() =>
                  dispatch({
                    type: 'navigate',
                    route: { name: 'dashboard' },
                    replace: true,
                  })
                }
              />
            </StageShell>
          )}

          {/* 出生信息：先于 MBTI —— 用户先给出坐标，再决定要不要被问 */}
          {stage === 'form' && (
            <StageShell key="form">
              <FormStage
                initial={state.birthDraft ?? state.birth}
                onComplete={(birth) => {
                  dispatch({ type: 'setBirth', birth })
                  dispatch({
                    type: 'navigate',
                    route: { name: 'mbti', view: 'branch' },
                  })
                }}
                onBack={() => dispatch({ type: 'back' })}
              />
            </StageShell>
          )}

          {stage === 'mbti' && (
            <StageShell key="mbti">
              <MbtiStage
                view={mbtiView}
                onComplete={handleMbtiComplete}
                onBack={() => dispatch({ type: 'back' })}
                onViewChange={(view) =>
                  dispatch({
                    type: 'replace',
                    route: { name: 'mbti', view },
                  })
                }
              />
            </StageShell>
          )}

          {stage === 'verdict' && state.chart && (
            <StageShell key="verdict">
              <VerdictStage
                chart={state.chart}
                mbti={state.mbti}
                place={state.birth?.place}
                onContinue={() =>
                  dispatch({ type: 'navigate', route: { name: 'dashboard' } })
                }
              />
            </StageShell>
          )}

          {stage === 'dashboard' && state.chart && (
            <StageShell key="dashboard">
              <DashboardStage
                chart={state.chart}
                onRestart={handleRestart}
                onEditMbti={handleEditMbti}
              />
            </StageShell>
          )}
        </AnimatePresence>
      </div>
    </AppContext.Provider>
  )
}

/* ---------- 阶段容器 ---------- */
function StageShell({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
      className="absolute inset-0"
    >
      {children}
    </motion.div>
  )
}

/* 重新导出类型，方便其它模块引用 */
export type { Route }
