/* bump102c.mjs — 第 102 轮第三次调整：style.css 128→129、app.js 114→115
 *
 * 本轮两个文件都改了（CSS 删 .rank-last[data-rel]::after、加 .rank-min translateX；
 * JS 删 relDay/daysAgoOf 与 data-rel），两条缓存键都得推 ——
 * 只推一条会让用户拿到「新 HTML + 旧 JS」，第 95 轮就是这么把热力图搞白的。
 *
 * 形态：① 纯文本 css ② 正则转义 css ③ 纯文本 js ④ 正则转义 js ⑤ 组合裸字符串
 * ⚠️ 旧/新字面量一律拼接构造，脚本自身不能被自己替换掉。
 */
import fs from 'fs';
import path from 'path';

const ROOT = 'C:/Users/33329/WorkBuddy/2026-10-13-18-17-49/steam-playtime';
const BS = '\\';

const CSS_FROM = 128;
const CSS_TO = 129;
const APP_FROM = 114;
const APP_TO = 115;

const CSSF = String(CSS_FROM);
const CSST = String(CSS_TO);
const APPF = String(APP_FROM);
const APPT = String(APP_TO);

const PAIRS = [
  ['style.cs' + 's?v=' + CSSF, 'style.cs' + 's?v=' + CSST],
  ['style' + BS + '.css' + BS + '?v=' + CSSF, 'style' + BS + '.css' + BS + '?v=' + CSST],
  ['app.j' + 's?v=' + APPF, 'app.j' + 's?v=' + APPT],
  ['app' + BS + '.js' + BS + '?v=' + APPF, 'app' + BS + '.js' + BS + '?v=' + APPT],
  ["appV === '" + APPF + "' && cssV === '" + CSSF + "'",
   "appV === '" + APPT + "' && cssV === '" + CSST + "'"],
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

const files = walk(ROOT);
const totals = PAIRS.map(() => 0);
const touched = [];

for (const f of files) {
  let src = fs.readFileSync(f, 'utf8');
  const before = src;
  const hits = [];
  PAIRS.forEach(([oldS, newS], i) => {
    const n = src.split(oldS).length - 1;
    if (!n) return;
    src = src.split(oldS).join(newS);
    totals[i] += n;
    hits.push(i + ':' + n);
  });
  if (src !== before) {
    fs.writeFileSync(f, src, 'utf8');
    touched.push(path.relative(ROOT, f) + '  [' + hits.join(' ') + ']');
  }
}

const labels = ['①纯文本css', '②转义css', '③纯文本js', '④转义js', '⑤组合裸字符串'];
console.log(labels.map((l, i) => `${l}=${totals[i]}`).join('  '));
const zero = labels.filter((_, i) => totals[i] === 0);
if (zero.length) {
  console.error('守卫：这些形态一处都没替换到 → ' + zero.join(','));
  process.exit(1);
}
console.log(`${touched.length} 个文件：`);
touched.forEach((t) => console.log('  ' + t));
