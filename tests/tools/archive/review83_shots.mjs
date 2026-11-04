/* 第 83 轮设计评审用截图：抓关键视图供视觉评估 */
import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const SITE = 'https://hyouka-721.github.io/Steam-playtime/watch.html';
const OUT = 'C:/Users/33329/AppData/Local/Temp/fx_verify_20261018/shots_review/';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ args: ['--no-proxy-server'] });

// ---- 1440 桌面 ----
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  await p.goto(SITE, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => document.querySelectorAll('#w-grid .poster').length > 0, null, { timeout: 40000 });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(1200);

  await p.screenshot({ path: OUT + 'r01_首屏_1440.png' });

  // 顶部区域特写（页眉 + 类型/排序条）
  await p.screenshot({ path: OUT + 'r02_页眉与筛选条特写.png', clip: { x: 0, y: 0, width: 1440, height: 190 } });

  // 单卡片特写（评分/海报/片名/短评的层级）
  const card = await p.$('#w-grid .poster');
  if (card) {
    const b = await card.boundingBox();
    await p.screenshot({ path: OUT + 'r03_单卡片特写.png', clip: { x: b.x - 18, y: b.y - 18, width: b.width + 36, height: b.height + 36 } });
  }

  // 时间轴
  await p.click('#w-avatar');
  await p.waitForTimeout(900);
  await p.screenshot({ path: OUT + 'r04_时间轴_1440.png' });
  const tl = await p.$('#w-tl .tl-item');
  if (tl) {
    const b = await tl.boundingBox();
    await p.screenshot({ path: OUT + 'r05_时间轴条目特写.png', clip: { x: 0, y: b.y - 20, width: 1440, height: Math.min(420, b.height + 50) } });
  }

  // 编辑弹窗
  await p.evaluate(() => document.querySelector('#w-tl .tl-item').click());
  await p.waitForTimeout(700);
  await p.screenshot({ path: OUT + 'r06_编辑弹窗.png' });

  // 页脚
  await p.keyboard.press('Escape');
  await p.waitForTimeout(400);
  const foot = await p.$('.w-foot');
  if (foot) {
    // 页脚在长页最底，clip 用视口坐标会越界 → 交给元素截图自己滚动
    await foot.screenshot({ path: OUT + 'r07_页脚特写.png' });
  }

  // 关键度量：字号/行高/间距实测
  const metrics = await p.evaluate(() => {
    const g = (sel, props) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const cs = getComputedStyle(el);
      const out = { rect: el.getBoundingClientRect().toJSON() };
      (props || ['fontSize', 'lineHeight', 'fontWeight', 'color', 'letterSpacing', 'fontFamily']).forEach((k) => (out[k] = cs[k]));
      return out;
    };
    const grid = document.getElementById('w-grid');
    const kids = grid ? [...grid.children] : [];
    const gap = kids.length > 1
      ? Math.round(kids[1].getBoundingClientRect().left - kids[0].getBoundingClientRect().right)
      : null;
    const rowGap = kids.length > 4
      ? Math.round(kids[4].getBoundingClientRect().top - kids[0].getBoundingClientRect().bottom)
      : null;
    return {
      body: g('body'),
      h1: g('.w-head h1, .w-title, header h1'),
      kicker: g('.w-kicker, .w-sub'),
      name: g('.poster-name'),
      meta: g('.poster-meta, .poster-date'),
      note: g('.poster-note'),
      score: g('.poster-score, .p-score'),
      grid: grid ? { cols: getComputedStyle(grid).gridTemplateColumns, gap: getComputedStyle(grid).gap } : null,
      measuredGap: gap,
      measuredRowGap: rowGap,
      cardW: kids[0] ? Math.round(kids[0].getBoundingClientRect().width) : null,
      cardH: kids[0] ? Math.round(kids[0].getBoundingClientRect().height) : null,
    };
  });
  fs.writeFileSync(OUT + 'metrics_1440.json', JSON.stringify(metrics, null, 2));
  console.log('1440 度量已写入');

  await ctx.close();
}

// ---- 390 移动 ----
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  await p.goto(SITE, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => document.querySelectorAll('#w-grid .poster').length > 0, null, { timeout: 40000 });
  await p.waitForTimeout(1200);
  await p.screenshot({ path: OUT + 'r08_移动390_首屏.png' });
  await p.click('#w-avatar');
  await p.waitForTimeout(900);
  await p.screenshot({ path: OUT + 'r09_移动390_时间轴.png' });
  await ctx.close();
}

await browser.close();
console.log('输出：', OUT);
