/* verify147.mjs — 第 147 轮：统计卡退出淡入，恢复“刷新只更新数字”
   用户反馈：刷新后除顶部栏外都像消失再重新加载。逐帧截图确认 120ms 时
   五张卡只有前两张可见（其余 .rv opacity:0），420ms 才全部淡入；数字本身
   是从旧值原地更新为新值。根因是 motion.js 的 SEL 仍包含 .card。
   修复：SEL 只留 .tl-item / .st-panel，卡片首帧即 opacity:1，不再挂 .rv。

   契约：
     ① motion.js?v=4 两页同步，motion.css 不动；
     ② JS 选择器只剩 .tl-item / .st-panel，不含 .card / .rank-item；
     ③ 刷新 300ms 时五张卡已全部可见、无 rv/flat、opacity=1；
     ④ 数据到位后卡片数字从占位更新为真实值；8 整行不受影响。
   用法：node tests/index/verify147.mjs */
import { createRequire } from 'module';
import fs from 'fs';

const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const ROOT = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const LOCAL = 'http://127.0.0.1:8895/index.html';
let pass = 0, fail = 0;
const ok = (n, c, x) => { c ? (pass++, console.log('PASS ', n, x === undefined ? '' : '— ' + JSON.stringify(x))) : (fail++, console.log('FAIL ', n, '— ' + JSON.stringify(x))); };

const idx = fs.readFileSync(ROOT + 'docs/index.html', 'utf8');
const wat = fs.readFileSync(ROOT + 'docs/watch.html', 'utf8');
const js = fs.readFileSync(ROOT + 'docs/motion.js', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

ok('A1 motion.js?v=4 两页同步，motion.css 仍是 v1',
  /motion\.js\?v=4/.test(idx) && /motion\.js\?v=4/.test(wat) &&
  /motion\.css\?v=1/.test(idx) && /motion\.css\?v=1/.test(wat),
  '理由：第147轮只改 motion.js，按红线2单侧 bump，css 不动');

ok('A2 选择器只剩滚动区元素，卡片与榜单行都不参与动画',
  /var SEL = '\.tl-item, \.st-panel';/.test(js) && !/rankNodes/.test(js) && /flat/.test(js),
  '理由：.card 挂 .rv 会造成刷新时五张卡依次透明淡入，正是“消失后重新加载”的观感');

const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const ctx = await browser.newContext({ viewport: { width: 1168, height: 942 }, serviceWorkers: 'block' });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));

/* 刷新后 300ms：动画还没结束的时间点，卡片应已全部可见 */
await page.goto(LOCAL + '?t=' + Date.now(), { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#cards .card', { state: 'visible', timeout: 40000 });
await page.waitForTimeout(300);
const early = await page.evaluate(() => {
  const cards = [...document.querySelectorAll('#cards .card')];
  return {
    n: cards.length,
    visible: cards.filter((e) => getComputedStyle(e).opacity === '1').length,
    rv: cards.filter((e) => e.classList.contains('rv')).length,
    flat: cards.filter((e) => e.classList.contains('flat')).length,
    values: cards.map((e) => e.querySelector('.card-value')?.textContent.trim()),
  };
});
ok('B1 刷新 300ms 时五张卡全部可见、无 rv/flat',
  early.n === 5 && early.visible === 5 && early.rv === 0 && early.flat === 0, early);

/* 数据到位后：数字不再是占位，榜单仍是 8 行 */
await page.waitForSelector('#lt-list .rank-item', { state: 'visible', timeout: 40000 });
await page.waitForTimeout(1000);
const late = await page.evaluate(() => {
  const vh = innerHeight;
  const rows = [...document.querySelectorAll('#lt-list > .rank-item')];
  const cards = [...document.querySelectorAll('#cards .card')];
  const r = (el) => el.getBoundingClientRect();
  return {
    values: cards.map((e) => e.querySelector('.card-value')?.textContent.trim()),
    cardRv: cards.filter((e) => e.classList.contains('rv')).length,
    full: rows.filter((el) => r(el).bottom <= vh + 0.5).length,
    partial: rows.filter((el) => r(el).top < vh - 0.5 && r(el).bottom > vh + 0.5).length,
  };
});
ok('B2 数据到位后卡片数字已更新（不再是占位）',
  late.values.every((v) => v && v !== '—') && late.values.some((v, i) => v !== early.values[i]), { early: early.values, late: late.values });
ok('B3 卡片仍不挂 rv，榜单仍 8 整行 / 0 半行',
  late.cardRv === 0 && late.full === 8 && late.partial === 0, late);

ok('B4 零 JS 异常',
  errs.filter((s) => !/steamstatic|steamcdn|Failed to load resource/i.test(s)).length === 0, errs.slice(0, 3));

await ctx.close();
await browser.close();
console.log(`\n===== verify147  PASS=${pass} FAIL=${fail} =====`);
process.exit(fail ? 1 : 0);
