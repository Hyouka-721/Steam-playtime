/* verify83_index.mjs — 游戏站体验改造回归（第 83→85 轮的净结果）
   第 83 轮铺开 14 项；第 84 轮加封面本地化 + 离线；第 85 轮按用户要求**回退三项**：
     · #8 封面主色进度条  → 回到固定十色板
     · #14「接下来玩什么」 → 整块移除（含 meta.ach_almost）
     · 「游戏时长 / 时间轴」视图合并 → 恢复成两个独立视图（五张卡）
   并新增：活动热力图从「游戏时长」移到「数据」选项卡下。

   断言分组：A 静态（12） / B 运行时（15） / C 离线（5） */
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
ok('A1 概览恢复五张卡，且「游戏库」卡（#card-games）回来了',
  (html.match(/class="card card-nav/g) || []).length === 5 &&
  html.includes('id="card-games"') && html.includes('id="c-games"'));

ok('A2 独立的「时间轴」视图恢复（#view-timeline 存在，且不在游戏时长视图里）',
  /<section class="view" id="view-timeline">[\s\S]{0,400}id="timeline"/.test(html) &&
  !/id="view-lifetime"[\s\S]{0,3000}id="timeline"/.test(html));

ok('A3 热力图只出现在下钻界面（#heat-drill + 月份导航），数据页已不含热力图',
  html.includes('id="heat-drill"') && html.includes('id="heat-month"') &&
  html.includes('id="heat-prev"') && !html.includes('id="heatmap"') &&
  !html.includes('panel-heat'));

ok('A4 「接下来玩什么」已整体移除（无容器 / 无函数 / 无条目）',
  !html.includes('panel-suggest') && !js.includes('renderSuggest') && !js.includes('sg-item'));

ok('A5 排名/时间轴 的分段控件与 setLtMode 已移除',
  !html.includes('id="lt-mode"') && !js.includes('setLtMode') && !js.includes('ltMode'));

ok('A6 全成就勋章墙仍在成就视图顶部', /id="view-ach"[\s\S]{0,400}id="panel-badges"/.test(html));

ok('A7 页脚仍不重复「数据生成于 …」', !html.includes('footer-gen'));

ok('A8 四套主题齐备，night 变量块在 CSS 里',
  ["'cream'", "'mint'", "'dawn'", "'night'"].every((t) => js.includes(t)) &&
  /\[data-theme="night"\]\s*\{[\s\S]{200,}?\}/.test(css));

ok('A9 meta 回到「无封面主色、无临门一脚」的干净状态',
  Object.values(meta.games_lifetime).filter((g) => g.bar).length === 0 &&
  meta.ach_almost === undefined,
  `bar=${Object.values(meta.games_lifetime).filter((g) => g.bar).length} almost=${String(meta.ach_almost)}`);

ok('A10 manifest 与 192/512 图标仍在',
  fs.existsSync(`${DOCS}/manifest.webmanifest`) &&
  fs.existsSync(`${DOCS}/img/icon-192.png`) && fs.existsSync(`${DOCS}/img/icon-512.png`));

ok('A11 窄屏两行榜单规则仍在（进度条没有被 display:none）',
  !/\.rank-bar,\s*\.rank-last\s*\{\s*display:\s*none/.test(css) &&
  /\.rank-bar\s*\{[^}]*grid-row:\s*2/.test(css));

ok('A12 保留的新模块函数齐全（热力图/勋章/报告/目标/换算/详情/深链）',
  ['renderDrill', 'stepHeatMonth', 'renderBadges', 'renderReport', 'renderPace', 'renderConvert', 'renderDrillMore', 'syncHash', 'countUp']
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

await page.click('#lt-list .rank-item');   // 进入下钻：月历热力图
await page.waitForTimeout(900);
const heat = await page.evaluate(() => {
  const cells = [...document.querySelectorAll('#heat-drill .hc')];
  const real = cells.filter((c) => !c.classList.contains('is-blank'));
  return {
    total: cells.length,
    real: real.length,
    lit: real.filter((c) => / h[1-4]/.test(' ' + c.className)).length,
    month: (document.getElementById('heat-month').textContent || '').trim(),
  };
});
ok('B1 下钻是月历热力图：格数是 7 的倍数、覆盖整月、有已点亮的日期',
  heat.total % 7 === 0 && heat.real >= 28 && heat.real <= 31 && heat.lit > 0 &&
  /\d{4} 年 \d{1,2} 月/.test(heat.month), JSON.stringify(heat));
await page.click('#btn-drill-back');
await page.waitForTimeout(500);

const card = await page.evaluate(() => document.getElementById('c-lifetime').textContent.trim());
ok('B2 概览卡数字滚动后落在真实值上',
  card.startsWith(`${Math.floor(meta.stats.lifetime_minutes / 60)} h`), card);

const bar = await page.evaluate(() => {
  const el = document.querySelector('#lt-list .rank-item .rank-bar > span');
  return el ? el.getAttribute('style') : '';
});
ok('B3 进度条回到固定色板（首行 = topPalette 第一色 #f0a35c，不再有 hsl）',
  /#f0a35c/i.test(bar) && !/hsl\(/.test(bar), bar.slice(0, 70));

await page.click('#card-games');
await page.waitForTimeout(700);
const tlView = await page.evaluate(() => ({
  active: document.getElementById('view-timeline').classList.contains('active'),
  items: document.querySelectorAll('#timeline .tl-item').length,
  hint: (document.getElementById('tl-hint').textContent || '').trim(),
  ltOff: !document.getElementById('view-lifetime').classList.contains('active'),
}));
ok('B4 点「游戏库」进入独立时间轴视图（有周条目、hint 有文案、游戏时长视图已退出）',
  tlView.active && tlView.items > 0 && tlView.hint !== '—' && tlView.ltOff, JSON.stringify(tlView));

await page.click('#card-lifetime');
await page.waitForTimeout(600);
const b5 = await page.evaluate(() => ({
  lt: document.getElementById('view-lifetime').classList.contains('active'),
  tl: document.getElementById('view-timeline').classList.contains('active'),
  hash: location.hash,
  active: (document.querySelector('.view.active') || {}).id || '',
}));
ok('B5 点回「游戏时长」：视图复位且深链同步为 #/lifetime',
  b5.lt && !b5.tl && b5.hash === '#/lifetime', JSON.stringify(b5));

await page.goto(`${BASE}#/timeline`, { waitUntil: 'networkidle' });
await page.waitForTimeout(900);
ok('B6 深链 #/timeline 直接落在时间轴视图',
  await page.evaluate(() => document.getElementById('view-timeline').classList.contains('active')));

await page.goto(`${BASE}#/data`, { waitUntil: 'networkidle' });
await page.waitForTimeout(900);
const dataView = await page.evaluate(() => ({
  active: document.getElementById('view-data').classList.contains('active'),
  hasHeat: !!document.getElementById('heatmap') || !!document.querySelector('#panel-heat'),
  reportCells: document.querySelectorAll('#report .rp-cell').length,
}));
ok('B7 深链 #/data 生效；数据页只留报告，热力图已移走',
  dataView.active && !dataView.hasHeat && dataView.reportCells >= 4, JSON.stringify(dataView));

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
await page.hover('#lt-list .rank-item');
await page.waitForTimeout(450);
const hero = await page.evaluate(() => {
  const el = document.getElementById('hero-bg');
  return el ? { exists: true, opacity: getComputedStyle(el).opacity, bg: el.style.backgroundImage.slice(0, 60) } : { exists: false };
});
ok('B8 悬停榜单行时页底浮出该游戏底纹（本地封面优先）',
  hero.exists && hero.opacity !== '0' && /img\/covers\//.test(hero.bg), JSON.stringify(hero));

await page.click('#card-ach');
await page.waitForTimeout(800);
const badges = await page.evaluate(() => ({
  count: document.querySelectorAll('#badges .badge').length,
  visible: !document.getElementById('panel-badges').hidden,
}));
ok('B9 成就页全成就勋章墙数量与 meta.ach_perfect 一致',
  badges.visible && badges.count === meta.ach_perfect.length, JSON.stringify(badges));

await page.click('#card-data');
await page.waitForTimeout(700);
const report = await page.evaluate(() => ({
  cells: document.querySelectorAll('#report .rp-cell').length,
  ring: !!document.querySelector('#pace .pace-ring'),
  cv: document.querySelectorAll('#convert .cv-item').length,
  range: (document.getElementById('report-range') || {}).textContent || '',
}));
ok('B10 阶段报告：四块统计 + 最常玩 + 周目标环 + 四条换算',
  report.cells >= 4 && report.ring && report.cv === 4 && /→/.test(report.range), JSON.stringify(report));

await page.fill('#week-goal', '9');
await page.dispatchEvent('#week-goal', 'change');
await page.waitForTimeout(300);
ok('B11 周目标可改并持久化（9h 立刻写进 localStorage 与文案）',
  await page.evaluate(() => localStorage.getItem('weekGoalH') === '9' &&
    /目标 9 h/.test(document.querySelector('#pace .pace-main').textContent)));

await page.click('#card-lifetime');
await page.waitForTimeout(500);
await page.click('#lt-list .rank-item');
await page.waitForTimeout(1200);
const dm = await page.evaluate(() => ({
  share: !!document.querySelector('#drill-more .dm-share'),
  kv: document.querySelectorAll('#drill-more .dm-kv').length,
}));
ok('B12 单游戏详情仍有「占终身比重 + 期段信息」', dm.share && dm.kv >= 3, JSON.stringify(dm));

await page.evaluate(() => localStorage.setItem('theme', 'night'));
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(900);
const night = await page.evaluate(() => {
  const bg = getComputedStyle(document.body).backgroundColor;
  const m = bg.match(/\d+/g).map(Number);
  return { theme: document.documentElement.dataset.theme, bg, lum: (m[0] * 0.299 + m[1] * 0.587 + m[2] * 0.114) / 255 };
});
ok('B13 深色主题生效且底色确实变暗（亮度 < 0.25）',
  night.theme === 'night' && night.lum < 0.25, JSON.stringify(night));

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(600);
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
ok('B14 390px 下进度条仍在、落到第二行、无横向溢出',
  mobile.barVisible && mobile.secondLine && mobile.overflow <= 0, JSON.stringify(mobile));

const realErrs = errs.filter((e) => !/Failed to load resource|net::ERR|ERR_BLOCKED|ERR_FAILED/i.test(e));
ok('B15 全程零 JS 异常', realErrs.length === 0, realErrs.slice(0, 3).join(' | '));

/* ================= C 离线 ================= */
console.log('== C 离线 ==');
{
  const offCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await offCtx.route(/^https?:\/\/(cdn\.cloudflare\.steamstatic\.com|media\.steampowered\.com|cdn\.jsdelivr\.net)\//, (r) => r.abort());
  const off = await offCtx.newPage();
  const offErrs = [];
  off.on('pageerror', (e) => offErrs.push(String(e)));
  await off.goto(BASE, { waitUntil: 'load', timeout: 60000 });
  await off.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller !== null, null, { timeout: 20000 }).catch(() => {});
  await off.waitForTimeout(1200);
  // 再在线刷一次：首次访问时 SW 尚未接管，图片请求没经过它；
  // 第二次才是真实用户场景（访问过 → 之后断网）
  await off.reload({ waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
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

  await offCtx.setOffline(true);
  let offlineOk = false;
  let rows = 0;
  try {
    await off.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
    await off.waitForTimeout(900);
    offlineOk = await off.evaluate(() => {
      const v = document.getElementById('c-lifetime');
      return !!v && v.textContent.trim() !== '' && v.textContent.trim() !== '—';
    });
    rows = await off.evaluate(() => document.querySelectorAll('#lt-list .rank-item').length);
  } catch (e) {
    offlineOk = false;
  }
  ok('C2 断网刷新后页面仍能渲染出数据（不是空白页）', offlineOk && rows > 20, `ok=${offlineOk} rows=${rows}`);

  const coverOk = await off.evaluate(() => {
    const imgs = [...document.querySelectorAll('#lt-list img.rank-capsule')].slice(0, 3);
    return imgs.length > 0 && imgs.every((i) => i.complete && i.naturalWidth > 0);
  }).catch(() => false);
  ok('C3 离线状态下前几张本地封面仍能显示（命中 SW 缓存）', coverOk);

  const offReal = offErrs.filter((e) => !/Failed to load resource|net::ERR|ERR_BLOCKED|ERR_FAILED/i.test(e));
  ok('C4 离线过程零 JS 异常', offReal.length === 0, offReal.slice(0, 2).join(' | '));

  await offCtx.setOffline(false);
  const fresh = await off.evaluate(async () => (await fetch('data/meta.json', { cache: 'no-store' })).ok);
  ok('C5 恢复网络后数据仍走网络（网络优先语义未被破坏）', fresh);
  await offCtx.close();
}

await browser.close();
console.log(`\n================ ${pass} / ${pass + fail} ================`);
process.exit(fail ? 1 : 0);
