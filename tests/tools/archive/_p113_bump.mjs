/* _p113_bump.mjs — 第 113 轮版本 bump：style.css 136→137、app.js 121→122
   覆盖多种字面量：纯串 / 正则转义 / cssV·appV 变量比较；跳过 tests/tools/archive */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const SKIP = /tests[\\/]tools[\\/]archive[\\/]|node_modules/;
const EXTS = /\.(html|js|mjs|json|css|webmanifest)$/;

const RULES = [
  ['style.css?v=137', 'style.css?v=137'],
  ['style\\.css\\?v=136', 'style\\.css\\?v=137'],
  ["cssV === '137'", "cssV === '137'"],
  ['app.js?v=122', 'app.js?v=122'],
  ['app\\.js\\?v=121', 'app\\.js\\?v=122'],
  ["appV === '122'", "appV === '122'"],
];

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (SKIP.test(p)) continue;
    if (e.isDirectory()) walk(p, out);
    else if (EXTS.test(p)) out.push(p);
  }
  return out;
}

const tally = Object.fromEntries(RULES.map(([a]) => [a, 0]));
const touched = [];
for (const f of walk(ROOT)) {
  let s = fs.readFileSync(f, 'utf8');
  const before = s;
  for (const [a, b] of RULES) {
    const n = s.split(a).length - 1;
    if (n) { s = s.split(a).join(b); tally[a] += n; }
  }
  if (s !== before) { fs.writeFileSync(f, s); touched.push(path.relative(ROOT, f)); }
}
console.log('替换统计：', tally);
console.log('改动文件：\n - ' + touched.join('\n - '));
