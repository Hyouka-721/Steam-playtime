/* 第 73 轮线上复验（push 后跑）：
   ① 番剧类别上线：watch.js?v=13 + 筛选条四档（data-kind="anime"）+ 表单三选项
   ② 《她和她的猫》新海报 item-b73c9fed.webp（537×800）线上可下载且与本地逐字节相同
   ③ 线上 kind 重分类生效：她和她的猫/冰菓 = 番剧，雾山五行 = 剧集，玉子爱情故事 = 电影
   ④ 番剧筛选线上可用（只剩动画剧集），localStorage 持久化
   ⑤ 线上数据条数不少于本地、added_at 全覆盖、时间轴仍按观影时间倒序
   指纹用「版本号 + 番剧按钮 + 数据字段」，不能只看 200 */
import { createRequire } from 'module';
import fs from 'fs';
import crypto from 'crypto';
const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const SITE = 'https://hyouka-721.github.io/Steam-playtime/';
const ROOT = 'C:/Users/33329/WorkBuddy/2026-10-13-18-17-49/steam-playtime/docs/';
const OUT = 'C:/Users/33329/AppData/Local/Temp/fx_verify_20261018/shots73online/';
fs.mkdirSync(OUT, { recursive: true });

const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');
const local = (f) => fs.readFileSync(ROOT + f, 'utf8').replace(/\r\n/g, '\n');
const norm = (s) => s.replace(/\r\n/g, '\n');
const localPoster = fs.readFileSync(ROOT + 'img/watch/item-b73c9fed.webp');
const localData = JSON.parse(local('data/watch.json'));

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
// 第 75 轮：网格默认评分序（与 watch.js cmpRating 同规则）
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
      const h = await (await fetch(base + 'watch.html?cb=' + t, { cache: 'reload' })).text();
      const d = await (await fetch(base + 'data/watch.json?cb=' + t, { cache: 'reload' })).text();
      return { h, d };
    }, SITE);
  } catch (e) { console.log('  第 ' + i + ' 次拉取失败'); await page.waitForTimeout(4000); waited += 4; continue; }
  let live = null;
  try { live = JSON.parse(snap.d); } catch (e) {}
  const verOK = /watch\.css\?v=18"/.test(snap.h) && /watch\.js\?v=13"/.test(snap.h);
  const segOK = /data-kind="anime"[^>]*aria-pressed="false">番剧/.test(snap.h) &&
    /<option value="anime">番剧<\/option>/.test(snap.h);
  const items = live && Array.isArray(live.items) ? live.items : [];
  const cat = items.find((x) => x.id === '2020-07-17-item') || {};
  const nAnime = items.filter((x) => x.kind === 'anime').length;
  const dataOK = items.length >= localData.items.length && nAnime >= 34 &&
    cat.kind === 'anime' && cat.poster === 'img/watch/item-b73c9fed.webp' &&
    cat.poster_w === 537 && cat.poster_h === 800 &&
    items.every((x) => x.added_at);
  console.log(`  第 ${i} 次：版本 ${verOK} / 番剧入口 ${segOK} / 数据 ${dataOK}（${items.length} 条、番剧 ${nAnime}，累计 ${waited}s）`);
  if (verOK && segOK && dataOK) { hit = true; break; }
  waited += 5; await page.waitForTimeout(5000);
}
ok('A1 Pages 已生效（watch.js?v=13 + 筛选条四档 + 表单番剧 + 她和她的猫新海报/番剧 + added_at）', hit, `约 ${waited}s`);
ok('A2 线上 watch.html 与本地 md5 全等', md5(norm(snap.h)) === md5(local('watch.html')), md5(norm(snap.h)));

const posterBuf = await page.evaluate(async (base) => {
  const r = await fetch(base + 'img/watch/item-b73c9fed.webp?cb=' + Date.now(), { cache: 'reload' });
  const b = await r.arrayBuffer();
  return { status: r.status, b64: btoa(String.fromCharCode.apply(null, new Uint8Array(b))) };
}, SITE);
const remotePoster = Buffer.from(posterBuf.b64, 'base64');
ok('A3 她和她的猫新海报可下载且与本地逐字节相同',
  posterBuf.status === 200 && md5(remotePoster) === md5(localPoster),
  `${posterBuf.status} / ${remotePoster.length}B vs 本地 ${localPoster.length}B`);

const liveData = JSON.parse(snap.d);
const N = liveData.items.length;
const nAnimeLive = liveData.items.filter((x) => x.kind === 'anime').length;
const sample = await page.evaluate(async (base) => {
  const list = JSON.parse(await (await fetch(base + 'data/watch.json?cb=' + Date.now(), { cache: 'reload' })).text()).items.slice(0, 6);
  const out = [];
  for (const it of list) {
    const r = await fetch(base + it.poster + '?cb=' + Date.now(), { method: 'GET', cache: 'reload' });
    out.push(it.poster.split('/').pop() + ':' + r.status);
  }
  return out;
}, SITE);
ok(`A4 线上共 ${N} 条（本地 ${localData.items.length}）、抽查 6 张海报全部 200`,
  sample.every((s) => s.endsWith(':200')), sample.join(' '));
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
    segs: [...document.querySelectorAll('.w-seg-btn')].map((b) => b.getAttribute('data-kind')),
    kindOpts: [...document.querySelectorAll('#add-kind option')].map((o) => o.value),
  }));
  ok('B1 浏览器标题 Watch List、页眉 My Watch List', r.docTitle === 'Watch List' && r.h1 === 'My Watch List', `${r.docTitle} / ${r.h1}`);
  ok(`B2 网格渲染全部 ${N} 条、默认评分序（第 75 轮起）`, r.n === N && r.sortOn === 'rating', `grid=${r.n}/${N} sort=${r.sortOn}`);
  ok('B3 筛选条四档（all/movie/series/anime）、表单三选项（movie/series/anime）',
    JSON.stringify(r.segs) === JSON.stringify(['all', 'movie', 'series', 'anime']) &&
    JSON.stringify(r.kindOpts) === JSON.stringify(['movie', 'series', 'anime']),
    `segs=${r.segs.join(',')} opts=${r.kindOpts.join(',')}`);

  // 番剧筛选：只剩动画剧集
  await p.click('.w-seg-btn[data-kind="anime"]');
  await p.waitForTimeout(500);
  const rA = await p.evaluate(() => ({
    on: document.querySelector('.w-seg-btn.is-on').getAttribute('data-kind'),
    stored: localStorage.getItem('watch-kind'),
    names: [...document.querySelectorAll('#w-grid .poster-name')].map((x) => x.textContent.trim()),
  }));
  const expectAnime = liveData.items.filter((x) => x.kind === 'anime').slice().sort(cmpRating).map((x) => x.title);
  ok(`B4 筛「番剧」只剩 ${nAnimeLive} 部动画剧集（数量/名单与线上数据一致，第 75 轮起评分序）`,
    rA.on === 'anime' && rA.stored === 'anime' &&
    JSON.stringify(rA.names) === JSON.stringify(expectAnime),
    `grid=${rA.names.length} 期望=${expectAnime.length}`);
  ok('B5 番剧视图含她和她的猫/冰菓/某科学的超电磁炮，不含雾山五行/双城之战/铃芽之旅',
    rA.names.includes('她和她的猫') && rA.names.includes('冰菓') && rA.names.includes('某科学的超电磁炮') &&
    !rA.names.includes('雾山五行') && !rA.names.includes('英雄联盟：双城之战') && !rA.names.includes('铃芽之旅'),
    rA.names.slice(0, 3).join('、') + ' …');
  await p.screenshot({ path: OUT + 'B5_番剧筛选_1440.png' });

  // 时间轴：类别标签 + 倒序
  await p.click('.w-seg-btn[data-kind="all"]');
  await p.waitForTimeout(300);
  await p.click('#w-avatar');
  await p.waitForFunction(() => document.querySelectorAll('#w-tl .tl-item').length > 0, null, { timeout: 30000 });
  await p.waitForTimeout(600);
  const r3 = await p.evaluate(() => {
    const items = [...document.querySelectorAll('#w-tl .tl-item')];
    const find = (t) => items.find((x) => (x.querySelector('.tl-name') || {}).textContent === t);
    const g = (el, s) => { const x = el && el.querySelector(s); return x ? x.textContent.trim() : 'MISSING'; };
    return {
      sortHidden: document.getElementById('w-sort').hidden,
      n: items.length,
      cat: g(find('她和她的猫'), '.tl-kind'),
      hyouka: g(find('冰菓'), '.tl-kind'),
      kirara: g(find('雾山五行'), '.tl-kind'),
      tamakoMovie: g(find('玉子爱情故事'), '.tl-kind'),
      railgun: g(find('某科学的超电磁炮'), '.tl-kind'),
      dates: [...document.querySelectorAll('#w-tl .tl-date')].map((x) => x.textContent.trim()),
    };
  });
  ok('B6 时间轴渲染全部条目、排序切换隐藏', r3.n === N && r3.sortHidden === true, `tl=${r3.n}/${N} hidden=${r3.sortHidden}`);
  ok('B7 时间轴类别标签：她和她的猫/冰菓/某科学的超电磁炮 = 番剧，雾山五行 = 剧集，玉子爱情故事 = 电影',
    r3.cat === '番剧' && r3.hyouka === '番剧' && r3.railgun === '番剧' &&
    r3.kirara === '剧集' && r3.tamakoMovie === '电影', JSON.stringify(r3).slice(0, 160));
  const keys = r3.dates.map((d) => (d.match(/^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/) || []).slice(1).concat(['00', '00']).slice(0, 3).join('-'));
  ok('B8 时间轴仍按观影时间倒序', keys.every((v, i) => i === 0 || keys[i - 1] >= v), `首 ${r3.dates[0]} 尾 ${r3.dates[r3.dates.length - 1]}`);
  await p.screenshot({ path: OUT + 'B8_时间轴_1440.png' });
  await c.close();
}

ok('B9 全程零 JS 异常', errs.length === 0, errs.join(' | '));
console.log(`\n第 73 轮线上复验：PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
