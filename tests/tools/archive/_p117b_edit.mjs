/* _p117b_edit.mjs — 行距 8px 回退到 6px（算法参数同步，pad 必须 ≤ gap） */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const hits = [];
let cur = '';
function sub(a, b, label) {
  const n = cur.split(a).length - 1;
  if (n !== 1) throw new Error(`[${label}] 命中 ${n} 次`);
  cur = cur.split(a).join(b);
  hits.push(label);
}
function load(rel) {
  const raw = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  return { rel, crlf: raw.includes('\r\n'), text: raw.replace(/\r\n/g, '\n') };
}
function save(o) {
  fs.writeFileSync(path.join(ROOT, o.rel), o.crlf ? cur.replace(/\n/g, '\r\n') : cur);
}

/* ---------- style.css ---------- */
let f = load('docs/style.css');
cur = f.text;
sub(`/* 第 117 轮（用户：首屏要完整露出 8 款、不能切出第 9 款的边）：
   行距 4 → 8，行高由 app.js 的 fitRankRows() 按视口反解后写进 --rank-row-h，
   让折线永远落在「行与行之间」。窄屏（≤860）是两行式布局，不参与这套算法。 */
.rank-list { display: flex; flex-direction: column; gap: 8px; padding-top: 18px; }`,
  `/* 第 117 轮（用户：首屏要完整露出 8 款、不能切出第 9 款的边）：
   行距 4 → 8，随后按用户要求回退到 **6**；行高由 app.js 的 fitRankRows() 按视口反解后
   写进 --rank-row-h，让折线永远落在「行与行之间」。窄屏（≤860）是两行式布局，不参与这套算法。 */
.rank-list { display: flex; flex-direction: column; gap: 6px; padding-top: 18px; }`,
  'css:gap6');
save(f);

/* ---------- app.js ---------- */
f = load('docs/app.js');
cur = f.text;
sub(`/* ⚠️ pad 必须 ≤ gap：这样「最后一行底 + gap」才会落到折线以下，
     否则下一行会从折线上冒出一条几像素的边（正是用户截图里的问题）。 */
  const RANK_FIT = { rows: 8, gap: 8, min: 74, max: 100, pad: 6 };`,
  `/* ⚠️ pad 必须 ≤ gap：这样「最后一行底 + gap」才会落到折线以下，
     否则下一行会从折线上冒出一条几像素的边（正是用户截图里的问题）。
     第 117b 轮：gap 8 → 6（用户要求回退），pad 同步收到 4，留 2px 余量防亚像素舍入。 */
  const RANK_FIT = { rows: 8, gap: 6, min: 74, max: 100, pad: 4 };`,
  'js:rankfit6');
save(f);

/* ---------- verify117 里写死的 8px 断言 ---------- */
f = load('tests/verify/verify117.mjs');
cur = f.text;
sub(`ok('A2 行距 4 → 8 且行高走变量',
  /\\.rank-list\\s*\\{[^}]*gap:\\s*8px/.test(css)`, `ok('A2 行距 4 → 6 且行高走变量',
  /\\.rank-list\\s*\\{[^}]*gap:\\s*6px/.test(css)`, 'v117:A2');
sub(`ok('B2 行高落在观感带内（74~105px）、行距 = 8px',
  a.m.rowH >= 74 && a.m.rowH <= 105 && a.m.gap === '8px', { rowH: a.m.rowH, gap: a.m.gap });`,
  `ok('B2 行高落在观感带内（74~105px）、行距 = 6px',
  a.m.rowH >= 74 && a.m.rowH <= 105 && a.m.gap === '6px', { rowH: a.m.rowH, gap: a.m.gap });`,
  'v117:B2');
save(f);

console.log('OK 命中：\n - ' + hits.join('\n - '));
