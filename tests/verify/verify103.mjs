/* verify103.mjs — 第 103 轮：栏目结构调整 + 游戏显示名统一（本地回归）
 *
 * 背景：本轮把「游戏热力图」从「游戏时长」整块移入「最近游玩」，并删除后者原有的
 * 「最近14天游玩记录」模块。verify47/48/49/88/90 断言的是旧结构（等 #recent-list、
 * 或在默认 lifetime 视图里量热力图），按惯例留档不动、不调阈值；本套件守新结构。
 *
 * 用法：node tests/verify/verify103.mjs（需先起 127.0.0.1:8895 静态服务）
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

await page.goto(LOCAL + '?t=' + Date.now(), { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#lt-list .rank-item', { state: 'visible', timeout: 30000 });
await page.waitForTimeout(1500);

/* ---------- A 名称与版本 ---------- */
const a = await page.evaluate(() => ({
  cssV: (document.documentElement.outerHTML.match(/style\.css\?v=(\d+)/) || [])[1],
  appV: (document.documentElement.outerHTML.match(/app\.js\?v=(\d+)/) || [])[1],
  bootName: window.__BOOT?.meta?.games_lifetime?.['431960']?.name,
  pageNames: [...document.querySelectorAll('#lt-list .rank-name')].map((e) => e.textContent.trim()),
  hasChinese: document.body.innerText.includes('壁纸引擎'),
  cards: [...document.querySelectorAll('.card-label')].map((e) => e.textContent.trim()),
  views: [...document.querySelectorAll('.view')].map((e) => e.id),
}));
ok('A1 版本参数 CSS 137 / APP 122', a.cssV === '139' && a.appV === '125', { css: a.cssV, app: a.appV });
ok('A2 显示名改为 Wallpaper Engine', a.bootName === 'Wallpaper Engine', a.bootName);
ok('A3 页面无「壁纸引擎」残留', a.hasChinese === false);
ok('A4 榜单里确有一行 Wallpaper Engine', a.pageNames.some((n) => n.startsWith('Wallpaper Engine')), a.pageNames.filter((n) => /Wallpaper/i.test(n)));
ok('A5 五张导航卡名称未变', JSON.stringify(a.cards) === JSON.stringify(['游戏时长', '最近游玩', '成就', '游戏库', '数据']), a.cards);
ok('A6 五个视图 id 未变', JSON.stringify(a.views) === JSON.stringify(['view-lifetime', 'view-recent', 'view-ach', 'view-timeline', 'view-data']), a.views);

/* ---------- B 目录结构 ---------- */
const b = await page.evaluate(() => ({
  detailCount: document.querySelectorAll('#lt-detail').length,
  detailParent: document.getElementById('lt-detail')?.parentElement?.id,
  detailHidden: document.getElementById('lt-detail')?.hidden,
  recentList: document.querySelectorAll('#recent-list').length,
  recentRows: document.querySelectorAll('#view-recent .rank-item').length,
  lifetimeRows: document.querySelectorAll('#lt-list .rank-item').length,
  active: document.querySelector('.view.active')?.id,
  cardRecent: document.getElementById('c-recent')?.textContent?.trim(),
}));
ok('B1 热力图全站仅一份（原位置无副本）', b.detailCount === 1, b.detailCount);
ok('B2 热力图归属「最近游玩」目录', b.detailParent === 'view-recent', b.detailParent);
ok('B3 热力图不再 hidden', b.detailHidden === false, b.detailHidden);
ok('B4 最近14天榜单容器已删除', b.recentList === 0, b.recentList);
ok('B5 「最近游玩」下无任何榜单记录', b.recentRows === 0, b.recentRows);
ok('B6 「游戏时长」累计榜仍在', b.lifetimeRows > 0, b.lifetimeRows);
ok('B7 默认视图仍是「游戏时长」', b.active === 'view-lifetime', b.active);
ok('B8 「最近游玩」概览卡仍有值', /h/.test(b.cardRecent || ''), b.cardRecent);

/* ---------- C 热力图内容与数据 ---------- */
await page.click('#card-recent');
await page.waitForTimeout(800);
const c = await page.evaluate(() => ({
  active: document.querySelector('.view.active')?.id,
  visible: !!document.getElementById('lt-detail')?.getClientRects().length,
  blocks: document.querySelectorAll('#hx-grid').length,
  headsA: document.querySelectorAll('#hx-months .hx-ml').length,
  headsB: 0,   // 第 111 轮：一年一块点阵，不再有第二份月份头
  cells: document.querySelectorAll('#hx-grid .hx-c').length,
  sum: document.getElementById('hx-sum')?.textContent?.trim(),
  overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  hash: location.hash,
}));
ok('C1 切到「最近游玩」视图', c.active === 'view-recent', c.active);
ok('C2 热力图可见', c.visible);
ok('C3 一年一块点阵（第 111 轮起取代双月块）', c.blocks === 1, c.blocks);
ok('C4 月份刻度齐 12 个', c.headsA === 12 && c.headsB === 0, { a: c.headsA, b: c.headsB });
ok('C5 热力图格子有数据', c.cells > 0, c.cells);
ok('C6 汇总文案保留（新口径）', /天有记录/.test(c.sum || ''), c.sum);
ok('C7 无横向溢出', c.overflow === 0, c.overflow);
ok('C8 深链切到 #/recent', c.hash === '#/recent', c.hash);

/* ---------- D 交互未退化 ---------- */
const liveCell = page.locator('#hx-grid .hx-c[role="button"]').first();
ok('D1 存在可点格子', (await liveCell.count()) > 0);
if (await liveCell.count()) {
  await liveCell.click();
  await page.waitForTimeout(700);
  /* 第 111 轮：点格子不再开浮层，改成在点阵下方展开当日游戏列表 */
  const day = await page.evaluate(() => ({
    open: !document.getElementById('hx-day').hidden,
    title: document.querySelector('#hx-day .hx-day-head b')?.textContent?.trim(),
    rows: document.querySelectorAll('#hx-day .hx-row').length,
  }));
  ok('D2 点格子下方展开当日游戏列表', day.open && !!day.title && day.rows > 0, day);
  await page.click('#hx-day .hx-day-x');
  await page.waitForTimeout(300);
}
await page.click('#card-lifetime');
await page.waitForTimeout(500);
ok('D3 点「游戏时长」卡回到累计榜（返回按钮第 115 轮已删除）',
  (await page.evaluate(() => document.querySelector('.view.active')?.id)) === 'view-lifetime');

const dBefore = await page.evaluate(() => ({ view: document.querySelector('.view.active')?.id, hash: location.hash }));
await page.locator('#lt-list .rank-item').first().click();
await page.waitForTimeout(700);
const d = await page.evaluate(() => ({
  active: document.querySelector('.view.active')?.id,
  cells: document.querySelectorAll('#hx-grid .hx-c').length,
  drillMore: !!document.getElementById('drill-more'),
  backBtn: !!document.getElementById('btn-drill-back'),
  cursor: getComputedStyle(document.querySelector('#lt-list .rank-item')).cursor,
  hash: location.hash,
}));
/* 第 115 轮（用户：「从累计榜点进某款游戏时没反应，不可点击」）：整行不再可点 */
ok('D4 点累计榜行毫无反应（不切视图 / 不改 hash / 非 pointer 光标）',
  d.active === dBefore.view && d.hash === dBefore.hash && d.cursor !== 'pointer',
  { before: dBefore, ...d });
ok('D5 单游戏详情整条线已删除（无 #drill-more / 无返回按钮）', !d.drillMore && !d.backBtn, { more: d.drillMore, back: d.backBtn });

for (const [card, view] of [['#card-ach', 'view-ach'], ['#card-games', 'view-timeline'], ['#card-data', 'view-data'], ['#card-lifetime', 'view-lifetime']]) {
  await page.click(card);
  await page.waitForTimeout(260);
  const v = await page.evaluate(() => document.querySelector('.view.active')?.id);
  ok('D6 其他栏目切换正常 ' + card, v === view, v);
}
ok('D7 全程无 JS 异常', errs.length === 0, errs);

console.log('\n===== 第103轮 ' + pass + '/' + (pass + fail) + ' PASS，FAIL=' + fail + ' =====');
await browser.close();
if (fail) process.exit(1);
