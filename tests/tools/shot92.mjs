/* shot92.mjs — 第 92 轮取证：站名 Game Time + 手柄图标
   用法：node tests/tools/shot92.mjs [输出目录]

   产出：
     92-01-桌面首屏.png          1440，看页眉站名与整体
     92-02-页眉特写-桌面.png      页眉区域裁切
     92-03-页眉特写-390.png       390 窄屏页眉（确认站名折行是否撑坏版面）
     92-04-页眉特写-360.png       360 极窄
     92-05-标签页模拟.png         用真实 favicon + 站名拼一张「浏览器标签页」效果图
     92-06-图标全家福.png         favicon 16/32/48 + apple-touch + PWA 192/512
*/
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import fs from 'node:fs';
import sharp from 'sharp';

const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const OUT = process.argv[2] || 'C:/Users/33329/AppData/Local/Temp/shot92';
const SITE = process.env.SITE || 'http://127.0.0.1:8895/index.html';
mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(...a);

const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const errs = [];

const grab = async (vw, vh, dsf, file, opts = {}) => {
  const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: dsf });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(SITE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('#lt-list .rank-item', { state: 'visible', timeout: 30000 });
  await page.waitForTimeout(1200);
  // 首屏可见的封面要 eager + 等 complete，否则截出一排灰块
  await page.evaluate(async () => {
    const ims = [...document.querySelectorAll('#lt-list img')].slice(0, 15);
    for (const im of ims) im.loading = 'eager';
    await Promise.all(ims.map((im) => new Promise((res) => {
      if (im.complete && im.naturalWidth) return res();
      im.addEventListener('load', res, { once: true });
      im.addEventListener('error', res, { once: true });
      setTimeout(res, 8000);
    })));
  });
  await page.waitForTimeout(500);
  const info = await page.evaluate(() => {
    const el = document.getElementById('site-title');
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      title: document.title,
      text: el.textContent.trim(),
      fs: cs.fontSize, lh: cs.lineHeight,
      h: +r.height.toFixed(1), w: +r.width.toFixed(1),
      lines: Math.max(1, Math.round(r.height / parseFloat(cs.lineHeight))),
    };
  });
  log(`${vw}px →`, JSON.stringify(info));
  if (opts.clip) {
    const clip = await page.evaluate(() => {
      const hdr = document.querySelector('.site-header');
      const r = hdr.getBoundingClientRect();
      return { x: 0, y: 0, width: window.innerWidth, height: Math.ceil(r.bottom + 8) };
    });
    await page.screenshot({ path: `${OUT}/${file}`, clip });
  } else {
    await page.screenshot({ path: `${OUT}/${file}` });
  }
  await ctx.close();
  return info;
};

await grab(1440, 1000, 2, '92-01-桌面首屏.png');
await grab(1440, 1000, 2, '92-02-页眉特写-桌面.png', { clip: true });
await grab(390, 900, 3, '92-03-页眉特写-390.png', { clip: true });
await grab(360, 900, 3, '92-04-页眉特写-360.png', { clip: true });

await browser.close();

/* ⑤ 图标全家福 */
{
  const pick = (re) => fs.readdirSync('docs/img').find((f) => re.test(f));
  const items = [
    ['docs/img/' + pick(/^favicon-16-[0-9a-f]{8}\.png$/), 16],
    ['docs/img/' + pick(/^favicon-32-[0-9a-f]{8}\.png$/), 32],
    ['docs/img/' + pick(/^favicon-48-[0-9a-f]{8}\.png$/), 48],
    ['docs/img/' + pick(/^apple-touch-icon-[0-9a-f]{8}\.png$/), 180],
    ['docs/img/' + pick(/^icon-game-192-[0-9a-f]{8}\.png$/), 192],
    ['docs/img/' + pick(/^icon-game-512-[0-9a-f]{8}\.png$/), 512],
  ];
  const cell = 200;
  const parts = [];
  let x = 10;
  for (const [p, size] of items) {
    // 统一缩到 160 的格子里居中，便于肉眼比较清晰度
    const buf = await sharp(p).resize(160, 160, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } }).png().toBuffer();
    parts.push({ input: buf, left: x, top: 20 });
    x += cell - 30;
  }
  await sharp({ create: { width: x + 10, height: 200, channels: 4, background: { r: 245, g: 242, b: 237, alpha: 1 } } })
    .composite(parts)
    .png()
    .toFile(`${OUT}/92-06-图标全家福.png`);
  log('92-06-图标全家福.png 已生成');
}

/* ⑥ 标签页模拟：真实 favicon + 站名，画一个浏览器标签的样子 */
{
  const fav = 'docs/img/' + fs.readdirSync('docs/img').find((f) => /^favicon-32-[0-9a-f]{8}\.png$/.test(f));
  // data:text/html 页面里 file:// 会被拦，图标会变破图 → 直接内联成 base64
  const b64 = 'data:image/png;base64,' + fs.readFileSync(fav).toString('base64');
  const html = `<!doctype html><meta charset="utf-8">
  <style>
    body { margin:0; background:#1f3a52; font-family:"Segoe UI","Microsoft YaHei",sans-serif; }
    .tab { display:flex; align-items:center; gap:12px; width:420px; height:44px;
           padding:0 16px; background:#25506e; border-radius:10px 10px 0 0; color:#fff; font-size:15px; }
    .tab img { width:18px; height:18px; }
    .x { margin-left:auto; opacity:.9; font-size:18px; }
  </style>
  <div class="tab"><img src="${b64}"><span>Game Time</span><span class="x">✕</span></div>`;
  const b2 = await chromium.launch({ args: ['--no-proxy-server'] });
  const ctx = await b2.newContext({ viewport: { width: 460, height: 60 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/92-05-标签页模拟.png`, clip: { x: 0, y: 0, width: 440, height: 46 } });
  await b2.close();
  log('92-05-标签页模拟.png 已生成');
}

log('JS 异常', errs.length, errs.slice(0, 2));
log('screens ->', OUT);
