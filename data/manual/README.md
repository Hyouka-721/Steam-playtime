# 手动补录

当某天漏采（GitHub Actions 未执行）或自动数据被误判（例如家庭共享游戏把累计时长记成了当日时长），可以在这里补一条，然后执行 `npm run pipeline` 重新生成站点数据。

文件命名：`YYYY-MM-DD.json`（也可任意命名，但文件内必须带 `date` 字段）。

## 格式

```json
{
  "date": "2026-10-13",
  "note": "当天 Actions 未执行，按记忆补录",
  "mode": "replace",
  "games": [
    { "appid": "730", "name": "Counter-Strike 2", "minutes": 120 },
    { "appid": "570", "name": "Dota 2", "minutes": 45 }
  ]
}
```

## 字段说明

| 字段 | 必填 | 说明 |
|---|---|---|
| `date` | 是 | `YYYY-MM-DD`（Asia/Shanghai 自然日） |
| `games` | 是 | 数组，每项含 `appid`、`name`、`minutes` |
| `mode` | 否 | `replace`（默认）：完全替换当天记录；`merge`：同名 appid 以手动值为准，其余保留自动数据 |
| `note` | 否 | 备注，不进入前端数据 |

写入后该天的 `confidence` 会被标为 `manual`，热力图上正常显示（不降透明度），并带上 `manual_override` 标记。

> 注意：补录只对「已有快照的那一天」生效——`rebuildDays` 先由快照生成日期列表，再把 manual 套上去。如果那天根本没有快照，请先用 workflow 的 `backfill_date` 参数补一份快照（`FORCE` 视情况开启）。
