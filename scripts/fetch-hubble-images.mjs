/**
 * 哈勃生日深空图库 —— 图片本地化脚本（v17.0）
 *
 * ============================================================
 *  为什么要下载到本地
 * ============================================================
 *  NASA 的图片托管在 images-assets.nasa.gov，
 *  国内访问常常 20s+ 甚至直接超时 —— 表现为「裂图」。
 *
 *  用户的核心要求是「国内网络 100% 秒开不裂图」，
 *  所以这里把 38 张真实影像下载到 public/hubble/，
 *  随构建产物一起部署 —— CDN 边缘节点直接命中，零延迟。
 *
 *  每个天体存 2 个尺寸：
 *    · medium — 全屏展示
 *    · small  — 缩略 / 预载占位
 *
 * 运行：node scripts/fetch-hubble-images.mjs
 * ============================================================
 */

import { mkdirSync, existsSync, writeFileSync, statSync, readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = resolve(ROOT, 'public/hubble')
const DATA_FILE = resolve(ROOT, 'src/data/hubbleBirthday.ts')

/** 并发下载数 —— 太高会被 NASA 限流 */
const CONCURRENCY = 4

async function download(url, dest) {
  if (existsSync(dest)) {
    const st = statSync(dest)
    if (st.size > 1024) return 'skip'
  }
  const res = await fetch(url, {
    signal: AbortSignal.timeout(45000),
    headers: { 'User-Agent': 'LifeScript/17.0 (educational project)' },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length < 1024) throw new Error(`too small: ${buf.length}B`)
  writeFileSync(dest, buf)
  return `${(buf.length / 1024).toFixed(0)}KB`
}

/** 从生成好的数据表里读出所有唯一天体 */
function readUniqueTargets() {
  const src = readFileSync(DATA_FILE, 'utf-8')
  const seen = new Map()
  const re = /"id":\s*"([^"]+)",[\s\S]*?"image":\s*"([^"]*)"/g
  let m
  while ((m = re.exec(src)) !== null) {
    const [, id, image] = m
    if (!seen.has(id) && image) seen.set(id, image)
  }
  return seen
}

async function main() {
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })

  const targets = readUniqueTargets()
  console.log(`[hubble-img] 待处理 ${targets.size} 个天体`)

  const entries = Array.from(targets.entries())
  const results = new Map()

  for (let i = 0; i < entries.length; i += CONCURRENCY) {
    const batch = entries.slice(i, i + CONCURRENCY)
    await Promise.all(
      batch.map(async ([id, baseUrl]) => {
        // baseUrl 形如 https://.../XXX~medium.jpg
        const stem = baseUrl.replace(/~[^/]+$/, '')
        /*
         * 尺寸回退链：medium → small → large → orig。
         * 每个 NASA 天体提供的尺寸不一样，
         * 请求一个不存在的尺寸会得到 403（而不是 404）。
         */
        const trySizes = async (sizes, dest) => {
          for (const sz of sizes) {
            try {
              return await download(`${stem}~${sz}.jpg`, dest)
            } catch {
              /* 换下一个尺寸 */
            }
          }
          throw new Error('all sizes failed')
        }
        try {
          const medium = await trySizes(
            ['medium', 'small', 'large', 'orig'],
            resolve(OUT_DIR, `${id}.jpg`),
          )
          const thumb = await trySizes(
            ['small', 'medium', 'large', 'orig'],
            resolve(OUT_DIR, `${id}-thumb.jpg`),
          )
          results.set(id, {
            medium: `/hubble/${id}.jpg`,
            thumb: `/hubble/${id}-thumb.jpg`,
          })
          console.log(`  ✓ ${id}  medium=${medium}  thumb=${thumb}`)
        } catch (e) {
          console.log(`  ✗ ${id}  ${e.message}`)
        }
      }),
    )
  }

  /*
   * 把本地路径写回数据表 —— 前端优先用本地路径，
   * 本地缺失时自动回退到 NASA 直链（外网用户仍可看高清）。
   *
   * 注意：366 条记录里同一个 id 会出现约 10 次，
   * 所以必须**逐条**替换，不能只改第一条。
   * 这里用全局正则 + 回调，匹配每条 entry 的 id 与它自己的 image 字段。
   */
  let src = readFileSync(DATA_FILE, 'utf-8')
  let patched = 0
  src = src.replace(
    /"id":\s*"([^"]+)",([\s\S]*?)"image":\s*"[^"]*"/g,
    (match, id, mid) => {
      const local = results.get(id)
      if (!local) return match
      patched++
      return `"id": ${JSON.stringify(id)},${mid}"image": ${JSON.stringify(local.medium)}`
    },
  )
  writeFileSync(DATA_FILE, src, 'utf-8')
  console.log(`[hubble-img] ✓ 写回 ${patched} 条记录（本地路径）`)
  console.log(`[hubble-img] ✓ 输出目录 ${OUT_DIR}`)
}

main().catch((e) => {
  console.error('[hubble-img] 失败：', e)
  process.exit(1)
})
