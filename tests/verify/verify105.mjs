/* verify105.mjs — 第 105 轮：影院黑成为第 5 套主题（本地回归）
 *
 * 契约：与观影页 watch.html 同源的深色（#0b0b0e + 放映机金 #e8b04b），
 * 顶部打光 + 背景胶片颗粒；night「夜航」保留，两套深色并列。
 * 新增规则一律带 [data-theme="cinema"] 前缀，另一套浅色主题零影响。
 *
 * 用法：cd 到仓库根后 node tests/verify/verify105.mjs（需起 127.0.0.1:8895 静态服务）
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

/* 用 import.meta.url 定位仓库根，不依赖 cwd（verify91/92 踩过 cwd 的坑） */
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
ok('A1 版本参数 CSS 137 / APP 122', cssV === '138' && appV === '123', { css: cssV, app: appV });

const themesBlock = (js.match(/const THEMES = \[([\s\S]*?)\];/) || [])[1] || '';
const themeIds = [...themesBlock.matchAll(/id:\s*'([^']+)'/g)].map((m) => m[1]);
ok('A2 THEMES 恰为两套（cream + cinema）', JSON.stringify(themeIds) ===
  JSON.stringify(['cream', 'cinema']), themeIds);
ok('A3 cinema 标为深色、名为「影院黑」', /id:\s*'cinema',\s*name:\s*'影院黑',\s*mode:\s*'dark'/.test(themesBlock));

const idsLine = (html.match(/var ids = \[([^\]]+)\]/) || [])[1] || '';
ok('A4 首屏白名单同步加入 cinema（否则刷新丢主题）', /'cinema'/.test(idsLine), idsLine.trim());

const cineBlock = (css.match(/\[data-theme="cinema"\]\s*\{([\s\S]*?)\n\}/) || [])[1] || '';
ok('A5 cinema 变量块存在且配色取自 watch', cineBlock.includes('--bg: #0b0b0e') &&
  cineBlock.includes('--accent: #e8b04b') && cineBlock.includes('color-scheme: dark'));
const a6 = {
  len: cineBlock.length,
  radial: (cineBlock.match(/radial-gradient\(/g) || []).length,
  p1: /at 50% -40px/.test(cineBlock),
  p2: /at 50% -12%/.test(cineBlock),
  tail: cineBlock.slice(-90),
};
ok('A6 顶部打光在 --bg-layers 里（中央窄束 + 宽散射）',
  a6.radial >= 4 && a6.p1 && a6.p2, a6);
ok('A7 页眉叠同形状暖光', /\[data-theme="cinema"\]\s+\.site-header\s*\{[^}]*radial-gradient/.test(css));

const grainRule = (css.match(/\[data-theme="cinema"\]\s+body::before\s*\{([\s\S]*?)\n\}/) || [])[1] || '';
ok('A8 胶片颗粒两层错位点阵 + 固定视口 + 不拦截点击',
  (grainRule.match(/radial-gradient\(/g) || []).length === 2 &&
  /position:\s*fixed/.test(grainRule) && /pointer-events:\s*none/.test(grainRule) &&
  /z-index:\s*2/.test(grainRule) && /background-size:\s*3px 3px, 5px 5px/.test(grainRule));

/* 隔离性：所有 cinema 专属选择器都要带前缀，不能污染另一套浅色主题 */
const bareGrain = (css.match(/(?<!\[data-theme="cinema"\]\s)\bbody::before\s*\{/g) || []).length;
ok('A9 body::before 只出现在带 cinema 前缀的规则里', bareGrain === 0, bareGrain);
ok('A10 三套已删主题的变量块全站为零',
  /:root,\s*\[data-theme="cream"\]\s*\{/.test(css) &&
  ['mint', 'dawn', 'night'].every((t) => !new RegExp('\\[data-theme="' + t + '"\\]\\s*\\{').test(css)));

/* ---------- B 运行时（影院黑 + 持久化） ---------- */
const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

await page.goto(LOCAL + '?t=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 40000 });
await page.waitForSelector('#lt-list .rank-item', { state: 'visible', timeout: 40000 });
await page.evaluate(() => { try { localStorage.setItem('theme', 'cinema'); } catch (e) {} });
await page.reload({ waitUntil: 'domcontentloaded', timeout: 40000 });
await page.waitForSelector('#lt-list .rank-item', { state: 'visible', timeout: 40000 });
await page.waitForTimeout(1200);

const b = await page.evaluate(() => {
  const root = getComputedStyle(document.documentElement);
  const body = getComputedStyle(document.body);
  const grain = getComputedStyle(document.body, '::before');
  const header = getComputedStyle(document.querySelector('.site-header'));
  return {
    theme: document.documentElement.dataset.theme,
    bg: root.getPropertyValue('--bg').trim(),
    accent: root.getPropertyValue('--accent').trim(),
    bodyBg: body.backgroundImage,
    headerBg: header.backgroundImage,
    grainBg: grain.backgroundImage,
    grainPos: grain.position,
    grainPE: grain.pointerEvents,
    grainZ: grain.zIndex,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    rows: document.querySelectorAll('#lt-list .rank-item').length,
  };
});
ok('B1 刷新后仍是影院黑（白名单持久化生效）', b.theme === 'cinema', b.theme);
ok('B2 --bg / --accent 已生效', b.bg === '#0b0b0e' && b.accent === '#e8b04b', { bg: b.bg, accent: b.accent });
ok('B3 body 背景有 ≥4 层径向打光', (b.bodyBg.match(/radial-gradient\(/g) || []).length >= 4,
  (b.bodyBg.match(/radial-gradient\(/g) || []).length);
ok('B4 页眉也有暖光', /radial-gradient\(/.test(b.headerBg));
ok('B5 颗粒纹理已铺上且不吃点击', /radial-gradient\(/.test(b.grainBg) &&
  b.grainPos === 'fixed' && b.grainPE === 'none' && b.grainZ === '2',
  { pos: b.grainPos, pe: b.grainPE, z: b.grainZ });
ok('B6 无横向溢出且累计榜有数据', b.overflow === 0 && b.rows > 0, { overflow: b.overflow, rows: b.rows });

/* 切回浅色主题，颗粒必须完全消失 —— 证明新规则没污染其他主题 */
const back = await page.evaluate(() => {
  document.documentElement.dataset.theme = 'cream';
  const grain = getComputedStyle(document.body, '::before');
  return { grainBg: grain.backgroundImage, content: grain.content, bg: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() };
});
ok('B7 切回 cream 后颗粒消失', back.grainBg === 'none' && back.bg === '#fbf7f1', back);

/* ---------- C 两套主题 × 五个宽度 ---------- */
const THEMES = ['cream', 'cinema'];
const WIDTHS = [1440, 1280, 1088, 900, 390];
for (const t of THEMES) {
  const bad = [];
  for (const w of WIDTHS) {
    await page.setViewportSize({ width: w, height: 900 });
    const r = await page.evaluate((th) => {
      document.documentElement.dataset.theme = th;
      return document.documentElement.scrollWidth - document.documentElement.clientWidth;
    }, t);
    if (r !== 0) bad.push({ w, overflow: r });
  }
  ok('C·' + t + ' 五档宽度零横向溢出', bad.length === 0, bad);
}
await page.setViewportSize({ width: 1440, height: 900 });

/* ---------- D 第 103 / 104 轮契约未破 ---------- */
await page.evaluate(() => { document.documentElement.dataset.theme = 'cinema'; });
await page.evaluate(() => { try { localStorage.setItem('theme', 'cinema'); } catch (e) {} });
await page.click('#card-lifetime');
await page.waitForTimeout(400);
const d1 = await page.evaluate(() => ({
  active: document.querySelector('.view.active')?.id,
  detail: !!document.getElementById('lt-detail')?.getClientRects().length,
}));
ok('D1 影院黑下点游戏时长卡仍不进热力图', d1.active === 'view-lifetime' && d1.detail === false, d1);

await page.click('#card-recent');
await page.waitForTimeout(900);
const d2 = await page.evaluate(() => ({
  active: document.querySelector('.view.active')?.id,
  detail: !!document.getElementById('lt-detail')?.getClientRects().length,
  detailCount: document.querySelectorAll('#lt-detail').length,
  parent: document.getElementById('lt-detail')?.parentElement?.id,
  recentList: document.querySelectorAll('#recent-list').length,
  cells: document.querySelectorAll('#hx-grid .hx-c').length,
}));
ok('D2 点最近游玩卡进热力图且数据完整', d2.active === 'view-recent' && d2.detail && d2.cells > 0, d2);
ok('D3 热力图仅一份、归属最近游玩、近 14 天榜已删',
  d2.detailCount === 1 && d2.parent === 'view-recent' && d2.recentList === 0, d2);

/* ---------- E 两套主题来回切换 ---------- */
await page.click('#card-lifetime');
const seq = [];
for (let i = 0; i < 8; i++) {
  await page.click('.header-avatar');
  await page.waitForTimeout(140);
  seq.push(await page.evaluate(() => document.documentElement.dataset.theme));
}
ok('E1 连点 8 次每次都换且只落在两套主题内',
  seq.every((v, i) => i === 0 || v !== seq[i - 1]) && seq.every((v) => THEMES.includes(v)), seq);

ok('Z1 全程零 JS 异常', errs.length === 0, errs.slice(0, 5));
console.log('\n===== verify105 ' + pass + '/' + (pass + fail) + ' PASS，FAIL=' + fail + ' =====');
await browser.close();
if (fail) process.exit(1);
