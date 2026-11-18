/* online118.mjs — 第 118 轮上线复验：时间轴周合计 + 热力图详情平滑切换
 *
 * 口径：
 *   ① 指纹 6：线上 index.html 引用 v143/v128；html/css/app 字节（EOL 归一）md5 与本地全等；
 *      线上 JS/CSS 含周合计与详情动画的代码；
 *   ② 时间轴 3：每周 `.tl-week-total` 都在、文案与本地 daily（含 timeline_extra）现算全等、
 *      在日期下方且不越出左列；1440/390 零溢出；
 *   ③ 热力图 5：点第一天头部/每行时长对；换第二天内容同步替换、动画在跑、高度从旧值起步、
 *      scrollY 不变、动画收尾稳定；减少动效直接显示终态；零 JS 异常。
 *
 * ⚠️ 全程只读，不产生任何 PUT；线上字节一律页内 fetch 回传，--no-proxy-server。
 * 用法：node tests/online/online118.mjs */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import crypto from 'node:crypto';

const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const SITE = process.env.ONLINE_SITE || 'https://hyouka-721.github.io/Steam-playtime/';
const ROOT = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const LOCAL = 'http://127.0.0.1:8895/index.html';
let pass = 0, fail = 0;
const ok = (n, c, x) => {
  c ? (pass++, console.log('PASS ', n, x === undefined ? '' : '— ' + JSON.stringify(x)))
    : (fail++, console.log('FAIL ', n, '— ' + JSON.stringify(x)));
};
const md5 = (s) => crypto.createHash('md5').update(Buffer.from(String(s).replace(/\r\n/g, '\n'), 'utf8')).digest('hex');

/* ---------- A 线上指纹 ---------- */
const htmlLocal = fs.readFileSync(ROOT + 'docs/index.html', 'utf8');
const cssLocal = fs.readFileSync(ROOT + 'docs/style.css', 'utf8');
const appLocal = fs.readFileSync(ROOT + 'docs/app.js', 'utf8');
const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
await ctx.addInitScript(() => { try { localStorage.setItem('theme', 'cinema'); } catch (e) {} });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto(SITE, { waitUntil: 'domcontentloaded', timeout: 60000 });

const fp = await page.evaluate(async ({ site }) => {
  const g = async (u) => {
    const r = await fetch(site + u, { cache: 'reload' });
    return { s: r.status, t: await r.text() };
  };
  const cb = Date.now();
  const [h, c, a] = await Promise.all([
    g('index.html?cb=' + cb), g('style.css?v=143&cb=' + cb), g('app.js?v=128&cb=' + cb),
  ]);
  return {
    html: h.t, css: c.t, app: a.t,
    statuses: [h.s, c.s, a.s],
    cssTag: (h.t.match(/style\.css\?v=\d+/) || [])[0],
    appTag: (h.t.match(/app\.js\?v=\d+/) || [])[0],
  };
}, { site: SITE });
ok('A1 线上 index.html 引用 style.css?v=143 / app.js?v=128',
  fp.cssTag === 'style.css?v=143' && fp.appTag === 'app.js?v=128', { css: fp.cssTag, app: fp.appTag });
ok('A2 线上 html/css/app 字节 md5 与本地全等',
  fp.statuses.every((s) => s === 200) &&
  md5(fp.html) === md5(htmlLocal) && md5(fp.css) === md5(cssLocal) && md5(fp.app) === md5(appLocal),
  { html: md5(fp.html).slice(0, 12), css: md5(fp.css).slice(0, 12), app: md5(fp.app).slice(0, 12) });
ok('A3 线上 JS/CSS 带本周合计与详情动画代码',
  /class="tl-week-total"/.test(fp.app) && /box\.animate\(/.test(fp.app) && /listEl\.animate\(/.test(fp.app) &&
  /\.tl-week-total\s*\{/.test(fp.css) && /\.hx-day\s*\{[^}]*overflow:\s*hidden/.test(fp.css));

/* ---------- 本地数据现算 ---------- */
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
const labelOf = (ds) => `${ds.slice(0, 4)}年${Number(ds.slice(5, 7))}月${Number(ds.slice(8, 10))}日`;
const rangeOf = (ws) => {
  const e = addDaysStr(ws, 6);
  return `${Number(ws.slice(5, 7))}.${Number(ws.slice(8, 10))}-${Number(e.slice(5, 7))}.${Number(e.slice(8, 10))}`;
};
const weekAgg = new Map();
for (const [ds, day] of Object.entries(daily)) {
  const ws = weekStart(ds);
  if (!weekAgg.has(ws)) weekAgg.set(ws, 0);
  for (const g of day.games ?? []) weekAgg.set(ws, weekAgg.get(ws) + (g.minutes ?? 0));
}
for (const e of meta.timeline_extra ?? []) {
  const ws = weekStart(e.date);
  weekAgg.set(ws, (weekAgg.get(ws) ?? 0) + (e.minutes ?? 0));
}
const wantRows = (ds) => (daily[ds]?.games ?? [])
  .filter((g) => (g.minutes ?? 0) > 0)
  .slice().sort((x, y) => (y.minutes ?? 0) - (x.minutes ?? 0))
  .map((g) => hm(g.minutes ?? 0));

/* ---------- B 时间轴 ---------- */
await page.waitForSelector('#lt-list .rank-item', { state: 'visible', timeout: 40000 });
await page.waitForTimeout(1200);
await page.click('#card-games');
await page.waitForSelector('#timeline .tl-item', { timeout: 20000 });
await page.waitForTimeout(500);
const tl = await page.evaluate(() => [...document.querySelectorAll('#timeline .tl-item')].map((it) => {
  const left = it.querySelector('.tl-left');
  const week = it.querySelector('.tl-week');
  const tot = it.querySelector('.tl-week-total');
  const range = new Range();
  if (tot && tot.firstChild) range.selectNodeContents(tot);
  return {
    week: week?.textContent?.trim() ?? '',
    total: tot?.textContent?.trim() ?? '',
    top: tot?.getBoundingClientRect().top ?? 0,
    weekBottom: week?.getBoundingClientRect().bottom ?? 0,
    textW: tot ? range.getBoundingClientRect().width : 0,
    leftW: left?.clientWidth ?? 0,
  };
}));
ok('B1 线上每周都有周合计文字且格式正确',
  tl.length > 0 && tl.every((x) => /^合计 \d+(?:\.\d+)?(?:h|min)$/.test(x.total)), { weeks: tl.length });
const bad = [];
for (const x of tl) {
  const ws = [...weekAgg.keys()].find((k) => rangeOf(k) === x.week);
  const want = ws === undefined ? null : `合计 ${hoursShort(weekAgg.get(ws))}`;
  if (want !== x.total) bad.push({ week: x.week, got: x.total, want });
}
ok('B2 线上周合计与本地 daily 现算全等（含补录周）', bad.length === 0, bad.slice(0, 3));
ok('B3 合计行在日期下方、不越出左列',
  tl.every((x) => x.top >= x.weekBottom && x.textW <= x.leftW + 0.5));
for (const w of [1440, 390]) {
  await page.setViewportSize({ width: w, height: 900 });
  await page.waitForTimeout(180);
  const ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(`B4 ${w}px 线上时间轴无横向溢出`, ov <= 0, { ov });
}

/* ---------- C 热力图详情 ---------- */
await page.setViewportSize({ width: 1440, height: 1000 });
await page.click('#card-recent');
await page.waitForSelector('#hx-grid .hx-c[role="button"]', { timeout: 20000 });
await page.waitForTimeout(600);
const dates = await page.evaluate(() =>
  [...document.querySelectorAll('#hx-grid .hx-c[role="button"]')].map((c) => c.dataset.date));
const countOf = (ds) => (daily[ds]?.games ?? []).filter((g) => (g.minutes ?? 0) > 0).length;
let a = null, b = null;
for (const ds of dates) {
  const n = countOf(ds);
  if (n > 0 && a === null) a = ds;
  if (n > 0 && n !== countOf(a) && ds !== a) { b = ds; break; }
}
ok('C1 线上找得到两款数量不同的可点日期', !!a && !!b, { a, b });
if (a && b) {
  const cell = (ds) => page.locator(`#hx-grid .hx-c[data-date="${ds}"][role="button"]`);
  await cell(a).click();
  await page.waitForTimeout(320);
  const before = await page.evaluate(() => ({
    date: document.querySelector('#hx-day .hx-day-head b')?.textContent?.trim(),
    times: [...document.querySelectorAll('#hx-day .hx-tt')].map((e) => e.textContent.trim()),
    h: document.getElementById('hx-day').getBoundingClientRect().height,
    scrollY: window.scrollY,
  }));
  ok('C2 线上点第一天：头部日期与每行时长都对',
    before.date === labelOf(a) && JSON.stringify(before.times) === JSON.stringify(wantRows(a)),
    { date: before.date, times: before.times });

  await cell(b).click();
  const now = await page.evaluate(() => ({
    date: document.querySelector('#hx-day .hx-day-head b')?.textContent?.trim(),
    times: [...document.querySelectorAll('#hx-day .hx-tt')].map((e) => e.textContent.trim()),
    h: document.getElementById('hx-day').getBoundingClientRect().height,
    anim: document.getElementById('hx-day').getAnimations().length +
          (document.querySelector('#hx-day .hx-day-list')?.getAnimations().length ?? 0),
    scrollY: window.scrollY,
  }));
  ok('C3 线上换日期：详情内容同步替换、不残留上一天',
    now.date === labelOf(b) && now.date !== before.date &&
    JSON.stringify(now.times) === JSON.stringify(wantRows(b)),
    { from: before.date, to: now.date, times: now.times });
  ok('C4 线上切换带过渡动画、高度从旧值起步、页面不滚',
    now.anim >= 1 && Math.abs(now.h - before.h) < 4 && now.scrollY === before.scrollY,
    { anim: now.anim, oldH: before.h, atSwitch: now.h, scroll: now.scrollY });
  await page.waitForTimeout(450);
  const after = await page.evaluate(() => ({
    h: document.getElementById('hx-day').getBoundingClientRect().height,
    anim: document.getElementById('hx-day').getAnimations().length +
          (document.querySelector('#hx-day .hx-day-list')?.getAnimations().length ?? 0),
    ov: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  ok('C5 线上动画收尾后布局稳定、零溢出', after.anim === 0 && after.ov <= 0, after);
}
ok('D1 线上全程零 JS 异常 / console error', errs.length === 0, errs.slice(0, 2));
await browser.close();
console.log(`\n第 118 轮上线复验：${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
