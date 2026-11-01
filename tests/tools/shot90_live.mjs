/* shot90_live.mjs — 第 90 轮上线后的线上实拍
   用法：node tests/tools/shot90_live.mjs [输出目录]
   产出：live-01-线上首屏.png / live-02-线上时间轴1000h周.png / live-03-线上窄屏.png */
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';

const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const OUT = process.argv[2] || 'C:/Users/33329/AppData/Local/Temp/shot90live';
const SITE = 'https://hyouka-721.github.io/Steam-playtime/';
mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(...a);

const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const errs = [];

const waitCovers = async (page, ms = 1500) => {
  // 先让滚动触发的 lazy 队列启动，再把时间轴里的图全部改 eager ——
  // 只改 eager 不等待的话，滚动后新进入视口的那几张会截成白色圆角空块。
  await page.waitForTimeout(900);
  await page.evaluate(async () => {
    for (const im of document.querySelectorAll('#timeline .tl-game img')) im.loading = 'eager';
    const inView = [...document.querySelectorAll('#timeline .tl-game img')].filter((im) => {
      const r = im.getBoundingClientRect();
      return r.bottom > -80 && r.top < window.innerHeight + 80;
    });
    await Promise.all(inView.map((im) => new Promise((res) => {
      if (im.complete && im.naturalWidth) return res();
      im.addEventListener('load', res, { once: true });
      im.addEventListener('error', res, { once: true });
      setTimeout(res, 12000);
    })));
  });
  await page.waitForTimeout(ms);
};

/* 1440 */
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(String(e)));
  // 首屏可见的 15 张封面要 eager + 等 complete，否则截出一排灰块
  await page.goto(`${SITE}index.html?t=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('#lt-list .rank-item', { timeout: 30000 });
  await page.waitForTimeout(1200);
  await page.evaluate(async () => {
    const ims = [...document.querySelectorAll('#lt-list img')].slice(0, 15);
    for (const im of ims) im.loading = 'eager';
    await Promise.all(ims.map((im) => new Promise((res) => {
      if (im.complete && im.naturalWidth) return res();
      im.addEventListener('load', res, { once: true });
      im.addEventListener('error', res, { once: true });
      setTimeout(res, 12000);
    })));
  });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/live-01-线上首屏.png` });

  await page.click('#card-games');
  await page.waitForTimeout(900);
  const info = await page.evaluate(() => {
    const ms = [...document.querySelectorAll('#timeline .tl-milestone')].find((e) => e.textContent.includes('1000h'));
    ms?.closest('.tl-item')?.scrollIntoView({ block: 'center' });
    return {
      weeks: document.querySelectorAll('#timeline .tl-item').length,
      week1000h: ms?.closest('.tl-item')?.querySelector('.tl-week')?.textContent?.trim() ?? null,
      hasWord: document.body.innerText.includes('补录'),
    };
  });
  log('线上周数', info.weeks, '｜1000h 周', info.week1000h, '｜含「补录」', info.hasWord);
  await waitCovers(page);
  await page.screenshot({ path: `${OUT}/live-02-线上时间轴1000h周.png` });
  await ctx.close();
}

/* 390 */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 3 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(`${SITE}index.html?t=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('#lt-list .rank-item', { timeout: 30000 });
  await page.click('#card-games');
  await page.waitForTimeout(900);
  const m = await page.evaluate(() => {
    const items = [...document.querySelectorAll('#timeline .tl-item')];
    items[1]?.scrollIntoView({ block: 'start' });
    return { weeks: items.length, overflow: document.documentElement.scrollWidth - window.innerWidth };
  });
  log('窄屏周数', m.weeks, '横向溢出', m.overflow);
  await waitCovers(page);
  await page.screenshot({ path: `${OUT}/live-03-线上窄屏.png` });
  await ctx.close();
}

await browser.close();
log('JS 异常', errs.length, errs.slice(0, 2));
log('screens ->', OUT);
