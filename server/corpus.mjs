import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

/* ============================================================
 *  人类语料库 —— 服务端检索器（v12.0 · 任务 3）
 * ============================================================
 *
 *  与前端 `src/lib/corpus.ts` 同源同构。
 *  两边共用 `src/data/archetypes_corpus.json` 这一个真相。
 *
 *  【为什么服务端也要读】
 *  AI 的 prompt 里必须**原样带上**检索出来的经典原句，
 *  模型才有条件「只做连接、不自己造段」。
 *  如果语料只在客户端，服务端就无从校验 —— 模型仍会自由发挥。
 *
 *  【职责边界】
 *    语料库 → 内容主体（人写过的句子）
 *    AI     → 连接词（把它们串起来的一两句话）
 * ============================================================ */

const here = dirname(fileURLToPath(import.meta.url))

/** 语料库文件（与前端共用同一份） */
const CORPUS_FILE = resolve(here, '..', 'src', 'data', 'archetypes_corpus.json')

let CORPUS = null

function load() {
  if (CORPUS) return CORPUS
  CORPUS = JSON.parse(readFileSync(CORPUS_FILE, 'utf-8'))
  return CORPUS
}

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
export function retrieve(domain, element, signKey, salt = 0, usedSubtitles = new Set()) {
  const data = load()
  const d = data.domains?.[domain]
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
  const data = load()
  return Object.entries(data.classics ?? {}).flatMap(([who, lines]) =>
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
  const data = load()
  return data.mbti?.[type] ?? ''
}
