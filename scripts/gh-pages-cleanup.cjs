/* ============================================================
 *  gh-pages 发布前的清理钩子（v18.0）
 * ============================================================
 *
 *  【为什么需要这个钩子】
 *  gh-pages 的工作流程是：
 *    1. clone 整个仓库（工作区里带着 main 的全部文件）
 *    2. `git rm -r .` 清空已跟踪的文件
 *    3. 把 dist/ 的内容拷进工作区
 *    4. `git add .` 把**所有**文件加进索引
 *
 *  第 2 步只删「已跟踪」的文件；
 *  而 .gitignore / .dockerignore / .env.example 这类文件
 *  在第 3 步之后仍然**躺在工作区里没被跟踪**（已被 rm 掉），
 *  第 4 步的 `git add .` 会把它们**重新加回来**。
 *
 *  结果就是 gh-pages 分支上混进了源码树的碎片：
 *    .gitignore / .dockerignore / .env.example
 *    .node-version / .nvmrc / .oxlintrc.json
 *    server/.env.example
 *
 *  这些文件跟静态站点毫无关系，
 *  甚至 server/.env.example 会让人误以为线上带着后端配置。
 *
 *  【解法】
 *  gh-pages 提供了 `--before-add <file>`：
 *  在执行 `git add` **之前**调用该文件导出的函数。
 *  我们在钩子里把「非 dist 产物」的文件全部删掉，
 *  让 `git add .` 只会加到站点真正需要的文件。
 *
 *  【为什么用 .cjs】
 *  gh-pages 用 `require()` 加载钩子文件，
 *  .mjs 走 require 会抛 ERR_REQUIRE_ESM。
 * ============================================================ */

const { existsSync, readdirSync, statSync, rmSync } = require('node:fs')
const { join, relative } = require('node:path')

/**
 * 站点必须保留的文件/目录（dist 产物 + Pages 运行时必需）。
 * 其它一律删除。
 */
const KEEP = new Set([
  '.nojekyll',
  'index.html',
  'assets',
  'hubble',
  'favicon.png',
  'avatar-1.png',
  'avatar-2.png',
  'avatar-3.png',
  'avatar-4.png',
])

/**
 * gh-pages 的 --before-add 钩子。
 *
 * gh-pages 会以 `beforeAdd(git)` 调用本函数，
 * 其中 git.cwd 是 gh-pages 的临时工作区根目录。
 */
function beforeAdd(git) {
  const ROOT = (git && git.cwd) || process.cwd()

  /** 递归收集目录下所有文件 */
  const walk = (dir) => {
    const out = []
    for (const entry of readdirSync(dir)) {
      if (entry === '.git') continue
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) out.push(...walk(full))
      else out.push(full)
    }
    return out
  }

  if (!existsSync(ROOT)) return

  for (const file of walk(ROOT)) {
    const rel = relative(ROOT, file)
    const top = rel.split('/')[0]
    if (KEEP.has(rel) || KEEP.has(top)) continue
    rmSync(file, { force: true })
  }
}

module.exports = beforeAdd
module.exports.default = beforeAdd
module.exports.beforeAdd = beforeAdd
