/* verify114.mjs — 第 114 轮：删掉「单个游戏」下的点阵，只保留「最近游玩」的总点阵
   契约：
     ① 总览（最近游玩）：一年点阵照旧 365 格 / 7 行 / 64 列，概览小字与年份下拉都在；
     ② 下钻某款游戏：整块点阵隐藏且不渲染任何格子，概览 / 年份下拉 / 当日列表一并隐藏，
        面板标题换成游戏名，只留「← 返回 + 该游戏详情卡（占比 / 期段 / 成就）」；
     ③ 返回或再进「最近游玩」时点阵完整复原；
     ④ 深链 #/recent/g/<appid> 直达该游戏详情，同样没有点阵。
   用法：node tests/verify/verify114.mjs */
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
const js = fs.readFileSync(ROOT + 'docs/app.js', 'utf8');
const html = fs.readFileSync(ROOT + 'docs/index.html', 'utf8');
ok('A1 版本参数 CSS 138 / APP 123', html.includes('style.css?v=138') && html.includes('app.js?v=123'),
  { css: (html.match(/style\.css\?v=(\d+)/) || [])[1], app: (html.match(/app\.js\?v=(\d+)/) || [])[1] });
ok('A2 有 .is-drill 隐藏规则（点阵 / 概览 / 年份下拉 / 当日列表四件）',
  /#lt-detail\.is-drill \.hx,[\s\S]{0,240}#lt-detail\.is-drill #hx-day\s*\{\s*display:\s*none/.test(css));
ok('A3 renderDrill 里有下钻分支且会清空格子', /is-drill/.test(js) && /const drilling = !!appid;/.test(js) && /grid\.innerHTML = '';/.test(js));
ok('A4 年份下拉容器带 .ctrl-year（供隐藏）', html.includes('class="ctrl ctrl-year"'));

/* ---------- B 运行时 ---------- */
const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
await ctx.addInitScript(() => { try { localStorage.setItem('theme', 'cinema'); } catch (e) {} });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });

const snap = () => page.evaluate(() => {
  const det = document.getElementById('lt-detail');
  const root = document.getElementById('hx-root');
  const vis = (el) => !!el && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden';
  return {
    active: document.querySelector('.view.active')?.id,
    isDrill: det.classList.contains('is-drill'),
    title: (det.querySelector('.hx-title')?.textContent || '').trim(),
    cells: document.querySelectorAll('#hx-grid .hx-c').length,
    rows: getComputedStyle(document.getElementById('hx-grid')).gridTemplateRows.split(' ').filter(Boolean).length,
    cols: getComputedStyle(document.getElementById('hx-grid')).gridTemplateColumns.split(' ').filter(Boolean).length,
    hx: vis(root),
    sum: vis(document.getElementById('hx-sum')),
    year: vis(document.querySelector('.ctrl-year')),
    day: vis(document.getElementById('hx-day')),
    back: vis(document.getElementById('btn-drill-back')),
    share: !!document.querySelector('#drill-more .dm-share'),
    kv: document.querySelectorAll('#drill-more .dm-kv').length,
    moreLen: (document.getElementById('drill-more')?.innerHTML || '').trim().length,
    over: document.documentElement.scrollWidth - window.innerWidth,
  };
});

await page.goto(LOCAL + '?t=' + Date.now(), { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#lt-list .rank-item', { state: 'visible', timeout: 40000 });
await page.waitForTimeout(1200);
await page.click('#card-recent');
await page.waitForTimeout(900);

const total = await snap();
ok('B1 总览：点阵 365 格 / 7 行 / 64 列，概览与年份下拉都在',
  total.cells >= 365 && total.rows === 7 && total.cols === 64 && total.hx && total.sum && total.year && !total.isDrill,
  { cells: total.cells, rows: total.rows, cols: total.cols, hx: total.hx, sum: total.sum, year: total.year });
ok('B2 总览标题仍是「游玩热力图」且没有详情卡',
  total.title === '游玩热力图' && total.moreLen === 0, { title: total.title, more: total.moreLen });

/* 下钻一个具体游戏 */
const gameName = await page.evaluate(() => document.querySelector('#lt-list .rank-item .rank-name')?.textContent?.trim());
await page.click('#card-lifetime');
await page.waitForTimeout(500);
await page.click('#lt-list .rank-item');
await page.waitForTimeout(1400);
const drill = await snap();
ok('B3 下钻：一个格子都不渲染，整块点阵 / 概览 / 年份下拉 / 当日列表全隐藏',
  drill.cells === 0 && !drill.hx && !drill.sum && !drill.year && !drill.day && drill.isDrill,
  { cells: drill.cells, hx: drill.hx, sum: drill.sum, year: drill.year, day: drill.day, isDrill: drill.isDrill });
ok('B4 下钻：标题换成游戏名，只留返回按钮 + 该游戏详情卡',
  drill.title.length > 0 && drill.title !== '游玩热力图' && drill.back && drill.share && drill.kv >= 3,
  { title: drill.title, back: drill.back, share: drill.share, kv: drill.kv, expect: gameName });
ok('B5 下钻时页面无横向溢出', drill.over <= 0, drill.over);

/* 返回 → 再进最近游玩：点阵复原 */
await page.click('#btn-drill-back');
await page.waitForTimeout(600);
await page.click('#card-recent');
await page.waitForTimeout(900);
const restored = await snap();
ok('B6 返回后再进「最近游玩」：点阵完整复原（365 格、标题与控件复位、is-drill 摘掉）',
  restored.cells >= 365 && restored.hx && restored.sum && restored.year && restored.title === '游玩热力图' && !restored.isDrill,
  { cells: restored.cells, hx: restored.hx, title: restored.title, isDrill: restored.isDrill });

/* 来回两轮，确认没有残留 */
await page.click('#card-lifetime');
await page.waitForTimeout(400);
await page.click('#lt-list .rank-item');
await page.waitForTimeout(1000);
await page.click('#btn-drill-back');
await page.waitForTimeout(400);
await page.click('#card-recent');
await page.waitForTimeout(900);
const twice = await snap();
ok('B7 下钻 ↔ 总览来回两轮后仍稳定（无残留 is-drill / 格子仍齐全）',
  twice.cells >= 365 && !twice.isDrill && twice.hx && twice.title === '游玩热力图',
  { cells: twice.cells, isDrill: twice.isDrill, title: twice.title });

/* 深链直达 */
await page.goto(LOCAL + '?t=' + Date.now() + '#/recent/g/431960', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#drill-more .dm-share', { timeout: 40000 });
await page.waitForTimeout(1000);
const deep = await snap();
ok('B8 深链 #/recent/g/<appid> 直达该游戏详情，同样没有点阵',
  deep.active === 'view-recent' && deep.cells === 0 && !deep.hx && deep.isDrill && deep.share && deep.title !== '游玩热力图',
  { active: deep.active, cells: deep.cells, hx: deep.hx, title: deep.title });

/* 390 窄屏 */
await page.setViewportSize({ width: 390, height: 900 });
await page.waitForTimeout(600);
const narrow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
ok('B9 390px 下钻视图无横向溢出', narrow <= 0, narrow);

const realErrs = errs.filter((s) => !/steamstatic|favicon|Failed to load resource/i.test(s));
ok('B10 零 JS 异常', realErrs.length === 0, realErrs.slice(0, 3));

console.log(`\n===== verify114  PASS=${pass} FAIL=${fail} =====`);
await browser.close();
process.exit(fail ? 1 : 0);
