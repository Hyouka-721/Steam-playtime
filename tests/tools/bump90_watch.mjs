/* bump90_watch.mjs — 第 90 轮：评分从海报搬进标题行，**同时改了 watch.css 与 watch.js**，
 * 两条缓存键都要推一版（css 旧值 → 新值、js 旧值 → 新值）。
 *
 * 形态（watch 侧共四种，历史踩过的坑都在这）：
 *   ① 纯文本 css   watch.css 问号 v 旧值   （html 引用、ok() 描述、includes 判据）
 *   ② 正则转义 css watch\.css\?v 旧值      （/.../.test 判据）
 *   ③ 纯文本 js    watch.js 问号 v 旧值
 *   ④ 正则转义 js  watch\.js\?v 旧值
 *
 * ⚠️ 旧/新字面量一律拼接构造，脚本自身不能被自己替换掉；注释里也不写版本号字面量。
 * ⚠️ 只动 .mjs/.js/.html/.json —— 文档（.md）里的历史陈述不改。
 * ⚠️ 跳过 tests/tools/archive/（一次性诊断脚本留档）。
 */
import fs from 'fs';
import path from 'path';

const ROOT = 'C:/Users/33329/WorkBuddy/2026-10-13-18-17-49/steam-playtime';
const BS = '\\';

const FROM_CSS = 26, TO_CSS = 27;
const FROM_JS = 16, TO_JS = 17;
const FC = String(FROM_CSS), TC = String(TO_CSS);
const FJ = String(FROM_JS), TJ = String(TO_JS);

const PAIRS = [
  ['watch.cs' + 's?v=' + FC, 'watch.cs' + 's?v=' + TC],
  ['watch' + BS + '.css' + BS + '?v=' + FC, 'watch' + BS + '.css' + BS + '?v=' + TC],
  ['watch.j' + 's?v=' + FJ, 'watch.j' + 's?v=' + TJ],
  ['watch' + BS + '.js' + BS + '?v=' + FJ, 'watch' + BS + '.js' + BS + '?v=' + TJ],
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

const labels = ['①纯文本css', '②转义css', '③纯文本js', '④转义js'];
console.log(labels.map((l, i) => `${l}=${totals[i]}`).join('  '));

const zero = labels.filter((_, i) => totals[i] === 0);
if (zero.length) {
  console.error('守卫：这些形态一处都没替换到 → ' + zero.join(','));
  process.exit(1);
}

/* 收尾守卫：全仓再扫一遍，旧字面量必须归零 */
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
