import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const ROOT = 'C:/Users/33329/WorkBuddy/2026-10-13-18-17-49/steam-playtime/docs/';
const BASE = 'http://127.0.0.1:8895/';
const css = fs.readFileSync(ROOT + 'watch.css', 'utf8').replace(/\r\n/g, '\n');
const html = fs.readFileSync(ROOT + 'watch.html', 'utf8').replace(/\r\n/g, '\n');

let pass = 0, fail = 0;
const ok = (n, c, extra = '') => { c ? (pass++, console.log(`PASS ${n}${extra ? '  ' + extra : ''}`)) : (fail++, console.log(`FAIL ${n}  ${extra}`)); };
const near = (a, b, t = 0.5) => Math.abs(a - b) <= t;

/* ---------- A：静态指纹 ---------- */
console.log('== A 静态指纹 ==');
ok('A1 watch.html 引用 watch.css?v=18', /watch\.css\?v=18"/.test(html));
const baseBlock = css.match(/\.w-home \{[^}]*\}/);
ok('A2 基础 .w-home = 132×132', !!baseBlock && /width: 132px; height: 132px;/.test(baseBlock[0]),
  baseBlock ? baseBlock[0].replace(/\s+/g, ' ').slice(0, 90) : 'no match');
const m860 = css.slice(css.indexOf('@media (max-width: 860px)'), css.indexOf('@media (max-width: 480px)'));
ok('A3 ≤860 断点内无 .w-home 尺寸覆盖', !/\.w-home\s*\{/.test(m860));
const m480 = css.slice(css.indexOf('@media (max-width: 480px)'));
ok('A4 ≤480 断点 .w-home = 88×88', /\.w-home \{ width: 88px; height: 88px; \}/.test(m480));
ok('A5 .w-home img 仍 width:100%（等比，未写死高度）', /\.w-home img \{ width: 100%; height: auto;/.test(css));
const sizeDecls = [...css.matchAll(/\.w-home\s*\{[^}]*?(width:\s*\d+px; height:\s*\d+px;)/g)].map((m) => m[1]);
ok('A6 .w-home 尺寸声明恰好 2 处（132 + 88）', sizeDecls.length === 2 && /132/.test(sizeDecls[0]) && /88/.test(sizeDecls[1]),
  JSON.stringify(sizeDecls));
/* 只看「声明」，不看注释：注释里允许出现历史值（76/60/48）作为改动说明 */
const declOnly = css.replace(/\/\*[\s\S]*?\*\//g, '');
ok('A7 去注释后不存在遗留的 76/60/48px 图标声明',
  !/\.w-home\s*\{[^}]*width:\s*(76|60|48)px/.test(declOnly));

/* ---------- B/C：实测 ---------- */
const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const SAME = [];
const WIDTHS = [1440, 1100, 861, 860, 700, 480, 390];

const rect = (page, sel, imgSel) => page.evaluate(([s, i]) => {
  const el = document.querySelector(s); if (!el) return null;
  const img = document.querySelector(i);
  const r = el.getBoundingClientRect(), ri = img.getBoundingClientRect();
  const hdr = el.parentElement.getBoundingClientRect();
  return { w: +r.width.toFixed(2), h: +r.height.toFixed(2), iw: +ri.width.toFixed(2), ih: +ri.height.toFixed(2),
    top: +r.top.toFixed(2), hTop: +hdr.top.toFixed(2),
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    transform: getComputedStyle(el).transform };
}, [sel, imgSel]);

console.log('\n== B 尺寸对齐（首页 .logo vs 观影页 .w-home）==');
for (const W of WIDTHS) {
  const ctx = await browser.newContext({ viewport: { width: W, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));

  await page.goto(BASE + 'index.html', { waitUntil: 'load' });
  await page.waitForTimeout(300);
  const a = await rect(page, '.logo', '.logo img');

  await page.goto(BASE + 'watch.html', { waitUntil: 'load' });
  await page.waitForTimeout(300);
  const b = await rect(page, '.w-home', '.w-home img');
  SAME.push({ W, a, b, errs });

  ok(`B[${W}] 容器宽高与首页完全一致 (${a.w}×${a.h} vs ${b.w}×${b.h})`, near(a.w, b.w) && near(a.h, b.h));
  ok(`B[${W}] 可见图形（img）宽高一致 (${a.iw}×${a.ih} vs ${b.iw}×${b.ih})`, near(a.iw, b.iw) && near(a.ih, b.ih));
  ok(`B[${W}] 无横向溢出`, a.overflow === 0 && b.overflow === 0, `idx=${a.overflow} watch=${b.overflow}`);
  await ctx.close();
}

/* 断点值断言 */
const at = (w) => SAME.find((x) => x.W === w).b;
ok('B8 桌面（1440）尺寸 = 132×132', at(1440).w === 132 && at(1440).h === 132);
ok('B9 861px 仍 = 132×132', at(861).w === 132);
ok('B10 860px 仍 = 132×132（取消旧 60 覆盖）', at(860).w === 132, `${at(860).w}`);
ok('B11 700px 仍 = 132×132', at(700).w === 132);
ok('B12 480px = 88×88', at(480).w === 88 && at(480).h === 88);
ok('B13 390px = 88×88', at(390).w === 88);
ok('B14 图标未溢出页眉（top ≥ 页眉 top）', SAME.every(({ a, b }) => b.top >= b.hTop - 0.01 && a.top >= a.hTop - 0.01));

/* 标题不被挤成 3 行 */
const ctx2 = await browser.newContext({ viewport: { width: 390, height: 900 } });
const p2 = await ctx2.newPage();
await p2.goto(BASE + 'watch.html', { waitUntil: 'load' });
await p2.waitForTimeout(300);
const wStyle = await p2.evaluate(() => {
  const t = document.querySelector('.w-title');
  const cs = getComputedStyle(t);
  return { fs: cs.fontSize, lh: cs.lineHeight, ls: cs.letterSpacing };
});
await p2.goto(BASE + 'index.html', { waitUntil: 'load' });
await p2.waitForTimeout(300);
const hStyle = await p2.evaluate(() => {
  const t = document.querySelector('.site-title');
  const cs = getComputedStyle(t);
  return { fs: cs.fontSize, lh: cs.lineHeight, ls: cs.letterSpacing };
});
/* 第 70 轮：站名由「My Watch List」改为「Watch List」，两页文案长度不同 →
   行数不可比。改为比对真正的契约：字号 / 行高 / 字距与首页一致。 */
ok('B15 390px 标题字号·行高·字距与首页 .site-title 一致',
  wStyle.fs === hStyle.fs && wStyle.lh === hStyle.lh && wStyle.ls === hStyle.ls,
  `watch ${wStyle.fs}/${wStyle.lh}/${wStyle.ls} vs home ${hStyle.fs}/${hStyle.lh}/${hStyle.ls}`);
await ctx2.close();

console.log('\n== C 交互 ==');
const ctx3 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const p3 = await ctx3.newPage();
const errs3 = [];
p3.on('pageerror', (e) => errs3.push(String(e)));
await p3.goto(BASE + 'index.html', { waitUntil: 'load' });
await p3.waitForTimeout(300);
await p3.click('#logo-watch');
await p3.waitForURL(/watch\.html/, { timeout: 5000 }).catch(() => {});
ok('C1 首页点小黄人进入观影页', /watch\.html/.test(p3.url()), p3.url());
await p3.waitForTimeout(400);
await p3.click('.w-home');
await p3.waitForURL((u) => !/watch\.html/.test(u.href), { timeout: 5000 }).catch(() => {});
ok('C2 观影页点小黄人返回首页', !/watch\.html/.test(p3.url()), p3.url());
await p3.waitForTimeout(300);

/* hover 反馈仍在（transform 生效） */
await p3.goto(BASE + 'watch.html', { waitUntil: 'load' });
await p3.waitForTimeout(300);
await p3.hover('.w-home');
await p3.waitForTimeout(260);
const hoverT = await p3.evaluate(() => getComputedStyle(document.querySelector('.w-home')).transform);
ok('C3 hover 仍有 scale 反馈', hoverT !== 'none' && /matrix/.test(hoverT), hoverT);
ok('C4 全程零 JS 异常', errs3.length === 0, errs3.join(' | '));
await ctx3.close();

await browser.close();
console.log(`\n===== 第 55 轮回归：${pass}/${pass + fail} =====`);
process.exit(fail ? 1 : 0);
