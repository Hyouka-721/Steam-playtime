/* online86.mjs — 第 86 轮上线复验：月历热力图取代趋势图
   判据全部对着**线上**：Pages 已生效 → 下钻是「整月 7 列月历」而不是 18 周切片 →
   默认落在最新数据月、可逐月翻、越界禁用 → 旧 18 周热力图已从数据页彻底消失 → 零 JS 异常。

   ⚠️ 期望的月份/天数一律从线上 data/meta.json 与日历推导，不写死（用户随时在录数据）。
   ⚠️ 只认内容指纹（Playwright + 页面内 fetch），不用 curl。 */
import { createRequire } from 'node:module';

const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const SITE = 'https://hyouka-721.github.io/Steam-playtime/';
const CSS_V = '110';
const APP_V = '105';

let pass = 0;
let fail = 0;
const ok = (n, c, extra = '') => {
  c ? (pass++, console.log(`PASS ${n}${extra ? '  — ' + extra : ''}`))
    : (fail++, console.log(`FAIL ${n}  — ${extra}`));
};
const ymLabel = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  return `${y} 年 ${m} 月`;
};
const shiftYm = (ym, delta) => {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};
const dimOf = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};

const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));

/* ---------- A 等 Pages 生效 ---------- */
console.log('== A 等待 Pages 生效 ==');
let html = '';
for (let i = 1; i <= 40; i++) {
  try {
    const r = await page.goto(SITE + 'index.html', { waitUntil: 'domcontentloaded', timeout: 45000 });
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

/* 线上真实数据边界：meta.months 决定可翻阅范围，last_snapshot_date 决定最新一天 */
const meta = await page.evaluate(async () => {
  const r = await fetch('data/meta.json', { cache: 'reload' });
  return r.json();
});
const months = (meta.months || []).slice().sort();
const lastMonth = months[months.length - 1];
const firstMonth = months[0];
ok('A2 线上 meta 提供了可翻阅的月份范围', !!lastMonth && !!firstMonth,
  `${firstMonth} → ${lastMonth}（last_snapshot_date=${meta.last_snapshot_date}）`);

/* ---------- B 进入下钻：点「游戏时长」卡 ---------- */
console.log('== B 进入每日热力图 ==');
await page.waitForSelector('#lt-list .rank-item', { timeout: 25000 });
await page.click('#card-lifetime');            // 已在 lifetime 视图 → 打开「全部游戏」下钻
await page.waitForSelector('#lt-detail:not([hidden])', { timeout: 15000 });
const drillOpen = await page.evaluate(() => ({
  detailShown: !document.getElementById('lt-detail').hidden,
  mainHidden: document.getElementById('lt-main').hidden,
  title: (document.getElementById('drill-title').textContent || '').trim(),
}));
ok('B1 点「游戏时长」卡进入下钻，主列表隐藏', drillOpen.detailShown && drillOpen.mainHidden,
  JSON.stringify(drillOpen));
ok('B2 下钻标题为「全部游戏 · 每日游玩热力图」',
  drillOpen.title === '全部游戏 · 每日游玩热力图', drillOpen.title);

/* ---------- C 月历结构：整月而不是 18 周切片 ---------- */
console.log('== C 月历结构 ==');
const cal = await page.evaluate(() => {
  const cells = [...document.querySelectorAll('#heat-drill .hc')];
  const nums = cells.map((c) => (c.querySelector('b') ? Number(c.querySelector('b').textContent) : null));
  return {
    total: cells.length,
    days: nums.filter((n) => n !== null),
    blanks: cells.filter((c) => c.classList.contains('is-blank')).length,
    na: cells.filter((c) => c.classList.contains('is-na')).length,
    withMin: cells.filter((c) => c.querySelector('i')).length,
    colW: getComputedStyle(document.getElementById('heat-drill')).gridTemplateColumns,
    month: (document.getElementById('heat-month').textContent || '').trim(),
    sum: (document.getElementById('heat-sum').textContent || '').trim(),
    week: [...document.querySelectorAll('.heat-week span')].map((s) => s.textContent),
  };
});
ok('C1 默认落在最新数据月', cal.month === ymLabel(lastMonth), `显示「${cal.month}」期望「${ymLabel(lastMonth)}」`);
ok('C2 网格是 7 列（周一→周日，列头 7 个）',
  cal.colW.split(' ').length === 7 && cal.week.join('') === '一二三四五六日',
  `${cal.week.join('')} / ${cal.colW.split(' ').length} 列`);
ok('C3 单元格数整除 7 且覆盖整月（日期 1..当月天数 一个不少）',
  cal.total % 7 === 0 && cal.days.length === dimOf(lastMonth) &&
  cal.days[0] === 1 && cal.days[cal.days.length - 1] === dimOf(lastMonth),
  `cells=${cal.total} days=${cal.days.length}/${dimOf(lastMonth)} 首尾=${cal.days[0]}..${cal.days[cal.days.length - 1]}`);
ok('C4 首尾用空白格补齐（月历对齐周一）', cal.total - cal.days.length === cal.blanks, `blank=${cal.blanks} na=${cal.na}`);
ok('C5 有真实时长数据：至少一天带分钟数，汇总行含「有记录」与「合计」',
  cal.withMin > 0 && /天有记录/.test(cal.sum) && /合计/.test(cal.sum), `${cal.withMin} 天带数值 · ${cal.sum}`);

/* ---------- D 月份翻页 ---------- */
console.log('== D 月份翻页 ==');
const prevExpect = shiftYm(lastMonth, -1);
const canPrev = months.includes(prevExpect);
if (canPrev) {
  await page.click('#heat-prev');
  await page.waitForTimeout(250);
  const after = await page.evaluate(() => ({
    month: (document.getElementById('heat-month').textContent || '').trim(),
    days: [...document.querySelectorAll('#heat-drill .hc b')].length,
  }));
  ok('D1 点「‹」翻到上一个月，日期数跟着变',
    after.month === ymLabel(prevExpect) && after.days === dimOf(prevExpect),
    `${after.month} / ${after.days} 天（期望 ${ymLabel(prevExpect)} / ${dimOf(prevExpect)}）`);
  await page.click('#heat-next');
  await page.waitForTimeout(250);
} else {
  console.log(`  · 线上只有 ${months.length} 个月（${firstMonth}），跳过翻页`);
  ok('D1 点「‹」翻到上一个月（无更多月份，跳过）', true);
}
/* 边界规则：› 在最新月禁用；‹ 在最早月禁用（线上只有 1 个月时两者都灰） */
const bounds = await page.evaluate(() => ({
  prev: document.getElementById('heat-prev').disabled,
  next: document.getElementById('heat-next').disabled,
  month: (document.getElementById('heat-month').textContent || '').trim(),
}));
const onlyOne = firstMonth === lastMonth;
ok('D2 边界处按钮正确禁用（最新月「›」灰；仅 1 个月时「‹」也灰）',
  bounds.next === true && bounds.prev === onlyOne && bounds.month === ymLabel(lastMonth),
  `${JSON.stringify(bounds)} 月份数=${months.length}`);

/* ---------- E 旧 18 周热力图已彻底消失 ---------- */
console.log('== E 旧热力图清理 ==');
await page.click('#btn-drill-back');
await page.waitForTimeout(400);
await page.click('#card-data');
await page.waitForTimeout(600);
const legacy = await page.evaluate(() => ({
  heatNode: !!document.getElementById('heatmap'),
  heatCells: document.querySelectorAll('#view-data .heat').length,
  chartNode: !!document.getElementById('chart-drill'),
  viewCanvas: document.querySelectorAll('#view-data canvas').length,
  echarts: typeof window.echarts,
  dataText: (document.getElementById('view-data').textContent || '').length,
}));
ok('E1 数据视图里没有旧热力图、也没有图表画布（ECharts 已移除）',
  !legacy.heatNode && legacy.heatCells === 0 && !legacy.chartNode &&
  legacy.viewCanvas === 0 && legacy.echarts === 'undefined', JSON.stringify(legacy));
ok('E2 数据视图本身仍正常渲染（有内容）', legacy.dataText > 200, `${legacy.dataText} 字`);

/* ---------- F 单游戏下钻同样走月历 ---------- */
console.log('== F 单游戏下钻 ==');
await page.click('#card-lifetime');
await page.waitForSelector('#lt-list .rank-item', { timeout: 15000 });
const firstApp = await page.evaluate(() => document.querySelector('#lt-list .rank-item').dataset.appid);
await page.click('#lt-list .rank-item');
await page.waitForTimeout(500);
const single = await page.evaluate(() => ({
  title: (document.getElementById('drill-title').textContent || '').trim(),
  cells: document.querySelectorAll('#heat-drill .hc').length,
  month: (document.getElementById('heat-month').textContent || '').trim(),
  sum: (document.getElementById('heat-sum').textContent || '').trim(),
  kv: document.querySelectorAll('#drill-more .dm-head .dm-kv').length,
  share: !!document.querySelector('#drill-more .dm-share'),
  ach: !!document.querySelector('#drill-more .dm-ach'),
}));
ok('F1 单游戏下钻是同一套月历热力图（标题带游戏名）',
  single.title.endsWith('· 每日游玩热力图') && single.title !== '全部游戏 · 每日游玩热力图' &&
  single.cells % 7 === 0 && single.cells > 0, `${single.title} / ${single.cells} 格 ${single.month}`);
ok('F2 单游戏面板带占比 + 期内游玩 + 成就区（下钻信息不因去掉图表而缩水）',
  single.share && single.kv >= 3 && single.ach, `kv=${single.kv} share=${single.share} ach=${single.ach}`);

/* ---------- G 零异常 ---------- */
const realErrs = errs.filter((e) => !/Failed to load resource|net::ERR|ERR_BLOCKED|ERR_FAILED/i.test(e));
ok('G1 全程零 JS 异常', realErrs.length === 0, realErrs.slice(0, 2).join(' | '));

await browser.close();
console.log(`\n================ ${pass} / ${pass + fail} ================`);
process.exit(fail ? 1 : 0);
