# 部署指南（v15.6 · Cloudflare Workers + Assets）

> 部署平台：**Cloudflare Workers**（静态资源 + Worker 脚本）
>
> ⚠️ v15.6 起本项目使用 Workers 形态 —— Cloudflare 正在把 Pages
> 项目**自动迁移**到 Workers 平台，实测本项目的线上域名已经是
> `<worker名>.<账户ID>.workers.dev`（Pages 域名 DNS 根本不存在）。
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
main = "functions/_worker.js"
workers_dev = true
compatibility_date = "2025-01-01"
compatibility_flags = ["nodejs_compat"]

[assets]
directory = "./dist"
binding = "ASSETS"
not_found_handling = "single-page-application"
```

### ⚠️ workers_dev = true 是关键

Worker **默认不启用** workers.dev 路由，于是控制台显示
"workers.dev Disabled" / "No URLs enabled"，
线上访问返回 `HTTP 404` + `error code: 1042`。

显式设成 `true` 后，**每次部署都会自动开启该路由**，
不用再去控制台手动点 Enable。

> 若已经手动点过 Enable，仍建议保留这一行 ——
> 否则将来某次部署可能被路由设置覆盖回去。

### ⚠️ compatibility_date 必须在顶层

TOML 里一旦出现 `[assets]`，后面的键就都属于 assets 段了。
把 `compatibility_date` 写在 `[assets]` 之后会导致 wrangler 报
`A compatibility_date is required when uploading a Worker`。

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
| **Deploy command** | `node scripts/deploy.mjs` |
| Root directory | 留空（仓库根目录） |
| **Node version** | `22`（或留空 —— 仓库有 `.node-version` 会自动生效） |
| Environment variables | 留空（下一步单独配） |

> **Deploy command**：`node scripts/deploy.mjs`
>
> 这个脚本会真正执行 `npx wrangler deploy`（上传 Worker + 静态资源），
> 并在部署后**主动请求线上地址验证**：
>
> ```
> [deploy] ✓ 入口就位：functions/_worker.js
> [deploy] ✓ index.html 含挂载点与资源引用（9 个条目，390.6 KB）
> [deploy] 发布到 Cloudflare：npx wrangler deploy
> [deploy] 线上地址：https://talent-identifier.<账户ID>.workers.dev
> [deploy] ✓ 线上首页已返回我们的 index.html（946 字节）
> [deploy] ✓ /api/health 正常响应
> ```
>
> ⚠️ **绝对不要用「只校验就 exit 0」的占位脚本**
> （v15.5 的 deploy-stub 就是这么错的）：
> Cloudflare 看到 exit 0 就显示**绿色 Ready**，
> 但实际上**一个字节都没上传**，
> 线上一直保持着创建项目时的 **Hello World 模板**。
>
> 症状：构建全绿、状态 Ready，但页面空白、
> 且**所有路径**（`/`、`/api/health`、`/anything`）返回同样的 11 字节 "Hello world"。
>
> ❌ **不要**填 `npx wrangler pages deploy dist`（那是 Pages 的 Direct Upload 流程，需要 token）

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
https://talent-identifier.<你的账户ID>.workers.dev
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
| **绿色 Ready 但页面空白，所有路径返回 "Hello world"** | Deploy command 只做校验就 exit 0，实际没上传 | 填 `node scripts/deploy.mjs` |
| **Invalid _headers configuration: Expected a colon-separated header pair** | `public/_headers` 用了 `/* */` 块注释 | Cloudflare 只认 `#` 注释，见下 |
| **Missing entry-point to Worker script or to assets directory** | wrangler 没找到 `wrangler.toml`（cwd 不在仓库根） | 用 `node scripts/deploy.mjs`，它会显式传 `--cwd` |
| 页面 404 | Build output directory 填错 | 必须是 `dist` |
| 构建报 `archetypes_corpus.data.mjs` 不存在 | Build command 被简化了 | 改回 `npm run build` |
| `/api/health` 404 | Functions 未启用 | 确认仓库里有 `functions/` 目录 |
| `/api/health` 返回 `placeholder: true` | 环境变量没配或没选 Secret | 控制台检查 `DEEPSEEK_API_KEY` |
| `/api/xxx` 返回一坨 HTML | `_routes.json` 被改动 | 必须是 `include: ["/api/*"], exclude: []` |
| AI 功能 503 | Key 格式错误 | 必须是 `sk-` 开头、16 位以上 |
| 修改代码后线上没变 | 提交没推上去 | `git push` 后 Cloudflare 自动重新部署 |

---

## 5.3 专项：Missing entry-point to Worker script or to assets directory

> ```
> [ERROR] Missing entry-point to Worker script or to assets directory
>         - Specify an entry-point to your Worker script via the command line
>           (ex: `npx wrangler deploy src/index.ts`)
>         - Or add the following to your "wrangler.toml" file:
>           main = "src/index.ts"
> ```

### 根因：wrangler 只在当前工作目录找配置

这条报错极具迷惑性 —— 它建议你加 `main` 和 `[assets]`，
但**字段明明就在 `wrangler.toml` 里**。

真相是：**wrangler 只在当前工作目录查找配置文件，不会向上查找父目录。**

Cloudflare Workers Builds 的 Deploy command
**并不保证在仓库根目录执行**。
在那里执行时 wrangler 找不到 `wrangler.toml`，
于是认为「没有入口、没有 assets」。

本地对照实验：

| 场景 | 结果 |
|---|---|
| 仓库根执行 `npx wrangler deploy` | ✓ `Read 14 files from the assets directory` |
| **父目录执行** `npx wrangler deploy` | ✗ `Missing entry-point to Worker script or to assets directory` |
| 加 `--cwd <仓库根>` | ✓ 恢复正常 |

### 解决：部署脚本与 cwd 解耦

`scripts/deploy.mjs` 做了四件事：

1. **基于 `import.meta.url` 定位仓库根** —— 完全不依赖 cwd
2. **传 `--cwd <仓库根>`** —— 保证 wrangler 找得到配置文件
3. **命令行显式传 `--name` / `--assets` / `--compatibility-date`**
   —— 即使 toml 彻底读不到，部署依然能成功
4. **部署后主动验证线上响应** —— 检测是否仍是 Hello World 模板

```
[deploy] 仓库根目录：/private/tmp/cfy
[deploy] 当前工作目录：/
[deploy] （cwd 与仓库根不同 —— 将用 --cwd 显式指定）
[deploy] 发布到 Cloudflare：npx wrangler deploy --cwd /private/tmp/cfy --name talent-identifier --assets /private/tmp/cfy/dist --compatibility-date 2025-01-01
```

> ⚠️ **不要**把 Deploy command 写成裸的 `npx wrangler deploy` ——
> 它依赖 cwd 恰好是仓库根。填 `node scripts/deploy.mjs` 才是稳的。

---

## 5.4 专项：Invalid _headers configuration

> ```
> [ERROR] Invalid _headers configuration:
>         Line 2: Expected a colon-separated header pair
>         Line 3: Expected a colon-separated header pair [code: 10324]
> ```

### 根因

Cloudflare 的 `_headers` 解析器**只认 `#` 开头的单行注释**，
**不支持 C 风格块注释**。

块注释的开头标记会被当成一条 header 规则去解析，
而它没有冒号分隔的「名: 值」，于是报上面的错。

更隐蔽的是：**被注释掉的那些 header 规则其实从未生效过** ——
`X-Frame-Options`、`X-Content-Type-Options` 等安全头一直是缺失的。

### 正确格式

```
# 这是注释（用 #）
/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: SAMEORIGIN

/assets/*
  Cache-Control: public, max-age=31536000, immutable
```

规则结构：

```
<URL 模式>
  <Header 名>: <Header 值>
```

- 注释：`#` 单行
- URL 模式行：不缩进，以 `/` 或 `https://` 开头
- header 行：**缩进**，且必须有冒号

> ⚠️ 注意区分：
> 规则里的 `/*`（匹配所有路径）和 `/assets/*`（通配符）是**合法的 URL 模式**，
> 不是块注释。真正的块注释特征是**以 `*/` 结尾**。

### 防护

仓库里的 `npm run check:metafiles` 会复刻 Cloudflare 的解析规则做校验，
并**已在构建流程中自动执行**（`npm run build` 就会跑）。
格式不对会在构建阶段就红掉，不必等资产都传完才炸。

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
