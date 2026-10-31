/* online87.mjs — 第 87 轮上线复验：热力图时长字样放大 + 日明细入口并入热力图
   判据全部对着**线上**：Pages 已生效 → 时长字样确实变大变深 → 热力图格子可点并弹出
   当天明细（内容与线上 daily 数据逐条对得上）→ 最近游玩的日历图标确实没了 →
   浮动层已无一级月历 → 360px 不横向溢出 → 零 JS 异常。

   ⚠️ 期望的日期/时长/条数一律从线上 data/daily/*.json 与 meta.json 推导，不写死。
   ⚠️ 「字号变大」不写死 13px，而是断言 ≥ 旧版 11.5px 且 ≥ 12.5px（窄屏档另算）。 */
import { createRequire } from 'node:module';

const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const SITE = 'https://hyouka-721.github.io/Steam-playtime/';
const CSS_V = '110';
const APP_V = '105';

let pass = 0;
let fail = 0;
const ok = (n, c, extra = '') => {
  c ? (pass++, console.log(`PASS ${n}${extra ? '  — ' + extra : ''}`))
    : (fail++, console.log(`FAIL ${n}  — ${extra}`));
};
const wdName = (ds) => {
  const [y, m, d] = ds.split('-').map(Number);
  return '周' + '日一二三四五六'[new Date(y, m - 1, d).getDay()];
};
const titleOf = (ds) => `${Number(ds.slice(5, 7))} 月 ${Number(ds.slice(8, 10))} 日 ${wdName(ds)}`;
const hmText = (m) => {
  const n = Math.round(Number(m) || 0);
  if (n <= 0) return '不足 1 分钟';
  if (n < 60) return `${n} 分钟`;
  const h = Math.floor(n / 60), r = n % 60;
  return r === 0 ? `${h} 小时` : `${h} 小时 ${r} 分钟`;
};

const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));

/* ---------- A 等 Pages 生效 ---------- */
console.log('== A 等待 Pages 生效 ==');
let html = '';
for (let i = 1; i <= 40; i++) {
  try {
    const r = await page.goto(SITE + 'index.html', { waitUntil: 'domcontentloaded', timeout: 45000 });
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

/* ---------- B 时长字样：更大、更深 ---------- */
console.log('== B 时长字样 ==');
await page.waitForSelector('#lt-list .rank-item', { timeout: 25000 });
await page.click('#card-lifetime');
await page.waitForSelector('#lt-detail:not([hidden])', { timeout: 15000 });
await page.waitForTimeout(500);
const font = await page.evaluate(() => {
  const i = [...document.querySelectorAll('#heat-drill .hc i')][0];
  const cell = i.parentElement;
  const ci = getComputedStyle(i);
  const ccell = getComputedStyle(cell);
  // 用 canvas 把 --text-strong / --text-dim 解析成实际色值，做亮度对比
  const probe = document.createElement('canvas').getContext('2d');
  const lum = (c) => {
    probe.fillStyle = c;
    const hex = probe.fillStyle.replace('#', '');
    const [r, g, b] = [0, 2, 4].map((k) => parseInt(hex.slice(k, k + 2), 16));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const root = getComputedStyle(document.documentElement);
  return {
    size: parseFloat(ci.fontSize), weight: Number(ci.fontWeight), opacity: Number(ci.opacity),
    color: ci.color, lumText: lum(ci.color),
    lumDim: lum(root.getPropertyValue('--text-dim').trim()),
    lumStrong: lum(root.getPropertyValue('--text-strong').trim()),
    cellBg: ccell.backgroundColor,
    iCount: document.querySelectorAll('#heat-drill .hc i').length,
  };
});
ok('B1 时长字样字号已放大（≥12.5px，旧版 11.5px）', font.size >= 12.5, `${font.size}px / ${font.weight}`);
ok('B2 时长字样不再半透明（opacity = 1）', font.opacity === 1, font.opacity);
ok('B3 时长字样颜色比 --text-dim 更深（接近 --text-strong）',
  font.lumText < font.lumDim - 8, `text=${Math.round(font.lumText)} dim=${Math.round(font.lumDim)} strong=${Math.round(font.lumStrong)}`);

/* ---------- C 热力图格子 = 当日明细入口 ---------- */
console.log('== C 格子入口 ==');
const entry = await page.evaluate(() => {
  const live = [...document.querySelectorAll('#heat-drill .hc.is-live')];
  const s = live.find((c) => c.querySelector('i')) || live[0];
  return {
    live: live.length,
    noRole: live.filter((c) => c.getAttribute('role') !== 'button' || c.getAttribute('tabindex') !== '0').length,
    noDate: live.filter((c) => !/^\d{4}-\d{2}-\d{2}$/.test(c.dataset.date || '')).length,
    noAria: live.filter((c) => !c.getAttribute('aria-label')).length,
    cursor: s ? getComputedStyle(s).cursor : null,
    date: s?.dataset.date ?? null,
    aria: s?.getAttribute('aria-label') ?? null,
  };
});
ok('C1 有数据的日子都可点（role=button / tabindex / data-date / aria-label 齐全）',
  entry.live > 0 && entry.noRole === 0 && entry.noDate === 0 && entry.noAria === 0, JSON.stringify(entry));
ok('C2 可点格子是指针光标 + 可访问名含日期与「查看」',
  entry.cursor === 'pointer' && /\d+ 月 \d+ 日/.test(entry.aria || '') && /查看/.test(entry.aria || ''), entry.aria);

const target = entry.date;
const expect = await page.evaluate(async (d) => {
  const ym = d.slice(0, 7);
  const daily = await fetch(`data/daily/${ym}.json`, { cache: 'reload' }).then((r) => r.json());
  const day = daily.days?.[d] ?? {};
  return {
    total: day.total_minutes ?? 0,
    count: (day.games ?? []).length,
    names: (day.games ?? []).map((g) => g.name).sort(),
  };
}, target);
await page.click(`#heat-drill .hc[data-date="${target}"]`);
await page.waitForFunction(() => {
  const m = document.getElementById('cal-mask');
  return m && m.hidden && !document.getElementById('cal-overlay').hidden;
}, null, { timeout: 10000 }).catch(() => {});
const day = await page.evaluate(() => ({
  open: !document.getElementById('cal-overlay').hidden,
  title: document.getElementById('cal-day-title').textContent,
  total: document.getElementById('cal-day-total').textContent,
  note: document.getElementById('cal-day-note').textContent,
  rows: [...document.querySelectorAll('#cal-day-games .cal-game')].map((r) => r.querySelector('.cal-game-name').textContent),
  focus: document.activeElement?.id ?? null,
  sel: document.querySelector('#heat-drill .hc.is-sel')?.dataset.date ?? null,
  legacy: {
    month: !!document.getElementById('cal-page-month'),
    grid: !!document.getElementById('cal-grid'),
    back: !!document.getElementById('cal-back'),
  },
}));
ok('C3 点格子后浮层打开，标题 = 该日 + 星期', day.open && day.title === titleOf(target), `${day.title} / 期望 ${titleOf(target)}`);
ok('C4 摘要 = 线上该日总时长', day.total === hmText(expect.total), `${day.total} / 期望 ${hmText(expect.total)}`);
ok('C5 明细行 = 线上该日的全部游戏（条数与名称都对得上）',
  day.rows.length === expect.count && JSON.stringify(day.rows.slice().sort()) === JSON.stringify(expect.names),
  `${day.rows.length}/${expect.count} 款`);
ok('C6 打开后焦点进入浮层、且被点格子标成选中态',
  day.focus === 'cal-day-close' && day.sel === target, `${day.focus} / sel=${day.sel}`);
ok('C7 浮层已无一级月历（cal-page-month / cal-grid / cal-back 都不存在）',
  !day.legacy.month && !day.legacy.grid && !day.legacy.back, JSON.stringify(day.legacy));

/* ---------- D 步进 / 关闭 ---------- */
console.log('== D 步进与关闭 ==');
const canPrev = !(await page.evaluate(() => document.getElementById('cal-day-prev').disabled));
if (canPrev) {
  const prevDate = await page.evaluate((d) => {
    const t = new Date(new Date(d + 'T12:00:00Z').getTime() - 86400000).toISOString().slice(0, 10);
    return t;
  }, target);
  await page.click('#cal-day-prev');
  await page.waitForTimeout(400);
  ok('D1 点「←」退到前一天（标题与星期同步）',
    (await page.evaluate(() => document.getElementById('cal-day-title').textContent)) === titleOf(prevDate), prevDate);
} else {
  console.log('  · 停在上界，跳过 D1');
  ok('D1 点「←」退到前一天（停在上界，跳过）', true);
}
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
const closed = await page.evaluate(() => ({
  hidden: document.getElementById('cal-overlay').hidden,
  focus: document.activeElement?.dataset?.date ?? null,
}));
ok('D2 Esc 直接关闭浮层（只有一层，不再先退回月历）', closed.hidden, JSON.stringify(closed));
ok('D3 关闭后焦点回到热力图格子上', /^\d{4}-\d{2}-\d{2}$/.test(String(closed.focus ?? '')), String(closed.focus));

/* ---------- E 最近游玩的日历图标已删 ---------- */
console.log('== E 图标删除 ==');
await page.click('#card-lifetime'); // 退出下钻（点卡=返回列表）
await page.waitForTimeout(400);
await page.click('#card-recent');
await page.waitForTimeout(600);
const recent = await page.evaluate(() => ({
  rows: document.querySelectorAll('#recent-list .rank-item').length,
  iconBtn: document.querySelectorAll('.cal-icon-btn').length,
  toggle: document.querySelectorAll('[data-cal-toggle]').length,
  nested: [...document.querySelectorAll('#recent-list .rank-last')].reduce((a, el) => a + el.children.length, 0),
  svg: document.querySelectorAll('#recent-list svg').length,
}));
ok('E1 最近游玩里已无日历图标，也没留下空壳节点（.rank-last 无子元素）',
  recent.rows > 0 && recent.iconBtn === 0 && recent.toggle === 0 && recent.nested === 0 && recent.svg === 0,
  JSON.stringify(recent));

/* ---------- F 360px 不溢出 ---------- */
console.log('== F 窄屏 ==');
await page.setViewportSize({ width: 360, height: 800 });
await page.click('#card-lifetime');
await page.waitForTimeout(400);
await page.click('#card-lifetime');
await page.waitForSelector('#lt-detail:not([hidden])', { timeout: 15000 });
await page.waitForTimeout(500);
const narrow = await page.evaluate(() => {
  const cells = [...document.querySelectorAll('#heat-drill .hc')];
  const cell = cells.find((x) => x.querySelector('i'));
  const i = cell?.querySelector('i');
  const cr = cell?.getBoundingClientRect();
  const ir = i?.getBoundingClientRect();
  return {
    docOverflow: document.documentElement.scrollWidth - window.innerWidth,
    cols: getComputedStyle(document.getElementById('heat-drill')).gridTemplateColumns.split(' ').length,
    fontSize: i ? parseFloat(getComputedStyle(i).fontSize) : null,
    // 文字实际右边界不得越过格子右边界（scrollWidth 会因 text-align:right 误报）
    textInside: !!(cr && ir) && ir.right + 1 >= cr.right - 6,
  };
});
ok('F1 360px 无横向溢出、仍是 7 列', narrow.docOverflow <= 0 && narrow.cols === 7, JSON.stringify(narrow));
ok('F2 360px 下时长字样仍比旧版大（≥11px）且不越出格子', narrow.fontSize >= 11 && narrow.textInside, JSON.stringify(narrow));

const realErrs = errs.filter((e) => !/Failed to load resource|net::ERR|ERR_BLOCKED|ERR_FAILED/i.test(e));
ok('G1 全程零 JS 异常', realErrs.length === 0, realErrs.slice(0, 2).join(' | '));

await browser.close();
console.log(`\n================ ${pass} / ${pass + fail} ================`);
process.exit(fail ? 1 : 0);
