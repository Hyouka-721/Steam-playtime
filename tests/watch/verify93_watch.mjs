/* 第 93 轮 watch 侧回归：年报按钮只在时间轴出现，网格视图的右排只剩两个排序按钮
 *
 * 背景（用户报的问题）：第 92 轮把年报按钮搬进右排之后，网格视图变成了「年报 + 观看时间 +
 * 评分」三个按钮，而年报是视图级入口、排序是网格专属控件，两件事挤在同一排语义混乱。
 * 用户要求：网格视图下不展示年报按钮。
 *
 * 本轮契约：
 *   · 网格   → 右排只有「观看时间 / 评分」；年报按钮 hidden + display:none（不是只写 hidden
 *              属性 —— 第 92 轮的死控件就是 CSS 把 UA 的 display:none 盖掉了）
 *   · 时间轴 → 右排只有「年报」
 *   · 年报展开 → 只有「返回列表」，且**年报表展开时点头像切回网格，返回列表必须仍然可见**
 *     （判据带 statsOn；只按 layout 判会把人关在年报里出不来）
 *
 * ⚠️ 这套件的 B4 是本轮最容易回归的一条：它守的是「退不出来」这类结构性坑，
 *    不是外观。任何时候改这段判据，必须同时保留 statsOn。
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

let pass = 0, fail = 0;
const ok = (n, c, extra = '') => {
  c ? (pass++, console.log(`PASS ${n}${extra ? '  — ' + extra : ''}`))
    : (fail++, console.log(`FAIL ${n}  — ${extra}`));
};

/* ---------------- A 静态契约 ---------------- */
console.log('== A 静态契约 ==');
ok('A1 版本号 bump：watch.html 引用 watch.css?v=38 / watch.js?v=30',
  /watch\.css\?v=38/.test(html) && /watch\.js\?v=30/.test(html),
  (html.match(/watch\.(css|js)\?v=\d+/g) || []).join(' '));

ok('A2 JS 判据是 !(statsOn || layout === \'timeline\') —— 带 statsOn 才不会被关在年报里',
  /statsBtnEl\.hidden = !\(statsOn \|\| layout === 'timeline'\)/.test(js),
  (js.match(/statsBtnEl\.hidden[^\n]*/) || ['n/a'])[0].trim());

ok('A3 上一轮的两条硬约束没被破坏：[hidden] CSS 兜底在、右排容器仍不整条隐藏',
  /\.w-sort \[hidden\] \{ display: none; \}/.test(css) && !/sortEl\.hidden\s*=/.test(js) &&
  /sortBtns\[sbi\]\.hidden = statsOn \|\| layout !== 'grid'/.test(js));

const m860 = css.match(/@media \(max-width: 860px\)/g) || [];
ok('A4 本轮没新增断点：全文件仍只有 1 个 @media (max-width:860px)',
  m860.length === 1, `860 块 ${m860.length} 个`);

/* ---------------- B 1440 运行时 ---------------- */
console.log('== B 1440 运行时 ==');
const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
await page.goto(BASE + 'watch.html', { waitUntil: 'load' });
await page.waitForSelector('#w-grid .poster', { timeout: 15000 });
await page.waitForTimeout(600);

const probe = () => page.evaluate(() => {
  const sortEl = document.getElementById('w-sort');
  const statsB = document.getElementById('w-stats-btn');
  const vis = (e) => !!e && !e.hidden && getComputedStyle(e).display !== 'none';
  return {
    sortBtns: [...sortEl.querySelectorAll('.w-sort-btn')].filter(vis).map((b) => b.dataset.sort),
    sortAll: sortEl.querySelectorAll('.w-sort-btn').length,
    statsShown: vis(statsB),
    statsAttrHidden: statsB.hidden,
    statsText: statsB.textContent.trim(),
    wrapShown: vis(sortEl),
    wrapW: +sortEl.getBoundingClientRect().width.toFixed(0),
    statsW: +statsB.getBoundingClientRect().width.toFixed(0),
    gridShown: vis(document.getElementById('w-grid')),
    tlShown: vis(document.getElementById('w-tl')),
    stats: vis(document.getElementById('w-stats')),
    ov: document.documentElement.scrollWidth - document.documentElement.clientWidth
  };
});

const g = await probe();
ok('B1 网格：年报按钮 hidden=true 且 computed display:none（不是只挂属性），右排只剩两个排序按钮',
  g.statsAttrHidden && !g.statsShown && g.sortBtns.length === 2 && g.sortAll === 2 &&
  g.sortBtns.join('/') === 'time/rating' && g.wrapShown && g.gridShown,
  `年报 hidden=${g.statsAttrHidden} 可见=${g.statsShown} | 右排 ${g.sortBtns.join('/')}`);

await page.click('#w-avatar');
await page.waitForSelector('#w-tl .tl-item', { timeout: 15000 });
await page.waitForTimeout(500);
const t = await probe();
ok('B2 时间轴：右排有且只有「年报」，两个排序按钮收起',
  t.statsShown && t.statsText === '年报' && t.sortBtns.length === 0 && t.tlShown && !t.gridShown,
  `年报=${t.statsShown} 排序可见 ${t.sortBtns.length} 个`);

ok('B3 时间轴：右排胶囊收缩到年报本身（无残留空胶囊）',
  t.wrapW <= t.statsW + 12, `容器 ${t.wrapW}px / 年报 ${t.statsW}px`);

await page.click('#w-stats-btn');
await page.waitForTimeout(400);
const s = await probe();
ok('B4 年报展开：右排只剩「返回列表」，两个排序按钮仍收起',
  s.statsShown && s.statsText === '返回列表' && s.sortBtns.length === 0 && s.stats,
  `${s.statsText} 排序可见 ${s.sortBtns.length} 个`);

/* ★ 本轮最关键的一条：年报表展开时点头像切回网格，按钮必须变成「返回列表」且仍可见 */
await page.click('#w-avatar');
await page.waitForTimeout(400);
const s2 = await probe();
ok('B5 年报展开中点头像切网格：「返回列表」仍可见（statsOn 进了判据，不会把人关在年报里）',
  s2.statsShown && s2.statsText === '返回列表' && s2.stats,
  `按钮=${s2.statsText} 可见=${s2.statsShown} 年报态=${s2.stats}`);
/* 年报展开期间网格 / 时间轴本来就双双被年报占位，所以这里**不能**断言 gridShown。
   「头像点击确实把 layout 切成了 grid」由 B7 正面证明：从年报退出后落在网格而不是时间轴。 */
ok('B6 年报展开期间两组容器都被年报占位（判 layout 不等于看容器，别在这里断言网格可见）',
  !s2.gridShown && !s2.tlShown && s2.stats && s2.ov <= 0,
  `grid=${s2.gridShown} tl=${s2.tlShown} 年报=${s2.stats} ov=${s2.ov}`);

await page.click('#w-stats-btn');
await page.waitForTimeout(400);
const b = await probe();
ok('B7 从年报返回：回到网格（进入年报前就在网格），年报按钮重新收起',
  b.gridShown && !b.stats && b.sortBtns.length === 2 && b.statsAttrHidden && !b.statsShown &&
  b.statsText === '年报',
  `grid=${b.gridShown} 年报 visible=${b.statsShown} 右排 ${b.sortBtns.join('/')}`);

ok('B8 1440 全程无横向溢出 + 零 JS 异常', g.ov <= 0 && s.ov <= 0 && errs.length === 0,
  `ov=${g.ov}/${s.ov} err=${errs.length}`);

/* 排序功能不能被这轮藏按钮藏坏：网格点「评分」，首张应是全库最高分 */
const topRating = Math.max(...data.items.map((x) => Number(x.rating) || 0));
await page.click('.w-sort-btn[data-sort="rating"]');
await page.waitForTimeout(400);
const rated = await page.evaluate(() => {
  const first = document.querySelector('#w-grid .poster');
  const sc = first && first.querySelector('.poster-score');
  return { txt: sc ? sc.textContent.trim() : '', n: document.querySelectorAll('#w-grid .poster').length };
});
ok('B9 网格点「评分」仍按高分排序（首张 = 全库最高分 ' + topRating.toFixed(1) + '）',
  rated.txt === '★' + topRating.toFixed(1) && rated.n === N, `首张 ${rated.txt}`);
await ctx.close();

/* ---------------- C 390 窄屏 ---------------- */
console.log('== C 390 窄屏 ==');
const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
const mp = await mctx.newPage();
const merrs = [];
mp.on('pageerror', (e) => merrs.push(String(e)));
await mp.goto(BASE + 'watch.html', { waitUntil: 'load' });
await mp.waitForSelector('#w-grid .poster', { timeout: 15000 });
await mp.waitForTimeout(700);

const m = await mp.evaluate(() => {
  const bx = (s) => { const r = document.querySelector(s).getBoundingClientRect(); return { l: +r.left.toFixed(0), r: +r.right.toFixed(0), t: +r.top.toFixed(0), w: +r.width.toFixed(0) }; };
  const vis = (e) => !!e && !e.hidden && getComputedStyle(e).display !== 'none';
  return {
    vw: window.innerWidth, seg: bx('.w-seg'), sort: bx('.w-sort'), first: bx('#w-grid .poster'),
    ov: document.documentElement.scrollWidth - window.innerWidth,
    btns: [...document.querySelectorAll('#w-sort > button')].filter(vis).map((x) => x.textContent.trim()),
    statsShown: vis(document.getElementById('w-stats-btn'))
  };
});
ok('C1 390 网格：第二行只剩「观看时间 / 评分」，年报不显示，首张海报起点 ≤330、无溢出',
  m.btns.length === 2 && !m.statsShown && m.seg.w >= m.vw - 40 && m.sort.w >= m.vw - 40 &&
  m.sort.t >= m.seg.t + 30 && m.first.t <= 330 && m.ov <= 0,
  `第二行 ${m.btns.join('/')} 首图 ${m.first.t} ov=${m.ov}`);

await mp.click('#w-avatar');
await mp.waitForSelector('#w-tl .tl-item', { timeout: 15000 });
await mp.waitForTimeout(400);
const mt = await mp.evaluate(() => {
  const r = document.querySelector('.w-sort').getBoundingClientRect();
  const vis = (e) => !!e && !e.hidden && getComputedStyle(e).display !== 'none';
  return {
    vw: window.innerWidth, sort: { l: +r.left.toFixed(0), r: +r.right.toFixed(0) },
    btns: [...document.querySelectorAll('#w-sort > button')].filter(vis).map((x) => x.textContent.trim()),
    ov: document.documentElement.scrollWidth - window.innerWidth
  };
});
ok('C2 390 时间轴：第二行只剩「年报」，等分不越界、无溢出',
  mt.btns.length === 1 && mt.btns[0] === '年报' &&
  mt.sort.l >= -1 && mt.sort.r <= mt.vw + 1 && mt.ov <= 0,
  `第二行 ${mt.btns.join('/')} ov=${mt.ov}`);

await mp.click('#w-stats-btn');
await mp.waitForTimeout(400);
const ms = await mp.evaluate(() => {
  const vis = (e) => !!e && !e.hidden && getComputedStyle(e).display !== 'none';
  return {
    ov: document.documentElement.scrollWidth - window.innerWidth,
    cols: getComputedStyle(document.querySelector('.st-cards')).gridTemplateColumns.split(' ').length,
    btn: document.getElementById('w-stats-btn').textContent.trim(),
    btnShown: vis(document.getElementById('w-stats-btn'))
  };
});
ok('C3 390 年报：2 列、按钮变「返回列表」且可见、无横向溢出',
  ms.ov <= 0 && ms.cols === 2 && ms.btn === '返回列表' && ms.btnShown,
  `cols=${ms.cols} ov=${ms.ov} btn=${ms.btn}`);

ok('C4 390 零 JS 异常', merrs.length === 0, merrs.slice(0, 3).join(' | '));

await browser.close();
console.log(`\n===== 第 93 轮 watch（网格视图隐藏年报按钮）：${pass} PASS / ${fail} FAIL =====`);
process.exit(fail ? 1 : 0);
