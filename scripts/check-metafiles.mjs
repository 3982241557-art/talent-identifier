/* ============================================================
 *  _headers / _redirects 格式校验（v15.7）
 * ============================================================
 *
 *  【为什么需要】
 *  v15.7 的部署失败：
 *
 *    [ERROR] Invalid _headers configuration:
 *            Line 2: Expected a colon-separated header pair
 *            Line 3: Expected a colon-separated header pair
 *            Line 4: Expected a colon-separated header pair [code: 10324]
 *
 *  根因：public/_headers 用了 C 风格块注释（斜杠星号 ... 星号斜杠）。
 *
 *  Cloudflare 的 _headers 解析器**只认 # 开头的单行注释**，
 *  块注释的开头标记会被当成一条 header 规则去解析，
 *  于是报 "Expected a colon-separated header pair"。
 *
 *  更隐蔽的是：那些被注释掉的 header 规则其实**从未生效过** ——
 *  也就是说安全头（X-Frame-Options 等）一直是缺失的。
 *
 *  【本脚本做什么】
 *  复刻 Cloudflare 的解析规则：
 *    · 空行与 # 开头的行 → 跳过
 *    · 不以空白开头的行   → 新规则块（URL 模式）
 *    · 以空白开头的行     → header 行，必须是 "Name: Value"
 *    · 规则块内出现非 header 行 → 报错
 *
 *  同时校验 _redirects（格式：source destination [code]）。
 * ============================================================ */

import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')

let pass = 0
let fail = 0
function check(name, ok, detail = '') {
  if (ok) {
    pass++
    console.log(`  ✓ ${name}`)
  } else {
    fail++
    console.log(`  ✗ ${name}${detail ? `\n      → ${detail}` : ''}`)
  }
}

/* ============================================================
 *  _headers 解析器（复刻 Cloudflare 行为）
 * ============================================================ */

function parseHeaders(src) {
  const errors = []
  const rules = []
  const lines = src.split(/\r?\n/)

  let inRule = false

  lines.forEach((raw, i) => {
    const lineNo = i + 1

    /* 空行 */
    if (!raw.trim()) {
      inRule = false
      return
    }

    /* # 开头的注释 —— Cloudflare 唯一支持的注释形式 */
    if (raw.trimStart().startsWith('#')) {
      return
    }

    /* 缩进行 = header 行，必须属于某个规则块 */
    if (/^\s/.test(raw)) {
      if (!inRule) {
        errors.push(
          `Line ${lineNo}: 缩进的 header 行前面没有规则块（缺少 URL 模式行）`,
        )
        return
      }
      const trimmed = raw.trim()
      /* 关键：必须有冒号分隔的 header 名和值 */
      if (!/^[^:\s]+:\s*.+$/.test(trimmed)) {
        errors.push(`Line ${lineNo}: Expected a colon-separated header pair`)
      }
      return
    }

    /* 非缩进行 = 新规则块起始（URL 模式） */
    inRule = true
    const pattern = raw.trim()
    if (!pattern) {
      errors.push(`Line ${lineNo}: 规则块缺少 URL 模式`)
    } else if (!/^(\/|https?:\/\/)/.test(pattern)) {
      errors.push(
        `Line ${lineNo}: URL 模式 "${pattern}" 无效（应以 / 或 http(s):// 开头）`,
      )
    }
    rules.push({ line: lineNo, pattern })
  })

  return { errors, rules }
}

/* ============================================================
 *  校验 _headers
 * ============================================================ */
console.log('\n【_headers / _redirects 格式校验】\n')

const headersPath = resolve(root, 'public', '_headers')
if (!existsSync(headersPath)) {
  check('public/_headers 存在', false, '缺失 —— 不会有任何自定义响应头')
} else {
  const src = readFileSync(headersPath, 'utf-8')
  const { errors, rules } = parseHeaders(src)

  check(
    'public/_headers 无格式错误',
    errors.length === 0,
    errors.join('\n      '),
  )

  check(
    `public/_headers 解析出 ${rules.length} 条规则`,
    rules.length > 0,
    '一条规则都没有 —— 响应头完全没生效',
  )

  /*
   * 块注释是本次踩坑的核心 —— 显式检查。
   *
   * 判定方式：出现「斜杠 + 星号」且**后面不紧跟合法的 URL 模式字符**。
   * 因为 /assets/* 里的星号是通配符，不是注释。
   * 简化判断：整行（去掉缩进）以斜杠星号开头 = 块注释。
   */
  /*
   * 真正的块注释特征是「星号斜杠」结尾 —— /assets/* 这类通配符不是。
   * 所以：整行去掉缩进后，若以斜杠星号开头**且**以星号斜杠结尾 → 块注释。
   */
  const blockCommentLines = src
    .split(/\r?\n/)
    .map((l, i) => ({ l, n: i + 1 }))
    .filter(({ l }) => {
      const t = l.trim()
      return t.startsWith('/*') && t.endsWith('*/')
    })

  check(
    'public/_headers 不含 C 风格块注释（Cloudflare 只认 # 注释）',
    blockCommentLines.length === 0,
    blockCommentLines
      .map(({ l, n }) => `Line ${n}: ${l.trim()}`)
      .join('\n      '),
  )

  /* 安全头必须真正生效（之前全被注释掉了） */
  for (const h of [
    'X-Content-Type-Options',
    'X-Frame-Options',
    'Referrer-Policy',
    'Permissions-Policy',
  ]) {
    check(
      `public/_headers 生效了 ${h}`,
      new RegExp(`^\\s*${h}:`, 'm').test(src),
      '该安全头被注释掉了 —— 线上从未生效',
    )
  }

  check(
    'public/_headers 为 /assets/* 设置了长期缓存',
    /^\/assets\/\*/m.test(src) && /immutable/.test(src),
  )

  check(
    'public/_headers 为 / 设置了 no-cache',
    /^\/$/m.test(src) && /no-cache/.test(src),
  )
}

/* ============================================================
 *  校验 _redirects
 * ============================================================ */
const redirectsPath = resolve(root, 'public', '_redirects')
if (existsSync(redirectsPath)) {
  const src = readFileSync(redirectsPath, 'utf-8')
  const errors = []
  src.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim()
    if (!line || line.startsWith('#')) return
    const parts = line.split(/\s+/)
    if (parts.length < 2) {
      errors.push(`Line ${i + 1}: 重定向规则至少需要 source 与 destination`)
    }
    if (parts.length > 3) {
      errors.push(`Line ${i + 1}: 重定向规则最多三段（source destination code）`)
    }
    if (parts[2] && !/^\d{3}$/.test(parts[2])) {
      errors.push(`Line ${i + 1}: 状态码必须是三位数字`)
    }
  })
  check(
    'public/_redirects 无格式错误',
    errors.length === 0,
    errors.join('\n      '),
  )
} else {
  console.log('  ○ 未使用 _redirects（可选）')
}

/* ============================================================
 *  校验 dist 里的副本（构建产物才是真正上传的内容）
 * ============================================================ */
const distHeaders = resolve(root, 'dist', '_headers')
if (existsSync(distHeaders)) {
  const { errors } = parseHeaders(readFileSync(distHeaders, 'utf-8'))
  check(
    'dist/_headers 无格式错误（这是真正上传的文件）',
    errors.length === 0,
    errors.join('\n      '),
  )
} else {
  console.log('  ○ dist/_headers 尚未生成（先执行 npm run build）')
}

/* ============================================================
 *  汇总
 * ============================================================ */
console.log(`\n${'='.repeat(50)}`)
console.log(`通过 ${pass} 项，失败 ${fail} 项`)
console.log('='.repeat(50))

if (fail > 0) {
  console.error('\n[check-metafiles] 元文件格式有问题 —— 部署会被 Cloudflare 拒绝。')
  process.exit(1)
}
console.log('\n[check-metafiles] 格式全部正确 ✓')
