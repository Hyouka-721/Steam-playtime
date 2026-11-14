/* 第 92 轮 watch 侧回归：年报按钮从左侧筛选条搬进右排胶囊
 *
 * 背景（用户报的问题）：时间轴视图下「观看时间 / 评分」明明已经没用（第 72 轮起排序
 * 只对网格生效），却还挂在页面上 —— JS 给它设了 hidden，但 CSS 里 .w-sort-btn 自己
 * 的样式把 [hidden] 的 UA display:none 盖掉了，于是变成一个**点了没反应的死控件**。
 *
 * 本轮契约：
 *   · 左排 .w-seg 只留四个类型档位（全部 / 电影 / 剧集 / 番剧）
 *   · 右排 .w-sort 改成「视图与排序」：网格 = 年报 + 观看时间 + 评分；时间轴 = 只有年报；
 *     年报展开 = 只有「返回列表」（同一个按钮换文案）
 *   · 右排容器永不隐藏（否则「返回列表」跟着消失，用户退不出来），只隐藏两个 .w-sort-btn
 *   · [hidden] 必须有 CSS 兜底，别再让死控件回潮
 *
 * ⚠️ 别把年报按钮并进 .w-sort-btn 选择器：旧套件用 querySelector('.w-sort-btn.is-on')
 *    读「当前排序」的 data-sort，年报进来会命错元素。
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
ok('A1 版本号 bump：watch.html 引用 watch.css?v=39 / watch.js?v=31',
  /watch\.css\?v=39/.test(html) && /watch\.js\?v=31/.test(html),
  (html.match(/watch\.(css|js)\?v=\d+/g) || []).join(' '));

/* 取出两个容器的内容片段，直接看归属 */
const segBlock = (html.match(/<div class="w-seg"[\s\S]*?\n  <\/div>/) || [''])[0];
const sortBlock = (html.match(/<div class="w-sort"[\s\S]*?\n  <\/div>/) || [''])[0];
ok('A2 年报按钮已搬进 #w-sort；左排只剩四个类型档位',
  /id="w-stats-btn"/.test(sortBlock) && !/id="w-stats-btn"/.test(segBlock) &&
  (segBlock.match(/class="w-seg-btn/g) || []).length === 4,
  `左排 ${(segBlock.match(/class="w-seg-btn/g) || []).length} 个；年报在右排=${/id="w-stats-btn"/.test(sortBlock)}`);
ok('A3 右排 aria-label 改成「视图与排序」，且年报仍是独立 .w-stats-btn（不进 .w-sort-btn 选择器）',
  /aria-label="视图与排序"/.test(sortBlock) &&
  /class="w-stats-btn" id="w-stats-btn"/.test(sortBlock) &&
  (sortBlock.match(/class="w-sort-btn/g) || []).length === 2);

ok('A4 CSS 把年报并入胶囊外观（border:0 / background:none / padding 6px 18px），并给 [hidden] 兜底',
  /\.w-sort \.w-stats-btn \{[\s\S]*?border: 0; background: none;/.test(css) &&
  /\.w-sort \.w-stats-btn \{[\s\S]*?padding: 6px 18px;/.test(css) &&
  /\.w-sort \[hidden\] \{ display: none; \}/.test(css));

ok('A5 JS 不再整条隐藏右排（sortEl.hidden 已删），改成逐个隐藏 .w-sort-btn',
  !/sortEl\.hidden\s*=/.test(js) &&
  /sortBtns\[sbi\]\.hidden = statsOn \|\| layout !== 'grid'/.test(js));

/* 既有硬约束不能被这轮破坏 */
const m860 = css.match(/@media \(max-width: 860px\)/g) || [];
ok('A6 全文件仍只有 1 个 @media (max-width:860px)；480 块里年报改由 .w-sort 前缀等分',
  m860.length === 1 && /\.w-sort \.w-stats-btn \{ flex: 1; padding: 6px 8px;/.test(css),
  `860 块 ${m860.length} 个`);
/* ⚠️ 别用 `border-radius:\s*(?!var\(--r-)` 这种负向先行：\s* 能零宽匹配，
   先行断言会落在空格上从而「成功」，正则照样命中（本轮第一版就是这么假红的）。
   直接取出所有圆角值逐个比对白名单。 */
const newRuleSlice = (css.match(/\.w-sort \.w-stats-btn[\s\S]{0,600}/) || [''])[0];
const radii = [...newRuleSlice.matchAll(/border-radius:\s*([^;]+);/g)].map((m) => m[1].trim());
ok('A7 新增规则的圆角只用令牌 / 50% / 2px（共 ' + radii.length + ' 处）',
  radii.length > 0 && radii.every((v) => /^var\(--r-(xs|sm|md|lg|pill)\)$/.test(v) || v === '50%' || v === '2px'),
  radii.join(' / '));

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
  const shown = (e) => !!e && !e.hidden && getComputedStyle(e).display !== 'none';
  const txt = (e) => e.textContent.trim();
  const sortEl = document.getElementById('w-sort');
  const sb = sortEl.getBoundingClientRect();
  const statsB = document.getElementById('w-stats-btn');
  return {
    segBtns: [...document.querySelectorAll('.w-seg > .w-seg-btn')].map(txt),
    sortVisible: [...sortEl.querySelectorAll('.w-sort-btn')].filter(shown).map((b) => b.dataset.sort),
    sortAll: [...sortEl.querySelectorAll('.w-sort-btn')].length,
    statsShown: shown(statsB),
    statsText: txt(statsB),
    wrapShown: shown(sortEl),
    wrapW: +sb.width.toFixed(0),
    statsW: +statsB.getBoundingClientRect().width.toFixed(0),
    statsLeft: +statsB.getBoundingClientRect().left.toFixed(0),
    sortFirstLeft: (() => { const b = sortEl.querySelector('.w-sort-btn'); return +b.getBoundingClientRect().left.toFixed(0); })(),
    grid: document.querySelectorAll('#w-grid .poster').length,
    gridShown: shown(document.getElementById('w-grid')),
    tlShown: shown(document.getElementById('w-tl')),
    ov: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    sortOn: (document.querySelector('.w-sort-btn.is-on') || {}).dataset ? document.querySelector('.w-sort-btn.is-on').dataset.sort : null
  };
});

const g = await probe();
/* 第 93 轮契约：年报按钮只在时间轴出现，网格右排只剩两个排序按钮。
   本条判据随功能改判 —— 不是调阈值抹红，而是「三个按钮全在」这个前提本身被推翻了。 */
ok('B1 网格：左排 4 档不变，右排只剩两个排序按钮，年报按钮收起（hidden + display:none）',
  g.segBtns.length === 4 && g.sortVisible.length === 2 && g.sortAll === 2 &&
  !g.statsShown && g.statsText === '年报',
  `左 ${g.segBtns.join('/')}；右 排序 ${g.sortVisible.join('/')}；年报显示=${g.statsShown}`);

await page.click('#w-avatar');
await page.waitForSelector('#w-tl .tl-item', { timeout: 15000 });
await page.waitForTimeout(500);
const t = await probe();
ok('B2 时间轴：两个排序按钮真的 hidden 且 computed display:none（修掉「显示着但点了没反应」的死控件）',
  t.sortVisible.length === 0 && t.sortAll === 2,
  `可见排序按钮 ${t.sortVisible.length} / 共 ${t.sortAll}`);
ok('B3 时间轴：右排容器还在、只剩「年报」，胶囊宽度收缩到年报本身（无残留空胶囊）',
  t.wrapShown && t.statsShown && t.statsText === '年报' && t.wrapW <= t.statsW + 12,
  `容器 ${t.wrapW}px / 年报 ${t.statsW}px`);
ok('B4 时间轴：网格仍在（124 张），切视图没把数据搞丢', t.grid === N, `${t.grid}/${N}`);

await page.click('#w-stats-btn');
await page.waitForTimeout(400);
const s = await probe();
ok('B5 年报展开：右排只剩「返回列表」，容器与按钮都还在（能退出来）',
  s.wrapShown && s.statsShown && s.statsText === '返回列表' && s.sortVisible.length === 0 &&
  s.wrapW <= s.statsW + 12, `${s.statsText} 容器 ${s.wrapW}px`);
ok('B6 年报视图无横向溢出', s.ov <= 0, `ov=${s.ov}`);

await page.click('#w-stats-btn');
await page.waitForTimeout(400);
const back = await probe();
ok('B7 返回列表：回到打开年报前的那个视图（时间轴），三个按钮与排序态都不丢',
  back.sortVisible.length === 0 && back.statsText === '年报' && back.tlShown && !back.gridShown &&
  back.grid === N && !!back.sortOn,
  `排序态=${back.sortOn} 时间轴=${back.tlShown}`);

/* 排序功能本身不能被搬位置搬坏：切回网格点「评分」，首张应是全库最高分 */
await page.click('#w-avatar');
await page.waitForFunction(() => !document.getElementById('w-grid').hidden, null, { timeout: 8000 });
await page.waitForTimeout(400);
const topRating = Math.max(...data.items.map((x) => Number(x.rating) || 0));
await page.click('.w-sort-btn[data-sort="rating"]');
await page.waitForTimeout(400);
const rated = await page.evaluate(() => {
  const first = document.querySelector('#w-grid .poster');
  const s = first && first.querySelector('.poster-score');
  return { txt: s ? s.textContent.trim() : '', n: document.querySelectorAll('#w-grid .poster').length };
});
ok('B8 点「评分」仍按高分排序（首张 = 全库最高分 ' + topRating.toFixed(1) + '）',
  rated.txt === '★' + topRating.toFixed(1) && rated.n === N, `首张 ${rated.txt}`);
ok('B9 1440 无横向溢出 + 零 JS 异常', g.ov <= 0 && errs.length === 0, `ov=${g.ov} err=${errs.length}`);
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
  const b = (s) => { const e = document.querySelector(s); const r = e.getBoundingClientRect(); return { l: +r.left.toFixed(0), r: +r.right.toFixed(0), t: +r.top.toFixed(0), w: +r.width.toFixed(0) }; };
  return {
    vw: window.innerWidth, seg: b('.w-seg'), sort: b('.w-sort'),
    first: b('#w-grid .poster'), ov: document.documentElement.scrollWidth - window.innerWidth,
    shown: [...document.querySelectorAll('#w-sort .w-sort-btn')].filter((x) => getComputedStyle(x).display !== 'none').length
  };
});
ok('C1 390 仍是两行：.w-seg / .w-sort 各占满一行等宽，首张海报起点 ≤330（没多出第三行）',
  m.seg.w >= m.vw - 40 && m.sort.w >= m.vw - 40 && m.sort.t >= m.seg.t + 30 &&
  m.first.t <= 330 && m.ov <= 0 && m.shown === 2,
  `首图 ${m.first.t} / seg ${m.seg.w} sort ${m.sort.w} ov=${m.ov}`);

await mp.click('#w-avatar');
await mp.waitForSelector('#w-tl .tl-item', { timeout: 15000 });
await mp.waitForTimeout(400);
const mt = await mp.evaluate(() => {
  const b = (s) => { const e = document.querySelector(s); const r = e.getBoundingClientRect(); return { l: +r.left.toFixed(0), r: +r.right.toFixed(0), w: +r.width.toFixed(0) }; };
  return {
    vw: window.innerWidth, sort: b('.w-sort'),
    shown: [...document.querySelectorAll('#w-sort > button')].filter((x) => getComputedStyle(x).display !== 'none').map((x) => x.textContent.trim()),
    ov: document.documentElement.scrollWidth - window.innerWidth
  };
});
ok('C2 390 时间轴：第二行只剩「年报」，等分不越界、无横向溢出',
  mt.shown.length === 1 && mt.shown[0] === '年报' &&
  mt.sort.l >= -1 && mt.sort.r <= mt.vw + 1 && mt.ov <= 0,
  `第二行 ${mt.shown.join('/')} ov=${mt.ov}`);

await mp.click('#w-stats-btn');
await mp.waitForTimeout(400);
const ms = await mp.evaluate(() => ({
  ov: document.documentElement.scrollWidth - window.innerWidth,
  cols: getComputedStyle(document.querySelector('.st-cards')).gridTemplateColumns.split(' ').length,
  btn: document.getElementById('w-stats-btn').textContent.trim()
}));
ok('C3 390 年报：2 列、按钮变「返回列表」、无横向溢出',
  ms.ov <= 0 && ms.cols === 2 && ms.btn === '返回列表', `cols=${ms.cols} ov=${ms.ov}`);
ok('C4 390 零 JS 异常', merrs.length === 0, merrs.slice(0, 3).join(' | '));

await browser.close();
console.log(`\n===== 第 92 轮 watch（年报按钮搬进右排）：${pass} PASS / ${fail} FAIL =====`);
process.exit(fail ? 1 : 0);
