# Steam 游戏时长统计界面 · 交接提示词

> **用法**：新开一个对话，把本文件**全文**粘进去即可无缝续做，不需要再解释项目。
> **范围**：只研究 `docs/index.html`（Steam 游戏时长统计界面）。
> **明确排除**：`docs/watch.html` 观影列表（Watch List）及其 `watch.*` / `data/watch.json` / `img/watch/` 全套资源，本文件不涉及、也不要去改。

---

## 一、这是什么

一个**零构建**的纯静态站点（没有打包器、没有 npm build 产物），托管在 GitHub Pages：

- 线上：<https://hyouka-721.github.io/Steam-playtime/>
- 仓库：`Hyouka-721/Steam-playtime`，本地 `C:\Users\33329\WorkBuddy\2026-10-13-18-17-49\steam-playtime`
- 发布根 = `docs/` 目录本身（**改 `docs/` 里的文件就等于改线上**）
- 数据每天由 GitHub Actions（UTC 15:30 = 北京 23:30）抓 Steam → 差分 → 生成 `docs/data/*` 并提交

页面做的事：把你 Steam 库里每款游戏**玩了多久、最近哪天玩过、成就解锁多少**可视化——概览卡 + 时长排行榜 + 近两周榜 + 成就榜 + 游玩时间轴 + 每日热力图。

---

## 二、技术栈与不可违反的硬约束

| 项 | 值 / 规则 |
|---|---|
| 前端 | 原生 HTML + CSS + ES2020 JS，**无框架、无构建、无外部 CDN** |
| 字体 | 本地 `docs/blackrose.woff2`（woff 兜底），标题族；正文走系统字体栈 |
| 数据格式 | 静态 JSON，`docs/data/{meta,achievements}.json` + `docs/data/daily/YYYY-MM.json` |
| 首屏数据 | `meta` + 当月 `daily` 由 `scripts/build/inline-boot.mjs` **内联**进 `index.html`（约 49KB），避免首屏多一个 RTT |
| 缓存 | `docs/sw.js`：`index.html`/`meta`/`daily` 网络优先，图片 cache-first，成就 `stale-while-revalidate`（缓存名 `app-data-v2`） |
| 主题 | 四套：`cream`（默认）/`mint`/`dawn`/`night`，全部走 `[data-theme="x"]` 上的 CSS 变量 |
| 响应式 | 桌面 ≥861px 单套布局；≤860px 转「两行」窄屏布局；`.cards` 另有 1080 / 720 断点 |

### 🔴 三条发布纪律（违反必炸）

1. **改 `docs/style.css` 必须 bump `style.css?v=NN`；改 `docs/app.js` 必须 bump `app.js?v=NN`**（现为 `?v=130` / `?v=115`）。两者独立，都改就都 bump。
   - 事故前科：只 bump CSS 没 bump JS，用户缓存里的旧 JS 调用了已删除的 DOM 节点 → 抛 TypeError → **热力图整块空白**。**本地永远复现不出来**（服务端直接给最新文件）。
2. **同批次反复改同一文件，每次都要再 bump**。一次发布里改了 3 次 CSS 却只有一个版本号 → 用户命中第一版的缓存。
3. **`docs/` 就是线上**：不要在里面放临时文件、草稿、`.bak`。

---

## 三、目录地图（2026-11-04 重组后）

```
steam-playtime/
├── docs/                      ← 发布根（GitHub Pages 直接托管这个目录）
│   ├── index.html             49KB，含内联的首屏数据块（勿手改内联区）
│   ├── app.js                 85KB，全部页面逻辑（渲染 / 视图切换 / 下钻 / 交互）
│   ├── style.css              109KB，全部样式 + 四主题变量
│   ├── fx.js                  14KB，纯装饰层（流星 / 光点），低优先级加载
│   ├── sw.js                  Service Worker
│   ├── manifest.webmanifest   PWA 清单
│   ├── blackrose.woff2/.woff  标题字体
│   ├── data/                  线上数据（由 build 生成，勿手改）
│   └── img/                   图标、封面、头像素材
│       ├── covers/            <appid>-320.webp（srcset 小图）与原图
│       └── watch/             ← 观影页资源，本任务不涉及
├── scripts/
│   ├── pipeline/              每日流水线（CI 调这 4 个）
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
│   ├── online/                上线后对 Pages 的复验
│   └── tools/
│       ├── perf-audit.mjs     首屏 / 卡片切换 / 滚动性能审计
│       ├── perf-lazy.mjs      按需加载耗时
│       ├── ab-css.mjs         A/B 对照（同机、固定限速）
│       └── archive/           历史一次性脚本（取证截图 / 版本号 bump / 数据合并），留档备查
├── data/                      原始数据（快照 / 差分 / 成就 / 中文名覆盖），永久保留
├── CONTINUE-GAMETIME.md       本文件
└── README.md                  项目说明（部署 / Secrets / 数据 Schema）
```

---

## 四、页面结构与数据流

### 五个视图（`.view`，靠顶部 `.cards` 里的 `.card-nav` 切换）

| 视图 | 元素 | 内容 |
|---|---|---|
| `lifetime` | `#lt-main` / `#lt-detail` | **主视图**。终身时长排行榜；点任一行 → 下钻到按月热力图 |
| `recent` | `#recent-list` | 近 14 天游玩榜（同样用 `.rank-item` 网格） |
| `ach` | `#ach-list` | 成就榜（全站完成率最高的成就） |
| `timeline` | `#tl` | 按周分组的游玩里程碑时间轴 |
| `data` | 导出 / 采集健康度 / 关于数据 | 三个说明型面板 |

### 排行榜行的网格（**最重要的一块布局**）

`.rank-item` 是 6 列 grid，**最近榜与终身榜共用**：

```
44px          130px               minmax(150px,260px)  minmax(140px,1fr)  150px    110px
序号 rank-no   封面 capsule-wrap   名称 rank-name       进度条 rank-bar      时长 rank-min  日期 rank-last
```

实测（1440 视口）：`44 / 130 / 260 / 552 / 150 / 110`，横向溢出 0，53 个游戏名在 ≥1088 时 0 截断。

附加规则：

- **进度条** `.rank-bar` 有 `margin-left:-30px; margin-right:-20px` → 两端各探出（总宽 = 网格区 + 50，1440 下 **602px**）。左端探进名称列 16px，所以 `.rank-name` 必须有 `padding-right:22px` 让位。
- **时长** `.rank-min` 居中 + `transform: translateX(40px)`（用户实测要求，累计右移 40px）。
- **日期** `.rank-last` 固定 110px、右对齐、**只有纯日期**（如 `2026-10-25`）。相对时间（「9 天前」）已被用户要求**彻底删除**，别加回来。
- **骨架屏** `.sk-row` 的列模板必须与 `.rank-item` **逐字一致**；`index.html` 里还有 8 行**静态预置骨架**（随首个字节显示，不等 JS）。改列宽要三处同改：`.rank-item` / `.sk-row` / 静态骨架 + `rankSkeleton()`。
- ≤860px 时进度条改横跨前两列、负边距清零，日期整列隐藏。

### 首屏与渲染时序

1. `index.html` 自带内联的 `meta + 当月 daily`，所以**首屏不等网络就能画**；
2. `app.js` 执行 → `renderLifetime()` 替换骨架 → 封面图按 `IntersectionObserver` 临近视口才赋 `src`；
3. `achievements.json` 只在切到成就卡时拉，第二次走 SWR；
4. `fx.js` 最后加载（`defer fetchpriority=low`），只做装饰。

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

`docs/data/daily/YYYY-MM.json`：按月的每日分钟数，热力图与「近 14 天」都从这里算。
`docs/data/achievements.json`：成就定义 + 解锁状态 + 全球完成率。

---

## 六、视觉契约（动 CSS 前必读）

- **站名**：`<title>` = `Game Time`；页眉 `h1` = **`My Game Time`**（两者独立，别顺手改另一个）。
- **`.site-title` 有 `width:6.73em; white-space:nowrap`**（≥861px）：为消 CLS —— 字体未到时回退字体更宽会折行、把页眉从 112 撑到 224。**改站名文案必须同步改这个 em 值**。
- **`--bg-layers` 是 5 层**（4 层径向 + 1 层 `linear-gradient(165deg,…)` 方向光），`body` 另铺 140×140 SVG 噪点。改背景**别把噪点冲掉**。
- **`--inset-shine` 只给 `.h-item`/`.rp-cell`/`.heat-mb`/`.hm-none` 四个真区块**；`--sunken` 有 20 多处小元素，全局加会像坏点。
- **`.card-nav.active` 必须带 `var(--card-shine)`**（曾被整条 box-shadow 覆盖，导致选中的卡反而没高光）。
- **`.panel` 的 padding 18 / `.panel-head` 的 margin 14 不能动** —— `verify49` 有五条精确几何断言（面板边框到首行 = 1 + 18 + 18 = 37px），是「不许靠改 padding 补偿」的守卫。
- **`.cards` 断点 1080**：721~1080 六列底网格、≥1081 五列、≤720 单列；**1081 是最窄安全宽度**。
- **热力图余量只有 1~2px**：`.heat-pair` gap、`.heat-mb` 内边距、`.hc` 字号三者联动；卡片内边距分档 0 / 6px / 14px（900~1024 / 1025~1100 / ≥1101）。`verify90` 专量。
- **`.tl-week` 14.5px**、里程碑正文 14 / 数字 16，不在字阶归一范围。
- 图标：文件名带源图 hash（`<用途>-<md5 前8>.png`），换素材＝换 URL；`sw.js` 对 png 是 cache-first，**固定名会被旧缓存挡住**。

---

## 七、当前状态（2026-11-04）

| 项 | 值 |
|---|---|
| 线上提交 | `24ca89b` |
| 版本参数 | `style.css?v=130` / `app.js?v=115` / `fx.js?v=16` |
| 本地回归 | index 侧 **11 套件 451 条 0 FAIL** |
| 线上复验 | `tests/online/online102.mjs` **16 条 0 FAIL** |
| 性能（线上热 CDN 3 次中位） | FCP/LCP **772/1300ms**、首行榜单 1885ms、**CLS 0.000**、二次访问 FCP 56ms、滚动 P50 17ms / **>50ms 帧 0** |
| 数据规模 | 38 款已游玩（终身 1395h）、20 天追踪、成就 842/2504 |

### 🔴 三条性能红线（不许退化）

二次访问 FCP ≤ 100ms ｜ 滚动 >50ms 的帧 = 0 ｜ CLS = 0.000。
动 CSS / 图片必须同跑功能回归 + 四主题 × 多宽度截图比对。

---

## 八、标准工作流

```bash
# 0) 本地静态服务（docs/ → 8895，必须后台跑，否则会被 shell 结束时杀掉）
cd docs && C:/Users/33329/.workbuddy/binaries/python/envs/default/Scripts/python.exe -m http.server 8895 --bind 127.0.0.1

# 1) 改代码：docs/style.css、docs/app.js、docs/index.html
# 2) bump 版本号（只 bump 改过的那条键）
#    三种字面量形态要一起覆盖：style.css?v=130 / style\.css\?v=130 / cssV === '130'
# 3) 跑回归（Node 用托管运行时）
NODE="C:/Users/33329/.workbuddy/binaries/node/versions/22.22.2-6/node.exe"
for s in verify6 verify47 verify48 verify49 verify54 verify82_index verify83_index verify88 verify90 verify91 verify92; do
  "$NODE" tests/verify/$s.mjs | tail -2
done

# 4) 性能红线抽查
"$NODE" tests/tools/perf-audit.mjs http://127.0.0.1:8895/index.html 本地

# 5) commit（未收到「推送」指令就不推）
# 6) 推送：先 git fetch，落后就 git merge origin/main（**不要 rebase、不要 --force**）
# 7) 等 Pages 生效：轮询 index.html 的版本号指纹（带 ?t= 破缓存，可能要 1~7 次，约 15~80 秒）
# 8) 线上复验：node tests/online/online102.mjs（或新建 onlineNNN.mjs）
```

Playwright 不在项目依赖里，脚本统一用
`createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/')` 再 `require('playwright')`，
启动参数加 `--no-proxy-server`（本机 hosts 把 github 域名指到 127.0.0.1）。

---

## 九、高频坑（都踩过）

**测量类**

- `.card-value` 有 **900ms countUp**，量宽度 / 折行必须等 ≥1.2s，否则量到中间值。
- **`getClientRects().length` 对 block 恒为 1**，判折行要用 `Range.selectNodeContents()` + 按 `top` 去重。
- **右对齐 + `overflow:visible` 的文字向左溢出，`scrollWidth - clientWidth` 恒为 0**（测不出）→ 临时改 `text-align:left` 再量。
- **Range 包围盒不含 `::after`**。
- **`transform` 已作用时，前后两次 `getBoundingClientRect()` 一样** → 量位移要临时置 `transform:none`。
- **`1fr` 的 min 是 0**：`minmax(150px,340px)` 的邻居会先涨到上限，`fr` 轨只能吃剩下的 → 关键列要写 `minmax(140px,1fr)` 给下限。

**实现类**

- `.rank-item` / `.sk-row` / `index.html` 静态骨架 **三处列模板必须逐字一致**，少一处数据到达时列宽横跳。
- 两榜共用 `.rank-item` 网格 → 给一行加元素必须两处都加，否则整行错位。
- 删功能要三处一起清（JS 生成 / CSS 规则 / 静态骨架），否则留死代码或空 `::after`。
- 批量删代码块后**必须开页面跑一次**：`node --check` 全绿但页面可能空白（删 `var x` 连带吞掉相邻 `var`）。
- 解析 CSS 规则前**先剥注释**，注释里别写像选择器的字面量。

**流程类**

- **别用 shell heredoc 或 `node -e` 写含反引号的内容** → 反引号会被当成命令替换，内容吃空。一律用写文件工具。
- 本地静态服务用 `&` 起会随命令结束被杀 → 必须后台任务方式启动，命令前先 curl 探活。
- 「线上 == 本地」断言会假红 → 跑前先 `git fetch`。

---

## 十、已知短板与待办候选

1. **成就卡首次加载慢**（`achievements.json` 62KB gzip，一次给）—— 可考虑分片，或列表页只取必要字段。
2. `timeline_extra` 可外置，但只省约 25ms、请求数不变，ROI 低。
3. `app.js` 85KB 单文件，可拆但收益需实测（零构建下多文件 = 多 RTT，**不一定更快**）。
4. 窄屏仍是「两行」卡片式，信息密度可再优化。
5. 热力图字号与分档已定稿，改动前先看 `verify90` 的余量断言。

> ⚠️ **审美类改动（加列 / 改间距 / 右移多少 px / 换配色）属于需求判断，不是实现细节**：先给 2~3 个方案 + 预期效果让用户选，不要做完再让人看效果——本界面曾因此返工四轮。

---

## 十一、验收口径

任何一次改动交付前，至少确认：

- [ ] 11 个 index 套件全绿（451 条，0 FAIL）
- [ ] 1440 / 1288 / 1088 / 900 / 390 五个宽度**无横向溢出**
- [ ] 四主题（cream / mint / dawn / night）× 两宽度截图看过，无错位、对比度足够
- [ ] CLS = 0.000，滚动 >50ms 帧 = 0
- [ ] 版本参数已 bump（且只 bump 改过的那条）
- [ ] 未收到推送指令则不推送；推送前 `git fetch`，禁 `--force`
