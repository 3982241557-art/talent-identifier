import { createContext, useContext } from 'react'
import type {
  BirthInput,
  Chart,
  MbtiProfile,
  MbtiSession,
  Route,
  SavedProfile,
  TalentResult,
} from '../types'

/* ============================================================
 *  全局状态机（Context + useReducer）
 *
 *  v3.0：引入「历史栈」路由模型。
 *  · 每次导航都往栈里 push 一个 Route 节点。
 *  · 「返回」只 pop 最后一层，绝不跳回最初的 intro。
 *  · 出生信息、MBTI 答题进度等全部常驻在 state 中，
 *    因此来回切换页面时数据绝不丢失（keep-alive）。
 * ============================================================ */

export interface AppState {
  /** 当前激活的路由节点（栈顶） */
  route: Route
  /** 路由历史栈 —— 用于「返回上一级」 */
  stack: Route[]
  accountId: string
  profile: SavedProfile
  birth: BirthInput | null
  /** 出生信息草稿 —— 表单每次变化都写入，保证返回时数据不丢 */
  birthDraft: BirthInput | null
  mbti: MbtiProfile | null
  chart: Chart | null
  /** 当前的天赋解析结果 */
  talent: TalentResult | null
  /** MBTI 会话状态（跨页面保留） */
  mbtiSession: MbtiSession
  /** 引导弹窗 */
  guidePanel: string | null
  /** 提示信息 */
  toast: string | null
}

export type AppAction =
  | { type: 'restore'; payload: Partial<AppState> }
  /** 前进到新页面（压入栈） */
  | { type: 'navigate'; route: Route; replace?: boolean }
  /** 返回上一级（弹出栈顶） */
  | { type: 'back' }
  /** 替换当前节点（不压栈） */
  | { type: 'replace'; route: Route }
  | { type: 'setMbti'; mbti: MbtiProfile }
  | { type: 'setBirth'; birth: BirthInput }
  /** 表单草稿实时更新（用于返回时保持数据） */
  | { type: 'setBirthDraft'; birth: BirthInput | null }
  | { type: 'setChart'; chart: Chart }
  | { type: 'setTalent'; talent: TalentResult | null }
  | { type: 'setProfile'; profile: SavedProfile }
  | { type: 'setMbtiSession'; session: Partial<MbtiSession> }
  | { type: 'setGuide'; panel: string | null }
  | { type: 'toast'; message: string | null }
  | { type: 'reset' }

export interface AppContextValue {
  state: AppState
  dispatch: React.Dispatch<AppAction>
}

export const AppContext = createContext<AppContextValue | null>(null)

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppContext')
  return ctx
}
