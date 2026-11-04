/* bump watch.css 的缓存键 21 -> 22
   ⚠️ 旧/新字面量必须拼接构造，否则脚本第一次跑就把自己改成空操作 */
import fs from 'fs';
import path from 'path';

const ROOT = 'C:/Users/33329/WorkBuddy/2026-10-13-18-17-49/steam-playtime';
const OLD = 'watch.cs' + 's?v=' + 21;
const NEW = 'watch.cs' + 's?v=' + 22;

const SKIP_DIRS = new Set(['node_modules', '.git', 'img', 'data', 'snapshots']);
const EXTS = new Set(['.mjs', '.js', '.md', '.html', '.json']);

const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      walk(p, out);
    } else if (EXTS.has(path.extname(e.name))) {
      out.push(p);
    }
  }
  return out;
};

const files = walk(ROOT);
let total = 0, touched = [];
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  if (!src.includes(OLD)) continue;
  const n = src.split(OLD).length - 1;
  fs.writeFileSync(f, src.split(OLD).join(NEW), 'utf8');
  total += n;
  touched.push(path.relative(ROOT, f) + ' ×' + n);
}

if (total === 0) {
  console.error('守卫：一个都没替换到，检查 OLD 字面量或文件范围');
  process.exit(1);
}
console.log('替换 ' + total + ' 处，涉及 ' + touched.length + ' 个文件：');
touched.forEach((t) => console.log('  ' + t));
