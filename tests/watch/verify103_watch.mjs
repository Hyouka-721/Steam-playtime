/* 第 103 轮：年报头部 7 卡 → 6 卡 —— 删三部「最佳」，加「观影密度」「峰值月份」
 *
 * 用户原话（两条）：
 *   1. 上线观影密度卡、峰值月份。
 *   2. 删除最佳电影：情书，最佳剧集：是大臣，最佳番剧：冰菓三栏。
 *
 * 判据说明（第 103 轮事实，理由写进各条 ok 文案）：
 *   ① 静态 —— BEST_PICKS 常量与三张最佳卡删净；密度 = 有记录天数 ÷ 首末条跨度天数
 *      （含首尾）；峰值月份与月度分布面板**同口径**（跨年合并的「几月」），并列取排在前面的
 *      月份；版本只 bump watch.js（css 未动 → 仍 v=41）
 *   ② 1920 运行时 —— 6 卡数值逐项对（124 / 7.70 / 46.0 / 115 / 3.6 / 7月·16 部）、
 *      六卡同一行、旧三最佳不在 DOM
 *   ③ 390 —— 6 卡回 2 列（2 列 × 3 行）、零溢出零异常
 */
import { createRequire } from 'module';
import fs from 'fs';
import { fileURLToPath } from 'url';

const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const rd = (p) => fs.readFileSync(ROOT + 'docs/' + p, 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '').replace(/\r\n/g, '\n');

const html = rd('watch.html'), js = rd('watch.js');
const jsNC = strip(js);

let pass = 0, fail = 0;
const ok = (n, c, extra = '') => {
  c ? (pass++, console.log(`PASS ${n}${extra ? '  ' + extra : ''}`))
    : (fail++, console.log(`FAIL ${n}  ${extra}`));
};

/* ================= A 静态 ================= */
console.log('== A 静态指纹 ==');
ok('A1 版本号：watch.css?v=41（css 本轮未动不 bump）/ watch.js?v=33',
  /watch\.css\?v=41"/.test(html) && /watch\.js\?v=33"/.test(html),
  (html.match(/watch\.(css|js)\?v=\d+/g) || []).join(' '));

ok('A2 cards 数组 6 项整块匹配（…观影密度…峰值月份），密度/峰值计算代码就位、BEST_PICKS 删净',
  /var cards = \[\n      \{ k: '记录总数'[\s\S]*?\{ k: '峰值月份', v: topMonthN \? topMonthK : '—', u: topMonthN \? topMonthN \+ ' 部' : '' \}\n    \];/.test(jsNC) &&
  /var dayList = Object\.keys\(daySet\)\.sort\(\);/.test(jsNC) &&
  /var spanDays = dayList\.length[\s\S]*?\/ 86400000\) \+ 1 : 0;/.test(jsNC) &&
  /var density = dayList\.length && spanDays \? dayList\.length \/ spanDays \* 100 : 0;/.test(jsNC) &&
  !/BEST_PICKS/.test(jsNC));

ok('A3 三张「最佳」卡删净（最佳电影 / 最佳剧集 / 最佳番剧 = 0 处）',
  !/k: '最佳电影'/.test(jsNC) && !/k: '最佳剧集'/.test(jsNC) && !/k: '最佳番剧'/.test(jsNC));

ok('A4 峰值月份与月度分布面板同口径：直接取 months 数组的 max（months 是跨年合并的「几月」），并列取排在前面的月份',
  /months\.forEach\(function \(p\) \{ if \(p\.v > topMonthN\) \{ topMonthN = p\.v; topMonthK = p\.k; \} \}\);/.test(jsNC) &&
  /var topMonthK = '—';/.test(jsNC) && /var topMonthN = 0;/.test(jsNC));

ok('A5 密度兜底：无记录时显示「—」且单位为空；有记录时 v=1 位小数、u=%',
  /\{ k: '观影密度', v: dayList\.length \? density\.toFixed\(1\) : '—', u: '%' \}/.test(jsNC) &&
  /\{ k: '峰值月份', v: topMonthN \? topMonthK : '—', u: topMonthN \? topMonthN \+ ' 部' : '' \}/.test(jsNC));

ok('A6 CSS 未动：.st-cards 仍 auto-fit minmax(160px,1fr)、860 块仍只有 1 个',
  /repeat\(auto-fit, minmax\(160px, 1fr\)\)/.test(html) === false &&
  (rd('watch.css').match(/@media \(max-width:860px\)|@media \(max-width: 860px\)/g) || []).length === 1,
  '860 块计数 = 1');

/* ================= B 1920 运行时 ================= */
console.log('== B 1920 运行时 ==');
const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1200 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
await page.goto('http://127.0.0.1:8895/watch.html?t=' + Date.now(), { waitUntil: 'load', timeout: 45000 });
await page.waitForSelector('#w-grid .poster', { timeout: 45000 });
await page.click('#w-avatar');                       /* 年报按钮只在时间轴出现（第 93 轮契约） */
await page.waitForSelector('#w-tl .tl-item', { timeout: 45000 });
await page.click('#w-stats-btn');
await page.waitForSelector('.st-card', { timeout: 25000 });
await page.waitForTimeout(900);
await page.mouse.move(1, 1);

const r = await page.evaluate(() => {
  const b = (e) => { const x = e.getBoundingClientRect(); return { l: Math.round(x.left), t: Math.round(x.top) }; };
  const cards = [...document.querySelectorAll('.st-card')].map((e) => ({
    k: (e.querySelector('.st-k') || {}).textContent || '',
    v: (e.querySelector('.st-v') || {}).textContent || '',
    u: (e.querySelector('.st-u') || {}).textContent || '',
    ...b(e)
  }));
  const monthBars = [...document.querySelectorAll('[data-panel="months"] .st-bar-num')].map((e) => Number(e.textContent));
  return {
    cards,
    hasBest: /最佳电影|最佳剧集|最佳番剧/.test(document.querySelector('.st-cards').textContent),
    monthTop: Math.max.apply(null, monthBars),
    ov: document.documentElement.scrollWidth - document.documentElement.clientWidth
  };
});

ok('B1 年报 6 卡：键名顺序与数值逐项正确（124 / 7.70 / 46.0 / 115 / 3.6% / 7月·16 部），三部「最佳」不在 DOM',
  r.cards.length === 6 &&
  r.cards.map((c) => c.k).join('/') === '记录总数/平均评分/≥8 分占比/观影天数/观影密度/峰值月份' &&
  r.cards[0].v === '124' && r.cards[1].v === '7.70' && r.cards[2].v === '46.0' &&
  r.cards[3].v === '115' && r.cards[4].v === '3.6' && r.cards[4].u === '%' &&
  r.cards[5].v === '7月' && r.cards[5].u === '16 部' && !r.hasBest,
  r.cards.map((c) => `${c.k}=${c.v}${c.u}`).join(' '));

ok('B2 峰值月份卡与月度分布面板同数：卡上「16 部」= 面板柱图最大值',
  r.cards[5].u === r.monthTop + ' 部', `面板最大=${r.monthTop}`);

ok('B3 六卡严格并列同一行：top 全等、left 依次递增',
  r.cards.every((c) => c.t === r.cards[0].t) &&
  r.cards.every((c, i) => i === 0 || c.l > r.cards[i - 1].l),
  `top=${r.cards.map((c) => c.t).join('/')} left=${r.cards.map((c) => c.l).join('/')}`);

const btnNow = await page.evaluate(() => {
  const b = document.getElementById('w-stats-btn');
  const cs = getComputedStyle(b);
  return { text: b.textContent.trim(), bg: cs.backgroundColor, pressed: b.getAttribute('aria-pressed') };
});
ok('B4 年报态按钮：恒「年度报告」、金底 rgba(232,176,75,0.13)、aria-pressed=true（第 102 轮契约延续）',
  btnNow.text === '年度报告' && btnNow.bg === 'rgba(232, 176, 75, 0.13)' && btnNow.pressed === 'true',
  `text=${btnNow.text} bg=${btnNow.bg} pressed=${btnNow.pressed}`);

ok('B5 1920 无横向溢出 + 零 JS 异常', r.ov <= 0 && errs.length === 0, `ov=${r.ov} err=${errs.length}`);
await ctx.close();

/* ================= C 390 ================= */
console.log('== C 390 ==');
const c2 = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
const p2 = await c2.newPage();
const e2 = [];
p2.on('pageerror', (e) => e2.push(String(e)));
await p2.goto('http://127.0.0.1:8895/watch.html?t=' + Date.now(), { waitUntil: 'load', timeout: 45000 });
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
ok('C1 390 六卡回 2 列（2 列 × 3 行）、三最佳不在、新两卡在',
  m2.cardN === 6 && m2.cols === 2 && m2.distinctRows === 3 &&
  !m2.kv.some((s) => /最佳/.test(s)) && m2.kv.includes('观影密度=3.6') && m2.kv.includes('峰值月份=7月'),
  `卡=${m2.cardN} 列=${m2.cols} 行=${m2.distinctRows} ${m2.kv.join(' ')}`);
ok('C2 390 无横向溢出 + 零 JS 异常', m2.ov <= 0 && e2.length === 0, `ov=${m2.ov} err=${e2.length}`);
await c2.close();
await browser.close();

console.log('');
console.log(`第 103 轮：${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
