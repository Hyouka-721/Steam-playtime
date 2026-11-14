/* _p113_jump.mjs — 复现「点击当日明细后上方元素跳一下」：模拟 Windows 经典滚动条 */
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const W = Number(process.argv[2] || 1440);
const H = Number(process.argv[3] || 700);
const EXTRA = process.argv[4] === 'classic' ? ['--disable-features=OverlayScrollbar,FluentScrollbar'] : [];
const browser = await chromium.launch({ args: ['--no-proxy-server', ...EXTRA] });
const ctx = await browser.newContext({ viewport: { width: W, height: H } });
const page = await ctx.newPage();
await page.goto('http://127.0.0.1:8895/index.html', { waitUntil: 'load' });
await page.waitForTimeout(1000);
await page.click('#card-recent');
await page.waitForTimeout(800);

const snap = () => page.evaluate(() => {
  const R = (s) => { const el = document.querySelector(s); if (!el) return null; const b = el.getBoundingClientRect(); return [+b.left.toFixed(1), +b.top.toFixed(1), +b.width.toFixed(1), +b.height.toFixed(1)]; };
  return {
    scrollY: Math.round(window.scrollY),
    scrollH: document.documentElement.scrollHeight,
    clientW: document.documentElement.clientWidth,
    innerW: window.innerWidth,
    sbW: window.innerWidth - document.documentElement.clientWidth,
    hx: getComputedStyle(document.getElementById('hx-root')).getPropertyValue('--hx').trim(),
    gap: getComputedStyle(document.getElementById('hx-root')).getPropertyValue('--hx-gap').trim(),
    header: R('.site-header'),
    cards: R('.cards'),
    panel: R('#lt-detail'),
    grid: R('#hx-grid'),
    day: R('#hx-day'),
  };
});
const before = await snap();
const t = await page.evaluate(() => {
  const c = [...document.querySelectorAll('#hx-grid .hx-c[role="button"]')][5];
  const b = c.getBoundingClientRect();
  return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
});
await page.mouse.click(t.x, t.y);
const atOnce = await snap();
await page.waitForTimeout(400);
const after = await snap();
console.log(JSON.stringify({ W, H, classic: EXTRA.length > 0, before, atOnce, after }, null, 1));
await browser.close();
