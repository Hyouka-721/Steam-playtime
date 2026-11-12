# Steam 每日游戏时长统计站

通过 GitHub Actions 每日定时抓取 Steam 快照，差分计算每日游戏时长，发布到 GitHub Pages。

**在线地址**：<https://hyouka-721.github.io/steam-playtime/>

## 原理（重要）

Steam Web API **没有「某天玩了多久」这个接口**，只提供 `playtime_forever`（累计总分钟数）与 `playtime_2weeks`（滚动两周分钟数，且是条件字段，仅近期玩过的游戏才返回）。因此每日时长只能由**每日快照 + 差分**得出：

```
当日时长 = 今日 playtime_forever − 上一次快照的 playtime_forever
```

两个硬性限制：**历史无法回溯**（数据自第一份快照开始积累，之前的日期补不回来）；**首份快照不产出时长**，只作为对比基准，第二天起才有第一条可用数据。

## 部署与使用

- 每天北京时间 23:30 自动执行；也可到 **Actions → Daily Steam Playtime Snapshot → Run workflow** 手动运行一次，确认能产出快照。
- 需要两个 Secrets：`STEAM_API_KEY`（https://steamcommunity.com/dev/apikey 生成的 32 位密钥）与 `STEAM_ID64`（17 位，可在 https://steamid.io 查询）。密钥等同于账号访问凭证，**不要写进任何文件、README 或 issue**。
- Steam 隐私设置：「我的个人资料」= 公开、「游戏详情」= 公开，并取消勾选「始终隐藏我的总游戏时长」。
- Pages 从 `main` 分支的 `/docs` 发布（Source：`Deploy from a branch`），首次发布约 1–10 分钟生效。
- 本地：`npm test`、`npm run fetch`（抓一次快照）、`npm run pipeline`（diff + build，重新生成前端数据），需 `STEAM_API_KEY` 与 `STEAM_ID64`；`OVERRIDE_DATE` 指定快照日期 `YYYY-MM-DD` 用于补录，`FORCE=true` 覆盖同日已有快照。

## 数据

- `data/snapshots/YYYY-MM-DD.json`：原始快照，永久保留，永不覆盖（除非 `FORCE`）。
- `data/daily/YYYY-MM.json`：差分产物。
- `docs/data/meta.json`：汇总统计、游戏索引与采集健康度；**不含完整 steamid**，只有 `steamid_hash`。
- `docs/data/watch.json`：观影记录（`watch.html` 的唯一数据源），`items` 按 `watched_at` 倒序，同一天按 `added_at` 正序（先上传的居前）。

## 观影记录页

`watch.html` 是完全独立的观影记录页，自带影院黑主题，不加载 index 的资源。页眉右上角可切换「网格 / 时间轴」；网格视图支持按观看时间（默认）或评分排序，选择记在本机浏览器里，刷新不丢。

添加记录有三种方式：网页右下角 **+** 表单（直接调 GitHub API 提交海报 + `watch.json`，首次需配一次 [GitHub Token](<https://github.com/settings/personal-access-tokens/new?name=Steam-playtime+watch&description=Watch+list+upload&contents=write&expires_in=none&target_name=Hyouka-721>)，只存本机 `localStorage`）、`node scripts/watch/watch-add.mjs`（压成 WebP → 按内容哈希命名 → 去重合并 `watch.json` → 按观影时间倒序重排），或直接在 GitHub 网页编辑 `docs/data/watch.json`。`docs/` 下的改动必须推送才会生效，约 15~40 秒后随 Pages 更新。

## 已知限制

- **家庭共享游戏**：超过两周未玩再次游玩时，`GetRecentlyPlayedGames` 会将其视为新游戏，`playtime_forever` 会被误判成当日时长。此类情况已被 `implausible_delta` 拦截记 0，可用手动补录修正。
- **GitHub Actions cron 不保证准时**，高峰期可能延迟或被跳过；公开仓库 60 天无活动会自动禁用 schedule，`workflow_dispatch` 已在配置中保留作为恢复入口。
- 时长含离线游玩与挂机时间，Steam 服务端统计口径与本地可能略有差异。
