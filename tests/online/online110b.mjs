/* online110b.mjs — 2026-11-07 上线复验：标题文字样式对齐观影页
   断言：版本号 134/119 · 影院黑下 .site-title 与 .w-title 计算样式逐条相同 ·
        悬停变色在影院黑与奶油下都成立 · 辉光与过渡曲线到位 · 零 JS 异常 */
import { createRequire } from 'module';

const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const SITE = 'https://hyouka-721.github.io/Steam-playtime/';
let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('PASS ', name, extra === undefined ? '' : '— ' + JSON.stringify(extra)); }
  else { fail++; console.log('FAIL ', name, '— ' + JSON.stringify(extra)); }
};

const browser = await chromium.launch({ args: ['--no-proxy-server'] });

/** 打开某页并锁定主题，返回标题的默认/悬停计算样式 */
async function probe(pageUrl, sel, theme) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 700 }, serviceWorkers: 'block' });
  if (theme) await ctx.addInitScript((t) => { try { localStorage.setItem('theme', t); } catch (e) {} }, theme);
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e)));
  await p.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForSelector(sel, { timeout: 40000 });
  await p.waitForTimeout(800);
  const read = () => p.evaluate((s) => {
    const el = document.querySelector(s);
    const cs = getComputedStyle(el);
    return { color: cs.color, shadow: cs.textShadow, transition: cs.transition, fs: cs.fontSize, ls: cs.letterSpacing };
  }, sel);
  const before = await read();
  await p.hover(sel);
  await p.waitForTimeout(400);
  const after = await read();
  await p.mouse.move(1, 1);
  await p.waitForTimeout(300);
  const back = await read();
  const themeNow = await p.evaluate(() => document.documentElement.dataset.theme);
  await ctx.close();
  return { before, after, back, themeNow, errs };
}

/* ---------- A 版本号 ---------- */
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 700 }, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  await p.goto(SITE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForTimeout(500);
  const v = await p.evaluate(() => {
    const h = document.documentElement.outerHTML;
    return { css: (h.match(/style\.css\?v=(\d+)/) || [])[1], js: (h.match(/app\.js\?v=(\d+)/) || [])[1] };
  });
  ok('A1 线上已是 style.css?v=134 / app.js?v=119', v.css === '134' && v.js === '119', v);
  await ctx.close();
}

/* ---------- B 影院黑：两页标题逐条一致 ---------- */
const idxCin = await probe(SITE + 'index.html', '#site-title', 'cinema');
const watCin = await probe(SITE + 'watch.html', '.w-title', 'cinema');

ok('B1 首页影院黑主题已生效', idxCin.themeNow === 'cinema', idxCin.themeNow);
ok('B2 默认颜色与观影页完全一致（近白 #f5f5f8）',
  idxCin.before.color === watCin.before.color && idxCin.before.color === 'rgb(245, 245, 248)',
  { index: idxCin.before.color, watch: watCin.before.color });
ok('B3 暖金辉光与观影页完全一致',
  idxCin.before.shadow === watCin.before.shadow, { index: idxCin.before.shadow, watch: watCin.before.shadow });
ok('B4 过渡曲线与观影页完全一致',
  idxCin.before.transition === watCin.before.transition, { index: idxCin.before.transition, watch: watCin.before.transition });
ok('B5 悬停变金黄色，且与观影页同值（#e8b04b）',
  idxCin.after.color === watCin.after.color && idxCin.after.color === 'rgb(232, 176, 75)',
  { index: idxCin.after.color, watch: watCin.after.color });
ok('B6 移开鼠标后颜色回到默认', idxCin.back.color === idxCin.before.color, idxCin.back.color);
ok('B7 字号/字距未被本次改动影响（70px / 2px）',
  idxCin.before.fs === '70px' && idxCin.before.ls === '2px', { fs: idxCin.before.fs, ls: idxCin.before.ls });

/* ---------- C 奶油主题：颜色可不同，但要变色 ---------- */
const idxCream = await probe(SITE + 'index.html', '#site-title', 'cream');
ok('C1 首页奶油主题已生效', idxCream.themeNow === 'cream', idxCream.themeNow);
ok('C2 奶油下默认用深色（浅底上能看清，不用白字）',
  idxCream.before.color !== 'rgb(245, 245, 248)', idxCream.before.color);
ok('C3 奶油下悬停同样变色', idxCream.after.color !== idxCream.before.color,
  { before: idxCream.before.color, after: idxCream.after.color });
ok('C4 奶油下悬停色 = --accent（橙）', idxCream.after.color === 'rgb(217, 118, 47)', idxCream.after.color);
ok('C5 奶油下移开鼠标后回色', idxCream.back.color === idxCream.before.color, idxCream.back.color);

/* ---------- D 健康度 ---------- */
const errs = [...idxCin.errs, ...idxCream.errs, ...watCin.errs].filter((s) => !/steamstatic|favicon|Failed to load resource/i.test(s));
ok('D1 零 JS 异常', errs.length === 0, errs.slice(0, 3));

console.log(`\n===== online110b  PASS=${pass} FAIL=${fail} =====`);
await browser.close();
process.exit(fail ? 1 : 0);
