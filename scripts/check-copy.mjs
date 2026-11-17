/* ============================================================
 *  文案校验（v16.0）
 * ============================================================
 *
 *  【为什么要有】
 *  「彻底去书面化」这种要求，靠人肉 review 守不住 ——
 *  改 80 个文件之后，早晚有一句漏回来。
 *  所以必须**代码级拦截**：违反规则 → 构建直接红掉。
 *
 *  【三条硬规则】
 *  1. **零「不是…而是…」句式**
 *     包括：不是…而是 / 并非…而是 / 不在于…而在于 / 与其说…不如说
 *     扫描范围：src/ 与 functions/ 下的**所有文件**。
 *
 *  2. **零纯白背景**
 *     包括：#fff / #ffffff / #FFF / white / bg-white
 *     —— 全站必须是深空，容不得一张白纸。
 *     允许 rgba(255,255,255,x) 这种**半透明白**（那是玻璃高光，不是白底）。
 *
 *  3. **零书面黑字**
 *     --color-ink 不再是 #0a0a0a，
 *     主文字必须是星光白 #f4f6fa 或 rgba(244,246,250,x)。
 * ============================================================ */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { resolve, dirname, extname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')

let pass = 0
let fail = 0
const problems = []

function check(name, ok, detail = '') {
  if (ok) {
    pass++
    console.log(`  ✓ ${name}`)
  } else {
    fail++
    console.log(`  ✗ ${name}${detail ? `\n      → ${detail}` : ''}`)
    problems.push({ name, detail })
  }
}

/* ============================================================
 *  递归收集文件
 * ============================================================ */

const SCAN_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.css'])

function collect(dir, out = []) {
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) collect(full, out)
    else if (SCAN_EXT.has(extname(entry))) out.push(full)
  }
  return out
}

const files = [
  ...collect(resolve(root, 'src')),
  ...collect(resolve(root, 'functions')),
  ...collect(resolve(root, 'server')),
]

/* ============================================================
 *  规则一：禁用句式
 * ============================================================ */

const BANNED_SENTENCE = [
  { re: /不是[^，。！？；、\n]{0,30}[，,]\s*而是/, label: '不是…而是' },
  { re: /并非[^，。！？；、\n]{0,30}[，,]\s*而是/, label: '并非…而是' },
  { re: /不在于[^，。！？；、\n]{0,30}[，,]\s*而在于/, label: '不在于…而在于' },
  { re: /与其说[^，。！？；、\n]{0,30}[，,]\s*不如说/, label: '与其说…不如说' },

  /*
   * 变体一：只出现「不是…」，后半句用别的连接词
   *   「这不是结论，只是此刻的你。」
   *   这一类必须一起禁 —— 否则规则形同虚设。
   */
  { re: /不是[^，。！？；、\n]{0,30}[，,]\s*(?:而|只是|不过|反而|倒)/, label: '不是…只是/不过' },
  { re: /并不是[^，。！？；、\n]{0,30}[，,]\s*(?:而|只是|不过|反而|倒)/, label: '并不是…只是/不过' },
  { re: /不是[^，。！？；、\n]{0,30}[。.]\s*[^，。！？；、\n]{0,20}是/, label: '不是…。是…' },
]

console.log('\n【文案校验 · v16.0】\n')

/* ---- 1. 禁用句式 ---- */
{
  const hits = []
  for (const f of files) {
    const src = readFileSync(f, 'utf-8')
    const lines = src.split(/\r?\n/)
    lines.forEach((line, i) => {
      /* 注释行不算 —— 注释里说明规则不算违规 */
      const trimmed = line.trim()
      if (
        trimmed.startsWith('*') ||
        trimmed.startsWith('//') ||
        trimmed.startsWith('/*')
      ) {
        return
      }
      for (const { re, label } of BANNED_SENTENCE) {
        if (re.test(line)) {
          hits.push(
            `${relative(root, f)}:${i + 1}  [${label}]  ${line.trim().slice(0, 80)}`,
          )
        }
      }
    })
  }
  check(
    `禁用句式「不是…而是」等 —— 扫描 ${files.length} 个文件`,
    hits.length === 0,
    hits.slice(0, 12).join('\n      '),
  )
}

/* ============================================================
 *  规则二：纯白背景
 * ============================================================ */

{
  /* 允许的：rgba(255,255,255,x) —— 玻璃高光，不是白底 */
  /*
   * 只抓**实心白底**。
   *
   * 这些不算违规：
   *   bg-white/5      —— 半透明白，玻璃高光
   *   border-white/12 —— 半透明白描边
   *   rgba(255,255,255,0.1) —— 同理
   *
   * 这些算违规：
   *   bg-white        —— 实心白底
   *   #fff / #ffffff  —— 实心白
   *   'white'         —— CSS 关键字实心白
   */
  /*
   * 关键区分：**背景白** vs **前景白**。
   *
   * 背景白 = 一整块白纸 → 必须禁
   *   bg-white / background:#fff / bg-[#ffffff]
   *
   * 前景白 = 星星的点、图形的描边 → 没问题
   *   fill="#fff"（星星）、color:'#ffffff'（轨道线）
   *
   * 所以规则只盯「**背景**语义」的位置。
   */
  const WHITE_PATTERNS = [
    { re: /\bbg-white\b(?!\/)/, label: 'bg-white' },
    { re: /\bbg-white-\[?\d/, label: 'bg-white-N' },
    { re: /background(-color)?\s*:\s*#fff/i, label: 'background: #fff' },
    { re: /\bbg-\[#fff{3,6}\]/i, label: 'bg-[#ffffff]' },
    { re: /\bbg-\[rgb\(255[,\s]/i, label: 'bg-[rgb(255..)]' },
    { re: /["'`]white["'`]/, label: "'white'" },
  ]

  const hits = []
  for (const f of files) {
    const src = readFileSync(f, 'utf-8')
    const lines = src.split(/\r?\n/)
    lines.forEach((line, i) => {
      /* 跳过纯注释行 —— 注释里提一句「不能用 #fff」不算违规 */
      const trimmed = line.trim()
      if (
        trimmed.startsWith('*') ||
        trimmed.startsWith('//') ||
        trimmed.startsWith('/*') ||
        trimmed.startsWith('#')
      ) {
        return
      }
      /*
       * 白名单：这些上下文里出现白色是**合理的** ——
       *   · fill="#fff"       星星的本体
       *   · color:'#ffffff'  轨道线的颜色
       *   · stroke="#fff"    图形的描边
       * 这些是**前景**，不是背景。
       */
      const isForeground =
        /\bfill=/.test(line) ||
        /\bstroke=/.test(line) ||
        /\bcolor:\s*['"`]/.test(line) ||
        /\bbg-white\/\d/.test(line) ||
        /\bborder-white\/\d/.test(line) ||
        /\btext-white\b/.test(line)

      if (isForeground) return

      for (const { re, label } of WHITE_PATTERNS) {
        if (re.test(line)) {
          hits.push(
            `${relative(root, f)}:${i + 1}  [${label}]  ${trimmed.slice(0, 80)}`,
          )
        }
      }
    })
  }
  check(
    '纯白背景色（#fff / #ffffff / white / bg-white）',
    hits.length === 0,
    hits.slice(0, 12).join('\n      '),
  )
}

/* ============================================================
 *  规则三：主文字不再是黑色
 * ============================================================ */

{
  const cssPath = resolve(root, 'src', 'index.css')
  const css = readFileSync(cssPath, 'utf-8')

  /* --color-ink 必须是星光白系 */
  const inkMatch = css.match(/--color-ink:\s*([^;]+);/)
  const ink = inkMatch?.[1]?.trim() ?? ''
  const isLight =
    /^#f[0-9a-f]{2,5}$/i.test(ink) ||
    /^rgba\(2[0-9]{2},\s*2[0-9]{2},\s*2[0-9]{2}/.test(ink)
  check(
    `--color-ink 是星光白（当前: ${ink || '未定义'}）`,
    isLight,
    '主文字必须是 #f4f6fa 或 rgba(244,246,250,x) —— 全站没有黑字',
  )

  /* --color-paper 不能是纯白 */
  const paperMatch = css.match(/--color-paper:\s*([^;]+);/)
  const paper = paperMatch?.[1]?.trim() ?? ''
  check(
    `--color-paper 不是纯白（当前: ${paper || '未定义'}）`,
    !/^#fff(f)?$/i.test(paper),
    '初始态也是深空，--color-paper 应该是深空色',
  )
}

/* ============================================================
 *  规则四：深空玻璃样式库存在
 * ============================================================ */

{
  const css = readFileSync(resolve(root, 'src', 'index.css'), 'utf-8')
  for (const cls of ['.glass-panel', '.glass-panel-solid', '.btn-photon', '.btn-pulsar']) {
    check(
      `深空玻璃样式 ${cls} 已定义`,
      css.includes(cls),
      '缺少这个类 —— 容器会退回系统默认的白底',
    )
  }
}

/* ============================================================
 *  规则五：双版本组件与后端结构齐备
 * ============================================================ */

{
  const toggle = resolve(root, 'src', 'components', 'common', 'VersionToggle.tsx')
  check(
    'src/components/common/VersionToggle.tsx 存在',
    existsSync(toggle),
    '双版本切换组件缺失',
  )

  const handler = readFileSync(
    resolve(root, 'functions', '_lib', 'api-handler.js'),
    'utf-8',
  )
  for (const key of ['minimal', 'deep']) {
    check(
      `后端返回结构包含 ${key}`,
      handler.includes(key),
      `api-handler.js 应返回 ${key} 字段`,
    )
  }

  const prompt = readFileSync(resolve(root, 'server', 'prompt.mjs'), 'utf-8')
  for (const p of [
    'TALENT_DUAL_SYSTEM_PROMPT',
    'SOUL_DUAL_SYSTEM_PROMPT',
    'FORTUNE_DUAL_SYSTEM_PROMPT',
    'TAROT_DUAL_SYSTEM_PROMPT',
  ]) {
    check(
      `双版本 Prompt: ${p}`,
      prompt.includes(p),
      '缺失 —— 该模块没有双版本',
    )
  }
}

/* ============================================================
 *  规则六：净化器在返回前被调用
 * ============================================================ */

{
  const handler = readFileSync(
    resolve(root, 'functions', '_lib', 'api-handler.js'),
    'utf-8',
  )
  const scrubCalls = (handler.match(/scrub\(/g) ?? []).length
  check(
    `后端返回前调用了净化器（${scrubCalls} 处）`,
    scrubCalls >= 5,
    '每个 AI 输出都要过一遍 scrub()，不能只靠 Prompt',
  )

  const sanitizer = resolve(root, 'server', 'sanitize.mjs')
  check(
    'server/sanitize.mjs 存在',
    existsSync(sanitizer),
    '代码级兜底缺失',
  )
}

/* ============================================================
 *  汇总
 * ============================================================ */

console.log(`\n${'='.repeat(50)}`)
console.log(`通过 ${pass} 项，失败 ${fail} 项`)
console.log('='.repeat(50))

if (fail > 0) {
  console.error('\n[check-copy] 文案校验未通过：')
  for (const p of problems) console.error(`  · ${p.name}`)
  process.exit(1)
}
console.log('\n[check-copy] 全部通过 ✓')
