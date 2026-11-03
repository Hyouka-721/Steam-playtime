/* shot102.mjs — 第 102 轮取证：四主题 × 两宽度的榜单右半区
   用法：node tests/tools/shot102.mjs [输出目录] */
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';

const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const OUT = process.argv[2] || 'C:/Users/33329/AppData/Local/Temp/shot102';
const SITE = process.env.SITE || 'http://127.0.0.1:8895/index.html';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ args: ['--no-proxy-server'] });

for (const theme of ['cream', 'mint', 'dawn', 'night']) {
  for (const w of [1440, 1088]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 1000 }, deviceScaleFactor: 2 });
    await ctx.addInitScript((t) => { try { localStorage.setItem('theme', t); } catch (e) {} }, theme);
    const page = await ctx.newPage();
    await page.goto(SITE, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('#lt-list .rank-item', { state: 'visible', timeout: 30000 });
    await page.waitForTimeout(1300);
    await page.evaluate(async () => {
      const ims = [...document.querySelectorAll('#lt-list img')].slice(0, 8);
      for (const im of ims) im.loading = 'eager';
      await Promise.all(ims.map((im) => new Promise((res) => {
        if (im.complete && im.naturalWidth) return res();
        im.addEventListener('load', res, { once: true });
        im.addEventListener('error', res, { once: true });
        setTimeout(res, 8000);
      })));
    });
    await page.waitForTimeout(300);
    const clip = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('#lt-list .rank-item')].slice(0, 5);
      const top = rows[0].getBoundingClientRect().top - 6;
      const bot = rows[4].getBoundingClientRect().bottom + 6;
      return { x: 0, y: Math.round(top), width: window.innerWidth, height: Math.round(bot - top) };
    });
    const file = `${OUT}/102-${theme}-${w}.png`;
    await page.screenshot({ path: file, clip });
    console.log(`${theme} ${w} → ${file}`);
    await ctx.close();
  }
}
await browser.close();
