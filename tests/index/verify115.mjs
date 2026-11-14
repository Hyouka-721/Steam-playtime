/* verify115.mjs — 第 115 轮：把「下钻单个游戏」整条线删干净
   契约：
     ① 累计榜整行不再可点（光标非 pointer、点击不切视图、不改 hash）；
     ② 单游戏详情整块不存在：无 #drill-more、无 #btn-drill-back、无 .dm-* / .is-drill 规则；
     ③ 勋章墙徽章也不再是可点按钮（转成 <div>，无 cursor:pointer / hover 上浮）；
     ④ 旧的 #/recent/g/<appid> 深链只按视图处理，落到总览；
     ⑤ 「最近游玩」总点阵与点格子展开当日列表**完全不受影响**。
   用法：node tests/index/verify115.mjs */
import { createRequire } from 'module';
import fs from 'fs';

const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const ROOT = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const LOCAL = 'http://127.0.0.1:8895/index.html';
let pass = 0, fail = 0;
const ok = (n, c, x) => { c ? (pass++, console.log('PASS ', n, x === undefined ? '' : '— ' + JSON.stringify(x))) : (fail++, console.log('FAIL ', n, '— ' + JSON.stringify(x))); };

/* ---------- A 静态：源码 / DOM / CSS 三层都该干净 ---------- */
const css = fs.readFileSync(ROOT + 'docs/style.css', 'utf8');
const js = fs.readFileSync(ROOT + 'docs/app.js', 'utf8');
const html = fs.readFileSync(ROOT + 'docs/index.html', 'utf8');

ok('A1 版本参数 CSS 139 / APP 124', html.includes('style.css?v=142') && html.includes('app.js?v=127'),
  { css: (html.match(/style\.css\?v=(\d+)/) || [])[1], app: (html.match(/app\.js\?v=(\d+)/) || [])[1] });
const deadJs = ['openDrill', 'closeDrill', 'renderDrillMore', 'drill.appid', 'drill-more', "id === 'g'"].filter((k) => new RegExp(k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(js));
ok('A2 app.js 里没有下钻相关标识符', deadJs.length === 0, deadJs);
ok('A3 index.html 无 #drill-more / #btn-drill-back',
  !/id="drill-more"/.test(html) && !/btn-drill-back/.test(html));
ok('A4 style.css 无 .drill-more / .dm-* / .is-drill / .btn-back 规则',
  !/\.drill-more\s*\{/.test(css) && !/\.dm-(head|share|kv|ach|row|name|pct|date|empty)\s*[{,]/.test(css) &&
  !/\.is-drill/.test(css) && !/\.btn-back/.test(css));
ok('A5 榜单行与徽章都不再是 pointer 光标',
  !/\.rank-item\s*\{[^}]*cursor:\s*pointer/.test(css) && !/\.badge\s*\{[^}]*cursor:\s*pointer/.test(css));

/* ---------- B 运行时 ---------- */
const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
await ctx.addInitScript(() => { try { localStorage.setItem('theme', 'cinema'); } catch (e) {} });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });

const snap = () => page.evaluate(() => ({
  view: document.querySelector('.view.active')?.id,
  hash: location.hash,
  cells: document.querySelectorAll('#hx-grid .hx-c').length,
  cursor: document.querySelector('#lt-list .rank-item') ? getComputedStyle(document.querySelector('#lt-list .rank-item')).cursor : null,
  drillMore: !!document.getElementById('drill-more'),
  back: !!document.getElementById('btn-drill-back'),
  title: (document.querySelector('#lt-detail .hx-title')?.textContent || '').trim(),
}));

await page.goto(LOCAL + '?t=' + Date.now(), { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#lt-list .rank-item', { state: 'visible', timeout: 40000 });
await page.waitForTimeout(1200);

/* B1 点行毫无反应 */
const b1 = await snap();
await page.locator('#lt-list .rank-item').first().click();
await page.waitForTimeout(700);
const a1 = await snap();
ok('B1 点累计榜行毫无反应（视图 / hash 都不变，光标非 pointer）',
  a1.view === b1.view && a1.hash === b1.hash && a1.cursor !== 'pointer', { before: b1, after: a1 });
ok('B2 页面里不存在单游戏详情块（#drill-more）与返回按钮', !a1.drillMore && !a1.back, { more: a1.drillMore, back: a1.back });

/* B3 连点三行仍无变化 */
for (let i = 1; i <= 3; i++) {
  await page.evaluate((k) => document.querySelectorAll('#lt-list .rank-item')[k]?.click(), i);
  await page.waitForTimeout(220);
}
const a2 = await snap();
ok('B3 连点另外三行仍停在累计榜', a2.view === b1.view && a2.hash === b1.hash, a2);

/* B4 总览点阵不受影响 */
await page.click('#card-recent');
await page.waitForTimeout(900);
const total = await snap();
ok('B4 「最近游玩」总点阵照旧：365 格 / 标题仍是「游玩热力图」',
  total.view === 'view-recent' && total.cells >= 365 && total.title === '游玩热力图', total);

/* B5 点格子仍能展开当天列表（功能没被误伤） */
await page.locator('#hx-grid .hx-c[role="button"]').nth(4).click();
await page.waitForTimeout(700);
const day = await page.evaluate(() => ({
  open: !document.getElementById('hx-day').hidden,
  rows: document.querySelectorAll('#hx-day .hx-row').length,
  scrollY: window.scrollY,
}));
ok('B5 点格子展开当天列表，且页面不滚动', day.open && day.rows > 0 && day.scrollY === 0, day);
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
ok('B6 Esc 收起当日列表', await page.evaluate(() => document.getElementById('hx-day').hidden) === true);

/* B7 旧深链只按视图处理 */
await page.goto(LOCAL + '?t=' + Date.now() + '#/recent/g/431960', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#hx-grid .hx-c', { timeout: 40000 });
await page.waitForTimeout(900);
const deep = await snap();
ok('B7 旧深链 #/recent/g/<appid> 落到总览（hash 去掉 g 段、365 格、无详情块）',
  deep.view === 'view-recent' && deep.hash === '#/recent' && deep.cells >= 365 && !deep.drillMore, deep);

/* B8 勋章墙：徽章是展示块，不再是按钮 */
await page.click('#card-ach');
await page.waitForTimeout(900);
const badge = await page.evaluate(() => {
  const b = document.querySelector('#badges .badge');
  return b ? { tag: b.tagName, cursor: getComputedStyle(b).cursor, count: document.querySelectorAll('#badges .badge').length, hint: document.getElementById('badge-hint')?.textContent?.trim() } : null;
});
ok('B8 勋章墙徽章是 <div> 展示块（非 button、非 pointer、提示语不再写「点一枚」）',
  badge && badge.count > 0 && badge.tag === 'DIV' && badge.cursor !== 'pointer' && !/点一枚/.test(badge.hint || ''),
  badge);
const beforeBadge = await snap();
await page.evaluate(() => document.querySelector('#badges .badge')?.click());
await page.waitForTimeout(600);
const afterBadge = await snap();
ok('B9 点徽章不再跳去任何详情（视图与 hash 都不变）',
  afterBadge.view === beforeBadge.view && afterBadge.hash === beforeBadge.hash, { before: beforeBadge, after: afterBadge });

/* B10 390 */
await page.setViewportSize({ width: 390, height: 900 });
await page.waitForTimeout(600);
const narrow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
ok('B10 390px 无横向溢出', narrow <= 0, narrow);

const realErrs = errs.filter((s) => !/steamstatic|favicon|Failed to load resource/i.test(s));
ok('B11 零 JS 异常', realErrs.length === 0, realErrs.slice(0, 3));

console.log(`\n===== verify115  PASS=${pass} FAIL=${fail} =====`);
await browser.close();
process.exit(fail ? 1 : 0);
