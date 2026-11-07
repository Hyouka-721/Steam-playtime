/* _p113_geo.mjs — 第 113 轮诊断：点阵行/列间距实测 + 点击当日明细前后的「跳动」量化 */
import { createRequire } from 'node:module';

const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const URL = process.argv[2] || 'http://127.0.0.1:8895/index.html';
const W = Number(process.argv[3] || 1440);

const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const ctx = await browser.newContext({ viewport: { width: W, height: 900 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });

await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
await page.waitForTimeout(1200);
await page.click('#card-recent');
await page.waitForTimeout(900);

const geo = await page.evaluate(() => {
  const root = document.getElementById('hx-root');
  const grid = document.getElementById('hx-grid');
  const cs = getComputedStyle(root);
  const cells = [...grid.querySelectorAll('.hx-c')];
  const r = (el) => el.getBoundingClientRect();
  // 同一列取前 7 个（7 行）→ 行距；同一行取相邻两列 → 列距
  const col0 = cells.slice(0, 7).map((c) => r(c));
  const rowPitch = [];
  for (let i = 1; i < col0.length; i++) rowPitch.push(+(col0[i].top - col0[i - 1].top).toFixed(2));
  const first = cells[0];
  // 相邻列：同一 row 的下一列（第 8 个一般就是下一列第 1 行）
  const colPitch = [];
  for (let i = 1; i < 6; i++) {
    const a = r(cells[i * 7]), b = r(cells[(i + 1) * 7]);
    if (b && a) colPitch.push(+(b.left - a.left).toFixed(2));
  }
  const gridCS = getComputedStyle(grid);
  return {
    hx: cs.getPropertyValue('--hx').trim(),
    gap: cs.getPropertyValue('--hx-gap').trim(),
    mgap: cs.getPropertyValue('--hx-mgap').trim(),
    cellW: +r(first).width.toFixed(2),
    cellH: +r(first).height.toFixed(2),
    rowGapDeclared: gridCS.rowGap,
    colGapDeclared: gridCS.columnGap,
    rowPitch, colPitch,
    gridH: +r(grid).height.toFixed(2),
    gridW: +r(grid).width.toFixed(2),
    containerW: +r(root).width.toFixed(2),
    fill: +(r(grid).width / (r(root).width - 26)).toFixed(3),
    doc: {
      scrollH: document.documentElement.scrollHeight,
      clientW: document.documentElement.clientWidth,
      clientH: document.documentElement.clientHeight,
      hasVScroll: document.documentElement.scrollHeight > document.documentElement.clientHeight,
    },
  };
});

/* ===== 跳动量化：滚动到面板可见，记下点击前各元素位置，点击后再记 ===== */
await page.evaluate(() => document.getElementById('lt-detail').scrollIntoView({ block: 'center' }));
await page.waitForTimeout(600);

const snap = () => page.evaluate(() => {
  const ids = ['card-lifetime', 'card-recent', 'lt-detail', 'hx-root', 'hx-grid', 'hx-day'];
  const out = {};
  for (const id of ids) {
    const el = document.getElementById(id);
    if (!el) continue;
    const b = el.getBoundingClientRect();
    out[id] = { top: +b.top.toFixed(2), left: +b.left.toFixed(2), w: +b.width.toFixed(2), h: +b.height.toFixed(2) };
  }
  return {
    rects: out,
    scrollY: window.scrollY,
    scrollH: document.documentElement.scrollHeight,
    clientW: document.documentElement.clientWidth,
    hasVScroll: document.documentElement.scrollHeight > document.documentElement.clientHeight,
    hx: getComputedStyle(document.getElementById('hx-root')).getPropertyValue('--hx').trim(),
    gap: getComputedStyle(document.getElementById('hx-root')).getPropertyValue('--hx-gap').trim(),
  };
});

const before = await snap();

// 找一天有记录的格子点一下
const target = await page.evaluate(() => {
  const c = [...document.querySelectorAll('#hx-grid .hx-c[role="button"]')]
    .find((el) => /[1-9]/.test(el.getAttribute('aria-label') || '') && !/没有游玩|没玩/.test(el.getAttribute('aria-label') || ''));
  if (!c) return null;
  const b = c.getBoundingClientRect();
  return { x: b.left + b.width / 2, y: b.top + b.height / 2, label: c.getAttribute('aria-label') };
});
if (target) await page.mouse.click(target.x, target.y);
await page.waitForTimeout(500);
const after = await snap();

const delta = {};
for (const k of Object.keys(before.rects)) {
  const a = before.rects[k], b = after.rects[k];
  delta[k] = { dTop: +(b.top - a.top).toFixed(2), dLeft: +(b.left - a.left).toFixed(2), dW: +(b.w - a.w).toFixed(2), dH: +(b.h - a.h).toFixed(2) };
}

console.log(JSON.stringify({ W, geo, target: target && target.label, before: { scrollY: before.scrollY, scrollH: before.scrollH, clientW: before.clientW, hasVScroll: before.hasVScroll, hx: before.hx, gap: before.gap }, after: { scrollY: after.scrollY, scrollH: after.scrollH, clientW: after.clientW, hasVScroll: after.hasVScroll, hx: after.hx, gap: after.gap }, delta, errs }, null, 2));

await browser.close();
