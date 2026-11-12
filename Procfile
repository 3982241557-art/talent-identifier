# ============================================================
#  Zeabur / 腾讯云 Webify 等「Node 容器」平台的通用启动契约
# ============================================================
#
#  本项目是单进程应用：
#    · Vite 构建产物在 dist/
#    · Express 同时提供 /api/* 与 dist/ 静态资源
#
#  平台只需执行：
#    构建：npm install && npm run build
#    启动：npm start
#
#  必需的运行时环境变量：
#    DEEPSEEK_API_KEY  —— DeepSeek 密钥（云平台控制台注入）
#    PORT              —— 平台自动分配
# ============================================================

web: npm start
build:
  - npm install
  - npm run build
