/* 第 84 轮第一批 P0 的「改前 / 改后」对照截图。
   改前的 CSS 不在工作区了（已提交），所以用 page.route 把 watch.css 的响应换成
   `git show <上一提交>:docs/watch.css` 的内容 —— 页面其余部分（HTML/JS/数据/图片）完全一致，
   差别只可能是那三条 P0 规则。
   ⚠️ 必须 serviceWorkers:'block'：sw.js 会缓存 ?v= 资源，route 拦不到 SW 发出的请求。 */
import { createRequire } from 'module';
import { execFileSync } from 'child_process';
import fs from 'fs';

const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const REPO = 'C:/Users/33329/WorkBuddy/2026-10-13-18-17-49/steam-playtime';
const BASE = 'http://127.0.0.1:8895/watch.html';
const OUT = 'C:/Users/33329/AppData/Local/Temp/fx_verify_20261018/shots84/';
fs.mkdirSync(OUT, { recursive: true });

const oldCss = execFileSync('git', ['show', 'HEAD~1:docs/watch.css'], { cwd: REPO, encoding: 'utf8', maxBuffer: 1 << 24 });
const newCss = fs.readFileSync(REPO + '/docs/watch.css', 'utf8');
console.log(`old css ${oldCss.length}B / new css ${newCss.length}B`);

const browser = await chromium.launch({ args: ['--no-proxy-server'] });

const CAPS = [
  { name: '390_grid', w: 390, h: 844, view: 'grid' },
  { name: '390_tl', w: 390, h: 844, view: 'tl' },
  { name: '1440_grid', w: 1440, h: 900, view: 'grid' },
];

const measure = async (p, view) => p.evaluate((view) => {
  const box = (s) => { const e = document.querySelector(s); if (!e) return null;
    const b = e.getBoundingClientRect(); return { t: +b.top.toFixed(1), b: +b.bottom.toFixed(1), h: +b.height.toFixed(1), w: +b.width.toFixed(1) }; };
  const r = { header: box('.w-header'), title: box('.w-title'), seg: box('.w-seg'), sort: box('.w-sort') };
  const first = document.querySelector('.poster');
  r.firstPoster = first ? box('.poster') : null;
  if (view === 'tl') {
    const it = document.querySelector('#w-tl .tl-item');
    if (it) {
      const tb = it.querySelector('.tl-thumb').getBoundingClientRect();
      const nb = it.querySelector('.tl-name').getBoundingClientRect();
      r.thumbTop = +tb.top.toFixed(1); r.nameTop = +nb.top.toFixed(1);
      r.thumbDelta = +(tb.top - nb.top).toFixed(1);
    }
  }
  return r;
}, view);

for (const cap of CAPS) {
  for (const variant of ['before', 'after']) {
    const ctx = await browser.newContext({
      viewport: { width: cap.w, height: cap.h }, deviceScaleFactor: 2, serviceWorkers: 'block',
    });
    const p = await ctx.newPage();
    if (variant === 'before') {
      await p.route('**/watch.css*', (r) => r.fulfill({ contentType: 'text/css', body: oldCss }));
    } else {
      /* 对照组也走 route，确保两边唯一的差别就是 CSS 内容（都从 route 进，避免缓存路径不同） */
      await p.route('**/watch.css*', (r) => r.fulfill({ contentType: 'text/css', body: newCss }));
    }
    await p.goto(BASE, { waitUntil: 'load' });
    await p.evaluate(() => document.fonts.ready);
    await p.waitForFunction(() => {
      const im = document.querySelector('#w-grid .poster img');
      return im && im.complete && !!im.currentSrc;
    }, null, { timeout: 20000 }).catch(() => {});
    if (cap.view === 'tl') {
      await p.click('#w-avatar');
      await p.waitForSelector('#w-tl .tl-item', { timeout: 15000 }).catch(() => {});
    }
    await p.waitForTimeout(700);
    const m = await measure(p, cap.view);
    await p.screenshot({ path: `${OUT}${cap.name}_${variant}.png` });
    console.log(`${cap.name} ${variant}:`, JSON.stringify(m));
    await ctx.close();
  }
}

await browser.close();
console.log('OUT =', OUT);
