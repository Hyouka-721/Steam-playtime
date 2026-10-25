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
├── style.css app.js fx.js  # 游戏站样式/逻辑/特效
├── data/             # 发布数据：watch.json + achievements.json + daily/ + meta.json
└── img/              # 站点插画（rank-*/minion/steve）+ watch/（电影海报）
scripts/              # 数据管线（fetch/diff/build/backfill/inline-boot/localize）+ watch-add.mjs + lib/
data/                 # 管线原始数据（achievements/daily/manual/overrides/snapshots/cache），git 跟踪
tests/                # 第 70 轮新收编：回归测试套件
├── verify/           # 19 个本地回归脚本 verify6/47~70.mjs
├── online/           # 上线复验 online65/66/68/69/70.mjs
├── tools/            # rebase 数据冲突合并器 merge*.py
└── README.md         # 怎么跑 + 约定
.github/workflows/daily.yml  # 每晚 CI 快照
```

## 三、当前进度（截至 2026-10-25，第 71 轮已推）

- **已上线到 `bdd0ed5`**（rebase 后 `ac474dc..bdd0ed5`），线上数据 **45 部**电影。
- 版本号当前取值：`style.css?v=105` / `app.js?v=99` / `fx.js?v=16` / **`watch.css?v=15`** / **`watch.js?v=8`**。
- 观影页已完成的关键轮次（按时间）：
  - 第 57 轮 网页加号录入（Contents API 直写 + Token 存 localStorage）
  - 第 60 轮 网格 1.5 倍密度（1440 = 5 列）
  - 第 62/63/64/65 轮 时间轴横向一行 / 垂直居中 / 字号统一 / 长英文名防溢出
  - 第 66 轮 六项修正（去角标、评分一位小数、网格重排、分类更正、上映字段、去标题 title 提示）
  - 第 67 轮 时间轴改「表格式列网格」→ 同名字段跨条目对齐（六列唯一 x）
  - 第 68 轮 全站统一左轨（内容左轨 = `.w-main` padding-left，桌面 28 / ≤860 18；轴线用负偏移画进留白）
  - 第 69 轮 时间轴条目点击编辑（复用加号弹窗的「编辑模式」）
  - 第 70 轮 换《魔法石》海报 + 站名 `My Watch List` → `Watch List`
  - 第 71 轮 魔法石换成**正确**的海报（`...-70ce4e93.webp`），回归去硬编码
- 回归基线：**19 个脚本 804/804**（见 `tests/README.md` 的表）。
- 归档：每轮成果在 `C:\Users\33329\Documents\Misc\对话成果\Steam游戏时长站\06_验证截图\<日期>_<主题>\`（含 `归档清单.md` + 截图 + 脚本），索引在 `Documents\Misc\对话成果\索引.md`。

## 四、硬约束（违反必炸，务必遵守）

1. **改 `docs/` 里的静态资源必须 bump `?v=N`**（每个文件独立计数）。版本号在 10+ 个回归脚本里**硬编码**，bump 必须同步（`tests/verify/*.mjs` 里 `watch.css?v=15` / `watch.js?v=8`）。
2. **`docs/` 是发布根，不要往里面塞构建步骤/源码目录**；两个页面资源互不引用。
3. **不要动 `data/` 管线的原始数据**（achievements/daily/manual/overrides/snapshots/cache），它们是每晚 diff 的源。
4. **不要用 `https://github.com` 根路径判断可达性**；本机 `hosts` 把 github 系列域名指到 127.0.0.1。判断能否推送用 `git ls-remote origin main`。
5. **代理端口会变**：`env | grep -i proxy` 看当前端口；「监听中」≠「能通」，失败就换端口重试。裸 curl 访问 github 要加 `--ssl-no-revoke`，访问本地加 `--noproxy '*'`。
6. **线上验证不能用 curl**（CDN 可能回旧内容），要用 Playwright（`--no-proxy-server`）+ 页内 `fetch(url,{cache:'reload'})` 按内容指纹判新旧。
7. **推送前必须 fetch/rebase**（CI 每晚改 `docs/index.html` + 用户随时用网页加号加数据）；`watch.json` 冲突用 `tests/tools/merge*.py` 以「远端为基底 + 重放本地改动」解决。**禁 `--force`**。
8. 条数/百分比等**写死数字的断言会随数据漂移**，期望值要从数据里读。
9. **删东西前先查引用**：`blackrose.woff`（TTF）是 `style.css` 的字体回退，别当冗余删；海报换图后旧文件无引用才可删。

## 五、如何继续（标准工作流）

1. **改代码** → 2. **bump 版本号并同步回归脚本里的硬编码** → 3. **起本地服务 + 跑 19 个套件**（`tests/README.md` 有命令）→ 4. **`git commit`** → 5. 用户说「上线」才 **fetch → rebase（解 `watch.json` 冲突用 merge 脚本）→ 重跑 → push** → 6. **轮询 Pages 内容指纹** → 7. **跑 `tests/online/online*.mjs` 复验** → 8. **归档到 Documents + 追加索引 + 写记忆**。

新增功能/改动通常是「新轮次」：新建 `tests/verify/<下一号>.mjs` 专门覆盖新契约，旧套件原样留档（只为真契约变更改判据，不为跑绿调阈值）。

## 六、最常踩的坑（浓缩版）

- 量文字宽度用 `Range.selectNodeContents(el)` 墨迹宽，别量盒子（flex 子项会被拉伸到一样宽）。
- 时间轴列对齐靠「固定列宽」；新加更长的中文片名（>220px，约 11 个汉字）会折两行——这是预期行为，`verify67` 已允许 ≤2 行。
- 给某元素新增「带同名选择器」的 CSS 规则时，**放在主规则之后**，否则会污染「取首个 `.xxx{}` 片段」的静态断言。
- 截图前预热图片；首屏外的图先 `scrollIntoView` 再等 `complete && naturalWidth>0`。
- 字体 swap 会污染逐像素比对的截图 → 「取稳定帧」（连续两次 md5 相同才采信）。
- 测「写远端」的功能用 `page.route` 拦截 `api.github.com`，别真写仓库。
- bash 双引号里写 `node -e` 带反引号会静默丢字 → 用 `.cjs`/`.py` 补丁文件或 `<<'EOF'`。

## 七、可能待办 / 建议方向（供后续）

- 网格视图也支持点击编辑（目前只有时间轴）。
- 编辑模式支持换海报（目前只读，换图会留孤儿文件，需要补「删旧图」逻辑）。
- 超长中文片名（如《Re：从零开始的异世界生活》13 字）目前折两行，可考虑是否放宽名称列。
