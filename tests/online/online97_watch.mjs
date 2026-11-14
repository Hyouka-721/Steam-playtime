/* 第 97 轮 watch 侧上线复验：评分区间 + 国别构成改饼图
 *
 * ⚠️ **本轮尚未上线时不要跑**：线上此刻还是第 96 轮（评分区间/国别是横条、v=34/v=23）。
 *    等「上线」→ push → Pages 指纹轮询（等 watch.css?v=35）命中后再执行本脚本。
 *
 * 复验口径：
 *   ① 指纹 —— watch.css?v=35 / watch.js?v=24、css/js 字节 md5 与本地全等、
 *      线上 JS 里确有 stPie 且两个面板都走它、线上 CSS 里跨度是 6+6、
 *      图例有 max-width（否则片名与数量会被一左一右拉开）
 *   ② 1920 —— 两个饼都画出来（片数 = 非零档位数）、图例行数与首行按**线上数据现算**
 *      （CI 每晚可能推新快照）、百分比合计约 100%、两面板等宽同行、零溢出
 *   ③ 造数 —— 只剩一档评分时画整圆、0 值档位不画片但图例照列
 *   ④ 390 —— 竖排（饼在上、图例整宽在下）、不越界
 *
 * ⚠️ 线上字节一律在页内 fetch 回传（Node 直连 github.io 不通），统一 --no-proxy-server。
 * ⚠️ 全程只读：不点加号、不录数据，不会产生任何 PUT。
 */
import { createRequire } from 'module';
import fs from 'fs';
import crypto from 'crypto';
const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const SITE = 'https://hyouka-721.github.io/Steam-playtime/';
const ROOT = 'C:/Users/33329/WorkBuddy/2026-10-13-18-17-49/steam-playtime/docs/';
const TS = Date.now();
const md5 = (b) => crypto.createHash('md5').update(b).digest('hex');
const norm = (s) => String(s).replace(/\r\n/g, '\n');
const md5txt = (s) => md5(Buffer.from(norm(s), 'utf8'));
const stripCmt = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');

const localCss = norm(fs.readFileSync(ROOT + 'watch.css', 'utf8'));
const localJs = norm(fs.readFileSync(ROOT + 'watch.js', 'utf8'));

let pass = 0, fail = 0;
const ok = (n, c, extra = '') => {
  c ? (pass++, console.log(`PASS ${n}${extra ? '  — ' + extra : ''}`))
    : (fail++, console.log(`FAIL ${n}  — ${extra}`));
};

const browser = await chromium.launch({ args: ['--no-proxy-server'] });

/* ---------- ① 指纹 ---------- */
console.log('== ① 内容指纹 ==');
const ctx0 = await browser.newContext({ viewport: { width: 1920, height: 1200 }, serviceWorkers: 'block' });
const p0 = await ctx0.newPage();
await p0.goto(SITE + 'watch.html?t=' + TS, { waitUntil: 'load' });
await p0.waitForFunction(() => document.querySelectorAll('#w-grid .poster').length > 20, null, { timeout: 30000 }).catch(() => {});
await p0.waitForTimeout(800);

const html = await p0.evaluate(async (u) => (await fetch(u, { cache: 'reload' })).text(), SITE + 'watch.html?t=' + TS);
ok('A1 线上 watch.html 引用 watch.css?v=35 / watch.js?v=24',
  /watch\.css\?v=35/.test(html) && /watch\.js\?v=24/.test(html),
  (html.match(/watch\.(css|js)\?v=\d+/g) || []).join(' '));

const liveCss = await p0.evaluate(async (u) => (await fetch(u, { cache: 'reload' })).text(), SITE + 'watch.css?v=35&t=' + TS);
const liveJs = await p0.evaluate(async (u) => (await fetch(u, { cache: 'reload' })).text(), SITE + 'watch.js?v=24&t=' + TS);
ok('A2 线上 watch.css 字节 md5 与本地全等', md5txt(liveCss) === md5txt(localCss),
  `${md5txt(liveCss).slice(0, 12)} / ${md5txt(localCss).slice(0, 12)}`);
ok('A3 线上 watch.js 字节 md5 与本地全等', md5txt(liveJs) === md5txt(localJs),
  `${md5txt(liveJs).slice(0, 12)} / ${md5txt(localJs).slice(0, 12)}`);

const liveJsNC = stripCmt(liveJs);
const liveCssNC = stripCmt(liveCss);
ok('A4 线上 JS 真有 stPie，且评分区间与国别都走它（不是只把横条换个名字）',
  /function stPie\(pairs, ariaLabel\)/.test(liveJsNC) &&
  /stPie\(buckets, '评分区间饼图'\)/.test(liveJsNC) &&
  /stPie\(countries, '国别构成饼图'\)/.test(liveJsNC) &&
  !/stRows\(buckets\)/.test(liveJsNC) && !/stRows\(countries\)/.test(liveJsNC));

ok('A5 线上 CSS 有饼图样式：尺寸 clamp(150,16vw,240) + 图例限宽 320',
  /\.st-pie-chart \{[^}]*clamp\(150px, 16vw, 240px\)/.test(liveCssNC) &&
  /\.st-rows--pie \{[^}]*max-width: 320px/.test(liveCssNC));

ok('A6 线上 CSS 跨度已是 6 + 6（两个饼同行等分）',
  /\.st-panel\[data-panel="buckets"\] \{ grid-column: span 6; \}/.test(liveCssNC) &&
  /\.st-panel\[data-panel="country"\] \{ grid-column: span 6; \}/.test(liveCssNC));

/* 线上真数据：按面板同一口径现算（只取前 8 个国别，分母就是这 8 个的合计） */
const LIVE = JSON.parse(await p0.evaluate(async (u) => (await fetch(u, { cache: 'reload' })).text(), SITE + 'data/watch.json?t=' + TS));
const RATED = LIVE.items.filter((it) => Number(it.rating) > 0);
const BK = [0, 0, 0, 0, 0];
RATED.forEach((it) => { const r = Number(it.rating); BK[r < 6 ? 0 : r < 7 ? 1 : r < 8 ? 2 : r < 9 ? 3 : 4]++; });
const CNT = {};
LIVE.items.forEach((it) => (it.countries || []).forEach((c) => { CNT[c] = (CNT[c] || 0) + 1; }));
const RANK = Object.keys(CNT).sort((a, b) => CNT[b] - CNT[a] || a.localeCompare(b)).slice(0, 8);
const B_LIVE = BK.filter((v) => v > 0).length;
const C_LIVE = RANK.filter((k) => CNT[k] > 0).length;
await ctx0.close();

/* ---------- ② 1920 ---------- */
console.log('== ② 1920 运行时 ==');
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1200 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
await page.goto(SITE + 'watch.html?t=' + TS, { waitUntil: 'load' });
await page.waitForSelector('#w-grid .poster', { timeout: 30000 });
await page.click('#w-avatar');                      /* 年报按钮只在时间轴出现（第 93 轮契约） */
await page.waitForSelector('#w-tl .tl-item', { timeout: 30000 });
await page.click('#w-stats-btn');
await page.waitForSelector('.st-panel[data-panel="buckets"] svg.st-pie-chart', { timeout: 15000 });
await page.waitForTimeout(800);

const r = await page.evaluate(() => {
  const box = (e) => { if (!e) return null; const x = e.getBoundingClientRect(); return { w: Math.round(x.width), h: Math.round(x.height), t: Math.round(x.top), l: Math.round(x.left), r: Math.round(x.right) }; };
  const panel = (k) => {
    const sec = document.querySelector('[data-panel="' + k + '"]');
    if (!sec) return null;
    const rows = [...sec.querySelectorAll('.st-row')];
    return {
      sec: box(sec), pie: box(sec.querySelector('.st-pie-chart')), leg: box(sec.querySelector('.st-rows--pie')),
      pieces: sec.querySelectorAll('.st-pie-slice').length,
      rows: rows.length,
      keys: rows.map((x) => x.querySelector('.st-row-k').textContent.trim()),
      vs: rows.map((x) => x.querySelector('.st-row-v').textContent.trim()),
      pcts: rows.map((x) => x.querySelector('.st-row-pct').textContent.trim()),
      nan: /NaN/.test(sec.innerHTML)
    };
  };
  return { b: panel('buckets'), c: panel('country'), ov: document.documentElement.scrollWidth - document.documentElement.clientWidth };
});
const sumPct = (a) => a.reduce((s, x) => s + parseFloat(x), 0);

ok('B1 两个饼都画出来了：评分区间 ' + B_LIVE + ' 片 / 国别 ' + C_LIVE + ' 片（= 线上非零档位数）',
  r.b.pieces === B_LIVE && r.c.pieces === C_LIVE, `实际 ${r.b.pieces} / ${r.c.pieces}`);

ok('B2 图例行数 5 / 8，首行与线上数据排序一致（' + RANK[0] + ' ' + CNT[RANK[0]] + '）',
  r.b.rows === 5 && r.c.rows === 8 && r.c.keys[0] === RANK[0] && r.c.vs[0] === String(CNT[RANK[0]]),
  `区间 ${r.b.rows} 行 / 国别 ${r.c.rows} 行 首行 ${r.c.keys[0]} ${r.c.vs[0]}`);

ok('B3 百分比合计约 100%（饼的分母是面板里那些片，不是全库）',
  Math.abs(sumPct(r.b.pcts) - 100) < 0.35 && Math.abs(sumPct(r.c.pcts) - 100) < 0.35 &&
  !r.b.nan && !r.c.nan,
  `区间 ${sumPct(r.b.pcts).toFixed(1)}% / 国别 ${sumPct(r.c.pcts).toFixed(1)}%`);

ok('B4 版式：两面板等宽同行，饼在左图例在右且不重叠',
  Math.abs(r.b.sec.w - r.c.sec.w) <= 2 && r.b.sec.t === r.c.sec.t &&
  r.b.pie.r <= r.b.leg.l && r.c.pie.r <= r.c.leg.l,
  `${r.b.sec.w}/${r.c.sec.w} 同行=${r.b.sec.t === r.c.sec.t}`);

ok('B5 饼 240（clamp 上限）、图例 ≤320 没被拉开',
  Math.round(r.b.pie.w) === 240 && r.b.leg.w <= 320 && r.c.leg.w <= 320,
  `饼 ${r.b.pie.w} 图例 ${r.b.leg.w}/${r.c.leg.w}`);

ok('B6 1920 无横向溢出 + 零 JS 异常', r.ov <= 0 && errs.length === 0, `ov=${r.ov} err=${errs.length}`);
await ctx.close();

/* ---------- ③ 造数：只剩一档 ---------- */
console.log('== ③ 造数（单一评分档位） ==');
const mock = {
  updated_at: '2026-11-14T00:00:00+08:00',
  items: [
    { id: '2020-01-01-a', title: '八分片A', kind: 'movie', watched_at: '2020-01-01', year: 2020, rating: 8.5, poster: '', note: '', countries: ['日本'] },
    { id: '2020-01-02-b', title: '八分片B', kind: 'series', watched_at: '2020-01-05', year: 2020, rating: 8.5, poster: '', note: '', countries: ['日本'] }
  ]
};
const c2 = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
const p2 = await c2.newPage();
const e2 = [];
p2.on('pageerror', (e) => e2.push(String(e)));
await p2.route('**/data/watch/manifest.json*', (r0) => r0.fulfill({ status: 404, body: '' }));
await p2.route('**/data/watch.json*', (r0) => r0.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mock) }));
await p2.goto(SITE + 'watch.html?t=' + TS, { waitUntil: 'load' });
await p2.waitForSelector('#w-grid .poster', { timeout: 30000 });
await p2.click('#w-avatar');
await p2.waitForSelector('#w-tl .tl-item', { timeout: 30000 });
await p2.click('#w-stats-btn');
await p2.waitForSelector('[data-panel="buckets"] svg.st-pie-chart', { timeout: 15000 });
await p2.waitForTimeout(600);
const m = await p2.evaluate(() => {
  const sec = document.querySelector('[data-panel="buckets"]');
  const rows = [...sec.querySelectorAll('.st-row')];
  return {
    circles: sec.querySelectorAll('.st-pie-chart circle').length,
    paths: sec.querySelectorAll('path.st-pie-slice').length,
    zeros: rows.filter((x) => x.classList.contains('is-zero')).length,
    hundred: rows.filter((x) => x.querySelector('.st-row-pct').textContent.trim() === '100.0%').length,
    nan: /NaN/.test(sec.innerHTML)
  };
});
ok('C1 只剩一档时画整圆（<circle>），0 值档位不画片但图例照列（4 行 is-zero）',
  m.circles === 1 && m.paths === 0 && m.zeros === 4 && !m.nan,
  `circle ${m.circles} path ${m.paths} 零 ${m.zeros}`);
ok('C2 唯一非零档占比 100.0%，零异常', m.hundred === 1 && e2.length === 0, `100% 行 ${m.hundred} err=${e2.length}`);
await c2.close();

/* ---------- ④ 390 ---------- */
console.log('== ④ 390 窄屏 ==');
const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
const mp = await mctx.newPage();
const merrs = [];
mp.on('pageerror', (e) => merrs.push(String(e)));
await mp.goto(SITE + 'watch.html?t=' + TS, { waitUntil: 'load' });
await mp.waitForSelector('#w-grid .poster', { timeout: 30000 });
await mp.click('#w-avatar');
await mp.waitForSelector('#w-tl .tl-item', { timeout: 30000 });
await mp.click('#w-stats-btn');
await mp.waitForTimeout(900);
const mo = await mp.evaluate(() => {
  const b = (s) => document.querySelector(s).getBoundingClientRect();
  const pie = b('[data-panel="buckets"] .st-pie-chart');
  const leg = b('[data-panel="buckets"] .st-rows--pie');
  const sec = b('[data-panel="buckets"]');
  return { pieW: Math.round(pie.width), pieBottom: Math.round(pie.bottom), legTop: Math.round(leg.top),
    legW: Math.round(leg.width), secW: Math.round(sec.width),
    ov: document.documentElement.scrollWidth - document.documentElement.clientWidth };
});
ok('D1 390 竖排：饼 132 在上、图例整宽在下，都在面板内',
  mo.pieW === 132 && mo.legTop >= mo.pieBottom && mo.legW <= mo.secW && mo.legW > mo.pieW,
  `饼 ${mo.pieW} 底 ${mo.pieBottom} / 图例 ${mo.legW} 顶 ${mo.legTop} / 面板 ${mo.secW}`);
ok('D2 390 无横向溢出 + 零 JS 异常', mo.ov <= 0 && merrs.length === 0, `ov=${mo.ov} err=${merrs.length}`);
await mctx.close();

await browser.close();
console.log(`\n第 97 轮线上复验：${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
