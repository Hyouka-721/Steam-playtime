/* 第 77 轮线上复验（push 后跑）：《情书》海报替换 + 合并后数据完整性
   背景：第 76 轮本地把《情书》海报换成 love-letter-5b3706ed（640×914 + 320/480 变体），
   同期远端被网页加号录了 7 部新片（113 条）→ 本轮上线靠 merge77_rebase.py 合并。

   ① 数据：线上 113 条、情书五字段正确、整份 watch.json 与本地 md5 全等
   ② 海报：新三档可下载且与本地逐字节相同；旧三档线上 404（确实被删）
   ③ 运行时：网格卡片 currentSrc 命中变体；时间轴缩略图命中 -320
   ④ SW：情书海报二次访问由 Service Worker 提供（fromServiceWorker 硬证据）
   指纹不只看 200 —— 海报二进制一律与本地比 md5。 */
import { createRequire } from 'module';
import fs from 'fs';
import crypto from 'crypto';
const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const SITE = 'https://hyouka-721.github.io/Steam-playtime/';
const ROOT = 'C:/Users/33329/WorkBuddy/2026-10-13-18-17-49/steam-playtime/docs/';
const OUT = 'C:/Users/33329/AppData/Local/Temp/fx_verify_20261018/shots77online/';
fs.mkdirSync(OUT, { recursive: true });

const md5 = (b) => crypto.createHash('md5').update(b).digest('hex');
const localText = (f) => fs.readFileSync(ROOT + f, 'utf8');

const LOVE_ID = '2021-08-02-love-letter';
const NEW_POSTER = 'img/watch/love-letter-5b3706ed.webp';
const OLD_POSTER = 'img/watch/love-letter-a5aa0f14.webp';
const localData = JSON.parse(localText('data/watch.json'));
const LOVE = localData.items.find((x) => x.id === LOVE_ID);
const LOCAL_N = localData.items.length;

let pass = 0, fail = 0;
const ok = (n, c, extra = '') => {
  c ? (pass++, console.log(`PASS ${n}${extra ? '  — ' + extra : ''}`))
    : (fail++, console.log(`FAIL ${n}  — ${extra}`));
};

const browser = await chromium.launch({ args: ['--no-proxy-server'] });

async function gotoRetry(p, url, tries = 4) {
  for (let i = 1; i <= tries; i++) {
    try { await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }); return; }
    catch (e) { if (i === tries) throw e; console.log('  · goto 重试 ' + i); await p.waitForTimeout(2000); }
  }
}

/* ================= A 数据与海报 ================= */
console.log('== A 数据与海报 ==');
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errs = [];
/* A6 会故意 fetch 旧海报，浏览器必然打 404 控制台日志 —— 那是用例自己要的，
   用 probing404 开关在探测窗口内把它们排除，避免把自己的探针算成站点异常 */
let probing404 = false;
page.on('pageerror', (e) => errs.push(String(e)));
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  const txt = m.text();
  if (probing404 && /status of 404/.test(txt)) return;
  errs.push('console:' + txt.slice(0, 120));
});
await gotoRetry(page, SITE);

/* 等 Pages 刷到本轮内容：情书条目指向新海报 */
let live = null, waited = 0, hit = false;
for (let i = 1; i <= 30; i++) {
  const txt = await page.evaluate(async (u) => (await fetch(u, { cache: 'reload' })).text(),
    SITE + 'data/watch.json?cb=' + Date.now());
  try { live = JSON.parse(txt); } catch (e) { live = null; }
  const love = live && live.items.find((x) => x.id === LOVE_ID);
  if (love && love.poster === NEW_POSTER) { hit = true; break; }
  waited += 5;
  console.log(`  第 ${i} 次：情书 poster=${love ? love.poster : '?'}（累计 ${waited}s）`);
  await page.waitForTimeout(5000);
}
ok('A1 Pages 已生效：线上情书条目已指向新海报', hit,
  live && live.items.length ? `${live.items.length} 条 / ${NEW_POSTER.split('/').pop()}` : '未拿到数据');

const loveLive = (live ? live.items : []).find((x) => x.id === LOVE_ID) || {};
const fieldsOK = loveLive.poster === LOVE.poster &&
  loveLive.poster_w === LOVE.poster_w && loveLive.poster_h === LOVE.poster_h &&
  loveLive.poster_320 === LOVE.poster_320 && loveLive.poster_480 === LOVE.poster_480;
ok('A2 线上情书五字段与本地一致（poster/宽/高/320/480）', fieldsOK,
  `${loveLive.poster_w}×${loveLive.poster_h} ${loveLive.poster_320} ${loveLive.poster_480}`);

ok('A3 线上 watch.json 条数与本地一致（合并后 113 条）',
  !!live && live.items.length === LOCAL_N, `线上 ${live ? live.items.length : '?'} / 本地 ${LOCAL_N}`);

/* 整份数据 md5 全等（合并器没有动别人一个字节） */
const liveJsonMd5 = md5(JSON.stringify(live));
const localJsonMd5 = md5(JSON.stringify(localData));
ok('A4 线上 watch.json 与本地整份 md5 全等', liveJsonMd5 === localJsonMd5, liveJsonMd5);

/* 新三档 + 旧三档：逐字节 / 404 */
const rels = [LOVE.poster, LOVE.poster_320, LOVE.poster_480].filter(Boolean);
probing404 = true;
const probe = await page.evaluate(async ({ base, rels, olds }) => {
  const get = async (rel, cache) => {
    const r = await fetch(base + rel + '?cb=' + Date.now(), { cache });
    const b = new Uint8Array(await r.arrayBuffer());
    let bin = '';
    for (let i = 0; i < b.length; i++) bin += String.fromCharCode(b[i]);
    return { rel, status: r.status, len: b.length, b64: btoa(bin) };
  };
  const out = [];
  for (const rel of rels) out.push(await get(rel, 'reload'));
  const gone = [];
  for (const rel of olds) gone.push(await get(rel, 'reload'));
  return { out, gone };
}, {
  base: SITE, rels,
  olds: [OLD_POSTER, 'img/watch/love-letter-a5aa0f14-320.webp', 'img/watch/love-letter-a5aa0f14-480.webp'],
});
await page.waitForTimeout(600);   // 控制台事件比 fetch 慢半拍，等日志到齐再关窗口
probing404 = false;

const detailA = [];
let newOK = probe.out.length === 3;
for (const p of probe.out) {
  const buf = Buffer.from(p.b64, 'base64');
  const lp = ROOT + p.rel;
  const same = fs.existsSync(lp) && md5(buf) === md5(fs.readFileSync(lp));
  newOK = newOK && p.status === 200 && same;
  detailA.push(`${p.rel.split('/').pop()}:${p.status}/${p.len}B${same ? '✓' : '✗'}`);
}
ok('A5 情书新海报三档（base/320/480）线上可下载且与本地逐字节相同', newOK, detailA.join(' '));

const oldGone = probe.gone.every((p) => p.status === 404);
ok('A6 情书旧海报三档线上已 404（文件确实被删除，不是留了孤儿）', oldGone,
  probe.gone.map((p) => `${p.rel.split('/').pop()}:${p.status}`).join(' '));

/* ================= B 运行时 ================= */
console.log('\n== B 运行时命中变体 ==');
await gotoRetry(page, SITE + 'watch.html');
await page.waitForFunction(() => document.querySelectorAll('#w-grid .poster').length > 0, null, { timeout: 60000 });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(800);

/* 找到《情书》卡片，滚进视口触发懒加载，再读 currentSrc */
const card = await page.evaluate(async (title) => {
  const cs = [...document.querySelectorAll('#w-grid .poster')];
  const el = cs.find((c) => ((c.querySelector('.poster-name') || {}).textContent || '').trim() === title);
  if (!el) return { found: false, n: cs.length };
  el.scrollIntoView({ block: 'center' });
  await new Promise((r) => setTimeout(r, 900));
  const im = el.querySelector('img');
  if (im && !im.complete) await new Promise((r) => { im.onload = im.onerror = r; setTimeout(r, 6000); });
  return {
    found: true,
    n: cs.length,
    src: im && im.getAttribute('src'),
    srcset: im && im.getAttribute('srcset'),
    cur: im && im.currentSrc,
    complete: im && im.complete,
    nw: im && im.naturalWidth,
  };
}, '情书');

ok('B1 网格里找到《情书》卡片', card.found, `共 ${card.n} 张`);
ok('B2 情书卡片 srcset 含 320w / 480w / 640w 三档',
  !!card.srcset && /-320\.webp 320w/.test(card.srcset) && /-480\.webp 480w/.test(card.srcset) && /5b3706ed\.webp 640w/.test(card.srcset),
  (card.srcset || '').slice(0, 110));
ok('B3 情书卡片 currentSrc 命中新海报的变体（不是旧图）',
  !!card.cur && /love-letter-5b3706ed(?:-\d+)?\.webp$/.test(card.cur), card.cur);

/* currentSrc 的真实字节是否等于本地同档文件（防止 CDN 还回旧内容） */
const curBytes = await page.evaluate(async (u) => {
  const r = await fetch(u, { cache: 'reload' });
  const b = new Uint8Array(await r.arrayBuffer());
  let bin = '';
  for (let i = 0; i < b.length; i++) bin += String.fromCharCode(b[i]);
  return { status: r.status, len: b.length, b64: btoa(bin) };
}, card.cur);
const curRel = String(card.cur || '').replace(SITE, '');
const curSame = curBytes.status === 200 && fs.existsSync(ROOT + curRel) &&
  md5(Buffer.from(curBytes.b64, 'base64')) === md5(fs.readFileSync(ROOT + curRel));
ok('B4 currentSrc 指向的文件线上字节与本地同档文件相同', curSame,
  `${curRel.split('/').pop()} ${curBytes.len}B`);
await page.screenshot({ path: OUT + 'B_情书卡片_新海报.png' });

/* 时间轴缩略图 */
await page.click('#w-avatar');
await page.waitForFunction(() => document.querySelectorAll('#w-tl .tl-item').length > 0, null, { timeout: 30000 });
await page.waitForTimeout(700);
const tlHe = await page.evaluate(async () => {
  const items = [...document.querySelectorAll('#w-tl .tl-item')];
  const el = items.find((x) => ((x.querySelector('.tl-name') || {}).textContent || '').trim() === '情书');
  if (!el) return { found: false, n: items.length };
  el.scrollIntoView({ block: 'center' });
  await new Promise((r) => setTimeout(r, 800));
  const im = el.querySelector('.tl-thumb img');
  if (im && !im.complete) await new Promise((r) => { im.onload = im.onerror = r; setTimeout(r, 6000); });
  return { found: true, src: im && im.getAttribute('src'), complete: im && im.complete };
});
ok('B5 时间轴里情书缩略图用新海报的 320 变体',
  tlHe.found && /love-letter-5b3706ed-320\.webp$/.test(String(tlHe.src || '')),
  `${tlHe.src}（complete=${tlHe.complete}）`);
await page.screenshot({ path: OUT + 'B_情书时间轴.png' });
await ctx.close();

/* ================= C Service Worker ================= */
console.log('\n== C Service Worker ==');
{
  const c = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await c.newPage();
  p.on('pageerror', (e) => errs.push(String(e)));
  p.on('console', (m) => { if (m.type() === 'error') errs.push('console:' + m.text().slice(0, 120)); });

  await gotoRetry(p, SITE + 'watch.html');
  await p.waitForFunction(() => document.querySelectorAll('#w-grid .poster').length > 0, null, { timeout: 60000 });
  await p.evaluate(() => navigator.serviceWorker.ready);
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 30000 }).catch(() => {});
  await p.waitForFunction(() => document.querySelectorAll('#w-grid .poster').length > 0, null, { timeout: 60000 });

  /* 把情书卡片滚进视口，等它被请求并进缓存 */
  await p.evaluate(async () => {
    const cs = [...document.querySelectorAll('#w-grid .poster')];
    const el = cs.find((c) => ((c.querySelector('.poster-name') || {}).textContent || '').trim() === '情书');
    if (el) el.scrollIntoView({ block: 'center' });
  });
  await p.waitForTimeout(3000);
  const cached = await p.evaluate(async () => {
    const cch = await caches.open('watch-posters-v1');
    const urls = (await cch.keys()).map((r) => r.url);
    return urls.filter((u) => /love-letter-5b3706ed/.test(u));
  });
  ok('C1 情书海报（新图）已进 SW 缓存 watch-posters-v1', cached.length > 0,
    cached.map((u) => decodeURIComponent(u.split('/').pop())).join(' '));

  /* 二次访问：情书海报响应必须来自 SW */
  const swResp = [];
  p.on('response', (r) => {
    if (/love-letter-5b3706ed[^/]*\.webp$/.test(r.url())) {
      let sw = 'err';
      try { sw = r.fromServiceWorker(); } catch (e) {}
      swResp.push({ u: decodeURIComponent(r.url().split('/').pop()), sw, st: r.status() });
    }
  });
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => document.querySelectorAll('#w-grid .poster').length > 0, null, { timeout: 60000 });
  await p.evaluate(async () => {
    const cs = [...document.querySelectorAll('#w-grid .poster')];
    const el = cs.find((c) => ((c.querySelector('.poster-name') || {}).textContent || '').trim() === '情书');
    if (el) el.scrollIntoView({ block: 'center' });
  });
  await p.waitForTimeout(4000);
  ok('C2 二次访问《情书》海报由 Service Worker 提供（fromServiceWorker）',
    swResp.length > 0 && swResp.every((r) => r.sw === true),
    swResp.map((r) => `${r.u}:${r.st}/${r.sw}`).join(' '));
  await c.close();
}

ok('C3 全程零 JS 异常', errs.length === 0, errs.slice(0, 3).join(' | '));

await browser.close();
console.log(`\n第 77 轮线上复验：PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
