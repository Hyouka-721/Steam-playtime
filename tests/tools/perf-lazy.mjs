/* perf-lazy.mjs — 测「按需加载的重资源」首次打开要多久
 *
 * 重点看两张卡（首屏不加载、点了才拉）：
 *   · 成就   data/achievements.json  287.7KB
 *   · 游戏库 时间轴（228 条补录 + 57 周 × 242 徽章的 DOM）
 *
 * 用法：node tests/tools/perf-lazy.mjs [url] [4g|3g]
 */
import { createRequire } from 'node:module';

const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const URL_ARG = process.argv[2] || 'https://hyouka-721.github.io/Steam-playtime/index.html';
const TH = process.argv[3] || '';
const net = {
  '4g': { downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8, latency: 150 },
  '3g': { downloadThroughput: 750 * 1024 / 8, uploadThroughput: 250 * 1024 / 8, latency: 300 },
}[TH] || null;

const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const log = (...a) => console.log(...a);

const run = async (cardId, waitSel, label) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  if (net) {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, ...net });
  }
  await page.goto(URL_ARG, { waitUntil: 'load', timeout: 60000 });
  await page.waitForSelector('#lt-list .rank-item', { state: 'visible', timeout: 30000 });
  await page.waitForTimeout(400); // 等首屏 idle，避免把首屏开销算进去

  const r = await page.evaluate(async (args) => {
    const [cid, sel] = args;
    const t = performance.now();
    document.getElementById(cid).click();
    // 等到目标视图真的有内容
    for (let i = 0; i < 600; i++) {
      // 骨架（.sk-row）还在 → 内容没到，继续等
      const skel = document.querySelectorAll('#ach-list .sk-row').length;
      const n = document.querySelectorAll(sel).length;
      if (n > 0 && skel === 0) {
        await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
        return { ms: Math.round(performance.now() - t), nodes: n };
      }
      await new Promise((res) => setTimeout(res, 20));
    }
    return { ms: null, nodes: 0 };
  }, [cardId, waitSel]);

  const net_info = await page.evaluate(() => performance.getEntriesByType('resource')
    .filter((e) => /achievements\.json/.test(e.name))
    .map((e) => ({ kb: +(e.transferSize / 1024).toFixed(1), dur: Math.round(e.duration) })));

  log(`  ${label}：${r.ms == null ? '超时' : r.ms + 'ms'}（渲染 ${r.nodes} 个节点）` +
    (net_info.length ? ` ｜ 数据 ${net_info.map((n) => n.kb + 'KB / ' + n.dur + 'ms').join(', ')}` : ''));
  await ctx.close();
  return r.ms;
};

log(`\n===== 按需加载首次打开 ${TH ? '· ' + TH : ''} =====`);
await run('c-ach', '#ach-list > :not(.sk-row)', '成就卡（首次，需下载 287.7KB）');
await run('c-ach', '#ach-list > :not(.sk-row)', '成就卡（第二次，已缓存）');
await run('c-games', '#timeline .tl-item', '游戏库（时间轴 57 周 / 242 徽章）');
await run('c-data', '#health .h-label', '数据页');

await browser.close();
log('');
