# 🚨 全栈重构指令 v14.0：双轨模式架构与状态管理

> **给执行 Cursor 的话**：本指令基于 `Life-Script-Web` 当前代码的真实结构写成，
> 所有文件路径、类型名、字段名、函数签名均已核对过现有仓库。
> 请**逐条落地**，不要另起炉灶重写项目。
> 每完成一个任务立刻 `npm run build` 自检，最后跑 `node scripts/verify-v14.mjs`。

---

## 0. 现状基线（已核对，请勿推翻）

| 事实 | 位置 |
|---|---|
| 全局状态 = `Context + useReducer` | `src/store/AppContext.ts`（`AppState` / `AppAction` / `useApp()`） |
| 路由 = 历史栈模型，`Route.name` 为 `Stage` | `src/types.ts` → `Stage = 'intro' \| 'form' \| 'mbti' \| 'verdict' \| 'dashboard'` |
| MBTI 分流页已存在 | `src/components/stages/MbtiStage.tsx` → `view === 'branch'` |
| 天赋领域对象（12 字段） | `src/types.ts` → `TalentCategoryDetail` |
| 人类语料库（v12.0 已建） | `src/data/archetypes_corpus.json` + `src/lib/corpus.ts` + `server/corpus.mjs` |
| 3D 视差层 | `src/components/dashboard/ParallaxSpace.tsx`（`ParallaxSpace` / `ParallaxBackdrop` / `ParallaxCore` / `ParallaxCard`） |
| 主页外壳 | `src/components/stages/DashboardStage.tsx`（顶部 `<header>` 在 ~line 370–458） |
| 运势维度对象 | `src/lib/api.ts` → `FortuneDimension`（`summary` / `trend` / `warning`） |
| 后端接口 | `server/index.mjs` → `/api/talent`（v12.0 语料库组装）、`/api/fortune`、`/api/soul` |
| 存档 | `src/lib/storage.ts` → `SavedProfile`（`src/types.ts` line ~329） |

**红线**：本指令**不改动**已验证通过的 v9 / v11 / v12 三套逻辑。
`verify-v9.mjs`、`verify-v11.mjs`、`verify-v12.mjs` 必须**继续全绿**。

---

## 1. 模式定义与全局状态

### 1.1 类型定义（`src/types.ts`）

```ts
/**
 * 双轨模式（v14.0）
 *   pro  —— 专业版：完整文本、多维解析、略带专业感
 *   lite —— 视觉极简版：去文字化、去术语化，高对比 + 强视觉
 */
export type AppMode = 'pro' | 'lite'
```

### 1.2 状态接入（`src/store/AppContext.ts`）

**不要新建 Zustand**。项目已经是 Context + useReducer，新开一套会制造两个真相源。
按以下方式扩展现有 `AppState`：

```ts
export interface AppState {
  /* ...现有字段保持不动... */
  /** v14.0 · 双轨模式 */
  mode: AppMode
}
```

- `AppAction` 新增一条：`{ type: 'setMode'; mode: AppMode }`
- `reducer` 中 `case 'setMode': return { ...state, mode: action.mode }`
- `initialState` 新增 `mode: 'pro'`
- `restore` action 的 payload 已支持 `Partial<AppState>`，无需改动

### 1.3 独立 Context（`src/store/ModeContext.ts`，新建）

模式是**横切关注点**（组件树深处也要读），单独一个 Context 避免污染 `AppContext`：

```ts
export interface ModeContextValue {
  mode: AppMode
  setMode: (m: AppMode) => void
  toggleMode: () => void
  isPro: boolean
  isLite: boolean
}
export function useMode(): ModeContextValue
```

- `ModeProvider` 读 `useApp()` 的 `state.mode` + `dispatch({type:'setMode'})`
- `ModeProvider` 必须挂在 `AppContext.Provider` **内部**
- **`useMode()` 在 Provider 外使用时必须抛错**，不要静默返回默认值
  （防止组件在 Provider 外渲染出错时难以排查）

### 1.4 持久化

- `SavedProfile`（`src/types.ts`）新增 `mode?: AppMode`
- `src/lib/storage.ts` 的 `loadProfile` / `saveProfile` 自动带上该字段
- **向后兼容**：老存档没有 `mode` 字段时，读取时默认 `'pro'`（不要让老用户变 Lite）
- 模式变化时**立即写入存档**（不要等下次 saveProfile 触发）

### 1.5 全局 CSS 标记

`App.tsx` 的根容器已有 `data-theme={isDashboard ? 'cosmos' : 'paper'}`。
在其上**追加** `data-mode={state.mode}`：

```tsx
<div
  className="relative h-screen w-screen overflow-hidden"
  data-theme={isDashboard ? 'cosmos' : 'paper'}
  data-mode={state.mode}
>
```

`src/index.css` 里所有 `[data-mode='lite']` 规则都挂在这个属性上。

---

## 2. 分流点（入口）

### 2.1 位置选择（**必须实现 A 与 B 两处**）

用户原话：「从进入 MBTI 测试前（或者测试的起始页）就开始分流」。

**采用两处并存的方案**，二者共享同一个 `setMode`：

#### A. 起始页 `IntroStage`（推荐的主入口）

`src/components/stages/IntroStage.tsx` 现有 CTA 区域（「进入探索」按钮附近）增加一个**模式选择器**：

- 两个并排的选项块，不要做成传统 radio，要做成**两张可选卡片**
- 卡片 A：**深度专业测试** — 副标题「完整文本 · 多维解析 · 专业视角」
- 卡片 B：**直觉视觉测试** — 副标题「极简结论 · 图形优先 · 一眼看到」
- 默认选中 `pro`
- 点「进入探索」时把当前选择写入 mode

#### B. MBTI 分支页 `MbtiStage`（`view === 'branch'`）

`src/components/stages/MbtiStage.tsx` 的 branch 视图已有三个选项按钮（手动填写 / 探索 / …）。
在其**上方**插入同款模式选择器，让分流点在用户眼前更明确。

**关键约束**：两处选择器**共享同一状态**（都读 `useMode()`），
在 A 处选了 Lite，到 B 处应显示已选 Lite。两处都不得各自维护 `useState`。

### 2.2 视觉约束

- IntroStage 是**纯白纸底黑字**（`bg-paper text-ink`）。模式选择器必须沿用纸底体系：
  边框 `border-ink/20`，选中态用 `bg-ink text-paper`，**不要**引入深色宇宙风格。
- 选中的卡片要有明确的视觉标识（左侧实心竖条 + 加深边框 + 一个小圆点）

---

## 3. 全局 Toggle（3D 主页）

### 3.1 位置

`src/components/stages/DashboardStage.tsx` 的顶部 `<header>`，在
「三巨头星座图标」与「何为星盘？」按钮**之间**插入 Toggle。

### 3.2 组件（`src/components/common/ModeToggle.tsx`，新建）

要求「优雅的极简 Toggle UI」：

- 形态：横向滑动的双段开关（pill），左「专业」右「极简」
- 滑块用 `framer-motion` 的 `layoutId` 做平滑滑动（项目已依赖 framer-motion）
- 未选中段的文字透明度降低（约 `text-mist/50`），选中段 `text-mist`
- 背景 `bg-white/8`，边框 `border-white/15`，圆角 `rounded-full`
- 尺寸克制：整体高度不超过 32px，字号 `text-[12px]`，不要抢主页标题的视觉重心
- 语义：`role="group"` + `aria-label="显示模式"`，两段用 `aria-pressed`

### 3.3 切换体验

- 切换必须**即时生效**，不重新请求后端、不重新计算星盘
- 切换时**不重挂载主页**（不要用 `key={mode}` 挂在整个页面上），
  否则 3D 视差与星盘动画会被重置
- 切换只影响**渲染分支**，数据层完全复用

---

## 4. 组件级条件渲染（**核心约束：禁止写两套页面**）

### 4.1 总原则

> 不要写两套完全独立的页面。
> 要求通过传递 `mode` 属性，在现有的 3D 卡片组件内部进行**条件渲染**。
> 现有组件的 DOM 结构、样式类、动画逻辑**必须保留**，
> 只在需要隐藏/替换的**节点粒度**上做分支。

### 4.2 实现方式

在需要分支的组件内部：

```tsx
const { isLite, isPro } = useMode()
...
{isPro && (
  <p className="serif-body mt-5 text-[19.5px] ...">{c.description}</p>
)}
{isLite && (
  <VisualGraphic domain={c.key} score={c.score} accent={theme.primary} />
)}
```

**禁止**的写法：
- ❌ `if (mode === 'lite') return <LiteDashboard />`
- ❌ `mode === 'pro' ? <ProPanel/> : <LitePanel/>` 在页面根节点分叉
- ❌ 复制粘贴出 `TalentMatrixLite.tsx` / `DashboardStageLite.tsx` 这样的平行文件

**允许**的写法：
- ✅ 组件内 `useMode()` 读取
- ✅ 同一组件内按字段条件渲染
- ✅ 把「差异很大的一块」抽成**同文件内的子组件**（如 `VisualGraphic`），
  由 `mode` 决定渲染它还是渲染原文

### 4.3 `VisualGraphic` 组件（新建，`src/components/dashboard/VisualGraphic.tsx`）

Lite 模式下替代大段文字的**视觉图形**。要求：

- 纯 CSS / SVG，**不引入新依赖**（项目只有 framer-motion）
- 输入：`domain`（career/academic/interpersonal/wealth）、`score`（0-100）、`accent`（颜色）
- 视觉元素**必须因 domain 而异**（四个领域长得不一样），例如：
  - career → 向上的折线 / 阶梯
  - academic → 同心层叠的圆弧
  - interpersonal → 三个节点互联的三角
  - wealth → 环形刻度 / 上升的柱体
- 同时渲染**大号分数数字**（`score`），字号要大（`clamp(2.5rem, 4vw, 4.5rem)`），
  颜色用 `accent`，这是 Lite 模式的主要信息载体
- 图形使用 `accent` 与高透明度版本，营造「发光」质感
- 加 `aria-label` 描述图形含义（无障碍）

---

## 5. 数据流切分（`pro_text` / `lite_summary`）

### 5.1 语料库扩展（`src/data/archetypes_corpus.json`）

现有结构：`domains.{career,academic,interpersonal,wealth}.{roles,passages,actions}`。

为**每个领域**新增一个 `lite` 字段：

```jsonc
"career": {
  "label": "事业",
  "roles": [ ... ],
  "passages": [ ... ],
  "actions": [ ... ],

  // v14.0 新增
  "lite": {
    "icon": "▲",              // 该领域的图形符号（单字符）
    "summary": "把模糊目标变成能走通的路",   // ≤ 14 字，一句话结论
    "keywords": ["方向", "拆解", "扛事"]      // 3 个短词，做成色块标签
  }
}
```

**四个领域的 `lite.summary` 必须语义互斥**，不能都写「你有潜力」这种空话。
`lite.icon` 四选四，必须互不相同。

### 5.2 类型（`src/types.ts`）

```ts
export interface TalentLite {
  icon: string
  summary: string
  keywords: string[]
}

export interface TalentCategoryDetail {
  /* ...现有 12 字段保持不动... */
  /** v14.0 · Lite 模式专用 */
  lite: TalentLite
}
```

### 5.3 检索器扩展（`src/lib/corpus.ts` 与 `server/corpus.mjs`）

两个文件**保持同构**，各自新增：

```ts
export function pickLite(domain: CorpusDomain): TalentLite
```

- 从 `DATA.domains[domain].lite` 直接读出（这个字段是静态的，不需要打分检索）
- 缺字段时回落到 `{ icon: '✦', summary: <该领域的 quoteModern 截断到 14 字>, keywords: [] }`

`server/corpus.mjs` 的 `retrieve()` 返回值里**追加** `lite` 字段。

### 5.4 本地引擎（`src/lib/talent.ts`）

`buildCategory()` 里为每个领域填入 `lite`：

```ts
const lite = pickLite(domain)
return {
  /* ... */
  lite,
}
```

### 5.5 后端（`server/index.mjs` 的 `/api/talent`）

**关键**：`lite` 内容**全部来自本地语料库**，**绝不让 AI 生成**。
AI 没有能力也没有必要去写「极简结论」—— 语料库里的版本才是人类写的。

- `normalizeTalentPayload()` 里，`lite` 一律以语料包为准：

```js
lite: pack.lite ?? { icon: '✦', summary: pack.passage.modern.slice(0, 14), keywords: [] },
```

- **不要**把 `lite` 放进 AI 的 prompt 输出格式里
- **不要**让模型有机会覆盖 `lite`

### 5.6 前端取数（`src/lib/api.ts`）

`TalentCategoryResult` 增加 `lite: TalentLite`。

---

## 6. 各模块的 Lite 呈现规格

### 6.1 天赋矩阵 `TalentMatrix.tsx`

当前是 v12.0 的 **2×2 CSS Grid**（`[data-talent-grid]`，`grid-template-columns: repeat(2, minmax(0,1fr))`，
`grid-auto-rows: 1fr`）。**布局必须保持不变**，只改卡片内部。

卡片内分支：

| 元素 | Pro 模式 | Lite 模式 |
|---|---|---|
| 领域标签 | 显示 | 显示 |
| 天赋名 `c.title` | 显示 | 显示 |
| 分数 | 显示（小） | **显示（大号，视觉主体）** |
| 角色定义 `c.subtitle` | 显示 | **隐藏** |
| 方向说明 `c.field` | 显示 | **隐藏** |
| 先哲原句 `c.quote` + 出处 | 显示 | **隐藏** |
| 专属解析 `c.description` | 显示 | **隐藏** |
| 优势 `c.strength` | 显示 | **隐藏** |
| 练习 `c.practice` | 显示 | **隐藏** |
| `VisualGraphic` | 不渲染 | **渲染** |
| `lite.summary` | 不渲染 | **渲染**（大字号） |
| `lite.keywords` | 不渲染 | **渲染**（高对比色块标签） |

**硬性约束**：
- Lite 模式下每张卡**只保留**：领域标签 + 天赋名 + 大分数 + `VisualGraphic` + `lite.summary` + keywords 色块
- Lite 模式下**不得出现**任何超过 20 字的散文段落
- 四张卡在 Lite 模式下**必须仍是 2×2 等高矩阵**（`grid-auto-rows: 1fr` 生效，
  卡片内容少但高度对齐）
- Lite 模式下的卡片背景**提高对比度**：`bg-white/5` → `bg-white/10`，
  边框 `border-white/10` → `border-white/25`
- Lite 模式整页**减少文字密度**：`yearly`（每年适合做的事）与 `advice`（落地建议）
  两块在 Lite 模式下**只渲染标题不渲染列表**，或整体隐藏

### 6.2 MBTI 解码 `MbtiHub.tsx`

- Pro：现状不变
- Lite：
  - 隐藏「优势清单」「盲区」等长列表，只留 **MBTI 四字母大字** + 类型昵称 + 一行 `lite` 结论
  - 四字母字号拉到 `clamp(4rem, 8vw, 8rem)`，`accent` 色，带辉光
  - 名人共鸣库（如果有）在 Lite 模式下只留头像/名字，隐藏描述文字

### 6.3 运势 `FortuneCard.tsx` / `FortuneDimensions`

- Pro：现状不变
- Lite：
  - `FortuneCard` 的 `body` 段落**隐藏**，只留 `subtitle`（如「年度运势」）+ `title`
  - `FortuneDimensions` 四个维度卡片：只留 **icon + 维度名 + 一个大分数/强度指示**，
    隐藏 `summary` / `trend` / `warning` 三段文字
  - 维度分数用横向色条或环形进度表示，颜色用 `DIM_META[].color`（提高对比度）

### 6.4 灵魂底色 `VerdictStage.tsx`

- Pro：现状不变
- Lite：一句 `text` 保留（这是核心结论），但字号加大、字距放宽；
  隐藏 `tags` 关键词组之外的所有附加说明；背景改为大面积高对比色块

### 6.5 主页外壳 `DashboardStage.tsx`

- 「何为星盘？」抽屉（`AstrologyDrawer`）：Lite 模式下**不渲染入口按钮**——
  极简版不做科普，科普是 Pro 版的特权
- `ConceptNote`（NOTE 那行）：Lite 模式隐藏
- 底部 footer（`真实星历 · Swiss Ephemeris · Placidus · 经纬度…`）：
  Lite 模式隐藏（这是专业信息）
- 星盘本体（`Astrolabe`）：**两模式共用**，不要重写

---

## 7. 色彩与对比度（Lite 模式专项）

Lite 模式的立意是「大幅增加色彩对比度」。在 `src/index.css` 增加：

```css
/* v14.0 · Lite 模式 —— 极高对比度 */
[data-mode='lite'] {
  --lite-surface: rgba(255, 255, 255, 0.10);
  --lite-border: rgba(255, 255, 255, 0.28);
  --lite-text: rgba(240, 244, 252, 0.98);
}
```

并为 Lite 模式的关键元素提供**高对比**取值：
- 分数数字：`var(--el-accent)` + `text-shadow` 辉光
- keywords 色块：背景 `var(--el-accent)`，文字 `var(--el-accent-2)` 或纯白，`font-bold`
- `VisualGraphic`：`accent` 实色 + 30% 透明度副本

**对比度底线**：Lite 模式下所有正文字与背景的对比度 ≥ 4.5:1（WCAG AA），
大号分数与图形 ≥ 3:1。写完用浏览器 `getComputedStyle` 实测，不要凭感觉。

---

## 8. 验收标准（可自动化）

### 8.1 必须新增 `scripts/verify-v14.mjs`

沿用 `verify-v12.mjs` 的骨架（Playwright + headless Chrome + `BASE_URL=http://localhost:5180`），
必须覆盖以下断言：

**状态管理**
1. `data-mode` 属性在根容器上正确取值为 `pro` / `lite`
2. 切换 Toggle 后 `data-mode` 立即改变，**无需刷新页面**
3. 模式写入 localStorage，刷新后仍保持

**分流点**
4. IntroStage 存在模式选择器，选中后 `data-mode` 随之改变
5. IntroStage 与 MbtiStage 两处选择器状态**同步**（改一处，另一处也变）

**全局 Toggle**
6. DashboardStage 顶部存在 `aria-label="显示模式"` 的 Toggle
7. 点击 Toggle 后 `data-mode` 改变

**数据穿模 / 无双页面**
8. `src/components/dashboard/` 下**不存在** `*Lite.tsx` 文件
9. `src/components/stages/` 下**不存在** `*Lite.tsx` 文件
10. 同一个组件在两种模式下**渲染出的 DOM 结构不同，但组件数量不变**
    （用 `data-mode` 属性计数验证）

**Lite 模式的「去文字化」**
11. Lite 模式下，天赋卡片内**不含** `blockquote`（先哲原句）
12. Lite 模式下，天赋卡片内**不含** `data-talent-description`
13. Lite 模式下，天赋卡片内**不含** `data-talent-subtitle`
14. Lite 模式下，每张卡**必须含** 一个 `VisualGraphic`（给根节点加 `data-lite-graphic` 属性便于定位）
15. Lite 模式下每张卡的最大文本长度 ≤ 20 字（遍历所有可见文本节点断言）
16. Lite 模式下**不含**「练习：」字样
17. Pro 模式下上述 11–16 全部**反向成立**（该有的都有）

**2×2 矩阵不被破坏**
18. 两种模式下 `grid-template-columns` 都是两列
19. 两种模式下同排卡片高度一致

**语料库**
20. `archetypes_corpus.json` 四个领域都有 `lite` 字段
21. 四个领域的 `lite.summary` 互不相同、`lite.icon` 互不相同
22. `lite.summary` 长度 ≤ 14 字
23. 后端 `/api/talent` 返回的每个 category 都带 `lite` 且**不被 AI 改写**
    （断言 `lite.icon` 落在语料库给定的取值集合内）

**回归**
24. `node scripts/verify-v9.mjs` 仍全绿
25. `node scripts/verify-v11.mjs` 仍全绿
26. `node scripts/verify-v12.mjs` 仍全绿

### 8.2 硬性门槛

- `npm run build` → 0 个 TS 错误
- `npm run lint` → 无新增 warning（既有 warning 不动）
- 后端 `/api/health` → `{"ok":true,"configured":true,"placeholder":false}`
- 浏览器控制台**零 error**

---

## 9. 执行顺序（严格按此顺序）

1. `src/types.ts` → 加 `AppMode`、`TalentLite`，扩 `TalentCategoryDetail` 与 `SavedProfile`
2. `src/store/AppContext.ts` → `AppState.mode` + `setMode` action
3. `src/store/ModeContext.ts` → 新建
4. `src/App.tsx` → 挂 `ModeProvider`，根容器加 `data-mode`，模式写入存档
5. `src/data/archetypes_corpus.json` → 四个领域补 `lite`
6. `src/lib/corpus.ts` + `server/corpus.mjs` → `pickLite` / `retrieve().lite`
7. `src/lib/talent.ts` → `buildCategory` 填 `lite`
8. `server/index.mjs` → `normalizeTalentPayload` 里 `lite` 以语料库为准
9. `src/lib/api.ts` → `TalentCategoryResult.lite`
10. `src/components/dashboard/VisualGraphic.tsx` → 新建
11. `src/components/common/ModeToggle.tsx` → 新建
12. `src/index.css` → `[data-mode='lite']` 变量与高对比规则
13. `src/components/stages/IntroStage.tsx` → 分流点 A
14. `src/components/stages/MbtiStage.tsx` → 分流点 B
15. `src/components/stages/DashboardStage.tsx` → 全局 Toggle + 各处 Lite 条件渲染
16. `src/components/dashboard/TalentMatrix.tsx` → 卡片内条件渲染（布局不动）
17. `src/components/dashboard/MbtiHub.tsx` → Lite 分支
18. `src/components/dashboard/FortuneCard.tsx` → Lite 分支
19. `src/components/stages/VerdictStage.tsx` → Lite 分支
20. `scripts/verify-v14.mjs` → 新建并跑通

---

## 10. 反模式清单（出现即视为未完成）

- ❌ 出现 `TalentMatrixLite.tsx` / `DashboardStageLite.tsx` / `FortuneCardLite.tsx` 等平行文件
- ❌ 页面根节点按 mode 分叉成两个完整组件
- ❌ 为了 Lite 模式重新请求后端或重算星盘
- ❌ 切换模式导致星盘 / 3D 视差被重挂载重置
- ❌ Lite 模式下仍然出现长段落
- ❌ Lite 模式下仍然出现「练习：」「适合做什么」「适 合 做 什 么」这类标签
- ❌ 两个分流点各自维护独立的 `useState`（必须共享 `useMode()`）
- ❌ `lite` 内容由 AI 生成（必须来自本地语料库）
- ❌ 破坏 v12.0 的 2×2 等高矩阵
- ❌ 老存档用户被莫名其妙切成 Lite

---

## 11. 完成后请输出

1. 所有新增 / 修改文件的完整代码
2. `npm run build` 与 `npm run lint` 的输出
3. `node scripts/verify-v14.mjs` 的完整输出（含每条断言的 pass/fail）
4. `verify-v9 / v11 / v12` 三个回归脚本的输出
5. Lite 与 Pro 两种模式下的主页截图（各一张）
