/* online119.mjs — 第 119 轮上线复验：周时长删「合计」+ 与年份同字体
 * ① 指纹：线上 index.html 引用 v144/v129；html/css/app 字节 md5 与本地全等；
 *    线上 JS 不再输出「合计」，CSS 的 .tl-week-total 与 .tl-month 字体声明一致（窄屏 19px）。
 * ② 运行时：60 周时长只含数字+单位且与 daily 现算全等；1440/390 下 computed 字体六项
 *    与年份逐项相等、文字不越列、零溢出；热力图详情切换仍正常、零 JS 异常。
 * ⚠️ 只读，不产生 PUT；线上字节页内 fetch 回传，--no-proxy-server。
 * 用法：node tests/online/online119.mjs */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import crypto from 'node:crypto';

const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');
const SITE = process.env.ONLINE_SITE || 'https://hyouka-721.github.io/Steam-playtime/';
const ROOT = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
let pass = 0, fail = 0;
const ok = (n, c, x) => {
  c ? (pass++, console.log('PASS ', n, x === undefined ? '' : '— ' + JSON.stringify(x)))
    : (fail++, console.log('FAIL ', n, '— ' + JSON.stringify(x)));
};
const md5 = (s) => crypto.createHash('md5').update(Buffer.from(String(s).replace(/\r\n/g, '\n'), 'utf8')).digest('hex');

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
    g('index.html?cb=' + cb), g('style.css?v=144&cb=' + cb), g('app.js?v=133&cb=' + cb),
  ]);
  return {
    html: h.t, css: c.t, app: a.t, statuses: [h.s, c.s, a.s],
    cssTag: (h.t.match(/style\.css\?v=\d+/) || [])[0],
    appTag: (h.t.match(/app\.js\?v=\d+/) || [])[0],
  };
}, { site: SITE });
ok('A1 线上引用 style.css?v=144 / app.js?v=133',
  fp.cssTag === 'style.css?v=144' && fp.appTag === 'app.js?v=133', { css: fp.cssTag, app: fp.appTag });
ok('A2 线上 html/css/app 字节 md5 与本地全等',
  fp.statuses.every((s) => s === 200) &&
  md5(fp.html) === md5(htmlLocal) && md5(fp.css) === md5(cssLocal) && md5(fp.app) === md5(appLocal));
ok('A3 线上源码已删「合计」且字体声明与年份同款',
  /class="tl-week-total">\$\{hoursShort\(weekTotal\)\}/.test(fp.app) &&
  !/tl-week-total">合计/.test(fp.app) &&
  /\.tl-week-total\s*\{[^}]*font-size:\s*24px[^}]*font-weight:\s*700/.test(fp.css) &&
  /\.tl-week-total\s*\{\s*font-size:\s*19px;/.test(fp.css));

/* 数据现算 */
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
const rangeOf = (ws) => {
  const e = addDaysStr(ws, 6);
  return `${Number(ws.slice(5, 7))}.${Number(ws.slice(8, 10))}-${Number(e.slice(5, 7))}.${Number(e.slice(8, 10))}`;
};
const weeks = new Map();
for (const [ds, day] of Object.entries(daily)) {
  const ws = weekStart(ds);
  if (!weeks.has(ws)) weeks.set(ws, 0);
  for (const g of day.games ?? []) weeks.set(ws, weeks.get(ws) + (g.minutes ?? 0));
}
for (const e of meta.timeline_extra ?? []) {
  const ws = weekStart(e.date);
  weeks.set(ws, (weeks.get(ws) ?? 0) + (e.minutes ?? 0));
}

await page.waitForSelector('#lt-list .rank-item', { state: 'visible', timeout: 40000 });
await page.waitForTimeout(1100);
await page.click('#card-games');
await page.waitForSelector('#timeline .tl-item', { timeout: 20000 });
await page.waitForTimeout(400);
const tl = await page.evaluate(() => [...document.querySelectorAll('#timeline .tl-item')].map((it) => ({
  week: it.querySelector('.tl-week')?.textContent?.trim() ?? '',
  total: it.querySelector('.tl-week-total')?.textContent?.trim() ?? '',
})));
ok('B1 线上每周只显示时长、无「合计」',
  tl.length > 0 && tl.every((x) => /^\d+(?:\.\d+)?(?:h|min)$/.test(x.total) && !/合计/.test(x.total)),
  { weeks: tl.length, first: tl[0]?.total });
const bad = [];
for (const x of tl) {
  const ws = [...weeks.keys()].find((k) => rangeOf(k) === x.week);
  const want = ws === undefined ? null : hoursShort(weeks.get(ws));
  if (want !== x.total) bad.push({ week: x.week, got: x.total, want });
}
ok('B2 线上周时长与 daily 现算全等', bad.length === 0, bad.slice(0, 3));

const KEYS = ['fontFamily', 'fontSize', 'fontWeight', 'letterSpacing', 'color', 'lineHeight'];
for (const w of [1440, 390]) {
  await page.setViewportSize({ width: w, height: 900 });
  await page.waitForTimeout(220);
  const r = await page.evaluate((keys) => {
    const m = document.querySelector('.tl-month:not(.tl-month-ph)');
    const t = document.querySelector('.tl-week-total');
    const cs = (e) => { const s = getComputedStyle(e); return Object.fromEntries(keys.map((k) => [k, s[k]])); };
    const rg = new Range(); if (t?.firstChild) rg.selectNodeContents(t);
    return {
      month: cs(m), total: cs(t), textW: rg.getBoundingClientRect().width,
      leftW: t?.closest('.tl-left')?.clientWidth ?? 0,
      ov: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  }, KEYS);
  const same = KEYS.every((k) => r.month[k] === r.total[k]);
  ok(`B3 ${w}px 时长字体与年份逐项一致`, same, { size: r.total.fontSize, weight: r.total.fontWeight });
  ok(`B4 ${w}px 不越列零溢出`, r.textW <= r.leftW + 0.5 && r.ov <= 0,
    { textW: r.textW.toFixed(1), leftW: r.leftW, ov: r.ov });
}

/* 热力图详情切换仍正常（第 118 轮契约未退化） */
await page.setViewportSize({ width: 1440, height: 1000 });
await page.click('#card-recent');
await page.waitForSelector('#hx-grid .hx-c[role="button"]', { timeout: 20000 });
await page.waitForTimeout(500);
const cells = page.locator('#hx-grid .hx-c[role="button"]');
await cells.nth(0).click();
await page.waitForTimeout(320);
const d1 = await page.evaluate(() => document.querySelector('#hx-day .hx-day-head b')?.textContent?.trim());
await cells.nth(1).click();
const sw = await page.evaluate(() => ({
  date: document.querySelector('#hx-day .hx-day-head b')?.textContent?.trim(),
  anim: document.getElementById('hx-day').getAnimations().length +
        (document.querySelector('#hx-day .hx-day-list')?.getAnimations().length ?? 0),
}));
ok('C1 热力图切日期仍同步更新且带动画', !!d1 && !!sw.date && sw.date !== d1 && sw.anim >= 1,
  { from: d1, to: sw.date, anim: sw.anim });
ok('D1 线上零 JS 异常 / console error', errs.length === 0, errs.slice(0, 2));
await browser.close();
console.log(`\n第 119 轮上线复验：${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
