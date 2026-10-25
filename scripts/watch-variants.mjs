#!/usr/bin/env node
/* ============================================================
   watch-variants.mjs — 第 75 轮：为既有海报生成响应式变体（性能优化）
   规则与 scripts/watch-add.mjs 完全一致：只缩不放 / WebP q80 effort4。
   · 每个海报生成 <stem>-320.webp（原图宽 > 320 时）
   · 原图宽 > 480 时再生成 <stem>-480.webp
   · JSON 里补 poster_320 / poster_480 两个可选字段（缺省回退 base，向前兼容）
   幂等：文件已存在且 JSON 已有字段 → 跳过；可用 --force 重生成。
   用法：node scripts/watch-variants.mjs [--dry] [--force]
   ============================================================ */
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const REPO = path.resolve(import.meta.dirname, '..');
const DATA = path.join(REPO, 'docs/data/watch.json');
const IMG_DIR = path.join(REPO, 'docs/img/watch');
const WIDTHS = [320, 480];

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const force = args.includes('--force');

const raw = fs.readFileSync(DATA, 'utf8');
const data = JSON.parse(raw);
const items = Array.isArray(data) ? data : data.items;
console.log(`共 ${items.length} 条`);

let made = 0, skipped = 0, missing = 0;
const todo = [];   // {item, width, outRel, outAbs}

for (const it of items) {
  if (!it.poster) { missing++; continue; }
  const baseAbs = path.join(REPO, 'docs', it.poster);
  if (!fs.existsSync(baseAbs)) { console.error('缺基础海报：', it.poster); missing++; continue; }
  const stem = path.basename(it.poster).replace(/\.webp$/, '');
  for (const w of WIDTHS) {
    const key = `poster_${w}`;
    const outRel = `img/watch/${stem}-${w}.webp`;
    const outAbs = path.join(REPO, 'docs', outRel);
    const already = it[key] === outRel && fs.existsSync(outAbs);
    if (already && !force) { skipped++; continue; }
    todo.push({ it, w, key, outRel, outAbs, baseAbs });
  }
}

console.log(`待生成 ${todo.length} 个变体（跳过已存在 ${skipped} 个${force ? '，--force 模式' : ''}）`);
if (dry) { todo.forEach((t) => console.log('  [dry]', t.outRel)); process.exit(0); }

for (const t of todo) {
  const meta = await sharp(t.baseAbs).metadata();
  if (!meta.width || meta.width <= t.w) {   // 只缩不放：原图不够宽就不生成
    console.log(`  · 跳过 ${path.basename(t.baseAbs)}（宽 ${meta.width} ≤ ${t.w}）`);
    continue;
  }
  await sharp(t.baseAbs)
    .rotate()
    .resize({ width: t.w, withoutEnlargement: true })
    .webp({ quality: 80, effort: 4 })
    .toFile(t.outAbs);
  t.it[t.key] = t.outRel;
  made++;
}

// ---- 写回 JSON（行级插入，保留原格式：6 空格缩进 + LF）----
if (made > 0) {
  const lines = raw.split(/\r?\n/);
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  const out = [];
  let curPoster = null, inserted = 0;
  for (const line of lines) {
    out.push(line);
    let m = /^ {6}"poster": "(.+)",$/.exec(line);
    if (m) { curPoster = m[1]; continue; }
    m = /^ {6}"poster_h": (\d+),$/.exec(line);
    if (m && curPoster) {
      const it = items.find((x) => x.poster === curPoster);
      if (it) {
        for (const w of WIDTHS) {
          const key = `poster_${w}`;
          if (it[key]) { out.push(`      "${key}": "${it[key]}",`); inserted++; }
        }
      }
      curPoster = null;
    }
  }
  fs.writeFileSync(DATA, out.join(eol));
  console.log(`JSON 已插入 ${inserted} 个字段`);
}

// ---- 校验 ----
const d2 = JSON.parse(fs.readFileSync(DATA, 'utf8'));
const its2 = Array.isArray(d2) ? d2 : d2.items;
let n320 = 0, n480 = 0, bad = 0;
for (const it of its2) {
  for (const w of WIDTHS) {
    const rel = it[`poster_${w}`];
    if (!rel) continue;
    w === 320 ? n320++ : n480++;
    const abs = path.join(REPO, 'docs', rel);
    if (!fs.existsSync(abs)) { console.error('变体文件缺失：', rel); bad++; continue; }
    const m = await sharp(abs).metadata();
    if (m.width !== w) { console.error('变体宽度不符：', rel, m.width); bad++; }
  }
}
console.log(`\n结果：新生成 ${made} 个变体；poster_320 ${n320} 条 / poster_480 ${n480} 条；异常 ${bad}`);
console.log('条数不变：', its2.length === items.length);
process.exit(bad ? 1 : 0);
