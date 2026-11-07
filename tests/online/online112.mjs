/* online112.mjs — 第 111/112 轮上线复验：一年点阵热力图 + 横图当日列表
   断言：版本 136/121 · 365 格 / 7 行 / 53+11 列 · 11 个月份间隙列 · 铺满度 ≥0.9 ·
        悬停气泡含日期与时长且不压标题 · 点击下方展开横图行（含胶囊封面）· 再点收起 ·
        1440/1088/900 无溢出 · 390 横向滚动不撑破文档 · 零 JS 异常
   用法：node tests/online/online112.mjs */
import { createRequire } from 'module';

const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const SITE = 'https://hyouka-721.github.io/Steam-playtime/';
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

/* ---------- A 版本 ---------- */
const ver = await page.evaluate(() => {
  const h = document.documentElement.outerHTML;
  return { css: (h.match(/style\.css\?v=(\d+)/) || [])[1], js: (h.match(/app\.js\?v=(\d+)/) || [])[1] };
});
ok('A1 线上已是 style.css?v=136 / app.js?v=121', ver.css === '136' && ver.js === '121', ver);
ok('A2 旧月历 DOM 已不存在', await page.evaluate(() => !document.querySelector('#heat-drill') && !document.querySelector('.heat-pair')));

/* ---------- B 点阵几何 ---------- */
await page.click('#card-recent');
await page.waitForSelector('#hx-grid .hx-c', { timeout: 30000 });
await page.waitForTimeout(800);

const geo = await page.evaluate(() => {
  const root = document.querySelector('#hx-root');
  const grid = document.querySelector('#hx-grid');
  const cs = getComputedStyle(grid);
  const cells = document.querySelectorAll('#hx-grid .hx-c');
  return {
    cells: cells.length,
    rows: cs.gridTemplateRows.split(' ').length,
    cols: cs.gridTemplateColumns.split(' ').length,
    gaps: Math.round(document.querySelectorAll('#hx-grid .hx-mgap').length / 7),
    marks: document.querySelectorAll('#hx-months .hx-ml').length,
    fill: +(grid.getBoundingClientRect().width / (root.clientWidth - 26)).toFixed(3),
    cell: +cells[0].getBoundingClientRect().width.toFixed(1),
    zoom: +(document.documentElement.scrollWidth - window.innerWidth).toFixed(0),
  };
});
ok('B1 一年 365 格', geo.cells >= 365 && geo.cells <= 371, geo.cells);
ok('B2 7 行 × (53 周列 + 11 间隙列) = 64 列', geo.rows === 7 && geo.cols === 64, { rows: geo.rows, cols: geo.cols });
ok('B3 11 个月份间隙列齐全', geo.gaps === 11, geo.gaps);
ok('B4 12 个月份刻度', geo.marks === 12, geo.marks);
ok('B5 点阵铺满面板（fill ≥ 0.9）', geo.fill >= 0.9, geo.fill);
ok('B6 1440 无横向溢出', geo.zoom <= 0, geo.zoom);

/* ---------- C 悬停气泡 ---------- */
const cell = page.locator('#hx-grid .hx-c[role="button"]').first();
await cell.hover();
await page.waitForTimeout(400);
const tip = await page.evaluate(() => {
  const t = document.querySelector('#hx-tip');
  const title = document.querySelector('.hx-title').getBoundingClientRect();
  return { hidden: t.hidden, text: t.textContent, clearOfTitle: t.getBoundingClientRect().top >= title.bottom };
});
ok('C1 悬停出气泡，含日期与当天时长',
  !tip.hidden && /\d{4}年\d{1,2}月\d{1,2}日/.test(tip.text) && /游玩时长：/.test(tip.text), tip.text);
ok('C2 气泡不遮挡面板标题', tip.clearOfTitle, tip.clearOfTitle);

/* ---------- D 点击展开横图行 ---------- */
await cell.click();
await page.waitForTimeout(900);
const day = await page.evaluate(() => {
  const box = document.querySelector('#hx-day');
  const rows = [...box.querySelectorAll('.hx-row')];
  const caps = box.querySelectorAll('.rank-capsule-wrap img.rank-capsule');
  const hydrated = [...caps].filter((i) => i.src && !i.src.startsWith('data:')).length;
  const capRect = caps[0]?.getBoundingClientRect();
  return {
    open: !box.hidden,
    below: box.getBoundingClientRect().top > document.querySelector('#hx-grid').getBoundingClientRect().bottom,
    rows: rows.length,
    caps: caps.length,
    hydrated,
    capW: capRect ? Math.round(capRect.width) : 0,
    capH: capRect ? Math.round(capRect.height) : 0,
    width: Math.round(box.querySelector('.hx-row')?.getBoundingClientRect().width || 0),
    panelW: Math.round(box.getBoundingClientRect().width),
    sel: document.querySelectorAll('#hx-grid .hx-c.is-sel').length,
  };
});
ok('D1 点击后点阵下方展开当日列表', day.open && day.below && day.rows > 0, { open: day.open, below: day.below, rows: day.rows });
ok('D2 每行用主页同款横图胶囊（134×64 附近）', day.caps === day.rows && day.capW >= 120 && day.capH >= 56, { caps: day.caps, rows: day.rows, w: day.capW, h: day.capH });
ok('D3 胶囊封面已水化（不是透明占位）', day.hydrated > 0, { hydrated: day.hydrated, total: day.caps });
ok('D4 列表铺满面板宽度', day.width / day.panelW >= 0.85, { row: day.width, panel: day.panelW });
ok('D5 选中日在点阵上高亮', day.sel === 1, day.sel);

await cell.click();
await page.waitForTimeout(400);
ok('D6 再点同一天收起', await page.evaluate(() => document.querySelector('#hx-day').hidden));

/* ---------- E 多宽度 ---------- */
const widths = [1088, 900];
const rows = [];
for (const w of widths) {
  await page.setViewportSize({ width: w, height: 900 });
  await page.waitForTimeout(500);
  rows.push(await page.evaluate(() => {
    const root = document.querySelector('#hx-root');
    const grid = document.querySelector('#hx-grid');
    return {
      over: document.documentElement.scrollWidth - window.innerWidth,
      fill: +(grid.getBoundingClientRect().width / (root.clientWidth - 26)).toFixed(3),
    };
  }));
}
ok('E1 1088 / 900 无溢出且仍铺满', rows.every((x) => x.over <= 0 && x.fill >= 0.9), rows);

await page.setViewportSize({ width: 390, height: 900 });
await page.waitForTimeout(500);
const narrow = await page.evaluate(() => ({
  over: document.documentElement.scrollWidth - window.innerWidth,
  scrollable: document.querySelector('#hx-root').scrollWidth > document.querySelector('#hx-root').clientWidth,
}));
ok('E2 390 不撑破文档（点阵内部横向滚动）', narrow.over <= 0 && narrow.scrollable, narrow);

const realErrs = errs.filter((s) => !/steamstatic|favicon|Failed to load resource/i.test(s));
ok('F1 零 JS 异常', realErrs.length === 0, realErrs.slice(0, 3));

console.log(`\n===== online112  PASS=${pass} FAIL=${fail} =====`);
await browser.close();
process.exit(fail ? 1 : 0);
