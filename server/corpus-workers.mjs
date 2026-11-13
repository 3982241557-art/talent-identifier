/* ============================================================
 *  人类语料库 —— Workers 版检索器（v15.2）
 * ============================================================
 *
 *  【为什么需要单独一份】
 *  server/corpus.mjs 用 `readFileSync` 读 JSON。
 *  Cloudflare Pages Functions 跑在 Workers 运行时，
 *  **没有 node:fs**，文件读不出来。
 *
 *  Workers 版改用静态 `import`：
 *    · 语料库 JSON 直接被打包进 Worker bundle
 *    · 没有文件系统依赖，纯 JS，部署到哪都能跑
 *
 *  【与原版的同步关系】
 *  两份检索器必须**行为完全一致** ——
 *  同样的 domain + element + signKey + salt，
 *  本地 Node 与 Cloudflare 必须取到**同一段**内容。
 *  否则用户在两个环境看到的文案会不一样。
 *
 *  → 复制 server/corpus.mjs 的全部逻辑，只把 load() 换成静态数据。
 *  → 改语料库时两边都不用动（数据源是同一个 JSON 文件）。
 * ============================================================ */

import CORPUS_DATA from '../src/data/archetypes_corpus.data.mjs'

/** 语料库数据（静态引入，无需文件系统） */
const CORPUS = CORPUS_DATA

/** 四个领域的固定顺序 */
export const DOMAINS = ['career', 'academic', 'interpersonal', 'wealth']

/** 领域 → 中文名 */
export const DOMAIN_LABEL = {
  career: '事业',
  academic: '学业',
  interpersonal: '人际',
  wealth: '财富',
}

/** 稳定散列（不依赖随机数） */
function hashCode(s) {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i)
    h |= 0
  }
  return h
}

/**
 * 检索一个领域的内容包。
 *
 * @param domain  career | academic | interpersonal | wealth
 * @param element 太阳星座元素，用于给段落加权
 * @param signKey 太阳星座 key
 * @param salt    轮转盐 —— 同一个 salt 会取到同一段（可复现）
 */
export function retrieve(
  domain,
  element,
  signKey,
  salt = 0,
  usedSubtitles = new Set(),
) {
  const d = CORPUS.domains?.[domain]
  if (!d) return null

  /* ---------- 角色定义（title / subtitle / field） ----------
   *
   * v12.0 · 防穿模：
   * 候选顺序 = 星座命中 → 元素命中 → 稳定散列 → 其余。
   * 取第一个 subtitle **没被别的领域用过**的角色。
   * 这样四个领域的副标题在结构上就不可能相同。
   */
  const roles = d.roles ?? []
  const candidates = []
  const exact = roles.find((r) => r.signs?.includes(signKey))
  if (exact) candidates.push(exact)
  const byElement = roles.find((r) => r.signs?.includes(element))
  if (byElement && !candidates.includes(byElement)) candidates.push(byElement)
  if (roles.length) {
    const hashed = roles[Math.abs(hashCode(signKey + domain)) % roles.length]
    if (!candidates.includes(hashed)) candidates.push(hashed)
  }
  for (const r of roles) if (!candidates.includes(r)) candidates.push(r)

  let role = candidates.find((r) => !usedSubtitles.has(r.subtitle))
  if (!role) role = candidates[0]
  if (role) usedSubtitles.add(role.subtitle)

  /* ---------- 经典段落 ---------- */
  const passages = d.passages ?? []
  const scored = passages
    .map((p) => {
      let s = 1
      if (p.tags?.includes(element)) s += 3
      if (p.tags?.includes(signKey)) s += 3
      return { p, s }
    })
    .sort((a, b) => b.s - a.s)

  const topScore = scored[0]?.s ?? 0
  const head = scored.filter((x) => x.s === topScore)
  const passage = head[Math.abs(hashCode(signKey + domain + salt)) % head.length]?.p

  /* ---------- 动作 ---------- */
  const actions = d.actions ?? []
  const action = actions.length
    ? actions[Math.abs(hashCode(domain + signKey + salt)) % actions.length]
    : ''

  return {
    domain,
    label: d.label,
    role: role
      ? { title: role.title, subtitle: role.subtitle, field: role.field }
      : { title: '', subtitle: '', field: '' },
    passage: passage
      ? {
          text: passage.text,
          source: passage.source,
          modern: passage.modern,
          scene: passage.scene,
        }
      : { text: '', source: '', modern: '', scene: '' },
    action,
  }
}

/** 取出所有经典文本（供「灵魂底色」「今日一牌」等场景取用） */
export function classicLines() {
  return Object.entries(CORPUS.classics ?? {}).flatMap(([who, lines]) =>
    lines.map((l) => ({ who, text: l.text, source: l.source })),
  )
}

/** 按 key 取一条经典文本 */
export function pickClassic(key) {
  const all = classicLines()
  if (!all.length) return null
  return all[Math.abs(hashCode(key)) % all.length]
}

/** MBTI 的一句话描述 */
export function mbtiLine(type) {
  return CORPUS.mbti?.[type] ?? ''
}
