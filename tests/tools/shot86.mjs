/* shot86.mjs — 第 86 轮月历热力图取证截图（本地 8895 静态服务） */
import { createRequire } from 'node:module';

const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const OUT = process.argv[2] || 'C:/Users/33329/Documents/Misc/对话成果/2026-10-31_第86轮_热力图按月与去除ECharts/对照图';
const SITE = 'http://127.0.0.1:8895/index.html';

const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.goto(SITE, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#lt-list .rank-item', { timeout: 20000 });

// ① 全部游戏 · 月历热力图
await page.click('#card-lifetime');
await page.waitForSelector('#lt-detail:not([hidden])');
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/86-01-全部游戏月历.png`, fullPage: false });

// ② 单游戏 · 月历热力图 + 占比/成就
await page.click('#btn-drill-back');
await page.waitForTimeout(400);
await page.click('#lt-list .rank-item');
await page.waitForTimeout(700);
await page.screenshot({ path: `${OUT}/86-02-单游戏月历.png`, fullPage: false });

// ③ 数据页：旧 18 周热力图已消失
await page.click('#btn-drill-back');
await page.waitForTimeout(300);
await page.click('#card-data');
await page.waitForTimeout(700);
await page.screenshot({ path: `${OUT}/86-03-数据页无热力图.png`, fullPage: true });

// ④ 窄屏（390px）月历
await page.setViewportSize({ width: 390, height: 844 });
await page.click('#card-lifetime');   // 当前在「数据」页 → 这一下只回列表
await page.waitForTimeout(400);
await page.click('#card-lifetime');   // 第二下才进下钻
await page.waitForSelector('#lt-detail:not([hidden])', { timeout: 8000 });
await page.waitForTimeout(500);
await page.evaluate(() => document.getElementById('lt-detail').scrollIntoView({ block: 'start' }));
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/86-04-窄屏月历.png`, fullPage: false });

await browser.close();
console.log('shots ->', OUT);
