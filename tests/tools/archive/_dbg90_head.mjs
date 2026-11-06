/* 第 90 轮：诊断 390 下 .poster-head 高度参差来自哪些卡片。 */
import { createRequire } from 'module';
const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
const p = await ctx.newPage();
await p.goto('http://127.0.0.1:8895/watch.html?t=' + Date.now(), { waitUntil: 'load' });
await p.evaluate(() => document.fonts.ready);
await p.waitForFunction(() => document.querySelectorAll('#w-grid .poster').length > 20, null, { timeout: 30000 });
await p.waitForTimeout(500);

const out = await p.evaluate(() => {
  const cards = [...document.querySelectorAll('#w-grid .poster')];
  const R = (e) => (e ? e.getBoundingClientRect() : null);
  const rows = cards.map((c) => {
    const hd = c.querySelector('.poster-head'), nm = c.querySelector('.poster-name');
    const sc = c.querySelector('.poster-score'), dt = c.querySelector('.poster-date');
    const hr = R(hd), nr = R(nm), sr = R(sc), dr = R(dt);
    return {
      name: nm.textContent.trim(),
      headH: +hr.height.toFixed(1), headTop: +hr.top.toFixed(1), headBottom: +hr.bottom.toFixed(1),
      nameH: +nr.height.toFixed(1), nameTop: +nr.top.toFixed(1), nameBottom: +nr.bottom.toFixed(1),
      scoreTop: +sr.top.toFixed(1), scoreBottom: +sr.bottom.toFixed(1),
      dateTop: +dr.top.toFixed(1), dateBottom: +dr.bottom.toFixed(1),
      csWrap: getComputedStyle(hd).flexWrap, csAlign: getComputedStyle(hd).alignItems,
    };
  });
  const byH = {};
  rows.forEach((r) => { byH[r.headH] = (byH[r.headH] || 0) + 1; });
  return { n: rows.length, byH, unusual: rows.filter((r) => r.headH < 30).slice(0, 6),
    tall: rows.filter((r) => r.headH >= 30).slice(0, 3), sample: rows.slice(0, 3) };
});
console.log(JSON.stringify(out, null, 2));
await browser.close();
