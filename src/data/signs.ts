import type { SignMeta } from '../types'

/* ============================================================
 *  十二星座基础数据
 * ============================================================ */

type Row = [string, string, string, string, string, string, string, string]

const raw: Row[] = [
  ['aries', '白羊座', 'Aries', '♈', 'fire', 'cardinal', '火星', '冲劲'],
  ['taurus', '金牛座', 'Taurus', '♉', 'earth', 'fixed', '金星', '笃定'],
  ['gemini', '双子座', 'Gemini', '♊', 'air', 'mutable', '水星', '灵动'],
  ['cancer', '巨蟹座', 'Cancer', '♋', 'water', 'cardinal', '月亮', '庇护'],
  ['leo', '狮子座', 'Leo', '♌', 'fire', 'fixed', '太阳', '光华'],
  ['virgo', '处女座', 'Virgo', '♍', 'earth', 'mutable', '水星', '精细'],
  ['libra', '天秤座', 'Libra', '♎', 'air', 'cardinal', '金星', '权衡'],
  ['scorpio', '天蝎座', 'Scorpio', '♏', 'water', 'fixed', '冥王星', '洞察'],
  ['sagittarius', '射手座', 'Sagittarius', '♐', 'fire', 'mutable', '木星', '远行'],
  ['capricorn', '摩羯座', 'Capricorn', '♑', 'earth', 'cardinal', '土星', '承担'],
  ['aquarius', '水瓶座', 'Aquarius', '♒', 'air', 'fixed', '天王星', '疏离'],
  ['pisces', '双鱼座', 'Pisces', '♓', 'water', 'mutable', '海王星', '消融'],
]

export const SIGNS: SignMeta[] = raw.map(
  ([key, cn, en, glyph, element, modality, ruler, keyword]) => ({
    key,
    cn,
    en,
    glyph,
    element: element as SignMeta['element'],
    modality: modality as SignMeta['modality'],
    ruler,
    keyword,
  }),
)

export const SIGN_BY_KEY: Record<string, SignMeta> = Object.fromEntries(
  SIGNS.map((s) => [s.key, s]),
)

export const ELEMENT_CN: Record<SignMeta['element'], string> = {
  fire: '火',
  earth: '土',
  air: '风',
  water: '水',
}

export const MODALITY_CN: Record<SignMeta['modality'], string> = {
  cardinal: '基本',
  fixed: '固定',
  mutable: '变动',
}

/** 行星符号 */
export const PLANET_GLYPH: Record<string, string> = {
  sun: '☉',
  moon: '☽',
  mercury: '☿',
  venus: '♀',
  mars: '♂',
  jupiter: '♃',
  saturn: '♄',
  uranus: '♅',
  neptune: '♆',
  pluto: '♇',
}
