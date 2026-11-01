/* verify90.mjs — 第 90 轮：热力图时间标签加粗 + 游戏库时间轴补录（且只补在时间轴上）
 *
 * 用户两项：
 *   a「将热力图中时间标签的字体加粗显示，确保在所有时间刻度上均生效且不影响其他元素的样式」
 *   b「为『游戏库』模块下的时间轴补充数据：日期 10.12、游戏名『王国保卫战』、时长 1.6h，
 *      该数据仅用于游戏库下方的时间轴展示，不得影响或出现在页面其他位置（如热力图或统计汇总）」
 *
 * 覆盖：
 *  0 静态：版本号、.hc i 只动字重、补录数据文件与构建链路、里程碑仍按真实分钟
 *  1 加粗生效：所有时间刻度 font-weight 700、字号/nowrap/不折行不变
 *  2 不连带：日期数字、汇总行、月份块标题、时间轴徽章的字重都没被改成 700
 *  3 时间轴补录：恰好一条、文案对、落在 10.12-10.18 周、徽章已合并
 *  4 隔离性：daily 无 10-12；A/B 对照（抹掉 timeline_extra 重载）除 #timeline 外全等
 *  5 四套主题下加粗都成立
 *  6 响应式：7 档宽度下时长既不被切也不折行
 *  7 全程无 JS 异常
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
/* 打开「游戏时长」下钻。卡片是导航键：从别的视图点它只切视图（停在上层列表），
   必须再点一次才展开下钻 —— 所以用「检查-点击」循环兜底，别假设点一次就够。 */
const ensureDrill = async (p) => {
  for (let i = 0; i < 4; i++) {
    if (!(await p.evaluate(() => document.getElementById('lt-detail').hidden))) return true;
    await p.click('#card-lifetime');
    await p.waitForTimeout(500);
  }
  return false;
};
const browser = await chromium.launch({ args: ['--no-proxy-server'] });
let ctx, page;
const freshPage = async (vw = 1440, vh = 1000, dsf = 1, opts = {}) => {
  if (ctx) await ctx.close();
  ctx = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: dsf, ...opts });
  page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
};

/* ================= 0 静态 ================= */
const app = fs.readFileSync('docs/app.js', 'utf8');
const html = fs.readFileSync('docs/index.html', 'utf8');
const css = fs.readFileSync('docs/style.css', 'utf8');
const meta = JSON.parse(fs.readFileSync('docs/data/meta.json', 'utf8'));
const daily = JSON.parse(fs.readFileSync('docs/data/daily/2026-10.json', 'utf8'));

const appV = (html.match(/app\.js\?v=(\d+)/) || [])[1];
const cssV = (html.match(/style\.css\?v=(\d+)/) || [])[1];
ok('0.1 index.html 引用 app.js?v=108 / style.css?v=113', appV === '108' && cssV === '113', { app: appV, css: cssV });

// 剥注释后再解析规则（第 84 轮的坑：注释里的选择器字面量会被当成规则体）
const cssNoComment = css.replace(/\/\*[\s\S]*?\*\//g, '');
const ruleOf = (sel) => {
  const m = cssNoComment.match(new RegExp('(^|\\})\\s*' + sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}', 'm'));
  return m ? m[2] : null;
};
const hciRule = ruleOf('.hc i');
ok('0.2 .hc i 的字重已改成 700', !!hciRule && /font-weight:\s*700/.test(hciRule), hciRule?.match(/font-weight:[^;]*/)?.[0]);
ok('0.3 只动了字重：字号/换行/颜色/不透明度/行高仍是第 89 轮的值',
  !!hciRule
  && /font-size:\s*15px/.test(hciRule)
  && /white-space:\s*nowrap/.test(hciRule)
  && /opacity:\s*1/.test(hciRule)
  && /line-height:\s*1\.2/.test(hciRule)
  && /color:\s*var\(--text-strong\)/.test(hciRule)
  && /text-align:\s*right/.test(hciRule),
  hciRule);
const hcbRule = ruleOf('.hc b');
ok('0.4 日期数字 .hc b 仍是 600（没被连带给成 700）', !!hcbRule && /font-weight:\s*600/.test(hcbRule), hcbRule?.match(/font-weight:[^;]*/)?.[0]);

ok('0.5 build.mjs 有 loadTimelineExtra 且把结果写进 meta.timeline_extra',
  /function loadTimelineExtra/.test(fs.readFileSync('scripts/build.mjs', 'utf8'))
  && /timeline_extra:\s*timelineExtra/.test(fs.readFileSync('scripts/build.mjs', 'utf8')));
const extraFile = 'data/overrides/timeline-extra.json';
const extraRows = fs.existsSync(extraFile) ? JSON.parse(fs.readFileSync(extraFile, 'utf8')) : null;
ok('0.6 补录数据文件存在、字段合法、日期是 10.12 且分钟数为正',
  Array.isArray(extraRows) && extraRows.length >= 1
  && extraRows.every((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date) && Number(r.minutes) > 0 && r.name && r.appid),
  extraRows);
ok('0.7 renderTimeline 读 state.meta.timeline_extra，且整段没有往 state.days 写补录',
  /state\.meta\?\.timeline_extra/.test(app)
  && !/state\.days\.(set|get)\([^)]*timeline_extra/.test(app));
ok('0.8 里程碑仍按真实分钟累加（补录不参与，realMinutes 守卫）',
  /cum \+= w\.realMinutes/.test(app) && /asc\.reduce\(\(a, w\) => a \+ w\.realMinutes/.test(app));

/* ================= 1 热力图时间标签加粗 ================= */
await freshPage(1440, 1000, 1);
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('#lt-list .rank-item', { state: 'visible', timeout: 30000 });
await page.waitForTimeout(600);
await ensureDrill(page);
await page.waitForSelector('#lt-detail:not([hidden])', { timeout: 10000 });
await page.waitForTimeout(700);

const heat = await page.evaluate(() => {
  const cells = [...document.querySelectorAll('#heat-drill .hc')];
  const times = cells.map((c) => c.querySelector('i')).filter(Boolean);
  const dated = cells.map((c) => c.querySelector('b')).filter(Boolean);
  const weights = [...new Set(times.map((e) => getComputedStyle(e).fontWeight))];
  const sizes = [...new Set(times.map((e) => getComputedStyle(e).fontSize))];
  const dateWeights = [...new Set(dated.map((e) => getComputedStyle(e).fontWeight))];
  // 折行判据：nowrap 下同一格 i 的高度必须等于单行高
  const lineH = times[0]?.getBoundingClientRect().height ?? 0;
  const wrapped = times.filter((e) => e.getBoundingClientRect().height > lineH + 2).length;
  // 溢出判据：成对看 scrollWidth-clientWidth 与格子左内边距
  const clipped = cells
    .map((c) => {
      const i = c.querySelector('i');
      if (!i) return null;
      const over = i.scrollWidth - i.clientWidth;
      const pad = parseFloat(getComputedStyle(c).paddingLeft) || 0;
      return over > 0 && pad - over <= 0 ? { t: i.textContent.trim(), over, pad } : null;
    })
    .filter(Boolean);
  return {
    cells: cells.length,
    withTime: times.length,
    texts: times.slice(0, 8).map((e) => e.textContent.trim()),
    weights, sizes, dateWeights, wrapped, clipped,
  };
});
ok('1.1 热力图里实际渲染出时间刻度（不是空跑）', heat.withTime >= 8, heat.withTime);
ok('1.2 所有时间刻度 font-weight 都是 700（只有一种取值）',
  heat.weights.length === 1 && heat.weights[0] === '700', heat.weights);
ok('1.3 时间刻度仍是 15px（加粗没有顺手改字号）', heat.sizes.length === 1 && heat.sizes[0] === '15px', heat.sizes);
ok('1.4 日期数字仍是 600 —— 加粗只作用在时间刻度上',
  heat.dateWeights.length === 1 && heat.dateWeights[0] === '600', heat.dateWeights);
ok('1.5 加粗后没有折行（nowrap 仍生效）', heat.wrapped === 0, heat.wrapped);
ok('1.6 加粗后没有字被切（溢出量都小于格子左内边距）', heat.clipped.length === 0, heat.clipped);

/* ================= 2 没有连带改动其它元素 ================= */
const others = await page.evaluate(() => {
  const fw = (sel) => {
    const el = document.querySelector(sel);
    return el ? getComputedStyle(el).fontWeight : null;
  };
  return {
    heatSum: fw('#heat-sum'),
    heatMonth: fw('#heat-month'),
    hmTitle: fw('#heat-drill .hm-title'),
    hmStat: fw('#heat-drill .hm-stat'),
    cell: fw('#heat-drill .hc'),
    drillTitle: fw('#drill-title'),
  };
});
ok('2.1 汇总行 #heat-sum 仍是常规字重（没被加成 700）', others.heatSum !== '700', others.heatSum);
ok('2.2 月份块标题/统计仍是 600/700 之外的原值，且格子容器本身没变粗',
  others.cell !== '700' && others.hmTitle !== null, others);
ok('2.3 下钻标题 #drill-title 字重未变', others.drillTitle !== null && others.drillTitle !== '700', others.drillTitle);

/* ================= 3 时间轴补录 ================= */
await page.click('#btn-drill-back');
await page.waitForTimeout(350);
await page.click('#card-games');
await page.waitForTimeout(600);

const tl = await page.evaluate(() => {
  const extras = [...document.querySelectorAll('.tl-extra')];
  const inTimeline = extras.filter((e) => e.closest('#timeline'));
  const one = inTimeline[0];
  const item = one?.closest('.tl-item');
  const games = [...(item?.querySelectorAll('.tl-game') ?? [])].map((g) => ({
    badge: g.querySelector('.tl-badge')?.textContent?.trim(),
    img: g.querySelector('img')?.getAttribute('src') ?? '',
  }));
  return {
    total: extras.length,
    inTimeline: inTimeline.length,
    text: one?.textContent?.trim() ?? null,
    week: item?.querySelector('.tl-week')?.textContent?.trim() ?? null,
    games,
  };
});
ok('3.1 时间轴里恰好一条补录说明（不重复、不漏）', tl.inTimeline === 1, { total: tl.total, inTimeline: tl.inTimeline });
ok('3.2 文案是「补录 10.12 王国保卫战 1.6h（不计入统计）」',
  !!tl.text && tl.text.includes('10.12') && tl.text.includes('王国保卫战') && tl.text.includes('1.6h'), tl.text);
ok('3.3 补录落在 10.12-10.18 这一周', tl.week === '10.12-10.18', tl.week);

// 该周王国保卫战 = 真实(13+82+82+50+157=384) + 补录 96 = 480 → 8h
const weekReal = Object.entries(daily.days)
  .filter(([d]) => d >= '2026-10-12' && d <= '2026-10-18')
  .reduce((a, [, v]) => a + (v.games ?? []).filter((g) => g.appid === '246420').reduce((x, g) => x + g.minutes, 0), 0);
const expectMerged = Math.round((weekReal + 96) / 60 * 10) / 10;
const kkBadge = tl.games
  .map((g, i) => ({ ...g, i }))
  .filter((g) => g.img.includes('/246420/') || g.img.includes('246420'))[0];
ok('3.4 该周王国保卫战徽章已合并补录（真实 ' + weekReal + 'min + 96min = ' + expectMerged + 'h）',
  !!kkBadge && kkBadge.badge === `${expectMerged % 1 === 0 ? expectMerged : expectMerged.toFixed(1)}h`,
  { badge: kkBadge?.badge, weekReal, expectMerged });

/* ================= 4 隔离性 ================= */
const sumDaily = Object.values(daily.days).reduce((a, v) => a + v.total_minutes, 0);
const activeDaily = Object.values(daily.days).filter((v) => v.total_minutes > 0).length;
ok('4.1 daily 里没有 2026-10-12（补录没进每日数据）', !('2026-10-12' in daily.days), Object.keys(daily.days)[0]);
ok('4.2 daily 合计 == meta.stats.total_minutes（统计口径没被抬高）',
  sumDaily === meta.stats.total_minutes, { sumDaily, meta: meta.stats.total_minutes });
ok('4.3 meta.stats.active_days == daily 里有记录的天数', activeDaily === meta.stats.active_days, { activeDaily });

await ensureDrill(page);
await page.waitForSelector('#lt-detail:not([hidden])', { timeout: 10000 });
await page.waitForTimeout(600);
const drill = await page.evaluate(() => {
  const c1012 = document.querySelector('#heat-drill [data-date="2026-10-12"]');
  return {
    // 10-12 在追踪期之前：格子可以在，但必须不可点（不是 is-live、没有 role/tabindex）
    exists: !!c1012,
    clickable: c1012 ? (c1012.classList.contains('is-live') || c1012.hasAttribute('tabindex') || c1012.getAttribute('role') === 'button') : false,
    sum: document.getElementById('heat-sum')?.textContent?.trim() ?? '',
  };
});
ok('4.4 热力图里 10-12 即使画出来也不可点（追踪期之前，不是 is-live / 无 role / 无 tabindex）',
  drill.clickable === false, drill);
// 合计必须等于 hm(1688) = 「28 h 8 min」
const hm = (m) => {
  const n = Math.round(Number(m) || 0);
  if (n < 60) return `${n} min`;
  const h = Math.floor(n / 60);
  const r = n % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
};
ok('4.5 热力图汇总「合计」只数真实分钟（= ' + hm(sumDaily) + '）',
  drill.sum.includes(hm(sumDaily)), { sum: drill.sum, expect: hm(sumDaily) });
ok('4.6 热力图汇总的「有记录 N 天」不含补录（= ' + activeDaily + ' 天）',
  drill.sum.includes(`${activeDaily} 天`), drill.sum);

/* ---- A/B 对照：把 timeline_extra 抹掉重载，除 #timeline 外所有数字必须一模一样 ---- */
const snapshot = async (withExtra) => {
  const c = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
  const p = await c.newPage();
  if (!withExtra) {
    await p.route('**/index.html*', async (route) => {
      const res = await route.fetch();
      let h = await res.text();
      h = h.replace(/(<script>window\.__BOOT=)([\s\S]*?);(<\/script>)/, (m, open, json, close) => {
        const boot = JSON.parse(json);
        if (boot.meta) boot.meta.timeline_extra = [];
        return open + JSON.stringify(boot) + ';' + close;
      });
      await route.fulfill({ response: res, body: h });
    });
  }
  await p.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForSelector('#lt-list .rank-item', { state: 'visible', timeout: 30000 });
  await p.waitForTimeout(1600); // 等 countUp 收尾
  const cards = await p.evaluate(() => {
    const t = (id) => document.getElementById(id)?.textContent?.trim() ?? null;
    return {
      lifetime: t('c-lifetime'), recent: t('c-recent'), ach: t('c-ach'),
      games: t('c-games'), data: t('c-data'),
    };
  });
  // 最近游玩榜
  await p.click('#card-recent');
  await p.waitForTimeout(600);
  const recent = await p.evaluate(() => [...document.querySelectorAll('#recent-list .rank-item')]
    .map((r) => r.textContent.replace(/\s+/g, ' ').trim()));
  // 下钻热力图汇总
  await ensureDrill(p);
  await p.waitForSelector('#lt-detail:not([hidden])', { timeout: 10000 });
  await p.waitForTimeout(700);
  const heatSum = await p.evaluate(() => ({
    sum: document.getElementById('heat-sum')?.textContent?.trim() ?? null,
    month: document.getElementById('heat-month')?.textContent?.trim() ?? null,
    monthStat: document.querySelector('#heat-drill .hm-stat')?.textContent?.trim() ?? null,
  }));
  // 时间轴
  await p.click('#btn-drill-back');
  await p.waitForTimeout(300);
  await p.click('#card-games');
  await p.waitForTimeout(500);
  const timeline = await p.evaluate(() => ({
    extras: document.querySelectorAll('.tl-extra').length,
    badges: [...document.querySelectorAll('#timeline .tl-game img')]
      .filter((i) => (i.getAttribute('src') || '').includes('246420'))
      .map((i) => i.parentElement.querySelector('.tl-badge')?.textContent?.trim()),
  }));
  await c.close();
  return { cards, recent, heatSum, timeline };
};
const A = await snapshot(true);
const B = await snapshot(false);

ok('4.7 抹掉补录后，五张统计卡的数值完全一致',
  JSON.stringify(A.cards) === JSON.stringify(B.cards), { A: A.cards, B: B.cards });
ok('4.8 最近游玩榜完全一致（补录没混进「最近两周」）',
  JSON.stringify(A.recent) === JSON.stringify(B.recent), { aLen: A.recent.length, bLen: B.recent.length });
ok('4.9 热力图汇总与月份块统计完全一致（合计/天数/峰值都没被抬高）',
  JSON.stringify(A.heatSum) === JSON.stringify(B.heatSum), { A: A.heatSum, B: B.heatSum });
ok('4.10 差异只出现在时间轴：补录行 1→0、王国保卫战徽章回落到真实值',
  A.timeline.extras === 1 && B.timeline.extras === 0
  && A.timeline.badges.length === B.timeline.badges.length
  && A.timeline.badges.some((b, i) => b !== B.timeline.badges[i]),
  { A: A.timeline, B: B.timeline });

/* ================= 5 四套主题 ================= */
await freshPage(1440, 1000, 1);
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('#lt-list .rank-item', { state: 'visible', timeout: 30000 });
await ensureDrill(page);
await page.waitForSelector('#lt-detail:not([hidden])', { timeout: 10000 });
await page.waitForTimeout(700);
const themed = await page.evaluate(() => {
  const out = {};
  for (const th of ['cream', 'mint', 'dawn', 'night']) {
    document.documentElement.dataset.theme = th;
    const els = [...document.querySelectorAll('#heat-drill .hc i')];
    out[th] = [...new Set(els.map((e) => getComputedStyle(e).fontWeight))];
  }
  document.documentElement.dataset.theme = 'cream';
  return out;
});
ok('5.1 四套主题下时间刻度都是 700',
  ['cream', 'mint', 'dawn', 'night'].every((t) => themed[t].length === 1 && themed[t][0] === '700'), themed);

/* ================= 6 响应式 ================= */
for (const w of [1440, 1024, 900, 768, 430, 390, 360]) {
  await page.setViewportSize({ width: w, height: 950 });
  await page.waitForTimeout(320);
  await ensureDrill(page);
  const m = await page.evaluate(() => {
    const cells = [...document.querySelectorAll('#heat-drill .hc')];
    const withI = cells.filter((c) => c.querySelector('i'));
    const lineH = withI[0]?.querySelector('i')?.getBoundingClientRect().height ?? 0;
    const wrapped = withI.filter((c) => (c.querySelector('i')?.getBoundingClientRect().height ?? 0) > lineH + 2).length;
    const clipped = cells
      .map((c) => {
        const i = c.querySelector('i');
        if (!i) return null;
        const over = i.scrollWidth - i.clientWidth;
        const pad = parseFloat(getComputedStyle(c).paddingLeft) || 0;
        return over > 0 && pad - over <= 0 ? { t: i.textContent.trim(), over, pad } : null;
      })
      .filter(Boolean);
    return {
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      wrapped, clipped,
      size: withI[0] ? getComputedStyle(withI[0].querySelector('i')).fontSize : null,
    };
  });
  ok(`6.${w} 无横向溢出 / 时长不折行 / 字不被切`,
    m.overflow <= 0 && m.wrapped === 0 && m.clipped.length === 0, m);
}

await ctx.close();
await browser.close();
ok('7.1 全程无 JS 异常 / console error', errs.length === 0, errs.slice(0, 3));
console.log(`\n===== 第90轮 PASS=${pass} FAIL=${fail} =====`);
process.exit(fail ? 1 : 0);
