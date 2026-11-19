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

/*
 * 规则一之二：生硬词汇 + 空洞抽象词。
 *
 * 这些词单看都正常，连成句子就变成「AI 在讲话」——
 * 没有具体画面，用户读完不知道该干嘛。
 */
const BANNED_WORDS = [
  { w: '发力方式', label: '发力方式' },
  { w: '发力点', label: '发力点' },
  { w: '抓手', label: '抓手' },
  { w: '天花板', label: '天花板' },
  { w: '破圈', label: '破圈' },
  { w: '价值主张', label: '价值主张' },
  { w: '底层驱动力', label: '底层驱动力' },
  { w: '能量场', label: '能量场' },
  { w: '赋能', label: '赋能' },
  { w: '颗粒度', label: '颗粒度' },
  { w: '底层逻辑', label: '底层逻辑' },
  { w: '开启探索', label: '开启探索' },
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

/* ---- 1.2 生硬词汇 / 空洞抽象词 ---- */
{
  /*
   * 扫描 src/ 下的**用户可见文案**。
   *
   * server/ 与 functions/ 里这些词出现在「禁令清单」中（必须出现），
   * 所以只扫 src/。
   * src/ 里的 sanitize/copy 类文件带有词级替换表 ——
   * 那些行含有正则特征（`/…/g`），一并跳过。
   */
  const visibleFiles = files.filter((f) => f.includes(`${root}/src/`))
  const hits = []
  for (const f of visibleFiles) {
    const src = readFileSync(f, 'utf-8')
    src.split(/\r?\n/).forEach((line, i) => {
      const trimmed = line.trim()
      if (
        trimmed.startsWith('*') ||
        trimmed.startsWith('//') ||
        trimmed.startsWith('/*')
      ) {
        return
      }
      /* 词级替换表 / 词表声明 —— 跳过 */
      if (/\/g[,\s]/.test(line) || /\]\s*,\s*$/.test(trimmed)) return
      for (const { w, label } of BANNED_WORDS) {
        if (line.includes(w)) {
          hits.push(
            `${relative(root, f)}:${i + 1}  [${label}]  ${trimmed.slice(0, 80)}`,
          )
        }
      }
    })
  }
  check(
    `生硬词汇 / 空洞抽象词（发力方式、抓手、天花板…）`,
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
 *  规则七（v17.0）：undefined 脏模板零残留
 * ============================================================
 *
 *  【历史事故】
 *  页面底部曾出现连续 4 行：
 *    undefined正往外走 —— 你往上走的那条路...
 *
 *  根因：`base[planetCn] ?? planetCn` 在 planetCn 为 undefined 时，
 *  把 undefined 原样拼进了模板字符串。
 *
 *  现在从两个层面拦：
 *  1. 源码里不允许再出现这些脏文本；
 *  2. 关键函数里必须有空值短路。
 * ============================================================ */

{
  /* ---- 7.1 脏模板文本残留 ---- */
  const DIRTY_TEMPLATES = [
    'undefined正往外走',
    'undefined在往回收',
    'undefined ——',
    '${undefined}',
    'null正往外走',
  ]

  const dirtyHits = []
  for (const f of files) {
    const src = readFileSync(f, 'utf-8')
    src.split(/\r?\n/).forEach((line, i) => {
      /* 注释行不算 —— 注释里说明「这里曾经出过 undefined」不算违规 */
      const trimmed = line.trim()
      if (
        trimmed.startsWith('*') ||
        trimmed.startsWith('//') ||
        trimmed.startsWith('/*')
      ) {
        return
      }
      for (const dirty of DIRTY_TEMPLATES) {
        if (line.includes(dirty)) {
          dirtyHits.push(
            `${relative(root, f)}:${i + 1}  [脏模板]  ${line.trim().slice(0, 80)}`,
          )
        }
      }
    })
  }
  check(
    '脏模板残留（undefined正往外走 等）',
    dirtyHits.length === 0,
    dirtyHits.slice(0, 12).join('\n      '),
  )

  /* ---- 7.2 planetPlain 必须有空值短路 ---- */
  const dashPath = resolve(root, 'src', 'components', 'stages', 'DashboardStage.tsx')
  if (existsSync(dashPath)) {
    const dash = readFileSync(dashPath, 'utf-8')
    const fnMatch = dash.match(
      /function planetPlain\([\s\S]*?\n\}/,
    )
    const fn = fnMatch?.[0] ?? ''
    check(
      'planetPlain() 存在且有 undefined 短路',
      fn.length > 0 && /if\s*\(\s*!\s*planetCn\s*\)\s*return\s*''/.test(fn),
      'planetPlain 必须先判空再返回 —— 否则 undefined 会被拼进模板字符串',
    )
  }
}

/* ============================================================
 *  规则八（v17.0）：今日运势彻底纯粹化
 * ============================================================ */

{
  const cardPath = resolve(root, 'src', 'components', 'dashboard', 'FortuneCard.tsx')
  const card = readFileSync(cardPath, 'utf-8')
  check(
    'FortuneScope 只剩 day',
    /export type FortuneScope\s*=\s*'day'/.test(card),
    "FortuneScope 必须收窄为 'day' —— 年度/月度运势已下线",
  )
  check(
    'SCOPE_META 只剩 day 一项',
    !/label:\s*'年度运势'/.test(card) && !/label:\s*'月度运势'/.test(card),
    'SCOPE_META 里还残留年度 / 月度运势',
  )

  const dashPath = resolve(root, 'src', 'components', 'stages', 'DashboardStage.tsx')
  const dash = readFileSync(dashPath, 'utf-8')
  check(
    '前端不再渲染年度 / 月度运势面板',
    !/fortunes\.year/.test(dash) && !/fortunes\.month/.test(dash),
    'DashboardStage 还在渲染 fortunes.year / fortunes.month',
  )
  check(
    '只拉取今日运势',
    /loadFortune\('day'\)/.test(dash),
    "打开运势面板时只应调用 loadFortune('day')",
  )
}

/* ============================================================
 *  规则九（v17.0）：NASA 生日星空 / 烦恼粉碎 / 优势挖掘 / 新手指引 全部挂载
 * ============================================================ */

{
  /* ---- 9.1 组件文件存在 ---- */
  const REQUIRED_COMPONENTS = [
    ['src', 'data', 'hubbleBirthday.ts'],
    ['src', 'components', 'stages', 'BirthSkyStage.tsx'],
    ['src', 'components', 'common', 'AstroGlyphs.tsx'],
    ['src', 'components', 'common', 'StarlightText.tsx'],
    ['src', 'components', 'dashboard', 'SpotlightTutorial.tsx'],
    ['src', 'components', 'dashboard', 'AdvantagePractice.tsx'],
    ['src', 'components', 'dashboard', 'CareerAdvice.tsx'],
    ['src', 'lib', 'advantage.ts'],
  ]
  for (const segs of REQUIRED_COMPONENTS) {
    const p = resolve(root, ...segs)
    check(`组件存在 ${segs.join('/')}`, existsSync(p), '文件缺失')
  }

  /* ---- 9.2 366 天映射完整 ---- */
  const hbPath = resolve(root, 'src', 'data', 'hubbleBirthday.ts')
  if (existsSync(hbPath)) {
    const hb = readFileSync(hbPath, 'utf-8')
    const dayCount = (hb.match(/["']?month["']?\s*:\s*\d+/g) ?? []).length
    check(
      `哈勃生日映射覆盖 366 天（当前 ${dayCount}）`,
      dayCount >= 366,
      '366 天每天都要有图 —— 少一天就有用户看到裂图',
    )
  }

  /* ---- 9.3 本地图片资源存在 ---- */
  const hubbleDir = resolve(root, 'public', 'hubble')
  const jpgs = existsSync(hubbleDir)
    ? readdirSync(hubbleDir).filter((f) => f.endsWith('.jpg'))
    : []
  check(
    `本地哈勃图片资源已就位（${jpgs.length} 张）`,
    jpgs.length > 0,
    'public/hubble 下没有 jpg —— 线上会裂图',
  )

  /* ---- 9.4 应用入口已挂载 ---- */
  const appPath = resolve(root, 'src', 'App.tsx')
  const app = readFileSync(appPath, 'utf-8')
  check('App.tsx 挂载 BirthSkyStage', app.includes('BirthSkyStage'), '生日星空未接入路由')
  check("App.tsx 存在 'birthsky' 路由", app.includes("'birthsky'"), "缺少 birthsky 路由")

  const dashPath = resolve(root, 'src', 'components', 'stages', 'DashboardStage.tsx')
  const dash = readFileSync(dashPath, 'utf-8')
  check(
    'DashboardStage 挂载 SpotlightTutorial',
    dash.includes('SpotlightTutorial'),
    '游戏化新手指引未挂载',
  )
  check(
    'DashboardStage 挂载 AdvantagePractice',
    dash.includes('AdvantagePractice'),
    '优势挖掘实践未挂载',
  )
  check(
    'DashboardStage 挂载 CareerAdvice',
    dash.includes('CareerAdvice'),
    'AI 职位建议未挂载',
  )
  check(
    'DashboardStage 常驻「出生那天的星空 / 丢掉烦恼」入口',
    /出生那天的星空|丢掉烦恼/.test(dash),
    '缺少常驻入口按钮',
  )

  /* ---- 9.5 烦恼粉碎舱动效存在 ---- */
  const birthPath = resolve(root, 'src', 'components', 'stages', 'BirthSkyStage.tsx')
  if (existsSync(birthPath)) {
    const birth = readFileSync(birthPath, 'utf-8')
    check(
      'BirthSkyStage 含「丢进宇宙」粒子化动效',
      /丢进宇宙/.test(birth) && /粒子|particle|Particle/.test(birth),
      '烦恼粉碎舱的核心交互缺失',
    )
    check(
      'BirthSkyStage 含 Ken Burns 缩放推进',
      /kenburns|kenBurns|KenBurns|scale/.test(birth),
      '缺少电影感缩放推进',
    )
  }

  /* ---- 9.6 优势链条五节点 ---- */
  const advPath = resolve(root, 'src', 'lib', 'advantage.ts')
  if (existsSync(advPath)) {
    const adv = readFileSync(advPath, 'utf-8')
    for (const node of ['识别优势', '优势与技能发展', '积极且有意义的体验', '提供发展机会', '积极的期望']) {
      check(`优势链条节点「${node}」已定义`, adv.includes(node), '节点缺失')
    }
  }

  /* ---- 9.7 后端 AI 职位建议接口 ---- */
  const handler = readFileSync(
    resolve(root, 'functions', '_lib', 'api-handler.js'),
    'utf-8',
  )
  check(
    '后端存在 /api/career-advice 路由',
    handler.includes('/api/career-advice'),
    'AI 职位建议接口缺失',
  )
  const serverApp = readFileSync(resolve(root, 'server', 'app.mjs'), 'utf-8')
  check(
    'server/app.mjs 存在 /api/career-advice 路由',
    serverApp.includes('/api/career-advice'),
    '本地服务端缺少该路由',
  )
}

/* ============================================================
 *  规则十（v17.0）：文字过渡单向状态锁
 * ============================================================ */

{
  const stPath = resolve(root, 'src', 'components', 'common', 'StarlightText.tsx')
  const st = readFileSync(stPath, 'utf-8')
  check(
    'StarlightText 采用单向状态锁',
    /entering/.test(st) && /exiting/.test(st) && /unmounted/.test(st),
    '缺少 entering → visible → exiting → unmounted 状态机',
  )
  check(
    'StarlightText 过渡时长 ≥ 1.4s',
    /1\.4/.test(st),
    '淡入淡出必须拉长到 1.4s',
  )
  const stCss = readFileSync(resolve(root, 'src', 'index.css'), 'utf-8')
  const stBlock = stCss.slice(
    stCss.indexOf('.starlight-enter'),
    stCss.indexOf('.starlight-exit') + 200,
  )
  check(
    'StarlightText 使用 cinematic 缓动',
    /cubic-bezier\(0\.22,\s*1,\s*0\.36,\s*1\)/.test(stBlock),
    '缓动函数应为 cubic-bezier(0.22, 1, 0.36, 1)',
  )
  check(
    'StarlightText 淡入淡出均为 1.4s',
    (stBlock.match(/1\.4s/g) ?? []).length >= 2,
    '进出都要 1.4s',
  )

  /* 全站居中 */
  const css = readFileSync(resolve(root, 'src', 'index.css'), 'utf-8')
  check('.screen-center 已定义', css.includes('.screen-center'), '缺少视口严格居中类')
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
