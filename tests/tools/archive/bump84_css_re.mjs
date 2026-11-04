/* bump 正则里的转义形态：把 watch 的 css 缓存键从 21 推到 22
   ⚠️ 纯文本形态（无反斜杠）与转义形态（带反斜杠的 \. \?）是两套字面量，
   一个 bump 脚本只处理前者时，断言里的正则会停在旧值 —— 表现为「描述文字已是 v22，
   但套件仍 FAIL」（第 84 轮踩过，7 个套件集体误红）。
   ⚠️ 旧/新字面量继续拼接构造，避免脚本自伤。 */
import fs from 'fs';
import path from 'path';

const ROOT = 'C:/Users/33329/WorkBuddy/2026-10-13-18-17-49/steam-playtime';
const BS = '\\';
const OLD = 'watch' + BS + '.css' + BS + '?v=' + 21;
const NEW = 'watch' + BS + '.css' + BS + '?v=' + 22;

const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (['node_modules', '.git', 'img', 'data', 'snapshots'].includes(e.name)) continue;
      walk(p, out);
    } else if (['.mjs', '.js'].includes(path.extname(e.name))) {
      out.push(p);
    }
  }
  return out;
};

let total = 0;
const touched = [];
for (const f of walk(ROOT)) {
  const src = fs.readFileSync(f, 'utf8');
  if (!src.includes(OLD)) continue;
  const n = src.split(OLD).length - 1;
  fs.writeFileSync(f, src.split(OLD).join(NEW), 'utf8');
  total += n;
  touched.push(path.relative(ROOT, f) + ' ×' + n);
}

console.log('转义形态替换 ' + total + ' 处：');
touched.forEach((t) => console.log('  ' + t));
if (total === 0) console.log('（已经是新值，无需改动）');
