/* 第 91 轮 watch 侧上线复验：A3 上映日期 / A4 年报 / A5 数据补齐 / A8 兼容双轨分片 / A9 防重复
 *
 * ⚠️ **本轮尚未上线时不要跑**：线上此刻仍是第 90 轮（v=28 / v=17，无年报、无分片）。
 *    等用户说「上线」→ fetch/merge → push → Pages 指纹轮询命中后再执行本脚本。
 *
 * 复验口径：
 *   ① 指纹：watch.html 引用 watch.css?v=35 / watch.js?v=24；线上 css/js/watch.json 字节
 *      md5 与本地全等（CRLF 归一）；**分片真的上线了** —— manifest + 年片与本地逐字节一致，
 *      且 manifest 的 updated_at / total 能与线上主文件对账（对得上才说明线上走的是分片路径）
 *   ② 1440 运行时：A4 年报四卡数字全部由本地数据推导比对、年份下拉切换、返回列表还原；
 *      A9 重名被拦 + **0 次写入请求**；A3 表单有 date；A8 首屏确实请求了 manifest 与年片
 *   ③ 390 运行时：年报收 2 列、两组控件不越界、首张海报起点不因年报按钮掉到 360
 *
 * 🔴 全程用 page.route 拦死 https://api.github.com/** 并 abort —— 复验只读线上，
 *    任何「点提交恰好没被拦住」的意外都不能真的写进仓库。
 * ⚠️ 线上字节一律在页内 fetch 回传（Node 直连 github.io 不通），统一 --no-proxy-server。
 */
import { createRequire } from 'module';
import fs from 'fs';
import crypto from 'crypto';
const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const SITE = 'https://hyouka-721.github.io/Steam-playtime/';
const ROOT = 'C:/Users/33329/WorkBuddy/2026-10-13-18-17-49/steam-playtime/docs/';
const TS = Date.now();
const stripCmt = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const md5 = (b) => crypto.createHash('md5').update(b).digest('hex');
const norm = (s) => String(s).replace(/\r\n/g, '\n');
const md5txt = (s) => md5(Buffer.from(norm(s), 'utf8'));

const localCss = norm(fs.readFileSync(ROOT + 'watch.css', 'utf8'));
const localJs = norm(fs.readFileSync(ROOT + 'watch.js', 'utf8'));
const localSw = norm(fs.readFileSync(ROOT + 'sw.js', 'utf8'));
const localWatchRaw = norm(fs.readFileSync(ROOT + 'data/watch.json', 'utf8'));
const localWatch = JSON.parse(localWatchRaw);
const ITEMS = localWatch.items;
const N = ITEMS.length;
const localMfRaw = norm(fs.readFileSync(ROOT + 'data/watch/manifest.json', 'utf8'));
const localMf = JSON.parse(localMfRaw);

/* 本地按报表同一口径推导期望值，避免手抄数字 */
const RATED = ITEMS.filter((x) => Number(x.rating) > 0);
const AVG = RATED.length ? (RATED.reduce((a, x) => a + Number(x.rating), 0) / RATED.length).toFixed(2) : '—';
const DAYS = new Set(ITEMS.map((x) => String(x.watched_at || '').slice(0, 10))).size;
const yearCount = {};
ITEMS.forEach((x) => { const y = String(x.watched_at || '').slice(0, 4); yearCount[y] = (yearCount[y] || 0) + 1; });
const YEAR_OPT = Object.keys(yearCount).length + 1;                  // + 「全部年份」
const P2020 = String(yearCount['2020'] || 0);
/* 第 94 轮新增两卡：评分中位数、≥8 分占比，按同一口径本地推导 */
const SORTED_R = RATED.map((x) => Number(x.rating)).sort((a, b) => a - b);
const MID = Math.floor(SORTED_R.length / 2);
const MEDIAN = SORTED_R.length
  ? (SORTED_R.length % 2 ? SORTED_R[MID] : (SORTED_R[MID - 1] + SORTED_R[MID]) / 2).toFixed(2)
  : '—';
const HIGHPCT = RATED.length
  ? (RATED.filter((x) => Number(x.rating) >= 8).length / RATED.length * 100).toFixed(1)
  : '—';
const YEAR_BARS = Object.keys(yearCount).length;   // 逐年趋势的柱子数 = 有记录的年份数

let pass = 0, fail = 0;
const ok = (n, c, extra = '') => {
  c ? (pass++, console.log(`PASS ${n}${extra ? '  — ' + extra : ''}`))
    : (fail++, console.log(`FAIL ${n}  — ${extra}`));
};

const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2, serviceWorkers: 'block' });

/* 🔴 只读保险：任何 GitHub API 调用一律 abort，并记账 */
const apiCalls = [];
await ctx.route('https://api.github.com/**', (r) => {
  apiCalls.push({ method: r.request().method(), url: r.request().url() });
  return r.abort();
});

const page = await ctx.newPage();
const errs = [];
const shardHits = [];
page.on('pageerror', (e) => errs.push(String(e)));
page.on('response', (res) => {
  const u = res.url();
  if (/\/data\/watch\/(manifest|\d{4})\.json/.test(u) && res.status() === 200) {
    shardHits.push(u.split('/data/watch/')[1].split('?')[0]);
  }
});
/* 🔴 B8 要给一个假 Token：submitAdd 的守卫顺序是「空片名 → Token → 重名」，
 *    线上浏览器没有 Token 时第一步就 return 了，重名检查压根跑不到（会假红成「按钮没变」）。
 *    Token 只是本地 localStorage，不会真的发出去；api.github.com 已被 abort 兜底。 */
await page.addInitScript(() => {
  try { localStorage.setItem('watch-gh-token', 'ghp_fake_for_online_verify'); } catch (e) {}
});
await page.goto(SITE + 'watch.html?t=' + TS, { waitUntil: 'load' });
await page.waitForFunction(() => document.querySelectorAll('#w-grid .poster').length > 20, null, { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(900);

/* ---------- ① 内容指纹 ---------- */
console.log('== ① 内容指纹（含分片是否真的上线） ==');
const html = await page.evaluate(async (u) => (await fetch(u, { cache: 'reload' })).text(), SITE + 'watch.html?t=' + TS);
ok('A1 线上 watch.html 引用 watch.css?v=35 / watch.js?v=24',
  /watch\.css\?v=35/.test(html) && /watch\.js\?v=24/.test(html),
  (html.match(/watch\.(css|js)\?v=\d+/g) || []).join(' '));

const liveCss = await page.evaluate(async (u) => (await fetch(u, { cache: 'reload' })).text(), SITE + 'watch.css?v=35&t=' + TS);
const liveJs = await page.evaluate(async (u) => (await fetch(u, { cache: 'reload' })).text(), SITE + 'watch.js?v=24&t=' + TS);
ok('A2 线上 watch.css 字节 md5 与本地全等（年报几乎全在 CSS，必须一起上线）',
  md5txt(liveCss) === md5txt(localCss), `${md5txt(liveCss).slice(0, 12)} / ${md5txt(localCss).slice(0, 12)}`);
ok('A3 线上 watch.js 字节 md5 与本地全等',
  md5txt(liveJs) === md5txt(localJs), `${md5txt(liveJs).slice(0, 12)} / ${md5txt(localJs).slice(0, 12)}`);

const liveWatchRaw = norm(await page.evaluate(async (u) => (await fetch(u, { cache: 'reload' })).text(), SITE + 'data/watch.json?t=' + TS));
ok('A4 线上 watch.json 与本地全等（A5 补的 title_en / tags 已上线）',
  liveWatchRaw === localWatchRaw, `本地 ${N} 条`);

const liveMf = await page.evaluate(async (u) => (await fetch(u, { cache: 'reload' })).text(), SITE + 'data/watch/manifest.json?t=' + TS).catch(() => '');
let mfObj = null;
try { mfObj = JSON.parse(liveMf); } catch (e) {}
ok('A5 A8 线上 manifest.json 已上线且与本地逐字节一致',
  !!mfObj && norm(liveMf) === localMfRaw,
  mfObj ? `version=${mfObj.version} total=${mfObj.total} years=${(mfObj.years || []).length}` : '取不到 / 解析失败');

const liveWatchObj = JSON.parse(liveWatchRaw);
ok('A6 A8 线上对账能通过：manifest.updated_at / total 与线上主文件完全一致（否则页面会回退整份主文件、分片等于白做）',
  !!mfObj && mfObj.updated_at === liveWatchObj.updated_at && mfObj.total === liveWatchObj.items.length,
  mfObj ? `mf=${mfObj.updated_at}/${mfObj.total} vs master=${liveWatchObj.updated_at}/${liveWatchObj.items.length}` : 'n/a');

const liveCssNoCmt = stripCmt(liveCss);
ok('A7 线上 CSS 是年报那版：.w-stats-btn 在、年报断点规则带 .w-stats 前缀（否则窄屏会退回 4 列）',
  /\.w-stats-btn\s*\{/.test(liveCssNoCmt) && /\.w-stats\s+\.st-cards\s*\{[\s\S]*?repeat\(2,/.test(liveCssNoCmt));

const liveSw = norm(await page.evaluate(async (u) => (await fetch(u, { cache: 'reload' })).text(), SITE + 'sw.js?t=' + TS).catch(() => ''));
ok('A8 线上 sw.js 缓存名仍是 watch-data-v1、且不含分片规则（本轮故意不接 SW）',
  /var DATA_CACHE = 'watch-data-v1'/.test(liveSw) && !/SHARD_RE/.test(liveSw) && md5txt(liveSw) === md5txt(localSw),
  `md5 ${md5txt(liveSw).slice(0, 12)}`);

/* ---------- ② 1440 运行时 ---------- */
console.log('== ② 1440 运行时 ==');
const n0 = await page.evaluate(() => document.querySelectorAll('#w-grid .poster').length);
ok('B1 A8 线上首屏卡片数 = 本地条数，且确实走了分片（manifest + 全部年片都 200）',
  n0 === N && shardHits.includes('manifest.json') &&
  localMf.years.every((y) => shardHits.includes(y.file)) && shardHits.length >= localMf.years.length + 1,
  `卡片 ${n0}/${N} 分片命中 ${shardHits.length} 个`);

/* 第 93 轮：年报按钮只在时间轴出现，线上也要先点头像 */
await page.click('#w-avatar');
await page.waitForFunction(() => !document.getElementById('w-tl').hidden, null, { timeout: 20000 });
await page.click('#w-stats-btn');
const st = await page.evaluate(() => {
  const cards = [...document.querySelectorAll('.st-card')].map((c) => ({
    k: (c.querySelector('.st-k') || {}).textContent || '',
    v: (c.querySelector('.st-v') || {}).textContent || ''
  }));
  return {
    hidden: document.getElementById('w-stats').hidden,
    gridHidden: document.getElementById('w-grid').hidden,
    tlHidden: document.getElementById('w-tl').hidden,
    /* 第 92 轮起：年报按钮住进 #w-sort，容器必须留着（否则「返回列表」跟着消失），
       真正收起来的是两个 .w-sort-btn。 */
    sortWrapShown: (() => { const b = document.getElementById('w-sort'); return !!b && !b.hidden && getComputedStyle(b).display !== 'none'; })(),
    sortBtnsHidden: [...document.querySelectorAll('#w-sort .w-sort-btn')].every((b) => b.hidden && getComputedStyle(b).display === 'none'),
    pressed: document.getElementById('w-stats-btn').getAttribute('aria-pressed'),
    btnText: document.getElementById('w-stats-btn').textContent.trim(),
    /* 第 94 轮：按面板取数（月度 / 逐年 分开，类型 / 区间 分开） */
    cards,
    barsMonth: document.querySelectorAll('[data-panel="months"] .st-bar').length,
    barsYear: document.querySelectorAll('[data-panel="years"] .st-bar').length,
    rowsKind: document.querySelectorAll('[data-panel="kinds"] .st-row').length,
    rowsBucket: document.querySelectorAll('[data-panel="buckets"] .st-row').length,
    chips: document.querySelectorAll('.st-chip').length,
    top: document.querySelectorAll('.st-top-item').length,
    years: document.querySelectorAll('#st-year option').length,
    title: (document.querySelector('.st-title') || {}).textContent || ''
  };
});
ok('B2 A4 年报展开：年报占位、网格/时间轴收起、右排只留「返回列表」、按钮 aria-pressed 与文案同步',
  !st.hidden && st.gridHidden && st.tlHidden && st.sortWrapShown && st.sortBtnsHidden &&
  st.pressed === 'true' && st.btnText === '返回列表');
const card = (k) => (st.cards.find((c) => c.k === k) || {}).v;
ok('B3 A4 六卡数字与本地数据推导全等（记录总数 / 有评分 / 平均评分 / 中位数 / ≥8 占比 / 观影天数）',
  st.cards.length === 6 && card('记录总数') === String(N) && card('有评分') === String(RATED.length) &&
  card('平均评分') === AVG && card('评分中位数') === MEDIAN &&
  card('≥8 分占比') === HIGHPCT && card('观影天数') === String(DAYS),
  `${card('平均评分')}/${card('评分中位数')}/${card('≥8 分占比')} vs ${AVG}/${MEDIAN}/${HIGHPCT}`);
ok('B4 A4 面板齐备：12 月柱 / 逐年柱=年份数 / 类型 3 行 + 区间 5 行 / 标签 1~8 / Top5 / 年份选项数对',
  st.barsMonth === 12 && st.barsYear === YEAR_BARS && st.rowsKind === 3 && st.rowsBucket === 5 &&
  st.chips > 0 && st.chips <= 8 && st.top === 5 &&
  st.years === YEAR_OPT && /全部年份/.test(st.title),
  `月=${st.barsMonth} 年=${st.barsYear} 类型=${st.rowsKind} 区间=${st.rowsBucket} chips=${st.chips} top=${st.top}`);
await page.selectOption('#st-year', '2020');
const st20 = await page.evaluate(() => ({
  v: (document.querySelector('.st-card .st-v') || {}).textContent || '',
  title: (document.querySelector('.st-title') || {}).textContent || ''
}));
ok('B5 A4 年份下拉切换：2020 年条数 = 本地该年真实条数',
  st20.v === P2020 && /2020/.test(st20.title), `线上 ${st20.v} / 本地 ${P2020}`);
await page.selectOption('#st-year', '');
await page.click('#w-stats-btn');
const back = await page.evaluate(() => ({
  hidden: document.getElementById('w-stats').hidden,
  gridHidden: document.getElementById('w-grid').hidden,
  tlHidden: document.getElementById('w-tl').hidden,
  n: document.querySelectorAll('#w-grid .poster').length,
  pressed: document.getElementById('w-stats-btn').getAttribute('aria-pressed'),
  ov: document.documentElement.scrollWidth - document.documentElement.clientWidth
}));
/* 第 93 轮：年报只从时间轴进，返回落点也是时间轴（判据随功能改判） */
ok('B6 A4 返回列表：回到进入年报前的视图（时间轴）、卡片数与 aria-pressed 都对、无横向溢出',
  back.hidden && back.gridHidden && !back.tlHidden && back.n === N &&
  back.pressed === 'false' && back.ov <= 0,
  `卡片 ${back.n} tl=${back.tlHidden} ov=${back.ov}`);

/* A9 防重复：只验「被拦住」这一步，绝不点第二次；API 已被 abort，双保险 */
await page.click('#w-fab');
const relType = await page.evaluate(() => {
  const e = document.getElementById('add-release');
  return e ? e.type : '';
});
ok('B7 A3 线上表单有上映日期框且 type=date', relType === 'date', `type=${relType}`);
await page.fill('#add-title', '阿甘正传');
await page.click('#w-add-submit');
const dup = await page.evaluate(() => ({
  msg: (document.getElementById('w-add-msg') || {}).textContent || '',
  btn: (document.getElementById('w-add-submit') || {}).textContent || '',
  open: document.getElementById('w-add').hasAttribute('open')
}));
ok('B8 A9 重名第一次提交被拦下：提示含已有记录 + 观影日期，按钮变「确认重复添加」，0 次写入请求',
  /库里已有记录/.test(dup.msg) && /阿甘正传/.test(dup.msg) && /观影于/.test(dup.msg) &&
  dup.btn.trim() === '确认重复添加' && dup.open && apiCalls.length === 0,
  `api=${apiCalls.length} btn=${dup.btn.trim()} msg=${dup.msg.slice(0, 40)}`);
ok('B9 全程零 JS 异常', errs.length === 0, errs.slice(0, 3).join(' | '));
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
const m0 = await mp.evaluate(() => {
  const first = document.querySelector('#w-grid .poster');
  const seg = document.querySelector('.w-seg').getBoundingClientRect();
  const sort = document.querySelector('.w-sort').getBoundingClientRect();
  return {
    firstTop: first ? +first.getBoundingClientRect().top.toFixed(1) : -1,
    seg: { l: seg.left, r: seg.right, b: seg.bottom },
    sort: { l: sort.left, r: sort.right, t: sort.top },
    vw: window.innerWidth,
    ov: document.documentElement.scrollWidth - window.innerWidth
  };
});
ok('C1 390 首张海报起点 ≤330（年报按钮没把排序条挤到第三行）+ 两组控件不越界、无溢出',
  m0.firstTop > 0 && m0.firstTop <= 330 && m0.seg.l >= -1 && m0.seg.r <= m0.vw + 1 &&
  m0.sort.l >= -1 && m0.sort.r <= m0.vw + 1 && m0.sort.t >= m0.seg.b - 1 && m0.ov <= 0,
  `海报起点 ${m0.firstTop} ov=${m0.ov}`);
await mp.click('#w-avatar');
await mp.waitForFunction(() => !document.getElementById('w-tl').hidden, null, { timeout: 20000 });
await mp.click('#w-stats-btn');
const m1 = await mp.evaluate(() => ({
  ov: document.documentElement.scrollWidth - window.innerWidth,
  cols: getComputedStyle(document.querySelector('.st-cards')).gridTemplateColumns.split(' ').length,
  seg: (() => { const b = document.querySelector('.w-seg').getBoundingClientRect(); return { l: b.left, r: b.right }; })()
}));
ok('C2 A4 390 年报收成 2 列、无横向溢出、筛选条仍不越界',
  m1.ov <= 0 && m1.cols === 2 && m1.seg.l >= -1 && m1.seg.r <= 391, `cols=${m1.cols} ov=${m1.ov}`);
ok('C3 390 零 JS 异常', merrs.length === 0, merrs.slice(0, 3).join(' | '));

await browser.close();
console.log(`\n===== 第 91 轮 watch 线上复验（A3/A4/A5/A8/A9）：${pass} PASS / ${fail} FAIL =====`);
process.exit(fail ? 1 : 0);
