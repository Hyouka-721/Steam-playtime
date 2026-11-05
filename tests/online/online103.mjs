/* online103.mjs — 第 103 轮线上复验（栏目结构调整 + 游戏显示名统一）
 * 用法：Pages 生效后 node tests/online/online103.mjs
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

await page.goto(SITE, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('#lt-list .rank-item', { state: 'visible', timeout: 40000 });
await page.waitForTimeout(1500);

const a = await page.evaluate(() => ({
  cssV: (document.documentElement.outerHTML.match(/style\.css\?v=(\d+)/) || [])[1],
  appV: (document.documentElement.outerHTML.match(/app\.js\?v=(\d+)/) || [])[1],
  bootName: window.__BOOT?.meta?.games_lifetime?.['431960']?.name,
  hasChinese: document.body.innerText.includes('壁纸引擎'),
  detailCount: document.querySelectorAll('#lt-detail').length,
  detailParent: document.getElementById('lt-detail')?.parentElement?.id,
  recentList: document.querySelectorAll('#recent-list').length,
  recentRows: document.querySelectorAll('#view-recent .rank-item').length,
  lifetimeRows: document.querySelectorAll('#lt-list .rank-item').length,
  cards: [...document.querySelectorAll('.card-label')].map((e) => e.textContent.trim()),
}));
ok('A1 线上版本 style.css?v=130 / app.js?v=117', a.cssV === '130' && a.appV === '117', { css: a.cssV, app: a.appV });
ok('A2 线上显示名 Wallpaper Engine', a.bootName === 'Wallpaper Engine', a.bootName);
ok('A3 线上无「壁纸引擎」残留', a.hasChinese === false);
ok('A4 热力图仅一份且归属「最近游玩」', a.detailCount === 1 && a.detailParent === 'view-recent', { n: a.detailCount, parent: a.detailParent });
ok('A5 最近14天榜单及记录已删除', a.recentList === 0 && a.recentRows === 0, { box: a.recentList, rows: a.recentRows });
ok('A6 累计榜仍在', a.lifetimeRows > 0, a.lifetimeRows);
ok('A7 五张卡名称未变', JSON.stringify(a.cards) === JSON.stringify(['游戏时长', '最近游玩', '成就', '游戏库', '数据']), a.cards);

await page.click('#card-recent');
await page.waitForTimeout(900);
const c = await page.evaluate(() => ({
  active: document.querySelector('.view.active')?.id,
  visible: !!document.getElementById('lt-detail')?.getClientRects().length,
  blocks: document.querySelectorAll('#heat-drill .heat-mb').length,
  cells: document.querySelectorAll('#heat-drill .hc').length,
  sum: document.getElementById('heat-sum')?.textContent?.trim(),
  overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
}));
ok('B1 线上「最近游玩」显示热力图', c.active === 'view-recent' && c.visible, { active: c.active, visible: c.visible });
ok('B2 双月块 / 格子 / 汇总完整', c.blocks === 2 && c.cells > 0 && /共 \d+ 天有记录/.test(c.sum || ''), { blocks: c.blocks, cells: c.cells, sum: c.sum });
ok('B3 无横向溢出', c.overflow === 0, c.overflow);

const live = page.locator('#heat-drill .hc.is-live').first();
if (await live.count()) {
  await live.click();
  await page.waitForTimeout(700);
  const day = await page.evaluate(() => !document.getElementById('cal-overlay').hidden);
  ok('B4 线上点格子打开当日明细', day);
  await page.click('#cal-day-close');
  await page.waitForTimeout(300);
}
await page.click('#btn-drill-back');
await page.waitForTimeout(450);
ok('B5 线上返回按钮回「游戏时长」', (await page.evaluate(() => document.querySelector('.view.active')?.id)) === 'view-lifetime');

await page.locator('#lt-list .rank-item').first().click();
await page.waitForTimeout(700);
const d = await page.evaluate(() => ({ active: document.querySelector('.view.active')?.id, hash: location.hash }));
ok('B6 线上点行切到热力图且深链正确', d.active === 'view-recent' && /#\/recent\/g\/\d+/.test(d.hash), d);
ok('B7 线上无 JS 异常', errs.length === 0, errs);

console.log('\n===== online103 ' + pass + '/' + (pass + fail) + ' PASS，FAIL=' + fail + ' =====');
await browser.close();
if (fail) process.exit(1);
