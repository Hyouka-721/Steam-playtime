# Steam 游戏时长统计界面 · 交接提示词

> **用法**：新开一个对话，把本文件**全文**粘进去即可无缝续做，不需要再解释项目。
> **范围**：只研究 `docs/index.html`（Steam 游戏时长统计界面）。
> **明确排除**：`docs/watch.html` 观影列表（Watch List）及其 `watch.*` / `data/watch.json` / `img/watch/` 全套资源，本文件不涉及、也不要去改。
> **最后同步**：2026-11-05 第 109 轮（含第 103/104/105/106 轮的栏目结构、入口、主题变更，第 108 轮流星特效视觉优化，以及第 109 轮密度回调）。

---

## 一、这是什么

一个**零构建**的纯静态站点（没有打包器、没有 npm build 产物），托管在 GitHub Pages：

- 线上：<https://hyouka-721.github.io/Steam-playtime/>
- 仓库：`Hyouka-721/Steam-playtime`，本地 `C:\Users\33329\WorkBuddy\2026-10-13-18-17-49\steam-playtime`
- 发布根 = `docs/` 目录本身（**改 `docs/` 里的文件就等于改线上**）
- 数据每天由 GitHub Actions（UTC 15:30 = 北京 23:30）抓 Steam → 差分 → 生成 `docs/data/*` 并提交

页面做的事：把 Steam 库里每款游戏**玩了多久、最近哪天玩过、成就解锁多少**可视化——概览卡 + 终身时长排行榜 + 成就榜 + 游玩时间轴 + 每日热力图 + 数据说明页。
⚠️ 第 103 轮起「近 14 天游玩榜」已**彻底删除**，热力图从「游戏时长」栏移到了「最近游玩」栏，别再按旧结构找 `#recent-list` / `renderRecent()`。

---

## 二、技术栈与不可违反的硬约束

| 项 | 值 / 规则 |
|---|---|
| 前端 | 原生 HTML + CSS + ES2020 JS，**无框架、无构建、无外部 CDN** |
| 字体 | 本地 `docs/blackrose.woff2`（woff 兜底），标题族；正文走系统字体栈 |
| 数据格式 | 静态 JSON，`docs/data/{meta,achievements}.json` + `docs/data/daily/YYYY-MM.json` |
| 首屏数据 | `meta` + 当月 `daily` 由 `scripts/build/inline-boot.mjs` **内联**进 `index.html`，避免首屏多一个 RTT |
| 缓存 | `docs/sw.js`：`index.html`/`meta`/`daily` 网络优先，图片 cache-first，成就 `stale-while-revalidate`；`sw.js` 从 `index.html` 现场解析 `?v=NN`，**不写死版本号** |
| 主题 | **两套**（第 106 轮起）：`cream` 暖阳米（浅）/ `cinema` 影院黑（深），全部走 `[data-theme="x"]` 上的 CSS 变量 |
| 响应式 | 桌面 ≥861px 单套布局；≤860px 转「两行」窄屏布局；`.cards` 另有 1080 / 720 断点 |

### 🔴 三条发布纪律（违反必炸）

1. **改哪个文件就 bump 哪条版本号，三条互相独立**：`style.css?v=NN`、`app.js?v=NN`、`fx.js?v=NN`（现为 `?v=133` / `?v=119` / `?v=18`）。第 108 轮改了 `style.css` 与 `fx.js`；第 109 轮只改 `fx.js`（`133` / `119` 均未动）。
   - 事故前科：只 bump CSS 没 bump JS，用户缓存里的旧 JS 调用了已删除的 DOM 节点 → 抛 TypeError → **热力图整块空白**。**本地永远复现不出来**（服务端直接给最新文件）。
   - bump 要覆盖多种字面量形态：`style.css?v=NN` / 正则里转义过的 `style\.css\?v=NN` / 裸串 `cssV === 'NN'`、`appV`、`CSS_V`、`APP_V`；脚本自身的新旧字面量要拼接构造，注释里也别写版本号。
2. **同批次反复改同一文件，每次都要再 bump**。一次发布里改了 3 次 CSS 却只有一个版本号 → 用户命中第一版的缓存。
3. **`docs/` 就是线上**：不要在里面放临时文件、草稿、`.bak`。
4. **没收到明确的「推送」指令就不推**；推送前先 `git fetch`，落后就 `git merge origin/main`（**禁 rebase、禁 --force**）。

### 🔴 主题契约（第 106 轮起，改主题＝改需求）

- 全站只剩 **`cream` 暖阳米**（浅）+ **`cinema` 影院黑**（深，与观影页同源）；点页眉史蒂夫在两套间来回切，**点一次必换**。用户已明确要求删掉 `night` 夜航 / `mint` 薄荷晨 / `dawn` 晨曦紫，别加回来。
- **改主题必须四处同步**：`style.css` 的变量块 + 注释、`app.js` 的 `THEMES` 数组、`index.html` 首屏内联 `var ids = [...]` 白名单、活跃套件里硬编码的主题列表（如 `verify54` B7、`verify83_index` A8）。**漏白名单＝用户刷新丢主题**。
- **首屏默认回落**：`ids.indexOf(saved) >= 0 ? saved : (sysDark ? 'cinema' : 'cream')`。深色系统、且从未手动选过 → **直接就是影院黑**；`localStorage` 里残留已删主题（如 `night`）也会安全回落。这条是「实际显示的不一致」的根治点：旧版默认落到 night，用户截图里的紫蓝深色其实是夜航，不是缓存或没上线。
- **所有 cinema 专属规则必须带 `[data-theme="cinema"]` 前缀**：切回 cream 时 `body::before` 的 `background-image` 必须是 `none`（`verify105` B7 / `online105` B6 守着），否则污染浅色主题。
- cinema 独有的两件东西：顶部放映机暖光（`--bg-layers` 中央窄束 `at 50% -40px` + 宽散射 `at 50% -12%`，页眉再叠同形状一层）、`body::before` 两层错位点阵胶片颗粒（3px/5px、fixed、z-index 2、pointer-events none、`opacity .62`）。配色 `--bg #0b0b0e` / `--accent #e8b04b` / 面板 `#14141a`。

---

## 三、目录地图（2026-11-04 重组后）

```
steam-playtime/
├── docs/                      ← 发布根（GitHub Pages 直接托管这个目录）
│   ├── index.html             含内联首屏数据块（勿手改内联区）+ 首屏主题白名单脚本
│   ├── app.js                 全部页面逻辑（渲染 / 视图切换 / 下钻 / 主题切换）
│   ├── style.css              全部样式 + 两套主题变量（cream / cinema）
│   ├── fx.js                  纯装饰层（流星 / 光点），低优先级加载
│   ├── sw.js                  Service Worker
│   ├── manifest.webmanifest   PWA 清单
│   ├── blackrose.woff2/.woff  标题字体
│   ├── data/                  线上数据（由 build 生成，勿手改）
│   └── img/                   图标、封面、头像素材
│       ├── covers/            <appid>-320.webp（srcset 小图）与原图
│       └── watch/             ← 观影页资源，本任务不涉及
├── scripts/
│   ├── pipeline/              每日流水线（CI 调这几个）
│   │   ├── fetch.mjs          调 Steam API → data/snapshots/
│   │   ├── diff.mjs           差分 → data/daily/
│   │   ├── localize.mjs       中文名映射
│   │   ├── build.mjs          生成 docs/data/*
│   │   └── backfill-percent.mjs  成就全球完成率补录（手动）
│   ├── build/inline-boot.mjs  把 meta + daily 内联进 index.html
│   ├── media/                 图标与封面生产（手动跑）
│   ├── watch/                 观影页数据录入（不涉及）
│   ├── lib/                   dates / diff-core / steam 三个纯模块
│   ├── tests/                 单元测试（npm test）
│   └── legacy/inline-css.mjs  **已回退的方案，仅留证**，不要启用
├── tests/
│   ├── verify/                本地回归套件（Playwright 打 127.0.0.1:8895）
│   │                          当前活跃：verify6/54/82_index/83_index/91/92/103/104/105/106
│   │                          verify47/48/49/88/90 断言旧结构 → 历史留档，不为跑绿调阈值
│   ├── online/                上线后对 Pages 的复验（online102/103/104/105/106）
│   └── tools/
│       ├── perf-audit.mjs     首屏 / 卡片切换 / 滚动性能审计
│       ├── perf-lazy.mjs      按需加载耗时
│       ├── ab-css.mjs         A/B 对照（同机、固定限速）
│       └── archive/           历史一次性脚本（取证截图 / 版本号 bump / 数据合并），留档备查
├── data/                      原始数据（快照 / 差分 / 成就 / 中文名覆盖），永久保留
├── CONTINUE-GAMETIME.md       本文件（第 109 轮已同步）
└── README.md                  项目说明（部署 / Secrets / 数据 Schema）
```

🔴 脚本靠 `path.resolve(__dirname, '..', '..')` 找仓库根 → 再挪层级必须同步改 + `package.json` 5 条 + `.github/workflows/daily.yml` 4 条，否则**夜间 CI 静默失败**；验证＝实跑 `node scripts/pipeline/build.mjs`（产物只该差 `generated_at`）。

---

## 四、页面结构与数据流

### 五个视图（`.view`，靠顶部五张 `.card-nav` 导航卡切换）

| 视图 | 元素 | 内容 |
|---|---|---|
| `lifetime` | `#lt-main` | **主视图**。终身时长排行榜 `#lt-list`；点任一行 → 下钻到按游戏筛选的热力图 |
| `recent` | `#lt-detail` | **游戏热力图常驻**（第 103 轮从「游戏时长」栏搬来，去掉 `hidden`）；近 14 天榜已彻底删除 |
| `ach` | `#ach-list` | 成就榜（全站完成率最高的成就） |
| `timeline` | `#tl` | 按周分组的游玩里程碑时间轴 |
| `data` | 导出 / 采集健康度 / 关于数据 | 三个说明型面板 |

### 导航入口（第 104 轮，改这里＝改需求）

- **导航层面只有「最近游玩」卡能进热力图**：`#card-recent` → `switchView('recent')`；`#card-lifetime` 只负责「从其他栏目回累计榜」，停在该栏再点一次**不会**跳热力图（第 103 轮遗留的 `else { openDrill(null); }` 已删）。
- **仍保留的内容层入口**：累计榜点行 `openDrill(appid)`、成就/建议区 `[data-appid]` 徽章、深链 `#/recent/g/<appid>`（`applyHash` 兼容旧 `#/lifetime/g/...`）、热力图里的「← 返回」→ `switchView('lifetime')`。用户未要求「严格只有一条路」，别擅自收紧。
- 🔴 **只搬 DOM 不改 JS 一定白屏**：`openDrill()` 原会隐藏 `#lt-main`、显示落在未激活视图的 `#lt-detail`。第 103 轮连带改了 8 处：`openDrill` / `closeDrill` / `switchView` / 返回按钮 / 卡片点击 / `syncHash` / `applyHash` / 初始化调用。`closeDrill()` 现在只清 state，`switchView('recent')` 负责 `renderDrill()`。
- 月份头拆成两个容器：`#heat-months`（`.panel-title` 内）+ `#heat-months-b`（标 `.is-right`），`renderDrill` 写 `heads[0]`/`heads[1]`，只剩一月时后者清空。**查月份头一律用 `.heat-months .hm-*`**。

### 排行榜行的网格（**最重要的一块布局**）

`.rank-item` 是 6 列 grid，现在**只有终身榜在用**（近 14 天榜已删）：

```
44px          130px               minmax(150px,260px)  minmax(140px,1fr)  150px    110px
序号 rank-no   封面 capsule-wrap   名称 rank-name       进度条 rank-bar      时长 rank-min  日期 rank-last
```

实测（1440 视口）：`44 / 130 / 260 / 552 / 150 / 110`，横向溢出 0。

附加规则：

- **进度条** `.rank-bar` 有 `margin-left:-30px; margin-right:-20px` → 两端各探出（总宽 = 网格区 + 50，1440 下 **602px**）。左端探进名称列 16px，所以 `.rank-name` 必须有 `padding-right:22px` 让位。
- 🔴 柱子必须 `minmax(140px,1fr)`：光秃秃 `1fr` 的 min=0 → 名称涨到上限会把空间吃光（1000 宽只剩 32px、900 塌成 0）。
- 🔴 日期必须固定 `110px`：`minmax(110px,1fr)` 会把日期推到右缘、与时长裂 52px 空档（用户两次反馈「空旷」）。
- **时长** `.rank-min` 居中 + `transform: translateX(40px)`（用户实测要求）；用 transform 不用 padding，量位移要临时置 `transform:none`。
- **日期** `.rank-last` 右对齐、**只有纯日期**（如 `2026-10-25`）。相对时间（「9 天前」）已被用户要求**彻底删除**，别加回来。
- **骨架屏** `.sk-row` / `index.html` 8 行静态预置骨架 / `rankSkeleton()` / `.rank-item` **四处列模板必须逐字一致**（第 97 轮单方面改过没同步，第 102 轮回退才对上）。
- ≤860px 时进度条改横跨前两列、负边距清零，日期整列隐藏。

### 首屏与渲染时序

1. `index.html` 首屏内联脚本先定 `data-theme`（白名单 + 系统深浅回落），自带内联 `meta + 当月 daily`，**首屏不等网络就能画**；
2. `app.js` 执行 → `renderLifetime()` 替换骨架 → 封面图按 `IntersectionObserver` 临近视口才赋 `src`；
3. `achievements.json` 只在切到成就卡时拉，第二次走 SWR；
4. `fx.js` 最后加载（`defer fetchpriority=low`），只做装饰；第 108 轮起是柔化的流星氛围层，不参与布局也不接收点击。

---

## 五、数据契约（只列本界面用到的）

`docs/data/meta.json`（脱敏后发布，**不含完整 steamid**）：

| 字段 | 说明 |
|---|---|
| `generated_at` / `generated_at_local` | 生成时间（UTC / 北京日期） |
| `tracking_since` / `last_snapshot_date` | 追踪起点 / 最后一次快照日期 |
| `steamid_hash` | steamid 的哈希，只用于展示与差分对齐 |
| `games_lifetime` | `{appid: {name, lifetime_minutes, last_played, img_icon_url}}`，终身累计 |
| `tracking_totals` | 追踪期合计 |

`docs/data/daily/YYYY-MM.json`：按月的每日分钟数，**热力图**从这里算。
`docs/data/achievements.json`：成就定义 + 解锁状态 + 全球完成率。

⚠️ appid `431960` 显示名 = **`Wallpaper Engine`**（第 103 轮改，源头 `data/overrides/game-names.json` 已改，夜间 CI 不会回退中文名）。合并远端数据快照时 `docs/index.html` 的 BOOT 行**必冲突**：取远端最新数据，再把 `Wallpaper Engine：壁纸引擎` 全量替换回英文，结构与版本号保留我方。`style.css` 注释与 archive 脚本里的旧中文串是历史留痕，不是显示名。

---

## 六、视觉契约（动 CSS 前必读）

- **站名**：`<title>` = `Game Time`；页眉 `h1` = **`My Game Time`**（两者独立，别顺手改另一个）。
- **`.site-title` 有 `width:6.73em; white-space:nowrap`**（≥861px）：为消 CLS。**改站名文案必须同步改这个 em 值**。
- **`--bg-layers` 在 cream 下是 5 层**（4 层径向 + 1 层 `linear-gradient(165deg,…)` 方向光），`body` 另铺 140×140 SVG 噪点。cinema 有自己一套 7 层（含放映机暖光）。改背景**别把噪点冲掉**。
- **`--inset-shine` 只给 `.h-item`/`.rp-cell`/`.heat-mb`/`.hm-none` 四个真区块**；`--sunken` 有 20 多处小元素，全局加会像坏点。
- **`.card-nav.active` 必须带 `var(--card-shine)`**（曾被整条 box-shadow 覆盖，导致选中的卡反而没高光）。
- **`.site-header` 无 `border-bottom`**（用 `::after` 渐隐线，页眉高 172）。
- **`.panel` 的 padding 18 / `.panel-head` 的 margin 14 不能动** —— `verify49` 有五条精确几何断言，是「不许靠改 padding 补偿」的守卫。
- **`.cards` 断点 1080**：721~1080 六列底网格、≥1081 五列、≤720 单列；**1081 是最窄安全宽度**。
- **热力图余量只有 1~2px**：`.heat-pair` gap、`.heat-mb` 内边距、`.hc` 字号三者联动；卡片内边距分档 0 / 6px / 14px（900~1024 / 1025~1100 / ≥1101），gap 14（≥1101 为 28）。改动必跑 `verify90`。
- **`.tl-week` 14.5px**、月份块头 `.hm-title` 19.5 / `.hm-stat` 17.5（≤860 档 18.5 / 17）。
- 图标：文件名带源图 hash（`<用途>-<md5 前8>.png`），换素材＝换 URL；`sw.js` 对 png 是 cache-first，**固定名会被旧缓存挡住**。改图标同步三处：两页 link / `manifest` icons / `sw.js` 的 `SHELL_LIST`。
- ⚠️不要在窄屏覆盖里另起第一个 `@media (max-width:860px)` 块（部分套件取第一个 860 块）。

### 流星特效契约（第 108 轮建立 / 第 109 轮密度回调，只改视觉 / 节奏，风格 · 布局 · 功能零改动）

`docs/fx.js` 是原生 Canvas 2D 装饰层，配色由两套主题的 `--fx-meteor` 提供（cream `#c9ad8e` / cinema `#bfa677`，均为低饱和暖灰金，**不与 `--accent` 同值**）。设计目标是「背景深处偶尔飘过一缕极淡暖光」，不是橙色亮线划屏。

- 视觉：远 / 中 / 近三档层次 + 离屏预渲染的静态微光尘；多段渐隐光带（外层宽光晕 / 中层实体光带 / 细主线三层）+ 两层柔光头；`smooth()` 双向渐隐，出现与消失都柔；方向轻微散布、随机静默期、最小生成间隔防扎堆。
- 节奏（**第 109 轮已回调密度**）：`spawnPerSec [1.10, 2.10] 颗/秒`、`maxAlive 10`（按视口缩放：1440 → 10 颗、390 → 4 颗）、`minGap 0.32s`、`silence [0.05, 0.22]s`。第 108 轮曾是 `0.55–1.15` / 上限 6，用户反馈偏稀后约翻倍；仍明显低于改造前的同屏 18 颗。速度 `240–460 px/s`、峰值透明度 `0.20–0.36`、尾迹 / 层次 / 渐隐 / 内容避让**一律未动**。
- **亮度预算要摊在整条尾迹上**：只提头部会变成「几乎看不见的针尖」，实测诊断图曾因此连续两轮判为不可辨。密度提高后同屏多颗光带会局部叠加，画面峰值实测 112–151/255（`verify108` B2 / `online108` B1 上限同步到 0.67，仍低于改造前单颗 0.72+）。
- 🔴 **启动路径只重建一次底噪**：`readColor()` → `resize()`（内部 `buildDust()`），不要退回「`resize()` 用默认色画一遍 → `refreshColors()` 再重画一遍」，dpr2 下会偶发 ~55ms 首屏 longtask（第 109 轮 A/B 实测：特效开 1/3 次有 56ms、修后 0/3）。
- 融合：内容区（页眉 / 卡片 / 当前视图面板）亮度乘 `0.72`；矩形每秒低频刷新一次，**不在每帧查 DOM**；每颗粒子出生时锁定颜色，主题切换时在屏粒子不突变。
- 🔴 功能契约不许动：两态开关 `#fx-seg`、`localStorage` 键 `fx-mode`、`prefers-reduced-motion`、页面隐藏暂停 / 恢复、resize 160ms 节流、窄屏 DPR 降级、`#fx-canvas` 的 `pointer-events:none` + `z-index:20` + 打印隐藏、`window.__fx` 的 `mode/toggle/onChange`。
- 🔴 测特效亮度必须**逐像素**采样（头部亮点只有 1–3px，每 4/16 像素抽 1 会大幅低估峰值）；观察窗要 ≥5s（ttl 1.6–2.6s、生成间隔 1–2.5s），窗口太短会整段错过峰值而假红。

---

## 七、当前状态（2026-11-05，第 109 轮）

| 项 | 值 |
|---|---|
| 线上 / 本地 | ✅ **线上 = 本地（第 109 轮已上线）**，0 ahead / 0 behind；状态行不写死 commit hash，避免下次发布即过期 |
| 版本参数 | 线上 / 本地一致：`style.css?v=133` / `app.js?v=119` / `fx.js?v=18` |
| 主题 | `cream` 暖阳米 + `cinema` 影院黑；深色系统首次访问直接是影院黑 |
| 本地回归 | 11 个活跃套件 **284 条 0 FAIL**（`verify108` **24** / `verify106` 21 / `verify105` 24 / `verify104` 23 / `verify103` 32 / `verify6` 35 / `verify54` 23 / `verify82_index` 16 / `verify83_index` 32 / `verify91` 29 / `verify92` 25） |
| 线上复验 | 6 套件 **94 条 0 FAIL**（`online102` 16 / `103` 14 / `104` 24 / `105` 17 / `106` 12 / `108` 11）；`online108` 直接 fetch 线上 `fx.js` 核对第 109 轮密度参数 |
| 性能（线上热 CDN 3 次中位） | FCP/LCP **772/1300ms**、首行榜单 1885ms、**CLS 0.000**、二次访问 FCP 56ms、滚动 P50 17ms / **>50ms 帧 0** |
| 第 109 轮本地实测（3 次取样） | 二次访问 FCP **60ms**（≤100ms）、**CLS 0.000**、滚动 P50 **17ms** / P95 18–19ms / **>50ms 帧 0**、首屏与滚动 longtask **0**；A/B 特效开 / 关各 3 次均无 longtask |
| 数据规模 | 以 `docs/data/meta.json` 为准（每日快照会变，别写死数字） |

### 🔴 三条性能红线（不许退化）

二次访问 FCP ≤ 100ms ｜ 滚动 >50ms 的帧 = 0 ｜ CLS = 0.000。
动 CSS / 图片必须同跑功能回归 + **两套主题 × 五档宽度**（1440 / 1280 / 1088 / 900 / 390）截图比对；性能需 3 次以上取中位（同配置 LCP 波动 1080–2872ms）。

⚠️曾有「TTFB ≈400ms 与文件大小无关 → 少一个请求 > 少 10KB，但只在串行时成立」；**性能改动必须 A/B 实测**（内联 CSS 单连接快 396ms、HTTP/2 反而慢 103ms，线上实测更差已回退）。

---

## 八、标准工作流

```bash
# 0) 本地静态服务（docs/ → 8895，必须后台跑，否则会被 shell 结束时杀掉）
cd docs && C:/Users/33329/.workbuddy/binaries/python/envs/default/Scripts/python.exe -m http.server 8895 --bind 127.0.0.1

# 1) 改代码：docs/style.css、docs/app.js、docs/index.html
# 2) bump 版本号（只 bump 改过的那条键，覆盖第二节列出的全部字面量形态）
# 3) 跑回归 —— 🔴 必须 cd 到仓库根（verify91/92 按 cwd 找 docs/app.js）
NODE="C:/Users/33329/.workbuddy/binaries/node/versions/22.22.2-6/node.exe"
for s in verify6 verify54 verify82_index verify83_index verify91 verify92 verify103 verify104 verify105 verify106 verify108; do
  "$NODE" tests/verify/$s.mjs | tail -2
done

# 4) 性能红线抽查
"$NODE" tests/tools/perf-audit.mjs http://127.0.0.1:8895/index.html 本地

# 5) commit（未收到「推送」指令就不推）
# 6) 推送：先 git fetch，落后就 git merge origin/main（**不要 rebase、不要 --force**）
# 7) 等 Pages 生效：轮询 index.html 的版本号指纹（带 ?t= 破缓存，max-age=600，可能要 1~7 次）
# 8) 线上复验：online102/103/104/105/106/108（新轮次另建 onlineNNN.mjs）
```

- 新功能＝新轮次 + 新建 `tests/verify/<下一号>.mjs`；**旧套件留档，不为跑绿调阈值**。
- 🔴 新套件一律用 `new URL('../../', import.meta.url)` 定位仓库根（`verify105` 起），彻底摆脱 cwd 依赖。
- Playwright 不在项目依赖里，脚本统一用 `createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/')` 再 `require('playwright')`，启动参数加 `--no-proxy-server`（本机 hosts 把 github 域名指到 127.0.0.1）。

---

## 九、高频坑（都踩过）

**测量类**

- `.card-value` 有 **900ms countUp**，量宽度 / 折行必须等 ≥1.2s，否则量到中间值。
- **`getClientRects().length` 对 block 恒为 1**，判折行要用 `Range.selectNodeContents()` + 按 `top` 去重。
- **右对齐 + `overflow:visible` 的文字向左溢出，`scrollWidth - clientWidth` 恒为 0**（测不出）→ 临时改 `text-align:left` 再量。
- **Range 包围盒不含 `::after`**。
- **`transform` 已作用时，前后两次 `getBoundingClientRect()` 一样** → 量位移要临时置 `transform:none`。
- **`1fr` 的 min 是 0**：关键列要写 `minmax(140px,1fr)` 给下限。
- Playwright：`page.evaluate(fn,a,b)` 只收一个参数（多传报错，包成对象）；取「当前视图不存在」的元素返回 null；多属性过渡的 `transitionTimingFunction` 是逗号分隔多段。

**实现类**

- `.rank-item` / `.sk-row` / 静态骨架 / `rankSkeleton()` **四处列模板必须逐字一致**。
- 删功能要三处一起清（JS 生成 / CSS 规则 / 静态骨架），否则留死代码或空 `::after`。
- 批量删代码块后**必须开页面跑一次**：`node --check` 全绿但页面可能空白（删 `var x` 连带吞掉相邻 `var`）。
- 解析 CSS 规则前**先剥注释**，注释里别写像选择器的字面量。
- ⚠️代理判据会过期：不调阈值，换页面自身约束（不横向溢出 + `scrollWidth ≤ clientWidth`）。

**流程类**

- **别用 shell heredoc 或 `node -e` 写含反引号的内容** → 反引号会被当成命令替换，内容吃空。一律用写文件工具。
- 本地静态服务用 `&` 起会随命令结束被杀 → 必须后台任务方式启动，命令前先 curl 探活。
- 「线上 == 本地」断言会假红 → 跑前先 `git fetch`。
- 改文件用 Node 读写、**禁 `sed -i`**（autocrlf 剥 CRLF）；替换脚本带「匹配数=1」守卫。
- 对 github.com 间歇 502 / SSL EOF → **push 要轮询重试**。
- 合并远端别用 rebase（工作区常有另一线几十个未提交文件，`git merge` 只动双方都改过的路径）。

---

## 十、已知短板与待办候选

1. **成就卡首次加载慢**（`achievements.json` 62KB gzip，一次给）—— 可考虑分片，或列表页只取必要字段。
2. `timeline_extra` 可外置，但只省约 25ms、请求数不变，ROI 低。
3. `app.js` 单文件较大，可拆但收益需实测（零构建下多文件 = 多 RTT，**不一定更快**）。
4. 窄屏仍是「两行」卡片式，信息密度可再优化。
5. 热力图字号与分档已定稿，改动前先看 `verify90` 的余量断言。
6. 第 104 轮「只能由最近游玩栏进入」目前只在**导航卡层面**成立；内容层入口仍在。用户未确认是否要连这些一起收紧。

> ⚠️ **审美类改动（加列 / 改间距 / 右移多少 px / 换配色）属于需求判断，不是实现细节**：先给 2~3 个方案 + 预期效果让用户选，不要做完再让人看效果——本界面曾因此返工四轮。

---

## 十一、验收口径

任何一次改动交付前，至少确认：

- [ ] 11 个活跃本地套件全绿（当前 284 条，0 FAIL）；历史留档套件不调阈值
- [ ] 1440 / 1280 / 1088 / 900 / 390 五个宽度**无横向溢出**
- [ ] 两套主题（cream / cinema）× 多宽度截图看过，无错位、对比度足够；切回 cream 时无颗粒/暖光残留
- [ ] CLS = 0.000，滚动 >50ms 帧 = 0，二次访问 FCP ≤100ms
- [ ] 版本参数已 bump（且只 bump 改过的那条）；改主题时四处同步已核对
- [ ] 未收到推送指令则不推送；推送前 `git fetch`，禁 `--force` / `rebase`
- [ ] 上线后跑对应 `onlineNNN.mjs`，确认线上取到的 CSS/JS 与本地一致
