/* online104.mjs — 第 104 轮线上复验：热力图入口收紧
 *
 * 背景：第 103 轮把热力图移入「最近游玩」后，「游戏时长」卡仍留有一个 else 分支，
 * 停在该栏时再点一次会 openDrill(null) 跳进热力图。第 104 轮删掉该分支，
 * 保证导航层面只有「最近游玩」卡能进入热力图。
 *
 * 用法：Pages 生效后 node tests/online/online104.mjs
 * 与 verify104 保持同一套行为判据，另加线上 JS 静态取证。
 */
import { createRequire } from 'module';

const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const SITE = 'https://hyouka-721.github.io/Steam-playtime/';
let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('PASS  ' + name + (extra === undefined ? '' : ' — ' + JSON.stringify(extra))); }
  else { fail++; console.log('FAIL  ' + name + ' — ' + JSON.stringify(extra)); }
};

const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

const snap = () => page.evaluate(() => ({
  active: document.querySelector('.view.active')?.id,
  hash: location.hash,
  detailVisible: !!document.getElementById('lt-detail')?.getClientRects().length,
  cells: document.querySelectorAll('#heat-drill .hc').length,
  blocks: document.querySelectorAll('#heat-drill .heat-mb').length,
  overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
}));

await page.goto(SITE + '?t=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('#lt-list .rank-item', { state: 'visible', timeout: 40000 });
await page.waitForTimeout(1500);

/* ---------- A 线上版本与结构未变 ---------- */
const a = await page.evaluate(() => ({
  cssV: (document.documentElement.outerHTML.match(/style\.css\?v=(\d+)/) || [])[1],
  appV: (document.documentElement.outerHTML.match(/app\.js\?v=(\d+)/) || [])[1],
  cards: [...document.querySelectorAll('.card-label')].map((e) => e.textContent.trim()),
  views: [...document.querySelectorAll('.view')].map((e) => e.id),
  detailCount: document.querySelectorAll('#lt-detail').length,
  detailParent: document.getElementById('lt-detail')?.parentElement?.id,
  rows: document.querySelectorAll('#lt-list .rank-item').length,
}));
ok('A1 线上版本 CSS 132 / APP 119', a.cssV === '132' && a.appV === '119', { css: a.cssV, app: a.appV });
ok('A2 五张导航卡名称未变', JSON.stringify(a.cards) === JSON.stringify(['游戏时长', '最近游玩', '成就', '游戏库', '数据']), a.cards);
ok('A3 五个视图 id 未变', JSON.stringify(a.views) === JSON.stringify(['view-lifetime', 'view-recent', 'view-ach', 'view-timeline', 'view-data']), a.views);
ok('A4 热力图仍仅一份且归属「最近游玩」', a.detailCount === 1 && a.detailParent === 'view-recent', a);
ok('A5 累计榜仍有数据', a.rows > 0, a.rows);

/* 线上静态取证：新版本 app.js 里不得残留 openDrill(null) 这条遗留入口 */
const src = await page.evaluate(async () => {
  const el = document.querySelector('script[src*="app.js"]');
  if (!el) return null;
  const r = await fetch(el.src, { cache: 'no-store' });
  return r.ok ? await r.text() : null;
});
ok('A6 线上 app.js 已加载且不含 openDrill(null)', !!src && !src.includes('openDrill(null)'), { len: src ? src.length : null });

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
ok('D2 双月块与格子数据完整', d.blocks === 2 && d.cells > 0, d);
ok('D3 深链为 #/recent', d.hash === '#/recent', d);
ok('D4 无横向溢出', d.overflow === 0, d.overflow);

/* ---------- E 从热力图点游戏时长卡只回累计榜 ---------- */
await page.click('#card-lifetime');
await page.waitForTimeout(500);
const e = await snap();
ok('E1 回到累计榜且不在热力图', e.active === 'view-lifetime' && !e.detailVisible && e.hash === '#/lifetime', e);

/* ---------- F 内容层下钻仍保留（点榜单行 = 查看该游戏热力图） ---------- */
await page.locator('#lt-list .rank-item').first().click();
await page.waitForTimeout(900);
const f = await snap();
ok('F1 点累计榜行仍可进入带筛选的热力图', f.active === 'view-recent' && /#\/recent\/g\/\d+/.test(f.hash), f);
ok('F2 下钻后热力图有数据', f.cells > 0, f);

/* ---------- G 返回按钮 ---------- */
await page.click('#btn-drill-back');
await page.waitForTimeout(600);
const g = await snap();
ok('G1 返回按钮回累计榜', g.active === 'view-lifetime' && g.hash === '#/lifetime', g);

/* ---------- H 深链直达仍可用 ---------- */
await page.goto(SITE + '?t=' + Date.now() + '#/recent/g/431960', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('#heat-drill .hc', { timeout: 40000 });
await page.waitForTimeout(700);
const h = await snap();
ok('H1 深链直达带筛选热力图', h.active === 'view-recent' && /#\/recent\/g\/\d+/.test(h.hash) && h.cells > 0, h);

ok('Z1 全程零 JS 异常', errs.length === 0, errs.slice(0, 5));
console.log('\n===== online104 ' + pass + '/' + (pass + fail) + ' PASS，FAIL=' + fail + ' =====');
await browser.close();
if (fail) process.exit(1);
