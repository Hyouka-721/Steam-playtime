/* verify118.mjs — 第 118 轮：时间轴「周合计」+ 热力图当日详情的平滑切换
   契约：
     ① 时间轴每一周的日期下方多一行「合计 Xh / Xmin」，X 与该周所有游戏分钟数之和同源
        （沿用时间轴角标 hoursShort 的格式），1440/1280/1088/900/390 都不溢出、不被裁；
     ② 点热力图某天 → 详情立即可见且头部日期/游戏列表/每行时长与那天的数据一致；
     ③ 换另一天时内容**同步**替换（不残留上一天），容器高度做 220ms 过渡、
        列表淡入上移，页面不滚动； prefers-reduced-motion 下直接显示终态。
   用法：node tests/index/verify118.mjs（需先起 8895 静态服务） */
import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const ROOT = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const LOCAL = 'http://127.0.0.1:8895/index.html';
let pass = 0, fail = 0;
const ok = (n, c, x) => {
  c ? (pass++, console.log('PASS ', n, x === undefined ? '' : '— ' + JSON.stringify(x)))
    : (fail++, console.log('FAIL ', n, '— ' + JSON.stringify(x)));
};

/* ---------- A 静态契约 ---------- */
const html = fs.readFileSync(ROOT + 'docs/index.html', 'utf8');
const js = fs.readFileSync(ROOT + 'docs/app.js', 'utf8');
const css = fs.readFileSync(ROOT + 'docs/style.css', 'utf8');
const vCss = (html.match(/style\.css\?v=(\d+)/) || [])[1];
const vApp = (html.match(/app\.js\?v=(\d+)/) || [])[1];
ok('A1 版本号已 bump（第 119 轮 CSS 144 / APP 129；第 118 轮文案改判跟随）',
  vCss === '156' && vApp === '133', { css: vCss, app: vApp });
/* 第 119 轮用户要求删「合计」字样，左列只留时长；口径仍是 hoursShort，故改判而非调阈值。 */
ok('A2 周时长走 hoursShort、与角标同口径（第119轮删「合计」前缀）',
  /class="tl-week-total">\$\{hoursShort\(weekTotal\)\}/.test(js) &&
  !/class="tl-week-total">合计/.test(js) &&
  /const weekTotal = list\.reduce\(/.test(js));
ok('A3 样式仍守日期行 14.5px（第119轮时长行改为与年份同款字体，具体由 verify119 守）',
  /\.tl-week\s*\{[^}]*font-size:\s*14\.5px/.test(css.replace(/\/\*[\s\S]*?\*\//g, '')));
ok('A4 详情切换有高度过渡 + 列表淡入，且尊重减少动效',
  /const oldH = box\.hidden \? 0 : box\.getBoundingClientRect\(\)\.height/.test(js) &&
  /box\.animate\(/.test(js) && /listEl\.animate\(/.test(js) &&
  /prefers-reduced-motion: reduce/.test(js) &&
  /\.hx-day\s*\{[^}]*overflow: hidden/.test(css));

/* ---------- 本地数据现算（不写死周数/时长） ---------- */
const meta = JSON.parse(fs.readFileSync(ROOT + 'docs/data/meta.json', 'utf8'));
const daily = (() => {
  const dir = ROOT + 'docs/data/daily';
  const days = {};
  for (const f of fs.readdirSync(dir).filter((x) => /^\d{4}-\d{2}\.json$/.test(x))) {
    Object.assign(days, JSON.parse(fs.readFileSync(dir + '/' + f, 'utf8')).days ?? {});
  }
  return days;
})();
const addDaysStr = (s, n) => {
  const d = new Date(`${s}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const weekStart = (ds) => addDaysStr(ds, -((new Date(`${ds}T12:00:00Z`).getUTCDay() + 6) % 7));
const hoursShort = (m) => {
  const n = Math.round(Number(m) || 0);
  if (n <= 0) return '0';
  if (n < 60) return `${n}min`;
  const h = Math.round((n / 60) * 10) / 10;
  return `${h % 1 === 0 ? Math.round(h) : h.toFixed(1)}h`;
};
const hm = (m) => {
  const n = Math.round(Number(m) || 0);
  if (n <= 0) return '0 min';
  if (n < 60) return `${n} min`;
  const h = Math.floor(n / 60), r = n % 60;
  return r === 0 ? `${h} h` : `${h} h ${r} min`;
};
const labelOf = (ds) =>
  `${ds.slice(0, 4)}年${Number(ds.slice(5, 7))}月${Number(ds.slice(8, 10))}日`;
const rangeOf = (ws) => {
  const e = addDaysStr(ws, 6);
  return `${Number(ws.slice(5, 7))}.${Number(ws.slice(8, 10))}-${Number(e.slice(5, 7))}.${Number(e.slice(8, 10))}`;
};
const weekAgg = new Map();
for (const [ds, day] of Object.entries(daily)) {
  const ws = weekStart(ds);
  if (!weekAgg.has(ws)) weekAgg.set(ws, { total: 0, games: new Map() });
  const w = weekAgg.get(ws);
  for (const g of day.games ?? []) {
    w.total += g.minutes ?? 0;
    w.games.set(g.appid, (w.games.get(g.appid) ?? 0) + (g.minutes ?? 0));
  }
}
for (const e of meta.timeline_extra ?? []) {
  const ws = weekStart(e.date);
  if (!weekAgg.has(ws)) weekAgg.set(ws, { total: 0, games: new Map() });
  const w = weekAgg.get(ws);
  w.total += e.minutes ?? 0;
  w.games.set(e.appid, (w.games.get(e.appid) ?? 0) + (e.minutes ?? 0));
}

/* ---------- B 运行时 ---------- */
const errs = [];
const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
await ctx.addInitScript(() => { try { localStorage.setItem('theme', 'cinema'); } catch (e) {} });
const page = await ctx.newPage();
page.on('pageerror', (e) => errs.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto(LOCAL + '?t=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('#lt-list .rank-item', { state: 'visible', timeout: 40000 });
await page.waitForTimeout(1200);

/* B1~B4 时间轴周合计 */
await page.click('#card-games');
await page.waitForSelector('#timeline .tl-item', { timeout: 20000 });
await page.waitForTimeout(500);
const tl = await page.evaluate(() => [...document.querySelectorAll('#timeline .tl-item')].map((it) => {
  const left = it.querySelector('.tl-left');
  const week = it.querySelector('.tl-week');
  const tot = it.querySelector('.tl-week-total');
  const range = new Range();
  if (tot && tot.firstChild) { range.selectNodeContents(tot); }
  return {
    week: week?.textContent?.trim() ?? '',
    total: tot?.textContent?.trim() ?? '',
    top: tot?.getBoundingClientRect().top ?? 0,
    weekBottom: week?.getBoundingClientRect().bottom ?? 0,
    textW: tot ? range.getBoundingClientRect().width : 0,
    leftW: left?.clientWidth ?? 0,
    badges: [...it.querySelectorAll('.tl-badge')].map((b) => b.textContent.trim()),
  };
}));
/* 第 119 轮用户删「合计」字样：判据去掉前缀，只守时长格式；理由写进 ok 文案。 */
ok('B1 每周都有周时长文字（第119轮删「合计」前缀，仅留时长）',
  tl.length > 0 && tl.every((x) => /^\d+(?:\.\d+)?(?:h|min)$/.test(x.total) && !/合计/.test(x.total)),
  { weeks: tl.length, first: tl[0]?.total });
const badTotal = [];
for (const x of tl) {
  const w = weekAgg.get(([...weekAgg.keys()].find((k) => rangeOf(k) === x.week)) ?? '');
  const want = w ? hoursShort(w.total) : null;
  if (want !== x.total) badTotal.push({ week: x.week, got: x.total, want });
}
ok('B2 周时长与每日数据现算全等（含补录周）', badTotal.length === 0, badTotal.slice(0, 3));
ok('B3 时长行在周日期下方、文字没越出左列',
  tl.every((x) => x.top >= x.weekBottom && x.textW <= x.leftW + 0.5),
  { overflow: tl.filter((x) => x.textW > x.leftW + 0.5).length });
for (const w of [1440, 1280, 1088, 900, 390]) {
  await page.setViewportSize({ width: w, height: 900 });
  await page.waitForTimeout(160);
  const ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(`B4 ${w}px 时间轴无横向溢出`, ov <= 0, { ov });
}

/* B5~B9 热力图详情切换动画 */
await page.setViewportSize({ width: 1440, height: 1000 });
await page.click('#card-recent');
await page.waitForSelector('#hx-grid .hx-c[role="button"]', { timeout: 20000 });
await page.waitForTimeout(600);
const dates = await page.evaluate(() =>
  [...document.querySelectorAll('#hx-grid .hx-c[role="button"]')].map((c) => c.dataset.date));
const counts = (ds) => (daily[ds]?.games ?? []).filter((g) => (g.minutes ?? 0) > 0).length;
let a = null, b = null;
for (const ds of dates) {
  const n = counts(ds);
  if (n > 0 && a === null) a = ds;
  if (n > 0 && n !== counts(a) && ds !== a) { b = ds; break; }
}
ok('B5 找得到两款数量不同的可点日期', !!a && !!b, { a, b, na: a && counts(a), nb: b && counts(b) });

if (a && b) {
  const cell = (ds) => page.locator(`#hx-grid .hx-c[data-date="${ds}"][role="button"]`);
  await cell(a).click();
  await page.waitForTimeout(300);
  const before = await page.evaluate(() => ({
    date: document.querySelector('#hx-day .hx-day-head b')?.textContent?.trim(),
    rows: [...document.querySelectorAll('#hx-day .hx-row')].map((r) => ({
      name: r.querySelector('.hx-nm')?.textContent?.trim(),
      time: r.querySelector('.hx-tt')?.textContent?.trim(),
    })),
    h: document.getElementById('hx-day').getBoundingClientRect().height,
    scrollY: window.scrollY,
  }));
  const wantRows = (ds) => (daily[ds]?.games ?? [])
    .filter((g) => (g.minutes ?? 0) > 0)
    .slice().sort((x, y) => (y.minutes ?? 0) - (x.minutes ?? 0))
    .map((g) => ({ name: g.name, time: hm(g.minutes ?? 0) }));
  ok('B6 点第一天：头部日期 + 每行游戏与时长都对',
    before.date === labelOf(a) &&
    JSON.stringify(before.rows.map((r) => r.time)) === JSON.stringify(wantRows(a).map((r) => r.time)),
    { date: before.date, rows: before.rows.length });

  await cell(b).click();
  /* 不等待：内容必须已经同步换成第二天，且动画正在跑 */
  const now = await page.evaluate(() => ({
    date: document.querySelector('#hx-day .hx-day-head b')?.textContent?.trim(),
    rows: [...document.querySelectorAll('#hx-day .hx-row')].map((r) => ({
      name: r.querySelector('.hx-nm')?.textContent?.trim(),
      time: r.querySelector('.hx-tt')?.textContent?.trim(),
    })),
    h: document.getElementById('hx-day').getBoundingClientRect().height,
    anim: document.getElementById('hx-day').getAnimations().length +
          (document.querySelector('#hx-day .hx-day-list')?.getAnimations().length ?? 0),
    scrollY: window.scrollY,
  }));
  ok('B7 换日期时详情内容同步更新（不残留上一天）',
    now.date === labelOf(b) && now.date !== before.date &&
    JSON.stringify(now.rows.map((r) => r.time)) === JSON.stringify(wantRows(b).map((r) => r.time)),
    { from: before.date, to: now.date, rows: now.rows.length });
  ok('B8 切换带过渡动画（容器高度 / 列表淡入）', now.anim >= 1, { anim: now.anim });
  ok('B9 切换瞬间容器高度从旧值起步、页面不滚',
    Math.abs(now.h - before.h) < 4 && now.scrollY === before.scrollY,
    { oldH: before.h, atSwitch: now.h, scrollBefore: before.scrollY, scrollNow: now.scrollY });

  await page.waitForTimeout(420);
  const after = await page.evaluate(() => ({
    h: document.getElementById('hx-day').getBoundingClientRect().height,
    anim: document.getElementById('hx-day').getAnimations().length +
          (document.querySelector('#hx-day .hx-day-list')?.getAnimations().length ?? 0),
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    rows: document.querySelectorAll('#hx-day .hx-row').length,
  }));
  await page.waitForTimeout(220);
  const settled = await page.evaluate(() => document.getElementById('hx-day').getBoundingClientRect().height);
  ok('B10 动画收尾后布局稳定、无横向溢出、行数不变',
    after.anim === 0 && after.overflow <= 0 && after.rows === wantRows(b).length &&
    Math.abs(settled - after.h) < 1,
    { ...after, settled });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  ok('B11 Esc 仍能收起详情', await page.evaluate(() => document.getElementById('hx-day').hidden));
}

/* C2 减少动效模式：不做动画，但内容照常同步替换 */
if (a && b) {
  const rmCtx = await browser.newContext({ viewport: { width: 1440, height: 1000 },
    serviceWorkers: 'block', reducedMotion: 'reduce' });
  const rm = await rmCtx.newPage();
  await rm.goto(LOCAL + '?t=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 });
  await rm.waitForSelector('#lt-list .rank-item', { state: 'visible', timeout: 40000 });
  await rm.click('#card-recent');
  await rm.waitForSelector('#hx-grid .hx-c[role="button"]', { timeout: 20000 });
  await rm.locator(`#hx-grid .hx-c[data-date="${a}"][role="button"]`).click();
  await rm.waitForTimeout(200);
  await rm.locator(`#hx-grid .hx-c[data-date="${b}"][role="button"]`).click();
  const rmState = await rm.evaluate(() => ({
    date: document.querySelector('#hx-day .hx-day-head b')?.textContent?.trim(),
    anim: document.getElementById('hx-day').getAnimations().length +
          (document.querySelector('#hx-day .hx-day-list')?.getAnimations().length ?? 0),
  }));
  ok('C2 减少动效下直接显示终态，内容仍同步更新', rmState.date === labelOf(b) && rmState.anim === 0, rmState);
  await rmCtx.close();
}

ok('C1 全程零 JS 异常', errs.length === 0, errs.slice(0, 2));
await browser.close();
console.log(`\n第 118 轮：${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
