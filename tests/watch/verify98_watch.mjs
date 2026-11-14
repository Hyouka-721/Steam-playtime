/* 第 98 轮 watch 侧回归：国别「中国大陆 + 中国台湾」并进「中国」 · 两块饼换位
 *
 * 用户原话：「1.中国大陆与中国台湾 合并成中国。
 *            2.评分区间饼图移到阅读分布与类型构成之间，国别饼图移到逐年趋势与高频标签之间」
 *
 * ① 数据：31 条（30 中国大陆 + 1 中国台湾）全改成「中国」，`npm run shard` 重生成 9 片；
 *    归一化表同步（`docs/watch.js` 内联 + `scripts/watch/country-lib.mjs` 权威值）。
 *    🔴 这是把第 96 轮的口径**反过来了** —— 当时定「中国大陆」是为了跟港澳台并列时不歧义，
 *    用户现在要求合并，所以 `'中国大陆'/'台湾'` 一律映射到「中国」，港澳仍独立。
 * ② 版式（第 101 轮已改判）：DOM 顺序 → 月度 / 评分区间 / 国别 / 逐年 / 年度影视，
 *    跨度 → 4+2+2+4 一行四卡（宽度微调），合计正好 12 栏。
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

/* 第 101 轮改判（用户「删除类型构成和高频标签两个选项卡；将月度分布、评分区间、
   国别构成、逐年趋势按顺序并列同一行」）：面板从 6 个减到 4 个，顺序重排为
   months / buckets / country / years，四块各 3 栏，合计正好 12 栏铺满一行。 */
const ORDER = ['months', 'buckets', 'country', 'years', 'top'];
const SPAN = { months: 4, buckets: 2, country: 2, years: 4 };

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
ok('A1 版本号：watch.html 引用 watch.css?v=40 / watch.js?v=31（CSS 改跨度、JS 改顺序与别名表，都得 bump）',
  /watch\.css\?v=40/.test(html) && /watch\.js\?v=31/.test(html),
  (html.match(/watch\.(css|js)\?v=\d+/g) || []).join(' '));

/* 顺序：取每个面板标记在 JS 源码里第一次出现的位置，必须严格递增 */
const posOf = (k) => js.indexOf('data-panel="' + k + '"');
const POS = ORDER.map((k) => ({ k, p: posOf(k) }));
const orderOk = POS.every((x) => x.p > 0) && POS.every((x, i) => i === 0 || x.p > POS[i - 1].p);
ok('A2 DOM 顺序 = 月度 / 评分区间 / 国别 / 逐年 / 年度影视（第 101 轮四卡一行）',
  orderOk && !/data-panel="(kinds|tags)"/.test(js), POS.map((x) => x.k + '@' + x.p).join(' '));

/* 第 101 轮：源码里 months / years 为对齐多写了空格，spanOf 正则放宽为 \\s* 容忍无害空白
   （verify94/95 早就是这个写法）；不改 CSS 对齐，也不放宽数值判据。 */
const spanOf = (k) => Number((new RegExp(
  '\\.st-panel\\[data-panel="' + k + '"\\]\\s*\\{ grid-column: span (\\d+); \\}').exec(css) || [, 0])[1]);
const SPANS = ORDER.filter((k) => k !== 'top').map((k) => spanOf(k));
ok('A3 跨度按第 101 轮宽度微调配平：4 / 2 / 2 / 4（柱图 4 栏、饼 2 栏）',
  ORDER.filter((k) => k !== 'top').every((k) => spanOf(k) === SPAN[k]),
  ORDER.filter((k) => k !== 'top').map((k) => k + '=' + spanOf(k)).join(' '));

/* 第 101 轮宽度微调：只剩一行，四块 4+2+2+4 正好 12 栏，不会掉进下一行留空档 */
const ROWS = [['months', 'buckets', 'country', 'years']];
const rowSums = ROWS.map((r) => r.reduce((s, k) => s + spanOf(k), 0));
ok('A4 唯一一行正好 12 栏（4+2+2+4），不会掉进下一行留空档',
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
ok('B1 运行时 DOM 顺序与静态一致（月度 / 评分区间 / 国别 / 逐年 / 年度影视）',
  r.order.join('/') === ORDER.join('/'), r.order.join('/'));

ok('B2 四卡严格并列同一行：top 全等、left 依次递增',
  ['months','buckets','country','years'].every((k) => r.boxes[k].t === r.boxes.months.t) &&
  ['months','buckets','country','years'].every((k, i, a) => i === 0 || r.boxes[k].l > r.boxes[a[i-1]].l),
  ['months','buckets','country','years'].map((k) => k + '@' + r.boxes[k].l + '/' + r.boxes[k].t).join(' '));

ok('B3 跨度落地：柱图各 4/12、饼各 2/12（占容器比例 ±3%），同类等宽',
  ['months', 'years'].every((k) => Math.abs(r.boxes[k].w / r.panelsW - 4 / 12) < 0.03) &&
  ['buckets', 'country'].every((k) => Math.abs(r.boxes[k].w / r.panelsW - 2 / 12) < 0.03) &&
  Math.abs(r.boxes.months.w - r.boxes.years.w) <= 2 &&
  Math.abs(r.boxes.buckets.w - r.boxes.country.w) <= 2,
  ORDER.filter((k) => k !== 'top')
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

/* 第 101 轮改判（用户「删除国别构成的说明文字」）：脚注整条删掉，
   改守「说明文字不存在 + 图例里不出现旧国别名」，长尾仍合并成「其他」。 */
ok('B6 国别说明脚注已删净，且图例里不出现「中国大陆 / 中国台湾」',
  r.cNote === '' && !/按国别累计|可超过记录总数|少于 10 部/.test(r.cNote) &&
  !/中国大陆|中国台湾/.test(r.cRows.join('/')),
  `脚注「${r.cNote}」 图例 ${r.cRows.join('/')}`);

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
  /* 第 101 轮：面板删到 4 个，历史几何取数 null-safe */
  const b = (k) => { const e = document.querySelector('.st-panel[data-panel="' + k + '"]'); if (!e) return null;
    const x = e.getBoundingClientRect();
    return { w: Math.round(x.width), t: Math.round(x.top) }; };
  const pie = document.querySelector('[data-panel="buckets"] .st-pie-chart').getBoundingClientRect();
  const leg = document.querySelector('[data-panel="buckets"] .st-rows--pie').getBoundingClientRect();
  return {
    order: [...document.querySelectorAll('.st-panel')].map((p) => p.dataset.panel),
    m: b('months'), bk: b('buckets'), y: b('years'), co: b('country'),
    pieW: Math.round(pie.width), legT: Math.round(leg.top), pieBot: Math.round(pie.bottom),
    ov: document.documentElement.scrollWidth - document.documentElement.clientWidth
  };
});
ok('C1 1440 顺序与四卡同行关系不变',
  c.order.join('/') === ORDER.join('/') &&
  c.m.t === c.bk.t && c.bk.t === c.co.t && c.co.t === c.y.t,
  `${c.m.t}/${c.bk.t}/${c.co.t}/${c.y.t}`);

/* 第 101 轮宽度微调改判：柱图 4/12、饼 2/12（约 2:1），饼按栏缩到 96，图例换行到饼下方。 */
ok('C2 1440 柱图≈2×饼卡、饼按栏缩到 96、图例换行到饼下方',
  Math.abs(c.m.w / c.bk.w - 2) <= 0.1 && c.pieW >= 90 && c.pieW <= 105 &&
  c.legT > c.pieBot,
  `月度 ${c.m.w} / 区间 ${c.bk.w} / 饼 ${c.pieW} 图例顶 ${c.legT} > 饼底 ${c.pieBot}`);

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
  const names = ['months', 'buckets', 'country', 'years'];
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
  d.order.join('/') === ORDER.join('/') &&
  d.bs.every((x) => x.w >= d.secW - 8) &&
  d.bs.every((x, i) => i === 0 || x.t > d.bs[i - 1].t),
  d.bs.map((x) => x.k + '=' + x.w + '@' + x.t).join(' '));

ok('D2 390 无横向溢出 + 零 JS 异常', d.ov <= 0 && e3.length === 0, `ov=${d.ov} err=${e3.length}`);
await c3.close();

await browser.close();
console.log('');
console.log(`第 98 轮：${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
