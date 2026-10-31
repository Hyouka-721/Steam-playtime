/* verify48.mjs — 第 48 轮验证：浮层不改页面 · 第 87 轮改判：入口改为下钻热力图格子
 * 需求：
 *   a 点击下钻热力图的格子 → 弹出「当日明细」浮层（第 87 轮：原来的日历图标已删，
 *     浮层的一级月历也随之下线 —— 热力图本身就是月历）
 *   b 移除整页回看态：路由跳转 / 全局状态切换 / 页面级视图替换全部删除
 *   c 浮层以外的页面布局与状态完全不变（卡片数值、列表行数、滚动、主题、焦点）
 *   d 浮层能正常打开与关闭、月历正常渲染、日期点击后进入对应二级明细
 *   e 清理无效代码：review-bar / cal-mark / reviewing / state.review / *Full 等
 * 覆盖：
 *   0  静态指纹：三个文件均无 review 残留；版本 ?v=104
 *   1  浮层打开：一级月历渲染（标题 / 有记录格数 / 无选中）
 *   2  点击日期 → 二级明细（标题 / 摘要 / 行数 / 图标）
 *   3  ★ 浮层外零变化：c-recent 仍是 14 天窗口（不是当天总时长）
 *   4  ★ 步进日期时浮层外仍然零变化
 *   5  ★ 关闭浮层后页面回到原状（焦点、滚动、卡片）
 *   6  键盘：二级 ←/→ 步进日，Esc 逐级回退，点空白关闭
 *   7  空态 / 边界禁用（沿用 47 轮口径）
 *   8  响应式 1440/1024/768/430/390/360
 *   9  全程无 JS 异常
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
const settle = async () => {
  await page.waitForFunction(
    () => { const t = document.querySelector('.toast'); return !t || Number(getComputedStyle(t).opacity) < 0.01; },
    null, { timeout: 3000 },
  ).catch(() => {});
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
};
const waitDay = async () => {
  await page.waitForFunction(
    () => {
      const m = document.getElementById('cal-mask');
      return !!m && m.hidden && !document.getElementById('cal-overlay').hidden;
    },
    null, { timeout: 8000 },
  ).catch(() => {});
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
};
/** 第 87 轮：入口 = 「游戏时长」下钻里的月历热力图格子。
    openDrill() 负责把「当前视图 / 下钻是否已打开」这两种情况都处理掉。 */
const openDrill = async () => {
  const drilled = await page.evaluate(() => !document.getElementById('lt-detail').hidden);
  if (drilled) return;
  const view = await page.evaluate(() => document.querySelector('.view.active')?.id);
  if (view !== 'view-lifetime') {
    await page.click('#card-lifetime');
    await page.waitForTimeout(450);
  }
  await page.click('#card-lifetime');
  await page.waitForSelector('#lt-detail:not([hidden])', { timeout: 10000 });
  await page.waitForTimeout(300);
};
const openCal = async (date) => {
  await openDrill();
  const d = date || await page.evaluate(() => {
    const c = [...document.querySelectorAll('#heat-drill .hc.is-live')].reverse().find((x) => x.querySelector('i'));
    return c.dataset.date;
  });
  await page.click(`#heat-drill .hc[data-date="${d}"]`);
  await page.waitForTimeout(350);
  return d;
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
const wdName = (ds) => {
  const [y, m, d] = ds.split('-').map(Number);
  return '周' + '日一二三四五六'[new Date(y, m - 1, d).getDay()];
};
/** 浮层以外的整页快照：任何一项变化都说明"整页被切换了" */
const pageSnapshot = () => page.evaluate(() => {
  const txt = (id) => document.getElementById(id)?.textContent ?? null;
  return {
    cards: {
      lifetime: txt('c-lifetime'), recent: txt('c-recent'), ach: txt('c-ach'),
      data: txt('c-data'),
    },
    recentRows: document.querySelectorAll('#recent-list .rank-item').length,
    recentFirstLast: document.querySelector('#recent-list .rank-item .rank-last')?.textContent ?? null,
    ltRows: document.querySelectorAll('#lt-list .rank-item').length,
    achGames: document.querySelectorAll('#ach-list .rank-item, #view-ach .rank-item').length,
    view: document.querySelector('.view.active')?.id ?? null,
    scrollY: Math.round(window.scrollY),
    theme: document.documentElement.dataset.theme ?? null,
    bodyClass: document.body.className,
    toast: !!document.querySelector('.toast'),
    iconCls: document.querySelector('.cal-icon-btn')?.className ?? null,
    iconCount: document.querySelectorAll('.cal-icon-btn, [data-cal-toggle]').length,
    lastChildElems: [...document.querySelectorAll('#recent-list .rank-last, #lt-list .rank-last')]
      .reduce((a, el) => a + el.children.length, 0),
    lastHasSvg: document.querySelectorAll('#recent-list .rank-last svg, #lt-list .rank-last svg').length,
    reviewBarExists: !!document.getElementById('review-bar'),
    calMarkCount: document.querySelectorAll('.cal-mark').length,
    reviewingCount: document.querySelectorAll('.cal-icon-btn.reviewing').length,
    // 浮层「挤没挤动布局」的锚点：优先量下钻面板（第 87 轮入口在那里），
    // 退化到最近 / 累计榜的首行
    anchorRect: (() => {
      const el = document.querySelector('#lt-detail:not([hidden]) .panel')
        || document.querySelector('#recent-list .rank-item')
        || document.querySelector('#lt-list .rank-item');
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) };
    })(),
  };
});
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

// ================= 0. 静态指纹（服务端实际发出的字节） =================
const files = await Promise.all([
  fetch(URL.replace('index.html', 'app.js')).then((r) => r.text()),
  fetch(URL.replace('index.html', 'index.html')).then((r) => r.text()),
  fetch(URL.replace('index.html', 'style.css')).then((r) => r.text()),
]);
const [srcApp, srcHtml, srcCss] = files;
const BANNED = ['review', 'reviewing', 'cal-mark', 'metaFull', 'achFull', 'allDatesFull',
  'buildSnapshot', 'buildAchSnapshot', 'renderAll', 'renderReviewBar', 'applyReview', 'exitReview', 'btn-review',
  '回看状态条', '数据回看', '正在回看', '回溯进行中'];
for (const [name, txt] of [['app.js', srcApp], ['index.html', srcHtml], ['style.css', srcCss]]) {
  const hits = BANNED.filter((k) => txt.toLowerCase().includes(k.toLowerCase()));
  ok(`0.1 ${name} 无回看态残留关键词`, hits.length === 0, hits);
}
ok('0.2 index.html 引用 app\.js\?v=105', srcHtml.includes('app\.js\?v=105'), (srcHtml.match(/app\.js\?v=\d+/) || [])[0]);
// 第 87 轮：一级月历层已删 → backToCalMonth / renderCalGrid / stepMonth 都不该再存在，
// 而「开/关/渲染/步进当日明细」这一组必须还在。
ok('0.3 app.js 保留当日明细浮层核心函数，且已无一级月历函数',
  ['openDayDetail(', 'openCalDay(', 'closeCal(', 'renderCalDay(', 'stepCalDay(', 'markHeatSel('].every((k) => srcApp.includes(k))
  && !/function\s+(backToCalMonth|renderCalGrid|stepMonth|resetCalLevel|focusCalDay)\s*\(/.test(srcApp));
ok('0.4 app.js 已无 buildSnapshot / applyReview / exitReview / renderAll 定义',
  !/function\s+(buildSnapshot|applyReview|exitReview|renderAll|renderReviewBar|buildAchSnapshot)\s*\(/.test(srcApp));

// ================= 1~5. 浏览器内行为 =================
await freshPage();
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.click('#card-recent'); // 默认视图是累计榜，日历入口在「最近游玩」里
await page.waitForSelector('#recent-list .rank-item', { state: 'visible', timeout: 30000 });
await page.waitForTimeout(1200);

let before = await pageSnapshot();
ok('1.1 页面初始没有 #review-bar 元素（整页回看入口已删）', !before.reviewBarExists, before.reviewBarExists);
ok('1.2 页面初始没有 .cal-mark / .reviewing（回看标识已删）', before.calMarkCount === 0 && before.reviewingCount === 0);
// 第 87 轮（用户要求）：日历图标整体删除，功能并入下钻热力图
ok('1.3 日历图标已彻底删除（.cal-icon-btn / [data-cal-toggle] 计数均为 0）',
  before.iconCls === null && before.iconCount === 0, { cls: before.iconCls, n: before.iconCount });
ok('1.4 「最近游玩」首行 .rank-last 里不再挂着任何元素（没留空壳）',
  before.lastChildElems === 0 && before.lastHasSvg === 0, { kids: before.lastChildElems, svg: before.lastHasSvg });

// 数据源：当月记录日 + last_snapshot_date + 14 天窗口（独立预言）
const ds = await page.evaluate(async () => {
  const t = document.getElementById('cal-title');
  return { calTitleNow: t ? t.textContent : null };
});
const data = await page.evaluate(async () => {
  const [daily, meta, boot] = await Promise.all([
    fetch('data/daily/2026-10.json', { cache: 'reload' }).then((r) => r.json()),
    fetch('data/meta.json', { cache: 'reload' }).then((r) => r.json()),
    fetch('index.html', { cache: 'reload' }).then((r) => r.text()),
  ]);
  const days = daily.days || {};
  const dates = Object.keys(days).sort();
  // 14 天窗口：与 app 的 lastNDaysTotal(14) 同一口径（以 meta.last_snapshot_date 为终点）
  const end = meta.last_snapshot_date;
  const endD = new Date(end + 'T12:00:00Z');
  const win = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(endD.getTime() - i * 86400000).toISOString().slice(0, 10);
    win.push(d);
  }
  const winTotal = win.reduce((a, d) => a + (days[d]?.total_minutes ?? 0), 0);
  return {
    dates, totals: Object.fromEntries(dates.map((d) => [d, days[d].total_minutes ?? 0])),
    counts: Object.fromEntries(dates.map((d) => [d, (days[d].games ?? []).length])),
    max: end, winTotal, hasBoot: boot.includes('__BOOT'),
  };
});
const DATES = data.dates, MIN = DATES[0], MAX = data.max;
// 2026-10-22：CI 快照可能给出 total_minutes=0 的「有采集无游玩」日（如 2026-10-21），
// 而月历 hasPlay = total_minutes > 0 → 这类日渲染成 .off，不计入「有记录」。
// 故 2.4 / 2.7 的口径改成 PLAY_DATES（与 app 的 hasPlay 完全同口径）。
const PLAY_DATES = DATES.filter((d) => (data.totals[d] ?? 0) > 0);
ok('1.5 数据源可用：当月记录日 + 14 天窗口',
  DATES.length > 0 && !!MAX && data.winTotal > 0,
  { month: '2026-10', n: DATES.length, play: PLAY_DATES.length, MIN, MAX, winTotal: data.winTotal });
ok('1.6 基线：「最近游玩」卡当前就是 14 天窗口值（未经任何回看污染）',
  before.cards.recent === hm(data.winTotal), { got: before.cards.recent, want: hm(data.winTotal) });

// ---------- 2. 打开浮层：直接是「某一天」的明细（一级月历已随图标一起下线） ----------
const TARGET0 = PLAY_DATES[PLAY_DATES.length - 1]; // 先看最新一个「有游玩」的日子
// 第 87 轮：入口在下钻里 → 「浮层外零变化」的基线改成「进下钻之后、开浮层之前」的整页快照
// （原来基线拍在「最近游玩」页，入口搬走后那页本来就不在了，比它没有意义）
await openDrill();
before = await pageSnapshot();
await openCal(TARGET0);
const lvl1 = await page.evaluate(() => ({
  overlayHidden: document.getElementById('cal-overlay').hidden,
  monthNodeGone: !document.getElementById('cal-page-month') && !document.getElementById('cal-grid') && !document.getElementById('cal-back'),
  title: document.getElementById('cal-day-title').textContent,
  rows: document.querySelectorAll('#cal-day-games .cal-game').length,
  panelRole: document.getElementById('cal-panel').getAttribute('role'),
  labelledBy: document.getElementById('cal-panel').getAttribute('aria-labelledby'),
  focus: document.activeElement?.id ?? null,
  heatSel: document.querySelector('#heat-drill .hc.is-sel')?.dataset.date ?? null,
}));
ok('2.1 点热力图格子后浮层打开（overlay 可见）', !lvl1.overlayHidden);
ok('2.2 浮层只剩一层：一级月历的 DOM 全部不存在（cal-page-month / cal-grid / cal-back）',
  lvl1.monthNodeGone, lvl1.monthNodeGone);
ok('2.3 打开即显示被点那一天的标题', lvl1.title === `${Number(TARGET0.slice(5, 7))} 月 ${Number(TARGET0.slice(8, 10))} 日 ${wdName(TARGET0)}`,
  { got: lvl1.title, target: TARGET0 });
ok('2.4 明细列表行数与当天游戏款数一致', lvl1.rows === data.counts[TARGET0], { got: lvl1.rows, want: data.counts[TARGET0] });
ok('2.5 打开后焦点落在关闭按钮上（键盘可直接 Esc / Tab）', lvl1.focus === 'cal-day-close', lvl1.focus);
ok('2.6 被点的格子在热力图里标成选中态（关掉后还能认出刚才看的哪天）', lvl1.heatSel === TARGET0, lvl1.heatSel);
ok('2.7 面板是 aria-modal 对话框，且由日期标题命名',
  lvl1.panelRole === 'dialog' && lvl1.labelledBy === 'cal-day-title', lvl1);

// ---------- 3. 点击某一天 → 二级明细 ----------
const target = PLAY_DATES.includes('2026-10-16') ? '2026-10-16' : PLAY_DATES[Math.floor(PLAY_DATES.length / 2)];
await page.click('#cal-day-close'); // 关掉 §2 那一次，再从格子里重新点进来
await page.waitForTimeout(300);
await openCal(target);
await waitDay();
const lvl2 = await page.evaluate(() => ({
  dayVisible: !document.getElementById('cal-overlay').hidden,
  title: document.getElementById('cal-day-title').textContent,
  total: document.getElementById('cal-day-total').textContent,
  note: document.getElementById('cal-day-note').textContent,
  status: document.getElementById('cal-day-status').textContent,
  rows: document.querySelectorAll('#cal-day-games .cal-game').length,
  names: [...document.querySelectorAll('#cal-day-games .cal-game-name')].map((e) => e.textContent),
  mins: [...document.querySelectorAll('#cal-day-games .cal-game-min')].map((e) => e.textContent),
  firstIcon: (() => {
    const i = document.querySelector('#cal-day-games .rank-capsule');
    return i ? (i.getAttribute('src') || '').slice(0, 60) : null;
  })(),
}));
ok('3.1 点格子后显示该日明细', lvl2.dayVisible, lvl2);
ok('3.2 二级标题 = 该日 + 星期几（独立星期预言）',
  lvl2.title === `${Number(target.slice(5, 7))} 月 ${Number(target.slice(8, 10))} 日 ${wdName(target)}`,
  { got: lvl2.title, want: wdName(target) });
ok('3.3 二级摘要 = 当天总时长', lvl2.total === hmText(data.totals[target]), { got: lvl2.total, want: hmText(data.totals[target]) });
ok('3.4 二级条数说明 = 当天游戏款数', lvl2.note.includes(`共 ${data.counts[target]} 款游戏`), lvl2.note);
ok('3.5 二级列表行数 = 当天游戏款数', lvl2.rows === data.counts[target], { got: lvl2.rows, want: data.counts[target] });
ok('3.6 二级列表按时长降序', (() => {
  const nums = lvl2.mins.map((m) => {
    const n = /(\d+) 小时/.exec(m); const r = /(\d+) 分钟/.exec(m);
    return (n ? Number(n[1]) * 60 : 0) + (r ? Number(r[1]) : 0);
  });
  return nums.every((v, i) => i === 0 || nums[i - 1] >= v);
})(), lvl2.mins);
ok('3.7 二级图标走 Steam CDN data URI 占位（不是空 src）', !!lvl2.firstIcon && !lvl2.firstIcon.endsWith('='), lvl2.firstIcon);
ok('3.8 二级状态行是排序说明（不是回看文案）', lvl2.status === '按当天时长从高到低', lvl2.status);

// ---------- 4. ★ 浮层外零变化 ----------
const during = await pageSnapshot();
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const cardDiff = {};
for (const k of Object.keys(before.cards)) {
  if (before.cards[k] !== during.cards[k]) cardDiff[k] = [before.cards[k], during.cards[k]];
}
ok('4.1 ★ 五张统计卡数值完全不变（没有整页重算）', Object.keys(cardDiff).length === 0, cardDiff);
ok('4.2 ★ 「最近游玩」卡仍是 14 天窗口，不是选中日的总时长',
  during.cards.recent === hm(data.winTotal) && during.cards.recent !== hm(data.totals[target]),
  { got: during.cards.recent, want14: hm(data.winTotal), dayTotal: hm(data.totals[target]) });
ok('4.3 ★ 累计游戏时长卡仍是全量终身值', during.cards.lifetime === before.cards.lifetime, during.cards.lifetime);
ok('4.4 ★ 最近游玩列表行数 / 首行日期不变',
  during.recentRows === before.recentRows && during.recentFirstLast === before.recentFirstLast,
  { rows: during.recentRows, first: during.recentFirstLast });
ok('4.5 ★ 累计榜行数不变', during.ltRows === before.ltRows, during.ltRows);
ok('4.6 ★ 当前激活视图不变', during.view === before.view, during.view);
ok('4.7 ★ 页面滚动位置不变', during.scrollY === before.scrollY, during.scrollY);
ok('4.8 ★ 主题 / body class 不变', during.theme === before.theme && during.bodyClass === before.bodyClass, during);
ok('4.9 ★ 没有弹出 toast（没有"已按该日重建"之类提示）', !during.toast);
ok('4.10 ★ 下钻面板的 DOM 几何不变（浮层没挤动布局）',
  same(during.anchorRect, before.anchorRect), { before: before.anchorRect, during: during.anchorRect });
ok('4.11 ★ 图标仍未获得 reviewing 类 / cal-mark', during.reviewingCount === 0 && during.calMarkCount === 0);

// ---------- 5. 步进日期时浮层外仍零变化 ----------
const pair = (() => {
  for (let i = 1; i < DATES.length; i++) {
    const a = new Date(DATES[i - 1] + 'T12:00:00Z'), b = new Date(DATES[i] + 'T12:00:00Z');
    if ((b - a) / 86400000 === 1) return [DATES[i - 1], DATES[i]];
  }
  return null;
})();
if (pair) {
  const [d1, d2] = pair;
  await page.click('#cal-day-prev'); await waitDay(); // 从 target 往后退一步
  const st1 = await pageSnapshot();
  ok('5.1 ★ 步进一天后统计卡仍不变', JSON.stringify(st1.cards) === JSON.stringify(before.cards), st1.cards);
  ok('5.2 ★ 步进一天后列表行数仍不变', st1.recentRows === before.recentRows && st1.ltRows === before.ltRows, st1);
  ok('5.3 ★ 步进一天后滚动位置仍不变', st1.scrollY === before.scrollY, st1.scrollY);
} else {
  skip('5.1~5.3 步进时浮层外零变化', '当月没有相邻两天的记录');
}

// ---------- 6. 关闭浮层后回到原状 ----------
const focusBeforeClose = await page.evaluate(() => document.activeElement?.id ?? null);
await page.click('#cal-day-close');
await page.waitForTimeout(400);
const afterClose = await pageSnapshot();
const closeState = await page.evaluate(() => ({
  overlayHidden: document.getElementById('cal-overlay').hidden,
  busy: (() => { const m = document.getElementById('cal-mask'); return !m || m.hidden; })(),
  focus: document.activeElement?.dataset?.date ?? document.activeElement?.id ?? null,
  heatSel: document.querySelector('#heat-drill .hc.is-sel')?.dataset.date ?? null,
}));
ok('6.1 × 关闭浮层（且遮罩复位）', closeState.overlayHidden && closeState.busy, closeState);
ok('6.2 关闭后热力图仍标着刚才看的那天（.is-sel 保留，便于接着看相邻日）',
  !!closeState.heatSel, closeState);
ok('6.3 关闭后焦点还给刚才点的那个格子（键盘用户回到原位）',
  /^\d{4}-\d{2}-\d{2}$/.test(String(closeState.focus)), { focusBeforeClose, focus: closeState.focus });
ok('6.4 ★ 关闭后整页状态与打开前完全一致', same(afterClose, before), afterClose);
await page.screenshot({ path: OUT + 'cal48_after_close.png' });

// ---------- 7. 重新打开 → 键盘 / Esc / 点空白 ----------
await openCal(target);
await waitDay();
const kbTitle0 = (await readDay()).title;
await page.keyboard.press('ArrowRight'); await waitDay();
const kbRight = (await readDay()).title;
await page.keyboard.press('ArrowLeft'); await waitDay();
const kbLeft = (await readDay()).title;
const nxt = new Date(new Date(target + 'T12:00:00Z').getTime() + 86400000).toISOString().slice(0, 10);
ok('7.1 浮层内 → 步进后一天（键盘）',
  kbRight === `${Number(nxt.slice(5, 7))} 月 ${Number(nxt.slice(8, 10))} 日 ${wdName(nxt)}`, { got: kbRight, want: wdName(nxt) });
ok('7.2 浮层内 ← 回到原日期', kbLeft === kbTitle0, { got: kbLeft, want: kbTitle0 });

// 第 87 轮：只有一层了 → Esc 直接关闭（原来要先退回一级月历）
await page.keyboard.press('Escape'); await page.waitForTimeout(350);
const esc1 = await page.evaluate(() => document.getElementById('cal-overlay').hidden);
ok('7.3 浮层里按 Esc 直接关闭（不再有"先退回月历"这一步）', esc1, esc1);
const selAfter = await page.evaluate(() => document.querySelector('#heat-drill .hc.is-sel')?.dataset.date ?? null);
ok('7.4 关闭后热力图选中态跟着键盘步进走（停在哪天就标哪天）', !!selAfter, { selAfter });

// 点空白处关闭
await openCal(target);
await page.mouse.click(12, 12);
await page.waitForTimeout(350);
const backdropClosed = await page.evaluate(() => document.getElementById('cal-overlay').hidden);
ok('7.5 点击浮层空白处关闭', backdropClosed, backdropClosed);
const afterBackdrop = await pageSnapshot();
ok('7.6 ★ 点空白关闭后整页状态仍与初始一致', same(afterBackdrop, before), afterBackdrop);

// ---------- 8. 空态与边界（47 轮口径复用） ----------
let gap = null;
for (let i = 1; i < DATES.length; i++) {
  const a = new Date(DATES[i - 1] + 'T12:00:00Z'), b = new Date(DATES[i] + 'T12:00:00Z');
  if ((b - a) / 86400000 === 2) { gap = new Date(a.getTime() + 86400000).toISOString().slice(0, 10); break; }
}
if (gap) {
  const after = PLAY_DATES.find((d) => d > gap);
  await openCal(after); await waitDay();
  await settle(); await page.click('#cal-day-prev'); await waitDay();
  const g = await readDay();
  const gPage = await pageSnapshot();
  ok('8.1 无记录日显示空态文案', g.empty === '当天没有游玩记录', g.empty);
  ok('8.2 空态摘要为 0 分钟（不是「不足 1 分钟」）', g.total === '0 分钟', g.total);
  ok('8.3 空态状态行说明原因', g.status === '该日没有游玩记录', g.status);
  ok('8.4 ★ 落到无记录日时整页依旧不变', JSON.stringify(gPage.cards) === JSON.stringify(before.cards), gPage.cards);
} else {
  skip('8.1~8.4 空态', '当月没有采集缺口');
}
// 边界禁用
await page.click('#cal-day-close'); await page.waitForTimeout(300);
await openCal(MIN); await waitDay();
const atMin = await readDay();
ok('8.5 最早一天：前一天禁用 + 状态行说明', atMin.prevDisabled && atMin.status === '已是最早一天的记录', atMin);
// 最新一端：热力图只点有游玩的最后一天，若早于 last_snapshot_date 再步进到真正的最新一天
await page.click('#cal-day-close'); await page.waitForTimeout(300);
await openCal(PLAY_DATES[PLAY_DATES.length - 1]); await waitDay();
if (PLAY_DATES[PLAY_DATES.length - 1] !== MAX) { await settle(); await page.click('#cal-day-next'); await waitDay(); }
const atMax = await readDay();
const maxHasPlay = (data.totals[MAX] ?? 0) > 0;
ok('8.6 最新一天：后一天禁用 + 状态行说明（0 分钟日优先「该日没有游玩记录」）',
  atMax.nextDisabled && atMax.status === (maxHasPlay ? '已是最新一天的记录' : '该日没有游玩记录'),
  { got: atMax.status, nextDisabled: atMax.nextDisabled, MAX, maxHasPlay });
await page.click('#cal-day-close'); await page.waitForTimeout(300);

// ---------- 9. 响应式 ----------
await freshPage(1440, 950, 1);
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.click('#card-recent');
await page.waitForSelector('#recent-list .rank-item', { state: 'visible', timeout: 30000 });
await page.waitForTimeout(900);
await openDrill();
await openCal();
await waitDay();
for (const w of [1440, 1024, 768, 430, 390, 360]) {
  await page.setViewportSize({ width: w, height: 900 });
  await page.waitForTimeout(400);
  const m = await page.evaluate(() => {
    const panel = document.getElementById('cal-panel');
    const cs = getComputedStyle(panel);
    const pr = panel.getBoundingClientRect();
    const inner = { left: pr.left + parseFloat(cs.paddingLeft), right: pr.right - parseFloat(cs.paddingRight) };
    const r = (sel) => { const b = document.querySelector(sel).getBoundingClientRect(); return { l: Math.round(b.left), r: Math.round(b.right) }; };
    return {
      inner,
      prev: r('#cal-day-prev'), title: r('#cal-day-title'), next: r('#cal-day-next'),
      navOverflow: (() => { const n = document.querySelector('.cal-day-nav'); return n.scrollWidth - n.clientWidth; })(),
      docOverflow: document.documentElement.scrollWidth - window.innerWidth,
      panelInView: pr.right <= window.innerWidth + 1 && pr.left >= -1,
      titleText: document.getElementById('cal-day-title').textContent,
      titleClipped: (() => { const t = document.getElementById('cal-day-title'); return t.scrollWidth > t.clientWidth + 1; })(),
    };
  });
  ok(`9.${w} 按钮仍夹住日期文本且在面板内`,
    m.prev.r <= m.title.l + 1 && m.title.r <= m.next.l + 1
    && m.prev.l >= m.inner.left - 1 && m.next.r <= m.inner.right + 1, m);
  ok(`9.${w} 无内部/文档级横向溢出`, m.navOverflow <= 1 && m.docOverflow <= 0 && m.panelInView, m);
  ok(`9.${w} 日期文本未被截断`, !m.titleClipped, m.titleText);
  if (w === 360) await page.screenshot({ path: OUT + 'cal48_360.png' });
}
await ctx.close();

await browser.close();
ok('10.1 全程无 JS 异常 / console error', errs.length === 0, errs.slice(0, 3));
console.log(`\n===== 第48轮 PASS=${pass} FAIL=${fail} =====`);
if (fail) process.exitCode = 1;
