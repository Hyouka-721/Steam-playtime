/* online132.mjs — 第 132 轮上线复验：两页页眉逐像素对齐（方案 A+）
 * ① 指纹：线上 watch.html 引用 watch.css?v=46；watch.html/watch.css md5 与本地全等；index style147 不变。
 * ② 静态：watch.css 用 .w-header::after 渐变小线，无 border-bottom 实边。
 * ③ 运行时：1440/1280/1088 三档，两页页眉高度完全相等，标题 top 也相等。
 * 用法：node tests/online/online132.mjs */
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

const cssLocal = fs.readFileSync(ROOT + 'docs/watch.css', 'utf8');
const htmlLocal = fs.readFileSync(ROOT + 'docs/watch.html', 'utf8');
const browser = await chromium.launch({ args: ['--no-proxy-server'] });

const fpCtx = await browser.newContext({ serviceWorkers: 'block' });
const fp = await fpCtx.newPage();
await fp.goto(SITE + 'watch.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
const fpData = await fp.evaluate(async ({ site }) => {
  const g = async (u) => { const r = await fetch(site + u, { cache: 'reload' }); return { s: r.status, t: await r.text() }; };
  const cb = Date.now();
  const [w, c] = await Promise.all([g('watch.html?cb=' + cb), g('watch.css?v=46&cb=' + cb)]);
  return { w: w.t, c: c.t, st: [w.s, c.s] };
}, { site: SITE });
ok('A1 线上 watch.css?v=46 资源 200', fpData.st.every((s) => s === 200) && /watch\.css\?v=46/.test(fpData.w), { st: fpData.st });
ok('A2 线上 watch.html/watch.css md5 与本地全等',
  md5(fpData.w) === md5(htmlLocal) && md5(fpData.c) === md5(cssLocal));
const code = fpData.c.replace(/\/\*[\s\S]*?\*\//g, '');
ok('A3 .w-header 用 ::after 渐变线、无 border-bottom 实边',
  /\.w-header::after \{[\s\S]*?linear-gradient\(90deg, transparent, var\(--border\) 14%/.test(code) &&
  /\.w-header \{[\s\S]*?border-bottom: 0/.test(code) &&
  !/\.w-header \{[^}]*border-bottom: 1px solid/.test(code));
await fpCtx.close();

// 运行时：多档宽度比两页页眉高 + 标题 top
const rows = [];
for (const W of [1440, 1280, 1088]) {
  const c = await browser.newContext({ viewport: { width: W, height: 900 }, serviceWorkers: 'block' });
  const meas = async (url) => {
    const p = await c.newPage();
    await p.goto(SITE + url + '?cb=' + Date.now(), { waitUntil: 'load', timeout: 60000 });
    await p.waitForTimeout(500);
    const r = await p.evaluate(() => {
      const hd = document.querySelector('header');
      const h1 = document.querySelector('h1');
      const hb = hd.getBoundingClientRect(), tb = h1.getBoundingClientRect();
      return { hdrH: +hb.height.toFixed(2), titleTop: +(tb.top - hb.top).toFixed(2) };
    });
    await p.close();
    return r;
  };
  const a = await meas('index.html');
  const b = await meas('watch.html');
  rows.push({ W, a, b, equal: a.hdrH === b.hdrH && a.titleTop === b.titleTop });
  await c.close();
}
ok('B1 1440/1280/1088 两页页眉高与标题 top 完全相等', rows.every((r) => r.equal),
  rows.map((r) => `${r.W}:${r.a.hdrH}/${r.b.hdrH} top ${r.a.titleTop}/${r.b.titleTop}`).join('  '));

await browser.close();
console.log(`\n线上第 132 轮：${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
