import type { MbtiAxis } from '../types'

/* ============================================================
 *  MBTI 四维白话解读（v11.0 · 任务 1）
 *
 * ============================================================
 *  为什么要重做这块
 * ============================================================
 *  旧版用的是 MBTI 官方术语：
 *    「内倾直觉 Ni」「外倾情感 Fe」「Te 辅助功能」……
 *
 *  这些词对**懂 MBTI 的人**是精确的语言，
 *  但对一个只是想「了解自己」的用户来说，
 *  它们等于直接把门关上了 —— 看不懂就等于与自己无关。
 *
 *  v11.0 彻底换成**四个字母的大白话**：
 *    I / E —— 你靠什么充电
 *    S / N —— 你看世界的方式
 *    T / F —— 你做决定的方式
 *    J / P —— 你过日子的方式
 *
 *  每一条都回答同一个问题：
 *    「这到底意味着什么？我该怎么活？」
 * ============================================================ */

export interface AxisPlain {
  /** 维度名（大众化） */
  name: string
  /** 英文缩写 */
  code: string
  /** 这一维度的白话提问 */
  question: string
  /** 两个极端各自的白话解释 */
  sides: Record<string, { label: string; desc: string }>
}

export const AXIS_PLAIN: Record<MbtiAxis, AxisPlain> = {
  EI: {
    name: '你靠什么充电',
    code: 'E / I',
    question: '一天下来，什么让你恢复精力？',
    sides: {
      E: {
        label: 'E · 外向',
        desc:
          '你从人群里充电。聊过天、被人接住、想法被说出来，' +
          '这些都会让你重新有劲。独处太久反而会闷。',
      },
      I: {
        label: 'I · 内向',
        desc:
          '你从独处里充电。安安静静想清楚一件事、没人打扰你，' +
          '这是你把电充满的方式。人一多就容易累。',
      },
    },
  },
  NS: {
    name: '你看世界的方式',
    code: 'S / N',
    question: '你更容易被什么打动？',
    sides: {
      N: {
        label: 'N · 直觉',
        desc:
          '你看得比较远，容易被「还没发生但有可能」的事吸引。' +
          '你爱想背后的含义，也爱琢磨还有别的路可走。',
      },
      S: {
        label: 'S · 实感',
        desc:
          '你看得比较实，信任具体的事实和真实的经验。' +
          '你更关心「现在到底是什么情况」，而不是「还能怎样」。',
      },
    },
  },
  TF: {
    name: '你怎么做决定',
    code: 'T / F',
    question: '两件事摆面前，你先顾哪头？',
    sides: {
      T: {
        label: 'T · 思考',
        desc:
          '你优先看逻辑。事情对不对、规则合不合理、结论站不站得住，' +
          '这些是你的判断依据。情感不影响你做决定。',
      },
      F: {
        label: 'F · 情感',
        desc:
          '你优先看人。这件事会怎么伤到谁、彼此的感受重不重要，' +
          '这些是你的判断依据。你很难把对事和对人分开。',
      },
    },
  },
  JP: {
    name: '你过日子方式',
    code: 'J / P',
    question: '你喜欢日子怎么过？',
    sides: {
      J: {
        label: 'J · 判断',
        desc:
          '你喜欢有把握。计划、清单、说定的事就按时发生，' +
          '这种踏实感让你舒服。临场变化会消耗你。',
      },
      P: {
        label: 'P · 感知',
        desc:
          '你喜欢有空间。计划可以随时改、留白多一点、' +
          '意外的可能性让你兴奋。定死了反而不自在。',
      },
    },
  },
}

/**
 * 把类型代码拆成四轴取值。
 */
export function splitType(type: string): Record<MbtiAxis, string> {
  return {
    EI: type[0] ?? 'I',
    NS: type[1] ?? 'S',
    TF: type[2] ?? 'T',
    JP: type[3] ?? 'J',
  }
}

/**
 * 生成四维白话摘要（用于解码面板）。
 */
export function plainSummary(type: string): string[] {
  const letters = splitType(type)
  return (['EI', 'NS', 'TF', 'JP'] as MbtiAxis[]).map(
    (ax) => `${AXIS_PLAIN[ax].sides[letters[ax]].label}`,
  )
}
