# 部署指南（v15.1 · Git 触发式部署）

> 目标平台：**Zeabur**（或腾讯云 Webify 等 Node 容器平台）
> 部署方式：GitHub 仓库 push → 平台自动拉取 → 自动构建 → 自动发布

---

## 0. 架构前提（先读这段，能省掉 80% 的排查时间）

本项目是**单进程单端口**应用：

```
浏览器  ──►  同一个 Express 进程（端口由平台分配）
              ├── /api/*        → API 路由（12 条）
              └── /*            → dist/ 静态资源（SPA 兜底）
```

**不是**「前端一个服务 + 后端一个服务」。所以：
- 不需要 nginx、不需要反向代理、不需要配跨域
- 前后端天然同源，不存在 CORS 预检问题

---

## 1. 一次性准备

### 1.1 GitHub 授权（CLI 用）

```bash
export PATH="$HOME/.npm-global/bin:$PATH"
gh auth login
```

选 `GitHub.com` → `HTTPS` → 用浏览器完成授权。

### 1.2 创建仓库并推送

```bash
cd ~/Desktop/Life-Script-Web
gh repo create talent-identifier --private --source=. --remote=origin --push
```

> `--private` 建议先私有，验证通过后再改成公开。
> 公开仓库任何人 clone 都能看到源码（不含密钥，密钥已被 `.gitignore` 排除）。

### 1.3 在 Zeabur 控制台配置环境变量（**关键**）

`server/.env` **不会**随代码上传（已被 `.gitignore` 排除）。必须手动配置：

| 变量名 | 值 | 说明 |
|---|---|---|
| `DEEPSEEK_API_KEY` | `sk-...` | **必填**，你的 DeepSeek 密钥 |
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com` | 可选，默认值即可 |
| `DEEPSEEK_MODEL` | `deepseek-chat` | 可选，默认值即可 |

`PORT` 由平台自动注入，**不要**手动设置。

配置路径：Zeabur 项目 → Service → **Variables** → 添加变量。

---

## 2. 平台侧配置

### 方式 A：Zeabur（推荐，零 Dockerfile 负担）

1. 打开 <https://zeabur.com> → 新建项目
2. **Deploy New Service** → **GitHub**，选 `talent-identifier` 仓库
3. **检测到 `zeabur.yaml` 会自动识别**，无需手填命令：
   - Build: `npm install && npm run build`
   - Start: `npm start`
4. 添加环境变量 `DEEPSEEK_API_KEY`
5. 点 Deploy → 完成后在 **Domains** 里绑定域名

### 方式 B：腾讯云 Webify

- 源码仓库 → 选 GitHub 仓库
- 构建命令：`npm install && npm run build`
- 启动命令：`npm start`
- 环境变量：同 1.3

### 方式 C：Docker（任何平台）

仓库已含 `Dockerfile`（多阶段构建），平台识别 Dockerfile 即可。

---

## 3. 部署后验证

```bash
# 替换成你的域名
DOMAIN="https://talent-identifier-xxxx.zeabur.app"

# 1. 页面可访问
curl -sI "$DOMAIN" | head -1          # 期望 HTTP/2 200

# 2. API 正常
curl -s "$DOMAIN/api/health"          # 期望 {"ok":true,"configured":true,"placeholder":false}

# 3. 真实星历可用
curl -s -X POST "$DOMAIN/api/chart" \
  -H 'Content-Type: application/json' \
  -d '{"date":"1995-06-15","time":"12:00","latitude":30.27,"longitude":120.15,"timezone":8}'
# 期望 {"source":"swiss-ephemeris","engine":"sweph 2.10.03",...}

# 4. 前端路由兜底
curl -sI "$DOMAIN/dashboard" | head -1 # 期望 200（不是 404）
```

**四个都过 = 部署成功。**

---

## 4. 常见故障速查

| 现象 | 原因 | 处理 |
|---|---|---|
| 访问域名 404，页面打不开 | 静态资源没托管 | 确认 `server/app.mjs` 的 `express.static` 与 SPA 兜底存在 |
| `/api/health` 返回 `placeholder: true` | 环境变量没配 | 在平台 Variables 里加 `DEEPSEEK_API_KEY` |
| `/api/health` 返回 404 JSON | 路由前缀被改写 | 确认用 `npm start` 而非 serverless 部署 |
| 构建时报 `sweph` 编译错误 | 原生模块 | 平台选 Node 22；Docker 走多阶段构建 |
| 刷新页面 404 | 缺 SPA 兜底 | 确认 `app.mjs` 末尾的 `app.use` 兜底中间件在 |
| AI 功能 503 | Key 格式错 | 必须是 `sk-` 开头、16 位以上 |

---

## 5. 安全提醒

⚠️ **部署到公网后，任何拿到链接的人都能消耗你的 DeepSeek 额度。**

建议：
1. Zeabur 控制台开启 **Rate Limiting**（每 IP 限制请求频率）
2. 域名**不要**公开到搜索引擎（Zeabur 默认不收录，但请勿主动提交）
3. 定期检查 DeepSeek 控制台的用量
4. 怀疑被滥用时，直接轮换 Key 并重启服务

---

## 6. 后续发版

```bash
cd ~/Desktop/Life-Script-Web
git add -A
git commit -m "feat: 你的改动描述"
git push
```

→ Zeabur 自动检测到 push → 自动重新构建部署 → 几十秒后线上更新。

**无需手动触发部署。**
