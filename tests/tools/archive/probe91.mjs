import { createRequire } from 'node:module';
const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');
const b = await chromium.launch({ args: ['--no-proxy-server'] });
const c = await b.newContext({ viewport: { width: 1440, height: 1000 } });
const p = await c.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(String(e)));
await p.goto('http://127.0.0.1:8895/index.html', { waitUntil: 'domcontentloaded' });
await p.waitForSelector('#lt-list .rank-item', { state: 'visible', timeout: 30000 });
await p.click('#card-games');
await p.waitForTimeout(900);

const probe = async (w) => {
  await p.setViewportSize({ width: w, height: 950 });
  await p.waitForTimeout(400);
  return await p.evaluate(() => {
    const ms = [...document.querySelectorAll('#timeline .tl-milestone')];
    const wk = [...document.querySelectorAll('#timeline .tl-week')];
    const worst = wk.map((el) => {
      const r = el.getBoundingClientRect();
      const left = el.closest('.tl-left').getBoundingClientRect();
      return { t: el.textContent.trim(), w: +r.width.toFixed(1), colW: +left.width.toFixed(1), over: +(r.width - left.width + 2).toFixed(1), x0: +r.left.toFixed(1), lx0: +left.left.toFixed(1) };
    }).sort((a, c) => c.w - a.w)[0];
    const cs = (el) => (el ? getComputedStyle(el) : null);
    return {
      vw: window.innerWidth,
      milestones: ms.map((e) => e.textContent.replace(/\s+/g, ' ').trim()),
      msCount: ms.length,
      weekSize: wk[0] ? cs(wk[0]).fontSize : null,
      msTextSize: ms[0] ? cs(ms[0]).fontSize : null,
      msBoldSize: ms[0] ? cs(ms[0].querySelector('b')).fontSize : null,
      widestWeek: worst,
      // 文字真实宽度（Range 包围盒）vs 可用宽度（clientWidth 扣左右内边距）
      textFit: (() => {
        const el = wk.find((e) => e.textContent.trim() === '10.26-11.1');
        if (!el) return null;
        const r = document.createRange(); r.selectNodeContents(el);
        const tw = r.getBoundingClientRect().width;
        const cw = el.clientWidth - parseFloat(getComputedStyle(el).paddingLeft) - parseFloat(getComputedStyle(el).paddingRight);
        return { textW: +tw.toFixed(1), availW: +cw.toFixed(1), over: +(tw - cw).toFixed(1), scrollOver: el.scrollWidth - el.clientWidth };
      })(),
      docOverflow: document.documentElement.scrollWidth - window.innerWidth,
      // 左列是否把内容挤出去（周的左边界早于左列左边界 = 溢出到列外）
      weekOutside: wk.some((el) => el.getBoundingClientRect().left < el.closest('.tl-left').getBoundingClientRect().left - 1),
    };
  });
};
for (const w of [1440, 1024, 900, 768, 430, 390, 360]) {
  console.log(JSON.stringify(await probe(w)));
}
console.log('errs', errs.slice(0, 2));
await b.close();
