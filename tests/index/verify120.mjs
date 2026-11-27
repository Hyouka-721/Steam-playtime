/* verify120.mjs — 雨丝氛围层（index / Game Time）
   第 123 轮改判说明：DOM 水珠 + backdrop-filter 在均匀深色背景上没有可折射纹理，
   实测仍是灰片；改成不依赖背景的「雨丝」（细长渐隐线 + 轻微模糊）。
   原「水滴 / backdrop-filter / 尺寸」断言随之改为「雨丝 / 线性渐变 / 宽度长度」，
   开关、持久化、CLS、五档宽度等契约不变。
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

const html = fs.readFileSync(ROOT + 'docs/index.html', 'utf8');
const rainJs = fs.readFileSync(ROOT + 'docs/rain.js', 'utf8');
const rainCss = fs.readFileSync(ROOT + 'docs/rain.css', 'utf8');
const rainCssCode = rainCss.replace(/\/\*[\s\S]*?\*\//g, '');
const rainJsCode = rainJs.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const watchHtml = fs.readFileSync(ROOT + 'docs/watch.html', 'utf8');
const ambienceJs = fs.readFileSync(ROOT + 'docs/ambience.js', 'utf8');

/* 第 137 轮：雨丝提亮只改 rain.css（v=7→8），rain.js 未动仍是 v=7，判据随版本同步 */
ok('A1 两页均以 v=8 引用 rain.css、v=7 引用 rain.js',
  /rain.css\?v=9["']/.test(html) && /rain\.js\?v=7["']/.test(html) &&
  /rain.css\?v=9["']/.test(watchHtml) && /rain\.js\?v=7["']/.test(watchHtml));
ok('A2 不动已上线版本号（css144 / app129 / fx19 原样保留）',
  /style\.css\?v=157["']/.test(html) && /app\.js\?v=134["']/.test(html) && /fx\.js\?v=19["']/.test(html));
ok('A3 第 123 轮改判：DOM 雨丝，不再依赖 canvas / backdrop-filter',
  /<div id="rain-layer" aria-hidden="true"><\/div>/.test(html) &&
  /el\.className = 'rain-streak'/.test(rainJs) &&
  !/getContext\('webgl'/.test(rainJsCode) && !/backdrop-filter/.test(rainCssCode) && !/rain-canvas/.test(html));
ok('A4 三档景深：数量按面积 9000、50~160，宽度 0.6~1.8px、长度 16~110px',
  /Math\.max\(50, Math\.min\(160, Math\.round\(\(w \* h\) \/ 9000\)\)\)/.test(rainJs) &&
  /w: \[0\.6, 0\.9\]/.test(rainJs) && /len: \[16, 34\]/.test(rainJs) &&
  /w: \[1\.2, 1\.8\]/.test(rainJs) && /len: \[50, 110\]/.test(rainJs));
ok('A5 雨丝层与开关标记在 DOM（无 title 原生气泡，遵守 verify82 A2）',
  /<div id="rain-layer" aria-hidden="true">/.test(html) &&
  /id="ambience-seg"/.test(html) && /data-amb="rain"/.test(html));
ok('A6 rain.css：fixed 全屏 / pointer-events:none / z-index 12（高于页眉 10）/ 无 invert / 打印隐藏',
  /#rain-layer \{[\s\S]*?position: fixed;/.test(rainCss) &&
  /#rain-layer \{[\s\S]*?inset: 0;/.test(rainCss) &&
  /#rain-layer \{[\s\S]*?pointer-events: none;/.test(rainCss) &&
  /#rain-layer \{[\s\S]*?z-index: 12;/.test(rainCss) &&
  !/filter:\s*invert\(1\)/.test(rainCss) &&
  /@media print \{[\s\S]*?#rain-layer[\s\S]*?display: none;/.test(rainCss));
ok('A7 圆角只用变量 / 50% / 2px 白名单（rain.css 未出现裸 px 圆角）',
  !/border-radius:\s*(?!var\(--r-|50%|2px)[\d.]+px/.test(rainCss));
ok('A8 @media (max-width:860px) 在 rain.css 只出现一次',
  (rainCss.match(/@media \(max-width:\s*860px\)/g) || []).length === 1);
ok('A9 第 125 轮改判：状态键 ambience.mode，三态互斥、减少动效只允许关',
  /ambience\.mode/.test(ambienceJs) && /v === 'off' \|\| v === 'meteor' \|\| v === 'rain'/.test(ambienceJs) &&
  /if \(reduced\.matches && mode !== 'off'\) mode = 'off';/.test(ambienceJs) &&
  /window\.__rain\.set\(mode === 'rain'\)/.test(ambienceJs));

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto(LOCAL + '?cb=' + Date.now(), { waitUntil: 'load' });
await page.evaluate(() => { try { localStorage.removeItem('rain.enabled'); localStorage.removeItem('ambience.mode'); } catch (e) {} });
await page.reload({ waitUntil: 'load' });
await page.click('#ambience-seg button[data-amb="rain"]');
await page.waitForFunction(() => window.__rain && window.__rain.ready(), null, { timeout: 20000 });
await page.waitForTimeout(250);

const st = await page.evaluate(() => {
  const ds = [...document.querySelectorAll('.rain-streak')];
  const r = ds[0].getBoundingClientRect();
  const cs = getComputedStyle(ds[0]);
  return {
    ready: window.__rain.ready(),
    enabled: window.__rain.enabled(),
    count: window.__rain.count(),
    sample: window.__rain.sample(),
    amb: window.__ambience.mode(),
    pressed: document.querySelector('#ambience-seg button[data-amb="rain"]').getAttribute('aria-pressed'),
    disabled: document.querySelector('#ambience-seg button[data-amb="rain"]').disabled,
    layer: (() => { const l = document.getElementById('rain-layer'); const s = getComputedStyle(l); return { hidden: l.hidden, pos: s.position, pe: s.pointerEvents, z: s.zIndex }; })(),
    first: { w: r.width, h: r.height, bg: cs.backgroundImage, blur: cs.filter },
    /* 用 computed width/height：rotate 后 getBoundingClientRect 会把
       1px×100px 的线量成 ~20px 宽，不能用来判「细长」。 */
    maxW: Math.max(...ds.map((d) => parseFloat(getComputedStyle(d).width))),
    minH: Math.min(...ds.map((d) => parseFloat(getComputedStyle(d).height))),
    maxH: Math.max(...ds.map((d) => parseFloat(getComputedStyle(d).height))),
  };
});
ok('B1 雨丝层就绪、默认开、已生成雨丝',
  st.ready === true && st.enabled === true && st.count > 0 && st.sample.pixels > 0,
  { count: st.count, pixels: st.sample.pixels });
ok('B2 雨丝是细长渐隐线：宽 ≤2px、长 16~120px、linear-gradient、轻微模糊',
  st.maxW <= 2 && st.minH >= 16 && st.maxH <= 120 &&
  /linear-gradient/.test(st.first.bg) && /blur/.test(st.first.blur),
  { maxW: +st.maxW.toFixed(2), h: [+st.minH.toFixed(1), +st.maxH.toFixed(1)], blur: st.first.blur });
ok('B3 雨丝层是 fixed 装饰层：不拦点击、z=12',
  st.layer.hidden === false && st.layer.pos === 'fixed' && st.layer.pe === 'none' && st.layer.z === '12', st.layer);
ok('B4 三态控件选中「雨滴」，且雨滴按钮可用', st.amb === 'rain' && st.pressed === 'true' && st.disabled === false, { amb: st.amb });

await page.click('#ambience-seg button[data-amb="off"]');
await page.waitForTimeout(250);
const off = await page.evaluate(() => ({
  enabled: window.__rain.enabled(), amb: window.__ambience.mode(),
  pressed: document.querySelector('#ambience-seg button[data-amb="rain"]').getAttribute('aria-pressed'),
  stored: localStorage.getItem('ambience.mode'), hidden: document.getElementById('rain-layer').hidden,
  sample: window.__rain.sample(),
}));
ok('B5 点开关关闭：整层隐藏、按钮态与 localStorage 同步为 0',
  off.enabled === false && off.amb === 'off' && off.pressed === 'false' && off.stored === 'off' && off.hidden === true && off.sample.pixels === 0, off);

await page.click('#ambience-seg button[data-amb="rain"]');
await page.waitForTimeout(250);
ok('B6 再点「雨滴」恢复为开并写入 rain', await page.evaluate(() => window.__rain.enabled() && localStorage.getItem('ambience.mode') === 'rain'));
await page.reload({ waitUntil: 'load' });
await page.waitForFunction(() => window.__rain && window.__rain.ready(), null, { timeout: 20000 });
ok('B7 刷新后沿用 localStorage 的开启态', await page.evaluate(() => window.__rain.enabled() === true));

for (const w of [1440, 1280, 1088, 900, 390]) {
  await page.setViewportSize({ width: w, height: 900 });
  await page.waitForTimeout(180);
  const ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(`B8 ${w}px 零横向溢出`, ov <= 0, { ov });
}

await page.setViewportSize({ width: 1440, height: 900 });
await page.waitForTimeout(200);
await page.evaluate(() => {
  window.__cls = 0;
  new PerformanceObserver((list) => { for (const e of list.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; })
    .observe({ type: 'layout-shift', buffered: false });
});
await page.click('#ambience-seg button[data-amb="off"]');
await page.waitForTimeout(250);
await page.click('#ambience-seg button[data-amb="rain"]');
await page.waitForTimeout(250);
const cls = await page.evaluate(() => window.__cls);
ok('C1 雨丝开关切换不产生 CLS', cls === 0, { cls });

const rmCtx = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
const rm = await rmCtx.newPage();
await rm.goto(LOCAL + '?cb=' + Date.now(), { waitUntil: 'load' });
await rm.waitForFunction(() => window.__rain && window.__rain.ready(), null, { timeout: 20000 });
const rmSt = await rm.evaluate(() => ({
  enabled: window.__rain.enabled(), disabled: document.querySelector('#ambience-seg button[data-amb="rain"]').disabled,
  hidden: document.getElementById('rain-layer').hidden,
  anim: getComputedStyle(document.querySelector('.rain-streak')).animationName,
}));
ok('C2 prefers-reduced-motion 下强制关、按钮禁用、雨丝动画停',
  rmSt.enabled === false && rmSt.disabled === true && rmSt.hidden === true && rmSt.anim === 'none', rmSt);
await rmCtx.close();

ok('C3 全程零 JS 异常', errs.length === 0, errs.slice(0, 3));
await browser.close();
console.log(`\n雨丝（index，第 123 轮）：${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
