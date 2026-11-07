/* online106.mjs — 第 106 轮线上复验：三套主题已删除、系统深色默认影院黑
 *
 * 用法：Pages 生效后 node tests/online/online106.mjs
 * B1 专门复验上一轮用户反馈的「打开看到的是紫蓝夜航」—— 现在深色系统应直接落到 cinema。
 */
import { createRequire } from 'node:module';

const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const SITE = 'https://hyouka-721.github.io/Steam-playtime/';
let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('PASS  ' + name + (extra === undefined ? '' : ' — ' + JSON.stringify(extra))); }
  else { fail++; console.log('FAIL  ' + name + ' — ' + JSON.stringify(extra)); }
};

const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const errs = [];

/* ---------- A 线上静态资源 ---------- */
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
const page = await ctx.newPage();
page.on('pageerror', (e) => errs.push(String(e)));
await page.goto(SITE + '?t=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('#lt-list .rank-item', { state: 'visible', timeout: 40000 });
await page.waitForTimeout(1200);

const a = await page.evaluate(async () => {
  const cssEl = document.querySelector('link[href*="style.css"]');
  const jsEl = document.querySelector('script[src*="app.js"]');
  const [css, js] = await Promise.all([
    fetch(cssEl.href, { cache: 'no-store' }).then((r) => r.text()),
    fetch(jsEl.src, { cache: 'no-store' }).then((r) => r.text()),
  ]);
  const doc = document.documentElement.outerHTML;
  return {
    cssV: (doc.match(/style\.css\?v=(\d+)/) || [])[1],
    appV: (doc.match(/app\.js\?v=(\d+)/) || [])[1],
    whitelist: (doc.match(/var ids = \[([^\]]+)\]/) || [])[1] || '',
    fallBack: /sysDark\s*\?\s*'cinema'\s*:\s*'cream'/.test(doc),
    css, js,
  };
});
ok('A1 线上版本 CSS 133 / APP 119', a.cssV === '135' && a.appV === '120', { css: a.cssV, app: a.appV });
ok('A2 线上白名单恰两套、深色回落 cinema',
  /'cream'\s*,\s*'cinema'/.test(a.whitelist) && !/mint|dawn|night/.test(a.whitelist) && a.fallBack,
  a.whitelist.trim());
const ids = [...((a.js.match(/const THEMES = \[([\s\S]*?)\];/) || [])[1] || '')
  .matchAll(/id:\s*'([^']+)'/g)].map((m) => m[1]);
ok('A3 线上 app.js 恰为两套主题', JSON.stringify(ids) === JSON.stringify(['cream', 'cinema']), ids);
ok('A4 线上 CSS 三套已删变量块为零',
  ['mint', 'dawn', 'night'].every((t) => !a.css.includes('[data-theme="' + t + '"]')));
ok('A5 线上影院黑打光与颗粒仍在',
  /\[data-theme="cinema"\]\s+\.site-header\s*\{[^}]*radial-gradient/.test(a.css) &&
  /\[data-theme="cinema"\]\s+body::before\s*\{[^}]*pointer-events:\s*none/.test(a.css));

/* ---------- B 首次访问（独立上下文，localStorage 干净） ---------- */
const firstVisit = async (scheme) => {
  const c = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: scheme });
  const p = await c.newPage();
  p.on('pageerror', (e) => errs.push(String(e)));
  await p.goto(SITE + '?t=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForSelector('#lt-list .rank-item', { state: 'visible', timeout: 40000 });
  await p.waitForTimeout(800);
  const theme = await p.evaluate(() => document.documentElement.dataset.theme);
  await c.close();
  return theme;
};
ok('B1 线上系统深色首次访问 → 影院黑（不再是紫蓝夜航）', (await firstVisit('dark')) === 'cinema');
ok('B2 线上系统浅色首次访问 → 暖阳米', (await firstVisit('light')) === 'cream');

/* ---------- C 切换与视觉 ---------- */
const t0 = await page.evaluate(() => document.documentElement.dataset.theme);
await page.click('.header-avatar');
await page.waitForTimeout(220);
const t1 = await page.evaluate(() => document.documentElement.dataset.theme);
ok('C1 点一次史蒂夫必切到另一套', t0 !== t1 && ['cream', 'cinema'].includes(t1), { t0, t1 });

const vis = await page.evaluate(() => {
  document.documentElement.dataset.theme = 'cinema';
  const root = getComputedStyle(document.documentElement);
  return {
    bg: root.getPropertyValue('--bg').trim(),
    accent: root.getPropertyValue('--accent').trim(),
    radial: (getComputedStyle(document.body).backgroundImage.match(/radial-gradient\(/g) || []).length,
    grain: getComputedStyle(document.body, '::before').backgroundImage,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  };
});
ok('C2 线上影院黑配色 / 打光 / 颗粒生效', vis.bg === '#0b0b0e' && vis.accent === '#e8b04b' &&
  vis.radial >= 4 && /radial-gradient\(/.test(vis.grain) && vis.overflow === 0, vis);
const cream = await page.evaluate(() => {
  document.documentElement.dataset.theme = 'cream';
  return getComputedStyle(document.body, '::before').backgroundImage;
});
ok('C3 线上暖阳米无颗粒污染', cream === 'none', cream);

const bad = [];
for (const w of [1440, 900, 390]) {
  await page.setViewportSize({ width: w, height: 900 });
  const o = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (o !== 0) bad.push({ w, o });
}
ok('C4 线上三档宽度零横向溢出', bad.length === 0, bad);

ok('Z1 全程零 JS 异常', errs.length === 0, errs.slice(0, 5));
console.log('\n===== online106 ' + pass + '/' + (pass + fail) + ' PASS，FAIL=' + fail + ' =====');
await browser.close();
if (fail) process.exit(1);
