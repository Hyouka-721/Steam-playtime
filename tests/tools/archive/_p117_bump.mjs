/* _p117_bump.mjs — 第 117 轮：style.css 139→140、app.js 125→126（只改 docs + tests/verify + p111_poll） */
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..', '..');
const TARGETS = [];
const walk = (rel) => {
  const dir = path.join(ROOT, rel);
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'archive') walk(path.join(rel, e.name)); }
    else if (/\.(html|js|mjs|css)$/.test(e.name)) TARGETS.push(path.join(rel, e.name));
  }
};
walk('docs'); walk('tests/verify');
TARGETS.push('tests/tools/p111_poll.mjs');
const RULES = [
  ['style.css?v=139', 'style.css?v=140'], ['style\\.css\\?v=139', 'style\\.css\\?v=140'], ["cssV === '139'", "cssV === '140'"],
  ['app.js?v=125', 'app.js?v=126'], ['app\\.js\\?v=125', 'app\\.js\\?v=126'], ["appV === '125'", "appV === '126'"],
  ["CSS_V = '139'", "CSS_V = '140'"], ["APP_V = '125'", "APP_V = '126'"],
];
const tally = Object.fromEntries(RULES.map(([a]) => [a, 0]));
const touched = [];
for (const rel of TARGETS) {
  const f = path.join(ROOT, rel);
  let s = fs.readFileSync(f, 'utf8');
  const before = s;
  for (const [a, b] of RULES) { const n = s.split(a).length - 1; if (n) { s = s.split(a).join(b); tally[a] += n; } }
  if (s !== before) { fs.writeFileSync(f, s); touched.push(rel); }
}
console.log('替换：', tally);
console.log('改动：\n - ' + touched.join('\n - '));
