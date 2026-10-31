import { createRequire } from 'module';
import fs from 'fs';
import crypto from 'crypto';
const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const SITE = 'https://hyouka-721.github.io/Steam-playtime/';
const ROOT = 'C:/Users/33329/WorkBuddy/2026-10-13-18-17-49/steam-playtime/docs/';
const OUT = 'C:/Users/33329/AppData/Local/Temp/fx_verify_20261018/shots65online/';
fs.mkdirSync(OUT, { recursive: true });
const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');
const local = (f) => fs.readFileSync(ROOT + f, 'utf8').replace(/\r\n/g, '\n');
const norm = (s) => s.replace(/\r\n/g, '\n');

let pass = 0, fail = 0;
const ok = (n, c, extra = '') => { c ? (pass++, console.log(`PASS ${n}${extra ? '  ' + extra : ''}`)) : (fail++, console.log(`FAIL ${n}  ${extra}`)); };

const browser = await chromium.launch({ args: ['--no-proxy-server'] });

/* 线上海报来自 TMDB，偶发慢 → goto 用 domcontentloaded + 重试，断言不变 */
async function gotoRetry(p, url, tries = 4) {
  for (let i = 1; i <= tries; i++) {
    try {
      await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      return;
    } catch (e) {
      if (i === tries) throw e;
      console.log(`  · goto 第 ${i} 次失败（${e.message.split('\n')[0]}），重试`);
      await p.waitForTimeout(2000);
    }
  }
}

/* ---------- A Pages 生效 ---------- */
console.log('== A 等待 Pages 生效（判内容指纹）==');
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await gotoRetry(page, SITE);
let hit = false, waited = 0, snap = null;
for (let i = 1; i <= 20; i++) {
  snap = await page.evaluate(async (base) => {
    const t = Date.now();
    return {
      h: await (await fetch(base + 'watch.html?cb=' + t, { cache: 'reload' })).text(),
      c: await (await fetch(base + 'watch.css?cb=' + t, { cache: 'reload' })).text(),
      j: await (await fetch(base + 'watch.js?cb=' + t, { cache: 'reload' })).text(),
    };
  }, SITE);
  const nc = snap.c.replace(/\/\*[\s\S]*?\*\//g, '');
  const ver = /watch\.css\?v=11/.test(snap.h) && /watch\.js\?v=6/.test(snap.h);
  const fix = /\.tl-head \{[^}]*flex: 0 1 auto/.test(nc);
  console.log(`  第 ${i} 次：v=11/js=6 ${ver} / .tl-head 可收缩 ${fix}（累计 ${waited}s）`);
  if (ver && fix) { hit = true; break; }
  waited += 5;
  await page.waitForTimeout(5000);
}
ok('A1 Pages 已生效（watch.css?v=11 / watch.js?v=6 + .tl-head flex 0 1 auto）', hit, `耗时约 ${waited}s`);
ok('A2 线上 watch.css 与本地去 CR 后 md5 全等', md5(norm(snap.c)) === md5(local('watch.css')),
  `${md5(norm(snap.c))} / ${md5(local('watch.css'))}`);
ok('A3 线上 watch.html 与本地去 CR 后 md5 全等', md5(norm(snap.h)) === md5(local('watch.html')), md5(norm(snap.h)));
ok('A4 线上 watch.js 与本地去 CR 后 md5 全等', md5(norm(snap.j)) === md5(local('watch.js')), md5(norm(snap.j)));
const idxVer = await page.evaluate(async (base) => {
  const h = await (await fetch(base + 'index.html?cb=' + Date.now(), { cache: 'reload' })).text();
  return ['style.css?v=109', 'app.js?v=104', 'fx.js?v=16'].filter((v) => !h.includes(v));
}, SITE);
ok('A5 首页三个版本号未受影响（style.css?v=109 / app.js?v=104 / fx.js?v=16）', idxVer.length === 0, idxVer.join(',') || '全部命中');
await ctx.close();

/* ---------- B 线上真实数据：字号 / 溢出 ---------- */
console.log('\n== B 线上真实数据（21 条）字号与横向溢出 ==');
const errs = [];
for (const W of [1440, 1100, 860, 480, 390, 360]) {
  const c = await browser.newContext({ viewport: { width: W, height: 900 } });
  const p = await c.newPage();
  p.on('pageerror', (e) => errs.push(`${W}:${e}`));
  await gotoRetry(p, SITE + 'watch.html');
  await p.evaluate(() => document.fonts.ready);
  // 线上数据靠 fetch 回来才渲染 → 先等首屏网格出现（最多 40s）；
  // 注意 paint() 一次只渲染一种视图，layout=grid 时不会有 .tl-item，切过去之后再等
  await p.waitForFunction(() => document.querySelectorAll('#w-grid .poster').length > 0, null, { timeout: 40000 });
  await p.waitForTimeout(400);
  await p.click('#w-avatar');
  await p.waitForFunction(() => document.querySelectorAll('#w-tl .tl-item').length > 0
    && getComputedStyle(document.querySelector('#w-tl')).display !== 'none', null, { timeout: 30000 });
  await p.waitForTimeout(500);
  const r = await p.evaluate(() => {
    const items = [...document.querySelectorAll('#w-tl .tl-item')];
    const pick = items.find((x) => x.querySelector('.tl-en') && x.querySelector('.tl-year') && x.querySelector('.tl-score') && x.querySelector('.tl-note')) || items[0];
    const g = (s) => { const e = pick.querySelector(s); return e ? getComputedStyle(e).fontSize : null; };
    const worst = items.map((el) => { const b = el.querySelector('.tl-body'); return b ? b.scrollWidth - Math.ceil(b.clientWidth) : 0; }).sort((a, b) => b - a)[0];
    return { n: items.length, fs: [g('.tl-name'), g('.tl-en'), g('.tl-meta'), g('.tl-note')],
      pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, worstBodyX: worst,
      gridCount: document.querySelectorAll('#w-grid .poster').length };
  });
  ok(`B[${W}] ${r.n} 条时间轴：字号 21 / 18.5 / 18.5 / 19`,
    r.fs[0] === '21px' && r.fs[1] === '18.5px' && r.fs[2] === '18.5px' && r.fs[3] === '19px', r.fs.join(' / '));
  ok(`B[${W}] 整页无横向溢出（最宽条目正文溢出 ${r.worstBodyX}）`, r.pageOverflow === 0 && r.worstBodyX <= 0,
    `pageOverflow=${r.pageOverflow}`);
  ok(`B[${W}] 网格视图同数据也能渲染（${r.gridCount} 张海报）`, r.gridCount === r.n, `grid=${r.gridCount} tl=${r.n}`);
  await c.close();
}

/* ---------- C 线上标题回顶 ---------- */
console.log('\n== C 线上标题「My Watch List」点击回顶 ==');
const c2 = await browser.newContext({ viewport: { width: 1440, height: 700 } });
const p2 = await c2.newPage();
const errsC = [];
p2.on('pageerror', (e) => errsC.push(String(e)));
await gotoRetry(p2, SITE + 'watch.html');
await p2.waitForFunction(() => document.querySelectorAll('#w-grid .poster').length > 0, null, { timeout: 40000 });
await p2.waitForTimeout(600);
const t = await p2.evaluate(() => {
  const el = document.getElementById('w-title');
  const cs = getComputedStyle(el);
  return { cursor: cs.cursor, role: el.getAttribute('role'), tab: el.getAttribute('tabindex'),
    label: el.getAttribute('aria-label'), text: el.textContent.trim() };
});
ok('C1 线上标题可识别为按钮（role/tabindex/label/cursor）',
  t.cursor === 'pointer' && t.role === 'button' && t.tab === '0' && t.label === '回到页面顶部' && t.text === 'My Watch List',
  JSON.stringify(t));
await p2.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
await p2.waitForTimeout(600);
const bottom = await p2.evaluate(() => window.scrollY);
ok('C2 线上页面可滚动（滚到底 scrollY > 0）', bottom > 0, `scrollY=${bottom}`);
await p2.click('#w-title');
let top = bottom;
for (let i = 0; i < 25; i++) {
  top = await p2.evaluate(() => window.scrollY);
  if (top === 0) break;
  await p2.waitForTimeout(120);
}
ok('C3 线上点击标题后回到最顶端（scrollY = 0）', top === 0, `scrollY=${top}`);
await p2.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
await p2.waitForTimeout(500);
await p2.focus('#w-title');
await p2.keyboard.press('Enter');
let top2 = 1;
for (let i = 0; i < 25; i++) { top2 = await p2.evaluate(() => window.scrollY); if (top2 === 0) break; await p2.waitForTimeout(120); }
ok('C4 线上键盘 Enter 也能回顶', top2 === 0, `scrollY=${top2}`);
ok('C5 线上零 JS 异常（六档 + 回顶）', errs.length === 0 && errsC.length === 0, errs.concat(errsC).join(' | '));

/* ---------- D 线上截图 ---------- */
await p2.evaluate(() => window.scrollTo(0, 0));
await p2.waitForTimeout(400);
const c3 = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const p3 = await c3.newPage();
await gotoRetry(p3, SITE + 'watch.html');
await p3.evaluate(() => document.fonts.ready);
await p3.waitForFunction(() => document.querySelectorAll('#w-grid .poster').length > 0, null, { timeout: 40000 });
await p3.waitForTimeout(600);
await p3.click('#w-avatar');
await p3.waitForFunction(() => document.querySelectorAll('#w-tl .tl-item').length > 0 && getComputedStyle(document.querySelector('#w-tl')).display !== 'none', null, { timeout: 30000 });
await p3.waitForTimeout(900);
await p3.screenshot({ path: OUT + 'L1_线上_时间轴_1440.png' });
await p3.click('#w-avatar');
await p3.waitForTimeout(900);
await p3.screenshot({ path: OUT + 'L2_线上_网格_1440.png' });
await c3.close();

const c4 = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const p4 = await c4.newPage();
await gotoRetry(p4, SITE + 'watch.html');
await p4.evaluate(() => document.fonts.ready);
await p4.waitForFunction(() => document.querySelectorAll('#w-grid .poster').length > 0, null, { timeout: 40000 });
await p4.waitForTimeout(600);
await p4.click('#w-avatar');
await p4.waitForFunction(() => document.querySelectorAll('#w-tl .tl-item').length > 0 && getComputedStyle(document.querySelector('#w-tl')).display !== 'none', null, { timeout: 30000 });
await p4.waitForTimeout(900);
await p4.screenshot({ path: OUT + 'L3_线上_时间轴_390.png' });
await c4.close();

await p2.close();
await browser.close();
console.log(`\n===== 第 65 轮线上复验：${pass}/${pass + fail} =====`);
process.exit(fail ? 1 : 0);
