import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
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
import { BirthSky } from './components/stages/BirthSkyStage'
import {
  CosmicCanvas,
  DEFAULT_CAMERA,
  type CosmicCamera,
} from './components/common/CosmicCanvas'
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

  /* ============================================================
   *  v16.0 · 全局镜头控制
   *
   *  CosmicCanvas 是**常驻**组件 —— 它挂在 App 最外层，
   *  永远不随路由切换而卸载，所以背景星空**绝不中断或重置**。
   *
   *  这里通过 cameraRef 控制镜头：
   *    · 进入星盘 → 镜头推近（zoom 1.25）
   *    · 其它模块 → 镜头拉回（zoom 1）
   *    · MBTI 等子面板 → 轻微偏移（pan），星盘留在远景
   * ============================================================ */
  const cameraRef = useRef<CosmicCamera>({ ...DEFAULT_CAMERA })

  /* ============================================================
   *  v17.0 · 「出生那天的星空」回看层
   *
   *  两个入口共用同一个组件：
   *    · 首次：填完出生信息 → 路由到 birthsky
   *    · 常驻：主界面顶部按钮 → 以浮层形式弹回
   * ============================================================ */
  const [skyOpen, setSkyOpen] = useState(false)

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

  /* ---------- v16.0 · 主题恒为深空 ----------
   *
   * 旧版：进入主星盘之前是纯黑白纸面，之后才变宇宙暗色 ——
   *       这就是「视觉割裂」的根源。
   *
   * 新版：**全程都是深空**。
   * 只有元素环境光（accent 色）随星盘变化，
   * 背景的深空底色与星云始终连续不断。
   */
  /* 元素环境光 —— 有星盘时用元素色，没有时用中性电离蓝 */
  const cosmosAmbient = useMemo(() => {
    if (!state.chart) return 'rgba(72,138,199,0.14)'
    const t = blendedTheme(
      state.chart.bigThree.sun.sign,
      state.chart.bigThree.rising.sign,
    )
    return t.ambient
  }, [state.chart])

  useEffect(() => {
    if (!state.chart) {
      /* 没有星盘时用中性的恒星金作为强调色 */
      applyElementTheme(null)
      return
    }
    const t = blendedTheme(
      state.chart.bigThree.sun.sign,
      state.chart.bigThree.rising.sign,
    )
    applyElementTheme(t.element, t.accent, t.secondary)
  }, [state.chart])

  /* ---------- v16.0 · 镜头随模块推拉 ----------
   *
   * 一镜到底的关键：背景不重来，只推镜头。
   *   dashboard → 推近到星盘（zoom 1.22）
   *   mbti     → 轻微侧移，星盘留在远景里
   *   其它     → 拉回默认
   */
  useEffect(() => {
    const stage = state.route.name
    if (stage === 'dashboard') {
      cameraRef.current = { zoom: 1.22, panX: 0, panY: 0 }
    } else if (stage === 'birthsky') {
      /* 出生星空页：镜头推到底，让深空影像占满视野 */
      cameraRef.current = { zoom: 1.32, panX: 0, panY: 0.06 }
    } else if (stage === 'mbti') {
      cameraRef.current = { zoom: 1.08, panX: -0.04, panY: 0.02 }
    } else if (stage === 'form') {
      cameraRef.current = { zoom: 1.1, panX: 0, panY: 0 }
    } else {
      cameraRef.current = { ...DEFAULT_CAMERA }
    }
  }, [state.route.name])

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

  /* ---------- 重新开始：清空数据，镜头拉回 ---------- */
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
    cameraRef.current = { ...DEFAULT_CAMERA }
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
        data-theme="cosmos"
      >
        {/* ============================================================
         *  v16.0 · 全局唯一宇宙画布
         *
         *  常驻组件 —— 切换模块时**绝不卸载**，
         *  所以星空不会中断或重置。
         * ============================================================ */}
        <CosmicCanvas cameraRef={cameraRef} ambient={cosmosAmbient} />

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
                  /*
                   * v17.0：填完出生信息**不直接跳星盘**，
                   * 先进入「出生那天的真实宇宙」——
                   * 让用户先看到哈勃在自己生日那天拍下的真实深空影像。
                   */
                  dispatch({
                    type: 'navigate',
                    route: { name: 'birthsky' },
                  })
                }}
                onBack={() => dispatch({ type: 'back' })}
              />
            </StageShell>
          )}

          {/* ========== v17.0 · 出生那天的真实宇宙 ========== */}
          {stage === 'birthsky' && state.birth && (
            <StageShell key="birthsky">
              <BirthSky
                month={Number(state.birth.date.slice(5, 7)) || 1}
                day={Number(state.birth.date.slice(8, 10)) || 1}
                accent={cosmosAmbient}
                onEnter={() =>
                  dispatch({
                    type: 'navigate',
                    route: { name: 'mbti', view: 'branch' },
                  })
                }
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
                onOpenBirthSky={() => setSkyOpen(true)}
              />
            </StageShell>
          )}
        </AnimatePresence>

        {/* ============================================================
            v17.0 · 出生那天的星空 · 浮层回看
            ============================================================ */}
        <AnimatePresence>
          {skyOpen && state.birth && (
            <motion.div
              key="sky-modal"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6 }}
              className="absolute inset-0 z-[250]"
            >
              <BirthSky
                month={Number(state.birth.date.slice(5, 7)) || 1}
                day={Number(state.birth.date.slice(8, 10)) || 1}
                accent={cosmosAmbient}
                onEnter={() => setSkyOpen(false)}
                onBack={() => setSkyOpen(false)}
              />
            </motion.div>
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
