/* 第 102 轮 watch 侧上线复验：年报 7 卡 · 按钮恒「年度报告」金底 · 排序输入等宽
 * ⚠️ 第 103 轮改判：三部「最佳」已删（加「观影密度 / 峰值月份」），卡断言按 6 卡口径改写
 *
 * 用户原话（三条）：
 *   1. 删除「有评分」「评分中位数」两栏，加入最佳电影：情书、最佳剧集：是大臣、最佳番剧：冰菓三栏。
 *   2. 编辑界面排序的格子拉长到与年份一致，对齐。
 *   3. 「返回列表」和「年报」的文字统一都改成「年度报告」，且始终保持黄金色底色。
 *
 * 复验口径：
 *   ① 指纹 8 —— HTML 引用 v=41/v=32、css/js/html 字节 md5 与本地全等（EOL 归一）、
 *      **线上字节里确有本轮判据**：JS 有 BEST_PICKS 三部「最佳」且 median 计算删净、
 *      按钮 textContent='年度报告' 且旧三元删净；CSS 无 118px 定宽、按钮金底规则在、
 *      seg/sort 幽灵样式未动；HTML 类名 w-input-order 保留、按钮初始文案「年度报告」
 *   ② 1920 运行时 6 —— 7 卡逐项正确且旧两卡不在、七卡同一行、时间轴/年报两态按钮
 *      恒文案恒金底（aria-pressed 仍切换）、排序/年份/观影日期等宽 ±2px、零溢出零异常
 *   ③ 390 运行时 2 —— 七卡回 2 列 + 按钮恒文案金底、零溢出零异常
 *
 * ⚠️ 线上字节一律在页内 fetch 回传（Node 直连 github.io 不通），统一 --no-proxy-server。
 * ⚠️ 全程只读：只打开添加表单量宽度（不提交、不录数据），不会产生任何 PUT。
 */
import { createRequire } from 'module';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const SITE = process.env.ONLINE_SITE || 'https://hyouka-721.github.io/Steam-playtime/';
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const TS = Date.now();
const rd = (p) => fs.readFileSync(ROOT + 'docs/' + p, 'utf8').replace(/\r\n/g, '\n');
const md5 = (b) => crypto.createHash('md5').update(b).digest('hex');
const norm = (s) => String(s).replace(/\r\n/g, '\n');
const md5txt = (s) => md5(Buffer.from(norm(s), 'utf8'));
const stripJsCmt = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');

const localHtml = rd('watch.html');
const localCss = rd('watch.css');
const localJs = rd('watch.js');

let pass = 0, fail = 0;
const ok = (n, c, extra = '') => {
  c ? (pass++, console.log(`PASS ${n}${extra ? '  — ' + extra : ''}`))
    : (fail++, console.log(`FAIL ${n}  — ${extra}`));
};

const browser = await chromium.launch({ args: ['--no-proxy-server'] });

/* ---------------- ① 内容指纹 ---------------- */
console.log('== ① 内容指纹 ==');
const ctx0 = await browser.newContext({ viewport: { width: 1920, height: 1200 }, serviceWorkers: 'block' });
const p0 = await ctx0.newPage();
await p0.goto(SITE + 'watch.html?t=' + TS, { waitUntil: 'load', timeout: 45000 });
await p0.waitForFunction(() => document.querySelectorAll('#w-grid .poster').length > 20, null, { timeout: 45000 }).catch(() => {});

const html = await p0.evaluate(async (u) => (await fetch(u, { cache: 'reload' })).text(), SITE + 'watch.html?t=' + TS);
const liveCss = await p0.evaluate(async (u) => (await fetch(u, { cache: 'reload' })).text(), SITE + 'watch.css?v=41&t=' + TS);
const liveJs = await p0.evaluate(async (u) => (await fetch(u, { cache: 'reload' })).text(), SITE + 'watch.js?v=33&t=' + TS);
const liveJsNC = stripJsCmt(liveJs);
const liveCssNC = stripJsCmt(liveCss);
const htmlNC = html.replace(/<!--[\s\S]*?-->/g, '');

ok('A1 线上 watch.html 引用 watch.css?v=41 / watch.js?v=33',
  /watch\.css\?v=41/.test(html) && /watch\.js\?v=33/.test(html),
  (html.match(/watch\.(css|js)\?v=\d+/g) || []).join(' '));
ok('A2 线上 watch.css 字节 md5 与本地全等（EOL 归一）', md5txt(liveCss) === md5txt(localCss),
  `${md5txt(liveCss).slice(0, 12)} / ${md5txt(localCss).slice(0, 12)}`);
ok('A3 线上 watch.js 字节 md5 与本地全等（EOL 归一）', md5txt(liveJs) === md5txt(localJs),
  `${md5txt(liveJs).slice(0, 12)} / ${md5txt(localJs).slice(0, 12)}`);
ok('A4 线上 watch.html 字节 md5 与本地全等（EOL 归一）', md5txt(html) === md5txt(localHtml),
  `${md5txt(html).slice(0, 12)} / ${md5txt(localHtml).slice(0, 12)}`);

/* 第 103 轮改判（用户「删最佳三栏、上线密度与峰值月份」）：线上 JS 应为 6 卡版，
   BEST_PICKS 与三部「最佳」删净，密度/峰值计算就位。 */
ok('A5 线上 JS：BEST_PICKS 与三部「最佳」删净、cards 数组 6 项（密度/峰值在）、median/sortedR 计算删净、「有评分」「评分中位数」卡删净',
  !/BEST_PICKS|k: '最佳电影'|k: '最佳剧集'|k: '最佳番剧'/.test(liveJsNC) &&
  /var dayList = Object\.keys\(daySet\)\.sort\(\);/.test(liveJsNC) &&
  /var density = dayList\.length && spanDays \? dayList\.length \/ spanDays \* 100 : 0;/.test(liveJsNC) &&
  /\{ k: '观影密度', v: dayList\.length \? density\.toFixed\(1\) : '—', u: '%' \}/.test(liveJsNC) &&
  /\{ k: '峰值月份', v: topMonthN \? topMonthK : '—', u: topMonthN \? topMonthN \+ ' 部' : '' \}/.test(liveJsNC) &&
  (liveJsNC.match(/\{ k: '记录总数', v: String\(items\.length\)/g) || []).length === 1 &&
  !/k: '有评分'/.test(liveJsNC) && !/k: '评分中位数'/.test(liveJsNC) &&
  !/var sortedR|var median|\.median\b/.test(liveJsNC));

/* 第 102 轮硬证据 2：按钮两态恒「年度报告」，旧三元与旧文案删净（口径同 verify102 A3）。
   ⚠️ 「年报」二字在 // 行注释里合法存在（剥块注释剥不掉行注释），不做全文负面断言。 */
ok('A6 线上 JS：statsBtnEl.textContent = \'年度报告\'（无三元换文案）、旧「返回列表」文案删净、aria-pressed/is-on 状态切换仍在',
  /statsBtnEl\.textContent = '年度报告';/.test(liveJsNC) &&
  !/statsBtnEl\.textContent = statsOn/.test(liveJsNC) &&
  !/'返回列表'/.test(liveJsNC) &&
  /aria-pressed/.test(liveJsNC) && /is-on/.test(liveJsNC));

/* 第 102 轮硬证据 3：线上 CSS 无 118px 定宽、按钮金底规则在、seg/sort 幽灵样式未动。 */
ok('A7 线上 CSS：.w-input.w-input-order 定宽规则删净；.w-sort .w-stats-btn 金底（accent-wash + accent 字 + 600）；.w-seg-btn/.w-sort-btn 幽灵样式未动',
  !/\.w-input\.w-input-order \{/.test(liveCssNC) &&
  /\.w-sort \.w-stats-btn \{[^}]*color: var\(--accent\); background: var\(--accent-wash\); font-weight: 600;/.test(liveCssNC) &&
  /\.w-sort \.w-stats-btn:hover \{ color: var\(--accent\); \}/.test(liveCssNC) &&
  /\.w-seg-btn \{[^}]*background: none/.test(liveCssNC) &&
  /\.w-sort-btn\.is-on/.test(liveCssNC));

ok('A8 线上 HTML：排序输入类名 w-input-order 保留、年报按钮初始文案「年度报告」且 hidden 在 HTML 上',
  /class="w-input w-input-order" type="number" id="add-order"/.test(htmlNC) &&
  /id="w-stats-btn"[^>]*hidden[^>]*>年度报告<\/button>/.test(htmlNC));
await ctx0.close();

/* ---------------- ② 1920 运行时 ---------------- */
console.log('== ② 1920 运行时 ==');
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1200 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
await page.goto(SITE + 'watch.html?t=' + TS, { waitUntil: 'load', timeout: 45000 });
await page.waitForSelector('#w-grid .poster', { timeout: 45000 });

/* 编辑（新增）表单字段宽度（第 102 轮需求 ②）：打开「+」表单量宽度，量完关掉，不提交。 */
await page.click('#w-fab');
await page.waitForFunction(() => {
  const c = document.getElementById('add-order');
  return c && c.getBoundingClientRect().width > 0;
}, null, { timeout: 15000 });
const widths = await page.evaluate(() => {
  const w = (id) => { const e = document.getElementById(id); if (!e) return -1; return Math.round(e.getBoundingClientRect().width); };
  return { order: w('add-order'), year: w('add-year'), watched: w('add-watched') };
});
ok('B1 编辑（新增）弹窗：排序输入与年份、观影日期等宽 ±2px（118px 定宽删除后的新事实）',
  widths.order > 0 && Math.abs(widths.order - widths.year) <= 2 && Math.abs(widths.order - widths.watched) <= 2,
  `排序=${widths.order} 年份=${widths.year} 观影日期=${widths.watched}`);
await page.click('#w-add-close');
await page.waitForTimeout(300);

/* 年报按钮只在时间轴出现（第 93 轮契约）：先切时间轴再点按钮。 */
await page.click('#w-avatar');
await page.waitForSelector('#w-tl .tl-item', { timeout: 45000 });
const tlBtn = await page.evaluate(() => {
  const b = document.getElementById('w-stats-btn');
  const cs = getComputedStyle(b);
  return { text: b.textContent.trim(), bg: cs.backgroundColor, color: cs.color, pressed: b.getAttribute('aria-pressed'), hidden: b.hidden };
});
ok('B2 时间轴态：按钮恒「年度报告」（不再叫「年报」）、金底常驻、aria-pressed=false',
  tlBtn.text === '年度报告' && tlBtn.bg === 'rgba(232, 176, 75, 0.13)' &&
  tlBtn.pressed === 'false' && !tlBtn.hidden,
  `text=${tlBtn.text} bg=${tlBtn.bg} pressed=${tlBtn.pressed}`);
await page.click('#w-stats-btn');
await page.waitForSelector('.st-panel[data-panel="buckets"] svg.st-pie-chart', { timeout: 25000 });
await page.waitForTimeout(900);
await page.mouse.move(1, 1);

const r = await page.evaluate(() => {
  const b = (e) => { const x = e.getBoundingClientRect(); return { l: Math.round(x.left), t: Math.round(x.top), w: Math.round(x.width) }; };
  const cards = [...document.querySelectorAll('.st-card')].map((e) => ({
    k: (e.querySelector('.st-k') || e.querySelector('.st-card-k') || {}).textContent || '',
    v: (e.querySelector('.st-v') || e.querySelector('.st-card-v') || {}).textContent || '',
    /* 第 103 轮改判补 u：峰值月份/观影密度断言用到单位（verify102 同款修复）。 */
    u: (e.querySelector('.st-u') || {}).textContent || '',
    ...b(e)
  }));
  const btn = document.getElementById('w-stats-btn');
  const cs = getComputedStyle(btn);
  return {
    cards,
    btn: { text: btn.textContent.trim(), bg: cs.backgroundColor, pressed: btn.getAttribute('aria-pressed') },
    hasRated: /有评分/.test(document.querySelector('.st-cards').textContent),
    hasMedian: /评分中位数/.test(document.querySelector('.st-cards').textContent),
    ov: document.documentElement.scrollWidth - document.documentElement.clientWidth
  };
});

/* 第 103 轮改判：删三部「最佳」、加「观影密度 / 峰值月份」，7 卡 → 6 卡。 */
ok('B3 年报 6 卡：键名顺序与数值逐项正确（124 / 7.70 / 46.0 / 115 / 3.6% / 7月·16 部），旧「有评分」「评分中位数」与三部「最佳」不在 DOM',
  r.cards.length === 6 &&
  r.cards.map((c) => c.k).join('/') === '记录总数/平均评分/≥8 分占比/观影天数/观影密度/峰值月份' &&
  r.cards[0].v === '124' && r.cards[1].v === '7.70' && r.cards[2].v === '46.0' &&
  r.cards[3].v === '115' && r.cards[4].v === '3.6' && r.cards[4].u === '%' &&
  r.cards[5].v === '7月' && r.cards[5].u === '16 部' &&
  !r.hasRated && !r.hasMedian,
  r.cards.map((c) => `${c.k}=${c.v}`).join(' '));

ok('B4 六卡严格并列同一行：top 全等、left 依次递增',
  r.cards.every((c) => c.t === r.cards[0].t) &&
  r.cards.every((c, i) => i === 0 || c.l > r.cards[i - 1].l),
  `top=${r.cards.map((c) => c.t).join('/')} left=${r.cards.map((c) => c.l).join('/')}`);

ok('B5 年报态：按钮仍恒「年度报告」、金底与时间轴全等、aria-pressed=true（状态语义保留）',
  r.btn.text === '年度报告' && r.btn.bg === 'rgba(232, 176, 75, 0.13)' && r.btn.pressed === 'true',
  `text=${r.btn.text} bg=${r.btn.bg} pressed=${r.btn.pressed}`);

ok('B6 1920 无横向溢出 + 零 JS 异常', r.ov <= 0 && errs.length === 0, `ov=${r.ov} err=${errs.length}`);
await ctx.close();

/* ---------------- ③ 390 运行时 ---------------- */
console.log('== ③ 390 ==');
const c2 = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
const p2 = await c2.newPage();
const e2 = [];
p2.on('pageerror', (e) => e2.push(String(e)));
await p2.goto(SITE + 'watch.html?t=' + TS, { waitUntil: 'load', timeout: 45000 });
await p2.waitForSelector('#w-grid .poster', { timeout: 45000 });
await p2.click('#w-avatar');
await p2.waitForSelector('#w-tl .tl-item', { timeout: 45000 });
const mBtn = await p2.evaluate(() => {
  const b = document.getElementById('w-stats-btn');
  const cs = getComputedStyle(b);
  return { text: b.textContent.trim(), bg: cs.backgroundColor, hidden: b.hidden };
});
await p2.click('#w-stats-btn');
await p2.waitForSelector('.st-panel[data-panel="buckets"] svg.st-pie-chart', { timeout: 25000 });
await p2.waitForTimeout(900);
const m2 = await p2.evaluate(() => {
  const t = (e) => Math.round(e.getBoundingClientRect().top);
  const cards = [...document.querySelectorAll('.st-card')].map((e) => t(e));
  const distinctRows = new Set(cards).size;
  const cols = getComputedStyle(document.querySelector('.st-cards')).gridTemplateColumns.split(' ').length;
  const btn = document.getElementById('w-stats-btn');
  const cs = getComputedStyle(btn);
  return {
    cardRows: distinctRows, cardCols: cols, cardN: cards.length,
    btn: { text: btn.textContent.trim(), bg: cs.backgroundColor },
    ov: document.documentElement.scrollWidth - document.documentElement.clientWidth
  };
});
/* 第 103 轮改判：7 卡 → 6 卡（2 列 × 3 行）。 */
ok('C1 390 六卡回 2 列（860 块 repeat(2)，2 列 × 3 行）、按钮仍恒「年度报告」金底',
  m2.cardN === 6 && m2.cardCols === 2 && m2.cardRows === 3 &&
  m2.btn.text === '年度报告' && m2.btn.bg === 'rgba(232, 176, 75, 0.13)',
  `卡=${m2.cardN} 列=${m2.cardCols} 行=${m2.cardRows} text=${m2.btn.text} bg=${m2.btn.bg}`);
ok('C2 390 无横向溢出 + 零 JS 异常（时间轴按钮 hidden 由 HTML 起步，无首屏「年报」闪烁）',
  m2.ov <= 0 && e2.length === 0 && mBtn.text === '年度报告' && !mBtn.hidden,
  `ov=${m2.ov} err=${e2.length} tlText=${mBtn.text}`);
await c2.close();

await browser.close();
console.log('');
console.log(`第 102 轮上线复验：${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
