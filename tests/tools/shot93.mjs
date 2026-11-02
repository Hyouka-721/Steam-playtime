/* shot93.mjs — 第 93 轮 P0 取证：内联 CSS 后四主题首屏 + 封面变体效果 */
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';

const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const OUT = process.argv[2] || 'C:/Users/33329/AppData/Local/Temp/shot93';
const SITE = process.env.SITE || 'http://127.0.0.1:8895/index.html';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const errs = [];

for (const th of ['cream', 'mint', 'dawn', 'night']) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.addInitScript((t) => { try { localStorage.setItem('theme', t); } catch { /* ignore */ } }, th);
  await page.goto(SITE, { waitUntil: 'load', timeout: 60000 });
  await page.waitForSelector('#lt-list .rank-item', { timeout: 30000 });
  await page.waitForTimeout(1200);
  // 首屏可见封面确保加载完
  await page.evaluate(async () => {
    const ims = [...document.querySelectorAll('#lt-list img.rank-capsule')].slice(0, 8);
    await Promise.all(ims.map((im) => new Promise((r) => {
      if (im.complete && im.naturalWidth) return r();
      im.addEventListener('load', r, { once: true });
      im.addEventListener('error', r, { once: true });
      setTimeout(r, 6000);
    })));
  });
  const info = await page.evaluate(() => ({
    theme: document.documentElement.dataset.theme,
    bg: getComputedStyle(document.body).backgroundColor,
    titleFont: getComputedStyle(document.getElementById('site-title')).fontFamily.split(',')[0],
    cardCount: document.querySelectorAll('.card').length,
    rows: document.querySelectorAll('#lt-list .rank-item').length,
  }));
  console.log(JSON.stringify(info));
  await page.screenshot({ path: `${OUT}/93-theme-${th}.png` });
  await ctx.close();
}

await browser.close();
console.log('errs', errs.length, errs.slice(0, 2));
console.log('screens ->', OUT);
