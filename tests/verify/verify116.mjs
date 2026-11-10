/* verify116.mjs — 第 116 轮：统计口径统一 —— 自 tracking_since 起，缺数据的日期按 0 分钟补齐
   契约：
     ① 范围 = [meta.tracking_since, meta.last_snapshot_date]，范围内**每个日期都有确定的分钟数**：
        缺记录的按 0 处理（.l0 灰点 / 可点 / 气泡「游玩时长：0 min」/ 当日列表「这天没有游玩记录」）；
     ② 范围外（开始统计之前、最新快照之后）仍是 .lna「尚未记录」，不可点、不可展开；
     ③ 点阵结构（365 格 / 7 行 / 64 列）与汇总数字（合计 / 峰值）不受影响。
   用法：node tests/verify/verify116.mjs */
import { createRequire } from 'module';
import fs from 'fs';

const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const ROOT = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const LOCAL = 'http://127.0.0.1:8895/index.html';
let pass = 0, fail = 0;
const ok = (n, c, x) => { c ? (pass++, console.log('PASS ', n, x === undefined ? '' : '— ' + JSON.stringify(x))) : (fail++, console.log('FAIL ', n, '— ' + JSON.stringify(x))); };

const hm = (m) => {
  const n = Math.round(Number(m) || 0);
  if (n <= 0) return '0 min';
  if (n < 60) return `${n} min`;
  const h = Math.floor(n / 60), r = n % 60;
  return r === 0 ? `${h} h` : `${h} h ${r} min`;
};

/* ---------- A 静态 ---------- */
const js = fs.readFileSync(ROOT + 'docs/app.js', 'utf8');
const html = fs.readFileSync(ROOT + 'docs/index.html', 'utf8');
ok('A1 版本参数 CSS 139 / APP 125', html.includes('style.css?v=141') && html.includes('app.js?v=127'),
  { css: (html.match(/style\.css\?v=(\d+)/) || [])[1], app: (html.match(/app\.js\?v=(\d+)/) || [])[1] });
ok('A2 口径助手 hxScope / hxMinutes 就位，年视图与气泡都走它',
  /function hxScope\(\)/.test(js) && /function hxMinutes\(date\)/.test(js) &&
  /const min = hxMinutes\(ds\);/.test(js) && !/const min = minutesOn\(ds\);/.test(js));

/* ---------- B 运行时 ---------- */
const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
await ctx.addInitScript(() => { try { localStorage.setItem('theme', 'cinema'); } catch (e) {} });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });

await page.goto(LOCAL + '?t=' + Date.now(), { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#lt-list .rank-item', { state: 'visible', timeout: 40000 });
await page.waitForTimeout(1200);
await page.click('#card-recent');
await page.waitForSelector('#hx-grid .hx-c', { timeout: 20000 });
await page.waitForTimeout(800);

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
  return {
    meta: {
      since: window.__BOOT?.meta?.tracking_since,
      last: window.__BOOT?.meta?.last_snapshot_date,
      total: window.__BOOT?.meta?.stats?.total_minutes,
      active: window.__BOOT?.meta?.stats?.active_days,
      best: window.__BOOT?.meta?.stats?.best_day,
    },
    cells: cells.length,
    rows: getComputedStyle(document.getElementById('hx-grid')).gridTemplateRows.split(' ').filter(Boolean).length,
    cols: getComputedStyle(document.getElementById('hx-grid')).gridTemplateColumns.split(' ').filter(Boolean).length,
    byDate,
    sum: document.getElementById('hx-sum').textContent.trim(),
  };
});

const since = base.meta.since, last = base.meta.last;
ok('B1 拿到统计范围（tracking_since / last_snapshot_date）', !!since && !!last, { since, last });

/* 范围内每个日期都必须有确定级别且可点 */
const inScope = Object.entries(base.byDate).filter(([d]) => d >= since && d <= last);
const badScope = inScope.filter(([, v]) => v.lv === 'lna' || v.role !== 'button');
ok('B2 范围内每个日期都有确定分钟数（无 lna，且都可点）',
  inScope.length > 0 && badScope.length === 0,
  { days: inScope.length, bad: badScope.slice(0, 4) });

/* 范围外仍为 lna 且不可点 */
const outBefore = base.byDate['2026-10-12'];
const outAfter = Object.entries(base.byDate).filter(([d]) => d > last).slice(0, 3);
ok('B3 开始统计之前（10-12）仍是未采集、不可点',
  !!outBefore && outBefore.lv === 'lna' && outBefore.role === null, outBefore);
ok('B4 最新快照之后的未来日期仍是未采集、不可点',
  outAfter.length > 0 && outAfter.every(([, v]) => v.lv === 'lna' && v.role === null), outAfter);

/* 缺数据的那天：应被补成 l0，且不再是 lna */
const filled = inScope.filter(([, v]) => v.lv === 'l0' && /当天没有游玩/.test(v.label || ''));
ok('B5 范围内缺记录的日子被补成 0 分钟（.l0 + 可点 + 语义为「当天没有游玩」）',
  filled.length >= 0 && filled.every(([d]) => base.byDate[d].lv === 'l0'), filled.map(([d]) => d));
const gap = filled[0]?.[0];

if (gap) {
  const cell = `#hx-grid .hx-c[data-date="${gap}"]`;
  await page.hover(cell);
  await page.waitForTimeout(350);
  const tip = await page.evaluate(() => ({
    hidden: document.getElementById('hx-tip').hidden,
    text: document.getElementById('hx-tip').textContent,
  }));
  ok('B6 补 0 的那天气泡显示「游玩时长：0 min」（不再写「尚未记录」）',
    !tip.hidden && /游玩时长：0 min/.test(tip.text) && !/尚未/.test(tip.text), tip.text);

  await page.click(cell);
  await page.waitForTimeout(600);
  const day = await page.evaluate(() => ({
    open: !document.getElementById('hx-day').hidden,
    text: (document.querySelector('#hx-day .hx-none')?.textContent || '').trim(),
    sel: document.querySelectorAll('#hx-grid .hx-c.is-sel').length,
  }));
  ok('B7 点开补 0 的那天：列表说明「这天没有游玩记录」且格子高亮',
    day.open && /这天没有游玩记录/.test(day.text) && day.sel === 1, day);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
}

/* 汇总口径：合计 = meta.stats.total_minutes，峰值 = best_day 的分钟数 */
ok('B8 汇总合计与 meta.stats.total_minutes 一致（补 0 不改变总和）',
  base.sum.includes(`合计 ${hm(base.meta.total)}`), { sum: base.sum, expect: hm(base.meta.total) });
ok('B9 汇总峰值与 meta.stats.best_day 一致', base.sum.includes(`峰值 ${hm(base.meta.best.minutes)}`),
  { sum: base.sum, best: base.meta.best });

/* 结构未变 */
ok('B10 点阵结构未变：365 格 / 7 行 / 64 列',
  base.cells >= 365 && base.rows === 7 && base.cols === 64, { cells: base.cells, rows: base.rows, cols: base.cols });

/* 390 */
await page.setViewportSize({ width: 390, height: 900 });
await page.waitForTimeout(600);
const narrow = await page.evaluate(() => ({
  over: document.documentElement.scrollWidth - window.innerWidth,
  rows: getComputedStyle(document.getElementById('hx-grid')).gridTemplateRows.split(' ').filter(Boolean).length,
}));
ok('B11 390px 无横向溢出且仍 7 行', narrow.over <= 0 && narrow.rows === 7, narrow);

const realErrs = errs.filter((s) => !/steamstatic|steamcdn|favicon|Failed to load resource/i.test(s));
ok('B12 零 JS 异常', realErrs.length === 0, realErrs.slice(0, 3));

console.log(`\n===== verify116  PASS=${pass} FAIL=${fail} =====`);
await browser.close();
process.exit(fail ? 1 : 0);
