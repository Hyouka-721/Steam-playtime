/* bump102b.mjs — 第 102 轮第二次回退：只改 style.css → 127 推到 128
 *
 * 本轮 app.js 一个字没改，所以 APP_V 保持 114 不动（只 bump 改过的那条键）。
 * 形态：
 *   ① 纯文本   style.css 问号 v 旧值
 *   ② 正则转义 style 反斜杠 .css 反斜杠 ?v 旧值
 *   ③ 裸字符串 cssV === 旧值        （verify88/90/91 的组合判断里的孤立形态）
 *
 * ⚠️ 旧/新字面量一律拼接构造，脚本自身不能被自己替换掉。
 * ⚠️ online84~91 里的常量仍是 116/111（各自那一轮的过期快照），本轮不碰。
 */
import fs from 'fs';
import path from 'path';

const ROOT = 'C:/Users/33329/WorkBuddy/2026-10-13-18-17-49/steam-playtime';
const BS = '\\';

const CSS_FROM = 127;
const CSS_TO = 128;
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

const labels = ['①纯文本css', '②转义css', '③裸字符串cssV'];
console.log(labels.map((l, i) => `${l}=${totals[i]}`).join('  '));
const zero = labels.filter((_, i) => totals[i] === 0);
if (zero.length) {
  console.error('守卫：这些形态一处都没替换到 → ' + zero.join(','));
  process.exit(1);
}
console.log(`${touched.length} 个文件：`);
touched.forEach((t) => console.log('  ' + t));
