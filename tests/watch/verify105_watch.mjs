/* 第 105 轮：年度歌单封面性能优化 —— 原图直出改 480×480 WebP 缩略图。
 *
 * 用户原话：「优化性能，现在每次刷新年度歌单的海报很久才能加载出来」。
 *
 * 实测基线（10 Mbps + 40 ms RTT 模拟，1440×900）：
 *   改前 = 33.83 MB / 66 张（单张最大 1.6 MB），滚完歌单 21.5 s 且只加载到 74/90；
 *   改后 =  1.62 MB / 66 张（单张平均 24 KB），全部 90/90 加载完成 3.97 s。
 *
 * 复验口径：
 *   ① 数据契约 7 —— cover 全部指向 img/songs/t/*.webp、文件存在且 ?v= 与内容哈希一致、
 *      单张 ≤ 100 KB、总体积 ≤ 3 MB、正方形且边长 ≤ 480、原图保留可回滚、img 仍 lazy + async
 *   ② 1920 运行时 3 —— 90 张全部加载 / naturalWidth ≤ 480（确认走的是缩略图）/ 传输 ≤ 3 MB 且零异常零溢出
 *   ③ 390 运行时 1 —— 两列、全部加载、无溢出
 *
 * 🔴 阈值是「防回退」用的宽松上限（真实值 24 KB / 1.6 MB / 480 px），不是调参目标：
 *    真有人塞回 1.5 MB 原图，A3 立刻红 —— 这正是本轮要守的东西。
 * ⚠️ 全程只读，不写盘、不造数。
 */
import { createRequire } from 'module';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');
const sharp = require('sharp');
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SITE = 'http://127.0.0.1:8895/';

/* 2026-11-17：原第 104 轮归档已整合进 Steam游戏时长站，映射表改指维护工具新家 */
const MAP_FILE = 'C:/Users/33329/Documents/Misc/对话成果/Steam游戏时长站/维护工具/歌名_歌手映射.json';
const songsJson = JSON.parse(fs.readFileSync(ROOT + 'docs/data/songs.json', 'utf8'));
const js = fs.readFileSync(ROOT + 'docs/watch.js', 'utf8');
const all = songsJson.years.flatMap((g) => g.songs);
const withCover = all.filter((s) => s.cover);
const rels = [...new Set(withCover.map((s) => s.cover.split('?')[0]))];
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

const MAX_ONE = 100 * 1024;
const MAX_TOTAL = 3 * 1024 * 1024;
const MAX_EDGE = 480;

let pass = 0, fail = 0;
const ok = (n, c, extra = '') => {
  c ? (pass++, console.log(`PASS ${n}${extra ? '  — ' + extra : ''}`))
    : (fail++, console.log(`FAIL ${n}  — ${extra}`));
};

/* ================= A 数据契约 ================= */
console.log('== A 数据契约 ==');
ok('A1 全部 cover 指向 img/songs/t/*.webp 并带 8 位内容哈希（不再直出原图）',
  withCover.every((s) => /^img\/songs\/t\/[^?#]+\.webp\?v=[0-9a-f]{8}$/.test(s.cover)),
  `${withCover.length} 条 / 唯一 ${rels.length} 张`);

let missing = 0, hashBad = 0, oversized = [];
let total = 0;
rels.forEach((rel) => {
  const p = ROOT + 'docs/' + rel;
  if (!fs.existsSync(p)) { missing++; return; }
  const buf = fs.readFileSync(p);
  total += buf.length;
  const cover = withCover.find((s) => s.cover.split('?')[0] === rel).cover;
  if (!cover.endsWith('?v=' + sha(buf).slice(0, 8))) hashBad++;
  if (buf.length > MAX_ONE) oversized.push(`${rel} ${(buf.length / 1024).toFixed(0)}KB`);
});
ok('A2 每张缩略图文件存在，且 ?v= 与文件内容 SHA-256 前 8 位一致',
  missing === 0 && hashBad === 0, `缺失 ${missing} / 哈希不符 ${hashBad} / ${rels.length} 张`);
ok('A3 防回退：单张 ≤ 100 KB、总体积 ≤ 3 MB',
  oversized.length === 0 && total <= MAX_TOTAL,
  `最大 ${(Math.max(...rels.map((r) => fs.statSync(ROOT + 'docs/' + r).size)) / 1024).toFixed(0)} KB / 合计 ${(total / 1024 / 1024).toFixed(2)} MB`);

const dims = [];
for (const rel of rels) {
  const m = await sharp(ROOT + 'docs/' + rel).metadata();
  dims.push({ rel, w: m.width, h: m.height, fmt: m.format });
}
ok('A4 缩略图统一 1:1 且边长 ≤ 480、格式 webp（覆盖 DPR 2 桌面与 DPR 3 手机）',
  dims.every((d) => d.fmt === 'webp' && d.w === d.h && d.w <= MAX_EDGE),
  `尺寸集合 ${[...new Set(dims.map((d) => d.w + '×' + d.h))].join(' / ')}`);

const MAP = JSON.parse(fs.readFileSync(MAP_FILE, 'utf8'));
const mapCv = Object.keys(MAP).filter((k) => k !== '_说明' && MAP[k].cv);
ok('A5 映射表 cv 全部指向缩略图，cf 仍保留原始文件名（可追溯 / 可回滚）',
  mapCv.length === rels.length && mapCv.every((k) => /^img\/songs\/t\/[^?#]+\.webp\?v=/.test(MAP[k].cv) && !!MAP[k].cf),
  `${mapCv.length} 项`);

/* ⚠️ cf 记的是「来源目录里的原始文件名」，第 7 批的 `一程山路 (1).jpg` 入库时去掉了「 (1)」，
   所以不能直接拿 cf 去根目录找；改为按 basename 匹配：缩略图 t/<base>.webp 必须有对应的原图。
   第 108 轮：72 张原图（36 MB）整体搬到仓库根 `assets/songs/`（源素材与发布产物分离，Pages 部署体积 -36 MB），
   发布根 docs/ 里只剩 t/ 的 66 张缩略图。判据不变，只换原图根路径。 */
const ORIG_DIR = ROOT + 'assets/songs';
const rootFiles = fs.readdirSync(ORIG_DIR, { withFileTypes: true })
  .filter((d) => d.isFile() && /\.(jpe?g|png|webp)$/i.test(d.name))
  .map((d) => d.name.replace(/\.[^.]+$/, ''));
const thumbBases = rels.map((r) => r.replace(/^img\/songs\/t\//, '').replace(/\.[^.]+$/, ''));
const origMissing = thumbBases.filter((b) => !rootFiles.includes(b));
ok('A6 原图一张没删（回滚素材完整）：每张缩略图在 assets/songs/ 都有同名原图，且 docs/ 里不再残留原图',
  origMissing.length === 0 && fs.readdirSync(ROOT + 'docs/img/songs', { withFileTypes: true }).every((d) => d.isDirectory()),
  `缩略图 ${thumbBases.length} 张 / 缺原图 ${origMissing.length}${origMissing.length ? '：' + origMissing.join('、') : ''}`);

ok('A7 提速前提没被改掉：<img> 仍带 loading="lazy" 与 decoding="async"、class 仍是 st-song-img',
  /loading="lazy" decoding="async"/.test(js) && /class="st-song-img"/.test(js));

/* ================= B 1920 运行时 ================= */
console.log('== B 1920 运行时 ==');
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
const page = await ctx.newPage();
const errs = [], failed = [];
page.on('pageerror', (e) => errs.push(String(e)));
page.on('requestfailed', (r) => failed.push(r.url()));
page.on('response', (r) => { if (r.url().includes('/img/songs/') && r.status() >= 400) failed.push(r.status() + ' ' + r.url()); });

await page.goto(SITE + 'watch.html?t=' + Date.now(), { waitUntil: 'load', timeout: 45000 });
await page.waitForSelector('#w-grid .poster', { timeout: 45000 });
await page.click('#w-avatar');
await page.waitForSelector('#w-tl .tl-item', { timeout: 45000 });
await page.click('#w-stats-btn');
await page.waitForSelector('[data-songs="annual"]', { timeout: 25000 });
await page.waitForFunction((n) => {
  const e = document.querySelector('[data-songs="annual"]');
  return e && Number(e.getAttribute('data-count')) === n;
}, all.length, { timeout: 25000 });
/* 滚到底把 lazy 图都触发，再等全部 complete */
await page.evaluate(async () => {
  const el = document.querySelector('[data-songs="annual"]');
  el.scrollIntoView({ block: 'start' });
  const end = Math.ceil(el.getBoundingClientRect().height) + 800;
  for (let y = 0; y < end; y += 400) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 90)); }
});
await page.waitForFunction((n) => {
  const imgs = [...document.querySelectorAll('.st-song-img')];
  return imgs.length === n && imgs.every((i) => i.complete && i.naturalWidth > 0);
}, withCover.length, { timeout: 45000 }).catch(() => {});
await page.waitForTimeout(400);

const r = await page.evaluate(() => {
  const imgs = [...document.querySelectorAll('.st-song-img')];
  const perf = performance.getEntriesByType('resource').filter((e) => e.name.includes('/img/songs/'));
  const bytes = perf.reduce((n, e) => n + (e.transferSize || e.encodedBodySize || 0), 0);
  return {
    imgs: imgs.length,
    loaded: imgs.filter((i) => i.complete && i.naturalWidth > 0).length,
    broken: imgs.filter((i) => i.classList.contains('is-broken')).length,
    placeholders: [...document.querySelectorAll('.st-song-cover')].filter((c) => !c.querySelector('img')).length,
    maxNatural: Math.max(...imgs.map((i) => i.naturalWidth), 0),
    maxEdge: Math.max(...imgs.map((i) => Math.max(i.naturalHeight, i.naturalWidth)), 0),
    bytes,
    ov: document.documentElement.scrollWidth - document.documentElement.clientWidth
  };
});
ok('B1 1920 年报：封面图数与数据一致、全部加载、0 破图、0 音符占位',
  r.imgs === withCover.length && r.loaded === withCover.length && r.broken === 0 && r.placeholders === all.length - withCover.length,
  `img=${r.imgs} loaded=${r.loaded} broken=${r.broken} 占位=${r.placeholders}`);
ok('B2 页面实际渲染的是缩略图：所有封面的 naturalWidth ≤ 480（没有回退到大图）',
  r.maxNatural > 0 && r.maxEdge <= MAX_EDGE,
  `最大 naturalWidth=${r.maxNatural} / 最大边=${r.maxEdge}`);
ok('B3 本轮真正要守的：整页封面传输 ≤ 3 MB（改前 33.8 MB），且零 JS 异常、零请求失败、无横向溢出',
  r.bytes <= MAX_TOTAL && errs.length === 0 && failed.length === 0 && r.ov <= 0,
  `传输 ${(r.bytes / 1024 / 1024).toFixed(2)} MB / err=${errs.length} / 失败=${failed.length} / ov=${r.ov}`);
await ctx.close();

/* ================= C 390 运行时 ================= */
console.log('== C 390 运行时 ==');
const c2 = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, serviceWorkers: 'block' });
const p2 = await c2.newPage();
const e2 = [];
p2.on('pageerror', (e) => e2.push(String(e)));
await p2.goto(SITE + 'watch.html?t=' + Date.now(), { waitUntil: 'load', timeout: 45000 });
await p2.waitForSelector('#w-grid .poster', { timeout: 45000 });
await p2.click('#w-avatar');
await p2.waitForSelector('#w-tl .tl-item', { timeout: 45000 });
await p2.click('#w-stats-btn');
await p2.waitForSelector('[data-songs="annual"]', { timeout: 25000 });
await p2.waitForFunction((n) => {
  const e = document.querySelector('[data-songs="annual"]');
  return e && Number(e.getAttribute('data-count')) === n;
}, all.length, { timeout: 25000 });
const m2 = await p2.evaluate(() => ({
  cols: getComputedStyle(document.querySelector('.st-song-list')).gridTemplateColumns.split(' ').filter(Boolean).length,
  songs: document.querySelectorAll('.st-song').length,
  ov: document.documentElement.scrollWidth - document.documentElement.clientWidth
}));
ok('C1 390：2 列、90 首都在、无横向溢出、零 JS 异常',
  m2.cols === 2 && m2.songs === all.length && m2.ov <= 0 && e2.length === 0,
  `列=${m2.cols} 首数=${m2.songs} ov=${m2.ov} err=${e2.length}`);
await c2.close();

await browser.close();
console.log('');
console.log(`第 105 轮（封面缩略图性能）：${pass} PASS / ${fail} FAIL`);
if (fail) process.exit(1);
