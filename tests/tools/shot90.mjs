/* shot90.mjs — 第 90 轮取证截图 + 隔离性自检
   用法：node tests/tools/shot90.mjs [输出目录]

   用户两项：
     a 热力图时间标签加粗（所有时间刻度生效、不影响其它元素）
     b 游戏库时间轴补录一条：10.12 / 王国保卫战 / 1.6h，且只出现在时间轴

   产出：
     90-01-时间轴补录-桌面.png        （游戏库视图，含「补录 10.12 王国保卫战 1.6h」）
     90-02-热力图时间加粗-桌面.png    （总时长下钻的两个月热力图）
     90-03-热力图时间加粗-放大.png    （单格放大看清字重）
     90-04-热力图时间加粗-窄屏.png    （390 宽，确认加粗后不折行/不溢出）
     90-05-时间轴补录-窄屏.png
   同时打印隔离性检查结果（stats / 热力图 / 最近游玩 / 汇总卡）
*/
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';

const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const OUT =
  process.argv[2] ||
  'C:/Users/33329/Documents/Misc/对话成果/2026-11-01_第90轮_时间标签加粗与时间轴补录/对照图';
const SITE = 'http://127.0.0.1:8895/index.html';
mkdirSync(OUT, { recursive: true });

const log = (...a) => console.log(...a);
const browser = await chromium.launch({ args: ['--no-proxy-server'] });

/* ---------- 1. 桌面：游戏库时间轴 ---------- */
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(SITE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#lt-list .rank-item', { timeout: 20000 });

  // 切到「游戏库」视图
  await page.click('#card-games');
  await page.waitForTimeout(400);
  const viewOk = await page.evaluate(() => {
    const v = document.getElementById('view-timeline');
    return v ? v.classList.contains('active') : false;
  });
  log('library view visible:', viewOk);

  const extra = await page.evaluate(() => {
    const el = document.querySelector('#timeline .tl-extra');
    if (!el) return null;
    const item = el.closest('.tl-item');
    return {
      text: el.textContent.trim(),
      weekRange: item?.querySelector('.tl-week')?.textContent?.trim() ?? null,
      count: document.querySelectorAll('#timeline .tl-extra').length,
    };
  });
  log('tl-extra:', JSON.stringify(extra));

  // 定位到那一周
  await page.evaluate(() => {
    const el = document.querySelector('#timeline .tl-extra');
    el?.closest('.tl-item')?.scrollIntoView({ block: 'center' });
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/90-01-时间轴补录-桌面.png` });

  // 隔离性：热力图 / 汇总 / 最近游玩 都不该看到这 96 分钟
  const iso = await page.evaluate(() => {
    const meta = window.__BOOT?.meta ?? null;
    return {
      stats_total: meta?.stats?.total_minutes ?? null,
      stats_days: meta?.stats?.tracked_days ?? null,
      heat_sum: document.getElementById('heat-sum')?.textContent?.trim() ?? null,
      heat_1012: !!document.querySelector('#heat-drill [data-date="2026-10-12"]'),
      extra_in_meta: (meta?.timeline_extra ?? []).length,
    };
  });
  log('isolation:', JSON.stringify(iso));
  await ctx.close();
}

/* ---------- 2. 桌面：热力图时间标签加粗 ---------- */
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(SITE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#lt-list .rank-item', { timeout: 20000 });
  await page.click('#card-lifetime');
  await page.waitForSelector('#lt-detail:not([hidden])', { timeout: 10000 });
  await page.waitForTimeout(800);

  const fw = await page.evaluate(() => {
    const els = [...document.querySelectorAll('#heat-drill .hc i')];
    const vals = els.map((e) => getComputedStyle(e).fontWeight);
    const uniq = [...new Set(vals)];
    const sample = els.slice(0, 6).map((e) => e.textContent.trim());
    return { cells: els.length, weights: uniq, sample };
  });
  log('heat time font-weight:', JSON.stringify(fw));

  await page.screenshot({ path: `${OUT}/90-02-热力图时间加粗-桌面.png` });

  // 单格放大：截一个带时长的格子附近区域
  const clip = await page.evaluate(() => {
    const el = [...document.querySelectorAll('#heat-drill .hc')].find((c) => c.querySelector('i') && c.querySelector('i').textContent.trim() !== '0');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.max(0, r.left - 6), y: Math.max(0, r.top - 6), width: r.width * 3 + 12, height: r.height * 3 + 12 };
  });
  if (clip) await page.screenshot({ path: `${OUT}/90-03-热力图时间加粗-放大.png`, clip });
  await ctx.close();
}

/* ---------- 3. 窄屏 390 ---------- */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 3 });
  const page = await ctx.newPage();
  await page.goto(SITE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#lt-list .rank-item', { timeout: 20000 });
  await page.click('#card-lifetime');
  await page.waitForSelector('#lt-detail:not([hidden])', { timeout: 10000 });
  await page.waitForTimeout(800);

  const narrow = await page.evaluate(() => {
    const els = [...document.querySelectorAll('#heat-drill .hc')];
    const bad = els
      .map((c) => {
        const i = c.querySelector('i');
        if (!i) return null;
        const cs = getComputedStyle(i);
        const over = i.scrollWidth - i.clientWidth;
        // 溢出量要小于左内边距，字才没被切
        const pad = parseFloat(getComputedStyle(c).paddingLeft) || 0;
        if (over > 0 && pad - over <= 0) return { t: i.textContent.trim(), over, pad };
        return null;
      })
      .filter(Boolean);
    const withI = els.filter((c) => c.querySelector('i'));
    const lineH = withI[0]?.querySelector('i')?.getBoundingClientRect().height ?? 0;
    // 折行判据：同一格 i 的高度明显超过单行高（nowrap 下应恒等于单行高）
    const wrapped = withI.filter((c) => (c.querySelector('i')?.getBoundingClientRect().height ?? 0) > lineH + 2).length;
    return {
      overflow: bad,
      wrapped,
      docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  log('narrow 390:', JSON.stringify(narrow));
  // 窄屏首屏只到统计卡，先把热力图滚到视口中央再截，否则截了个寂寞
  await page.evaluate(() => document.getElementById('heat-drill')?.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/90-04-热力图时间加粗-窄屏.png` });

  // 时间轴窄屏
  await page.click('#btn-drill-back').catch(() => {});
  await page.waitForTimeout(300);
  await page.click('#card-games');
  await page.waitForTimeout(400);
  const tlOk = await page.evaluate(() => {
    const el = document.querySelector('#timeline .tl-extra');
    if (!el) return null;
    el.closest('.tl-item')?.scrollIntoView({ block: 'center' });
    const r = el.getBoundingClientRect();
    return { text: el.textContent.trim(), width: Math.round(r.width), docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  });
  log('narrow timeline:', JSON.stringify(tlOk));
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/90-05-时间轴补录-窄屏.png` });
  await ctx.close();
}

await browser.close();
log('\nscreens ->', OUT);
