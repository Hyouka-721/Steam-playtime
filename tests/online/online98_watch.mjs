/* 第 98 轮 watch 侧上线复验：国别并进「中国」 · 两块饼换位
 *
 * ⚠️ **本轮尚未上线时不要跑**：线上此刻还是第 96 轮（v=34/v=23，面板顺序是旧的）。
 *    等「上线」→ push → Pages 指纹轮询（等 watch.css?v=36）命中后再执行本脚本。
 *
 * 复验口径：
 *   ① 指纹 —— watch.css?v=36 / watch.js?v=28、css/js 字节 md5 与本地全等、
 *      线上 JS 的别名表已把「中国大陆 / 台湾」收敛到「中国」、线上 CSS 的跨度是 6/6/4/8/6/6、
 *      线上 HTML 没有残留的「中国台湾」
 *   ② 1920 —— 面板顺序 月度/评分区间/类型/逐年/国别/标签、三行各自同行、
 *      国别面板里有「中国」且数值与线上数据现算一致、零溢出
 *   ③ 390 —— 回到单列、顺序不变
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

const ORDER = 'months/buckets/kinds/years/country/tags/top';
const browser = await chromium.launch({ args: ['--no-proxy-server'] });

/* ---------- ① 指纹 ---------- */
console.log('== ① 内容指纹 ==');
const ctx0 = await browser.newContext({ viewport: { width: 1920, height: 1200 }, serviceWorkers: 'block' });
const p0 = await ctx0.newPage();
await p0.goto(SITE + 'watch.html?t=' + TS, { waitUntil: 'load' });
await p0.waitForFunction(() => document.querySelectorAll('#w-grid .poster').length > 20, null, { timeout: 30000 }).catch(() => {});
await p0.waitForTimeout(800);

const html = await p0.evaluate(async (u) => (await fetch(u, { cache: 'reload' })).text(), SITE + 'watch.html?t=' + TS);
ok('A1 线上 watch.html 引用 watch.css?v=36 / watch.js?v=28',
  /watch\.css\?v=36/.test(html) && /watch\.js\?v=28/.test(html),
  (html.match(/watch\.(css|js)\?v=\d+/g) || []).join(' '));

const liveCss = await p0.evaluate(async (u) => (await fetch(u, { cache: 'reload' })).text(), SITE + 'watch.css?v=36&t=' + TS);
const liveJs = await p0.evaluate(async (u) => (await fetch(u, { cache: 'reload' })).text(), SITE + 'watch.js?v=28&t=' + TS);
ok('A2 线上 watch.css 字节 md5 与本地全等', md5txt(liveCss) === md5txt(localCss),
  `${md5txt(liveCss).slice(0, 12)} / ${md5txt(localCss).slice(0, 12)}`);
ok('A3 线上 watch.js 字节 md5 与本地全等', md5txt(liveJs) === md5txt(localJs),
  `${md5txt(liveJs).slice(0, 12)} / ${md5txt(localJs).slice(0, 12)}`);

const liveJsNC = stripCmt(liveJs);
const liveCssNC = stripCmt(liveCss);

ok('A4 线上别名表：中国大陆 / 台湾 都收敛到「中国」，且没有残留自映射',
  /'中国大陆': '中国'/.test(liveJsNC) && /'中国台湾': '中国'/.test(liveJsNC) &&
  /'台湾': '中国'/.test(liveJsNC) && !/'中国大陆': '中国大陆'/.test(liveJsNC),
  (liveJsNC.match(/'中国(大陆|台湾)'\s*:\s*'[^']*'/g) || []).join(' '));

const spanOf = (k) => Number((new RegExp(
  '\\.st-panel\\[data-panel="' + k + '"\\] \\{ grid-column: span (\\d+); \\}').exec(liveCssNC) || [, 0])[1]);
ok('A5 线上 CSS 跨度 6 / 6 / 4 / 8 / 6 / 6（三行各 12 栏）',
  spanOf('months') === 6 && spanOf('buckets') === 6 && spanOf('kinds') === 4 &&
  spanOf('years') === 8 && spanOf('country') === 6 && spanOf('tags') === 6,
  ['months', 'buckets', 'kinds', 'years', 'country', 'tags'].map((k) => k + '=' + spanOf(k)).join(' '));

const posOf = (k) => liveJsNC.indexOf('data-panel="' + k + '"');
const LIVE_POS = ['months', 'buckets', 'kinds', 'years', 'country', 'tags', 'top'].map(posOf);
ok('A6 线上 JS 的面板顺序就是 月度/评分区间/类型/逐年/国别/标签/Top5',
  LIVE_POS.every((p) => p > 0) && LIVE_POS.every((p, i) => i === 0 || p > LIVE_POS[i - 1]),
  LIVE_POS.join(' '));

/* ---------- 线上数据现算 ---------- */
const LIVE = JSON.parse(await p0.evaluate(async (u) => (await fetch(u, { cache: 'reload' })).text(), SITE + 'data/watch.json?t=' + TS));
const CNT = {};
LIVE.items.forEach((it) => (it.countries || []).forEach((c) => { CNT[c] = (CNT[c] || 0) + 1; }));
const RANK = Object.keys(CNT).sort((a, b) => CNT[b] - CNT[a] || a.localeCompare(b));
const CMAJOR = RANK.filter((c) => CNT[c] >= 10).slice(0, 8);
const MINOR = RANK.filter((c) => !CMAJOR.includes(c)).reduce((s, c) => s + CNT[c], 0);
const ROWS_EXPECT = CMAJOR.length ? CMAJOR.length + (MINOR ? 1 : 0) : Math.min(8, RANK.length);
const OLD_LEFT = LIVE.items.filter((it) => (it.countries || []).some((c) => c === '中国大陆' || c === '中国台湾')).length;
const hasChina = Object.prototype.hasOwnProperty.call(CNT, '中国');
await ctx0.close();

ok('A7 线上数据已并进「中国」：' + LIVE.items.length + ' 条里没有「中国大陆 / 中国台湾」残留',
  LIVE.items.length > 0 && OLD_LEFT === 0 && hasChina,
  `残留 ${OLD_LEFT} 条 / 中国 ${CNT['中国'] || 0} 部`);

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
    if (!e) return null;
    const x = e.getBoundingClientRect();
    return { w: Math.round(x.width), t: Math.round(x.top) };
  };
  const names = ['months', 'buckets', 'kinds', 'years', 'country', 'tags'];
  return {
    order: [...document.querySelectorAll('.st-panel')].map((p) => p.dataset.panel),
    panelsW: Math.round(document.querySelector('.st-panels').getBoundingClientRect().width),
    boxes: Object.fromEntries(names.map((k) => [k, box(k)])),
    cKeys: [...document.querySelectorAll('[data-panel="country"] .st-row-k')].map((x) => x.textContent.trim()),
    cVs: [...document.querySelectorAll('[data-panel="country"] .st-row-v')].map((x) => x.textContent.trim()),
    ov: document.documentElement.scrollWidth - document.documentElement.clientWidth
  };
});

ok('B1 面板顺序：' + ORDER, r.order.join('/') === ORDER, r.order.join('/'));

ok('B2 三行排布正确：月度/评分区间、类型/逐年、国别/标签 各自同行且依次下移',
  r.boxes.months.t === r.boxes.buckets.t && r.boxes.kinds.t === r.boxes.years.t &&
  r.boxes.country.t === r.boxes.tags.t &&
  r.boxes.buckets.t < r.boxes.kinds.t && r.boxes.years.t < r.boxes.country.t,
  `${r.boxes.months.t}/${r.boxes.buckets.t} · ${r.boxes.kinds.t}/${r.boxes.years.t} · ${r.boxes.country.t}/${r.boxes.tags.t}`);

ok('B3 跨度落地＝6/6/4/8/6/6（占容器比例 ±3%）',
  [['months', 6], ['buckets', 6], ['kinds', 4], ['years', 8], ['country', 6], ['tags', 6]]
    .every(([k, s]) => Math.abs(r.boxes[k].w / r.panelsW - s / 12) < 0.03),
  ['months', 'buckets', 'kinds', 'years', 'country', 'tags'].map((k) => k + '=' + r.boxes[k].w).join(' ') +
  ` / 容器 ${r.panelsW}`);

ok('B4 国别面板：' + ROWS_EXPECT + ' 行、首行 ' + CMAJOR[0] + '、含「中国」' + (CNT['中国'] || 0),
  r.cKeys.length === ROWS_EXPECT && r.cKeys[0] === CMAJOR[0] &&
  r.cKeys.includes('中国') && r.cVs[r.cKeys.indexOf('中国')] === String(CNT['中国']) &&
  !r.cKeys.some((k) => k === '中国大陆' || k === '中国台湾'),
  r.cKeys.map((k, i) => k + '=' + r.cVs[i]).join('/'));

ok('B5 1920 无横向溢出 + 零 JS 异常', r.ov <= 0 && errs.length === 0, `ov=${r.ov} err=${errs.length}`);
await ctx.close();

/* ---------- ③ 390 ---------- */
console.log('== ③ 390 ==');
const c3 = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
const p3 = await c3.newPage();
const e3 = [];
p3.on('pageerror', (e) => e3.push(String(e)));
await p3.goto(SITE + 'watch.html?t=' + TS, { waitUntil: 'load' });
await p3.waitForSelector('#w-grid .poster', { timeout: 30000 });
await p3.click('#w-avatar');
await p3.waitForSelector('#w-tl .tl-item', { timeout: 30000 });
await p3.click('#w-stats-btn');
await p3.waitForTimeout(900);
const d = await p3.evaluate(() => {
  const names = ['months', 'buckets', 'kinds', 'years', 'country', 'tags'];
  return {
    order: [...document.querySelectorAll('.st-panel')].map((p) => p.dataset.panel),
    bs: names.map((k) => {
      const x = document.querySelector('.st-panel[data-panel="' + k + '"]').getBoundingClientRect();
      return { w: Math.round(x.width), t: Math.round(x.top) };
    }),
    secW: Math.round(document.querySelector('.st-panels').getBoundingClientRect().width),
    ov: document.documentElement.scrollWidth - document.documentElement.clientWidth
  };
});
ok('C1 390 回到单列：每块占满宽且依次下移，顺序不变',
  d.order.join('/') === ORDER && d.bs.every((x) => x.w >= d.secW - 8) &&
  d.bs.every((x, i) => i === 0 || x.t > d.bs[i - 1].t),
  d.bs.map((x, i) => x.w + '@' + x.t).join(' '));
ok('C2 390 无横向溢出 + 零 JS 异常', d.ov <= 0 && e3.length === 0, `ov=${d.ov} err=${e3.length}`);
await c3.close();

await browser.close();
console.log('');
console.log(`第 98 轮上线复验：${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
