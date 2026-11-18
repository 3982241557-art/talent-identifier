/* ============================================================
 *  优势挖掘 · AI 职位与行动方向推演
 * ============================================================
 *
 *  【和现有天赋解析的区别】
 *  /api/talent 说的是「你在哪四个方向有天赋」（星盘 + MBTI 推导）。
 *  /api/career-advice 说的是「那你具体该干什么」——
 *  它**必须**结合用户**亲手填写**的 5 步优势链条与 3 大核心技能，
 *  因为只有这些才是用户自己认领过的东西。
 *
 *  【双版本输出】
 *  · minimal —— 大字号高光结论 + 3 张极简要点短卡 + 1 条当下行动
 *    （每条不超过 25 字，3 秒扫完）
 *  · deep    —— 分段式深度叙事：
 *    「你为什么会这样」「最容易踩的坑」「具体怎么破局」
 *
 *  【铁律】
 *  · 0 个「不是……而是……」句型
 *  · 0 个生僻占星术语
 *  · 有据可依：用户没填的字段就不许编
 * ============================================================ */

/** 输入载荷 */
export function normalizeCareerPayload(body) {
  const chart = body?.chart ?? null
  const mbti = body?.mbti ?? null
  const advantage = body?.advantage ?? null

  /* ---------- 五步链条 ---------- */
  const cycle = {}
  if (advantage && typeof advantage === 'object') {
    for (const k of ['1', '2', '3', '4', '5']) {
      const v = advantage.cycle?.[k]
      if (typeof v === 'string' && v.trim()) cycle[k] = v.trim().slice(0, 200)
    }
  }

  /* ---------- 三大核心技能 ---------- */
  const coreSkills = []
  if (Array.isArray(advantage?.coreSkills)) {
    for (const v of advantage.coreSkills) {
      if (typeof v === 'string' && v.trim()) {
        coreSkills.push(v.trim().slice(0, 60))
      }
    }
  }

  /* ---------- 已划掉的技能（用户不擅长的） ---------- */
  const crossedOut = []
  if (Array.isArray(advantage?.crossedOut)) {
    for (const v of advantage.crossedOut) {
      if (typeof v === 'string') crossedOut.push(v.slice(0, 40))
    }
  }

  return {
    chart,
    mbti,
    cycle,
    coreSkills: coreSkills.slice(0, 3),
    crossedOut: crossedOut.slice(0, 40),
    /** 链条写了几格 */
    cycleFilled: Object.keys(cycle).length,
    /** 有没有核心技能 */
    hasSkills: coreSkills.length > 0,
  }
}

/** 系统 Prompt —— 双版本 + 人话铁律 */
export const CAREER_SYSTEM_PROMPT = [
  '你是一位帮人选定职业方向的老顾问。说话直接、具体、不打官腔。',
  '',
  '【铁律 · 违反任何一条都算失败】',
  '1. 全篇禁止出现「不是……而是……」这种句型。',
  '2. 禁止使用生僻占星术语。星盘信息只用白话转述，比如',
  '   「你的主心骨很稳」而不是「太阳落土象」。',
  '3. 每一句建议都必须能被验证或被执行。',
  '   不许写「提升沟通能力」这种正确的废话，',
  '   要写「下周找组长要一次跨组会议旁听机会」。',
  '4. 如果用户给的信息不足以支撑某个判断，就写实际能推的那部分，',
  '   不许用放之四海皆准的话术填坑。',
  '5. 极简版的每一条不超过 25 个字。',
  '',
  '【输出格式 · 严格 JSON】',
  '{',
  '  "minimal": {',
  '    "headline": "一句高光结论，不超过 30 字",',
  '    "points": ["三条要点，每条不超过 25 字"],',
  '    "action": "一条当下就能做的行动，不超过 25 字"',
  '  },',
  '  "deep": {',
  '    "origins": "为什么你会这样 —— 结合星盘落点与性格成因的大白话解释，两三段",',
  '    "friction": "你在现实生活 / 人际 / 工作中最容易踩的坑，具体到场景",',
  '    "solution": "具体怎么破局，列出可执行的步骤",',
  '    "jobs": [',
  '      { "role": "具体岗位名", "why": "为什么这个岗位适合他，用他自己的优势链条佐证" },',
  '      { "role": "...", "why": "..." },',
  '      { "role": "...", "why": "..." }',
  '    ],',
  '    "sideProject": "最适合尝试的副业或个人项目切入点，具体到能今天开头",',
  '    "nextWeek": "接下来一周内就能动手做的 1 件具体小事"',
  '  }',
  '}',
  '',
  '【jobs 的要求】',
  '必须是**真实存在**的具体岗位名（例：产品运营、数据分析师、',
  '用户研究员、活动策划），禁止「优秀的人」「成功者」这类虚词。',
  '三个岗位必须彼此不同，不能是同一个方向换三个说法。',
  '',
  '【strict JSON · 不要任何解释文字，不要 markdown 代码块】',
].join('\n')

/** 把星盘转成白话描述 */
export function describeChartForCareer(chart) {
  if (!chart || typeof chart !== 'object') return ''
  const bt = chart.bigThree
  if (!bt) return ''

  const sun = bt.sun?.sign?.cn ?? ''
  const moon = bt.moon?.sign?.cn ?? ''
  const rising = bt.rising?.sign?.cn ?? ''

  /* 元素白话 —— 这是最容易变成术语的地方 */
  const elementPlain = {
    火: '行动力强，习惯先做起来再调整',
    土: '踏实，擅长把事情落地做扎实',
    风: '爱琢磨，靠信息和道理推动事情',
    水: '感受力强，能读懂人和气氛',
  }

  const sunEl = bt.sun?.sign?.element ?? ''
  const moonEl = bt.moon?.sign?.element ?? ''
  const risingEl = bt.rising?.sign?.element ?? ''

  const lines = [
    sun && `太阳在${sun}（${elementPlain[sunEl] ?? ''}）`,
    moon && `月亮在${moon}（${elementPlain[moonEl] ?? ''}）`,
    rising && `上升在${rising}（${elementPlain[risingEl] ?? ''}）`,
  ].filter(Boolean)

  return lines.length ? `【星盘 · 白话】\n${lines.join('\n')}` : ''
}

/** 把 MBTI 转成白话 */
export function describeMbtiForCareer(mbti) {
  if (!mbti || typeof mbti !== 'object') return ''
  const t = mbti.type
  if (typeof t !== 'string' || !t.trim()) return ''

  const axisPlain = {
    E: '习惯向外输出、跟人一起推进',
    I: '习惯先在脑子里想透再开口',
    S: '看重具体事实和当下经验',
    N: '看重可能性和未来的样子',
    T: '做决定靠逻辑和公平',
    F: '做决定靠感受和关系',
    J: '喜欢有计划、有掌控感',
    P: '喜欢留余地、随机应变',
  }

  const letters = t.split('')
  const desc = letters
    .map((l) => axisPlain[l])
    .filter(Boolean)
    .join('；')

  return desc ? `【性格 · 白话】\n${desc}` : ''
}

/** 把用户填写的优势链条 + 核心技能转成 prompt 段落 */
export function describeAdvantageForCareer(payload) {
  const parts = []

  /* ---------- 五步链条 ---------- */
  const cycleLabels = {
    '1': '① 识别优势',
    '2': '② 优势与技能发展',
    '3': '③ 积极且有意义的体验',
    '4': '④ 提供发展机会',
    '5': '⑤ 积极的期望',
  }
  const cycleLines = []
  for (const k of ['1', '2', '3', '4', '5']) {
    if (payload.cycle[k]) {
      cycleLines.push(`${cycleLabels[k]}：${payload.cycle[k]}`)
    }
  }
  if (cycleLines.length) {
    parts.push(`【他亲手写下的优势链条 · ${cycleLines.length}/5 格】\n${cycleLines.join('\n')}`)
  }

  /* ---------- 核心技能 ---------- */
  if (payload.coreSkills.length) {
    parts.push(
      `【他认领的三个核心技能】\n${payload.coreSkills.map((s, i) => `${i + 1}. ${s}`).join('\n')}`,
    )
  }

  /* ---------- 已划掉的 ---------- */
  if (payload.crossedOut.length) {
    parts.push(
      `【他明确划掉、不擅长的技能】\n${payload.crossedOut.join('、')}`,
    )
  }

  return parts.join('\n\n')
}

/** 组装 user prompt */
export function buildCareerUserPrompt(payload) {
  const chunks = [
    '请为这位旅人推演最适合的职位与行动方向。',
    describeChartForCareer(payload.chart),
    describeMbtiForCareer(payload.mbti),
    describeAdvantageForCareer(payload),
  ].filter(Boolean)

  /*
   * 信息不足时明确告诉模型「缺什么」，
   * 让它只写能推的部分，不许瞎编。
   */
  const gaps = []
  if (!payload.chart) gaps.push('星盘')
  if (!payload.mbti) gaps.push('MBTI')
  if (!payload.cycleFilled) gaps.push('优势链条')
  if (!payload.hasSkills) gaps.push('核心技能')

  if (gaps.length) {
    chunks.push(
      `【重要 · 信息不足】\n以下信息用户没有提供：${gaps.join('、')}。\n` +
        '请只基于已有信息推演，缺少依据的部分要坦诚说明「这块还需要你自己确认」，' +
        '绝对不许编造用户的经历、性格或优势。',
    )
  }

  return chunks.join('\n\n')
}

/* ============================================================
 *  输出清洗
 * ============================================================ */

/** 去除「不是……而是……」句型 */
export function scrubComparative(text) {
  if (typeof text !== 'string') return ''
  return (
    text
      /* 不是 A，而是 B */
      .replace(/不是[^，。；！？\n]{1,24}[，,]\s*(?:而是|只是|不过是)/g, '')
      /* 不是 A。是 B */
      .replace(/不是[^，。；！？\n]{1,24}[。]\s*是/g, '')
      /* 并非 A，而是 B */
      .replace(/并非[^，。；！？\n]{1,24}[，,]\s*而是/g, '')
      /* A 不在于 B，而在于 C */
      .replace(/不在于[^，。；！？\n]{1,24}[，,]\s*而在于/g, '')
      /* 去掉残留的「而是」尾巴 */
      .replace(/[，,]\s*而是\s*(?=[，。；！？])/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim()
  )
}

/** 清洗一组短句 */
export function scrubPointList(list) {
  if (!Array.isArray(list)) return []
  const out = []
  for (const item of list) {
    if (typeof item !== 'string') continue
    const clean = scrubComparative(item).trim()
    if (!clean) continue
    out.push(clean)
    if (out.length >= 6) break
  }
  return out
}

/** 清洗长段 */
export function scrubLong(text, limit = 1200) {
  if (typeof text !== 'string') return ''
  return scrubComparative(text).slice(0, limit).trim()
}

/**
 * 清洗整个 AI 返回体。
 *
 * 关键：**宁缺毋滥** —— 字段缺失就用空字符串，
 * 绝不用「undefined」或占位废话填充。
 */
export function normalizeCareerResult(parsed) {
  if (!parsed || typeof parsed !== 'object') {
    return {
      minimal: { headline: '', points: [], action: '' },
      deep: {
        origins: '',
        friction: '',
        solution: '',
        jobs: [],
        sideProject: '',
        nextWeek: '',
      },
    }
  }

  const m = parsed.minimal ?? {}
  const d = parsed.deep ?? {}

  /* ---------- 岗位 ---------- */
  const jobs = []
  const rawJobs = Array.isArray(d.jobs) ? d.jobs : []
  for (const j of rawJobs) {
    if (!j || typeof j !== 'object') continue
    const role = scrubLong(String(j.role ?? ''), 40)
    const why = scrubLong(String(j.why ?? ''), 200)
    if (!role) continue
    jobs.push({ role, why })
    if (jobs.length >= 3) break
  }

  return {
    minimal: {
      headline: scrubLong(String(m.headline ?? ''), 60),
      points: scrubPointList(m.points),
      action: scrubLong(String(m.action ?? ''), 50),
    },
    deep: {
      origins: scrubLong(String(d.origins ?? '')),
      friction: scrubLong(String(d.friction ?? '')),
      solution: scrubLong(String(d.solution ?? '')),
      jobs,
      sideProject: scrubLong(String(d.sideProject ?? ''), 400),
      nextWeek: scrubLong(String(d.nextWeek ?? ''), 300),
    },
  }
}
