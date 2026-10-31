/* 第 83 轮归档截图：线上 watch 页三个控件逐个真悬停，证明无 title 气泡
   输出到 OUT，文件名带序号，便于归档排序 */
import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const SITE = 'https://hyouka-721.github.io/Steam-playtime/watch.html';
const OUT = 'C:/Users/33329/AppData/Local/Temp/fx_verify_20261018/shots83/';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.goto(SITE, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.tl-item', { timeout: 20000 }).catch(() => {});
await page.waitForTimeout(1500);

const titleCount = await page.evaluate(() => document.querySelectorAll('[title]').length);
console.log('线上 [title] 元素数：', titleCount);

// 1) 首屏
await page.screenshot({ path: OUT + '01_首屏.png' });

// 2) 左下角：鼠标悬停在加号上（约 1.2s，足以触发原生 tooltip）
const fab = await page.$('#w-fab');
if (fab) {
  const b = await fab.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.waitForTimeout(1200);
  await page.screenshot({
    path: OUT + '02_悬停加号_无气泡.png',
    clip: { x: Math.max(0, b.x - 150), y: Math.max(0, b.y - 120), width: 320, height: 220 },
  });
  console.log('加号 title 属性：', await fab.getAttribute('title'), '｜ aria-label：', await fab.getAttribute('aria-label'));
}

// 3) 左下角小黄人 logo
const logo = await page.$('#logo-watch, .w-home');
if (logo) {
  const b = await logo.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.waitForTimeout(1200);
  await page.screenshot({
    path: OUT + '03_悬停小黄人_无气泡.png',
    clip: { x: Math.max(0, b.x - 40), y: Math.max(0, b.y - 40), width: Math.min(360, b.width + 240), height: b.height + 120 },
  });
  console.log('小黄人 title 属性：', await logo.getAttribute('title'), '｜ aria-label：', await logo.getAttribute('aria-label'));
}

// 4) 史蒂夫头像（切到时间轴后悬停）
const avatar = await page.$('#w-avatar');
if (avatar) {
  const b = await avatar.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.waitForTimeout(1200);
  await page.screenshot({
    path: OUT + '04_悬停史蒂夫头像_无气泡.png',
    clip: { x: Math.max(0, b.x - 120), y: Math.max(0, b.y - 60), width: 320, height: 200 },
  });
  console.log('头像 title 属性：', await avatar.getAttribute('title'), '｜ aria-label：', await avatar.getAttribute('aria-label'));
}

// 5) 切时间轴看短评行（原本靠 title 显示全文，现在必须整段能读）
const tk = await page.$('#w-tl');
if (tk) {
  await avatar && (await avatar.click());
  await page.waitForTimeout(700);
  const first = await page.$('.tl-item');
  if (first) {
    const b = await first.boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: OUT + '05_时间轴悬停条目_无气泡.png', clip: { x: 0, y: Math.max(0, b.y - 30), width: 1440, height: Math.min(400, b.height + 60) } });
  }
}

const finalCount = await page.evaluate(() => document.querySelectorAll('[title]').length);
console.log('悬停/切换后 [title] 元素数：', finalCount);
await browser.close();
console.log('截图输出：', OUT);
