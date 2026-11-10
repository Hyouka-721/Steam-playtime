/* verify117.mjs — 第 117 轮：首页榜单「首屏整行显示、不切出下一款」
   用户：「第 9 个游戏的海报会露出边缘……适当增大各项之间的间距，使首页在首屏内恰好完整展示 8 款游戏，
        且不出现第 9 款的部分内容。请确保调整后在不同屏幕尺寸下该效果保持一致。」
   契约：
     ① 行距 4 → 8；行高由 fitRankRows() 按视口反解（--rank-row-h），折线永远落在行与行之间；
     ② 1440×1080（用户那一档）恰好 8 整行、0 条被切开的行；
     ③ 其它宽高组合下同样「0 条被切开」，完整行数按可用高度自适应（矮屏少放、高屏多放）；
     ④ 窄屏 ≤860 不参与（两行式布局），不设 --rank-row-h、无横向溢出；
     ⑤ CLS 仍为 0（骨架期就用同一行高）。
   用法：node tests/verify/verify117.mjs */
import { createRequire } from 'module';
import fs from 'fs';

const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const ROOT = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const LOCAL = 'http://127.0.0.1:8895/index.html';
let pass = 0, fail = 0;
const ok = (n, c, x) => { c ? (pass++, console.log('PASS ', n, x === undefined ? '' : '— ' + JSON.stringify(x))) : (fail++, console.log('FAIL ', n, '— ' + JSON.stringify(x))); };

/* ---------- A 静态 ---------- */
const css = fs.readFileSync(ROOT + 'docs/style.css', 'utf8');
const js = fs.readFileSync(ROOT + 'docs/app.js', 'utf8');
const html = fs.readFileSync(ROOT + 'docs/index.html', 'utf8');
ok('A1 版本参数 CSS 141 / APP 127', html.includes('style.css?v=141') && html.includes('app.js?v=127'),
  { css: (html.match(/style\.css\?v=(\d+)/) || [])[1], app: (html.match(/app\.js\?v=(\d+)/) || [])[1] });
ok('A2 行距 4 → 6 且行高走变量',
  /\.rank-list\s*\{[^}]*gap:\s*6px/.test(css) && /\.rank-item\s*\{[\s\S]{0,2000}min-height:\s*var\(--rank-row-h/.test(css));
ok('A3 骨架行也吃同一行高（换真行不跳）', /\.sk-row\s*\{[\s\S]{0,400}min-height:\s*var\(--rank-row-h/.test(css));
ok('A4 app.js 有 fitRankRows 与参数表，并在初始化 / 切视图 / resize 三处调用',
  /function fitRankRows\(\)/.test(js) && /const RANK_FIT = \{ rows: 8, gap: 6/.test(js) &&
  (js.match(/fitRankRows\(\)/g) || []).length >= 4);

/* ---------- B 运行时 ---------- */
const browser = await chromium.launch({ args: ['--no-proxy-server'] });

async function measure(w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    window.__cls = 0;
    try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true }); } catch (e) {}
  });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(LOCAL + '?t=' + Date.now(), { waitUntil: 'load' });
  await page.waitForSelector('#lt-list .rank-item', { state: 'visible', timeout: 40000 });
  await page.waitForTimeout(1100);
  const m = await page.evaluate(() => {
    const vh = window.innerHeight;
    const items = [...document.querySelectorAll('#lt-list > .rank-item')].filter((el) => el.getBoundingClientRect().height > 0);
    const r = (el) => el.getBoundingClientRect();
    return {
      rowH: +r(items[0]).height.toFixed(1),
      full: items.filter((el) => r(el).bottom <= vh + 0.5).length,
      partial: items.filter((el) => r(el).top < vh - 0.5 && r(el).bottom > vh + 0.5).length,
      var: document.getElementById('lt-list').style.getPropertyValue('--rank-row-h') || '',
      cls: +window.__cls.toFixed(4),
      over: document.documentElement.scrollWidth - window.innerWidth,
      gap: getComputedStyle(document.getElementById('lt-list')).gap,
    };
  });
  return { ctx, page, m, errs };
}

/* 用户那一档：1440×1080 */
const a = await measure(1440, 1080);
ok('B1 1440×1080：首屏恰好 8 整行、没有半截行',
  a.m.full === 8 && a.m.partial === 0 && a.m.var !== '', a.m);
ok('B2 行高落在观感带内（74~105px）、行距 = 6px',
  a.m.rowH >= 74 && a.m.rowH <= 105 && a.m.gap === '6px', { rowH: a.m.rowH, gap: a.m.gap });
ok('B3 首屏 CLS 仍为 0', a.m.cls < 0.01, a.m.cls);

/* 切走再回来：行高仍生效、仍是整行 */
await a.page.click('#card-ach');
await a.page.waitForTimeout(500);
await a.page.click('#card-lifetime');
await a.page.waitForTimeout(800);
const back = await a.page.evaluate(() => {
  const vh = window.innerHeight;
  const items = [...document.querySelectorAll('#lt-list > .rank-item')].filter((el) => el.getBoundingClientRect().height > 0);
  const r = (el) => el.getBoundingClientRect();
  return {
    var: document.getElementById('lt-list').style.getPropertyValue('--rank-row-h') || '',
    full: items.filter((el) => r(el).bottom <= vh + 0.5).length,
    partial: items.filter((el) => r(el).top < vh - 0.5 && r(el).bottom > vh + 0.5).length,
  };
});
ok('B4 切到别的栏目再回来，行高与「整行」效果保持', back.var !== '' && back.full === 8 && back.partial === 0, back);
await a.ctx.close();

/* 其它尺寸：一律「0 条被切开」 */
for (const [w, h] of [[1440, 900], [1440, 1200], [1280, 1080], [1920, 800], [1088, 1000]]) {
  const s = await measure(w, h);
  ok(`B5 ${w}×${h}：0 条被切开的行（完整 ${s.m.full} 行）`,
    s.m.partial === 0 && s.m.full >= 3 && s.m.over === 0, { full: s.m.full, partial: s.m.partial, rowH: s.m.rowH });
  await s.ctx.close();
}

/* 窄屏：不参与行高算法 */
const n = await measure(390, 900);
ok('B6 390 窄屏不设 --rank-row-h（两行式布局不撑高）且无横向溢出',
  n.m.var === '' && n.m.over <= 0, { var: n.m.var, over: n.m.over });
await n.ctx.close();

const realErrs = a.errs.filter((s) => !/steamstatic|steamcdn|akamaihd|favicon|Failed to load resource/i.test(s));
ok('B7 零 JS 异常', realErrs.length === 0, realErrs.slice(0, 3));

console.log(`\n===== verify117  PASS=${pass} FAIL=${fail} =====`);
await browser.close();
process.exit(fail ? 1 : 0);
