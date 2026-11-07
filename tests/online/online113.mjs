/* online113.mjs — 第 113 轮上线复验：删浮层死码 + 点阵行距收紧 + 点开不跳动 + 删两张卡
   断言：线上 137/122 且 css/js 字节（LF 归一）与本地全等 · 线上源码无 cal-overlay ·
        DOM 无 #cal-overlay / .cal-* · 年视图 #drill-more 为空 · 行距 = 列距 × 0.5 ·
        点开当天 scrollY 不变 · Esc 收起 · 下钻游戏详情卡仍在 · 390 不撑破文档 · 零异常
   用法：node tests/online/online113.mjs */
import { createRequire } from 'module';
import fs from 'fs';
import crypto from 'crypto';

const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const SITE = 'https://hyouka-721.github.io/Steam-playtime/';
const LOCAL = 'C:/Users/33329/WorkBuddy/2026-10-13-18-17-49/steam-playtime/docs/';
const md5 = (s) => crypto.createHash('md5').update(Buffer.from(String(s).replace(/\r\n/g, '\n'), 'utf8')).digest('hex');

let pass = 0, fail = 0;
const ok = (n, c, x) => { c ? (pass++, console.log('PASS ', n, x === undefined ? '' : '— ' + JSON.stringify(x))) : (fail++, console.log('FAIL ', n, '— ' + JSON.stringify(x))); };

const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
await ctx.addInitScript(() => { try { localStorage.setItem('theme', 'cinema'); } catch (e) {} });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });

await page.goto(SITE, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('#lt-list .rank-item', { state: 'visible', timeout: 45000 });
await page.waitForTimeout(1200);

/* ---------- A 指纹：版本 + 字节全等 ---------- */
const fp = await page.evaluate(async () => {
  const g = async (u) => (await fetch(u, { cache: 'reload' })).text();
  const [html, css, js] = await Promise.all([
    g('index.html?cb=' + Date.now()),
    g('style.css?v=137'),
    g('app.js?v=122'),
  ]);
  return {
    cssTag: (html.match(/style\.css\?v=\d+/) || [])[0],
    jsTag: (html.match(/app\.js\?v=\d+/) || [])[0],
    css, js,
    calInHtml: /cal-overlay/.test(html),
    calInJs: /cal-overlay|openDayDetail|closeCal|stepDay|calDayGames/.test(js),
    hmText: /hmText/.test(js),
  };
});
ok('A1 线上版本 137 / 122', fp.cssTag === 'style.css?v=137' && fp.jsTag === 'app.js?v=122', { css: fp.cssTag, js: fp.jsTag });
ok('A2 线上 style.css 字节与本地全等', md5(fp.css) === md5(fs.readFileSync(LOCAL + 'style.css', 'utf8')), { online: md5(fp.css).slice(0, 12) });
ok('A3 线上 app.js 字节与本地全等', md5(fp.js) === md5(fs.readFileSync(LOCAL + 'app.js', 'utf8')), { online: md5(fp.js).slice(0, 12) });
ok('A4 线上源码里浮层彻底消失（html / js / hmText）', !fp.calInHtml && !fp.calInJs && !fp.hmText, { html: fp.calInHtml, js: fp.calInJs, hm: fp.hmText });

/* ---------- B 运行时 ---------- */
await page.click('#card-recent');
await page.waitForSelector('#hx-grid .hx-c', { timeout: 30000 });
await page.waitForTimeout(800);

const base = await page.evaluate(() => {
  const grid = document.getElementById('hx-grid');
  const cs = getComputedStyle(grid);
  const cells = [...grid.querySelectorAll('.hx-c')];
  const r = (i) => cells[i].getBoundingClientRect();
  const more = document.getElementById('drill-more');
  return {
    overlay: !!document.getElementById('cal-overlay'),
    calNodes: document.querySelectorAll('[class*="cal-"]').length,
    moreLen: (more?.innerHTML || '').trim().length,
    moreKv: more?.querySelectorAll('.dm-kv').length ?? 0,
    hasSumText: /期内合计/.test(document.getElementById('lt-detail')?.textContent || ''),
    rowGap: parseFloat(cs.rowGap), colGap: parseFloat(cs.columnGap),
    rowPitch: +(r(1).top - r(0).top).toFixed(2),
    colPitch: +(r(7).left - r(0).left).toFixed(2),
    rows: cs.gridTemplateRows.split(' ').length,
    cols: cs.gridTemplateColumns.split(' ').length,
    cells: cells.length,
    fill: +(grid.getBoundingClientRect().width / (document.getElementById('hx-root').clientWidth - 26)).toFixed(3),
    over: document.documentElement.scrollWidth - window.innerWidth,
  };
});
ok('B1 线上 DOM 无 #cal-overlay / .cal-*', !base.overlay && base.calNodes === 0, { overlay: base.overlay, cal: base.calNodes });
ok('B2 年视图 #drill-more 为空（无期内合计 / 有记录）', base.moreLen === 0 && base.moreKv === 0 && !base.hasSumText, { len: base.moreLen, kv: base.moreKv });
ok('B3 行距恰为列距的一半', Math.abs(base.rowGap / base.colGap - 0.5) < 0.02, { rowGap: base.rowGap, colGap: base.colGap, ratio: +(base.rowGap / base.colGap).toFixed(3) });
ok('B4 实测行间距 < 列间距（矩阵更紧密）', base.rowPitch < base.colPitch - 1, { rowPitch: base.rowPitch, colPitch: base.colPitch });
ok('B5 点阵结构未变：7 行 × 64 列 / 365 格 / 铺满',
  base.rows === 7 && base.cols === 64 && base.cells >= 365 && base.fill >= 0.98, { rows: base.rows, cols: base.cols, cells: base.cells, fill: base.fill });

/* 点开当天：不滚动 */
const before = await page.evaluate(() => window.scrollY);
await page.locator('#hx-grid .hx-c[role="button"]').nth(4).click();
await page.waitForTimeout(800);
const day = await page.evaluate(() => ({
  scrollY: window.scrollY,
  open: !document.getElementById('hx-day').hidden,
  rows: document.querySelectorAll('#hx-day .hx-row').length,
  cap: document.querySelectorAll('#hx-day .rank-capsule-wrap').length,
  tt: document.querySelector('#hx-day .hx-tt')?.textContent,
}));
ok('B6 点开当天展开横图列表且页面不滚动', day.open && day.rows > 0 && day.cap === day.rows && day.scrollY === before, { before, ...day });

await page.keyboard.press('Escape');
await page.waitForTimeout(400);
ok('B7 Esc 收起当日列表（浮层已删除，Esc 不再抢事件）',
  await page.evaluate(() => document.getElementById('hx-day').hidden) === true);

/* 下钻游戏：详情卡仍在 */
await page.click('#card-lifetime');
await page.waitForTimeout(600);
await page.click('#lt-list .rank-item');
await page.waitForTimeout(1400);
const drill = await page.evaluate(() => ({
  share: !!document.querySelector('#drill-more .dm-share'),
  kv: document.querySelectorAll('#drill-more .dm-kv').length,
}));
ok('B8 下钻游戏后「占终身时长 + 期段」仍在', drill.share && drill.kv >= 3, drill);

/* 390 窄屏 */
await page.setViewportSize({ width: 390, height: 900 });
await page.waitForTimeout(600);
const narrow = await page.evaluate(() => ({
  over: document.documentElement.scrollWidth - window.innerWidth,
  rows: getComputedStyle(document.getElementById('hx-grid')).gridTemplateRows.split(' ').length,
}));
ok('B9 390px 无横向溢出且仍 7 行', narrow.over <= 0 && narrow.rows === 7, narrow);

const realErrs = errs.filter((s) => !/steamstatic|favicon|Failed to load resource/i.test(s));
ok('B10 线上零 JS 异常', realErrs.length === 0, realErrs.slice(0, 3));

console.log(`\n===== online113  PASS=${pass} FAIL=${fail} =====`);
await browser.close();
process.exit(fail ? 1 : 0);
