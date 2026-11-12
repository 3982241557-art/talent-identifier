/**
 * MBTI 本地兜底题库（v7.0 · 任务 2）
 *
 * 为什么需要它：
 *   AI 出题是「体验加成」，但绝不能成为「流程单点故障」。
 *   一旦云端限流 / 超时 / 断网，整个 20 题测评就会卡死。
 *
 * v7.0 改造：
 *   兜底题不再手写一套平行题库（那会和 AI 题库慢慢漂移），
 *   而是从 **MBTI 官方母题库**（mbtiCanon.mjs）派生 ——
 *   每条母题原型自带题干、探测意图、以及两极的典型行为描述，
 *   兜底题把它们直接转成题干与选项，规格与 AI 题完全一致。
 */

import { AXIS_CYCLE, getPrototypeList } from './mbtiCanon.mjs'

/**
 * 把一条母题原型转成一道可作答的题。
 * @param {{stem:string, probe:string, pos:string, neg:string}} p
 */
function toQuestion(p) {
  return {
    question: p.stem,
    options: [
      { label: p.pos, value: 1 },
      { label: p.neg, value: -1 },
    ],
    bridge: p.probe,
  }
}

/** 各轴的母题原型（来自 mbtiCanon） */
const CANON_LIST = Object.fromEntries(
  ['EI', 'NS', 'TF', 'JP'].map((a) => [a, getPrototypeList(a)]),
)

/**
 * 依据轴与已答数量，取出一道本地兜底题。
 * 用 count 做偏移，保证同一轴的不同题目依次出现，不重复。
 *
 * @param {string} axis 'EI' | 'NS' | 'TF' | 'JP'
 * @param {number} count 已答题数
 */
export function pickFallbackQuestion(axis, count = 0) {
  const bank = CANON_LIST[axis] ?? CANON_LIST.EI
  const idx = Math.abs(Math.floor(count)) % bank.length
  const q = toQuestion(bank[idx])
  return {
    question: q.question,
    options: q.options.map((o) => ({ ...o })),
    bridge: q.bridge,
    axis,
  }
}

/**
 * 一次性拿到整套 20 题的本地兜底（用于断网时整体降级）。
 */
export function fallbackQuestionSet(total = 20) {
  const out = []
  for (let i = 0; i < total; i++) {
    const axis = AXIS_CYCLE[i % AXIS_CYCLE.length]
    out.push(pickFallbackQuestion(axis, Math.floor(i / AXIS_CYCLE.length)))
  }
  return out
}
