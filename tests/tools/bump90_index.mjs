/* bump90_index.mjs — 第 90 轮：把 index 侧的 style.css / app.js 缓存键推到下一版
 *
 * 形态（历史上踩过的所有坑，一次覆盖）：
 *   ① 纯文本     style.css 问号 v 旧值        （html 引用、ok() 描述、includes 判据）
 *   ② 正则转义   style\.css\?v 旧值           （/.../.test 判据）
 *   ③ 纯文本     app.js 问号 v 旧值
 *   ④ 正则转义   app\.js\?v 旧值
 *   ⑤ 常量       CSS_V = '旧值' / APP_V = '旧值'   （online8x 的形态，不在 ①~④ 替换面里）
 *   ⑥ 取值比较   appV === '旧' && cssV === '旧'   （verify88 的写法，孤立字符串）
 *
 * ⚠️ 旧/新字面量一律拼接构造，脚本自身不能被自己替换掉；注释里也不写版本号字面量。
 * ⚠️ 只动 .mjs/.js/.html/.json —— 文档（.md）里的历史陈述不改。
 */
import fs from 'fs';
import path from 'path';

const ROOT = 'C:/Users/33329/WorkBuddy/2026-10-13-18-17-49/steam-playtime';
const BS = '\\';

const CSS_FROM = 114;
const CSS_TO = 115;
const APP_FROM = 109;
const APP_TO = 110;

const CSSF = String(CSS_FROM);
const CSST = String(CSS_TO);
const APPF = String(APP_FROM);
const APPT = String(APP_TO);

const PAIRS = [
  ['style.cs' + 's?v=' + CSSF, 'style.cs' + 's?v=' + CSST],                                   // ①
  ['style' + BS + '.css' + BS + '?v=' + CSSF, 'style' + BS + '.css' + BS + '?v=' + CSST],      // ②
  ['app.j' + 's?v=' + APPF, 'app.j' + 's?v=' + APPT],                                         // ③
  ['app' + BS + '.js' + BS + '?v=' + APPF, 'app' + BS + '.js' + BS + '?v=' + APPT],            // ④
  ["CSS_V = '" + CSSF + "'", "CSS_V = '" + CSST + "'"],                                        // ⑤
  ["APP_V = '" + APPF + "'", "APP_V = '" + APPT + "'"],                                        // ⑤
  ["appV === '" + APPF + "' && cssV === '" + CSSF + "'", "appV === '" + APPT + "' && cssV === '" + CSST + "'"], // ⑥
];

// 这些不动：图文资源目录、构建产物数据、被另一条线占用的归档
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

const labels = ['①纯文本css', '②转义css', '③纯文本js', '④转义js', '⑤CSS_V', '⑤APP_V', '⑥取值比较'];
console.log(labels.map((l, i) => `${l}=${totals[i]}`).join('  '));

const zero = labels.filter((_, i) => totals[i] === 0);
if (zero.length) {
  console.error('守卫：这些形态一处都没替换到 → ' + zero.join(',') + '（检查字面量，或确认该形态本轮已不存在）');
  process.exit(1);
}
console.log(`${touched.length} 个文件：`);
touched.forEach((t) => console.log('  ' + t));
