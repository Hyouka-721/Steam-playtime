# 项目交接提示词（可直接复制到新对话）

> 用途：在**新对话**里无缝接管「Steam 游戏时长统计站」项目的后续开发。
> 复制下面整段作为开场，模型即可理解项目全貌、既有约束与当前进度，无需重新解释。

---

## 一、项目是什么

一个零构建的纯静态站点，托管在 GitHub Pages，分**两个完全独立的页面**：

- **① `docs/index.html` —— Steam 游戏时长站**：每日追踪 Steam 游戏时长与成就。
  - 数据管线：`scripts/fetch.mjs`（拉 Steam）→ `scripts/diff.mjs`（差分）→ `scripts/build.mjs`（生成 `docs/index.html` 内联数据）。
  - GitHub Actions（`.github/workflows/daily.yml`）每晚自动 fetch + 快照提交。
  - 三套浅色主题（cream/mint/dawn），无 dark；特效（meteor）；ECharts 按需加载。
- **② `docs/watch.html` —— 观影记录站「Watch List」**：近几轮的主力工作对象。
  - 数据唯一来源 `docs/data/watch.json`；海报在 `docs/img/watch/*.webp`。
  - 两种视图：网格 / 时间轴（页眉右侧史蒂夫头像切换）；右下角加号录入；点击时间轴条目可编辑。
  - 自带影院黑主题 `[data-theme="cinema"]`，**不加载** index 的 style/app/fx。

仓库：`C:\Users\33329\WorkBuddy\2026-10-13-18-17-49\steam-playtime`
远端：`github.com/Hyouka-721/Steam-playtime`（main）｜线上：`hyouka-721.github.io/Steam-playtime/`

## 二、目录结构（第 70 轮起已归类清晰）

```
docs/                 # = 发布根 = 源码（零构建；docs/ 就是 GitHub Pages 根）
├── index.html        # 游戏时长页（源文件+构建产物二合一，CI 每晚改写）
├── watch.html/css/js # 观影页（三文件，完全独立）
├── sw.js             # 第 75 轮：Service Worker（只对 img/watch/*.webp 走 cache-first）
├── style.css app.js fx.js  # 游戏站样式/逻辑/特效
├── data/             # 发布数据：watch.json + achievements.json + daily/ + meta.json
└── img/              # 站点插画（rank-*/minion/steve）+ watch/（电影海报 + 320/480 变体）
scripts/              # 数据管线（fetch/diff/build/backfill/inline-boot/localize）+ watch-add.mjs + watch-variants.mjs + lib/
data/                 # 管线原始数据（achievements/daily/manual/overrides/snapshots/cache），git 跟踪
tests/                # 第 70 轮新收编：回归测试套件
├── verify/           # 22 个本地回归脚本 verify6/47~75.mjs
├── online/           # 上线复验 online65/66/68/69/70/72.mjs
├── tools/            # rebase 数据冲突合并器 merge*.py
└── README.md         # 怎么跑 + 约定
.github/workflows/daily.yml  # 每晚 CI 快照
```

## 三、当前进度（截至 2026-10-25 19:00，第 75 轮已上线 `aaf3f26`，线上 **106 条**）

- 已上线到 `aaf3f26`（推送 `54568dd..aaf3f26`，4 个提交；线上 **106 条** = movie 56/series 16/anime 34；线上复验 `online75` **14/14**，Pages 约 35s 命中）
- 第 75 轮 = 图片性能优化 + 默认网格/评分序的上线轮：上线前 fetch 发现用户又录了 4 部（罗小黑战记2/流浪地球2/冰雪奇缘2/蜘蛛侠：英雄远征），远端 102→**106 条**；用 `tests/tools/merge75_rebase.py`（远端基底 + 重放）合并，4 张新海报用旧线上代码录入（无变体）→ 补跑 `scripts/watch-variants.mjs` 生成 8 个变体（最终 poster_320 **106 条** / poster_480 **100 条**，6 张 base 宽 ≤480 只缩不放）
- 线上 SW 实测：**106/106 个海报响应 `fromServiceWorker() === true`**、二次访问 transferSize 全 0（刷新不再等协商）
- 版本号当前取值：`style.css?v=105`/`app.js?v=99`/`fx.js?v=16`/`watch.css?v=16`/`watch.js?v=11`。
- 第 73/74 轮已上线 `c92322c`（推送 `635e4c4..c92322c`，3 个提交，线上复验 `online73` **13/13**）
- 第 74 轮 = 第 73 轮的上线轮：上线前 fetch 发现用户又录了《肖申克的救赎》、把《小森林》评分改成 9.5，watch.json 冲突用 `tests/tools/merge74_rebase.py`（**远端为基底 + 重放本地改动**，带「标题匹配=1 / 用户字段零改动 / id 唯一」守卫）解决；上线后做了**全库 102 条审查**（海报/片名/年份/类别逐一核）
- 观影页已完成的关键轮次（按时间）：
  - 第 57 轮 网页加号录入（Contents API 直写 + Token 存 localStorage）
  - 第 60 轮 网格 1.5 倍密度（1440 = 5 列）
  - 第 62/63/64/65 轮 时间轴横向一行 / 垂直居中 / 字号统一 / 长英文名防溢出
  - 第 66 轮 六项修正（去角标、评分一位小数、网格重排、分类更正、上映字段、去标题 title 提示）
  - 第 67 轮 时间轴改「表格式列网格」→ 同名字段跨条目对齐（六列唯一 x）
  - 第 68 轮 全站统一左轨（内容左轨 = `.w-main` padding-left，桌面 28 / ≤860 18；轴线用负偏移画进留白）
  - 第 69 轮 时间轴条目点击编辑（复用加号弹窗的「编辑模式」）
  - 第 70 轮 换《魔法石》海报 + 站名 My Watch List → Watch List
  - 第 71 轮 魔法石换成正确的海报（`...-70ce4e93.webp`），回归套件收编进 `tests/`
  - 第 72 轮 ① 页眉文案改回 **My Watch List**（`<title>` 站名仍 Watch List，两处分工）
    ② 新增 `added_at`（上传时间）：**同日记录按上传时间正序，先上传居前**（网页加号/CLI/编辑三处都写，git 历史回填了既有数据）
    ③ 网页加号与 CLI 的 id 规则收紧：同 id **且同片名**才算更新；同 id 不同片名追 `-2/-3` 换新 id（修复「玉子市场/玉子爱情故事同日互相覆盖只能留一个」的事故，玉子市场已从 git 历史恢复为 `2021-03-21-item-2`）
    ④ 网格视图右上角「共 N 部」计数条 → **排序切换（观看时间/评分）**，localStorage 持久化，仅网格生效（时间轴恒按时间倒序）
    ⑤ 《工作细胞》换海报（`item-4bb7a3f7.webp`，走 CLI 同一条管道，旧海报自动删）
    ⑥ 玉子两部短评拆分：爱情故事「餅が一番好きです！どうぞ！」/ 市场「最喜欢了饼藏了！请讲！」
    ⑦ 上线时又恢复两条撞车受害者（同一个 id 撞车 bug 在线上旧代码上多发生了两次，靠全量扫描才发现）：
      《工作细胞》→ `2020-07-16-item-2`（被《中二病也要谈恋爱！》覆盖）、
      《境界的彼方》→ `2020-12-18-item-2`（被《在下坂本，有何贵干？》覆盖，海报 `item-e0e18532.webp` 一直是孤儿）
  - 第 73 轮 ① 影视类别新增「番剧」（动画剧集）：筛选条 全部/电影/剧集/**番剧** 四档，录入/编辑表单类型选择器加选项；
    watch.js 全链路支持 anime（kindLabel / setKind / submitAdd / submitEdit / openEdit），scripts/watch-add.mjs --kind 也接受 anime
    ② 《她和她的猫》换海报：用户图 p2249039182.jpg（537×800 <640 只缩不放）→ item-b73c9fed.webp（16.0KB），id 与 added_at 不变，旧海报删除
    ③ 既有条目按**用户确认的范围**重分类：仅日本动画剧集 → 番剧（上线合并窗口用户又录了 5 部日本动画，最终 **34 条**）；国漫（雾山五行/大理寺日志）与欧美动画（双城之战/变形金刚）留「剧集」，动画电影留「电影」
    ④ 顺带修两处客观错分：半泽直树（TBS 日剧）、洛基（Disney+ 剧集）movie → series；末代皇帝（1987 电影）series → movie 亦在全库审查中订正 → 分布 **movie 52 / series 16 / anime 34**
    ⑤ watch.js?v=9→v=10 波及 8 个回归脚本，**每个文件两处**（ok() 描述纯文本 + 正则断言转义形态），只换一处会漏；
    verify66/verify72 判据随真契约变更更新（赛博朋克：边缘行者改进番剧、玉子市场 kind=anime）
    ⑥ 新增 tests/verify/verify73.mjs（27 条：筛选四档/表单链路/标签映射/海报 hash/重分类清单/持久化），全量 **21 套件 853/853 0 FAIL**
    ⑦ **上线前全库审查（102 条）订正 3 处元数据错误**：某科学的超电磁炮 year 20009→2009（笔误）、中二病也要谈恋爱！2010→2012（TV 第一季 2012-10 播出）、末代皇帝 kind series→movie（1987 贝托鲁奇电影）；其余年份/译名全部核对无误（浪浪山小妖怪英文名 Nobody 为官方译名）
    ⑧ verify73 B1 评分期望随用户编辑改 **7.5**（用户在网页端改过，**保留用户改动不回退**）；B5/B6 条数断言改**数据推导**（用户持续录片，不写死 29/41/16/86）
    ⑨ **存疑未改，等用户定夺**：《紫罗兰永恒花园外传》year=2020（日本 2019-09-06 限定上映→转常驻 / 内地 2020-01-10；库内日本动画惯例取日本首映年，**建议 2019**）；《小森林》year=2015（夏秋篇 2014-08-30 / 冬春篇 2015-02-14，两部跨年，取 2015 可辩护）
  - 第 75 轮（**已上线 `aaf3f26`**，推送 `54568dd..aaf3f26`）① **图片加载性能**：新建 `scripts/watch-variants.mjs` 为海报生成响应式变体（320/480，只缩不放 / WebP q80 / effort4，与 `watch-add.mjs` 同一管道，命名 `<主干>-<宽>.webp`）；`watch.json` 新增**可选**字段 `poster_320` / `poster_480`（缺省回退 base，向后兼容）。最终 **poster_320 106 条 / poster_480 100 条**（6 张 base 宽 ≤480 只缩不放）；体积 base 8.86MB → 320 档 **2.92MB（−67%）** / 480 档 4.69MB（−47%）
    ② **网格改 srcset + sizes**：`(max-width:480px) 45vw / (max-width:860px) 32vw / (min-width:1440px) 266px / 234px`（对应实测卡片宽 390→170 / 860→265 / 1280→233 / 1440→265 五列），`src` 仍留 base 兜底；**时间轴缩略图直接用 320 变体**
    ③ **新增 `docs/sw.js`**（Service Worker）：Pages 静态资源只给 `max-age=600`，刷新超 10 分钟要 102 张逐一 ETag 协商 → 海报是内容哈希不可变资源，走 cache-first；**只拦 `/img/watch/*.webp`**，跨域与 html/css/js/watch.json 一律不 `respondWith`
    实测（本地）：首访 102 张传输 **1,199KB**、最后一张图 910ms；二访（SW 命中）**0KB / 85ms**；三访 **0KB / 32ms**。线上实测：**106/106 个海报响应 `fromServiceWorker()===true`**、二次访问 transferSize 全 0
    ④ **默认态改为「网格 + 评分序」且不再持久化**：删 `LAYOUT_KEY`/`SORT_KEY`，不再读写 `watch-layout`/`watch-sort`，启动固定 `setLayout('grid', true)` + `setSort('rating', true)`（**筛选类别 kind 仍持久化**）；会话内切换仍生效，陈旧键被忽略
    ⑤ **录入链路同步**：网页加号与 `watch-add.mjs` 都生成 320/480 变体并写回字段（编辑模式搬运 `poster_<w>`、换海报删旧变体）
    ⑥ `watch.js?v=10→v=11`（CSS 未动不 bump）；新增 `tests/verify/verify75.mjs`（17 条）+ `tests/online/online75.mjs`（14 条），全量 **22 套件 870/870 0 FAIL**
    ⑦ **上线合并**：用户新录 4 部 → 远端 102→106 条，用 `tests/tools/merge75_rebase.py` 合并（远端基底 + 重放变体字段，用户字段零改动）；新海报缺变体 → 补跑 `scripts/watch-variants.mjs` 生成 8 个
- 回归基线：**22 个脚本 0 FAIL**（106 条数据，共 870 条断言；`verify75.mjs` 17 条 + 线上 `online75` 14 条）。
  `verify67` 的高度判据已从代理观测值升级为**真不变量**：`条目高 ≡ max(缩略图高, 名称头高) + 固定 chrome`（8 档视口实测差值恒为 28），
  取代原来的「折行条目只高 1px」和「英文名最多 2 行」——后两者只是 (中文名2行/英文名2行) 一种组合下的快照，第 65 轮契约本就是「折行而不是顶宽、不截断」。
- 归档：每轮成果在 `C:\Users\33329\Documents\Misc\对话成果\Steam游戏时长站\06_验证截图\<日期>_<主题>\`（含 `归档清单.md` + 截图 + 脚本），索引在 `Documents\Misc\对话成果\索引.md`。

## 四、硬约束（违反必炸，务必遵守）

1. **改 `docs/` 里的静态资源必须 bump `?v=N`**（每个文件独立计数）。版本号在 10+ 个回归脚本里**硬编码**，bump 必须同步（`tests/verify/*.mjs` 里 `watch.css?v=16` / `watch.js?v=11`）。
2. **`docs/` 是发布根，不要往里面塞构建步骤/源码目录**；两个页面资源互不引用。
3. **不要动 `data/` 管线的原始数据**（achievements/daily/manual/overrides/snapshots/cache），它们是每晚 diff 的源。
4. **不要用 `https://github.com` 根路径判断可达性**；本机 `hosts` 把 github 系列域名指到 127.0.0.1。判断能否推送用 `git ls-remote origin main`。
5. **代理端口会变**：`env | grep -i proxy` 看当前端口；「监听中」≠「能通」，失败就换端口重试。裸 curl 访问 github 要加 `--ssl-no-revoke`，访问本地加 `--noproxy '*'`。
6. **线上验证不能用 curl**（CDN 可能回旧内容），要用 Playwright（`--no-proxy-server`）+ 页内 `fetch(url,{cache:'reload'})` 按内容指纹判新旧。
7. **推送前必须 fetch/rebase**（CI 每晚改 `docs/index.html` + 用户随时用网页加号加数据）；`watch.json` 冲突用 `tests/tools/merge*.py` 以「远端为基底 + 重放本地改动」解决。**禁 `--force`**。
8. 条数/百分比等**写死数字的断言会随数据漂移**，期望值要从数据里读。
9. **删东西前先查引用**：`blackrose.woff`（TTF）是 `style.css` 的字体回退，别当冗余删；海报换图后旧文件无引用才可删。

## 五、如何继续（标准工作流）

1. **改代码** → 2. **bump 版本号并同步回归脚本里的硬编码** → 3. **起本地服务 + 跑 22 个套件**（`tests/README.md` 有命令）→ 4. **`git commit`** → 5. 用户说「上线」才 **fetch → rebase（解 `watch.json` 冲突用 merge 脚本）→ 重跑 → push** → 6. **轮询 Pages 内容指纹** → 7. **跑 `tests/online/online*.mjs` 复验** → 8. **归档到 Documents + 追加索引 + 写记忆**。

新增功能/改动通常是「新轮次」：新建 `tests/verify/<下一号>.mjs` 专门覆盖新契约，旧套件原样留档（只为真契约变更改判据，不为跑绿调阈值）。

## 六、最常踩的坑（浓缩版）

- 量文字宽度用 `Range.selectNodeContents(el)` 墨迹宽，别量盒子（flex 子项会被拉伸到一样宽）。
- 时间轴列对齐靠「固定列宽」；新加更长的中文片名（>220px，约 11 个汉字）会折两行——这是预期行为，`verify67` 已允许 ≤2 行。
- 给某元素新增「带同名选择器」的 CSS 规则时，**放在主规则之后**，否则会污染「取首个 `.xxx{}` 片段」的静态断言。
- 截图前预热图片；首屏外的图先 `scrollIntoView` 再等 `complete && naturalWidth>0`。
- **⚠️ 带 `w` 描述符的 srcset，`img.naturalWidth` 是「密度校正 intrinsic 尺寸」**（≈ 卡片布局宽，不是被选中文件的原图像素宽）——320 候选放在 265px 卡片上会报 266。要判真实尺寸得 `fetch(currentSrc)` + `createImageBitmap` 量（verify70 C3 / verify75 B6）。变体高由 sharp 按比例算（472.5→472），断言用 **±1 容差**，别写 `=== Math.round(...)`。
- **⚠️ Service Worker 会绕过 Playwright `page.route`**（Chromium 设计，SW 里的 fetch 由 SW 自己发）→ `docs/sw.js` 必须**只**拦 `img/watch/*.webp`，一旦 `respondWith` 了 watch.json，verify57/verify69 的 mock 就失效。
- **正则里 `\[\^?#\]+` 的 `+` 作用到了 `\]` 字面量上**（应为 `\[\^?#\]\+`）→ 判源码某一行是否原样存在，用字符串 `includes()` 比正则更稳。
- 字体 swap 会污染逐像素比对的截图 → 「取稳定帧」（连续两次 md5 相同才采信）。
- 测「写远端」的功能用 `page.route` 拦截 `api.github.com`，别真写仓库。
- bash 双引号里写 `node -e` 带反引号会静默丢字 → 用 `.cjs`/`.py` 补丁文件或 `<<'EOF'`。
- **id = `<watched_at>-<slug>`，slug 对纯中文片名会回落 `item`** → 同日两部中文片曾互相覆盖（玉子事故）。现在同 id 不同片名会自动追 `-2/-3`；**恢复被覆盖的数据去 git 历史里翻**（`git log -- docs/data/watch.json`，提交信息就是片名）。
- **怀疑又有数据被撞车吞掉时，别凭印象，写全量扫描**：遍历 `git log --reverse --format=%H%x09%cI -- docs/data/watch.json` 的每个提交，
  逐个比对「某 (id,title) 在前一个提交有、这个提交没了，且同一 id 被不同 title 占用」= 撞车。
  第 72 轮上线时这么一扫，在已知的玉子之外又查出《工作细胞》《境界的彼方》两条被吞——用户连海报都上传了，数据却没了，海报成了孤儿。
  扫出来先人工分类：**用户主动改名 / 订正观看日期**（太平年、觉醒年代、小林家的龙女仆、末日三问）不是事故，别乱"恢复"。
- `scripts/watch-add.mjs` 依赖 sharp，装在仓库根 `node_modules/`（已被 `.gitignore` 忽略）；换机器要重装。

## 七、可能待办 / 建议方向（供后续）

- 网格视图也支持点击编辑（目前只有时间轴）。
- 编辑模式支持换海报（目前只读，换图会留孤儿文件，需要补「删旧图」逻辑）。
- 超长中文片名（如《Re：从零开始的异世界生活》13 字）在时间轴名称列折两行——第 71/72 轮确认为**预期行为**（列对齐不受影响，折行条目高 143 其余 142）；要彻底单行得把名称列从 220/224px 加宽到 ~260px，需重新分配列宽。
- ~~玉子两部目前共用同一句短评~~ **已解决（第 72 轮上线）**：爱情故事「餅が一番好きです！どうぞ！」/ 市场「最喜欢了饼藏了！请讲！」
