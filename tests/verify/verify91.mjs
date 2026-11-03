/* verify91.mjs — 第 91 轮：里程碑改 500h 一档 + 两处字号 +2px
 *
 * 用户三项：
 *   a「将游戏时长突破的记录改为每 500h 记录一次」
 *   b「在游戏时长突破文案中，将『500h』部分的字体放大，使其字号比『游戏时长突破』部分的字号大 2px」
 *   c「将周日期文案（如『10.26-11.1』）的字体整体放大 2px」
 *   并强调「两处字号调整均以当前基准字号为参照，保持原有布局与文案结构不变」
 *
 * 基准（第 90 轮线上值）：.tl-week 13px、.tl-milestone 14px（b 原 17px）
 * 本轮目标：.tl-week 15px、.tl-milestone b 16px（= 14 + 2，差正好 2px）
 *
 * 覆盖：
 *  0 静态：版本号、STEP=30000、三条 font-size 字面量、结构与旧版一致
 *  1 里程碑：数量/取值/间隔都从数据推导，必须全是 500h 的倍数
 *  2 字号：运行时 computed 精确值 + 差值恒为 2px + 基准参照关系
 *  3 布局：`.tl-week` 文字不越出左列（Range 围盒 vs 可用宽度）、三列轨道未变
 *  4 文案结构：仍是「游戏时长突破 <b>500h</b>」，文本节点与 b 的层级不变
 *  5 四套主题下字号不变
 *  6 响应式：7 档宽度无横向溢出、周日期不被切
 *  7 无 JS 异常
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const URL = process.env.URL || 'http://127.0.0.1:8895/index.html';
let pass = 0;
let fail = 0;
const ok = (msg, cond, extra) => {
  if (cond) { pass++; console.log('PASS  ' + msg + (extra !== undefined ? '  — ' + JSON.stringify(extra) : '')); }
  else { fail++; console.log('FAIL  ' + msg + (extra !== undefined ? '  — ' + JSON.stringify(extra) : '')); }
};

const errs = [];
const browser = await chromium.launch({ args: ['--no-proxy-server'] });
let ctx, page;
const freshPage = async (vw = 1440, vh = 1000, dsf = 1) => {
  if (ctx) await ctx.close();
  ctx = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: dsf });
  page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
};

/* ================= 0 静态 ================= */
const app = fs.readFileSync('docs/app.js', 'utf8');
const html = fs.readFileSync('docs/index.html', 'utf8');
const css = fs.readFileSync('docs/style.css', 'utf8');
const meta = JSON.parse(fs.readFileSync('docs/data/meta.json', 'utf8'));
// 数据按月分文件（docs/data/daily/YYYY-MM.json），这里全部读进来合并 ——
// 只读某一个月的话，跨月之后 sumDaily / activeDays / 热力图汇总全都会对不上。
const daily = (() => {
  const dir = 'docs/data/daily';
  const days = {};
  for (const f of fs.readdirSync(dir).filter((x) => /^\d{4}-\d{2}\.json$/.test(x))) {
    Object.assign(days, JSON.parse(fs.readFileSync(`${dir}/${f}`, 'utf8')).days ?? {});
  }
  return { days };
})();

const appV = (html.match(/app\.js\?v=(\d+)/) || [])[1];
const cssV = (html.match(/style\.css\?v=(\d+)/) || [])[1];
ok('0.1 index.html 引用 app.js?v=113 / style.css?v=122', appV === '113' && cssV === '122', { app: appV, css: cssV });

ok('0.2 里程碑步长改成 500h（STEP = 30000 分钟）', /const STEP = 30000;/.test(app), (app.match(/const STEP = \d+;/) || [])[0]);
ok('0.3 旧的 100h 步长（6000）已不存在', !/const STEP = 6000;/.test(app));

// 剥注释后解析规则，取值必须精确（不允许被别的同选择器规则盖住）
const cssNoComment = css.replace(/\/\*[\s\S]*?\*\//g, '');
const ruleOf = (sel) => {
  const re = new RegExp('(^|\\})\\s*' + sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}', 'm');
  const m = cssNoComment.match(re);
  return m ? m[2] : null;
};
const weekRule = ruleOf('.tl-week');
const msRule = ruleOf('.tl-milestone');
const msBRule = ruleOf('.tl-milestone b');
const px = (rule, prop) => (rule ? parseFloat((rule.match(new RegExp(prop + ':\\s*([\\d.]+)px')) || [])[1]) : NaN);
ok('0.4 .tl-week 从 13px 提到 15px（基准 13 + 2）', px(weekRule, 'font-size') === 15, weekRule);
ok('0.5 .tl-milestone 正文仍是 14px（基准没动）', px(msRule, 'font-size') === 14, msRule);
ok('0.6 .tl-milestone b 从 17px 收到 16px（= 14 + 2，正好大 2px）',
  px(msBRule, 'font-size') === 16 && px(msBRule, 'font-size') - px(msRule, 'font-size') === 2,
  { b: px(msBRule, 'font-size'), text: px(msRule, 'font-size') });

/* ================= 1 里程碑 ================= */
await freshPage(1440, 1000, 1);
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('#lt-list .rank-item', { state: 'visible', timeout: 30000 });
await page.waitForTimeout(600);
await page.click('#card-games');
await page.waitForTimeout(900);

// 从数据推导：base = lifetime − 时间轴合计，累加所有周，跨过 30000 的倍数才记一次
const addDaysStr = (s, n) => {
  const d = new Date(`${s}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const weekStartOf = (s) => {
  const dow = (new Date(`${s}T12:00:00Z`).getUTCDay() + 6) % 7;
  return addDaysStr(s, -dow);
};
const label = (ws) =>
  `${Number(ws.slice(5, 7))}.${Number(ws.slice(8, 10))}-${Number(addDaysStr(ws, 6).slice(5, 7))}.${Number(addDaysStr(ws, 6).slice(8, 10))}`;
const wkMap = new Map();
const addMin = (ws, appid, minutes) => {
  if (!wkMap.has(ws)) wkMap.set(ws, new Map());
  const g = wkMap.get(ws);
  g.set(appid, (g.get(appid) ?? 0) + minutes);
};
for (const [d, v] of Object.entries(daily.days)) for (const g of v.games ?? []) addMin(weekStartOf(d), g.appid, g.minutes);
for (const e of meta.timeline_extra ?? []) addMin(weekStartOf(e.date), e.appid, e.minutes);
const ascWeeks = [...wkMap.keys()].sort();
const allMin = [...wkMap.values()].reduce((a, g) => a + [...g.values()].reduce((x, y) => x + y, 0), 0);
let acc = Math.max(0, (meta.stats?.lifetime_minutes ?? 0) - allMin);
const STEP = 30000;
const expect = [];
for (const ws of ascWeeks) {
  const before = acc;
  acc += [...wkMap.get(ws).values()].reduce((x, y) => x + y, 0);
  for (let m = Math.floor(before / STEP) + 1; m * STEP <= acc; m++) expect.push({ h: m * 500, ws });
}
const expectPage = expect.map((x) => ({ text: `游戏时长突破 ${x.h}h`, week: label(x.ws) })).reverse();

const tl = await page.evaluate(() => {
  const items = [...document.querySelectorAll('#timeline .tl-item')];
  const wk = (el) => el?.querySelector('.tl-week')?.textContent?.trim() ?? '';
  return {
    weeks: items.length,
    weeks100: items.length,
    labels: items.map(wk),
    milestones: [...document.querySelectorAll('#timeline .tl-milestone')].map((e) => ({
      text: e.textContent.replace(/\s+/g, ' ').trim(),
      week: wk(e.closest('.tl-item')),
    })),
    weekFont: getComputedStyle(document.querySelector('.tl-week')).fontSize,
    msFont: getComputedStyle(document.querySelector('.tl-milestone')).fontSize,
    msBFont: getComputedStyle(document.querySelector('.tl-milestone b')).fontSize,
    // 文案结构：第一个子节点是文本「游戏时长突破 」，随后是 b
    structure: (() => {
      const m = document.querySelector('.tl-milestone');
      if (!m) return null;
      return {
        firstNodeIsText: m.childNodes[0]?.nodeType === 3,
        textPrefix: (m.childNodes[0]?.textContent ?? '').trim(),
        boldTag: m.querySelector('b')?.tagName ?? null,
        boldText: m.querySelector('b')?.textContent?.trim() ?? null,
      };
    })(),
  };
});

ok(`1.1 里程碑条数 = 从数据推导的 ${expect.length} 条（500h 一档）`,
  tl.milestones.length === expect.length, { page: tl.milestones.map((m) => m.text), expect: expectPage.map((m) => m.text) });
ok('1.2 每条里程碑文案与落点都与推导一致',
  tl.milestones.length === expectPage.length
  && tl.milestones.every((m, i) => m.text === expectPage[i].text && m.week === expectPage[i].week),
  { page: tl.milestones, expect: expectPage });
const nums = tl.milestones.map((m) => Number((m.text.match(/(\d+)h/) || [])[1]));
ok('1.3 每条都是 500 的整数倍（不再是 100h 一档的 400/600/700…）',
  nums.length > 0 && nums.every((n) => n % 500 === 0), nums);
ok('1.4 相邻两条相差正好 500h', nums.length < 2 || nums.every((n, i) => i === 0 || nums[i - 1] - n === 500), nums);
ok('1.5 用户确认过的「突破 1000h ∈ 2026-04-16 那周」仍成立（1000 是 500 的倍数，不会被跳掉）',
  tl.milestones.find((m) => m.text.includes('1000h'))?.week === label(weekStartOf('2026-04-16')),
  { got: tl.milestones.find((m) => m.text.includes('1000h'))?.week, expect: label(weekStartOf('2026-04-16')) });

/* ================= 2 字号（运行时） ================= */
ok('2.1 周日期 .tl-week 运行时是 15px', tl.weekFont === '15px', tl.weekFont);
ok('2.2 里程碑正文运行时是 14px', tl.msFont === '14px', tl.msFont);
ok('2.3 里程碑数字运行时是 16px', tl.msBFont === '16px', tl.msBFont);
ok('2.4 数字比正文正好大 2px（用户要求的差值）',
  parseFloat(tl.msBFont) - parseFloat(tl.msFont) === 2,
  `${tl.msBFont} - ${tl.msFont} = ${parseFloat(tl.msBFont) - parseFloat(tl.msFont)}`);

/* ================= 3 布局 ================= */
const geo = await page.evaluate(() => {
  const item = document.querySelector('#timeline .tl-item');
  const cols = getComputedStyle(item).gridTemplateColumns.split(' ').map((x) => Math.round(parseFloat(x)));
  const el = [...document.querySelectorAll('#timeline .tl-week')].find((e) => e.textContent.trim() === '10.26-11.1');
  const cs = el ? getComputedStyle(el) : null;
  let textW = null;
  let availW = null;
  if (el) {
    const r = document.createRange();
    r.selectNodeContents(el);
    textW = +r.getBoundingClientRect().width.toFixed(1);
    availW = +(el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)).toFixed(1);
  }
  const left = el?.closest('.tl-left')?.getBoundingClientRect();
  const tr = el?.getBoundingClientRect();
  return {
    cols,
    textW, availW,
    over: textW !== null ? +(textW - availW).toFixed(1) : null,
    // 右对齐时溢出向左：要看到左边界有没有越出左列
    outside: left && tr ? tr.left < left.left - 1 : null,
    docOverflow: document.documentElement.scrollWidth - window.innerWidth,
  };
});
ok('3.1 三列轨道仍是 116 / 44 / 1fr（放大字号没有改布局骨架）',
  geo.cols.length === 3 && geo.cols[0] === 116 && geo.cols[1] === 44, geo.cols);
ok('3.2 最长的周日期「10.26-11.1」仍装得进左列（文字宽 < 可用宽）',
  geo.over !== null && geo.over < 0 && geo.outside === false, geo);
ok('3.3 桌面无横向溢出', geo.docOverflow <= 0, geo.docOverflow);

/* ================= 4 文案结构 ================= */
ok('4.1 仍是「游戏时长突破 」文本 + <b>数字</b> 两层，没有把整句拆成两个 span',
  tl.structure?.firstNodeIsText === true
  && tl.structure?.textPrefix === '游戏时长突破'
  && tl.structure?.boldTag === 'B', tl.structure);
ok('4.2 <b> 里只有数字（如 1000h），没有多塞文字', /^\d+h$/.test(tl.structure?.boldText ?? ''), tl.structure?.boldText);

/* ================= 5 四套主题 ================= */
const themed = await page.evaluate(() => {
  const out = {};
  for (const th of ['cream', 'mint', 'dawn', 'night']) {
    document.documentElement.dataset.theme = th;
    out[th] = {
      week: getComputedStyle(document.querySelector('.tl-week')).fontSize,
      text: getComputedStyle(document.querySelector('.tl-milestone')).fontSize,
      bold: getComputedStyle(document.querySelector('.tl-milestone b')).fontSize,
    };
  }
  document.documentElement.dataset.theme = 'cream';
  return out;
});
ok('5.1 四套主题下三处字号都不变（15 / 14 / 16）',
  Object.values(themed).every((v) => v.week === '15px' && v.text === '14px' && v.bold === '16px'), themed);

/* ================= 6 响应式 ================= */
for (const w of [1440, 1024, 900, 768, 430, 390, 360]) {
  await page.setViewportSize({ width: w, height: 950 });
  await page.waitForTimeout(320);
  const m = await page.evaluate(() => {
    const items = [...document.querySelectorAll('#timeline .tl-item')];
    const item = items[0];
    const cols = item ? getComputedStyle(item).gridTemplateColumns.split(' ').map((x) => Math.round(parseFloat(x))) : null;
    // 所有周日期里最宽的那个，逐个量它有没有越出左列
    let worst = null;
    for (const el of document.querySelectorAll('#timeline .tl-week')) {
      const r = document.createRange();
      r.selectNodeContents(el);
      const tw = r.getBoundingClientRect().width;
      const cs = getComputedStyle(el);
      const avail = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const over = tw - avail;
      if (!worst || over > worst.over) worst = { t: el.textContent.trim(), over: +over.toFixed(1), tw: +tw.toFixed(1), avail: +avail.toFixed(1) };
    }
    return {
      cols,
      worst,
      weekFont: getComputedStyle(document.querySelector('.tl-week')).fontSize,
      docOverflow: document.documentElement.scrollWidth - window.innerWidth,
    };
  });
  ok(`6.${w} 无横向溢出、周日期不越出左列（最紧 ${m.worst?.over}px，字号 ${m.weekFont}）`,
    m.docOverflow <= 0 && m.worst && m.worst.over <= 0, { cols: m.cols, worst: m.worst });
}

await ctx.close();
await browser.close();
ok('7.1 全程零 JS 异常 / console error', errs.length === 0, errs.slice(0, 3));
console.log(`\n===== 第91轮 PASS=${pass} FAIL=${fail} =====`);
process.exit(fail ? 1 : 0);
