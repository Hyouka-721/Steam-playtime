/* shot91.mjs — 第 91 轮取证：里程碑 500h 一档 + 周日期 / 里程碑数字字号
   用法：node tests/tools/shot91.mjs [输出目录]

   产出：
     91-01-里程碑1000h周.png      （4.13-4.19，确认 1000h 仍在）
     91-02-里程碑500h周.png       （12.8-12.14，500h 一档的第一条）
     91-03-字号特写-2倍.png       （周日期 + 里程碑标签放大，量「大 2px」的视觉差）
     91-04-窄屏390.png            （左列 78px 下 15px 周日期仍装得下）
   并打印：里程碑清单 / 三处字号 / 最宽周日期的文字宽与可用宽
*/
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';

const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const OUT = process.argv[2] || 'C:/Users/33329/AppData/Local/Temp/shot91';
const SITE = 'http://127.0.0.1:8895/index.html';
mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(...a);

const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const errs = [];

const waitCovers = async (page, ms = 1200) => {
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

const openLib = async (page) => {
  await page.waitForSelector('#lt-list .rank-item', { state: 'visible', timeout: 30000 });
  await page.click('#card-games');
  await page.waitForTimeout(900);
};

/* ---------- 桌面 ---------- */
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1050 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(SITE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await openLib(page);

  const stat = await page.evaluate(() => {
    const cs = (s) => getComputedStyle(document.querySelector(s)).fontSize;
    const weekEls = [...document.querySelectorAll('#timeline .tl-week')];
    let worst = null;
    for (const el of weekEls) {
      const r = document.createRange();
      r.selectNodeContents(el);
      const tw = r.getBoundingClientRect().width;
      const c = getComputedStyle(el);
      const avail = el.clientWidth - parseFloat(c.paddingLeft) - parseFloat(c.paddingRight);
      const over = tw - avail;
      if (!worst || over > worst.over) worst = { t: el.textContent.trim(), over: +over.toFixed(1), tw: +tw.toFixed(1), avail: +avail.toFixed(1) };
    }
    return {
      milestones: [...document.querySelectorAll('#timeline .tl-milestone')].map((e) => ({
        t: e.textContent.replace(/\s+/g, ' ').trim(),
        w: e.closest('.tl-item')?.querySelector('.tl-week')?.textContent?.trim(),
      })),
      weekFont: cs('.tl-week'),
      msFont: cs('.tl-milestone'),
      msBFont: cs('.tl-milestone b'),
      worstWeek: worst,
    };
  });
  log('里程碑:', JSON.stringify(stat.milestones));
  log(`字号：周日期 ${stat.weekFont} / 里程碑正文 ${stat.msFont} / 里程碑数字 ${stat.msBFont}（差 ${parseFloat(stat.msBFont) - parseFloat(stat.msFont)}px）`);
  log('最宽周日期:', JSON.stringify(stat.worstWeek));

  // ① 1000h 那周
  await page.evaluate(() => {
    const m = [...document.querySelectorAll('#timeline .tl-milestone')].find((e) => e.textContent.includes('1000h'));
    m?.closest('.tl-item')?.scrollIntoView({ block: 'center' });
  });
  await waitCovers(page);
  await page.screenshot({ path: `${OUT}/91-01-里程碑1000h周.png` });

  // ② 500h 那周
  await page.evaluate(() => {
    const m = [...document.querySelectorAll('#timeline .tl-milestone')].find((e) => e.textContent.includes('500h'));
    m?.closest('.tl-item')?.scrollIntoView({ block: 'center' });
  });
  await waitCovers(page);
  await page.screenshot({ path: `${OUT}/91-02-里程碑500h周.png` });

  // ③ 字号特写：把 500h 那个 tl-item 的左侧列 + 标签区域裁出来，再放大 2 倍
  const clip = await page.evaluate(() => {
    const m = [...document.querySelectorAll('#timeline .tl-milestone')].find((e) => e.textContent.includes('500h'));
    const item = m?.closest('.tl-item');
    if (!item) return null;
    const box = item.getBoundingClientRect();
    return { x: Math.max(0, box.left), y: Math.max(0, box.top), width: Math.min(760, box.width), height: box.height };
  });
  if (clip) {
    // deviceScaleFactor=2 已经自带 2 倍，这里再限定裁剪区（左列 + 前两个徽章 + 里程碑）
    await page.screenshot({ path: `${OUT}/91-03-字号特写-2倍.png`, clip });
  }
  await ctx.close();
}

/* ---------- 窄屏 390 ---------- */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 3 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(SITE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await openLib(page);
  const m = await page.evaluate(() => {
    const el = [...document.querySelectorAll('#timeline .tl-milestone')]
      .find((e) => e.textContent.includes('500h'))?.closest('.tl-item');
    el?.scrollIntoView({ block: 'center' });
    return {
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      weekFont: getComputedStyle(document.querySelector('.tl-week')).fontSize,
      cols: getComputedStyle(document.querySelector('#timeline .tl-item')).gridTemplateColumns,
    };
  });
  log('窄屏：横向溢出', m.overflow, '｜周日期字号', m.weekFont, '｜轨道', m.cols);
  await waitCovers(page);
  await page.screenshot({ path: `${OUT}/91-04-窄屏390.png` });
  await ctx.close();
}

await browser.close();
log('JS 异常', errs.length, errs.slice(0, 2));
log('screens ->', OUT);
