/* online138.mjs — 第 138 轮线上复验：门户主页视觉精修 + 雨天选句
 * 对 https://hyouka-721.github.io/Steam-playtime/home.html 跑关键断言
 * 用法：node tests/online/online138.mjs */
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');
const URL = 'https://hyouka-721.github.io/Steam-playtime/home.html';
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
p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto(URL + '?cb=' + Date.now(), { waitUntil: 'load' });
await p.waitForFunction(() => window.__home && document.querySelector('#home-quote')?.getAttribute('data-hash'), { timeout: 15000 });
await p.waitForTimeout(500);

const desk = await p.evaluate(() => {
  const q = document.querySelector('#home-quote');
  const glow = getComputedStyle(q, '::before');
  const by = getComputedStyle(document.querySelector('.by'));
  const e0 = document.querySelector('.entry');
  return {
    css: [...document.styleSheets].some(s => (s.href || '').includes('home.css?v=6')),
    daily: q.getAttribute('data-daily'),
    fresh: q.classList.contains('is-fresh'),
    glowBg: glow.backgroundImage, glowZ: glow.zIndex,
    byColor: by.color, bySize: by.fontSize,
    label: e0.getAttribute('data-label'),
    hoverOpacity: getComputedStyle(e0, '::after').opacity,
    imgs: [...document.images].every(i => i.complete && i.naturalWidth > 0),
    imgCount: document.images.length,
    rain: window.__home.rainyCount(), total: window.__home.count,
    verseWrap: getComputedStyle(document.querySelector('.verse')).textWrap
  };
});
ok('O1 线上版本串 home.css?v=6', desk.css, { css: desk.css });
ok('O2 今日签角标 + 淡入已挂', desk.daily === '1' && desk.fresh, { daily: desk.daily, fresh: desk.fresh });
ok('O3 柔光衬底生效（径向 + z=-1）', /radial-gradient/.test(desk.glowBg) && desk.glowZ === '-1', { z: desk.glowZ });
ok('O4 署名提档', desk.byColor === 'rgb(87, 70, 54)' && parseFloat(desk.bySize) > 19, { color: desk.byColor, size: desk.bySize });
ok('O5 入口 hover 文字默认隐藏', desk.label === '游戏时长' && parseFloat(desk.hoverOpacity) === 0, { label: desk.label, opacity: desk.hoverOpacity });
ok('O6 三张图全加载 + text-wrap:balance', desk.imgCount === 3 && desk.imgs && desk.verseWrap === 'balance', { count: desk.imgCount, wrap: desk.verseWrap });
ok('O7 雨意象句池 + 诗句库数量', desk.rain >= 60 && desk.total >= 1000, { rain: desk.rain, total: desk.total });
ok('O8 零控制台 / 页面错误', errs.length === 0, errs);
await ctx.close();

const c2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
const p2 = await c2.newPage();
await p2.goto(URL + '?cb=' + Date.now(), { waitUntil: 'load' });
await p2.waitForFunction(() => window.__home && document.querySelector('#home-quote')?.getAttribute('data-hash'), { timeout: 15000 });
const mob = await p2.evaluate(() => ({
  fits: document.documentElement.scrollWidth <= innerWidth,
  iconW: Math.round(document.querySelector('.entry').getBoundingClientRect().width),
  docW: document.documentElement.scrollWidth
}));
ok('O9 线上窄屏无溢出 + 图标内收 92', mob.fits && mob.iconW === 92, mob);
await c2.close();
await browser.close();
console.log(`\n第 138 轮线上复验：${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
