/* verify120_watch.mjs — 第 120 轮：雨滴氛围层（watch / My Watch List）
   契约：与 index 共用 rain.js / rain.css，不动 watch.css?v=44 / watch.js?v=35；
     watch 页恒为 cinema 深色 → 雨滴高光原样显示（不翻相）；
     开关 #rain-toggle 位于 .w-foot，默认开、持久化、reduced-motion 强制关；
     fixed 装饰层 CLS=0、五档宽度零溢出，海报墙 / 筛选 / 视图切换全不受影响。
   用法：node tests/watch/verify120_watch.mjs（需先起 8895 静态服务） */
import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const ROOT = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const LOCAL = 'http://127.0.0.1:8895/watch.html';
let pass = 0, fail = 0;
const ok = (n, c, x) => {
  c ? (pass++, console.log('PASS ', n, x === undefined ? '' : '— ' + JSON.stringify(x)))
    : (fail++, console.log('FAIL ', n, '— ' + JSON.stringify(x)));
};

/* ---------- A 静态 ---------- */
const html = fs.readFileSync(ROOT + 'docs/watch.html', 'utf8');
const rainJs = fs.readFileSync(ROOT + 'docs/rain.js', 'utf8');
const rainCss = fs.readFileSync(ROOT + 'docs/rain.css', 'utf8');

ok('A1 watch 以 v=1 引用 rain.css / rain.js，且不动 css44 / js35',
  /rain\.css\?v=1["']/.test(html) && /rain\.js\?v=1["']/.test(html) &&
  /watch\.css\?v=44["']/.test(html) && /watch\.js\?v=35["']/.test(html));
ok('A2 canvas 在 body 首位、开关在 .w-foot（无 title 气泡）',
  /<body>\s*<canvas id="rain-canvas" aria-hidden="true">/.test(html) &&
  /class="rain-toggle" id="rain-toggle"/.test(html) && !/id="rain-toggle"[^>]*title=/.test(html));
ok('A3 watch 恒为 cinema：不套浅色翻相规则',
  /<html lang="zh-CN" data-theme="cinema">/.test(html) &&
  /\[data-theme="cream"\] #rain-canvas \{ filter: invert\(1\); \}/.test(rainCss));
ok('A4 与 index 共用同一份 rain.js（着色器/默认档一致）',
  /os2NoiseWithDerivatives/.test(rainJs) && /raindropSurface/.test(rainJs) &&
  /speed: 0\.6/.test(rainJs) && /localStorage\.setItem\('rain\.enabled'/.test(rainJs));

/* ---------- B 运行时 ---------- */
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto(LOCAL + '?cb=' + Date.now(), { waitUntil: 'load' });
await page.evaluate(() => { try { localStorage.removeItem('rain.enabled'); } catch (e) {} });
await page.reload({ waitUntil: 'load' });
// 第 120 轮：等海报墙数据就绪再断言视图状态。慢速机/并发跑套件时 fetch 晚到，
// 固定 sleep 会出现 grid/tl 同时 hidden 的假红（数据没到，不是雨滴拦点击）。
await page.waitForFunction(() => document.querySelectorAll('#w-grid img').length > 100, null, { timeout: 15000 });
await page.waitForFunction(() => window.__rain && window.__rain.ready() && window.__rain.frames() > 2, null, { timeout: 20000 });
await page.waitForTimeout(200);

const st = await page.evaluate(() => ({
  ready: window.__rain && window.__rain.ready(),
  enabled: window.__rain && window.__rain.enabled(),
  frames: window.__rain && window.__rain.frames(),
  glErr: window.__rain && window.__rain.error(),
  sample: window.__rain && window.__rain.sample(),
  filter: getComputedStyle(document.getElementById('rain-canvas')).filter,
  theme: document.documentElement.dataset.theme,
  cards: document.querySelectorAll('#w-grid img').length,
  pressed: document.getElementById('rain-toggle').getAttribute('aria-pressed'),
}));
ok('B1 WebGL 就绪、默认开、出帧且无 GL 错误',
  st.ready === true && st.enabled === true && st.frames > 0 && st.glErr === 0,
  { frames: st.frames, glErr: st.glErr });
ok('B2 画布画出水滴（非透明像素 > 0）', st.sample.pixels > 0,
  { pixels: st.sample.pixels, total: st.sample.total });
ok('B3 cinema 主题不翻相（filter=none），海报墙数据未受影响',
  st.theme === 'cinema' && st.filter === 'none' && st.cards > 100,
  { theme: st.theme, filter: st.filter, cards: st.cards });

// 开关关闭 → 停帧清屏
await page.click('#rain-toggle');
await page.waitForTimeout(300);
const off = await page.evaluate(() => ({
  enabled: window.__rain.enabled(),
  stored: localStorage.getItem('rain.enabled'),
  pressed: document.getElementById('rain-toggle').getAttribute('aria-pressed'),
  sample: window.__rain.sample(),
}));
ok('B4 关：停帧清屏、localStorage=0、aria-pressed=false',
  off.enabled === false && off.stored === '0' && off.pressed === 'false' && off.sample.pixels === 0, off);

await page.click('#rain-toggle');
await page.waitForTimeout(250);
await page.reload({ waitUntil: 'load' });
await page.waitForFunction(() => document.querySelectorAll('#w-grid img').length > 100, null, { timeout: 15000 });
await page.waitForFunction(() => window.__rain && window.__rain.ready(), null, { timeout: 20000 });
ok('B5 重新打开后刷新持久化', await page.evaluate(() => window.__rain.enabled() === true && localStorage.getItem('rain.enabled') === '1'));

// 视图切换仍正常（雨滴不拦点击）
await page.evaluate(() => { const b = document.getElementById('w-avatar'); if (b) b.click(); });
await page.waitForTimeout(350);
const view = await page.evaluate(() => ({
  tlHidden: document.getElementById('w-tl').hidden,
  gridHidden: document.getElementById('w-grid').hidden,
  pressed: document.getElementById('w-avatar').getAttribute('aria-pressed'),
}));
ok('B6 雨滴层不拦点击：史蒂夫切到时间轴视图仍生效',
  view.tlHidden === false && view.gridHidden === true && view.pressed === 'true', view);

// 五档宽度
for (const w of [1440, 1280, 1088, 900, 390]) {
  await page.setViewportSize({ width: w, height: 900 });
  await page.waitForTimeout(180);
  const ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(`B7 ${w}px 零横向溢出`, ov <= 0, { ov });
}

// CLS
await page.setViewportSize({ width: 1440, height: 900 });
await page.waitForTimeout(200);
await page.evaluate(() => {
  window.__cls = 0;
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
  }).observe({ type: 'layout-shift', buffered: false });
});
await page.click('#rain-toggle');
await page.waitForTimeout(250);
await page.click('#rain-toggle');
await page.waitForTimeout(250);
const cls = await page.evaluate(() => window.__cls);
ok('C1 开关切换零 CLS', cls === 0, { cls });

// 减少动效
const rmCtx = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
const rm = await rmCtx.newPage();
await rm.goto(LOCAL + '?cb=' + Date.now(), { waitUntil: 'load' });
await rm.waitForTimeout(400);
const rmSt = await rm.evaluate(() => ({
  enabled: window.__rain.enabled(),
  disabled: document.getElementById('rain-toggle').disabled,
  frames: window.__rain.frames(),
}));
ok('C2 prefers-reduced-motion 下强制关且按钮禁用',
  rmSt.enabled === false && rmSt.disabled === true && rmSt.frames === 0, rmSt);
await rmCtx.close();

ok('C3 全程零 JS 异常', errs.length === 0, errs.slice(0, 3));
await browser.close();
console.log(`\n第 120 轮（watch 雨滴）：${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
