import type { Chart, MbtiProfile, Verdict } from '../types'
import { MBTI_TYPES } from '../data/mbtiTypes'

/* ============================================================
 *  灵魂底色 —— 过渡页单句（v6.0）
 *
 *  v6.0 硬性约束（任务 3）：
 *   · 绝对禁止出现任何占星术语：
 *     「狮子座上升」「巨蟹座太阳」「白羊座」「月亮」「上升」「宫位」…
 *   · 这一页只是 P3 → P4 的过渡，不承担星盘解读的职责。
 *   · 一句话只允许包含两件事：
 *     【MBTI 类型】+【地理位置】
 *
 *  星盘术语要到 P4（主页）才登场 —— 那里才有真正的星盘。
 * ============================================================ */

/**
 * 出生地 → 客观的环境性描述。
 * 只写「水土 / 纬度 / 气候带来的开放度」这类客观事实，
 * 不做玄学断言，也不提任何星座。
 */
function placeFactor(place?: string): string {
  if (!place) return ''
  if (/黑龙江|吉林|辽宁|内蒙古|新疆|甘肃|宁夏|青海|西藏|北京|天津|河北|山西|陕西/.test(place)) {
    return '北方的干爽与开阔养出的直接与利落'
  }
  if (/广东|广西|海南|福建|云南|贵州|湖南|江西|浙江|江苏|上海|重庆|四川|湖北|安徽|台湾|香港|澳门/.test(place)) {
    return '南方湿润气候养出的柔韧与烟火气'
  }
  if (/山东|江苏|浙江|福建|广东|广西|海南|辽宁|河北|天津|上海/.test(place)) {
    return '临海的开阔视野带来的松弛与外向'
  }
  if (/西藏|青海|新疆|云南|四川|内蒙古/.test(place)) {
    return '高原辽阔地平线带来的辽远与钝感'
  }
  return '这片水土养出的生活节奏'
}

/**
 * 把一句话压进 [50, 80] 字的安全区间。
 * 过长则在标点处收尾；过短则补一个收束短句。
 */
function clampSentence(text: string): string {
  let t = text.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim()
  // 句内终止符改为逗号，保持可读的停顿
  t = t.replace(/[。！？!?…]+/g, '，')
  t = t.replace(/[，,]\s*[，,]+/g, '，')
  t = t.replace(/^[，、；,]+/, '').replace(/[，、；,]+$/, '').trim()

  const MIN = 50
  const MAX = 80

  if (t.length > MAX) {
    const slice = t.slice(0, MAX)
    const cut = Math.max(
      slice.lastIndexOf('，'),
      slice.lastIndexOf('、'),
      slice.lastIndexOf('；'),
    )
    t = cut > MIN ? slice.slice(0, cut) : slice
    t = t.replace(/[，、；,]+$/, '')
  }

  if (t.length < MIN) {
    t = `${t}，而这一切都还需要时间与经历来慢慢验证`
  }

  return `${t.slice(0, MAX)}。`
}

/**
 * v7.0 · 第三人称 → 第二人称（前端兜底）
 *
 * 服务端已经做了同样的转换，但前端本地引擎（离线兜底）
 * 以及可能存在的旧缓存内容也要过这一道关。
 */
export function toSecondPerson(text: string): string {
  if (typeof text !== 'string') return ''
  let t = text
  t = t.replace(/这位旅人|一位旅人|这个人|此人/g, '你')
  t = t.replace(/他们的|他的|她的/g, '你的')
  t = t.replace(/他们|她们/g, '你')
  t = t.replace(/他(?![人己])/g, '你')
  t = t.replace(/她/g, '你')
  t = t.replace(/其他/g, '另外')
  t = t.replace(/其实/g, '本来')
  t = t.replace(/其(?![实他])/g, '你')
  t = t.replace(/的的/g, '的')
  return t.trim()
}

/**
 * 生成过渡页的一句话。
 *
 * @param mbti  性格类型
 * @param place 出生地文本
 */
export function buildSoulPortrait(
  mbti: MbtiProfile | null,
  _chart?: Chart | null,
  place?: string,
): Verdict {
  const info = mbti ? MBTI_TYPES[mbti.type] : null

  /* ---------- 核心关键词（仅 MBTI 相关，绝不含星座） ---------- */
  // 注意：MBTI 类型与昵称已在上方大字号单独展示，
  // 这里只补充「特质关键词 + 出生地」，避免重复。
  //
  // v7.0：不再生硬地 slice(0, 6) 截断
  // （那会把「能同时hold住长线目标」砍成「能同时hol」这种半截词），
  // 改为**在标点处切出完整的一个短语**。
  const keywords: string[] = []
  for (const s of (info?.strengths ?? []).slice(0, 2)) {
    const frag = s.split(/[，,。；;、]/).map((x) => x.trim()).find(Boolean)
    if (frag) keywords.push(frag.length > 8 ? frag.slice(0, 8) : frag)
  }
  if (place) keywords.push(place.split(/\s+/)[0] ?? '')
  const tags = Array.from(new Set(keywords.filter(Boolean))).slice(0, 4)

  /* ---------- 单句正文：只讲 MBTI + 地理 ---------- */
  if (!mbti) {
    return {
      text: clampSentence(
        '你的轮廓还在成形之中，走完前面的步骤，这里才会浮现出真正属于你的那一句速写',
      ),
      highlights: [],
      coda: '这只是此刻的你，明天可能就不一样了。',
      keywords: [],
      deep: buildSoulDeep(null, _chart, place),
    }
  }
  const placeText = placeFactor(place)
  const strength = info?.strengths?.[0] ?? ''
  const blindspot = info?.blindspot ?? ''

  /**
   * v7.0 · 强制第二人称「你」
   *
   * 旧版写的是「出生于广东惠州的你是 ESTP，行动派的他习惯先做再解释」——
   * 前半句是「你」，后半句又滑回了「他」，视角是乱的。
   * 现在整句只用一个视角：直接对读者说话。
   */
  const clauses: string[] = [
    place ? `你出生在${place}` : '你',
    `，是 ${mbti.type}`,
    info?.nickname ? `——${info.nickname}` : '',
    strength ? `；${strength}` : '',
    placeText ? `，${placeText}` : '',
    blindspot ? `，也常常需要留意${blindspot}` : '',
  ]

  const text = clampSentence(clauses.filter(Boolean).join(''))

  const highlights = tags.filter((k) => text.includes(k))

  const coda = '这只是此刻的你，明天可能就不一样了。'

  return { text, highlights, coda, keywords: tags, deep: buildSoulDeep(mbti, _chart, place) }
}

/**
 * v16.0 · 本地深度版速写（多段）
 *
 * 为什么要本地生成：
 *   · 后端 AI 有可能超时 / 返回格式错误 / 只给了极简版；
 *   · 而「极简直给版 | 深度剖析版」的双版本切换胶囊
 *     必须**永远**出现在解读面板顶部 —— 不能因为一次请求失败就消失；
 *   · 所以本地引擎必须能独立产出合格的深度版文案。
 *
 * 硬性约束（与 /api/soul 一致）：
 *   · 第二人称「你」
 *   · 不出现任何占星术语
 *   · 多段落（用 \n\n 分隔），与极简版形成明显字数反差
 */
export function buildSoulDeep(
  mbti: MbtiProfile | null,
  chart?: Chart | null,
  place?: string,
): string {
  const info = mbti ? MBTI_TYPES[mbti.type] : null
  const placeText = placeFactor(place)
  const strength = info?.strengths?.[0] ?? '你擅长在纷乱里抓住重点'
  const second = info?.strengths?.[1] ?? '你也耐得住重复与琐碎'
  const blindspot = info?.blindspot ?? '你有时太相信自己的判断'
  const growth = '多给人一点空间，也多给自己一点解释'

  const paras: string[] = []

  paras.push(
    place
      ? `你出生在${place}，那片水土给了你一副耐得住的骨架——${placeText}。`
      : '你身上有一副耐得住的骨架，先稳，再快。',
  )

  paras.push(
    mbti
      ? `你是 ${mbti.type}${info?.nickname ? `，${info.nickname}` : ''}。${strength}；${second}。这两件事凑在一起，让你看上去比实际更可靠。`
      : `${strength}；${second}。这两件事凑在一起，让你看上去比实际更可靠。`,
  )

  paras.push(
    `不过你也有代价：${blindspot}。你很少在外人面前承认这一点，于是别人常常先误读你，再理解你。真正懂你的人，会觉得跟你相处省力——你不需要被反复解释。`,
  )

  paras.push(
    `所以对你来说，关键在于${growth}。你适合被看见的方式，是被准确地理解；「被广泛地认可」这件事，反倒会让你失焦。`,
  )

  paras.push(
    chart
      ? '你出生那一刻的天象，已经被记在这张星盘里了。接下来那一页，会把它摊开给你看。'
      : '这些只是此刻的你。往后那一页，才会把更具体的部分摊开给你看。',
  )

  return paras.join('\n\n')
}

/**
 * 灵魂底色页面用的「核心标签」
 * 用于星盘还没出场时，概括用户最显性的几个特征。
 */
export function soulKeywords(mbti: MbtiProfile | null): string[] {
  if (!mbti) return []
  const info = MBTI_TYPES[mbti.type]
  const frag = (s: string) => {
    const f = s.split(/[，,。；;、]/).map((x) => x.trim()).find(Boolean) ?? ''
    return f.length > 8 ? f.slice(0, 8) : f
  }
  const tags = [
    mbti.type,
    ...(info?.strengths ?? []).slice(0, 2).map(frag),
  ]
  return Array.from(new Set(tags))
}
