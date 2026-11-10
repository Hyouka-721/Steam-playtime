/* _p117_cls.mjs — 查 1440×1200 下 CLS 从哪来：行高两次计算是否不一致 */
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1200 }, serviceWorkers: 'block' });
const page = await ctx.newPage();
await page.addInitScript(() => {
  window.__log = [];
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) {
        if (e.hadRecentInput) continue;
        window.__log.push({
          t: Math.round(e.startTime),
          v: +e.value.toFixed(4),
          src: (e.sources || []).map((s) => (s.node ? s.node.id || s.node.className || s.node.nodeName : '?')),
        });
      }
    }).observe({ type: 'layout-shift', buffered: true });
  } catch (e) {}
  const t0 = performance.now();
  const tick = () => {
    const el = document.getElementById('lt-list');
    if (el) {
      const v = el.style.getPropertyValue('--rank-row-h');
      if (v && window.__log.length >= 0) window.__log.push({ t: Math.round(performance.now() - t0), rowH: v });
    }
    if (performance.now() - t0 < 4000) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});
await page.goto('http://127.0.0.1:8895/index.html?t=' + Date.now(), { waitUntil: 'load' });
await page.waitForTimeout(4000);
const out = await page.evaluate(() => {
  /* 只保留「行高变化」与「有 value 的 shift」两类，去掉重复采样 */
  const changes = [];
  let last = null;
  for (const e of window.__log) {
    if (e.rowH && e.rowH !== last) { changes.push({ t: e.t, rowH: e.rowH }); last = e.rowH; }
  }
  return { shifts: window.__log.filter((e) => e.v), changes };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
