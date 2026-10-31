/* 第 85 轮 P1 定点对照：只拍「会折行的那 2 部」所在的卡片与评分牌特写
   改前 CSS 用 page.route 换成 HEAD 版本（第 84 轮上线的 v22） */
import { createRequire } from 'module';
import { execFileSync } from 'child_process';
import fs from 'fs';
const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const REPO = 'C:/Users/33329/WorkBuddy/2026-10-13-18-17-49/steam-playtime';
const OUT = 'C:/Users/33329/AppData/Local/Temp/fx_verify_20261018/shots85cmp/';
const oldCss = execFileSync('git', ['show', 'HEAD:docs/watch.css'], { cwd: REPO, encoding: 'utf8', maxBuffer: 1 << 24 });
const newCss = fs.readFileSync(REPO + '/docs/watch.css', 'utf8');
const TARGETS = ['青春猪头少年不会梦到兔女郎学姐', '紫罗兰永恒花园外传：永远与自动手记人偶'];

const browser = await chromium.launch({ args: ['--no-proxy-server'] });
for (const v of ['before', 'after']) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  await p.route('**/watch.css*', (r) => r.fulfill({ contentType: 'text/css', body: v === 'before' ? oldCss : newCss }));
  await p.goto('http://127.0.0.1:8895/watch.html', { waitUntil: 'load' });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForFunction(() => document.querySelectorAll('#w-grid .poster').length > 20, null, { timeout: 30000 });
  for (let i = 0; i < TARGETS.length; i++) {
    const card = p.locator('#w-grid .poster').filter({ hasText: TARGETS[i] }).first();
    await card.scrollIntoViewIfNeeded();
    await p.waitForTimeout(250);
    await card.screenshot({ path: `${OUT}card${i + 1}_${v}.png` });
  }
  /* 评分牌特写：挑一张浅色海报（轻音少女，亮蓝底） */
  const bright = p.locator('#w-grid .poster').filter({ hasText: '轻音少女' }).first();
  await bright.scrollIntoViewIfNeeded();
  await p.waitForTimeout(250);
  await bright.locator('.poster-score').screenshot({ path: `${OUT}badge_${v}.png` });
  await ctx.close();
}
await browser.close();
console.log('cards + badges done');
