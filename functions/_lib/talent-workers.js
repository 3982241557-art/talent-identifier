/* ============================================================
 *  天赋结果归一化 —— Workers 版（v15.2）
 * ============================================================
 *
 *  与 server/app.mjs 的 normalizeTalentPayload 逻辑完全一致。
 *  两份必须同步 —— 同一份 prompt，不同环境出来的结果应当一致。
 *
 *  【三道防线】
 *   1. 四个领域必须齐全 —— 缺一个就用语料库补上。
 *   2. 原句字段不可被改写 —— quote / quoteSource /
 *      quoteModern / quoteScene 一律以语料库为准。
 *   3. 角色字段必须来自对应领域 —— subtitle / title / field
 *      一律用该领域语料包里的角色定义，从根上杜绝穿模。
 * ============================================================ */

import { DOMAIN_LABEL } from '../../server/corpus-workers.mjs'

/** 字符级 Jaccard 相似度 */
function textSimilarity(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return 0
  const sa = new Set(a.replace(/[，。、；：？！「」…—\s]/g, ''))
  const sb = new Set(b.replace(/[，。、；：？！「」…—\s]/g, ''))
  if (!sa.size || !sb.size) return 0
  let inter = 0
  for (const c of sa) if (sb.has(c)) inter++
  return inter / (sa.size + sb.size - inter)
}

/** 跨领域相似度阈值 */
const TALENT_DUP_THRESHOLD = 0.42

/** 天赋模块专用的占星术语表（比全局更严） */
const TALENT_ASTRO_TERMS = [
  '星座', '白羊', '金牛', '双子', '巨蟹', '狮子', '处女', '天秤', '天蝎',
  '射手', '摩羯', '水瓶', '双鱼', '宫位', '宫', '行星', '本命盘', '星盘',
  '占星', '命理', '相位', '黄道', '天顶', '上升', '落座', '宫头',
  '太阳', '月亮', '金星', '木星', '土星', '火星', '水星', '海王', '天王',
]

/** 是否命中占星术语 */
function talentHasAstroTerms(text) {
  if (typeof text !== 'string' || !text) return false
  return TALENT_ASTRO_TERMS.some((t) => text.includes(t))
}

/** 单条文本的硬上限 */
const TALENT_TEXT_LIMIT = {
  description: 46,
  strength: 48,
  practice: 48,
}

/**
 * 归一化 AI 返回的天赋结果。
 *
 * @param parsed AI 的原始 JSON
 * @param packs  语料库检索结果（与 domains 同序）
 * @param domains 领域顺序
 */
export function normalizeTalentPayload(parsed, packs, domains) {
  const list = Array.isArray(parsed?.categories) ? parsed.categories : []
  const byKey = new Map()
  for (const c of list) {
    if (c && typeof c === 'object' && typeof c.key === 'string') {
      byKey.set(c.key, c)
    }
  }

  const seenDescription = []
  const seenStrength = []
  const seenPractice = []

  const categories = domains.map((domain, i) => {
    const pack = packs[i]
    const raw = byKey.get(domain) ?? {}

    /* ---------- 原句：语料库说了算 ---------- */
    const quote = pack.passage.text
    const quoteSource = pack.passage.source
    const quoteModern = pack.passage.modern
    const quoteScene = pack.passage.scene

    /* ---------- 角色：语料库说了算（杜绝穿模） ---------- */
    const title = pack.role.title
    const subtitle = pack.role.subtitle
    const field = pack.role.field

    /* ---------- 连接词：取 AI 的，但要过质检 ---------- */
    const take = (aiText, seen, limit) => {
      const t = typeof aiText === 'string' ? aiText.trim() : ''
      if (!t) return ''
      if (t.length > limit) return ''
      if (
        seen.length &&
        Math.max(...seen.map((s) => textSimilarity(t, s))) > TALENT_DUP_THRESHOLD
      ) {
        return ''
      }
      if (talentHasAstroTerms(t)) return ''
      return t
    }

    const description = take(raw.description, seenDescription, TALENT_TEXT_LIMIT.description)
    const strength = take(raw.strength, seenStrength, TALENT_TEXT_LIMIT.strength)
    const practice = take(raw.practice, seenPractice, TALENT_TEXT_LIMIT.practice)

    if (description) seenDescription.push(description)
    if (strength) seenStrength.push(strength)

    const score =
      typeof raw.score === 'number' && Number.isFinite(raw.score)
        ? Math.max(0, Math.min(100, Math.round(raw.score)))
        : 60

    return {
      key: domain,
      label: DOMAIN_LABEL[domain],
      score,
      title,
      subtitle,
      field,
      description: description || quoteModern,
      quote,
      quoteSource,
      quoteModern,
      quoteScene,
      strength: strength || quoteScene,
      practice: practice || pack.action,
    }
  })

  /* ---------- 每年适合做的事 ---------- */
  const years = Array.isArray(parsed?.yearly) ? parsed.yearly : []
  const thisYear = new Date().getFullYear()
  const FOCUS_POOL = [
    ['把专业做深', '带一支小队', '开一条新线', '把经验变成产品'],
    ['补一门硬课', '做一次公开讲解', '把方法写成文', '跨领域取材'],
    ['把需求说清楚', '建立稳定的节奏', '修复一段旧关系', '学会给空间'],
    ['理清收支', '盘活一笔资源', '做一次长期定投', '砍掉一项浪费'],
  ]
  const yearly = Array.from({ length: 4 }, (_, i) => {
    const y = years[i]
    const year = typeof y?.year === 'number' ? y.year : thisYear + i
    let focus = typeof y?.focus === 'string' ? y.focus.trim() : ''
    let action = typeof y?.action === 'string' ? y.action.trim() : ''
    if (focus.length > 16) focus = ''
    if (action.length > 60) action = ''
    if (!focus) {
      const pool = FOCUS_POOL[i % FOCUS_POOL.length]
      focus = pool[(year + i) % pool.length]
    }
    if (!action) {
      action = `把「${focus}」做掉，并给它一个能验收的期限。`
    }
    return { year, focus, action }
  })

  /* ---------- 落地建议 ---------- */
  const adv = Array.isArray(parsed?.advice) ? parsed.advice : []
  const advice = adv
    .filter((a) => typeof a === 'string' && a.trim())
    .map((a) => a.trim())
    .filter((a) => !talentHasAstroTerms(a))
    .slice(0, 4)
  if (advice.length < 4) {
    for (const c of categories) {
      if (advice.length >= 4) break
      const line = c.practice || c.quoteScene
      if (line && !advice.includes(line)) advice.push(line)
    }
  }

  return { categories, yearly, advice }
}
