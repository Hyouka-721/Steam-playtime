/* 第 98 轮 watch 侧回归：国别「中国大陆 + 中国台湾」并进「中国」 · 两块饼换位
 *
 * 用户原话：「1.中国大陆与中国台湾 合并成中国。
 *            2.评分区间饼图移到阅读分布与类型构成之间，国别饼图移到逐年趋势与高频标签之间」
 *
 * ① 数据：31 条（30 中国大陆 + 1 中国台湾）全改成「中国」，`npm run shard` 重生成 9 片；
 *    归一化表同步（`docs/watch.js` 内联 + `scripts/watch/country-lib.mjs` 权威值）。
 *    🔴 这是把第 96 轮的口径**反过来了** —— 当时定「中国大陆」是为了跟港澳台并列时不歧义，
 *    用户现在要求合并，所以 `'中国大陆'/'台湾'` 一律映射到「中国」，港澳仍独立。
 * ② 版式：DOM 顺序 → 月度 / 评分区间 / 类型 / 逐年 / 国别 / 标签 / Top5，
 *    跨度 → 5+4+3 / 5+4+3（第 99 轮改成「一行三卡」），**每行都正好 12 栏**。
 *
 * ⚠️ 年报按钮只在时间轴视图出现（第 93 轮契约），所以每次都要先点头像再点年报。
 * ⚠️ 顺序判据要按 **DOM 里的实际先后**比，不能只比"这个面板存在" —— 挪位置最容易漏测。
 */
import { createRequire } from 'module';
import fs from 'fs';
import { COUNTRY_ALIAS, normCountry } from '../../scripts/watch/country-lib.mjs';

const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const BASE = 'http://127.0.0.1:8895/';
const ROOT = 'C:/Users/33329/WorkBuddy/2026-10-13-18-17-49/steam-playtime/';
const DOCS = ROOT + 'docs/';
const rd = (p) => fs.readFileSync(DOCS + p, 'utf8').replace(/\r\n/g, '\n');
const stripCmt = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');

const html = rd('watch.html');
const js = stripCmt(rd('watch.js'));
const css = stripCmt(rd('watch.css'));
const data = JSON.parse(rd('data/watch.json'));

const ORDER = ['months', 'buckets', 'kinds', 'years', 'country', 'tags', 'top'];
const SPAN = { months: 5, buckets: 4, kinds: 3, years: 5, country: 4, tags: 3 };

/* 与面板同一口径的期望值 */
const CNT = {};
data.items.forEach((it) => (it.countries || []).forEach((c) => { CNT[c] = (CNT[c] || 0) + 1; }));
const RANK = Object.keys(CNT).sort((a, b) => CNT[b] - CNT[a] || a.localeCompare(b));
const CMAJOR = RANK.filter((c) => CNT[c] >= 10).slice(0, 8);
const MINOR_SUM = RANK.filter((c) => !CMAJOR.includes(c)).reduce((s, c) => s + CNT[c], 0);
const ROWS_EXPECT = CMAJOR.length ? CMAJOR.length + (MINOR_SUM ? 1 : 0) : Math.min(8, RANK.length);

let pass = 0, fail = 0;
const ok = (n, c, extra = '') => {
  c ? (pass++, console.log(`PASS ${n}${extra ? '  — ' + extra : ''}`))
    : (fail++, console.log(`FAIL ${n}  — ${extra}`));
};

/* ---------------- A 静态契约 ---------------- */
console.log('== A 静态契约 ==');
ok('A1 版本号：watch.html 引用 watch.css?v=37 / watch.js?v=29（CSS 改跨度、JS 改顺序与别名表，都得 bump）',
  /watch\.css\?v=37/.test(html) && /watch\.js\?v=29/.test(html),
  (html.match(/watch\.(css|js)\?v=\d+/g) || []).join(' '));

/* 顺序：取每个面板标记在 JS 源码里第一次出现的位置，必须严格递增 */
const posOf = (k) => js.indexOf('data-panel="' + k + '"');
const POS = ORDER.map((k) => ({ k, p: posOf(k) }));
const orderOk = POS.every((x) => x.p > 0) && POS.every((x, i) => i === 0 || x.p > POS[i - 1].p);
ok('A2 DOM 顺序 = 月度 / 评分区间 / 类型 / 逐年 / 国别 / 标签 / Top5（第 98 轮换位）',
  orderOk, POS.map((x) => x.k + '@' + x.p).join(' '));

const spanOf = (k) => Number((new RegExp(
  '\\.st-panel\\[data-panel="' + k + '"\\] \\{ grid-column: span (\\d+); \\}').exec(css) || [, 0])[1]);
const SPANS = ORDER.filter((k) => k !== 'top').map((k) => spanOf(k));
ok('A3 跨度按新顺序重新配平：5 / 4 / 3 / 5 / 4 / 3',
  ORDER.filter((k) => k !== 'top').every((k) => spanOf(k) === SPAN[k]),
  ORDER.filter((k) => k !== 'top').map((k) => k + '=' + spanOf(k)).join(' '));

/* 每行必须正好 12 栏：两行分别是 (months+buckets+kinds) (years+country+tags) */
const ROWS = [['months', 'buckets', 'kinds'], ['years', 'country', 'tags']];
const rowSums = ROWS.map((r) => r.reduce((s, k) => s + spanOf(k), 0));
ok('A4 两行各自正好 12 栏（5+4+3 / 5+4+3），不会掉进下一行留空档',
  rowSums.every((v) => v === 12), `行和 ${rowSums.join('/')}（跨度 ${SPANS.join('/')}）`);

/* ---- 国别口径：大陆 + 台湾 → 中国 ---- */
const OLD_NAMES = ['中国大陆', '中国台湾'];
const badItems = [];
data.items.forEach((it) => {
  (it.countries || []).forEach((c) => { if (OLD_NAMES.includes(c)) badItems.push(it.title + ':' + c); });
});
ok('A5 数据：124 条里已无「中国大陆 / 中国台湾」，全部并进「中国」',
  data.items.length === 124 && badItems.length === 0 &&
  data.items.every((it) => Array.isArray(it.countries) && it.countries.length > 0),
  `残留 ${badItems.length} 处${badItems.length ? '：' + badItems.slice(0, 4).join(', ') : ''} / 国别 ${RANK.length} 种`);

ok('A6 合并后的分布：中国 ' + (CNT['中国'] || 0) + ' 部（= 原 30 大陆 + 1 台湾），且仍是第三名',
  CNT['中国'] === 31 && RANK.indexOf('中国') === 2,
  RANK.map((k) => k + '=' + CNT[k]).join('/'));

ok('A7 归一化口径（权威表）：中国大陆 / 大陆 / 台湾 / 中国台湾 全部收敛到「中国」，港澳不受影响',
  normCountry('中国大陆') === '中国' && normCountry('大陆') === '中国' &&
  normCountry('中国台湾') === '中国' && normCountry('台湾') === '中国' &&
  normCountry('China') === '中国' && normCountry('中国') === '中国' &&
  normCountry('香港') === '中国香港' && normCountry('澳门') === '中国澳门' &&
  COUNTRY_ALIAS['中国台湾'] === '中国',
  `大陆→${normCountry('大陆')} 台湾→${normCountry('台湾')} 香港→${normCountry('香港')}`);

ok('A8 网页内联别名表与权威表同步（' + Object.keys(COUNTRY_ALIAS).length + ' 条），且没有残留的自映射',
  /'中国大陆': '中国'/.test(js) && /'中国台湾': '中国'/.test(js) && /'台湾': '中国'/.test(js) &&
  !/'中国大陆': '中国大陆'/.test(js) && !/'中国台湾': '中国台湾'/.test(js),
  (js.match(/'中国(大陆|台湾)'\s*:\s*'[^']*'/g) || []).join(' '));

/* ---------------- B 1920 运行时 ---------------- */
console.log('== B 1920 运行时 ==');
const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1200 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
await page.goto(BASE + 'watch.html', { waitUntil: 'load' });
await page.waitForSelector('#w-grid .poster', { timeout: 20000 });
await page.click('#w-avatar');
await page.waitForSelector('#w-tl .tl-item', { timeout: 20000 });
await page.click('#w-stats-btn');
await page.waitForSelector('.st-panel[data-panel="buckets"] svg.st-pie-chart', { timeout: 10000 });
await page.waitForTimeout(700);

const probe = () => page.evaluate(() => {
  const box = (k) => {
    const e = document.querySelector('.st-panel[data-panel="' + k + '"]');
    if (!e) return null;
    const r = e.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height), t: Math.round(r.top), l: Math.round(r.left) };
  };
  const all = [...document.querySelectorAll('.st-panel')].map((p) => p.dataset.panel);
  const panels = document.querySelector('.st-panels');
  return {
    order: all,
    panelsW: Math.round(panels.getBoundingClientRect().width),
    boxes: Object.fromEntries(all.map((k) => [k, box(k)])),
    cRows: [...document.querySelectorAll('[data-panel="country"] .st-row-k')].map((x) => x.textContent.trim()),
    cVs: [...document.querySelectorAll('[data-panel="country"] .st-row-v')].map((x) => x.textContent.trim()),
    cNote: (document.querySelector('[data-panel="country"] .st-note') || {}).textContent || '',
    cSlices: document.querySelectorAll('[data-panel="country"] .st-pie-slice').length,
    bSlices: document.querySelectorAll('[data-panel="buckets"] .st-pie-slice').length,
    barsMonth: document.querySelectorAll('[data-panel="months"] .st-bar').length,
    nan: /NaN/.test(document.querySelector('.st-panels').innerHTML),
    ov: document.documentElement.scrollWidth - document.documentElement.clientWidth
  };
});

const r = await probe();
ok('B1 运行时 DOM 顺序与静态一致（月度 / 评分区间 / 类型 / 逐年 / 国别 / 标签 / Top5）',
  r.order.join('/') === 'months/buckets/kinds/years/country/tags/top', r.order.join('/'));

ok('B2 两行真的排出来了：月度/评分区间/类型 同行、逐年/国别/标签 同行，且行间依次下移',
  r.boxes.months.t === r.boxes.buckets.t && r.boxes.buckets.t === r.boxes.kinds.t &&
  r.boxes.years.t === r.boxes.country.t && r.boxes.country.t === r.boxes.tags.t &&
  r.boxes.kinds.t < r.boxes.years.t,
  `月度/区间/类型 ${r.boxes.months.t}/${r.boxes.buckets.t}/${r.boxes.kinds.t} · 逐年/国别/标签 ${r.boxes.years.t}/${r.boxes.country.t}/${r.boxes.tags.t}`);

ok('B3 跨度落地：5 / 4 / 3 / 5 / 4 / 3（占容器 12 栏的比例 ±3%）',
  ['months', 'buckets', 'kinds', 'years', 'country', 'tags']
    .every((k) => Math.abs(r.boxes[k].w / r.panelsW - SPAN[k] / 12) < 0.03),
  ['months', 'buckets', 'kinds', 'years', 'country', 'tags']
    .map((k) => k + '=' + r.boxes[k].w + '/' + r.panelsW).join(' '));

ok('B4 换位没把内容弄丢：月度 12 柱、评分区间 5 片、国别 ' + r.cSlices + ' 片、零 NaN',
  r.barsMonth === 12 && r.bSlices === 5 && r.cSlices > 0 && !r.nan,
  `月柱 ${r.barsMonth} / 区间片 ${r.bSlices} / 国别片 ${r.cSlices}`);

ok('B5 国别面板：' + ROWS_EXPECT + ' 行、首行 ' + CMAJOR[0] + '、含「中国」' + (CNT['中国'] || 0) + '、末行「其他」' + MINOR_SUM,
  r.cRows.length === ROWS_EXPECT && r.cRows[0] === CMAJOR[0] &&
  r.cRows.includes('中国') && r.cVs[r.cRows.indexOf('中国')] === String(CNT['中国']) &&
  r.cRows[r.cRows.length - 1] === '其他' && r.cVs[r.cVs.length - 1] === String(MINOR_SUM) &&
  !r.cRows.some((k) => k === '中国大陆' || k === '中国台湾'),
  r.cRows.map((k, i) => k + '=' + r.cVs[i]).join('/'));

ok('B6 脚注点名的长尾里已经不出现「中国大陆 / 中国台湾」',
  /少于 10 部的国别（/.test(r.cNote) && !/中国大陆|中国台湾/.test(r.cNote),
  `脚注「${r.cNote}」`);

ok('B7 1920 无横向溢出 + 零 JS 异常', r.ov <= 0 && errs.length === 0, `ov=${r.ov} err=${errs.length}`);
await ctx.close();

/* ---------------- C 1440 ---------------- */
console.log('== C 1440 ==');
const c2 = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
const p2 = await c2.newPage();
const e2 = [];
p2.on('pageerror', (e) => e2.push(String(e)));
await p2.goto(BASE + 'watch.html', { waitUntil: 'load' });
await p2.waitForSelector('#w-grid .poster', { timeout: 20000 });
await p2.click('#w-avatar');
await p2.waitForSelector('#w-tl .tl-item', { timeout: 20000 });
await p2.click('#w-stats-btn');
await p2.waitForTimeout(700);
const c = await p2.evaluate(() => {
  const b = (k) => { const e = document.querySelector('.st-panel[data-panel="' + k + '"]'); const x = e.getBoundingClientRect();
    return { w: Math.round(x.width), t: Math.round(x.top) }; };
  const pie = document.querySelector('[data-panel="buckets"] .st-pie-chart').getBoundingClientRect();
  const leg = document.querySelector('[data-panel="buckets"] .st-rows--pie').getBoundingClientRect();
  return {
    order: [...document.querySelectorAll('.st-panel')].map((p) => p.dataset.panel),
    m: b('months'), bk: b('buckets'), k: b('kinds'), y: b('years'), co: b('country'), tg: b('tags'),
    pieW: Math.round(pie.width), gap: Math.round(leg.left - pie.right),
    ov: document.documentElement.scrollWidth - document.documentElement.clientWidth
  };
});
ok('C1 1440 顺序与行关系不变：月度/区间/类型、逐年/国别/标签 各自同行',
  c.order.join('/') === 'months/buckets/kinds/years/country/tags/top' &&
  c.m.t === c.bk.t && c.bk.t === c.k.t && c.y.t === c.co.t && c.co.t === c.tg.t,
  `${c.m.t}/${c.bk.t}/${c.k.t} · ${c.y.t}/${c.co.t}/${c.tg.t}`);

ok('C2 1440 月度(5)比评分区间(4)宽、饼缩到 230 且图例不重叠',
  c.m.w > c.bk.w && c.pieW === 230 && c.gap > 0,
  `月度 ${c.m.w} / 区间 ${c.bk.w} / 饼 ${c.pieW} 间距 ${c.gap}`);

ok('C3 1440 无横向溢出 + 零 JS 异常', c.ov <= 0 && e2.length === 0, `ov=${c.ov} err=${e2.length}`);
await c2.close();

/* ---------------- D 390 ---------------- */
console.log('== D 390 ==');
const c3 = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
const p3 = await c3.newPage();
const e3 = [];
p3.on('pageerror', (e) => e3.push(String(e)));
await p3.goto(BASE + 'watch.html', { waitUntil: 'load' });
await p3.waitForSelector('#w-grid .poster', { timeout: 20000 });
await p3.click('#w-avatar');
await p3.waitForSelector('#w-tl .tl-item', { timeout: 20000 });
await p3.click('#w-stats-btn');
await p3.waitForTimeout(800);
const d = await p3.evaluate(() => {
  const names = ['months', 'buckets', 'kinds', 'years', 'country', 'tags'];
  const bs = names.map((k) => {
    const e = document.querySelector('.st-panel[data-panel="' + k + '"]');
    const x = e.getBoundingClientRect();
    return { k, w: Math.round(x.width), t: Math.round(x.top), l: Math.round(x.left) };
  });
  return {
    order: [...document.querySelectorAll('.st-panel')].map((p) => p.dataset.panel),
    bs,
    secW: Math.round(document.querySelector('.st-panels').getBoundingClientRect().width),
    ov: document.documentElement.scrollWidth - document.documentElement.clientWidth
  };
});
ok('D1 390 面板回到单列：每块都占满宽且依次下移（顺序不变）',
  d.order.join('/') === 'months/buckets/kinds/years/country/tags/top' &&
  d.bs.every((x) => x.w >= d.secW - 8) &&
  d.bs.every((x, i) => i === 0 || x.t > d.bs[i - 1].t),
  d.bs.map((x) => x.k + '=' + x.w + '@' + x.t).join(' '));

ok('D2 390 无横向溢出 + 零 JS 异常', d.ov <= 0 && e3.length === 0, `ov=${d.ov} err=${e3.length}`);
await c3.close();

await browser.close();
console.log('');
console.log(`第 98 轮：${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
