/* verify121.mjs — 第 121 轮：雨滴「通透度 + 尺寸」修正
   背景：第 120 轮 WebGL 版只能输出灰白蒙版（采样不到页面背景），且 0.55× 放大发虚。
   本轮改成 DOM 水滴 + backdrop-filter（真实折射），并恢复 1:1 尺寸、放大水滴。
   契约：① 每颗水滴有 backdrop-filter blur（真折射），不是纯色蒙版；
         ② 水滴宽度中位数 ≥12px、最大 ≥24px，数量 ≤56；
         ③ 约 20%~60% 水滴在缓慢下滑，其余静态；
         ④ cream 只用独立 CSS 规则，不再 filter:invert；
         ⑤ 雨滴层 fixed / pointer-events:none，不产生 CLS 与横向溢出；
         ⑥ 连续 60 帧 rAF 在 1.5s 内完成（装饰层不拖垮主线程）。
   用法：node tests/index/verify121.mjs（需先起 8895 静态服务） */
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

const rainCss = fs.readFileSync(ROOT + 'docs/rain.css', 'utf8');
const rainJs = fs.readFileSync(ROOT + 'docs/rain.js', 'utf8');

/* ---------- A 静态 ---------- */
ok('A1 水滴是 DOM 元素而不是 canvas（canvas 只能输出颜色，无法折射背景）',
  /<div id="rain-layer"/.test(fs.readFileSync(ROOT + 'docs/index.html', 'utf8')) &&
  /createElement\('i'\)/.test(rainJs) && /el\.className = 'rain-drop'/.test(rainJs));
ok('A2 backdrop-filter 同时带 -webkit- 前缀（Safari / Chrome 都要能折射）',
  /backdrop-filter: blur\(var\(--rain-blur/.test(rainCss) &&
  /-webkit-backdrop-filter: blur\(var\(--rain-blur/.test(rainCss));
ok('A3 cream 用独立规则而不是 filter:invert(1)',
  /\[data-theme="cream"\] \.rain-drop \{/.test(rainCss) && !/invert\(1\)/.test(rainCss));
ok('A4 尺寸区间 10~40px、滑动比例 0.42、数量上限 56',
  /10 \+ Math\.pow\(rnd\(\), 1\.35\) \* 30/.test(rainJs) &&
  /rnd\(\) < 0\.42/.test(rainJs) && /Math\.min\(56/.test(rainJs));

/* ---------- B 运行时 ---------- */
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto(LOCAL + '?cb=' + Date.now(), { waitUntil: 'load' });
await page.evaluate(() => { localStorage.setItem('theme', 'cinema'); localStorage.removeItem('rain.enabled'); });
await page.reload({ waitUntil: 'load' });
await page.waitForFunction(() => window.__rain && window.__rain.ready(), null, { timeout: 20000 });
await page.waitForTimeout(300);

const st = await page.evaluate(() => {
  const ds = [...document.querySelectorAll('.rain-drop')];
  const widths = ds.map((d) => d.getBoundingClientRect().width).sort((a, b) => a - b);
  const cs = getComputedStyle(ds[0]);
  return {
    count: ds.length,
    widths,
    moving: ds.filter((d) => d.classList.contains('is-moving')).length,
    blur: cs.backdropFilter || cs.webkitBackdropFilter,
    shadow: cs.boxShadow,
    layer: (() => { const s = getComputedStyle(document.getElementById('rain-layer')); return { pos: s.position, pe: s.pointerEvents, z: s.zIndex }; })(),
  };
});
const median = st.widths[Math.floor(st.widths.length / 2)];
ok('B1 水滴宽度中位数 ≥ 12px、最大 ≥ 24px（第 120 轮偏小的修正）',
  median >= 12 && st.widths[st.widths.length - 1] >= 24,
  { median: +median.toFixed(1), max: +st.widths[st.widths.length - 1].toFixed(1) });
ok('B2 数量在 18~56 之间（按视口面积生成，不无限堆 DOM）',
  st.count >= 18 && st.count <= 56, { count: st.count });
ok('B3 约 20%~60% 水滴在滑动，其余静态',
  st.moving / st.count >= 0.2 && st.moving / st.count <= 0.6,
  { moving: st.moving, count: st.count });
ok('B4 每颗水滴都有 blur 折射 + 内外阴影（不是纯色圆点）',
  /blur\(\d/.test(st.blur) && /inset/.test(st.shadow), { blur: st.blur, shadow: st.shadow.slice(0, 60) });
ok('B5 雨滴层 fixed / pointer-events:none / z=6',
  st.layer.pos === 'fixed' && st.layer.pe === 'none' && st.layer.z === '6', st.layer);

// 60 帧耗时：装饰层不能把主线程拖到 30fps 以下
const frames = await page.evaluate(() => new Promise((resolve) => {
  const t0 = performance.now();
  let n = 0;
  function tick() { if (++n >= 60) resolve({ ms: Math.round(performance.now() - t0) }); else requestAnimationFrame(tick); }
  requestAnimationFrame(tick);
}));
ok('B6 连续 60 帧在 1.5s 内完成（不拖垮主线程）', frames.ms <= 1500, frames);

// CLS：铺水滴本身不能推动布局
const cls = await page.evaluate(() => new Promise((resolve) => {
  let v = 0;
  const ob = new PerformanceObserver((list) => { for (const e of list.getEntries()) if (!e.hadRecentInput) v += e.value; });
  ob.observe({ type: 'layout-shift', buffered: false });
  setTimeout(() => { ob.disconnect(); resolve(v); }, 600);
}));
ok('C1 铺水滴不产生 CLS', cls === 0, { cls });
ok('C2 全程零 JS 异常', errs.length === 0, errs.slice(0, 3));

await browser.close();
console.log(`\n第 121 轮雨滴修正：${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
