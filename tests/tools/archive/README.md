# tests/tools/archive — 历史一次性脚本（留档，不在回归链路里）

这些脚本各自只服务**某一轮的某一次操作**，已经跑完、不再维护。
保留它们是为了「当时怎么验的」可追溯，**不要**在改代码时依赖它们。

| 前缀 | 做什么 | 备注 |
|---|---|---|
| `bump*_css.mjs` / `bump102b/c/d.mjs` / `bump90_index.mjs` | 把 `style.css?v=NN` / `watch.css?v=NN` 推到下一版 | 覆盖三种字面量形态：纯文本、正则转义、`cssV === 'NN'` 裸字符串。新写 bump 脚本时**复制一份改两个常量**，注意脚本自身的「旧→新」字面量要拼接构造，否则第一次跑就自伤 |
| `shot*.mjs` / `probe*.mjs` | 某一轮的取证截图与尺寸探针 | 依赖当时的具体断言，改版后数字会过期 |
| `p8x_poll.mjs` / `p102_poll.mjs` | 推送后轮询 GitHub Pages 是否生效 | 判据是版本号指纹 + 文件 md5（CRLF→LF 归一） |
| `merge*.py` / `merge80_rebase.mjs` | `watch.json` 数据冲突合并 | ⚠️ 本任务不涉及观影页，仅留档 |
| `gen90_extra.mjs` / `cover-one.mjs` / `rebrand92.mjs` / `shrink90b.mjs` / `review83_shots.mjs` | 一次性数据生成、单图标重生成、改名、截图压缩 | — |
| `rewire102.mjs` | 2026-11-04 目录重组时的路径改写器 | 记录了「脚本整体下移一层要改 `path.resolve(__dirname,'..')` → `'..','..'`」这件事 |

> 判断标准：**能对着任意版本反复跑的**留在上一级 `tests/tools/`；**只为一次操作服务的**放这里。
