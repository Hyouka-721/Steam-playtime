/* 第 99 轮 watch 侧上线复验：三卡成行 · 年度影视 · 表单微调
 *
 * ⚠️ **本轮尚未上线时不要跑**：线上此刻还是第 98 轮（v=36/v=28，跨度 6+6/4+8/6+6）。
 *    等「上线」→ push → Pages 指纹轮询（等 watch.css?v=37）命中后再执行本脚本。
 *
 * 复验口径：
 *   ① 指纹 —— watch.css?v=37 / watch.js?v=29、css/js 字节 md5 与本地全等、
 *      线上 JS 有 YEAR_PICKS 九条（2018~2026 倒序）、面板标题「年度影视」无「高分 Top 5」、
 *      线上 HTML 的排序 label 干净 + 国别/标签包同一个 .w-row.w-row-2
 *   ② 1920 —— 年度影视 9 条逐条年份+片名+海报+评分、三卡一行（月度/评分区间/类型、逐年/国别/标签）、
 *      表单里国别与标签同行且排序 label 只剩「排序」、零溢出零异常
 *   ③ 390 —— 国别/标签回单列、年度影视 9 条仍在、零溢出零异常
 *
 * ⚠️ 线上字节一律在页内 fetch 回传（Node 直连 github.io 不通），统一 --no-proxy-server。
 * ⚠️ 全程只读：不点提交、不录数据，不会产生任何 PUT。
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

const browser = await chromium.launch({ args: ['--no-proxy-server'] });

/* ---------- ① 指纹 ---------- */
console.log('== ① 内容指纹 ==');
const ctx0 = await browser.newContext({ viewport: { width: 1920, height: 1200 }, serviceWorkers: 'block' });
const p0 = await ctx0.newPage();
await p0.goto(SITE + 'watch.html?t=' + TS, { waitUntil: 'load' });
await p0.waitForFunction(() => document.querySelectorAll('#w-grid .poster').length > 20, null, { timeout: 30000 }).catch(() => {});
await p0.waitForTimeout(800);

const html = await p0.evaluate(async (u) => (await fetch(u, { cache: 'reload' })).text(), SITE + 'watch.html?t=' + TS);
ok('A1 线上 watch.html 引用 watch.css?v=37 / watch.js?v=29',
  /watch\.css\?v=37/.test(html) && /watch\.js\?v=29/.test(html),
  (html.match(/watch\.(css|js)\?v=\d+/g) || []).join(' '));

const liveCss = await p0.evaluate(async (u) => (await fetch(u, { cache: 'reload' })).text(), SITE + 'watch.css?v=37&t=' + TS);
const liveJs = await p0.evaluate(async (u) => (await fetch(u, { cache: 'reload' })).text(), SITE + 'watch.js?v=29&t=' + TS);
ok('A2 线上 watch.css 字节 md5 与本地全等', md5txt(liveCss) === md5txt(localCss),
  `${md5txt(liveCss).slice(0, 12)} / ${md5txt(localCss).slice(0, 12)}`);
ok('A3 线上 watch.js 字节 md5 与本地全等', md5txt(liveJs) === md5txt(localJs),
  `${md5txt(liveJs).slice(0, 12)} / ${md5txt(localJs).slice(0, 12)}`);

const liveJsNC = stripCmt(liveJs);

ok('A4 线上 JS 有 YEAR_PICKS 九条、2018~2026 倒序、片名逐条正确',
  /var YEAR_PICKS = \[/.test(liveJsNC) &&
  PICKS.every(([, t]) => liveJsNC.includes("'" + t + "'")) &&
  PICKS.every(([, t], i) => i === 0 || liveJsNC.indexOf("'" + t + "'") > liveJsNC.indexOf("'" + PICKS[i - 1][1] + "'")),
  PICKS.map(([y, t]) => y + '·' + t).join(' '));

ok('A5 线上 JS 面板标题「年度影视」、无「高分 Top 5」',
  /<h3>年度影视<\/h3>/.test(liveJsNC) && !/高分 Top 5/.test(liveJsNC));

const ciL = html.indexOf('id="add-country"');
const tiL = html.indexOf('id="add-tags"');
const rowOpen = html.lastIndexOf('<div class="w-row w-row-2">', ciL);
ok('A6 线上 HTML：排序 label 只剩「排序」、国别/标签包同一个 .w-row.w-row-2',
  /for="add-order">排序<\/label>/.test(html) && !/for="add-order">排序<span/.test(html) &&
  rowOpen > 0 && ciL > rowOpen && tiL > ciL && (html.slice(rowOpen, tiL + 20).match(/<\/div>/g) || []).length === 1,
  'rowOpen@' + rowOpen + ' / country@' + ciL + ' / tags@' + tiL);
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
    items,
    months: box('months'), buckets: box('buckets'), kinds: box('kinds'),
    years: box('years'), country: box('country'), tags: box('tags'),
    ov: document.documentElement.scrollWidth - document.documentElement.clientWidth
  };
});

ok('B1 年度影视标题正确', r.topTitle === '年度影视', r.topTitle);

ok('B2 年度影视 9 条，年份 + 片名逐条正确，且每条有海报与评分',
  r.items.length === 9 &&
  PICKS.every(([y, t], i) => r.items[i] && r.items[i].year === y && r.items[i].name === t) &&
  r.items.every((it) => it.hasImg && /^\d+(\.\d+)?$/.test(it.score)),
  r.items.map((it) => it.year + '·' + it.name + '·' + it.score).join(' / '));

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
    inRow2: !!wrap && wrap.classList.contains('w-row') && wrap.classList.contains('w-row-2'),
    orderHint: !!orderLabel.querySelector('.w-hint'),
    orderText: (orderLabel.textContent || '').trim(),
  };
});
ok('B4 国别与标签同行（同一行、左到右相邻），且包在 .w-row.w-row-2 里',
  f.sameRow && f.inRow2, `国别 left=${f.cLeft} 标签 left=${f.tLeft} inRow2=${f.inRow2}`);

ok('B5 排序 label 只剩「排序」二字、无说明文字', f.orderText === '排序' && !f.orderHint, `「${f.orderText}」 hint=${f.orderHint}`);

ok('B6 1920 无横向溢出 + 零 JS 异常', r.ov <= 0 && errs.length === 0, `ov=${r.ov} err=${errs.length}`);
await ctx.close();

/* ---------- ③ 390 ---------- */
console.log('== ③ 390 ==');
const c3 = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
const p3 = await c3.newPage();
const e3 = [];
p3.on('pageerror', (e) => e3.push(String(e)));
await p3.goto(SITE + 'watch.html?t=' + TS, { waitUntil: 'load' });
await p3.waitForSelector('#w-grid .poster', { timeout: 30000 });

await p3.click('#w-fab');
await p3.waitForFunction(() => {
  const c = document.getElementById('add-country');
  return c && c.getBoundingClientRect().width > 0;
}, null, { timeout: 5000 });
const m = await p3.evaluate(() => {
  const c = document.getElementById('add-country').getBoundingClientRect();
  const t = document.getElementById('add-tags').getBoundingClientRect();
  return { cTop: Math.round(c.top), tTop: Math.round(t.top), stacked: t.top > c.top + 10 };
});
ok('C1 390 国别/标签回单列（w-row-2 在 ≤480 折叠成 1fr，标签跑到国别下面）',
  m.stacked, `国别 top=${m.cTop} 标签 top=${m.tTop}`);

await p3.click('#w-add-close');   /* 关掉弹窗，否则遮住后面的头像 */
await p3.waitForTimeout(200);
await p3.click('#w-avatar');
await p3.waitForSelector('#w-tl .tl-item', { timeout: 30000 });
await p3.click('#w-stats-btn');
await p3.waitForTimeout(900);
const m2 = await p3.evaluate(() => ({
  topCount: document.querySelectorAll('.st-top-item').length,
  ov: document.documentElement.scrollWidth - document.documentElement.clientWidth
}));
ok('C2 390 年度影视 9 条仍在、无横向溢出 + 零 JS 异常',
  m2.topCount === 9 && m2.ov <= 0 && e3.length === 0, `top=${m2.topCount} ov=${m2.ov} err=${e3.length}`);
await c3.close();

await browser.close();
console.log('');
console.log(`第 99 轮上线复验：${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
