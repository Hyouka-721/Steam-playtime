/* verify122.mjs — 雨丝密度与景深（第 123 轮重写）
   第 122 轮这里测「小水珠」的尺寸/透明度；第 123 轮换成雨丝后，
   本套件改测三档景深的数量分布、线宽/线长/速度差异，以及密度不压字。
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

ok('A1 数量按面积 9000 生成，50~160（替换旧的水珠 14~36）',
  /Math\.max\(50, Math\.min\(160, Math\.round\(\(w \* h\) \/ 9000\)\)\)/.test(rainJs));
ok('A2 三档景深齐备：远/中/近各有宽度、长度、速度区间',
  /w: \[0\.6, 0\.9\]/.test(rainJs) && /w: \[0\.9, 1\.2\]/.test(rainJs) && /w: \[1\.2, 1\.8\]/.test(rainJs) &&
  /dur: \[2\.8, 4\.6\]/.test(rainJs) && /dur: \[1\.8, 3\.0\]/.test(rainJs) && /dur: \[1\.1, 2\.0\]/.test(rainJs));
ok('A3 三档按 50% / 30% / 20% 分配（i%10 判定）',
  /i % 10 < 5 \? 0 : \(i % 10 < 8 \? 1 : 2\)/.test(rainJs));

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
  const widths = ds.map((d) => parseFloat(getComputedStyle(d).width));
  const lens = ds.map((d) => parseFloat(getComputedStyle(d).height));
  return {
    count: ds.length,
    minW: Math.min(...widths), maxW: Math.max(...widths),
    minL: Math.min(...lens), maxL: Math.max(...lens),
    far: widths.filter((w) => w < 0.9).length,
    near: widths.filter((w) => w >= 1.15).length,
  };
});
ok('B1 1440×900 下 120~160 根（按面积，不无限堆）',
  st.count >= 120 && st.count <= 160, { count: st.count });
ok('B2 线宽有细有粗（0.6~1.8px，远/近两档都存在）',
  st.minW >= 0.5 && st.maxW <= 2.1 && st.far > 0 && st.near > 0,
  { minW: +st.minW.toFixed(2), maxW: +st.maxW.toFixed(2), far: st.far, near: st.near });
ok('B3 线长跨度 ≥3 倍（近处长雨丝 + 远处短雨丝）',
  st.maxL / st.minL >= 3, { minL: +st.minL.toFixed(1), maxL: +st.maxL.toFixed(1) });

const frames = await page.evaluate(() => new Promise((resolve) => {
  const t0 = performance.now(); let n = 0;
  function tick() { if (++n >= 60) resolve({ ms: Math.round(performance.now() - t0) }); else requestAnimationFrame(tick); }
  requestAnimationFrame(tick);
}));
ok('B4 60 帧 ≤1.5s（160 根纯合成层，仍不拖主线程）', frames.ms <= 1500, frames);
for (const w of [1440, 900, 390]) {
  await page.setViewportSize({ width: w, height: 900 });
  await page.waitForTimeout(180);
  const ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(`B5 ${w}px 零横向溢出`, ov <= 0, { ov });
}
ok('C1 全程零 JS 异常', errs.length === 0, errs.slice(0, 3));

await browser.close();
console.log(`\n第 123 轮雨丝密度：${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
