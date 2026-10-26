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

/* ⚠️ 第 76 轮修 bug：只把「本次真的生成过」的字段写回 JSON。
   旧实现按「条目有没有这个字段」逐条重插，在已经补过字段的文件上重跑
   会把 198 个字段再插一遍 → 每个条目出现重复键（JSON 解析取最后一个，
   站点不报错，但文件脏且 git diff 难看）。
   现在用 generated 集合精确记录「主图文件名 + 宽」。 */
const generated = new Set();
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
  generated.add(`${path.basename(t.baseAbs)}|${t.w}`);
  made++;
}

// ---- 写回 JSON（行级插入，保留原格式：6 空格缩进 + LF）----
if (made > 0) {
  const lines = raw.split(/\r?\n/);
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  /* 第一遍：按条目块收集「原文已有的键」和 poster_h 的行号。
     ⚠️ 必须先整体扫一遍：字段在块内的位置不固定（poster/poster_w/poster_h
     之后可能还跟着 title_en 等），只靠「遇到 poster 行后往下跳过变体行」
     这种位置式判断会漏 —— 第 76 轮实测 titanic 就因此插出 1 个重复键。 */
  const blocks = [];
  let curBlock = null;
  lines.forEach((line, i) => {
    if (/^ {4}\{/.test(line)) {
      curBlock = { poster: null, keys: new Set(), hLine: -1 };
      blocks.push(curBlock);
      return;
    }
    if (!curBlock) return;
    if (/^ {4}\}/.test(line)) { curBlock = null; return; }
    const mk = /^ {6}"([A-Za-z_0-9]+)":/.exec(line);
    if (!mk) return;
    curBlock.keys.add(mk[1]);
    if (mk[1] === 'poster') {
      const mv = /^ {6}"poster": "(.+)",?$/.exec(line);
      if (mv) curBlock.poster = mv[1];
    }
    if (mk[1] === 'poster_h') curBlock.hLine = i;
  });
  const byHLine = new Map();
  for (const b of blocks) if (b.hLine >= 0 && b.poster) byHLine.set(b.hLine, b);

  /* 第二遍：在 poster_h 之后插入，三个条件必须同时满足才算「该插」
     ① 本次真的生成过（generated）② 原文块里没有这个键（keys）③ 条目数据里有该字段 */
  const out = [];
  let inserted = 0;
  lines.forEach((line, i) => {
    out.push(line);
    const b = byHLine.get(i);
    if (!b) return;
    const it = items.find((x) => x.poster === b.poster);
    if (!it) return;
    for (const w of WIDTHS) {
      const key = `poster_${w}`;
      if (!it[key]) continue;
      if (b.keys.has(key)) continue;
      if (!generated.has(`${path.basename(b.poster)}|${w}`)) continue;
      out.push(`      "${key}": "${it[key]}",`);
      inserted++;
    }
  });
  fs.writeFileSync(DATA, out.join(eol));
  console.log(`JSON 已插入 ${inserted} 个字段（仅本次新生成的）`);
}

// ---- 校验 ----
/* 重复键守卫：同一 item 块里不该出现两次同名键（第 76 轮踩过） */
{
  const txt = fs.readFileSync(DATA, 'utf8');
  const seen = {};
  let curId = '';
  const dups = [];
  for (const ln of txt.split(/\r?\n/)) {
    let m = /^ {6}"id": "([^"]+)",?$/.exec(ln);
    if (m) { curId = m[1]; seen[curId] = seen[curId] || new Set(); continue; }
    m = /^ {6}"([^"]+)":/.exec(ln);
    if (m && curId) {
      if (seen[curId].has(m[1])) dups.push(`${curId}.${m[1]}`);
      seen[curId].add(m[1]);
    }
  }
  if (dups.length) {
    console.error(`✗ JSON 出现重复键 ${dups.length} 个：${dups.slice(0, 5).join(', ')}`);
    process.exit(1);
  }
}
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
