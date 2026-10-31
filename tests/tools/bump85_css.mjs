/* bump watch.css 的缓存键 22 -> 23（两种字面量一次搞定）
   ① 纯文本：ok() 描述里的 watch.css 加问号版本号
   ② 正则转义：判据里的同名串（点号与问号被反斜杠转义）
   ⚠️ 旧/新字面量必须拼接构造，否则脚本第一次跑就把自己改成空操作
   ⚠️ 第 85 轮起不再改 .md：bump 会把文档里的历史陈述（「线上是 v22」）一起改掉，读起来自相矛盾 */
import fs from 'fs';
import path from 'path';

const ROOT = 'C:/Users/33329/WorkBuddy/2026-10-13-18-17-49/steam-playtime';
const BS = '\\';   // 单个反斜杠，避免多层转义看错
const PAIRS = [
  ['watch.cs' + 's?v=' + 22, 'watch.cs' + 's?v=' + 23],                              // 纯文本
  ['watch' + BS + '.css' + BS + '?v=' + 22, 'watch' + BS + '.css' + BS + '?v=' + 23], // 正则转义形态
];

const SKIP_DIRS = new Set(['node_modules', '.git', 'img', 'data', 'snapshots']);
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
    hits.push(n);
  });
  if (src !== before) {
    fs.writeFileSync(f, src, 'utf8');
    touched.push(path.relative(ROOT, f) + ' ×' + hits.join('+'));
  }
}

if (totals.some((n) => n === 0)) {
  console.error('守卫：某一形态一个都没替换到（纯文本 ' + totals[0] + ' / 转义 ' + totals[1] + '），检查字面量');
  process.exit(1);
}
console.log(`纯文本 ${totals[0]} 处 / 转义 ${totals[1]} 处，共 ${totals[0] + totals[1]} 处，${touched.length} 个文件：`);
touched.forEach((t) => console.log('  ' + t));
