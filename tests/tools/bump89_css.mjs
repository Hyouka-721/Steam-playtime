/* bump89_css.mjs — 第 89 轮：把 watch.css 的缓存键推到下一版（评分角标降噪，纯 CSS）
 *
 * 形态（watch 侧只有这两种，历史踩过的坑都在这）：
 *   ① 纯文本     watch.css 问号 v 旧值   （html 引用、ok() 描述、includes 判据）
 *   ② 正则转义   watch\.css\?v 旧值      （/.../.test 判据）
 *
 * ⚠️ 旧/新字面量一律拼接构造，脚本自身不能被自己替换掉；注释里也不写版本号字面量。
 * ⚠️ 只动 .mjs/.js/.html/.json —— 文档（.md）里的历史陈述不改，`CONTINUE.md` 的当前值手工跟。
 */
import fs from 'fs';
import path from 'path';

const ROOT = 'C:/Users/33329/WorkBuddy/2026-10-13-18-17-49/steam-playtime';
const BS = '\\';

const FROM = 24;
const TO = 25;
const F = String(FROM);
const T = String(TO);

const PAIRS = [
  ['watch.cs' + 's?v=' + F, 'watch.cs' + 's?v=' + T],                                   // ①
  ['watch' + BS + '.css' + BS + '?v=' + F, 'watch' + BS + '.css' + BS + '?v=' + T],      // ②
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

const zero = labels.filter((_, i) => totals[i] === 0);
if (zero.length) {
  console.error('守卫：这些形态一处都没替换到 → ' + zero.join(','));
  process.exit(1);
}
console.log(`${touched.length} 个文件：`);
touched.forEach((t) => console.log('  ' + t));
