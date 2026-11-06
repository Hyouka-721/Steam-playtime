/**
 * 第 89 轮（watch 侧）评分角标：before / after 对照截图
 *
 * 用法：node tests/tools/shot89_badge.mjs <before|after>
 * 产出：%TEMP%/shots89badge/<tag>-<片名>.png      整张海报（含角标，dpr2）
 *       %TEMP%/shots89badge/<tag>-<片名>-close.png 角标特写（四周各留 28px，放大 3×）
 *
 * 为什么挑这两张：《情书》= 白雪底（最亮）、《冰菓》= 粉白樱花 + 亮黄路面（用户截图那张），
 * 是「金色压浅底」的两个最坏情况 —— 这两张过了，其余海报都过。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import sharp from 'sharp';

const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const TAG = process.argv[2] === 'after' ? 'after' : 'before';
const BASE = 'http://127.0.0.1:8895/watch.html';
const OUT = path.join(os.tmpdir(), 'shots89badge');
fs.mkdirSync(OUT, { recursive: true });

const TITLES = ['情书', '冰菓'];

/* ⚠️ before 态必须自己把旧规则注入回来 —— docs/watch.css 已经是第 89 轮的新版，
   「直接截图」得到的 before 会和 after 逐像素相同（踩过一次）。
   下面这段逐字取自 `git show HEAD:docs/watch.css`（第 85 轮 P1-3 定稿，行 311~324），
   外加 `::before { display:none }` 和 `text-shadow:none`（旧版角标没有暗晕，
   唯一那处 text-shadow 属于 .w-title，不是角标祖先）。 */
const OLD_CSS = `
.poster-score {
  padding: 1px 7px;
  font-size: 13px; font-weight: 700;
  color: var(--accent);
  background: rgba(8, 8, 11, 0.76);
  border: 1px solid var(--accent-edge);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.05), 0 2px 8px rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(4px);
  text-shadow: none;
}
.poster-score::before { display: none !important; }
.poster-score i { font-size: 10px; opacity: .85; }
`;

const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
const page = await ctx.newPage();
await page.goto(BASE + '?t=' + Date.now(), { waitUntil: 'load' });
await page.waitForTimeout(700);
if (TAG === 'before') await page.addStyleTag({ content: OLD_CSS });

for (const title of TITLES) {
  const card = page.locator('.poster', { has: page.locator('.poster-name', { hasText: new RegExp('^' + title + '$') }) }).first();
  await card.scrollIntoViewIfNeeded();
  /* 三拍：滚进来 → 等 lazy 队列启动 → 统一 eager 再等 complete（少第一拍会截出灰块） */
  await page.waitForTimeout(900);
  await page.evaluate(() => document.querySelectorAll('.poster-pic img').forEach((i) => { i.loading = 'eager'; }));
  await page.waitForFunction(() => [...document.querySelectorAll('.poster-pic img')].every((i) => i.complete), null, { timeout: 12000 });
  await page.waitForTimeout(400);

  const pic = card.locator('.poster-pic');
  await pic.screenshot({ path: path.join(OUT, `${TAG}-${title}.png`) });

  const sc = card.locator('.poster-score');
  const b = await sc.boundingBox();
  const pad = 28;
  const shot = await page.screenshot({
    clip: { x: Math.max(0, b.x - pad), y: Math.max(0, b.y - pad), width: b.width + pad * 2, height: b.height + pad * 2 },
  });
  await sharp(shot)
    .resize({ width: Math.round((b.width + pad * 2) * 3), kernel: 'lanczos3' })
    .png()
    .toFile(path.join(OUT, `${TAG}-${title}-close.png`));

  const cs = await sc.evaluate((el) => {
    const s = getComputedStyle(el);
    return {
      color: s.color, bg: s.backgroundColor, border: s.borderTopWidth + ' ' + s.borderTopStyle,
      radius: s.borderRadius, font: s.fontSize + '/' + s.fontWeight, shadow: s.boxShadow.slice(0, 80),
      bf: s.backdropFilter || s.webkitBackdropFilter, w: el.getBoundingClientRect().width, h: el.getBoundingClientRect().height,
    };
  });
  console.log(`${TAG} ${title}: ${JSON.stringify(cs)}`);

  /* 第 89 轮的 B 段（hover 点亮）只有真 hover 才看得到，给冰菓补一张 */
  if (TAG === 'after' && title === '冰菓') {
    await card.hover();
    await page.waitForTimeout(420);
    const b2 = await sc.boundingBox();
    const hoverShot = await page.screenshot({
      clip: { x: Math.max(0, b2.x - pad), y: Math.max(0, b2.y - pad), width: b2.width + pad * 2, height: b2.height + pad * 2 },
    });
    await sharp(hoverShot)
      .resize({ width: Math.round((b2.width + pad * 2) * 3), kernel: 'lanczos3' })
      .png()
      .toFile(path.join(OUT, `${TAG}-${title}-hover.png`));
    console.log(`${TAG} ${title} hover: ` + JSON.stringify(await sc.evaluate((el) => {
      const s = getComputedStyle(el);
      return { color: s.color, bg: s.backgroundColor };
    })));
  }
}

await browser.close();
console.log('OUT = ' + OUT);
