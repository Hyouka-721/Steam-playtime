/* 第 100 轮 watch 侧上线复验：表单精简 · 年度影视海报墙 · 饼图去黑缝
 *
 * 用户原话（三条）：
 *   1. 删除「上映日期」及其界面；将「排序 / 国别 / 标签」并列到同一行；
 *      同时删掉国别的说明文字（逗号或顿号分隔，可留空；如 美国, 英国）和标签的说明文字（逗号或顿号分隔）。
 *   2. 年度影视中海报采用网格视图相同规格，仅展示海报和年份，不展示片名和评分。
 *   3. 饼图中两个区块之间有黑色的区域分隔，删除这些黑色。
 *
 * 复验口径：
 *   ① 指纹 8 —— HTML 引用 v=38/v=30、css/js/html 字节 md5 与本地全等、
 *      **线上字节里确有本轮判据**（不只是版本号变了）：JS 首尾相接无缝 + releaseText 兜底、
 *      CSS 海报网格规格 + 无片名/评分样式、HTML 剥注释后无上映日期入口与两处说明文字、
 *      YEAR_PICKS 九条齐全
 *   ② 1920 运行时 7 —— 9 条年份+海报且无片名/评分、海报 computed 规格与网格视图逐项全等、
 *      年份在海报下方、表单三字段同行且无上映日期、饼图相邻片首尾角差 ≤0.02°、三卡成行、零溢出零异常
 *   ③ 390 运行时 3 —— 三字段回单列、9 条年份齐全且海报不越界、饼图同样无缝
 *
 * ⚠️ 线上字节一律在页内 fetch 回传（Node 直连 github.io 不通），统一 --no-proxy-server。
 * ⚠️ 全程只读：不点提交、不录数据，不会产生任何 PUT。
 * ⚠️ 推送前可用 ONLINE_SITE=http://127.0.0.1:8895/ 彩排（第 92/95 轮经验）。
 */
import { createRequire } from 'module';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const SITE = process.env.ONLINE_SITE || 'https://hyouka-721.github.io/Steam-playtime/';
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const TS = Date.now();
const rd = (p) => fs.readFileSync(ROOT + 'docs/' + p, 'utf8').replace(/\r\n/g, '\n');
const md5 = (b) => crypto.createHash('md5').update(b).digest('hex');
const norm = (s) => String(s).replace(/\r\n/g, '\n');
const md5txt = (s) => md5(Buffer.from(norm(s), 'utf8'));
const stripJsCmt = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');

const localHtml = rd('watch.html');
const localCss = rd('watch.css');
const localJs = rd('watch.js');
const PICKS = ['2026', '2025', '2024', '2023', '2022', '2021', '2020', '2019', '2018'];

let pass = 0, fail = 0;
const ok = (n, c, extra = '') => {
  c ? (pass++, console.log(`PASS ${n}${extra ? '  — ' + extra : ''}`))
    : (fail++, console.log(`FAIL ${n}  — ${extra}`));
};
const angDiff = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

const browser = await chromium.launch({ args: ['--no-proxy-server'] });

/* ---------------- ① 内容指纹 ---------------- */
console.log('== ① 内容指纹 ==');
const ctx0 = await browser.newContext({ viewport: { width: 1920, height: 1200 }, serviceWorkers: 'block' });
const p0 = await ctx0.newPage();
await p0.goto(SITE + 'watch.html?t=' + TS, { waitUntil: 'load', timeout: 45000 });
await p0.waitForFunction(() => document.querySelectorAll('#w-grid .poster').length > 20, null, { timeout: 45000 }).catch(() => {});

const html = await p0.evaluate(async (u) => (await fetch(u, { cache: 'reload' })).text(), SITE + 'watch.html?t=' + TS);
const liveCss = await p0.evaluate(async (u) => (await fetch(u, { cache: 'reload' })).text(), SITE + 'watch.css?v=38&t=' + TS);
const liveJs = await p0.evaluate(async (u) => (await fetch(u, { cache: 'reload' })).text(), SITE + 'watch.js?v=30&t=' + TS);
const liveJsNC = stripJsCmt(liveJs);
const liveCssNC = stripJsCmt(liveCss);
const htmlNC = html.replace(/<!--[\s\S]*?-->/g, '');

ok('A1 线上 watch.html 引用 watch.css?v=38 / watch.js?v=30',
  /watch\.css\?v=38/.test(html) && /watch\.js\?v=30/.test(html),
  (html.match(/watch\.(css|js)\?v=\d+/g) || []).join(' '));
ok('A2 线上 watch.css 字节 md5 与本地全等', md5txt(liveCss) === md5txt(localCss),
  `${md5txt(liveCss).slice(0, 12)} / ${md5txt(localCss).slice(0, 12)}`);
ok('A3 线上 watch.js 字节 md5 与本地全等', md5txt(liveJs) === md5txt(localJs),
  `${md5txt(liveJs).slice(0, 12)} / ${md5txt(localJs).slice(0, 12)}`);
ok('A4 线上 watch.html 字节 md5 与本地全等', md5txt(html) === md5txt(localHtml),
  `${md5txt(html).slice(0, 12)} / ${md5txt(localHtml).slice(0, 12)}`);

/* 第 100 轮硬证据：线上字节里确实有「删上映日期 / 三字段同行 / 说明文字删净」，不是只看版本号。 */
const oiL = html.indexOf('id="add-order"');
const ciL = html.indexOf('id="add-country"');
const tiL = html.indexOf('id="add-tags"');
const rowOpen = html.lastIndexOf('<div class="w-row w-row-3">', ciL);
ok('A5 线上 HTML：剥注释后无上映日期入口/字样、两处说明文字删净、三字段包同一个 .w-row.w-row-3',
  !/id="add-release"/.test(htmlNC) && !/上映日期/.test(htmlNC) && !/for="add-release"/.test(htmlNC) &&
  !/逗号或顿号分隔/.test(htmlNC) &&
  /for="add-country">国别<\/label>/.test(html) && /for="add-tags">标签<\/label>/.test(html) &&
  rowOpen > 0 && oiL > rowOpen && ciL > oiL && tiL > ciL &&
  (html.slice(rowOpen, tiL + 20).match(/<\/div>/g) || []).length === 2,
  `rowOpen@${rowOpen} order@${oiL} country@${ciL} tags@${tiL}`);

ok('A6 线上 JS：饼图首尾相接无缝（a0=ang / a1=ang+sweep）、无 1.1° 缝；releaseText() 历史兜底仍在',
  /var ang = -90;/.test(liveJsNC) && /var a0 = ang, a1 = ang \+ sweep;/.test(liveJsNC) &&
  !/gap = 1\.1|1\.1° 的缝/.test(liveJsNC) &&
  !/'add-release'|readReleaseField|rejectRelease|releaseRead/.test(liveJsNC) &&
  /if \(it\.release_date\) return String\(it\.release_date\)/.test(liveJsNC));

ok('A7 线上 JS + CSS：年度影视只渲染海报+年份，CSS 用 .poster-pic 同款规格与三档列宽',
  /'<img class="st-top-img"/.test(liveJsNC) && /'<span class="st-top-year">'/.test(liveJsNC) &&
  !/st-top-name|st-top-score/.test(liveJsNC) && !/\.st-top-name|\.st-top-score/.test(liveCssNC) &&
  /\.st-top-list \{[^}]*display: grid;[^}]*minmax\(234px, 1fr\)/.test(liveCssNC) &&
  /\.st-top-img \{[^}]*aspect-ratio: 2 \/ 3;[^}]*var\(--r-md\)/.test(liveCssNC) &&
  /\.st-pie-slice \{ stroke: none; \}/.test(liveCssNC));

const PICK_NAMES = ['给阿嬷的情书', '士兵突击', '海边的曼彻斯特', '史前星球', '是大臣',
  '情书', '冰菓', '我想吃掉你的胰脏', '阿甘正传'];
ok('A8 线上 JS 有 YEAR_PICKS 九条（2018~2026 倒序、片名逐条正确）、面板标题「年度影视」',
  /var YEAR_PICKS = \[/.test(liveJsNC) && /<h3>年度影视<\/h3>/.test(liveJsNC) &&
  PICK_NAMES.every((t) => liveJsNC.includes("'" + t + "'")) &&
  PICK_NAMES.every((t, i) => i === 0 || liveJsNC.indexOf("'" + t + "'") > liveJsNC.indexOf("'" + PICK_NAMES[i - 1] + "'")),
  PICK_NAMES.map((t, i) => PICKS[i] + '·' + t).join(' '));
await ctx0.close();

/* ---------------- ② 1920 运行时 ---------------- */
console.log('== ② 1920 运行时 ==');
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1200 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
await page.goto(SITE + 'watch.html?t=' + TS, { waitUntil: 'load', timeout: 45000 });
await page.waitForSelector('#w-grid .poster', { timeout: 45000 });

const gridSpec = await page.evaluate(() => {
  const e = document.querySelector('#w-grid .poster-pic');
  const cs = getComputedStyle(e);
  const b = e.getBoundingClientRect();
  return {
    w: Math.round(b.width), h: Math.round(b.height),
    radius: cs.borderRadius, border: cs.borderTopWidth, shadow: cs.boxShadow,
    ratio: cs.aspectRatio, fit: getComputedStyle(e.querySelector('img')).objectFit
  };
});

await page.click('#w-avatar');                       /* 年报按钮只在时间轴出现（第 93 轮契约） */
await page.waitForSelector('#w-tl .tl-item', { timeout: 45000 });
await page.click('#w-stats-btn');
await page.waitForSelector('.st-panel[data-panel="buckets"] svg.st-pie-chart', { timeout: 25000 });
await page.waitForTimeout(900);

const r = await page.evaluate(() => {
  const box = (k) => {
    const e = document.querySelector('.st-panel[data-panel="' + k + '"]');
    const x = e.getBoundingClientRect();
    return { w: Math.round(x.width), t: Math.round(x.top) };
  };
  const items = [...document.querySelectorAll('.st-top-item')].map((li) => {
    const img = li.querySelector('.st-top-img');
    const yr = li.querySelector('.st-top-year');
    const ib = img ? img.getBoundingClientRect() : null;
    const yb = yr ? yr.getBoundingClientRect() : null;
    const cs = img ? getComputedStyle(img) : null;
    return {
      year: yr ? yr.textContent.trim() : '',
      hasImg: !!(img && img.getAttribute('src')),
      w: ib ? Math.round(ib.width) : 0, h: ib ? Math.round(ib.height) : 0,
      ratio: cs ? cs.aspectRatio : '', radius: cs ? cs.borderRadius : '',
      border: cs ? cs.borderTopWidth : '', shadow: cs ? cs.boxShadow : '',
      fit: cs ? cs.objectFit : '',
      yearBelow: !!(ib && yb && yb.top >= ib.bottom - 1)
    };
  });
  const list = document.querySelector('.st-top-list');
  const lcs = list ? getComputedStyle(list) : null;
  const ang = (x, y) => (Math.atan2(Number(y) - 50, Number(x) - 50) * 180 / Math.PI + 360) % 360;
  const paths = [...document.querySelectorAll('[data-panel="buckets"] .st-pie-slice')];
  const segs = paths.map((p) => {
    const m = /L ([\d.]+) ([\d.]+) A 46 46 0 \d 1 ([\d.]+) ([\d.]+)/.exec(p.getAttribute('d') || '');
    return m ? { a0: ang(m[1], m[2]), a1: ang(m[3], m[4]) } : null;
  });
  return {
    items, cols: lcs ? lcs.gridTemplateColumns.split(' ').length : 0,
    display: lcs ? lcs.display : '',
    hasName: !!document.querySelector('.st-top-name'),
    hasScore: !!document.querySelector('.st-top-score'),
    segs, stroke: paths[0] ? getComputedStyle(paths[0]).stroke : '',
    months: box('months'), buckets: box('buckets'), kinds: box('kinds'),
    years: box('years'), country: box('country'), tags: box('tags'),
    ov: document.documentElement.scrollWidth - document.documentElement.clientWidth
  };
});

ok('B1 年度影视 9 条：年份逐条正确、每条有海报、DOM 里没有片名与评分节点',
  r.items.length === 9 && PICKS.every((y, i) => r.items[i] && r.items[i].year === y) &&
  r.items.every((it) => it.hasImg) && !r.hasName && !r.hasScore,
  r.items.map((it) => it.year + '·' + (it.hasImg ? '有' : '缺')).join(' '));

ok('B2 海报网格：grid 且 ≥3 列；海报 2:3 比例、圆角/边框/阴影/object-fit 与网格视图海报逐项全等，宽度差 ≤20%',
  r.display === 'grid' && r.cols >= 3 &&
  r.items.every((it) => it.ratio === gridSpec.ratio && it.radius === gridSpec.radius &&
    it.border === gridSpec.border && it.shadow === gridSpec.shadow && it.fit === gridSpec.fit &&
    Math.abs(it.w / it.h - 2 / 3) < 0.02 &&
    Math.abs(it.w - gridSpec.w) <= gridSpec.w * 0.2),
  `列${r.cols} 年度海报${r.items[0].w}×${r.items[0].h} / 网格海报${gridSpec.w}×${gridSpec.h}`);

ok('B3 年份显示在海报下方（9/9）', r.items.every((it) => it.yearBelow),
  r.items.filter((it) => it.yearBelow).length + '/9');

await page.click('#w-fab');
await page.waitForFunction(() => {
  const c = document.getElementById('add-country');
  return c && c.getBoundingClientRect().width > 0;
}, null, { timeout: 10000 });
const f = await page.evaluate(() => {
  const ids = ['add-order', 'add-country', 'add-tags'];
  const tops = ids.map((id) => Math.round(document.getElementById(id).getBoundingClientRect().top));
  const wrap = document.getElementById('add-order').closest('.w-row');
  const hints = ids.map((id) => !!(document.querySelector('label[for="' + id + '"]') || {}).querySelector?.('.w-hint'));
  const labels = ids.map((id) => (document.querySelector('label[for="' + id + '"]') || {}).textContent?.trim() || '');
  return {
    tops, inRow3: !!wrap && wrap.classList.contains('w-row-3'), hints, labels,
    hasRelease: !!document.getElementById('add-release'),
    dialogHasReleaseText: (document.querySelector('.w-add-body') || { textContent: '' }).textContent.includes('上映日期')
  };
});
ok('B4 表单：无上映日期框/字样；排序 / 国别 / 标签三者严格同行且包在 .w-row.w-row-3；三个 label 都无说明文字',
  !f.hasRelease && !f.dialogHasReleaseText && f.inRow3 &&
  f.tops.every((t) => Math.abs(t - f.tops[0]) <= 2) && f.hints.every((h) => !h) &&
  f.labels.join('/') === '排序/国别/标签',
  `tops=${f.tops.join('/')} labels=${f.labels.join('/')} inRow3=${f.inRow3}`);

const seamsOk = r.segs.length > 1 && r.segs.every(Boolean) &&
  r.segs.every((s, i) => i === r.segs.length - 1 || angDiff(r.segs[i + 1].a0, s.a1) < 0.02) &&
  angDiff(r.segs[0].a0, r.segs[r.segs.length - 1].a1) < 0.02;
ok('B5 饼图片间无缝：相邻片首尾角严格相接（≤0.02°）、整圆闭合、stroke=none',
  seamsOk && r.stroke === 'none',
  `片${r.segs.length} 角度=${r.segs.map((s) => s && s.a0.toFixed(1) + '→' + s.a1.toFixed(1)).join(' ')} stroke=${r.stroke}`);

ok('B6 三卡成行未回退：月度/评分区间/类型 同行、逐年/国别/标签 同行',
  r.months.t === r.buckets.t && r.buckets.t === r.kinds.t &&
  r.years.t === r.country.t && r.country.t === r.tags.t && r.kinds.t < r.years.t,
  `${r.months.t}/${r.buckets.t}/${r.kinds.t} · ${r.years.t}/${r.country.t}/${r.tags.t}`);

ok('B7 1920 无横向溢出 + 零 JS 异常', r.ov <= 0 && errs.length === 0, `ov=${r.ov} err=${errs.length}`);
await ctx.close();

/* ---------------- ③ 390 运行时 ---------------- */
console.log('== ③ 390 ==');
const c2 = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
const p2 = await c2.newPage();
const e2 = [];
p2.on('pageerror', (e) => e2.push(String(e)));
await p2.goto(SITE + 'watch.html?t=' + TS, { waitUntil: 'load', timeout: 45000 });
await p2.waitForSelector('#w-grid .poster', { timeout: 45000 });

await p2.click('#w-fab');
await p2.waitForFunction(() => {
  const c = document.getElementById('add-country');
  return c && c.getBoundingClientRect().width > 0;
}, null, { timeout: 10000 });
const m = await p2.evaluate(() => {
  const ids = ['add-order', 'add-country', 'add-tags'];
  return {
    tops: ids.map((id) => Math.round(document.getElementById(id).getBoundingClientRect().top)),
    ov: document.documentElement.scrollWidth - document.documentElement.clientWidth
  };
});
ok('C1 390 三字段回单列（w-row-3 折叠成 1fr，排序 → 国别 → 标签 依次下移）',
  m.tops[1] > m.tops[0] + 10 && m.tops[2] > m.tops[1] + 10 && m.ov <= 0,
  `tops=${m.tops.join('/')} ov=${m.ov}`);

await p2.click('#w-add-close');       /* 关掉弹窗，否则遮住后面的头像 */
await p2.waitForTimeout(200);
await p2.click('#w-avatar');
await p2.waitForSelector('#w-tl .tl-item', { timeout: 45000 });
await p2.click('#w-stats-btn');
await p2.waitForSelector('.st-panel[data-panel="buckets"] svg.st-pie-chart', { timeout: 25000 });
await p2.waitForTimeout(900);
const m2 = await p2.evaluate(() => {
  const ang = (x, y) => (Math.atan2(Number(y) - 50, Number(x) - 50) * 180 / Math.PI + 360) % 360;
  const paths = [...document.querySelectorAll('[data-panel="buckets"] .st-pie-slice')];
  const segs = paths.map((p) => {
    const mm = /L ([\d.]+) ([\d.]+) A 46 46 0 \d 1 ([\d.]+) ([\d.]+)/.exec(p.getAttribute('d') || '');
    return mm ? { a0: ang(mm[1], mm[2]), a1: ang(mm[3], mm[4]) } : null;
  });
  const vw = document.documentElement.clientWidth;
  const imgs = [...document.querySelectorAll('.st-top-img')].map((i) => i.getBoundingClientRect());
  return {
    count: document.querySelectorAll('.st-top-item').length,
    years: [...document.querySelectorAll('.st-top-year')].map((y) => y.textContent.trim()),
    hasName: !!document.querySelector('.st-top-name'), hasScore: !!document.querySelector('.st-top-score'),
    imgsIn: imgs.every((b) => b.left >= -1 && b.right <= vw + 1),
    segs, ov: document.documentElement.scrollWidth - vw
  };
});
ok('C2 390 年度影视 9 条年份齐全、无片名/评分、海报不越界、无横向溢出 + 零 JS 异常',
  m2.count === 9 && m2.years.join('/') === PICKS.join('/') && !m2.hasName && !m2.hasScore &&
  m2.imgsIn && m2.ov <= 0 && e2.length === 0,
  `top=${m2.count} ov=${m2.ov} err=${e2.length}`);

const cSeams = m2.segs.length > 1 && m2.segs.every(Boolean) &&
  m2.segs.every((s, i) => i === m2.segs.length - 1 || angDiff(m2.segs[i + 1].a0, s.a1) < 0.02) &&
  angDiff(m2.segs[0].a0, m2.segs[m2.segs.length - 1].a1) < 0.02;
ok('C3 390 饼图同样首尾相接无缝（响应式下不得回退到旧缝）', cSeams, `片${m2.segs.length}`);
await c2.close();

await browser.close();
console.log('');
console.log(`第 100 轮上线复验：${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
