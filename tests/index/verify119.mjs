/* verify119.mjs — 第 119 轮：时间轴周时长删「合计」+ 与年份同字体
   契约：
     ① `.tl-week-total` 只显示时长（2.7h / 45min），不再有「合计」二字；
     ② 字体与年份 `.tl-month` 完全一致：同族 / 同字重 / 同号（桌面 24px，≤860 19px）/
        同字距 / 同色 / 同行高；
     ③ 五档宽度下文字不越出左列、页面零横向溢出；时长仍与 daily 现算全等。
   用法：node tests/index/verify119.mjs（需先起 8895 静态服务） */
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

/* ---------- A 静态 ---------- */
const html = fs.readFileSync(ROOT + 'docs/index.html', 'utf8');
const js = fs.readFileSync(ROOT + 'docs/app.js', 'utf8');
const css = fs.readFileSync(ROOT + 'docs/style.css', 'utf8');
const cssNoCmt = css.replace(/\/\*[\s\S]*?\*\//g, '');
const vCss = (html.match(/style\.css\?v=(\d+)/) || [])[1];
const vApp = (html.match(/app\.js\?v=(\d+)/) || [])[1];
ok('A1 版本号 bump 到 CSS 144 / APP 129', vCss === '146' && vApp === '130', { css: vCss, app: vApp });
ok('A2 时长行只输出时长，源码不再有「合计」前缀',
  /class="tl-week-total">\$\{hoursShort\(weekTotal\)\}/.test(js) &&
  !/tl-week-total">合计/.test(js) &&
  /const weekTotal = list\.reduce\(/.test(js));
const ruleOf = (sel) => {
  const m = cssNoCmt.match(new RegExp('(^|\\})\\s*' + sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}', 'm'));
  return m ? m[2] : null;
};
const totalRule = ruleOf('.tl-week-total') || '';
const monthRule = ruleOf('.tl-month') || '';
const prop = (rule, p) => (rule.match(new RegExp(p + ':\\s*([^;]+)')) || [])[1]?.trim();
const SAME = ['font-family', 'font-size', 'font-weight', 'letter-spacing', 'color', 'line-height'];
const diffProps = SAME.filter((p) => prop(totalRule, p) !== prop(monthRule, p));
ok('A3 时长行与年份的字体声明逐项一致（桌面 24px/700/Black Rose）',
  diffProps.length === 0 && prop(totalRule, 'font-size') === '24px' && prop(totalRule, 'font-weight') === '700',
  { diff: diffProps, size: prop(totalRule, 'font-size'), weight: prop(totalRule, 'font-weight') });
ok('A4 ≤860 窄屏时长跟随年份一起缩到 19px',
  /\.tl-month\s*\{\s*font-size:\s*19px;/.test(cssNoCmt) &&
  /\.tl-week-total\s*\{\s*font-size:\s*19px;/.test(cssNoCmt));
ok('A5 周日期行仍是 14.5px（旧契约未动）', prop(ruleOf('.tl-week') || '', 'font-size') === '14.5px');

/* ---------- 数据现算 ---------- */
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

/* ---------- B 运行时 ---------- */
const errs = [];
const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
const page = await ctx.newPage();
page.on('pageerror', (e) => errs.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto(LOCAL + '?t=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('#lt-list .rank-item', { state: 'visible', timeout: 40000 });
await page.waitForTimeout(1000);
await page.click('#card-games');
await page.waitForSelector('#timeline .tl-item', { timeout: 20000 });
await page.waitForTimeout(400);

const tl = await page.evaluate(() => [...document.querySelectorAll('#timeline .tl-item')].map((it) => {
  const week = it.querySelector('.tl-week');
  const tot = it.querySelector('.tl-week-total');
  const rg = new Range();
  if (tot && tot.firstChild) rg.selectNodeContents(tot);
  return {
    week: week?.textContent?.trim() ?? '',
    total: tot?.textContent?.trim() ?? '',
    top: tot?.getBoundingClientRect().top ?? 0,
    weekBottom: week?.getBoundingClientRect().bottom ?? 0,
    textW: rg.getBoundingClientRect().width,
    leftW: it.querySelector('.tl-left')?.clientWidth ?? 0,
  };
}));
ok('B1 每周只显示时长、无「合计」二字',
  tl.length > 0 && tl.every((x) => /^\d+(?:\.\d+)?(?:h|min)$/.test(x.total) && !/合计/.test(x.total)),
  { weeks: tl.length, first: tl[0]?.total });
const bad = [];
for (const x of tl) {
  const ws = [...weeks.keys()].find((k) => rangeOf(k) === x.week);
  const want = ws === undefined ? null : hoursShort(weeks.get(ws));
  if (want !== x.total) bad.push({ week: x.week, got: x.total, want });
}
ok('B2 每周时长与 daily 现算全等（含补录周）', bad.length === 0, bad.slice(0, 3));
ok('B3 时长行仍在周日期下方、没跑到上面去', tl.every((x) => x.top >= x.weekBottom));

const FONT_KEYS = ['fontFamily', 'fontSize', 'fontWeight', 'letterSpacing', 'color', 'lineHeight'];
for (const w of [1440, 1280, 1088, 900, 390]) {
  await page.setViewportSize({ width: w, height: 900 });
  await page.waitForTimeout(220);
  const r = await page.evaluate((keys) => {
    const m = document.querySelector('.tl-month:not(.tl-month-ph)');
    const t = document.querySelector('.tl-week-total');
    const cs = (e) => { const s = getComputedStyle(e); return Object.fromEntries(keys.map((k) => [k, s[k]])); };
    const rg = new Range(); if (t?.firstChild) rg.selectNodeContents(t);
    return {
      month: cs(m), total: cs(t),
      textW: rg.getBoundingClientRect().width,
      leftW: t?.closest('.tl-left')?.clientWidth ?? 0,
      ov: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  }, FONT_KEYS);
  const same = FONT_KEYS.every((k) => r.month[k] === r.total[k]);
  ok(`B4 ${w}px 时长字体与年份逐项一致`, same, { size: r.total.fontSize, weight: r.total.fontWeight });
  ok(`B5 ${w}px 文字不越列且页面零溢出`,
    r.textW <= r.leftW + 0.5 && r.ov <= 0, { textW: r.textW.toFixed(1), leftW: r.leftW, ov: r.ov });
}
ok('C1 全程零 JS 异常', errs.length === 0, errs.slice(0, 2));
await browser.close();
console.log(`\n第 119 轮：${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
