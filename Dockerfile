# ============================================================
#  多阶段构建：Node 容器
# ============================================================
#
#  用途：
#    · Zeabur（自动识别 Dockerfile）
#    · 腾讯云 Webify
#    · 任何支持 Docker 的自建平台
#
#  关键点：
#   1. **依赖分两层** —— 构建层装全部依赖，运行层只装生产依赖。
#      sweph 是原生模块，必须在构建层完成 node-gyp-build，
#      但它的 prebuilds/linux-x64/sweph.node 可直接拷贝到运行层。
#   2. **先构建前端**再拷贝 dist/ —— 保证静态资源与 API 同源。
#   3. 运行层用 node:22-alpine，镜像小、启动快。
# ============================================================

# ---------- 构建阶段 ----------
FROM node:22-bookworm-slim AS builder

WORKDIR /app

# 先只拷依赖清单，命中 Docker 层缓存
COPY package.json package-lock.json ./
RUN npm ci

# 拷源码并构建前端
COPY . .
RUN npm run build


# ---------- 运行阶段 ----------
FROM node:22-bookworm-slim AS runner

WORKDIR /app
ENV NODE_ENV=production

# 生产依赖（含 sweph 的预编译二进制）
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# 构建产物与后端代码
COPY --from=builder /app/dist ./dist
COPY server ./server
COPY index.html ./index.html

# 平台注入 PORT，Express 自动监听
EXPOSE 8080

CMD ["npm", "start"]
