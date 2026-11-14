#!/usr/bin/env node
/* ============================================================
   watch-shard.mjs · watch.json 按年分片的重建 / 校验（第 91 轮 A8）
   ------------------------------------------------------------
     npm run shard         从 docs/data/watch.json 重建全部分片（幂等，内容不变不写盘）
     npm run shard:check   只读校验；不一致时 exit 1，适合放进回归

   watch-add.mjs 每次录入完会直接调用 rebuildShards()，所以命令行路径不需要
   再单独跑一次；网页录入则由 docs/watch.js 的 syncShards() 增量同步。
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';

import {
  ROOT, SHARD_DIR, DATA_FILE,
  readMaster, rebuildShards, verifyShards
} from './shard-lib.mjs';

const HELP = `
观影数据按年分片

  npm run shard          重建 manifest.json + <年>.json（幂等）
  npm run shard:check    只读校验分片与主文件是否一致
  node scripts/watch/watch-shard.mjs --check
  node scripts/watch/watch-shard.mjs --help
`;

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log(HELP);
  process.exit(0);
}
const checking = args.includes('--check');

if (!fs.existsSync(DATA_FILE)) {
  console.error('✗ 找不到主文件：' + DATA_FILE);
  process.exit(1);
}

let data;
try { data = readMaster(DATA_FILE); }
catch (e) {
  console.error('✗ 主文件解析失败：' + e.message);
  process.exit(1);
}

if (checking) {
  const r = verifyShards(data);
  if (!r.ok) {
    console.error('✗ 分片校验未通过（' + r.errors.length + ' 项）：');
    r.errors.forEach((e) => console.error('  - ' + e));
    console.error('  运行 npm run shard 重建即可。');
    process.exit(1);
  }
  console.log('✓ 分片与主文件一致：' + r.total + ' 条 / ' + r.years.length + ' 个年份（' + r.years.join(', ') + '）');
  process.exit(0);
}

const r = rebuildShards(data);
const size = (rel) => {
  const f = path.join(SHARD_DIR, rel);
  return fs.existsSync(f) ? (fs.statSync(f).size / 1024).toFixed(1) + ' KB' : '—';
};
console.log('');
console.log('观影数据分片 · 来源 ' + path.relative(ROOT, DATA_FILE).replace(/\\/g, '/'));
console.log('  updated_at  ' + (data.updated_at || '（空）'));
console.log('  总计        ' + r.total + ' 条 / ' + r.years.length + ' 个年份');
r.years.forEach((y) => {
  console.log('    ' + y.year + '  ' + String(y.count).padStart(3) + ' 条  ' +
              y.file.padEnd(11) + size(y.file));
});
console.log('  写入 ' + r.written.length + ' 个 / 未变 ' + r.unchanged.length +
            ' 个 / 清理 ' + r.removed.length + ' 个');
if (r.written.length) console.log('    + ' + r.written.join(', '));
if (r.removed.length) console.log('    - ' + r.removed.join(', '));
console.log('');
