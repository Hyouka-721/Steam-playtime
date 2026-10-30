/* 第 75 轮线上复验（push 后跑）：
   ① Pages 生效：watch.js?v=12 + sw.js 可访问 + watch.json 106 条（含 4 条新录）+ 变体字段齐全
   ② 变体海报线上可下载（抽查 base / 320 / 480 三档）与本地逐字节相同
   ③ 运行时默认态：网格视图 + 评分序（不持久化），srcset 三候选 + sizes
   ④ Service Worker：线上确实控制页面 + 海报走 cache-first（二次访问 transferSize=0）
   ⑤ 时间轴缩略图用 320 变体
   指纹用「版本号 + sw.js + 数据字段 + 变体字段」，不能只看 200 */
import { createRequire } from 'module';
import fs from 'fs';
import crypto from 'crypto';
const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const SITE = 'https://hyouka-721.github.io/Steam-playtime/';
const ROOT = 'C:/Users/33329/WorkBuddy/2026-10-13-18-17-49/steam-playtime/docs/';
const OUT = 'C:/Users/33329/AppData/Local/Temp/fx_verify_20261018/shots75online/';
fs.mkdirSync(OUT, { recursive: true });

const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');
const local = (f) => fs.readFileSync(ROOT + f, 'utf8').replace(/\r\n/g, '\n');
const norm = (s) => s.replace(/\r\n/g, '\n');
const localData = JSON.parse(local('data/watch.json'));
const LOCAL_N = localData.items.length;

function sortKey(d) {
  const m = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/.exec(String(d || '').trim());
  return m ? m[1] + '-' + (m[2] || '00') + '-' + (m[3] || '00') : '0000-00-00';
}
function stampKey(s) { const t = Date.parse(String(s || '')); return Number.isNaN(t) ? 0 : t; }
function cmpTime(a, b) {
  const d = sortKey(b.watched_at).localeCompare(sortKey(a.watched_at));
  if (d !== 0) return d;
  const s = stampKey(a.added_at) - stampKey(b.added_at);
  if (s !== 0) return s;
  return String(a.id || '').localeCompare(String(b.id || ''));
}
function ratingVal(it) { const n = Number(it && it.rating); return isFinite(n) && n > 0 ? n : -1; }
function cmpRating(a, b) {
  const vb = ratingVal(b), va = ratingVal(a);
  if (vb !== va) return vb - va;
  return cmpTime(a, b);
}

let pass = 0, fail = 0;
const ok = (n, c, extra = '') => { c ? (pass++, console.log(`PASS ${n}${extra ? '  — ' + extra : ''}`)) : (fail++, console.log(`FAIL ${n}  — ${extra}`)); };

const browser = await chromium.launch({ args: ['--no-proxy-server'] });
async function gotoRetry(p, url, tries = 4) {
  for (let i = 1; i <= tries; i++) {
    try { await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }); return; }
    catch (e) { if (i === tries) throw e; console.log('  · goto 重试 ' + i); await p.waitForTimeout(2000); }
  }
}

/* ================= A Pages 生效 ================= */
console.log('== A 等 Pages 生效 ==');
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await gotoRetry(page, SITE);
let hit = false, waited = 0, snap = null;
for (let i = 1; i <= 30; i++) {
  try {
    snap = await page.evaluate(async (base) => {
      const t = Date.now();
      const g = async (u) => (await fetch(base + u + '?cb=' + t, { cache: 'reload' })).text();
      return { h: await g('watch.html'), d: await g('data/watch.json'), s: await g('sw.js') };
    }, SITE);
  } catch (e) { console.log('  第 ' + i + ' 次拉取失败'); await page.waitForTimeout(4000); waited += 4; continue; }
  let live = null;
  try { live = JSON.parse(snap.d); } catch (e) {}
  const verOK = /watch\.js\?v=12"/.test(snap.h);
  const swOK = /var CACHE = 'watch-posters-v\d+';/.test(snap.s) &&
    snap.s.includes('var IMMUTABLE_RE = /\\/img\\/watch\\/[^?#]+\\.webp$/;');
  const items = live && Array.isArray(live.items) ? live.items : [];
  const nVar = items.filter((x) => x.poster_320).length;
  const newOnes = ['罗小黑战记2', '流浪地球2', '冰雪奇缘2', '蜘蛛侠：英雄远征'];
  const dataOK = items.length >= LOCAL_N &&
    items.every((x) => x.added_at) &&
    nVar === items.filter((x) => x.poster_w > 320).length &&
    newOnes.every((t) => items.some((x) => x.title === t));
  console.log(`  第 ${i} 次：版本 ${verOK} / sw.js ${swOK} / 数据 ${dataOK}（${items.length} 条、320 变体 ${nVar}，累计 ${waited}s）`);
  if (verOK && swOK && dataOK) { hit = true; break; }
  waited += 5; await page.waitForTimeout(5000);
}
ok('A1 Pages 已生效（watch.js?v=12 + sw.js 就位 + 数据含新录 4 部 + 变体字段齐全）', hit, `约 ${waited}s`);
ok('A2 线上 watch.html 与本地 md5 全等', md5(norm(snap.h)) === md5(local('watch.html')), md5(norm(snap.h)));

const liveData = JSON.parse(snap.d);
const N = liveData.items.length;
const first = liveData.items[0];

/* 抽查三档海报（base / 320 / 480）是否可下载且与本地逐字节相同 */
const probe = await page.evaluate(async ({ base, rels }) => {
  const out = [];
  for (const rel of rels) {
    const r = await fetch(base + rel + '?cb=' + Date.now(), { cache: 'reload' });
    const b = new Uint8Array(await r.arrayBuffer());
    let bin = '';
    for (let i = 0; i < b.length; i++) bin += String.fromCharCode(b[i]);
    out.push({ rel, status: r.status, len: b.length, b64: btoa(bin) });
  }
  return out;
}, { base: SITE, rels: [first.poster, first.poster_320, first.poster_480].filter(Boolean) });
let posterOK = probe.length >= 2 && probe.every((p) => p.status === 200);
let detail = [];
for (const p of probe) {
  const buf = Buffer.from(p.b64, 'base64');
  const lp = ROOT + p.rel;
  const same = fs.existsSync(lp) && md5(buf) === md5(fs.readFileSync(lp));
  posterOK = posterOK && same;
  detail.push(p.rel.split('/').pop() + ':' + p.status + '/' + p.len + 'B' + (same ? ' ✓' : ' ✗'));
}
ok(`A3 抽查海报三档（base/320/480）可下载且与本地逐字节相同（${probe.length} 个）`, posterOK, detail.join(' '));

const newItems = await page.evaluate(async (base) => {
  const list = JSON.parse(await (await fetch(base + 'data/watch.json?cb=' + Date.now(), { cache: 'reload' })).text()).items;
  const want = ['罗小黑战记2', '流浪地球2', '冰雪奇缘2', '蜘蛛侠：英雄远征'];
  return list.filter((x) => want.includes(x.title)).map((x) => ({ t: x.title, v: !!x.poster_320, p: x.poster }));
}, SITE);
ok('A4 用户新录的 4 部都已上线且带 320 变体', newItems.length === 4 && newItems.every((x) => x.v),
  newItems.map((x) => x.t + (x.v ? '✓' : '✗')).join(' '));
await ctx.close();

/* ================= B 运行时：默认态 ================= */
console.log('\n== B 运行时默认态 ==');
const errs = [];
{
  const c = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await c.newPage();
  p.on('pageerror', (e) => errs.push(String(e)));
  p.on('console', (m) => { if (m.type() === 'error') errs.push('console:' + m.text().slice(0, 120)); });
  await gotoRetry(p, SITE + 'watch.html');
  await p.waitForFunction(() => document.querySelectorAll('#w-grid .poster').length > 0, null, { timeout: 60000 });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(800);

  const r = await p.evaluate(() => {
    const grid = document.getElementById('w-grid');
    const tl = document.getElementById('w-tl');
    const cards = [...document.querySelectorAll('#w-grid .poster')];
    const im = cards[0] && cards[0].querySelector('img');
    return {
      gridVisible: !!grid && !grid.hidden && grid.getBoundingClientRect().height > 0,
      tlHidden: !!tl && (tl.hidden || tl.getBoundingClientRect().height === 0),
      n: cards.length,
      names: cards.map((c) => (c.querySelector('.poster-name') || {}).textContent || ''),
      sortOn: (document.querySelector('.w-sort-btn.is-on') || {}).getAttribute ? document.querySelector('.w-sort-btn.is-on').getAttribute('data-sort') : null,
      avatar: document.getElementById('w-avatar').getAttribute('aria-pressed'),
      storedLayout: localStorage.getItem('watch-layout'),
      storedSort: localStorage.getItem('watch-sort'),
      src: im && im.getAttribute('src'),
      srcset: im && im.getAttribute('srcset'),
      sizes: im && im.getAttribute('sizes'),
      cur: im && im.currentSrc,
    };
  });
  const expectOrder = liveData.items.slice().sort(cmpRating).map((x) => x.title);
  ok('B1 线上默认网格视图（时间轴隐藏）', r.gridVisible && r.tlHidden && r.n === N, `grid=${r.n}/${N} tlHidden=${r.tlHidden}`);
  ok('B2 线上默认评分序（顺序与数据 cmpRating 一致）',
    r.sortOn === 'rating' && JSON.stringify(r.names) === JSON.stringify(expectOrder),
    `sort=${r.sortOn} 首卡「${r.names[0]}」`);
  ok('B3 视图/排序不落 localStorage（watch-layout / watch-sort 均为 null）',
    r.storedLayout === null && r.storedSort === null, `layout=${r.storedLayout} sort=${r.storedSort}`);
  ok('B4 网格卡片 srcset 三候选齐全 + sizes 四档 + currentSrc ∈ 候选',
    !!r.srcset && !!r.sizes && r.srcset.split(',').length === 3 &&
    /45vw/.test(r.sizes) && /32vw/.test(r.sizes) && /266px/.test(r.sizes) && /234px/.test(r.sizes) &&
    !!r.cur && /-320\.webp$|-480\.webp$|\.webp$/.test(r.cur),
    (r.srcset || '').slice(0, 90));
  await p.screenshot({ path: OUT + 'B1_线上默认网格_评分序.png' });

  /* 时间轴缩略图用 320 变体 */
  await p.click('#w-avatar');
  await p.waitForFunction(() => document.querySelectorAll('#w-tl .tl-item').length > 0, null, { timeout: 30000 });
  await p.waitForTimeout(600);
  const tl = await p.evaluate(() => {
    const it = [...document.querySelectorAll('#w-tl .tl-item')][0];
    const im = it && it.querySelector('.tl-thumb img');
    return { src: im && im.getAttribute('src'), n: document.querySelectorAll('#w-tl .tl-item').length };
  });
  ok('B5 时间轴缩略图用 poster_320 变体（无则回退 base）',
    !!tl.src && /-320\.webp$/.test(tl.src), `tl=${tl.n} src=${tl.src}`);
  await p.screenshot({ path: OUT + 'B2_线上时间轴.png' });
  await c.close();
}

/* ================= C Service Worker ================= */
console.log('\n== C Service Worker ==');
{
  const c = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await c.newPage();
  p.on('pageerror', (e) => errs.push(String(e)));
  /* 硬证据：海报响应是否由 Service Worker 提供（fromServiceWorker） */
  const swResp = [];
  p.on('response', (r) => {
    if (/\/img\/watch\/[^?#]+\.webp$/.test(r.url())) {
      try { swResp.push({ sw: r.fromServiceWorker(), st: r.status() }); } catch (e) { swResp.push({ sw: 'err', st: r.status() }); }
    }
  });
  await gotoRetry(p, SITE + 'watch.html');
  await p.waitForFunction(() => document.querySelectorAll('#w-grid .poster').length > 0, null, { timeout: 60000 });
  await p.evaluate(() => navigator.serviceWorker.ready);
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 30000 }).catch(() => {});
  await p.waitForFunction(() => document.querySelectorAll('#w-grid .poster').length > 0, null, { timeout: 60000 });
  const ctrl = await p.evaluate(() => !!(navigator.serviceWorker.controller && navigator.serviceWorker.controller.scriptURL));
  /* 滚动触发懒加载：进入视口的海报才会被请求 → 才会进 SW 缓存 */
  const scroll = async () => p.evaluate(async () => {
    const step = window.innerHeight;
    for (let y = 0; y <= document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 200));
    }
  });
  await scroll();
  await p.waitForTimeout(6000);
  const cacheInfo = await p.evaluate(async () => {
    const cch = await caches.open('watch-posters-v1');
    const ks = await cch.keys();
    const urls = ks.map((r) => r.url).filter((u) => /\.webp$/.test(u));
    const es = performance.getEntriesByType('resource').filter((e) => /\/img\/watch\/[^?#]+\.webp$/.test(e.name));
    return { n: urls.length, timing: es.length, zero: es.filter((e) => e.transferSize === 0).length };
  });
  ok('C1 线上 SW 已注册并控制页面（sw.js 生效）', ctrl, `controller=${ctrl}`);
  ok('C2 SW 缓存 watch-posters-v1 已收录海报（缓存数 = 本次请求的海报数）',
    cacheInfo.n > 0 && cacheInfo.n === cacheInfo.timing, `缓存 ${cacheInfo.n} / 请求 ${cacheInfo.timing}`);

  /* 再访问一次：海报全部由 SW 提供（fromServiceWorker）且零网络传输 */
  swResp.length = 0;
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => document.querySelectorAll('#w-grid .poster').length > 0, null, { timeout: 60000 });
  await scroll();
  await p.waitForFunction(() => {
    const imgs = [...document.querySelectorAll('#w-grid img')];
    return imgs.length > 0 && imgs.every((im) => im.complete);
  }, null, { timeout: 90000 }).catch(() => {});
  await p.waitForTimeout(1500);
  const timing = await p.evaluate(() => {
    const es = performance.getEntriesByType('resource').filter((e) => /\/img\/watch\/[^?#]+\.webp$/.test(e.name));
    return { n: es.length, bad: es.filter((e) => e.transferSize !== 0).map((e) => `${e.name.split('/').pop()}:${e.transferSize}`) };
  });
  const swCount = swResp.filter((r) => r.sw === true).length;
  ok('C3 线上二次访问：海报响应全部由 Service Worker 提供（fromServiceWorker）',
    swResp.length > 0 && swCount === swResp.length,
    `${swCount}/${swResp.length} 个海报响应来自 SW（状态分布 ${JSON.stringify(swResp.reduce((a, r) => { a[r.st] = (a[r.st] || 0) + 1; return a; }, {}))}）`);
  ok('C4 线上二次访问海报 transferSize=0（刷新不再等协商）',
    timing.n >= 5 && timing.bad.length === 0,
    `${timing.n} 个海报资源${timing.bad.length ? '，非零：' + timing.bad.slice(0, 3).join(' ') : '，全部 0'}`);
  await c.close();
}

ok('C5 全程零 JS 异常', errs.length === 0, errs.slice(0, 3).join(' | '));
console.log(`\n第 75 轮线上复验：PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
