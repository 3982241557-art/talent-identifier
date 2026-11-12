/**
 * MBTI 直觉题库（v11.0 · 任务 1）
 *
 * ============================================================
 *  为什么彻底废除 AI 动态出题
 * ============================================================
 *  v7.0 的做法是让 DeepSeek 依据用户历史回答实时生成场景题。
 * 出发点是「个性化」，但实测下来有三个致命问题：
 *
 *  【问题 1 · 太慢】
 *  每道题都要走一次云端往返（平均 3~8 秒），
 *  20 题累计 1~3 分钟。用户的直觉反应只有前 10 秒，
 *  等到第 8 题时，用户早就忘了自己第 1 题怎么答的。
 *
 *  【问题 2 · 太绕】
 *  模型为了「承接前文」会写出阅读理解式的长题干
 *  （「你刚才说你更享受独处，那么在朋友组织的聚会结束后……」），
 *  用户要先读懂逻辑才能选 —— 这违背了 MBTI 的测速初衷。
 *
 *  【问题 3 · 不稳定】
 *  同一道轴，模型今天出一种问法、明天出另一种，
 *  四轴的表现力在不同批次之间波动，测评结果不可复现。
 *
 * ============================================================
 *  v11.0 的解法：20 道静态直白题
 * ============================================================
 *  · 全部题目**本地加载**，零网络等待，一分钟点完
 *  · 题干一律短句、口语化、单一场景
 *  · 两个选项长度接近、吸引力接近，不诱导作答
 *  · 四轴各 5 题，均衡覆盖
 *  · 保留后端 AI 接口作为**可选增强**（用户主动点「来点新鲜的」时才用）
 *
 * 【选项极性约定】
 *  value = 1  → 该轴第一极（E / N / T / J）
 *  value = -1 → 该轴第二极（I / S / F / P）
 */

import type { MbtiAxis } from '../types'

export interface SimpleQuestion {
  /** 题干 */
  text: string
  /** 两个选项 */
  options: [
    { label: string; value: 1 | -1 },
    { label: string; value: 1 | -1 },
  ]
}

/**
 * 20 道直白题 —— 四轴各 5 道。
 *
 * 设计原则：
 *  1. 题干不超过 20 字，一眼读完。
 *  2. 场景是**日常高频**的（周末、开会、吃饭、聚会、计划），
 *     不需要「想象你是谁」。
 *  3. 两个选项**互斥且对称**，句式尽量平行。
 *  4. 避开工作强度、能力高低等敏感话题 —— 只问偏好，不问优劣。
 */
export const SIMPLE_QUESTIONS: Array<SimpleQuestion & { axis: MbtiAxis }> = [
  /* ================= EI · 精力来源（5 题） ================= */
  {
    axis: 'EI',
    text: '周末的理想安排是什么？',
    options: [
      { label: '约上朋友一起出去玩', value: 1 },
      { label: '一个人待着，安静地过完', value: -1 },
    ],
  },
  {
    axis: 'EI',
    text: '走进一个全是陌生人的房间，你会？',
    options: [
      { label: '主动去打招呼，很快聊起来', value: 1 },
      { label: '先找个角落，等别人来找我', value: -1 },
    ],
  },
  {
    axis: 'EI',
    text: '开了一整天的会之后，你感觉？',
    options: [
      { label: '挺有劲，还想继续聊', value: 1 },
      { label: '电量耗尽，想一个人静静', value: -1 },
    ],
  },
  {
    axis: 'EI',
    text: '遇到烦心事，你更可能？',
    options: [
      { label: '马上找人说说，越说越轻', value: 1 },
      { label: '自己消化完，才决定要不要讲', value: -1 },
    ],
  },
  {
    axis: 'EI',
    text: '在一群朋友里，你通常？',
    options: [
      { label: '和大多数人聊得上，是气氛担当', value: 1 },
      { label: '跟一两个聊得深就够了', value: -1 },
    ],
  },

  /* ================= NS · 信息偏好（5 题） ================= */
  {
    axis: 'NS',
    text: '看一部电影，你更在意？',
    options: [
      { label: '整体想表达什么、寓意在哪', value: 1 },
      { label: '故事讲得实不实在、细节扎不扎实', value: -1 },
    ],
  },
  {
    axis: 'NS',
    text: '朋友跟你讲一件烦心事，你的第一反应是？',
    options: [
      { label: '帮他分析怎么解决', value: -1 },
      { label: '先理解他为什么难受', value: 1 },
    ],
  },
  {
    axis: 'NS',
    text: '做一份报告，你更喜欢哪种？',
    options: [
      { label: '把逻辑和框架写清楚', value: 1 },
      { label: '把数据和事实列全', value: -1 },
    ],
  },
  {
    axis: 'NS',
    text: '思考一个复杂的问题，你更习惯？',
    options: [
      { label: '先想出几个可能的未来，再挑', value: 1 },
      { label: '先把手头的事实弄准，再往下推', value: -1 },
    ],
  },
  {
    axis: 'NS',
    text: '你最容易被哪种内容吸引？',
    options: [
      { label: '一个还没被讲过的新点子', value: 1 },
      { label: '一个能立刻照着做的方法', value: -1 },
    ],
  },

  /* ================= TF · 决策依据（5 题） ================= */
  {
    axis: 'TF',
    text: '朋友向你倒苦水，你更多是在？',
    options: [
      { label: '帮他理清楚问题出在哪', value: 1 },
      { label: '陪着他，让他好受一点', value: -1 },
    ],
  },
  {
    axis: 'TF',
    text: '团队里有人犯了错，你的第一判断是？',
    options: [
      { label: '先复盘机制，避免再犯', value: 1 },
      { label: '先关心他现在的状态', value: -1 },
    ],
  },
  {
    axis: 'TF',
    text: '必须和不太熟的人合作时，你更看重？',
    options: [
      { label: '把规则和责任讲清楚', value: 1 },
      { label: '把关系处好，彼此信任', value: -1 },
    ],
  },
  {
    axis: 'TF',
    text: '收到一条批评意见，你会？',
    options: [
      { label: '看它有没有道理，有就改', value: 1 },
      { label: '先在意对方为什么这么在意', value: -1 },
    ],
  },
  {
    axis: 'TF',
    text: '做重要决定时，你更相信？',
    options: [
      { label: '逻辑推下来最站得住的那个', value: 1 },
      { label: '心里最舒服、最不会后悔的那个', value: -1 },
    ],
  },

  /* ================= JP · 生活节奏（5 题） ================= */
  {
    axis: 'JP',
    text: '旅行前一周，你会？',
    options: [
      { label: '把行程排满，订好所有东西', value: 1 },
      { label: '订个住处就行，剩下到了再说', value: -1 },
    ],
  },
  {
    axis: 'JP',
    text: '手上同时有几件事要做时，你？',
    options: [
      { label: '排个顺序，一件件做完', value: 1 },
      { label: '想到哪做哪，也不耽误', value: -1 },
    ],
  },
  {
    axis: 'JP',
    text: '衣服没洗，堆了一周，你？',
    options: [
      { label: '看不下去了，今天就洗', value: 1 },
      { label: '先放着，等有空再说', value: -1 },
    ],
  },
  {
    axis: 'JP',
    text: '朋友临时改约时间，你的感觉是？',
    options: [
      { label: '有点烦，说好了的', value: 1 },
      { label: '没关系，正好有空', value: -1 },
    ],
  },
  {
    axis: 'JP',
    text: '你更享受哪种周末？',
    options: [
      { label: '事情都搞定，心里踏实', value: 1 },
      { label: '什么都没安排，随心所欲', value: -1 },
    ],
  },
]

/**
 * 按已答题数取下一道题。
 *
 * 题目顺序刻意打乱（不按 EI→NS→TF→JP 连排），
 * 这样用户不会察觉「每五题在测同一个东西」，
 * 也不会因为猜到模式而刻意改变答案。
 */
const QUESTION_ORDER = [
  0, 5, 10, 15, // 第 1 轮：EI / NS / TF / JP
  2, 7, 12, 17, // 第 2 轮：EI / NS / TF / JP
  4, 9, 14, 19, // 第 3 轮：EI / NS / TF / JP
  1, 6, 11, 16, // 第 4 轮：EI / NS / TF / JP
  3, 8, 13, 18, // 第 5 轮：EI / NS / TF / JP
]

/** 取出第 index 题（0-based） */
export function getSimpleQuestion(index: number): SimpleQuestion & { axis: MbtiAxis } {
  const pos = QUESTION_ORDER[index % QUESTION_ORDER.length]
  return SIMPLE_QUESTIONS[pos]
}

/** 题目总数 */
export const SIMPLE_QUESTION_COUNT = SIMPLE_QUESTIONS.length
