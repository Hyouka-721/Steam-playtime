/* shot90b.mjs — 第 90 轮（续）取证：时间轴补录扩展成整年 + 删掉补录提示行
   用法：node tests/tools/shot90b.mjs [输出目录]

   产出：
     90b-01-时间轴最新三轮.png      顶部（2026.10）
     90b-02-时间轴里程碑区.png      2026-03 附近（400~1300h 里程碑之一）
     90b-03-时间轴最早几周.png      2025.09 起点
     90b-04-时间轴整页缩略.png      整条时间轴缩略（长图压缩）
     90b-05-时间轴窄屏.png          390 宽
     90b-06-数据页健康度.png        确认「补录」字样已消失
   并在终端打印：周数 / 徽章数 / 里程碑落点 / 页面有无「补录」二字 / 破图数
*/
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';

const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const OUT = process.argv[2] || 'C:/Users/33329/AppData/Local/Temp/shot90b';
const SITE = 'http://127.0.0.1:8895/index.html';
mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(...a);

const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const errs = [];

/** 等到视口内所有时间轴封面 complete（lazy 图触发后才有内容，否则截出一排灰块） */
const waitCovers = async (page, ms = 1200) => {
  await page.evaluate(async () => {
    const inView = [...document.querySelectorAll('#timeline .tl-game img')].filter((im) => {
      const r = im.getBoundingClientRect();
      return r.bottom > -60 && r.top < window.innerHeight + 60;
    });
    await Promise.all(inView.map((im) => new Promise((res) => {
      if (im.complete && im.naturalWidth) return res();
      im.addEventListener('load', res, { once: true });
      im.addEventListener('error', res, { once: true });
      setTimeout(res, 4000);
    })));
  });
  await page.waitForTimeout(ms);
};

/* ---------- 桌面 ---------- */
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1050 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(SITE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('#lt-list .rank-item', { state: 'visible', timeout: 30000 });
  await page.click('#card-games');
  await page.waitForTimeout(900);

  const stat = await page.evaluate(() => {
    const items = [...document.querySelectorAll('#timeline .tl-item')];
    return {
      weeks: items.length,
      badges: document.querySelectorAll('#timeline .tl-badge').length,
      hint: document.getElementById('tl-hint')?.textContent?.trim(),
      hasWord: document.body.innerText.includes('补录'),
      months: [...new Set([...document.querySelectorAll('#timeline .tl-month')]
        .map((e) => e.textContent.trim()).filter(Boolean))],
      milestones: [...document.querySelectorAll('#timeline .tl-milestone')].map((e) => ({
        t: e.textContent.replace(/\s+/g, ' ').trim(),
        w: e.closest('.tl-item')?.querySelector('.tl-week')?.textContent?.trim(),
      })),
      broken: [...document.querySelectorAll('#timeline .tl-game img')]
        .filter((im) => im.complete && im.naturalWidth === 0 && im.getAttribute('src') && !im.getAttribute('src').startsWith('data:'))
        .map((im) => im.getAttribute('src')),
    };
  });
  log('周数', stat.weeks, '/ 徽章', stat.badges);
  log('提示行文案:', stat.hint);
  log('页面正文含「补录」:', stat.hasWord);
  log('月份标签:', stat.months.join(' '));
  log('里程碑:', JSON.stringify(stat.milestones));
  log('破图:', stat.broken.length, JSON.stringify(stat.broken.slice(0, 5)));

  // ① 顶部
  await page.evaluate(() => document.getElementById('timeline').scrollIntoView({ block: 'start' }));
  await waitCovers(page);
  await page.screenshot({ path: `${OUT}/90b-01-时间轴最新三轮.png` });

  // ② 里程碑区（滚到第一个带里程碑的周）
  await page.evaluate(() => {
    const ms = document.querySelector('#timeline .tl-milestone');
    const item = ms?.closest('.tl-item');
    item?.scrollIntoView({ block: 'center' });
  });
  await waitCovers(page);
  await page.screenshot({ path: `${OUT}/90b-02-时间轴里程碑区.png` });

  // ③ 最早几周
  await page.evaluate(() => {
    const items = [...document.querySelectorAll('#timeline .tl-item')];
    items[items.length - 1]?.scrollIntoView({ block: 'end' });
    window.scrollBy(0, 300);
  });
  await waitCovers(page);
  await page.screenshot({ path: `${OUT}/90b-03-时间轴最早几周.png` });

  // ④ 整条时间轴缩略（元素截图，长图按 0.35 缩放另存另算）
  const tlEl = await page.$('#timeline');
  if (tlEl) {
    const box = await tlEl.boundingBox();
    log('时间轴尺寸', Math.round(box.width) + '×' + Math.round(box.height));
    await page.evaluate(() => {
      // 长截图前把全部封面改成 eager，否则下半截全是空白
      for (const im of document.querySelectorAll('#timeline .tl-game img')) im.loading = 'eager';
    });
    await page.waitForTimeout(300);
    await page.evaluate(async () => {
      const all = [...document.querySelectorAll('#timeline .tl-game img')];
      await Promise.all(all.map((im) => new Promise((res) => {
        if (im.complete) return res();
        im.addEventListener('load', res, { once: true });
        im.addEventListener('error', res, { once: true });
        setTimeout(res, 8000);
      })));
    });
    await tlEl.screenshot({ path: `${OUT}/90b-04-时间轴整页缩略.png` });
  }

  // ⑤ 数据页健康度：确认「补录」字样已不存在
  await page.click('#card-data');
  await page.waitForTimeout(700);
  const health = await page.evaluate(() => ({
    items: [...document.querySelectorAll('#health .h-label')].map((e) => e.textContent.trim()),
    hasWord: document.getElementById('view-data')?.innerText.includes('补录'),
  }));
  log('健康度项:', health.items.join(' / '), '｜含「补录」:', health.hasWord);
  await page.evaluate(() => document.getElementById('health')?.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/90b-06-数据页健康度.png` });
  await ctx.close();
}

/* ---------- 窄屏 390 ---------- */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 3 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(SITE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('#lt-list .rank-item', { state: 'visible', timeout: 30000 });
  await page.click('#card-games');
  await page.waitForTimeout(900);
  const m = await page.evaluate(() => {
    const items = [...document.querySelectorAll('#timeline .tl-item')];
    items[1]?.scrollIntoView({ block: 'start' });
    return {
      weeks: items.length,
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      hasWord: document.body.innerText.includes('补录'),
    };
  });
  log('窄屏: 周数', m.weeks, '横向溢出', m.overflow, '含「补录」', m.hasWord);
  await waitCovers(page);
  await page.screenshot({ path: `${OUT}/90b-05-时间轴窄屏.png` });
  await ctx.close();
}

await browser.close();
log('\nJS 异常:', errs.length, errs.slice(0, 3));
log('screens ->', OUT);
