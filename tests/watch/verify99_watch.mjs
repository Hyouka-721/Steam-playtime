/* 第 99 轮 watch 侧回归：三卡一行 · 年度影视 · 表单微调
 *
 * 用户原话（四条）：
 *   1. 评分区间饼图移到「阅读分布」（月度分布）与类型构成之间，合理分配宽度让三者同行；
 *      国别饼图移到逐年趋势与高频标签之间，合理分配宽度让三者同行。
 *   2. 高分 Top 5 栏目改为「年度影视」：2026 给阿嬷的情书 / 2025 士兵突击 / 2024 海边的曼彻斯特 /
 *      2023 史前星球 / 2022 是大臣 / 2021 情书 / 2020 冰菓 / 2019 我想吃掉你的胰脏 / 2018 阿甘正传。
 *   3. 删除编辑卡片里「排序」的说明文字（0~5 的整数，默认 3……）。
 *   4. 编辑卡片里「国别」与「标签」并列到同一行。
 *
 * ① 版式：面板顺序不变（月度/评分区间/类型/逐年/国别/标签/Top），跨度重新配平成
 *    5+4+3 / 5+4+3 —— 柱状图要宽、饼图近方、列表最窄，每行正好 12 栏。
 * ② 年度影视：YEAR_PICKS 常量（2018~2026 九条）按片名去 ALL 里找海报/评分补全。
 * ③ 表单：排序 label 去掉说明；国别/标签包进同一个 .w-row.w-row-2（≤480 自动回单列）。
 */
import { createRequire } from 'module';
import fs from 'fs';

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

/* 用户钦点的年度影视（2018~2026，按年份倒序） */
const PICKS = [
  ['2026', '给阿嬷的情书'], ['2025', '士兵突击'], ['2024', '海边的曼彻斯特'],
  ['2023', '史前星球'], ['2022', '是大臣'], ['2021', '情书'], ['2020', '冰菓'],
  ['2019', '我想吃掉你的胰脏'], ['2018', '阿甘正传'],
];

let pass = 0, fail = 0;
const ok = (n, c, extra = '') => {
  c ? (pass++, console.log(`PASS ${n}${extra ? '  — ' + extra : ''}`))
    : (fail++, console.log(`FAIL ${n}  — ${extra}`));
};

/* ---------------- A 静态契约 ---------------- */
console.log('== A 静态契约 ==');
ok('A1 版本号：watch.html 引用 watch.css?v=38 / watch.js?v=30（CSS 改跨度与年度影视样式、JS 改面板都 bump）',
  /watch\.css\?v=38/.test(html) && /watch\.js\?v=30/.test(html),
  (html.match(/watch\.(css|js)\?v=\d+/g) || []).join(' '));

const spanOf = (k) => Number((new RegExp(
  '\\.st-panel\\[data-panel="' + k + '"\\] \\{ grid-column: span (\\d+); \\}').exec(css) || [, 0])[1]);
ok('A2 三卡一行跨度：5 / 4 / 3 / 5 / 4 / 3（月度/评分区间/类型、逐年/国别/标签）',
  spanOf('months') === 5 && spanOf('buckets') === 4 && spanOf('kinds') === 3 &&
  spanOf('years') === 5 && spanOf('country') === 4 && spanOf('tags') === 3,
  ['months', 'buckets', 'kinds', 'years', 'country', 'tags'].map((k) => k + '=' + spanOf(k)).join(' '));

ok('A3 YEAR_PICKS 常量：9 条、按 2018~2026 倒序、片名逐条正确',
  /var YEAR_PICKS = \[/.test(js) &&
  PICKS.every(([y, t]) => js.includes("'" + t + "'")) &&
  PICKS.every(([y, t], i) => i === 0 || js.indexOf("'" + t + "'") > js.indexOf("'" + PICKS[i - 1][1] + "'")),
  PICKS.map(([y, t]) => y + '·' + t).join(' '));

ok('A4 面板标题已换成「年度影视」，不再有「高分 Top 5」',
  /<h3>年度影视<\/h3>/.test(js) && !/高分 Top 5/.test(js));

ok('A5 排序 label 去掉说明文字（只剩「排序」二字）',
  /for="add-order">排序<\/label>/.test(html) && !/for="add-order">排序<span/.test(html));

/* 国别与标签必须包进同一个 .w-row.w-row-2（不是各自独立占满一行）：
   从「最近一个 w-row w-row-2 开标签」到「add-tags」之间，只应有一个 </div>（关掉国别那个 .w-field）。 */
/* 第 100 轮改判：排序 / 国别 / 标签三字段并进同一个 .w-row.w-row-3（第 99 轮的 w-row-2 只装后两个）。
   从最近一个 w-row-3 开标签到 add-tags 之间应有 2 个 </div>（关掉排序与国别两个 .w-field）。 */
const ci99 = html.indexOf('id="add-country"');
const ti99 = html.indexOf('id="add-tags"');
const oi99 = html.indexOf('id="add-order"');
const rowOpen = html.lastIndexOf('<div class="w-row w-row-3">', ci99);
const seg = html.slice(rowOpen, ti99 + 20);
ok('A6 排序 / 国别 / 标签包进同一个 .w-row.w-row-3（三列栅格）',
  rowOpen > 0 && oi99 > rowOpen && ci99 > oi99 && ti99 > ci99 && (seg.match(/<\/div>/g) || []).length === 2,
  'rowOpen@' + rowOpen + ' / order@' + oi99 + ' / country@' + ci99 + ' / tags@' + ti99);

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

const r = await page.evaluate(() => {
  const box = (k) => {
    const e = document.querySelector('.st-panel[data-panel="' + k + '"]');
    const x = e.getBoundingClientRect();
    return { w: Math.round(x.width), t: Math.round(x.top) };
  };
  const items = [...document.querySelectorAll('.st-top-item')].map((li) => ({
    year: (li.querySelector('.st-top-year') || {}).textContent || '',
    name: (li.querySelector('.st-top-name') || {}).textContent || '',
    score: (li.querySelector('.st-top-score') || {}).textContent || '',
    hasImg: !!li.querySelector('.st-top-img[src]'),
  }));
  return {
    topTitle: (document.querySelector('.st-top h3') || {}).textContent || '',
    hasName: !!document.querySelector('.st-top-name'),
    hasScore: !!document.querySelector('.st-top-score'),
    items,
    months: box('months'), buckets: box('buckets'), kinds: box('kinds'),
    years: box('years'), country: box('country'), tags: box('tags'),
    ov: document.documentElement.scrollWidth - document.documentElement.clientWidth
  };
});

ok('B1 年度影视标题正确', r.topTitle === '年度影视', r.topTitle);

/* 第 100 轮改判（用户「仅展示海报和年份，不展示片名和评分」）：不再断言片名/评分文本，
   改守「9 条年份正确 + 每条有海报 + DOM 里无片名/评分节点」。 */
ok('B2 年度影视 9 条：年份逐条正确、每条有海报，且没有片名与评分节点',
  r.items.length === 9 &&
  PICKS.every(([y], i) => r.items[i] && r.items[i].year === y) &&
  r.items.every((it) => it.hasImg) && !r.hasName && !r.hasScore,
  r.items.map((it) => it.year + '·' + (it.hasImg ? '有海报' : '缺海报')).join(' / '));

ok('B3 三卡一行：月度/评分区间/类型 同行、逐年/国别/标签 同行，行间依次下移',
  r.months.t === r.buckets.t && r.buckets.t === r.kinds.t &&
  r.years.t === r.country.t && r.country.t === r.tags.t && r.kinds.t < r.years.t,
  `${r.months.t}/${r.buckets.t}/${r.kinds.t} · ${r.years.t}/${r.country.t}/${r.tags.t}`);

/* 表单：打开「添加」弹窗，量国别/标签是否同行、排序 label 是否干净 */
await page.click('#w-fab');
await page.waitForFunction(() => {
  const c = document.getElementById('add-country');
  return c && c.getBoundingClientRect().width > 0;
}, null, { timeout: 5000 });
const f = await page.evaluate(() => {
  const c = document.getElementById('add-country').getBoundingClientRect();
  const t = document.getElementById('add-tags').getBoundingClientRect();
  const orderLabel = document.querySelector('label[for="add-order"]');
  const wrap = document.getElementById('add-country').closest('.w-row');
  return {
    sameRow: Math.abs(c.top - t.top) <= 2 && c.left < t.left,
    cLeft: Math.round(c.left), tLeft: Math.round(t.left),
    inRow3: !!wrap && wrap.classList.contains('w-row') && wrap.classList.contains('w-row-3'),
    cTop2: Math.round(c.top), orderTop: Math.round(document.getElementById('add-order').getBoundingClientRect().top),
    orderHint: !!orderLabel.querySelector('.w-hint'),
    orderText: (orderLabel.textContent || '').trim(),
  };
});
/* 第 100 轮改判：三字段（排序 / 国别 / 标签）同行，包在 .w-row.w-row-3。 */
ok('B4 排序 / 国别 / 标签三者同行，且包在 .w-row.w-row-3 里',
  f.sameRow && f.inRow3 && Math.abs(f.orderTop - f.cTop2) <= 2,
  `国别 left=${f.cLeft} 标签 left=${f.tLeft} inRow3=${f.inRow3}`);

ok('B5 排序 label 只剩「排序」二字、无说明文字', f.orderText === '排序' && !f.orderHint, `「${f.orderText}」 hint=${f.orderHint}`);

ok('B6 1920 无横向溢出 + 零 JS 异常', r.ov <= 0 && errs.length === 0, `ov=${r.ov} err=${errs.length}`);
await ctx.close();

/* ---------------- C 390 ---------------- */
console.log('== C 390 ==');
const c2 = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
const p2 = await c2.newPage();
const e2 = [];
p2.on('pageerror', (e) => e2.push(String(e)));
await p2.goto(BASE + 'watch.html', { waitUntil: 'load' });
await p2.waitForSelector('#w-grid .poster', { timeout: 20000 });

await p2.click('#w-fab');
await p2.waitForFunction(() => {
  const c = document.getElementById('add-country');
  return c && c.getBoundingClientRect().width > 0;
}, null, { timeout: 5000 });
const m = await p2.evaluate(() => {
  const c = document.getElementById('add-country').getBoundingClientRect();
  const t = document.getElementById('add-tags').getBoundingClientRect();
  return { cTop: Math.round(c.top), tTop: Math.round(t.top), stacked: t.top > c.top + 10 };
});
ok('C1 390 国别/标签回单列（w-row-3 在 ≤480 折叠成 1fr，标签跑到国别下面）',
  m.stacked, `国别 top=${m.cTop} 标签 top=${m.tTop}`);

await p2.click('#w-add-close');   /* 关掉弹窗，否则遮住后面的头像 */
await p2.waitForTimeout(200);
await p2.click('#w-avatar');
await p2.waitForSelector('#w-tl .tl-item', { timeout: 20000 });
await p2.click('#w-stats-btn');
await p2.waitForTimeout(800);
const m2 = await p2.evaluate(() => ({
  topCount: document.querySelectorAll('.st-top-item').length,
  ov: document.documentElement.scrollWidth - document.documentElement.clientWidth
}));
ok('C2 390 年度影视 9 条仍在、无横向溢出 + 零 JS 异常',
  m2.topCount === 9 && m2.ov <= 0 && e2.length === 0, `top=${m2.topCount} ov=${m2.ov} err=${e2.length}`);
await c2.close();

await browser.close();
console.log('');
console.log(`第 99 轮：${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
