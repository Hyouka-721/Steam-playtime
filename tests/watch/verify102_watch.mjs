/* 第 102 轮 watch 侧：删「有评分 / 评分中位数」两卡 + 加「最佳电影 / 最佳剧集 / 最佳番剧」三卡
   + 年报按钮两态统一「年度报告」且金底常驻 + 编辑表单排序输入拉长到与年份一致
   ⚠️ 第 103 轮改判：三部「最佳」已删（加「观影密度 / 峰值月份」），本套件卡断言按 6 卡口径改写
 *
 * 用户原话：
 *   1. 删除有评分、评分中位数两栏，加入最佳电影：情书，最佳剧集：是大臣，最佳番剧：冰菓三栏。
 *   2. 编辑界面排序的格子拉长到与年份一致，对齐。
 *   3. 返回列表和年报的文字统一都改成「年度报告」，且始终保持黄金色底色。
 *
 * 口径：
 *   ① 静态（剥块注释）：版本 v=41/v=32；cards 7 项、BEST_PICKS 三部片名、median 计算删净；
 *      statsBtnEl.textContent 恒为「年度报告」（不再有三元换文案）；CSS 无 118px 定宽规则、
 *      两处 .w-stats-btn 基础态都是金底（accent-wash）；860 块仍唯一、圆角仍走令牌
 *   ② 1920 运行时：7 卡一行、label/value 逐项正确、旧两卡不在 DOM；按钮两态文字与
 *      computed 金底全等、aria-pressed 仍正确切换；编辑（新增）弹窗 #add-order 与
 *      #add-year 等宽；零溢出零异常
 *   ③ 390：7 卡回 2 列、按钮仍金底、零溢出
 *
 * ⚠️ 全程只读：不点保存、不录数据，不会产生任何 PUT。
 */
import { createRequire } from 'module';
import fs from 'fs';
import { fileURLToPath } from 'url';

const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const BASE = process.env.LOCAL_SITE || 'http://127.0.0.1:8895/';
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const rd = (p) => fs.readFileSync(ROOT + 'docs/' + p, 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\r\n/g, '\n');

const jsNC = strip(rd('watch.js'));
const cssNC = strip(rd('watch.css'));
const html = rd('watch.html');

let pass = 0, fail = 0;
const ok = (n, c, extra = '') => {
  c ? (pass++, console.log(`PASS ${n}${extra ? '  — ' + extra : ''}`))
    : (fail++, console.log(`FAIL ${n}  — ${extra}`));
};

/* ---------------- A 静态 ---------------- */
console.log('== A 静态 ==');
ok('A1 版本 watch.css?v=41 / watch.js?v=33',
  /watch\.css\?v=41/.test(html) && /watch\.js\?v=33/.test(html),
  (html.match(/watch\.(css|js)\?v=\d+/g) || []).join(' '));

/* 第 103 轮改判（用户「删除最佳三栏，上线观影密度卡、峰值月份」）：7 卡 → 6 卡，
   BEST_PICKS 删净，密度 = 有记录天数 ÷ 首末条跨度，峰值月份与月度分布面板同口径。 */
ok('A2 卡片 6 项：三部「最佳」与 BEST_PICKS 删净，密度/峰值计算就位，median 计算删净',
  !/var sortedR|var median|median\.toFixed/.test(jsNC) &&
  !/\{ k: '有评分'|\{ k: '评分中位数'/.test(jsNC) &&
  !/BEST_PICKS|k: '最佳电影'|k: '最佳剧集'|k: '最佳番剧'/.test(jsNC) &&
  /var dayList = Object\.keys\(daySet\)\.sort\(\);/.test(jsNC) &&
  /var density = dayList\.length && spanDays \? dayList\.length \/ spanDays \* 100 : 0;/.test(jsNC) &&
  /var topMonthK = '—';/.test(jsNC) && /var topMonthN = 0;/.test(jsNC) &&
  /months\.forEach\(function \(p\) \{ if \(p\.v > topMonthN\) \{ topMonthN = p\.v; topMonthK = p\.k; \} \}\);/.test(jsNC) &&
  /var cards = \[\n      \{ k: '记录总数'[\s\S]*?\{ k: '峰值月份', v: topMonthN \? topMonthK : '—', u: topMonthN \? topMonthN \+ ' 部' : '' \}\n    \];/.test(jsNC),
  'cards 数组整块按 6 项新序匹配');

ok('A3 按钮两态统一「年度报告」：textContent 恒值，不再有 statsOn 三元换文案',
  /statsBtnEl\.textContent = '年度报告';/.test(jsNC) &&
  !/statsBtnEl\.textContent = statsOn/.test(jsNC) &&
  !/'返回列表'/.test(jsNC) &&
  /hidden>年度报告<\/button>/.test(html),
  '旧三元已删、旧文案已删净');

ok('A4 金底常驻：两处 .w-stats-btn 基础态都是 accent-wash 金底；幽灵样式只许留在 .w-seg-btn / .w-sort-btn',
  /\.w-sort \.w-stats-btn \{[^}]*color: var\(--accent\); background: var\(--accent-wash\); font-weight: 600;/.test(cssNC) &&
  /\.w-stats-btn \{[^}]*color: var\(--accent\);[^}]*background: var\(--accent-wash\);/.test(cssNC) &&
  !/\.w-sort \.w-stats-btn \{[^}]*background: none;/.test(cssNC) &&
  /\.w-seg-btn \{[^}]*background: none;/.test(cssNC) && /\.w-sort-btn \{[^}]*background: none;/.test(cssNC),
  '排序按钮的幽灵底色不动（用户只要求年报按钮金底）');

ok('A5 排序输入 118px 定宽已删（回到 .w-input 的 width:100% 列宽铺满）',
  !/\.w-input\.w-input-order \{/.test(cssNC) &&
  /\.w-input \{[^}]*width: 100%;/.test(cssNC) &&
  /class="w-input w-input-order"/.test(html),
  'HTML 类名保留、CSS 定宽删除');

ok('A6 既有约束未破：860 块仍全文件唯一、本轮两个按钮块的圆角仍走令牌',
  (cssNC.match(/@media \(max-width: 860px\)/g) || []).length === 1 &&
  /\.w-sort \.w-stats-btn \{[^}]*border-radius: var\(--r-sm\)/.test(cssNC) &&
  /\.w-stats-btn \{[^}]*border-radius: var\(--r-md\)/.test(cssNC),
  '860块=' + (cssNC.match(/@media \(max-width: 860px\)/g) || []).length);

/* ---------------- B 1920 运行时 ---------------- */
console.log('== B 1920 运行时 ==');
const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1200 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
await page.goto(BASE + 'watch.html', { waitUntil: 'load', timeout: 20000 });
await page.waitForSelector('#w-grid .poster', { timeout: 20000 });
await page.click('#w-avatar');
await page.waitForSelector('#w-tl .tl-item', { timeout: 20000 });

/* 时间轴态：按钮文字 + 金底 */
const tl = await page.evaluate(() => {
  const b = document.getElementById('w-stats-btn');
  const cs = getComputedStyle(b);
  return { text: b.textContent.trim(), bg: cs.backgroundColor, color: cs.color,
    pressed: b.getAttribute('aria-pressed'), shown: !b.hidden };
});
ok('B1 时间轴态：按钮文字已是「年度报告」、金底常驻（非透明背景）、aria-pressed=false',
  tl.text === '年度报告' && tl.pressed === 'false' && tl.shown &&
  tl.bg !== 'rgba(0, 0, 0, 0)' && tl.bg !== 'none',
  `text=${tl.text} bg=${tl.bg}`);

await page.click('#w-stats-btn');
await page.waitForSelector('.st-panel[data-panel="buckets"] svg.st-pie-chart', { timeout: 10000 });
await page.waitForTimeout(700);
await page.mouse.move(1, 1);

const r = await page.evaluate(() => {
  const b = (e) => { const x = e.getBoundingClientRect(); return { t: Math.round(x.top), l: Math.round(x.left), w: Math.round(x.width) }; };
  const cards = [...document.querySelectorAll('.st-cards .st-card')].map((e) => ({
    k: (e.querySelector('.st-k') || {}).textContent || '',
    v: (e.querySelector('.st-v') || {}).textContent || '',
    u: (e.querySelector('.st-u') || {}).textContent || '',
    ...b(e)
  }));
  const btn = document.getElementById('w-stats-btn');
  const cs = getComputedStyle(btn);
  return {
    cards,
    btnText: btn.textContent.trim(), btnBg: cs.backgroundColor, pressed: btn.getAttribute('aria-pressed'),
    hasOld: !!([...document.querySelectorAll('.st-cards .st-k')].find((e) => /有评分|评分中位数/.test(e.textContent))),
    ov: document.documentElement.scrollWidth - document.documentElement.clientWidth
  };
});

/* 第 103 轮改判：删三部「最佳」、加「观影密度 / 峰值月份」，7 卡 → 6 卡。 */
ok('B2 年报展开：6 张卡、label 顺序正确、密度 3.6% 峰值月份 7月·16 部；「有评分」「评分中位数」与三部「最佳」都不在 DOM',
  r.cards.length === 6 &&
  r.cards.map((c) => c.k).join('/') === '记录总数/平均评分/≥8 分占比/观影天数/观影密度/峰值月份' &&
  r.cards[4].v === '3.6' && r.cards[4].u === '%' &&
  r.cards[5].v === '7月' && r.cards[5].u === '16 部' && !r.hasOld,
  r.cards.map((c) => c.k + '=' + c.v).join(' / '));

ok('B3 1920 六卡同一行（auto-fit 铺满、left 依次递增）',
  r.cards.every((c) => c.t === r.cards[0].t) &&
  r.cards.every((c, i) => i === 0 || c.l > r.cards[i - 1].l),
  'top=' + r.cards.map((c) => c.t).join('/'));

ok('B4 年报态：按钮文字仍「年度报告」、金底与时间轴态全等（不再随态切换）、aria-pressed=true',
  r.btnText === '年度报告' && r.pressed === 'true' && r.btnBg === tl.bg,
  `text=${r.btnText} bg=${r.btnBg}`);

/* 编辑（新增）弹窗：排序输入与年份等宽 */
await page.click('#w-fab');
await page.waitForFunction(() => {
  const c = document.getElementById('add-order');
  return c && c.getBoundingClientRect().width > 0;
}, null, { timeout: 10000 });
const f = await page.evaluate(() => {
  const w = (id) => Math.round(document.getElementById(id).getBoundingClientRect().width);
  return { order: w('add-order'), year: w('add-year'), watched: w('add-watched'),
    ov: document.documentElement.scrollWidth - document.documentElement.clientWidth };
});
ok('B5 弹窗：#add-order 与 #add-year 等宽（±2px，拉长对齐）、与 #add-watched 也一致',
  Math.abs(f.order - f.year) <= 2 && Math.abs(f.order - f.watched) <= 2 && f.ov <= 0,
  `排序=${f.order} 年份=${f.year} 日期=${f.watched}`);
await page.click('#w-add-close');
await page.waitForTimeout(200);

ok('B6 1920 无横向溢出 + 零 JS 异常', r.ov <= 0 && errs.length === 0, `ov=${r.ov} err=${errs.length}`);
await ctx.close();

/* ---------------- C 390 ---------------- */
console.log('== C 390 ==');
const c2 = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
const p2 = await c2.newPage();
const e2 = [];
p2.on('pageerror', (e) => e2.push(String(e)));
await p2.goto(BASE + 'watch.html', { waitUntil: 'load', timeout: 20000 });
await p2.waitForSelector('#w-grid .poster', { timeout: 20000 });
await p2.click('#w-avatar');
await p2.waitForSelector('#w-tl .tl-item', { timeout: 20000 });
await p2.click('#w-stats-btn');
await p2.waitForSelector('.st-card', { timeout: 10000 });
await p2.waitForTimeout(700);
const m = await p2.evaluate(() => {
  const cs = getComputedStyle(document.querySelector('.st-cards'));
  const btn = document.getElementById('w-stats-btn');
  return {
    cols: cs.gridTemplateColumns.split(' ').length,
    cards: document.querySelectorAll('.st-card').length,
    labels: [...document.querySelectorAll('.st-cards .st-k')].map((e) => e.textContent),
    btnText: btn.textContent.trim(),
    btnBg: getComputedStyle(btn).backgroundColor,
    ov: document.documentElement.scrollWidth - document.documentElement.clientWidth
  };
});
/* 第 103 轮改判：7 卡 → 6 卡（2 列 × 3 行），三部「最佳」不在、密度与峰值月份在。 */
ok('C1 390 六卡回 2 列（860 块 repeat(2)，2 列 × 3 行）、旧两卡与三部「最佳」不在',
  m.cols === 2 && m.cards === 6 && m.labels.join('/') === '记录总数/平均评分/≥8 分占比/观影天数/观影密度/峰值月份',
  `列=${m.cols} 卡=${m.cards}`);
ok('C2 390 按钮仍「年度报告」金底、无横向溢出 + 零 JS 异常',
  m.btnText === '年度报告' && m.btnBg === tl.bg && m.ov <= 0 && e2.length === 0,
  `text=${m.btnText} ov=${m.ov} err=${e2.length}`);
await c2.close();

await browser.close();
console.log('');
console.log(`第 102 轮：${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
