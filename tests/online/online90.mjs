/* online90.mjs — 第 90 轮上线复验：时间标签加粗 + 时间轴整年历史（57 周 / 228 条）+ 零「补录」字样
 *
 * 判据全部对着**线上**（GitHub Pages），期望值从本地数据推导，不写死条数。
 *   A 指纹：版本号、css/js 字节 md5 与本地全等（CRLF→LF 归一）
 *   B 时间标签：所有刻度 font-weight 700、日期仍 600、汇总行未被连带
 *   C 时间轴：周数 = 本地推导、零 .tl-extra、正文零「补录」、里程碑逐条对齐、
 *            10.05 / 3.30 两处新数据的落点、零破图
 *   D 隔离性：热力图汇总与统计口径仍只含采集数据
 *   E 零 JS 异常
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

/* ---------- 本地数据推导期望 ---------- */
const meta = JSON.parse(fs.readFileSync('docs/data/meta.json', 'utf8'));
const daily = JSON.parse(fs.readFileSync('docs/data/daily/2026-10.json', 'utf8'));
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
const baseMin = Math.max(0, (meta.stats?.lifetime_minutes ?? 0) - allMin);
// 里程碑档位从本地 app.js 读（第 91 轮起 500h = 30000 分钟），套件不写死
const STEP = Number((fs.readFileSync('docs/app.js', 'utf8').match(/const STEP = (\d+);/) || [])[1]);
console.log('里程碑档位 STEP =', STEP, '分钟（' + STEP / 60 + 'h）');
let acc = baseMin;
const expectMs = [];
for (const ws of ascWeeks) {
  const before = acc;
  acc += [...wkMap.get(ws).values()].reduce((x, y) => x + y, 0);
  for (let m = Math.floor(before / STEP) + 1; m * STEP <= acc; m++) expectMs.push({ h: m * STEP, ws });
}
const expectMsPage = expectMs
  .map((x) => ({ text: `游戏时长突破 ${x.h / 60}h`, week: label(x.ws) }))
  .reverse();
console.log(`本地推导：${ascWeeks.length} 周 / 合计 ${allMin} 分钟 / base ${baseMin} / 里程碑 ${expectMs.length} 条`);

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
    // ⚠️ 必须带 cache-busting：Pages 给 index.html 设了 max-age=600
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
for (const [file, q] of [['docs/style.css', `style.css?v=${CSS_V}`], ['docs/app.js', `app.js?v=${APP_V}`]]) {
  const url = `${SITE}${file.replace('docs/', '')}?v=${q.split('=')[1]}&t=${Date.now()}`;
  const online = Buffer.from(await (await fetch(url)).arrayBuffer());
  const local = fs.readFileSync(file);
  ok(`A2 ${file} 线上字节 md5 与本地全等`, md5(online) === md5(local), `${md5(online)} / ${md5(local)}`);
}

/* ---------- B 时间标签加粗 ---------- */
console.log('== B 时间标签 ==');
await page.waitForSelector('#lt-list .rank-item', { timeout: 25000 });
await page.click('#card-lifetime');
await page.waitForSelector('#lt-detail:not([hidden])', { timeout: 15000 });
await page.waitForTimeout(700);
const heat = await page.evaluate(() => {
  const cells = [...document.querySelectorAll('#heat-drill .hc')];
  const times = cells.map((c) => c.querySelector('i')).filter(Boolean);
  const dated = cells.map((c) => c.querySelector('b')).filter(Boolean);
  const fw = (id) => {
    const el = document.getElementById(id);
    return el ? getComputedStyle(el).fontWeight : null;
  };
  return {
    withTime: times.length,
    weights: [...new Set(times.map((e) => getComputedStyle(e).fontWeight))],
    sizes: [...new Set(times.map((e) => getComputedStyle(e).fontSize))],
    dateWeights: [...new Set(dated.map((e) => getComputedStyle(e).fontWeight))],
    sum: document.getElementById('heat-sum')?.textContent?.trim() ?? '',
    sumWeight: fw('heat-sum'),
    broken: [...document.querySelectorAll('#heat-drill img')].filter((im) => im.complete && im.naturalWidth === 0).length,
  };
});
ok('B1 线上所有时间刻度 font-weight 都是 700', heat.weights.length === 1 && heat.weights[0] === '700', JSON.stringify(heat.weights));
ok('B2 时间刻度字号仍是 15px（桌面）', heat.sizes.length === 1 && heat.sizes[0] === '15px', JSON.stringify(heat.sizes));
ok('B3 日期数字仍是 600（加粗没波及日期）', heat.dateWeights.length === 1 && heat.dateWeights[0] === '600', JSON.stringify(heat.dateWeights));
ok('B4 汇总行 #heat-sum 未被加成 700', heat.sumWeight !== '700', heat.sumWeight);

/* ---------- C 时间轴 ---------- */
console.log('== C 时间轴 ==');
await page.click('#btn-drill-back');
await page.waitForTimeout(400);
await page.click('#card-games');
await page.waitForTimeout(900);
const tl = await page.evaluate(() => {
  const items = [...document.querySelectorAll('#timeline .tl-item')];
  const wk = (el) => el?.querySelector('.tl-week')?.textContent?.trim() ?? '';
  const weekOf = (w) => items.find((it) => wk(it) === w);
  const gamesIn = (w) => {
    const it = weekOf(w);
    if (!it) return null;
    return [...it.querySelectorAll('.tl-game')].map((g) => ({
      name: (g.querySelector('img')?.getAttribute('src') ?? '').replace(/^.*\/(\d+)\.webp$/, '$1'),
      badge: g.querySelector('.tl-badge')?.textContent?.trim(),
    }));
  };
  return {
    weeks: items.length,
    labels: items.map(wk),
    extras: document.querySelectorAll('.tl-extra').length,
    hasWord: document.body.innerText.includes('补录'),
    milestones: [...document.querySelectorAll('#timeline .tl-milestone')].map((e) => ({
      text: e.textContent.replace(/\s+/g, ' ').trim(),
      week: wk(e.closest('.tl-item')),
    })),
    w1005: gamesIn('10.5-10.11'),
    w0330: gamesIn('3.30-4.5'),
    broken: [...document.querySelectorAll('#timeline .tl-game img')]
      .filter((im) => im.complete && im.naturalWidth === 0 && (im.getAttribute('src') ?? '') && !(im.getAttribute('src') ?? '').startsWith('data:'))
      .map((im) => im.getAttribute('src')),
    hint: document.getElementById('tl-hint')?.textContent?.trim() ?? '',
  };
});
ok(`C1 线上时间轴周数 = 本地推导的 ${ascWeeks.length} 周`, tl.weeks === ascWeeks.length, `线上 ${tl.weeks} / 提示「${tl.hint}」`);
ok('C2 线上没有任何补录说明行（.tl-extra 计数为 0）', tl.extras === 0, tl.extras);
ok('C3 线上正文不含「补录」二字', tl.hasWord === false);
ok(`C4 里程碑 ${expectMs.length} 条，文案与落点逐条一致`,
  tl.milestones.length === expectMsPage.length
  && tl.milestones.every((m, i) => m.text === expectMsPage[i].text && m.week === expectMsPage[i].week),
  `${JSON.stringify(tl.milestones.slice(0, 3))} vs ${JSON.stringify(expectMsPage.slice(0, 3))}`);
const ms1000 = tl.milestones.find((m) => m.text.includes('1000h'));
ok('C5 突破 1000h 落在 4.13-4.19（含 2026-04-16）', ms1000?.week === label(weekStartOf('2026-04-16')), ms1000?.week);
const kr1005 = (tl.w1005 ?? []).find((g) => g.name === '246420');
ok('C6 10.5-10.11 那周已上线，王国保卫战徽章 = 2h', !!kr1005 && kr1005.badge === '2h', JSON.stringify(tl.w1005));
const ets0330 = (tl.w0330 ?? []).find((g) => g.name === '227300');
const stardew0330 = (tl.w0330 ?? []).find((g) => g.name === '413150');
ok('C7 3.30-4.5 那周是欧洲卡车模拟2 6h（星露谷物语的笔误已改）',
  !!ets0330 && ets0330.badge === '6h' && !stardew0330, JSON.stringify(tl.w0330));
ok('C8 线上时间轴零破图', tl.broken.length === 0, tl.broken.slice(0, 5));

/* ---------- D 隔离性 ---------- */
console.log('== D 隔离性 ==');
const sumDaily = Object.values(daily.days).reduce((a, v) => a + v.total_minutes, 0);
const activeDaily = Object.values(daily.days).filter((v) => v.total_minutes > 0).length;
ok('D1 热力图汇总仍是「' + activeDaily + ' 天有记录 · 合计 ' + Math.floor(sumDaily / 60) + ' h ' + (sumDaily % 60) + ' min」',
  heat.sum.includes(`${activeDaily} 天`) && heat.sum.includes(`合计 ${Math.floor(sumDaily / 60)} h ${sumDaily % 60} min`), heat.sum);
ok('D2 热力图里的图片零破图', heat.broken === 0, heat.broken);
await page.click('#card-recent');
await page.waitForTimeout(500);
const recentHasWord = await page.evaluate(() => document.getElementById('view-recent')?.innerText.includes('补录') ?? false);
ok('D3 最近游玩视图也没有补录字样', recentHasWord === false);

await ctx.close();
await browser.close();
ok('E1 全程零 JS 异常', errs.length === 0, errs.slice(0, 3));
console.log(`\n===== online90 PASS=${pass} FAIL=${fail} =====`);
process.exit(fail ? 1 : 0);
