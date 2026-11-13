# 部署指南（v15.2 · Cloudflare Pages）

> 部署平台：**Cloudflare Pages**（静态资源 + Pages Functions）
> 部署方式：GitHub 仓库 push → Cloudflare 自动拉取 → 自动构建 → 自动发布
> 费用：免费额度足够个人项目使用

---

## 0. 架构前提（先读这段，能省掉 80% 的排查时间）

Cloudflare Pages = **静态资源 + Pages Functions（Workers 运行时）**，同一个域名：

```
浏览器  ──►  https://<你的项目>.pages.dev
              ├── /api/*  → Pages Function（functions/api/[[path]].js）
              │              └─ Express 应用逻辑 + DeepSeek + 星历引擎
              └── /*      → Vite 构建产物（dist/）
```

**关键点：**
- 前后端**同域同源** → 不需要 nginx、不需要反向代理、没有 CORS 预检
- 一次部署搞定，不需要拆两个项目

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
| Root directory | 留空（仓库根目录） |
| Environment variables | 留空（下一步单独配） |

> **Build command 说明**
> 仓库的 `package.json` 里 `build` 脚本是：
> ```
> node scripts/build-corpus.mjs && tsc -b && vite build
> ```
> 第一步会把语料库 JSON 编译成静态 ESM 模块（Workers 运行时无法读文件系统）。
> **不要**简化成 `vite build`，否则 Workers 端会因缺模块而报错。

### 步骤 3 · 配置环境变量（**必做**）

进入项目 → **Settings** → **Environment variables** → **Add variable**：

| Variable name | Value | Type |
|---|---|---|
| `DEEPSEEK_API_KEY` | `sk-你的真实密钥` | **Secret**（加密） |
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com` | Text |
| `DEEPSEEK_MODEL` | `deepseek-chat` | Text |

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
| 页面 404 | Build output directory 填错 | 必须是 `dist` |
| 构建报 `archetypes_corpus.data.mjs` 不存在 | Build command 被简化了 | 改回 `npm run build` |
| `/api/health` 404 | Functions 未启用 | 确认仓库里有 `functions/` 目录 |
| `/api/health` 返回 `placeholder: true` | 环境变量没配或没选 Secret | 控制台检查 `DEEPSEEK_API_KEY` |
| `/api/xxx` 返回一坨 HTML | `_routes.json` 被改动 | 必须是 `include: ["/api/*"], exclude: []` |
| AI 功能 503 | Key 格式错误 | 必须是 `sk-` 开头、16 位以上 |
| 修改代码后线上没变 | 提交没推上去 | `git push` 后 Cloudflare 自动重新部署 |

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
