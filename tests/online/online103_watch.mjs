/* 第 103 轮 watch 侧上线复验：年报 6 卡（删三部「最佳」+ 加「观影密度」「峰值月份」）
 *
 * 用户原话（两条）：
 *   1. 上线观影密度卡、峰值月份。
 *   2. 删除最佳电影：情书，最佳剧集：是大臣，最佳番剧：冰菓三栏。
 *
 * 复验口径：
 *   ① 指纹 8 —— HTML 引用 v=41/v=33（css 未动仍 41）、css/js/html 字节 md5 与本地全等
 *      （EOL 归一）、线上 JS 6 卡证据（BEST_PICKS 与三部「最佳」删净、密度/峰值计算就位）、
 *      按钮恒「年度报告」金底与 118px 删除（第 102 轮契约延续）
 *   ② 1920 运行时 6 —— 编辑弹窗等宽、时间轴/年报按钮恒文案恒金底、6 卡数值逐项对
 *      （124 / 7.70 / 46.0 / 115 / 3.6% / 7月·16 部）、六卡一行、零溢出零异常
 *   ③ 390 运行时 2 —— 六卡回 2 列（2 列 × 3 行）、零溢出零异常
 *
 * ⚠️ 线上字节一律在页内 fetch 回传，统一 --no-proxy-server。⚠️ 全程只读（打开弹窗量宽度
 * 不提交），不会产生任何 PUT。
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
const stripLineCmt = (s) => s.replace(/\/\/[^\n]*/g, '');

const localHtml = rd('watch.html'), localCss = rd('watch.css'), localJs = rd('watch.js');

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
const liveJsNC = stripLineCmt(stripJsCmt(liveJs));
const htmlNC = html.replace(/<!--[\s\S]*?-->/g, '');

ok('A1 线上 watch.html 引用 watch.css?v=41（css 未动）/ watch.js?v=33',
  /watch\.css\?v=41/.test(html) && /watch\.js\?v=33/.test(html),
  (html.match(/watch\.(css|js)\?v=\d+/g) || []).join(' '));
ok('A2 线上 watch.css 字节 md5 与本地全等（EOL 归一）', md5txt(liveCss) === md5txt(localCss),
  `${md5txt(liveCss).slice(0, 12)} / ${md5txt(localCss).slice(0, 12)}`);
ok('A3 线上 watch.js 字节 md5 与本地全等（EOL 归一）', md5txt(liveJs) === md5txt(localJs),
  `${md5txt(liveJs).slice(0, 12)} / ${md5txt(localJs).slice(0, 12)}`);
ok('A4 线上 watch.html 字节 md5 与本地全等（EOL 归一）', md5txt(html) === md5txt(localHtml),
  `${md5txt(html).slice(0, 12)} / ${md5txt(localHtml).slice(0, 12)}`);

/* 第 103 轮硬证据 1：线上 JS 是 6 卡版 —— BEST_PICKS 与三部「最佳」删净、密度/峰值计算就位。 */
ok('A5 线上 JS：BEST_PICKS 与三部「最佳」删净、cards 数组 6 项（观影密度/峰值月份在）、median/sortedR 计算删净、旧「有评分」「评分中位数」仍删净',
  !/BEST_PICKS|k: '最佳电影'|k: '最佳剧集'|k: '最佳番剧'/.test(liveJsNC) &&
  /var dayList = Object\.keys\(daySet\)\.sort\(\);/.test(liveJsNC) &&
  /var density = dayList\.length && spanDays \? dayList\.length \/ spanDays \* 100 : 0;/.test(liveJsNC) &&
  /\{ k: '观影密度', v: dayList\.length \? density\.toFixed\(1\) : '—', u: '%' \}/.test(liveJsNC) &&
  /\{ k: '峰值月份', v: topMonthN \? topMonthK : '—', u: topMonthN \? topMonthN \+ ' 部' : '' \}/.test(liveJsNC) &&
  (liveJsNC.match(/\{ k: '记录总数', v: String\(items\.length\)/g) || []).length === 1 &&
  !/k: '有评分'/.test(liveJsNC) && !/k: '评分中位数'/.test(liveJsNC) &&
  !/var sortedR|var median|\.median\b/.test(liveJsNC));

/* 第 103 轮硬证据 2：峰值月份与月度分布面板同口径（months 数组的 max，跨年合并「几月」）。 */
ok('A6 线上 JS：峰值月份直接取 months 数组 max（同面板口径、并列取排在前面的月份）',
  /var topMonthK = '—';/.test(liveJsNC) && /var topMonthN = 0;/.test(liveJsNC) &&
  /months\.forEach\(function \(p\) \{ if \(p\.v > topMonthN\) \{ topMonthN = p\.v; topMonthK = p\.k; \} \}\);/.test(liveJsNC));

/* 第 102 轮契约延续：按钮恒「年度报告」金底、118px 删除。 */
ok('A7 线上 JS/CSS：按钮 textContent = \'年度报告\'（无三元换文案）、「返回列表」删净；CSS 无 118px 定宽、按钮金底规则在',
  /statsBtnEl\.textContent = '年度报告';/.test(liveJsNC) &&
  !/statsBtnEl\.textContent = statsOn/.test(liveJsNC) && !/'返回列表'/.test(liveJsNC) &&
  !/\.w-input\.w-input-order \{/.test(stripJsCmt(liveCss)) &&
  /\.w-sort \.w-stats-btn \{[^}]*background: var\(--accent-wash\); font-weight: 600;/.test(stripJsCmt(liveCss)));

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

await page.click('#w-fab');
await page.waitForFunction(() => {
  const c = document.getElementById('add-order');
  return c && c.getBoundingClientRect().width > 0;
}, null, { timeout: 15000 });
const widths = await page.evaluate(() => {
  const w = (id) => { const e = document.getElementById(id); if (!e) return -1; return Math.round(e.getBoundingClientRect().width); };
  return { order: w('add-order'), year: w('add-year'), watched: w('add-watched') };
});
ok('B1 编辑（新增）弹窗：排序输入与年份、观影日期等宽 ±2px（第 102 轮契约延续）',
  widths.order > 0 && Math.abs(widths.order - widths.year) <= 2 && Math.abs(widths.order - widths.watched) <= 2,
  `排序=${widths.order} 年份=${widths.year} 观影日期=${widths.watched}`);
await page.click('#w-add-close');
await page.waitForTimeout(300);

await page.click('#w-avatar');
await page.waitForSelector('#w-tl .tl-item', { timeout: 45000 });
const tlBtn = await page.evaluate(() => {
  const b = document.getElementById('w-stats-btn');
  const cs = getComputedStyle(b);
  return { text: b.textContent.trim(), bg: cs.backgroundColor, pressed: b.getAttribute('aria-pressed'), hidden: b.hidden };
});
ok('B2 时间轴态：按钮恒「年度报告」、金底常驻、aria-pressed=false（第 102 轮契约延续）',
  tlBtn.text === '年度报告' && tlBtn.bg === 'rgba(232, 176, 75, 0.13)' &&
  tlBtn.pressed === 'false' && !tlBtn.hidden,
  `text=${tlBtn.text} bg=${tlBtn.bg} pressed=${tlBtn.pressed}`);
await page.click('#w-stats-btn');
await page.waitForSelector('.st-card', { timeout: 25000 });
await page.waitForTimeout(900);
await page.mouse.move(1, 1);

const r = await page.evaluate(() => {
  const cards = [...document.querySelectorAll('.st-card')].map((e) => ({
    k: (e.querySelector('.st-k') || {}).textContent || '',
    v: (e.querySelector('.st-v') || {}).textContent || '',
    u: (e.querySelector('.st-u') || {}).textContent || '',
    l: Math.round(e.getBoundingClientRect().left), t: Math.round(e.getBoundingClientRect().top)
  }));
  const monthBars = [...document.querySelectorAll('[data-panel="months"] .st-bar-num')].map((e) => Number(e.textContent));
  const btn = document.getElementById('w-stats-btn');
  const cs = getComputedStyle(btn);
  return {
    cards,
    hasBest: /最佳电影|最佳剧集|最佳番剧/.test(document.querySelector('.st-cards').textContent),
    monthTop: Math.max.apply(null, monthBars),
    btn: { text: btn.textContent.trim(), bg: cs.backgroundColor, pressed: btn.getAttribute('aria-pressed') },
    ov: document.documentElement.scrollWidth - document.documentElement.clientWidth
  };
});

ok('B3 年报 6 卡：键名顺序与数值逐项正确（124 / 7.70 / 46.0 / 115 / 3.6% / 7月·16 部），三部「最佳」不在 DOM',
  r.cards.length === 6 &&
  r.cards.map((c) => c.k).join('/') === '记录总数/平均评分/≥8 分占比/观影天数/观影密度/峰值月份' &&
  r.cards[0].v === '124' && r.cards[1].v === '7.70' && r.cards[2].v === '46.0' &&
  r.cards[3].v === '115' && r.cards[4].v === '3.6' && r.cards[4].u === '%' &&
  r.cards[5].v === '7月' && r.cards[5].u === '16 部' && !r.hasBest,
  r.cards.map((c) => `${c.k}=${c.v}${c.u}`).join(' '));

ok('B4 峰值月份卡与月度分布面板同数：卡上「16 部」= 面板柱图最大值',
  r.cards[5].u === r.monthTop + ' 部', `面板最大=${r.monthTop}`);

ok('B5 六卡严格并列同一行 + 年报按钮恒「年度报告」金底、aria-pressed=true',
  r.cards.every((c) => c.t === r.cards[0].t) &&
  r.cards.every((c, i) => i === 0 || c.l > r.cards[i - 1].l) &&
  r.btn.text === '年度报告' && r.btn.bg === 'rgba(232, 176, 75, 0.13)' && r.btn.pressed === 'true',
  `top=${r.cards.map((c) => c.t).join('/')} text=${r.btn.text}`);

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
await p2.click('#w-stats-btn');
await p2.waitForSelector('.st-card', { timeout: 25000 });
await p2.waitForTimeout(900);
const m2 = await p2.evaluate(() => {
  const t = (e) => Math.round(e.getBoundingClientRect().top);
  const cards = [...document.querySelectorAll('.st-card')].map((e) => t(e));
  const cols = getComputedStyle(document.querySelector('.st-cards')).gridTemplateColumns.split(' ').length;
  return {
    cardN: cards.length, distinctRows: new Set(cards).size, cols,
    kv: [...document.querySelectorAll('.st-card')].map((e) =>
      (e.querySelector('.st-k') || {}).textContent + '=' + (e.querySelector('.st-v') || {}).textContent),
    ov: document.documentElement.scrollWidth - document.documentElement.clientWidth
  };
});
ok('C1 390 六卡回 2 列（2 列 × 3 行）、三部「最佳」不在、新两卡在',
  m2.cardN === 6 && m2.cols === 2 && m2.distinctRows === 3 &&
  !m2.kv.some((s) => /最佳/.test(s)) && m2.kv.includes('观影密度=3.6') && m2.kv.includes('峰值月份=7月'),
  `卡=${m2.cardN} 列=${m2.cols} 行=${m2.distinctRows} ${m2.kv.join(' ')}`);
ok('C2 390 无横向溢出 + 零 JS 异常', m2.ov <= 0 && e2.length === 0, `ov=${m2.ov} err=${e2.length}`);
await c2.close();

await browser.close();
console.log('');
console.log(`第 103 轮上线复验：${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
