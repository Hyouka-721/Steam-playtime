/* 第 94 轮 watch 侧上线复验：年报维度扩容 + 头部精简 + 图表美观
 *
 * ⚠️ 版本号已随第 95 轮 bump 到 v=32 / v=22 —— 第 94、95 轮是**同一批推送**，
 *    两轮的线上复验都在这一批之后跑（`online94_watch` 与 `online95_watch` 互补：
 *    前者守 6 卡与造型，后者守国别面板）。
 *    单独回滚到第 93 轮（v=30 / v=20）时本脚本会红在 A1，属预期。
 *
 * 复验口径：
 *   ① 指纹：watch.html 引用 watch.css?v=41 / watch.js?v=33；css/js 字节 md5 与本地全等；
 *      线上 JS 里确实没有 st-sub / st-label、且 select 带 aria-label（版本号只说明引用变了）
 *   ② 1440：6 卡（键名与顺序）、指标与本地推导全等、面板 5+Top5 顺序、
 *      12 月柱 / 逐年柱=9 / 类型 3 行 / 区间 5 行、版式真的是 8/4/12 不对称、无溢出零异常
 *   ③ 390：6 卡 2 列、面板单列、12 个轴标签互不重叠、无溢出零异常
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
const ITEMS = JSON.parse(norm(fs.readFileSync(ROOT + 'data/watch.json', 'utf8'))).items;
const N = ITEMS.length;

/* 与报表同一口径的本地期望值 */
const RATED = ITEMS.filter((x) => Number(x.rating) > 0).map((x) => Number(x.rating));
const AVG = (RATED.reduce((a, b) => a + b, 0) / RATED.length).toFixed(2);
const SR = RATED.slice().sort((a, b) => a - b);
const MID = Math.floor(SR.length / 2);
const MEDIAN = (SR.length % 2 ? SR[MID] : (SR[MID - 1] + SR[MID]) / 2).toFixed(2);
const HIGHPCT = (RATED.filter((r) => r >= 8).length / RATED.length * 100).toFixed(1);
const YEARS = new Set(ITEMS.map((x) => String(x.watched_at || '').slice(0, 4))).size;

let pass = 0, fail = 0;
const ok = (n, c, extra = '') => {
  c ? (pass++, console.log(`PASS ${n}${extra ? '  — ' + extra : ''}`))
    : (fail++, console.log(`FAIL ${n}  — ${extra}`));
};

const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
await page.goto(SITE + 'watch.html?t=' + TS, { waitUntil: 'load' });
await page.waitForFunction(() => document.querySelectorAll('#w-grid .poster').length > 20, null, { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(900);

/* ---------- ① 内容指纹 ---------- */
console.log('== ① 内容指纹 ==');
const html = await page.evaluate(async (u) => (await fetch(u, { cache: 'reload' })).text(), SITE + 'watch.html?t=' + TS);
ok('A1 线上 watch.html 引用 watch.css?v=41 / watch.js?v=33',
  /watch\.css\?v=41/.test(html) && /watch\.js\?v=33/.test(html),
  (html.match(/watch\.(css|js)\?v=\d+/g) || []).join(' '));

const liveCss = await page.evaluate(async (u) => (await fetch(u, { cache: 'reload' })).text(), SITE + 'watch.css?v=41&t=' + TS);
const liveJs = await page.evaluate(async (u) => (await fetch(u, { cache: 'reload' })).text(), SITE + 'watch.js?v=33&t=' + TS);
ok('A2 线上 watch.css 字节 md5 与本地全等', md5txt(liveCss) === md5txt(localCss),
  `${md5txt(liveCss).slice(0, 12)} / ${md5txt(localCss).slice(0, 12)}`);
ok('A3 线上 watch.js 字节 md5 与本地全等', md5txt(liveJs) === md5txt(localJs),
  `${md5txt(liveJs).slice(0, 12)} / ${md5txt(localJs).slice(0, 12)}`);

const liveJsNoCmt = stripCmt(liveJs);
/* 第 101 轮改判（用户「删除类型构成和高频标签两个选项卡」）：五个面板减到四块
   （months / buckets / country / years）+ 年度影视，kinds / tags 连标记一起消失。 */
ok('A4 线上 JS：副标题/label 已删、select 带 aria-label、五个 data-panel（含 top）都在、kinds/tags 已删净',
  !/st-sub/.test(liveJsNoCmt) && !/st-label/.test(liveJsNoCmt) &&
  /id="st-year" aria-label="统计年份"/.test(liveJsNoCmt) &&
  ['months', 'buckets', 'country', 'years', 'top'].every((k) =>
    new RegExp('data-panel="' + k + '"').test(liveJsNoCmt)) &&
  !/data-panel="(kinds|tags)"/.test(liveJsNoCmt));

/* ---------- ② 1440 运行时 ---------- */
console.log('== ② 1440 运行时 ==');
await page.click('#w-avatar');
await page.waitForFunction(() => !document.getElementById('w-tl').hidden, null, { timeout: 15000 });
await page.click('#w-stats-btn');
await page.waitForTimeout(700);

const probe = () => page.evaluate(() => {
  const q = (s) => document.querySelectorAll(s).length;
  /* 第 101 轮：面板删到 4 个，历史几何取数 null-safe */
  const box = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect();
    return { w: Math.round(b.width), t: Math.round(b.top) }; };
  return {
    cards: [...document.querySelectorAll('.st-card')].map((c) => ({
      k: c.querySelector('.st-k').textContent.trim(),
      v: c.querySelector('.st-v').textContent.trim()
    })),
    panels: [...document.querySelectorAll('.st-panel')].map((p) => p.dataset.panel),
    barsMonth: q('[data-panel="months"] .st-bar'), barsYear: q('[data-panel="years"] .st-bar'),
    rowsKind: q('[data-panel="kinds"] .st-row'), rowsBucket: q('[data-panel="buckets"] .st-row'),
    chips: q('.st-chip'), top: q('.st-top-item'),
    subCount: q('.st-sub'), labelCount: q('.st-label'),
    ariaLabel: (document.getElementById('st-year') || {}).getAttribute
      ? document.getElementById('st-year').getAttribute('aria-label') : '',
    boxMonths: box('[data-panel="months"]'),
    boxBuckets: box('[data-panel="buckets"]'), boxPanels: box('.st-panels'),
    boxYears: box('[data-panel="years"]'), boxCountry: box('[data-panel="country"]'),
    ov: document.documentElement.scrollWidth - document.documentElement.clientWidth
  };
});

const r = await probe();
const card = (k) => (r.cards.find((c) => c.k === k) || {}).v;
/* 第 103 轮改判：删三部「最佳」、加「观影密度 / 峰值月份」，7 卡 → 6 卡。 */
ok('B1 六卡，键名与顺序对：记录总数 / 平均评分 / ≥8 分占比 / 观影天数 / 观影密度 / 峰值月份',
  r.cards.length === 6 &&
  r.cards.map((c) => c.k).join('/') === '记录总数/平均评分/≥8 分占比/观影天数/观影密度/峰值月份',
  r.cards.map((c) => c.k).join('/'));

/* 第 103 轮改判：密度 3.6% / 峰值月份 7月·16 部与全库推导同值。 */
ok('B2 六卡数字与本地同口径推导全等（数字四卡 + 密度 + 峰值月份）',
  card('记录总数') === String(N) &&
  card('平均评分') === AVG && card('≥8 分占比') === HIGHPCT &&
  card('观影密度') === '3.6' && card('峰值月份') === '7月',
  `${card('平均评分')}/${card('≥8 分占比')} vs ${AVG}/${HIGHPCT} · 密度 ${card('观影密度')}% 峰值 ${card('峰值月份')}`);

ok('B3 头部只剩标题 + 下拉：副标题与「统计年份」字样都不在线上页面，aria-label 仍在',
  r.subCount === 0 && r.labelCount === 0 && r.ariaLabel === '统计年份');

ok('B4 面板顺序 月度 / 评分区间 / 国别 / 逐年 / 年度影视（第 101 轮四卡一行）',
  r.panels.join('/') === 'months/buckets/country/years/top', r.panels.join('/'));

/* 第 101 轮改判：类型 / 标签面板删净，行数与 chips 归零；其余口径原样守。 */
ok('B5 内容齐备：12 月柱 / 逐年柱=' + YEARS + ' / 区间 5 行 / 年度影视 9 条；类型行与标签已删净',
  r.barsMonth === 12 && r.barsYear === YEARS && r.rowsKind === 0 && r.rowsBucket === 5 &&
  r.chips === 0 && r.top === 9,
  `月=${r.barsMonth} 年=${r.barsYear} 类型=${r.rowsKind} 区间=${r.rowsBucket} chips=${r.chips}`);

/* 第 101 轮改判＋宽度微调：柱图各 4/12、饼各 2/12，同类等宽、并列同一行。 */
ok('B6 版式：柱图各 4/12、饼各 2/12（约 2:1）、并列同一行',
  Math.abs(r.boxMonths.w / r.boxPanels.w - 4 / 12) < 0.03 &&
  Math.abs(r.boxYears.w / r.boxPanels.w - 4 / 12) < 0.03 &&
  Math.abs(r.boxBuckets.w / r.boxPanels.w - 2 / 12) < 0.03 &&
  Math.abs(r.boxCountry.w / r.boxPanels.w - 2 / 12) < 0.03 &&
  Math.abs(r.boxMonths.w - r.boxYears.w) <= 2 &&
  Math.abs(r.boxBuckets.w - r.boxCountry.w) <= 2 &&
  r.boxMonths.t === r.boxBuckets.t && r.boxBuckets.t === r.boxCountry.t &&
  r.boxCountry.t === r.boxYears.t,
  `容器 ${r.boxPanels.w} / ${['boxMonths','boxBuckets','boxCountry','boxYears'].map((k)=>k+'='+r[k].w+'@'+r[k].t).join(' ')}`);

ok('B7 1440 无横向溢出 + 零 JS 异常', r.ov <= 0 && errs.length === 0, `ov=${r.ov} err=${errs.length}`);
await ctx.close();

/* ---------- ③ 390 运行时 ---------- */
console.log('== ③ 390 运行时 ==');
const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
const mp = await mctx.newPage();
const merrs = [];
mp.on('pageerror', (e) => merrs.push(String(e)));
await mp.goto(SITE + 'watch.html?t=' + TS, { waitUntil: 'load' });
await mp.waitForFunction(() => document.querySelectorAll('#w-grid .poster').length > 20, null, { timeout: 30000 }).catch(() => {});
await mp.waitForTimeout(900);
await mp.click('#w-avatar');
await mp.waitForFunction(() => !document.getElementById('w-tl').hidden, null, { timeout: 15000 });
await mp.click('#w-stats-btn');
await mp.waitForTimeout(700);
const m = await mp.evaluate(() => {
  const cols = (s) => getComputedStyle(document.querySelector(s)).gridTemplateColumns.split(' ').length;
  const labs = [...document.querySelectorAll('[data-panel="months"] .st-bar-lab')];
  const rects = labs.map((x) => x.getBoundingClientRect());
  let overlap = 0;
  for (let i = 1; i < rects.length; i++) if (rects[i].left < rects[i - 1].right - 0.5) overlap++;
  return {
    cardCols: cols('.st-cards'), panelCols: cols('.st-panels'),
    monthsW: Math.round(document.querySelector('[data-panel="months"]').getBoundingClientRect().width),
    vw: window.innerWidth, labs: labs.length, overlap,
    ov: document.documentElement.scrollWidth - window.innerWidth
  };
});
ok('C1 390：6 卡收成 2 列、面板单列、months 不越界、无横向溢出',
  m.cardCols === 2 && m.panelCols === 1 && m.monthsW <= m.vw && m.ov <= 0,
  `卡片 ${m.cardCols} 列 / 面板 ${m.panelCols} 列 / months ${m.monthsW} / ov=${m.ov}`);
ok('C2 390：12 个轴标签都在且互不重叠', m.labs === 12 && m.overlap === 0,
  `标签 ${m.labs} 重叠 ${m.overlap}`);
ok('C3 390 零 JS 异常', merrs.length === 0, merrs.slice(0, 3).join(' | '));

await browser.close();
console.log(`\n===== 第 94 轮 watch 线上复验（年报扩容 + 美化）：${pass} PASS / ${fail} FAIL =====`);
process.exit(fail ? 1 : 0);
