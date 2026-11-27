/* verify142.mjs — 第 142 轮：Game Time 刷新即满 8 款（1920×950/957 档）
   用户反馈：「刚刷新只有 7 款，下滑再上滑就有 8 款」「明明正好能放下 8 款，
   刷新后却只有 7 款」。核查确认 38 行本来就一次性在 DOM 里，不是分批渲染；
   真正原因是 fitRankRows() 的 min=74 把 8 行档判成 7 行，且 .rank-item 的
   上下 padding 7px + 封面 60px 让行内容最低就占 76px，行高反解到 65px 档时
   被内容撑回去。第 142 轮把 min 降到 65，并让上下留白随 --rank-row-h 收缩
   （封面仍 130×60 不动），使两个视口刷新即 8 整行、0 半行。

   契约：
     ① 版本 style.css?v=158 / app.js?v=135，且只 bump 真改过的两个文件；
     ② app.js 与 index.html 首帧内联脚本的 RANK_FIT 逐项一致（rows8 gap6 min65 max100 pad4）；
     ③ 骨架行与真行同用 clamp 上下留白，封面 130×60 冻结值未动；
     ④ 1920×950 / 1920×957 / 1440×960 刷新即 8 整行、0 半行、CLS=0；
     ⑤ 下滑再回顶、resize 后仍 8 整行；1440×1080 旧档仍 8 行且行高 74~105；
     ⑥ DOM 一次渲染全部游戏（>8 行），窄屏仍不参与行高算法。
   用法：node tests/index/verify142.mjs */
import { createRequire } from 'module';
import fs from 'fs';

const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const ROOT = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const LOCAL = 'http://127.0.0.1:8895/index.html';
let pass = 0, fail = 0;
const ok = (n, c, x) => { c ? (pass++, console.log('PASS ', n, x === undefined ? '' : '— ' + JSON.stringify(x))) : (fail++, console.log('FAIL ', n, '— ' + JSON.stringify(x))); };

/* ---------- A 静态契约 ---------- */
const css = fs.readFileSync(ROOT + 'docs/style.css', 'utf8');
const js = fs.readFileSync(ROOT + 'docs/app.js', 'utf8');
const html = fs.readFileSync(ROOT + 'docs/index.html', 'utf8');

ok('A1 版本 style.css?v=158 / app.js?v=135（watch 资源未动）',
  /style\.css\?v=158/.test(html) && /app\.js\?v=135/.test(html) && !/watch\.css\?v=49/.test(html),
  '理由：第143轮只改了 index.html / style.css / app.js，按红线2只 bump 真改过的 css/js');

ok('A2 app.js 与 HTML 首帧脚本 RANK_FIT 逐项一致（rows8 gap6 min54 max100 pad4）',
  /const RANK_FIT = \{ rows: 8, gap: 6, min: 54, max: 100, pad: 4 \}/.test(js) &&
  /var PAD = 4, ROWS = 8, GAP = 6, MIN = 54, MAX = 100;/.test(html),
  '理由：两处算法必须同步改，否则骨架期与数据期行高不同会重新引入 CLS');

ok('A3 骨架行与真行同用 clamp 留白，封面 130×60 冻结值未动',
  (css.match(/clamp\(0px, calc\(\(var\(--rank-row-h, 76px\) - 62px\) \/ 2\), 7px\) 12px/g) || []).length === 2 &&
  /\.rank-capsule\s*\{[^}]*width: 130px; height: 60px/.test(css),
  '理由：行高压到 65px 档时上下留白自动收紧，封面本身不缩，避免整行被内容撑回 76px');

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
  await page.waitForTimeout(1000);
  const m = await page.evaluate(() => {
    const L = document.getElementById('lt-list');
    const items = [...L.querySelectorAll(':scope > .rank-item')].filter((el) => el.getBoundingClientRect().height > 0);
    const vh = window.innerHeight;
    const r = (el) => el.getBoundingClientRect();
    return {
      vh, total: items.length,
      rowH: +r(items[0]).height.toFixed(1),
      firstTop: +r(items[0]).top.toFixed(1),
      full: items.filter((el) => r(el).bottom <= vh + 0.5).length,
      partial: items.filter((el) => r(el).top < vh - 0.5 && r(el).bottom > vh + 0.5).length,
      varH: L.style.getPropertyValue('--rank-row-h') || '',
      padY: getComputedStyle(items[0]).paddingTop,
      cls: +window.__cls.toFixed(4),
      over: document.documentElement.scrollWidth - window.innerWidth,
    };
  });
  return { ctx, page, m, errs };
}

for (const [w, h] of [[1920, 950], [1920, 957], [1440, 960]]) {
  const s = await measure(w, h);
  ok(`B1 ${w}×${h}：刷新即 8 整行、0 半行、CLS=0`,
    s.m.full === 8 && s.m.partial === 0 && s.m.cls < 0.01 && s.m.varH !== '', s.m);
  ok(`B2 ${w}×${h}：行高 64~76px、上下留白已收紧、一次渲染全部游戏`,
    s.m.rowH >= 64 && s.m.rowH <= 76 && parseFloat(s.m.padY) < 7 && s.m.total > 8,
    { rowH: s.m.rowH, padY: s.m.padY, total: s.m.total });
  await s.ctx.close();
}

/* 用户描述的「下滑再上滑」路径：行数不应变化 */
const u = await measure(1920, 957);
await u.page.evaluate(() => window.scrollTo(0, 600));
await u.page.waitForTimeout(300);
await u.page.evaluate(() => window.scrollTo(0, 0));
await u.page.waitForTimeout(500);
const back = await u.page.evaluate(() => {
  const vh = window.innerHeight;
  const items = [...document.querySelectorAll('#lt-list > .rank-item')];
  const r = (el) => el.getBoundingClientRect();
  return {
    full: items.filter((el) => r(el).bottom <= vh + 0.5).length,
    partial: items.filter((el) => r(el).top < vh - 0.5 && r(el).bottom > vh + 0.5).length,
    varH: document.getElementById('lt-list').style.getPropertyValue('--rank-row-h'),
  };
});
ok('B3 下滑再回顶仍是 8 整行（与刷新时一致）',
  back.full === 8 && back.partial === 0 && back.varH === u.m.varH, { before: u.m, after: back });

/* resize 到用户另一档：仍 8 行 */
await u.page.setViewportSize({ width: 1920, height: 950 });
await u.page.waitForTimeout(500);
const resized = await u.page.evaluate(() => {
  const vh = window.innerHeight;
  const items = [...document.querySelectorAll('#lt-list > .rank-item')];
  const r = (el) => el.getBoundingClientRect();
  return {
    full: items.filter((el) => r(el).bottom <= vh + 0.5).length,
    partial: items.filter((el) => r(el).top < vh - 0.5 && r(el).bottom > vh + 0.5).length,
    varH: document.getElementById('lt-list').style.getPropertyValue('--rank-row-h'),
  };
});
ok('B4 resize 到 1920×950 后仍是 8 整行',
  resized.full === 8 && resized.partial === 0, resized);
await u.ctx.close();

/* 旧契约不回退 */
const old = await measure(1440, 1080);
ok('B5 1440×1080 旧档仍 8 整行、行高 74~105px',
  old.m.full === 8 && old.m.partial === 0 && old.m.rowH >= 74 && old.m.rowH <= 105, old.m);
await old.ctx.close();

const n = await measure(390, 900);
ok('B6 390 窄屏不设 --rank-row-h 且无横向溢出',
  n.m.varH === '' && n.m.over <= 0, { var: n.m.varH, over: n.m.over });
await n.ctx.close();

const realErrs = u.errs.filter((s) => !/steamstatic|steamcdn|akamaihd|favicon|Failed to load resource/i.test(s));
ok('B7 零 JS 异常', realErrs.length === 0, realErrs.slice(0, 3));

console.log(`\n===== verify142  PASS=${pass} FAIL=${fail} =====`);
await browser.close();
process.exit(fail ? 1 : 0);
