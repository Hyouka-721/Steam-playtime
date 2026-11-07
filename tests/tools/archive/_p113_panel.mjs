/* _p113_panel.mjs — 量面板内各块的实际位置（找月份行与点阵之间的空隙来源） */
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const URL = process.argv[2] || 'http://127.0.0.1:8895/index.html';
const W = Number(process.argv[3] || 1440);
const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const ctx = await browser.newContext({ viewport: { width: W, height: 900 } });
const page = await ctx.newPage();
await page.goto(URL, { waitUntil: 'load' });
await page.waitForTimeout(1000);
await page.click('#card-recent');
await page.waitForTimeout(800);

const out = await page.evaluate(() => {
  const R = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { top: +b.top.toFixed(1), btm: +b.bottom.toFixed(1), left: +b.left.toFixed(1), right: +b.right.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) }; };
  const q = (s) => document.querySelector(s);
  const root = q('#hx-root');
  const cs = getComputedStyle(root);
  const grid = q('#hx-grid');
  return {
    panelTitle: R(q('#lt-detail .panel-title')),
    sum: R(q('#hx-sum')),
    hx: R(root),
    months: R(q('#hx-months')),
    dow: R(q('#hx-dow') || q('.hx-dow')),
    grid: R(grid),
    foot: R(q('.hx-foot')),
    day: R(q('#hx-day')),
    gridRows: getComputedStyle(grid).gridTemplateRows,
    gridCols: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
    rootRows: cs.gridTemplateRows,
    rootCols: cs.gridTemplateColumns,
    hxVar: cs.getPropertyValue('--hx').trim(),
    gapVar: cs.getPropertyValue('--hx-gap').trim(),
    rowGap: getComputedStyle(grid).rowGap,
  };
});
console.log(JSON.stringify({ W, ...out }, null, 1));
await browser.close();
