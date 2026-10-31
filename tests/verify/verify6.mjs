/* verify6.mjs — 首屏加载慢优化验证（第 24 轮）
 * A. 源码级：并行加载 / 去 no-store / ach_stats / ensureAchDetail / 骨架屏
 * B. 时序：首屏可读时刻、数据请求数量与串行关系、首屏是否还拉 achievements.json
 * C. 骨架屏：加载中出现、数据到位后消失、零布局跳动
 * D. 功能回归：概览卡/列表/成就按需/回看/主题/日历/趋势图
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const BASE = process.env.BASE || 'http://127.0.0.1:8895/index.html';
const DOCS = 'C:/Users/33329/WorkBuddy/2026-10-13-18-17-49/steam-playtime/docs';
const OUT = 'C:/Users/33329/AppData/Local/Temp/fx_verify_20261018';

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

/* ---------- A. 源码级 ---------- */
const js = fs.readFileSync(`${DOCS}/app.js`, 'utf8');
const css = fs.readFileSync(`${DOCS}/style.css`, 'utf8');
const html = fs.readFileSync(`${DOCS}/index.html`, 'utf8');
const build = fs.readFileSync('C:/Users/33329/WorkBuddy/2026-10-13-18-17-49/steam-playtime/scripts/build.mjs', 'utf8');

// 剥注释后再断言，避免"清理说明"写进注释被误判
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const jsS = strip(js);

check('源码：数据请求不再用 cache:"no-store"', !/cache:\s*'no-store'/.test(jsS),
  /cache:\s*'default'/.test(jsS) ? "改用 cache:'default'" : '未找到 cache 设置');
check('源码：月份文件改并行（Promise.allSettled）', /Promise\.allSettled\(\s*missing\.map/.test(jsS));
check('源码：首屏关键请求只试 1 次', /jget\('data\/meta\.json',\s*1\)/.test(jsS));
check('源码：首屏读 meta.ach_stats 而非成就明细', /meta\.ach_stats/.test(jsS));
check('源码：成就明细按需加载函数存在', /function ensureAchDetail/.test(jsS));
check('源码：切到成就视图才触发明细加载', /if \(v === 'ach'\)[\s\S]{0,200}ensureAchDetail\(\)/.test(jsS));
check('源码：骨架屏生成与绘制函数存在', /function rankSkeleton/.test(jsS) && /function paintSkeletons/.test(jsS));
check('源码：init 先铺骨架再请求', /paintSkeletons\(\);[\s\S]{0,120}await load\(\)/.test(jsS));
check('源码：成就明细加载后直接生效（不再派生回看快照）',
  /if \(ach && ach\.ready && ach\.stats\?\.total > 0\) \{\s*state\.achReady = true;\s*state\.ach = ach;/.test(jsS)
  && !/buildAchSnapshot/.test(jsS));
check('源码：支持内联首屏数据（window.__BOOT）', /window\.__BOOT/.test(jsS) && /bootDataIsFresh/.test(jsS));
check('内联：index.html 含 BOOT_DATA 块且幂等单份',
  (html.match(/BOOT_DATA_START/g) || []).length === 1, `${(html.match(/BOOT_DATA_START/g) || []).length} 块`);
check('内联：数据带 generated_at 供时效判断', /window\.__BOOT=\{"generated_at"/.test(html));
check('内联：构建脚本串上 inline-boot', /inline-boot\.mjs/.test(build));
check('样式：骨架屏样式与动画存在', /\.sk-block/.test(css) && /@keyframes sk-shimmer/.test(css));
check('样式：尊重 reduced-motion（骨架不流动）', /prefers-reduced-motion: reduce[\s\S]{0,120}sk-block/.test(css));
check('构建：build.mjs 输出 ach_stats 到 meta', /ach_stats:\s*achStats/.test(build));
check('版本号：style\.css\?v=107 / app\.js\?v=101 / fx.js?v=16',
  /style\.css\?v=107/.test(html) && /app\.js\?v=101/.test(html) && /fx\.js\?v=16/.test(html));

/* ---------- B/C/D. 浏览器实测 ---------- */
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
// 沙箱里 CDN 会挂起，统一中止
await ctx.route(/^https?:\/\/(cdn\.jsdelivr\.net|cdn\.bootcdn\.net|fonts\.loli\.net)\//, (r) => r.abort());
// Steam 图片 CDN 在沙箱里连不上会一直挂着，拖慢后续所有计时；首屏时序只关心本地资源
await ctx.route(/^https?:\/\/(cdn\.cloudflare\.steamstatic\.com|media\.steampowered\.com|steamcdn-a\.akamaihd\.net)\//, (r) => r.abort());

const page = await ctx.newPage();
const reqs = [];
const errors = [];
page.on('request', (r) => reqs.push({ url: r.url(), t: Date.now() }));
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

// 骨架来自静态 HTML，应在 DOMContentLoaded 之前就已存在；
// 骨架"确实在缺口期顶上"由下方「人为延迟 app.js 4s」的极端场景验证，
// 不在这里装 MutationObserver 探针（addInitScript 跑在 documentElement 存在之前，observe 会抛错，
// 且内联数据生效后骨架窗口只有几十毫秒，探针本身也抓不到）。

await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 });

const timing = await page.evaluate(() => {
  const nav = performance.getEntriesByType('navigation')[0] || {};
  const dcl = Math.round(nav.domContentLoadedEventEnd || 0);
  const skReady = document.querySelectorAll('#lt-list .sk-row').length > 0;
  const lifetime = document.getElementById('c-lifetime')?.textContent?.trim() || '';
  const cardsReady = lifetime && lifetime !== '—';
  return { dcl, skReady, cardsReady, lifetime };
});
const skeletonSeen = timing.skReady;
// 内联数据生效后，渲染不再依赖网络，骨架窗口可能极短甚至看不到。
// 用"人为延迟 app.js 4s"的极端场景验证骨架确实会在缺口期顶上，
// 这才是骨架的真实价值（而不是在快环境里抢那几十毫秒）。
const skCtx = await ctx.browser().newContext({ viewport: { width: 1080, height: 520 } });
await skCtx.route(/^https?:\/\/(cdn\.jsdelivr\.net|cdn\.bootcdn\.net|fonts\.loli\.net)\//, (r) => r.abort());
await skCtx.route(/steamstatic|steampowered|akamaihd/, (r) => r.abort());
await skCtx.route('**/app.js*', async (r) => { await new Promise((x) => setTimeout(x, 4000)); r.continue(); });
const skPage = await skCtx.newPage();
await skPage.goto(BASE, { waitUntil: 'commit' });
await skPage.waitForTimeout(1200);
const skState = await skPage.evaluate(() => ({
  skRows: document.querySelectorAll('#lt-list .sk-row').length,
  skCards: document.querySelectorAll('.card-value.sk-value').length,
  lifetime: document.getElementById('c-lifetime').textContent.trim(),
}));
await skCtx.close();
check('骨架屏：脚本未到位时用骨架占位（而非空白「—」）',
  skState.skRows > 0 && skState.skCards === 4 && skState.lifetime === '—',
  JSON.stringify(skState));

// 首屏可读时刻：优先取 DCL 时刻（内联数据后 DCL 即完成渲染），
// 若 DCL 时仍未渲染完，则页内轮询到真实渲染时刻（避免跨进程 evaluate 建上下文开销污染计时）
let readyAt = null;
if (timing.cardsReady) {
  readyAt = timing.dcl;
} else {
  try {
    readyAt = await page.evaluate(() => new Promise((res, rej) => {
      const t0 = performance.now();
      const tick = () => {
        const el = document.getElementById('c-lifetime');
        const v = el && el.textContent && el.textContent.trim();
        if (v && v !== '—') return res(Math.round(performance.now()));
        if (performance.now() - t0 > 15000) return rej(new Error('timeout'));
        requestAnimationFrame(tick);
      };
      tick();
    }));
  } catch { readyAt = null; }
}
check('时序：首屏可读时刻在 1.2s 内', readyAt !== null && readyAt < 1200, `${readyAt}ms（DCL ${timing.dcl}ms）`);

// 骨架必须被清掉
const after = await page.evaluate(() => ({
  skRows: document.querySelectorAll('#lt-list .sk-row').length,
  skCards: document.querySelectorAll('.card-value.sk-value').length,
  rows: document.querySelectorAll('#lt-list .rank-item').length,
}));
check('骨架屏：数据到位后完全清除', after.skRows === 0 && after.skCards === 0, JSON.stringify(after));
check('骨架屏：真实列表已渲染', after.rows > 0, `${after.rows} 行`);

// 首屏不许拉 achievements.json
const achReqEarly = reqs.filter((r) => r.url.includes('achievements.json')).length;
check('请求：首屏不请求 achievements.json（285KB 移出关键路径）', achReqEarly === 0, `${achReqEarly} 次`);

// 数据请求总数与并行关系
const dataReqs = reqs.filter((r) => r.url.includes('/data/'));
check('请求：首屏数据请求 0 个（已完全内联）', dataReqs.length === 0,
  dataReqs.length ? dataReqs.map((r) => r.url.split('/data/')[1]).join(', ') : '零请求');

// 概览卡成就值来自 meta.ach_stats —— 期望值也从内联数据里读，避免快照一更新就漂
const ach = await page.evaluate(() => {
  const b = window.__BOOT || {};
  const s2 = b.meta && b.meta.ach_stats;
  return s2 && typeof s2.pct === 'number'
    ? { pct: s2.pct, total: s2.total, games: s2.games, unlocked: s2.unlocked }
    : null;
});
const cardAch = await page.evaluate(() => document.getElementById('c-ach').textContent.trim());
check(`数据：成就卡显示摘要值（${ach ? ach.pct + '%' : '无 meta.ach_stats'}）`,
  ach ? cardAch === ach.pct + '%' : cardAch === '—', cardAch);

/* ---- 成就按需加载 ---- */
const beforeSwitch = reqs.filter((r) => r.url.includes('achievements.json')).length;
await page.click('.card-nav[data-view="ach"]').catch(async () => {
  await page.evaluate(() => document.querySelector('[data-view="ach"]').click());
});
// 切换瞬间应显示骨架
let achSkeleton = false;
for (let i = 0; i < 30; i++) {
  const has = await page.evaluate(() => document.querySelectorAll('#ach-list .sk-row').length > 0).catch(() => false);
  if (has) { achSkeleton = true; break; }
  await page.waitForTimeout(20);
}
await page.waitForTimeout(2500);
const afterSwitch = reqs.filter((r) => r.url.includes('achievements.json')).length;
const achState = await page.evaluate(() => ({
  items: document.querySelectorAll('#ach-list .ach-item').length,
  hints: document.getElementById('ach-hint').textContent.trim(),
  sk: document.querySelectorAll('#ach-list .sk-row').length,
  options: document.querySelectorAll('#ach-game option').length,
}));
check('按需：切到成就页才请求 achievements.json', beforeSwitch === 0 && afterSwitch >= 1, `${beforeSwitch} → ${afterSwitch}`);
check('按需：成就明细加载完成后渲染出条目', achState.items > 0 && achState.sk === 0,
  `items=${achState.items} sk=${achState.sk}`);
check('按需：游戏筛选下拉被填充', achState.options > 1, `${achState.options} 个选项`);
const hintRe = ach
  ? new RegExp('已解锁 \\d+ / ' + ach.total + ' 项 · 完成度 [\\d.]+% · 覆盖 ' + ach.games + ' 款游戏')
  : /已解锁 \d+ \/ \d+ 项 · 完成度 [\d.]+% · 覆盖 \d+ 款游戏/;
check(`按需：摘要提示文案正确（${ach ? ach.total + ' 项 / ' + ach.games + ' 款' : '通用'}）`,
  hintRe.test(achState.hints), achState.hints.slice(0, 60));

/* ---- 功能回归 ---- */
await page.evaluate(() => document.querySelector('[data-view="lifetime"]').click());
await page.waitForTimeout(300);
const cards = await page.evaluate(() =>
  [...document.querySelectorAll('.cards .card-value')].map((e) => e.textContent.trim()));
// 第 83 轮：概览从五张降到四张（「游戏库」卡并入「游戏时长」视图）
check('回归：四张概览卡有值', cards.length === 4 && cards.every((v) => v && v !== '—'), JSON.stringify(cards));

// 日历回看（成就明细已加载，应精确回溯）
// 2026-10-20：日历入口已从累计榜收敛到「最近游玩」（全站唯一），
// 断言同步改为：切到「最近游玩」→ 点那唯一的 .cal-icon-btn。
await page.click('#card-recent');
await page.waitForTimeout(600);
await page.click('#recent-list [data-cal-toggle]');
await page.waitForTimeout(400);
const calOpen = await page.evaluate(() => document.querySelectorAll('.cal-day').length > 0);
check('回归：日历浮层可打开（唯一入口在「最近游玩」）', calOpen);
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
await page.click('#card-lifetime');
await page.waitForTimeout(600);

// 主题持久化
const t1 = await page.evaluate(() => document.documentElement.dataset.theme);
await page.click('.header-avatar');
await page.waitForTimeout(300);
const t2 = await page.evaluate(() => ({ now: document.documentElement.dataset.theme, stored: localStorage.getItem('theme') }));
check('回归：主题切换并持久化', t2.stored === t2.now, JSON.stringify({ before: t1, ...t2 }));

// 趋势图
await page.click('#lt-list .rank-item');
await page.waitForTimeout(4000);
const drill = await page.evaluate(() => ({
  open: !document.getElementById('lt-detail').hidden,
  canvas: !!document.querySelector('#chart-drill canvas'),
  fallback: (document.getElementById('chart-drill').textContent || '').includes('加载失败'),
}));
check('回归：趋势图可打开（ECharts 按需 + 降级）', drill.open && (drill.canvas || drill.fallback), JSON.stringify(drill));

// 滚动胶囊图：只断言"水化动作发生了"（沙箱连不上 Steam CDN，图片字节到不了，
// 不能拿 naturalWidth 判断——那是网络问题不是逻辑问题）
// 注意：先滚回顶部再测。上面的趋势图流程滚过一遍，若停留在中段，
// 列表里的 22 行可能全落在 rootMargin 预热带内 → farTotal 恒为 0（假失败）。
await page.evaluate(() => document.querySelector('#btn-drill-back')?.click());
await page.waitForTimeout(400);
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(600);
const cap = await page.evaluate(() => {
  const imgs = [...document.querySelectorAll('#lt-list img.rank-capsule')].filter((i) => !i.closest('#idle-list'));
  let vis = 0, visHydrated = 0, farTotal = 0, farPlaceholder = 0;
  for (const img of imgs) {
    const r = img.getBoundingClientRect();
    const near = r.top < innerHeight + 200 && r.bottom > -200;
    const ph = img.hasAttribute('data-src');
    if (near) { vis++; if (!ph) visHydrated++; }
    // 只有"离视口还很远、从未进过预热带"的图才该保持占位；
    // 水化是单向的（data-src 用完即删），滚动路过的图会一直保留真实 src
    else if (r.top > innerHeight + 600) { farTotal++; if (ph) farPlaceholder++; }
  }
  return { vis, visHydrated, farTotal, farPlaceholder };
});
check('回归：胶囊图按需加载仍正常（视口内已水化 / 远屏外仍占位）',
  cap.vis > 0 && cap.visHydrated === cap.vis && cap.farTotal > 0 && cap.farPlaceholder === cap.farTotal,
  JSON.stringify(cap));

/* ---- 刷新（缓存生效）二次加载 ---- */
await page.goto(BASE, { waitUntil: 'commit' });
const ready2 = await (async () => {
  const s = Date.now();
  for (let i = 0; i < 400; i++) {
    const ok = await page.evaluate(() => {
      const el = document.getElementById('c-lifetime');
      return el && el.textContent && el.textContent !== '—';
    }).catch(() => false);
    if (ok) return Date.now() - s;
    await page.waitForTimeout(25);
  }
  return null;
})();
check('缓存：二次加载（浏览器缓存命中）显著更快', ready2 !== null && ready2 < (readyAt ?? 99999), `首次 ${readyAt}ms → 二次 ${ready2}ms`);

/* ---- 稳定性 ---- */
const realErrs = errors.filter((e) => !/Failed to load resource|net::ERR|ERR_BLOCKED|ERR_FAILED/i.test(e));
check('稳定性：无 JS 异常', realErrs.length === 0, realErrs.slice(0, 3).join(' | '));

await page.screenshot({ path: `${OUT}/v6_after.png` });
await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n===== ${results.length - failed.length}/${results.length} PASS =====`);
if (failed.length) { console.log('FAILED:'); failed.forEach((f) => console.log('  - ' + f.name)); process.exit(1); }
