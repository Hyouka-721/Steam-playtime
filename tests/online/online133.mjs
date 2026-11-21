/* online133.mjs — 第 133 轮上线复验：修两处视觉抖动
 * ① 指纹：线上 index style?v=148 / watch?v=47；四资产 md5 与本地全等。
 * ② 静态：watch .w-title 固定宽 6.64em+nowrap；style 无 .rank-bar>span width 过渡；骨架 .25s 延迟。
 * ③ 运行时：字体加载 vs 拦截（回退字体）标题盒子宽度/中心一致；骨架 animation-delay=.25s。
 * 用法：node tests/online/online133.mjs */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import crypto from 'node:crypto';

const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');
const SITE = process.env.ONLINE_SITE || 'https://hyouka-721.github.io/Steam-playtime/';
const ROOT = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
let pass = 0, fail = 0;
const ok = (n, c, x) => {
  c ? (pass++, console.log('PASS ', n, x === undefined ? '' : '— ' + JSON.stringify(x)))
    : (fail++, console.log('FAIL ', n, '— ' + JSON.stringify(x)));
};
const md5 = (s) => crypto.createHash('md5').update(Buffer.from(String(s).replace(/\r\n/g, '\n'), 'utf8')).digest('hex');

const L = {
  style: fs.readFileSync(ROOT + 'docs/style.css', 'utf8'),
  watch: fs.readFileSync(ROOT + 'docs/watch.css', 'utf8'),
  idx: fs.readFileSync(ROOT + 'docs/index.html', 'utf8'),
  wat: fs.readFileSync(ROOT + 'docs/watch.html', 'utf8'),
};
const browser = await chromium.launch({ args: ['--no-proxy-server'] });

const ctx0 = await browser.newContext({ serviceWorkers: 'block' });
const fp = await ctx0.newPage();
await fp.goto(SITE, { waitUntil: 'domcontentloaded', timeout: 60000 });
const fpD = await fp.evaluate(async ({ site }) => {
  const g = async (u) => { const r = await fetch(site + u, { cache: 'reload' }); return { s: r.status, t: await r.text() }; };
  const cb = Date.now();
  const [i, w, s, c] = await Promise.all([g('index.html?cb=' + cb), g('watch.html?cb=' + cb), g('style.css?v=148&cb=' + cb), g('watch.css?v=47&cb=' + cb)]);
  return { i: i.t, w: w.t, s: s.t, c: c.t, st: [i.s, w.s, s.s, c.s] };
}, { site: SITE });
ok('A1 线上 style?v=148 / watch?v=47 四资源全 200',
  fpD.st.every((s) => s === 200) && /style\.css\?v=148/.test(fpD.i) && /watch\.css\?v=47/.test(fpD.w), { st: fpD.st });
ok('A2 线上 index/style/watch.html/watch.css md5 与本地全等',
  md5(fpD.i) === md5(L.idx) && md5(fpD.s) === md5(L.style) && md5(fpD.w) === md5(L.wat) && md5(fpD.c) === md5(L.watch));
const sc = fpD.s.replace(/\/\*[\s\S]*?\*\//g, ''), wc = fpD.c.replace(/\/\*[\s\S]*?\*\//g, '');
ok('A3 线上 .w-title 固定宽 6.64em+nowrap；无 .rank-bar>span width 过渡；骨架 .25s 延迟',
  /\.w-title \{ width: 6\.64em; white-space: nowrap; \}/.test(wc) &&
  !/\.rank-bar > span \{[^}]*transition:\s*width/.test(sc) &&
  /\.sk-block \{[\s\S]*?animation: sk-shimmer 1\.8s ease-in-out \.25s infinite/.test(sc));
await ctx0.close();

// 运行时 1：字体加载 vs 拦截，标题盒子宽度/中心一致
async function titleBox(block) {
  const c = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  if (block) await c.route('**/blackrose.woff2', (r) => r.abort());
  const p = await c.newPage();
  await p.goto(SITE + 'watch.html?cb=' + Date.now(), { waitUntil: 'load', timeout: 60000 });
  await p.waitForTimeout(1100);
  if (!block) await p.evaluate(() => document.fonts.ready);
  const r = await p.evaluate(() => { const b = document.querySelector('.w-title').getBoundingClientRect(); return { boxW: +b.width.toFixed(2), center: +(b.left + b.width / 2).toFixed(2) }; });
  await c.close();
  return r;
}
const wf = await titleBox(false), nf = await titleBox(true);
ok('B1 字体加载/拦截，Watch 标题盒子宽度与中心一致（不跳）',
  Math.abs(wf.boxW - nf.boxW) < 0.5 && Math.abs(wf.center - nf.center) < 0.5, { wf, nf });

// 运行时 2：骨架延迟
const c2 = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
await c2.route('**/app.js*', (r) => r.abort());
const p2 = await c2.newPage();
await p2.goto(SITE + '?cb=' + Date.now(), { waitUntil: 'load', timeout: 60000 });
await p2.waitForTimeout(900);
const sk = await p2.evaluate(() => {
  const blk = document.querySelector('#lt-list .sk-block');
  const val = document.querySelector('.card-value.sk-value');
  const g = (el) => el ? getComputedStyle(el).animationDelay : null;
  return { blk: g(blk), val: g(val) };
});
ok('B2 线上骨架 animation-delay=.25s', (sk.blk === null || sk.blk === '0.25s') && (sk.val === null || sk.val === '0.25s'), sk);
await c2.close();

await browser.close();
console.log(`\n线上第 133 轮：${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
