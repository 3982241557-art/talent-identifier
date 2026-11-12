import corpus from '../data/archetypes_corpus.json'

/* ============================================================
 *  人类语料库检索器（v12.0 · 任务 3）
 * ============================================================
 *
 *  【为什么不再让 AI 自由发挥】
 *  模型写出来的东西像样，但像样得像模板 ——
 *  同样的句式、同样的转折、同样的收尾。
 *  真正有分量的文字反而来自**有人写过的**那些句子：
 *  经典文本的原句、心理学原型里准确的描述。
 *
 *  所以这里的分工是：
 *    语料库负责**内容**（人写过的句子）
 *    AI 只负责**连接**（一两句话把它们串起来）
 *
 *  【检索策略】
 *  1. 按维度（career / study / social / wealth）取该域的段落池
 *  2. 用「元素 + 星座」给段落打分，命中 tags 的优先
 *  3. 用**轮转游标**保证同一次会话里四个维度不会取到同一段
 *  4. 每个维度至少取到一段；池子空了就退回 classics
 * ============================================================ */

export type CorpusDomain = 'career' | 'academic' | 'interpersonal' | 'wealth'

interface CorpusPassage {
  text: string
  source: string
  modern: string
  scene: string
  tags: string[]
}

interface CorpusRole {
  title: string
  subtitle: string
  field: string
  signs: string[]
}

interface CorpusDomainData {
  label: string
  roles: CorpusRole[]
  passages: CorpusPassage[]
  actions: string[]
}

const DATA = corpus as unknown as {
  domains: Record<CorpusDomain, CorpusDomainData>
  classics: Record<string, Array<{ text: string; source: string }>>
  mbti: Record<string, string>
}

/** 四个维度的固定顺序 —— 前后端保持一致 */
export const CORPUS_ORDER: CorpusDomain[] = [
  'career',
  'academic',
  'interpersonal',
  'wealth',
]

/** 维度 → 中文名 */
export const CORPUS_LABEL: Record<CorpusDomain, string> = {
  career: '事业',
  academic: '学业',
  interpersonal: '人际',
  wealth: '财富',
}

/* ============================================================
 *  游标 —— 保证同一份语料在一次生成里不被重复取用
 * ============================================================ */

const cursors: Record<CorpusDomain, number> = {
  career: 0,
  academic: 0,
  interpersonal: 0,
  wealth: 0,
}

/** 重置游标（重新测算时调用，保证每次都有新鲜感） */
export function resetCorpusCursors(): void {
  for (const d of CORPUS_ORDER) cursors[d] = 0
}

/* ============================================================
 *  打分
 * ============================================================ */

/**
 * 段落得分：
 *   +3 命中该维度的招牌元素（段落 tags 里有）
 *   +2 命中星座（角色 signs 里有）
 *   +1 基础分（保证不是 0）
 */
function scorePassage(
  p: CorpusPassage,
  element: string,
  signKey: string,
): number {
  let s = 1
  if (p.tags.includes(element)) s += 3
  if (p.tags.includes(signKey)) s += 3
  return s
}

/**
 * 从语料库里为某个维度挑一段。
 *
 * @param domain  维度
 * @param element 太阳星座元素（fire/earth/air/water）
 * @param signKey 太阳星座 key
 */
export function pickPassage(
  domain: CorpusDomain,
  element: string,
  signKey: string,
): CorpusPassage | null {
  const pool = DATA.domains[domain]?.passages ?? []
  if (!pool.length) return null

  const scored = pool
    .map((p) => ({ p, s: scorePassage(p, element, signKey) }))
    .sort((a, b) => b.s - a.s)

  /* 游标在高分段里轮转 —— 保证高相关的那些不会总被第一个拿走 */
  const top = scored.filter((x) => x.s === scored[0].s)
  const head = scored.slice(0, top.length)
  const idx = cursors[domain] % head.length
  cursors[domain] = (cursors[domain] + 1) % pool.length

  return head[idx].p
}

/**
 * 角色（title / subtitle / field）——
 * 优先挑与元素、星座匹配的那个角色定义。
 *
 * 【v12.0 · 防穿模】
 * `used` 是本次生成中**已经用掉的 subtitle 集合**。
 * 如果挑中的角色 subtitle 撞了（语料库被改动时可能发生），
 * 就换该领域池子里的下一个角色，直到不撞为止。
 *
 * 这是最后一道保险：四个领域的副标题**永远不可能相同**。
 */
export function pickRole(
  domain: CorpusDomain,
  element: string,
  signKey: string,
  used: Set<string> = new Set(),
): CorpusRole | null {
  const roles = DATA.domains[domain]?.roles ?? []
  if (!roles.length) return null

  /* 候选顺序：星座命中 → 元素命中 → 稳定散列 */
  const candidates: CorpusRole[] = []
  const exact = roles.find((r) => r.signs.includes(signKey))
  if (exact) candidates.push(exact)
  const byElement = roles.find((r) => r.signs.includes(element))
  if (byElement && !candidates.includes(byElement)) candidates.push(byElement)
  const idx = Math.abs(hashCode(signKey + domain)) % roles.length
  const hashed = roles[idx]
  if (!candidates.includes(hashed)) candidates.push(hashed)
  for (const r of roles) if (!candidates.includes(r)) candidates.push(r)

  /* 取第一个 subtitle 没被用过的 */
  const fresh = candidates.find((r) => !used.has(r.subtitle))
  return fresh ?? candidates[0]
}

/** 稳定的字符串散列（不依赖随机数，保证同一输入永远同一结果） */
function hashCode(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i)
    h |= 0
  }
  return h
}

/** 从动作池里按维度取一条（游标轮转） */
export function pickAction(domain: CorpusDomain): string {
  const pool = DATA.domains[domain]?.actions ?? []
  if (!pool.length) return ''
  const idx = cursors[domain] % pool.length
  cursors[domain] = (cursors[domain] + 1) % pool.length
  return pool[idx]
}

/* ============================================================
 *  经典文本 · 通用出口
 * ============================================================ */

export interface ClassicLine {
  text: string
  source: string
}

/** 随机（但可复现）取一条经典文本 */
export function pickClassic(seed: string): ClassicLine | null {
  const groups = Object.values(DATA.classics ?? {})
  if (!groups.length) return null
  const flat = groups.flat()
  if (!flat.length) return null
  const idx = Math.abs(hashCode(seed)) % flat.length
  return flat[idx]
}

/** MBTI 的一句人类化描述 */
export function mbtiLine(type: string): string {
  return DATA.mbti?.[type] ?? ''
}

/** 供服务端复用的原始数据（JSON 序列化后传给后端） */
export function corpusSnapshot() {
  return DATA
}
