/* online124.mjs — 第 124 轮上线复验：两页雨丝（v=6）
 * ① 指纹：线上 index/watch 都引用 rain.css?v=6 / rain.js?v=6；四资源 200 且
 *    html/rain.* 字节 md5 与本地全等；既有 css/js 版本号未动（144/129/19、44/35）。
 * ② 运行时：两页雨丝层就绪、默认开、数量 >0、linear-gradient 渐隐、宽 ≤2px；
 *    层 fixed 不拦点击；关→整层隐藏+storage=0、开→持久化；三档零溢出；零异常。
 * 用法：node tests/online/online123.mjs */
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
const browser = await chromium.launch({ args: ['--no-proxy-server'] });

const fpCtx = await browser.newContext({ serviceWorkers: 'block' });
const fpPage = await fpCtx.newPage();
await fpPage.goto(SITE, { waitUntil: 'domcontentloaded', timeout: 60000 });
const fp = await fpPage.evaluate(async ({ site }) => {
  const g = async (u) => { const r = await fetch(site + u, { cache: 'reload' }); return { s: r.status, t: await r.text() }; };
  const cb = Date.now();
  const [i, w, j, c] = await Promise.all([
    g('index.html?cb=' + cb), g('watch.html?cb=' + cb),
    g('rain.js?v=6&cb=' + cb), g('rain.css?v=6&cb=' + cb),
  ]);
  return { i: i.t, w: w.t, j: j.t, c: c.t, st: [i.s, w.s, j.s, c.s] };
}, { site: SITE });
ok('A1 线上两页都以 v=6 引入 rain.css / rain.js 且四资源全 200',
  fp.st.every((s) => s === 200) &&
  /rain\.css\?v=6["']/.test(fp.i) && /rain\.js\?v=6["']/.test(fp.i) &&
  /rain\.css\?v=6["']/.test(fp.w) && /rain\.js\?v=6["']/.test(fp.w), { st: fp.st });
ok('A2 线上 index/watch/rain.js/rain.css 字节 md5 与本地全等',
  md5(fp.i) === md5(idxLocal) && md5(fp.w) === md5(watLocal) &&
  md5(fp.j) === md5(rainJs) && md5(fp.c) === md5(rainCss));
ok('A3 既有版本号未动（index 144/129/19、watch 44/35）',
  /style\.css\?v=144["']/.test(fp.i) && /app\.js\?v=133["']/.test(fp.i) && /fx\.js\?v=19["']/.test(fp.i) &&
  /watch\.css\?v=44["']/.test(fp.w) && /watch\.js\?v=35["']/.test(fp.w));
ok('A4 线上是雨丝层（rain-streak / linear-gradient / 无 backdrop-filter）',
  /id="rain-layer"/.test(fp.i) && /id="rain-layer"/.test(fp.w) &&
  /rain-streak/.test(fp.j) && /linear-gradient/.test(fp.c) &&
  /* CSS 注释里保留了「已移除 backdrop-filter」的历史说明，检查前先去注释 */
  !/backdrop-filter/.test(fp.c.replace(/\/\*[\s\S]*?\*\//g, '')));
await fpCtx.close();

for (const [name, url] of [['index', SITE], ['watch', SITE + 'watch.html']]) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(url + '?cb=' + Date.now(), { waitUntil: 'load', timeout: 60000 });
  await page.evaluate(() => { try { localStorage.removeItem('rain.enabled'); } catch (e) {} });
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.__rain && window.__rain.ready(), null, { timeout: 25000 });
  await page.waitForTimeout(250);

  const st = await page.evaluate(() => {
    const l = document.getElementById('rain-layer');
    const s = getComputedStyle(l);
    const ds = [...document.querySelectorAll('.rain-streak')];
    const d = ds[0];
    return {
      enabled: window.__rain.enabled(), count: window.__rain.count(),
      bg: d ? getComputedStyle(d).backgroundImage : '',
      maxW: d ? Math.max(...ds.map((x) => parseFloat(getComputedStyle(x).width))) : 99,
      layer: { hidden: l.hidden, pos: s.position, pe: s.pointerEvents, z: s.zIndex },
      pressed: document.getElementById('rain-toggle').getAttribute('aria-pressed'),
    };
  });
  ok(`B1 ${name} 雨丝层就绪、默认开、数量 >0、linear-gradient`,
    st.enabled === true && st.count > 0 && /linear-gradient/.test(st.bg) && st.layer.hidden === false,
    { count: st.count });
  ok(`B2 ${name} 雨丝宽 ≤2px、层 fixed 不拦点击、z=6、按钮为开`,
    st.maxW <= 2.1 && st.layer.pos === 'fixed' && st.layer.pe === 'none' && st.layer.z === '6' && st.pressed === 'true',
    { maxW: +st.maxW.toFixed(2), layer: st.layer });

  await page.click('#rain-toggle');
  await page.waitForTimeout(250);
  const off = await page.evaluate(() => ({
    enabled: window.__rain.enabled(), stored: localStorage.getItem('rain.enabled'),
    hidden: document.getElementById('rain-layer').hidden,
  }));
  ok(`B3 ${name} 关→整层隐藏并写 localStorage=0`,
    off.enabled === false && off.stored === '0' && off.hidden === true, off);
  await page.click('#rain-toggle');
  await page.waitForTimeout(250);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.__rain && window.__rain.ready(), null, { timeout: 25000 });
  ok(`B4 ${name} 再开后刷新持久化`,
    await page.evaluate(() => window.__rain.enabled() === true && localStorage.getItem('rain.enabled') === '1'));

  for (const w of [1440, 900, 390]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.waitForTimeout(180);
    const ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(`B5 ${name} ${w}px 零横向溢出`, ov <= 0, { ov });
  }
  ok(`B6 ${name} 零 JS 异常`, errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

console.log(`\n第 124 轮线上（两页雨丝）：${pass} PASS / ${fail} FAIL`);
await browser.close();
process.exit(fail ? 1 : 0);
