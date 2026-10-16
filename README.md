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
