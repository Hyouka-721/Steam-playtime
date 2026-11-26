/* online141.mjs — 第 141 轮线上复验：双层真实 DOM 主题切换（雨丝不冻结）
 * 对 https://hyouka-721.github.io/Steam-playtime/index.html 跑关键断言
 * 用法：node tests/online/online141.mjs */
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');
const URL = 'https://hyouka-721.github.io/Steam-playtime/index.html';
let pass = 0, fail = 0;
const ok = (n, c, x) => {
  c ? (pass++, console.log('PASS ', n, x === undefined ? '' : '— ' + JSON.stringify(x)))
    : (fail++, console.log('FAIL ', n, '— ' + JSON.stringify(x)));
};

const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|Failed to load resource/.test(m.text())) errs.push(m.text()); });
await p.goto(URL + '?cb=' + Date.now(), { waitUntil: 'load' });
await p.waitForSelector('#theme-light', { timeout: 20000 });
await p.waitForFunction(() => window.__rain && window.__rain.ready && window.__rain.ready(), { timeout: 20000 });
await p.waitForTimeout(500);

const base = await p.evaluate(() => ({
  css: [...document.styleSheets].some(s => (s.href || '').includes('style.css?v=156')),
  app: [...document.scripts].some(s => (s.src || '').includes('app.js?v=133')),
  clip: !!document.getElementById('liquidClip') && !!document.getElementById('liquidPath'),
  rain: window.__rain.count(),
  theme: document.documentElement.dataset.theme
}));
ok('O1 线上版本串 style.css?v=156 / app.js?v=133 + SVG 裁剪地基就位',
  base.css && base.app && base.clip, base);
ok('O2 首屏主题有效 + 雨丝已建', ['cream', 'cinema'].includes(base.theme) && base.rain > 0, base);

// 开雨丝，取证线上切换期间雨丝连续
await p.evaluate(() => { window.__ambience && window.__ambience.set('rain'); document.documentElement.dataset.theme = 'cream'; });
await p.waitForTimeout(300);
const samples = [];
const sampler = async () => {
  const s = await p.evaluate(() => {
    const el = document.querySelector('#rain-layer .rain-streak');
    if (!el) return null;
    const anim = el.getAnimations()[0];
    const rev = document.getElementById('liquid-reveal');
    return {
      t: anim ? Number(anim.currentTime) : -1,
      top: el.getBoundingClientRect().top,
      inReal: el.closest('#rain-layer') !== null,
      revRain: !!document.querySelector('#liquid-reveal .rain-streak'),
      revZ: rev ? getComputedStyle(rev).zIndex : null,
      revClip: rev ? getComputedStyle(rev).clipPath : null,
      revAria: rev ? rev.getAttribute('aria-hidden') : null,
      revInert: rev ? rev.hasAttribute('inert') : null,
      revIds: rev ? rev.querySelectorAll('[id]').length : -1,
      bodyTp: getComputedStyle(document.body).transitionProperty,
      revealGone: !rev
    };
  });
  if (s) samples.push(s);
};
await p.evaluate(() => document.getElementById('theme-light').click());
for (let i = 0; i < 8; i++) { await sampler(); await p.waitForTimeout(200); }
// 抓揭层瞬间：高频轮询直到 reveal 消失，立即取 body 背景色
let snapAtReveal = null;
for (let i = 0; i < 20; i++) {
  const s = await p.evaluate(() => {
    const rev = document.getElementById('liquid-reveal');
    if (rev) return null;
    return { bg: getComputedStyle(document.body).backgroundColor, theme: document.documentElement.dataset.theme };
  });
  if (s) { snapAtReveal = s; break; }
  await p.waitForTimeout(40);
}

const times = samples.map(s => s.t);
let grows = 0, mono = true;
for (let i = 1; i < times.length; i++) {
  if (times[i] >= times[i - 1]) grows++;
  else if (times[i] < times[i - 1] - 2) mono = false;
}
const span = times.length ? times[times.length - 1] - times[0] : 0;
ok('O3 ★线上雨丝 animation 切换期间不冻结（currentTime 连续增长）',
  times.length >= 5 && mono && grows >= times.length - 2 && span > 800,
  { span: Math.round(span), times: times.map(t => Math.round(t)) });

ok('O4 ★雨丝始终在真实层、揭示层不含副本',
  samples.every(s => s.inReal === true && s.revRain === false),
  { allReal: samples.every(s => s.inReal), anyCloned: samples.some(s => s.revRain) });

/* 修闪回归：动画期间颜色过渡冻结为 none，且揭层瞬间 body 已是最终影院黑（不闪回米白） */
const animSamples = samples.filter(s => s.bodyTp !== undefined && s.revealGone === false);
const darkAtReveal = snapAtReveal && /rgb\(1[01], 1[01], 1[0-5]\)/.test(snapAtReveal.bg);
ok('O4b ★修闪：动画期过渡冻结 + 揭层瞬间已是影院黑（无闪回）',
  animSamples.length >= 3 && animSamples.every(s => s.bodyTp === 'none') && darkAtReveal,
  { tpSamples: animSamples.map(s => s.bodyTp), revealSnap: snapAtReveal });

const mid = samples.find(s => s.revZ !== null) || {};
ok('O5 线上揭示层 z=11 + clip-path + aria-hidden + inert + 无重复 id',
  mid.revZ === '11' && /url\(.*liquidClip/.test(mid.revClip || '') &&
  mid.revAria === 'true' && mid.revInert === true && mid.revIds === 0,
  { z: mid.revZ, clip: mid.revClip, aria: mid.revAria, inert: mid.revInert, ids: mid.revIds });

await p.waitForTimeout(1400);
const after = await p.evaluate(() => ({
  theme: document.documentElement.dataset.theme,
  liquid: document.documentElement.classList.contains('liquid-vt'),
  revealGone: !document.getElementById('liquid-reveal'),
  d: document.getElementById('liquidPath').getAttribute('d'),
  stored: localStorage.getItem('theme')
}));
ok('O6 动画结束：主题切换完成 + 揭示层移除 + path 复位 + 持久化',
  after.theme === 'cinema' && after.liquid === false && after.revealGone &&
  after.d === 'M0 0 Z' && after.stored === 'cinema', after);

ok('O7 线上零实质 JS 错误', errs.length === 0, errs);
await ctx.close();

// 窄屏 reduced 回退
const c2 = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
const p2 = await c2.newPage();
await p2.goto(URL + '?cb=' + Date.now(), { waitUntil: 'load' });
await p2.waitForSelector('#theme-light', { timeout: 20000 });
const before2 = await p2.evaluate(() => document.documentElement.dataset.theme);
await p2.click('#theme-light');
await p2.waitForTimeout(400);
const mob = await p2.evaluate(() => ({
  theme: document.documentElement.dataset.theme,
  revealGone: !document.getElementById('liquid-reveal'),
  docW: document.documentElement.scrollWidth, inner: innerWidth
}));
ok('O8 线上 reduced-motion 直接切 + 窄屏无溢出',
  mob.theme !== before2 && mob.revealGone && mob.docW <= mob.inner, { before: before2, ...mob });
await c2.close();

await browser.close();
console.log(`\n第 141 轮线上复验：${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
