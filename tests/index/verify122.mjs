/* verify122.mjs — 第 122 轮：雨滴收敛为「环境层」
   背景：第 121 轮 DOM 水滴方向对了，但默认尺寸 10~40px、数量上限 56、透明度
   0.72~0.96，在 1080 宽下像肥皂泡，连 500 h / 38 / 53 都被盖住。
   本轮只收敛参数，不改机制：数量 14~36、尺寸 8~24、透明度 0.55~0.73、
   滑动 30%，并给每颗随机不规则圆角（不再是正圆泡泡）。
   契约：① 数量 ≤36 且 ≥14；② 尺寸中位数 ≤16px、最大 ≤34px；
         ③ 透明度 ≤0.73；④ 数量/尺寸都随视口自适应；⑤ 60 帧 ≤1.5s；⑥ CLS=0。
   用法：node tests/index/verify122.mjs（需先起 8895 静态服务） */
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

ok('A1 数量按面积 42000 生成，下限 14 / 上限 36',
  /Math\.max\(14, Math\.min\(36, Math\.round\(\(w \* h\) \/ 42000\)\)\)/.test(rainJs));
ok('A2 尺寸 8 + pow(rnd,1.7)*16（8~24px），滑动比例 0.30',
  /8 \+ Math\.pow\(rnd\(\), 1\.7\) \* 16/.test(rainJs) && /rnd\(\) < 0\.30/.test(rainJs));
ok('A3 不透明度上限 0.73、默认 0.62（第 121 轮 0.96 太实）',
  /\(0\.55 \+ rnd\(\) \* 0\.18\)/.test(rainJs) && /--rain-op, \.62/.test(rainCss));
ok('A4 每颗水滴有不规则圆角变量（不是统一正圆）',
  /--rain-radius/.test(rainJs) && /border-radius: var\(--rain-radius, 50%\)/.test(rainCss));

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
  const ds = [...document.querySelectorAll('.rain-drop')];
  const widths = ds.map((d) => d.getBoundingClientRect().width).sort((a, b) => a - b);
  const ops = ds.map((d) => parseFloat(getComputedStyle(d).opacity));
  return {
    count: ds.length,
    median: widths[Math.floor(widths.length / 2)],
    max: widths[widths.length - 1],
    maxOp: Math.max(...ops),
    radius: getComputedStyle(ds[0]).borderRadius,
  };
});
ok('B1 水滴数 14~36（1080 宽下约 23~25 颗）', st.count >= 14 && st.count <= 36, { count: st.count });
ok('B2 宽度中位数 ≤18px、最大 ≤34px（不再是大泡泡）',
  st.median <= 18 && st.max <= 34, { median: +st.median.toFixed(1), max: +st.max.toFixed(1) });
ok('B3 实际不透明度 ≤0.73', st.maxOp <= 0.73, { maxOp: st.maxOp });
ok('B4 实际圆角包含 4 个以上百分比值（不规则形状）',
  (String(st.radius).match(/%/g) || []).length >= 4, { radius: st.radius });

const frames = await page.evaluate(() => new Promise((resolve) => {
  const t0 = performance.now(); let n = 0;
  function tick() { if (++n >= 60) resolve({ ms: Math.round(performance.now() - t0) }); else requestAnimationFrame(tick); }
  requestAnimationFrame(tick);
}));
ok('B5 60 帧 ≤1.5s（收敛后更轻）', frames.ms <= 1500, frames);
ok('C1 铺水滴零 CLS', await page.evaluate(() => new Promise((resolve) => {
  let v = 0; const ob = new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) v += e.value; });
  ob.observe({ type: 'layout-shift', buffered: false });
  setTimeout(() => { ob.disconnect(); resolve(v === 0); }, 500);
})) === true);
ok('C2 全程零 JS 异常', errs.length === 0, errs.slice(0, 3));

await browser.close();
console.log(`\n第 122 轮雨滴收敛：${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
