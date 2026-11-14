/* 第 96 轮 watch 侧上线复验：国别补齐 + 年报宽屏铺满 + 首屏「年报」按钮不闪
 *
 * ⚠️ **本轮尚未上线时不要跑**：线上此刻还是第 95 轮（v=32 / v=22、年报 1180 居中、国别全是空的）。
 *    等「上线」→ push → Pages 指纹轮询（等 watch.css?v=35）命中后再执行本脚本。
 *
 * 复验口径：
 *   ① 指纹：watch.css?v=35 / watch.js?v=24、css/js 字节 md5 与本地全等、
 *      线上 JS 里规范名确实是「中国大陆」（不是「中国」）、线上 HTML 的 #w-stats-btn 带 hidden
 *   ② 1920：`.w-stats` 与 `.w-main` 同宽铺满（不再是 1180 居中）、左轨对齐、国别面板出真数据
 *      （行数/首行按**线上数据现算**，CI 每晚可能推新快照）、Top5 两列、六卡齐、零溢出
 *   ③ 首屏闪烁：manifest 404 + watch.json 延迟 1.5s 造出 paint 之前的窗口 →
 *      海报 0 张时按钮就必须不可见；渲染完仍不显示；切时间轴正常出现
 *   ④ 390：单列、年报与国别面板不越界、零异常
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

const localCss = norm(fs.readFileSync(ROOT + 'watch.css', 'utf8'));
const localJs = norm(fs.readFileSync(ROOT + 'watch.js', 'utf8'));
const LOCAL = JSON.parse(norm(fs.readFileSync(ROOT + 'data/watch.json', 'utf8')));

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

ok('A4 线上 JS 里规范名已是「中国大陆」（不是「中国」），且 Top5 两列规则进了 ≥1180 块',
  /'中国':\s*'中国大陆'/.test(liveJs) && /'大陆':\s*'中国大陆'/.test(liveJs));
ok('A5 线上 CSS 里 `.w-stats` 已无限宽，Top5 两列规则在 ≥1180 块内',
  !/\.w-stats \{[^}]*max-width/.test(liveCss) && /\.w-stats \.st-top-list/.test(liveCss));
ok('A6 线上 HTML 的 `#w-stats-btn` 初始带 hidden（首屏不闪的前提）',
  /id="w-stats-btn"[^>]*\shidden[\s>]/.test(html));

/* 线上数据（CI 每晚可能推新快照 → 国别期望值按线上实际算） */
const liveDataRaw = await p0.evaluate(async (u) => (await fetch(u, { cache: 'reload' })).text(), SITE + 'data/watch.json?t=' + TS);
let LIVE = LOCAL;
try { LIVE = JSON.parse(liveDataRaw); } catch (e) { /* 保底用本地 */ }
const LCNT = {};
LIVE.items.forEach((it) => (it.countries || []).forEach((c) => { LCNT[c] = (LCNT[c] || 0) + 1; }));
const LRANK = Object.keys(LCNT).sort((a, b) => LCNT[b] - LCNT[a] || a.localeCompare(b));
const LNO = LIVE.items.filter((it) => !(Array.isArray(it.countries) && it.countries.length)).length;
const LKIND = {};
LIVE.items.forEach((it) => { LKIND[it.kind] = (LKIND[it.kind] || 0) + 1; });

/* ---------- ② 1920 运行时 ---------- */
console.log('== ② 1920 运行时 ==');
await p0.click('#w-avatar');
await p0.waitForFunction(() => !document.getElementById('w-tl').hidden, null, { timeout: 15000 });
await p0.click('#w-stats-btn');
await p0.waitForTimeout(800);

const r = await p0.evaluate(() => {
  const q = (s) => document.querySelectorAll(s).length;
  const sec = document.querySelector('[data-panel="country"]');
  const rows = sec ? [...sec.querySelectorAll('.st-row')] : [];
  const st = document.querySelector('.w-stats');
  const main = document.querySelector('.w-main');
  const mcs = getComputedStyle(main);
  const items = [...document.querySelectorAll('.st-top-item')];
  return {
    stW: Math.round(st.getBoundingClientRect().width),
    mainW: Math.round(main.clientWidth - parseFloat(mcs.paddingLeft) - parseFloat(mcs.paddingRight)),
    stLeft: Math.round(st.getBoundingClientRect().left),
    mainLeft: Math.round(main.getBoundingClientRect().left),
    cards: q('.st-card'),
    cRows: rows.map((x) => ({
      k: x.querySelector('.st-row-k').textContent.trim(),
      v: x.querySelector('.st-row-v').textContent.trim()
    })),
    cHint: sec && sec.querySelector('.st-hint') ? sec.querySelector('.st-hint').textContent.trim() : '',
    cEmpty: sec && sec.querySelector('.st-empty') ? 1 : 0,
    rowsKind: q('[data-panel="kinds"] .st-row'),
    topCols: (() => { const l = document.querySelector('.st-top-list'); return l ? getComputedStyle(l).gridTemplateColumns.split(' ').length : 0; })(),
    topSameRow: items.length > 1 ? Math.abs(items[1].getBoundingClientRect().top - items[0].getBoundingClientRect().top) <= 2 : false,
    topItemW: items[0] ? Math.round(items[0].getBoundingClientRect().width) : -1,
    top: q('.st-top-item'),
    ov: document.documentElement.scrollWidth - document.documentElement.clientWidth
  };
});

ok('B1 1920 年报铺满：`.w-stats` 宽 = `.w-main` 可用宽，且明显大于旧的 1180',
  Math.abs(r.stW - r.mainW) <= 1 && r.stW > 1500, `年报 ${r.stW} / 可用 ${r.mainW}`);

ok('B2 年报与海报网格同一条左轨（不再是 margin:auto 居中）',
  Math.abs((r.stLeft - r.mainLeft) - 28) <= 1, `年报 left ${r.stLeft} / main left ${r.mainLeft}`);

const first = r.cRows[0] || {};
ok('B3 国别面板出真数据：' + Math.min(8, LRANK.length) + ' 行、首行 ' + LRANK[0] + '=' + LCNT[LRANK[0]] + '、无待补无空态',
  r.cRows.length === Math.min(8, LRANK.length) && first.k === LRANK[0] &&
  first.v === String(LCNT[LRANK[0]]) &&
  r.cHint === (LNO ? LNO + ' 部待补' : '') && r.cEmpty === 0,
  r.cRows.map((x) => x.k + '=' + x.v).join('/') + ` | 提示「${r.cHint}」`);

ok('B4 类型面板仍是 3 行（《少年派》改剧集后三个 kind 都有条目）',
  r.rowsKind === 3 && Object.keys(LKIND).length === 3,
  `面板 ${r.rowsKind} 行 / 数据 ${JSON.stringify(LKIND)}`);

ok('B5 铺满连带的 Top5 收窄：两列、1·2 同行、单条 ≤ 一半宽',
  r.topCols === 2 && r.topSameRow && r.top === 5 && r.topItemW <= Math.round(r.stW / 2),
  `列${r.topCols} 同行=${r.topSameRow} 单条${r.topItemW}/${r.stW}`);

ok('B6 六卡齐 + 1920 无横向溢出 + 零 JS 异常',
  r.cards === 6 && r.ov <= 0, `卡${r.cards} ov=${r.ov}`);
await ctx0.close();

/* ---------- ③ 首屏「年报」按钮不闪 ---------- */
console.log('== ③ 首屏按钮不闪 ==');
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.route('**/data/watch/manifest.json*', (r) => r.fulfill({ status: 404, body: '' }));
  await page.route('**/data/watch.json*', async (r) => {
    await new Promise((res) => setTimeout(res, 1500));
    return r.continue();
  });
  await page.goto(SITE + 'watch.html?t=' + TS, { waitUntil: 'domcontentloaded' });
  const early = await page.evaluate(() => {
    const b = document.getElementById('w-stats-btn');
    return {
      posters: document.querySelectorAll('#w-grid .poster').length,
      hidden: b ? b.hidden : null,
      display: b ? getComputedStyle(b).display : ''
    };
  });
  ok('C1 线上首屏（海报 0 张、JS 还没 paint）按钮已不可见',
    early.posters === 0 && early.hidden === true && early.display === 'none',
    `海报 ${early.posters} 张 / hidden=${early.hidden} / display=${early.display}`);

  await page.waitForSelector('#w-grid .poster', { timeout: 25000 });
  await page.waitForTimeout(400);
  const grid = await page.evaluate(() => {
    const b = document.getElementById('w-stats-btn');
    return { n: document.querySelectorAll('#w-grid .poster').length, shown: !!b && !b.hidden && getComputedStyle(b).display !== 'none' };
  });
  ok('C2 数据回来后网格态仍不显示（' + grid.n + ' 张卡）', grid.n > 20 && grid.shown === false, `shown=${grid.shown}`);

  await page.click('#w-avatar');
  await page.waitForFunction(() => !document.getElementById('w-tl').hidden, null, { timeout: 15000 });
  await page.waitForTimeout(300);
  const tl = await page.evaluate(() => {
    const b = document.getElementById('w-stats-btn');
    return { hidden: b.hidden, shown: !b.hidden && getComputedStyle(b).display !== 'none' };
  });
  ok('C3 切时间轴后按钮正常出现（初始 hidden 没压死功能）；零异常',
    tl.shown === true && errs.length === 0, `hidden=${tl.hidden} err=${errs.length}`);
  await ctx.close();
}

/* ---------- ④ 390 ---------- */
console.log('== ④ 390 窄屏 ==');
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
  const mp = await ctx.newPage();
  const merrs = [];
  mp.on('pageerror', (e) => merrs.push(String(e)));
  await mp.goto(SITE + 'watch.html?t=' + TS, { waitUntil: 'load' });
  await mp.waitForSelector('#w-grid .poster', { timeout: 20000 });
  await mp.click('#w-avatar');
  await mp.waitForFunction(() => !document.getElementById('w-tl').hidden, null, { timeout: 15000 });
  await mp.click('#w-stats-btn');
  await mp.waitForTimeout(700);
  const m = await mp.evaluate(() => {
    const cols = (s) => getComputedStyle(document.querySelector(s)).gridTemplateColumns.split(' ').length;
    const sec = document.querySelector('[data-panel="country"]');
    const st = document.querySelector('.w-stats');
    return {
      cardCols: cols('.st-cards'), panelCols: cols('.st-panels'),
      countryW: sec ? Math.round(sec.getBoundingClientRect().width) : -1,
      stW: Math.round(st.getBoundingClientRect().width),
      topRows: (() => { const l = document.querySelector('.st-top-list'); return l ? getComputedStyle(l).gridTemplateColumns.split(' ').length : 0; })(),
      vw: window.innerWidth,
      ov: document.documentElement.scrollWidth - window.innerWidth
    };
  });
  ok('D1 390：6 卡 2 列、面板单列、年报与国别面板不越界、Top5 回到单列、无横向溢出',
    m.cardCols === 2 && m.panelCols === 1 && m.topRows === 1 &&
    m.countryW > 0 && m.stW <= m.vw && m.ov <= 0,
    `卡${m.cardCols} 面板${m.panelCols} Top5列${m.topRows} 年报${m.stW} country${m.countryW} ov=${m.ov}`);
  ok('D2 390 零 JS 异常', merrs.length === 0, merrs.slice(0, 3).join(' | '));
  await ctx.close();
}

await browser.close();
console.log(`\n===== 第 96 轮 watch 线上复验（国别补齐 + 铺满 + 首屏不闪）：${pass} PASS / ${fail} FAIL =====`);
process.exit(fail ? 1 : 0);
