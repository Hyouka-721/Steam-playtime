/* 第 95 轮 watch 侧上线复验：国别字段 + 国别面板
 *
 * ⚠️ **本轮尚未上线时不要跑**：线上此刻仍是第 93 轮（v=30 / v=20，没有国别面板）。
 *    等用户说「上线」→ push → Pages 指纹轮询命中后再执行本脚本。
 *
 * 复验口径：
 *   ① 指纹：watch.html 引用 watch.css?v=34 / watch.js?v=23；css/js 字节 md5 与本地全等；
 *      线上 JS 里确实有 COUNTRY_ALIAS / normCountry / data-panel="country"（版本号只说明引用变了）
 *   ② 1440：面板顺序多了 country、国别面板占 4 栏且与类型面板同行、
 *      国别面板内容与「线上真实数据」逐字对齐（还没录国别 = 空态 + N 部待补；录了 = 行数/首位对得上）、
 *      六卡与本地推导全等、柱/行数齐备、无溢出零异常
 *   ③ 390：面板单列、国别面板不越界、无溢出零异常
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

/* 与报表同一口径的本地期望值（六卡那几条，防第 94 轮指标被本轮改坏） */
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
ok('A1 线上 watch.html 引用 watch.css?v=34 / watch.js?v=23',
  /watch\.css\?v=34/.test(html) && /watch\.js\?v=23/.test(html),
  (html.match(/watch\.(css|js)\?v=\d+/g) || []).join(' '));

const liveCss = await page.evaluate(async (u) => (await fetch(u, { cache: 'reload' })).text(), SITE + 'watch.css?v=34&t=' + TS);
const liveJs = await page.evaluate(async (u) => (await fetch(u, { cache: 'reload' })).text(), SITE + 'watch.js?v=23&t=' + TS);
ok('A2 线上 watch.css 字节 md5 与本地全等', md5txt(liveCss) === md5txt(localCss),
  `${md5txt(liveCss).slice(0, 12)} / ${md5txt(localCss).slice(0, 12)}`);
ok('A3 线上 watch.js 字节 md5 与本地全等', md5txt(liveJs) === md5txt(localJs),
  `${md5txt(liveJs).slice(0, 12)} / ${md5txt(localJs).slice(0, 12)}`);

const liveJsNoCmt = stripCmt(liveJs);
ok('A4 线上 JS 里确有本轮改动：COUNTRY_ALIAS / normCountry / readCountryField / 国别面板都在',
  /var COUNTRY_ALIAS = \{/.test(liveJsNoCmt) && /function normCountry\(/.test(liveJsNoCmt) &&
  /function readCountryField\(/.test(liveJsNoCmt) && /data-panel="country"/.test(liveJsNoCmt) &&
  /国别构成/.test(liveJsNoCmt));
ok('A5 线上 watch.html 里有国别输入框（表单字段在 HTML 里，不在 JS 里）',
  /id="add-country"/.test(html) && /for="add-country"/.test(html));

/* 线上数据（CI 每晚可能推新快照，所以国别期望值按线上实际算，不写死本地 N） */
const liveData = await page.evaluate(async (u) => (await fetch(u, { cache: 'reload' })).text(), SITE + 'data/watch.json?t=' + TS);
let liveItems = [];
try { liveItems = JSON.parse(liveData).items || []; } catch (e) { /* 保底空 */ }
const liveNoCountry = liveItems.filter((it) => !(Array.isArray(it.countries) && it.countries.length)).length;
const liveHasCountry = liveItems.length - liveNoCountry;

/* ---------- ② 1440 运行时 ---------- */
console.log('== ② 1440 运行时 ==');
await page.click('#w-avatar');
await page.waitForFunction(() => !document.getElementById('w-tl').hidden, null, { timeout: 15000 });
await page.click('#w-stats-btn');
await page.waitForTimeout(700);

const r = await page.evaluate(() => {
  const q = (s) => document.querySelectorAll(s).length;
  const box = (s) => {
    const el = document.querySelector(s);
    if (!el) return { w: -1, t: -1 };
    const b = el.getBoundingClientRect();
    return { w: Math.round(b.width), t: Math.round(b.top) };
  };
  const sec = document.querySelector('[data-panel="country"]');
  return {
    cards: [...document.querySelectorAll('.st-card')].map((c) => ({
      k: c.querySelector('.st-k').textContent.trim(),
      v: c.querySelector('.st-v').textContent.trim()
    })),
    panels: [...document.querySelectorAll('.st-panel')].map((p) => p.dataset.panel),
    barsMonth: q('[data-panel="months"] .st-bar'), barsYear: q('[data-panel="years"] .st-bar'),
    rowsKind: q('[data-panel="kinds"] .st-row'), rowsBucket: q('[data-panel="buckets"] .st-row'),
    chips: q('.st-chip'), top: q('.st-top-item'),
    cRows: sec ? [...sec.querySelectorAll('.st-row')].map((x) => ({
      k: x.querySelector('.st-row-k').textContent.trim(),
      v: x.querySelector('.st-row-v').textContent.trim()
    })) : [],
    cHint: sec && sec.querySelector('.st-hint') ? sec.querySelector('.st-hint').textContent.trim() : '',
    cEmpty: sec && sec.querySelector('.st-empty') ? sec.querySelector('.st-empty').textContent.trim() : '',
    cNote: sec && sec.querySelector('.st-note') ? sec.querySelector('.st-note').textContent.trim() : '',
    boxCountry: box('[data-panel="country"]'), boxKinds: box('[data-panel="kinds"]'),
    boxBuckets: box('[data-panel="buckets"]'), boxPanels: box('.st-panels'),
    ov: document.documentElement.scrollWidth - document.documentElement.clientWidth
  };
});

const card = (k) => (r.cards.find((c) => c.k === k) || {}).v;

ok('B1 面板顺序 月度 / 类型 / 逐年 / 标签 / 评分区间 / 国别 / Top5',
  r.panels.join('/') === 'months/kinds/years/tags/buckets/country/top', r.panels.join('/'));

ok('B2 国别面板占 4 栏、与评分区间同行（第三行 8+4），类型/标签仍是 4 栏',
  Math.abs(r.boxCountry.w / r.boxPanels.w - 4 / 12) < 0.03 &&
  Math.abs(r.boxKinds.w / r.boxPanels.w - 4 / 12) < 0.03 &&
  Math.abs(r.boxBuckets.w / r.boxPanels.w - 8 / 12) < 0.03 &&
  r.boxCountry.t === r.boxBuckets.t,
  `容器 ${r.boxPanels.w} / 国别 ${r.boxCountry.w}@${r.boxCountry.t} / 类型 ${r.boxKinds.w}@${r.boxKinds.t} / 区间 ${r.boxBuckets.w}@${r.boxBuckets.t}`);

ok('B3 国别面板与线上数据对齐：' + (liveHasCountry ? `${liveHasCountry} 条有国别` : `全靠空态 + ${liveNoCountry} 部待补`),
  liveHasCountry
    ? (r.cRows.length > 0 && r.cRows.length <= 8 && /按国别累计/.test(r.cNote) &&
       r.cHint === (liveNoCountry ? liveNoCountry + ' 部待补' : ''))
    : (r.cRows.length === 0 && r.cEmpty.length > 0 && /国别/.test(r.cEmpty) &&
       r.cHint === liveNoCountry + ' 部待补'),
  `行 ${r.cRows.length} / 提示「${r.cHint}」/ 空态 ${r.cEmpty ? '有' : '无'} / 脚注 ${r.cNote ? '有' : '无'}`);

ok('B4 六卡没被本轮改坏：键名顺序与数字都对',
  r.cards.length === 6 &&
  r.cards.map((c) => c.k).join('/') === '记录总数/有评分/平均评分/评分中位数/≥8 分占比/观影天数' &&
  card('记录总数') === String(N) && card('有评分') === String(RATED.length) &&
  card('平均评分') === AVG && card('评分中位数') === MEDIAN && card('≥8 分占比') === HIGHPCT,
  `${card('平均评分')}/${card('评分中位数')}/${card('≥8 分占比')} vs ${AVG}/${MEDIAN}/${HIGHPCT}`);

ok('B5 其余面板内容齐备：12 月柱 / 逐年柱=' + YEARS + ' / 类型 3 行 / 区间 5 行 / 标签 / Top5',
  r.barsMonth === 12 && r.barsYear === YEARS && r.rowsKind === 3 && r.rowsBucket === 5 &&
  r.chips > 0 && r.chips <= 8 && r.top === 5,
  `月=${r.barsMonth} 年=${r.barsYear} 类型=${r.rowsKind} 区间=${r.rowsBucket} chips=${r.chips}`);

ok('B6 1440 无横向溢出 + 零 JS 异常', r.ov <= 0 && errs.length === 0, `ov=${r.ov} err=${errs.length}`);
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
  const sec = document.querySelector('[data-panel="country"]');
  return {
    cardCols: cols('.st-cards'), panelCols: cols('.st-panels'),
    countryW: sec ? Math.round(sec.getBoundingClientRect().width) : -1,
    vw: window.innerWidth,
    ov: document.documentElement.scrollWidth - window.innerWidth
  };
});
ok('C1 390：6 卡 2 列、面板单列、国别面板不越界、无横向溢出',
  m.cardCols === 2 && m.panelCols === 1 && m.countryW > 0 && m.countryW <= m.vw && m.ov <= 0,
  `卡片 ${m.cardCols} 列 / 面板 ${m.panelCols} 列 / country ${m.countryW} / ov=${m.ov}`);
ok('C2 390 零 JS 异常', merrs.length === 0, merrs.slice(0, 3).join(' | '));

await browser.close();
console.log(`\n===== 第 95 轮 watch 线上复验（国别字段 + 国别面板）：${pass} PASS / ${fail} FAIL =====`);
process.exit(fail ? 1 : 0);
