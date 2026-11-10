/* _p117b_bump.mjs — style.css 140→141、app.js 126→127（只改 docs + tests/verify + p111_poll） */
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
  ['style.css?v=140', 'style.css?v=141'], ['style\\.css\\?v=140', 'style\\.css\\?v=141'], ["cssV === '140'", "cssV === '141'"],
  ['app.js?v=126', 'app.js?v=127'], ['app\\.js\\?v=126', 'app\\.js\\?v=127'], ["appV === '126'", "appV === '127'"],
  ["CSS_V = '140'", "CSS_V = '141'"], ["APP_V = '126'", "APP_V = '127'"],
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
