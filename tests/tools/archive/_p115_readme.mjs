/* _p115_readme.mjs — 更新 tests/README：verify114 → verify115、基线 341 条、版本 139/124 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const f = path.join(ROOT, 'tests/README.md');
const raw = fs.readFileSync(f, 'utf8');
const crlf = raw.includes('\r\n');
let s = raw.replace(/\r\n/g, '\n');

/* 1) 套件行：把 verify114 那行整体换成 verify115 */
const lines = s.split('\n');
const i114 = lines.findIndex((l) => l.startsWith('| `verify114` |'));
if (i114 < 0) throw new Error('没找到 verify114 行');
lines[i114] = '| `verify115` | 第 115 轮 index 侧：**把「下钻单个游戏」整条线删干净** —— 累计榜行不再可点（光标非 pointer、点行不切视图不改 hash、连点四行仍停在原处）；页面里没有 `#drill-more` / `#btn-drill-back`，源码没有 `openDrill/closeDrill/renderDrillMore/drill.appid`，CSS 没有 `.drill-more`/`.dm-*`/`.is-drill`/`.btn-back`；勋章墙徽章从 `<button>` 改成 `<div>`（去掉 pointer 与 hover 上浮、提示语不再写「点一枚看趋势」），点它也不再跳转；旧深链 `#/recent/g/<appid>` 只按视图处理落到总览；「最近游玩」总点阵 365 格与点格子展开当日列表不受影响；390 无溢出；零异常。⚠️ 同日被推翻的 `verify114`（下钻只剩详情卡）已删除 | 16 |';
s = lines.join('\n');

/* 2) 基线 */
const pairs = [
  ['= **14 套件 339 条**，第 114 轮实测 0 FAIL。', '= **14 套件 341 条**，第 115 轮实测 0 FAIL。'],
  ['index 侧第 114 轮：**14 套件 339 条 0 FAIL**（`style.css?v=138` / `app.js?v=123`）', 'index 侧第 115 轮：**14 套件 341 条 0 FAIL**（`style.css?v=139` / `app.js?v=124`）'],
  ['index 线已推进到第 114 轮，别用它代指全站状态', 'index 线已推进到第 115 轮，别用它代指全站状态'],
  ['`verify103/104/105/106/108/111/113/82_index/83_index/91/92`', '`verify103/104/105/106/108/111/113/115/82_index/83_index/91/92`'],
];
for (const [a, b] of pairs) {
  const n = s.split(a).length - 1;
  if (n !== 1) throw new Error('命中 ' + n + ' 次：' + a.slice(0, 40));
  s = s.split(a).join(b);
}
fs.writeFileSync(f, crlf ? s.replace(/\n/g, '\r\n') : s);
console.log('README 已更新');
