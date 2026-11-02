/* perf-audit.mjs — 性能体检：首屏 / 切换 / 滚动三类指标
 *
 * 用法：
 *   node tests/tools/perf-audit.mjs                      # 本地 8895
 *   node tests/tools/perf-audit.mjs <url> [标签]          # 任意地址（线上/限速）
 *   THROTTLE=4g node tests/tools/perf-audit.mjs <url>    # 模拟 4G（1.6Mbps / 150ms RTT）
 *
 * 采集：
 *   首屏   TTFB / FCP / LCP / DCL / load / 「第一行榜单可见」的时刻
 *   资源   /data/ 与 css/js/字体 的请求数、传输字节（线上能看出是否 gzip）
 *   切换   6 张卡各点一次，记「点击 → 目标视图内容出现」的耗时
 *   滚动   滚到底，统计 longtask 的次数与总时长、帧间隔分布
 */
import { createRequire } from 'node:module';

const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const URL_ARG = process.argv[2] || 'http://127.0.0.1:8895/index.html';
const LABEL = process.argv[3] || (URL_ARG.includes('github.io') ? '线上' : '本地');
const THROTTLE = process.env.THROTTLE || '';

const netProfile = {
  '4g': { downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8, latency: 150 },
  '3g': { downloadThroughput: 750 * 1024 / 8, uploadThroughput: 250 * 1024 / 8, latency: 300 },
}[THROTTLE] || null;

const log = (...a) => console.log(...a);
const kb = (n) => (n >= 1024 ? (n / 1024).toFixed(1) + 'KB' : n + 'B');
const ms = (n) => (n == null ? '—' : Math.round(n) + 'ms');

const INIT = () => {
  window.__perf = { lcp: null, longTasks: [], shifts: 0 };
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) window.__perf.lcp = e.startTime;
    }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) window.__perf.longTasks.push({ start: Math.round(e.startTime), dur: Math.round(e.duration) });
    }).observe({ type: 'longtask', buffered: true });
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) if (!e.hadRecentInput) window.__perf.shifts += e.value;
    }).observe({ type: 'layout-shift', buffered: true });
  } catch { /* 老浏览器忽略 */ }
};

const browser = await chromium.launch({ args: ['--no-proxy-server'] });

/* ============ 一、首屏（冷缓存：新 context，SW 未接管） ============ */
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
if (netProfile) {
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, ...netProfile });
}
await page.addInitScript(INIT);

const t0 = Date.now();
await page.goto(URL_ARG, { waitUntil: 'load', timeout: 60000 });
await page.waitForSelector('#lt-list .rank-item', { state: 'visible', timeout: 30000 });
const tFirstRow = Date.now() - t0;
await page.waitForTimeout(1500); // 让 LCP / 图片稳定

const first = await page.evaluate(() => {
  const nav = performance.getEntriesByType('navigation')[0];
  const paint = performance.getEntriesByType('paint');
  const fp = paint.find((p) => p.name === 'first-paint')?.startTime ?? null;
  const fcp = paint.find((p) => p.name === 'first-contentful-paint')?.startTime ?? null;
  const res = performance.getEntriesByType('resource').map((r) => ({
    url: r.name.replace(location.origin + location.pathname.replace(/[^/]*$/, ''), ''),
    type: r.initiatorType,
    dur: Math.round(r.duration),
    size: r.transferSize,
    enc: r.encodedBodySize,
    dt: r.deliveryType,
  }));
  const dataReqs = res.filter((r) => /\/data\//.test(r.url));
  const assets = res.filter((r) => /\.(css|js|woff2)/.test(r.url));
  return {
    ttfb: nav ? nav.responseStart - nav.requestStart : null,
    dcl: nav ? nav.domContentLoadedEventEnd : null,
    load: nav ? nav.loadEventEnd : null,
    fp, fcp,
    lcp: window.__perf.lcp,
    longTasks: window.__perf.longTasks,
    shifts: window.__perf.shifts,
    nReq: res.length,
    totalKB: +(res.reduce((a, r) => a + r.size, 0) / 1024).toFixed(1),
    dataReqs: dataReqs.map((r) => ({ name: r.url.split('/').pop(), size: r.size, dur: r.dur })),
    assets: assets.map((r) => ({ name: r.url.split('/').pop(), size: r.size, dur: r.dur, dt: r.dt })),
  };
});

log(`\n===== ${LABEL}${THROTTLE ? ' · ' + THROTTLE : ''} =====`);
log('— 首屏（冷缓存，SW 未接管）—');
log(`  TTFB ${ms(first.ttfb)} · FP ${ms(first.fp)} · FCP ${ms(first.fcp)} · LCP ${ms(first.lcp)}`);
log(`  DCL ${ms(first.dcl)} · load ${ms(first.load)} · 「第一行榜单可见」${tFirstRow}ms`);
log(`  请求 ${first.nReq} 个 / 传输 ${first.totalKB}KB · CLS ${first.shifts.toFixed(3)}`);
log(`  longtask ${first.longTasks.length} 个，合计 ${first.longTasks.reduce((a, t) => a + t.dur, 0)}ms`);
if (first.longTasks.length) log('   ' + first.longTasks.map((t) => `${t.start}ms/${t.dur}ms`).join('  '));
log('  数据请求：' + (first.dataReqs.map((r) => `${r.name} ${kb(r.size)} ${r.dur}ms`).join(' | ') || '无'));
log('  资源：' + first.assets.map((r) => `${r.name} ${kb(r.size)} ${r.dur}ms ${r.dt || ''}`).join(' | '));

/* ============ 二、二次访问（缓存生效） ============ */
await page.goto(URL_ARG, { waitUntil: 'load', timeout: 60000 });
await page.waitForSelector('#lt-list .rank-item', { state: 'visible', timeout: 30000 });
const second = await page.evaluate(() => {
  const nav = performance.getEntriesByType('navigation')[0];
  const res = performance.getEntriesByType('resource');
  const cached = res.filter((r) => r.transferSize === 0).length;
  return {
    dcl: nav ? nav.domContentLoadedEventEnd : null,
    fcp: performance.getEntriesByType('paint').find((p) => p.name === 'first-contentful-paint')?.startTime ?? null,
    nReq: res.length, cached,
  };
});
log('— 二次访问（缓存）—');
log(`  FCP ${ms(second.fcp)} · DCL ${ms(second.dcl)} · 资源 ${second.nReq} 个，其中 ${second.cached} 个走缓存`);

/* ============ 三、卡片切换 ============ */
const CARDS = ['c-lifetime', 'c-recent', 'c-ach', 'c-games', 'c-data', 'c-lifetime'];
const switchTimes = [];
const swDetail = [];
for (const id of CARDS) {
  const t = await page.evaluate(async (cardId) => {
    const el = document.getElementById(cardId);
    const before = document.querySelector('#lt-list .rank-item, #timeline .tl-item, #recent-list .rank-item, #ach-list .rank-item, #health .h-label');
    const s = performance.now();
    el.click();
    // 等到「能看出切换完成」的信号：主视图有内容 + 两帧稳定
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const after = document.querySelector('#lt-list .rank-item, #timeline .tl-item, #recent-list .rank-item, #ach-list .rank-item, #health .h-label');
    return { ms: Math.round(performance.now() - s), had: !!before, has: !!after };
  }, id);
  switchTimes.push(t.ms);
  swDetail.push(`${id} ${t.ms}ms`);
}
log('— 卡片切换（点击 → 双帧稳定）—');
log('  ' + swDetail.join(' | '));
switchTimes.sort((a, b) => a - b);
log(`  中位 ${switchTimes[Math.floor(switchTimes.length / 2)]}ms · 最慢 ${switchTimes[switchTimes.length - 1]}ms`);

/* 深度：切到「游戏库」时时间轴 57 周 / 242 徽章的渲染耗时 */
const tlCost = await page.evaluate(async () => {
  const el = document.getElementById('c-games');
  const s = performance.now();
  el.click();
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const t1 = performance.now() - s;
  await new Promise((r) => setTimeout(r, 0));
  const items = document.querySelectorAll('#timeline .tl-item').length;
  return { ms: Math.round(t1), items, badges: document.querySelectorAll('#timeline .tl-badge').length };
});
log(`  其中「游戏库」（时间轴 ${tlCost.items} 周 / ${tlCost.badges} 徽章）：${tlCost.ms}ms`);

/* ============ 四、滚动流畅度 ============ */
const scroll = await page.evaluate(async () => {
  window.__frames = [];
  let last = performance.now();
  let running = true;
  const tick = () => {
    const now = performance.now();
    window.__frames.push(now - last);
    last = now;
    if (running) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  window.__perf.longTasks.length = 0;

  // 连续滚到底再滚回来，约 3 秒
  const H = document.documentElement.scrollHeight;
  const step = Math.ceil(H / 60);
  for (let i = 0; i < 60; i++) { window.scrollBy(0, step); await new Promise((r) => setTimeout(r, 25)); }
  for (let i = 0; i < 60; i++) { window.scrollBy(0, -step); await new Promise((r) => setTimeout(r, 25)); }
  running = false;
  await new Promise((r) => setTimeout(r, 120));

  const f = window.__frames.slice(2);
  const sorted = [...f].sort((a, b) => a - b);
  const p = (q) => Math.round(sorted[Math.floor(sorted.length * q)] ?? 0);
  return {
    frames: f.length,
    p50: p(0.5), p95: p(0.95), worst: Math.round(sorted[sorted.length - 1] ?? 0),
    over50: f.filter((x) => x > 50).length,
    longTasks: window.__perf.longTasks.slice(),
  };
});
log('— 滚动（滚到底再滚回，约 3s）—');
log(`  帧间隔 P50 ${scroll.p50}ms · P95 ${scroll.p95}ms · 最差 ${scroll.worst}ms · >50ms 的帧 ${scroll.over50} 个（共 ${scroll.frames}）`);
log(`  longtask ${scroll.longTasks.length} 个，合计 ${scroll.longTasks.reduce((a, t) => a + t.dur, 0)}ms` +
  (scroll.longTasks.length ? '：' + scroll.longTasks.map((t) => `${t.dur}ms`).join(' ') : ''));

await ctx.close();
await browser.close();
log('');
