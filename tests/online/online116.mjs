/* online116.mjs — 第 116 轮上线复验：缺数据的日期按 0 分钟补齐（统计口径统一）
   断言：线上 139/125 且 css/js 字节（LF 归一）与本地全等 · 线上 app.js 含 hxScope/hxMinutes ·
        范围内每个日期都有确定分钟数且可点（无 lna）· 补 0 的格子是 .l0、气泡「游玩时长：0 min」、
        点开「这天没有游玩记录」· 范围外仍是 .lna 不可点 · 合计/峰值对齐 meta.stats ·
        365 格 / 7 行 / 64 列 · 390 无溢出 · 零 JS 异常
   用法：node tests/online/online116.mjs */
import { createRequire } from 'module';
import fs from 'fs';
import crypto from 'crypto';

const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const SITE = 'https://hyouka-721.github.io/Steam-playtime/';
const LOCAL = 'C:/Users/33329/WorkBuddy/2026-10-13-18-17-49/steam-playtime/docs/';
const md5 = (s) => crypto.createHash('md5').update(Buffer.from(String(s).replace(/\r\n/g, '\n'), 'utf8')).digest('hex');
const hm = (m) => {
  const n = Math.round(Number(m) || 0);
  if (n <= 0) return '0 min';
  if (n < 60) return `${n} min`;
  const h = Math.floor(n / 60), r = n % 60;
  return r === 0 ? `${h} h` : `${h} h ${r} min`;
};

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

/* ---------- A 指纹 ---------- */
const fp = await page.evaluate(async () => {
  const g = async (u) => (await fetch(u, { cache: 'reload' })).text();
  const [html, css, app] = await Promise.all([
    g('index.html?cb=' + Date.now()),
    g('style.css?v=139'),
    g('app.js?v=125'),
  ]);
  return {
    cssTag: (html.match(/style\.css\?v=\d+/) || [])[0],
    jsTag: (html.match(/app\.js\?v=\d+/) || [])[0],
    css, app,
    hasScope: /function hxScope\(\)/.test(app),
    hasMinutes: /function hxMinutes\(date\)/.test(app),
  };
});
ok('A1 线上版本 139 / 125', fp.cssTag === 'style.css?v=139' && fp.jsTag === 'app.js?v=125', { css: fp.cssTag, js: fp.jsTag });
ok('A2 线上 style.css 字节与本地全等', md5(fp.css) === md5(fs.readFileSync(LOCAL + 'style.css', 'utf8')), { online: md5(fp.css).slice(0, 12) });
ok('A3 线上 app.js 字节与本地全等', md5(fp.app) === md5(fs.readFileSync(LOCAL + 'app.js', 'utf8')), { online: md5(fp.app).slice(0, 12) });
ok('A4 线上 app.js 含 hxScope / hxMinutes', fp.hasScope && fp.hasMinutes, { scope: fp.hasScope, minutes: fp.hasMinutes });

/* ---------- B 点阵口径 ---------- */
await page.click('#card-recent');
await page.waitForSelector('#hx-grid .hx-c', { timeout: 30000 });
await page.waitForTimeout(900);

const base = await page.evaluate(() => {
  const cells = [...document.querySelectorAll('#hx-grid .hx-c')];
  const byDate = {};
  for (const c of cells) {
    byDate[c.dataset.date] = {
      lv: [...c.classList].find((x) => /^l(na|\d)$/.test(x)),
      role: c.getAttribute('role'),
      label: c.getAttribute('aria-label'),
    };
  }
  const boot = window.__BOOT || {};
  return {
    since: boot.meta?.tracking_since,
    last: boot.meta?.last_snapshot_date,
    total: boot.meta?.stats?.total_minutes,
    best: boot.meta?.stats?.best_day,
    cells: cells.length,
    rows: getComputedStyle(document.getElementById('hx-grid')).gridTemplateRows.split(' ').filter(Boolean).length,
    cols: getComputedStyle(document.getElementById('hx-grid')).gridTemplateColumns.split(' ').filter(Boolean).length,
    byDate,
    sum: document.getElementById('hx-sum').textContent.trim(),
  };
});

const inScope = Object.entries(base.byDate).filter(([d]) => d >= base.since && d <= base.last);
const bad = inScope.filter(([, v]) => v.lv === 'lna' || v.role !== 'button');
ok('B1 范围内每个日期都有确定分钟数（无 lna、全部可点）',
  inScope.length > 10 && bad.length === 0, { since: base.since, last: base.last, days: inScope.length, bad: bad.slice(0, 3) });

ok('B2 开始统计之前（10-12）仍是未采集、不可点',
  base.byDate['2026-10-12']?.lv === 'lna' && base.byDate['2026-10-12']?.role === null, base.byDate['2026-10-12']);

const future = Object.entries(base.byDate).filter(([d]) => d > base.last).slice(0, 3);
ok('B3 最新快照之后的未来日期仍是未采集、不可点',
  future.length > 0 && future.every(([, v]) => v.lv === 'lna' && v.role === null), future);

/* 补 0 的日子：取范围内 l0 且语义为「当天没有游玩」的第一天 */
const filled = inScope.filter(([, v]) => v.lv === 'l0' && /当天没有游玩/.test(v.label || ''));
const gap = filled[0]?.[0];
ok('B4 线上确实有被补 0 的日期（.l0 + 可点）', !!gap, filled.map(([d]) => d));

if (gap) {
  const cell = `#hx-grid .hx-c[data-date="${gap}"]`;
  await page.hover(cell);
  await page.waitForTimeout(350);
  const tip = await page.evaluate(() => ({ hidden: document.getElementById('hx-tip').hidden, text: document.getElementById('hx-tip').textContent }));
  ok('B5 补 0 的那天气泡显示「游玩时长：0 min」', !tip.hidden && /游玩时长：0 min/.test(tip.text) && !/尚未/.test(tip.text), tip.text);

  await page.click(cell);
  await page.waitForTimeout(600);
  const day = await page.evaluate(() => ({
    open: !document.getElementById('hx-day').hidden,
    text: (document.querySelector('#hx-day .hx-none')?.textContent || '').trim(),
    sel: document.querySelectorAll('#hx-grid .hx-c.is-sel').length,
  }));
  ok('B6 点开补 0 的那天：说明「这天没有游玩记录」且格子高亮',
    day.open && /这天没有游玩记录/.test(day.text) && day.sel === 1, day);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
}

ok('B7 汇总合计与 meta.stats.total_minutes 一致', base.sum.includes(`合计 ${hm(base.total)}`), { sum: base.sum, expect: hm(base.total) });
ok('B8 汇总峰值与 meta.stats.best_day 一致', base.sum.includes(`峰值 ${hm(base.best.minutes)}`), { sum: base.sum, best: base.best });
ok('B9 点阵结构未变：365 格 / 7 行 / 64 列',
  base.cells >= 365 && base.rows === 7 && base.cols === 64, { cells: base.cells, rows: base.rows, cols: base.cols });

await page.setViewportSize({ width: 390, height: 900 });
await page.waitForTimeout(600);
const narrow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
ok('B10 390px 无横向溢出', narrow <= 0, narrow);

/* 第三方 Steam 封面图的 CORS / loopback 拦截属本机环境噪音，页面自身错误走 pageerror 仍一条不落 */
const realErrs = errs.filter((s) => !/steamstatic|steamcdn|akamaihd|favicon|Failed to load resource|blocked by CORS policy/i.test(s));
ok('B11 线上零 JS 异常', realErrs.length === 0, realErrs.slice(0, 3));

console.log(`\n===== online116  PASS=${pass} FAIL=${fail} =====`);
await browser.close();
process.exit(fail ? 1 : 0);
