/* online128_watch.mjs — 第 128 轮上线复验：Watch 页六项视觉精修
 * ① 指纹：线上 watch.html 引用 watch.css?v=45 / watch.js?v=35；
 *    watch.html/watch.css/watch.js 字节 md5 与本地全等。
 * ② 静态：六项规则线上齐备（年份分隔/评分辉光/衬线/字距/dialog高光/入场淡入）+ 冻结值未回退。
 * ③ 运行时：短评衬线、年报标题字距、dialog 高光条、入场淡入、零异常。
 * 用法：node tests/online/online128_watch.mjs */
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
const jsLocal = fs.readFileSync(ROOT + 'docs/watch.js', 'utf8');
const watLocal = fs.readFileSync(ROOT + 'docs/watch.html', 'utf8');
const browser = await chromium.launch({ args: ['--no-proxy-server'] });

const fpCtx = await browser.newContext({ serviceWorkers: 'block' });
const fpPage = await fpCtx.newPage();
await fpPage.goto(SITE + 'watch.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
const fp = await fpPage.evaluate(async ({ site }) => {
  const g = async (u) => { const r = await fetch(site + u, { cache: 'reload' }); return { s: r.status, t: await r.text() }; };
  const cb = Date.now();
  const [w, c, j] = await Promise.all([
    g('watch.html?cb=' + cb), g('watch.css?v=45&cb=' + cb), g('watch.js?v=35&cb=' + cb),
  ]);
  return { w: w.t, c: c.t, j: j.t, st: [w.s, c.s, j.s] };
}, { site: SITE });
ok('A1 线上 watch45/js35 三个资源全 200',
  fp.st.every((s) => s === 200) &&
  /watch\.css\?v=45/.test(fp.w) && /watch\.js\?v=35/.test(fp.w), { st: fp.st });
ok('A2 线上 watch.html/watch.css/watch.js md5 与本地全等',
  md5(fp.w) === md5(watLocal) && md5(fp.c) === md5(cssLocal) && md5(fp.j) === md5(jsLocal));
const code = fp.c.replace(/\/\*[\s\S]*?\*\//g, '');
ok('A3 六项规则线上齐备 + 冻结值未回退（跨度/w-grid/歌单列数/860=1）',
  /\.st-song-year \+ \.st-song-year::before/.test(code) && /var\(--gold-soft\)/.test(code) &&
  /'Songti SC'/.test(code) && /\.st-panel h3, \.st-songs h3 \{ letter-spacing: \.6px/.test(code) &&
  /\.w-add::before/.test(code) && /@keyframes w-fade-in/.test(code) &&
  /\.st-panel\[data-panel="months"\]\s*\{ grid-column: span 4/.test(code) &&
  /minmax\(234px, 1fr\)/.test(code) && /gap: 34px 12px/.test(code) &&
  /grid-template-columns: repeat\(10, minmax\(0, 1fr\)\)/.test(code) &&
  (code.match(/@media \(max-width: 860px\)/g) || []).length === 1);
await fpCtx.close();

const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto(SITE + 'watch.html?cb=' + Date.now(), { waitUntil: 'load', timeout: 60000 });
// 等真实海报+短评渲染（数据异步加载，不能只看 .poster 闪现）
await page.waitForFunction(() => document.querySelector('#w-grid .poster-note'), null, { timeout: 25000 }).catch(() => {});
await page.waitForTimeout(400);
const st = await page.evaluate(() => {
  const n = document.querySelector('#w-grid .poster-note');
  const p = document.querySelector('#w-grid .poster');
  return { notes: document.querySelectorAll('#w-grid .poster-note').length,
    fam: n ? getComputedStyle(n).fontFamily : null, anim: p ? getComputedStyle(p).animationName : null };
});
ok('B1 线上短评衬线族 + 海报入场淡入',
  st.fam !== null && /Songti|serif|Georgia/.test(st.fam) && st.anim === 'w-fade-in', st);
await page.click('.w-fab');
await page.waitForTimeout(250);
const dlg = await page.evaluate(() => {
  const d = document.querySelector('.w-add');
  const cs = d ? getComputedStyle(d, '::before') : null;
  return cs ? { pos: cs.position, h: cs.height, content: cs.content } : null;
});
ok('B2 线上录入弹窗顶部金高光条（不占布局）',
  dlg && dlg.pos === 'absolute' && parseFloat(dlg.h) === 2 && dlg.content !== 'none', dlg);
await page.keyboard.press('Escape');
ok('C1 全程零 JS 异常', errs.length === 0, errs.slice(0, 3));
await browser.close();
console.log(`\n线上第 128 轮：${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
