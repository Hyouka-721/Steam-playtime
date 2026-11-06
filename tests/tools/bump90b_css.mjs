/* bump90b_css.mjs — 第 90 轮第二次：定稿前又动了一次 watch.css
 * （窄屏长片名在 flex-wrap 下会独占第一行、把评分挤到第二行 → 给片名加 max-width 上限）。
 * 按红线「同批次反复改同一文件每次都要再 bump」，CSS 缓存键再推一版；
 * watch.js 这一版没再动，仍保持上一版不变。
 *
 * 形态：① 纯文本 watch.css 问号 v 旧值 ② 正则转义 watch\.css\?v 旧值
 * ⚠️ 字面量拼接构造，脚本自身不被自己替换；注释里不写版本号字面量。
 * ⚠️ 只动 .mjs/.js/.html/.json，跳过 archive/ 与 .md。
 */
import fs from 'fs';
import path from 'path';

const ROOT = 'C:/Users/33329/WorkBuddy/2026-10-13-18-17-49/steam-playtime';
const BS = '\\';
const F = String(27), T = String(28);

const PAIRS = [
  ['watch.cs' + 's?v=' + F, 'watch.cs' + 's?v=' + T],
  ['watch' + BS + '.css' + BS + '?v=' + F, 'watch' + BS + '.css' + BS + '?v=' + T],
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
const labels = ['①纯文本', '②转义'];
console.log(labels.map((l, i) => `${l}=${totals[i]}`).join('  '));
if (totals.some((n) => n === 0)) {
  console.error('守卫：有形态一处都没替换到');
  process.exit(1);
}
const stale = PAIRS.map(([oldS]) => {
  let n = 0;
  for (const f of walk(ROOT)) n += fs.readFileSync(f, 'utf8').split(oldS).length - 1;
  return n;
});
if (stale.some((n) => n !== 0)) {
  console.error('守卫：仍有旧字面量残留 → ' + stale.join('/'));
  process.exit(1);
}
console.log('旧字面量零残留 ✓');
console.log(`${touched.length} 个文件：`);
touched.forEach((t) => console.log('  ' + t));
