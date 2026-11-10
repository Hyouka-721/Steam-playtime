/* online117.mjs — 第 117 轮上线复验：首页榜单首屏整行显示
   断言：线上 141/127 且 css/js 字节（LF 归一）与本地全等 · 线上 app.js 含 fitRankRows / RANK_FIT ·
        行距 6px · 1440×1080 恰好 8 整行、0 条被切开的行 · 1440×1200 / 1280×1080 / 1920×800 同样 0 切开 ·
        切到别的栏目再回来仍成立 · CLS 仍 0 · 390 不参与且无溢出 · 零 JS 异常
   用法：node tests/online/online117.mjs */
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
const errs = [];

async function open(w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'block' });
  await ctx.addInitScript(() => {
    try { localStorage.setItem('theme', 'cinema'); } catch (e) {}
    window.__cls = 0;
    try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true }); } catch (e) {}
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(SITE + '?t=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('#lt-list .rank-item', { state: 'visible', timeout: 45000 });
  await page.waitForTimeout(1300);
  return { ctx, page };
}

const measure = () => ({
  rowH: 0, // 占位，实际在 page.evaluate 里算
});

async function geo(page) {
  return page.evaluate(() => {
    const vh = window.innerHeight;
    const items = [...document.querySelectorAll('#lt-list > .rank-item')].filter((el) => el.getBoundingClientRect().height > 0);
    const r = (el) => el.getBoundingClientRect();
    return {
      rowH: +r(items[0]).height.toFixed(1),
      full: items.filter((el) => r(el).bottom <= vh + 0.5).length,
      partial: items.filter((el) => r(el).top < vh - 0.5 && r(el).bottom > vh + 0.5).length,
      var: document.getElementById('lt-list').style.getPropertyValue('--rank-row-h') || '',
      gap: getComputedStyle(document.getElementById('lt-list')).gap,
      cls: +window.__cls.toFixed(4),
      over: document.documentElement.scrollWidth - window.innerWidth,
    };
  });
}

/* ---------- A 指纹 ---------- */
const main = await open(1440, 1080);
const fp = await main.page.evaluate(async () => {
  const g = async (u) => (await fetch(u, { cache: 'reload' })).text();
  const [html, css, app] = await Promise.all([
    g('index.html?cb=' + Date.now()),
    g('style.css?v=141'),
    g('app.js?v=127'),
  ]);
  return {
    cssTag: (html.match(/style\.css\?v=\d+/) || [])[0],
    jsTag: (html.match(/app\.js\?v=\d+/) || [])[0],
    css, app,
    hasFit: /function fitRankRows\(\)/.test(app) && /const RANK_FIT = \{ rows: 8, gap: 6/.test(app),
    gap8: /\.rank-list\s*\{[^}]*gap:\s*6px/.test(css),
  };
});
ok('A1 线上版本 141 / 127', fp.cssTag === 'style.css?v=141' && fp.jsTag === 'app.js?v=127', { css: fp.cssTag, js: fp.jsTag });
ok('A2 线上 style.css 字节与本地全等', md5(fp.css) === md5(fs.readFileSync(LOCAL + 'style.css', 'utf8')), { online: md5(fp.css).slice(0, 12) });
ok('A3 线上 app.js 字节与本地全等', md5(fp.app) === md5(fs.readFileSync(LOCAL + 'app.js', 'utf8')), { online: md5(fp.app).slice(0, 12) });
ok('A4 线上有 fitRankRows / RANK_FIT，CSS 行距 6px', fp.hasFit && fp.gap8, { fit: fp.hasFit, gap: fp.gap8 });

/* ---------- B 1440×1080：恰好 8 整行 ---------- */
const g1 = await geo(main.page);
ok('B1 1440×1080：首屏恰好 8 整行、0 条被切开的行',
  g1.full === 8 && g1.partial === 0 && g1.var !== '', g1);
ok('B2 行高在 74~105px 且行距 6px', g1.rowH >= 74 && g1.rowH <= 105 && g1.gap === '6px', { rowH: g1.rowH, gap: g1.gap });
ok('B3 首屏 CLS 仍为 0', g1.cls < 0.01, g1.cls);

/* 切走再回来 */
await main.page.click('#card-ach');
await main.page.waitForTimeout(600);
await main.page.click('#card-lifetime');
await main.page.waitForTimeout(900);
const back = await geo(main.page);
ok('B4 切到别的栏目再回来，仍是 8 整行', back.var !== '' && back.full === 8 && back.partial === 0, back);
await main.ctx.close();

/* 其它尺寸 */
for (const [w, h] of [[1440, 1200], [1280, 1080], [1920, 800]]) {
  const s = await open(w, h);
  const g = await geo(s.page);
  ok(`B5 ${w}×${h}：0 条被切开的行（完整 ${g.full} 行）`, g.partial === 0 && g.full >= 3 && g.over === 0, g);
  await s.ctx.close();
}

/* 窄屏 */
const n = await open(390, 900);
const gn = await geo(n.page);
ok('B6 390 窄屏不设 --rank-row-h 且无横向溢出', gn.var === '' && gn.over <= 0, { var: gn.var, over: gn.over });
await n.ctx.close();

const realErrs = errs.filter((s) => !/steamstatic|steamcdn|akamaihd|favicon|Failed to load resource|blocked by CORS/i.test(s));
ok('B7 线上零 JS 异常', realErrs.length === 0, realErrs.slice(0, 3));

console.log(`\n===== online117  PASS=${pass} FAIL=${fail} =====`);
await browser.close();
process.exit(fail ? 1 : 0);
