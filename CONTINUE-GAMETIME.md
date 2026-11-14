# GAME TIME（index 站）· 交接提示词

> **用法**：新开一个对话，把本文件**全文**粘进去即可无缝续做，不需要再解释项目。
> **范围**：只研究 `docs/index.html`（Steam 游戏时长统计界面）及其采集管线。
> **明确排除**：`docs/watch.html` 观影列表及其 `watch.*` / `docs/data/watch.json` / `docs/img/watch/` / `scripts/watch/` / `tests/watch/` —— 本文件不涉及，也不要改。
> **最后同步**：2026-11-14（index 侧第 117b 轮 + 一次全仓清理重组）

---

## 一、这是什么

零构建的纯静态站，GitHub Pages 托管：

- 仓库：`Hyouka-721/Steam-playtime`；本地 `C:\Users\33329\WorkBuddy\2026-10-13-18-17-49\steam-playtime`
- 发布根 = `docs/`（**改 docs 里的文件就等于改线上**）
- 数据链路：GitHub Actions 每天 UTC 15:30（北京 23:30）抓 Steam 快照 → 差分成每日时长 → `scripts/pipeline/build.mjs` 生成 `docs/data/*` → 提交 → Pages 发布
- Steam Web API **没有「某天玩了多久」**：当日时长 = `playtime_forever(今) − playtime_forever(上次快照)`。所以历史不可回溯，首份快照只作基准。

页面内容：概览卡 + 终身时长榜 + 一年点阵热力图 + 成就（勋章墙 + 列表）+ 游戏库时间轴 + 数据页（阶段报告 / 周目标 / 换算 / 采集健康）。

---

## 二、技术栈与硬约束

| 项 | 值 / 规则 |
|---|---|
| 前端 | 原生 HTML + CSS + ES2020 JS，**无框架、无构建、无 CDN** |
| 字体 | `docs/blackrose.woff2` 单文件（woff 兜底已于 2026-11-14 删除），只给标题族；正文走系统栈 |
| 数据 | 静态 JSON：`docs/data/{meta,achievements}.json` + `docs/data/daily/YYYY-MM.json` |
| 首屏 | `scripts/build/inline-boot.mjs` 把 meta + 当月 daily **内联**进 index.html（`window.__BOOT`）；36h 内视为新鲜，过期回退 fetch |
| 缓存 | `docs/sw.js`：html/meta/daily 网络优先，图片 cache-first，成就 SWR；版本号从 index.html 现场解析，不写死 |
| 主题 | **只有两套**：`cream` 暖阳米（浅）/ `cinema` 影院黑（深）；点头像来回切；不要新增 |
| 响应式 | ≥861px 单栏；≤860px 转「两行」窄屏布局；`.cards` 另有 1080 / 720 断点 |

### 🔴 发布纪律

1. **改哪个文件 bump 哪条版本号**：`style.css?v=NN` / `app.js?v=NN` / `fx.js?v=NN` 三条独立（当前 `142 / 127 / 19`）。同批次再改同文件就再 bump 一次。
2. bump 要覆盖多种字面量：`style.css?v=NN`、正则转义 `style\.css\?v=NN`、裸串 `cssV === 'NN'` / `appV === 'NN'` / `CSS_V` / `APP_V`。**只改 docs + tests/index + tests/tools/pages-poll，不碰 tests/online 历史与 tests/retired**。
3. **没收到「推送」指令就不推**；推送前 `git fetch`，落后就 `git merge origin/main`（**禁 rebase、禁 --force**）。
4. `docs/` 就是线上，不放临时文件 / 草稿 / `.bak`。

---

## 三、目录地图（2026-11-14 清理后）

```
steam-playtime/
├── docs/                      ← 发布根
│   ├── index.html             含内联 __BOOT 数据块 + 首屏主题白名单（勿手改内联区）
│   ├── app.js                 全部逻辑（渲染 / 视图 / 主题 / 点阵 / 榜单行高）
│   ├── style.css              全部样式 + 两套主题变量
│   ├── fx.js                  装饰层（流星），低优先级加载
│   ├── sw.js / manifest.webmanifest / blackrose.woff2
│   ├── data/                  线上数据（build 产物，勿手改）
│   └── img/                   图标、游戏胶囊、头像；img/watch/ 属观影页
├── scripts/                   采集侧
│   ├── pipeline/              fetch / diff / localize / build / backfill-percent
│   ├── build/inline-boot.mjs  内联首屏数据
│   ├── lib/                   steam / dates / diff-core（纯模块）
│   ├── media/                 封面变体、图标（手动跑）
│   └── watch/                 观影页录入（不涉及）
├── data/                      原始快照 snapshots/ + daily/ + achievements/ + overrides/ + manual/
├── tests/
│   ├── index/                 【本文件关心】16 个活跃套件 + README（逐个套件守什么）
│   ├── watch/                 观影页套件（不涉及）
│   ├── retired/               已停用的历史套件（不跑、不改判据）
│   ├── unit/                  采集/差分单元测试（npm test，35 用例）
│   ├── online/                上线后线上复验
│   └── tools/                 常驻工具 + probes/（可复用探针）
├── README.md                  部署 / Secrets / 数据 schema
└── CONTINUE-GAMETIME.md       本文件
```

🔴 脚本靠 `path.resolve(__dirname,'..','..')` 找仓库根：**再挪层级必须同步改 + `package.json` 的 5 条 + `.github/workflows/daily.yml` 的 4 条**，否则夜间 CI 静默失败。验证 = 实跑 `node scripts/pipeline/build.mjs`，产物只应差 `generated_at`。

---

## 四、页面结构与数据流

### 五个视图（顶部五张导航卡，`#view-<name>`）

| 视图 | 内容 |
|---|---|
| `lifetime` | 终身时长榜 `#lt-list`（**行不可点**，只悬停换底纹 + 背景联动） |
| `recent` | 一年点阵 `#hx-root` + 概览小字 + 年份下拉 + 点格子展开的当日列表 `#hx-day` |
| `ach` | 全成就勋章墙 `#badges`（展示块，不可点）+ 成就列表 `#ach-list` |
| `timeline` | 按周分组的游玩时间轴 |
| `data` | 阶段报告 `#report` / 周目标 `#pace` / 换算 `#convert` / 采集健康 `#health` |

### 导航入口（第 103/104 轮定稿，改这里＝改需求）

- **导航层只有「最近游玩」卡进点阵**（`#card-recent`）；`#card-lifetime` 只负责回累计榜。
- **内容层没有下钻**：榜单行、勋章、旧深链 `#/recent/g/<appid>` 全部不再进入任何「单游戏详情」。旧深链仍可访问，但只按视图处理落到总览。

### 首屏渲染时序

1. index.html 内联脚本先定 `data-theme`（白名单 + 系统深浅回落），自带 `__BOOT` 数据；
2. app.js → `renderLifetime()` 换掉骨架 → 胶囊图按 IntersectionObserver 懒加载；
3. `paintSkeletons()` 之后立刻 `fitRankRows()` 定行高（骨架也吃同一变量 → CLS 0）；
4. `achievements.json`（285KB）只在切到成就卡时拉；
5. `fx.js` 最后加载，纯装饰。

---

## 五、数据契约

`docs/data/meta.json`（脱敏，不含完整 steamid）：

| 字段 | 说明 |
|---|---|
| `generated_at` / `generated_at_local` | 生成时间（UTC / 北京日期）；内联新鲜度按它判 |
| `tracking_since` / `last_snapshot_date` | 统计起点（2026-10-13）/ 最新快照日 |
| `stats` | `lifetime_minutes` / `total_minutes` / `tracked_days` / `active_days` / `current_streak` / `longest_streak` / `week_minutes` / `played_games` / `best_day{date,minutes}` |
| `games_lifetime` | `{appid: {name, lifetime_minutes, last_played, img_icon_url}}` |
| `ach_stats` / `ach_perfect` | 成就摘要 / 全解锁游戏列表 |
| `months` | 已产出的月份文件列表 |

`docs/data/daily/YYYY-MM.json`：`days[date] = {total_minutes, games[{appid,name,minutes,is_new}]}`（热力图与当日列表的唯一来源）

⚠️ appid `431960` 显示名 = `Wallpaper Engine`（源头 `data/overrides/game-names.json`）。合并远端数据时 `index.html` 的 BOOT 行必冲突：取远端最新数据，再把中文名换回英文，**结构/版本号保留我方**。

---

## 六、视觉与行为契约（动之前必读）

### 一年点阵（第 111~113 轮）

- 形态：7 行（周一→周日）× 53 周列 + 11 个月份间隙列 = **64 列**，一格 = 一天。
- 几何：`hxFit(cols, spaces)` 按容器宽度反解 `--hx` / `--hx-gap` / `--hx-mgap`，各宽度 `fill` 恒 **1.000**；改窗口只改这三个变量（160ms 防抖），不重绘 365 个节点。
- 行距：`--hx-rowgap = --hx-gap × 0.5`（`.hx-grid` / `.hx-dow` 用 `column-gap` + `row-gap` 分开写）。
- 深浅：相对本年度峰值四档 `l1~l4`；`l0` = 0 分钟；`lna` = 未采集（**不给 role/tabindex**，不可点）。
- 气泡默认在格子下方 9px，第 5~6 行才 `is-up` 上弹（否则盖住面板标题）。
- 点格子 → `#hx-day` 展开当天列表（复用 `capsuleHtml`，**插入后必须 `observeCapsules(box)`**），再点收起、Esc 收起；**点开不许整页滚动**（只有列表头在视口外才轻推）。

### 统计口径（第 116 轮）

`hxScope()` = `[meta.tracking_since, meta.last_snapshot_date]`；`hxMinutes(date)`：范围内缺记录返回 **0**，范围外返回 `null`。
**取数 / 可点性 / 气泡 / 当日列表文案四处必须同源**，否则出现「格子是 0 档但点不动」。
范围外（开始统计之前 + 最新快照之后的未来）仍是 `.lna`「尚未记录」。

### 首屏榜单整行（第 117 轮）

`fitRankRows()`：可用高度 = 视口高 − **第一行顶边** − pad；先试 8 行，行高落在 74~100px 就用 8 行，屏幕偏高多放、偏矮少放 → **折线永远落在行与行之间**。
`.rank-item` / `.sk-row` 都吃 `min-height: var(--rank-row-h)`。
🔴 `pad(4) 必须 ≤ gap(6)`：否则下一行会从折线上冒一条 1px 边。
🔴 度量基准**必须是第一行顶边**，不能用容器顶边（`.rank-list` 有 18px `padding-top`）。
窄屏 ≤860 不参与（两行式布局），移除该变量。

### 排行榜行（第 99~102 轮定稿）

`44px / 130px / minmax(150,260) / minmax(140,1fr) / 150px / 110px`；进度条不能写裸 `1fr`、日期必须固定 110px；`.rank-bar` 左右 `-30/-20` 负边距，`.rank-name` 补 `padding-right:22px`；≤860 负边距清零。

### 主题（第 105/106 轮）

改主题必须四处同步：`style.css` 变量块、`app.js` 的 `THEMES`、`index.html` 首屏 `var ids` 白名单、活跃套件里硬编码的主题列表。
cinema 专属规则必须带 `[data-theme="cinema"]` 前缀（切回 cream 时 `body::before` 的 `background-image` 必须为 `none`）。

### 其他固定值

- `<title>` = `Game Time`；页眉 h1 = `My Game Time`；`.site-title` 有 `width:6.73em; white-space:nowrap`（改文案要同步）。
- `.panel` padding 18 / `.panel-head` margin 14 不许动。
- `.cards` 断点 1080；1081 是最窄安全宽度。
- 图标文件名带源图 hash；`sw.js` 是 cache-first，固定名会被旧缓存挡住。

---

## 七、当前状态（2026-11-14）

| 项 | 值 |
|---|---|
| 版本 | 本地 `style.css?v=142` / `app.js?v=127` / `fx.js?v=19`；线上 `141 / 127 / 19`（本轮清理只动了 CSS 并删了字体兜底，**未推送**） |
| 本地回归 | index 侧 **16 套件 370 条 0 FAIL**（`tests/index/`）；单元测试 **35 条 0 FAIL** |
| 线上复验 | 最新 `online117` 13 条 0 FAIL（141/127 时跑的） |
| 性能红线 | 二次访问 FCP ≤100ms / 滚动 >50ms 帧 = 0 / **CLS = 0.000** |
| 数据规模 | 以 `docs/data/meta.json` 为准，别写死数字 |

### 已知遗留

1. `verify56` B11（watch 侧）「两页页眉高度相同」差 1px：index 的 `.site-header` 第 97 轮加了 `border-bottom:0`，watch 的 `.w-header` 一直是 1px。**不许减 1px 抹平**，要修就统一其中一侧。
2. 线上套件（`tests/online/`）各自钉着当时上线的指纹，**不会跟着 bump**，复跑旧套件会因版本号不符而红，属预期。

---

## 八、标准工作流

```bash
# 0) 本地静态服务（必须后台任务方式起，`&` 会被 shell 退出杀掉）
cd docs && C:/Users/33329/.workbuddy/binaries/python/envs/default/Scripts/python.exe -m http.server 8895 --bind 127.0.0.1

# 1) 改 docs/{index.html,app.js,style.css}；注意本机 core.autocrlf=true ——
#    脚本改文件先 replace(/\r\n/g,'\n') 归一，写完按原样还原

# 2) bump 版本号（只 bump 改过的那条）

# 3) 跑 index 全部套件（cwd 必须是仓库根）
NODE="C:/Users/33329/.workbuddy/binaries/node/versions/22.22.2-6/node.exe"
for s in verify6 verify54 verify82_index verify83_index verify91 verify92 \
         verify103 verify104 verify105 verify106 verify108 verify111 \
         verify113 verify115 verify116 verify117; do
  echo "== $s =="; "$NODE" tests/index/$s.mjs 2>&1 | tail -2
done

# 4) 单元测试 / 构建自检
"$NODE" --test tests/unit/diff.test.mjs tests/unit/steam.test.mjs
"$NODE" scripts/pipeline/build.mjs        # 产物只应差 generated_at

# 5) commit（未收到「推送」指令就不推）
# 6) 推送：git fetch → 落后就 merge → 重跑套件 → push（失败重试）
# 7) 轮询：node tests/tools/pages-poll.mjs（css + app 两件字节 md5 都比，单比 CSS 会假 READY）
# 8) 线上复验：新建 tests/online/online<轮号>.mjs
```

- 新功能 = 新轮次 + 新建 `tests/index/verify<轮号>.mjs`；**旧套件不删、不调阈值**；功能被删除时把旧套件移到 `tests/retired/`。
- 新套件用 `new URL('../../', import.meta.url)` 定位仓库根（`tests/index/` 与 `tests/verify/` 同深度，路径不用改）。
- Playwright 不在依赖里：`createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/')` 再 `require('playwright')`，启动加 `--no-proxy-server`（本机 hosts 把 github 指到 127.0.0.1）。

---

## 九、高频坑（都踩过）

**测量类**

- `.card-value` 有 900ms countUp，量宽度/折行要等 ≥1.2s。
- `getClientRects().length` 对 block 恒为 1；判折行用 `Range` + 按 `top` 去重。
- 右对齐 + `overflow:visible` 的文字向左溢出，`scrollWidth - clientWidth` 恒 0 → 临时改 `text-align:left` 再量。
- `transform` 生效时前后 rect 一样 → 量位移要临时置 `none`。
- `1fr` 的 min 是 0 → 关键列写 `minmax(140px,1fr)`。
- Playwright `page.evaluate(fn, a, b)` 只收一个参数（包成对象）。

**实现类**

- `.rank-item` / `.sk-row` / 静态骨架 / `rankSkeleton()` **四处列模板逐字一致**。
- `.hx` / `.ctrl` / `.badge` 自带 `display`，**`[hidden]` 无效** → 隐藏要用类选择器。
- 删功能三处一起清（JS 生成 / CSS 规则 / 静态骨架），否则留死代码。
- 批量删代码后**必须开页面跑一遍**：`node --check` 全绿但页面可能白屏。
- 解析 CSS 规则前先剥注释，注释里别写像选择器的字面量。
- 套件里判「未采集」用 `classList.contains('lna')`，**不是 `'na'`**（写错就是假红）。
- 代理判据会过期（如「行数相同」）：换页面自身约束，别调阈值。

**流程类**

- **别用 shell heredoc / `node -e` 写含反引号的内容**（会被当命令替换吃空）；一律写文件。
- 本地静态服务用后台任务起；命令前先 curl 探活（`502` 说明没起）。
- 「线上 == 本地」断言会假红 → 跑前先 `git fetch`。
- 改文件用 Node 读写，**禁 `sed -i`**；替换脚本带「命中数 = 1」守卫。
- 对 github.com 间歇 502 / SSL EOF → push 要轮询重试。

---

## 十、已知短板与下一步候选

1. **游戏元数据缺失**：Storefront `appdetails`（类型/标签/发行商/价格）抓一次缓存进 `data/cache/` → 品类时长分布 + 「每小时成本」榜。**信息增量最大，优先做。**
2. **采集健康度埋得太深**：某天未采集时应在首屏给一行提示，让「补 0」透明。
3. **无周/月聚合**：点阵只有「日」，可加「按周柱状」与「本周 vs 上周」。
4. **榜单无处可筛**：24 行只能按时长排，可加「按最近游玩 / 完成度 / 本周」与名称搜索。
5. **成就节奏**：`achievements[].ts` 已在手，按天聚合就能画「解锁速度 / 最快通关 / 稀有成就时间线」。
6. `app.js` 已 ~62KB 单文件：零构建下多文件 = 多 RTT，**拆分收益需实测**，别想当然。

> ⚠️ **审美类改动（加列 / 改间距 / 位移 px / 换配色）属于需求判断**：先给 2~3 个方案 + 预期效果让用户选，不要做完再让人看效果——本界面曾因此返工四轮。

---

## 十一、验收口径

- [ ] `tests/index/` 16 套件全绿（370 条，0 FAIL）；`tests/retired/` 不跑
- [ ] 1440 / 1280 / 1088 / 900 / 390 五档**无横向溢出**
- [ ] 两套主题 × 多宽度截图看过，切回 cream 无颗粒/暖光残留
- [ ] CLS = 0.000；滚动 >50ms 帧 = 0；二次访问 FCP ≤100ms
- [ ] 版本号已 bump（只 bump 改过的），主题改动四处同步
- [ ] 未收到推送指令不推；推送前 fetch，禁 `--force` / `rebase`
- [ ] 上线后跑 `online<轮号>.mjs`，确认线上 CSS/JS 与本地字节一致
