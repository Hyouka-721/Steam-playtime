/* 第 94 轮 watch 侧回归：年报维度扩容 + 头部精简 + 图表美观
 *
 * 本轮四件事：
 *   ① 按用户要求删掉「XX 类型 · 共 N 条记录 · 全部由当前数据现场派生」副标题
 *      与「统计年份」label（⚠️ label 只视觉删掉，select 补 aria-label 保住可访问名称）
 *   ② 新增「逐年趋势」面板 + 「评分中位数」「≥8 分占比」两张卡（4 卡 → 6 卡）
 *   ③ 图表美观：基线 / 空值灰桩 / 不对称 12 栅格 / 柱渐变反转 / 横条刻度 /
 *      类型三档明度 / 入场动效 + 面板 hover
 *   ④ 每个面板挂 data-panel，套件改成「按面板取数」
 *
 * 口径要点：
 *   · 逐年趋势**不吃年份下拉**（选某年时高亮那根柱，而不是把图缩成一根），但跟随类型筛选
 *   · 全部数字现场派生，不加字段、不发请求
 *   · 中位数偶数条取中间两值平均；≥8 分占比分母是「有评分」条数
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
const cssRaw = rd('watch.css');
const css = stripCmt(cssRaw);
const data = JSON.parse(rd('data/watch.json'));
const N = data.items.length;

/* 与报表同一口径的本地期望值 */
const RATED = data.items.filter((x) => Number(x.rating) > 0).map((x) => Number(x.rating));
const AVG = (RATED.reduce((a, b) => a + b, 0) / RATED.length).toFixed(2);
const SR = RATED.slice().sort((a, b) => a - b);
const MID = Math.floor(SR.length / 2);
const MEDIAN = (SR.length % 2 ? SR[MID] : (SR[MID - 1] + SR[MID]) / 2).toFixed(2);
const HIGHPCT = (RATED.filter((r) => r >= 8).length / RATED.length * 100).toFixed(1);
const DAYS = new Set(data.items.map((x) => String(x.watched_at || '').slice(0, 10))).size;
const YEARS = new Set(data.items.map((x) => String(x.watched_at || '').slice(0, 4))).size;

let pass = 0, fail = 0;
const ok = (n, c, extra = '') => {
  c ? (pass++, console.log(`PASS ${n}${extra ? '  — ' + extra : ''}`))
    : (fail++, console.log(`FAIL ${n}  — ${extra}`));
};

/* ---------------- A 静态契约 ---------------- */
console.log('== A 静态契约 ==');
ok('A1 版本号 bump：watch.html 引用 watch.css?v=41 / watch.js?v=32',
  /watch\.css\?v=41/.test(html) && /watch\.js\?v=32/.test(html),
  (html.match(/watch\.(css|js)\?v=\d+/g) || []).join(' '));

ok('A2 头部：副标题与「统计年份」label 的 DOM 已删，select 补 aria-label 保住可访问名称',
  !/st-sub/.test(js) && !/st-label/.test(js) && !/st-sub/.test(html) && !/st-label/.test(html) &&
  /id="st-year" aria-label="统计年份"/.test(js));

/* 第 101 轮改判（用户「删除类型构成和高频标签两个选项卡」）：面板从 6 个减到 4 个，
   顺序 月度 / 评分区间 / 国别 / 逐年，另加下方年度影视；kinds / tags 连标记一起消失。 */
ok('A3 每个面板都挂 data-panel（months / buckets / country / years / top），且 kinds / tags 已删净',
  ['months', 'buckets', 'country', 'years', 'top']
    .every((k) => new RegExp('data-panel="' + k + '"').test(js)) &&
  !/data-panel="kinds"/.test(js) && !/data-panel="tags"/.test(js));

const spanOf = (k) => {
  const m = css.match(new RegExp('\\.st-panel\\[data-panel="' + k + '"\\]\\s*\\{\\s*grid-column:\\s*span\\s*(\\d+)'));
  return m ? Number(m[1]) : 0;
};
/* 第 101 轮改判＋宽度微调（用户「缩小评分区间和国别构成、增大月度分布和逐年趋势」）：
   四块改为 4+2+2+4 = 12 栏：柱图宽、饼窄，单行铺满不留空档。 */
ok('A4 面板 12 栅格：月度/逐年各 4 栏、评分区间/国别各 2 栏（4+2+2+4 = 12），单行铺满不留空档',
  /\.st-panels\s*\{[\s\S]*?grid-template-columns:\s*repeat\(12,/.test(css) &&
  spanOf('months') === 4 && spanOf('buckets') === 2 &&
  spanOf('country') === 2 && spanOf('years') === 4,
  `months=${spanOf('months')} buckets=${spanOf('buckets')} ` +
  `country=${spanOf('country')} years=${spanOf('years')} / 合计 ${['months','buckets','country','years'].reduce((s,k)=>s+spanOf(k),0)}`);

ok('A5 🔴 860 块里有面板跨度复位（否则容器 1 列 + 子项还 span 4/2 会横向溢出）',
  /@media \(max-width: 860px\)[\s\S]*?\.w-stats \.st-panel\[data-panel\] \{ grid-column: auto; \}/.test(css));

const m860 = css.match(/@media \(max-width: 860px\)/g) || [];
ok('A6 本轮没新增断点：全文件仍只有 1 个 @media (max-width:860px)', m860.length === 1, `${m860.length} 个`);

/* 圆角白名单：把新增几段的圆角值逐个取出比对 */
const newSlice = (css.match(/\.st-plot \{[\s\S]{0,1400}/) || [''])[0];
const radii = [...newSlice.matchAll(/border-radius:\s*([^;]+);/g)].map((m) => m[1].trim());
ok('A7 新规则圆角只用令牌 / 50% / 2px（共 ' + radii.length + ' 处）',
  radii.length > 0 && radii.every((v) =>
    v.split(/\s+/).every((x) => /^var\(--r-(xs|sm|md|lg|pill)\)$/.test(x) || x === '50%' || x === '2px')),
  radii.join(' / '));

ok('A8 美观 #6 刻度层：.st-row-track::after 用 25% 背景尺寸画三道刻度',
  /\.st-row-track::after[\s\S]*?background-size:\s*25% 100%/.test(css));

/* ---------------- B 1440 运行时 ---------------- */
console.log('== B 1440 运行时 ==');
const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
await page.goto(BASE + 'watch.html', { waitUntil: 'load' });
await page.waitForSelector('#w-grid .poster', { timeout: 15000 });
await page.click('#w-avatar');
await page.waitForSelector('#w-tl .tl-item', { timeout: 15000 });
await page.click('#w-stats-btn');
await page.waitForTimeout(700);

const probe = () => page.evaluate(() => {
  const q = (s) => document.querySelectorAll(s).length;
  /* 第 101 轮：面板删到 4 个，历史几何取数一律 null-safe，避免访问已删节点直接抛异常 */
  const box = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect();
    return { l: Math.round(b.left), w: Math.round(b.width), t: Math.round(b.top) }; };
  return {
    cards: [...document.querySelectorAll('.st-card')].map((c) => ({
      k: c.querySelector('.st-k').textContent.trim(),
      v: c.querySelector('.st-v').textContent.trim()
    })),
    panels: [...document.querySelectorAll('.st-panel')].map((p) => p.dataset.panel),
    barsMonth: q('[data-panel="months"] .st-bar'),
    barsYear: q('[data-panel="years"] .st-bar'),
    rowsKind: q('[data-panel="kinds"] .st-row'),
    rowsBucket: q('[data-panel="buckets"] .st-row'),
    chips: q('.st-chip'), top: q('.st-top-item'),
    emptyBars: q('.st-bar i.is-empty'),
    onLab: [...document.querySelectorAll('[data-panel="years"] .st-bar-lab.is-on')].map((x) => x.textContent.trim()),
    subCount: q('.st-sub'), labelCount: q('.st-label'),
    ariaLabel: (document.getElementById('st-year') || {}).getAttribute
      ? document.getElementById('st-year').getAttribute('aria-label') : '',
    baseline: (() => { const e = document.querySelector('[data-panel="months"] .st-plot');
      return e ? getComputedStyle(e).borderBottomWidth : ''; })(),
    barBg: (() => { const e = document.querySelector('[data-panel="months"] .st-bar i');
      return e ? getComputedStyle(e).backgroundImage : ''; })(),
    /* 第 101 轮：类型/标签面板已删，轨道与 chip 都应为 0；几何只需四块 + 容器 */
    tracks: document.querySelectorAll('.st-row-track').length,
    kindBgs: [...document.querySelectorAll('[data-panel="kinds"] .st-row-track i')]
      .map((e) => getComputedStyle(e).backgroundImage),
    tickContent: (() => { const e = document.querySelector('[data-panel="kinds"] .st-row-track');
      return e ? getComputedStyle(e, '::after').content : ''; })(),
    boxMonths: box('[data-panel="months"]'), boxBuckets: box('[data-panel="buckets"]'),
    boxPanels: box('.st-panels'), boxCountry: box('[data-panel="country"]'),
    boxYears: box('[data-panel="years"]'),
    ov: document.documentElement.scrollWidth - document.documentElement.clientWidth
  };
});

const r = await probe();
const card = (k) => (r.cards.find((c) => c.k === k) || {}).v;
/* 第 102 轮改判：删「有评分 / 评分中位数」、加用户指定的三部「最佳」，6 卡 → 7 卡。 */
ok('B1 七张卡，键名与顺序：记录总数 / 平均评分 / ≥8 分占比 / 观影天数 / 最佳电影 / 最佳剧集 / 最佳番剧',
  r.cards.length === 7 &&
  r.cards.map((c) => c.k).join('/') === '记录总数/平均评分/≥8 分占比/观影天数/最佳电影/最佳剧集/最佳番剧',
  r.cards.map((c) => c.k).join('/'));

ok('B2 七卡数字与本地同口径推导全等（数字四卡 + 最佳三卡）',
  card('记录总数') === String(N) &&
  card('平均评分') === AVG &&
  card('≥8 分占比') === HIGHPCT && card('观影天数') === String(DAYS) &&
  card('最佳电影') === '情书' && card('最佳剧集') === '是大臣' && card('最佳番剧') === '冰菓',
  `${card('平均评分')}/${card('≥8 分占比')}/${card('观影天数')} vs ${AVG}/${HIGHPCT}/${DAYS} · 最佳 ${card('最佳电影')}/${card('最佳剧集')}/${card('最佳番剧')}`);

ok('B3 头部只剩标题 + 下拉：副标题与「统计年份」字样都不在，aria-label 仍在',
  r.subCount === 0 && r.labelCount === 0 && r.ariaLabel === '统计年份');

/* 第 101 轮改判：用户删掉类型 / 标签两块，并把剩下四块按顺序并进同一行，
   所以面板顺序从「月度/区间/类型/逐年/国别/标签/Top」变成「月度/区间/国别/逐年/年度影视」。 */
ok('B4 面板齐备且顺序为 月度 / 评分区间 / 国别 / 逐年 / 年度影视（第 101 轮四卡一行）',
  r.panels.join('/') === 'months/buckets/country/years/top', r.panels.join('/'));

/* 第 101 轮改判：类型 3 行 / 标签 chips 随面板删除归零；其余内容口径原样守。 */
ok('B5 内容齐备：12 月柱 / 逐年柱=9 / 区间 5 行 / 年度影视 9 条；类型行与标签 chip 已删净',
  r.barsMonth === 12 && r.barsYear === YEARS && r.rowsKind === 0 && r.rowsBucket === 5 &&
  r.chips === 0 && r.top === 9,
  `月=${r.barsMonth} 年=${r.barsYear} 类型=${r.rowsKind} 区间=${r.rowsBucket} chips=${r.chips}`);

/* 第 101 轮宽度微调改判：柱图（月度/逐年）各 4/12、饼（区间/国别）各 2/12，同类等宽、严格并列同一行。 */
ok('B6 版式：柱图各 4/12、饼各 2/12（约 2:1）、严格并列同一行，年度影视落在下一行',
  Math.abs(r.boxMonths.w / r.boxPanels.w - 4 / 12) < 0.03 &&
  Math.abs(r.boxYears.w / r.boxPanels.w - 4 / 12) < 0.03 &&
  Math.abs(r.boxBuckets.w / r.boxPanels.w - 2 / 12) < 0.03 &&
  Math.abs(r.boxCountry.w / r.boxPanels.w - 2 / 12) < 0.03 &&
  Math.abs(r.boxMonths.w - r.boxYears.w) <= 2 &&
  Math.abs(r.boxBuckets.w - r.boxCountry.w) <= 2 &&
  r.boxMonths.t === r.boxBuckets.t && r.boxBuckets.t === r.boxCountry.t &&
  r.boxCountry.t === r.boxYears.t && r.boxMonths.l < r.boxBuckets.l &&
  r.boxBuckets.l < r.boxCountry.l && r.boxCountry.l < r.boxYears.l,
  `容器 ${r.boxPanels.w} / ${['boxMonths','boxBuckets','boxCountry','boxYears'].map((k)=>k+'='+r[k].w+'@'+r[k].t+'/'+r[k].l).join(' ')}`);

ok('B7 美观 #2 基线：.st-plot 有 1px 下边线（柱子落地，不再是飘着）',
  r.baseline === '1px', `border-bottom=${r.baseline}`);

ok('B8 美观 #5 柱渐变反转：顶端半透明、底端实色',
  /linear-gradient\(rgba?\([^)]*0\.5\)?,\s*rgb\(/.test(r.barBg.replace(/\s+/g, ' ')) ||
  /^linear-gradient\(rgba\(232, 176, 75, 0\.5\), rgb\(232, 176, 75\)\)$/.test(r.barBg),
  r.barBg.slice(0, 70));

/* 第 101 轮改判：横条轨道随「类型构成 / 高频标签」一起删光，CSS 里的 ::after 刻度规则
   由 A8 静态守着（历史样式留档），运行时不该再有任何轨道节点。 */
ok('B9 刻度规则仍留在 CSS（A8），但运行时已无横条轨道节点（两面板删净）',
  r.tracks === 0 && r.kindBgs.length === 0 && r.tickContent === '',
  `轨道 ${r.tracks} / 类型底色 ${r.kindBgs.length} / 刻度 ${r.tickContent}`);

/* 第 101 轮改判：类型三档明度样式随「类型构成」面板删除，改成守「明度规则已删」。 */
ok('B10 类型三档明度规则已随面板删除（CSS 里不再有 [data-panel="kinds"] 覆盖）',
  !/\[data-panel="kinds"\]/.test(css) && r.kindBgs.length === 0,
  `CSS 命中 ${(/\[data-panel="kinds"\]/.test(css) ? 1 : 0)} / 运行时底色 ${r.kindBgs.length} 条`);

ok('B11 美观 #3 当前数据没有 0 条月份，空值灰桩不误报（is-empty 只给真正的 0）',
  r.emptyBars === 0, `is-empty ${r.emptyBars} 根`);

/* 逐年趋势不吃年份下拉：选 2020 后柱数不变、2020 那根高亮 */
await page.selectOption('#st-year', '2020');
await page.waitForTimeout(450);
const r2 = await probe();
ok('B12 逐年趋势不吃年份下拉：选 2020 后柱子数不变，2020 那根标 is-on',
  r2.barsYear === YEARS && r2.onLab.join(',') === '2020',
  `柱 ${r2.barsYear} 高亮=${r2.onLab.join(',') || '无'}`);

await page.selectOption('#st-year', '');
await page.waitForTimeout(400);
ok('B13 1440 无横向溢出 + 零 JS 异常', r.ov <= 0 && errs.length === 0, `ov=${r.ov} err=${errs.length}`);
await ctx.close();

/* ---------------- B14 空值柱：造一份「只有 1 月有记录」的数据 ---------------- */
console.log('== B14 空值灰桩（造数） ==');
const mock = {
  updated_at: '2026-11-14T00:00:00+08:00',
  items: [
    { id: '2020-01-01-a', title: '一月片A', kind: 'movie', watched_at: '2020-01-01', year: 2020, rating: 8, poster: '', note: '' },
    { id: '2020-01-02-b', title: '一月片B', kind: 'series', watched_at: '2020-01-05', year: 2020, rating: 9, poster: '', note: '' },
    { id: '2020-01-03-c', title: '一月片C', kind: 'anime', watched_at: '2020-01-09', year: 2020, rating: 7, poster: '', note: '' }
  ]
};
const c2 = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
const p2 = await c2.newPage();
const e2 = [];
p2.on('pageerror', (e) => e2.push(String(e)));
/* manifest 置 404 → 走「对账失败回退整份主文件」的老路 */
await p2.route('**/data/watch/manifest.json*', (r) => r.fulfill({ status: 404, body: '' }));
await p2.route('**/data/watch.json*', (r) => r.fulfill({
  status: 200, contentType: 'application/json', body: JSON.stringify(mock)
}));
await p2.goto(BASE + 'watch.html', { waitUntil: 'load' });
await p2.waitForSelector('#w-grid .poster', { timeout: 15000 });
await p2.click('#w-avatar');
await p2.waitForSelector('#w-tl .tl-item', { timeout: 15000 });
await p2.click('#w-stats-btn');
await p2.waitForTimeout(600);
const m = await p2.evaluate(() => {
  const bars = [...document.querySelectorAll('[data-panel="months"] .st-bar')];
  const empties = bars.filter((b) => b.querySelector('i.is-empty'));
  return {
    total: bars.length, empties: empties.length,
    stubH: empties.length ? getComputedStyle(empties[0].querySelector('i')).minHeight : '',
    numText: empties.length ? empties[0].querySelector('.st-bar-num').textContent.trim() : '',
    yearsBars: document.querySelectorAll('[data-panel="years"] .st-bar').length,
    cards: document.querySelectorAll('.st-card').length,
    bestMovie: (document.querySelectorAll('.st-card .st-v')[4] || {}).textContent || '',
    pct: (document.querySelectorAll('.st-card .st-v')[2] || {}).textContent || ''
  };
});
ok('B14 空值灰桩：12 根柱里 11 根 is-empty、灰桩高 3px、数字位留空（「这个月没看」也是信息）',
  m.total === 12 && m.empties === 11 && m.stubH === '3px' && m.numText === '',
  `柱 ${m.total} 空 ${m.empties} 高 ${m.stubH}`);
/* 第 102 轮改判：6 卡 → 7 卡（删中位数、加三部「最佳」），中位数断言换成最佳电影卡。 */
ok('B15 小样本退化正常：1 个年份 1 根柱、7 卡仍在、最佳电影=情书、≥8 占比 66.7%',
  m.yearsBars === 1 && m.cards === 7 && m.bestMovie === '情书' && m.pct === '66.7',
  `年柱 ${m.yearsBars} 最佳电影 ${m.bestMovie} 占比 ${m.pct} err=${e2.length}`);
await c2.close();

/* ---------------- C 390 窄屏 ---------------- */
console.log('== C 390 窄屏 ==');
const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
const mp = await mctx.newPage();
const merrs = [];
mp.on('pageerror', (e) => merrs.push(String(e)));
await mp.goto(BASE + 'watch.html', { waitUntil: 'load' });
await mp.waitForSelector('#w-grid .poster', { timeout: 15000 });
await mp.click('#w-avatar');
await mp.waitForSelector('#w-tl .tl-item', { timeout: 15000 });
await mp.click('#w-stats-btn');
await mp.waitForTimeout(700);
const mm = await mp.evaluate(() => {
  const cols = (s) => getComputedStyle(document.querySelector(s)).gridTemplateColumns.split(' ').length;
  const labs = [...document.querySelectorAll('[data-panel="months"] .st-bar-lab')];
  const rects = labs.map((x) => x.getBoundingClientRect());
  let overlap = 0;
  for (let i = 1; i < rects.length; i++) if (rects[i].left < rects[i - 1].right - 0.5) overlap++;
  return {
    cardCols: cols('.st-cards'), panelCols: cols('.st-panels'),
    monthsW: Math.round(document.querySelector('[data-panel="months"]').getBoundingClientRect().width),
    vw: window.innerWidth, labs: labs.length, overlap,
    ov: document.documentElement.scrollWidth - window.innerWidth
  };
});
ok('C1 390：6 卡收成 2 列、面板单列（跨度已复位，months 不越界）、无横向溢出',
  mm.cardCols === 2 && mm.panelCols === 1 && mm.monthsW <= mm.vw &&
  mm.ov <= 0, `卡片 ${mm.cardCols} 列 / 面板 ${mm.panelCols} 列 / months ${mm.monthsW} / ov=${mm.ov}`);
ok('C2 390：12 个轴标签都在且互不重叠（轴区独立成行后标签不再被柱子挤）',
  mm.labs === 12 && mm.overlap === 0, `标签 ${mm.labs} 重叠 ${mm.overlap}`);
ok('C3 390 零 JS 异常', merrs.length === 0, merrs.slice(0, 3).join(' | '));

await browser.close();
console.log(`\n===== 第 94 轮 watch（年报维度扩容 + 图表美化）：${pass} PASS / ${fail} FAIL =====`);
process.exit(fail ? 1 : 0);
