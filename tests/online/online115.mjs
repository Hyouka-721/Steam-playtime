/* online115.mjs — 第 115 轮上线复验：下钻单个游戏整条线已删除
   断言：线上 139/124 且 css/js 字节（LF 归一）与本地全等 · 线上源码无 openDrill/closeDrill/renderDrillMore ·
        DOM 无 #drill-more / #btn-drill-back · 点累计榜行无反应（视图/hash/光标）· 总览 365 格 ·
        点格子展开当日列表且不滚动 · 旧深链 #/recent/g/<appid> 落总览 · 勋章墙徽章是非交互 div ·
        390 无溢出 · 零 JS 异常
   用法：node tests/online/online115.mjs */
import { createRequire } from 'module';
import fs from 'fs';
import crypto from 'crypto';

const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const SITE = 'https://hyouka-721.github.io/Steam-playtime/';
const LOCAL = 'C:/Users/33329/WorkBuddy/2026-10-13-18-17-49/steam-playtime/docs/';
const md5 = (s) => crypto.createHash('md5').update(Buffer.from(String(s).replace(/\r\n/g, '\n'), 'utf8')).digest('hex');

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

/* ---------- A 指纹：版本 + 字节全等 + 源码无残留 ---------- */
const fp = await page.evaluate(async () => {
  const g = async (u) => (await fetch(u, { cache: 'reload' })).text();
  const [html, css, js] = await Promise.all([
    g('index.html?cb=' + Date.now()),
    g('style.css?v=139'),
    g('app.js?v=124'),
  ]);
  return {
    cssTag: (html.match(/style\.css\?v=\d+/) || [])[0],
    jsTag: (html.match(/app\.js\?v=\d+/) || [])[0],
    css, js,
    drillInHtml: /btn-drill-back|id="drill-more"/.test(html),
    drillInJs: /openDrill|closeDrill|renderDrillMore|drill-more/.test(js),
    dmCss: /\.drill-more\s*\{|\.dm-share\s*\{/.test(css),
  };
});
ok('A1 线上版本 139 / 124', fp.cssTag === 'style.css?v=139' && fp.jsTag === 'app.js?v=124', { css: fp.cssTag, js: fp.jsTag });
ok('A2 线上 style.css 字节与本地全等', md5(fp.css) === md5(fs.readFileSync(LOCAL + 'style.css', 'utf8')), { online: md5(fp.css).slice(0, 12) });
ok('A3 线上 app.js 字节与本地全等', md5(fp.js) === md5(fs.readFileSync(LOCAL + 'app.js', 'utf8')), { online: md5(fp.js).slice(0, 12) });
ok('A4 线上源码里下钻整条线不存在（html / js / css 三层）',
  !fp.drillInHtml && !fp.drillInJs && !fp.dmCss, { html: fp.drillInHtml, js: fp.drillInJs, css: fp.dmCss });

/* ---------- B 运行时 ---------- */
const snap = () => page.evaluate(() => ({
  view: document.querySelector('.view.active')?.id,
  hash: location.hash,
  cells: document.querySelectorAll('#hx-grid .hx-c').length,
  cursor: document.querySelector('#lt-list .rank-item') ? getComputedStyle(document.querySelector('#lt-list .rank-item')).cursor : null,
  drillMore: !!document.getElementById('drill-more'),
  back: !!document.getElementById('btn-drill-back'),
  title: (document.querySelector('#lt-detail .hx-title')?.textContent || '').trim(),
}));

const b0 = await snap();
await page.locator('#lt-list .rank-item').first().click();
await page.waitForTimeout(800);
const b1 = await snap();
ok('B1 线上点累计榜行毫无反应（视图 / hash 不变、光标非 pointer）',
  b1.view === b0.view && b1.hash === b0.hash && b1.cursor !== 'pointer', { before: b0, after: b1 });
ok('B2 线上没有 #drill-more 与返回按钮', !b1.drillMore && !b1.back, { more: b1.drillMore, back: b1.back });

await page.evaluate(() => document.querySelectorAll('#lt-list .rank-item')[2]?.click());
await page.waitForTimeout(500);
const b2 = await snap();
ok('B3 连点另一行仍停在累计榜', b2.view === b0.view && b2.hash === b0.hash, b2);

await page.click('#card-recent');
await page.waitForSelector('#hx-grid .hx-c', { timeout: 30000 });
await page.waitForTimeout(900);
const total = await snap();
ok('B4 线上「最近游玩」总点阵照旧 365 格、标题仍是「游玩热力图」',
  total.view === 'view-recent' && total.cells >= 365 && total.title === '游玩热力图', total);

const y0 = await page.evaluate(() => window.scrollY);
await page.locator('#hx-grid .hx-c[role="button"]').nth(4).click();
await page.waitForTimeout(800);
const day = await page.evaluate(() => ({
  open: !document.getElementById('hx-day').hidden,
  rows: document.querySelectorAll('#hx-day .hx-row').length,
  scrollY: window.scrollY,
}));
ok('B5 线上点格子展开当日列表且页面不滚动', day.open && day.rows > 0 && day.scrollY === y0, { y0, ...day });
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
ok('B6 线上 Esc 收起当日列表', await page.evaluate(() => document.getElementById('hx-day').hidden) === true);

await page.goto(SITE + '#/recent/g/431960', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('#hx-grid .hx-c', { timeout: 45000 });
await page.waitForTimeout(900);
const deep = await snap();
ok('B7 线上旧深链 #/recent/g/<appid> 落到总览（hash 去 g 段、365 格、无详情块）',
  deep.view === 'view-recent' && deep.hash === '#/recent' && deep.cells >= 365 && !deep.drillMore, deep);

await page.click('#card-ach');
await page.waitForTimeout(900);
const badge = await page.evaluate(() => {
  const b = document.querySelector('#badges .badge');
  return b ? { tag: b.tagName, cursor: getComputedStyle(b).cursor, count: document.querySelectorAll('#badges .badge').length, hint: document.getElementById('badge-hint')?.textContent?.trim() } : null;
});
const bv = await page.evaluate(() => ({ view: document.querySelector('.view.active')?.id, hash: location.hash }));
await page.evaluate(() => document.querySelector('#badges .badge')?.click());
await page.waitForTimeout(600);
const av = await page.evaluate(() => ({ view: document.querySelector('.view.active')?.id, hash: location.hash }));
ok('B8 线上勋章墙徽章是非交互 div（非 button、非 pointer、提示语不带「点一枚」）',
  badge && badge.count > 0 && badge.tag === 'DIV' && badge.cursor !== 'pointer' && !/点一枚/.test(badge.hint || ''), badge);
ok('B9 线上点徽章不跳转', av.view === bv.view && av.hash === bv.hash, { before: bv, after: av });

await page.setViewportSize({ width: 390, height: 900 });
await page.waitForTimeout(600);
const narrow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
ok('B10 390px 无横向溢出', narrow <= 0, narrow);

/* 只剔除「本机沙箱拦第三方 Steam 封面图」这一类噪音：这些消息来自 steamcdn / akamaihd 的
   CORS（loopback 地址空间被拒），属于环境问题，不是页面 JS 异常 —— 同理已有 steamstatic 那一条。
   页面自身脚本抛的错会走 pageerror，仍然一条不落地算红。 */
const realErrs = errs.filter((s) => !/steamstatic|steamcdn|akamaihd|favicon|Failed to load resource|blocked by CORS policy/i.test(s));
ok('B11 线上零 JS 异常', realErrs.length === 0, realErrs.slice(0, 3));

console.log(`\n===== online115  PASS=${pass} FAIL=${fail} =====`);
await browser.close();
process.exit(fail ? 1 : 0);
