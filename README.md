# 人生剧本 · Life Script

一款 4K 电影级沉浸式星盘 Web 应用。苏格拉底是全站的 AI 智者化身，
以宇宙纪录片的寂寥质感，引导旅人读懂自己的星盘。

> 视觉红线：纯黑 / 深邃蓝为底，极少量纯白与暗金点缀；
> 严禁赛博朋克、发光边框与科技感 UI。所有面板为无边框的轻薄深色毛玻璃。

---

## 一、技术栈

| 层 | 选型 |
| --- | --- |
| 前端 | React 19 + TypeScript + Vite 8 |
| 样式 | Tailwind CSS v4（`@theme` 自定义色板与字体） |
| 动效 | Framer Motion（阶段转场、浮现、滚动字幕） |
| 占星引擎 | 自研：儒略日 + 开普勒方程 + Meeus 月亮级数（零依赖） |
| 后端 | Node.js + Express 5 + DeepSeek API |

## 二、目录结构

```
.
├── public/                  # 静态资源
│   ├── socrates.png         # 苏格拉底头像（唯一需自备的素材）
│   ├── bg.png               # 宇宙背景（太阳 + 月球交相辉映）
│   ├── avatar-1..4.png      # 形象库占位图
│   └── favicon.png
├── scripts/
│   ├── generate-assets.mjs  # 纯 Node 生成占位图像（无外部依赖）
│   ├── generate-favicon.mjs # 生成 favicon
│   ├── check-chart.ts       # 占星引擎自检
│   └── verify.mjs           # Playwright 端到端视觉验证
├── server/                  # 后端
│   ├── index.mjs            # Express 路由
│   ├── env.mjs              # 环境变量加载（以本文件目录定位 server/.env）
│   ├── deepseek.mjs         # DeepSeek 调用封装
│   ├── prompt.mjs           # 苏格拉底系统 Prompt + 星盘上下文序列化
│   └── .env.example
└── src/
    ├── App.tsx              # 阶段状态机外壳
    ├── types.ts             # 核心类型
    ├── data/
    │   ├── signs.ts         # 十二星座基础数据
    │   └── guideScripts.ts  # 向导台词 + 科普过场文案
    ├── lib/
    │   ├── astro.ts         # 天文计算（黄经 / 上升点 / 逆行）
    │   ├── chart.ts         # 命盘推演（宫位 / 相位 / 元素 / 判词）
    │   └── api.ts           # 后端客户端
    ├── hooks/
    │   ├── useTypewriter.ts # 打字机效果
    │   └── useGuideSeen.ts   # 向导「首次解锁」状态（localStorage）
    └── components/
        ├── common/          # GlassPanel / TypewriterLine / Starfield
        ├── stages/          # IntroStage / CinematicStage / DashboardStage
        ├── dashboard/       # StarChains / FortuneCard / ChartWheel
        ├── guide/           # GuideOverlay
        └── chat/            # ChatDock
```

## 三、快速开始

```bash
# 1. 安装依赖
npm install
npm --prefix server install

# 2. 配置后端（DeepSeek Key）
cp server/.env.example server/.env
# 编辑 server/.env，把 DEEPSEEK_API_KEY= 后面的占位符换成你的真实 Key
# Key 在 https://platform.deepseek.com/api_keys 创建，形如 sk-xxxxxxxx

# 3. 生成占位图像（可选，已内置于 public/）
npm run assets

# 4. 启动后端
npm run server        # → http://localhost:8787

# 5. 启动前端
npm run dev           # → http://localhost:5180
```

前端通过 `VITE_API_BASE` 指定后端地址（见 `.env.example`）。

### 在浏览器中查看

启动 `npm run dev` 后，直接在浏览器打开：

- **http://localhost:5180** —— 前端页面（星盘主页）
- **http://localhost:8787/api/health** —— 后端健康检查

健康检查会返回 `configured` 字段：

```jsonc
{ "ok": true, "configured": false, "placeholder": true, "model": "deepseek-chat" }
```

- `configured: true` 且 `placeholder: false` —— Key 有效，AI 功能可用
- `placeholder: true` —— `server/.env` 里还是占位符，AI 接口会返回 503

改完 `server/.env` 后需要**重启后端**（`npm run server`）才能让新 Key 生效。
前端改动则是热更新，无需重启。

> **注意**：`server/.env` 通过 `server/env.mjs` 以「文件自身所在目录」为基准定位，
> 因此无论你从哪个目录启动后端（`npm run server`、`node server/index.mjs`、
> 从别处拉起的守护进程），读到的都是同一份 `server/.env`。
>
> 若启动时提示「端口 8787 已被占用」，说明旧后端进程还在运行，新进程已退出。
> 先结束旧进程再启动：
>
> ```bash
> lsof -ti tcp:8787 | xargs kill
> ```

## 四、用户旅程

### 阶段 1 · 苏格拉底破冰与命运坐标
纯黑背景中苏格拉底头像缓慢悬浮，打字机极慢打印「旅人，请留下你的命运坐标。」
→ 无边框表单收集**出生日期 / 时刻 / 城市**（内置常用城市经纬度表）
→ 表单消失，展示**判词**（关键词以暗金高亮）
→ 从本地形象库抽取专属形象，并列出「太阳 | 月亮 | 上升」。

### 阶段 2 ·「何为星盘？」电影式过场
星空淡入，字幕自下而上缓慢滚动「剧场公式」全段文案（硬编码于
`src/data/guideScripts.ts` 的 `CINEMATIC_SCRIPT`）。读完或点击屏幕进入主页。

### 阶段 3 · 4K 宿命主页
- 背景：`/bg.png` 宇宙大片 + 40% 黑色遮罩 + 边缘渐隐
- 星链：SVG 绘制上升链（白）与下降链（浅蓝），星点沿曲线流动
- 中央：用户形象 + 「太阳 | 月亮 | 上升」+ 判词 + 元素能量条
- 周边：年度 / 月度 / 每日运势三张毛玻璃卡片，年度卡旁带星座移动刻度线
- 底部：星盘全貌轮盘（十二宫位 + 行星落点 + 元素弧）

### 阶段 4 · 苏格拉底的全局游戏向导
首次点击任一板块时（`useGuideSeen` 记录于 localStorage），屏幕变暗，
苏格拉底头像跳出并以打字机效果解释该板块的**运行逻辑与解读边界**
——例如「年度运势并非铁定的宿命…」，避免用户误解解读范围。

### 阶段 5 ·「我有疑问」DeepSeek 接入
- 底部常驻无边框输入框，底线带微弱光晕
- 输入框上方由系统**主动提出**一个反思问题（后端 `/api/reflect` 生成，失败回落到本地文案）
- 回复以打字机效果渲染在输入框上方

## 五、后端接口

### `POST /api/chat`
```jsonc
// 请求
{
  "message": "我总是害怕被人误解，怎么办？",
  "chart": { /* 完整星盘对象 */ },
  "history": [{ "role": "user", "content": "..." }]
}

// 响应
{ "reply": "苏格拉底的答复" }
```

系统 Prompt（`server/prompt.mjs`）强制设定：

> 你现在是数字哲学家苏格拉底，深谙占星学运行逻辑。请根据用户的星盘特质和提出的问题，
> 用极其温柔、深邃、具有哲学视角的语言解答。你要像一位智者化身，安抚并引导用户探索自我。

并附加行为准则：先共鸣再引导、不给宿命式结论、提醒「星象给的是倾向而非判决」、
限长 120 字、结尾以反思性问题收束、不预言灾祸与他人隐私。

### `POST /api/reflect`
依据星盘与当日运势生成一个反思问题，返回 `{ "reflection": "..." }`。

### `GET /api/health`
返回 `{ "ok": true, "configured": boolean, "placeholder": boolean, "model": "deepseek-chat" }`。
`placeholder: true` 表示 `server/.env` 中的 Key 仍是占位符，AI 接口会返回 503。

## 六、占星引擎精度

`src/lib/astro.ts` 为零依赖实现：

- **太阳与行星**：J2000 轨道要素 → 开普勒方程 → 日心黄道直角坐标 → 地心黄经
- **月亮**：Meeus《Astronomical Algorithms》第 47 章截断 ELP-2000/82 级数
- **上升点**：由 RAMC 与赤纬迭代反解黄经
- **逆行**：黄经有限差分判向

自检（`npm run check`）结果：朔望月平均 29.53 天；太阳黄经与
真实星历误差 < 0.1°；月亮黄经误差 < 0.5°。

## 七、验证

```bash
npm run build      # 类型检查 + 生产构建
npm run lint       # oxlint
npm run check      # 占星引擎自检
node scripts/verify.mjs   # Playwright 端到端截图（需先启动 dev server）
```

## 八、素材说明

`public/socrates.png` 是唯一必须自备的真实素材（人物肖像）。
其余图像由 `scripts/generate-assets.mjs` 以纯 Node 逐像素生成，
可替换为真实的宇宙大片与人物形象。
