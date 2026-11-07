/* verify111.mjs — 第 111 轮：游玩热力图改成「一年点阵」（参考听歌统计插件）
   契约：7 行（周一→周日）× N 列（每周一列），一个点 = 一天；
        悬停出气泡（日期 + 当天时长），点击在点阵下方展开当天玩过的游戏；
        深浅四档按「相对本年度峰值」；未采集的日子不可点。
   用法：node tests/verify/verify111.mjs */
import { createRequire } from 'module';
import fs from 'fs';

const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const ROOT = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const LOCAL = 'http://127.0.0.1:8895/index.html';
let pass = 0, fail = 0;
const ok = (n, c, x) => { c ? (pass++, console.log('PASS ', n, x === undefined ? '' : '— ' + JSON.stringify(x))) : (fail++, console.log('FAIL ', n, '— ' + JSON.stringify(x))); };

/* ---------- A 静态 ---------- */
const css = fs.readFileSync(ROOT + 'docs/style.css', 'utf8');
const html = fs.readFileSync(ROOT + 'docs/index.html', 'utf8');
const js = fs.readFileSync(ROOT + 'docs/app.js', 'utf8');
ok('A1 点阵样式存在（.hx-grid / .hx-c / 五档底色）',
  /\.hx-grid\s*\{/.test(css) && /\.hx-c\s*\{/.test(css) && ['l0', 'l1', 'l2', 'l3', 'l4'].every((l) => new RegExp('\\.hx-c\\.' + l + '\\s*\\{').test(css)));
ok('A2 旧「两月并排日历」样式已彻底移除', !/\.heat-mb\s*\{/.test(css) && !/\.heat-cal\s*\{/.test(css) && !/\.heat-pair\s*\{/.test(css));
ok('A3 点阵 7 行（周一→周日）', /\.hx-grid\s*\{[^}]*grid-template-rows:\s*repeat\(7,/.test(css));
ok('A4 气泡与当日列表结构齐全', html.includes('id="hx-tip"') && html.includes('id="hx-day"'));
ok('A5 两套主题各有一套点阵配色', /\[data-theme="cinema"\]\s*\.hx\s*\{/.test(css));
ok('A6 删掉的旧函数不再被引用（stepHeatPage / heatDefaultMonth）',
  !/stepHeatPage|heatDefaultMonth|heatPages|heatRangeLabel/.test(js));

/* ---------- B 运行时 ---------- */
const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
await ctx.addInitScript(() => { try { localStorage.setItem('theme', 'cinema'); } catch (e) {} });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });

await page.goto(LOCAL, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#lt-list .rank-item', { timeout: 40000 });
await page.waitForTimeout(900);
await page.click('#card-recent');
await page.waitForSelector('#hx-grid .hx-c', { timeout: 20000 });
await page.waitForTimeout(700);

const base = await page.evaluate(() => {
  const g = document.querySelector('#hx-grid');
  const cs = getComputedStyle(g);
  const cells = [...document.querySelectorAll('#hx-grid .hx-c')];
  const color = (c) => getComputedStyle(c).backgroundColor;
  const lv = {};
  for (const c of cells) {
    const k = [...c.classList].find((x) => /^l(na|\d)$/.test(x));
    if (!k) continue;
    (lv[k] = lv[k] || new Set()).add(color(c));
  }
  return {
    cells: cells.length,
    rows: cs.gridTemplateRows.split(' ').length,
    cols: cs.gridTemplateColumns.split(' ').length,
    marks: [...document.querySelectorAll('#hx-months .hx-ml')].map((m) => ({ t: m.textContent, col: +getComputedStyle(m).gridColumnStart })),
    size: +cells[0].getBoundingClientRect().width.toFixed(1),
    radius: getComputedStyle(cells[0]).borderRadius,
    colors: Object.fromEntries(Object.entries(lv).map(([k, v]) => [k, [...v]])),
    clickable: cells.filter((c) => c.getAttribute('role') === 'button').length,
    untracked: cells.filter((c) => c.classList.contains('lna')).length,
    year: document.querySelector('#hx-year')?.value,
    options: document.querySelectorAll('#hx-year option').length,
    sum: document.querySelector('#hx-sum')?.textContent?.trim(),
  };
});
ok('B1 一年 365/366 个格子', base.cells >= 365 && base.cells <= 371, base.cells);
ok('B2 网格 7 行 × 53 列', base.rows === 7 && base.cols >= 53 && base.cols <= 54, { rows: base.rows, cols: base.cols });
ok('B3 12 个月份刻度，列位置递增', base.marks.length === 12 && base.marks.every((m, i, a) => i === 0 || m.col > a[i - 1].col), base.marks.map((m) => m.col));
ok('B4 点是圆角小块（≈12px / 圆角 >0）', base.size >= 8 && base.size <= 20 && parseFloat(base.radius) > 0, { size: base.size, radius: base.radius });
ok('B5 深浅四档颜色各不相同', ['l1', 'l2', 'l3', 'l4'].every((k) => base.colors[k]) && new Set(['l1', 'l2', 'l3', 'l4'].map((k) => base.colors[k][0])).size === 4, base.colors);
ok('B6 未采集的日子不可点（无 role）', base.untracked > 0 && base.clickable === base.cells - base.untracked, { untracked: base.untracked, clickable: base.clickable });
ok('B7 年份选择器存在且默认最新数据年', base.year === '2026' && base.options >= 1, { year: base.year, options: base.options });
ok('B8 汇总文案含年份 / 天数 / 峰值 / 合计', /^\d{4} 年 · \d+ 天有记录 · 峰值 .+ · 合计 .+$/.test(base.sum || ''), base.sum);

/* 悬停气泡 */
const cell = page.locator('#hx-grid .hx-c[role="button"]').first();
await cell.hover();
await page.waitForTimeout(350);
const tip = await page.evaluate(() => {
  const t = document.querySelector('#hx-tip');
  const title = document.querySelector('.hx-title').getBoundingClientRect();
  const tr = t.getBoundingClientRect();
  return { hidden: t.hidden, text: t.textContent, aboveTitle: tr.top >= title.bottom, w: Math.round(tr.width) };
});
ok('B9 悬停出气泡，含日期与当天时长', !tip.hidden && /\d{4}年\d{1,2}月\d{1,2}日/.test(tip.text) && /游玩时长：/.test(tip.text), tip.text);
ok('B10 气泡不遮挡面板标题', tip.aboveTitle && tip.w > 80, { top: tip.aboveTitle, w: tip.w });

/* 点击 → 下方展开 */
await cell.click();
await page.waitForTimeout(600);
const day = await page.evaluate(() => {
  const box = document.querySelector('#hx-day');
  const rows = [...box.querySelectorAll('.hx-row')];
  return {
    open: !box.hidden,
    date: box.querySelector('.hx-day-head b')?.textContent,
    sum: box.querySelector('.hx-day-sum')?.textContent,
    rows: rows.length,
    each: rows.every((r) => /\d+\s*(h|min)/.test(r.querySelector('.hx-tt').textContent)),
    below: box.getBoundingClientRect().top > document.querySelector('#hx-grid').getBoundingClientRect().bottom,
    sel: document.querySelectorAll('#hx-grid .hx-c.is-sel').length,
  };
});
ok('B11 点击后下方展开当天列表', day.open && day.below && day.rows > 0, { open: day.open, below: day.below, rows: day.rows });
ok('B12 列表每行都有时长，头部有日期与合计', day.each && /\d{4}年\d{1,2}月\d{1,2}日/.test(day.date || '') && /合计|无游玩/.test(day.sum || ''), { date: day.date, sum: day.sum });
ok('B13 选中的那天在点阵上高亮', day.sel === 1, day.sel);

/* 再点同一天 → 收起 */
await cell.click();
await page.waitForTimeout(400);
const collapsed = await page.evaluate(() => document.querySelector('#hx-day').hidden);
ok('B14 再点同一天收起当日列表', collapsed === true, collapsed);

/* 主题：奶油与影院黑配色不同 */
await page.evaluate(() => { document.documentElement.dataset.theme = 'cream'; });
await page.waitForTimeout(300);
const cream = await page.evaluate(() => getComputedStyle(document.querySelector('#hx-grid .hx-c.l4') || document.querySelector('#hx-grid .hx-c')).backgroundColor);
await page.evaluate(() => { document.documentElement.dataset.theme = 'cinema'; });
await page.waitForTimeout(300);
const cinema = await page.evaluate(() => getComputedStyle(document.querySelector('#hx-grid .hx-c.l4') || document.querySelector('#hx-grid .hx-c')).backgroundColor);
ok('B15 两套主题点阵配色不同', cream !== cinema, { cream, cinema });

/* 窄屏无横向溢出 */
await page.setViewportSize({ width: 390, height: 900 });
await page.waitForTimeout(500);
const narrow = await page.evaluate(() => ({
  over: document.documentElement.scrollWidth - window.innerWidth,
  rows: getComputedStyle(document.querySelector('#hx-grid')).gridTemplateRows.split(' ').length,
}));
ok('B16 390px 无横向溢出且仍为 7 行', narrow.over <= 0 && narrow.rows === 7, narrow);

const realErrs = errs.filter((s) => !/steamstatic|favicon|Failed to load resource/i.test(s));
ok('B17 零 JS 异常', realErrs.length === 0, realErrs.slice(0, 3));

console.log(`\n===== verify111  PASS=${pass} FAIL=${fail} =====`);
await browser.close();
process.exit(fail ? 1 : 0);
