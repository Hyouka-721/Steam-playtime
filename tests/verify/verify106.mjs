/* verify106.mjs — 第 106 轮：删除 night / mint / dawn 三套主题（本地回归）
 *
 * 契约：全站只剩 cream「暖阳米」（浅）与 cinema「影院黑」（深）两套。
 * 三套主题的变量块、白名单、主题名注释全部清零；系统深色首次访问直接落到 cinema
 * （原先回落到已删除的 night，会让用户看到一套不存在的主题）。
 *
 * 用法：cd 到仓库根后 node tests/verify/verify106.mjs（需起 127.0.0.1:8895 静态服务）
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');
const ROOT = new URL('../../', import.meta.url);
const read = (p) => fs.readFileSync(new URL(p, ROOT), 'utf8');
const html = read('docs/index.html');
const css = read('docs/style.css');
const js = read('docs/app.js');

const LOCAL = 'http://127.0.0.1:8895/index.html';
let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('PASS  ' + name + (extra === undefined ? '' : ' — ' + JSON.stringify(extra))); }
  else { fail++; console.log('FAIL  ' + name + ' — ' + JSON.stringify(extra)); }
};

/* ---------- A 源码契约 ---------- */
const cssV = (html.match(/style\.css\?v=(\d+)/) || [])[1];
const appV = (html.match(/app\.js\?v=(\d+)/) || [])[1];
ok('A1 版本参数 CSS 133 / APP 119', cssV === '135' && appV === '120', { css: cssV, app: appV });

const themesBlock = (js.match(/const THEMES = \[([\s\S]*?)\];/) || [])[1] || '';
const themeIds = [...themesBlock.matchAll(/id:\s*'([^']+)'/g)].map((m) => m[1]);
ok('A2 THEMES 恰为两套（cream + cinema）',
  JSON.stringify(themeIds) === JSON.stringify(['cream', 'cinema']), themeIds);

const whitelist = (html.match(/var ids = \[([^\]]+)\]/) || [])[1] || '';
ok('A3 首屏白名单恰为两套', /'cream'\s*,\s*'cinema'/.test(whitelist) &&
  !/mint|dawn|night/.test(whitelist), whitelist.trim());
ok('A4 系统深色回落已改为 cinema', /sysDark\s*\?\s*'cinema'\s*:\s*'cream'/.test(html));

const deleted = ['mint', 'dawn', 'night'];
ok('A5 三套主题变量块在 CSS 里彻底清零',
  deleted.every((t) => !css.includes('[data-theme="' + t + '"]')), deleted);
ok('A6 三套主题中文名零残留',
  !['夜航', '薄荷晨', '晨曦紫'].some((n) => css.includes(n)));
ok('A7 cream / cinema 变量块仍在',
  /:root,\s*\[data-theme="cream"\]\s*\{/.test(css) &&
  /\[data-theme="cinema"\]\s*\{/.test(css));
ok('A8 影院黑的打光与颗粒规则未被连带删除',
  /\[data-theme="cinema"\]\s+\.site-header\s*\{[^}]*radial-gradient/.test(css) &&
  /\[data-theme="cinema"\]\s+body::before\s*\{[^}]*pointer-events:\s*none/.test(css));

/* ---------- B 运行时：首次访问 / 回落 / 切换 ---------- */
const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const errs = [];
const mk = async (scheme, saved) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: scheme });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(String(e)));
  if (saved !== undefined) {
    await page.addInitScript((v) => { try { localStorage.setItem('theme', v); } catch (e) {} }, saved);
  }
  await page.goto(LOCAL + '?t=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 40000 });
  await page.waitForSelector('#lt-list .rank-item', { state: 'visible', timeout: 40000 });
  await page.waitForTimeout(700);
  const theme = await page.evaluate(() => document.documentElement.dataset.theme);
  await ctx.close();
  return theme;
};
ok('B1 系统深色 + 从未选过 → 直接是影院黑', (await mk('dark')) === 'cinema');
ok('B2 系统浅色 + 从未选过 → 暖阳米', (await mk('light')) === 'cream');
ok('B3 localStorage 残留已删的 night → 安全回落到 cinema',
  (await mk('dark', 'night')) === 'cinema');

const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => errs.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await page.goto(LOCAL + '?t=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 40000 });
await page.waitForSelector('#lt-list .rank-item', { state: 'visible', timeout: 40000 });
await page.evaluate(() => { try { localStorage.setItem('theme', 'cinema'); } catch (e) {} });
await page.reload({ waitUntil: 'domcontentloaded', timeout: 40000 });
await page.waitForSelector('#lt-list .rank-item', { state: 'visible', timeout: 40000 });
await page.waitForTimeout(1000);

const t0 = await page.evaluate(() => document.documentElement.dataset.theme);
await page.click('.header-avatar');
await page.waitForTimeout(200);
const t1 = await page.evaluate(() => document.documentElement.dataset.theme);
ok('B4 点一次史蒂夫必切到另一套', t0 === 'cinema' && t1 === 'cream', { t0, t1 });

const seq = [];
for (let i = 0; i < 6; i++) {
  await page.click('.header-avatar');
  await page.waitForTimeout(140);
  seq.push(await page.evaluate(() => document.documentElement.dataset.theme));
}
ok('B5 连点 6 次只在两套间来回且每次都变',
  seq.every((v, i) => i === 0 || v !== seq[i - 1]) &&
  seq.every((v) => ['cream', 'cinema'].includes(v)), seq);

const vis = await page.evaluate(() => {
  document.documentElement.dataset.theme = 'cinema';
  const root = getComputedStyle(document.documentElement);
  const grain = getComputedStyle(document.body, '::before');
  return {
    bg: root.getPropertyValue('--bg').trim(),
    accent: root.getPropertyValue('--accent').trim(),
    radial: (getComputedStyle(document.body).backgroundImage.match(/radial-gradient\(/g) || []).length,
    grainBg: grain.backgroundImage,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    rows: document.querySelectorAll('#lt-list .rank-item').length,
  };
});
ok('B6 影院黑配色 / 打光 / 颗粒仍生效', vis.bg === '#0b0b0e' && vis.accent === '#e8b04b' &&
  vis.radial >= 4 && /radial-gradient\(/.test(vis.grainBg), vis);
ok('B7 无横向溢出且累计榜有数据', vis.overflow === 0 && vis.rows > 0, vis);
const cream = await page.evaluate(() => {
  document.documentElement.dataset.theme = 'cream';
  return {
    bg: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(),
    grain: getComputedStyle(document.body, '::before').backgroundImage,
  };
});
ok('B8 暖阳米仍是干净浅色、颗粒消失', cream.bg === '#fbf7f1' && cream.grain === 'none', cream);

/* ---------- C 两套 × 五档宽度 ---------- */
for (const t of ['cream', 'cinema']) {
  const bad = [];
  for (const w of [1440, 1280, 1088, 900, 390]) {
    await page.setViewportSize({ width: w, height: 900 });
    const o = await page.evaluate((th) => {
      document.documentElement.dataset.theme = th;
      return document.documentElement.scrollWidth - document.documentElement.clientWidth;
    }, t);
    if (o !== 0) bad.push({ w, o });
  }
  ok('C·' + t + ' 五档宽度零横向溢出', bad.length === 0, bad);
}
await page.setViewportSize({ width: 1440, height: 900 });

/* ---------- D 第 103 / 104 轮契约未破 ---------- */
await page.evaluate(() => { document.documentElement.dataset.theme = 'cinema'; });
await page.click('#card-lifetime');
await page.waitForTimeout(350);
const d1 = await page.evaluate(() => ({ active: document.querySelector('.view.active')?.id,
  detail: !!document.getElementById('lt-detail')?.getClientRects().length }));
ok('D1 点游戏时长卡不进热力图', d1.active === 'view-lifetime' && !d1.detail, d1);
await page.click('#card-recent');
await page.waitForTimeout(800);
const d2 = await page.evaluate(() => ({
  active: document.querySelector('.view.active')?.id,
  cells: document.querySelectorAll('#hx-grid .hx-c').length,
  count: document.querySelectorAll('#lt-detail').length,
  parent: document.getElementById('lt-detail')?.parentElement?.id,
  recentList: document.querySelectorAll('#recent-list').length,
}));
ok('D2 点最近游玩卡进热力图且数据完整', d2.active === 'view-recent' && d2.cells > 0 &&
  d2.count === 1 && d2.parent === 'view-recent' && d2.recentList === 0, d2);

ok('Z1 全程零 JS 异常', errs.length === 0, errs.slice(0, 5));
console.log('\n===== verify106 ' + pass + '/' + (pass + fail) + ' PASS，FAIL=' + fail + ' =====');
await browser.close();
if (fail) process.exit(1);
