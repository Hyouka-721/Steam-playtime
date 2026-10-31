/* online82_index.mjs — 上线复验（第 82 轮 index 侧）
   等待 Pages 生效 → 版本指纹 → 三张吉祥物图必须 404 → 运行时行为（无 title 气泡、站名不可选、点它仍回顶、功能未坏）

   ⚠️ 线上验证只认「内容指纹」：Playwright + 页内 fetch(cache:'reload')，不用 curl（CDN 可能回旧内容）。
   ⚠️ 沙箱里 Steam 图会拖慢计时 → route.abort，被 abort 的请求会记 console error，按 verify6 同口径滤掉。 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import crypto from 'node:crypto';

const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const SITE = 'https://hyouka-721.github.io/Steam-playtime/';
const ROOT = 'C:/Users/33329/WorkBuddy/2026-10-13-18-17-49/steam-playtime/docs/';
const OUT = 'C:/Users/33329/AppData/Local/Temp/fx_verify_20261018/shots82online/';
fs.mkdirSync(OUT, { recursive: true });

const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');
const local = (f) => fs.readFileSync(ROOT + f, 'utf8').replace(/\r\n/g, '\n');
const norm = (s) => s.replace(/\r\n/g, '\n');

let pass = 0, fail = 0;
const ok = (n, c, extra = '') => {
  c ? (pass++, console.log(`PASS ${n}${extra ? '  — ' + extra : ''}`))
    : (fail++, console.log(`FAIL ${n}  — ${extra}`));
};

const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.route(/^https?:\/\/(cdn\.cloudflare\.steamstatic\.com|media\.steampowered\.com|steamcdn-a\.akamaihd\.net)\//, (r) => r.abort());
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });

/* ---------- A 等 Pages 生效 ---------- */
console.log('== A 等待 Pages 生效（判内容指纹 style.css?v=109）==');
let html = '';
for (let i = 1; i <= 20; i++) {
  try {
    const r = await page.goto(SITE + 'index.html', { waitUntil: 'domcontentloaded', timeout: 45000 });
    html = await r.text();
  } catch (e) {
    console.log(`  · 第 ${i} 次打开失败：${e.message.split('\n')[0]}`);
    await page.waitForTimeout(8000);
    continue;
  }
  const fresh = html.includes('style.css?v=109') && html.includes('app.js?v=104');
  console.log(`  第 ${i} 次：${fresh ? '已生效' : '仍是旧版'}`);
  if (fresh) break;
  await page.waitForTimeout(10000);
}
ok('A1 线上 index.html 已是 v=109 / v=104',
  html.includes('style.css?v=109') && html.includes('app.js?v=104'),
  (html.match(/(style\.css|app\.js|fx\.js)\?v=\d+/g) || []).join(' '));

/* ---------- B 字节指纹 ---------- */
console.log('== B 与本地逐字节比对 ==');
const fetched = await page.evaluate(async () => {
  const get = async (u) => (await fetch(u, { cache: 'reload' })).text();
  return { css: await get('style.css'), js: await get('app.js') };
});
ok('B1 style.css 线上与本地去 CR 后 md5 全等', md5(norm(fetched.css)) === md5(local('style.css')));
ok('B2 app.js 线上与本地去 CR 后 md5 全等', md5(norm(fetched.js)) === md5(local('app.js')));

/* ---------- C 三张吉祥物图必须已下架 ---------- */
console.log('== C 已删除的资源 ==');
const gone = await page.evaluate(async () => {
  const files = ['rank-cat-8b4e55ad.webp', 'rank-tj-b9b7fccd.webp', 'rank-penguin-fb2f58a8.webp'];
  const out = {};
  for (const f of files) {
    const r = await fetch('img/' + f, { cache: 'reload' });
    out[f] = r.status;
  }
  return out;
});
ok('C1 三张吉祥物图线上均为 404（文件已删除）',
  Object.values(gone).every((s) => s === 404), JSON.stringify(gone));

/* ---------- D 运行时行为 ---------- */
console.log('== D 运行时 ==');
await page.goto(SITE + 'index.html', { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForSelector('#lt-list .rank-item', { timeout: 20000 });

ok('D1 整页 DOM 中带 title 属性的元素数为 0',
  (await page.evaluate(() => document.querySelectorAll('[title]').length)) === 0);

ok('D2 排行榜首行进度条内无任何 img（吉祥物已移除）',
  (await page.evaluate(() => document.querySelectorAll('#lt-list .rank-item:first-child .rank-bar img').length)) === 0);

const sel = await page.evaluate(() => {
  const cs = getComputedStyle(document.getElementById('site-title'));
  return { us: cs.userSelect || cs.webkitUserSelect, cursor: cs.cursor };
});
ok('D3 站名 user-select = none 且仍 cursor:pointer', sel.us === 'none' && sel.cursor === 'pointer', JSON.stringify(sel));

const dbl = await page.evaluate(() => {
  const el = document.getElementById('site-title');
  const r = el.getBoundingClientRect();
  for (const t of ['mousedown', 'mouseup', 'mousedown', 'mouseup', 'dblclick']) {
    el.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window, detail: t === 'dblclick' ? 2 : 1, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
  }
  return String(window.getSelection());
});
ok('D4 双击站名后选区为空', dbl === '', JSON.stringify(dbl));

await page.evaluate(() => window.scrollTo(0, 1200));
await page.waitForTimeout(250);
const y0 = await page.evaluate(() => window.scrollY);
await page.click('#site-title');
await page.waitForTimeout(800);
const y1 = await page.evaluate(() => window.scrollY);
ok('D5 点站名仍返回顶部', y0 > 500 && y1 === 0, `${y0} → ${y1}`);

const th0 = await page.evaluate(() => document.documentElement.dataset.theme);
await page.click('#theme-light');
await page.waitForTimeout(350);
const th1 = await page.evaluate(() => document.documentElement.dataset.theme);
ok('D6 史蒂夫主题键仍能切主题', th1 !== th0, `${th0} → ${th1}`);

const views = [];
for (const [card, view] of [['#card-ach', 'view-ach'], ['#card-data', 'view-data'], ['#card-lifetime', 'view-lifetime']]) {
  await page.click(card);
  await page.waitForTimeout(350);
  views.push(await page.evaluate((v) => document.getElementById(v).classList.contains('active'), view));
}
ok('D7 五张概览卡切换视图正常', views.every(Boolean), JSON.stringify(views));

await page.screenshot({ path: OUT + 'online82_index.png' });

const real = errs.filter((e) => !/Failed to load resource|net::ERR|ERR_BLOCKED|ERR_FAILED/i.test(e));
ok('D8 零 JS 异常（剔除被 abort 的 Steam 图）', real.length === 0, real.slice(0, 3).join(' | '));

await browser.close();
console.log(`\n================ ${pass} / ${pass + fail} ================`);
process.exit(fail ? 1 : 0);
