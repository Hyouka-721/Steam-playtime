/* 第 101 轮 watch 侧上线复验：删类型构成/高频标签 · 四卡一行 · 删国别脚注 · 宽度微调 4/2/2/4
 *
 * 用户原话（四条）：
 *   1. 删除「类型构成」和「高频标签」两个选项卡。
 *   2. 将「月度分布、评分区间、国别构成、逐年趋势」按顺序并列同一行，合理调节宽度。
 *   3. 删除国别构成的说明文字：按国别累计：合拍片会在各出品国各计一次，合计可超过记录总数；
 *      少于 10 部的国别（法国、意大利、德国、瑞士、西班牙）合并为「其他」。
 *   4. 适当缩小评分区间和国别构成的宽度，增大月度分布和逐年趋势的宽度（→ 4/2/2/4）。
 *
 * 复验口径：
 *   ① 指纹 8 —— HTML 引用 v=40/v=31、css/js/html 字节 md5 与本地全等（EOL 归一）、
 *      **线上字节里确有本轮判据**：JS 无 stRows/kinds/tags/st-chip、脚注文案删净但
 *      COUNTRY_MIN/majors/「其他」/OTHER_COLOR 合流规则仍在、CSS 跨度 4/2/2/4、
 *      饼 clamp(96,42%,168)+flex-wrap、无缝 stPie
 *   ② 1920 运行时 7 —— 只剩 4 面板顺序正确、四卡同行且柱图≈2×饼卡、饼 110 图例同排、
 *      柱图内容齐、国别 5 行含「其他」、饼无缝、零溢出零异常
 *   ③ 390 运行时 3 —— 单列依次下移、饼 132 图例换行、零溢出零异常
 *
 * ⚠️ 线上字节一律在页内 fetch 回传（Node 直连 github.io 不通），统一 --no-proxy-server。
 * ⚠️ 全程只读：不点提交、不录数据，不会产生任何 PUT。
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
const ORDER = ['months', 'buckets', 'country', 'years'];

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
const liveCss = await p0.evaluate(async (u) => (await fetch(u, { cache: 'reload' })).text(), SITE + 'watch.css?v=40&t=' + TS);
const liveJs = await p0.evaluate(async (u) => (await fetch(u, { cache: 'reload' })).text(), SITE + 'watch.js?v=31&t=' + TS);
const liveJsNC = stripJsCmt(liveJs);
const liveCssNC = stripJsCmt(liveCss);
const htmlNC = html.replace(/<!--[\s\S]*?-->/g, '');

ok('A1 线上 watch.html 引用 watch.css?v=40 / watch.js?v=31',
  /watch\.css\?v=40/.test(html) && /watch\.js\?v=31/.test(html),
  (html.match(/watch\.(css|js)\?v=\d+/g) || []).join(' '));
ok('A2 线上 watch.css 字节 md5 与本地全等（EOL 归一）', md5txt(liveCss) === md5txt(localCss),
  `${md5txt(liveCss).slice(0, 12)} / ${md5txt(localCss).slice(0, 12)}`);
ok('A3 线上 watch.js 字节 md5 与本地全等（EOL 归一）', md5txt(liveJs) === md5txt(localJs),
  `${md5txt(liveJs).slice(0, 12)} / ${md5txt(localJs).slice(0, 12)}`);
ok('A4 线上 watch.html 字节 md5 与本地全等（EOL 归一）', md5txt(html) === md5txt(localHtml),
  `${md5txt(html).slice(0, 12)} / ${md5txt(localHtml).slice(0, 12)}`);

/* 第 101 轮硬证据 1：线上 JS 里两个面板整条删净，合流规则一点没删。 */
ok('A5 线上 JS：stRows / kinds / tagMap / tags / st-chip 全删；st-rows--pie 仍被饼图图例复用',
  !/function stRows\(|stRows\(/.test(liveJsNC) &&
  !/var kinds = |var tagMap = |var tags = Object/.test(liveJsNC) &&
  !/st-chips|st-chip/.test(liveJsNC) &&
  /<div class="st-rows st-rows--pie">/.test(liveJsNC));

ok('A6 线上 JS：脚注文案删净（剥注释后无 st-note / 按国别累计 / 合并为「其他」），但「N 部待补」提示与合并规则都在',
  !/st-note|按国别累计|合拍片会在|合并为「其他」/.test(liveJsNC) &&
  /<span class="st-hint">/.test(liveJsNC) &&
  /var COUNTRY_MIN = 10;/.test(liveJsNC) &&
  /var majors = countryAll\.filter/.test(liveJsNC) &&
  /\{ k: '其他', v: restVal, other: true \}/.test(liveJsNC) &&
  /var OTHER_COLOR/.test(liveJsNC));

/* 第 101 轮硬证据 2：线上 CSS 跨度 4/2/2/4、饼按栏缩放、脚注/chip 样式删净。 */
const spanOf = (k) => Number((new RegExp(
  '\\.st-panel\\[data-panel="' + k + '"\\]\\s*\\{ grid-column: span (\\d+); \\}').exec(liveCssNC) || [, 0])[1]);
ok('A7 线上 CSS：四面板跨度 4 / 2 / 2 / 4（宽度微调，合计 12 栏）、kinds/tags 面板与 .st-note/.st-chip 样式删净、860 复位仍在',
  spanOf('months') === 4 && spanOf('buckets') === 2 &&
  spanOf('country') === 2 && spanOf('years') === 4 &&
  !/\.st-note\s*\{|\.st-chips|\.st-chip/.test(liveCssNC) &&
  !/\.st-panel\[data-panel="kinds"\]|\.st-panel\[data-panel="tags"\]/.test(liveCssNC) &&
  /@media \(max-width: 860px\)[\s\S]*?\.w-stats \.st-panel\[data-panel\] \{ grid-column: auto; \}/.test(liveCssNC),
  ['months', 'buckets', 'country', 'years'].map((k) => k + '=' + spanOf(k)).join(' '));

ok('A8 线上 CSS/JS：饼 clamp(96,42%,168)+flex-wrap、无缝 stPie（a0=ang / a1=ang+sweep）、stroke:none',
  /width: clamp\(96px, 42%, 168px\)/.test(liveCssNC) &&
  /\.st-pie \{[^}]*flex-wrap: wrap/.test(liveCssNC) &&
  /\.st-rows--pie \{[^}]*flex: 1 1 auto/.test(liveCssNC) &&
  /\.st-pie-slice \{ stroke: none; \}/.test(liveCssNC) &&
  /var ang = -90;/.test(liveJsNC) && /var a0 = ang, a1 = ang \+ sweep;/.test(liveJsNC) &&
  !/gap = 1\.1/.test(liveJsNC));
await ctx0.close();

/* ---------------- ② 1920 运行时 ---------------- */
console.log('== ② 1920 运行时 ==');
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1200 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
await page.goto(SITE + 'watch.html?t=' + TS, { waitUntil: 'load', timeout: 45000 });
await page.waitForSelector('#w-grid .poster', { timeout: 45000 });
await page.click('#w-avatar');                       /* 年报按钮只在时间轴出现（第 93 轮契约） */
await page.waitForSelector('#w-tl .tl-item', { timeout: 45000 });
await page.click('#w-stats-btn');
await page.waitForSelector('.st-panel[data-panel="buckets"] svg.st-pie-chart', { timeout: 25000 });
await page.waitForTimeout(900);
await page.mouse.move(1, 1);

const r = await page.evaluate(() => {
  const b = (e) => { const x = e.getBoundingClientRect(); return { l: Math.round(x.left), t: Math.round(x.top), r: Math.round(x.right), w: Math.round(x.width), h: Math.round(x.height) }; };
  const panels = [...document.querySelectorAll('.st-panels .st-panel')].map((e) => ({ k: e.dataset.panel, ...b(e) }));
  const pies = [...document.querySelectorAll('.st-pie')].map((e) => {
    const svg = b(e.querySelector('svg'));
    const leg = b(e.querySelector('.st-rows--pie'));
    return { w: svg.w, h: svg.h, legW: leg.w, below: leg.t >= svg.t + svg.h - 2,
      sideBySide: !!(leg.t < svg.t + svg.h - 2 && leg.l >= svg.r - 1),
      scroll: e.scrollWidth - e.clientWidth };
  });
  const ang = (x, y) => (Math.atan2(Number(y) - 50, Number(x) - 50) * 180 / Math.PI + 360) % 360;
  const paths = [...document.querySelectorAll('[data-panel="buckets"] .st-pie-slice')];
  const segs = paths.map((p) => {
    const m = /L ([\d.]+) ([\d.]+) A 46 46 0 \d 1 ([\d.]+) ([\d.]+)/.exec(p.getAttribute('d') || '');
    return m ? { a0: ang(m[1], m[2]), a1: ang(m[3], m[4]) } : null;
  });
  const country = document.querySelector('[data-panel="country"]');
  const labs = [...document.querySelectorAll('.st-axis .st-bar-lab')].map(b);
  let overlap = 0;
  for (let i = 1; i < labs.length; i++) if (labs[i].t === labs[i - 1].t && labs[i].l < labs[i - 1].r - 1) overlap++;
  return {
    panels, pies, segs, overlap,
    panelContainer: b(document.querySelector('.st-panels')),
    hasKinds: !!document.querySelector('[data-panel="kinds"]'),
    hasTags: !!document.querySelector('[data-panel="tags"]'),
    hasNote: !!document.querySelector('.st-note'),
    noteText: /按国别累计|合拍片会在/.test(country ? country.textContent : ''),
    countryRows: document.querySelectorAll('[data-panel="country"] .st-row--pie').length,
    otherRow: /其他/.test(country ? country.textContent : ''),
    monthBars: document.querySelectorAll('[data-panel="months"] .st-bar').length,
    yearBars: document.querySelectorAll('[data-panel="years"] .st-bar').length,
    stroke: paths[0] ? getComputedStyle(paths[0]).stroke : '',
    ov: document.documentElement.scrollWidth - document.documentElement.clientWidth
  };
});

ok('B1 DOM 里只剩 4 块统计面板且顺序正确；kinds/tags 面板、脚注节点与文案都不存在',
  r.panels.length === 4 && r.panels.map((p) => p.k).join('/') === ORDER.join('/') &&
  !r.hasKinds && !r.hasTags && !r.hasNote && !r.noteText,
  r.panels.map((p) => p.k).join(' / '));

ok('B2 四卡严格并列同一行：top 全等、left 依次递增、柱图≈2×饼卡（4/12 vs 2/12），且合计铺满 12 栏容器',
  r.panels.every((p) => p.t === r.panels[0].t) &&
  r.panels.every((p, i) => i === 0 || p.l > r.panels[i - 1].l) &&
  Math.abs(r.panels[0].w - r.panels[3].w) <= 2 &&
  Math.abs(r.panels[1].w - r.panels[2].w) <= 2 &&
  Math.abs(r.panels[0].w / r.panels[1].w - 2) <= 0.1 &&
  r.panels[3].r <= r.panelContainer.r + 1 && r.panels[0].l >= r.panelContainer.l - 1,
  `top=${r.panels.map((p) => p.t).join('/')} 宽=${r.panels.map((p) => p.w).join('/')} 容器=${r.panelContainer.w}`);

ok('B3 1920 两块饼按栏缩到 ~110（正方形），图例仍在饼右侧同排、无内部溢出',
  r.pies.length === 2 && r.pies.every((p) => p.w >= 100 && p.w <= 120 &&
    Math.abs(p.w - p.h) <= 1 && p.scroll <= 0 && p.sideBySide && p.legW >= 100),
  JSON.stringify(r.pies));

ok('B4 柱图内容未丢：月度 12 根、逐年 9 根，轴标签互不重叠',
  r.monthBars === 12 && r.yearBars === 9 && r.overlap === 0,
  `月=${r.monthBars} 年=${r.yearBars} 重叠=${r.overlap}`);

ok('B5 国别合并规则仍在（5 行图例、含「其他」），只是说明文字删了',
  r.countryRows === 5 && r.otherRow && !r.hasNote,
  `行=${r.countryRows} 其他=${r.otherRow}`);

const seamsOk = r.segs.length > 1 && r.segs.every(Boolean) &&
  r.segs.every((s, i) => i === r.segs.length - 1 || angDiff(r.segs[i + 1].a0, s.a1) < 0.02) &&
  angDiff(r.segs[0].a0, r.segs[r.segs.length - 1].a1) < 0.02;
ok('B6 饼图片间无缝：相邻片首尾角严格相接（≤0.02°）、整圆闭合、stroke=none',
  seamsOk && r.stroke === 'none', `片${r.segs.length} stroke=${r.stroke}`);

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
await p2.click('#w-avatar');
await p2.waitForSelector('#w-tl .tl-item', { timeout: 45000 });
await p2.click('#w-stats-btn');
await p2.waitForSelector('.st-panel[data-panel="buckets"] svg.st-pie-chart', { timeout: 25000 });
await p2.waitForTimeout(900);
const m2 = await p2.evaluate(() => {
  const b = (e) => { const x = e.getBoundingClientRect(); return { t: Math.round(x.top), w: Math.round(x.width), h: Math.round(x.height), r: Math.round(x.right) }; };
  const panels = [...document.querySelectorAll('.st-panels .st-panel')].map((e) => ({ k: e.dataset.panel, ...b(e) }));
  const pies = [...document.querySelectorAll('.st-pie')].map((e) => {
    const svg = b(e.querySelector('svg'));
    const leg = b(e.querySelector('.st-rows--pie'));
    return { w: svg.w, below: leg.t >= svg.t + svg.h - 2 };
  });
  const vw = document.documentElement.clientWidth;
  return {
    panels, pies,
    hasNote: !!document.querySelector('.st-note'),
    hasKinds: !!document.querySelector('[data-panel="kinds"]'),
    hasTags: !!document.querySelector('[data-panel="tags"]'),
    ov: document.documentElement.scrollWidth - vw
  };
});
ok('C1 390 回单列：四块依次下移、都不越视口、脚注与 kinds/tags 仍不存在',
  m2.panels.length === 4 && m2.panels.map((p) => p.k).join('/') === ORDER.join('/') &&
  m2.panels.every((p, i) => i === 0 || p.t > m2.panels[i - 1].t) &&
  m2.panels.every((p) => p.r <= 391) && !m2.hasNote && !m2.hasKinds && !m2.hasTags,
  `top=${m2.panels.map((p) => p.t).join('/')}`);
ok('C2 390 饼由 480 块给到 132px、图例自动换行到饼下方、零溢出零异常',
  m2.pies.length === 2 && m2.pies.every((p) => p.w >= 126 && p.w <= 140 && p.below) &&
  m2.ov <= 0 && e2.length === 0,
  `饼=${m2.pies.map((p) => p.w).join('/')} ov=${m2.ov} err=${e2.length}`);
await c2.close();

await browser.close();
console.log('');
console.log(`第 101 轮上线复验：${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
