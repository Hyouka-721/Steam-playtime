# Steam 游戏时长统计界面 · 交接提示词（可直接复制到新对话）

> 用途：新对话里**只研究 Steam 游戏时长统计界面**（`docs/index.html`），无缝续做。
> **范围明确排除**：`docs/watch.html` 观影列表（Watch List）及其全部配套，本提示词不涉及。
> 复制下面整段作为开场即可，模型无需你再解释项目。

---

## 一、这个界面是什么

一个**零构建纯静态站**，托管在 GitHub Pages，主页就是「Steam 游戏时长统计」。

- 每晚 23:30（Asia/Shanghai）由 GitHub Actions 自动抓 Steam 快照 → 差分算每日时长 → 生成前端数据并提交。
- 核心玩法：**每日快照差分**。Steam API 只给 `playtime_forever`（累计分钟），没有「某天玩了多久」，所以 `当日时长 = 今日累计 − 上次快照累计`。由此两点硬限制：① 历史无法回溯（数据从第一份快照起积累）② 首份快照不产出时长，只当基准。
- 前端数据**内联进 `docs/index.html`**（`window.__BOOT = {generated_at, meta, daily}`），首屏**零数据请求**。

仓库：`C:\Users\33329\WorkBuddy\2026-10-13-18-17-49\steam-playtime`
远端：`github.com/Hyouka-721/Steam-playtime`（main）｜线上：`hyouka-721.github.io/Steam-playtime/`

## 二、目录结构（只列游戏时长这侧）

```
docs/                        # = GitHub Pages 发布根 = 源码（零构建）
├── index.html               # 主页：源文件+构建产物二合一，CI 每晚改写（内联 __BOOT）
├── style.css / app.js / fx.js  # 游戏站 样式 / 逻辑 / 特效（meteor）
├── data/
│   ├── meta.json            # 统计汇总（含 ach_stats: {unlocked,total,pct,games}）
│   ├── achievements.json    # 成就明细（285KB，按需加载，不进首屏）
│   └── daily/YYYY-MM.json   # 每月差分产物（days.games[].minutes）
└── img/                     # 站点插画：rank-* / minion / steve（+ watch/ 是观影侧，忽略）
scripts/                     # 数据管线
├── fetch.mjs                # 拉 Steam → data/snapshots/YYYY-MM-DD.json
├── diff.mjs                 # 全量快照重算 → data/daily/YYYY-MM.json
├── localize.mjs             # 游戏名中文本地化
├── build.mjs                # 生成 docs/data/* + 串 inline-boot 内联进 index.html
├── inline-boot.mjs          # 内联 __BOOT 数据
├── backfill-percent.mjs     # 成就百分比回填（一次性工具）
├── diff.test.mjs            # 差分算法 21 条边界单测
├── steam.test.mjs           # API 封装单测
└── lib/{steam.mjs, diff-core.mjs, dates.mjs}  # API 封装 / 差分纯函数 / 上海时区日期
data/                        # 管线原始数据（git 跟踪，每晚 diff 的源）
├── snapshots/               # 原始快照，永久保留、永不覆盖（除非 FORCE）
├── daily/  manual/  overrides/  achievements/  cache/
.github/workflows/daily.yml  # 每晚 CI：fetch → diff → localize → build → commit+push
tests/verify/verify6.mjs     # 游戏站回归（35 条，唯一管 index.html 的套件）
README.md                    # 完整说明（管线/部署/密钥/Schema/自检清单）
```

## 三、页面功能清单（`app.js` + `index.html`）

- **概览卡**（`.cards`，五张）：累计时长 `c-lifetime` / 最近游玩 `c-recent` / 成就 `c-ach` / 游戏数 `c-games` / 数据 `c-data`，点 `.card-nav[data-view]` 切换。
- **榜单** `#lt-list`：游戏排行（`rank-capsule` 胶囊图懒加载，`data-src` 单向水化），点行进 `#lt-detail` 下钻趋势图（ECharts 按需加载 + 降级提示）。
- **日历** `cal-*`：月度日历 + 单日详情；入口**只有一处**，在「最近游玩」卡片里（第 24 轮收敛）。
- **成就** `ach-*`：**按需加载**（切到成就视图才拉 `achievements.json`），带游戏筛选下拉。
- **数据导出**：`btn-csv-daily` / `btn-csv-lifetime`。
- **主题**：三套浅色主题 cream/mint/dawn（`documentElement.dataset.theme`，localStorage 持久化），页眉头像切换，**无 dark**。
- **特效** `#fx-canvas`：meteor 流星。
- **骨架屏**：`.sk-block/.sk-row`，`init` 先 `paintSkeletons()` 再 `await load()`，尊重 `prefers-reduced-motion`。
- **页脚**：`footer-gen` 生成时间、`health` 数据健康状态、`logo-watch`（观影页入口）。

## 四、当前进展与版本

- 版本号：`style.css?v=110` / `app.js?v=105` / `fx.js?v=16`（**硬编码在 `verify6.mjs` 第 52 行**；第 87 轮把日明细入口并入热力图后再次 bump）。
- 最近一次针对游戏站的大改是**第 24 轮「首屏加载优化」**（在 verify6 注释里记着）：数据全内联、`cache:"default"`、月份文件 `Promise.allSettled` 并行、成就按需、骨架屏、`meta.ach_stats` 摘要。
- 之后 25~80 轮几乎都在做观影页（watch），游戏站只在 CI 每晚改 `docs/index.html` 数据、以及「日历入口收敛到最近游玩」等零散订正。
- **第 82 轮（index 侧，2026-10-31，本地改动，未提交/未上线）**三项：① 全站移除 `title` 悬停气泡（页眉三项 + 五张概览卡 + 返回按钮 + 日历日期格 + 排行榜行 + 氛围开关禁用态），语义一律改由 `aria-label` 承载；② `.site-title` 加 `user-select:none`（双击不再框选、拖拽不带走文字，点它仍回顶部）；③ 删掉排行榜首行三只吉祥物（加菲猫 / 猫和老鼠 / 企鹅）——模板、CSS 三条规则、三张 webp 全清，`.rank-list` 的 18px 上内边距**刻意保留**（首行位置与 `--cal-lift` 的换算依赖它）。新增 `tests/verify/verify82_index.mjs` **16/16**。
- 回归：`verify6` **35/35**、`verify47` **72/72**（0.4b 判据改为「aria-label 承载 + title 必为 null」）、`verify54` **23/23**（B2/B3/B6 同步改成 aria-label）、`verify82_index` **16/16**；`verify55/56/58` 页眉几何未受影响（40/40、49/49、23/23）。
- **第 87 轮（index 侧，2026-10-31）**热力图时长字样放大 + 日明细入口并入热力图：
  ① 用户「热力图中时间字样放大，颜色加深」→ `.hc i` 从 11.5px / 继承色 / opacity .95 改为 **13px / 600 重 / --text-strong / opacity 1**（`h4` 实心格里仍是白字，靠 `.hc.h4 i` 更高的特异性守住，没被这条盖掉）；窄屏 ≤860 用 12px、≤360 用 11px。
  ② 用户「删除最近游玩选项卡下的日历图标，其负责的功能（点击日期查看当天游玩的游戏及其时长）并入总时长的热力图」→ 删 `CAL_ICON_BTN` 常量、`renderRecent` 的首行分支、`#recent-list` 的点击委托、`.cal-icon-btn` 整套 CSS（含 `--cal-lift` 那 45 行对位算法）。**浮层的「一级月历」整层也随之删除** —— 热力图本身就是月历，不必再看第二份：`#cal-page-month` / `#cal-grid` / `#cal-title` / `#cal-prev` / `#cal-next` / `#cal-back` / `#cal-status` 的元素与 JS（`renderCalGrid` / `stepMonth` / `backToCalMonth` / `resetCalLevel` / `focusCalDay` / `calRange` / `calDefaultMonth` / `hasPlay`）全清。
  ③ 新入口：`renderDrill` 给有数据的日子加 `is-live` + `data-date` + `role="button"` + `tabindex="0"` + `aria-label`（日期 / 时长 /「查看当天明细」），在 `#heat-drill` 上委托 click 与 keydown(Enter/Space) → `openDayDetail(date)`；未追踪的日子（`is-na`）与月首月尾补位格不可点。
  ④ 细节：`.hc.is-sel` 标出「刚看过的那天」，关掉浮层后仍保留（便于接着看相邻日）；步进跨月时背后的热力图自动跟到同月（同步 `state.drill.month` 重绘，并把「关闭后焦点还回谁」改指新格子）；单游戏下钻里点格子，明细仍列**当天全部游戏**，当前那款加 `.cal-game.is-focus` 左侧金线。
  ⑤ **两个真坑**：`openDayDetail()` 要把 `state.cal.day` 置 null 才被认作「首次打开」，也才会把焦点送进浮层（`closeCal()` 同样要清）；窄屏 `padding: 6px 4px` **必须写在 ≤860 块之后** —— 同特异度靠源码顺序决胜，写在前面的 480 块里会被 860 块的 `padding: 6px 7px` 覆盖（实测内边距一直是 7px，「49min」顶出格子）。
  ⑥ 顺手修掉第 86 轮的遗留缺陷：**360px 下钻整块横向溢出 13px** —— 网格项默认 `min-width:auto`，格内时长文字的最小宽度把 `1fr` 轨道顶宽；给 `.hc` 加 `min-width: 0` 后归零（360 / 390 / 430 实测 docOverflow 均为 0）。
  ⑦ 测试：`verify47` **整体重写** 72 → **80 条**（结构 / 入口 / 几何 / 步进 / 空态 / 边界 / 关闭 / 焦点 / 键盘 / 响应式 / 单游戏高亮）；`verify48` 改判 78 → **76 条**（「浮层外零变化」的基线改成「进下钻后、开浮层前」，锚点从最近榜首行换成下钻面板）；`verify49` 第 6 段从「图标几何」改成「图标已删且没留空壳」（47 → **45 条**）；`verify6` 的日历断言改为点格子开明细。新增 `online87`（14 条：字号/颜色、格子可点、明细与线上 daily 对账、无一级月历、图标已删、360px 不溢出）。
  回归：index 侧 7 套件 **307 条 0 FAIL**（verify6 35 / verify47 80 / verify48 76 / verify49 45 / verify54 23 / verify82_index 16 / verify83_index 32）。

- **第 86 轮（index 侧，2026-10-31）**热力图改「按月」并取代趋势图：
  ① 热力图从「18 周 × 7 天的小方块」改成**月历网格**（7 列 = 周一 → 周日，格子内写日期 + 当日时长，四档 `color-mix` 深浅）；只在**下钻界面**出现，数据页那块已删除。
  ② 下钻（点榜单行 = 单游戏；点「游戏时长」卡 = 全部游戏）原来是 **ECharts 柱状 + 折线**，现在整体换成同一套月历热力图 —— **ECharts 已从站点彻底移除**（`ECHARTS_SRC` / `loadEcharts` / 旧 `renderDrill` / `state.charts` / `drillRange` / `cssVar` 全删），首屏与下钻都不再联网取图表库。
  ③ 月份翻页 `#heat-prev` / `#heat-next`，边界 = 「首份数据月 → 最新数据月」；汇总行「本月 N 天有记录 · 峰值 · 合计」。
  ④ 三个真坑：`openDrill` 不再 async 后，调用点的 `.catch()` 会抛错；`closeDrill` 必须清 `state.drill.appid`，否则深链一直挂着 `g/<旧游戏>`；**深链直达要 `switchView(v,{instant:true})`** —— View Transition 的回调是异步的，会把紧随其后打开的详情面板又关回去。
  回归：`verify6` 的「趋势图」判据改为「月历热力图 + 无 ECharts」；`verify83_index` 32 条同步；`verify49` 的 hint 清单去掉 heat-hint。
  **已上线**：提交 `41eb769`（19 文件）+ `17d9b75`（新增 `tests/online/online86.mjs`），推送 `22eb8dc..17d9b75`；Pages 第 4 次轮询切到 `style.css?v=109`。线上复验 `online86` **16/16**、`online84` **7/7**。
  `online86` 的期望一律从线上 `data/meta.json` 推导（`months` 决定可翻阅范围），**别写死月份**；「‹」的禁用断言按「线上只有 1 个月时两个按钮都灰」判，否则刚上线月份少时必红。
- **第 85 轮（index 侧，2026-10-31，回退轮）**—— 用户点名撤掉第 83 轮的三项，并把热力图换页：
  ① **#8 封面主色进度条 → 撤回**：`barStyle()` 回到两参（只用十色 `topPalette`），`build.mjs` 不再合并 `game-colors.json`，`meta.games_lifetime[].bar` 字段消失；`scripts/rank-colors.mjs` 与 `data/overrides/game-colors.json` **已删除**（需要时从 `fca115e` 取回）。
  ② **#14「接下来玩什么」→ 整块删除**：HTML 容器、`renderSuggest()`、`bindMore` 里的点击委托、`meta.ach_almost` 与构建期计算全清；`.sg-*` / `.panel-strip` 样式一并删掉。
  ③ **「游戏时长 / 时间轴」视图合并 → 撤回**：恢复五张卡（`#card-games` + `#c-games` 回来）、恢复独立的 `#view-timeline` 视图与 `#tl-hint`，`switchView('timeline')` 重新是真视图；`#lt-mode` 分段控件、`setLtMode()`、`state.ltMode`、深链里的 `/week` 全部移除。⚠️ **删卡时别忘绑定**：`#card-games` 的 click 必须在 `bindMore()` 里重新挂上，否则卡点了没反应（本轮踩过）。
  ④ **活动热力图从「游戏时长」移到「数据」**：`#panel-heat` 整体搬进 `#view-data` 的第一块面板；`renderHeat()` 改为 `switchView('data')` 时重算（初始化仍会算一次，隐藏时也能算）。
  回归：`verify83_index` 重写为 **32 条**（12 静态 + 15 运行时 + 5 离线）；`verify6/47/48/49/54/55/56/58/75/80/82_index` 全绿。
- **第 83 轮（index 侧，2026-10-31，已提交）14 项体验改造**（用户点名「除 #2 #3 #9 #17 外全做」；其中 **#1 / #8 / #14 已于第 85 轮回退**，下面保留原始记录）：
  ① **合并视图**：删掉独立的「游戏库/时间轴」视图，`#card-games` 卡一并移除 → 概览 4 张卡；榜单用 `#lt-mode`（排名/时间轴）切换两种画法，`switchView('timeline')` 仍保留为别名（老书签/深链不炸）。
  ② **活动热力图**（`#heatmap`）：18 周 × 7 天 = **126 格**，四档亮度按「当日分钟/期内峰值」；格子固定 **11px**（用 `1fr` 会被撑到 60px，整块 623px 高——踩过）。
  ③ **接下来玩什么**（`#panel-suggest`，`.panel-strip` 窄条）：两组 —— 「差 ≤3 个成就」(`meta.ach_almost`，构建期算) 与「买了没启动」。**不能做成大面板**：会把握手榜挤出首屏。
  ④ **全成就勋章墙**：放在**成就视图**顶部（不是游戏时长页），数据来自 `meta.ach_perfect`。
  ⑤ **封面主色进度条**：`scripts/rank-colors.mjs` 用 sharp 从 `header.jpg` 提主色写 `data/overrides/game-colors.json`，`build.mjs` 合并进 `meta.games_lifetime[].bar`；缺表自动回落十色板。
  ⑥ **悬停底纹**：`#hero-bg`（JS 动态创建，`position:fixed; z-index:-1`），悬停榜单行换成该游戏封面模糊图。
  ⑦ **数字滚动 + View Transitions**：`countUp()` 尊重 reduced-motion；`switchView` 用 `document.startViewTransition`，**必须加 `state.vt` 锁**，否则连续切换会抛 `Transition was skipped`（会变成 pageerror）。
  ⑧ **深色主题 `night`**：第 4 套主题，变量与 cream 一一对齐；首屏脚本**首次访问跟随系统 `prefers-color-scheme`**，手动选过以 localStorage 为准。
  ⑨ **阶段报告 + 周目标 + 换算**（数据页）：`#report`（追踪天数/期内总时长/最长连续/最佳单日/期内最常玩）、`#pace`（周目标环，目标存 `localStorage.weekGoalH`，默认 10h，本周 vs 上周）、`#convert`（电影/剧集/《战争与和平》/通勤 四条换算）。
  ⑩ **单游戏详情扩展**（`#drill-more`）：占终身比重条 + 期内/首次/最近 + 最近 8 条成就（含稀有度金色）。
  ⑪ **深链**：`#/视图`、`#/lifetime/week`、`#/lifetime/g/<appid>`，`history.replaceState` 同步。
  ⑫ **PWA**：`manifest.webmanifest` + `icon-192/512.png`（`scripts/make-icons.mjs` 用史蒂夫合成）。**离线缓存刻意没做** —— index 侧再注册一个 SW 会与 watch 页的 `sw.js`（同 scope）互相替换。
  ⑬ **窄屏两行榜单**：≤860px 改成 `34px 100px 1fr`，进度条落第二行；**别写成 4 列**（定宽吃光后片名只剩 30px）。
  ⑭ **页脚去重**：删掉 `#footer-gen`（与「数据」卡重复）。
  新增 `tests/verify/verify83_index.mjs` **28 条**；回归：verify6 35、47 72、48 78、49 47、54 23、55 40、56 49、58 23、82_index 16、83_index 28 —— **全绿**。
- **第 84 轮（index 侧，2026-10-31，发布轮）两项**：
  ① **封面本地化**：`scripts/fetch-covers.mjs` 把 53 张 `header.jpg` 下成 `docs/img/covers/<appid>.webp`（460 宽 q78，合计约 1MB）；`CAPSULE()` 改指本地，另留 `CAPSULE_CDN()` 兜底，胶囊图 `onerror` 走「本地 → CDN → 小图标」三级，悬停底纹用双层 `background-image`。**新游戏入库后要重跑这个脚本**（增量，已存在的跳过）。
  ② **离线可用**：`docs/sw.js` 从「只管观影页」扩成两页共用 —— 导航网络优先回落缓存、`/data/*` 网络优先、`?v=` 资源与 `/img/covers/*` 缓存优先；首页也注册同一个 SW。**预热必须从 index.html 现场解析出 `style.css?v=` / `app.js?v=` 再收进缓存**（首次访问时 SW 还没接管，那几个请求没经过 fetch 事件，不预热就会「断网刷新一片空白」）。
  新增 `tests/verify/verify83_index.mjs` 的 C 段 **5 条离线断言**（SW 接管 / 断网刷新仍渲染 53 行 / 离线封面仍显示 / 零异常 / 恢复网络仍走网络）+ `tests/online/online84.mjs` 上线复验。
- **⚠️ 本次发布明确排除**：「按类型推荐」（依赖 `appid → 类型` 映射，素材未提供，从未实现，无需回滚）。
- 数据现状：`docs/data/daily/` 按月一份；`meta.json` 有 `ach_stats` / `ach_perfect` / `ach_almost`；`achievements.json` 约 285KB。

## 五、硬约束（违反必炸）

1. **改 `docs/` 静态资源必须 bump `?v=N`**（style/app/fx 各自独立计数），并同步 `verify6` 里的硬编码。
2. **`docs/` 是发布根**，别往里塞构建步骤/源码；**两个页面资源互不引用**（index 不加载 watch 的 css/js）。
3. **别动 `data/` 原始数据**（snapshots/daily/manual/overrides/achievements/cache）——每晚 diff 的源，删了历史就断。
4. **CI 每晚改 `docs/index.html` + `docs/data/*`** → 本地推送前必须 `fetch/rebase`（否则被 CI 的 `chore(data): snapshot` 卡住，禁 `--force`）。
5. **本机 `hosts` 把 github 系列域名指到 127.0.0.1**：判断能否推送用 `git ls-remote origin main`；代理端口会变（`env | grep -i proxy`）；裸 curl github 加 `--ssl-no-revoke`、访问本地加 `--noproxy '*'`。
6. **线上验证用 Playwright（`--no-proxy-server`）+ 页内 `fetch(url,{cache:'reload'})` 按内容指纹判新旧**，别用 curl（CDN 可能回旧内容）。
7. **沙箱里 CDN/Steam 图片会挂起**：verify6 里 `ctx.route` 把 `cdn.jsdelivr.net / steamstatic.com / steampowered.com / akamaihd` 全 `abort`，否则计时被拖死。
8. **`blackrose.woff`（TTF）是 `style.css` 的字体回退**，别当冗余删。
9. **不要再给任何元素加 `title`**（第 82 轮用户要求「全站一个悬停气泡都不留」）：需要向读屏/键盘用户说明的语义写进 `aria-label`；`verify82_index.mjs` 把「整页带 title 属性的元素数 = 0」当硬断言，加了就 FAIL。
10. **首屏预算**（第 85 轮现状）：游戏时长视图里**只有榜单一块面板**（热力图已挪到「数据」页）。别再往榜单上面加面板 —— 一旦把首行挤出首屏，`verify6` 的「视口内胶囊图已水化」会直接挂。
11. **新面板一律 `.panel` + `.panel-head`**（`.panel-strip` 已随「接下来玩什么」一起删除）。热力图格子用固定 **11px**，**不要用 `1fr`** —— 容器宽 1180 时会被撑到 60px 一方，整块 623px 高（踩过）。
12. **构建期产物只剩 `meta.ach_stats` 与 `meta.ach_perfect`**（`ach_almost` / `games_lifetime[].bar` 已随第 85 轮回退删除）：改 `build.mjs` 后必须重跑 `npm run build` 让 `meta.json` 与内联 `__BOOT` 同步。
13. **View Transition 必须加锁**：`state.vt` 在跑就别再开第二个，否则 Chromium 抛 `Transition was skipped`，会以 pageerror 计入「零 JS 异常」断言。
14. **两个页面共用一个 Service Worker**（同域同 scope 只能有一个）：改 `sw.js` 时观影页那两条规则（海报 cache-first、`watch.json` 网络优先）**不许动**，`verify75 A5` / `verify80 A8-A9` 盯着；新增缓存要在 `activate` 里一起保留，否则每次发布都把缓存清掉。
15. **首页的 css/js 必须写进 SW 预热**，且版本号要**从 index.html 现场解析**（不能写死 `?v=107`，否则下次 bump 就失效）。
16. **测试上下文里的 SW**：`page.route` 造的 mock 数据会被 SW 绕过（同一个 Chromium 老问题）。给 index 加 SW 之后，凡是用 `page.route` 造数据的套件都要 `serviceWorkers: 'block'`；只有专门测离线的那段才允许 SW 生效。
9. **条数/百分比写死会随快照漂移**：期望值从内联 `__BOOT` 里读（verify6 成就卡就是教训，第 70 轮改过）。

## 六、标准工作流

改代码 → bump `?v` 并同步 verify6 → 起本地服务跑 `verify6`（`tests/README.md` 有命令）→ `git commit` → 用户说「上线」才 fetch/rebase/重跑/push → 轮询 Pages 指纹 → 归档到 `Documents\Misc\对话成果\Steam游戏时长站\06_验证截图\` + 追加索引。

## 七、最常踩的坑（游戏站这侧）

- 本地服务：`cd docs && python -m http.server 8895 --bind 127.0.0.1`；Node 用 `C:/Users/33329/.workbuddy/binaries/node/versions/22.22.2-6/node.exe`；Playwright 在 `C:/Users/33329/.workbuddy/binaries/node/workspace/`（脚本内 `createRequire` 指向它）。
- 沙箱里 ECharts/CDN/Steam 图连不上 → 必须 `route.abort`，且趋势图只断言「canvas 或降级提示」二选一，不要求图真画出来。
- 胶囊图懒加载：先滚回顶部再测，否则 22 行全落预热带 → 远屏占位断言假失败。
- 字体 swap 会污染逐像素截图 → 「取稳定帧」（连续两次 md5 相同才采信）。
- 骨架屏窗口极短，别用 MutationObserver 抓（addInitScript 跑在 documentElement 之前会抛错）；用「人为延迟 app.js 4s」验证骨架确实顶上。
- bash 双引号里写 `node -e` 带反引号会丢字 → 用 `.cjs`/`.py` 补丁文件或 `<<'EOF'`。

## 八、可能待办（游戏站）

- 数据 Schema / 管线已稳定，主要可玩点在前端体验：主题、日历、趋势图、成就视图的打磨。
- 若 CI 停更（公开仓库 60 天无活动会禁用 schedule），到 Actions 点一次「Enable workflow」即可恢复。
