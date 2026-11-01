/* online91.mjs — 第 91 轮上线复验：里程碑 500h 一档 + 周日期/里程碑数字字号
 *
 *   A 指纹：版本号、css/js 字节 md5 与本地全等（CRLF→LF 归一）
 *   B 里程碑：条数与落点从本地数据推导；全是 500 的整数倍、相邻差 500；
 *            用户确认过的「突破 1000h ∈ 2026-04-16 那周」必须还在
 *   C 字号：.tl-week 15px / .tl-milestone 14px / b 16px，差值恒 2px
 *   D 布局：三列轨道未变；最长周日期（10.13-10.19 那种）不越出左列（Range 量文字宽）
 *   E 文案结构：仍是「文本节点 + <b>数值</b>」两层
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import crypto from 'node:crypto';

const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const SITE = 'https://hyouka-721.github.io/Steam-playtime/';
const CSS_V = '116';
const APP_V = '111';

let pass = 0;
let fail = 0;
const ok = (n, c, extra = '') => {
  c ? (pass++, console.log(`PASS ${n}${extra ? '  — ' + extra : ''}`))
    : (fail++, console.log(`FAIL ${n}  — ${extra}`));
};

/* ---------- 本地推导 ---------- */
const meta = JSON.parse(fs.readFileSync('docs/data/meta.json', 'utf8'));
const daily = JSON.parse(fs.readFileSync('docs/data/daily/2026-10.json', 'utf8'));
const STEP = Number((fs.readFileSync('docs/app.js', 'utf8').match(/const STEP = (\d+);/) || [])[1]);
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
const expect = [];
for (const ws of ascWeeks) {
  const before = acc;
  acc += [...wkMap.get(ws).values()].reduce((x, y) => x + y, 0);
  for (let m = Math.floor(before / STEP) + 1; m * STEP <= acc; m++) expect.push({ h: (m * STEP) / 60, ws });
}
const expectPage = expect.map((x) => ({ text: `游戏时长突破 ${x.h}h`, week: label(x.ws) })).reverse();
console.log(`本地：STEP=${STEP} 分钟（${STEP / 60}h）→ 期望里程碑 ${expect.length} 条：${expectPage.map((m) => m.text + '@' + m.week).join(' / ')}`);

const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));

/* ---------- A 等 Pages 生效 + 指纹 ---------- */
console.log('== A 等待 Pages 生效 ==');
let html = '';
for (let i = 1; i <= 40; i++) {
  try {
    const r = await page.goto(`${SITE}index.html?t=${Date.now()}-${i}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
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

const md5 = (buf) => crypto.createHash('md5').update(buf.toString('utf8').replace(/\r\n/g, '\n'), 'utf8').digest('hex');
for (const [file, v] of [['docs/style.css', CSS_V], ['docs/app.js', APP_V]]) {
  const url = `${SITE}${file.replace('docs/', '')}?v=${v}&t=${Date.now()}`;
  const online = Buffer.from(await (await fetch(url)).arrayBuffer());
  const local = fs.readFileSync(file);
  ok(`A2 ${file} 线上字节 md5 与本地全等`, md5(online) === md5(local), `${md5(online)} / ${md5(local)}`);
}

/* ---------- B/C/D/E 时间轴 ---------- */
console.log('== B 里程碑 + C 字号 + D 布局 ==');
await page.waitForSelector('#lt-list .rank-item', { timeout: 25000 });
await page.click('#card-games');
await page.waitForTimeout(900);

const tl = await page.evaluate(() => {
  const items = [...document.querySelectorAll('#timeline .tl-item')];
  const wk = (el) => el?.querySelector('.tl-week')?.textContent?.trim() ?? '';
  const cs = (el) => (el ? getComputedStyle(el) : null);
  const weekEl = document.querySelector('.tl-week');
  const msEl = document.querySelector('.tl-milestone');
  const bEl = msEl?.querySelector('b') ?? null;
  // 扫全部周日期，找最紧的那条（用户举例的 10.26-11.1 往往不是最宽的）
  let worst = null;
  for (const el of document.querySelectorAll('#timeline .tl-week')) {
    const r = document.createRange();
    r.selectNodeContents(el);
    const tw = r.getBoundingClientRect().width;
    const c = getComputedStyle(el);
    const avail = el.clientWidth - parseFloat(c.paddingLeft) - parseFloat(c.paddingRight);
    const over = tw - avail;
    if (!worst || over > worst.over) worst = { t: el.textContent.trim(), over: +over.toFixed(1), tw: +tw.toFixed(1), avail: +avail.toFixed(1) };
  }
  const item0 = items[0];
  return {
    weeks: items.length,
    milestones: [...document.querySelectorAll('#timeline .tl-milestone')].map((e) => ({
      text: e.textContent.replace(/\s+/g, ' ').trim(),
      week: wk(e.closest('.tl-item')),
    })),
    weekFont: cs(weekEl)?.fontSize ?? null,
    msFont: cs(msEl)?.fontSize ?? null,
    bFont: cs(bEl)?.fontSize ?? null,
    cols: item0 ? getComputedStyle(item0).gridTemplateColumns.split(' ').map((x) => Math.round(parseFloat(x))) : null,
    worst,
    docOverflow: document.documentElement.scrollWidth - window.innerWidth,
    structure: msEl
      ? {
        firstNodeIsText: msEl.childNodes[0]?.nodeType === 3,
        prefix: (msEl.childNodes[0]?.textContent ?? '').trim(),
        bTag: bEl?.tagName ?? null,
        bText: bEl?.textContent?.trim() ?? null,
      }
      : null,
  };
});

ok(`B1 线上里程碑条数 = 本地推导的 ${expect.length} 条`,
  tl.milestones.length === expect.length, `线上 ${tl.milestones.map((m) => m.text)}`);
ok('B2 每条文案与落点都与本地推导一致',
  tl.milestones.length === expectPage.length
  && tl.milestones.every((m, i) => m.text === expectPage[i].text && m.week === expectPage[i].week),
  `${JSON.stringify(tl.milestones)} vs ${JSON.stringify(expectPage)}`);
const nums = tl.milestones.map((m) => Number((m.text.match(/(\d+)h/) || [])[1]));
ok('B3 每条都是 500 的整数倍、相邻差 500h', nums.length > 0 && nums.every((n) => n % 500 === 0) && (nums.length < 2 || nums.every((n, i) => i === 0 || nums[i - 1] - n === 500)), nums);
const ms1000 = tl.milestones.find((m) => m.text.includes('1000h'));
ok('B4 突破 1000h 仍落在含 2026-04-16 的那一周（换档位没把它弄丢）',
  ms1000?.week === label(weekStartOf('2026-04-16')), { got: ms1000?.week, expect: label(weekStartOf('2026-04-16')) });

ok('C1 周日期 .tl-week 线上是 15px', tl.weekFont === '15px', tl.weekFont);
ok('C2 里程碑正文线上是 14px', tl.msFont === '14px', tl.msFont);
ok('C3 里程碑数字线上是 16px', tl.bFont === '16px', tl.bFont);
ok('C4 数字比正文正好大 2px', parseFloat(tl.bFont) - parseFloat(tl.msFont) === 2, `${tl.bFont} - ${tl.msFont}`);

ok('D1 桌面三列轨道仍是 116 / 44 / 1fr', Array.isArray(tl.cols) && tl.cols[0] === 116 && tl.cols[1] === 44, tl.cols);
ok('D2 最紧的周日期仍装得进左列（文字宽 < 可用宽）', tl.worst && tl.worst.over < 0, tl.worst);
ok('D3 桌面无横向溢出', tl.docOverflow <= 0, tl.docOverflow);

ok('E1 文案仍是「游戏时长突破 」文本 + <b>数字</b> 两层',
  tl.structure?.firstNodeIsText === true && tl.structure?.prefix === '游戏时长突破'
  && tl.structure?.bTag === 'B' && /^\d+h$/.test(tl.structure?.bText ?? ''), tl.structure);

/* ---------- F 窄屏 ---------- */
await page.setViewportSize({ width: 390, height: 900 });
await page.waitForTimeout(450);
const narrow = await page.evaluate(() => {
  const item = document.querySelector('#timeline .tl-item');
  let worst = null;
  for (const el of document.querySelectorAll('#timeline .tl-week')) {
    const r = document.createRange();
    r.selectNodeContents(el);
    const tw = r.getBoundingClientRect().width;
    const c = getComputedStyle(el);
    const avail = el.clientWidth - parseFloat(c.paddingLeft) - parseFloat(c.paddingRight);
    const over = tw - avail;
    if (!worst || over > worst.over) worst = { t: el.textContent.trim(), over: +over.toFixed(1), tw: +tw.toFixed(1), avail: +avail.toFixed(1) };
  }
  return {
    cols: item ? getComputedStyle(item).gridTemplateColumns.split(' ').map((x) => Math.round(parseFloat(x))) : null,
    worst,
    weekFont: getComputedStyle(document.querySelector('.tl-week')).fontSize,
    docOverflow: document.documentElement.scrollWidth - window.innerWidth,
  };
});
ok('F1 390 窄屏三列轨道是 78 / 30 / 1fr', Array.isArray(narrow.cols) && narrow.cols[0] === 78 && narrow.cols[1] === 30, narrow.cols);
ok(`F2 390 窄屏周日期文字不越界（最紧 ${narrow.worst?.over}px，字号 ${narrow.weekFont}）`,
  narrow.docOverflow <= 0 && narrow.worst && narrow.worst.over <= 0, narrow.worst);

await ctx.close();
await browser.close();
ok('G1 全程零 JS 异常', errs.length === 0, errs.slice(0, 3));
console.log(`\n===== online91 PASS=${pass} FAIL=${fail} =====`);
process.exit(fail ? 1 : 0);
