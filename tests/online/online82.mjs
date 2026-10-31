/* 第 82 轮线上复验：页脚「共 N 部影视剧」总数
   对应提交：5416f1e(feat 页脚总数) / 8876151(docs 状态同步)，推送 8a9474a..8876151

   ① 内容指纹：线上 watch.html 引用 v20/v15；watch.css / watch.js 与本地 md5 全等
   ② 页脚三段顺序：更新于 → 共 N 部影视剧 → ← 回到 My Game Time
   ③ 数字契约：线上总数 = 线上 watch.json 的条数（从数据推导，不写死）
   ④ 行为契约：切「电影」总数不变（全量而非筛选数）；时间轴视图照常显示
   ⑤ 窄屏契约：390px 下文档不横向溢出，#w-total 不被右下角加号压住
   写操作安全边界：全程 api.github.com 的 PUT 必须为 0（线上绝不真写）。

   ⚠️ 与另一条线的 `online82_index.mjs`（游戏站 index）**轮号撞号但不撞文件**，
      引用时说清楚是哪一份。 */
import { createRequire } from 'module';
import fs from 'fs';
import crypto from 'crypto';
const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const SITE = 'https://hyouka-721.github.io/Steam-playtime/';
const ROOT = 'C:/Users/33329/WorkBuddy/2026-10-13-18-17-49/steam-playtime/docs/';
const OUT = 'C:/Users/33329/AppData/Local/Temp/fx_verify_20261018/shots82online/';
fs.mkdirSync(OUT, { recursive: true });

const md5 = (b) => crypto.createHash('md5').update(b).digest('hex');
const norm = (s) => String(s).replace(/\r\n/g, '\n');
const md5txt = (s) => md5(Buffer.from(norm(s), 'utf8'));
const localCss = norm(fs.readFileSync(ROOT + 'watch.css', 'utf8'));
const localJs = norm(fs.readFileSync(ROOT + 'watch.js', 'utf8'));
const localData = JSON.parse(fs.readFileSync(ROOT + 'data/watch.json', 'utf8').replace(/^\uFEFF/, ''));
const N = localData.items.length;

let pass = 0, fail = 0;
const ok = (n, c, extra = '') => {
  c ? (pass++, console.log(`PASS ${n}${extra ? '  — ' + extra : ''}`))
    : (fail++, console.log(`FAIL ${n}  — ${extra}`));
};

const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, bypassCSP: true });
const p = await ctx.newPage();
const puts = [];
const errs = [];
p.on('request', (r) => { if (r.method() === 'PUT' && /api\.github\.com/.test(r.url())) puts.push(r.url()); });
p.on('pageerror', (e) => errs.push(String(e)));
p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

async function gotoRetry(url, tries = 4) {
  for (let i = 1; i <= tries; i++) {
    try { await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }); return; }
    catch (e) { if (i === tries) throw e; await p.waitForTimeout(2000); }
  }
}

/* ================= A 内容指纹 ================= */
console.log('== A 内容指纹 ==');
await gotoRetry(SITE + 'watch.html');
const fetched = await p.evaluate(async (site) => {
  const get = async (u) => (await fetch(site + u, { cache: 'reload' })).text();
  const [html, css, js, data] = await Promise.all([
    get('watch.html'), get('watch.css?v=20'), get('watch.js?v=15'), get('data/watch.json'),
  ]);
  return { html, css, js, data };
}, SITE);

ok('A1 线上 watch.html 引用 watch.css?v=20 / watch.js?v=15',
  /watch\.css\?v=20/.test(fetched.html) && /watch\.js\?v=15/.test(fetched.html),
  (fetched.html.match(/watch\.(css|js)\?v=\d+/g) || []).join(' '));

ok('A2 线上 watch.css 与本地逐字节相同（CRLF 归一后 md5 全等）',
  md5txt(fetched.css) === md5txt(localCss), md5txt(fetched.css).slice(0, 12));

ok('A3 线上 watch.js 与本地逐字节相同', md5txt(fetched.js) === md5txt(localJs), md5txt(fetched.js).slice(0, 12));

const liveData = JSON.parse(fetched.data);
ok(`A4 线上数据 ${liveData.items.length} 条 = 本地 ${N} 条`, liveData.items.length === N);

/* ================= B 页脚结构 ================= */
console.log('\n== B 页脚结构 ==');
await p.waitForFunction(() => document.querySelectorAll('#w-grid .poster').length > 50, null, { timeout: 30000 });
await p.waitForTimeout(700);

const foot = await p.evaluate(() => {
  const f = document.querySelector('.w-foot');
  const kids = [...f.children].filter((e) => !e.classList.contains('w-foot-sep'));
  return {
    order: kids.map((e) => (e.id || e.tagName.toLowerCase())),
    updated: (document.getElementById('w-updated') || {}).textContent?.trim(),
    total: (document.getElementById('w-total') || {}).textContent?.trim(),
    hasTags: document.querySelectorAll('#w-tags').length,
  };
});
ok('B1 页脚三段顺序：更新于 → 共 N 部影视剧 → ← 回到 My Game Time',
  JSON.stringify(foot.order) === JSON.stringify(['w-updated', 'w-total', 'a']), foot.order.join(' / '));

ok('B2 线上 HTML 已不含 chip 容器（第 81 轮的撤销也在线上生效）', foot.hasTags === 0, `#w-tags=${foot.hasTags}`);

ok(`B3 总数文案 = 「共 ${N} 部影视剧」，与线上数据条数一致`,
  foot.total === `共 ${N} 部影视剧`, foot.total);

ok('B4 「更新于 …」仍是一句真日期（没被总数挤掉）',
  /^更新于 \d{4}-\d{2}-\d{2}$/.test(foot.updated || ''), foot.updated);

/* ================= C 运行时行为 ================= */
console.log('\n== C 运行时行为 ==');
await p.click('.w-seg-btn[data-kind="movie"]');
await p.waitForTimeout(500);
const afterKind = await p.evaluate(() => ({
  posters: document.querySelectorAll('#w-grid .poster').length,
  total: document.getElementById('w-total').textContent.trim(),
}));
ok(`C1 切「电影」→ 卡片 ${afterKind.posters} 张，页脚仍是「共 ${N} 部影视剧」（总数不随筛选变）`,
  afterKind.posters > 0 && afterKind.posters < N && afterKind.total === `共 ${N} 部影视剧`,
  `${afterKind.posters} 张｜${afterKind.total}`);

await p.click('.w-seg-btn[data-kind="all"]');
await p.waitForTimeout(400);
await p.click('#w-avatar');
await p.waitForFunction(() => document.querySelectorAll('#w-tl .tl-item').length > 50, null, { timeout: 30000 });
await p.waitForTimeout(600);
const tlTotal = await p.$eval('#w-total', (e) => e.textContent.trim());
ok('C2 时间轴视图下页脚照常显示总数', tlTotal === `共 ${N} 部影视剧`, tlTotal);

ok('C3 全程 0 次 PUT（线上绝不会误写仓库）', puts.length === 0, `PUT ${puts.length} 次`);
ok('C4 全程零 JS 异常', errs.length === 0, errs.slice(0, 2).join(' | '));

await p.screenshot({ path: OUT + 'online82_时间轴.png' });

/* ================= D 390 窄屏 ================= */
console.log('\n== D 390 窄屏 ==');
await p.setViewportSize({ width: 390, height: 844 });
await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await p.waitForTimeout(900);
const narrow = await p.evaluate(() => {
  const t = document.getElementById('w-total').getBoundingClientRect();
  const fab = document.getElementById('w-fab').getBoundingClientRect();
  const overlap = !(t.right < fab.left || t.left > fab.right || t.bottom < fab.top || t.top > fab.bottom);
  return {
    docW: document.documentElement.scrollWidth,
    totalRects: document.getElementById('w-total').getClientRects().length,
    totalW: Math.round(t.width),
    overlap,
  };
});
ok('D1 390px：文档不横向溢出（scrollWidth = 390）', narrow.docW <= 391, `scrollWidth=${narrow.docW}`);
ok('D2 390px：总数是连续一整段（1 个行盒，不折成竖排）', narrow.totalRects === 1 && narrow.totalW >= 80,
  `${narrow.totalRects} 行｜宽 ${narrow.totalW}px`);
ok('D3 390px：总数矩形与右下角加号不相交（竖排 + 底部留白生效）', narrow.overlap === false);

await p.screenshot({ path: OUT + 'online82_390.png' });
await ctx.close();
await browser.close();
console.log(`\n===== 第 82 轮线上复验：${pass}/${pass + fail} =====`);
process.exit(fail ? 1 : 0);
