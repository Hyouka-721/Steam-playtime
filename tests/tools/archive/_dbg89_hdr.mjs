/* 一次性诊断：两页页眉高度到底差多少（保留 2 位小数 + 两次取样看是否稳定） */
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const browser = await chromium.launch({ args: ['--no-proxy-server'] });
for (const W of [1440, 860]) {
  const out = {};
  for (const pg of ['index.html', 'watch.html']) {
    const ctx = await browser.newContext({ viewport: { width: W, height: 900 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
    const p = await ctx.newPage();
    await p.goto('http://127.0.0.1:8895/' + pg, { waitUntil: 'load' });
    await p.evaluate(() => document.fonts.ready);
    await p.waitForTimeout(900);
    const read = () => p.evaluate(() => {
      const hdr = document.querySelector('.site-header, .w-header');
      const t = document.querySelector('.site-title, .w-title');
      const cs = getComputedStyle(hdr), ts = getComputedStyle(t);
      const r = hdr.getBoundingClientRect(), tr = t.getBoundingClientRect();
      return {
        hdrH: +r.height.toFixed(2), titleH: +tr.height.toFixed(2), titleW: +tr.width.toFixed(2),
        pad: cs.paddingTop + ' / ' + cs.paddingBottom, border: cs.borderBottomWidth,
        font: ts.fontFamily.slice(0, 22) + ' ' + ts.fontSize + '/' + ts.lineHeight + ' ls' + ts.letterSpacing,
        mb: cs.marginBottom,
      };
    });
    const a = await read();
    await p.waitForTimeout(500);
    const b = await read();
    out[pg] = { ...a, again: b.hdrH };
    await ctx.close();
  }
  const i = out['index.html'], w = out['watch.html'];
  console.log(`\n== ${W} ==`);
  console.log('index :', JSON.stringify(i));
  console.log('watch :', JSON.stringify(w));
  console.log(`Δ hdrH = ${(i.hdrH - w.hdrH).toFixed(2)}   Δ titleH = ${(i.titleH - w.titleH).toFixed(2)}   Δ titleW = ${(i.titleW - w.titleW).toFixed(2)}`);
}
await browser.close();
