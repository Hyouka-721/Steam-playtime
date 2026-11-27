/* verify135.mjs — 第 135 轮：不牺牲性能的流畅度增强
 * ① 独立 motion.css/motion.js 挂在两页，不碰 style/watch.css 的位置敏感块
 * ② content-visibility 只给 .st-panel（契约压到最小）
 * ③ 错峰淡入：.rv/.in 纯 opacity 变体给几何类元素，.card 才允许位移
 * ④ 交互微反馈：光泽扫过 + 按钮涟漪，伪元素 transform/opacity
 * ⑤ reduced-motion 全关；poster 仍 w-fade-in（verify128 守）
 * 用法：node tests/index/verify135.mjs（需先起 8895 服务） */
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

const motionCss = fs.readFileSync(ROOT + 'docs/motion.css', 'utf8');
const motionJs = fs.readFileSync(ROOT + 'docs/motion.js', 'utf8');
const idxHtml = fs.readFileSync(ROOT + 'docs/index.html', 'utf8');
const watHtml = fs.readFileSync(ROOT + 'docs/watch.html', 'utf8');
const code = motionCss.replace(/\/\*[\s\S]*?\*\//g, '');
const jsCode = motionJs.replace(/\/\*[\s\S]*?\*\//g, '');

// A 静态
ok('A1 两页都挂 motion.css?v=1 与 motion.js?v=3｜第146轮只 bump 改过的 js',
  /motion\.css\?v=1/.test(idxHtml) && /motion\.js\?v=3/.test(idxHtml) &&
  /motion\.css\?v=1/.test(watHtml) && /motion\.js\?v=3/.test(watHtml),
  '理由：第146轮只改 motion.js（榜单行退出淡入以消除刷新闪烁），motion.css 一字节未动，按红线2单侧 bump');
const cvOnSt = /\.st-panel\s*\{[^}]*content-visibility:\s*auto/.test(code);
const cvOnRank = /\.rank-item\s*\{[^}]*content-visibility:\s*auto/.test(code);
const cvOnTl = /\.tl-item\s*\{[^}]*content-visibility:\s*auto/.test(code);
ok('A2 content-visibility 只给 .st-panel，不碰 rank-item/tl-item（守 verify117/67）',
  cvOnSt && !cvOnRank && !cvOnTl, { cvOnSt, cvOnRank, cvOnTl });
ok('A3 错峰淡入：flat 纯 opacity 仍在，但榜单行已退出动画｜第146轮改判',
  /\.rv \{ opacity: 0; transform: translateY\(8px\); \}/.test(code) &&
  /\.rv\.flat \{ transform: none; \}/.test(code) &&
  /var SEL = '\.card, \.tl-item, \.st-panel';/.test(jsCode) && !/rankNodes/.test(jsCode) &&
  /flat/.test(jsCode) && !/\.poster\b/.test(code),
  '理由：第146轮把 rank-item 从选择器移除，避免 .rv→.in 造成刷新闪烁；其它几何类元素仍用 flat');
ok('A4 微反馈用伪元素 transform/opacity；reduced-motion 全关',
  /\.card:hover::after/.test(code) && /\.w-sort-btn:active::after/.test(code) &&
  /@media \(prefers-reduced-motion: reduce\)/.test(code) &&
  /\.rv, \.rv\.in \{ opacity: 1; transform: none; transition: none; \}/.test(code));
ok('A5 JS 用 IntersectionObserver + 懒轮询补新增节点',
  /IntersectionObserver/.test(motionJs) && /setInterval/.test(motionJs) && /__motionReveal/.test(motionJs));

// B 运行时
const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
await p.goto(BASE + 'index.html?cb=' + Date.now(), { waitUntil: 'load' });
await p.waitForTimeout(1200);
const cards = await p.evaluate(() => {
  const els = [...document.querySelectorAll('.card')];
  return { n: els.length, rv: els.filter(e => e.classList.contains('rv')).length,
    shown: els.filter(e => e.classList.contains('in')).length };
});
ok('B1 卡片获得 rv 并淡入（首屏全部 in）', cards.n > 0 && cards.rv === cards.n && cards.shown === cards.n, cards);
const flat = await p.evaluate(() => {
  const rows = [...document.querySelectorAll('#lt-list > .rank-item')];
  return {
    n: rows.length,
    rv: rows.filter(e => e.classList.contains('rv')).length,
    flat: rows.filter(e => e.classList.contains('flat')).length,
    opaque: rows.filter(e => getComputedStyle(e).opacity === '1').length,
  };
});
ok('B2 榜单行不挂 rv/flat、始终不透明｜第146轮改判，消除刷新闪烁',
  flat.n > 0 && flat.rv === 0 && flat.flat === 0 && flat.opaque === flat.n, flat);
await ctx.close();

// watch 页：poster 不受 rv 影响
const c2 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const p2 = await c2.newPage();
await p2.goto(BASE + 'watch.html?cb=' + Date.now(), { waitUntil: 'load' });
await p2.waitForTimeout(900);
const pv = await p2.evaluate(() => ({ poster: document.querySelectorAll('.poster').length,
  rvPoster: document.querySelectorAll('.poster.rv').length,
  anim: (() => { const e = document.querySelector('#w-grid .poster'); return e ? getComputedStyle(e).animationName : 'no-el'; })() }));
ok('B3 poster 未被 rv 接管，仍是 w-fade-in', pv.poster > 0 && pv.rvPoster === 0 && (pv.anim === 'w-fade-in' || pv.anim === 'none'), pv);
await c2.close();

// reduced-motion：rv 不生效
const c3 = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
const p3 = await c3.newPage();
await p3.goto(BASE + 'index.html?cb=' + Date.now(), { waitUntil: 'load' });
await p3.waitForTimeout(700);
const rm = await p3.evaluate(() => {
  const e = document.querySelector('.card');
  return e ? { rv: e.classList.contains('rv'), opacity: getComputedStyle(e).opacity } : null;
});
ok('B4 reduced-motion 下卡片不淡入（可见且不挂 rv）', !!rm && !rm.rv && rm.opacity === '1', rm);
await c3.close();

await browser.close();
console.log(`\n第 135 轮流畅度增强：${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
