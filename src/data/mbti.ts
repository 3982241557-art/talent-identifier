import type { MbtiAxis } from '../types'

/* ============================================================
 *  MBTI 轴向说明
 *
 *  v2.0：静态题库已全部移除。
 *  20 道探索题全部由后端 DeepSeek 依据用户的历史回答动态生成
 *  （见 server/index.mjs 的 POST /api/mbti-question），
 *  因此这里只保留四轴的静态释义，用于界面展示。
 * ============================================================ */

/** 轴中文名 */
export const AXIS_CN: Record<MbtiAxis, string> = {
  EI: '精力来源',
  NS: '信息偏好',
  TF: '决策依据',
  JP: '生活节奏',
}

/** 轴英文名 */
export const AXIS_EN: Record<MbtiAxis, string> = {
  EI: 'Extraversion / Introversion',
  NS: 'Intuition / Sensing',
  TF: 'Thinking / Feeling',
  JP: 'Judging / Perceiving',
}
