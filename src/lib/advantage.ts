/* ============================================================
 *  优势挖掘实践 · 数据层（v17.0）
 * ============================================================
 *
 *  【这个模块解决什么痛点】
 *  「我不知道自己擅长什么。」
 *
 *  答案分两步：
 *   1. **排除法** —— 先把「明显不擅长 / 讨厌」的划掉，
 *      剩下的就是宝藏（划掉比勾选容易得多）。
 *   2. **循环法** —— 优势不是一次性发现的，
 *      而是「识别 → 发展 → 体验 → 机会 → 期望 → 回到发展」的飞轮。
 *
 *  【数据为什么内置在这里】
 *  · 技能排查库是**固定的高价值技能集**，
 *    不需要每次请求后端 —— 零延迟，且离线可用。
 *  · 用户填写的内容存 localStorage（自动保存）。
 * ============================================================ */

/* ============================================================
 *  一、五步环形优势链条
 * ============================================================ */

/**
 * 五步优势链条的节点定义。
 *
 * 箭头流向严格遵循：
 *   ① 识别优势 → ② 优势与技能发展 → ③ 积极且有意义的体验
 *   → ④ 提供发展机会 → ⑤ 积极的期望 → **箭头闭环指回 ②**
 *
 * 注意闭环回到的是 ② 而不是 ① ——
 * 这正是「飞轮」和「一次性清单」的本质区别：
 * 飞轮每次转都会把 ② 推得更快。
 */
export interface CycleNode {
  /** 节点序号（1-5） */
  n: number
  /** 节点标题 */
  title: string
  /** 输入框的占位提示 */
  placeholder: string
  /** 节点在环上的角度（度，0 = 正上方，顺时针） */
  angle: number
}

export const CYCLE_NODES: CycleNode[] = [
  {
    n: 1,
    title: '识别优势',
    placeholder: '比如：别人总来找我出主意…',
    angle: -90,
  },
  {
    n: 2,
    title: '优势与技能发展',
    placeholder: '比如：我最近在练习把复杂问题画成图表…',
    angle: -18,
  },
  {
    n: 3,
    title: '积极且有意义的体验',
    placeholder: '比如：上次帮团队理清思路让我特别有成就感…',
    angle: 54,
  },
  {
    n: 4,
    title: '提供发展机会',
    placeholder: '比如：主管把跨组项目交给了我…',
    angle: 126,
  },
  {
    n: 5,
    title: '积极的期望',
    placeholder: '比如：我觉得这条路上我能走得更远…',
    angle: 198,
  },
]

/* ============================================================
 *  二、技能优势排查库（划掉排除法）
 * ============================================================ */

/** 技能库的一条 */
export interface SkillChip {
  /** 技能标识 */
  id: string
  /** 技能名 */
  label: string
  /** 分类 */
  category: SkillCategory
}

/** 技能分类 */
export type SkillCategory =
  | '沟通共情'
  | '逻辑拆解'
  | '审美设计'
  | '危机救火'
  | '资源撮合'
  | '文字表达'
  | '秩序整理'
  | '破冰带动'
  | '细节打磨'
  | '创意脑洞'

/** 分类显示名（顺序即展示顺序） */
export const SKILL_CATEGORIES: SkillCategory[] = [
  '沟通共情',
  '逻辑拆解',
  '审美设计',
  '危机救火',
  '资源撮合',
  '文字表达',
  '秩序整理',
  '破冰带动',
  '细节打磨',
  '创意脑洞',
]

/**
 * 30 个具体可感的日常 / 职场高价值技能。
 *
 * 挑选标准：
 *   · 具体到「能想象出一个人在做什么」，不是抽象能力名词
 *   · 覆盖工作与生活两侧，不只是职场黑话
 */
export const SKILL_LIBRARY: SkillChip[] = [
  // 沟通共情
  { id: 's01', label: '听出话外音', category: '沟通共情' },
  { id: 's02', label: '让别人好说话', category: '沟通共情' },
  { id: 's03', label: '安慰情绪低落的人', category: '沟通共情' },
  { id: 's04', label: '当众发言不怯场', category: '沟通共情' },
  { id: 's05', label: '拒绝别人不翻脸', category: '沟通共情' },

  // 逻辑拆解
  { id: 's06', label: '把乱事理出头绪', category: '逻辑拆解' },
  { id: 's07', label: '一眼看出数据里的问题', category: '逻辑拆解' },
  { id: 's08', label: '拆任务到能动手', category: '逻辑拆解' },
  { id: 's09', label: '判断一个方案靠不靠谱', category: '逻辑拆解' },
  { id: 's10', label: '记住复杂流程不混', category: '逻辑拆解' },

  // 审美设计
  { id: 's11', label: '把东西摆好看', category: '审美设计' },
  { id: 's12', label: '配色和字体挑得准', category: '审美设计' },
  { id: 's13', label: '拍出能看的照片', category: '审美设计' },
  { id: 's14', label: '做界面不丑', category: '审美设计' },
  { id: 's15', label: '写出好读的排版', category: '审美设计' },

  // 危机救火
  { id: 's16', label: '出状况时稳住场面', category: '危机救火' },
  { id: 's17', label: '同时应付好几件急事', category: '危机救火' },
  { id: 's18', label: '帮别人收拾烂摊子', category: '危机救火' },
  { id: 's19', label: '在压力下不出错', category: '危机救火' },

  // 资源撮合
  { id: 's20', label: '找到对的人', category: '资源撮合' },
  { id: 's21', label: '把人聚到一张桌上', category: '资源撮合' },
  { id: 's22', label: '手上有可用的人脉', category: '资源撮合' },
  { id: 's23', label: '谈下来该有的资源', category: '资源撮合' },

  // 文字表达
  { id: 's24', label: '写得清楚别人一看就懂', category: '文字表达' },
  { id: 's25', label: '讲个故事让人记住', category: '文字表达' },
  { id: 's26', label: '起标题让人想点开', category: '文字表达' },
  { id: 's27', label: '总结得又快又准', category: '文字表达' },

  // 秩序整理
  { id: 's28', label: '把桌面和文件理顺', category: '秩序整理' },
  { id: 's29', label: '记性好不忘事', category: '秩序整理' },

  // 破冰带动
  { id: 's30', label: '冷场时能聊起来', category: '破冰带动' },
  { id: 's31', label: '带动气氛不冷场', category: '破冰带动' },
  { id: 's32', label: '让一群人愿意合作', category: '破冰带动' },

  // 细节打磨
  { id: 's33', label: '死磕细节不放过', category: '细节打磨' },
  { id: 's34', label: '挑得出别人没发现的毛病', category: '细节打磨' },
  { id: 's35', label: '改到最后一版还满意', category: '细节打磨' },

  // 创意脑洞
  { id: 's36', label: '想出别人没想到的点子', category: '创意脑洞' },
  { id: 's37', label: '给老问题换个思路', category: '创意脑洞' },
  { id: 's38', label: '白纸前不怯场', category: '创意脑洞' },
]

/* ============================================================
 *  三、存储
 * ============================================================ */

/** 优势实践的完整数据 */
export interface AdvantageState {
  /** 五个节点的文字 */
  cycle: Record<string, string>
  /** 三条核心技能 */
  coreSkills: [string, string, string]
  /** 被划掉的技能 id */
  crossedOut: string[]
}

export const EMPTY_ADVANTAGE: AdvantageState = {
  cycle: {
    '1': '',
    '2': '',
    '3': '',
    '4': '',
    '5': '',
  },
  coreSkills: ['', '', ''],
  crossedOut: [],
}

/** localStorage 键 */
export const ADVANTAGE_KEY = 'talent-identifier:advantage-v17'

/** 读取已保存的优势数据 */
export function loadAdvantage(): AdvantageState {
  try {
    const raw = localStorage.getItem(ADVANTAGE_KEY)
    if (!raw) return { ...EMPTY_ADVANTAGE }
    const parsed = JSON.parse(raw) as Partial<AdvantageState>
    return {
      cycle: { ...EMPTY_ADVANTAGE.cycle, ...(parsed.cycle ?? {}) },
      coreSkills:
        Array.isArray(parsed.coreSkills) && parsed.coreSkills.length === 3
          ? (parsed.coreSkills as [string, string, string])
          : ['', '', ''],
      crossedOut: Array.isArray(parsed.crossedOut) ? parsed.crossedOut : [],
    }
  } catch {
    return { ...EMPTY_ADVANTAGE }
  }
}

/** 保存优势数据（自动保存，每次变更即存） */
export function saveAdvantage(state: AdvantageState): void {
  try {
    localStorage.setItem(ADVANTAGE_KEY, JSON.stringify(state))
  } catch {
    /* 隐私模式：忽略 */
  }
}

/* ============================================================
 *  四、几何计算
 * ============================================================ */

/** 环上某个节点的位置（相对圆心的偏移） */
export function nodeOffset(angleDeg: number, radius: number) {
  const rad = (angleDeg * Math.PI) / 180
  return {
    x: Math.cos(rad) * radius,
    y: Math.sin(rad) * radius,
  }
}

/**
 * 五个节点中，有几个已经点亮（非空）。
 *
 * 「点亮」是强体验感的核心 —— 用户每写完一个，
 * 那个节点和它射出的箭头立刻变成璀璨的恒星金。
 */
export function litCount(cycle: Record<string, string>): number {
  return CYCLE_NODES.filter((node) => (cycle[String(node.n)] ?? '').trim()).length
}

/** 是否五环全通 */
export function isCycleComplete(cycle: Record<string, string>): boolean {
  return litCount(cycle) === CYCLE_NODES.length
}
