/* verify104.mjs — 第 104 轮：热力图入口收紧（本地回归）
 *
 * 背景：第 103 轮把热力图移入「最近游玩」后，「游戏时长」卡仍留有一个 else 分支，
 * 停在该栏时再点一次会 openDrill(null) 跳进热力图。本轮删掉该分支，
 * 保证导航层面只有「最近游玩」卡能进入热力图。
 *
 * 用法：node tests/verify/verify104.mjs（需先起 127.0.0.1:8895 静态服务）
 */
import { createRequire } from 'module';

const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const LOCAL = 'http://127.0.0.1:8895/index.html';
let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('PASS  ' + name + (extra === undefined ? '' : ' — ' + JSON.stringify(extra))); }
  else { fail++; console.log('FAIL  ' + name + ' — ' + JSON.stringify(extra)); }
};

const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

const snap = () => page.evaluate(() => ({
  active: document.querySelector('.view.active')?.id,
  hash: location.hash,
  detailVisible: !!document.getElementById('lt-detail')?.getClientRects().length,
  cells: document.querySelectorAll('#hx-grid .hx-c').length,
  blocks: document.querySelectorAll('#hx-grid').length,
  overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
}));

await page.goto(LOCAL + '?t=' + Date.now(), { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#lt-list .rank-item', { state: 'visible', timeout: 30000 });
await page.waitForTimeout(1500);

/* ---------- A 版本与结构未变 ---------- */
const a = await page.evaluate(() => ({
  cssV: (document.documentElement.outerHTML.match(/style\.css\?v=(\d+)/) || [])[1],
  appV: (document.documentElement.outerHTML.match(/app\.js\?v=(\d+)/) || [])[1],
  cards: [...document.querySelectorAll('.card-label')].map((e) => e.textContent.trim()),
  views: [...document.querySelectorAll('.view')].map((e) => e.id),
  detailCount: document.querySelectorAll('#lt-detail').length,
  detailParent: document.getElementById('lt-detail')?.parentElement?.id,
  rows: document.querySelectorAll('#lt-list .rank-item').length,
}));
ok('A1 版本参数 CSS 137 / APP 122', a.cssV === '140' && a.appV === '126', { css: a.cssV, app: a.appV });
ok('A2 五张导航卡名称未变', JSON.stringify(a.cards) === JSON.stringify(['游戏时长', '最近游玩', '成就', '游戏库', '数据']), a.cards);
ok('A3 五个视图 id 未变', JSON.stringify(a.views) === JSON.stringify(['view-lifetime', 'view-recent', 'view-ach', 'view-timeline', 'view-data']), a.views);
ok('A4 热力图仍仅一份且归属「最近游玩」', a.detailCount === 1 && a.detailParent === 'view-recent', a);
ok('A5 累计榜仍有数据', a.rows > 0, a.rows);

/* ---------- B 点「游戏时长」卡不再进入热力图 ---------- */
const b0 = await snap();
ok('B1 默认视图是「游戏时长」', b0.active === 'view-lifetime', b0);
await page.click('#card-lifetime');
await page.waitForTimeout(500);
const b1 = await snap();
ok('B2 停在本栏再点该卡，仍停留累计榜', b1.active === 'view-lifetime', b1);
ok('B3 未进入热力图', b1.detailVisible === false, b1);
ok('B4 深链未被改写', b1.hash === b0.hash, { before: b0.hash, after: b1.hash });
await page.click('#card-lifetime');
await page.click('#card-lifetime');
await page.waitForTimeout(400);
const b2 = await snap();
ok('B5 连续点击仍不会跳进热力图', b2.active === 'view-lifetime' && !b2.detailVisible, b2);

/* ---------- C 从其他栏目回到累计榜 ---------- */
await page.click('#card-ach');
await page.waitForTimeout(400);
const c0 = await snap();
ok('C1 先切到成就', c0.active === 'view-ach', c0);
await page.click('#card-lifetime');
await page.waitForTimeout(500);
const c1 = await snap();
ok('C2 点游戏时长卡回到累计榜', c1.active === 'view-lifetime', c1);
ok('C3 未落到热力图且 hash 归位', !c1.detailVisible && c1.hash === '#/lifetime', c1);

/* ---------- D 只有「最近游玩」卡进入热力图 ---------- */
await page.click('#card-recent');
await page.waitForTimeout(900);
const d = await snap();
ok('D1 点最近游玩卡进入热力图', d.active === 'view-recent' && d.detailVisible, d);
ok('D2 一年点阵与格子数据完整（第 111 轮起取代双月块）', d.blocks === 1 && d.cells > 0, d);
ok('D3 深链为 #/recent', d.hash === '#/recent', d);
ok('D4 无横向溢出', d.overflow === 0, d.overflow);

/* ---------- E 从热力图点游戏时长卡只回累计榜 ---------- */
await page.click('#card-lifetime');
await page.waitForTimeout(500);
const e = await snap();
ok('E1 回到累计榜且不在热力图', e.active === 'view-lifetime' && !e.detailVisible && e.hash === '#/lifetime', e);

/* ---------- F 榜单行不可点（第 115 轮：单游戏详情整条线删除） ---------- */
await page.click('#lt-list .rank-item');
await page.waitForTimeout(900);
const f = await snap();
ok('F1 点累计榜行毫无反应（停在累计榜、hash 不变）', f.active === 'view-lifetime' && f.hash === '#/lifetime', f);
ok('F2 页面上没有单游戏详情卡，也没有返回按钮',
  !(await page.evaluate(() => !!document.getElementById('drill-more'))) &&
  !(await page.evaluate(() => !!document.getElementById('btn-drill-back'))), null);

/* ---------- G 连点不同行也无变化 ---------- */
await page.evaluate(() => document.querySelectorAll('#lt-list .rank-item')[1]?.click());
await page.waitForTimeout(500);
const g = await snap();
ok('G1 连点另一行仍停在累计榜', g.active === 'view-lifetime' && g.hash === '#/lifetime', g);

/* ---------- H 旧深链 g/<appid> 只按视图处理 ---------- */
await page.goto(LOCAL + '?t=' + Date.now() + '#/recent/g/431960', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#hx-grid .hx-c', { timeout: 30000 });
await page.waitForTimeout(700);
const h = await snap();
ok('H1 旧深链 #/recent/g/<appid> 落到「最近游玩」总览（365 格、hash 去掉 g 段）',
  h.active === 'view-recent' && h.hash === '#/recent' && h.cells >= 365, h);

ok('Z1 全程零 JS 异常', errs.length === 0, errs.slice(0, 5));
console.log('\n' + pass + ' PASS / ' + fail + ' FAIL');
await browser.close();
if (fail) process.exit(1);
