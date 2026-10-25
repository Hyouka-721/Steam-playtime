# Steam 每日游戏时长统计站

通过 GitHub Actions 每日定时抓取 Steam 快照，差分计算每日游戏时长，发布到 GitHub Pages。

**在线地址**：<https://Hyouka-721.github.io/steam-playtime/>

---

## 原理（重要）

Steam Web API **没有「某天玩了多久」这个接口**，只提供：

- `playtime_forever`：累计总分钟数
- `playtime_2weeks`：滚动两周分钟数（且是条件字段，仅近期玩过的游戏才返回）

因此每日时长只能由**每日快照 + 差分**得出：

```
当日时长 = 今日 playtime_forever − 上一次快照的 playtime_forever
```

由此带来的两个硬性限制：

1. **历史无法回溯**。数据自第一份快照开始积累，之前的日期补不回来，任何声称能补历史的第三方都是估算。
2. **首份快照不产出时长**，只作为对比基准。第二天起才有第一条可用数据。

---

## 目录结构

```
scripts/
  fetch.mjs            调 Steam API → data/snapshots/YYYY-MM-DD.json
  diff.mjs             全量快照重算 → data/daily/YYYY-MM.json
  build.mjs            生成 docs/data/*（含脱敏与统计汇总）
  diff.test.mjs        21 条边界用例的可执行单测
  lib/steam.mjs        API 封装：重试、429 退避、隐私/部分返回检测
  lib/diff-core.mjs    差分算法（纯函数）
  lib/dates.mjs        Asia/Shanghai 日期工具
data/
  snapshots/           原始快照，永久保留，永不覆盖（除非 FORCE）
  daily/               差分产物
  manual/              手动补录（见该目录 README）
  overrides/           中文名映射
docs/                  GitHub Pages 发布源（index.html / app.js / style.css / data/）
  watch.html/.css/.js  观影记录页（完全独立，自带影院黑主题，不加载 index 的资源）
  data/watch.json      观影数据唯一来源；img/watch/*.webp 电影海报
tests/                 回归测试套件（第 70 轮起收编，见 tests/README.md）
  verify/              19 个本地回归脚本（verify6 / verify47~70.mjs）
  online/              上线后对 Pages 的内容指纹复验
  tools/               rebase 时 watch.json 冲突合并器
CONTINUE.md            项目交接提示词（可直接复制到新对话无缝续做）
```

---

## 本地使用

```bash
npm test                                   # 跑 21 条边界用例
export STEAM_API_KEY=你的密钥
export STEAM_ID64=你的SteamID64
npm run fetch                              # 抓一次快照
npm run pipeline                           # diff + build，重新生成前端数据
```

其他环境变量：

| 变量 | 作用 |
|---|---|
| `OVERRIDE_DATE` | 指定快照日期 `YYYY-MM-DD`，用于补录 |
| `FORCE` | `true` 时覆盖同日已有快照 |

---

## 部署

### 1. 配置 Secrets

仓库 **Settings → Secrets and variables → Actions → New repository secret**，添加两个：

| Name | Value |
|---|---|
| `STEAM_API_KEY` | https://steamcommunity.com/dev/apikey 生成的 32 位密钥 |
| `STEAM_ID64` | 17 位 SteamID64，可在 https://steamid.io 查询 |

> ⚠️ 密钥等同于账号访问凭证，**不要写进任何文件、README 或 issue**。若泄露，到原页面点 "Revoke My Steam Web API Key" 作废重发。

### 2. Steam 隐私设置

Steam → 个人资料 → 编辑个人资料 → 隐私设置：

- 「我的个人资料」= 公开
- 「游戏详情」= **公开**
- ⚠️ 取消勾选 **「始终隐藏我的总游戏时长」**（只改上面两项不够，这一项仍会让所有时长字段返回空）

改完等 2–5 分钟让 Steam 缓存刷新。

### 3. 开启 Pages

**Settings → Pages → Build and deployment**

- Source：`Deploy from a branch`
- Branch：`main`，文件夹：`/docs`
- 点 Save

首次发布后约需 1–10 分钟生效。

### 4. 首次触发

到 **Actions → Daily Steam Playtime Snapshot → Run workflow**，直接绿色按钮运行一次，确认能产出快照。

此后每天北京时间 23:30 自动执行。

### 5. 轮换密钥（怀疑泄露时）

1. 打开 https://steamcommunity.com/dev/apikey，点 **Revoke My Steam Web API Key** 作废旧 Key。
2. 重新生成一个新 Key（域名可任意填写，本地脚本与 Actions 都不校验）。
3. 仓库 **Settings → Secrets and variables → Actions**，用新值覆盖 `STEAM_API_KEY`。
4. 本地若用 `.env`，同步更新（可先 `cp .env.example .env`）。
5. 手动 **Run workflow** 一次，确认新 Key 能正常取数。

> GitHub Secret 保存后无法再查看，只能覆盖。Secret 一旦更新，**所有**用到它的分支立即生效，无需改代码。

### 6. 自检清单

```bash
git ls-files | grep -iE "^\.env|secret"   # 应无输出：确认 .env 没被提交
grep -rn "STEAM_API_KEY" .github/          # 只应出现 ${{ secrets.STEAM_API_KEY }} 引用
```

---

## 数据 Schema

### `data/snapshots/YYYY-MM-DD.json`

```json
{
  "schema": 1,
  "date": "2026-10-13",
  "captured_at": "2026-10-13T11:19:05.891Z",
  "captured_at_local": "2026-10-13 19:19:05",
  "source": "github-actions",
  "run_id": "12345678901",
  "steamid_hash": "a8474caf",
  "game_count": 53,
  "played_game_count": 38,
  "shared_game_count": 0,
  "games": {
    "730": {
      "appid": "730",
      "name": "Counter-Strike 2",
      "img_icon_url": "8dbc71957312bbd3baea65848b545be9eae2a355",
      "playtime_forever": 786,
      "playtime_2weeks": null,
      "rtime_last_played": 1658052808,
      "origin": "owned"
    }
  }
}
```

`origin`：`owned` 来自 `GetOwnedGames`，`recent` 来自 `GetRecentlyPlayedGames`（家庭共享游戏）。

### `docs/data/daily/YYYY-MM.json`

```json
{
  "schema": 1,
  "month": "2026-10",
  "tz": "Asia/Shanghai",
  "unit": "minute",
  "generated_at": "2026-10-13T11:19:05.891Z",
  "days": {
    "2026-10-13": {
      "total_minutes": 95,
      "span_days": 1,
      "confidence": "high",
      "source": "auto",
      "flags": [],
      "games": [
        { "appid": "730", "name": "Counter-Strike 2", "minutes": 60, "is_new": false }
      ]
    }
  }
}
```

### `docs/data/meta.json`

汇总统计、游戏索引与采集健康度。**不含完整 steamid**，只有 `steamid_hash`。

---

### `docs/data/watch.json`

观影记录（`watch.html` 的唯一数据源）。`items` 按 `watched_at` 倒序排，**同一天的按 `added_at` 正序（先上传的居前）**，由 `scripts/watch-add.mjs` 与网页加号共同维护，一般不用手写。

```json
{
  "updated_at": "2026-10-24T20:37:00+08:00",
  "items": [
    {
      "id": "2026-10-24-oppenheimer",
      "title": "奥本海默",
      "title_en": "Oppenheimer",
      "kind": "movie",
      "year": 2023,
      "release_date": "2023-07-21",
      "watched_at": "2026-10-24",
      "rating": 9,
      "poster": "img/watch/oppenheimer-9ea6bb79.webp",
      "poster_w": 640,
      "poster_h": 960,
      "tags": ["传记"],
      "note": "诺兰的原子弹三小时"
    }
  ]
}
```

| 字段 | 说明 |
|---|---|
| `id` | 主键。默认 `<watched_at>-<英文 slug>`；**同 id 且同片名再录一次 = 更新该条**（改感想、换海报，上传时间沿用首次录入）；同 id 但不同片名会自动追 `-2`/`-3` 后缀换成新 id（防同日两部都没英文名的条目互相覆盖） |
| `added_at` | 上传时间（ISO 8601 本地串，如 `2026-10-25T12:46:43+08:00`）。**同日记录按它正序排列，先上传居前**；编辑条目不会刷新它 |
| `poster` / `poster_w` / `poster_h` | 海报相对路径与真实像素（写宽高是为了让页面提前占位、不抖动） |
| `watched_at` | 支持 `2026-10-24` / `2026-10` / `2026` 三种粒度，混排也能正确排序 |
| `kind` | `movie` 或 `series`，对应筛选条的「电影 / 剧集」 |
| `rating` | 0~10，可小数；不填则不显示评分角标。**显示时统一保留一位小数**（9 → `★9.0`、8.5 → `★8.5`） |
| `release_date` | 可选，上映日期 `YYYY-MM-DD`。时间轴的「上映」一栏优先显示它，没有则回退到 `year`（只显示年份） |

---

## 添加观影记录

入口：`watch.html`（页眉右上角史蒂夫切换「网格 / 时间轴」两种视图）。三种添加方式，日常随手记用**网页加号**，批量导入用**命令**。

### 方式一：点网页右下角的加号（最简单）

`watch.html` 右下角有个圆形 **+** 按钮，点开就是表单：海报（可选）、片名、英文名、类型、年份、观影日期、评分、标签、短评。填完点「提交」，页面直接调 GitHub API 把**海报 + `watch.json`** 提交进仓库 —— 本机立刻能看到新条目，其他设备约 **15~40 秒**后随 Pages 生效。

**首次使用要先配一次 Token**（只需一次，存在本机浏览器里）：

1. 打开这个**参数已预填**的链接（`contents=write`、永不过期、owner 指向你账号）：

   <https://github.com/settings/personal-access-tokens/new?name=Steam-playtime+watch&description=Watch+list+upload&contents=write&expires_in=none&target_name=Hyouka-721>

2. **Repository access** → 选 **Only select repositories** → 勾 `Steam-playtime`
   （这一项无法用 URL 参数预填，必须手选）
3. 扫一眼 **Permissions → Repository permissions → Contents** 是否为 **Read and write**（预填已设好；其余全部留 No access）
4. 滚到底点 **Generate token** → 复制页面上的 `github_pat_…`
   ⚠️ **只显示这一次**，关掉页面就再也看不到，只能重建
5. 回到页面点加号 → 展开最下方「GitHub Token」→ 粘贴 → 「保存」，右侧状态从「未设置」变成「**已设置**」

> 用 Classic token（`ghp_…`）也行，勾 `repo` 权限即可，但授权面大得多，不推荐。
>
> ⚠️ **本机 hosts 把 `github.com` 指向了 `127.0.0.1`**（系统级配置）。浏览器没走代理时点上面的链接会显示「无法访问此网站」。三种解法：① 让浏览器走代理；② **用手机（移动数据）登录 GitHub 建好 token 再复制过来** —— token 与设备无关，在哪台设备生成都行；③ 临时注释掉 hosts 里 `127.0.0.1 github.com` 那一行（改完 `ipconfig /flushdns`）。

保存后小试一次提交，页面底部提示区会直接告诉你哪里不对：

| 提示 | 含义 | 怎么办 |
|---|---|---|
| `401` | token 无效 / 过期 / 已被撤销 | 重新生成一个 |
| `403` | 权限不够 | 确认 `Contents` 是 **Read and write** |
| `404` | 仓库没被包含 | `Only select repositories` 里必须勾上 `Steam-playtime` |
| `409` | 同一时刻另有提交在改 `watch.json` | 等 10 秒重试一次 |

Token **只写进本机 `localStorage`**（键名 `watch-gh-token`），页面代码里没有任何硬编码密钥，也不会随仓库发布出去。换电脑/换浏览器要重填一次；公共电脑用完点「清除」。

表单里的几个细节：
- **海报可以不传** —— 会自动生成一张 640×960、带片名的深色占位图，先记着以后补
- 压图规则与下面命令行**完全一致**：宽 640、只缩不放、WebP q0.8、按内容哈希命名，所以同一张图不会重复上传
- `id` 由「观影日期 + slug」拼成（如 `2026-10-24-oppenheimer`），同 id 再提交一次就是**覆盖那一条**

### 方式二：一条命令（批量 / 本地已有图）

在**仓库根目录**执行（需要 `sharp`，`npm i` 时已装）：

```bash
node scripts/watch-add.mjs \
  --img ~/Downloads/海报.jpg \
  --title "奥本海默" \
  --en Oppenheimer \
  --year 2023 \
  --watched 2026-10-24 \
  --rating 9 \
  --note "诺兰的原子弹三小时"
```

它一条命令做完四件事：**压成 WebP → 按内容哈希命名写进 `docs/img/watch/` → 去重合并 `docs/data/watch.json` → 按观影时间倒序重排（同日按上传时间正序）**。

| 参数 | 必填 | 说明 |
|---|---|---|
| `--img` | ✅ | 海报图，jpg / png / webp / avif 均可 |
| `--title` | ✅ | 片名 |
| `--en` | | 英文原名，同时用来生成文件名与 id 的 slug |
| `--kind` | | `movie`（默认）/ `series` |
| `--year` | | 年份 |
| `--watched` | | 观影时间，默认今天；支持 `2026-10-24` / `2026-10` / `2026` |
| `--rating` | | 0~10，可小数 |
| `--tags` | | 逗号分隔，如 `--tags 传记,历史` |
| `--note` | | 一两句短评 |
| `--id` | | 自定义 id，用于精确覆盖某一条 |
| `--width` | | 海报目标宽度，默认 640（**只缩不放**） |
| `--quality` | | WebP 质量，默认 80 |
| `--crop 2:3` | | 裁到指定比例；**默认不裁**，交给 CSS 的 `aspect-ratio` + `object-fit: cover` |
| `--dry` | | 只打印结果，不写文件（先预览一下很值） |

然后提交上线（README 改动不影响站点，但 `docs/` 下的改动必须推送才会生效）：

```bash
git add docs/data/watch.json docs/img/watch && git commit -m "data(watch): 新增《奥本海默》" && git push
```

push 后约 15~40 秒 GitHub Pages 生效，刷新页面即可看到。

### 方式三：直接在 GitHub 网页改

1. 把海报传到 `docs/img/watch/`（文件名随意，建议带哈希或英文名）；
2. 编辑 `docs/data/watch.json`，往 `items` 里加一条（字段见上面的 schema），顺手改 `updated_at`；
3. Commit —— 页面大约 1 分钟后生效。

> 手写时**别漏 `poster_w` / `poster_h`**：它们让海报占位不抖动；填错只会导致轻微布局跳动，不会报错。

### 几个要点

- **同一条重录不会重复**：`id` 相同就是「更新」，可用来改评分、换海报、补感想；换海报时旧图会被自动删除
- **海报建议竖版**：网格视图按 2:3 裁切显示，横版图会被裁掉两侧；想精确控制就用 `--crop 2:3`
- **换图一定会刷新**：文件名带内容哈希，不会被 CDN 或浏览器缓存住
- **`--dry` 先看看**：会打印 `id`、压缩前后体积、目标尺寸与总条数，不落任何文件
- 数据为空时页面显示空态指引，加第一条即可自动切换到正常视图

---

## flags 含义

| flag | 含义 |
|---|---|
| `first_snapshot` | 第一份基准快照，无法计算当日时长 |
| `negative_delta` | 出现负增量（Steam 回滚 / 换号 / 共享归还），已记 0 |
| `new_game` | 上次快照中不存在的游戏 |
| `implausible_delta` | 增量超过 `1440 × span_days × 1.1`，判为累计值，已记 0 |
| `shared_reentry` | 历史上出现过的家庭共享游戏重新计入，易把总时长当成当日时长 |
| `game_removed` | 有游戏从库中消失，不影响其他游戏增量 |
| `gap_filled` | 与上份快照间隔超过 1 天，数值覆盖多天 |
| `multi_day` | 间隔 ≥ 3 天，置信度降为 low |
| `total_implausible` | 单游戏均合法但当日总量超上限 |
| `manual_override` | 该天被手动数据修正 |

---

## 已知限制

- **历史不可回溯**，请以基线日为准。
- **家庭共享游戏**：超过两周未玩再次游玩时，`GetRecentlyPlayedGames` 会将其视为新游戏，`playtime_forever` 会被误判成当日时长。此类情况已被 `implausible_delta` 拦截记 0，可用手动补录修正。
- **GitHub Actions cron 不保证准时**，高峰期可能延迟或被跳过；公开仓库 60 天无活动会自动禁用 schedule，`workflow_dispatch` 已在配置中保留作为恢复入口。
- 时长含离线游玩与挂机时间，Steam 服务端统计口径与本地可能略有差异。
