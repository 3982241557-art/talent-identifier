import type {
  ChatTurn,
  DayRecord,
  MbtiProfile,
  SavedProfile,
} from '../types'

/* ============================================================
 *  本地持久化 —— 同一账号（浏览器标识）下的资料永久留存
 *
 *  存储层：localStorage（键名带账号 ID）
 *  账号 ID：首次访问生成并写入 localStorage，之后固定不变，
 *          因此刷新页面 / 关闭浏览器重开后资料仍在。
 * ============================================================ */

const ACCOUNT_KEY = 'talent-identifier:account'
const PROFILE_PREFIX = 'talent-identifier:profile:'
const INDEX_KEY = 'talent-identifier:accounts'

export const todayKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`

/** 生成/读取当前账号 ID */
export function getAccountId(): string {
  try {
    const raw = localStorage.getItem(ACCOUNT_KEY)
    if (raw) return raw
    const id = `acc_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`
    localStorage.setItem(ACCOUNT_KEY, id)
    const list = readIndex()
    localStorage.setItem(INDEX_KEY, JSON.stringify([...list, id]))
    return id
  } catch {
    return 'acc_ephemeral'
  }
}

function readIndex(): string[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

/** 账号列表（用于「切换账号」） */
export function listAccounts(): string[] {
  return readIndex()
}

const profileKey = (id: string) => `${PROFILE_PREFIX}${id}`

export function emptyProfile(accountId: string): SavedProfile {
  return {
    accountId,
    accountName: '旅人',
    birth: null,
    mbti: null,
    chart: null,
    days: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

/** 读取存档 */
export function loadProfile(accountId: string): SavedProfile {
  try {
    const raw = localStorage.getItem(profileKey(accountId))
    if (!raw) return emptyProfile(accountId)
    const parsed = JSON.parse(raw) as SavedProfile
    return { ...emptyProfile(accountId), ...parsed }
  } catch {
    return emptyProfile(accountId)
  }
}

/** 写入存档 */
export function saveProfile(profile: SavedProfile): void {
  try {
    localStorage.setItem(
      profileKey(profile.accountId),
      JSON.stringify({ ...profile, updatedAt: Date.now() }),
    )
  } catch {
    /* 隐私模式下写入失败：静默降级为内存态 */
  }
}

/** 清空当前账号档案（保留账号本身） */
export function clearProfile(accountId: string): void {
  try {
    localStorage.removeItem(profileKey(accountId))
  } catch {
    /* noop */
  }
}

/* ---------------- 往日运势 / 聊天历史 ---------------- */

/** 取得当日记录（不存在则创建） */
export function ensureDay(
  profile: SavedProfile,
  date = todayKey(),
): DayRecord {
  const found = profile.days.find((d) => d.date === date)
  if (found) return found
  return { date, title: '', body: '', turns: [] }
}

/** 追加一条对话到当日记录 */
export function appendTurn(
  profile: SavedProfile,
  turn: ChatTurn,
  date = todayKey(),
): SavedProfile {
  const day = ensureDay(profile, date)
  const nextDay: DayRecord = { ...day, turns: [...day.turns, turn] }
  const days = profile.days.filter((d) => d.date !== date)
  return {
    ...profile,
    days: [...days, nextDay].sort((a, b) => a.date.localeCompare(b.date)),
  }
}

/** 记录当日运势快照 */
export function recordFortune(
  profile: SavedProfile,
  date: string,
  title: string,
  body: string,
): SavedProfile {
  const day = ensureDay(profile, date)
  const nextDay: DayRecord = { ...day, title, body }
  const days = profile.days.filter((d) => d.date !== date)
  return {
    ...profile,
    days: [...days, nextDay].sort((a, b) => a.date.localeCompare(b.date)),
  }
}

/** 从存档中恢复 MBTI */
export function restoreMbti(profile: SavedProfile): MbtiProfile | null {
  return profile.mbti
}
