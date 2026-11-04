/* bump102d.mjs — 第 102 轮第四次调整：只改 style.css → 129 推到 130
 * 本轮 app.js 未改，APP_V 保持 115。
 */
import fs from 'fs';
import path from 'path';

const ROOT = 'C:/Users/33329/WorkBuddy/2026-10-13-18-17-49/steam-playtime';
const BS = '\\';
const CSS_FROM = 129;
const CSS_TO = 130;
const CSSF = String(CSS_FROM);
const CSST = String(CSS_TO);

const PAIRS = [
  ['style.cs' + 's?v=' + CSSF, 'style.cs' + 's?v=' + CSST],
  ['style' + BS + '.css' + BS + '?v=' + CSSF, 'style' + BS + '.css' + BS + '?v=' + CSST],
  ["cssV === '" + CSSF + "'", "cssV === '" + CSST + "'"],
];

const SKIP_DIRS = new Set(['node_modules', '.git', 'img', 'data', 'snapshots', 'archive']);
const EXTS = new Set(['.mjs', '.js', '.html', '.json']);
const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(p, out); }
    else if (EXTS.has(path.extname(e.name))) out.push(p);
  }
  return out;
};

const totals = PAIRS.map(() => 0);
const touched = [];
for (const f of walk(ROOT)) {
  let src = fs.readFileSync(f, 'utf8');
  const before = src;
  const hits = [];
  PAIRS.forEach(([o, n], i) => {
    const c = src.split(o).length - 1;
    if (!c) return;
    src = src.split(o).join(n);
    totals[i] += c;
    hits.push(i + ':' + c);
  });
  if (src !== before) { fs.writeFileSync(f, src, 'utf8'); touched.push(path.relative(ROOT, f) + '  [' + hits.join(' ') + ']'); }
}
const labels = ['①纯文本css', '②转义css', '③裸字符串cssV'];
console.log(labels.map((l, i) => `${l}=${totals[i]}`).join('  '));
if (labels.some((_, i) => totals[i] === 0)) { console.error('守卫：有形态未替换到'); process.exit(1); }
console.log(`${touched.length} 个文件：`);
touched.forEach((t) => console.log('  ' + t));
