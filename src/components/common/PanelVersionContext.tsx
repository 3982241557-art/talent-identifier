import { createContext, useContext } from 'react'
import type { ReportVersion } from './VersionToggle'

/* ============================================================
 *  PanelVersionContext —— 面板级双版本状态（v18.0）
 * ============================================================
 *
 *  【为什么需要】
 *  v17.0 的版本切换键散落在各个面板的**内容区里**
 *  （天赋解析在底部、运势在中间、优势建议在结果区），
 *  用户得先往下滚才能看到那个胶囊 —— 很反直觉。
 *
 *  v18.0 把切换键提到**面板头**（和「收起」同一行），
 *  第一眼就能看到。但面板头在 OverlayPanel 里，
 *  内容在几层深的子组件里（MbtiHub / TalentMatrix / CareerAdvice…），
 *  两边要共享同一份状态。
 *
 *  【怎么共享】
 *  OverlayPanel 持有唯一的 version state，
 *  用 Context 往下传 —— 子组件不再各自维护本地 state，
 *  也就不会出现「面板头切了、内容没变」的割裂。
 * ============================================================ */

/** 默认版本 —— 极简直给版 */
export const PANEL_DEFAULT_VERSION: ReportVersion = 'minimal'

export interface PanelVersionState {
  /** 当前版本 */
  version: ReportVersion
  /** 切换版本 */
  setVersion: (v: ReportVersion) => void
}

export const PanelVersionContext = createContext<PanelVersionState>({
  version: PANEL_DEFAULT_VERSION,
  setVersion: () => {},
})

/**
 * 读取当前面板的版本状态。
 *
 * 子组件里直接调它就能拿到和面板头那颗胶囊**完全同步**的版本。
 */
export function usePanelVersion(): PanelVersionState {
  return useContext(PanelVersionContext)
}
