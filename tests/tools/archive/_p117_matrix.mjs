/* _p117_matrix.mjs — 多宽度×多高度：首屏整行数、是否有被切开的行、CLS */
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const W = [1088, 1280, 1440, 1680, 1920];
const H = [800, 900, 1000, 1080];
const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const rows = [];
for (const w of W) {
  for (const h of H) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'block' });
    const page = await ctx.newPage();
    await page.addInitScript(() => {
      window.__cls = 0;
      try {
        new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; })
          .observe({ type: 'layout-shift', buffered: true });
      } catch (e) {}
    });
    await page.goto('http://127.0.0.1:8895/index.html?t=' + Date.now(), { waitUntil: 'load' });
    await page.waitForSelector('#lt-list .rank-item', { state: 'visible', timeout: 40000 });
    await page.waitForTimeout(1200);
    rows.push(await page.evaluate(() => {
      const vh = window.innerHeight;
      const items = [...document.querySelectorAll('#lt-list > .rank-item')].filter((el) => el.getBoundingClientRect().height > 0);
      const r = (el) => el.getBoundingClientRect();
      const full = items.filter((el) => r(el).bottom <= vh + 0.5).length;
      const partial = items.filter((el) => r(el).top < vh - 0.5 && r(el).bottom > vh + 0.5).length;
      return {
        w: window.innerWidth, vh,
        rowH: +r(items[0]).height.toFixed(1),
        full, partial,
        cls: +window.__cls.toFixed(4),
        over: document.documentElement.scrollWidth - window.innerWidth,
      };
    }));
    await ctx.close();
  }
}
await browser.close();
console.log('宽×高 | 行高 | 完整行 | 切开 | CLS | 溢出');
for (const o of rows) {
  console.log(`${o.w}×${o.vh} | ${String(o.rowH).padStart(5)} | ${String(o.full).padStart(2)} | ${String(o.partial).padStart(2)} | ${String(o.cls).padStart(6)} | ${o.over}`);
}
