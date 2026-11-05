/* online108.mjs — 第 108 轮线上复验：流星特效视觉优化
 *
 * 与 verify108 同判据，直接 fetch 线上 CSS/JS 取证，避免「线上还是旧版却全绿」。
 * 用法：cd 到仓库根后 node tests/online/online108.mjs（须等本轮上线后再跑）
 */
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');
const BASE = 'https://hyouka-721.github.io/Steam-playtime/';
let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('PASS  ' + name + (extra === undefined ? '' : ' — ' + JSON.stringify(extra))); }
  else { fail++; console.log('FAIL  ' + name + ' — ' + JSON.stringify(extra)); }
};

const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const errs = [];
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
const page = await ctx.newPage();
page.on('pageerror', (e) => errs.push(String(e)));
await page.goto(BASE + '?t=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('#lt-list > .rank-item', { state: 'visible', timeout: 60000 });
await page.waitForTimeout(700);

/* ---------- A 线上源码取证 ---------- */
const ver = await page.evaluate(() => {
  const h = document.documentElement.outerHTML;
  return {
    css: (h.match(/style\.css\?v=(\d+)/) || [])[1],
    app: (h.match(/app\.js\?v=(\d+)/) || [])[1],
    fx: (h.match(/fx\.js\?v=(\d+)/) || [])[1],
  };
});
ok('A1 线上版本 CSS 133 / APP 119 / FX 18', ver.css === '133' && ver.app === '119' && ver.fx === '18', ver);
const js = await page.evaluate(async () => {
  const r = await fetch('fx.js?v=18&t=' + Date.now(), { cache: 'no-store' });
  return r.ok ? r.text() : '';
});
ok('A2 线上 fx.js 已加载且为第 109 轮密度回调版（密度 / 亮度 / 层次 / 渐隐 / 内容避让）', !!js &&
  /spawnPerSec:\s*\[1\.10,\s*2\.10\]/.test(js) && /maxAlive:\s*10/.test(js) &&
  /alpha:\s*\[0\.20,\s*0\.36\]/.test(js) &&
  /layers:\s*\[/.test(js) && /fadeOutFrac/.test(js) && /avoidAlpha/.test(js) &&
  /col: colors\.meteor\.slice\(\)/.test(js) && /g\.addColorStop\(0\.65/.test(js), { len: js.length });
const cssSrc = await page.evaluate(async () => {
  const r = await fetch('style.css?v=133&t=' + Date.now(), { cache: 'no-store' });
  return r.ok ? r.text() : '';
});
const fxColors = [...cssSrc.matchAll(/--fx-meteor:\s*(#[0-9a-f]{6})/gi)].map((m) => m[1]);
ok('A3 线上两套主题特效色已去饱和', !!cssSrc &&
  fxColors.length === 2 && fxColors.includes('#c9ad8e') && fxColors.includes('#bfa677'), fxColors);
ok('A4 线上画布层级与交互隔离不变',
  /#fx-canvas \{[^}]*pointer-events: none/.test(cssSrc) && /#fx-canvas \{[^}]*z-index: 20/.test(cssSrc));

/* ---------- B 线上亮度 / 密度 / 开关 ---------- */
/* 逐像素采样：头部亮点只有 1–3px，每 16 像素抽 1 会大幅低估峰值 */
const sample = () => page.evaluate(() => {
  const c = document.getElementById('fx-canvas');
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let n = 0, max = 0;
  const total = d.length / 4;
  for (let i = 3; i < d.length; i += 4) {
    const a = d[i];
    if (a > 0) { n++; if (a > max) max = a; }
  }
  return { n, max, total };
});
// 观察窗 ≥5s，避免整段错过流星生命周期而误判
let peak = 0, ratio = 0, maxN = 0;
for (let i = 0; i < 24; i++) {
  const s = await sample();
  peak = Math.max(peak, s.max);
  maxN = Math.max(maxN, s.n);
  ratio = Math.max(ratio, s.n / s.total);
  await page.waitForTimeout(220);
}
// 第 109 轮：密度提高后多颗光带局部叠加，上限同步放宽到 0.67（仍低于改造前 0.72+）
ok('B1 线上画面峰值透明度 ≤0.67、无亮斑', peak <= 170, peak);
ok('B1b 线上确有流星划过且可见（峰值显著高于静态底噪）', peak >= 30 && maxN >= 30,
  { peak, maxN });
ok('B2 线上非透明像素占比 ≤1.5%', ratio <= 0.015, Math.round(ratio * 10000) / 10000);
ok('B3 线上两态开关有效',
  (await page.evaluate(() => window.__fx.mode())) === 'meteor' &&
  (await page.evaluate(() => window.__fx.toggle())) === 'off' &&
  (await page.evaluate(() => window.__fx.toggle())) === 'meteor');

/* ---------- C 线上尺寸与稳定性 ---------- */
const overflow = [];
for (const w of [1440, 1088, 390]) {
  await page.setViewportSize({ width: w, height: 900 });
  await page.waitForTimeout(300);
  const o = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  overflow.push({ w, doc: o });
}
ok('C1 线上三档宽度零横向溢出', overflow.every((x) => x.doc <= 0), overflow);
const cls = await page.evaluate(() =>
  performance.getEntriesByType('layout-shift').reduce((a, e) => a + (e.hadRecentInput ? 0 : e.value), 0));
ok('C2 线上 CLS ≈ 0', cls < 0.01, cls);
ok('Z1 线上全程零 JS 异常', errs.length === 0, errs);

await browser.close();
console.log('\n===== online108 ' + pass + '/' + (pass + fail) + ' PASS，FAIL=' + fail + ' =====');
process.exit(fail ? 1 : 0);
