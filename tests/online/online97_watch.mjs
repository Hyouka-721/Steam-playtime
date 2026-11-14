/* 第 97 轮 watch 侧上线复验：评分区间 + 国别构成改饼图
 *
 * ⚠️ **本轮尚未上线时不要跑**：线上此刻还是第 96 轮（评分区间/国别是横条、v=34/v=23）。
 *    等「上线」→ push → Pages 指纹轮询（等 watch.css?v=41）命中后再执行本脚本。
 *
 * 复验口径：
 *   ① 指纹 —— watch.css?v=41 / watch.js?v=33、css/js 字节 md5 与本地全等、
 *      线上 JS 里确有 stPie 且两个面板都走它、线上 CSS 里两个饼面板各占 6 栏、
 *      图例有 max-width（否则片名与数量会被一左一右拉开）
 *   ② 1920 —— 两个饼都画出来（片数 = 非零档位数）、图例行数与首行按**线上数据现算**
 *      （CI 每晚可能推新快照）、百分比合计约 100%、两面板等宽、零溢出（第 98 轮起不再同行）
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
ok('A1 线上 watch.html 引用 watch.css?v=41 / watch.js?v=33',
  /watch\.css\?v=41/.test(html) && /watch\.js\?v=33/.test(html),
  (html.match(/watch\.(css|js)\?v=\d+/g) || []).join(' '));

const liveCss = await p0.evaluate(async (u) => (await fetch(u, { cache: 'reload' })).text(), SITE + 'watch.css?v=41&t=' + TS);
const liveJs = await p0.evaluate(async (u) => (await fetch(u, { cache: 'reload' })).text(), SITE + 'watch.js?v=33&t=' + TS);
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

/* 第 101 轮改判：四卡一行后每卡只有 3/12 宽，饼改为按栏百分比 clamp(96px,42%,168px)。 */
ok('A5 线上 CSS 有饼图样式：尺寸 clamp(96px,42%,168px) 按栏缩放 + 图例限宽 320',
  /\.st-pie-chart \{[^}]*clamp\(96px, 42%, 168px\)/.test(liveCssNC) &&
  /\.st-rows--pie \{[^}]*max-width: 320px/.test(liveCssNC));

ok('A6 线上 CSS 里两个饼面板各占 2 栏（第 101 轮四卡一行＋宽度微调）',
  /\.st-panel\[data-panel="buckets"\]\s*\{ grid-column: span 2; \}/.test(liveCssNC) &&
  /\.st-panel\[data-panel="country"\]\s*\{ grid-column: span 2; \}/.test(liveCssNC));

/* 配色：只看「线上 JS 里真的是那 10 个色、且都不重复」，色差校验留给本地 verify97 */
const livePal = (/var COUNTRY_COLORS = \[([\s\S]*?)\];/.exec(liveJsNC) || [, ''])[1];
const LIVE_COLORS = [...livePal.matchAll(/'(#[0-9A-Fa-f]{6})'/g)].map((x) => x[1].toUpperCase());
ok('A7 线上色板是重做后的 10 色（唯一、含站点金 #E8B04B，不再是旧的 8 色）',
  LIVE_COLORS.length === 10 && new Set(LIVE_COLORS).size === 10 && LIVE_COLORS[0] === '#E8B04B',
  LIVE_COLORS.join(' '));

/* 第 97 轮第三段：线上 JS 得真有「<10 部折成其他」这套逻辑，否则只是换了配色 */
const liveOther = ((/var OTHER_COLOR = '(#[0-9A-Fa-f]{6})'/.exec(liveJsNC) || [, ''])[1] || '').toUpperCase();
const liveMin = Number((/var COUNTRY_MIN = (\d+);/.exec(liveJsNC) || [, 0])[1]);
ok('A8 线上真有长尾合并：COUNTRY_MIN = 10 + 独立的中性灰 ' + liveOther + '（不在国别彩色里）',
  liveMin === 10 && /^#[0-9A-F]{6}$/.test(liveOther) && !LIVE_COLORS.includes(liveOther),
  `阈值 ${liveMin} / 其他 ${liveOther}`);

/* 线上真数据：按面板同一口径现算（≥10 部的逐项 + 其余合并成「其他」，分母是这些项的合计） */
const LIVE = JSON.parse(await p0.evaluate(async (u) => (await fetch(u, { cache: 'reload' })).text(), SITE + 'data/watch.json?t=' + TS));
const RATED = LIVE.items.filter((it) => Number(it.rating) > 0);
const BK = [0, 0, 0, 0, 0];
RATED.forEach((it) => { const r = Number(it.rating); BK[r < 6 ? 0 : r < 7 ? 1 : r < 8 ? 2 : r < 9 ? 3 : 4]++; });
const CNT = {};
LIVE.items.forEach((it) => (it.countries || []).forEach((c) => { CNT[c] = (CNT[c] || 0) + 1; }));
const RANK_ALL = Object.keys(CNT).sort((a, b) => CNT[b] - CNT[a] || a.localeCompare(b));
const RANK = RANK_ALL.filter((k) => CNT[k] >= 10).slice(0, 8);
const C_MINOR = RANK_ALL.filter((k) => !RANK.includes(k)).reduce((s, k) => s + CNT[k], 0);
const C_ROWS = RANK.length ? RANK.length + (C_MINOR ? 1 : 0) : Math.min(8, RANK_ALL.length);
const B_LIVE = BK.filter((v) => v > 0).length;
const C_LIVE = C_ROWS;      /* 线上数据每个国别都 > 0，「其他」也只在合计 > 0 时才加，片数 = 行数 */
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

ok('B2 图例行数 5 / ' + C_ROWS + '（' + RANK.length + ' 个 ≥10 部 + 「其他」），首行与线上数据排序一致（' +
  RANK[0] + ' ' + CNT[RANK[0]] + '）、末行是「其他」',
  r.b.rows === 5 && r.c.rows === C_ROWS && r.c.keys[0] === RANK[0] && r.c.vs[0] === String(CNT[RANK[0]]) &&
  (C_MINOR ? (r.c.keys[C_ROWS - 1] === '其他' && r.c.vs[C_ROWS - 1] === String(C_MINOR)) : true),
  `区间 ${r.b.rows} 行 / 国别 ${r.c.rows} 行：${r.c.keys.map((k, i) => k + '=' + r.c.vs[i]).join('/')}`);

ok('B3 百分比合计约 100%（饼的分母是面板里那些片，不是全库）',
  Math.abs(sumPct(r.b.pcts) - 100) < 0.35 && Math.abs(sumPct(r.c.pcts) - 100) < 0.35 &&
  !r.b.nan && !r.c.nan,
  `区间 ${sumPct(r.b.pcts).toFixed(1)}% / 国别 ${sumPct(r.c.pcts).toFixed(1)}%`);

/* 第 101 轮宽度微调起四卡一行（两饼都 2 栏）：两个饼仍等宽、饼在左图例在右且不重叠 */
ok('B4 版式：两面板等宽（都 2 栏），饼在左图例在右且不重叠',
  Math.abs(r.b.sec.w - r.c.sec.w) <= 2 &&
  r.b.pie.r <= r.b.leg.l && r.c.pie.r <= r.c.leg.l,
  `${r.b.sec.w}/${r.c.sec.w} 高 ${r.b.sec.h}/${r.c.sec.h}`);

/* 第 101 轮宽度微调改判：饼卡收窄到 2/12，1920 饼落在按栏 42% ≈ 110，不再是 clamp 上限 168。 */
ok('B5 饼 110（按栏 42%）、图例 ≤320 没被拉开',
  Math.round(r.b.pie.w) === 110 && r.b.leg.w <= 320 && r.c.leg.w <= 320,
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
