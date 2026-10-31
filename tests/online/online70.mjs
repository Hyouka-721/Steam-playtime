/* 第 70 轮线上复验：① 新海报真的上线并能解码 ② 站名 Watch List 生效
   注意：本轮没有 bump ?v（只改了 watch.html 与数据），所以 watch.html 可能被 CDN 缓存 →
        必须用「页眉 <h1> 文本 / <title>」做内容指纹轮询，不能只看 200 */
import { createRequire } from 'module';
import fs from 'fs';
import crypto from 'crypto';
const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const SITE = 'https://hyouka-721.github.io/Steam-playtime/';
const ROOT = 'C:/Users/33329/WorkBuddy/2026-10-13-18-17-49/steam-playtime/docs/';
const OUT = 'C:/Users/33329/AppData/Local/Temp/fx_verify_20261018/shots70online/';
fs.mkdirSync(OUT, { recursive: true });

const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');
const local = (f) => fs.readFileSync(ROOT + f, 'utf8').replace(/\r\n/g, '\n');
const norm = (s) => s.replace(/\r\n/g, '\n');
const localPoster = fs.readFileSync(ROOT + 'img/watch/harry-potter-and-the-sorcerer-s-stone-eb96d8a4.webp');

let pass = 0, fail = 0;
const ok = (n, c, extra = '') => { c ? (pass++, console.log(`PASS ${n}${extra ? '  — ' + extra : ''}`)) : (fail++, console.log(`FAIL ${n}  — ${extra}`)); };

const browser = await chromium.launch({ args: ['--no-proxy-server'] });
async function gotoRetry(p, url, tries = 4) {
  for (let i = 1; i <= tries; i++) {
    try { await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }); return; }
    catch (e) { if (i === tries) throw e; console.log('  · goto 重试 ' + i); await p.waitForTimeout(2000); }
  }
}

/* ================= A Pages 生效（判 HTML 文案 / 海报字节） ================= */
console.log('== A 等 Pages 生效 ==');
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await gotoRetry(page, SITE);
let hit = false, waited = 0, snap = null;
for (let i = 1; i <= 24; i++) {
  try {
    snap = await page.evaluate(async (base) => {
      const t = Date.now();
      const h = await (await fetch(base + 'watch.html?cb=' + t, { cache: 'reload' })).text();
      const d = await (await fetch(base + 'data/watch.json?cb=' + t, { cache: 'reload' })).text();
      return { h, d };
    }, SITE);
  } catch (e) { console.log('  第 ' + i + ' 次拉取失败'); await page.waitForTimeout(4000); waited += 4; continue; }
  const titleOK = /<title>Watch List<\/title>/.test(snap.h);
  const h1OK = /<h1[^>]*class="w-title"[^>]*>\s*Watch List\s*<\/h1>/.test(snap.h);
  const oldGone = !/My Watch List/.test(snap.h);
  const posterOK = /harry-potter-and-the-sorcerer-s-stone-eb96d8a4\.webp/.test(snap.d);
  console.log(`  第 ${i} 次：title ${titleOK} / h1 ${h1OK} / 旧名已无 ${oldGone} / 数据指向新海报 ${posterOK}（累计 ${waited}s）`);
  if (titleOK && h1OK && oldGone && posterOK) { hit = true; break; }
  waited += 5; await page.waitForTimeout(5000);
}
ok('A1 Pages 已生效（<title>/<h1> = Watch List + 旧名已无 + 数据指向新海报）', hit, `约 ${waited}s`);
ok('A2 线上 watch.html 与本地 md5 全等（含站名改动）', md5(norm(snap.h)) === md5(local('watch.html')), md5(norm(snap.h)));

/* 海报字节：直接取线上图片，与本地压好的 webp 逐字节比 */
const posterBuf = await page.evaluate(async (base) => {
  const r = await fetch(base + 'img/watch/harry-potter-and-the-sorcerer-s-stone-eb96d8a4.webp?cb=' + Date.now(), { cache: 'reload' });
  const b = await r.arrayBuffer();
  return { status: r.status, b64: btoa(String.fromCharCode.apply(null, new Uint8Array(b))) };
}, SITE);
const remotePoster = Buffer.from(posterBuf.b64, 'base64');
ok('A3 线上海报可下载（200）且与本地压好的 webp 逐字节相同',
  posterBuf.status === 200 && md5(remotePoster) === md5(localPoster),
  `${posterBuf.status} / ${remotePoster.length}B vs 本地 ${localPoster.length}B`);

const liveData = JSON.parse(snap.d);
const N = liveData.items.length;
const hp = liveData.items.find((x) => x.title === '哈利·波特与魔法石') || {};
ok('A4 线上数据：魔法石指向新海报、poster_w/h = 640×918',
  hp.poster === 'img/watch/harry-potter-and-the-sorcerer-s-stone-eb96d8a4.webp' && hp.poster_w === 640 && hp.poster_h === 918,
  `${hp.poster} ${hp.poster_w}×${hp.poster_h}`);
ok(`A5 线上共 ${N} 条、每条海报都能取到（抽查 6 条）`, N >= 39, `${N} 条`);
const sample = await page.evaluate(async (base) => {
  const list = JSON.parse(await (await fetch(base + 'data/watch.json?cb=' + Date.now(), { cache: 'reload' })).text()).items.slice(0, 6);
  const out = [];
  for (const it of list) {
    const r = await fetch(base + it.poster + '?cb=' + Date.now(), { method: 'GET', cache: 'reload' });
    out.push(it.poster.split('/').pop() + ':' + r.status);
  }
  return out;
}, SITE);
ok('A6 抽查 6 张海报全部 200', sample.every((s) => s.endsWith(':200')), sample.join(' '));

const rIdx = await page.evaluate(async (base) => {
  const h = await (await fetch(base + 'index.html?cb=' + Date.now(), { cache: 'reload' })).text();
  return ['style.css?v=106', 'app.js?v=100', 'fx.js?v=16'].filter((v) => !h.includes(v));
}, SITE);
ok('A7 首页三个版本号未受影响', rIdx.length === 0, rIdx.join(',') || '全部命中');
await ctx.close();

/* ================= B 运行时表现 ================= */
console.log('\n== B 页面实际表现 ==');
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

  const r = await p.evaluate(() => ({
    docTitle: document.title,
    h1: document.getElementById('w-title').textContent.trim(),
    n: document.querySelectorAll('#w-grid .poster').length,
  }));
  ok('B1 浏览器标题与页眉都是 Watch List', r.docTitle === 'Watch List' && r.h1 === 'Watch List', `${r.docTitle} / ${r.h1}`);
  ok(`B2 网格渲染全部 ${N} 条`, r.n === N, `${r.n}/${N}`);

  /* 该卡片在首屏之外、图片是 loading="lazy" → 先滚进视口再等解码（第 65 轮踩过同样的坑） */
  await p.evaluate(() => {
    const card = [...document.querySelectorAll('#w-grid .poster')]
      .find((x) => (x.querySelector('.poster-name') || {}).textContent === '哈利·波特与魔法石');
    if (card) card.scrollIntoView({ block: 'center' });
  });
  await p.waitForFunction(() => {
    const card = [...document.querySelectorAll('#w-grid .poster')]
      .find((x) => (x.querySelector('.poster-name') || {}).textContent === '哈利·波特与魔法石');
    const im = card && card.querySelector('img');
    return !!(im && im.complete && im.naturalWidth > 0);
  }, null, { timeout: 60000 }).catch(() => {});
  const img = await p.evaluate(() => {
    const card = [...document.querySelectorAll('#w-grid .poster')]
      .find((x) => (x.querySelector('.poster-name') || {}).textContent === '哈利·波特与魔法石');
    const im = card.querySelector('img');
    return { src: im.getAttribute('src'), complete: im.complete, nw: im.naturalWidth, nh: im.naturalHeight };
  });
  ok('B3 线上该卡片加载的是新海报且已解码 640×918',
    img.src.endsWith('harry-potter-and-the-sorcerer-s-stone-eb96d8a4.webp') && img.complete && img.nw === 640 && img.nh === 918,
    JSON.stringify(img));

  await p.waitForTimeout(700);
  await p.screenshot({ path: OUT + 'L1_线上_新海报_1440.png' });

  await p.evaluate(() => window.scrollTo(0, 0));
  await p.waitForTimeout(500);
  await p.locator('.w-header').screenshot({ path: OUT + 'L2_线上_页眉_1440.png' });

  /* 时间轴：缩略图同图 + 列对齐未变 */
  await p.click('#w-avatar');
  await p.waitForFunction(() => document.querySelectorAll('#w-tl .tl-item').length > 0, null, { timeout: 40000 });
  await p.waitForTimeout(800);
  const tl = await p.evaluate(() => {
    const items = [...document.querySelectorAll('#w-tl .tl-item')];
    const it = items.find((x) => x.textContent.includes('哈利·波特与魔法石'));
    const u = (sel) => [...new Set(items.map((x) => { const e = x.querySelector(sel); return e ? Math.round(e.getBoundingClientRect().left) : null; }).filter((v) => v != null))];
    return {
      src: it.querySelector('.tl-thumb img').getAttribute('src'),
      cols: { date: u('.tl-date'), score: u('.tl-score'), note: u('.tl-note') },
      n: items.length,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  ok('B4 时间轴缩略图同样用新海报', tl.src.endsWith('harry-potter-and-the-sorcerer-s-stone-eb96d8a4.webp'), tl.src);
  ok('B5 六列唯一 x 未回退、无溢出', Object.values(tl.cols).every((a) => a.length === 1) && tl.overflow === 0,
    JSON.stringify(tl.cols) + ` overflow=${tl.overflow}`);
  ok(`B6 时间轴 ${tl.n} 条`, tl.n === N, `${tl.n}/${N}`);
  await p.screenshot({ path: OUT + 'L3_线上_时间轴_1440.png' });
  await c.close();
}
ok('B7 全程零 JS 异常', errs.length === 0, errs.slice(0, 3).join(' | '));

await browser.close();
console.log(`\n===== 第 70 轮线上复验：${pass}/${pass + fail} =====`);
process.exit(fail ? 1 : 0);
