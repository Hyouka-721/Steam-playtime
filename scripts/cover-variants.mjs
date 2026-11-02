#!/usr/bin/env node
/* ============================================================
   cover-variants.mjs — 第 93 轮：为游戏封面生成 320 宽变体（性能优化）
 *
   背景：`img/covers/<appid>.webp` 是 Steam 460×215 的原始胶囊图，而榜单里的
   封面上限只有 130×60（dpr2 后 260×120），460 宽对 dpr1 用户是纯浪费。
   做法与 `watch-variants.mjs` 完全一致：只缩不放 / WebP q80 effort4。
   · 原图宽 > 320 时生成 `<appid>-320.webp`
   · 幂等：文件已存在就跳过，`--force` 重生成
   用法：node scripts/cover-variants.mjs [--dry] [--force]
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const REPO = path.resolve(import.meta.dirname, '..');
const IMG_DIR = path.join(REPO, 'docs/img/covers');
const W = 320;

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const force = args.includes('--force');

const files = fs.readdirSync(IMG_DIR).filter((f) => /^\d+\.webp$/.test(f)).sort();
console.log(`共 ${files.length} 张封面，目标宽度 ${W}`);

let made = 0;
let skipped = 0;
let small = 0;
let before = 0;
let after = 0;

for (const f of files) {
  const src = path.join(IMG_DIR, f);
  const out = path.join(IMG_DIR, f.replace(/\.webp$/, `-${W}.webp`));
  const meta = await sharp(src).metadata();
  if (!meta.width || meta.width <= W) { small++; continue; }

  const srcSize = fs.statSync(src).size;
  if (fs.existsSync(out) && !force) {
    before += srcSize;
    after += fs.statSync(out).size;
    skipped++;
    continue;
  }

  if (dry) {
    console.log(`  [dry] ${f} ${meta.width}px → ${W}px`);
    before += srcSize;
    skipped++;
    continue;
  }

  await sharp(src).resize({ width: W, withoutEnlargement: true }).webp({ quality: 80, effort: 4 }).toFile(out);
  before += srcSize;
  after += fs.statSync(out).size;
  made++;
}

console.log(`\n生成 ${made} / 已有 ${skipped} / 原图本就 ≤${W} ${small}`);
if (after > 0) {
  console.log(`体积：原图合计 ${(before / 1024).toFixed(0)}KB → 变体合计 ${(after / 1024).toFixed(0)}KB` +
    `（省 ${((1 - after / before) * 100).toFixed(0)}%）`);
}
