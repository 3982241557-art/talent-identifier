import type {
  MbtiAnswer,
  MbtiAxis,
  MbtiProfile,
} from '../types'
import { MBTI_TYPES } from '../data/mbtiTypes'

/* ============================================================
 *  MBTI 判型引擎
 * ============================================================ */

const AXIS_LETTERS: Record<MbtiAxis, { pos: string; neg: string }> = {
  EI: { pos: 'E', neg: 'I' },
  NS: { pos: 'N', neg: 'S' },
  TF: { pos: 'T', neg: 'F' },
  JP: { pos: 'J', neg: 'P' },
}

/** 各维度两侧的性格底色关键词（用于灵魂底色取材） */
const TRAIT_WORDS: Record<MbtiAxis, { pos: string[]; neg: string[] }> = {
  EI: {
    pos: ['外放', '联结', '开拓'],
    neg: ['内敛', '独处', '深耕'],
  },
  NS: {
    pos: ['想象', '直觉', '格局'],
    neg: ['务实', '细节', '当下'],
  },
  TF: {
    pos: ['条理', '原则', '清醒'],
    neg: ['共情', '温柔', '体察'],
  },
  JP: {
    pos: ['收束', '规划', '笃行'],
    neg: ['开放', '弹性', '应变'],
  },
}

/**
 * 计算 MBTI 类型。
 *
 * 20 题动态问卷下，每个维度会有 5 次作答，
 * 取「最后一次作答」作为该维度的最终倾向 ——
 * 因为后出的题基于更完整的自我认知，权重更高。
 */
export function buildMbtiProfile(answers: MbtiAnswer[]): MbtiProfile {
  const letters = {} as MbtiProfile['letters']
  const traits: string[] = []

  for (const axis of Object.keys(AXIS_LETTERS) as MbtiAxis[]) {
    const rel = answers.filter((a) => a.axis === axis)
    let side: 'pos' | 'neg'
    if (rel.length) {
      // 加权：最后一次作答权重为 2，其余为 1
      let score = 0
      rel.forEach((a, i) => {
        const w = i === rel.length - 1 ? 2 : 1
        score += a.value * w
      })
      if (score === 0) score = rel[rel.length - 1].value
      side = score >= 0 ? 'pos' : 'neg'
    } else {
      side = 'neg'
    }
    const L = AXIS_LETTERS[axis]
    ;(letters as unknown as Record<string, string>)[axis] =
      side === 'pos' ? L.pos : L.neg
    const pool = TRAIT_WORDS[axis][side]
    traits.push(pool[answers.length % pool.length])
  }

  const type = (['EI', 'NS', 'TF', 'JP'] as MbtiAxis[])
    .map((a) => letters[a])
    .join('')

  const summary = describeByType(type)

  return { type, letters, answers, traits: unique(traits), summary }
}

function unique(list: string[]) {
  return Array.from(new Set(list))
}

/** 十六型一句话性格底色（取自 MBTI_TYPES 的统一档案） */
function describeByType(type: string): string {
  return MBTI_TYPES[type]?.essence ?? '你是一个尚未被自己完全命名的人。'
}
