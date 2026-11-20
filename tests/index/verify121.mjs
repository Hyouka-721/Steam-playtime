/* verify121.mjs — 雨丝视觉质量（第 123 轮重写）
   第 121 轮这里测的是 DOM 水珠 + backdrop-filter；实测在均匀深色背景上
   模糊纯色仍是纯色，只剩灰边，用户确认「强行 blur(8px) 还是灰片」。
   第 123 轮换成雨丝，本套件改测：细长、渐隐、轻微模糊、无 backdrop、无人造圆片。
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

const rainJs = fs.readFileSync(ROOT + 'docs/rain.js', 'utf8');
const rainCss = fs.readFileSync(ROOT + 'docs/rain.css', 'utf8');
const rainCssCode = rainCss.replace(/\/\*[\s\S]*?\*\//g, '');
const rainJsCode = rainJs.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

ok('A1 已彻底移除 backdrop-filter / .rain-drop（灰片根因）',
  !/backdrop-filter/.test(rainCssCode) && !/backdrop-filter/.test(rainJsCode) &&
  !/\.rain-drop/.test(rainCssCode) && !/rain-drop'/.test(rainJsCode));
ok('A2 雨丝是上下渐隐的 linear-gradient（不是实心圆/条）',
  /linear-gradient\(/.test(rainCss) &&
  /rgba\(255, 255, 255, 0\) 0%/.test(rainCss) && /rgba\(255, 255, 255, 0\) 100%/.test(rainCss));
ok('A3 浅色主题改用蓝灰线，仍无 invert',
  /\[data-theme="cream"\] \.rain-streak \{/.test(rainCss) && !/invert\(1\)/.test(rainCss));
ok('A4 三档景深宽度 0.6~1.8px、长度 16~110px、速度 1.1~4.6s',
  /w: \[0\.6, 0\.9\]/.test(rainJs) && /len: \[16, 34\]/.test(rainJs) &&
  /w: \[1\.2, 1\.8\]/.test(rainJs) && /len: \[50, 110\]/.test(rainJs) &&
  /dur: \[1\.1, 2\.0\]/.test(rainJs) && /dur: \[2\.8, 4\.6\]/.test(rainJs));

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
await page.waitForTimeout(250);

const st = await page.evaluate(() => {
  const ds = [...document.querySelectorAll('.rain-streak')];
  const cs = getComputedStyle(ds[0]);
  return {
    count: ds.length,
    maxW: Math.max(...ds.map((d) => parseFloat(getComputedStyle(d).width))),
    minH: Math.min(...ds.map((d) => parseFloat(getComputedStyle(d).height))),
    maxH: Math.max(...ds.map((d) => parseFloat(getComputedStyle(d).height))),
    bg: cs.backgroundImage,
    blur: cs.filter,
    anim: cs.animationName,
    dur: cs.animationDuration,
    maxOp: Math.max(...ds.map((d) => parseFloat(getComputedStyle(d).opacity))),
  };
});
ok('B1 雨丝宽度 ≤2px、长度 16~120px（细长，不是圆片）',
  st.maxW <= 2 && st.minH >= 16 && st.maxH <= 120,
  { maxW: +st.maxW.toFixed(2), h: [+st.minH.toFixed(1), +st.maxH.toFixed(1)] });
ok('B2 背景是 linear-gradient、带 blur、动画名为 rain-fall',
  /linear-gradient/.test(st.bg) && /blur/.test(st.blur) && st.anim === 'rain-fall',
  { blur: st.blur, anim: st.anim });
ok('B3 透明度 ≤0.5（雨丝要轻，不能压字）', st.maxOp <= 0.5, { maxOp: st.maxOp });
ok('B4 数量 50~160（按面积生成，三档景深）', st.count >= 50 && st.count <= 160, { count: st.count });

const frames = await page.evaluate(() => new Promise((resolve) => {
  const t0 = performance.now(); let n = 0;
  function tick() { if (++n >= 60) resolve({ ms: Math.round(performance.now() - t0) }); else requestAnimationFrame(tick); }
  requestAnimationFrame(tick);
}));
ok('B5 60 帧 ≤1.5s（纯合成层动画，不拖主线程）', frames.ms <= 1500, frames);
ok('C1 铺雨丝零 CLS', await page.evaluate(() => new Promise((resolve) => {
  let v = 0; const ob = new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) v += e.value; });
  ob.observe({ type: 'layout-shift', buffered: false });
  setTimeout(() => { ob.disconnect(); resolve(v === 0); }, 500);
})) === true);
ok('C2 全程零 JS 异常', errs.length === 0, errs.slice(0, 3));

await browser.close();
console.log(`\n第 123 轮雨丝质量：${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
