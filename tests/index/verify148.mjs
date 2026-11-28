/* verify148.mjs — 第 148 轮：首屏快照恢复，刷新只更新数字
   用户要的不是“进度条式加载”，而是刷新时页面别先空白再重建。
   方案：app.js 渲染完成后把五张卡最终文本 + 榜单 HTML 存 sessionStorage；
   index.html 在 app.js 之前用内联脚本恢复，app.js 到位后原地覆盖。

   契约：
     ① app.js?v=140；PAINT_KEY=index.paint.v1 同时出现在 app.js 与 index.html；
     ② 首次渲染后 sessionStorage 有 schema=1 快照（cards 5 项 + list HTML）；
     ③ 阻断 app.js 再刷新：300ms 内五张卡已是快照数字（无 sk-value）、
        榜单已是快照行（无 sk-row），证明不依赖 app.js 就能先恢复；
     ④ 正常加载后数字/榜单仍会更新，8 整行不退化。
   用法：node tests/index/verify148.mjs */
import { createRequire } from 'module';
import fs from 'fs';

const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const ROOT = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const LOCAL = 'http://127.0.0.1:8895/index.html';
let pass = 0, fail = 0;
const ok = (n, c, x) => { c ? (pass++, console.log('PASS ', n, x === undefined ? '' : '— ' + JSON.stringify(x))) : (fail++, console.log('FAIL ', n, '— ' + JSON.stringify(x))); };

const idx = fs.readFileSync(ROOT + 'docs/index.html', 'utf8');
const js = fs.readFileSync(ROOT + 'docs/app.js', 'utf8');

ok('A1 app.js?v=140，且快照 key 在两处一致',
  /app\.js\?v=140/.test(idx) && /index\.paint\.v1/.test(idx) && /index\.paint\.v1/.test(js),
  '理由：第148轮改 app.js 存快照 + index.html 内联恢复，两处 key 必须一致');

ok('A2 app.js 在渲染完成后写快照，且跳过骨架态',
  /savePaintSnapshot\(\)/.test(js) && /querySelector\('\.sk-row'\)/.test(js) && /sessionStorage\.setItem\(PAINT_KEY/.test(js),
  '理由：只存真实渲染结果，不能把 8 行骨架存成快照');

const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const ctx = await browser.newContext({ viewport: { width: 1168, height: 942 }, serviceWorkers: 'block' });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));

await page.goto(LOCAL + '?t=' + Date.now(), { waitUntil: 'load', timeout: 40000 });
await page.waitForSelector('#lt-list .rank-item', { state: 'visible', timeout: 40000 });
await page.waitForTimeout(1100);
const first = await page.evaluate(() => {
  const s = JSON.parse(sessionStorage.getItem('index.paint.v1') || 'null');
  const vals = [...document.querySelectorAll('#cards .card-value')].map((e) => e.textContent.trim());
  return { has: !!s, schema: s?.schema, cards: s?.cards, listLen: s?.list?.length || 0, vals, rows: document.querySelectorAll('#lt-list > .rank-item').length };
});
ok('B1 首次渲染后已写入 schema=1 快照（5 张卡 + 榜单 HTML）',
  first.has && first.schema === 1 && first.cards?.length === 5 && first.listLen > 1000 && first.vals.every((v) => v && v !== '—'),
  first);

/* 阻断 app.js：只靠 index.html 内联脚本恢复快照 */
await ctx.route('**/app.js*', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(300);
const restored = await page.evaluate(() => {
  const vals = [...document.querySelectorAll('#cards .card-value')].map((e) => e.textContent.trim());
  return {
    vals,
    noSkValue: document.querySelectorAll('#cards .card-value.sk-value').length === 0,
    rows: document.querySelectorAll('#lt-list > .rank-item').length,
    skRows: document.querySelectorAll('#lt-list .sk-row').length,
  };
});
ok('B2 阻断 app.js 时 300ms 内卡片/榜单已从快照恢复（不先空白）',
  restored.vals.every((v) => v && v !== '—') && restored.noSkValue &&
  restored.rows > 8 && restored.skRows === 0, restored);

await ctx.unroute('**/app.js*');
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#lt-list .rank-item', { state: 'visible', timeout: 40000 });
await page.waitForTimeout(1100);
const final = await page.evaluate(() => {
  const vh = innerHeight;
  const rows = [...document.querySelectorAll('#lt-list > .rank-item')];
  const r = (el) => el.getBoundingClientRect();
  return {
    vals: [...document.querySelectorAll('#cards .card-value')].map((e) => e.textContent.trim()),
    rows: rows.length,
    full: rows.filter((el) => r(el).bottom <= vh + 0.5).length,
    partial: rows.filter((el) => r(el).top < vh - 0.5 && r(el).bottom > vh + 0.5).length,
    skRows: document.querySelectorAll('#lt-list .sk-row').length,
  };
});
ok('B3 正常加载后仍是真实数据、8 整行、无骨架残留',
  final.vals.every((v) => v && v !== '—') && final.rows > 8 && final.full === 8 && final.partial === 0 && final.skRows === 0, final);

ok('B4 零 JS 异常',
  errs.filter((s) => !/steamstatic|steamcdn|Failed to load resource/i.test(s)).length === 0, errs.slice(0, 3));

await ctx.close();
await browser.close();
console.log(`\n===== verify148  PASS=${pass} FAIL=${fail} =====`);
process.exit(fail ? 1 : 0);
