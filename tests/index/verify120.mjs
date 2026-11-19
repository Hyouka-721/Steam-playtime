/* verify120.mjs — 第 120 轮：雨滴氛围层（index / Game Time）
   契约：
     ① 新增独立 rain.js / rain.css，两页共用；不动任何已上线版本号（css144 / app129 / fx19）；
     ② rain.js 携带从 spw-playback-rain 1.0.4 移植的湿玻璃雨滴片元着色器（高度场 + 噪声 + 高光），
        WebGL 渲染到 #rain-canvas：fixed / pointer-events:none / 不进布局（CLS=0）；
     ③ 开关 #rain-toggle：默认开、写 localStorage['rain.enabled']、关则清屏停帧，
        prefers-reduced-motion 下强制关且禁用；五档宽度零横向溢出。
   用法：node tests/index/verify120.mjs（需先起 8895 静态服务） */
import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const ROOT = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const LOCAL = 'http://127.0.0.1:8895/index.html';
let pass = 0, fail = 0;
const ok = (n, c, x) => {
  c ? (pass++, console.log('PASS ', n, x === undefined ? '' : '— ' + JSON.stringify(x)))
    : (fail++, console.log('FAIL ', n, '— ' + JSON.stringify(x)));
};

/* ---------- A 静态 ---------- */
const html = fs.readFileSync(ROOT + 'docs/index.html', 'utf8');
const rainJs = fs.readFileSync(ROOT + 'docs/rain.js', 'utf8');
const rainCss = fs.readFileSync(ROOT + 'docs/rain.css', 'utf8');
const watchHtml = fs.readFileSync(ROOT + 'docs/watch.html', 'utf8');

ok('A1 两页均以 v=1 引用 rain.css / rain.js',
  /rain\.css\?v=1["']/.test(html) && /rain\.js\?v=1["']/.test(html) &&
  /rain\.css\?v=1["']/.test(watchHtml) && /rain\.js\?v=1["']/.test(watchHtml));
ok('A2 不动已上线版本号（css144 / app129 / fx19 原样保留）',
  /style\.css\?v=144["']/.test(html) && /app\.js\?v=129["']/.test(html) && /fx\.js\?v=19["']/.test(html));
ok('A3 着色器来自 spw-playback-rain：高度场 + OS2 噪声 + 镜面高光三件齐全',
  /os2NoiseWithDerivatives/.test(rainJs) && /raindropSurface/.test(rainJs) &&
  /rollingRaindrops/.test(rainJs) && /staticRaindrops/.test(rainJs) &&
  /specular/.test(rainJs) && /uLightAngle/.test(rainJs) && /uDensity/.test(rainJs));
ok('A4 参数取插件默认档并做网页适配（降亮度 / 降透明度）',
  /speed: 0\.6/.test(rainJs) && /density: 0\.32/.test(rainJs) &&
  /Math\.PI \/ 3/.test(rainJs) && /alpha = dropMask[\s\S]{0,120}\* 0\.26/.test(rainJs));
ok('A5 canvas 与开关标记在 DOM（无 title 原生气泡，遵守 verify82 A2）',
  /<canvas id="rain-canvas" aria-hidden="true">/.test(html) &&
  /id="rain-toggle"/.test(html) && !/id="rain-toggle"[^>]*title=/.test(html));
ok('A6 rain.css：fixed 全屏 / pointer-events:none / z-index 6 / 浅色翻相 / 打印隐藏',
  /#rain-canvas \{[\s\S]*?\}/.test(rainCss) &&
  /#rain-canvas \{[\s\S]*?position: fixed;/.test(rainCss) &&
  /#rain-canvas \{[\s\S]*?inset: 0;/.test(rainCss) &&
  /#rain-canvas \{[\s\S]*?pointer-events: none;/.test(rainCss) &&
  /#rain-canvas \{[\s\S]*?z-index: 6;/.test(rainCss) &&
  /\[data-theme="cream"\] #rain-canvas \{ filter: invert\(1\); \}/.test(rainCss) &&
  /@media print \{[\s\S]*?#rain-canvas \{ display: none; \}/.test(rainCss));
ok('A7 圆角只用变量 / 50% / 2px 白名单（rain.css 未出现裸 px 圆角）',
  !/border-radius:\s*(?!var\(--r-|50%|2px)[\d.]+px/.test(rainCss));
ok('A8 @media (max-width:860px) 在 rain.css 只出现一次',
  (rainCss.match(/@media \(max-width:\s*860px\)/g) || []).length === 1);
ok('A9 状态键沿用插件 rain.enabled，默认开且减少动效强制关',
  /localStorage\.setItem\('rain\.enabled'/.test(rainJs) && /rain\.enabled'\)/.test(rainJs) &&
  /return !reduced\.matches/.test(rainJs) && /if \(reduced\.matches\) setEnabled\(false, false\)/.test(rainJs));

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
// 雨滴等首屏骨架退场才初始化（避免抢主线程），判据不变，只等就绪条件
await page.waitForFunction(() => window.__rain && window.__rain.ready() && window.__rain.frames() > 2, null, { timeout: 20000 });
await page.waitForTimeout(200);

const st = await page.evaluate(() => ({
  ready: window.__rain && window.__rain.ready(),
  enabled: window.__rain && window.__rain.enabled(),
  frames: window.__rain && window.__rain.frames(),
  glErr: window.__rain && window.__rain.error(),
  sample: window.__rain && window.__rain.sample(),
  pressed: document.getElementById('rain-toggle').getAttribute('aria-pressed'),
  disabled: document.getElementById('rain-toggle').disabled,
  layout: (() => {
    const c = document.getElementById('rain-canvas');
    const s = getComputedStyle(c);
    return { pos: s.position, pe: s.pointerEvents, z: s.zIndex, w: c.width, h: c.height };
  })(),
}));
ok('B1 WebGL 就绪、默认开、已在出帧',
  st.ready === true && st.enabled === true && st.frames > 0,
  { ready: st.ready, frames: st.frames });
ok('B2 画布确实画出水滴（采样非透明像素 > 0）且无 GL 错误',
  st.sample.pixels > 0 && st.glErr === 0, { pixels: st.sample.pixels, total: st.sample.total, glErr: st.glErr });
ok('B3 画布是 fixed 装饰层：不拦点击、z=6、渲染分辨率 < CSS 像素',
  st.layout.pos === 'fixed' && st.layout.pe === 'none' && st.layout.z === '6' &&
  st.layout.w < 1440 && st.layout.h < 900, st.layout);
ok('B4 按钮初始态为开', st.pressed === 'true' && st.disabled === false);

// 开关 → 关
await page.click('#rain-toggle');
await page.waitForTimeout(300);
const off = await page.evaluate(() => ({
  enabled: window.__rain.enabled(),
  pressed: document.getElementById('rain-toggle').getAttribute('aria-pressed'),
  stored: localStorage.getItem('rain.enabled'),
  sample: window.__rain.sample(),
}));
ok('B5 点开关关闭：停帧清屏、按钮态与 localStorage 同步为 0',
  off.enabled === false && off.pressed === 'false' && off.stored === '0' && off.sample.pixels === 0, off);

// 开关 → 开 + 持久化
await page.click('#rain-toggle');
await page.waitForTimeout(250);
ok('B6 再点恢复为开并写入 1', await page.evaluate(() => window.__rain.enabled() && localStorage.getItem('rain.enabled') === '1'));
await page.reload({ waitUntil: 'load' });
await page.waitForFunction(() => window.__rain && window.__rain.ready(), null, { timeout: 20000 });
ok('B7 刷新后沿用 localStorage 的开启态', await page.evaluate(() => window.__rain.enabled() === true));

// 五档宽度：零横向溢出
for (const w of [1440, 1280, 1088, 900, 390]) {
  await page.setViewportSize({ width: w, height: 900 });
  await page.waitForTimeout(180);
  const ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(`B8 ${w}px 零横向溢出`, ov <= 0, { ov });
}

// CLS：开关切换不产生布局偏移
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
ok('C1 雨滴开关切换不产生 CLS', cls === 0, { cls });

// 减少动效
const rmCtx = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
const rm = await rmCtx.newPage();
await rm.goto(LOCAL + '?cb=' + Date.now(), { waitUntil: 'load' });
await rm.waitForTimeout(400);
const rmSt = await rm.evaluate(() => ({
  enabled: window.__rain.enabled(),
  disabled: document.getElementById('rain-toggle').disabled,
  frames: window.__rain.frames(),
  sample: window.__rain.sample(),
}));
ok('C2 prefers-reduced-motion 下强制关、按钮禁用、无绘制',
  rmSt.enabled === false && rmSt.disabled === true && rmSt.frames === 0 && rmSt.sample.pixels === 0, rmSt);
await rmCtx.close();

ok('C3 全程零 JS 异常', errs.length === 0, errs.slice(0, 3));
await browser.close();
console.log(`\n第 120 轮（index 雨滴）：${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
