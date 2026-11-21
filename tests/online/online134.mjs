/* online134.mjs — 第 134 轮上线复验：骨架延迟出现（A）+ 花体字内联（D）+ 首屏 CLS
 * ① 指纹：线上 style?v=149 / watch?v=48；四资产 md5 与本地全等。
 * ② 静态：两页 CSS 含 data:font/woff2、无 url(blackrose)；sw.js 不再预缓存 woff2；index 含行高内联脚本。
 * ③ 运行时：零 woff2 请求；骨架起始 opacity=0（不出现白块）；标题盒固定 464.8；首屏 CLS=0。
 * 用法：node tests/online/online134.mjs */
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
  sw: fs.readFileSync(ROOT + 'docs/sw.js', 'utf8'),
};
const browser = await chromium.launch({ args: ['--no-proxy-server'] });

const c0 = await browser.newContext({ serviceWorkers: 'block' });
const fp = await c0.newPage();
await fp.goto(SITE, { waitUntil: 'domcontentloaded', timeout: 60000 });
const fpD = await fp.evaluate(async ({ site }) => {
  const g = async (u) => { const r = await fetch(site + u, { cache: 'reload' }); return { s: r.status, t: await r.text() }; };
  const cb = Date.now();
  const [i, w, s, c, sw] = await Promise.all([g('index.html?cb=' + cb), g('watch.html?cb=' + cb), g('style.css?v=149&cb=' + cb), g('watch.css?v=48&cb=' + cb), g('sw.js?cb=' + cb)]);
  return { i: i.t, w: w.t, s: s.t, c: c.t, sw: sw.t, st: [i.s, w.s, s.s, c.s, sw.s] };
}, { site: SITE });
ok('A1 线上 style149/watch48 五资源全 200',
  fpD.st.every((s) => s === 200) && /style\.css\?v=149/.test(fpD.i) && /watch\.css\?v=48/.test(fpD.w), { st: fpD.st });
ok('A2 index/watch.html/style/watch.css/sw.js md5 与本地全等',
  md5(fpD.i) === md5(L.idx) && md5(fpD.w) === md5(L.wat) && md5(fpD.s) === md5(L.style) && md5(fpD.c) === md5(L.watch) && md5(fpD.sw) === md5(L.sw));
const sc = fpD.s.replace(/\/\*[\s\S]*?\*\//g, ''), wc = fpD.c.replace(/\/\*[\s\S]*?\*\//g, '');
ok('A3 两页 CSS 内联字体（data:font/woff2）、无 url(blackrose)；骨架 sk-appear .35s both',
  /data:font\/woff2;base64,/.test(sc) && /data:font\/woff2;base64,/.test(wc) &&
  !/url\('blackrose\.woff2'\)/.test(sc) && !/url\('blackrose\.woff2'\)/.test(wc) &&
  /sk-appear \.3s ease \.35s both/.test(sc));
ok('A4 sw.js 预缓存清单（数组）不含 woff2；index 含首帧行高内联脚本',
  !/var SHELL_LIST = \[[^\]]*blackrose\.woff2/.test(fpD.sw) &&
  !/var base = \[[^\]]*blackrose\.woff2/.test(fpD.sw) &&
  /--rank-row-h/.test(fpD.i) && /PAD = 4, ROWS = 8/.test(fpD.i));
await c0.close();

// 运行时 1：零 woff2 请求 + 标题盒固定
const c1 = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
const wReq = [];
c1.on('request', (r) => { if (/blackrose\.woff2/.test(r.url())) wReq.push(r.url()); });
const p1 = await c1.newPage();
await p1.goto(SITE + 'watch.html?cb=' + Date.now(), { waitUntil: 'load', timeout: 60000 });
await p1.waitForTimeout(900);
const b1 = await p1.evaluate(() => {
  const b = document.querySelector('.w-title').getBoundingClientRect();
  return { boxW: +b.width.toFixed(2), center: +(b.left + b.width / 2).toFixed(2), fontOk: document.fonts.check('70px "Black Rose"') };
});
ok('B1 线上零 woff2 请求 + 花体可用 + 标题盒 464.8/中心 720',
  wReq.length === 0 && b1.fontOk && Math.abs(b1.boxW - 464.8) < 0.5 && Math.abs(b1.center - 720) < 1, { wReq: wReq.length, b1 });
await c1.close();

// 运行时 2：骨架的动画必须含 sk-appear + .35s 延迟（即起始不可见）—— 用 computed 而非瞬时采样，
//            线上首次加载比本地慢，采样时刻可能已过 0.35s 淡入完毕（本轮就踩过这个）。
const c2 = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
await c2.route('**/app.js*', (r) => r.abort());
const p2 = await c2.newPage();
await p2.goto(SITE + '?cb=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 });
const an = await p2.evaluate(() => {
  const e = document.querySelector('#lt-list .sk-block');
  if (!e) return null;
  const cs = getComputedStyle(e);
  return { names: cs.animationName, delays: cs.animationDelay, durs: cs.animationDuration };
});
ok('B2 线上骨架动画含 sk-appear + 0.35s 延迟（起始不可见、白块不出现）',
  !!an && /sk-appear/.test(an.names) && /sk-shimmer/.test(an.names) && /0\.35s/.test(an.delays), an);
await c2.close();

// 运行时 3：首屏 CLS
const c3 = await browser.newContext({ viewport: { width: 1440, height: 1080 }, serviceWorkers: 'block' });
const p3 = await c3.newPage();
await p3.addInitScript(() => {
  window.__cls = 0;
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true }); } catch (e) {}
});
await p3.goto(SITE + '?t=' + Date.now(), { waitUntil: 'load', timeout: 60000 });
await p3.waitForSelector('#lt-list .rank-item', { state: 'visible', timeout: 40000 });
await p3.waitForTimeout(1100);
const cls = await p3.evaluate(() => +window.__cls.toFixed(4));
ok('B3 线上首屏 CLS < 0.01', cls < 0.01, { cls });
await c3.close();

await browser.close();
console.log(`\n线上第 134 轮：${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
