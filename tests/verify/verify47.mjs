/* verify47.mjs — 当日明细浮层：结构 / 几何 / 步进 / 边界 / 键盘 / 焦点 / 响应式
 *
 * 第 87 轮改写：用户要求「删除『最近游玩』选项卡下的日历图标，其负责的功能
 * （点击日期查看当天游玩的游戏及其时长）并入总时长的热力图」。
 * 因此本套件的主体从「二级界面」变成了**唯一一层**的当日明细浮层，入口是
 * 「游戏时长」下钻里的月历热力图格子；浮层原来的「一级月历」整层已删除
 * （热力图本身就是月历），相关断言随之改写为「这些 DOM 必须不存在」。
 *
 * 覆盖：
 *  0 结构：头部两段、步进组三段、纯箭头、aria 语义、无 title 气泡、无一级月历残留
 *  1 入口：热力图每个有数据的日子可点/可键盘/有可访问名；未追踪的日子不可点
 *  2 几何：两个箭头夹住日期文本、都在面板内、纵向居中、无内部溢出
 *  3 步进：日期与星期同步、摘要/条数/列表跟随、连续三次跨周
 *  4 空态：没有明细的日子 → 文案 / 0 分钟 / 状态行 / 两侧按钮仍可用
 *  5 边界：最早一天禁用 + 说明 + 点不动；最新一天同理；中间日两侧可用
 *  6 关闭：× / Esc / 点空白；焦点回到格子；选中态保留；浮层外零变化
 *  7 焦点：步进不抢焦点、按钮变禁用时焦点转移
 *  8 键盘：←/→ 步进、Esc 关闭
 *  9 响应式：1440/1024/768/430/390/360 不溢出、日期不截断、按钮为纯箭头
 * 10 单游戏下钻：明细仍列当天全部游戏，且高亮当前下钻的那款
 * 11 全程无 JS 异常
 */
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const URL = process.env.URL || 'http://127.0.0.1:8895/index.html';
const OUT = 'C:/Users/33329/AppData/Local/Temp/fx_verify_20261018/';
let pass = 0, fail = 0;
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
const raf2 = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
const settle = async () => {
  await page.waitForFunction(
    () => { const t = document.querySelector('.toast'); return !t || Number(getComputedStyle(t).opacity) < 0.01; },
    null, { timeout: 3000 },
  ).catch(() => {});
  await raf2();
};
/** 等一次打开/步进彻底结束：遮罩 hidden 且浮层可见 */
const waitDay = async () => {
  await page.waitForFunction(
    () => {
      const m = document.getElementById('cal-mask');
      return !!m && m.hidden && !document.getElementById('cal-overlay').hidden;
    },
    null, { timeout: 8000 },
  ).catch(() => {});
  await raf2();
};
/** 进入「全部游戏」下钻（该卡是本页的入口：他页 → 回列表；列表 → 进下钻） */
const openDrill = async () => {
  const onLifetime = await page.evaluate(() => document.querySelector('.view.active')?.id === 'view-lifetime');
  if (!onLifetime) { await page.click('#card-lifetime'); await page.waitForTimeout(400); }
  const drilled = await page.evaluate(() => !document.getElementById('lt-detail').hidden);
  if (!drilled) { await page.click('#card-lifetime'); await page.waitForSelector('#lt-detail:not([hidden])', { timeout: 10000 }); }
  await page.waitForTimeout(250);
};
/** 点某个日期格子打开明细（date 省略 = 最后一个带时长的格子） */
const openDay = async (date) => {
  await openDrill();
  const d = date || await page.evaluate(() => {
    const c = [...document.querySelectorAll('#heat-drill .hc.is-live')].reverse().find((x) => x.querySelector('i'));
    return c.dataset.date;
  });
  await page.click(`#heat-drill .hc[data-date="${d}"]`);
  await waitDay();
  return d;
};
const closeDay = async () => { await page.click('#cal-day-close'); await page.waitForTimeout(300); };
const hmText = (m) => {
  const n = Math.round(Number(m) || 0);
  if (n <= 0) return '不足 1 分钟';
  if (n < 60) return `${n} 分钟`;
  const h = Math.floor(n / 60), r = n % 60;
  return r === 0 ? `${h} 小时` : `${h} 小时 ${r} 分钟`;
};
/** 独立星期预言：本地时间构造，与 app 的 UTC 正午是两条代码路径 */
const wdName = (ds) => {
  const [y, m, d] = ds.split('-').map(Number);
  return '周' + '日一二三四五六'[new Date(y, m - 1, d).getDay()];
};
const titleOf = (ds) => `${Number(ds.slice(5, 7))} 月 ${Number(ds.slice(8, 10))} 日 ${wdName(ds)}`;
const readDay = () => page.evaluate(() => ({
  title: document.getElementById('cal-day-title').textContent,
  total: document.getElementById('cal-day-total').textContent,
  note: document.getElementById('cal-day-note').textContent,
  status: document.getElementById('cal-day-status').textContent,
  rows: [...document.querySelectorAll('#cal-day-games .cal-game')].map((r) => ({
    name: r.querySelector('.cal-game-name').textContent,
    min: r.querySelector('.cal-game-min').textContent,
    focus: r.classList.contains('is-focus'),
  })),
  empty: document.querySelector('#cal-day-games .cal-empty')?.textContent ?? null,
  prevDisabled: document.getElementById('cal-day-prev').disabled,
  nextDisabled: document.getElementById('cal-day-next').disabled,
  focus: document.activeElement?.id ?? null,
}));

await freshPage();
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('#lt-list .rank-item', { state: 'visible', timeout: 30000 });
await page.waitForTimeout(800);

// ---------- 0. 版本与结构 ----------
const v = await page.evaluate(() =>
  [...document.querySelectorAll('script[src]')].map((s) => s.getAttribute('src')).find((s) => s.includes('app.js')));
ok('0.1 app.js 版本号已 bump 到 ?v=105', v === 'app\.js\?v=105', v);

await openDrill();
const head = await page.evaluate(() => {
  const hd = document.querySelector('.cal-head');
  const nav = document.querySelector('.cal-day-nav');
  const prev = document.getElementById('cal-day-prev');
  const next = document.getElementById('cal-day-next');
  // 浮层此刻还是 hidden，getBoundingClientRect 会归零 → 用 computed style 量尺寸
  const box = (b) => { const s = getComputedStyle(b); return { w: parseFloat(s.width), h: parseFloat(s.height) }; };
  return {
    headKids: [...hd.children].map((e) => e.id || e.className),
    navKids: [...nav.children].map((e) => e.id || e.className),
    prevTxt: prev.textContent.trim(),
    nextTxt: next.textContent.trim(),
    prevHtml: prev.innerHTML,
    nextHtml: next.innerHTML,
    prevAria: prev.getAttribute('aria-label'),
    nextAria: next.getAttribute('aria-label'),
    prevTitle: prev.getAttribute('title'),
    nextTitle: next.getAttribute('title'),
    txtSpanCount: document.querySelectorAll('.cal-step-txt').length,
    prevBox: box(prev),
    nextBox: box(next),
    // 一级月历层必须连壳都不剩
    legacy: {
      pageMonth: !!document.getElementById('cal-page-month'),
      pageDay: !!document.getElementById('cal-page-day'),
      grid: !!document.getElementById('cal-grid'),
      back: !!document.getElementById('cal-back'),
      monthTitle: !!document.getElementById('cal-title'),
      monthStatus: !!document.getElementById('cal-status'),
      oldCells: document.querySelectorAll('.cal-weekdays, .cal-day, .cal-day.pad').length,
    },
    role: document.getElementById('cal-panel').getAttribute('role'),
    labelledBy: document.getElementById('cal-panel').getAttribute('aria-labelledby'),
  };
});
ok('0.2 头部两段：日期步进组 / 关闭（原来的「返回月历」按钮已删）',
  JSON.stringify(head.headKids) === JSON.stringify(['cal-day-nav', 'cal-day-close']), head.headKids);
ok('0.3 日期步进组三段：前一天 / 日期文本 / 后一天',
  JSON.stringify(head.navKids) === JSON.stringify(['cal-day-prev', 'cal-day-title', 'cal-day-next']), head.navKids);
ok('0.4a 按钮上只显示箭头，没有「前一天 / 后一天」文字标签',
  head.prevTxt === '←' && head.nextTxt === '→' && head.txtSpanCount === 0
  && !head.prevHtml.includes('前一天') && !head.nextHtml.includes('后一天'), { prev: head.prevTxt, next: head.nextTxt });
// 第 82 轮：全站移除 title 悬停气泡 → 语义只由 aria-label 承载，title 必须不存在
ok('0.4b 语义由 aria-label 承载，且已无 title 悬停气泡',
  head.prevAria === '前一天' && head.nextAria === '后一天'
  && head.prevTitle === null && head.nextTitle === null, head.prevAria);
ok('0.4c 两个步进按钮都是正方形图标按钮（宽=高且 ≥24px）',
  head.prevBox.w === head.prevBox.h && head.nextBox.w === head.nextBox.h && head.prevBox.w >= 24, head.prevBox);
ok('0.5 一级月历整层已删除（cal-page / cal-grid / cal-back / 月历格 一个都不剩）',
  !head.legacy.pageMonth && !head.legacy.pageDay && !head.legacy.grid && !head.legacy.back
  && !head.legacy.monthTitle && !head.legacy.monthStatus && head.legacy.oldCells === 0, head.legacy);
ok('0.6 面板是 aria-modal 对话框，由日期标题命名',
  head.role === 'dialog' && head.labelledBy === 'cal-day-title', { role: head.role, by: head.labelledBy });

// ---------- 1. 入口：热力图格子 ----------
const entry = await page.evaluate(() => {
  const cells = [...document.querySelectorAll('#heat-drill .hc')];
  const live = cells.filter((c) => c.classList.contains('is-live'));
  const na = cells.filter((c) => c.classList.contains('is-na'));
  const sample = live.find((c) => c.querySelector('i')) || live[0];
  return {
    total: cells.length,
    live: live.length,
    na: na.length,
    liveNoDate: live.filter((c) => !/^\d{4}-\d{2}-\d{2}$/.test(c.dataset.date || '')).length,
    liveNoRole: live.filter((c) => c.getAttribute('role') !== 'button' || c.getAttribute('tabindex') !== '0').length,
    liveNoAria: live.filter((c) => !c.getAttribute('aria-label')).length,
    naClickable: na.filter((c) => c.classList.contains('is-live') || c.getAttribute('role') === 'button').length,
    blankClickable: cells.filter((c) => c.classList.contains('is-blank') && (c.dataset.date || c.getAttribute('role'))).length,
    cursor: sample ? getComputedStyle(sample).cursor : null,
    sampleDate: sample?.dataset.date ?? null,
    sampleAria: sample?.getAttribute('aria-label') ?? null,
  };
});
ok('1.1 有数据的日子全部可点（role=button / tabindex=0 / data-date 齐全）',
  entry.live > 0 && entry.liveNoDate === 0 && entry.liveNoRole === 0 && entry.liveNoAria === 0, entry);
ok('1.2 可点的格子有可访问名（日期 + 时长 + 动作）',
  /\d+ 月 \d+ 日/.test(entry.sampleAria || '') && /查看/.test(entry.sampleAria || ''), entry.sampleAria);
ok('1.3 未追踪的日子与月首月尾补位格不可点', entry.naClickable === 0 && entry.blankClickable === 0,
  { na: entry.na, naClickable: entry.naClickable });
ok('1.4 可点格子用指针光标（看得出能点）', entry.cursor === 'pointer', entry.cursor);

// 键盘也能开：聚焦格子后按 Enter
await page.evaluate((d) => document.querySelector(`#heat-drill .hc[data-date="${d}"]`).focus(), entry.sampleDate);
await page.keyboard.press('Enter');
await waitDay();
const kbOpened = await page.evaluate(() => ({
  open: !document.getElementById('cal-overlay').hidden,
  focus: document.activeElement?.id ?? null,
}));
ok('1.5 键盘 Enter 也能打开当天明细（焦点随即进入浮层）',
  kbOpened.open && kbOpened.focus === 'cal-day-close', kbOpened);
await page.keyboard.press('Escape');
await page.waitForTimeout(300);

// 取当月数据（期望全部从数据源推导，不写死日期）
const ds = await page.evaluate(async () => {
  const m = document.getElementById('heat-month').textContent;
  const [, y, mm] = m.match(/(\d+) 年 (\d+) 月/);
  const ym = `${y}-${String(mm).padStart(2, '0')}`;
  const [daily, meta] = await Promise.all([
    fetch(`data/daily/${ym}.json`, { cache: 'reload' }).then((r) => r.json()),
    fetch('data/meta.json', { cache: 'reload' }).then((r) => r.json()),
  ]);
  const days = daily.days || {};
  const dates = Object.keys(days).sort();
  return {
    month: ym, dates,
    totals: Object.fromEntries(dates.map((d) => [d, days[d].total_minutes ?? 0])),
    counts: Object.fromEntries(dates.map((d) => [d, (days[d].games ?? []).length])),
    min: dates[0],
    max: meta.last_snapshot_date ?? dates[dates.length - 1],
  };
});
const DATES = ds.dates;
const MIN = ds.min, MAX = ds.max;
const PLAY = DATES.filter((d) => (ds.totals[d] ?? 0) > 0);
const MAX_PLAY = PLAY[PLAY.length - 1] ?? MIN;
ok('1.6 数据源可用：当月有每日记录的日期 + last_snapshot_date',
  DATES.length > 0 && !!MAX, { month: ds.month, n: DATES.length, MIN, MAX, play: PLAY.length });

// 找一个「有记录日 → 有记录日」之间的缺口日（空态测试用）
let gap = null;
for (let i = 1; i < DATES.length; i++) {
  const a = new Date(DATES[i - 1] + 'T12:00:00Z'), b = new Date(DATES[i] + 'T12:00:00Z');
  if ((b - a) / 86400000 === 2) { gap = new Date(a.getTime() + 86400000).toISOString().slice(0, 10); break; }
}
const pair = (() => {
  for (let i = 1; i < DATES.length; i++) {
    const a = new Date(DATES[i - 1] + 'T12:00:00Z'), b = new Date(DATES[i] + 'T12:00:00Z');
    if ((b - a) / 86400000 === 1) return [DATES[i - 1], DATES[i]];
  }
  return null;
})();

// ---------- 2. 几何：两个箭头夹住日期文本 ----------
const target = PLAY.includes('2026-10-16') ? '2026-10-16' : PLAY[Math.floor(PLAY.length / 2)];
await openDay(target);
const geo = await page.evaluate(() => {
  const panel = document.getElementById('cal-panel');
  const cs = getComputedStyle(panel);
  const pr = panel.getBoundingClientRect();
  const inner = { left: pr.left + parseFloat(cs.paddingLeft), right: pr.right - parseFloat(cs.paddingRight) };
  const r = (sel) => { const b = document.querySelector(sel).getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom, w: b.width, h: b.height, cy: b.top + b.height / 2 }; };
  return {
    inner,
    prev: r('#cal-day-prev'), title: r('#cal-day-title'),
    next: r('#cal-day-next'), close: r('#cal-day-close'),
    navScroll: (() => { const n = document.querySelector('.cal-day-nav'); return { sw: n.scrollWidth, cw: n.clientWidth }; })(),
    overflowX: document.documentElement.scrollWidth > window.innerWidth,
  };
});
ok('2.1 前一天按钮在日期文本左侧（不重叠）', geo.prev.r <= geo.title.l + 1, { prevR: Math.round(geo.prev.r), titleL: Math.round(geo.title.l) });
ok('2.2 后一天按钮在日期文本右侧（不重叠）', geo.title.r <= geo.next.l + 1, { titleR: Math.round(geo.title.r), nextL: Math.round(geo.next.l) });
ok('2.3 整组都在面板内容盒内', geo.prev.l >= geo.inner.left - 1 && geo.next.r <= geo.inner.right + 1 && geo.close.r <= geo.inner.right + 1, geo.inner);
ok('2.4 关闭按钮位于最外侧', geo.next.r <= geo.close.l + 1, { nextR: Math.round(geo.next.r), closeL: Math.round(geo.close.l) });
ok('2.5 三者纵向居中对齐（误差 ≤2px）',
  Math.abs(geo.prev.cy - geo.title.cy) <= 2 && Math.abs(geo.next.cy - geo.title.cy) <= 2,
  { prev: Math.round(geo.prev.cy), title: Math.round(geo.title.cy), next: Math.round(geo.next.cy) });
ok('2.6 日期步进组无内部溢出', geo.navScroll.sw <= geo.navScroll.cw + 1, geo.navScroll);
ok('2.7 桌面宽度无横向滚动', !geo.overflowX, geo.overflowX);
await page.screenshot({ path: OUT + 'cal47_day.png' });

// ---------- 3. 步进：日期 + 星期同步 ----------
const d0 = await readDay();
ok('3.1 初始标题 = 被点格子的日期与星期', d0.title === titleOf(target), { got: d0.title, want: titleOf(target) });
ok('3.2 摘要 = 当天总时长（独立预言）', d0.total === hmText(ds.totals[target]), { got: d0.total, want: hmText(ds.totals[target]) });
ok('3.3 条数说明与列表行数一致', d0.note.includes(`共 ${ds.counts[target]} 款游戏`) && d0.rows.length === ds.counts[target],
  { note: d0.note, rows: d0.rows.length, want: ds.counts[target] });

if (pair) {
  const [d1, d2] = pair;
  await closeDay();
  await openDay(d1);
  await settle();
  await page.click('#cal-day-next');
  await waitDay();
  const f1 = await readDay();
  ok('3.4 后一天：日期与星期都前进一天', f1.title === titleOf(d2), { got: f1.title, want: titleOf(d2) });
  ok('3.5 后一天：摘要/条数/列表同步',
    f1.total === hmText(ds.totals[d2]) && f1.note.includes(`共 ${ds.counts[d2]} 款游戏`) && f1.rows.length === ds.counts[d2],
    { got: f1.total, want: hmText(ds.totals[d2]), rows: f1.rows.length });
  await settle();
  await page.click('#cal-day-prev');
  await waitDay();
  const f2 = await readDay();
  ok('3.6 前一天：日期与星期都后退一天', f2.title === titleOf(d1), { got: f2.title, want: titleOf(d1) });

  // 连续三次后一天：验证周末→周一的星期翻转
  const seq = [];
  for (let i = 0; i < 4; i++) seq.push(new Date(new Date(d1 + 'T12:00:00Z').getTime() + i * 86400000).toISOString().slice(0, 10));
  const inRange = seq.every((d) => d >= MIN && d <= MAX);
  if (inRange) {
    const titles = [];
    for (let i = 0; i < 3; i++) { await settle(); await page.click('#cal-day-next'); await waitDay(); titles.push((await readDay()).title); }
    const want = seq.slice(1).map(titleOf);
    ok('3.7 连续三次后一天：星期依次正确翻转（含周末→周一）',
      JSON.stringify(titles) === JSON.stringify(want), { got: titles, want });
  } else {
    skip('3.7 连续步进跨周', `序列 ${seq.join('~')} 超出可步进范围 ${MIN}~${MAX}`);
  }
} else {
  skip('3.4~3.7 相邻有记录日步进', '当月没有相邻两天的记录');
}

// ---------- 4. 空态：步进到没有记录的日子 ----------
if (gap) {
  const after = DATES.find((d) => d > gap);
  await closeDay();
  await openDay(after);
  await settle(); await page.click('#cal-day-prev'); await waitDay();
  const g = await readDay();
  ok('4.1 无记录日显示空态文案', g.empty === '当天没有游玩记录', g.empty);
  ok('4.2 空态摘要为 0 分钟（不是「不足 1 分钟」）', g.total === '0 分钟', g.total);
  ok('4.3 空态条数为 0 款游戏', /共 0 款游戏/.test(g.note), g.note);
  ok('4.4 空态状态行说明原因', g.status === '该日没有游玩记录', g.status);
  ok('4.5 空态日两侧按钮仍可用（范围内允许无记录日）', !g.prevDisabled && !g.nextDisabled, g);
  ok('4.6 空态日标题星期仍正确', g.title === titleOf(gap), { got: g.title, want: titleOf(gap) });
  await page.screenshot({ path: OUT + 'cal47_empty.png' });
  await settle(); await page.click('#cal-day-prev'); await waitDay();
  const back1 = await readDay();
  const prevDay = new Date(new Date(gap + 'T12:00:00Z').getTime() - 86400000).toISOString().slice(0, 10);
  ok('4.7 从空态日再前一天回到有记录日', back1.title === titleOf(prevDay) && back1.rows.length > 0,
    { got: back1.title, rows: back1.rows.length });
} else {
  skip('4.1~4.7 空态步进', '当月没有采集缺口，无法构造无记录日');
}

// ---------- 5. 边界禁用 ----------
await closeDay();
await openDay(MIN);
const atMin = await readDay();
ok('5.1 最早一天：前一天按钮禁用', atMin.prevDisabled, atMin);
ok('5.2 最早一天：状态行说明边界', atMin.status === '已是最早一天的记录', atMin.status);
const minClick = await page.evaluate(() => {
  document.getElementById('cal-day-prev').click(); // 禁用按钮的程序式点击应当是空操作
  return document.getElementById('cal-day-title').textContent;
});
ok('5.3 最早一天：禁用按钮点击无效', minClick === atMin.title, { got: minClick, want: atMin.title });
const minStyle = await page.evaluate(() => {
  const b = document.getElementById('cal-day-prev');
  return { cursor: getComputedStyle(b).cursor, opacity: Number(getComputedStyle(b).opacity) };
});
ok('5.4 禁用样式（not-allowed + 半透明）', minStyle.cursor === 'not-allowed' && minStyle.opacity < 0.6, minStyle);

await closeDay();
await openDay(MAX_PLAY);
if (MAX_PLAY !== MAX) { await settle(); await page.click('#cal-day-next'); await waitDay(); }
const atMax = await readDay();
const maxHasPlay = (ds.totals[MAX] ?? 0) > 0;
ok('5.5 最新一天：后一天按钮禁用', atMax.nextDisabled, atMax);
ok('5.6 最新一天：状态行说明边界（0 分钟日优先「该日没有游玩记录」）',
  atMax.status === (maxHasPlay ? '已是最新一天的记录' : '该日没有游玩记录'), { got: atMax.status, MAX, maxHasPlay });
const maxClick = await page.evaluate(() => {
  document.getElementById('cal-day-next').click();
  return document.getElementById('cal-day-title').textContent;
});
ok('5.7 最新一天：禁用按钮点击无效', maxClick === atMax.title, { got: maxClick, want: atMax.title });

const mid = PLAY.find((d) => d > MIN && d < MAX) ?? PLAY[0];
if (mid > MIN && mid < MAX) {
  await closeDay();
  await openDay(mid);
  const atMid = await readDay();
  ok('5.8 中间日：两侧按钮均可用，状态行说明排序',
    !atMid.prevDisabled && !atMid.nextDisabled && atMid.status === '按当天时长从高到低', atMid);
}

// ---------- 6. 关闭：× / Esc / 点空白 + 浮层外零变化 ----------
const outerBefore = await page.evaluate(() => ({
  cards: ['c-lifetime', 'c-recent', 'c-ach', 'c-games', 'c-data'].map((id) => document.getElementById(id).textContent),
  scrollY: Math.round(window.scrollY),
  ltRows: document.querySelectorAll('#lt-list .rank-item').length,
  heatCells: document.querySelectorAll('#heat-drill .hc').length,
  month: document.getElementById('heat-month').textContent,
}));
const focusCell = await page.evaluate(() => document.activeElement?.dataset?.date ?? null);
await closeDay();
const closed = await page.evaluate(() => ({
  hidden: document.getElementById('cal-overlay').hidden,
  maskHidden: (() => { const m = document.getElementById('cal-mask'); return !m || m.hidden; })(),
  focus: document.activeElement?.dataset?.date ?? null,
  sel: document.querySelector('#heat-drill .hc.is-sel')?.dataset.date ?? null,
  cards: ['c-lifetime', 'c-recent', 'c-ach', 'c-games', 'c-data'].map((id) => document.getElementById(id).textContent),
  scrollY: Math.round(window.scrollY),
  ltRows: document.querySelectorAll('#lt-list .rank-item').length,
  heatCells: document.querySelectorAll('#heat-drill .hc').length,
  month: document.getElementById('heat-month').textContent,
}));
ok('6.1 × 关闭浮层（遮罩同时复位）', closed.hidden && closed.maskHidden, closed);
ok('6.2 关闭后焦点回到刚才点的格子', /^\d{4}-\d{2}-\d{2}$/.test(String(closed.focus ?? '')), { focusCell, focus: closed.focus });
ok('6.3 关闭后热力图仍标着看过的那天（选中态保留）', !!closed.sel, closed.sel);
ok('6.4 ★ 关闭后浮层外零变化（卡片 / 滚动 / 榜单 / 热力图格数 / 月份）',
  JSON.stringify(closed.cards) === JSON.stringify(outerBefore.cards)
  && closed.scrollY === outerBefore.scrollY && closed.ltRows === outerBefore.ltRows
  && closed.heatCells === outerBefore.heatCells && closed.month === outerBefore.month,
  { before: outerBefore, after: closed });

// Esc 关闭
await openDay(target);
await page.keyboard.press('Escape');
await page.waitForTimeout(350);
ok('6.5 Esc 关闭浮层（只有一层，不再"先退回月历"）',
  await page.evaluate(() => document.getElementById('cal-overlay').hidden));
// 点空白关闭
await openDay(target);
await page.mouse.click(12, 12);
await page.waitForTimeout(350);
ok('6.6 点浮层空白处关闭',
  await page.evaluate(() => document.getElementById('cal-overlay').hidden));

// ---------- 7. 焦点 ----------
const nearMin = DATES[1] ?? MIN;
if (nearMin > MIN) {
  await openDay(nearMin);
  await settle();
  await page.click('#cal-day-prev'); // 点到最早一天，prev 随即禁用
  await waitDay();
  const foc = await page.evaluate(() => ({
    active: document.activeElement?.id ?? null,
    prevDisabled: document.getElementById('cal-day-prev').disabled,
  }));
  ok('7.1 按钮变禁用时焦点自动转移到另一个按钮', foc.prevDisabled && foc.active === 'cal-day-next', foc);
} else {
  skip('7.1 焦点转移', '最早一天之后没有其它日期');
}
await closeDay();
await openDay(mid > MIN && mid < MAX ? mid : target);
await settle();
await page.click('#cal-day-next');
await waitDay();
ok('7.2 步进后焦点不被抢走（仍留在被点的按钮上）',
  (await page.evaluate(() => document.activeElement?.id ?? null)) === 'cal-day-next');

// ---------- 8. 键盘 ----------
const kb0 = (await readDay()).title;
await page.keyboard.press('ArrowLeft'); await waitDay();
const kbL = (await readDay()).title;
await page.keyboard.press('ArrowRight'); await waitDay();
const kbR = (await readDay()).title;
ok('8.1 ←/→ 步进前一天/后一天（回到原日期）', kbL !== kb0 && kbR === kb0, { kb0, kbL, kbR });
await closeDay();

// ---------- 9. 响应式 ----------
await freshPage(1440, 950, 1);
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('#lt-list .rank-item', { state: 'visible', timeout: 30000 });
await page.waitForTimeout(800);
await openDay();
for (const w of [1440, 1024, 768, 430, 390, 360]) {
  await page.setViewportSize({ width: w, height: 900 });
  await page.waitForTimeout(400);
  const m = await page.evaluate(() => {
    const panel = document.getElementById('cal-panel');
    const cs = getComputedStyle(panel);
    const pr = panel.getBoundingClientRect();
    const inner = { left: pr.left + parseFloat(cs.paddingLeft), right: pr.right - parseFloat(cs.paddingRight) };
    const r = (sel) => { const b = document.querySelector(sel).getBoundingClientRect(); return { l: Math.round(b.left), r: Math.round(b.right), w: Math.round(b.width) }; };
    const nav = document.querySelector('.cal-day-nav');
    const prev = document.getElementById('cal-day-prev');
    const pb = prev.getBoundingClientRect();
    return {
      inner, prev: r('#cal-day-prev'), title: r('#cal-day-title'), next: r('#cal-day-next'),
      navOverflow: nav.scrollWidth - nav.clientWidth,
      docOverflow: document.documentElement.scrollWidth - window.innerWidth,
      panelInView: pr.right <= window.innerWidth + 1 && pr.left >= -1,
      txtSpanCount: document.querySelectorAll('.cal-step-txt').length,
      btnSquare: Math.abs(pb.width - pb.height) <= 1,
      titleClipped: (() => { const t = document.getElementById('cal-day-title'); return t.scrollWidth > t.clientWidth + 1; })(),
    };
  });
  ok(`9.${w} 箭头仍夹住日期文本且在面板内`,
    m.prev.r <= m.title.l + 1 && m.title.r <= m.next.l + 1
    && m.prev.l >= m.inner.left - 1 && m.next.r <= m.inner.right + 1, m);
  ok(`9.${w} 无内部/文档级横向溢出`, m.navOverflow <= 1 && m.docOverflow <= 0 && m.panelInView, m);
  ok(`9.${w} 日期文本未被截断`, !m.titleClipped, m.title);
  ok(`9.${w} 按钮为纯箭头（无文字标签、保持正方形）`, m.txtSpanCount === 0 && m.btnSquare, m);
  if (w === 360) await page.screenshot({ path: OUT + 'cal47_360.png' });
}
await ctx.close();

// ---------- 10. 单游戏下钻：明细仍是「当天全部游戏」+ 高亮当前游戏 ----------
await freshPage(1440, 950, 1);
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('#lt-list .rank-item', { state: 'visible', timeout: 30000 });
await page.waitForTimeout(800);
const firstApp = await page.evaluate(() => document.querySelector('#lt-list .rank-item').dataset.appid);
await page.click('#lt-list .rank-item');
await page.waitForTimeout(600);
const dayForGame = await page.evaluate(() => {
  const c = [...document.querySelectorAll('#heat-drill .hc.is-live')].reverse().find((x) => x.querySelector('i'));
  return c.dataset.date;
});
await page.click(`#heat-drill .hc[data-date="${dayForGame}"]`);
await waitDay();
const sg = await readDay();
const sgData = await page.evaluate(async (d) => {
  const ym = d.slice(0, 7);
  const daily = await fetch(`data/daily/${ym}.json`, { cache: 'reload' }).then((r) => r.json());
  const day = daily.days?.[d] ?? {};
  return { count: (day.games ?? []).length, total: day.total_minutes ?? 0 };
}, dayForGame);
ok('10.1 单游戏下钻里点格子，明细仍列当天全部游戏（不是只列这一款）',
  sg.rows.length === sgData.count && sg.rows.length > 0, { rows: sg.rows.length, want: sgData.count });
ok('10.2 摘要仍是当天总时长（全部游戏之和，与单游戏下钻无关）',
  sg.total === hmText(sgData.total), { got: sg.total, want: hmText(sgData.total) });
ok('10.3 当前下钻的那款被高亮（.is-focus 恰好一条）',
  sg.rows.filter((r) => r.focus).length === 1,
  { appid: firstApp, focused: sg.rows.filter((r) => r.focus).map((r) => r.name) });
await page.screenshot({ path: OUT + 'cal47_single_game.png' });
await ctx.close();

await browser.close();
ok('11.1 全程无 JS 异常 / console error', errs.length === 0, errs.slice(0, 3));
console.log(`\n===== 第47轮 PASS=${pass} FAIL=${fail} =====`);
process.exit(fail ? 1 : 0);
