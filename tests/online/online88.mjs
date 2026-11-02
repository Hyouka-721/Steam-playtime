/* online88.mjs — 第 88 轮上线复验：两月并排热力图 + 字号/对比度 + 量词不重复
   全部判据对着**线上**：Pages 指纹 → 两列月份块与格子比例 → 日期/时长字号 →
   月份范围标签与月内统计 → 换算行量词只出现一次 → 窄屏竖排不溢出 → 零 JS 异常。 */
import { createRequire } from 'node:module';

const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const SITE = 'https://hyouka-721.github.io/Steam-playtime/';
const CSS_V = '116';
const APP_V = '111';

let pass = 0;
let fail = 0;
const ok = (n, c, extra = '') => {
  c ? (pass++, console.log(`PASS ${n}${extra ? '  — ' + extra : ''}`))
    : (fail++, console.log(`FAIL ${n}  — ${extra}`));
};

const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));

/* ---------- A 等 Pages 生效 ---------- */
console.log('== A 等待 Pages 生效 ==');
let html = '';
for (let i = 1; i <= 40; i++) {
  try {
    // ⚠️ 必须带 cache-busting 参数：Pages 给 index.html 设了 max-age=600，
    // 第一轮如果拿到旧版就会在浏览器缓存里待 10 分钟，后面几十次全在看同一份旧文件。
    const r = await page.goto(`${SITE}index.html?t=${Date.now()}-${i}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    html = await r.text();
  } catch (e) {
    console.log(`  · 第 ${i} 次打开失败：${e.message.split('\n')[0]}`);
    await page.waitForTimeout(8000);
    continue;
  }
  const fresh = html.includes(`style.css?v=${CSS_V}`) && html.includes(`app.js?v=${APP_V}`);
  console.log(`  第 ${i} 次：${fresh ? '已生效' : '仍是旧版'}`);
  if (fresh) break;
  await page.waitForTimeout(10000);
}
ok(`A1 线上已是 style.css?v=${CSS_V} / app.js?v=${APP_V}`,
  html.includes(`style.css?v=${CSS_V}`) && html.includes(`app.js?v=${APP_V}`),
  (html.match(/(style\.css|app\.js)\?v=\d+/g) || []).join(' '));

/* ---------- B 两列布局与格子比例 ---------- */
console.log('== B 两月并排 ==');
await page.waitForSelector('#lt-list .rank-item', { timeout: 25000 });
await page.click('#card-lifetime');
await page.waitForSelector('#lt-detail:not([hidden])', { timeout: 15000 });
await page.waitForTimeout(600);
const lay = await page.evaluate(() => {
  const pair = document.getElementById('heat-drill');
  const blocks = [...pair.querySelectorAll('.heat-mb')];
  const r = blocks.map((b) => b.getBoundingClientRect());
  const cell = pair.querySelector('.hc');
  const cr = cell.getBoundingClientRect();
  const live = pair.querySelector('.hc.is-live');
  const px = (el) => (el ? parseFloat(getComputedStyle(el).fontSize) : null);
  return {
    cols: getComputedStyle(pair).gridTemplateColumns.split(' ').length,
    blocks: blocks.map((b) => b.dataset.ym + (b.classList.contains('is-empty') ? '*' : '')),
    sameRow: r.length > 1 ? Math.abs(r[0].top - r[1].top) < 2 : null,
    gap: r.length > 1 ? +(r[1].left - r[0].right).toFixed(1) : null,
    cellW: +cr.width.toFixed(1), cellH: +cr.height.toFixed(1),
    dateFont: px(live?.querySelector('b')), timeFont: px(live?.querySelector('i')),
    // 第 95 轮：月份头搬到工具条 #heat-months
    titleFont: px(document.querySelector('.heat-months .hm-title')),
    sumFont: px(document.getElementById('heat-sum')),
    label: document.getElementById('heat-month').textContent,
    sum: document.getElementById('heat-sum').textContent,
    stats: [...pair.querySelectorAll('.hm-stat')].map((x) => x.textContent),
    times: [...pair.querySelectorAll('.hc i')].map((x) => x.textContent),
    overflow: document.documentElement.scrollWidth - window.innerWidth,
  };
});
ok('B1 线上热力图是两列月份块（同一行、有间距）',
  lay.cols === 2 && lay.blocks.length === 2 && lay.sameRow === true && lay.gap >= 10, lay.blocks);
ok('B2 格子宽高比 1.0~1.6（单月铺满时代是 2.3）',
  lay.cellW / lay.cellH >= 1.0 && lay.cellW / lay.cellH <= 1.6, `${lay.cellW}×${lay.cellH}`);
ok('B3 日期数字 ≥15px、时长数字 ≥15px（第 88 轮是 15 / 14）',
  lay.dateFont >= 15 && lay.timeFont >= 15, `${lay.dateFont} / ${lay.timeFont}`);
ok('B6 时长文字是「数字 + 空格 + 单位」',
  lay.times.length > 0 && lay.times.every((t) => /^[\d.,]+ (min|h)$/.test(t)), lay.times.slice(0, 4));
ok('B4 月份标题 ≥14px、汇总行 ≥13px', lay.titleFont >= 14 && lay.sumFont >= 13, `${lay.titleFont} / ${lay.sumFont}`);
ok('B5 月份范围标签 + 月内统计 + 汇总行（有记录/合计）齐全',
  /^\d{4} 年 \d{1,2}(–\d{1,2})? 月$/.test(lay.label) && /天有记录/.test(lay.sum) && /合计/.test(lay.sum)
  && lay.stats.length >= 1, `${lay.label} · ${lay.stats.join(' | ')}`);

/* ---------- C 对比度（浅色主题） ---------- */
console.log('== C 对比度 ==');
const ct = await page.evaluate(() => {
  const cv = document.createElement('canvas').getContext('2d');
  const rgb = (c) => { cv.fillStyle = '#000'; cv.fillStyle = c; const h = cv.fillStyle.slice(1); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255); };
  const lum = (c) => rgb(c).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)))
    .reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return +((x + 0.05) / (y + 0.05)).toFixed(2); };
  const cs = getComputedStyle(document.documentElement);
  const bg = getComputedStyle(document.querySelector('.panel')).backgroundColor;
  return { dim: ratio(cs.getPropertyValue('--text-dim').trim(), bg), faint: ratio(cs.getPropertyValue('--text-faint').trim(), bg) };
});
ok('C1 --text-dim 对比度 ≥ 4.5:1（AA 正文）', ct.dim >= 4.5, ct);
ok('C2 --text-faint 对比度 ≥ 3.2:1', ct.faint >= 3.2, ct);

/* ---------- D 量词不重复 ---------- */
console.log('== D 换算行量词 ==');
await page.click('#btn-drill-back');
await page.click('#card-data');
await page.waitForTimeout(600);
const cvText = await page.evaluate(() => ({
  items: [...document.querySelectorAll('#convert .cv-item')].map((el) => el.textContent.replace(/\s+/g, ' ').trim()),
}));
ok('D1 换算行 4 条都在', cvText.items.length === 4, cvText.items);
ok('D2 量词只出现一次（无「场 场 / 集 集 / 遍 遍 / 年 年」）',
  !/场\s*场|集\s*集|遍\s*遍|年\s*年/.test(cvText.items.join('|')), cvText.items);

/* ---------- E 窄屏竖排 ---------- */
console.log('== E 窄屏 ==');
for (const w of [900, 390, 360]) {
  await page.setViewportSize({ width: w, height: 900 });
  await page.waitForTimeout(300);
  await page.click('#card-lifetime');
  await page.waitForTimeout(400);
  if (await page.evaluate(() => document.getElementById('lt-detail').hidden)) {
    await page.click('#card-lifetime');   // 第一下可能只是把视图切回「游戏时长」
    await page.waitForTimeout(400);
  }
  if (await page.evaluate(() => document.getElementById('lt-detail').hidden)) {
    await page.click('#card-lifetime');   // 第二下才真正进下钻
    await page.waitForTimeout(450);
  }
  const m = await page.evaluate(() => {
    const pair = document.getElementById('heat-drill');
    const blocks = [...pair.querySelectorAll('.heat-mb')].filter((b) => getComputedStyle(b).display !== 'none');
    return {
      cols: getComputedStyle(pair).gridTemplateColumns.split(' ').length,
      shown: blocks.length,
      cellW: +(pair.querySelector('.hc')?.getBoundingClientRect().width ?? 0).toFixed(1),
      overflow: document.documentElement.scrollWidth - window.innerWidth,
    };
  });
  ok(`E${w} 无横向溢出 + ${w <= 899 ? '竖排' : '两列'}（可见 ${m.shown} 块、格宽 ${m.cellW}px）`,
    m.overflow <= 0 && (w <= 899 ? m.cols === 1 : m.cols === 2), m);
}

const realErrs = errs.filter((e) => !/Failed to load resource|net::ERR|ERR_BLOCKED|ERR_FAILED/i.test(e));
ok('F1 全程零 JS 异常', realErrs.length === 0, realErrs.slice(0, 2).join(' | '));

await browser.close();
console.log(`\n================ ${pass} / ${pass + fail} ================`);
process.exit(fail ? 1 : 0);
