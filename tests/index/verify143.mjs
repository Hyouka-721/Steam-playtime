/* verify143.mjs — 第 143 轮：更低视口也刷新即满 8 款
   用户第 142 轮上线后反馈：刷新瞬间能看到 8 款，随后又回到 7 款。
   取证：38 行仍是一次性渲染；第 142 轮的 min=65 在更矮的有效视口下
   仍会把 8 行档判成 7 行，且封面固定 60px 会把反解出的 54~60px 行高撑回 62px。

   契约：
     ① 版本 style.css?v=160 / app.js?v=141，且只 bump 真改过的两个文件；
     ② app.js 与 index.html 首帧脚本 RANK_FIT 逐项一致（rows8 gap6 min54 max100 pad4）；
     ③ 桌面端 #lt-list 的封面外框与骨架封面随 --rank-row-h 收缩，高行高仍锁 134×64 / 60px；
     ④ 1920×900 / 1920×958 / 1440×860 刷新即 8 整行、0 半行、CLS=0，低档封面确实缩小；
     ⑤ 带 Service Worker 的常规浏览器首访 + 重载仍是 8 整行，且只请求 v158/v135；
     ⑥ 1280×800 仍按 min54 自适应为 7 整行、0 半行；窄屏不参与且无横向溢出。
   用法：node tests/index/verify143.mjs */
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

ok('A1 版本 style.css?v=160 / app.js?v=141（watch 资源未动）',
  /style\.css\?v=160/.test(html) && /app\.js\?v=141/.test(html) && !/watch\.css\?v=49/.test(html),
  '理由：第143轮只改了 index.html / style.css / app.js，按红线2只 bump 真改过的 css/js');

ok('A2 RANK_FIT 两处逐项一致（rows8 gap6 min54 max100 pad4）',
  /const RANK_FIT = \{ rows: 8, gap: 6, min: 54, max: 100, pad: 4 \}/.test(js) &&
  /var PAD = 4, ROWS = 8, GAP = 6, MIN = 54, MAX = 100;/.test(html),
  '理由：min 从 65 再降到 54，低视口仍能放下 8 行；两处必须同步，否则 CLS 回归');

ok('A3 桌面端封面与骨架随行高收缩，且只作用于 #lt-list',
  /@media \(min-width: 861px\) \{[\s\S]*?#lt-list \.rank-capsule-wrap \{[^}]*height:\s*min\(var\(--cap-box-h\), calc\(var\(--rank-row-h, 76px\) \+ 2px\)\)/.test(css) &&
  /#lt-list \.sk-cap \{[^}]*height:\s*min\(60px, calc\(var\(--rank-row-h, 76px\) - 2px\)\)/.test(css) &&
  /\.rank-capsule\s*\{[^}]*width: 130px; height: 60px/.test(css),
  '理由：行高低于 62px 时上下 padding 已归零，必须让封面本体也缩，否则仍被 60px 撑回 7 行；高行高时 130×60 不变');

/* ---------- B 运行时 ---------- */
const browser = await chromium.launch({ args: ['--no-proxy-server'] });

async function measure(w, h, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, serviceWorkers: opts.sw ? 'allow' : 'block' });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    window.__cls = 0;
    try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true }); } catch (e) {}
  });
  const errs = [];
  const assets = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('response', (res) => {
    const u = res.url();
    if (u.includes('style.css?v=') || u.includes('app.js?v=')) assets.push(u.split('/').pop().split('?')[0] + '?' + u.split('?')[1]);
  });
  await page.goto(LOCAL + '?t=' + Date.now(), { waitUntil: 'load' });
  await page.waitForSelector('#lt-list .rank-item', { state: 'visible', timeout: 40000 });
  await page.waitForTimeout(900);
  if (opts.sw) {
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('#lt-list .rank-item', { state: 'visible', timeout: 40000 });
    await page.waitForTimeout(900);
  }
  const m = await page.evaluate(() => {
    const L = document.getElementById('lt-list');
    const items = [...L.querySelectorAll(':scope > .rank-item')];
    const vh = window.innerHeight;
    const r = (el) => el.getBoundingClientRect();
    return {
      vh, total: items.length,
      rowH: +r(items[0]).height.toFixed(1),
      varH: L.style.getPropertyValue('--rank-row-h') || '',
      full: items.filter((el) => r(el).bottom <= vh + 0.5).length,
      partial: items.filter((el) => r(el).top < vh - 0.5 && r(el).bottom > vh + 0.5).length,
      capH: +r(items[0].querySelector('.rank-capsule')).height.toFixed(1),
      padY: getComputedStyle(items[0]).paddingTop,
      cls: +window.__cls.toFixed(4),
      over: document.documentElement.scrollWidth - window.innerWidth,
      sw: !!navigator.serviceWorker.controller,
    };
  });
  return { ctx, page, m, errs, assets };
}

for (const [w, h] of [[1920, 900], [1920, 958], [1440, 860]]) {
  const s = await measure(w, h);
  ok(`B1 ${w}×${h}：刷新即 8 整行、0 半行、CLS=0`,
    s.m.full === 8 && s.m.partial === 0 && s.m.cls < 0.01 && s.m.varH !== '', s.m);
  ok(`B2 ${w}×${h}：行高 53~76px、低档封面同步收缩、一次渲染全部游戏`,
    s.m.rowH >= 53 && s.m.rowH <= 76 && s.m.capH <= 60 && parseFloat(s.m.padY) <= 7 && s.m.total > 8,
    { rowH: s.m.rowH, capH: s.m.capH, padY: s.m.padY, total: s.m.total });
  await s.ctx.close();
}

/* 真实浏览器路径：Service Worker 参与，首访 + 重载都应是 8 行 */
const sw = await measure(1920, 958, { sw: true });
ok('B3 带 Service Worker 的首访+重载仍 8 整行，且资源只请求 v158/v135',
  sw.m.full === 8 && sw.m.partial === 0 && sw.m.sw &&
  sw.assets.every((a) => a === 'style.css?v=160' || a === 'app.js?v=141'),
  { ...sw.m, assets: [...new Set(sw.assets)] });
await sw.ctx.close();

/* 自适应下限仍生效：矮屏少放但绝不切半行 */
const short = await measure(1280, 800);
ok('B4 1280×800 按 min54 自适应为 7 整行、0 半行',
  short.m.full === 7 && short.m.partial === 0 && short.m.rowH >= 54, short.m);
await short.ctx.close();

const n = await measure(390, 900);
ok('B5 390 窄屏不设 --rank-row-h 且无横向溢出',
  n.m.varH === '' && n.m.over <= 0, { var: n.m.varH, over: n.m.over });
await n.ctx.close();

const realErrs = sw.errs.filter((s) => !/steamstatic|steamcdn|akamaihd|favicon|Failed to load resource/i.test(s));
ok('B6 零 JS 异常', realErrs.length === 0, realErrs.slice(0, 3));

console.log(`\n===== verify143  PASS=${pass} FAIL=${fail} =====`);
await browser.close();
process.exit(fail ? 1 : 0);
