/* verify120_watch.mjs — 雨丝氛围层（watch / My Watch List）
   第 123 轮改判：DOM 水珠 + backdrop-filter 在均匀背景上仍是灰片 → 雨丝。
   watch 恒 cinema，浅色规则不生效；开关、持久化、视图切换、CLS、宽度契约不变。
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

const html = fs.readFileSync(ROOT + 'docs/watch.html', 'utf8');
const rainJs = fs.readFileSync(ROOT + 'docs/rain.js', 'utf8');
const rainCss = fs.readFileSync(ROOT + 'docs/rain.css', 'utf8');
const rainCssCode = rainCss.replace(/\/\*[\s\S]*?\*\//g, '');
const ambienceJs = fs.readFileSync(ROOT + 'docs/ambience.js', 'utf8');

ok('A1 watch 以 v=7 引用 rain.css / rain.js，且不动 css44 / js35',
  /rain\.css\?v=7["']/.test(html) && /rain\.js\?v=7["']/.test(html) &&
  /watch\.css\?v=44["']/.test(html) && /watch\.js\?v=35["']/.test(html));
ok('A2 雨丝层在 body 首位、开关在 .w-foot（无 title 气泡）',
  /<body>\s*<div id="rain-layer" aria-hidden="true"><\/div>/.test(html) &&
  /id="ambience-seg"/.test(html) && /data-amb="rain"/.test(html));
ok('A3 watch 恒为 cinema：浅色规则不冲突，且没有 invert / backdrop-filter',
  /<html lang="zh-CN" data-theme="cinema">/.test(html) &&
  /\[data-theme="cream"\] \.rain-streak \{/.test(rainCss) &&
  !/filter:\s*invert\(1\)/.test(rainCssCode) && !/backdrop-filter/.test(rainCssCode));
ok('A4 与 index 共用同一份 rain.js（雨丝 / 三档景深）+ ambience 状态键',
  /el\.className = 'rain-streak'/.test(rainJs) &&
  /w: \[0\.6, 0\.9\]/.test(rainJs) &&
  /ambience\.mode/.test(ambienceJs));

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
await page.waitForFunction(() => document.querySelectorAll('#w-grid img').length > 100, null, { timeout: 15000 });
await page.waitForFunction(() => window.__rain && window.__rain.ready(), null, { timeout: 20000 });
await page.waitForTimeout(250);

const st = await page.evaluate(() => {
  const ds = [...document.querySelectorAll('.rain-streak')];
  const cs = getComputedStyle(ds[0]);
  return {
    enabled: window.__rain.enabled(), count: window.__rain.count(), sample: window.__rain.sample(),
    amb: window.__ambience.mode(),
    pressed: document.querySelector('#ambience-seg button[data-amb="rain"]').getAttribute('aria-pressed'),
    theme: document.documentElement.dataset.theme,
    cards: document.querySelectorAll('#w-grid img').length,
    bg: cs.backgroundImage, maxW: Math.max(...ds.map((d) => parseFloat(getComputedStyle(d).width))),
    layer: (() => { const l = document.getElementById('rain-layer'); const s = getComputedStyle(l); return { pos: s.position, pe: s.pointerEvents, z: s.zIndex, hidden: l.hidden }; })(),
  };
});
ok('B1 雨丝层就绪、默认开、已生成雨丝、linear-gradient 渐隐',
  st.enabled === true && st.count > 0 && st.sample.pixels > 0 && /linear-gradient/.test(st.bg),
  { count: st.count, pixels: st.sample.pixels });
ok('B2 cinema 主题、海报墙未受影响、雨丝宽度 ≤2px、层 fixed 不拦点击',
  st.theme === 'cinema' && st.cards > 100 && st.maxW <= 2 &&
  st.layer.pos === 'fixed' && st.layer.pe === 'none' && st.layer.z === '12',
  { theme: st.theme, cards: st.cards, maxW: +st.maxW.toFixed(2), layer: st.layer });
ok('B3 三态控件选中「雨滴」', st.amb === 'rain' && st.pressed === 'true', { amb: st.amb });

await page.click('#ambience-seg button[data-amb="off"]');
await page.waitForTimeout(250);
const off = await page.evaluate(() => ({
  enabled: window.__rain.enabled(), amb: window.__ambience.mode(), stored: localStorage.getItem('ambience.mode'),
  pressed: document.querySelector('#ambience-seg button[data-amb="rain"]').getAttribute('aria-pressed'),
  hidden: document.getElementById('rain-layer').hidden, sample: window.__rain.sample(),
}));
ok('B4 关：整层隐藏、localStorage=0、aria-pressed=false',
  off.enabled === false && off.amb === 'off' && off.stored === 'off' && off.pressed === 'false' && off.hidden === true && off.sample.pixels === 0, off);

await page.click('#ambience-seg button[data-amb="rain"]');
await page.waitForTimeout(250);
await page.reload({ waitUntil: 'load' });
await page.waitForFunction(() => document.querySelectorAll('#w-grid img').length > 100, null, { timeout: 15000 });
await page.waitForFunction(() => window.__rain && window.__rain.ready(), null, { timeout: 20000 });
await page.waitForFunction(() => window.__ambience && window.__ambience.mode() === 'rain', null, { timeout: 5000 });
ok('B5 重新打开后刷新持久化', await page.evaluate(() => window.__rain.enabled() === true && localStorage.getItem('ambience.mode') === 'rain'));

await page.evaluate(() => { const b = document.getElementById('w-avatar'); if (b) b.click(); });
await page.waitForTimeout(350);
const view = await page.evaluate(() => ({
  tlHidden: document.getElementById('w-tl').hidden,
  gridHidden: document.getElementById('w-grid').hidden,
  pressed: document.getElementById('w-avatar').getAttribute('aria-pressed'),
}));
ok('B6 雨丝层不拦点击：史蒂夫切到时间轴视图仍生效',
  view.tlHidden === false && view.gridHidden === true && view.pressed === 'true', view);

for (const w of [1440, 1280, 1088, 900, 390]) {
  await page.setViewportSize({ width: w, height: 900 });
  await page.waitForTimeout(180);
  const ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(`B7 ${w}px 零横向溢出`, ov <= 0, { ov });
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
ok('C1 开关切换零 CLS', cls === 0, { cls });

const rmCtx = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
const rm = await rmCtx.newPage();
await rm.goto(LOCAL + '?cb=' + Date.now(), { waitUntil: 'load' });
await rm.waitForFunction(() => window.__rain && window.__rain.ready(), null, { timeout: 20000 });
const rmSt = await rm.evaluate(() => ({
  enabled: window.__rain.enabled(), disabled: document.querySelector('#ambience-seg button[data-amb="rain"]').disabled,
  hidden: document.getElementById('rain-layer').hidden,
}));
ok('C2 prefers-reduced-motion 下强制关且按钮禁用',
  rmSt.enabled === false && rmSt.disabled === true && rmSt.hidden === true, rmSt);
await rmCtx.close();

ok('C3 全程零 JS 异常', errs.length === 0, errs.slice(0, 3));
await browser.close();
console.log(`\n雨丝（watch，第 123 轮）：${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
