/* 第 85 轮上线归档：重截线上 1440 / 390 首屏（把首屏 15 张海报的 loading 改成 eager，等它们全 complete 再截）
   原 online85_watch 的截图只等前 3 张 → 首排后 2 张与整排第二排是灰块，不适合当归档证据 */
import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const SITE = 'https://hyouka-721.github.io/Steam-playtime/watch.html';
const OUT = 'C:/Users/33329/AppData/Local/Temp/fx_verify_20261018/shots85live/';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ args: ['--no-proxy-server'] });
for (const [w, h, name] of [[1440, 950, 'live_1440'], [390, 844, 'live_390']]) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: h }, deviceScaleFactor: 2, serviceWorkers: 'block',
  });
  const p = await ctx.newPage();
  for (let i = 1; i <= 4; i++) {
    try { await p.goto(SITE, { waitUntil: 'domcontentloaded', timeout: 45000 }); break; }
    catch (e) { if (i === 4) throw e; await p.waitForTimeout(2000); }
  }
  await p.waitForFunction(() => document.querySelectorAll('#w-grid .poster').length > 20, null, { timeout: 30000 }).catch(() => {});
  await p.evaluate(() => document.fonts.ready);
  await p.evaluate(() => {
    [...document.querySelectorAll('#w-grid .poster img')].slice(0, 15).forEach((im) => { im.loading = 'eager'; });
  });
  const t0 = Date.now();
  await p.waitForFunction(() => {
    const ims = [...document.querySelectorAll('#w-grid .poster img')].slice(0, 15);
    return ims.length >= 15 && ims.every((im) => im.complete && im.naturalWidth > 0);
  }, null, { timeout: 90000 }).catch(() => {});
  await p.waitForTimeout(500);
  const st = await p.evaluate(() => {
    const ims = [...document.querySelectorAll('#w-grid .poster img')].slice(0, 15);
    return { total: ims.length, ready: ims.filter((i) => i.complete && i.naturalWidth > 0).length };
  });
  await p.screenshot({ path: OUT + name + '.png' });
  console.log(`${w}: 前 ${st.ready}/${st.total} 张就绪，用时 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  await ctx.close();
}
await browser.close();
console.log('done ->', OUT);
