/* online105.mjs — 第 105 轮线上复验：影院黑成为第 5 套主题
 *
 * 用法：Pages 生效后 node tests/online/online105.mjs
 * 与 verify105 同一套判据，另加线上静态资源取证（直接 fetch 线上 CSS / JS）。
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
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

await page.goto(SITE + '?t=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('#lt-list .rank-item', { state: 'visible', timeout: 40000 });
await page.waitForTimeout(1500);

/* ---------- A 线上版本与静态资源 ---------- */
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
    css, js,
  };
});
ok('A1 线上版本 CSS 133 / APP 119', a.cssV === '134' && a.appV === '119', { css: a.cssV, app: a.appV });
ok('A2 线上首屏白名单含 cinema', /'cinema'/.test(a.whitelist), a.whitelist.trim());
const themeIds = [...((a.js.match(/const THEMES = \[([\s\S]*?)\];/) || [])[1] || '')
  .matchAll(/id:\s*'([^']+)'/g)].map((m) => m[1]);
ok('A3 线上 app.js 恰为两套主题', JSON.stringify(themeIds) ===
  JSON.stringify(['cream', 'cinema']), themeIds);
const cine = (a.css.match(/\[data-theme="cinema"\]\s*\{([\s\S]*?)\n\}/) || [])[1] || '';
ok('A4 线上 CSS 含影院黑配色与顶部打光', cine.includes('--bg: #0b0b0e') &&
  cine.includes('--accent: #e8b04b') && (cine.match(/radial-gradient\(/g) || []).length >= 4 &&
  /at 50% -40px/.test(cine) && /at 50% -12%/.test(cine), { len: cine.length });
ok('A5 线上 CSS 含胶片颗粒且带 cinema 前缀',
  /\[data-theme="cinema"\]\s+body::before\s*\{[^}]*pointer-events:\s*none/.test(a.css));
ok('A6 线上 CSS 页眉叠暖光', /\[data-theme="cinema"\]\s+\.site-header\s*\{[^}]*radial-gradient/.test(a.css));

/* ---------- B 运行时：持久化 + 打光 + 纹理 ---------- */
await page.evaluate(() => { try { localStorage.setItem('theme', 'cinema'); } catch (e) {} });
await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('#lt-list .rank-item', { state: 'visible', timeout: 40000 });
await page.waitForTimeout(1200);

const b = await page.evaluate(() => {
  const root = getComputedStyle(document.documentElement);
  const grain = getComputedStyle(document.body, '::before');
  return {
    theme: document.documentElement.dataset.theme,
    bg: root.getPropertyValue('--bg').trim(),
    accent: root.getPropertyValue('--accent').trim(),
    radial: (getComputedStyle(document.body).backgroundImage.match(/radial-gradient\(/g) || []).length,
    headerGlow: /radial-gradient\(/.test(getComputedStyle(document.querySelector('.site-header')).backgroundImage),
    grainBg: grain.backgroundImage,
    grainPE: grain.pointerEvents,
    grainPos: grain.position,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    rows: document.querySelectorAll('#lt-list .rank-item').length,
  };
});
ok('B1 线上刷新后仍是影院黑', b.theme === 'cinema', b.theme);
ok('B2 线上配色已生效', b.bg === '#0b0b0e' && b.accent === '#e8b04b', { bg: b.bg, accent: b.accent });
ok('B3 线上顶部打光与页眉暖光都在', b.radial >= 4 && b.headerGlow, { radial: b.radial, header: b.headerGlow });
ok('B4 线上颗粒纹理铺上且不吃点击', /radial-gradient\(/.test(b.grainBg) &&
  b.grainPE === 'none' && b.grainPos === 'fixed', { pe: b.grainPE, pos: b.grainPos });
ok('B5 线上无横向溢出且累计榜有数据', b.overflow === 0 && b.rows > 0, { overflow: b.overflow, rows: b.rows });

const back = await page.evaluate(() => {
  document.documentElement.dataset.theme = 'cream';
  return getComputedStyle(document.body, '::before').backgroundImage;
});
ok('B6 切回 cream 颗粒消失（未污染其他主题）', back === 'none', back);

/* ---------- C 契约未破 + 主题切换 ---------- */
await page.evaluate(() => { document.documentElement.dataset.theme = 'cinema'; });
await page.click('#card-lifetime');
await page.waitForTimeout(400);
const c1 = await page.evaluate(() => ({ active: document.querySelector('.view.active')?.id,
  detail: !!document.getElementById('lt-detail')?.getClientRects().length }));
ok('C1 点游戏时长卡不进热力图', c1.active === 'view-lifetime' && !c1.detail, c1);

await page.click('#card-recent');
await page.waitForTimeout(900);
const c2 = await page.evaluate(() => ({
  active: document.querySelector('.view.active')?.id,
  cells: document.querySelectorAll('#heat-drill .hc').length,
  count: document.querySelectorAll('#lt-detail').length,
  parent: document.getElementById('lt-detail')?.parentElement?.id,
}));
ok('C2 点最近游玩卡进热力图且数据完整', c2.active === 'view-recent' && c2.cells > 0 &&
  c2.count === 1 && c2.parent === 'view-recent', c2);

await page.click('#card-lifetime');
const THEMES = ['cream', 'cinema'];
const seq = [];
for (let i = 0; i < 8; i++) {
  await page.click('.header-avatar');
  await page.waitForTimeout(160);
  seq.push(await page.evaluate(() => document.documentElement.dataset.theme));
}
ok('C3 线上连点 8 次只落在两套主题内且每次都换',
  seq.every((v, i) => i === 0 || v !== seq[i - 1]) && seq.every((v) => THEMES.includes(v)), seq);

/* ---------- D 三档宽度 ---------- */
const bad = [];
for (const w of [1440, 900, 390]) {
  await page.setViewportSize({ width: w, height: 900 });
  const o = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (o !== 0) bad.push({ w, o });
}
ok('D1 线上三档宽度零横向溢出', bad.length === 0, bad);

ok('Z1 全程零 JS 异常', errs.length === 0, errs.slice(0, 5));
console.log('\n===== online105 ' + pass + '/' + (pass + fail) + ' PASS，FAIL=' + fail + ' =====');
await browser.close();
if (fail) process.exit(1);
