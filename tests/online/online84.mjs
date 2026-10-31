/* online84.mjs — 第 84 轮上线复验：本地封面 + 离线可用
   判据全部对着**线上**：Pages 生效 → 封面是本地路径且 200 → SW 接管 → 断网刷新仍能渲染。

   ⚠️ 线上验证只认内容指纹（Playwright + fetch(cache:'reload')），不用 curl。
   ⚠️ 离线断言必须在**未被 route 拦截**的上下文里跑，否则 SW 与 route 会互相干扰。 */
import { createRequire } from 'node:module';

const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const SITE = 'https://hyouka-721.github.io/Steam-playtime/';
const CSS_V = '110';
const APP_V = '105';

let pass = 0, fail = 0;
const ok = (n, c, extra = '') => {
  c ? (pass++, console.log(`PASS ${n}${extra ? '  — ' + extra : ''}`))
    : (fail++, console.log(`FAIL ${n}  — ${extra}`));
};

const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));

/* ---------- A 等 Pages 生效 ---------- */
console.log('== A 等待 Pages 生效 ==');
let html = '';
for (let i = 1; i <= 40; i++) {
  try {
    const r = await page.goto(SITE + 'index.html', { waitUntil: 'domcontentloaded', timeout: 45000 });
    html = await r.text();
  } catch (e) {
    console.log(`  · 第 ${i} 次打开失败：${e.message.split('\n')[0]}`);
    await page.waitForTimeout(8000);
    continue;
  }
  const fresh = html.includes(`style.css?v=${CSS_V}`) && html.includes(`app.js?v=${APP_V}`);
  console.log(`  第 ${i} 次：${fresh ? '已生效' : '仍是旧版'}`);
  if (fresh) break;
  await page.waitForTimeout(10000);
}
ok(`A1 线上已是 style.css?v=${CSS_V} / app.js?v=${APP_V}`,
  html.includes(`style.css?v=${CSS_V}`) && html.includes(`app.js?v=${APP_V}`),
  (html.match(/(style\.css|app\.js)\?v=\d+/g) || []).join(' '));

/* ---------- B 本地封面 ---------- */
console.log('== B 本地封面 ==');
const cover = await page.evaluate(async () => {
  const r = await fetch('img/covers/730.webp', { cache: 'reload' });
  const buf = await r.arrayBuffer();
  return { status: r.status, type: r.headers.get('content-type'), bytes: buf.byteLength };
});
ok('B1 img/covers/730.webp 线上存在且是 webp 图片',
  cover.status === 200 && /image\/webp/.test(cover.type || '') && cover.bytes > 2000, JSON.stringify(cover));

await page.waitForSelector('#lt-list .rank-item', { timeout: 25000 });
const src = await page.evaluate(() => {
  const img = document.querySelector('#lt-list img.rank-capsule');
  return img ? img.getAttribute('src') : '';
});
ok('B2 榜单胶囊图指向本地路径（不再是 steamstatic）',
  /img\/covers\/\d+\.webp/.test(src), src);

/* ---------- C 离线 ---------- */
console.log('== C 离线 ==');
await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller !== null, null, { timeout: 25000 }).catch(() => {});
const sw = await page.evaluate(async (appV) => {
  const reg = await navigator.serviceWorker.getRegistration();
  const keys = await caches.keys();
  let hasShell = false;
  if (keys.includes('app-shell-v1')) {
    const c = await caches.open('app-shell-v1');
    const all = (await c.keys()).map((r) => r.url);
    hasShell = all.some((u) => /index\.html|\/$/.test(u)) && all.some((u) => u.includes(`app.js?v=${appV}`));
  }
  return { active: !!reg && !!reg.active, controlled: !!navigator.serviceWorker.controller, keys, hasShell };
}, APP_V);
ok('C1 SW 已注册并接管，外壳缓存含 index.html 与当前版本 app.js',
  sw.active && sw.controlled && sw.hasShell, JSON.stringify(sw.keys));

await ctx.setOffline(true);
let offOk = false;
let rows = 0;
try {
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(900);
  offOk = await page.evaluate(() => {
    const v = document.getElementById('c-lifetime');
    return !!v && v.textContent.trim() !== '' && v.textContent.trim() !== '—';
  });
  rows = await page.evaluate(() => document.querySelectorAll('#lt-list .rank-item').length);
} catch (e) {
  offOk = false;
}
ok('C2 断网刷新后页面仍能渲染（数据来自内联 __BOOT）', offOk && rows > 20, `ok=${offOk} rows=${rows}`);

const coverOffline = await page.evaluate(() => {
  const imgs = [...document.querySelectorAll('#lt-list img.rank-capsule')].slice(0, 3);
  return imgs.length > 0 && imgs.every((i) => i.complete && i.naturalWidth > 0);
}).catch(() => false);
ok('C3 离线时前几张本地封面仍能显示（命中 SW 缓存）', coverOffline);

await ctx.setOffline(false);
const realErrs = errs.filter((e) => !/Failed to load resource|net::ERR|ERR_BLOCKED|ERR_FAILED/i.test(e));
ok('C4 全程零 JS 异常', realErrs.length === 0, realErrs.slice(0, 2).join(' | '));

await browser.close();
console.log(`\n================ ${pass} / ${pass + fail} ================`);
process.exit(fail ? 1 : 0);
