/* verify124.mjs — 第 124 轮：雨丝倾角与轨迹对齐、从顶端落下
   用户反馈：雨丝是斜的，却笔直下坠；且不是从最顶端开始。
   根因：tilt 是 6~13°，但 drift 只有 -20~-86px；110vh 落程下 10° 应走 ~190px。
   修复：drift = -tan(tilt) × (1.1h + len)；元素 top = -len，keyframes 从 0 到 110vh。
   契约：① 线轴与运动向量一致（drift 与 tan(tilt) 误差 ≤2%）；
         ② 每根雨丝 top = -height（下端点贴屏幕顶边，t=0 开始进入）；
         ③ 动画从 translate3d(0,0,0) 起步，到 110vh 结束；
         ④ 三档倾角 4~8 / 8~12 / 10~15°。
   用法：node tests/index/verify124.mjs（需先起 8895 静态服务） */
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

ok('A1 drift 由 tan(tilt) 现算：travel = 1.1h + len，drift = -tan × travel',
  /var travel = h \* 1\.1 \+ length;/.test(rainJs) &&
  /var drift = -Math\.tan\(tilt \* Math\.PI \/ 180\) \* travel;/.test(rainJs));
ok('A2 三档倾角区间 4~8 / 8~12 / 10~15°',
  /var TILT = \[\[4, 8\], \[8, 12\], \[10, 15\]\];/.test(rainJs));
ok('A3 起点在顶边之上：top = calc(-1 * var(--rain-len))',
  /top: calc\(-1 \* var\(--rain-len, 48px\)\);/.test(rainCss));
ok('A4 keyframes 从 0 起步、到 110vh（不再从 -30vh 半空开始）',
  /from \{ transform: translate3d\(0, 0, 0\) rotate/.test(rainCss) &&
  /to   \{ transform: translate3d\(var\(--rain-drift, -50px\), 110vh, 0\)/.test(rainCss));

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
  const h = window.innerHeight;
  const bad = [];
  for (const d of ds) {
    const cs = getComputedStyle(d);
    const tilt = parseFloat(cs.getPropertyValue('--rain-tilt'));
    const drift = parseFloat(cs.getPropertyValue('--rain-drift'));
    const len = parseFloat(cs.height);
    const want = -Math.tan(tilt * Math.PI / 180) * (h * 1.1 + len);
    if (Math.abs(drift - want) > Math.max(2, Math.abs(want) * 0.02)) {
      bad.push({ tilt, drift, want: +want.toFixed(1) });
    }
  }
  const tops = ds.map((d) => parseFloat(getComputedStyle(d).top));
  const lens = ds.map((d) => parseFloat(getComputedStyle(d).height));
  return {
    count: ds.length, bad: bad.slice(0, 4), badCount: bad.length,
    topOK: tops.every((t, i) => Math.abs(t + lens[i]) <= 1.5),
  };
});
ok('B1 每根雨丝的 drift 与 tan(tilt) 一致（线轴 = 运动方向）',
  st.badCount === 0, { badCount: st.badCount, sample: st.bad });
ok('B2 每根雨丝 top = -height（下端点贴屏幕顶边）',
  st.topOK === true, { count: st.count });
ok('B3 雨丝都有 rain-fall 动画且时长 >0',
  await page.evaluate(() => [...document.querySelectorAll('.rain-streak')].every((d) => {
    const cs = getComputedStyle(d);
    return cs.animationName === 'rain-fall' && parseFloat(cs.animationDuration) > 0;
  })));

// JS 不许再写 inline top（会覆盖 CSS 的 top:-len，回到「半空开始」）
const noInlineTop = await page.evaluate(() =>
  [...document.querySelectorAll('.rain-streak')].every((d) => d.style.top === ''));
ok('B4 JS 未写 inline top，起点完全由 CSS 的 -len 决定', noInlineTop === true);

ok('C1 全程零 JS 异常', errs.length === 0, errs.slice(0, 3));
await browser.close();
console.log(`\n第 124 轮雨丝轨迹：${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
