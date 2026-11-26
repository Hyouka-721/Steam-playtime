/* verify133.mjs — 第 133 轮：修两处视觉抖动
   ① 现象1：Watch 页「My Watch List」字体替换时水平跳动 → 给 .w-title 加固定宽度 6.64em。
   ② 现象2：Game Time 刷新时数字白块 + 柱子残影 → 骨架动画加 .25s 延迟降噪 + 去柱子 width 过渡。
   冻结值守门：index 6.73em 标题宽、rank-item 六列网格、sk-block/sk-shimmer 存在、860 断点 = 1(watch)。
   用法：node tests/index/verify133.mjs（需先起 8895 服务） */
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

const styleCss = fs.readFileSync(ROOT + 'docs/style.css', 'utf8');
const watchCss = fs.readFileSync(ROOT + 'docs/watch.css', 'utf8');
const styleCode = styleCss.replace(/\/\*[\s\S]*?\*\//g, '');
const watchCode = watchCss.replace(/\/\*[\s\S]*?\*\//g, '');
const idxHtml = fs.readFileSync(ROOT + 'docs/index.html', 'utf8');
const watHtml = fs.readFileSync(ROOT + 'docs/watch.html', 'utf8');

// ---- A 静态 ----
ok('A1 双 bump：style?v=153 / watch?v=48；app129/fx19/watch.js35 未动',
  /style\.css\?v=153/.test(idxHtml) && /app\.js\?v=132/.test(idxHtml) && /fx\.js\?v=19/.test(idxHtml) &&
  /watch\.css\?v=48/.test(watHtml) && /watch\.js\?v=35/.test(watHtml));
ok('A2 .w-title 固定宽度 6.64em + nowrap（≥861px）｜第133轮',
  /@media \(min-width: 861px\) \{\s*\.w-title \{ width: 6\.64em; white-space: nowrap; \}/.test(watchCode));
ok('A3 .rank-bar > span 已无 width 过渡｜第133轮去残影',
  /\.rank-bar > span \{[\s\S]*?\}/.test(styleCode) &&
  !/\.rank-bar > span \{[^}]*transition:\s*width/.test(styleCode));
ok('A4 骨架延迟出现：sk-appear(.35s both) + shimmer 保留｜第134轮方案A',
  /\.sk-block \{[\s\S]*?animation: sk-shimmer 1\.8s ease-in-out \.25s infinite, sk-appear \.3s ease \.35s both/.test(styleCode) &&
  /\.card-value\.sk-value \{[\s\S]*?animation: sk-shimmer 1\.8s ease-in-out \.25s infinite, sk-appear \.3s ease \.35s both/.test(styleCode) &&
  /@keyframes sk-appear \{ from \{ opacity: 0; \} to \{ opacity: 1; \} \}/.test(styleCode));
ok('A4b 花体字已 base64 内联（两页 CSS 均含 data:font/woff2，无 url(blackrose)）｜第134轮方案D',
  /data:font\/woff2;base64,/.test(styleCode) && /data:font\/woff2;base64,/.test(watchCode) &&
  !/url\('blackrose\.woff2'\)/.test(styleCode) && !/url\('blackrose\.woff2'\)/.test(watchCode));
ok('A5 冻结值未动：index 6.73em / rank-item 六列网格 / @keyframes sk-shimmer 仍在',
  /width: 6\.73em/.test(styleCode) &&
  /grid-template-columns: 44px 130px minmax\(150px, 260px\) minmax\(140px, 1fr\) 150px 110px/.test(styleCode) &&
  /@keyframes sk-shimmer/.test(styleCode));
ok('A6 watch 860 断点仍只 1 个',
  (watchCode.match(/@media \(max-width: 860px\)/g) || []).length === 1);

// ---- B 运行时 ----
const browser = await chromium.launch();

// B1：第 134 轮方案 D —— 字体已内联，验证页面零 woff2 请求 + 字体可用 + 标题盒固定
const ctxB = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const fontReqs = [];
ctxB.on('request', (r) => { if (/blackrose\.woff2/.test(r.url())) fontReqs.push(r.url()); });
const pB = await ctxB.newPage();
await pB.goto(BASE + 'watch.html?cb=' + Date.now(), { waitUntil: 'load' });
await pB.waitForTimeout(900);
const b1 = await pB.evaluate(() => {
  const el = document.querySelector('.w-title');
  const b = el.getBoundingClientRect();
  return { boxW: +b.width.toFixed(2), center: +(b.left + b.width / 2).toFixed(2), fontOk: document.fonts.check('70px "Black Rose"') };
});
await ctxB.close();
ok('B1 花体字内联：页面零 woff2 请求 + 字体可用 + 标题盒固定 464.8/中心 720｜第134轮方案D',
  fontReqs.length === 0 && b1.fontOk && Math.abs(b1.boxW - 464.8) < 0.5 && Math.abs(b1.center - 720) < 1, { fontReqs: fontReqs.length, b1 });

// B2：骨架"延迟出现"——拦截 app.js 让骨架停留，测起始 opacity=0（不可见）、.35s 后=1
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.route('**/app.js*', (r) => r.abort());
const p = await ctx.newPage();
await p.goto(BASE + 'index.html?cb=' + Date.now(), { waitUntil: 'domcontentloaded' });
const early = await p.evaluate(() => {
  const blk = document.querySelector('#lt-list .sk-block');
  const val = document.querySelector('.card-value.sk-value');
  return { blk: blk ? getComputedStyle(blk).opacity : 'no-el', val: val ? getComputedStyle(val).opacity : 'no-el' };
});
await p.waitForTimeout(800);
const late = await p.evaluate(() => {
  const blk = document.querySelector('#lt-list .sk-block');
  const val = document.querySelector('.card-value.sk-value');
  return { blk: blk ? getComputedStyle(blk).opacity : 'no-el', val: val ? getComputedStyle(val).opacity : 'no-el' };
});
// 起始必须完全不可见（0.35s 内数据到位就根本不出现白块）；之后淡入到 1
const earlyHidden = ['0', 'no-el'].includes(early.blk) && ['0', 'no-el'].includes(early.val);
const lateShown = ['1', 'no-el'].includes(late.blk) && ['1', 'no-el'].includes(late.val);
ok('B2 骨架延迟出现：起始 opacity=0（白块不出现），.35s 后淡入到 1｜第134轮方案A',
  earlyHidden && lateShown, { early, late });
await ctx.close();

await browser.close();
console.log(`\n第 133 轮视觉抖动修复：${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
