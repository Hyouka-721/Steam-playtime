/* 第 86 轮 watch 对照图：改前（HEAD = v23）vs 改后（工作区 v24）
   ⚠️ 不动工作区 —— 用 page.route 把 watch.html / watch.css / watch.js 的响应换成 `git show HEAD:` 的旧内容
   ⚠️ 表单对照要三个文件一起换：HTML 结构变了（原生 file input → 自绘按钮），只换 CSS 会错位
   ⚠️ 同目录的 shot86.mjs 属 index 线（游戏站热力图），本文件带 _watch 后缀 */
import { createRequire } from 'module';
import fs from 'fs';
import { execSync } from 'child_process';
const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const REPO = 'C:/Users/33329/WorkBuddy/2026-10-13-18-17-49/steam-playtime';
const BASE = 'http://127.0.0.1:8895/';
const OUT = 'C:/Users/33329/AppData/Local/Temp/fx_verify_20261018/shots86cmp/';
fs.mkdirSync(OUT, { recursive: true });

const git = (f) => execSync(`git -C "${REPO}" show HEAD:docs/${f}`, { encoding: 'utf8', maxBuffer: 1 << 26 });
const oldCss = git('watch.css'), oldHtml = git('watch.html'), oldJs = git('watch.js');
console.log('基线取自 HEAD：css', oldCss.length, '/ html', oldHtml.length, '/ js', oldJs.length);

const browser = await chromium.launch();
const open = async (w, h, legacy, files) => {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  if (legacy) {
    if (files.html) await p.route('**/watch.html*', (r) => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: oldHtml }));
    if (files.css) await p.route('**/watch.css*', (r) => r.fulfill({ status: 200, contentType: 'text/css; charset=utf-8', body: oldCss }));
    if (files.js) await p.route('**/watch.js*', (r) => r.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: oldJs }));
  }
  await p.goto(BASE + 'watch.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(500);
  return { ctx, p };
};

/* ---- A 表单：390 与 1440，改前改后（截弹窗顶部：海报字段 + 片名） ---- */
for (const [w, h, tag] of [[390, 844, '390'], [1440, 950, '1440']]) {
  for (const legacy of [true, false]) {
    const { ctx, p } = await open(w, h, legacy, { html: true, css: true, js: true });
    await p.click('.w-fab', { force: true });
    await p.waitForSelector('#add-title', { timeout: 15000 });
    await p.waitForTimeout(500);
    await p.locator('.w-add').screenshot({
      path: OUT + `form_${tag}_${legacy ? 'before' : 'after'}.png`,
      clip: undefined,
    }).catch(async () => { await p.screenshot({ path: OUT + `form_${tag}_${legacy ? 'before' : 'after'}.png` }); });
    await ctx.close();
    console.log(`form ${tag} ${legacy ? 'before' : 'after'} ok`);
  }
}

/* ---- B 评分牌特写（P2-1 色相修正：#e8c15a 偏黄 -> #e8b04b 与 --accent 一致） ---- */
for (const legacy of [true, false]) {
  const { ctx, p } = await open(1440, 950, legacy, { html: false, css: true, js: false });
  await p.waitForFunction(() => {
    const ims = [...document.querySelectorAll('#w-grid .poster img')].slice(0, 3);
    return ims.length >= 3 && ims.every((im) => im.complete && im.naturalWidth > 0);
  }, null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(300);
  await p.locator('#w-grid .poster').nth(1).screenshot({ path: OUT + `score_${legacy ? 'before' : 'after'}.png` }).catch(() => {});
  await ctx.close();
  console.log(`score ${legacy ? 'before' : 'after'} ok`);
}

await browser.close();
console.log('done ->', OUT);
