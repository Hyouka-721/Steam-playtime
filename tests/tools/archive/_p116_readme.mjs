/* _p116_readme.mjs — README：加 verify116 行 + 基线 15 套件 355 条（139/125） */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const f = path.join(ROOT, 'tests/README.md');
const raw = fs.readFileSync(f, 'utf8');
const crlf = raw.includes('\r\n');
let s = raw.replace(/\r\n/g, '\n');

/* 1) 在 verify115 行前插 verify116 */
const anchor = '| `verify115` | 第 115 轮 index 侧：';
const row = '| `verify116` | 第 116 轮 index 侧：**统计口径统一** —— 自 `meta.tracking_since` 到 `meta.last_snapshot_date`，缺数据的日期一律按 **0 分钟**补齐（`.l0` 灰点、`role=button` 可点、气泡「游玩时长：0 min」、当日列表「这天没有游玩记录」），不再出现「未采集」空格；开始统计之前与最新快照之后的未来日期仍是 `.lna`「尚未记录」且不可点；范围天数、合计、峰值从 `meta.stats` 推导比对；365 格 / 7 行 / 64 列不变；390 无溢出；零异常 | 14 |';
if (s.split(anchor).length - 1 !== 1) throw new Error('没找到 verify115 行');
s = s.split(anchor).join(row + '\n' + anchor);

/* 2) 基线 */
const pairs = [
  ['= **14 套件 341 条**，第 115 轮实测 0 FAIL。', '= **15 套件 355 条**，第 116 轮实测 0 FAIL。'],
  ['index 侧第 115 轮：**14 套件 341 条 0 FAIL**（`style.css?v=139` / `app.js?v=124`）', 'index 侧第 116 轮：**15 套件 355 条 0 FAIL**（`style.css?v=139` / `app.js?v=125`）'],
  ['index 线已推进到第 115 轮，别用它代指全站状态', 'index 线已推进到第 116 轮，别用它代指全站状态'],
  ['`verify103/104/105/106/108/111/113/115/82_index/83_index/91/92`', '`verify103/104/105/106/108/111/113/115/116/82_index/83_index/91/92`'],
];
for (const [a, b] of pairs) {
  const n = s.split(a).length - 1;
  if (n !== 1) throw new Error('命中 ' + n + ' 次：' + a.slice(0, 40));
  s = s.split(a).join(b);
}
fs.writeFileSync(f, crlf ? s.replace(/\n/g, '\r\n') : s);
console.log('README 已更新');
