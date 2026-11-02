/* A/B 对比：内联 CSS vs 外链 CSS，本地 + 固定 4G 限速（排除真实网络波动）
   做法：两个 index.html 交替切换，各测 N 次取中位。
   A = 当前（外链 CSS）      B = f2fe927 里的内联版（从 git 取出）
   ⚠️ 用 serviceWorkers:'block' 排除 SW 干预；
   ⚠️ 每次新 context（冷缓存），否则第二次全走缓存看不出差异。 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import { execSync } from 'node:child_process';

const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const N = Number(process.env.N || 5);
const HTML = 'docs/index.html';
const BACKUP = 'docs/_index_link.html';

// 备份当前（外链版），并从 git 取出内联版
fs.copyFileSync(HTML, BACKUP);
const inlined = execSync('git show f2fe927:docs/index.html', { maxBuffer: 10 * 1024 * 1024 }).toString();
console.log(`外链版 ${(fs.statSync(BACKUP).size / 1024).toFixed(1)}KB ｜ 内联版 ${(inlined.length / 1024).toFixed(1)}KB`);

const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const net = { downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8, latency: 150 };

const runOne = async () => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, ...net });
  await page.addInitScript(() => {
    window.__cls = 0;
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; })
      .observe({ type: 'layout-shift', buffered: true });
    window.__lcp = 0;
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lcp = e.startTime; })
      .observe({ type: 'largest-contentful-paint', buffered: true });
  });
  const t0 = Date.now();
  await page.goto('http://127.0.0.1:8895/index.html', { waitUntil: 'load', timeout: 90000 });
  await page.waitForSelector('#lt-list .rank-item', { state: 'visible', timeout: 60000 });
  const firstRow = Date.now() - t0;
  await page.waitForTimeout(800);
  const m = await page.evaluate(() => {
    const p = performance.getEntriesByType('paint');
    const nav = performance.getEntriesByType('navigation')[0];
    return {
      fcp: Math.round(p.find((x) => x.name === 'first-contentful-paint')?.startTime ?? 0),
      lcp: Math.round(window.__lcp),
      dcl: Math.round(nav.domContentLoadedEventEnd),
      cls: +window.__cls.toFixed(4),
      n: performance.getEntriesByType('resource').length,
      kb: +(performance.getEntriesByType('resource').reduce((a, r) => a + r.transferSize, 0) / 1024).toFixed(0),
    };
  });
  await ctx.close();
  return { ...m, firstRow };
};

const batch = async (label) => {
  const rows = [];
  for (let i = 0; i < N; i++) rows.push(await runOne());
  const med = (k) => {
    const v = rows.map((r) => r[k]).sort((a, b) => a - b);
    return v[Math.floor(v.length / 2)];
  };
  console.log(`${label}  中位：FCP ${med('fcp')} · LCP ${med('lcp')} · DCL ${med('dcl')} · 首行 ${med('firstRow')} · CLS ${med('cls')} · 请求 ${med('n')} · 传输 ${med('kb')}KB`);
  console.log(`   明细：${rows.map((r) => `F${r.fcp}/L${r.lcp}/首${r.firstRow}`).join('  ')}`);
  return { fcp: med('fcp'), lcp: med('lcp'), firstRow: med('firstRow') };
};

// A：外链（当前文件）
const A = await batch('A 外链 CSS ');
// B：内联
fs.writeFileSync(HTML, inlined, 'utf8');
const B = await batch('B 内联 CSS ');
// 还原
fs.copyFileSync(BACKUP, HTML);
fs.unlinkSync(BACKUP);

await browser.close();
console.log(`\n差异（A − B）：FCP ${A.fcp - B.fcp}ms · LCP ${A.lcp - B.lcp}ms · 首行 ${A.firstRow - B.firstRow}ms（正数=内联更快）`);
