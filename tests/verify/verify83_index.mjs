/* verify83_index.mjs — 第 83 轮（index 侧）批量体验改造回归
   用户 2026-10-31 点名除 #2 #3 #9 #17 外的全部建议，本轮落地 14 项：
     #1 合并「游戏时长 / 游戏库」两个视图   #4 页脚去重   #5 窄屏两行榜单
     #6 flags 内联   #7 活动热力图   #8 封面主色进度条   #10 悬停底纹
     #11 数字滚动 + 视图过渡   #12 全成就勋章墙   #13 深色主题
     #14 临门一脚推荐   #15 阶段报告   #16 时间换算   #18 详情扩展
     #19 深链   #20 manifest   #21 周目标与节奏   （#6 由日历二级承载，见 D8）

   第 84 轮追加：离线可用（Service Worker 与观影页共用一个，见 docs/sw.js）+ 本地封面。
   断言分组：A 静态（12） / B 运行时（16） / C 离线（5） */
import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const BASE = process.env.BASE || 'http://127.0.0.1:8895/index.html';
const DOCS = 'C:/Users/33329/WorkBuddy/2026-10-13-18-17-49/steam-playtime/docs';

let pass = 0, fail = 0;
const ok = (n, c, extra = '') => {
  c ? (pass++, console.log(`PASS ${n}${extra ? '  — ' + extra : ''}`))
    : (fail++, console.log(`FAIL ${n}  — ${extra}`));
};
const rd = (f) => fs.readFileSync(`${DOCS}/${f}`, 'utf8').replace(/\r\n/g, '\n');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const html = rd('index.html'), js = strip(rd('app.js')), css = strip(rd('style.css'));
const meta = JSON.parse(rd('data/meta.json'));

/* ================= A 静态 ================= */
console.log('== A 静态 ==');
ok('A1 概览只剩四张卡，且「游戏库」卡已移除',
  (html.match(/class="card card-nav/g) || []).length === 4 && !html.includes('card-games'));

ok('A2 独立的「时间轴」视图已删除（合并进游戏时长视图）',
  !html.includes('id="view-timeline"') && html.includes('id="lt-mode"'));

ok('A3 热力图 / 推荐条 / 报告容器都在位',
  html.includes('id="heatmap"') && html.includes('id="panel-suggest"') &&
  html.includes('id="report"') && html.includes('id="pace"') && html.includes('id="convert"'));

ok('A4 勋章墙挪进「成就」视图（不在游戏时长视图里抢首屏）',
  /id="view-ach"[\s\S]{0,400}id="panel-badges"/.test(html));

ok('A5 页脚不再重复「数据生成于 …」（卡片已表达同一信息）',
  !html.includes('footer-gen'));

ok('A6 四套主题：cream / mint / dawn / night',
  ["'cream'", "'mint'", "'dawn'", "'night'"].every((t) => js.includes(t)),
  (js.match(/id: '\w+'/g) || []).join(','));

ok('A7 深色主题在 CSS 里有完整变量块', /\[data-theme="night"\]\s*\{[\s\S]{200,}?\}/.test(css));

ok('A8 构建期产出封面主色：meta.games_lifetime 带 bar 字段',
  Object.values(meta.games_lifetime).filter((g) => g.bar).length > 40,
  `${Object.values(meta.games_lifetime).filter((g) => g.bar).length} 款`);

ok('A9 构建期产出「临门一脚」列表 meta.ach_almost', Array.isArray(meta.ach_almost),
  JSON.stringify(meta.ach_almost?.slice(0, 2) ?? null));

ok('A10 manifest 与 192/512 图标齐备',
  fs.existsSync(`${DOCS}/manifest.webmanifest`) &&
  fs.existsSync(`${DOCS}/img/icon-192.png`) && fs.existsSync(`${DOCS}/img/icon-512.png`));

ok('A11 窄屏规则：进度条不再被 display:none 掉',
  !/\.rank-bar,\s*\.rank-last\s*\{\s*display:\s*none/.test(css) &&
  /\.rank-bar\s*\{[^}]*grid-row:\s*2/.test(css));

ok('A12 新模块在 app.js 里都有实现（8 个关键函数）',
  ['renderHeat', 'renderBadges', 'renderSuggest', 'renderReport', 'renderPace', 'renderConvert', 'renderDrillMore', 'syncHash']
    .every((f) => new RegExp(`function ${f}\\(`).test(js)));

/* ================= B 运行时 ================= */
console.log('== B 运行时 ==');
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.route(/^https?:\/\/(cdn\.cloudflare\.steamstatic\.com|media\.steampowered\.com|steamcdn-a\.akamaihd\.net|cdn\.jsdelivr\.net)\//, (r) => r.abort());
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });

await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForSelector('#lt-list .rank-item', { timeout: 20000 });
await page.waitForTimeout(1400); // 等数字滚动落地

const heat = await page.evaluate(() => {
  const cells = [...document.querySelectorAll('#heatmap .hc')];
  return { total: cells.length, lit: cells.filter((c) => !/h0/.test(c.className)).length };
});
ok('B1 热力图 18 周 × 7 天 = 126 格，且有已点亮的日子',
  heat.total === 126 && heat.lit > 0, JSON.stringify(heat));

const card = await page.evaluate(() => document.getElementById('c-lifetime').textContent.trim());
ok('B2 概览卡数字滚动后落在真实值上',
  card === `${Math.floor(meta.stats.lifetime_minutes / 60)} h` ||
  card.startsWith(`${Math.floor(meta.stats.lifetime_minutes / 60)} h`), card);

const barColor = await page.evaluate(() => {
  const el = document.querySelector('#lt-list .rank-item .rank-bar > span');
  return el ? el.getAttribute('style') : '';
});
ok('B3 排行榜进度条用的是封面主色（inline 里是 hsl 而非固定色板）',
  /hsl\(/.test(barColor), barColor.slice(0, 70));

const sug = await page.evaluate(() => ({
  rows: document.querySelectorAll('#panel-suggest .sg-row').length,
  items: document.querySelectorAll('#panel-suggest [data-appid]').length,
}));
ok('B4 「接下来玩什么」有内容且是可点的条目', sug.rows >= 1 && sug.items >= 1, JSON.stringify(sug));

// #1 呈现方式切换
await page.click('#lt-mode button[data-m="week"]');
await page.waitForTimeout(500);
const week = await page.evaluate(() => ({
  listHidden: document.getElementById('lt-list').hidden,
  tlHidden: document.getElementById('timeline').hidden,
  title: document.getElementById('lt-title').textContent.trim(),
  hash: location.hash,
}));
ok('B5 切到「时间轴」：榜单隐藏、时间轴出现、标题与深链同步',
  week.listHidden === true && week.tlHidden === false && week.title === '每周时间轴' && week.hash.includes('week'),
  JSON.stringify(week));
await page.click('#lt-mode button[data-m="rank"]');
await page.waitForTimeout(400);
ok('B6 切回「排名」：状态复位', await page.evaluate(() =>
  !document.getElementById('lt-list').hidden && document.getElementById('timeline').hidden));

// #10 悬停底纹
await page.hover('#lt-list .rank-item');
await page.waitForTimeout(450);
const hero = await page.evaluate(() => {
  const el = document.getElementById('hero-bg');
  return el ? { exists: true, opacity: getComputedStyle(el).opacity, bg: el.style.backgroundImage.slice(0, 40) } : { exists: false };
});
ok('B7 悬停榜单行时页底浮出该游戏封面底纹（第 84 轮起优先用本地封面）',
  hero.exists && hero.opacity !== '0' && /img\/covers\//.test(hero.bg), JSON.stringify(hero));

// #12 勋章墙（在成就视图）
await page.click('#card-ach');
await page.waitForTimeout(700);
const badges = await page.evaluate(() => ({
  count: document.querySelectorAll('#badges .badge').length,
  visible: !document.getElementById('panel-badges').hidden,
  view: document.getElementById('view-ach').classList.contains('active'),
}));
ok('B8 成就页顶部出现全成就勋章墙，数量与 meta.ach_perfect 一致',
  badges.visible && badges.count === meta.ach_perfect.length, JSON.stringify(badges));

// #15 #16 #21 报告
await page.click('#card-data');
await page.waitForTimeout(600);
const report = await page.evaluate(() => ({
  cells: document.querySelectorAll('#report .rp-cell').length,
  ring: !!document.querySelector('#pace .pace-ring'),
  cv: document.querySelectorAll('#convert .cv-item').length,
  range: (document.getElementById('report-range') || {}).textContent || '',
}));
ok('B9 阶段报告：四块统计 + 最常玩 + 周目标环 + 四条换算',
  report.cells >= 4 && report.ring && report.cv === 4 && /→/.test(report.range), JSON.stringify(report));

const beforeGoal = await page.evaluate(() => localStorage.getItem('weekGoalH'));
await page.fill('#week-goal', '8');
await page.dispatchEvent('#week-goal', 'change');
await page.waitForTimeout(300);
const afterGoal = await page.evaluate(() => ({
  stored: localStorage.getItem('weekGoalH'),
  txt: document.querySelector('#pace .pace-main').textContent,
}));
ok('B10 周目标可改并持久化（8h 立刻写进 localStorage 与文案）',
  afterGoal.stored === '8' && /目标 8 h/.test(afterGoal.txt), `${beforeGoal} → ${JSON.stringify(afterGoal)}`);

// #18 详情扩展
await page.click('#card-lifetime');
await page.waitForTimeout(500);
await page.click('#lt-list .rank-item');
await page.waitForTimeout(1200);
const dm = await page.evaluate(() => ({
  share: !!document.querySelector('#drill-more .dm-share'),
  kv: document.querySelectorAll('#drill-more .dm-kv').length,
}));
ok('B11 单游戏详情多了「占终身比重 + 期段信息」', dm.share && dm.kv >= 3, JSON.stringify(dm));

// #19 深链：直接带 hash 打开
await page.goto(`${BASE}#/data`, { waitUntil: 'networkidle' });
await page.waitForTimeout(900);
ok('B12 深链 #/data 能直接落到数据视图',
  await page.evaluate(() => document.getElementById('view-data').classList.contains('active')));

await page.goto(`${BASE}#/lifetime/week`, { waitUntil: 'networkidle' });
await page.waitForTimeout(900);
ok('B13 深链 #/lifetime/week 直接落在时间轴画法',
  await page.evaluate(() => !document.getElementById('timeline').hidden));

// #13 深色主题
await page.evaluate(() => localStorage.setItem('theme', 'night'));
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(900);
const night = await page.evaluate(() => {
  const bg = getComputedStyle(document.body).backgroundColor;
  const m = bg.match(/\d+/g).map(Number);
  return { theme: document.documentElement.dataset.theme, bg, lum: (m[0] * 0.299 + m[1] * 0.587 + m[2] * 0.114) / 255 };
});
ok('B14 深色主题生效且底色确实变暗（亮度 < 0.25）',
  night.theme === 'night' && night.lum < 0.25, JSON.stringify(night));

// #5 窄屏两行（先切回「排名」，否则榜单是隐藏的）
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(500);
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(700);
const mobile = await page.evaluate(() => {
  const bar = document.querySelector('#lt-list .rank-item .rank-bar');
  const row = document.querySelector('#lt-list .rank-item');
  const br = bar.getBoundingClientRect();
  const rr = row.getBoundingClientRect();
  return {
    barVisible: getComputedStyle(bar).display !== 'none' && br.height > 0,
    secondLine: br.top > rr.top + 40,
    overflow: document.documentElement.scrollWidth - window.innerWidth,
  };
});
ok('B15 390px 下进度条仍在，并落到第二行、无横向溢出',
  mobile.barVisible && mobile.secondLine && mobile.overflow <= 0, JSON.stringify(mobile));

/* ================= C 离线（第 84 轮） ================= */
console.log('== C 离线 ==');
{
  // 干净上下文：不 abort、不用旧缓存；先在线跑一次让 SW 接管并写缓存，再断网刷新
  const offCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await offCtx.route(/^https?:\/\/(cdn\.cloudflare\.steamstatic\.com|media\.steampowered\.com|cdn\.jsdelivr\.net)\//, (r) => r.abort());
  const off = await offCtx.newPage();
  const offErrs = [];
  off.on('pageerror', (e) => offErrs.push(String(e)));
  await off.goto(BASE, { waitUntil: 'load', timeout: 60000 });
  await off.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller !== null, null, { timeout: 20000 }).catch(() => {});
  await off.waitForTimeout(1200);

  const swState = await off.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    const keys = await caches.keys();
    let shellHasIndex = false;
    if (keys.includes('app-shell-v1')) {
      const c = await caches.open('app-shell-v1');
      shellHasIndex = !!(await c.match('index.html')) || !!(await c.match('./'));
    }
    return { controlled: !!reg && !!reg.active, keys, shellHasIndex };
  });
  ok('C1 SW 已注册并接管首页，外壳缓存里有 index.html',
    swState.controlled && swState.shellHasIndex, JSON.stringify(swState.keys));

  // 断网后刷新：导航回落缓存 → 页面仍能渲染
  await offCtx.setOffline(true);
  let offlineOk = false;
  let offlineRows = 0;
  try {
    await off.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
    await off.waitForTimeout(900);
    offlineOk = await off.evaluate(() => {
      const v = document.getElementById('c-lifetime');
      return !!v && v.textContent.trim() !== '' && v.textContent.trim() !== '—';
    });
    offlineRows = await off.evaluate(() => document.querySelectorAll('#lt-list .rank-item').length);
  } catch (e) {
    offlineOk = false;
  }
  ok('C2 断网刷新后页面仍能打开并渲染出数据（不是空白/报错页）',
    offlineOk && offlineRows > 20, `ok=${offlineOk} rows=${offlineRows}`);

  // 本地封面在离线时仍然完整（说明命中了 SW 缓存，而不是 404）
  const coverOk = await off.evaluate(() => {
    const imgs = [...document.querySelectorAll('#lt-list img.rank-capsule')].slice(0, 3);
    return imgs.length > 0 && imgs.every((i) => i.complete && i.naturalWidth > 0);
  });
  ok('C3 离线状态下前几张封面仍加载成功（来自缓存，非 404）', coverOk);

  const offReal = offErrs.filter((e) => !/Failed to load resource|net::ERR|ERR_BLOCKED|ERR_FAILED/i.test(e));
  ok('C4 离线过程零 JS 异常', offReal.length === 0, offReal.slice(0, 2).join(' | '));

  // 恢复网络后回到最新（网络优先，不是永久吃缓存）
  await offCtx.setOffline(false);
  const fresh = await off.evaluate(async () => {
    const r = await fetch('data/meta.json', { cache: 'no-store' });
    return r.ok;
  });
  ok('C5 恢复网络后数据仍走网络（网络优先语义未被破坏）', fresh);
  await offCtx.close();
}

const realErrs = errs.filter((e) => !/Failed to load resource|net::ERR|ERR_BLOCKED|ERR_FAILED/i.test(e));
ok('B16 全程零 JS 异常（含视图过渡）', realErrs.length === 0, realErrs.slice(0, 3).join(' | '));

await browser.close();
console.log(`\n================ ${pass} / ${pass + fail} ================`);
process.exit(fail ? 1 : 0);
