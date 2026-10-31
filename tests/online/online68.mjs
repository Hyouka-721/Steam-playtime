/* 第 68 轮线上复验：左轨统一 + 列对齐 + 太平年数据 + 第 66 轮六项契约，全部在 Pages 上验
   坑位提醒：goto 别等 load（到 Pages 带宽抖动）；先 waitForFunction 等数据渲染；
           截图前 waitImgs 预热（.poster-pic img 默认 opacity:0） */
import { createRequire } from 'module';
import fs from 'fs';
import crypto from 'crypto';
const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const SITE = 'https://hyouka-721.github.io/Steam-playtime/';
const ROOT = 'C:/Users/33329/WorkBuddy/2026-10-13-18-17-49/steam-playtime/docs/';
const OUT = 'C:/Users/33329/AppData/Local/Temp/fx_verify_20261018/shots68online/';
fs.mkdirSync(OUT, { recursive: true });

const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');
const local = (f) => fs.readFileSync(ROOT + f, 'utf8').replace(/\r\n/g, '\n');
const norm = (s) => s.replace(/\r\n/g, '\n');

let pass = 0, fail = 0;
const ok = (n, c, extra = '') => { c ? (pass++, console.log(`PASS ${n}${extra ? '  — ' + extra : ''}`)) : (fail++, console.log(`FAIL ${n}  — ${extra}`)); };

const browser = await chromium.launch({ args: ['--no-proxy-server'] });
async function gotoRetry(p, url, tries = 4) {
  for (let i = 1; i <= tries; i++) {
    try { await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }); return; }
    catch (e) { if (i === tries) throw e; console.log(`  · goto 重试 ${i}`); await p.waitForTimeout(2000); }
  }
}
const waitGrid = (p) => p.waitForFunction(() => document.querySelectorAll('#w-grid .poster').length > 0, null, { timeout: 60000 });
const waitTl = (p) => p.waitForFunction(() => document.querySelectorAll('#w-tl .tl-item').length > 0
  && getComputedStyle(document.querySelector('#w-tl')).display !== 'none', null, { timeout: 40000 });
async function waitImgs(p, sel, capMs = 240000) {
  const t0 = Date.now();
  while (Date.now() - t0 < capMs) {
    const s = await p.evaluate((q) => {
      const a = [...document.querySelectorAll(q)];
      return { done: a.filter((i) => i.complete && i.naturalWidth > 0).length, all: a.length };
    }, sel);
    if (s.all > 0 && s.done === s.all) return { ...s, timeout: false };
    await p.waitForTimeout(2500);
  }
  const s = await p.evaluate((q) => {
    const a = [...document.querySelectorAll(q)];
    return { done: a.filter((i) => i.complete && i.naturalWidth > 0).length, all: a.length };
  }, sel);
  return { ...s, timeout: true };
}

/* ================= A Pages 生效 ================= */
console.log('== A 等 Pages 生效（内容指纹） ==');
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await gotoRetry(page, SITE);
let hit = false, waited = 0, snap = null;
for (let i = 1; i <= 20; i++) {
  try {
    snap = await page.evaluate(async (base) => {
      const t = Date.now();
      return {
        h: await (await fetch(base + 'watch.html?cb=' + t, { cache: 'reload' })).text(),
        c: await (await fetch(base + 'watch.css?cb=' + t, { cache: 'reload' })).text(),
        j: await (await fetch(base + 'watch.js?cb=' + t, { cache: 'reload' })).text(),
        d: await (await fetch(base + 'data/watch.json?cb=' + t, { cache: 'reload' })).text(),
      };
    }, SITE);
  } catch (e) {
    console.log(`  第 ${i} 次拉取失败，重试`); await page.waitForTimeout(4000); waited += 4; continue;
  }
  const nc = snap.c.replace(/\/\*[\s\S]*?\*\//g, '');
  const ver = /watch\.css\?v=14/.test(snap.h);
  const rail = /--tl-axis: 12px/.test(nc) && /\.tl-item \{[^}]*padding: 14px 16px 14px 0/.test(nc);
  const cols = /grid-template-columns: 220px 330px/.test(nc);
  console.log(`  第 ${i} 次：v=14 ${ver} / 左轨 ${rail} / 列网格 ${cols}（累计 ${waited}s）`);
  if (ver && rail && cols) { hit = true; break; }
  waited += 5; await page.waitForTimeout(5000);
}
ok('A1 Pages 已生效（watch.css?v=14 + --tl-axis 左轨 + 列网格）', hit, `约 ${waited}s`);
ok('A2 线上 watch.css 与本地去 CR 后 md5 全等', md5(norm(snap.c)) === md5(local('watch.css')), md5(norm(snap.c)));
ok('A3 线上 watch.html 与本地 md5 全等', md5(norm(snap.h)) === md5(local('watch.html')));
ok('A4 线上 watch.js 与本地 md5 全等（本轮未改 JS）', md5(norm(snap.j)) === md5(local('watch.js')));
const liveData = JSON.parse(snap.d);
const N = liveData.items.length;
ok(`A5 线上数据 ${N} 条、id 唯一`, N >= 32 && new Set(liveData.items.map((x) => x.id)).size === N, `${N} 条`);
ok('A6 线上含新录入的片子（大宅门 / 新世纪福音战士 / 游戏人生 / 超时空大决战）',
  ['大宅门', '新世纪福音战士', '游戏人生', '超时空大决战'].every((t) => liveData.items.some((x) => x.title === t)),
  liveData.items.slice(0, 3).map((x) => x.title).join(','));
const rIdx = await page.evaluate(async (base) => {
  const h = await (await fetch(base + 'index.html?cb=' + Date.now(), { cache: 'reload' })).text();
  return ['style.css?v=107', 'app.js?v=101', 'fx.js?v=16'].filter((v) => !h.includes(v));
}, SITE);
ok('A7 首页三个版本号未受影响', rIdx.length === 0, rIdx.join(',') || '全部命中');
await ctx.close();

/* ================= B 左轨 + 列对齐（多档） ================= */
console.log('\n== B 左轨与列对齐 ==');
const errs = [];
for (const W of [1440, 1100, 860, 390]) {
  const c = await browser.newContext({ viewport: { width: W, height: 900 } });
  const p = await c.newPage();
  p.on('pageerror', (e) => errs.push(`${W}:${e}`));
  await gotoRetry(p, SITE + 'watch.html');
  await p.evaluate(() => { try { localStorage.removeItem('watch-layout'); } catch (e) {} });
  await p.reload({ waitUntil: 'domcontentloaded' });
  await waitGrid(p);
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(500);

  const g = await p.evaluate(() => {
    const m = document.querySelector('.w-main');
    const rail = m.getBoundingClientRect().left + parseFloat(getComputedStyle(m).paddingLeft);
    const card = document.querySelector('#w-grid .poster');
    return { rail: +rail.toFixed(1), card: +card.getBoundingClientRect().left.toFixed(1),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  });
  ok(`B[${W}] 网格卡片在内容左轨（${g.rail}）`, Math.abs(g.card - g.rail) < 0.6 && g.overflow === 0,
    `card=${g.card} rail=${g.rail} overflow=${g.overflow}`);

  await p.click('#w-avatar');
  await waitTl(p);
  await p.waitForTimeout(500);
  const t = await p.evaluate(() => {
    const items = [...document.querySelectorAll('#w-tl .tl-item')];
    const u = (sel) => [...new Set(items.map((it) => { const e = it.querySelector(sel); return e ? Math.round(e.getBoundingClientRect().left) : null; }).filter((x) => x != null))];
    const month = document.querySelector('#w-tl .tl-month');
    const mr = month.getBoundingClientRect();
    const dot = mr.left + parseFloat(getComputedStyle(month, '::before').left);
    return {
      thumb: +document.querySelector('#w-tl .tl-thumb').getBoundingClientRect().left.toFixed(1),
      month: +mr.left.toFixed(1), dot: +dot.toFixed(1),
      cols: { name: u('.tl-name'), date: u('.tl-date'), kind: u('.tl-kind'), year: u('.tl-year'), score: u('.tl-score'), note: u('.tl-note') },
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      n: items.length,
    };
  });
  ok(`B[${W}] 时间轴缩略图/月份标题在内容左轨、轴线未越界`,
    Math.abs(t.thumb - g.rail) < 0.6 && Math.abs(t.month - g.rail) < 0.6 && t.dot >= 0 && t.overflow === 0,
    `thumb=${t.thumb} month=${t.month} dot=${t.dot} rail=${g.rail}`);
  if (W > 860) {
    ok(`B[${W}] 六列各自唯一 x（${t.n} 条）`, Object.values(t.cols).every((a) => a.length === 1), JSON.stringify(t.cols));
  } else {
    ok(`B[${W}] 折行兜底档：无溢出（${t.n} 条）`, t.overflow === 0, `overflow=${t.overflow}`);
  }
  await c.close();
}

/* ================= C 太平年数据 ================= */
console.log('\n== C 太平年 ==');
{
  const c = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await c.newPage();
  p.on('pageerror', (e) => errs.push(`C:${e}`));
  await gotoRetry(p, SITE + 'watch.html');
  await waitGrid(p);
  await p.click('#w-avatar');
  await waitTl(p);
  await p.waitForTimeout(600);
  const r = await p.evaluate(() => {
    const get = (el, s) => { const x = el.querySelector(s); return x ? x.textContent.trim() : null; };
    const items = [...document.querySelectorAll('#w-tl .tl-item')];
    const tp = items.find((x) => get(x, '.tl-name') === '太平年');
    const groups = [...document.querySelectorAll('#w-tl .tl-group')];
    const gi = groups.findIndex((g) => [...g.querySelectorAll('.tl-name')].some((n) => n.textContent.trim() === '太平年'));
    return {
      date: get(tp, '.tl-date'), year: get(tp, '.tl-year'), kind: get(tp, '.tl-kind'), score: get(tp, '.tl-score'),
      group: gi >= 0 ? groups[gi].querySelector('.tl-month').textContent.trim() : 'MISSING',
    };
  });
  ok('C1 线上太平年：观看 2026-02-14 / 上映 2026 / 剧集 / ★8.5',
    r.date === '2026-02-14' && r.year === '2026' && r.kind === '剧集' && r.score === '★8.5', JSON.stringify(r));
  ok('C2 归入「2026 年 2 月」分组', r.group === '2026 年 2 月', r.group);

  /* 第 66 轮六项契约复查 */
  const six = await p.evaluate(() => {
    const items = [...document.querySelectorAll('#w-tl .tl-item')];
    return {
      title: (() => { const el = document.getElementById('w-title'); return { hasTitle: el.hasAttribute('title'), label: el.getAttribute('aria-label') }; })(),
      scores: items.map((x) => { const s = x.querySelector('.tl-score'); return s ? s.textContent.trim() : null; }).filter(Boolean),
    };
  });
  ok('C3 标题仍无 title 属性（悬停无提示）且 aria-label 在',
    six.title.hasTitle === false && six.title.label === '回到页面顶部', JSON.stringify(six.title));
  ok('C4 评级仍统一一位小数', six.scores.every((x) => /^★\d+\.\d$/.test(x)), six.scores.slice(0, 5).join(' '));

  await p.click('#w-avatar');
  await p.waitForTimeout(800);
  const grid = await p.evaluate(() => {
    const cards = [...document.querySelectorAll('#w-grid .poster')];
    return {
      n: cards.length,
      kind: cards.filter((x) => x.querySelector('.poster-kind')).length,
      sub: cards.filter((x) => x.querySelector('.poster-sub')).length,
      heads: cards.filter((x) => x.querySelector('.poster-head') && x.querySelector('.poster-date')).length,
      scores: cards.map((x) => { const s = x.querySelector('.poster-score'); return s ? s.textContent.trim() : ''; }).filter(Boolean),
    };
  });
  ok(`C5 网格 ${grid.n} 张卡片：无角标、无年份行、片名+日期同排`,
    grid.kind === 0 && grid.sub === 0 && grid.heads === grid.n, JSON.stringify(grid).slice(0, 120));
  ok('C6 网格评分也统一一位小数', grid.scores.every((x) => /^★\d+\.\d$/.test(x)), grid.scores.slice(0, 5).join(' '));
  await c.close();
}

/* ================= D 标题回顶 ================= */
console.log('\n== D 标题回顶 ==');
{
  const c = await browser.newContext({ viewport: { width: 1440, height: 700 } });
  const p = await c.newPage();
  p.on('pageerror', (e) => errs.push(`D:${e}`));
  await gotoRetry(p, SITE + 'watch.html');
  await waitGrid(p);
  await p.waitForTimeout(600);
  await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await p.waitForTimeout(600);
  const bottom = await p.evaluate(() => window.scrollY);
  await p.click('#w-title');
  let top = bottom;
  for (let i = 0; i < 25; i++) { top = await p.evaluate(() => window.scrollY); if (top === 0) break; await p.waitForTimeout(120); }
  ok('D1 点击标题仍回到顶端', bottom > 0 && top === 0, `scrollY ${bottom} → ${top}`);
  ok('D2 全程零 JS 异常', errs.length === 0, errs.slice(0, 3).join(' | '));
  await c.close();
}

/* ================= E 线上截图 ================= */
console.log('\n== E 线上截图（预热图片） ==');
async function shot(W, H, name, tlView) {
  const c = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
  const p = await c.newPage();
  await gotoRetry(p, SITE + 'watch.html');
  await p.evaluate(() => { try { localStorage.removeItem('watch-layout'); } catch (e) {} });
  await p.reload({ waitUntil: 'domcontentloaded' });
  await waitGrid(p);
  await p.evaluate(() => document.fonts.ready);
  const gi = await waitImgs(p, '#w-grid .poster img');
  console.log(`  ${name} 网格图 ${gi.done}/${gi.all}${gi.timeout ? '(超时)' : ''}`);
  if (tlView) {
    await p.click('#w-avatar');
    await waitTl(p);
    await p.waitForTimeout(400);
    const ti = await waitImgs(p, '#w-tl .tl-thumb img', 150000);
    console.log(`  ${name} 缩略图 ${ti.done}/${ti.all}${ti.timeout ? '(超时)' : ''}`);
  }
  await p.waitForTimeout(700);
  await p.screenshot({ path: OUT + name + '.png' });
  await c.close();
}
await shot(1440, 900, 'L1_线上_时间轴_1440', true);
await shot(1440, 900, 'L2_线上_网格_1440', false);
await shot(390, 844, 'L3_线上_时间轴_390', true);

await browser.close();
console.log(`\n===== 第 68 轮线上复验：${pass}/${pass + fail} =====`);
process.exit(fail ? 1 : 0);
