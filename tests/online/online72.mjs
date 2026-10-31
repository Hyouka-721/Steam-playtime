/* 第 72 轮线上复验（push 后跑）：
   ① 页眉 My Watch List / <title> Watch List / watch.css?v=21 / watch.js?v=9 生效
   ② 玉子市场恢复（2021-03-21-item-2）与玉子爱情故事同日并存，且两条短评已拆分
   ③ 另两条撞车受害者一并恢复：工作细胞（2020-07-16-item-2，新海报）、境界的彼方（2020-12-18-item-2）
   ④ 三个同日组（2021-03-21 / 2020-12-18 / 2020-07-16）都按上传时间正序
   ⑤ 工作细胞新海报 item-4bb7a3f7.webp 字节级一致
   ⑥ 排序切换（评分/观看时间）线上可用、时间轴不受影响
   指纹用「页眉文案 + 数据字段」，不能只看 200 */
import { createRequire } from 'module';
import fs from 'fs';
import crypto from 'crypto';
const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const SITE = 'https://hyouka-721.github.io/Steam-playtime/';
const ROOT = 'C:/Users/33329/WorkBuddy/2026-10-13-18-17-49/steam-playtime/docs/';
const OUT = 'C:/Users/33329/AppData/Local/Temp/fx_verify_20261018/shots72online/';
fs.mkdirSync(OUT, { recursive: true });

const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');
const local = (f) => fs.readFileSync(ROOT + f, 'utf8').replace(/\r\n/g, '\n');
const norm = (s) => s.replace(/\r\n/g, '\n');
const localPoster = fs.readFileSync(ROOT + 'img/watch/item-4bb7a3f7.webp');
const localData = JSON.parse(local('data/watch.json'));

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
      const h = await (await fetch(base + 'watch.html?cb=' + t, { cache: 'reload' })).text();
      const d = await (await fetch(base + 'data/watch.json?cb=' + t, { cache: 'reload' })).text();
      return { h, d };
    }, SITE);
  } catch (e) { console.log('  第 ' + i + ' 次拉取失败'); await page.waitForTimeout(4000); waited += 4; continue; }
  let live = null;
  try { live = JSON.parse(snap.d); } catch (e) {}
  const titleOK = /<title>Watch List<\/title>/.test(snap.h);
  const h1OK = /<h1[^>]*class="w-title"[^>]*>\s*My Watch List\s*<\/h1>/.test(snap.h);
  const verOK = /watch\.css\?v=21"/.test(snap.h) && /watch\.js\?v=9"/.test(snap.h);
  const items = live && Array.isArray(live.items) ? live.items : [];
  const tamako = items.filter((x) => /玉子/.test(x.title));
  const cells = items.find((x) => x.id === '2020-07-16-item-2') || {};
  const kyokai = items.find((x) => x.id === '2020-12-18-item-2') || {};
  const dataOK = items.length >= localData.items.length &&
    tamako.length === 2 && tamako.some((x) => x.id === '2021-03-21-item-2') &&
    cells.poster === 'img/watch/item-4bb7a3f7.webp' &&
    kyokai.poster === 'img/watch/item-e0e18532.webp' &&
    items.every((x) => x.added_at);
  console.log(`  第 ${i} 次：title ${titleOK} / h1 ${h1OK} / 版本 ${verOK} / 数据 ${dataOK}（${items.length} 条，累计 ${waited}s）`);
  if (titleOK && h1OK && verOK && dataOK) { hit = true; break; }
  waited += 5; await page.waitForTimeout(5000);
}
ok('A1 Pages 已生效（页眉 My Watch List + 站名 Watch List + v16/v9 + 玉子两部 + 新海报 + added_at）', hit, `约 ${waited}s`);
ok('A2 线上 watch.html 与本地 md5 全等', md5(norm(snap.h)) === md5(local('watch.html')), md5(norm(snap.h)));

/* ---- A5 两条短评按用户要求拆分 ---- */
const live0 = JSON.parse(snap.d);
const noteLove = (live0.items.find((x) => x.id === '2021-03-21-item') || {}).note;
const noteMarket = (live0.items.find((x) => x.id === '2021-03-21-item-2') || {}).note;
ok('A5 玉子两部短评已拆分',
  noteLove === '餅が一番好きです！どうぞ！' && noteMarket === '最喜欢了饼藏了！请讲！',
  `爱情故事=${JSON.stringify(noteLove)} / 市场=${JSON.stringify(noteMarket)}`);

const posterBuf = await page.evaluate(async (base) => {
  const r = await fetch(base + 'img/watch/item-4bb7a3f7.webp?cb=' + Date.now(), { cache: 'reload' });
  const b = await r.arrayBuffer();
  return { status: r.status, b64: btoa(String.fromCharCode.apply(null, new Uint8Array(b))) };
}, SITE);
const remotePoster = Buffer.from(posterBuf.b64, 'base64');
ok('A3 工作细胞新海报可下载且与本地逐字节相同',
  posterBuf.status === 200 && md5(remotePoster) === md5(localPoster),
  `${posterBuf.status} / ${remotePoster.length}B vs 本地 ${localPoster.length}B`);

const liveData = JSON.parse(snap.d);
const N = liveData.items.length;
const sample = await page.evaluate(async (base) => {
  const list = JSON.parse(await (await fetch(base + 'data/watch.json?cb=' + Date.now(), { cache: 'reload' })).text()).items.slice(0, 6);
  const out = [];
  for (const it of list) {
    const r = await fetch(base + it.poster + '?cb=' + Date.now(), { method: 'GET', cache: 'reload' });
    out.push(it.poster.split('/').pop() + ':' + r.status);
  }
  return out;
}, SITE);
ok(`A4 线上共 ${N} 条、抽查 6 张海报全部 200`, sample.every((s) => s.endsWith(':200')), sample.join(' '));
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
    sortOn: document.querySelector('.w-sort-btn.is-on').getAttribute('data-sort'),
    first: (document.querySelector('#w-grid .poster-name') || {}).textContent,
  }));
  ok('B1 浏览器标题 Watch List、页眉 My Watch List', r.docTitle === 'Watch List' && r.h1 === 'My Watch List', `${r.docTitle} / ${r.h1}`);
  ok(`B2 网格渲染全部 ${N} 条、默认评分序（第 75 轮起）`, r.n === N && r.sortOn === 'rating', `grid=${r.n}/${N} sort=${r.sortOn} 首条=${r.first}`);

  // 评分序：第一名应是线上数据里的最高分
  const top = liveData.items.slice().sort((a, b) => (b.rating || 0) - (a.rating || 0))[0];
  await p.click('.w-sort-btn[data-sort="rating"]');
  await p.waitForTimeout(400);
  const r2 = await p.evaluate(() => ({
    first: (document.querySelector('#w-grid .poster-name') || {}).textContent,
    stored: localStorage.getItem('watch-sort'),
  }));
  ok('B3 点评分：最高分条目跳到首位（第 75 轮起排序不持久化，stored=null）',
    r2.first === top.title && r2.stored === null, `首位=${r2.first}（期望《${top.title}》★${top.rating}）stored=${r2.stored}`);
  await p.screenshot({ path: OUT + 'B3_评分序_1440.png' });

  // 时间轴：玉子两部同日并存、爱情故事在前；排序切换隐藏
  await p.click('#w-avatar');
  await p.waitForFunction(() => document.querySelectorAll('#w-tl .tl-item').length > 0, null, { timeout: 30000 });
  await p.waitForTimeout(600);
  const r3 = await p.evaluate(() => {
    const names = [...document.querySelectorAll('#w-tl .tl-name')].map((x) => x.textContent.trim());
    return {
      sortHidden: document.getElementById('w-sort').hidden,
      n: names.length,
      love: names.indexOf('玉子爱情故事'),
      market: names.indexOf('玉子市场'),
      kyokai: names.indexOf('境界的彼方'),
      sakamoto: names.indexOf('在下坂本，有何贵干？'),
      cells: names.indexOf('工作细胞'),
      chunibyo: names.indexOf('中二病也要谈恋爱！'),
      dates: [...document.querySelectorAll('#w-tl .tl-date')].map((x) => x.textContent.trim()),
    };
  });
  ok('B4 时间轴渲染全部条目、排序切换隐藏', r3.n === N && r3.sortHidden === true, `tl=${r3.n}/${N} hidden=${r3.sortHidden}`);
  ok('B5 玉子两部同日并存，先上传的《玉子爱情故事》居前',
    r3.love >= 0 && r3.market >= 0 && r3.love < r3.market, `爱情故事 #${r3.love} / 市场 #${r3.market}`);
  ok('B5b 境界的彼方与在下坂本同日并存，先上传的《境界的彼方》居前',
    r3.kyokai >= 0 && r3.sakamoto >= 0 && r3.kyokai < r3.sakamoto, `境界的彼方 #${r3.kyokai} / 在下坂本 #${r3.sakamoto}`);
  ok('B5c 工作细胞与中二病同日并存，先上传的《工作细胞》居前',
    r3.cells >= 0 && r3.chunibyo >= 0 && r3.cells < r3.chunibyo, `工作细胞 #${r3.cells} / 中二病 #${r3.chunibyo}`);
  const keys = r3.dates.map((d) => (d.match(/^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/) || []).slice(1).concat(['00', '00']).slice(0, 3).join('-'));
  ok('B6 时间轴仍按观影时间倒序', keys.every((v, i) => i === 0 || keys[i - 1] >= v), `首 ${r3.dates[0]} 尾 ${r3.dates[r3.dates.length - 1]}`);
  await p.screenshot({ path: OUT + 'B6_时间轴_1440.png' });
  await c.close();
}

ok('B7 全程零 JS 异常', errs.length === 0, errs.join(' | '));
console.log(`\n第 72 轮线上复验：PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
