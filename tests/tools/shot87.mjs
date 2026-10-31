/* shot87.mjs — 第 87 轮取证截图（本地 8895 静态服务）
   用法：node tests/tools/shot87.mjs [输出目录]  （默认写到对话成果归档目录） */
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';

const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const OUT =
  process.argv[2] ||
  'C:/Users/33329/Documents/Misc/对话成果/2026-10-31_第87轮_热力图字样与日明细并入/对照图';
const SITE = 'http://127.0.0.1:8895/index.html';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ args: ['--no-proxy-server'] });

/* ① 桌面：热力图（时长字样已放大加深）→ ② 点格子看当日明细 */
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(SITE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#lt-list .rank-item', { timeout: 20000 });
  await page.click('#card-lifetime');
  await page.waitForSelector('#lt-detail:not([hidden])');
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/87-01-热力图-时长字样放大.png` });

  await page.click('#heat-drill .hc[data-date="2026-10-18"]');
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/87-02-点格子看当日明细.png` });

  // ③ 单游戏下钻里点格子：明细仍列当天全部游戏 + 高亮当前那款
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await page.click('#btn-drill-back');
  await page.waitForTimeout(300);
  await page.click('#lt-list .rank-item');
  await page.waitForTimeout(600);
  await page.click('#heat-drill .hc[data-date="2026-10-25"]');
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/87-03-单游戏明细高亮.png` });

  // ④ 最近游玩：日历图标已删除
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await page.click('#btn-drill-back');
  await page.waitForTimeout(300);
  await page.click('#card-recent');
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/87-04-最近游玩无日历图标.png` });
  await ctx.close();
}

/* ⑤⑥ 窄屏：390 / 360（时长字样自适应的两档） */
for (const [w, h] of [[390, 844], [360, 780]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 3 });
  const page = await ctx.newPage();
  await page.goto(SITE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#lt-list .rank-item', { timeout: 20000 });
  await page.click('#card-lifetime');
  await page.waitForSelector('#lt-detail:not([hidden])');
  await page.waitForTimeout(700);
  await page.evaluate(() => document.getElementById('lt-detail').scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/87-0${w === 390 ? 5 : 6}-热力图-${w}px.png` });
  await ctx.close();
}

await browser.close();
console.log('shots ->', OUT);
