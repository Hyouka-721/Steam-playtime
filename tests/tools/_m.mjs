import { createRequire } from 'node:module';
const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');
const b = await chromium.launch({ args: ['--no-proxy-server'] });
for (const w of [1100, 1024, 900]) {
  const c = await b.newContext({ viewport: { width: w, height: 1100 }, serviceWorkers: 'block' });
  const p = await c.newPage();
  await p.goto('http://127.0.0.1:8895/index.html', { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#lt-list .rank-item', { timeout: 30000 });
  await p.waitForTimeout(300);
  for (let i = 0; i < 2; i++) { await p.click('#card-lifetime'); await p.waitForTimeout(400); if (await p.evaluate(() => !document.getElementById('lt-detail').hidden)) break; }
  await p.waitForTimeout(400);
  const r = await p.evaluate(() => {
    const pair = document.getElementById('heat-drill');
    const mb = pair.querySelector('.heat-mb');
    const hc = pair.querySelector('.hc');
    const i = hc.querySelector('i');
    const csm = getComputedStyle(mb), csh = getComputedStyle(hc), csi = getComputedStyle(i);
    return {
      pairW: +pair.getBoundingClientRect().width.toFixed(1),
      gap: csm.columnGap || getComputedStyle(pair).columnGap,
      mbW: +mb.getBoundingClientRect().width.toFixed(1),
      mbPad: csm.paddingLeft,
      cellW: +hc.getBoundingClientRect().width.toFixed(1),
      cellPad: csh.paddingLeft,
      textW: +(i.getBoundingClientRect().width).toFixed(1),
      textScroll: i.scrollWidth,
      over: i.scrollWidth - i.clientWidth,
      avail: +(hc.clientWidth - parseFloat(csh.paddingLeft) * 2).toFixed(1),
    };
  });
  console.log(w, JSON.stringify(r));
  await c.close();
}
await b.close();
