# 部署指南（v15.5 · Cloudflare Pages）

> 部署平台：**Cloudflare Pages**（静态资源 + Pages Functions）
> 部署方式：GitHub 仓库 push → Cloudflare 自动拉取 → 自动构建 → 自动发布
> 费用：免费额度足够个人项目使用

---

## 0. 架构前提（先读这段，能省掉 80% 的排查时间）

Cloudflare Workers + Assets = **一个 Worker 脚本 + 一份静态资源**，同一个域名：

```
浏览器  ──►  https://talent-identifier.<子域>.workers.dev
              ├── /api/*  → Worker（functions/_worker.js）
              │              └─ api-handler.js + DeepSeek + 星历引擎
              └── /*      → Workers Assets（dist/，边缘缓存）
```

**关键点：**
- 前后端**同域同源** → 不需要 nginx、不需要反向代理、没有 CORS 预检
- 一次部署搞定，不需要拆两个项目

### ⚠️ v15.5 · 关于 Deploy command 的重要说明

**Pages 项目里，Deploy command 必须留空（或用 `wrangler pages deploy`）。**

Cloudflare 会明确拒绝 Workers 命令：

```
[ERROR] It looks like you've run a Workers-specific command in a Pages project.
        For Pages, please run `wrangler pages deploy` instead.
```

这是平台层面的限制，**无法通过 wrangler.toml 绕过**。

反过来说，**wrangler.toml 里也不能有 `main` / `[assets]`** ——
那是 Workers 配置，一旦存在，Cloudflare 就会把项目按 Workers 解析，
Pages 的发布流程随即失败。

所以本项目采用**纯 Pages 形态**：

```toml
name = "talent-identifier"
pages_build_output_dir = "./dist"
```

> ⚠️ **绝对不要在 wrangler.toml 里写 `[build]` 段！**
>
> Pages 项目的 wrangler **不支持** `[build]`，一旦出现就会：
>
> ```
> [ERROR] Running configuration file validation for Pages:
>         - Configuration file for Pages projects does not support "build"
> [WARNING] ... missing the "pages_build_output_dir" field...
>           Ignoring configuration file for now.
> [ERROR] Missing Pages project name.
> ```
>
> 报错极具误导性 —— 它说「缺少 pages_build_output_dir」，
> 但那个字段明明就在文件里。真相是**整个配置文件被丢弃了**。

控制台对应设置：

| 字段 | 值 |
|---|---|
| Build command | `npm run build` |
| Build output directory | `dist` |
| **Deploy command** | **留空**（或 `npx wrangler pages deploy dist`） |

> **留空是 Cloudflare Pages Git 集成的正规用法** ——
> Pages 会自动用 Build output directory 发布，不需要任何 API token。
> 显式写 `wrangler pages deploy` 则需要配置 `CF_API_TOKEN`。

---

## 1. 前置条件

- GitHub 仓库：`https://github.com/3982241557-art/talent-identifier`（已推送）
- Cloudflare 账号（免费即可）
- DeepSeek API Key

---

## 2. 首次部署（浏览器操作）

### 步骤 1 · 创建项目

1. 打开 <https://dash.cloudflare.com> → 登录
2. 左侧 **Workers & Pages** → **Create application** → **Pages** → **Connect to Git**
3. 选择 **GitHub** → 授权 Cloudflare 访问你的仓库
   （私有仓库需要先在授权页面勾选 `talent-identifier`）
4. 选择 **`3982241557-art/talent-identifier`** 仓库 → **Begin setup**

### 步骤 2 · 填写构建设置

| 字段 | 填写内容 |
|---|---|
| Project name | `talent-identifier` |
| **Framework preset** | `None` |
| **Build command** | `npm run build` |
| **Build output directory** | `dist` |
| **Deploy command** | `node scripts/deploy-stub.mjs`（或留空） |
| Root directory | 留空（仓库根目录） |
| **Node version** | `22`（或留空 —— 仓库有 `.node-version` 会自动生效） |
| Environment variables | 留空（下一步单独配） |

> **Deploy command**
>
> 最省事是**留空** —— Pages 会自动发布 Build output directory。
>
> 若界面不允许清空，填 `node scripts/deploy-stub.mjs`：
> 它做一次幂等的发布前置校验然后 exit 0，
> 真正的上传仍由 Cloudflare 内部完成 —— **不需要任何 API token**。
>
> ❌ **不要**填 `npx wrangler deploy`（Workers 命令，Cloudflare 会直接拒绝）
> ❌ **不要**填 `npx wrangler pages deploy dist`（需要 CLOUDFLARE_API_TOKEN，
>    而 Git 集成的构建环境不会注入它 —— 官方默认注入的变量只有
>    `CI` / `CF_PAGES` / `CF_PAGES_COMMIT_SHA` / `CF_PAGES_BRANCH` / `CF_PAGES_URL`）

> **Build command 说明**
> 仓库的 `package.json` 里 `build` 脚本是：
> ```
> node scripts/cloud-build.mjs
> ```
> 它是**自愈式**构建器 —— 会自动检测并补装缺失的 devDependencies，
> 检查各处配置是否一致，最后校验产物是否真的生成。
>
> 详见下方「专项：Missing entry-point」章节。
>
> **不要**简化成 `vite build` —— 那样会跳过语料库模块生成，
> Workers 端会因缺模块而报错。

### 步骤 3 · 配置环境变量（**必做**）

进入项目 → **Settings** → **Environment variables** → **Add variable**：

| Variable name | Value | Type |
|---|---|---|
| `DEEPSEEK_API_KEY` | `sk-你的真实密钥` | **Secret**（加密） |
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com` | Text |
| `DEEPSEEK_MODEL` | `deepseek-chat` | Text |

> **Node 版本**
> 仓库已包含 `.node-version`（22.12.0）与 `.nvmrc`（22），
> Cloudflare 会自动读取并使用 Node 22。
> `wrangler` 与 `vite 8` 都硬性要求 Node ≥ 22.12.0，
> 若平台默认用了 Node 18/20，构建会在第一步就失败。

> ⚠️ **`DEEPSEEK_API_KEY` 必须选 `Secret` 类型**，不要用 `Plain text`。
> Secret 类型在 Cloudflare 后端加密存储，日志和控制台都不会明文显示。
>
> ⚠️ `server/.env` **不会**随代码上传（已被 `.gitignore` 排除），
> 所有密钥必须在控制台配置。这是刻意的安全设计。

### 步骤 4 · 部署

点 **Save and Deploy**。首次构建约 1-2 分钟（要装依赖 + 跑 TypeScript 检查）。

构建成功后控制台会显示你的域名：

```
https://talent-identifier.pages.dev
```

### 步骤 5 · 绑定自定义域名（可选）

**Workers & Pages** → 你的项目 → **Custom domains** → **Set up a custom domain**
→ 填入你的域名，按提示加 CNAME 记录。

---

## 3. 部署后验证

```bash
DOMAIN="https://talent-identifier.pages.dev"

# 1. 页面可访问
curl -sI "$DOMAIN" | head -1                    # 期望 HTTP/2 200

# 2. API 正常，且密钥已生效
curl -s "$DOMAIN/api/health"
# 期望 {"ok":true,"configured":true,"placeholder":false,...}

# 3. 真实星历可用
curl -s -X POST "$DOMAIN/api/chart" \
  -H 'Content-Type: application/json' \
  -d '{"date":"1995-06-15","time":"12:00","latitude":30.27,"longitude":120.15,"timezone":8}'
# 期望 {"source":"astronomy-engine","planets":[...],"ascendant":174.019,...}

# 4. 未知 API 返回 JSON 而不是 HTML
curl -s "$DOMAIN/api/nope" -X POST -H 'Content-Type: application/json' -d '{}'
# 期望 {"error":"接口不存在。","path":"/api/nope"}
```

**四个都过 = 部署成功。**

---

## 4. 本地复现（可选）

仓库自带完整的本地验证脚本，**不需要**部署就能确认一切正常：

```bash
npm install
npm run build

# 部署配置一致性检查（17 项）
npm run check:config

# 单元级验证：12 条路由 + 星历精度 + 语料一致性 + 输入校验
npm run verify:workers

# 部署级模拟：完整复刻 Pages 运行时（静态资源 + Functions 路由）
npm run simulate:pages

# 真实 Cloudflare 运行时（workerd）
npm run cf:dev
```

> `npm run cf:dev` 需要本地密钥。先创建 `.dev.vars`：
> ```
> DEEPSEEK_API_KEY="sk-你的真实密钥"
> ```
> `.dev.vars` 已在 `.gitignore` 中，不会入库。

---

## 5. 常见故障速查

| 现象 | 原因 | 处理 |
|---|---|---|
| **Missing entry-point to Worker script or to assets directory** | **构建阶段失败，dist/ 没生成** | 见下方专项说明 |
| **run a Workers-specific command in a Pages project** | Deploy command 填了 `npx wrangler deploy` | **改成留空**，或 `npx wrangler pages deploy dist` |
| 页面 404 | Build output directory 填错 | 必须是 `dist` |
| 构建报 `archetypes_corpus.data.mjs` 不存在 | Build command 被简化了 | 改回 `npm run build` |
| `/api/health` 404 | Functions 未启用 | 确认仓库里有 `functions/` 目录 |
| `/api/health` 返回 `placeholder: true` | 环境变量没配或没选 Secret | 控制台检查 `DEEPSEEK_API_KEY` |
| `/api/xxx` 返回一坨 HTML | `_routes.json` 被改动 | 必须是 `include: ["/api/*"], exclude: []` |
| AI 功能 503 | Key 格式错误 | 必须是 `sk-` 开头、16 位以上 |
| 修改代码后线上没变 | 提交没推上去 | `git push` 后 Cloudflare 自动重新部署 |

---

## 5.5 专项：Missing entry-point to Worker script or to assets directory

> 这条报错极具迷惑性 —— 它说「找不到入口或资源目录」，
> 但**根因几乎总在构建阶段**，跟入口文件本身无关。

### 真实根因

Cloudflare Pages 的构建环境默认设置 `NODE_ENV=production`：

```
NODE_ENV=production
      ↓
npm install / npm ci 跳过 devDependencies
      ↓
typescript 与 vite 没装上（node_modules/.bin/tsc 不存在）
      ↓
sh: tsc: command not found
      ↓
vite build 从未执行
      ↓
dist/ 目录根本没生成
      ↓
Cloudflare 找不到 assets directory
      ↓
[ERROR] Missing entry-point to Worker script or to assets directory
```

### 本仓库的应对（已内置）

`package.json` 的 build 脚本是自愈式的：

```json
"build": "node scripts/cloud-build.mjs"
```

`scripts/cloud-build.mjs` 会：

1. 检查 `tsc` / `vite` 是否可用
2. **缺失则自动 `npm install --include=dev` 补装**（`--include=dev` 会无视 NODE_ENV）
3. 跑 `scripts/check-config.mjs` 校验各处配置是否互相对得上
4. 生成语料库静态模块 → 类型检查 → Vite 构建
5. **校验 `dist/index.html` 真的产出**，不产出直接以非 0 退出码失败

所以无论控制台的 Build command 填
`npm run build`、`npm ci && npm run build` 还是别的组合，
都能走到同一条可靠路径。

### 三处输出目录必须一致

| 位置 | 配置项 | 值 |
|---|---|---|
| `vite.config.ts` | `build.outDir` | `'dist'` |
| `wrangler.toml` | `pages_build_output_dir` | `"./dist"` |
| Cloudflare 控制台 | Build output directory | `dist` |

仓库里的 `npm run check:config` 会一次性校验这三处（外加 14 项其他配置）。

### 如果仍然失败

打开 Cloudflare 的 **Build logs**，找第一处 `ERROR`（不要看最后一条）：

- 出现 `tsc: command not found` → devDependencies 没装上，
  把控制台的 Build command 改成 `npm install --include=dev && npm run build`
- 出现 `Cannot find module '.../archetypes_corpus.data.mjs'` → 构建命令被简化了，
  必须用完整的 `npm run build`
- 出现 `Functions build failed` → 看 Functions 目录，
  `functions/api/[[path]].js` 必须存在

---

## 6. 安全提醒

⚠️ **部署到公网后，任何拿到链接的人都能消耗你的 DeepSeek 额度。**

建议：
1. Cloudflare Pages 免费版自带基础防护；如需更强，可在 **Settings → Functions → Runtime** 调整
2. 不要把仓库改公开（保持 private）
3. 定期检查 DeepSeek 控制台用量
4. 怀疑被滥用时，直接在 Cloudflare 控制台改掉 `DEEPSEEK_API_KEY` 并重新部署

---

## 7. 后续发版

```bash
cd ~/Desktop/Life-Script-Web
git add -A
git commit -m "feat: 你的改动描述"
git push
```

→ Cloudflare 自动检测到 push → 自动重新构建部署 → 约 1-2 分钟后线上更新。

**无需手动触发部署。**
