# WATCH 观影页（watch.html + 年度歌单）· 交接提示词

> **用法**：新开一个对话，把本文件**全文**粘进去即可无缝续做，不需要再解释项目。
> **范围**：`docs/watch.html`（观影列表 / 时间轴 / 年度报告 / 年度歌单）、`docs/watch.js`、`docs/watch.css`、`docs/data/watch.json` 及其分片、`docs/data/songs.json`、`docs/img/watch/`、`docs/img/songs/`、`assets/songs/`、`scripts/watch/`、`tests/watch/`、`tests/online/online1xx_watch.mjs`。
> **明确排除**：`docs/index.html`（Steam 游戏时长站）及其 `app.js` / `style.css` / `fx.js` / `docs/data/meta.json` / `scripts/pipeline/` / `tests/index/` —— 那半边看 `开发文档/CONTINUE-GAMETIME.md`，本文件不涉及、也不要改。
> **最后同步**：2026-11-15（第 108 轮：清理死码 + `watch.css?v=44` + 封面原图移出发布根）

---

## 一、这是什么

零构建的纯静态页，GitHub Pages 托管，**和 index 站同仓库、同发布根、互不加载对方资源**。

- 仓库：`Hyouka-721/Steam-playtime`；本地 `C:\Users\33329\WorkBuddy\2026-10-13-18-17-49\steam-playtime`
- 线上：https://hyouka-721.github.io/Steam-playtime/watch.html （注意仓库路径里是**大写 S**）
- 本地：`docs/` 起静态服务到 `http://127.0.0.1:8895/`，页面 `watch.html`
- 发布根 = `docs/`（**改 docs 里的文件就等于改线上，推送后约 15~40 秒生效**）

页面三个区块 + 一个录入弹窗：

| 区块 | 选择器 | 内容 |
|---|---|---|
| 海报墙 | `#w-grid` | 「看过」卡片网格，按观看时间倒序（同日先传的在前），支持按评分排序 |
| 时间轴 | `#w-tl` | 按日期分组的时间轴视图 |
| 年度报告 | `#w-stats` | 6 张统计卡 + 逐年趋势 / 评分分布 / 国别构成 + **年度影视** + **年度歌单** |
| 录入弹窗 | `#w-add` | 右下角 **+**，直连 GitHub API 写海报 + `watch.json`（Token 只存本机 localStorage） |

页眉右上角切换「网格 / 时间轴」；年度报告按钮 `#w-stats-btn`。

---

## 二、技术栈与硬约束

| 项 | 值 / 规则 |
|---|---|
| 前端 | 原生 HTML + CSS + ES5 写法的经典脚本（`watch.js` **不是 module**，不能用 import/export），无框架、无构建、无 CDN |
| 主题 | 影院黑；与 index 站的暖阳米/影院黑两套主题**不共享**，watch.css 自带变量 |
| 数据 | `docs/data/watch.json`（权威写入源）+ `docs/data/watch/YYYY.json`（按年分片） |
| 封面 | `docs/img/songs/t/*.webp`（480×480 缩略图，页面唯一引用的形态） |
| 原图 | `assets/songs/*.jpg`（72 张，仓库根，**不发布、页面不引用**，只作回滚素材） |
| 缓存 | `docs/sw.js` 不管 `songs.json`（走 `?t=` + `no-store`），海报走 cache-first |
| 响应式 | `1440 / 1920` 桌面，`390` 手机两列；面板 3 档栅格 |

### 🔴 十条红线（违反其中任何一条，之前的轮次就白做了）

1. **`docs/` 是发布根，不许移动/改名其中的文件。** 相对路径全部被线上引用，移动 = 线上 404。要做「目录重组」只能动 `scripts/`、`tests/`、`assets/`、`开发文档/` 这些不发布的部分。
2. **改 `watch.css` / `watch.js` 必须 bump 版本号**，且只 bump 真正改过的那个（js 没改就别动 `?v=35`，白白丢缓存）。改完必须全仓 `grep -rn "v=43"` 复查为 0。
3. **bump 要覆盖两种字面量**：纯文本 `watch.css?v=44` 与测试里的正则转义 `watch\.css\?v=44`（文件字节是**单反斜杠**）。🔴 第 107 轮就栽在这：规则只写了纯文本形态，**残留守卫的正则还多写了一层转义**，显示「残留 0」是假绿，靠 `grep` 全仓复查才抓出来。现成的做法（`开发文档/` 外，脚本随做随删）是一条规则通吃：`/v=NN(?![0-9a-f])/g` —— 既覆盖两种写法，也不会把 `?v=43a1b2c3` 这种内容哈希误伤成 `?v=44a1b2c3`。
4. **`.st-songs` 绝不复用 `.st-panel`。** `verify94 B4`、`verify98 B1/C1/D1` 会按 `.st-panel` 遍历统计面板顺序，多出一块就 4 红。歌单自带同款卡片样式。
5. **`.w-sort-btn.is-on` 的语义不许动**（当前视图 = 选中态），一堆套件按它取当前视图。
6. **套件不许钉数据快照。** 用户随时在站点录片（同一天加片、改评分、加标签都很常见），写死 `125 部 / 7.70 / 46.4% / 116 天 / 15 个标签` 之类的套件会在代码没坏的情况下集体变红。一律走 `tests/tools/expect-stats.mjs` 按 `watch.js` 同口径**现算**；条数类断言改下界 `N >= 125`；页脚时间戳与本地 `updated_at` 比日期。
7. **只有用户说「上线 / 推送」才动远端。** 「提交」= 只本地 `git commit`。推送前必须 `git fetch`，落后就 `git merge origin/main`（**禁 rebase、禁 `--force`**）；`docs/index.html` 的 BOOT 行必冲突，取远端数据 + 中文名换英文 + 结构版本号留我方。
8. **不为跑绿调阈值。** 功能/文案变了可以改判据，但理由必须写进该条的 `ok(...)` 文案里（例如「第 107 轮用户要求删掉首数文案」）。
9. **`Desktop` / `Downloads` / `Documents` 一律只读。** 用图只做 `readdir` / `stat` / `readFile` + `copyFileSync`，逐文件核对字节 + SHA-256，事后复查源文件完好。粘贴/上传的图原件在 `C:\Users\33329\.workbuddy\clipboard-images\`。
10. **只改数据 / 素材（`watch.json`、`songs.json`、`img/`）不 bump。** 版本号只跟源码走。

---

## 三、目录地图（watch 相关部分，2026-11-15 第 108 轮清理后）

```
steam-playtime/
├── docs/                          ← 发布根（不许挪文件）
│   ├── watch.html                 watch 侧唯一入口（含 ?v= 两条缓存键）
│   ├── watch.js                   全部逻辑：渲染 / 排序 / 年报 / 歌单 / 录入弹窗 / GitHub API
│   ├── watch.css                  全部样式（含年报面板、歌单栅格 10/5/2 列）
│   ├── data/
│   │   ├── watch.json             观影记录权威源：{updated_at, items[]}
│   │   ├── watch/YYYY.json        按年分片（buildShards() 生成，结构必须与 shard-lib 逐字一致）
│   │   └── songs.json             年度歌单：{updated_at, schema, note, years[{year, songs[]}]}
│   └── img/
│       ├── watch/                 369 张海报 + -320 / -480 变体（watch.json 直接引用，0 冗余）
│       └── songs/t/               66 张 480×480 WebP 封面缩略图（**页面只引用这里**）
├── assets/songs/                  72 张封面原图 37 MB（源素材，第 108 轮从 docs/ 移出，不发布）
├── scripts/watch/
│   ├── watch-add.mjs              命令行录入：压 WebP → 内容哈希命名 → 合并 watch.json → 倒序重排
│   ├── watch-shard.mjs            npm run shard / shard:check（重建 / 只读校验分片）
│   ├── shard-lib.mjs              分片结构的唯一定义（watch.js 的 buildShards() 必须逐字一致）
│   └── country-lib.mjs            国别归一化的权威表（watch.js 有内联副本，单测逐条比对）
├── tests/watch/                   44 个本地回归套件（见 §五）
├── tests/online/online1xx_watch.mjs  上线后线上复验
├── tests/tools/expect-stats.mjs   六卡期望值的现算工具（**所有套件都必须用它**）
└── 开发文档/                       本文件 + CONTINUE-GAMETIME.md + 目录结构.md（不发布）
```

⚠️ **`FINAL_LAYOUT` 与歌单主脚本不在仓库里**：`补全歌手与改名.mjs`、`生成封面缩略图.mjs`、`歌名_歌手映射.json` 在 `C:\Users\33329\Documents\Misc\对话成果\Steam游戏时长站\维护工具\`（2026-11-16 整合后从原第 104 轮归档迁入；🔴 两份脚本的 `ARCH` 与缩略图脚本的 `IMG`（→ `assets/songs`）已同步改到新址，测试 `verify105` 的 `MAP_FILE` 同）。它们写 `songs.json` 时**幂等重算**——直接手改 `songs.json` 会被下一次运行还原。要改顺序 / 换歌必须走 `FINAL_LAYOUT`（主脚本顶部，2026/2025/2024/2023/2022/2018/2021 七组；2021 为 2026-11-17 新增）。🔴 新增歌曲要跑**两遍**缩略图脚本：第一遍主脚本才把新歌写进 `songs.json`，第二遍才抓到它生成缩略图并回填 `cv` 哈希。

---

## 四、数据契约

### `docs/data/watch.json`

```jsonc
{
  "updated_at": "2026-11-15T18:41:42+08:00",
  "items": [{
    "id": "2026-10-31-dear-you",        // watched_at + slug，唯一
    "title": "给阿嬷的情书", "title_en": "Dear You", "year": 2026,
    "kind": "movie",                     // movie / tv / anime
    "watched_at": "2026-10-31",
    "rating": 9.9,                       // 0 = 未评分（不进平均分）
    "note": "江海万里…", "order": 2,
    "tags": ["剧情", "温情"],
    "countries": ["中国"],               // 必须走 country-lib 归一化表
    "poster": "img/watch/dear-you-debeb470.webp",
    "poster_320": "…-320.webp", "poster_480": "…-480.webp",
    "poster_w": 640, "poster_h": 960,
    "added_at": "2026-10-31T16:17:11+08:00"
  }]
}
```

- 排序：`items` 按 `watched_at` 倒序，同一天按 `added_at` **正序**（先传的居前）。
- 当前体量：**125 部**（2026-11-15）。这个数字会变，套件里不许写死。

### `docs/data/songs.json`

```jsonc
{
  "updated_at": "2026-11-15", "schema": "…", "note": "各批录入/改名的完整流水",
  "years": [{ "year": 2026, "songs": [{ "title": "…", "artist": "…", "cover": "img/songs/t/xxx.webp?v=1a2b3c4d" }] }]
}
```

- 当前：**9 组年份 / 90 条 / 90 歌手 / 90 封面 / 66 个唯一封面路径**（同曲共用封面）。
- `cover` 留空 → 渲染 ♪ 占位；`?v=` 是**缩略图内容哈希前 8 位**，内容变必然换键。

---

## 五、封面链路（换图只有这一条路）

```
用户给图（桌面 / 剪贴板）
  → ① 只读复制进 assets/songs/<歌名>.jpg（同名旧图先改名 <歌名>_旧.jpg 留档，一张不删）
  → ② 改映射表 歌名_歌手映射.json 的 cv / cf（cv = img/songs/t/<名>.webp?v=<sha8>，cf = 原图文件名）
  → ③ 跑 补全歌手与改名.mjs            → 写回 docs/data/songs.json
  → ④ 跑 生成封面缩略图.mjs            → 生成 docs/img/songs/t/*.webp（末尾会自动再跑一次 ③）
  → ⑤ 复查：孤儿缩略图手动删 / verify105 + verify107 跑绿
```

三个必踩的坑：

1. **同名 basename 冲突**：缩略图脚本按 basename 在**原图目录**反查原图。新图 `夕颜.jpg` 与旧封面 `夕颜.webp` basename 相同 → 必须先改名旧图，否则取错图（第 107 轮）。
2. **孤儿缩略图不会自动清**：脚本只按 `songs.json` 现有引用生成，换图后旧 `t/xxx.webp` 没人引用但还在。删掉后 `t/` 应该恰好等于「唯一封面路径数」（当前 66）。
3. **`withoutEnlargement:true` + `fit:'cover'` 会让小图输出非正方形**（215×220）→ 必须先 `metadata()` 算 `side = min(w, h, 480)` 再 `resize(side, side, {fit:'cover'})`（第 105 轮）。

性能契约（`verify105_watch` 11 条）：单张 ≤ 100 KB、合计 ≤ 3 MB、边长 ≤ 480、`naturalWidth ≤ 480`、cover 全指 `t/*.webp`、`?v=` 与 SHA-256 前 8 位一致、每张缩略图在 `assets/songs/` 都有同名原图、`loading="lazy"` / `decoding="async"` 未改。**阈值是防回退上限，不是调参目标**（真实值 24 KB / 1.66 MB / 480 px）。

---

## 六、套件体系

```bash
# 本地站点（跑套件前必须先起）
cd docs && C:/Users/33329/.workbuddy/binaries/python/envs/default/Scripts/python.exe -m http.server 8895 --bind 127.0.0.1
# 单跑
node tests/watch/verify107_watch.mjs
# Node 用托管运行时：C:/Users/33329/.workbuddy/binaries/node/versions/22.22.2-6/node.exe
# Playwright 在 C:/Users/33329/.workbuddy/binaries/node/workspace/（脚本里 createRequire 指过去）
```

- `tests/watch/` **44 个套件**，编号 = 轮号，`_watch` 后缀区别于 index 侧。就近相关的：`verify94`（年报维度 + 图表美观）、`verify104`（歌单框架）、`verify105`（封面缩略图性能）、`verify107`（歌单文案精简 + 换图）。
- 本地全量 = `tests/watch` 44 + `tests/index` 16 = **60 套件**；2026-11-15 第 108 轮实测 **60 套件 1520 条 → 1519 PASS / 1 已知红**。
- **唯一已知红**：`verify56 B11` —— 两页页眉差 1px（`172/173`）。🔴 **不许「减 1px 再比」把它抹平**，真修法是 index 恢复下边线 / watch 去掉下边线。
- 线上主复验：`tests/online/online104_watch.mjs`（**21 条**，上线后实测 21/0）。上线回归 = `online103~95` 9 套件（143/0）。
- 线上套件的期望值取自**本地** `data/watch.json`，所以推送前必须 `git fetch` + `merge`；本地落后线上时会假红（第 107 轮踩过：线上 `7.71/47.2` vs 本地 `7.70/46.4`）。

---

## 七、当前进度（第 101 → 120 轮）

| 轮 | 做了什么 | 状态 |
|---|---|---|
| 101 | 面板从 6 块删到 4 块（删「类型构成 / 高频标签」）+ 头部精简 | ✅ 已上线 |
| 104 | 新增年度歌单框架（`songs.json` + `.st-songs` 栅格 + 崩溃兜底占位） | ✅ 已上线 |
| 105 | 封面缩略图：66 张 33.83 MB → 1.62 MB（-95.2%），滚完 21.47s → 3.97s | ✅ 已上线 |
| 106 | 换 3 张封面（童话镇 / 独角 / 南下），旧图改名留档 | ✅ 已上线 |
| 107 | 删「每年 10 首」「N 首」文案；换夕颜封面；双 bump v43/v35 | ✅ 已上线 `8efa9df` |
| 108 | **清理与归档**：删 `.st-row-track` 死码 12 行、`watch.css?v=44`、72 张原图移出 `docs/` → `assets/songs/`、文档归入 `开发文档/` | ✅ 已上线 `ec1e8c3` |
| 120 | **雨滴氛围层**：与 index 共用资源，页脚开关写 `localStorage['rain.enabled']`，watch 恒 cinema；不动 css44/js35 | ✅ 已上线 `c91a085` |
| 121 | **雨滴改 DOM + backdrop-filter**：WebGL 采样不到背景 → 推翻；每颗水滴真实折射页面，尺寸 10~40px；v=3 | ✅ 已上线 `64ece50` |
| 122 | **雨滴收敛为环境层**：8~24px / 14~36 颗 / 透明度 0.55~0.73 / 不规则圆角；v=4 | ✅ 已上线 `d3f9a4c` |

- 当前版本键：`watch.css?v=44` / `watch.js?v=35` + 共用 `rain.css?v=4` / `rain.js?v=4`
- 第 122 轮验收：`verify120_watch` **18/0**、`verify121` **12/0**、`verify122` **11/0**、`online122` watch 侧 **11/0**；两线全量 **66 套件 1624 → 1623/1**（唯一红 `verify56 B11`）；`npm test` **52/0**。
- 🔴 雨滴是装饰层：`rain.js` 必须 **async** 引入，并在 index 骨架屏退场后再铺水滴；`#rain-layer` fixed / `pointer-events:none` / z=6，关时整层 `hidden`。cream 用 `.rain-drop` 独立规则，**禁止再用 `filter:invert(1)`**（会把高光翻成脏灰）。判据 `verify120`/`verify120_watch`/`verify121`。
- 数据体量：125 部影视 / 9 组 90 首歌 / 66 张缩略图 / 369 张海报
- 已知未做：线上首屏感知仍 ~10.5 s（瓶颈是 Pages 侧 HTTP/2 并发 + CDN 首包，不是体量）；`srcset` 分档（桌面 240 px）未做；年度影视海报未走同一套缩略图流程。

---

## 八、常见任务 SOP

**A. 用户说「把 X 的封面换成这张图」** → 按 §五 五步走，最后 `verify105` + `verify107` 跑绿，实测截图 3~4 张（1440 / 390 各一张 + 目标卡片特写）。

**B. 用户说「加一条观影记录 / 改评分」** → 优先在站点 **+** 表单录（会自动提交到 GitHub）；不想开浏览器就 `node scripts/watch/watch-add.mjs`。⚠️ 用户经常在对话进行中自己录片，**推送前必须 `git fetch` 看远端有没有新提交**。

**C. 用户说「删掉某段文案」** → 改 `watch.js` 的模板字面量 + 删 `watch.css` 里随之失效的规则（`grep` 确认零引用）→ 改对应套件判据（反转或放宽，理由写进 `ok` 文案）→ bump → 全量回归。

**D. 用户说「上线 / 推送」** → `fetch` + `merge` → 本地全量复跑 → `git push` → `tests/tools/pages-poll.mjs` 轮询 Pages → `online104_watch` 21 条 + 线上 9 套件回归 → 线上实拍 3 张。

**E. 清理 / 重构** → 先只读盘点（引用扫描：JSON 字符串 + html/css/js 三类），确认「未被引用」是真冗余还是「回滚素材 / 动态拼路径」。🔴 两个反例：`docs/img/covers/` 106 张看着没引用，其实是 `app.js` 里 `'img/covers/' + appid + '.webp'` 动态拼的；`docs/img/songs/` 原图页面确实不引用，但它是回滚素材。

---

## 九、待办 / 已知欠账

- `watch.js` 里 `normalizeSongs` / `loadSongs` 的 `?t=` 防缓存与 `sw.js` 的关系没有专门套件守着（目前只是不缓存 `songs.json`）。
- 歌单里「同曲共用封面」目前靠人工，无去重校验。
- 年度影视海报没走缩略图流程，将来若体量涨大会复现第 105 轮的问题。
- `tests/watch/verify55~93` 这批老套件仍在断言各轮历史细节（版本号、条数下界、词表），逐轮累加，后续可考虑合并成「契约套件 + 快照套件」两层。
