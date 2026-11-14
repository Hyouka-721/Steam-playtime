# tests/index — GAME TIME（index 站）回归套件

**新对话只研究 index 站时，只跑这个目录。** watch 站在 `tests/watch/`，与这里无关。

## 16 个活跃套件（370 条断言，0 FAIL）

| 套件 | 守住什么 |
|---|---|
| `verify6` | 首屏请求预算 / 内联数据新鲜度分支 / 成就按需加载 / 缓存 / 榜单行不可点 |
| `verify54` | 图标尺寸与窄屏；两页共用契约 |
| `verify82_index` | 版本指纹 + 骨架屏形状 |
| `verify83_index` | 勋章墙 / 阶段报告 / 周目标 / 深链（无单游戏详情） |
| `verify91` | 里程碑 500h 一档 / 时间轴字号 |
| `verify92` | 站点图标与站名 / 页眉几何 |
| `verify103` | 栏目结构：只有「最近游玩」进点阵，榜单行不可点 |
| `verify104` | 导航入口收敛 / 旧深链落总览 |
| `verify105` | 双主题契约（cream / cinema） |
| `verify106` | 主题白名单与首屏回落 |
| `verify108` | 流星特效参数与亮度预算 |
| `verify111` | 一年点阵结构（365 格 / 7 行 / 64 列 / 气泡 / 当日列表） |
| `verify113` | 死码清零 / 点阵行距 = 列距 × 0.5 / 点开不滚动 |
| `verify115` | 下钻整条线已删除（榜单行、徽章、深链、CSS/JS 三层） |
| `verify116` | 统计口径：范围内缺数据按 0 分钟补，范围外仍 lna |
| `verify117` | 首屏榜单整行（`fitRankRows` / 行距 6px / 多尺寸不切半行 / CLS 0） |

## 跑法

```bash
NODE="C:/Users/33329/.workbuddy/binaries/node/versions/22.22.2-6/node.exe"
for s in verify6 verify54 verify82_index verify83_index verify91 verify92 \
         verify103 verify104 verify105 verify106 verify108 verify111 \
         verify113 verify115 verify116 verify117; do
  echo "== $s =="; "$NODE" tests/index/$s.mjs 2>&1 | tail -2
done
```

前提：`docs/` 起静态服务在 `127.0.0.1:8895`，且 **cwd 必须是仓库根**（`verify91/92` 按 cwd 读 `docs/app.js`）。

## 约定

- 新功能 = 新轮次 + 新建 `verify<轮号>.mjs`，**旧套件不删、不调阈值**；功能被删除时把旧套件移到 `../retired/`。
- 版本号 bump 后，本目录所有套件的指纹断言要同步（`style.css?v=NN` / `app.js?v=NN`）。
