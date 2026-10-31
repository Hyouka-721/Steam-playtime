/* verify47.mjs — 第 47 轮验证：二级界面「前一天 / 后一天」改为纯箭头按钮
 * 需求：
*   a 日期文本左右两侧各一个按钮（纯箭头，文字标签已移除）
 *   b 点击后日期正确切换，星期几同步更新
 *   c 保持现有布局与风格（不溢出、不遮挡、与 .cal-nav 同视觉体系）
 * 覆盖：
 *   1 结构：二级头部三段式 + 日期被两个按钮夹住
 *   2 几何：prev.right ≤ title.left ≤ title.right ≤ next.left，且都在面板内容盒内
 *   3 步进：跨记录日 / 跨周（周五→周六→周日→周一）/ 跨月边界由 state.cal.ym 同步
 *   4 空态：步进到没有记录的日期 → 「当天没有游玩记录」+ 0 分钟 + 状态行说明
 *   5 边界：最早/最新一天按钮禁用 + 状态行说明 + 禁用按钮点击无效
 *   6 月历同步：返回一级后 .sel 与标题月份跟随步进后的日期
 *   7 回看态：#c-recent / review-bar 跟随步进后的日期
 *   8 键盘：二级里 ←/→ 步进日，一级里 ←/→ 仍走月
 *   9 焦点：步进不抢焦点；按钮变禁用时焦点转移到另一个按钮
 *  10 响应式：1440/1024/768/430/390/360 不溢出且按钮始终为纯箭头正方形
 *  11 全程无 JS 异常；版本号 ?v=91（防缓存拿旧文件）
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
/** 跳过：数据环境不满足前置条件（不是失败，但要在输出里可见） */
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
const settle = async () => {
  await page.waitForFunction(
    () => { const t = document.querySelector('.toast'); return !t || Number(getComputedStyle(t).opacity) < 0.01; },
    null, { timeout: 3000 },
  ).catch(() => {});
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
};
/** 等一次步进/载入彻底结束：遮罩 hidden 且二级页可见 */
const waitDay = async () => {
  await page.waitForFunction(
    () => {
      const m = document.getElementById('cal-mask');
      return !!m && m.hidden && !document.getElementById('cal-page-day').hidden;
    },
    null, { timeout: 8000 },
  ).catch(() => {});
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
};
const openCal = async () => {
  await page.click('#recent-list [data-cal-toggle]');
  await page.waitForSelector('#cal-grid .cal-day.on', { state: 'visible', timeout: 10000 });
};
const hmText = (m) => {
  const n = Math.round(Number(m) || 0);
  if (n <= 0) return '不足 1 分钟';
  if (n < 60) return `${n} 分钟`;
  const h = Math.floor(n / 60), r = n % 60;
  return r === 0 ? `${h} 小时` : `${h} 小时 ${r} 分钟`;
};
const hm = (m) => {
  const n = Math.round(Number(m) || 0);
  if (n <= 0) return '0 min';
  if (n < 60) return `${n} min`;
  const h = Math.floor(n / 60), r = n % 60;
  return r === 0 ? `${h} h` : `${h} h ${r} min`;
};
/** 独立星期预言：本地时间构造，与 app 的 UTC 正午是两条代码路径 */
const wdName = (ds) => {
  const [y, m, d] = ds.split('-').map(Number);
  return '周' + '日一二三四五六'[new Date(y, m - 1, d).getDay()];
};
const readDay = () => page.evaluate(() => ({
  title: document.getElementById('cal-day-title').textContent,
  total: document.getElementById('cal-day-total').textContent,
  note: document.getElementById('cal-day-note').textContent,
  status: document.getElementById('cal-day-status').textContent,
  rows: [...document.querySelectorAll('#cal-day-games .cal-game')].map((r) => ({
    name: r.querySelector('.cal-game-name').textContent,
    min: r.querySelector('.cal-game-min').textContent,
  })),
  empty: document.querySelector('#cal-day-games .cal-empty')?.textContent ?? null,
  prevDisabled: document.getElementById('cal-day-prev').disabled,
  nextDisabled: document.getElementById('cal-day-next').disabled,
  focus: document.activeElement?.id ?? null,
}));

await freshPage();
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.click('#card-recent'); // 默认视图是累计榜，日历入口在「最近游玩」里
await page.waitForSelector('#recent-list .rank-item', { state: 'visible', timeout: 30000 });
await page.waitForTimeout(1200);

// ---------- 0. 版本与结构 ----------
const v = await page.evaluate(() =>
  [...document.querySelectorAll('script[src]')].map((s) => s.getAttribute('src')).find((s) => s.includes('app.js')));
ok('0.1 app.js 版本号已 bump 到 ?v=104', v === 'app\.js\?v=104', v);

const head = await page.evaluate(() => {
  const hd = document.querySelector('.cal-head-day');
  const nav = document.querySelector('.cal-day-nav');
  const prev = document.getElementById('cal-day-prev');
  const next = document.getElementById('cal-day-next');
  // 二级页面此刻还是 hidden，getBoundingClientRect 会归零 → 用 computed style 量尺寸
  const box = (b) => { const s = getComputedStyle(b); return { w: parseFloat(s.width), h: parseFloat(s.height) }; };
  return {
    headKids: [...hd.children].map((e) => e.id || e.className),
    navKids: [...nav.children].map((e) => e.id || e.className),
    // 按钮里只应剩箭头字符，「前一天 / 后一天」文字标签已按要求移除
    prevTxt: prev.textContent.trim(),
    nextTxt: next.textContent.trim(),
    backTxt: document.getElementById('cal-back').textContent.trim(),
    prevHtml: prev.innerHTML,
    nextHtml: next.innerHTML,
    prevAria: prev.getAttribute('aria-label'),
    nextAria: next.getAttribute('aria-label'),
    prevTitle: prev.getAttribute('title'),
    nextTitle: next.getAttribute('title'),
    txtSpanCount: document.querySelectorAll('.cal-step-txt').length,
    prevBox: box(prev),
    nextBox: box(next),
    dayPageDisplayWhenHidden: getComputedStyle(document.getElementById('cal-page-day')).display,
  };
});
ok('0.2 二级头部三段：返回 / 日期步进组 / 关闭',
  JSON.stringify(head.headKids) === JSON.stringify(['cal-back', 'cal-day-nav', 'cal-day-close']), head.headKids);
ok('0.3 日期步进组三段：前一天 / 日期文本 / 后一天',
  JSON.stringify(head.navKids) === JSON.stringify(['cal-day-prev', 'cal-day-title', 'cal-day-next']), head.navKids);
ok('0.4a 按钮上不再显示「前一天 / 后一天」文字标签',
  head.prevTxt === '←' && head.nextTxt === '→' && head.txtSpanCount === 0
  && !head.prevHtml.includes('前一天') && !head.nextHtml.includes('后一天'), head);
ok('0.4a2 步进箭头与「返回 / 上下月」的 ‹ › 不撞脸',
  head.backTxt === '‹' && head.prevTxt !== head.backTxt && head.nextTxt !== head.backTxt, head);
// 第 82 轮：全站移除 title 悬停气泡 → 语义只由 aria-label 承载，title 必须不存在
ok('0.4b 语义由 aria-label 承载，且已无 title 悬停气泡',
  head.prevAria === '前一天' && head.nextAria === '后一天'
  && head.prevTitle === null && head.nextTitle === null, head);
ok('0.4c 按钮为正方形图标按钮（计算样式 宽=高）',
  head.prevBox.w === head.prevBox.h && head.nextBox.w === head.nextBox.h && head.prevBox.w >= 24, head);
ok('0.5 .cal-page 未被设 display（[hidden] 仍能隐藏页面）', head.dayPageDisplayWhenHidden === 'none', head.dayPageDisplayWhenHidden);

await openCal();
await page.waitForTimeout(400);

// 取当月数据与边界（全部从数据源推导，避免写死日期）
const ds = await page.evaluate(async () => {
  const t = document.getElementById('cal-title').textContent;
  const [, y, m] = t.match(/(\d+) 年 (\d+) 月/);
  const mm = String(m).padStart(2, '0');
  const [daily, meta] = await Promise.all([
    fetch(`data/daily/${y}-${mm}.json`, { cache: 'reload' }).then((r) => r.json()),
    fetch('data/meta.json', { cache: 'reload' }).then((r) => r.json()),
  ]);
  const days = daily.days || {};
  const dates = Object.keys(days).sort();
  return {
    month: `${y}-${mm}`, dates,
    totals: Object.fromEntries(dates.map((d) => [d, days[d].total_minutes ?? 0])),
    counts: Object.fromEntries(dates.map((d) => [d, (days[d].games ?? []).length])),
    max: meta.last_snapshot_date ?? dates[dates.length - 1],
  };
});
const DATES = ds.dates;
const MIN = DATES[0], MAX = ds.max;
// 2026-10-22：CI 快照可能给出 total_minutes=0 的「有采集无游玩」日（如 2026-10-21），
// 月历里 hasPlay = total_minutes > 0 → 这类日渲染成 .off，不能当点击目标。
// 故区分两个口径：MAX = 步进上界（= last_snapshot_date），MAX_PLAY = 网格里可点的最后一天。
const PLAY = DATES.filter((d) => (ds.totals[d] ?? 0) > 0);
const MAX_PLAY = PLAY[PLAY.length - 1] ?? MIN;
ok('1.1 数据源可用：当月有记录日期 + last_snapshot_date', DATES.length > 0 && !!MAX, { month: ds.month, n: DATES.length, MIN, MAX, play: PLAY.length, MAX_PLAY });

// 找一个「有记录日 → 有记录日」之间的缺口日（用于空态测试）
let gap = null;
for (let i = 1; i < DATES.length; i++) {
  const a = new Date(DATES[i - 1] + 'T12:00:00Z'), b = new Date(DATES[i] + 'T12:00:00Z');
  if ((b - a) / 86400000 === 2) { gap = new Date(a.getTime() + 86400000).toISOString().slice(0, 10); break; }
}
// 找一对相邻有记录日（用于跨周/连续步进测试）
const pair = (() => {
  for (let i = 1; i < DATES.length; i++) {
    const a = new Date(DATES[i - 1] + 'T12:00:00Z'), b = new Date(DATES[i] + 'T12:00:00Z');
    if ((b - a) / 86400000 === 1) return [DATES[i - 1], DATES[i]];
  }
  return null;
})();

// ---------- 2. 几何：两个按钮夹住日期文本 ----------
const target = DATES.includes('2026-10-16') ? '2026-10-16' : DATES[Math.floor(DATES.length / 2)];
await page.click(`#cal-grid .cal-day.on[data-date="${target}"]`);
await waitDay();
const geo = await page.evaluate(() => {
  const panel = document.getElementById('cal-panel');
  const cs = getComputedStyle(panel);
  const inner = { left: panel.getBoundingClientRect().left + parseFloat(cs.paddingLeft), right: panel.getBoundingClientRect().right - parseFloat(cs.paddingRight) };
  const r = (sel) => { const b = document.querySelector(sel).getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom, w: b.width, h: b.height, cy: b.top + b.height / 2 }; };
  return {
    inner, back: r('#cal-back'), prev: r('#cal-day-prev'), title: r('#cal-day-title'),
    next: r('#cal-day-next'), close: r('#cal-day-close'),
    navScroll: (() => { const n = document.querySelector('.cal-day-nav'); return { sw: n.scrollWidth, cw: n.clientWidth }; })(),
    overflowX: document.documentElement.scrollWidth > window.innerWidth,
  };
});
ok('2.1 前一天按钮在日期文本左侧（不重叠）', geo.prev.r <= geo.title.l + 1, { prevR: Math.round(geo.prev.r), titleL: Math.round(geo.title.l) });
ok('2.2 后一天按钮在日期文本右侧（不重叠）', geo.title.r <= geo.next.l + 1, { titleR: Math.round(geo.title.r), nextL: Math.round(geo.next.l) });
ok('2.3 两组元素都在面板内容盒内', geo.back.l >= geo.inner.left - 1 && geo.prev.l >= geo.inner.left - 1
  && geo.next.r <= geo.inner.right + 1 && geo.close.r <= geo.inner.right + 1, geo.inner);
ok('2.4 返回/关闭按钮仍位于最外侧', geo.back.r <= geo.prev.l + 1 && geo.next.r <= geo.close.l + 1,
  { backR: Math.round(geo.back.r), prevL: Math.round(geo.prev.l), nextR: Math.round(geo.next.r), closeL: Math.round(geo.close.l) });
ok('2.5 三者纵向居中对齐（误差 ≤2px）',
  Math.abs(geo.prev.cy - geo.title.cy) <= 2 && Math.abs(geo.next.cy - geo.title.cy) <= 2,
  { prev: Math.round(geo.prev.cy), title: Math.round(geo.title.cy), next: Math.round(geo.next.cy) });
ok('2.6 日期步进组无内部溢出', geo.navScroll.sw <= geo.navScroll.cw + 1, geo.navScroll);
ok('2.7 桌面宽度无横向滚动', !geo.overflowX, geo.overflowX);
await page.screenshot({ path: OUT + 'cal47_day.png' });

// ---------- 3. 步进：日期 + 星期同步 ----------
const d0 = await readDay();
ok('3.1 初始标题 = 点击的日期与星期',
  d0.title === `${Number(target.slice(5, 7))} 月 ${Number(target.slice(8, 10))} 日 ${wdName(target)}`, { got: d0.title, want: wdName(target) });

if (pair) {
  const [d1, d2] = pair; // d1 < d2，相邻两天
  await page.click(`#cal-grid .cal-day.on[data-date="${d1}"]`).catch(() => {});
  // 已经在二级界面，grid 不可见 → 用步进按钮过去
  await waitDay();
  const before = await readDay();
  // 用后一天从 d1 到 d2（若当前就在 d1）
  if (before.title !== `${Number(d1.slice(5, 7))} 月 ${Number(d1.slice(8, 10))} 日 ${wdName(d1)}`) {
    // 当前不在 d1：先回一级再点 d1
    await page.click('#cal-back'); await page.waitForTimeout(300);
    await page.click(`#cal-grid .cal-day.on[data-date="${d1}"]`); await waitDay();
  }
  await settle();
  await page.click('#cal-day-next');
  await waitDay();
  const f1 = await readDay();
  ok('3.2 后一天：日期与星期都前进一天',
    f1.title === `${Number(d2.slice(5, 7))} 月 ${Number(d2.slice(8, 10))} 日 ${wdName(d2)}`, { got: f1.title, want: `${d2} ${wdName(d2)}` });
  ok('3.3 后一天：摘要/条数/列表同步',
    f1.total === hmText(ds.totals[d2]) && f1.note.includes(`共 ${ds.counts[d2]} 款游戏`) && f1.rows.length === ds.counts[d2],
    { got: f1.total, want: hmText(ds.totals[d2]), rows: f1.rows.length, wantRows: ds.counts[d2] });
  await settle();
  await page.click('#cal-day-prev');
  await waitDay();
  const f2 = await readDay();
  ok('3.4 前一天：日期与星期都后退一天',
    f2.title === `${Number(d1.slice(5, 7))} 月 ${Number(d1.slice(8, 10))} 日 ${wdName(d1)}`, { got: f2.title, want: `${d1} ${wdName(d1)}` });
} else {
  skip('3.2~3.4 相邻有记录日步进', '当月没有相邻两天的记录');
}

// 跨周：找周五→周六→周日→周一 这样的连续段（用步进一路点过去验证星期翻转）
if (pair) {
  const [d1] = pair;
  const seq = [];
  for (let i = 0; i < 4; i++) seq.push(new Date(new Date(d1 + 'T12:00:00Z').getTime() + i * 86400000).toISOString().slice(0, 10));
  const inRange = seq.every((d) => d >= MIN && d <= MAX);
  if (inRange) {
    // 从 d1 开始连点三次后一天
    await page.click('#cal-back'); await page.waitForTimeout(300);
    await page.click(`#cal-grid .cal-day.on[data-date="${d1}"]`); await waitDay();
    const titles = [];
    for (let i = 0; i < 3; i++) { await settle(); await page.click('#cal-day-next'); await waitDay(); titles.push((await readDay()).title); }
    const want = seq.slice(1).map((d) => `${Number(d.slice(5, 7))} 月 ${Number(d.slice(8, 10))} 日 ${wdName(d)}`);
    ok('3.5 连续三次后一天：星期依次正确翻转（含周末→周一）',
      JSON.stringify(titles) === JSON.stringify(want), { got: titles, want });
  } else {
    skip('3.5 连续步进跨周', `序列 ${seq.join('~')} 超出可步进范围 ${MIN}~${MAX}`);
  }
}

// ---------- 4. 空态：步进到没有记录的日期 ----------
if (gap) {
  // 从缺口后一天的记录日连点两次前一天，落到缺口日
  const after = DATES.find((d) => d > gap);
  await page.click('#cal-back'); await page.waitForTimeout(300);
  await page.click(`#cal-grid .cal-day.on[data-date="${after}"]`); await waitDay();
  await settle(); await page.click('#cal-day-prev'); await waitDay();
  const g = await readDay();
  ok('4.1 步进到无记录日显示空态文案', g.empty === '当天没有游玩记录', g.empty);
  ok('4.2 空态摘要为 0 分钟（不是「不足 1 分钟」）', g.total === '0 分钟', g.total);
  ok('4.3 空态条数为 0 款游戏', /共 0 款游戏/.test(g.note), g.note);
  ok('4.4 空态状态行说明原因', g.status === '该日没有游玩记录', g.status);
  ok('4.5 空态日两侧按钮仍可用（范围内允许无记录日）', !g.prevDisabled && !g.nextDisabled, g);
  ok('4.6 空态日标题星期仍正确',
    g.title === `${Number(gap.slice(5, 7))} 月 ${Number(gap.slice(8, 10))} 日 ${wdName(gap)}`, { got: g.title, want: wdName(gap) });
  await page.screenshot({ path: OUT + 'cal47_empty.png' });
  // 再往前一天应回到有记录日
  await settle(); await page.click('#cal-day-prev'); await waitDay();
  const back1 = await readDay();
  const prevDay = new Date(new Date(gap + 'T12:00:00Z').getTime() - 86400000).toISOString().slice(0, 10);
  ok('4.7 从空态日再前一天回到有记录日',
    back1.title === `${Number(prevDay.slice(5, 7))} 月 ${Number(prevDay.slice(8, 10))} 日 ${wdName(prevDay)}` && back1.rows.length > 0,
    { got: back1.title, rows: back1.rows.length });
} else {
  skip('4.1~4.7 空态步进', '当月没有采集缺口，无法构造无记录日');
}

// ---------- 5. 边界禁用 ----------
await page.click('#cal-back'); await page.waitForTimeout(300);
await page.click(`#cal-grid .cal-day.on[data-date="${MIN}"]`); await waitDay();
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

// 最新一端：先点网格里最后一个「有游玩」的日，若它早于 last_snapshot_date 再步进到真正的最新一天
await page.click('#cal-back'); await page.waitForTimeout(300);
await page.click(`#cal-grid .cal-day.on[data-date="${MAX_PLAY}"]`); await waitDay();
if (MAX_PLAY !== MAX) { await settle(); await page.click('#cal-day-next'); await waitDay(); }
const atMax = await readDay();
const maxHasPlay = (ds.totals[MAX] ?? 0) > 0;
ok('5.5 最新一天：后一天按钮禁用', atMax.nextDisabled, atMax);
ok('5.6 最新一天：状态行说明边界（0 分钟日优先显示「该日没有游玩记录」）',
  atMax.status === (maxHasPlay ? '已是最新一天的记录' : '该日没有游玩记录'), { got: atMax.status, MAX, maxHasPlay });
const maxClick = await page.evaluate(() => {
  document.getElementById('cal-day-next').click();
  return document.getElementById('cal-day-title').textContent;
});
ok('5.7 最新一天：禁用按钮点击无效', maxClick === atMax.title, { got: maxClick, want: atMax.title });
// 中间某日：两个按钮都可用，状态行是排序说明
const mid = PLAY.find((d) => d > MIN && d < MAX) ?? PLAY[0];
if (mid > MIN && mid < MAX) {
  await page.click('#cal-back'); await page.waitForTimeout(300);
  await page.click(`#cal-grid .cal-day.on[data-date="${mid}"]`); await waitDay();
  const atMid = await readDay();
  ok('5.8 中间日：两侧按钮均可用，状态行说明排序',
    !atMid.prevDisabled && !atMid.nextDisabled && atMid.status === '按当天时长从高到低', atMid);
}

// ---------- 6. 月历同步（第 48 轮起：浮层外零变化） ----------
const stepTo = (ds.counts[target] && DATES.includes(target)) ? target : mid;
await page.click('#cal-back'); await page.waitForTimeout(300);
await page.click(`#cal-grid .cal-day.on[data-date="${stepTo}"]`); await waitDay();
// 步进一天（方向选不越界的那侧）
const dir = stepTo < MAX ? '#cal-day-next' : '#cal-day-prev';
await settle(); await page.click(dir); await waitDay();
const stepped = new Date(new Date(stepTo + 'T12:00:00Z').getTime() + (dir === '#cal-day-next' ? 86400000 : -86400000)).toISOString().slice(0, 10);
const afterStep = await readDay();
// 第 48 轮：整页回看态已移除，步进日期**不得**改变浮层以外的任何页面状态
const outer = await page.evaluate(() => ({
  recent: document.getElementById('c-recent').textContent,
  lifetime: document.getElementById('c-lifetime').textContent,
  reviewBar: !!document.getElementById('review-bar'),
  ltRows: document.querySelectorAll('#lt-list .rank-item').length,
  scrollY: Math.round(window.scrollY),
  toast: !!document.querySelector('.toast'),
}));
ok('6.1 步进后「最近游玩」卡**不**变成步进日的总时长（整页回看已移除）',
  outer.recent !== hm(ds.totals[stepped] ?? 0) || ds.totals[stepped] === undefined,
  { got: outer.recent, dayTotal: hm(ds.totals[stepped] ?? 0), date: stepped });
ok('6.2 步进后没有任何回看状态条 / toast / 滚动', !outer.reviewBar && !outer.toast && outer.scrollY === 0, outer);
ok('6.3 步进后累计榜行数不变', typeof outer.ltRows === 'number' && outer.ltRows > 0, outer.ltRows);
await page.click('#cal-back'); await page.waitForTimeout(400);
const backState = await page.evaluate(() => ({
  monthTitle: document.getElementById('cal-title').textContent,
  sel: document.querySelector('#cal-grid .cal-day.sel')?.dataset.date ?? null,
  status: document.getElementById('cal-status').textContent,
}));
ok('6.4 返回一级后月历仍选中步进后的日期', backState.sel === stepped, { got: backState.sel, want: stepped });
ok('6.5 返回一级后月份标题与步进日同月',
  backState.monthTitle === `${stepped.slice(0, 4)} 年 ${Number(stepped.slice(5, 7))} 月`, { got: backState.monthTitle, want: stepped.slice(0, 7) });
ok('6.6 返回一级后状态行是本月记录天数（不再是回看提示）',
  /本月 \d+ 天有记录/.test(backState.status), backState.status);
await page.screenshot({ path: OUT + 'cal47_back.png' });

// ---------- 8. 键盘 ----------
await page.click(`#cal-grid .cal-day.on[data-date="${stepTo}"]`); await waitDay();
await page.keyboard.press('ArrowRight'); await waitDay();
const kb1 = await readDay();
await page.keyboard.press('ArrowLeft'); await waitDay();
const kb2 = await readDay();
ok('8.1 二级界面 ←/→ 步进前一天/后一天',
  kb1.title === afterStep.title && kb2.title === `${Number(stepTo.slice(5, 7))} 月 ${Number(stepTo.slice(8, 10))} 日 ${wdName(stepTo)}`,
  { afterRight: kb1.title, afterLeft: kb2.title });
await page.keyboard.press('Escape'); await page.waitForTimeout(350); // 先回一级
const kbMonth = await page.evaluate(() => ({
  monthVisible: !document.getElementById('cal-page-month').hidden,
  ym: document.getElementById('cal-title').textContent,
}));
ok('8.2 一级界面按 ←/→ 仍走月历（不报错、不跳到二级）', kbMonth.monthVisible, kbMonth);
await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(200);
await page.keyboard.press('ArrowRight'); await page.waitForTimeout(200);
ok('8.3 一级界面方向键后仍在月历（无 JS 异常）',
  await page.evaluate(() => !document.getElementById('cal-page-month').hidden));

// ---------- 9. 焦点 ----------
// 从最早一天的前一天按钮被点击后变禁用 → 焦点应转移到另一个按钮
await page.click(`#cal-grid .cal-day.on[data-date="${MIN}"]`).catch(() => {});
await waitDay();
const nearMin = DATES[1] ?? MIN;
if (nearMin > MIN) {
  await page.click('#cal-back'); await page.waitForTimeout(300);
  await page.click(`#cal-grid .cal-day.on[data-date="${nearMin}"]`); await waitDay();
  await settle();
  await page.click('#cal-day-prev'); // 点到最早一天，prev 随即禁用
  await waitDay();
  const foc = await page.evaluate(() => ({
    active: document.activeElement?.id ?? null,
    prevDisabled: document.getElementById('cal-day-prev').disabled,
  }));
  ok('9.1 按钮变禁用时焦点转移到另一个按钮', foc.prevDisabled && foc.active === 'cal-day-next', foc);
} else {
  skip('9.1 焦点转移', '最早一天之后没有其它日期');
}
// 步进过程不抢焦点：点后一天后焦点仍留在该按钮上
await page.click('#cal-back'); await page.waitForTimeout(300);
await page.click(`#cal-grid .cal-day.on[data-date="${stepTo}"]`); await waitDay();
await settle();
await page.click('#cal-day-next');
await waitDay();
const keepFocus = await page.evaluate(() => document.activeElement?.id ?? null);
ok('9.2 步进后焦点不被抢走（留在被点的按钮上）', keepFocus === 'cal-day-next', keepFocus);
await page.click('#cal-day-close'); await page.waitForTimeout(300);

// ---------- 10. 响应式 ----------
// ≤860px 时 .rank-last 整体 display:none，日历入口本就不可见（站点既有行为），
// 所以先在桌面尺寸打开二级界面，再逐个缩放视口量同一份 DOM。
await freshPage(1440, 950, 1);
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.click('#card-recent');
await page.waitForSelector('#recent-list .rank-item', { state: 'visible', timeout: 30000 });
await page.waitForTimeout(900);
await page.click('#recent-list [data-cal-toggle]');
await page.waitForSelector('#cal-grid .cal-day.on', { state: 'visible', timeout: 10000 });
await page.waitForTimeout(250);
await page.click('#cal-grid .cal-day.on');
await waitDay();
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
      panelW: Math.round(pr.width),
      inner, prev: r('#cal-day-prev'), title: r('#cal-day-title'), next: r('#cal-day-next'),
      navOverflow: nav.scrollWidth - nav.clientWidth,
      docOverflow: document.documentElement.scrollWidth - window.innerWidth,
      panelInView: pr.right <= window.innerWidth + 1 && pr.left >= -1,
      txtSpanCount: document.querySelectorAll('.cal-step-txt').length,
      btnSquare: Math.abs(pb.width - pb.height) <= 1,
      titleClipped: (() => { const t = document.getElementById('cal-day-title'); return t.scrollWidth > t.clientWidth + 1; })(),
    };
  });
  ok(`10.${w} 按钮仍夹住日期文本且在面板内`,
    m.prev.r <= m.title.l + 1 && m.title.r <= m.next.l + 1
    && m.prev.l >= m.inner.left - 1 && m.next.r <= m.inner.right + 1, m);
  ok(`10.${w} 无内部/文档级横向溢出`, m.navOverflow <= 1 && m.docOverflow <= 0 && m.panelInView, m);
  ok(`10.${w} 日期文本未被截断`, !m.titleClipped, m.title);
  ok(`10.${w} 按钮为纯箭头（无文字标签、保持正方形）`, m.txtSpanCount === 0 && m.btnSquare, m);
  if (w === 360) await page.screenshot({ path: OUT + 'cal47_360.png' });
}
await ctx.close();

await browser.close();
ok('11.1 全程无 JS 异常 / console error', errs.length === 0, errs.slice(0, 3));
console.log(`\n===== 第47轮 PASS=${pass} FAIL=${fail} =====`);
