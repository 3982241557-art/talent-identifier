import type {
  Chart,
  Element,
  MbtiProfile,
  TalentCategory,
  TalentCategoryDetail,
  TalentResult,
} from '../types'
import {
  CORPUS_LABEL,
  CORPUS_ORDER,
  pickAction,
  pickPassage,
  pickRole,
  resetCorpusCursors,
  type CorpusDomain,
} from './corpus'

/* ============================================================
 *  天赋矩阵 —— 本地推演引擎（v12.0）
 * ============================================================
 *
 *  【v12.0 的根本变化】
 *  旧版（v11.0）里，四个维度的 role / field / 文案
 *  是从一个**全局池**里 map 出来的 ——
 *  同一个 role 变量被贴到了所有卡片上，
 *  于是四张卡的副标题一模一样。
 *
 *  现在改成**按 key 精确绑定**：
 *  每个维度有独立的语料分区（corpus.domains[domain]），
 *  里面有专属的角色定义、专属的经典段落、专属的动作库。
 *  四个对象之间**没有任何共享字段**。
 *
 *  【AI 的角色被降级】
 *  文案主体来自本地人类语料库（先哲原句 + 白话转写），
 *  AI 只被允许写「连接词」—— 把原句和你连起来的一两句话。
 *  这样即使模型状态不好，出来的东西也还有人味。
 * ============================================================ */

/** 星座 → 四类天赋的基础加权 */
const SIGN_TALENT: Record<string, Record<TalentCategory, number>> = {
  aries: { career: 78, academic: 58, interpersonal: 72, wealth: 66 },
  taurus: { career: 70, academic: 66, interpersonal: 60, wealth: 82 },
  gemini: { career: 74, academic: 82, interpersonal: 80, wealth: 58 },
  cancer: { career: 60, academic: 68, interpersonal: 84, wealth: 64 },
  leo: { career: 76, academic: 62, interpersonal: 78, wealth: 70 },
  virgo: { career: 72, academic: 88, interpersonal: 58, wealth: 74 },
  libra: { career: 66, academic: 74, interpersonal: 82, wealth: 68 },
  scorpio: { career: 80, academic: 70, interpersonal: 62, wealth: 76 },
  sagittarius: { career: 74, academic: 66, interpersonal: 74, wealth: 62 },
  capricorn: { career: 84, academic: 72, interpersonal: 54, wealth: 80 },
  aquarius: { career: 78, academic: 70, interpersonal: 70, wealth: 66 },
  pisces: { career: 62, academic: 74, interpersonal: 76, wealth: 56 },
}

/** MBTI → 四类天赋加成 */
const MBTI_TALENT: Record<string, Record<TalentCategory, number>> = {
  INTJ: { career: 16, academic: 14, interpersonal: -4, wealth: 12 },
  INTP: { career: 12, academic: 18, interpersonal: -6, wealth: 6 },
  ENTJ: { career: 18, academic: 10, interpersonal: -4, wealth: 14 },
  ENTP: { career: 14, academic: 12, interpersonal: 8, wealth: 12 },
  INFJ: { career: 10, academic: 14, interpersonal: 12, wealth: 6 },
  INFP: { career: 4, academic: 14, interpersonal: 16, wealth: 2 },
  ENFJ: { career: 12, academic: 10, interpersonal: 18, wealth: 10 },
  ENFP: { career: 8, academic: 10, interpersonal: 18, wealth: 6 },
  ISTJ: { career: 14, academic: 16, interpersonal: -4, wealth: 14 },
  ISFJ: { career: 8, academic: 14, interpersonal: 14, wealth: 10 },
  ESTJ: { career: 16, academic: 12, interpersonal: 2, wealth: 16 },
  ESFJ: { career: 10, academic: 12, interpersonal: 18, wealth: 14 },
  ISTP: { career: 12, academic: 12, interpersonal: -2, wealth: 12 },
  ISFP: { career: 2, academic: 10, interpersonal: 14, wealth: 4 },
  ESTP: { career: 14, academic: 6, interpersonal: 16, wealth: 14 },
  ESFP: { career: 6, academic: 8, interpersonal: 18, wealth: 8 },
}

/**
 * 各维度的**专属优势**句式。
 *
 * v12.0：这些句子是「人类化的描写」，
 * 不是 AI 生成的模板 —— 它们描述行为，不描述形容词。
 * 四个维度的句式结构刻意不同：
 *   事业 → 「在…的地方」
 *   学业 → 「学…靠的是…」
 *   人际 → 「你很会…」
 *   财富 → 「你对…很清醒」
 */
const STRENGTH_TEXT: Record<TalentCategory, string[]> = {
  career: [
    '你适合在没有现成答案的地方工作。你最擅长的，是把模糊的目标变成一条能走通的路。',
    '你的价值要放在能扛责任的位置上。你不是执行的人，你是定方向的人。',
    '你做事的方式是先把地形摸清，再动手。这种慢半拍，换来的是少走很多弯路。',
  ],
  academic: [
    '你学东西靠的是搭结构。先把知识的骨架立起来，剩下的东西自己会挂上去。',
    '你的吸收方式是输出。讲给别人听、写下来、做出来一次，记住的比看十遍还牢。',
    '你对细节的记忆力很强。别人靠印象，你靠还原 —— 这是很难被替代的能力。',
  ],
  interpersonal: [
    '你很会接住别人。别人说半句，你已经知道他真正想说什么。',
    '你让一群陌生人很快熟起来。这种本事不是话多，是让人在你旁边不紧张。',
    '你处理关系的方式是给空间。你不追着问，但该出现的时候一定在。',
  ],
  wealth: [
    '你对钱的态度很清醒。你知道它能换什么，也知道它换不到什么。',
    '你有把资源变成结果的能力。钱在你手里不是数字，是能被调度的东西。',
    '你天生对风险有感觉。哪一步太冒险，你比旁人早半拍闻出来。',
  ],
}

/**
 * 各维度的**专属练习**。
 * 每个维度的动作库里绝不出现另一个维度的动作。
 */
const PRACTICE_TEXT: Record<TalentCategory, string[]> = {
  career: [
    '挑一个手上最卡住的项目，写下三步能解开的最短路径。今天只做第一步。',
    '主动问一次「这件事的标准由谁定」。搞清楚这条，你的判断会准很多。',
    '把过去一年做成的三件事写下来。你会发现自己一直在重复同一件事。',
  ],
  academic: [
    '学任何新东西，都先写三行字概括它。写不出来，说明还没真懂。',
    '给自己定一个「教给别人的时间」。能讲明白，才算学进去了。',
    '把收藏夹里吃灰的资料挑一份，这周看完并写两句话。',
  ],
  interpersonal: [
    '这周找一个你不太熟的人，聊满十分钟。不用有目的，就是聊聊。',
    '有人说话时，先别急着给建议。等他讲完，你会发现他真正要的是被听见。',
    '主动约一次久没联系的人。关系不靠等，它要靠主动。',
  ],
  wealth: [
    '打开你的记账软件，看一眼这个月的钱花在哪。不用改，先看清楚。',
    '给「想要」和「需要」各列一张清单。分完之后你会省下一些钱。',
    '把一笔闲置的资源盘活一下。哪怕只是一次闲置物品的转手，也是练习。',
  ],
}

/** 每年适合做的事 —— 每个维度专属焦点池 */
const FOCUS_BY_CATEGORY: Record<TalentCategory, string[]> = {
  career: ['把专业做深', '带一支小队', '开一条新线', '把经验变成产品'],
  academic: ['补一门硬课', '做一次公开讲解', '把方法写成文', '跨领域取材'],
  interpersonal: ['把需求说清楚', '建立稳定的节奏', '修复一段旧关系', '学会给空间'],
  wealth: ['理清收支', '盘活一笔资源', '做一次长期定投', '砍掉一项浪费'],
}

/* ============================================================
 *  文案相似度去重
 * ============================================================ */

function charSet(s: string): Set<string> {
  return new Set(s.replace(/[，。、；：？！「」…—\s]/g, ''))
}

function similarity(a: string, b: string): number {
  const sa = charSet(a)
  const sb = charSet(b)
  if (!sa.size || !sb.size) return 0
  let inter = 0
  for (const c of sa) if (sb.has(c)) inter++
  return inter / (sa.size + sb.size - inter)
}

/** 从候选池里挑一条与已用文案最不像的 */
function pickDistinct(pool: string[], used: string[]): string {
  let best = pool[0]
  let bestScore = Infinity
  for (const cand of pool) {
    const score = used.length ? Math.max(...used.map((u) => similarity(cand, u))) : 0
    if (score < bestScore) {
      bestScore = score
      best = cand
    }
  }
  return best
}

/* ============================================================
 *  语料库装配
 * ============================================================ */

/** 维度 key → 语料库分区 key（v12.0 起两者同名） */
const DOMAIN_OF: Record<TalentCategory, CorpusDomain> = {
  career: 'career',
  academic: 'academic',
  interpersonal: 'interpersonal',
  wealth: 'wealth',
}

/**
 * 组装单个领域的完整对象。
 *
 * 关键点：**每个字段都来自该领域自己的分区**，
 * 没有一个字段是从别的领域借来的。
 */
function buildCategory(
  key: TalentCategory,
  chart: Chart,
  score: number,
  usedStrength: string[],
  usedPractice: string[],
  usedSubtitles: Set<string>,
): TalentCategoryDetail {
  const domain = DOMAIN_OF[key]
  const element = chart.bigThree.sun.sign.element
  const signKey = chart.bigThree.sun.sign.key

  /* 角色定义 —— 来自该领域专属的 roles 池 */
  const role = pickRole(domain, element, signKey, usedSubtitles)
  if (role) usedSubtitles.add(role.subtitle)

  /* 经典段落 —— 来自该领域专属的 passages 池 */
  const passage = pickPassage(domain, element, signKey)

  const strength = pickDistinct(STRENGTH_TEXT[key], usedStrength)
  const practice = pickDistinct(PRACTICE_TEXT[key], usedPractice)
  usedStrength.push(strength)
  usedPractice.push(practice)

  return {
    key,
    label: CORPUS_LABEL[domain],
    score,
    title: role?.title ?? CORPUS_LABEL[domain],
    subtitle: role?.subtitle ?? '',
    field: role?.field ?? '',
    description: passage?.modern ?? '',
    quote: passage?.text ?? '',
    quoteSource: passage?.source ?? '',
    quoteModern: passage?.modern ?? '',
    quoteScene: passage?.scene ?? '',
    strength,
    practice,
  }
}

/* ============================================================
 *  本地推演天赋矩阵
 * ============================================================ */

export function computeTalent(
  chart: Chart,
  mbti: MbtiProfile | null,
  extra = '',
): TalentResult {
  resetCorpusCursors()

  const sunKey = chart.bigThree.sun.sign.key
  const moonKey = chart.bigThree.moon.sign.key
  const risingKey = chart.bigThree.rising.sign.key

  const base = SIGN_TALENT[sunKey] ?? { career: 65, academic: 65, interpersonal: 65, wealth: 65 }
  const moonW = SIGN_TALENT[moonKey] ?? { career: 65, academic: 65, interpersonal: 65, wealth: 65 }
  const riseW = SIGN_TALENT[risingKey] ?? { career: 65, academic: 65, interpersonal: 65, wealth: 65 }
  const mbtiW = mbti
    ? (MBTI_TALENT[mbti.type] ?? { career: 0, academic: 0, interpersonal: 0, wealth: 0 })
    : { career: 0, academic: 0, interpersonal: 0, wealth: 0 }

  const el = chart.elements
  const elBoost: Record<Element, number> = {
    fire: (el.fire - 25) / 5,
    earth: (el.earth - 25) / 5,
    air: (el.air - 25) / 5,
    water: (el.water - 25) / 5,
  }

  const usedStrength: string[] = []
  const usedPractice: string[] = []
  /* 已用掉的角色副标题 —— 保证四个领域的副标题互不相同 */
  const usedSubtitles = new Set<string>()

  const cats: TalentCategoryDetail[] = CORPUS_ORDER.map((key) => {
    const raw =
      base[key] * 0.4 +
      moonW[key] * 0.25 +
      riseW[key] * 0.15 +
      60 * 0.2 +
      mbtiW[key] +
      elBoost[chart.bigThree.sun.sign.element] * 0.6
    const score = Math.max(35, Math.min(98, Math.round(raw)))
    return buildCategory(
      key,
      chart,
      score,
      usedStrength,
      usedPractice,
      usedSubtitles,
    )
  })

  /* ---------- 每年适合做的事 ---------- */
  const thisYear = new Date().getFullYear()
  const yearly = Array.from({ length: 4 }, (_, i) => {
    const year = thisYear + i
    const cat = cats[i % cats.length]
    const pool = FOCUS_BY_CATEGORY[cat.key]
    const focus = pool[Math.floor(i / cats.length + year) % pool.length]
    return {
      year,
      focus,
      action: `把「${focus}」做掉，并给它一个能验收的期限。`,
    }
  })

  /* ---------- 落地建议 ---------- */
  const advice = [
    extra.trim()
      ? `你写下的现状是：「${extra.trim()}」。先把这件事处理到不用再耗心力，再谈更大的方向。`
      : '说说你此刻卡在哪。写得越具体，推演越贴近你。',
    cats[0].strength,
    cats[2].practice,
    `把「${cats[3].label}」当成慢钱。短期看不出变化，但它决定你三年后还有多少选择。`,
  ]

  /*
   * v16.0 · 双版本（本地兜底也要有）
   *
   * 本地语料天然就是「短句」，
   * 所以 minimal = 极简版，deep = 把每个领域展开成一段。
   * 这样即使 AI 不可用，用户依然能切换两个版本。
   */
  const minimal = [
    cats[0].title,
    cats[1].title,
    cats[2].title,
    cats[3].title,
  ].filter(Boolean)

  const deep = cats.map((c) => `${c.title}。${c.description} ${c.practice}`)

  return {
    categories: cats,
    yearly,
    advice,
    source: 'local',
    minimal,
    deep,
  }
}

/**
 * 用语料库的动作池补全 AI 返回的结果里缺失的字段。
 *
 * AI 只写「连接词」，内容主体由语料库提供 ——
 * 所以 AI 返回缺字段时，这里直接从语料库取，绝不留空。
 */
export function fillFromCorpus(
  cats: TalentCategoryDetail[],
): TalentCategoryDetail[] {
  const usedSubtitles = new Set<string>()
  return cats.map((c) => {
    const domain = DOMAIN_OF[c.key]
    const role = pickRole(domain, '', '', usedSubtitles)
    if (role) usedSubtitles.add(role.subtitle)
    const passage = pickPassage(domain, '', '')
    return {
      ...c,
      title: c.title || role?.title || CORPUS_LABEL[domain],
      subtitle: c.subtitle || role?.subtitle || '',
      field: c.field || role?.field || '',
      description: c.description || passage?.modern || '',
      quote: c.quote || passage?.text || '',
      quoteSource: c.quoteSource || passage?.source || '',
      quoteModern: c.quoteModern || passage?.modern || '',
      quoteScene: c.quoteScene || passage?.scene || '',
      practice: c.practice || pickAction(domain),
    }
  })
}
