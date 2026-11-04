/* rewire102.mjs — 目录重组后修正路径（一次性脚本）
 *
 * 背景：所有脚本都用 path.resolve(__dirname, '..') 定位仓库根。整体下移一层后
 * 必须变成 '..','..'，否则 data/ 与 docs/ 全部指向 scripts/ 的上一级 = 仓库外。
 * 同时 './lib/x.mjs' 的 import 也要变成 '../lib/x.mjs'。
 *
 * 守卫：每类替换都要求命中数 > 0，且脚本自身不会被自己改到（按文件名排除）。
 */
import fs from 'fs';
import path from 'path';

const ROOT = 'C:/Users/33329/WorkBuddy/2026-10-13-18-17-49/steam-playtime';

/** 每个文件要做的替换：字符串对 + 期望命中数（null 表示至少 1） */
const PLAN = {
  'scripts/pipeline/fetch.mjs': [
    ["from './lib/dates.mjs'", "from '../lib/dates.mjs'", 1],
    ["from './lib/steam.mjs'", "from '../lib/steam.mjs'", 1],
    ["from './lib/diff-core.mjs'", "from '../lib/diff-core.mjs'", 1],
    ["const ROOT = path.resolve(__dirname, '..');", "const ROOT = path.resolve(__dirname, '..', '..');", 1],
  ],
  'scripts/pipeline/diff.mjs': [
    ["from './lib/dates.mjs'", "from '../lib/dates.mjs'", 1],
    ["from './lib/diff-core.mjs'", "from '../lib/diff-core.mjs'", 1],
    ["const ROOT = path.resolve(__dirname, '..');", "const ROOT = path.resolve(__dirname, '..', '..');", 1],
  ],
  'scripts/pipeline/build.mjs': [
    ["from './lib/dates.mjs'", "from '../lib/dates.mjs'", 1],
    ["const ROOT = path.resolve(__dirname, '..');", "const ROOT = path.resolve(__dirname, '..', '..');", 1],
    ["path.join(__dirname, 'inline-boot.mjs')", "path.join(__dirname, '..', 'build', 'inline-boot.mjs')", 1],
  ],
  'scripts/pipeline/localize.mjs': [
    ["const ROOT = path.resolve(__dirname, '..');", "const ROOT = path.resolve(__dirname, '..', '..');", 1],
  ],
  'scripts/pipeline/backfill-percent.mjs': [
    ["from './lib/steam.mjs'", "from '../lib/steam.mjs'", 1],
    ["const ROOT = path.resolve(__dirname, '..');", "const ROOT = path.resolve(__dirname, '..', '..');", 1],
  ],
  'scripts/build/inline-boot.mjs': [
    ["const ROOT = path.resolve(__dirname, '..');", "const ROOT = path.resolve(__dirname, '..', '..');", 1],
  ],
  'scripts/media/cover-variants.mjs': [
    ["const REPO = path.resolve(import.meta.dirname, '..');", "const REPO = path.resolve(import.meta.dirname, '..', '..');", 1],
  ],
  'scripts/media/fetch-covers.mjs': [
    ["const ROOT = path.resolve(__dirname, '..');", "const ROOT = path.resolve(__dirname, '..', '..');", 1],
  ],
  'scripts/media/make-icons.mjs': [
    ["const DOCS = path.resolve(__dirname, '..', 'docs');", "const DOCS = path.resolve(__dirname, '..', '..', 'docs');", 1],
  ],
  'scripts/media/watch-icons.mjs': [
    ["const DOCS = path.resolve(__dirname, '..', 'docs');", "const DOCS = path.resolve(__dirname, '..', '..', 'docs');", 1],
  ],
  'scripts/media/watch-variants.mjs': [
    ["const REPO = path.resolve(import.meta.dirname, '..');", "const REPO = path.resolve(import.meta.dirname, '..', '..');", 1],
  ],
  'scripts/watch/watch-add.mjs': [
    ["const ROOT = path.resolve(HERE, '..');", "const ROOT = path.resolve(HERE, '..', '..');", 1],
  ],
  'scripts/tests/diff.test.mjs': [
    ["from './lib/diff-core.mjs'", "from '../lib/diff-core.mjs'", 1],
    ["from './lib/steam.mjs'", "from '../lib/steam.mjs'", 2],
  ],
  'scripts/tests/steam.test.mjs': [
    ["from './lib/steam.mjs'", "from '../lib/steam.mjs'", 1],
  ],
};

let bad = 0;
for (const [rel, pairs] of Object.entries(PLAN)) {
  const p = path.join(ROOT, rel);
  let src = fs.readFileSync(p, 'utf8');
  const before = src;
  for (const [from, to, want] of pairs) {
    const n = src.split(from).length - 1;
    if (n !== want) {
      console.error(`✗ ${rel}: 期望 ${want} 处「${from}」，实际 ${n}`);
      bad++;
      continue;
    }
    src = src.split(from).join(to);
  }
  if (src !== before) fs.writeFileSync(p, src, 'utf8');
}
if (bad) { console.error(`\n${bad} 处不匹配，未完成`); process.exit(1); }
console.log('路径改写完成：' + Object.keys(PLAN).length + ' 个文件');
