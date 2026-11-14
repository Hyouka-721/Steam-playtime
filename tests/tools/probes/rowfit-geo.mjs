/* _p117_geo.mjs — 量首屏榜单：整行数 / 有没有被折线切开的行 */
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const H_LIST = [640, 700, 720, 768, 800, 860, 900, 960, 1000, 1080, 1200, 1440, 1600];
const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const out = [];
for (const h of H_LIST) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: h }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  await page.goto('http://127.0.0.1:8895/index.html?t=' + Date.now(), { waitUntil: 'load' });
  await page.waitForSelector('#lt-list .rank-item', { state: 'visible', timeout: 40000 });
  await page.waitForTimeout(900);
  out.push(await page.evaluate(() => {
    const vh = window.innerHeight;
    const items = [...document.querySelectorAll('#lt-list > .rank-item')].filter((el) => el.getBoundingClientRect().height > 0);
    const r = (el) => el.getBoundingClientRect();
    const list = document.getElementById('lt-list');
    const full = items.filter((el) => r(el).bottom <= vh + 0.5).length;
    const partial = items.filter((el) => r(el).top < vh - 0.5 && r(el).bottom > vh + 0.5)
      .map((el) => ({ top: +r(el).top.toFixed(1), visible: +(vh - r(el).top).toFixed(1) }));
    return {
      vh, rowH: +r(items[0]).height.toFixed(1), full, partial,
      rowVar: list.style.getPropertyValue('--rank-row-h') || '(none)',
    };
  }));
  await ctx.close();
}
await browser.close();
console.log('vh   | 行高  | 完整行 | 被切开的行 | --rank-row-h');
for (const o of out) {
  console.log(`${String(o.vh).padStart(4)} | ${String(o.rowH).padStart(5)} | ${String(o.full).padStart(6)} | ${(o.partial.length ? JSON.stringify(o.partial) : '—').padEnd(28)} | ${o.rowVar}`);
}
