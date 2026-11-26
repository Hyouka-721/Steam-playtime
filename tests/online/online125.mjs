/* online125.mjs — 第 125 轮上线复验：三态氛围（关/流星/雨滴）+ 两页同步
 * ① 指纹：线上两页 v=7；index/watch/rain.js/rain.css/ambience.js 字节 md5 与本地全等；
 *    既有 144/129/19、44/35 未动。
 * ② 静态：两页 #ambience-seg 三按钮、无 #fx-seg/#rain-toggle；watch 有 #fx-canvas；
 *    雨丝 z=12 > 页眉 10。
 * ③ 运行时：默认流星；index 选雨滴 → watch 仍雨滴且可见；选关→全关；选流星→雨丝关；
 *    刷新保持；三档零溢出；零异常。
 * 用法：node tests/online/online125.mjs */
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

const idxLocal = fs.readFileSync(ROOT + 'docs/index.html', 'utf8');
const watLocal = fs.readFileSync(ROOT + 'docs/watch.html', 'utf8');
const rainJs = fs.readFileSync(ROOT + 'docs/rain.js', 'utf8');
const rainCss = fs.readFileSync(ROOT + 'docs/rain.css', 'utf8');
const ambJs = fs.readFileSync(ROOT + 'docs/ambience.js', 'utf8');
const browser = await chromium.launch({ args: ['--no-proxy-server'] });

const fpCtx = await browser.newContext({ serviceWorkers: 'block' });
const fpPage = await fpCtx.newPage();
await fpPage.goto(SITE, { waitUntil: 'domcontentloaded', timeout: 60000 });
const fp = await fpPage.evaluate(async ({ site }) => {
  const g = async (u) => { const r = await fetch(site + u, { cache: 'reload' }); return { s: r.status, t: await r.text() }; };
  const cb = Date.now();
  const [i, w, j, c, a] = await Promise.all([
    g('index.html?cb=' + cb), g('watch.html?cb=' + cb),
    g('rain.js?v=7&cb=' + cb), g('rain.css?v=7&cb=' + cb), g('ambience.js?v=1&cb=' + cb),
  ]);
  return { i: i.t, w: w.t, j: j.t, c: c.t, a: a.t, st: [i.s, w.s, j.s, c.s, a.s] };
}, { site: SITE });
ok('A1 线上两页 v=7 且五个资源全 200',
  fp.st.every((s) => s === 200) &&
  /rain\.css\?v=7/.test(fp.i) && /rain\.js\?v=7/.test(fp.i) && /ambience\.js\?v=1/.test(fp.i) &&
  /rain\.css\?v=7/.test(fp.w) && /rain\.js\?v=7/.test(fp.w) && /ambience\.js\?v=1/.test(fp.w), { st: fp.st });
ok('A2 线上 index/watch/rain.js/rain.css/ambience.js md5 与本地全等',
  md5(fp.i) === md5(idxLocal) && md5(fp.w) === md5(watLocal) &&
  md5(fp.j) === md5(rainJs) && md5(fp.c) === md5(rainCss) && md5(fp.a) === md5(ambJs));
ok('A3 既有版本号未动（144/129/19、44/35）',
  /style\.css\?v=144/.test(fp.i) && /app\.js\?v=132/.test(fp.i) && /fx\.js\?v=19/.test(fp.i) &&
  /watch\.css\?v=44/.test(fp.w) && /watch\.js\?v=35/.test(fp.w));
ok('A4 两页三态控件齐备，旧 #fx-seg / #rain-toggle 已删，watch 有 #fx-canvas',
  /id="ambience-seg"/.test(fp.i) && /id="ambience-seg"/.test(fp.w) &&
  /data-amb="off"/.test(fp.i) && /data-amb="meteor"/.test(fp.i) && /data-amb="rain"/.test(fp.i) &&
  !/id="fx-seg"/.test(fp.i + fp.w) && !/id="rain-toggle"/.test(fp.i + fp.w) &&
  /id="fx-canvas"/.test(fp.w) && /ambience\.mode/.test(fp.a));
await fpCtx.close();

const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto(SITE + '?cb=' + Date.now(), { waitUntil: 'load', timeout: 60000 });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'load' });
await page.waitForFunction(() => window.__ambience && window.__rain && window.__rain.ready(), null, { timeout: 25000 });

const s0 = await page.evaluate(() => ({
  amb: window.__ambience.mode(), fx: window.__fx.mode(), rain: window.__rain.enabled(),
  zR: getComputedStyle(document.getElementById('rain-layer')).zIndex,
  zH: getComputedStyle(document.querySelector('.site-header')).zIndex,
}));
ok('B1 默认流星；雨丝 z=12 > 页眉 10', s0.amb === 'meteor' && s0.fx === 'meteor' && s0.rain === false && +s0.zR > +s0.zH, s0);

await page.click('#ambience-seg button[data-amb="rain"]');
await page.waitForTimeout(300);
await page.goto(SITE + 'watch.html?cb=' + Date.now(), { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => window.__ambience && window.__rain && window.__rain.ready(), null, { timeout: 25000 });
await page.waitForFunction(() => window.__ambience.mode() === 'rain', null, { timeout: 5000 });
const w = await page.evaluate(() => ({
  amb: window.__ambience.mode(), fx: window.__fx.mode(), rain: window.__rain.enabled(),
  hidden: document.getElementById('rain-layer').hidden, ls: localStorage.getItem('ambience.mode'),
  zR: getComputedStyle(document.getElementById('rain-layer')).zIndex,
  zH: getComputedStyle(document.querySelector('.w-header')).zIndex,
}));
ok('B2 index 选雨滴 → watch 仍是雨滴、可见且盖过页眉',
  w.amb === 'rain' && w.rain === true && w.fx === 'off' && w.hidden === false && w.ls === 'rain' && +w.zR > +w.zH, w);

await page.click('#ambience-seg button[data-amb="off"]');
await page.waitForTimeout(250);
const off = await page.evaluate(() => ({ amb: window.__ambience.mode(), fx: window.__fx.mode(), rain: window.__rain.enabled(), hidden: document.getElementById('rain-layer').hidden }));
ok('B3 选关 → 两引擎全关、整层隐藏', off.amb === 'off' && off.fx === 'off' && off.rain === false && off.hidden === true, off);

await page.click('#ambience-seg button[data-amb="meteor"]');
await page.waitForTimeout(300);
const me = await page.evaluate(() => ({ amb: window.__ambience.mode(), fx: window.__fx.mode(), rain: window.__rain.enabled(), hidden: document.getElementById('rain-layer').hidden }));
ok('B4 选流星 → fx 启动、雨丝关闭', me.amb === 'meteor' && me.fx === 'meteor' && me.rain === false && me.hidden === true, me);

await page.reload({ waitUntil: 'load' });
await page.waitForFunction(() => window.__ambience && window.__ambience.mode() === 'meteor', null, { timeout: 25000 });
ok('B5 刷新后保持流星', await page.evaluate(() => window.__fx.mode() === 'meteor' && window.__rain.enabled() === false));

for (const wd of [1440, 900, 390]) {
  await page.setViewportSize({ width: wd, height: 900 });
  await page.waitForTimeout(180);
  const ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(`B6 ${wd}px 零横向溢出`, ov <= 0, { ov });
}
ok('B7 零 JS 异常', errs.length === 0, errs.slice(0, 3));

console.log(`\n第 125 轮线上（三态氛围）：${pass} PASS / ${fail} FAIL`);
await browser.close();
process.exit(fail ? 1 : 0);
