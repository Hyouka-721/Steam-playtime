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
ok('A1 双 bump：style?v=148 / watch?v=47；app129/fx19/watch.js35 未动',
  /style\.css\?v=148/.test(idxHtml) && /app\.js\?v=129/.test(idxHtml) && /fx\.js\?v=19/.test(idxHtml) &&
  /watch\.css\?v=47/.test(watHtml) && /watch\.js\?v=35/.test(watHtml));
ok('A2 .w-title 固定宽度 6.64em + nowrap（≥861px）｜第133轮',
  /@media \(min-width: 861px\) \{\s*\.w-title \{ width: 6\.64em; white-space: nowrap; \}/.test(watchCode));
ok('A3 .rank-bar > span 已无 width 过渡｜第133轮去残影',
  /\.rank-bar > span \{[\s\S]*?\}/.test(styleCode) &&
  !/\.rank-bar > span \{[^}]*transition:\s*width/.test(styleCode));
ok('A4 骨架动画加 .25s 启动延迟（sk-block / sk-value）｜第133轮降噪',
  /\.sk-block \{[\s\S]*?animation: sk-shimmer 1\.8s ease-in-out \.25s infinite/.test(styleCode) &&
  /\.card-value\.sk-value \{[\s\S]*?animation: sk-shimmer 1\.8s ease-in-out \.25s infinite/.test(styleCode));
ok('A5 冻结值未动：index 6.73em / rank-item 六列网格 / @keyframes sk-shimmer 仍在',
  /width: 6\.73em/.test(styleCode) &&
  /grid-template-columns: 44px 130px minmax\(150px, 260px\) minmax\(140px, 1fr\) 150px 110px/.test(styleCode) &&
  /@keyframes sk-shimmer/.test(styleCode));
ok('A6 watch 860 断点仍只 1 个',
  (watchCode.match(/@media \(max-width: 860px\)/g) || []).length === 1);

// ---- B 运行时 ----
const browser = await chromium.launch();

// B1：字体被拦截（模拟字体永不加载）时，标题盒子宽度应与字体正常时完全一致
async function titleBox(blockFont) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  if (blockFont) await ctx.route('**/blackrose.woff2', (r) => r.abort());
  const p = await ctx.newPage();
  await p.goto(BASE + 'watch.html?cb=' + Date.now(), { waitUntil: 'load' });
  await p.waitForTimeout(1000);
  if (!blockFont) await p.evaluate(() => document.fonts.ready);
  const r = await p.evaluate(() => {
    const el = document.querySelector('.w-title');
    const b = el.getBoundingClientRect();
    return { boxW: +b.width.toFixed(2), center: +(b.left + b.width / 2).toFixed(2) };
  });
  await ctx.close();
  return r;
}
const withF = await titleBox(false);
const noF = await titleBox(true);
ok('B1 字体加载/未加载，标题盒子宽度与居中点完全一致（不跳）｜第133轮',
  Math.abs(withF.boxW - noF.boxW) < 0.5 && Math.abs(withF.center - noF.center) < 0.5, { withF, noF });

// B2：骨架延迟生效（拦截 app.js 让骨架停留）
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.route('**/app.js*', (r) => r.abort());
const p = await ctx.newPage();
await p.goto(BASE + 'index.html?cb=' + Date.now(), { waitUntil: 'load' });
await p.waitForTimeout(700);
const sk = await p.evaluate(() => {
  const blk = document.querySelector('#lt-list .sk-block');
  const val = document.querySelector('.card-value.sk-value');
  const g = (el) => el ? getComputedStyle(el).animationDelay : null;
  return { blk: g(blk), val: g(val), cond: !!document.querySelector('#lt-list .sk-row') || !blk };
});
ok('B2 运行时骨架 animation-delay = 0.25s（快网下先到位就不闪）｜第133轮',
  (sk.blk === null || sk.blk === '0.25s') && (sk.val === null || sk.val === '0.25s'), sk);
await ctx.close();

await browser.close();
console.log(`\n第 133 轮视觉抖动修复：${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
