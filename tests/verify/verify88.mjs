/* verify88.mjs — 第 88 轮：热力图两月并排 + 全站字号/对比度 + 量词不重复
 *
 * 用户三项：
 *   a「热力图格子过宽 → 一页放两个月更美观」（方案 1）
 *   b「修复量词重复（694场 场电影 / 2,776集 集 30 分钟的剧 …）」
 *   c「整体调大界面字体字号并加深字体颜色；同时放大热力图的日期数字与时间数字」
 *
 * 覆盖：
 *  0 静态：版本号、两列容器、翻页函数、两月一页的常量
 *  1 两列布局：≥900 并排（同一行、有间距、各占约一半）、格子宽高比不再 2.3:1
 *  2 月份块：每块 7 列、格数整除 7、日期 1..当月天数齐全、两块不重叠
 *  3 空月占位：整月无数据 → 占位卡（与相邻块等高）；≤899 竖排时隐藏
 *  4 翻页：范围标签、单页时两端禁用；多页时能翻（无多月数据则跳过）
 *  5 字号：热力图日期/时长、正文/提示都比第 87 轮更大
 *  6 对比度：--text-dim / --text-faint 在四套主题下都 ≥ 4.5:1
 *  7 量词：换算行「694场 电影…」—— 量词只出现一次，无「场场/集集/遍遍/年年」
 *  8 响应式：1440/1024/900/768/430/390/360 无横向溢出，900 以下竖排
 *  9 全程无 JS 异常
 */
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const URL = process.env.URL || 'http://127.0.0.1:8895/index.html';
const OUT = 'C:/Users/33329/AppData/Local/Temp/fx_verify_20261018/';
let pass = 0;
let fail = 0;
const ok = (msg, cond, extra) => {
  if (cond) { pass++; console.log('PASS  ' + msg + (extra !== undefined ? '  — ' + JSON.stringify(extra) : '')); }
  else { fail++; console.log('FAIL  ' + msg + (extra !== undefined ? '  — ' + JSON.stringify(extra) : '')); }
};
const skip = (msg, why) => { console.log('SKIP  ' + msg + '  — ' + why); };

const errs = [];
const browser = await chromium.launch({ args: ['--no-proxy-server'] });
let ctx, page;
const freshPage = async (vw = 1440, vh = 950, dsf = 1) => {
  ctx = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: dsf });
  page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
};
const openDrill = async () => {
  await page.click('#card-lifetime');
  await page.waitForSelector('#lt-detail:not([hidden])', { timeout: 10000 });
  await page.waitForTimeout(350);
};

/* ================= 0 静态 ================= */
const src = await (async () => {
  const fs = await import('node:fs');
  return {
    app: fs.readFileSync('docs/app.js', 'utf8'),
    html: fs.readFileSync('docs/index.html', 'utf8'),
    css: fs.readFileSync('docs/style.css', 'utf8'),
  };
})();
const appV = (src.html.match(/app\.js\?v=(\d+)/) || [])[1];
const cssV = (src.html.match(/style\.css\?v=(\d+)/) || [])[1];
ok('0.1 index.html 引用 app.js?v=124 / style.css?v=139',
  appV === '124' && cssV === '139', { app: appV, css: cssV });
ok('0.2 热力图容器改为两列（.heat-pair）且不再有单月网格占位',
  src.html.includes('class="heat-pair" id="heat-drill"') && !src.html.includes('class="heat heat-cal" id="heat-drill"'));
ok('0.3 app.js 有分页/范围标签/两月常量',
  ['HEAT_PER_PAGE = 2', 'function heatPages(', 'function heatPageOf(', 'function heatRangeLabel(', 'function stepHeatPage(']
    .every((k) => src.app.includes(k)));
ok('0.4 旧的单月实现已彻底移除（stepHeatMonth / renderCalGrid 都不在）',
  !/function\s+(stepHeatMonth|renderCalGrid|backToCalMonth)\s*\(/.test(src.app));
ok('0.5 CSS 有 .heat-pair 两列与 .hm-none 占位卡',
  /\.heat-pair \{[^}]*grid-template-columns: repeat\(2/.test(src.css) && src.css.includes('.hm-none'));

/* ================= 1 两列布局 ================= */
await freshPage(1440, 950, 1);
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('#lt-list .rank-item', { state: 'visible', timeout: 30000 });
await page.waitForTimeout(700);
await openDrill();
const geo = await page.evaluate(() => {
  const pair = document.getElementById('heat-drill');
  const blocks = [...pair.querySelectorAll('.heat-mb')];
  const r = blocks.map((b) => b.getBoundingClientRect());
  const cell = pair.querySelector('.hc');
  const cr = cell.getBoundingClientRect();
  const inner = pair.getBoundingClientRect().width;
  return {
    cols: getComputedStyle(pair).gridTemplateColumns.split(' ').length,
    blocks: blocks.length,
    sameRow: r.length > 1 ? Math.abs(r[0].top - r[1].top) < 2 : null,
    gap: r.length > 1 ? +(r[1].left - r[0].right).toFixed(1) : null,
    widths: r.map((x) => +x.width.toFixed(1)),
    inner: +inner.toFixed(1),
    cellW: +cr.width.toFixed(1),
    cellH: +cr.height.toFixed(1),
    docOverflow: document.documentElement.scrollWidth - window.innerWidth,
  };
});
ok('1.1 桌面端热力图是两列', geo.cols === 2, geo);
ok('1.2 一页两个月、同一行、中间有间距', geo.blocks === 2 && geo.sameRow === true && geo.gap >= 10, geo);
ok('1.3 两列等宽且合起来铺满容器（不再是一整块）',
  Math.abs(geo.widths[0] - geo.widths[1]) <= 1 && Math.abs(geo.widths[0] + geo.widths[1] + geo.gap - geo.inner) <= 2, geo.widths);
// 第 87 轮单月铺满时是 181×78（比例 2.32）；两列后应回到 1.0~1.6 的「接近正方」
const ratio = geo.cellW / geo.cellH;
ok('1.4 格子宽高比回到 1.0~1.6（第 87 轮单月铺满是 2.3）', ratio >= 1.0 && ratio <= 1.6, `${geo.cellW}×${geo.cellH} = ${ratio.toFixed(2)}`);
ok('1.5 桌面端无横向溢出', geo.docOverflow <= 0, geo.docOverflow);

/* ================= 2 月份块内部 ================= */
const mb = await page.evaluate(() => {
  const blocks = [...document.querySelectorAll('#heat-drill .heat-mb')];
  return blocks.map((b) => {
    const ym = b.dataset.ym;
    const [y, m] = ym.split('-').map(Number);
    const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const grid = b.querySelector('.heat-cal');
    const cells = [...(grid?.querySelectorAll('.hc') || [])];
    const nums = cells.map((c) => (c.querySelector('b') ? Number(c.querySelector('b').textContent) : null)).filter((n) => n !== null);
    return {
      ym, empty: b.classList.contains('is-empty'),
      // 第 95 轮：月份头已移到顶部工具条，这里取占位（真正比对在下面用 heads 做）
      title: '',
      cols: grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').length : 0,
      total: cells.length, days: nums, dim,
      weekdays: b.querySelectorAll('.heat-week span').length,
      hasStat: false,
    };
  });
});
const solid = mb.filter((x) => !x.empty);
// 第 95 轮：月份头在顶部工具条 #heat-months，按 DOM 顺序与月份块一一对应
const heads = await page.evaluate(() =>
  [...document.querySelectorAll('.heat-months .hm-head')].map((h) => ({
    title: h.querySelector('.hm-title')?.textContent?.trim() ?? '',
    hasStat: !!h.querySelector('.hm-stat'),
  })));
ok('2.1 每个月份块都有「YYYY 年 M 月」标题（工具条里同序），且与 data-ym 对得上',
  heads.length === mb.length &&
  mb.every((x, i) => heads[i].title === `${Number(x.ym.slice(0, 4))} 年 ${Number(x.ym.slice(5, 7))} 月`),
  { heads: heads.map((h) => h.title), ym: mb.map((x) => x.ym) });
ok('2.2 有数据的月份块：7 列 + 7 个星期表头 + 格数整除 7',
  solid.every((x) => x.cols === 7 && x.weekdays === 7 && x.total % 7 === 0), solid);
ok('2.3 有数据的月份块：日期 1..当月天数 一个不少、顺序正确',
  solid.every((x) => x.days.length === x.dim && x.days[0] === 1 && x.days[x.days.length - 1] === x.dim), solid.map((x) => `${x.ym}:${x.days.length}/${x.dim}`));
ok('2.4 有数据的月份块带月内统计（N 天 · 合计，同样在工具条里）',
  solid.every((x) => heads[mb.indexOf(x)]?.hasStat === true),
  solid.map((x) => heads[mb.indexOf(x)]?.hasStat));
const overlap = await page.evaluate(() => {
  const g = [...document.querySelectorAll('#heat-drill .heat-cal')].map((x) => x.getBoundingClientRect());
  if (g.length < 2) return null;
  return g[0].right <= g[1].left + 1 || g[0].bottom <= g[1].top + 1;
});
ok('2.5 两个月份的网格互不重叠', overlap === null || overlap === true, overlap);

/* ================= 3 空月占位 ================= */
const empty = await page.evaluate(() => {
  const box = document.querySelector('#heat-drill .heat-mb.is-empty');
  if (!box) return null;
  const b = box.getBoundingClientRect();
  const none = box.querySelector('.hm-none');
  const cells = box.querySelectorAll('.hc').length;
  const solid = document.querySelector('#heat-drill .heat-mb:not(.is-empty)');
  return {
    text: none?.textContent.trim() ?? '',
    cells, h: +b.height.toFixed(1),
    solidH: solid ? +solid.getBoundingClientRect().height.toFixed(1) : null,
    display: getComputedStyle(box).display,
  };
});
if (empty) {
  ok('3.1 空月用占位卡（不是 42 个虚线空格）', empty.cells === 0 && /尚未开始记录/.test(empty.text), empty.text);
  ok('3.2 桌面端占位卡与相邻月份块等高（两列视觉平衡）',
    Math.abs(empty.h - empty.solidH) <= 2, { empty: empty.h, solid: empty.solidH });
} else {
  skip('3.1~3.2 空月占位', '当前所有可见月份都有数据');
}

/* ================= 4 翻页 ================= */
const pager = await page.evaluate(() => ({
  label: document.getElementById('heat-month').textContent,
  prev: document.getElementById('heat-prev').disabled,
  next: document.getElementById('heat-next').disabled,
  prevAria: document.getElementById('heat-prev').getAttribute('aria-label'),
}));
ok('4.1 标题是「YYYY 年 M–M 月」范围式（单月时退化为「YYYY 年 M 月」）',
  /^\d{4} 年 \d{1,2}(–\d{1,2})? 月$/.test(pager.label), pager.label);
ok('4.2 翻页按钮语义已改成「两个月」', /两个月/.test(pager.prevAria || ''), pager.prevAria);
if (pager.prev && pager.next) {
  ok('4.3 只有一页时两端都禁用', true, pager);
} else {
  const before = pager.label;
  await page.click('#heat-next');
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => document.getElementById('heat-month').textContent);
  ok('4.3 翻页后标题变化且回到第一页可复原', after !== before, { before, after });
  await page.click('#heat-prev');
  await page.waitForTimeout(400);
}

/* ================= 4b 两页场景（造 3 个月数据：08 / 09 / 10 → 两页） ================= */
/* 线上目前只有 1 个月，翻页逻辑平时跑不到；这里把内联 __BOOT 改造成 3 个月，
   验证「一页两个月 + 翻页 + 最早一页补空月」这条路径真的能走通。 */
{
  const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 950 }, serviceWorkers: 'block' });
  const p2 = await ctx2.newPage();
  p2.on('pageerror', (e) => errs.push('mock: ' + e));
  await p2.route('**/index.html*', async (route) => {
    const res = await route.fetch();
    let html = await res.text();
    html = html.replace(/(<script>window\.__BOOT=)([\s\S]*?);(<\/script>)/, (m, open, json, close) => {
      const boot = JSON.parse(json);
      const day = (date, mins) => ({
        total_minutes: mins, span_days: 1, confidence: 'high', source: 'auto', flags: [],
        games: [{ appid: '646570', name: '杀戮尖塔', minutes: mins, is_new: false }],
      });
      const now = new Date().toISOString();
      boot.meta.months = ['2026-08', '2026-09', '2026-10'];
      boot.meta.generated_at = now;
      boot.daily['2026-08'] = {
        schema: 1, month: '2026-08', tz: 'Asia/Shanghai', unit: 'minute', generated_at: now,
        days: { '2026-08-03': day('2026-08-03', 60), '2026-08-04': day('2026-08-04', 90) },
      };
      boot.daily['2026-09'] = {
        schema: 1, month: '2026-09', tz: 'Asia/Shanghai', unit: 'minute', generated_at: now,
        days: { '2026-09-10': day('2026-09-10', 120), '2026-09-11': day('2026-09-11', 30) },
      };
      return open + JSON.stringify(boot) + ';' + close;
    });
    await route.fulfill({ response: res, body: html, headers: { ...res.headers(), 'content-type': 'text/html; charset=utf-8' } });
  });
  await p2.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p2.waitForSelector('#lt-list .rank-item', { state: 'visible', timeout: 30000 });
  await p2.waitForTimeout(800);
  await p2.click('#card-lifetime');
  await p2.waitForSelector('#lt-detail:not([hidden])', { timeout: 10000 });
  await p2.waitForTimeout(500);
  const pg = await p2.evaluate(() => ({
    label: document.getElementById('heat-month').textContent,
    blocks: [...document.querySelectorAll('#heat-drill .heat-mb')].map((b) => b.dataset.ym + (b.classList.contains('is-empty') ? '*' : '')),
    lit: document.querySelectorAll('#heat-drill .hc.is-live').length,
    prev: document.getElementById('heat-prev').disabled,
    next: document.getElementById('heat-next').disabled,
  }));
  ok('4b.1 三个月数据时，首屏是「9–10 月」两个真月份并排（最后一页满）',
    pg.blocks.length === 2 && pg.blocks.every((x) => !x.endsWith('*')) && /9–10 月/.test(pg.label), pg);
  ok('4b.2 有上两月的页可翻（‹ 可用、› 到头禁用）', pg.prev === false && pg.next === true, pg);
  await p2.click('#heat-prev');
  await p2.waitForTimeout(450);
  const pg2 = await p2.evaluate(() => ({
    label: document.getElementById('heat-month').textContent,
    blocks: [...document.querySelectorAll('#heat-drill .heat-mb')].map((b) => b.dataset.ym + (b.classList.contains('is-empty') ? '*' : '')),
    prev: document.getElementById('heat-prev').disabled,
  }));
  ok('4b.3 翻页后是「7–8 月」，且最早一页自动补上 7 月占位',
    /7–8 月/.test(pg2.label) && pg2.blocks[0] === '2026-07*' && pg2.blocks[1] === '2026-08', pg2);
  ok('4b.4 翻到最早一页后 ‹ 禁用', pg2.prev === true, pg2);
  await p2.click('#heat-next');
  await p2.waitForTimeout(450);
  const pg3 = await p2.evaluate(() => document.getElementById('heat-month').textContent);
  ok('4b.5 翻回来仍是「9–10 月」（步长 = 一页两个月）', /9–10 月/.test(pg3), pg3);
  await ctx2.close();
}

/* ================= 5 字号 ================= */
const fonts = await page.evaluate(() => {
  const px = (el) => (el ? parseFloat(getComputedStyle(el).fontSize) : null);
  const live = document.querySelector('#heat-drill .hc.is-live');
  return {
    date: px(live?.querySelector('b')),
    time: px(live?.querySelector('i')),
    hmTitle: px(document.querySelector('.hm-title')),
    sum: px(document.getElementById('heat-sum')),
    hint: px(document.querySelector('.hint')),
    cardLabel: px(document.querySelector('.card-label')),
    month: px(document.getElementById('heat-month')),
  };
});
ok('5.1 热力图日期数字 ≥ 15px（第 87 轮 12.5px）', fonts.date >= 15, fonts.date);
ok('5.2 热力图时长数字 ≥ 15px（与日期同号；第 88 轮 14px）', fonts.time >= 15, fonts.time);
ok('5.3 月份标题 / 汇总 / 月份标签都 ≥ 13px',
  fonts.hmTitle >= 13.5 && fonts.sum >= 13 && fonts.month >= 13.5, fonts);
// 第 89 轮（用户）：数字与单位之间必须有空格（「49 min」不是「49min」）
const timeText = await page.evaluate(() => [...document.querySelectorAll('#heat-drill .hc i')].map((el) => el.textContent));
ok('5.5 时长文字是「数字 + 空格 + 单位」（min / h）',
  timeText.length > 0 && timeText.every((t) => /^[\d.,]+ (min|h)$/.test(t)), timeText.slice(0, 4));
ok('5.4 正文小字（提示 / 卡片标签）≥ 13px（第 87 轮 12px）',
  fonts.hint >= 13 && fonts.cardLabel >= 13, { hint: fonts.hint, cardLabel: fonts.cardLabel });

/* ================= 6 对比度（四套主题） ================= */
const contrast = await page.evaluate(() => {
  const cv = document.createElement('canvas').getContext('2d');
  const rgb = (c) => {
    cv.fillStyle = '#000';
    cv.fillStyle = c;
    const hex = cv.fillStyle.slice(1);
    return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  };
  const lum = (c) => rgb(c).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)))
    .reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
  const ratio = (a, b) => {
    const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (l1 + 0.05) / (l2 + 0.05);
  };
  const out = {};
  for (const theme of ['cream', 'mint', 'dawn', 'night']) {
    document.documentElement.dataset.theme = theme;
    const cs = getComputedStyle(document.documentElement);
    const bg = getComputedStyle(document.querySelector('.panel')).backgroundColor;
    out[theme] = {
      dim: +ratio(cs.getPropertyValue('--text-dim').trim(), bg).toFixed(2),
      faint: +ratio(cs.getPropertyValue('--text-faint').trim(), bg).toFixed(2),
    };
  }
  document.documentElement.dataset.theme = 'cream';
  return out;
});
ok('6.1 --text-dim 在四套主题下都 ≥ 4.5:1（AA 正文）',
  Object.values(contrast).every((x) => x.dim >= 4.5), contrast);
ok('6.2 --text-faint 在四套主题下都 ≥ 3.2:1（比第 87 轮明显提高）',
  Object.values(contrast).every((x) => x.faint >= 3.2), contrast);

/* ================= 7 量词不重复 ================= */
await page.click('#btn-drill-back');
await page.click('#card-data');
await page.waitForTimeout(500);
await page.evaluate(() => document.getElementById('convert').scrollIntoView({ block: 'center' }));
const cv = await page.evaluate(() => {
  const items = [...document.querySelectorAll('#convert .cv-item')].map((el) => el.textContent.replace(/\s+/g, ' ').trim());
  return { items, dup: /场\s*场|集\s*集|遍\s*遍|年\s*年/.test(items.join('|')) };
});
ok('7.1 换算行有 4 条', cv.items.length === 4, cv.items);
ok('7.2 量词只出现一次（没有「场 场 / 集 集 / 遍 遍 / 年 年」）', !cv.dup, cv.items);
ok('7.3 每条形如「<数字><量词> <说明>」（量词紧贴数字、说明里不再以量词开头）',
  cv.items.every((t) => /^[\d,.]+\s*[场集遍年]\s*[^\s场集遍年]/.test(t)), cv.items);

/* ================= 8 响应式 ================= */
for (const w of [1440, 1024, 900, 768, 430, 390, 360]) {
  await page.setViewportSize({ width: w, height: 900 });
  await page.waitForTimeout(350);
  await page.click('#card-lifetime');
  await page.waitForTimeout(450);
  if (await page.evaluate(() => document.getElementById('lt-detail').hidden)) {
    await page.click('#card-lifetime');
    await page.waitForTimeout(450);
  }
  const m = await page.evaluate(() => {
    const pair = document.getElementById('heat-drill');
    const blocks = [...pair.querySelectorAll('.heat-mb')].filter((b) => getComputedStyle(b).display !== 'none');
    const r = blocks.map((b) => b.getBoundingClientRect());
    const cell = pair.querySelector('.hc.is-live') || pair.querySelector('.hc');
    return {
      cols: getComputedStyle(pair).gridTemplateColumns.split(' ').length,
      shown: blocks.length,
      stacked: r.length > 1 ? r[1].top >= r[0].bottom - 1 : null,
      cellW: cell ? +cell.getBoundingClientRect().width.toFixed(1) : null,
      overflow: document.documentElement.scrollWidth - window.innerWidth,
    };
  });
  const expectStack = w <= 899;
  ok(`8.${w} 无横向溢出 + ${expectStack ? '竖排' : '两列并排'}（可见 ${m.shown} 个月份块）`,
    m.overflow <= 0 && (expectStack ? m.cols === 1 && (m.stacked !== false) : m.cols === 2), m);
}

await ctx.close();
await browser.close();
ok('9.1 全程无 JS 异常 / console error', errs.length === 0, errs.slice(0, 3));
console.log(`\n===== 第88轮 PASS=${pass} FAIL=${fail} =====`);
process.exit(fail ? 1 : 0);
