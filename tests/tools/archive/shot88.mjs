/* shot88.mjs — 第 88 轮取证截图
   用法：node tests/tools/shot88.mjs [输出目录]
   产出：① 现状（9 月空月占位 + 10 月真日历）② 造两份真实数据后的「两月并排」
        ③ 换算行量词修复 ④ 窄屏竖排 ⑤ 1024 两列 */
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';

const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const OUT =
  process.argv[2] ||
  'C:/Users/33329/Documents/Misc/对话成果/2026-10-31_第88轮_两月并排与字号可读性/对照图';
const SITE = 'http://127.0.0.1:8895/index.html';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ args: ['--no-proxy-server'] });

const openDrill = async (page) => {
  await page.waitForSelector('#lt-list .rank-item', { timeout: 20000 });
  await page.click('#card-lifetime');
  await page.waitForSelector('#lt-detail:not([hidden])', { timeout: 10000 });
  await page.waitForTimeout(700);
};

/* ①③ 现状：9 月占位 + 10 月真日历；换算行 */
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(SITE, { waitUntil: 'domcontentloaded' });
  await openDrill(page);
  await page.screenshot({ path: `${OUT}/88-01-两月并排-当月空月占位.png` });

  await page.click('#btn-drill-back');
  await page.waitForTimeout(250);
  await page.click('#card-data');
  await page.waitForTimeout(600);
  await page.evaluate(() => document.getElementById('convert').scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${OUT}/88-02-换算量词修复.png`, clip: await page.evaluate(() => {
    const r = document.getElementById('convert').getBoundingClientRect();
    return { x: Math.max(0, r.left - 12), y: Math.max(0, r.top - 12), width: Math.min(1440, r.width + 24), height: r.height + 24 };
  }) });
  await ctx.close();
}

/* ② 造 9 月真实数据，展示「两个真月份并排」 */
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  await page.route('**/index.html*', async (route) => {
    const res = await route.fetch();
    let html = await res.text();
    html = html.replace(/(<script>window\.__BOOT=)([\s\S]*?);(<\/script>)/, (m, open, json, close) => {
      const boot = JSON.parse(json);
      const now = new Date().toISOString();
      const pool = [
        { appid: '646570', name: '杀戮尖塔' }, { appid: '246420', name: '王国保卫战' },
        { appid: '105600', name: '泰拉瑞亚' }, { appid: '227300', name: '欧洲卡车模拟2' },
      ];
      const seed = [95, 0, 40, 210, 0, 0, 65, 130, 25, 0, 0, 180, 55, 0, 90, 0, 300, 45, 0, 0, 120, 70, 0, 0, 35, 160, 0, 0, 85, 0];
      const days = {};
      seed.forEach((mins, i) => {
        const d = String(i + 1).padStart(2, '0');
        days[`2026-09-${d}`] = mins
          ? { total_minutes: mins, span_days: 1, confidence: 'high', source: 'auto', flags: [], games: [{ ...pool[i % pool.length], minutes: mins, is_new: false }] }
          : { total_minutes: 0, span_days: 1, confidence: 'high', source: 'auto', flags: [], games: [] };
      });
      boot.meta.months = ['2026-09', '2026-10'];
      boot.meta.generated_at = now;
      boot.daily['2026-09'] = { schema: 1, month: '2026-09', tz: 'Asia/Shanghai', unit: 'minute', generated_at: now, days };
      return open + JSON.stringify(boot) + ';' + close;
    });
    await route.fulfill({ response: res, body: html, headers: { ...res.headers(), 'content-type': 'text/html; charset=utf-8' } });
  });
  await page.goto(SITE, { waitUntil: 'domcontentloaded' });
  await openDrill(page);
  await page.screenshot({ path: `${OUT}/88-03-两月并排-都有数据.png` });
  await ctx.close();
}

/* ④⑤ 窄屏竖排 + 1024 两列 */
for (const [w, h, name] of [[1024, 950, '88-04-两列-1024px'], [390, 844, '88-05-竖排-390px'], [360, 780, '88-06-竖排-360px']]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(SITE, { waitUntil: 'domcontentloaded' });
  await openDrill(page);
  await page.evaluate(() => document.getElementById('lt-detail').scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  await ctx.close();
}

await browser.close();
console.log('shots ->', OUT);
