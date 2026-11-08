/* _p114_bump.mjs — 第 114 轮版本 bump：style.css 137→138、app.js 122→123
   ⚠️ 只改 docs/ + tests/verify/ + tests/tools/p111_poll.mjs；
      tests/online/ 下是各轮上线时的指纹记录，**不许**跟着跑。 */
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
walk('docs');
walk('tests/verify');
TARGETS.push('tests/tools/p111_poll.mjs');

const RULES = [
  ['style.css?v=137', 'style.css?v=138'],
  ['style\\.css\\?v=137', 'style\\.css\\?v=138'],
  ["cssV === '137'", "cssV === '138'"],
  ['app.js?v=122', 'app.js?v=123'],
  ['app\\.js\\?v=122', 'app\\.js\\?v=123'],
  ["appV === '122'", "appV === '123'"],
];

const tally = Object.fromEntries(RULES.map(([a]) => [a, 0]));
const touched = [];
for (const rel of TARGETS) {
  const f = path.join(ROOT, rel);
  let s = fs.readFileSync(f, 'utf8');
  const before = s;
  for (const [a, b] of RULES) {
    const n = s.split(a).length - 1;
    if (n) { s = s.split(a).join(b); tally[a] += n; }
  }
  if (s !== before) { fs.writeFileSync(f, s); touched.push(rel); }
}
console.log('替换统计：', tally);
console.log('改动文件：\n - ' + touched.join('\n - '));
