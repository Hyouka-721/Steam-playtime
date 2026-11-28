/* verify141.mjs — 第 141 轮：双层真实 DOM 主题切换（让雨丝/流星不冻结）
 * 底层真页面保持旧主题 live；揭示层 #liquid-reveal 克隆视觉内容套新主题，
 * 用同一个 #liquidClip 逐帧揭示；雨丝(z12)/流星(z20)浮在揭示层(z11)之上全程连续。
 * 用法：node tests/index/verify141.mjs（需先起 8895 服务） */
import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');
const ROOT = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const BASE = 'http://127.0.0.1:8895/';
let pass = 0, fail = 0;
const ok = (n, c, x) => {
  c ? (pass++, console.log('PASS ', n, x === undefined ? '' : '— ' + JSON.stringify(x)))
    : (fail++, console.log('FAIL ', n, '— ' + JSON.stringify(x)));
};

const html = fs.readFileSync(ROOT + 'docs/index.html', 'utf8');
const css = fs.readFileSync(ROOT + 'docs/style.css', 'utf8');
const js = fs.readFileSync(ROOT + 'docs/app.js', 'utf8');
const cssPlain = css.replace(/\/\*[\s\S]*?\*\//g, '');

// ── A 静态契约 ──
ok('A1 版本 style.css v=159 / app.js v=137',
  /style\.css\?v=159/.test(html) && /app\.js\?v=137/.test(html),
  '理由：第142轮改了 css/js 两文件与 HTML 内联首帧脚本，按红线2各 bump 一次');

ok('A2 揭示层双层 DOM：克隆函数 + aria-hidden + inert + data-theme',
  /function buildLiquidReveal/.test(js) &&
  /cloneNode\(true\)/.test(js) &&
  /reveal\.setAttribute\('aria-hidden',\s*'true'\)/.test(js) &&
  /reveal\.setAttribute\('inert',\s*''\)/.test(js) &&
  /reveal\.dataset\.theme\s*=\s*id/.test(js),
  '理由：揭示层必须克隆视觉内容、套新主题变量、彻底屏蔽无障碍与交互');

ok('A3 弃用 VT 快照：applyThemeLiquid 内不再调用 startViewTransition',
  !/function applyThemeLiquid[\s\S]{0,1600}document\.startViewTransition\(/.test(js) &&
  /document\.body\.appendChild\(reveal\)/.test(js),
  '理由：第141轮核心变更——用双层 DOM 取代整页静态快照；能力探针若保留仅在回退条件里');

ok('A4 揭示层 z-index=11 卡在内容(10)与雨丝(12)/流星(20)之间',
  /#liquid-reveal\s*\{[^}]*z-index:\s*11/.test(cssPlain) &&
  /#rain-layer\s*\{[^}]*z-index:\s*12/.test(fs.readFileSync(ROOT + 'docs/rain.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')) &&
  /z-index:\s*20/.test(cssPlain),
  '理由：z=11 是核心——高于内容、低于特效层，雨丝/流星才浮在揭示层之上全程 live');

ok('A5 克隆层剥 id 换 .lr-id-* class，样式补回 + 无 id 重复',
  /function stripCloneIds/.test(js) &&
  /el\.removeAttribute\('id'\)/.test(js) &&
  /'lr-id-' \+ id/.test(js) &&
  /#liquid-reveal\s+\.lr-id-lt-detail/.test(cssPlain) &&
  /#liquid-reveal\s+\.view\.active\.lr-id-view-data/.test(cssPlain),
  '理由：index.html 有 51 个 id，克隆后必须剥掉；依赖 id 的布局用 class 版补回，且 grid 规则仍限定 .active');

ok('A6 结束顺序：先 applyTheme 再移除揭示层（杜绝旧色闪回）',
  /const finish = \(\) => \{[\s\S]{0,400}applyTheme\(id, \{ announce \}\)[\s\S]{0,120}cleanup\(\)/.test(js) &&
  /if \(reveal\.parentNode\) reveal\.remove\(\)/.test(js),
  '理由：底层先切到新主题、再揭掉覆盖层，移除瞬间不会闪回旧主题');

ok('A7 复用 liquidPath 三段式 + rAF 逐帧 + 2040ms',
  /function liquidPath/.test(js) && /p < 0\.32/.test(js) && /p < 0\.52/.test(js) &&
  /requestAnimationFrame\(frame\)/.test(js) && /LIQUID_DUR\s*=\s*2040/.test(js),
  '理由：液体揭示效果完整保留，时长 1.2× 不变');

ok('A8 互斥与清理：state.vt 锁 + liquidAbort + switchView 打断 + pagehide',
  /state\.vt\s*=\s*true/.test(js) &&
  /let liquidAbort\s*=\s*null/.test(js) &&
  /liquidAbort\(\)/.test(js) &&
  /window\.addEventListener\('pagehide'/.test(js),
  '理由：连点/切视图/离页都要清理揭示层，不叠加、不锁死');

ok('A9 回退：reduced-motion / 无 clip-path:url / 克隆抛错 → 直接 applyTheme',
  /prefers-reduced-motion: reduce/.test(js) &&
  /CSS\.supports\('clip-path',\s*'url\(#x\)'\)/.test(js) &&
  /catch \(e\)\s*\{\s*applyTheme\(id, \{ announce \}\); return; \}/.test(js),
  '理由：任何异常都回退成无动画直接切，行为等同原版');

// ── B 运行时取证 ──
const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto(BASE + 'index.html?cb=' + Date.now(), { waitUntil: 'load' });
await p.waitForSelector('#theme-light', { timeout: 10000 });
await p.waitForFunction(() => window.__rain && window.__rain.ready && window.__rain.ready(), { timeout: 10000 });
await p.waitForTimeout(500);

// 打开雨丝，取证用
await p.evaluate(() => { if (window.__ambience) window.__ambience.set('rain'); else window.__rain.set(true); });
await p.waitForTimeout(300);

// 强制回到 cream 以便测浅→深（用无动画直切，避免干扰采样）
await p.evaluate(() => {
  if (document.documentElement.dataset.theme !== 'cream') {
    document.documentElement.dataset.theme = 'cream';
  }
});
await p.waitForTimeout(300);

const baseNodes = await p.evaluate(() => document.body.querySelectorAll('*').length);
const domBefore = await p.evaluate(() => ({
  ids: Array.from(document.querySelectorAll('[id]')).map(e => e.id),
  theme: document.documentElement.dataset.theme,
  rainCount: window.__rain.count()
}));
ok('B1 首屏就位：主题有效、雨丝已建、无重复 id',
  ['cream', 'cinema'].includes(domBefore.theme) && domBefore.rainCount > 0 &&
  new Set(domBefore.ids).size === domBefore.ids.length,
  { theme: domBefore.theme, rain: domBefore.rainCount, ids: domBefore.ids.length });

/* ── 核心取证：切换期间雨丝 animation 不中断 ──
   取第一根雨丝，采样其 rain-fall animation 的 currentTime 与元素 top。
   如果 VT 快照方案（或任何会重建雨丝 DOM 的方案），动画在揭示期间会冻结/重置。
   本方案揭示层不克隆雨丝（z=11 < 12），真实雨丝 DOM 全程未被触碰 → currentTime 持续增长。 */
const RAIN_SAMPLES = [];
const sampler = async () => {
  const s = await p.evaluate(() => {
    const el = document.querySelector('#rain-layer .rain-streak');
    if (!el) return null;
    const anims = el.getAnimations().filter(a => (a.animationName || (a.effect && a.effect.getKeyframes && '') || '') === 'rain-fall');
    const anim = el.getAnimations()[0];
    return {
      t: performance.now(),
      currentTime: anim ? Number(anim.currentTime) : -1,
      playState: anim ? anim.playState : 'none',
      top: el.getBoundingClientRect().top,
      inRealLayer: el.closest('#rain-layer') !== null,
      revealHasRain: !!document.querySelector('#liquid-reveal .rain-streak'),
      bodyTp: getComputedStyle(document.body).transitionProperty,
      cardTp: getComputedStyle(document.querySelector('.card')).transitionProperty,
      htmlTp: getComputedStyle(document.documentElement).transitionProperty,
      scrollbarColor: getComputedStyle(document.documentElement).scrollbarColor,
      scrollThumbInline: document.documentElement.style.getPropertyValue('--scroll-thumb').trim(),
      scrollTrackInline: document.documentElement.style.getPropertyValue('--scroll-track').trim(),
      revTheme: (() => { const r = document.getElementById('liquid-reveal'); return r ? r.dataset.theme : null; })(),
      revOverflow: (() => { const r = document.getElementById('liquid-reveal'); return r ? getComputedStyle(r).overflowY : null; })(),
      revHasOwnScrollbar: (() => { const r = document.getElementById('liquid-reveal'); return r ? r.offsetWidth - r.clientWidth : null; })(),
      revW: (() => { const r = document.getElementById('liquid-reveal'); return r ? Math.round(r.getBoundingClientRect().width) : null; })(),
      clientW: document.documentElement.clientWidth
    };
  });
  if (s) RAIN_SAMPLES.push(s);
};

// 启动主题切换（不 await），期间高频采样
await p.evaluate(() => document.getElementById('theme-light').click());
for (let i = 0; i < 10; i++) { await sampler(); await p.waitForTimeout(180); }

// 采样期间也取一次揭示层状态
const during = await p.evaluate(() => {
  const rev = document.getElementById('liquid-reveal');
  return {
    liquid: document.documentElement.classList.contains('liquid-vt'),
    reveal: !!rev,
    ariaHidden: rev && rev.getAttribute('aria-hidden'),
    inert: rev && rev.hasAttribute('inert'),
    clip: rev ? getComputedStyle(rev).clipPath : 'none',
    z: rev ? getComputedStyle(rev).zIndex : 'none',
    revIds: rev ? Array.from(rev.querySelectorAll('[id]')).map(e => e.id) : []
  };
});

const times = RAIN_SAMPLES.map(s => s.currentTime);
const tops = RAIN_SAMPLES.map(s => s.top);
// currentTime 单调递增（允许 ±1ms 抖动），且跨度足够大（>500ms）
let monotonic = true, grows = 0;
for (let i = 1; i < times.length; i++) {
  if (times[i] >= times[i - 1]) grows++;
  else if (times[i] < times[i - 1] - 2) monotonic = false;
}
const timeSpan = times.length ? times[times.length - 1] - times[0] : 0;

ok('B2 ★切换期间雨丝 animation 不冻结：currentTime 持续增长',
  times.length >= 5 && monotonic && grows >= times.length - 2 && timeSpan > 800,
  { samples: times.length, spanMs: Math.round(timeSpan), times: times.map(t => Math.round(t)) });

ok('B3 ★雨丝元素位置在揭示期间持续移动',
  tops.length >= 5 && new Set(tops.map(t => Math.round(t))).size >= 3,
  { distinctTops: new Set(tops.map(t => Math.round(t))).size, tops: tops.map(t => Math.round(t)) });

ok('B4 ★雨丝始终在真实层、揭示层不含雨丝副本（天然连续）',
  RAIN_SAMPLES.every(s => s.inRealLayer === true && s.revealHasRain === false),
  { allInReal: RAIN_SAMPLES.every(s => s.inRealLayer), anyCloned: RAIN_SAMPLES.some(s => s.revealHasRain) });

/* 第 141 轮修闪回归：动画期间全页颜色过渡必须冻结为 none，
   否则揭示层揭掉瞬间底层从旧色渐变 → 闪一下（诊断实测 body 250ms 渐变）。 */
const withRev = RAIN_SAMPLES.filter(s => s.bodyTp !== undefined);
ok('B4b ★修闪：动画期间 html/body/卡片颜色过渡全冻结为 none（含 html 自身）',
  withRev.length >= 3 &&
  withRev.every(s => s.bodyTp === 'none' && s.cardTp === 'none' && s.htmlTp === 'none'),
  { samples: withRev.length, htmlTp: withRev[0]?.htmlTp, bodyTp: withRev[0]?.bodyTp, cardTp: withRev[0]?.cardTp });

/* 补修3/4：滚动条轨道背景跳变 + 微小位移（用户二次截图：柱子变色了但背后仍跳、点击时画面微移）。
   ① 轨道透出 html 背景 → html 自身过渡必须冻结（`*` 不含 html，补修4 已加）。
   ② 不能用 scrollbar-color —— 它会切到系统原生滚动条（宽度变）→ 位移；
      改由内联 --scroll-thumb 驱动 ::-webkit-scrollbar-thumb，宽度恒 10px 零位移。 */
const revSamples = withRev.filter(s => s.revTheme);
ok('B4c ★修闪4：scrollbar-color 保持 auto（不切原生滚动条，零宽度变化）+ thumb 锁目标色',
  revSamples.length >= 3 &&
  revSamples.every(s => s.scrollThumbInline && s.scrollThumbInline.length > 0) &&
  revSamples.every(s => s.scrollbarColor === 'auto' || /^auto/.test(s.scrollbarColor || 'auto')) &&
  revSamples.every(s => s.revOverflow === 'hidden' && s.revHasOwnScrollbar === 0) &&
  revSamples.every(s => s.revW === s.clientW),
  { thumb: revSamples[0]?.scrollThumbInline, sbColor: revSamples[0]?.scrollbarColor,
    overflow: revSamples[0]?.revOverflow, ownSb: revSamples[0]?.revHasOwnScrollbar,
    revW: revSamples[0]?.revW, clientW: revSamples[0]?.clientW });

// 直接守卫「反色」：浅→深时动画期滚动条色应已是 cinema 的 #2c2c37，不是 cream 的 #dccdbb
/* 补修5：轨道背景跳变（用户：滑块立刻变色、轨道背后背景要等结束才变）。
   根因是 track 原为 transparent，透出 html 背景；html 背景要等 finish 才切。
   现改为 track 取 --scroll-track 并在动画首帧一起锁定 → 滑块与轨道同步变色。 */
ok('B4e ★修闪5：动画期滚动条轨道色也已锁定目标主题（与滑块同步，不滞后到结束）',
  revSamples.length >= 3 &&
  revSamples.every(s => s.scrollTrackInline && s.scrollTrackInline.length > 0) &&
  revSamples.every(s => s.scrollTrackInline.toLowerCase() === '#0b0b0e'),
  { trackInline: revSamples[0]?.scrollTrackInline, thumbInline: revSamples[0]?.scrollThumbInline });

const creamThumb = '#dccdbb', cinemaThumb = '#2c2c37';
ok('B4d ★修闪3：浅→深动画期滚动条已是影院黑色（不是旧米色，杜绝反色闪）',
  revSamples.length >= 3 &&
  revSamples.every(s => s.revTheme === 'cinema' && s.scrollThumbInline.toLowerCase() === cinemaThumb) &&
  revSamples.every(s => s.scrollThumbInline.toLowerCase() !== creamThumb),
  { revTheme: revSamples[0]?.revTheme, thumb: revSamples[0]?.scrollThumbInline });

ok('B5 揭示层属性：aria-hidden + inert + clip-path + z=11',
  during.reveal === true && during.ariaHidden === 'true' && during.inert === true &&
  /url\(.*liquidClip/.test(during.clip) && during.z === '11', during);

ok('B6 揭示层无重复 id（克隆已剥净）',
  during.revIds.length === 0, { revIds: during.revIds.slice(0, 8) });

// 等待动画结束
await p.waitForTimeout(1400);
const after = await p.evaluate(() => ({
  theme: document.documentElement.dataset.theme,
  liquid: document.documentElement.classList.contains('liquid-vt'),
  revealGone: !document.getElementById('liquid-reveal'),
  d: document.getElementById('liquidPath').getAttribute('d'),
  // 排除 toast（announce:true 正常弹出的「主题：影院黑」，1.5s 后自行移除）
  domNodes: document.body.querySelectorAll('*').length - document.querySelectorAll('.toast').length,
  toastText: document.querySelector('.toast')?.textContent || null,
  ids: Array.from(document.querySelectorAll('[id]')).map(e => e.id)
}));
ok('B7 结束：主题已切、揭示层移除、DOM 回基线、无重复 id',
  after.theme === 'cinema' && after.liquid === false && after.revealGone === true &&
  after.d === 'M0 0 Z' && after.domNodes === baseNodes &&
  new Set(after.ids).size === after.ids.length,
  { theme: after.theme, revealGone: after.revealGone, domNodes: after.domNodes, baseNodes,
    toast: after.toastText });

ok('B8 主题持久化到 localStorage',
  await p.evaluate(() => localStorage.getItem('theme')) === 'cinema',
  { stored: await p.evaluate(() => localStorage.getItem('theme')) });

ok('B9 aria-label 随主题更新',
  /影院黑/.test(await p.evaluate(() => document.getElementById('theme-light').getAttribute('aria-label'))),
  { label: await p.evaluate(() => document.getElementById('theme-light').getAttribute('aria-label')) });

// 连续点击不叠加、不锁死
await p.evaluate(() => document.getElementById('theme-light').click());
await p.waitForTimeout(120);
await p.evaluate(() => document.getElementById('theme-light').click());
await p.waitForTimeout(2400);
const rapid = await p.evaluate(() => ({
  liquid: document.documentElement.classList.contains('liquid-vt'),
  revealGone: !document.getElementById('liquid-reveal'),
  theme: document.documentElement.dataset.theme,
  d: document.getElementById('liquidPath').getAttribute('d')
}));
ok('B10 连点不叠加不锁死：动画结束锁释放、揭示层清理、主题为有效值',
  rapid.liquid === false && rapid.revealGone === true && ['cream', 'cinema'].includes(rapid.theme) &&
  rapid.d === 'M0 0 Z', rapid);

// 中途切视图打断：揭示层应立即清理，视图正常切换
await p.evaluate(() => {
  if (document.documentElement.dataset.theme !== 'cream') document.documentElement.dataset.theme = 'cream';
});
await p.waitForTimeout(200);
await p.evaluate(() => document.getElementById('theme-light').click());
await p.waitForTimeout(150);
await p.evaluate(() => document.getElementById('card-recent').click());
await p.waitForTimeout(500);
const interrupt = await p.evaluate(() => ({
  revealGone: !document.getElementById('liquid-reveal'),
  liquid: document.documentElement.classList.contains('liquid-vt'),
  active: document.querySelector('.view.active')?.id
}));
ok('B11 动画中切视图：揭示层已清理、锁释放、视图正常切换',
  interrupt.revealGone === true && interrupt.liquid === false && interrupt.active === 'view-recent', interrupt);

ok('B12 零控制台 / 页面错误', errs.length === 0, errs);
await ctx.close();

// 滚动后切换 + sticky 页眉两层对齐
const c2 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const p2 = await c2.newPage();
await p2.goto(BASE + 'index.html?cb=' + Date.now(), { waitUntil: 'load' });
await p2.waitForSelector('#theme-light', { timeout: 10000 });
await p2.waitForTimeout(500);
await p2.evaluate(() => window.scrollTo(0, 600));
await p2.waitForTimeout(200);
await p2.evaluate(() => document.getElementById('theme-light').click());
await p2.waitForTimeout(500);
const sticky = await p2.evaluate(() => {
  const real = document.querySelector('.site-header');
  const rev = document.getElementById('liquid-reveal');
  const clone = rev && rev.querySelector('.site-header');
  return {
    scrollY: window.scrollY,
    realTop: real.getBoundingClientRect().top,
    cloneTop: clone ? clone.getBoundingClientRect().top : null,
    realLeft: real.getBoundingClientRect().left,
    cloneLeft: clone ? clone.getBoundingClientRect().left : null
  };
});
ok('B13 滚动后切换：sticky 页眉两层对齐（top/left 逐像素）',
  sticky.scrollY > 0 && sticky.cloneTop !== null &&
  Math.abs(sticky.realTop - sticky.cloneTop) <= 1 &&
  Math.abs(sticky.realLeft - sticky.cloneLeft) <= 1, sticky);
await c2.close();

// 窄屏 + reduced-motion 回退
const c3 = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
const p3 = await c3.newPage();
await p3.goto(BASE + 'index.html?cb=' + Date.now(), { waitUntil: 'load' });
await p3.waitForSelector('#theme-light', { timeout: 10000 });
const themeBefore3 = await p3.evaluate(() => document.documentElement.dataset.theme);
await p3.click('#theme-light');
await p3.waitForTimeout(400);
const mob = await p3.evaluate(() => ({
  theme: document.documentElement.dataset.theme,
  liquid: document.documentElement.classList.contains('liquid-vt'),
  revealGone: !document.getElementById('liquid-reveal'),
  docW: document.documentElement.scrollWidth, inner: innerWidth
}));
ok('B14 减少动效：直接切换（无揭示层）+ 窄屏无横向溢出',
  mob.liquid === false && mob.revealGone === true && mob.docW <= mob.inner &&
  mob.theme !== themeBefore3 && ['cream', 'cinema'].includes(mob.theme), mob);
await c3.close();

await browser.close();
console.log(`\n第 141 轮 双层DOM主题切换：${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
