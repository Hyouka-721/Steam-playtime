#!/usr/bin/env node
/* ============================================================
   watch-add.mjs · 观影记录录入（2026-10-24 新建）
   ------------------------------------------------------------
   一条命令完成：压图 → 按内容哈希命名 → 写入 docs/img/watch/
                → 去重合并 docs/data/watch.json → 按观影时间倒序重排（同日按上传时间正序）
   设计要点：
   · 文件名带内容哈希：换图必然换名，不会被 CDN / 浏览器缓存住
   · 同 id 且同片名才是「更新」；同 id 不同片名会追 -2/-3 换新 id（第 72 轮，
     防同日两部都没英文名的条目互相覆盖 —— 玉子市场 / 玉子爱情故事事故的根因）
   · 每条记录带 added_at（上传时间），同日记录按它正序排列，先上传居前
   · 只缩不放：原图比目标宽度小时不放大，避免糊
   · 默认不裁剪：海报交给 CSS 的 aspect-ratio + object-fit:cover 处理，
     需要固定比例时用 --crop 2:3 显式裁
   用法：
     node scripts/watch-add.mjs --img 海报.jpg --title "奥本海默" \
       --watched 2026-10-24 --rating 9 --note "一两句感想"
     node scripts/watch-add.mjs --help
   ============================================================ */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DOCS = path.join(ROOT, 'docs');
const POSTER_DIR = path.join(DOCS, 'img', 'watch');
const DATA_FILE = path.join(DOCS, 'data', 'watch.json');

const HELP = `
观影记录录入

必填：
  --img <路径>        海报图片（jpg / png / webp / avif 等 sharp 支持的格式）
  --title <片名>

可选：
  --en <英文名>       英文原名，同时用于生成文件名
  --kind <movie|series|anime>   默认 movie（第 73 轮新增 anime 番剧）
  --year <年份>       如 2023
  --watched <日期>    观影时间，支持 2026-10-24 / 2026-10 / 2026，默认今天
  --rating <0-10>     评分，可小数
  --order <0-5>       手动排序值（整数，越小越前）；观看时间或评分相同时用它定先后，
                      默认 3（第 78 轮）
  --tags <a,b,c>      逗号分隔
  --note <感想>       一两句短评
  --id <自定义 id>    默认 <watched>-<slug>，指定它可精确覆盖某条
  --width <像素>      海报目标宽度，默认 640（不放大）；第 75 轮起自动附带
                      320 / 480 两张响应式变体（同样只缩不放，网格 srcset 用）
  --quality <1-100>   WebP 质量，默认 80
  --crop <W:H>        裁剪到指定比例，如 2:3；默认不裁
  --position <位置>   裁剪定位 centre|attention|top…，默认 centre
  --dry               只打印结果，不写任何文件
  --help              显示本帮助
`;

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[key] = true;
    else { out[key] = next; i++; }
  }
  return out;
}

function die(msg) {
  console.error('\n✗ ' + msg + '\n');
  process.exit(1);
}

// ASCII slug：优先英文名，其次标题里的 ASCII 片段，最后回落 item
function slugify(s) {
  return String(s || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function makeSlug(en, title) {
  return slugify(en) || slugify(title) || 'item';
}

// 本地时间带 +08:00 偏移（不用 toISOString，避免 UTC 漂移）
function nowLocal() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const oh = p(Math.floor(Math.abs(off) / 60));
  const om = p(Math.abs(off) % 60);
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T` +
         `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}${sign}${oh}:${om}`;
}

function todayLocal() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// 与 watch.js 里的 sortKey 完全一致：补零成定长串再比较
function sortKey(v) {
  const m = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/.exec(String(v || '').trim());
  if (!m) return '0000-00-00';
  return `${m[1]}-${m[2] || '00'}-${m[3] || '00'}`;
}

// 第 72 轮：上传时间比较键（ISO 8601 本地串），与 watch.js 的 stampKey 一致
function stampKey(s) {
  const t = Date.parse(String(s || ''));
  return Number.isNaN(t) ? 0 : t;
}

// 第 78 轮：手动排序值（0~5 整数，越小越前；缺字段/非法一律当 3），与 watch.js 的 orderVal 一致
const ORDER_DEFAULT = 3;
function orderVal(it) {
  const raw = it == null ? null : it.order;
  if (raw == null || raw === '') return ORDER_DEFAULT;
  const n = Number(raw);
  if (!Number.isFinite(n) || Math.floor(n) !== n || n < 0 || n > 5) return ORDER_DEFAULT;
  return n;
}

// 第 78 轮：观影时间倒序 → 同日按「排序」升序 → 上传时间正序 → id 字典序稳定收尾
function cmpTime(a, b) {
  const d = sortKey(b.watched_at).localeCompare(sortKey(a.watched_at));
  if (d !== 0) return d;
  const o = orderVal(a) - orderVal(b);
  if (o !== 0) return o;
  const s = stampKey(a.added_at) - stampKey(b.added_at);
  if (s !== 0) return s;
  return String(a.id || '').localeCompare(String(b.id || ''));
}

function readData() {
  if (!fs.existsSync(DATA_FILE)) return { updated_at: nowLocal(), items: [] };
  try {
    const j = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    if (Array.isArray(j)) return { updated_at: nowLocal(), items: j };
    return { updated_at: j.updated_at || nowLocal(), items: Array.isArray(j.items) ? j.items : [] };
  } catch (e) {
    die(`data/watch.json 解析失败：${e.message}\n  请先修好这个文件再执行，以免覆盖已有数据。`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { console.log(HELP); return; }
  if (args.img === undefined || args.title === undefined) {
    console.log(HELP);
    die('缺少必填参数 --img 与 --title');
  }
  if (args.img === true || args.title === true) die('--img 与 --title 都需要一个值');

  const imgPath = path.resolve(String(args.img));
  if (!fs.existsSync(imgPath)) die(`找不到图片：${imgPath}`);

  // 第 73 轮：番剧（动画剧集）成为第三种 kind
  const kind = args.kind === 'series' || args.kind === 'anime' ? args.kind : 'movie';
  const watchedAt = String(args.watched || todayLocal()).trim();
  if (!/^\d{4}(-\d{2}(-\d{2})?)?$/.test(watchedAt)) {
    die(`--watched 格式不对：${watchedAt}（支持 2026-10-24 / 2026-10 / 2026）`);
  }

  const title = String(args.title).trim();
  const titleEn = args.en ? String(args.en).trim() : '';
  const slug = makeSlug(titleEn, title);

  // ---- 合并数据（先读数据：id 防撞车要对照现有条目）----
  const data = readData();

  // id 规则（第 72 轮起与网页加号完全一致）：
  // · --id 指定则精确覆盖；否则默认 <watched>-<slug>
  // · 同 id 且同片名 = 更新（上传时间沿用首次录入）
  // · 同 id 但不同片名 = 追 -2 / -3 换新 id，避免同日两部都没英文名（slug 都回落 item）时互相覆盖
  let id = String(args.id || `${watchedAt}-${slug}`).trim();
  if (!args.id) {
    let n = 2;
    for (;;) {
      const clash = data.items.find((it) => it && it.id === id);
      if (!clash || clash.title === title) break;
      id = `${watchedAt}-${slug}-${n}`;
      n++;
    }
  }
  const prevIdx = data.items.findIndex((it) => it && it.id === id);
  const prev = prevIdx >= 0 ? data.items[prevIdx] : null;

  const width = Math.max(64, Math.min(2400, parseInt(args.width || '640', 10) || 640));
  const quality = Math.max(1, Math.min(100, parseInt(args.quality || '80', 10) || 80));

  let rating;
  if (args.rating !== undefined && args.rating !== true) {
    const r = Number(args.rating);
    if (!Number.isFinite(r) || r < 0 || r > 10) die(`--rating 需要 0~10 的数字，收到：${args.rating}`);
    rating = r;
  }

  // 第 78 轮：--order 只接受 0~5 的整数；不传则沿用旧值 / 默认 3
  let order;
  if (args.order !== undefined && args.order !== true) {
    const o = Number(args.order);
    if (!Number.isInteger(o) || o < 0 || o > 5) die(`--order 需要 0~5 的整数，收到：${args.order}`);
    order = o;
  }

  // ---- 图片处理 ----
  // 第 75 轮：resize 管道提成函数——主图与 320/480 变体共用同一套裁剪/压缩参数
  const VARIANT_WIDTHS = [320, 480];
  const meta = await sharp(imgPath).metadata();
  function pipeAt(width) {
    let p = sharp(imgPath).rotate();          // rotate() 无参 = 按 EXIF 自动摆正
    if (args.crop && args.crop !== true) {
      const m = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(String(args.crop));
      if (!m) die(`--crop 格式应为 W:H，例如 2:3，收到：${args.crop}`);
      const rw = Number(m[1]);
      const rh = Number(m[2]);
      return p.resize({ width, height: Math.round(width * rh / rw), fit: 'cover', position: args.position || 'centre' });
    }
    return p.resize({ width, withoutEnlargement: true });
  }

  const buf = await pipeAt(width).webp({ quality, effort: 4 }).toBuffer();

  const outMeta = await sharp(buf).metadata();
  const hash = crypto.createHash('sha256').update(buf).digest('hex').slice(0, 8);
  const fileName = `${slug}-${hash}.webp`;
  const outPath = path.join(POSTER_DIR, fileName);
  const relPoster = `img/watch/${fileName}`;

  // 变体：只缩不放（原图不够宽就跳过），与主图同参数；文件名 <主图名>-<宽>.webp
  const variants = [];
  for (const vw of VARIANT_WIDTHS) {
    if (outMeta.width <= vw) continue;
    const vBuf = await pipeAt(vw).webp({ quality, effort: 4 }).toBuffer();
    const vName = `${fileName.replace(/\.webp$/, '')}-${vw}.webp`;
    variants.push({ w: vw, name: vName, rel: `img/watch/${vName}`, bytes: vBuf });
  }

  // ---- 合并数据（data / prev 已在上面读好）----
  const item = {
    id,
    title,
    ...(titleEn ? { title_en: titleEn } : {}),
    kind,
    ...(args.year ? { year: Number(args.year) || String(args.year) } : (prev && prev.year ? { year: prev.year } : {})),
    watched_at: watchedAt,
    ...(rating !== undefined ? { rating } : (prev && prev.rating !== undefined ? { rating: prev.rating } : {})),
    // 第 78 轮：排序值。只在显式给了 --order 或旧条目本来就有时才写字段，
    // 缺字段按默认 3 处理（与网页端读取逻辑一致），避免给老条目添噪音字段
    ...(order !== undefined ? { order } : (prev && prev.order !== undefined ? { order: prev.order } : {})),
    poster: relPoster,
    poster_w: outMeta.width,
    poster_h: outMeta.height,
    // 第 75 轮：响应式变体（网格 srcset 用；老数据没有这两个字段时前端回退主图）
    ...(variants.length
      ? Object.fromEntries(variants.map((v) => [`poster_${v.w}`, v.rel]))
      : {}),
    ...(args.tags && args.tags !== true
      ? { tags: String(args.tags).split(',').map((s) => s.trim()).filter(Boolean) }
      : (prev && prev.tags ? { tags: prev.tags } : {})),
    ...(args.note !== undefined && args.note !== true
      ? { note: String(args.note).trim() }
      : (prev && prev.note ? { note: prev.note } : {})),
    // 第 72 轮：上传时间。同 id 更新沿用首次录入时间，新条目取当前时间
    ...(prev && prev.added_at ? { added_at: prev.added_at } : { added_at: nowLocal() }),
  };

  if (prevIdx >= 0) data.items[prevIdx] = item;
  else data.items.push(item);
  data.items.sort(cmpTime);
  data.updated_at = nowLocal();

  // ---- 报告 ----
  const kb = (n) => (n / 1024).toFixed(1) + ' KB';
  const srcKb = fs.statSync(imgPath).size;
  console.log('');
  console.log(prev ? '↻ 更新已有条目' : '＋ 新增条目');
  console.log(`  标题     ${title}${titleEn ? ' / ' + titleEn : ''}`);
  console.log(`  id       ${id}`);
  console.log(`  观影时间 ${watchedAt}   类型 ${kind}${args.year ? '   年份 ' + args.year : ''}`);
  if (rating !== undefined) console.log(`  评分     ${rating}`);
  console.log(`  排序     ${item.order === undefined ? ORDER_DEFAULT + '（默认，未落库）' : item.order}`);
  console.log(`  海报     ${relPoster}  (${outMeta.width}×${outMeta.height})`);
  if (variants.length) {
    console.log(`  变体     ${variants.map((v) => `${v.rel} (${v.w}px, ${kb(v.bytes.length)})`).join(' / ')}`);
  }
  console.log(`  体积     原图 ${kb(srcKb)} → WebP ${kb(buf.length)}` +
              (srcKb > 0 ? `（${Math.round((1 - buf.length / srcKb) * 100)}% 更小）` : ''));
  console.log(`  总数     ${data.items.length} 条`);

  if (prev && prev.poster && prev.poster !== relPoster) {
    const oldAbs = path.join(DOCS, prev.poster);
    if (fs.existsSync(oldAbs)) {
      console.log(`\n  旧海报已不再被引用：${prev.poster}`);
      if (args.dry) console.log('  （--dry：不删除）');
      else { fs.unlinkSync(oldAbs); console.log('  已删除旧海报文件'); }
    }
    // 第 75 轮：旧变体一并清理（命名规则 <旧主图名>-<宽>.webp）
    for (const vw of VARIANT_WIDTHS) {
      const oldV = path.join(DOCS, prev.poster.replace(/\.webp$/, '') + `-${vw}.webp`);
      if (fs.existsSync(oldV)) {
        if (args.dry) console.log(`  （--dry：不删除旧变体 ${oldV}）`);
        else { fs.unlinkSync(oldV); console.log(`  已删除旧变体 ${path.basename(oldV)}`); }
      }
    }
  }

  if (args.dry) {
    console.log('\n--dry：未写入任何文件。\n');
    return;
  }

  fs.mkdirSync(POSTER_DIR, { recursive: true });
  fs.writeFileSync(outPath, buf);
  for (const v of variants) fs.writeFileSync(path.join(POSTER_DIR, v.name), v.bytes);
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2) + '\n', 'utf8');

  console.log('\n已写入。下一步：');
  const files = [`docs/img/watch/${fileName}`, ...variants.map((v) => `docs/img/watch/${v.name}`), 'docs/data/watch.json'];
  console.log(`  git add ${files.join(' ')}`);
  console.log(`  git commit -m "watch: add ${title}"`);
  console.log('');
}

main().catch((e) => die(e && e.stack ? e.stack : String(e)));
