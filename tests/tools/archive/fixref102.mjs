/* fixref102.mjs — 目录重组后，把注释 / 用法字符串 / 文档里的旧脚本路径改成新路径
 *
 * 只改「文本里提到的 scripts/xxx.mjs」，不碰真正的 import（import 已单独改过）。
 * 跳过 tests/tools/archive（留档脚本按当时路径记录）与 node_modules。
 * 守卫：每一对都报告命中数；替换后不得出现双层路径（scripts/pipeline/pipeline）。
 */
import fs from 'fs';
import path from 'path';

const ROOT = 'C:/Users/33329/WorkBuddy/2026-10-13-18-17-49/steam-playtime';

const MAP = [
  ['fetch.mjs', 'pipeline/fetch.mjs'],
  ['diff.mjs', 'pipeline/diff.mjs'],
  ['localize.mjs', 'pipeline/localize.mjs'],
  ['build.mjs', 'pipeline/build.mjs'],
  ['backfill-percent.mjs', 'pipeline/backfill-percent.mjs'],
  ['inline-boot.mjs', 'build/inline-boot.mjs'],
  ['cover-variants.mjs', 'media/cover-variants.mjs'],
  ['fetch-covers.mjs', 'media/fetch-covers.mjs'],
  ['make-icons.mjs', 'media/make-icons.mjs'],
  ['watch-icons.mjs', 'media/watch-icons.mjs'],
  ['watch-variants.mjs', 'media/watch-variants.mjs'],
  ['watch-add.mjs', 'watch/watch-add.mjs'],
  ['inline-css.mjs', 'legacy/inline-css.mjs'],
  ['diff.test.mjs', 'tests/diff.test.mjs'],
  ['steam.test.mjs', 'tests/steam.test.mjs'],
];

const SKIP_DIRS = new Set(['node_modules', '.git', 'img', 'data', 'archive', 'snapshots']);
const EXTS = new Set(['.mjs', '.js', '.md', '.html', '.yml', '.json']);

const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(p, out); }
    else if (EXTS.has(path.extname(e.name))) out.push(p);
  }
  return out;
};

const totals = MAP.map(() => 0);
const touched = [];
for (const f of walk(ROOT)) {
  let src = fs.readFileSync(f, 'utf8');
  const before = src;
  const hits = [];
  MAP.forEach(([name, to], i) => {
    const from = 'scripts/' + name;
    const target = 'scripts/' + to;
    const n = src.split(from).length - 1;
    if (!n) return;
    src = src.split(from).join(target);
    totals[i] += n;
    hits.push(name + ':' + n);
  });
  if (src !== before) {
    if (/scripts\/(pipeline|media|watch|build|legacy|tests)\/(pipeline|media|watch|build|legacy|tests)\//.test(src)) {
      console.error('✗ 出现双层路径，未写入：' + f);
      process.exit(1);
    }
    fs.writeFileSync(f, src, 'utf8');
    touched.push(path.relative(ROOT, f) + '  [' + hits.join(' ') + ']');
  }
}
console.log('各脚本命中：', MAP.map(([n], i) => `${n}=${totals[i]}`).filter((s) => !s.endsWith('=0')).join('  '));
console.log(`${touched.length} 个文件：`);
touched.forEach((t) => console.log('  ' + t));
