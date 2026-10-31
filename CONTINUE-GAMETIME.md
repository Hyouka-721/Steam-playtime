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

- 版本号：`style.css?v=106` / `app.js?v=100` / `fx.js?v=16`（**硬编码在 `verify6.mjs` 第 52 行**；第 82 轮 index 侧改动后从 105/99 bump）。
- 最近一次针对游戏站的大改是**第 24 轮「首屏加载优化」**（在 verify6 注释里记着）：数据全内联、`cache:"default"`、月份文件 `Promise.allSettled` 并行、成就按需、骨架屏、`meta.ach_stats` 摘要。
- 之后 25~80 轮几乎都在做观影页（watch），游戏站只在 CI 每晚改 `docs/index.html` 数据、以及「日历入口收敛到最近游玩」等零散订正。
- **第 82 轮（index 侧，2026-10-31，本地改动，未提交/未上线）**三项：① 全站移除 `title` 悬停气泡（页眉三项 + 五张概览卡 + 返回按钮 + 日历日期格 + 排行榜行 + 氛围开关禁用态），语义一律改由 `aria-label` 承载；② `.site-title` 加 `user-select:none`（双击不再框选、拖拽不带走文字，点它仍回顶部）；③ 删掉排行榜首行三只吉祥物（加菲猫 / 猫和老鼠 / 企鹅）——模板、CSS 三条规则、三张 webp 全清，`.rank-list` 的 18px 上内边距**刻意保留**（首行位置与 `--cal-lift` 的换算依赖它）。新增 `tests/verify/verify82_index.mjs` **16/16**。
- 回归：`verify6` **35/35**、`verify47` **72/72**（0.4b 判据改为「aria-label 承载 + title 必为 null」）、`verify54` **23/23**（B2/B3/B6 同步改成 aria-label）、`verify82_index` **16/16**；`verify55/56/58` 页眉几何未受影响（40/40、49/49、23/23）。
- 数据现状：`docs/data/daily/` 按月一份；`meta.json` 有 `ach_stats`；`achievements.json` 约 285KB。

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
