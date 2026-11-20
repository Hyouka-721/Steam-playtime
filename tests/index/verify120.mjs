/* verify120.mjs — 雨滴氛围层（index / Game Time）
   第 121 轮改判说明：WebGL 只能输出颜色、采样不到页面背景，调不出「通透」；
   改成 DOM 水滴 + CSS backdrop-filter（真实折射背后页面）。原「着色器函数 /
   WebGL 出帧 / 采样像素」断言随之改为「DOM 水滴 / backdrop-filter / 水滴数」，
   理由写进各条 ok 文案；开关、持久化、CLS、五档宽度等契约一字未动。
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

ok('A1 两页均以 v=4 引用 rain.css / rain.js',
  /rain\.css\?v=4["']/.test(html) && /rain\.js\?v=4["']/.test(html) &&
  /rain\.css\?v=4["']/.test(watchHtml) && /rain\.js\?v=4["']/.test(watchHtml));
ok('A2 不动已上线版本号（css144 / app129 / fx19 原样保留）',
  /style\.css\?v=144["']/.test(html) && /app\.js\?v=129["']/.test(html) && /fx\.js\?v=19["']/.test(html));
ok('A3 第 121 轮改判：DOM 水滴 + backdrop-filter，不再依赖 WebGL',
  /<div id="rain-layer" aria-hidden="true"><\/div>/.test(html) &&
  /document\.createElement\('i'\)/.test(rainJs) &&
  /backdrop-filter: blur\(var\(--rain-blur/.test(rainCss) &&
  !/getContext\('webgl'/.test(rainJs) && !/rain-canvas/.test(html));
ok('A4 第 122 轮收敛：尺寸 8~24px、约三成下滑、数量封顶 36',
  /8 \+ Math\.pow\(rnd\(\), 1\.7\) \* 16/.test(rainJs) &&
  /rnd\(\) < 0\.30/.test(rainJs) &&
  /Math\.min\(36/.test(rainJs));
ok('A5 雨滴层与开关标记在 DOM（无 title 原生气泡，遵守 verify82 A2）',
  /<div id="rain-layer" aria-hidden="true">/.test(html) &&
  /id="rain-toggle"/.test(html) && !/id="rain-toggle"[^>]*title=/.test(html));
ok('A6 rain.css：fixed 全屏 / pointer-events:none / z-index 6 / 无 invert / 打印隐藏',
  /#rain-layer \{[\s\S]*?position: fixed;/.test(rainCss) &&
  /#rain-layer \{[\s\S]*?inset: 0;/.test(rainCss) &&
  /#rain-layer \{[\s\S]*?pointer-events: none;/.test(rainCss) &&
  /#rain-layer \{[\s\S]*?z-index: 6;/.test(rainCss) &&
  !/filter:\s*invert\(1\)/.test(rainCss) &&
  /@media print \{[\s\S]*?#rain-layer \{ display: none; \}/.test(rainCss));
ok('A7 圆角只用变量 / 50% / 2px 白名单（rain.css 未出现裸 px 圆角）',
  !/border-radius:\s*(?!var\(--r-|var\(--rain-|50%|2px)[\d.]+px/.test(rainCss));
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
await page.waitForFunction(() => window.__rain && window.__rain.ready(), null, { timeout: 20000 });
await page.waitForTimeout(300);

const st = await page.evaluate(() => ({
  ready: window.__rain.ready(),
  enabled: window.__rain.enabled(),
  count: window.__rain.count(),
  sample: window.__rain.sample(),
  pressed: document.getElementById('rain-toggle').getAttribute('aria-pressed'),
  disabled: document.getElementById('rain-toggle').disabled,
  layer: (() => {
    const l = document.getElementById('rain-layer');
    const s = getComputedStyle(l);
    return { hidden: l.hidden, pos: s.position, pe: s.pointerEvents, z: s.zIndex, kids: l.children.length };
  })(),
  sizes: [...document.querySelectorAll('.rain-drop')].map((d) => d.getBoundingClientRect().width),
  blur: getComputedStyle(document.querySelector('.rain-drop')).backdropFilter,
}));
ok('B1 水滴层就绪、默认开、已生成水滴',
  st.ready === true && st.enabled === true && st.count > 0 && st.sample.pixels > 0,
  { count: st.count, pixels: st.sample.pixels });
ok('B2 水滴实际有尺寸、backdrop-filter 含 blur（真实折射背景）',
  st.sizes.length === st.count && st.sizes.every((w) => w >= 7) && /blur\(/.test(st.blur),
  { min: Math.min(...st.sizes).toFixed(1), max: Math.max(...st.sizes).toFixed(1), blur: st.blur });
ok('B3 水滴层是 fixed 装饰层：不拦点击、z=6、不参与布局',
  st.layer.hidden === false && st.layer.pos === 'fixed' && st.layer.pe === 'none' && st.layer.z === '6', st.layer);
ok('B4 按钮初始态为开', st.pressed === 'true' && st.disabled === false);

// 开关 → 关
await page.click('#rain-toggle');
await page.waitForTimeout(250);
const off = await page.evaluate(() => ({
  enabled: window.__rain.enabled(),
  pressed: document.getElementById('rain-toggle').getAttribute('aria-pressed'),
  stored: localStorage.getItem('rain.enabled'),
  hidden: document.getElementById('rain-layer').hidden,
  sample: window.__rain.sample(),
}));
ok('B5 点开关关闭：整层隐藏、按钮态与 localStorage 同步为 0',
  off.enabled === false && off.pressed === 'false' && off.stored === '0' && off.hidden === true && off.sample.pixels === 0, off);

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
await rm.waitForFunction(() => window.__rain && window.__rain.ready(), null, { timeout: 20000 });
const rmSt = await rm.evaluate(() => ({
  enabled: window.__rain.enabled(),
  disabled: document.getElementById('rain-toggle').disabled,
  hidden: document.getElementById('rain-layer').hidden,
  moving: document.querySelectorAll('.rain-drop.is-moving').length,
  anim: getComputedStyle(document.querySelector('.rain-drop.is-moving') || document.querySelector('.rain-drop')).animationName,
}));
ok('C2 prefers-reduced-motion 下强制关、按钮禁用、无滑落动画',
  rmSt.enabled === false && rmSt.disabled === true && rmSt.hidden === true &&
  (rmSt.moving === 0 || rmSt.anim === 'none'), rmSt);
await rmCtx.close();

ok('C3 全程零 JS 异常', errs.length === 0, errs.slice(0, 3));
await browser.close();
console.log(`\n雨滴（index，第 121 轮 DOM 版）：${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
