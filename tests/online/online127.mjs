/* online127.mjs — 第 127 轮上线复验：Game Time 七项视觉精修
 * ① 指纹：线上 index 引用 style.css?v=145 / app129 / fx19；
 *    style.css/app.js/index.html 字节 md5 与本地全等；watch.css?v=45 未回退。
 * ② 静态：七项规则在线上 CSS 内齐备（卡短线/data grid/lining/字距/勋章柔光/淡入/动效token）。
 * ③ 运行时：卡片短线、数据页 grid、冻结值（padding18/head margin14）、淡入动画、零异常。
 * 用法：node tests/online/online127.mjs */
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

const cssLocal = fs.readFileSync(ROOT + 'docs/style.css', 'utf8');
const appLocal = fs.readFileSync(ROOT + 'docs/app.js', 'utf8');
const idxLocal = fs.readFileSync(ROOT + 'docs/index.html', 'utf8');
const browser = await chromium.launch({ args: ['--no-proxy-server'] });

const fpCtx = await browser.newContext({ serviceWorkers: 'block' });
const fpPage = await fpCtx.newPage();
await fpPage.goto(SITE, { waitUntil: 'domcontentloaded', timeout: 60000 });
const fp = await fpPage.evaluate(async ({ site }) => {
  const g = async (u) => { const r = await fetch(site + u, { cache: 'reload' }); return { s: r.status, t: await r.text() }; };
  const cb = Date.now();
  const [i, c, j] = await Promise.all([
    g('index.html?cb=' + cb), g('style.css?v=145&cb=' + cb), g('app.js?v=131&cb=' + cb),
  ]);
  return { i: i.t, c: c.t, j: j.t, st: [i.s, c.s, j.s] };
}, { site: SITE });
ok('A1 线上 style145/app129 三个资源全 200，watch.css 已 45',
  fp.st.every((s) => s === 200) &&
  /style\.css\?v=145/.test(fp.i) && /app\.js\?v=131/.test(fp.i) && /fx\.js\?v=19/.test(fp.i), { st: fp.st });
ok('A2 线上 index/style.css/app.js md5 与本地全等',
  md5(fp.i) === md5(idxLocal) && md5(fp.c) === md5(cssLocal) && md5(fp.j) === md5(appLocal));
const code = fp.c.replace(/\/\*[\s\S]*?\*\//g, '');
ok('A3 七项规则线上齐备',
  /\.card-nav\.active\)::before/.test(code) && /#view-data \{[\s\S]*?display: grid/.test(code) &&
  /lining-nums/.test(code) && /\.card-label \{ letter-spacing: 1\.4px/.test(code) &&
  /\.badges \.badge:hover/.test(code) && /@keyframes view-fade/.test(code) &&
  /--t-1:/.test(code) && /--ease:/.test(code));
await fpCtx.close();

const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto(SITE + '?cb=' + Date.now(), { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => document.querySelectorAll('.card-value').length >= 5, null, { timeout: 25000 });
await page.waitForTimeout(300);
const st = await page.evaluate(() => {
  const b = getComputedStyle(document.querySelector('.card-hero'), '::before');
  const fv = getComputedStyle(document.querySelector('.card-value')).fontVariantNumeric;
  return { beforePos: b.position, beforeH: b.height, fv };
});
ok('B1 线上强调短线绝对定位 + 数字 lining-nums',
  st.beforePos === 'absolute' && parseFloat(st.beforeH) === 2 && /lining-nums/.test(st.fv), st);
await page.click('#card-data');
await page.waitForTimeout(300);
const grid = await page.evaluate(() => {
  const v = document.getElementById('view-data');
  const cols = getComputedStyle(v).gridTemplateColumns.split(' ').filter(Boolean).length;
  const rp = getComputedStyle(document.getElementById('panel-report'));
  const p = document.querySelector('#view-data .panel');
  const h = p.querySelector('.panel-head');
  return { display: getComputedStyle(v).display, cols, reportCol: rp.gridColumnStart + '/' + rp.gridColumnEnd,
    padTop: getComputedStyle(p).paddingTop, headMb: getComputedStyle(h).marginBottom,
    anim: getComputedStyle(p).animationName };
});
ok('B2 线上数据页 grid 生效 + 冻结值 padding18/head14 未回退 + 视图淡入',
  grid.display === 'grid' && grid.cols >= 2 && grid.reportCol === '1/-1' &&
  parseFloat(grid.padTop) === 18 && parseFloat(grid.headMb) === 14 && grid.anim === 'view-fade', grid);
ok('C1 全程零 JS 异常', errs.length === 0, errs.slice(0, 3));
await browser.close();
console.log(`\n线上第 127 轮：${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
