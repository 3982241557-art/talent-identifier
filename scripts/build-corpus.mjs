/* ============================================================
 *  语料库 JS 模块生成器（v15.2）
 * ============================================================
 *
 *  【为什么需要它】
 *  Cloudflare Pages Functions 跑在 Workers 运行时，
 *  需要把语料库 JSON **静态引入**进 bundle（没有 node:fs）。
 *
 *  直接 `import data from './x.json'` 在不同运行时有坑：
 *    · Node 需要 import attribute（`with { type: 'json' }`）
 *    · esbuild / wrangler 对 JSON import 的支持随版本变化
 *    · 各家打包器行为不一致
 *
 *  所以最稳的做法：**把 JSON 编译成纯 JS 模块**。
 *  纯 ESM 的默认导出在任何运行时都不会出问题。
 *
 *  【单一真相源】
 *  真相源始终是 `src/data/archetypes_corpus.json`。
 *  这个生成的 .mjs 是**产物**，由 build 脚本自动重新生成，
 *  不允许手工编辑。
 *
 *  【自动重建】
 *  `npm run build` 会先执行本脚本，
 *  所以改了 JSON 之后构建产物自动跟上，不会出现漂移。
 * ============================================================ */

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')

const SRC = resolve(root, 'src', 'data', 'archetypes_corpus.json')
const OUT = resolve(root, 'src', 'data', 'archetypes_corpus.data.mjs')

const raw = readFileSync(SRC, 'utf-8')
const data = JSON.parse(raw)

const header = `/* ============================================================
 *  语料库数据（**自动生成，请勿手工编辑**）
 * ============================================================
 *
 *  由 scripts/build-corpus.mjs 从 src/data/archetypes_corpus.json 生成。
 *  修改内容请改 JSON 源文件，然后重新构建。
 *
 *  生成原因：Cloudflare Workers 运行时需要静态引入 JSON，
 *  而纯 ESM 模块在所有运行时都能安全加载。
 * ============================================================ */

`

writeFileSync(
  OUT,
  `${header}export default ${JSON.stringify(data, null, 2)}\n`,
  'utf-8',
)

console.log(
  `[build-corpus] 已生成 ${OUT.replace(root + '/', '')}（${Object.keys(data.domains ?? {}).length} 个领域）`,
)
