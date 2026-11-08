/* _p115_a12.mjs — verify83_index A12：函数清单里去掉已删除的 renderDrillMore */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const f = path.join(ROOT, 'tests/verify/verify83_index.mjs');
const raw = fs.readFileSync(f, 'utf8');
const crlf = raw.includes('\r\n');
let s = raw.replace(/\r\n/g, '\n');

const pairs = [
  ["'renderConvert', 'renderDrillMore', 'syncHash'", "'renderConvert', 'syncHash'"],
  ['（热力图/勋章/报告/目标/换算/详情/深链）', '（热力图/勋章/报告/目标/换算/深链；第 115 轮起没有单游戏详情）'],
];
for (const [a, b] of pairs) {
  const n = s.split(a).length - 1;
  if (n !== 1) throw new Error('命中 ' + n + ' 次：' + a.slice(0, 40));
  s = s.split(a).join(b);
}
fs.writeFileSync(f, crlf ? s.replace(/\n/g, '\r\n') : s);
console.log('A12 已改判');
