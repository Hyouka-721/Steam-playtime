/* 第 89 轮 watch 侧线上复验：评分角标「完全删除背景填充，只保留金色评分数字」
   （★ 按用户确认保留）。对应提交 70fc2b6 + 82a7ebc + merge，预期线上 watch.css?v=28。

   ① 指纹：watch.html 引用 v=26 / v=16；线上 css / js 字节 md5 与本地全等（CRLF→LF）；
            线上 CSS 里不存在 .poster-score::before / ::after；线上 watch.json 与本地全等
   ② 1440 运行时：卡片数 = 本地数据条数；本体零背景、::before 不生成、12/600/#dcb978、
            text-shadow 在、★ 仍在、hover 只换字色仍零背景；合成底逐像素零填充 + 轮廓对比
   ③ 390 运行时：角标仍在海报内、尺寸不塌、零底盘、★ 仍在、无溢出、零异常

   ⚠️ 本文件带 `_watch` 后缀：另一条线的 online89.mjs（若存在）属 index 站，轮号会撞、文件不撞。
   ⚠️ 统一 --no-proxy-server；线上字节在页内 fetch 后回传，避开 Node 直连 github.io 不通。
   ⚠️ 旧 online85_watch B4 断言「1px 描边 + 13px」是第 85 轮历史快照，已过期，不要拿它复验。 */
import { createRequire } from 'module';
import fs from 'fs';
import crypto from 'crypto';
import sharp from 'sharp';
const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const SITE = 'https://hyouka-721.github.io/Steam-playtime/';
const ROOT = 'C:/Users/33329/WorkBuddy/2026-10-13-18-17-49/steam-playtime/docs/';
const TS = Date.now();

const md5 = (b) => crypto.createHash('md5').update(b).digest('hex');
const norm = (s) => String(s).replace(/\r\n/g, '\n');
const md5txt = (s) => md5(Buffer.from(norm(s), 'utf8'));
const localCss = norm(fs.readFileSync(ROOT + 'watch.css', 'utf8'));
const localJs = norm(fs.readFileSync(ROOT + 'watch.js', 'utf8'));
/* ⚠️ watch.json 顶层是 `{ updated_at, items: [...] }`，不是数组 —— 直接 `.length` 会拿到
   undefined，B1 会假红。条数一律从 items 推导，别手抄 121/124 这类绝对值。 */
const localWatchRaw = norm(fs.readFileSync(ROOT + 'data/watch.json', 'utf8'));
const localWatch = JSON.parse(localWatchRaw).items;

let pass = 0, fail = 0;
const ok = (n, c, extra = '') => {
  c ? (pass++, console.log(`PASS ${n}${extra ? '  — ' + extra : ''}`))
    : (fail++, console.log(`FAIL ${n}  — ${extra}`));
};

const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const L = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a, b) => +(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toFixed(2));
const BG = L(246, 239, 233);
const GOLD = L(220, 185, 120);

const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
await page.goto(SITE + 'watch.html?t=' + TS, { waitUntil: 'load' });
await page.waitForFunction(() => document.querySelectorAll('#w-grid .poster').length > 20, null, { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(800);

/* ---------- ① 内容指纹 ---------- */
console.log('== ① 内容指纹 ==');
const html = await page.evaluate(async (u) => (await fetch(u, { cache: 'reload' })).text(), SITE + 'watch.html?t=' + TS);
ok('A1 线上 watch.html 引用 watch.css?v=28 / watch.js?v=17',
  /watch\.css\?v=28/.test(html) && /watch\.js\?v=17/.test(html));

const liveCss = await page.evaluate(async (u) => (await fetch(u, { cache: 'reload' })).text(), SITE + 'watch.css?v=28&t=' + TS);
const liveJs = await page.evaluate(async (u) => (await fetch(u, { cache: 'reload' })).text(), SITE + 'watch.js?v=17&t=' + TS);
ok('A2 线上 watch.css 字节 md5 与本地全等（CRLF 归一成 LF 后比）',
  md5txt(liveCss) === md5txt(localCss), `${md5txt(liveCss).slice(0, 12)} / ${md5txt(localCss).slice(0, 12)}`);
ok('A3 线上 watch.js 字节 md5 与本地全等（本轮纯 CSS，js 未动）',
  md5txt(liveJs) === md5txt(localJs), `${md5txt(liveJs).slice(0, 12)}`);
const liveNoCmt = liveCss.replace(/\/\*[\s\S]*?\*\//g, '');
ok('A4 线上 CSS 里没有 .poster-score 的 ::before / ::after 规则，且 text-shadow 仍在',
  !/\.poster-score\s*::\s*(before|after)/.test(liveNoCmt) && /\.poster-score\s*\{[^}]*text-shadow:/.test(liveNoCmt));
const liveWatch = await page.evaluate(async (u) => (await fetch(u, { cache: 'reload' })).text(), SITE + 'data/watch.json?t=' + TS);
ok('A5 线上 watch.json 与本地全等（merge 了 7 个 CI 数据提交后仍一致）',
  norm(liveWatch) === localWatchRaw, `本地 ${localWatch.length} 条`);

/* ---------- ② 1440 运行时 ---------- */
console.log('== ② 1440 运行时 ==');
const rt = await page.evaluate(() => {
  const cards = [...document.querySelectorAll('#w-grid .poster')];
  const s = document.querySelector('.poster-score');
  const pic = s.closest('.poster-pic');
  const cs = getComputedStyle(s), bs = getComputedStyle(s, '::before');
  const star = s.querySelector('i');
  const r = s.getBoundingClientRect(), pr = pic.getBoundingClientRect();
  return {
    n: cards.length,
    bg: cs.backgroundColor, border: cs.borderTopWidth,
    none: (cs.backdropFilter || cs.webkitBackdropFilter || 'none') + '|' + cs.boxShadow,
    preContent: bs.content, preBg: bs.backgroundColor, preFilter: bs.filter,
    fs: cs.fontSize, fw: cs.fontWeight, color: cs.color, shadow: cs.textShadow,
    star: star ? { text: star.textContent.trim(), fs: getComputedStyle(star).fontSize } : null,
    h: +r.height.toFixed(1),
    inside: r.right <= pr.right + 0.6 && r.bottom <= pr.bottom + 0.6 && r.left >= pr.left - 0.6 && r.top >= pr.top - 0.6,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  };
});
ok('B1 线上卡片数 = 本地 watch.json 条数', rt.n === localWatch.length, `线上 ${rt.n} / 本地 ${localWatch.length}`);
ok('B2 线上本体零背景：底透明 / border 0 / 无 backdrop-filter / 无 box-shadow',
  /rgba\(0,\s*0,\s*0,\s*0\)|transparent/.test(rt.bg) && parseFloat(rt.border) === 0 && rt.none === 'none|none',
  `${rt.bg} | border=${rt.border} | ${rt.none}`);
ok('B3 线上 ::before 根本不生成（content none / 背景透明 / filter none）',
  rt.preContent === 'none' && /rgba\(0,\s*0,\s*0,\s*0\)|transparent/.test(rt.preBg) && rt.preFilter === 'none',
  `content=${rt.preContent} | ${rt.preBg} | ${rt.preFilter}`);
ok('B4 线上 12px / 600 / #dcb978，★ 仍是 9px 且字形暗晕在',
  rt.fs === '12px' && rt.fw === '600' && rt.color === 'rgb(220, 185, 120)' &&
  !!rt.star && rt.star.text === '★' && rt.star.fs === '9px' && /rgba\(0,\s*0,\s*0/.test(rt.shadow),
  `${rt.fs} ${rt.fw} ${rt.color} | ★${rt.star ? rt.star.fs : '-'}`);
ok('B5 角标仍在海报内、高度不塌', rt.inside && rt.h >= 20, `h=${rt.h}`);

/* hover：只换字色，仍零背景 */
const first = page.locator('#w-grid .poster').first();
await first.scrollIntoViewIfNeeded();
await first.hover();
await page.waitForTimeout(420);
const hov = await page.evaluate(() => {
  const s = document.querySelector('#w-grid .poster:hover .poster-score');
  if (!s) return null;
  const cs = getComputedStyle(s);
  return { color: cs.color, bg: cs.backgroundColor, shadow: cs.boxShadow, pre: getComputedStyle(s, '::before').content };
});
ok('B6 hover 字色回到 rgb(232,176,75)，且线上仍零背景（只换字，不画盘）',
  !!hov && hov.color === 'rgb(232, 176, 75)' && /rgba\(0,\s*0,\s*0,\s*0\)|transparent/.test(hov.bg) &&
  hov.shadow === 'none' && hov.pre === 'none',
  hov ? `${hov.color} | bg=${hov.bg} | ::before=${hov.pre}` : 'hover 未命中');

/* ---------- 零填充逐像素（线上页面里合成纯色底） ---------- */
await page.mouse.move(1, 1);
await page.waitForTimeout(320);
await page.evaluate(() => {
  [...document.querySelectorAll('#w-grid .poster')].slice(0, 14).forEach((card) => {
    const pic = card.querySelector('.poster-pic');
    const img = pic.querySelector('img');
    if (img) img.style.visibility = 'hidden';
    pic.style.background = '#f6efe9';
  });
});
await page.waitForTimeout(300);
const badge = page.locator('#w-grid .poster-score').first();
await badge.scrollIntoViewIfNeeded();
await page.mouse.move(1, 1);
await page.waitForTimeout(260);
const bb = await badge.boundingBox();
const PAD = 16, DPR = 2;
const clip = { x: bb.x - PAD, y: bb.y - PAD, width: bb.width + PAD * 2, height: bb.height + PAD * 2 };
const buf = await page.screenshot({ clip });
const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
const ch = info.channels, W = info.width, H = info.height;
const left = Math.round((bb.x - clip.x) * DPR);
const textL = left + 8 * DPR, textR = left + Math.round(bb.width * DPR) - 8 * DPR;
const y = Math.floor(H / 2);
const lum = [];
for (let x = 0; x < W; x++) { const i = (y * W + x) * ch; lum.push(L(data[i], data[i + 1], data[i + 2])); }
const dev = (a, b) => { let mx = 0; for (let x = a; x < b && x < W; x++) mx = Math.max(mx, Math.abs(lum[x] - BG)); return +mx.toFixed(4); };
let halo = 1, pure = 0, total = 0;
for (let yy = Math.floor(H * 0.3); yy < Math.ceil(H * 0.7); yy++) {
  for (let x = textL; x < Math.min(W, textR); x++) {
    const i = (yy * W + x) * ch, v = L(data[i], data[i + 1], data[i + 2]);
    if (v < halo) halo = v;
    total++;
    if (Math.abs(v - BG) <= 0.01) pure++;
  }
}
const outDev = dev(0, left - 2), padDev = dev(left, left + 8);
const purePct = +(pure / total * 100).toFixed(1);
ok('B7 线上零填充：盒外沿与内边距逐像素等于纯合成底（各 ≤0.01）',
  outDev <= 0.01 && padDev <= 0.01, `外沿 ${outDev} / 内边距 ${padDev}`);
ok('B8 线上文字区仍有 ≥15% 未改动亮底像素（不是一块暗板）', purePct >= 15, `${purePct}%`);
ok('B9 线上仍可读：亮底/暗晕 ≥4.5:1 且 金字/暗晕 ≥2.5:1',
  ratio(BG, halo) >= 4.5 && ratio(GOLD, halo) >= 2.5,
  `暗晕 ${halo.toFixed(3)} → ${ratio(BG, halo)}:1 / ${ratio(GOLD, halo)}:1`);
ok('B10 1440 无横向溢出 + 零 JS 异常', rt.overflow === 0 && errs.length === 0, `ov=${rt.overflow} err=${errs.length}`);
await ctx.close();

/* ---------- ③ 390 运行时 ---------- */
console.log('== ③ 390 运行时 ==');
const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
const mp = await mctx.newPage();
const merrs = [];
mp.on('pageerror', (e) => merrs.push(String(e)));
await mp.goto(SITE + 'watch.html?t=' + TS, { waitUntil: 'load' });
await mp.waitForTimeout(900);
const m = await mp.evaluate(() => {
  const s = document.querySelector('.poster-score');
  const pic = s.closest('.poster-pic');
  const r = s.getBoundingClientRect(), pr = pic.getBoundingClientRect();
  return {
    inside: r.right <= pr.right + 0.6 && r.bottom <= pr.bottom + 0.6 && r.left >= pr.left - 0.6 && r.top >= pr.top - 0.6,
    h: +r.height.toFixed(1),
    pre: getComputedStyle(s, '::before').content,
    bg: getComputedStyle(s).backgroundColor,
    star: !!s.querySelector('i'),
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  };
});
ok('C1 390 下角标仍在海报内、尺寸不塌、零底盘、★ 仍在',
  m.inside && m.h >= 20 && m.pre === 'none' && /rgba\(0,\s*0,\s*0,\s*0\)|transparent/.test(m.bg) && m.star,
  `h=${m.h} content=${m.pre} ★=${m.star}`);
ok('C2 390 无横向溢出 + 零 JS 异常', m.overflow === 0 && merrs.length === 0, `ov=${m.overflow} err=${merrs.length}`);

await browser.close();
console.log(`\n===== 第 89 轮 watch 线上复验（零填充）：${pass} PASS / ${fail} FAIL =====`);
process.exit(fail ? 1 : 0);
