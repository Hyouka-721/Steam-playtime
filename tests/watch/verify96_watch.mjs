/* 第 96 轮 watch 侧回归：补齐国别 + 年报宽屏铺满 + 首屏「年报」按钮闪烁
 *
 * 三件事：
 *   ① 数据 —— 124 条全部补上 countries（用户逐条确认过的出品国；合拍片列全部出品国），
 *      并重新生成 data/watch/*.json 分片与 manifest。国别面板因此从空态变成真数据。
 *   ② 版式 —— `.w-stats` 原来 `max-width: 1180px; margin: 0 auto`，海报网格是满宽的，
 *      年报却缩在中间一列。现在去掉限宽，跟 .w-main 同宽铺满。
 *   ③ 首屏 —— 网格态刷新时 `#w-stats-btn` 在 `paint()` 之前是可见的（HTML 没有 hidden，
 *      JS 要等 watch.json 回来才设），所以「观看时间」左边会闪一下「年报」再消失。
 *      修法：HTML 上直接给 `hidden`，JS 首次 paint 再按 `statsOn || timeline` 决定。
 *
 * ⚠️ 首屏那条必须用「延迟数据请求」来测：不延迟的话 paint 早跑完了，永远测不到那段窗口。
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
const N = data.items.length;

/* 与面板同一口径的期望值 */
const CNT = {};
data.items.forEach((it) => (it.countries || []).forEach((c) => { CNT[c] = (CNT[c] || 0) + 1; }));
const RANK = Object.keys(CNT).sort((a, b) => CNT[b] - CNT[a] || a.localeCompare(b));
const TOP = RANK[0];
const TOPN = CNT[TOP];
/* 第 97 轮：国别面板口径改成「≥10 部逐项 + 其余合并成『其他』」，
   行数不再等于 min(8, 国别数)；没有国别够 10 部时退回前 8 名（verify97 A15/C4 守着那条）。 */
const CMAJOR96 = RANK.filter((c) => CNT[c] >= 10).slice(0, 8);
const CMINOR96 = RANK.filter((c) => !CMAJOR96.includes(c)).reduce((s, c) => s + CNT[c], 0);
const ROWS_EXPECT = CMINOR96 ? CMAJOR96.length + 1 : Math.min(8, RANK.length);
const NO_COUNTRY = data.items.filter((it) => !(Array.isArray(it.countries) && it.countries.length)).length;
const YEARS = new Set(data.items.map((x) => String(x.watched_at || '').slice(0, 4))).size;

/* 归一化表：键 → 规范名。数据的每个值都必须是**不动点**
   （即 normCountry(值) === 值），否则说明落库的是别名而不是规范名。 */
const ALIAS = {};
const aliasBlock = (/var COUNTRY_ALIAS = \{([\s\S]*?)\};/.exec(js) || [, ''])[1];
[...aliasBlock.matchAll(/'([^']+)':\s*'([^']+)'/g)].forEach((m) => { ALIAS[m[1]] = m[2]; });
const isCanon = (c) => (ALIAS[String(c).toLowerCase()] || c) === c;

let pass = 0, fail = 0;
const ok = (n, c, extra = '') => {
  c ? (pass++, console.log(`PASS ${n}${extra ? '  — ' + extra : ''}`))
    : (fail++, console.log(`FAIL ${n}  — ${extra}`));
};

/* ---------------- A 静态契约 ---------------- */
console.log('== A 静态契约 ==');
ok('A1 版本号：watch.html 引用 watch.css?v=37 / watch.js?v=29（CSS 改限宽、JS 改国别规范名，两个都要 bump）',
  /watch\.css\?v=37/.test(html) && /watch\.js\?v=29/.test(html),
  (html.match(/watch\.(css|js)\?v=\d+/g) || []).join(' '));

const statsBlock = (/(^|\n)\.w-stats \{[^}]*\}/.exec(css) || [''])[0];
ok('A2 `.w-stats` 已去掉 max-width（宽屏下不再缩成 1180px 居中一列）',
  statsBlock.length > 0 && !/max-width/.test(statsBlock) && /width:\s*100%/.test(statsBlock),
  statsBlock.replace(/\s+/g, ' ').slice(0, 90));

ok('A3 HTML 里 `#w-stats-btn` 初始就带 hidden（首屏不闪的根因修复），aria 契约不变',
  /id="w-stats-btn"[^>]*\shidden[\s>]/.test(html) &&
  /aria-pressed="false"/.test(html) && /aria-controls="w-stats"/.test(html));

const badCanon = [];
data.items.forEach((it) => (it.countries || []).forEach((c) => { if (!isCanon(c)) badCanon.push(it.title + ':' + c); }));
ok('A4 数据：' + N + ' 条全部有非空 countries，且每个值都是归一化不动点（落库的是规范名不是别名）',
  N === 124 && NO_COUNTRY === 0 &&
  data.items.every((it) => Array.isArray(it.countries) && it.countries.length > 0) &&
  badCanon.length === 0,
  `待补 ${NO_COUNTRY} 条 / 国别 ${RANK.length} 种 / 非规范 ${badCanon.length} 处` +
  (badCanon.length ? '：' + badCanon.slice(0, 4).join(', ') : ''));

const shardMissing = [];
for (const c of RANK) {
  if (!/[\u4e00-\u9fa5]/.test(c)) shardMissing.push('国名非中文：' + c);
}
ok('A5 国别写法统一：全是白名单里的中文名（港澳仍写 中国香港/中国澳门；台湾已并进「中国」）',
  shardMissing.length === 0 &&
  !RANK.some((c) => /^(香港|澳门|台湾|内地|大陆|中国内地)$/.test(c)),
  RANK.join('/'));

const manifest = JSON.parse(rd('data/watch/manifest.json'));
ok('A6 分片与主文件对账通过（manifest 的 total / updated_at 跟主文件一致，国别已进分片）',
  manifest.total === N && manifest.updated_at === data.updated_at,
  `total=${manifest.total} / ${manifest.updated_at}`);

/* 《少年派》(2019) 是剧集不是电影，原来 kind 标成 movie —— 本轮一并修正。
   kind 只有三个合法值，改错会让类型面板多出一行或让筛选档位对不上。 */
const KIND_CNT = {};
data.items.forEach((it) => { KIND_CNT[it.kind] = (KIND_CNT[it.kind] || 0) + 1; });
const young = data.items.find((it) => it.title === '少年派') || {};
ok('A7 kind 只有 movie / series / anime 三值；《少年派》已从 movie 改成 series',
  data.items.every((it) => ['movie', 'series', 'anime'].includes(it.kind)) &&
  young.kind === 'series' && Object.keys(KIND_CNT).length === 3,
  `少年派=${young.kind} / 分布 ${JSON.stringify(KIND_CNT)}`);

/* ---------------- B 1920 宽屏：铺满 + 国别 ---------------- */
console.log('== B 1920 宽屏 ==');
const browser = await chromium.launch();
{
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1200 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(BASE + 'watch.html', { waitUntil: 'load' });
  await page.waitForSelector('#w-grid .poster', { timeout: 15000 });
  await page.click('#w-avatar');
  await page.waitForSelector('#w-tl .tl-item', { timeout: 15000 });
  await page.click('#w-stats-btn');
  await page.waitForTimeout(700);

  const r = await page.evaluate(() => {
    const q = (s) => document.querySelectorAll(s).length;
    const sec = document.querySelector('[data-panel="country"]');
    const st = document.querySelector('.w-stats');
    const main = document.querySelector('.w-main');
    const mcs = getComputedStyle(main);
    return {
      stW: Math.round(st.getBoundingClientRect().width),
      mainW: Math.round(main.clientWidth - parseFloat(mcs.paddingLeft) - parseFloat(mcs.paddingRight)),
      stLeft: Math.round(st.getBoundingClientRect().left),
      mainLeft: Math.round(main.getBoundingClientRect().left),
      cards: q('.st-card'),
      cRows: sec ? [...sec.querySelectorAll('.st-row')].map((x) => ({
        k: x.querySelector('.st-row-k').textContent.trim(),
        v: x.querySelector('.st-row-v').textContent.trim()
      })) : [],
      cHint: sec && sec.querySelector('.st-hint') ? sec.querySelector('.st-hint').textContent.trim() : '',
      cEmpty: sec && sec.querySelector('.st-empty') ? 1 : 0,
      barsMonth: q('[data-panel="months"] .st-bar'), barsYear: q('[data-panel="years"] .st-bar'),
      rowsKind: q('[data-panel="kinds"] .st-row'), rowsBucket: q('[data-panel="buckets"] .st-row'),
      top: q('.st-top-item'),
      topList: (() => {
        const l = document.querySelector('.st-top-list');
        const items = [...document.querySelectorAll('.st-top-item')];
        return {
          cols: getComputedStyle(l).gridTemplateColumns.split(' ').length,
          sameRow: items.length > 1 ? Math.abs(items[1].getBoundingClientRect().top - items[0].getBoundingClientRect().top) <= 2 : false,
          thirdRowGap: items.length > 2 ? Math.round(items[2].getBoundingClientRect().top - items[0].getBoundingClientRect().top) : -1,
          zebra: items[0] ? getComputedStyle(items[0]).backgroundColor : '',
          itemW: items[0] ? Math.round(items[0].getBoundingClientRect().width) : -1
        };
      })(),
      ov: document.documentElement.scrollWidth - document.documentElement.clientWidth
    };
  });

  ok('B1 1920 下年报铺满内容区：`.w-stats` 宽度 = `.w-main` 可用宽（1862），不再是 1180 居中',
    Math.abs(r.stW - r.mainW) <= 1 && r.stW > 1500,
    `年报 ${r.stW} / 可用 ${r.mainW}`);

  ok('B2 年报与海报网格同一条左轨（去掉 margin:auto 后左边对齐）',
    Math.abs((r.stLeft - r.mainLeft) - 28) <= 1,
    `年报 left ${r.stLeft} / main left ${r.mainLeft}`);

  const top1 = r.cRows[0] || {};
  ok('B3 国别面板出真数据：' + ROWS_EXPECT + ' 行、首行 ' + TOP + '=' + TOPN + '、无待补、无空态',
    r.cRows.length === ROWS_EXPECT && top1.k === TOP && top1.v === String(TOPN) &&
    r.cHint === (NO_COUNTRY ? NO_COUNTRY + ' 部待补' : '') && r.cEmpty === 0,
    r.cRows.map((x) => x.k + '=' + x.v).join('/') + ` | 提示「${r.cHint}」`);

  ok('B4 其余面板没被本轮改动带坏：6 卡 / 12 月柱 / 逐年 ' + YEARS + ' 柱 / 类型 3 行 / 区间 5 行 / 年度影视 9 条',
    r.cards === 6 && r.barsMonth === 12 && r.barsYear === YEARS &&
    r.rowsKind === 3 && r.rowsBucket === 5 && r.top === 9,
    `卡${r.cards} 月${r.barsMonth} 年${r.barsYear} 类${r.rowsKind} 区间${r.rowsBucket} top${r.top}`);

  ok('B5 1920 无横向溢出 + 零 JS 异常', r.ov <= 0 && errs.length === 0, `ov=${r.ov} err=${errs.length}`);

  ok('B6 铺满连带的年度影视收窄：≥1180 排成两列（9 条 → 5 行，1·2 同行、第 3 条换行、单条宽 ≤ 一半）',
    r.topList.cols === 2 && r.topList.sameRow && r.topList.thirdRowGap > 10 &&
    r.topList.itemW <= Math.round(r.stW / 2),
    `列${r.topList.cols} 同行=${r.topList.sameRow} 第三条下移${r.topList.thirdRowGap}px 单条${r.topList.itemW} / 年报${r.stW}`);
  await ctx.close();
}

/* ---------------- C 首屏闪烁：延迟数据请求，盯住 paint 之前的窗口 ---------------- */
console.log('== C 首屏「年报」按钮不闪 ==');
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  // manifest 404 → 走整份主文件；再把主文件延迟 1.5s → 首屏有 1.5s 的「JS 还没 paint」窗口
  await page.route('**/data/watch/manifest.json*', (r) => r.fulfill({ status: 404, body: '' }));
  await page.route('**/data/watch.json*', async (r) => {
    await new Promise((res) => setTimeout(res, 1500));
    return r.continue();
  });
  await page.goto(BASE + 'watch.html', { waitUntil: 'domcontentloaded' });

  const vis = (el) => !!el && !el.hidden && getComputedStyle(el).display !== 'none';
  const early = await page.evaluate(() => {
    const b = document.getElementById('w-stats-btn');
    return {
      posters: document.querySelectorAll('#w-grid .poster').length,
      exists: !!b,
      hidden: b ? b.hidden : null,
      display: b ? getComputedStyle(b).display : '',
      shown: !!b && !b.hidden && getComputedStyle(b).display !== 'none'
    };
  });
  ok('C1 首屏（数据还没回来、海报 0 张）「年报」按钮就已经不可见 —— 这正是用户看到的闪烁',
    early.posters === 0 && early.exists && early.hidden === true && early.display === 'none',
    `海报 ${early.posters} 张 / hidden=${early.hidden} / display=${early.display}`);

  await page.waitForSelector('#w-grid .poster', { timeout: 20000 });
  await page.waitForTimeout(400);
  const afterGrid = await page.evaluate(() => {
    const b = document.getElementById('w-stats-btn');
    return { shown: !!b && !b.hidden && getComputedStyle(b).display !== 'none', count: document.querySelectorAll('#w-grid .poster').length };
  });
  ok('C2 数据回来、网格渲染完（' + afterGrid.count + ' 张）后依然不显示年报按钮',
    afterGrid.count > 20 && afterGrid.shown === false, `shown=${afterGrid.shown}`);

  await page.click('#w-avatar');
  await page.waitForSelector('#w-tl .tl-item', { timeout: 15000 });
  await page.waitForTimeout(300);
  const inTl = await page.evaluate(() => {
    const b = document.getElementById('w-stats-btn');
    return { hidden: b.hidden, shown: !b.hidden && getComputedStyle(b).display !== 'none' };
  });
  ok('C3 切到时间轴后年报按钮正常出现（初始 hidden 没把功能压死）',
    inTl.shown === true && inTl.hidden === false, `hidden=${inTl.hidden}`);

  await page.click('#w-stats-btn');
  await page.waitForTimeout(500);
  const inStats = await page.evaluate(() => !!document.querySelector('.w-stats') && !document.querySelector('.w-stats').hidden);
  ok('C4 年报仍能正常打开 + 该页零 JS 异常', inStats && errs.length === 0, `打开=${inStats} err=${errs.length}`);
  await ctx.close();
}

/* ---------------- D 390 窄屏 ---------------- */
console.log('== D 390 窄屏 ==');
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
  const mp = await ctx.newPage();
  const merrs = [];
  mp.on('pageerror', (e) => merrs.push(String(e)));
  await mp.goto(BASE + 'watch.html', { waitUntil: 'load' });
  await mp.waitForSelector('#w-grid .poster', { timeout: 15000 });
  await mp.click('#w-avatar');
  await mp.waitForSelector('#w-tl .tl-item', { timeout: 15000 });
  await mp.click('#w-stats-btn');
  await mp.waitForTimeout(700);
  const m = await mp.evaluate(() => {
    const cols = (s) => getComputedStyle(document.querySelector(s)).gridTemplateColumns.split(' ').length;
    const sec = document.querySelector('[data-panel="country"]');
    return {
      cardCols: cols('.st-cards'), panelCols: cols('.st-panels'),
      countryW: sec ? Math.round(sec.getBoundingClientRect().width) : -1,
      stW: Math.round(document.querySelector('.w-stats').getBoundingClientRect().width),
      vw: window.innerWidth,
      ov: document.documentElement.scrollWidth - window.innerWidth
    };
  });
  ok('D1 390：6 卡 2 列、面板单列、年报不越界、无横向溢出',
    m.cardCols === 2 && m.panelCols === 1 && m.countryW > 0 && m.countryW <= m.vw &&
    m.stW <= m.vw && m.ov <= 0,
    `卡${m.cardCols} 面板${m.panelCols} 年报${m.stW} country${m.countryW} ov=${m.ov}`);
  ok('D2 390 零 JS 异常', merrs.length === 0, merrs.slice(0, 3).join(' | '));
  await ctx.close();
}

await browser.close();
console.log(`\n===== 第 96 轮 watch（国别补齐 + 宽屏铺满 + 首屏不闪）：${pass} PASS / ${fail} FAIL =====`);
process.exit(fail ? 1 : 0);
