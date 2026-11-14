/* verify113.mjs — 第 113 轮：死码清理 + 点阵行距收紧 + 点开当天不再整页跳动
   契约：
     ① 旧的「当日明细浮层」（#cal-overlay / openDayDetail / closeCal / stepCalDay）彻底删除；
     ② 点阵行距 = 列距 × 0.5（列距不动），矩阵仍是 7 行 × 53 周列 + 11 间隙列；
     ③ 点某天展开列表后页面不滚（只有列表头完全在视口外时才轻推）；
     ④ 年视图不再有「期内合计 / 有记录」两张卡，下钻游戏的详情卡照旧。
   用法：node tests/index/verify113.mjs */
import { createRequire } from 'module';
import fs from 'fs';

const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const ROOT = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const LOCAL = 'http://127.0.0.1:8895/index.html';
let pass = 0, fail = 0;
const ok = (n, c, x) => { c ? (pass++, console.log('PASS ', n, x === undefined ? '' : '— ' + JSON.stringify(x))) : (fail++, console.log('FAIL ', n, '— ' + JSON.stringify(x))); };

/* ---------- A 静态：死码是否真的没了 ---------- */
const css = fs.readFileSync(ROOT + 'docs/style.css', 'utf8');
const html = fs.readFileSync(ROOT + 'docs/index.html', 'utf8');
const js = fs.readFileSync(ROOT + 'docs/app.js', 'utf8');

const deadFns = ['openDayDetail', 'closeCal', 'stepCalDay', 'openCalDay', 'renderCalDay',
  'calDayGames', 'calDayRange', 'syncCalDayNav', 'setDayStatus', 'setCalBusy', 'markHeatSel', 'onCalKey', 'hmText'];
const leftFns = deadFns.filter((f) => new RegExp('\\b' + f + '\\b').test(js));
ok('A1 浮层相关函数已全部删除', leftFns.length === 0, leftFns);
ok('A2 源码无 cal-overlay / cal-day / state.cal 残留',
  !/cal-overlay|cal-day|cal-panel|state\.cal\b/.test(js) && !/cal-overlay/.test(html) && !/\.cal-(overlay|panel|backdrop|games|step)\s*[\{,]/.test(css));
ok('A3 版本参数 CSS 137 / APP 122', html.includes('style.css?v=142') && html.includes('app.js?v=127'),
  { css: (html.match(/style\.css\?v=(\d+)/) || [])[1], app: (html.match(/app\.js\?v=(\d+)/) || [])[1] });

/* ---------- B 运行时 ---------- */
const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const errs = [];

async function open(height) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height }, serviceWorkers: 'block' });
  await ctx.addInitScript(() => { try { localStorage.setItem('theme', 'cinema'); } catch (e) {} });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(LOCAL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#lt-list .rank-item', { timeout: 40000 });
  await page.waitForTimeout(800);
  await page.click('#card-recent');
  await page.waitForSelector('#hx-grid .hx-c', { timeout: 20000 });
  await page.waitForTimeout(600);
  return { ctx, page };
}

const { ctx, page } = await open(900);

/* B1 浮层节点已从 DOM 消失 */
const gone = await page.evaluate(() => ({
  overlay: !!document.getElementById('cal-overlay'),
  calNodes: document.querySelectorAll('[class*="cal-"]').length,
}));
ok('B1 DOM 里没有 #cal-overlay 与 .cal-* 节点', !gone.overlay && gone.calNodes === 0, gone);

/* B2 年视图不再挂「期内合计 / 有记录」 */
const yearView = await page.evaluate(() => ({
  more: (document.getElementById('drill-more')?.innerHTML || '').trim().length,
  kv: document.querySelectorAll('#drill-more .dm-kv').length,
  txt: document.getElementById('lt-detail')?.textContent || '',
}));
ok('B2 年视图 #drill-more 为空（无期内合计 / 有记录）',
  yearView.more === 0 && yearView.kv === 0 && !/期内合计/.test(yearView.txt) && !/有记录/.test(yearView.txt.replace(/\d+ 天有记录/g, '')),
  { len: yearView.more, kv: yearView.kv, hasSum: /期内合计/.test(yearView.txt) });

/* B3 行距 = 列距 × 0.5 */
const geo = await page.evaluate(() => {
  const grid = document.getElementById('hx-grid');
  const cs = getComputedStyle(grid);
  const cells = [...grid.querySelectorAll('.hx-c')];
  const r = (i) => cells[i].getBoundingClientRect();
  const rowPitch = r(1).top - r(0).top;      // 同列下一行
  const colPitch = r(7).left - r(0).left;    // 下一列同一行
  return {
    rowGap: parseFloat(cs.rowGap), colGap: parseFloat(cs.columnGap),
    cell: +r(0).height.toFixed(2),
    rowPitch: +rowPitch.toFixed(2), colPitch: +colPitch.toFixed(2),
    rows: cs.gridTemplateRows.split(' ').length,
    cols: cs.gridTemplateColumns.split(' ').length,
    cells: cells.length,
    fill: +(grid.getBoundingClientRect().width / (document.getElementById('hx-root').clientWidth - 26)).toFixed(3),
  };
});
ok('B3 行距恰为列距的一半', Math.abs(geo.rowGap / geo.colGap - 0.5) < 0.02, { rowGap: geo.rowGap, colGap: geo.colGap, ratio: +(geo.rowGap / geo.colGap).toFixed(3) });
ok('B4 实测行间距 < 列间距（矩阵更紧密）', geo.rowPitch < geo.colPitch - 1, { rowPitch: geo.rowPitch, colPitch: geo.colPitch });
ok('B5 点阵结构未变：7 行 × 64 列 / 365+ 格 / 铺满',
  geo.rows === 7 && geo.cols === 64 && geo.cells >= 365 && geo.fill >= 0.98, geo);

/* B6 点某天：展开但不滚动（1440×900，列表本来就在视野里） */
const before = await page.evaluate(() => window.scrollY);
const target = page.locator('#hx-grid .hx-c[role="button"]').nth(4);
await target.click();
await page.waitForTimeout(700);
const opened = await page.evaluate(() => ({
  scrollY: window.scrollY,
  open: !document.getElementById('hx-day').hidden,
  rows: document.querySelectorAll('#hx-day .hx-row').length,
  headTop: document.querySelector('#hx-day .hx-day-head')?.getBoundingClientRect().top,
}));
ok('B6 点当天展开列表且页面不滚动', opened.open && opened.rows > 0 && opened.scrollY === before, { before, ...opened });

/* B7 Esc 收起（浮层没了以后 Esc 只收起当日列表） */
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
ok('B7 Esc 收起当日列表', await page.evaluate(() => document.getElementById('hx-day').hidden) === true);

/* B8 再次点击同一天两次：展开 → 收起 */
await target.click();
await page.waitForTimeout(400);
const again = await page.evaluate(() => !document.getElementById('hx-day').hidden);
await target.click();
await page.waitForTimeout(400);
const closed = await page.evaluate(() => document.getElementById('hx-day').hidden);
ok('B8 同一天再点一次即收起', again === true && closed === true, { again, closed });

/* B9 第 115 轮：单游戏详情整条线删除，点行不再有任何下钻 */
await page.click('#card-lifetime');
await page.waitForTimeout(500);
await page.click('#lt-list .rank-item');
await page.waitForTimeout(800);
const drill = await page.evaluate(() => ({
  view: document.querySelector('.view.active')?.id,
  hash: location.hash,
  drillMore: !!document.getElementById('drill-more'),
  back: !!document.getElementById('btn-drill-back'),
}));
ok('B9 点累计榜行不再下钻（无详情卡 / 无返回按钮 / 停在累计榜）',
  drill.view === 'view-lifetime' && drill.hash === '#/lifetime' && !drill.drillMore && !drill.back, drill);

/* B10 视口矮（1440×700）：列表头仍在视野内 → 依然不滚 */
await ctx.close();
const low = await open(700);
const b2 = await low.page.evaluate(() => window.scrollY);
await low.page.locator('#hx-grid .hx-c[role="button"]').nth(4).click();
await low.page.waitForTimeout(700);
const lowRes = await low.page.evaluate(() => ({
  scrollY: window.scrollY,
  open: !document.getElementById('hx-day').hidden,
  headVisible: (document.querySelector('#hx-day .hx-day-head')?.getBoundingClientRect().top ?? 1e9) < window.innerHeight,
}));
ok('B10 1440×700 点开后列表头在视野内 → 页面一像素都不滚',
  lowRes.open && lowRes.headVisible && lowRes.scrollY === b2, { before: b2, ...lowRes });

/* B11 390 窄屏无横向溢出 */
await low.page.setViewportSize({ width: 390, height: 900 });
await low.page.waitForTimeout(500);
const narrow = await low.page.evaluate(() => ({
  over: document.documentElement.scrollWidth - window.innerWidth,
  rows: getComputedStyle(document.getElementById('hx-grid')).gridTemplateRows.split(' ').length,
}));
ok('B11 390px 无横向溢出且仍 7 行', narrow.over <= 0 && narrow.rows === 7, narrow);

const realErrs = errs.filter((s) => !/steamstatic|favicon|Failed to load resource/i.test(s));
ok('B12 零 JS 异常', realErrs.length === 0, realErrs.slice(0, 3));

console.log(`\n===== verify113  PASS=${pass} FAIL=${fail} =====`);
await browser.close();
process.exit(fail ? 1 : 0);
