/* probe102.mjs — 第 102 轮取证：占比列（C）+ 进度条收窄（E）+ 日期单行（B 改）
   用法：node tests/tools/probe102.mjs [输出目录]

   量什么：
     · .rank-item 七列的实际像素宽（1440 / 1088 / 900）
     · .rank-pct / .rank-last 是否溢出、是否真的只有一行（Range 行盒按 top 去重）
     · 占比列的取值样本（最大 / 中位 / 最小），确认不是清一色 0.0%
     · 最近游玩视图（同用 .rank-item 网格）的行结构与列宽是否跟上
   产出 4 张图：1440 榜单、1088 榜单、1440 右侧特写、1440 最近游玩。
*/
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';

const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const OUT = process.argv[2] || 'C:/Users/33329/AppData/Local/Temp/probe102';
const SITE = process.env.SITE || 'http://127.0.0.1:8895/index.html';
mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(...a);

const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const errs = [];

/** 等到真实首行渲染完 + countUp 结束（.card-value 有 900ms 动画） */
async function ready(page) {
  await page.waitForSelector('#lt-list .rank-item', { state: 'visible', timeout: 30000 });
  await page.waitForTimeout(1200);
  await page.evaluate(async () => {
    const ims = [...document.querySelectorAll('#lt-list img')].slice(0, 12);
    for (const im of ims) im.loading = 'eager';
    await Promise.all(ims.map((im) => new Promise((res) => {
      if (im.complete && im.naturalWidth) return res();
      im.addEventListener('load', res, { once: true });
      im.addEventListener('error', res, { once: true });
      setTimeout(res, 8000);
    })));
  });
  await page.waitForTimeout(300);
}

/** 行盒行数：block 元素的 getClientRects() 恒为 1，只能按 Range 的 top 去重 */
const LINE_FN = `(el) => {
  const r = document.createRange();
  r.selectNodeContents(el);
  const tops = new Set([...r.getClientRects()].map((b) => Math.round(b.top)));
  return tops.size;
}`;

const measure = async (page, label) => {
  const data = await page.evaluate((LINE_SRC) => {
    const lines = eval(LINE_SRC);
    /* 内容实际宽度：右对齐 + overflow:visible 时文本会**向左**溢出，
       scrollWidth 只算右侧，靠它判溢出会漏。必须用 Range 的包围盒量真宽。 */
    const textW = (el) => {
      if (!el) return null;
      const r = document.createRange();
      r.selectNodeContents(el);
      const b = r.getBoundingClientRect();
      return +b.width.toFixed(1);
    };
    const row = document.querySelector('#lt-list .rank-item');
    if (!row) return { err: 'no row' };
    const cs = getComputedStyle(row);
    const cols = cs.gridTemplateColumns.split(' ').map((v) => +parseFloat(v).toFixed(1));
    const kids = [...row.children].map((el) => el.className.split(' ')[0]);
    const last = row.querySelector('.rank-last');
    const pct = row.querySelector('.rank-pct');
    const min = row.querySelector('.rank-min');
    const bar = row.querySelector('.rank-bar');
    const box = (el) => el ? +el.getBoundingClientRect().width.toFixed(1) : null;
    // ::after 的宽度不在 textContent 的 Range 里 → 用整格 scrollWidth 兜底比对
    const afterW = (() => {
      const a = getComputedStyle(last, '::after');
      return a.content && a.content !== 'none' ? a.content : '';
    })();
    return {
      cols, kids,
      rowH: +row.getBoundingClientRect().height.toFixed(1),
      barW: box(bar), minW: box(min), pctW: box(pct), lastW: box(last),
      minTextW: textW(min), pctTextW: textW(pct), lastTextW: textW(last),
      lastLines: lines(last),
      lastAfter: afterW,
      lastText: last.textContent,
      pctText: pct.textContent,
    };
  }, LINE_FN);
  const fit = (need, has) => (need == null ? '—' : `${need}px / 列 ${has}px ${need <= has ? '✅' : '❌ 溢出 ' + (need - has).toFixed(1) + 'px'}`);
  log(`\n[${label}] 行高 ${data.rowH}px  列宽 ${data.cols.join(' / ')}`);
  log(`   子元素 ${data.kids.join(' | ')}`);
  log(`   进度条 ${data.barW}`);
  log(`   时长文字 ${fit(data.minTextW, data.minW)}`);
  log(`   占比「${data.pctText}」文字 ${fit(data.pctTextW, data.pctW)}`);
  log(`   日期「${data.lastText}」日期文字 ${fit(data.lastTextW, data.lastW)}  行数 ${data.lastLines}  ::after=${data.lastAfter}`);
  return data;
};

/* ① 1440 */
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(SITE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await ready(page);
  await measure(page, '1440');

  // 占比分布抽样
  const pcts = await page.evaluate(() => [...document.querySelectorAll('#lt-list .rank-item .rank-pct')].map((e) => e.textContent));
  log(`   占比样本：${pcts.slice(0, 5).join(' ')} … ${pcts.slice(-3).join(' ')}（共 ${pcts.length} 个）`);

  await page.screenshot({ path: `${OUT}/102-01-榜单-1440.png`, clip: { x: 0, y: 180, width: 1440, height: 560 } });

  // 右侧特写：时长 → 占比 → 日期
  const clip = await page.evaluate(() => {
    const row = document.querySelector('#lt-list .rank-item');
    const min = row.querySelector('.rank-min').getBoundingClientRect();
    const last = row.querySelector('.rank-last').getBoundingClientRect();
    return {
      x: Math.round(min.left - 30), y: Math.round(row.getBoundingClientRect().top - 10),
      width: Math.round(last.right - min.left + 70), height: 300,
    };
  });
  await page.screenshot({ path: `${OUT}/102-02-右侧特写-1440.png`, clip });

  // 最近游玩：共用网格，确认七项都在
  await page.click('#card-recent');
  await page.waitForSelector('#recent-list .rank-item', { state: 'visible', timeout: 20000 });
  await page.waitForTimeout(900);
  const rcols = await page.evaluate((LINE_SRC) => {
    const lines = eval(LINE_SRC);
    const row = document.querySelector('#recent-list .rank-item');
    const cs = getComputedStyle(row);
    return {
      cols: cs.gridTemplateColumns.split(' ').map((v) => +parseFloat(v).toFixed(1)),
      kids: [...row.children].map((el) => el.className.split(' ')[0]),
      pct: row.querySelector('.rank-pct')?.textContent,
      lastLines: row.querySelector('.rank-last') ? lines(row.querySelector('.rank-last')) : null,
    };
  }, LINE_FN);
  log(`\n[最近游玩] 列宽 ${rcols.cols.join(' / ')}`);
  log(`   子元素 ${rcols.kids.join(' | ')}   占比「${rcols.pct}」  日期行数 ${rcols.lastLines}`);
  await page.screenshot({ path: `${OUT}/102-03-最近游玩-1440.png`, clip: { x: 0, y: 180, width: 1440, height: 520 } });
  await ctx.close();
}

/* ② 1088（第 98 轮定的最窄安全宽度） */
for (const w of [1088, 900]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 1000 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(SITE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await ready(page);
  const d = await measure(page, String(w));
  await page.screenshot({ path: `${OUT}/102-04-榜单-${w}.png`, clip: { x: 0, y: 180, width: w, height: 520 } });
  await ctx.close();
}

/* ③ 390 窄屏：占比与日期都应隐藏，行高不应被撑到第三行 */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 3 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(SITE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('#lt-list .rank-item', { state: 'visible', timeout: 30000 });
  await page.waitForTimeout(1200);
  const n = await page.evaluate(() => {
    const row = document.querySelector('#lt-list .rank-item');
    return {
      h: +row.getBoundingClientRect().height.toFixed(1),
      pctDisp: getComputedStyle(row.querySelector('.rank-pct')).display,
      lastDisp: getComputedStyle(row.querySelector('.rank-last')).display,
      cols: getComputedStyle(row).gridTemplateColumns.split(' ').map((v) => +parseFloat(v).toFixed(1)),
    };
  });
  log(`\n[390 窄屏] 行高 ${n.h}px  列 ${n.cols.join(' / ')}  占比 display=${n.pctDisp}  日期 display=${n.lastDisp}`);
  await page.screenshot({ path: `${OUT}/102-05-榜单-390.png`, clip: { x: 0, y: 120, width: 390, height: 420 } });
  await ctx.close();
}

await browser.close();
log(`\nJS 异常 ${errs.length}`, errs.slice(0, 3));
log('screens ->', OUT);
