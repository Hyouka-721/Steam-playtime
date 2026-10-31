/* 第 84 轮 watch 侧线上复验：视觉评审第一批 P0（页眉两行式 / 筛选条各占满 / 时间轴顶对齐）
   对应提交：c8b92fa(feat P0) / 498f0eb(shot84 截图脚本)，预期推送 4e04809..498f0eb

   ① 内容指纹：线上 watch.html 引用 v22；watch.css / watch.js 与本地 md5 全等
   ② 390 移动端：页眉 ≤200px（改前 240）、标题单行且仍 44px/1px、两组控件各占满一行且等宽、
      首张海报 top ≤330（改前 379）、时间轴缩略图与片名顶对齐（差 ≤2）、短评末行非单字
   ③ 1440 桌面守护：页眉 173±2、标题单行、筛选条同行 + 网格 5 列、缩略图仍垂直居中
   ④ 安全边界：全程 api.github.com 的 PUT 必须为 0（线上绝不真写）

   ⚠️ 另一条线的 `online84.mjs` 是 index 游戏站的（离线可用 + 本地封面，7 条），
      轮号撞号但文件不撞 —— 本文件带 `_watch` 后缀区分。 */
import { createRequire } from 'module';
import fs from 'fs';
import crypto from 'crypto';
const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const SITE = 'https://hyouka-721.github.io/Steam-playtime/';
const ROOT = 'C:/Users/33329/WorkBuddy/2026-10-13-18-17-49/steam-playtime/docs/';
const OUT = 'C:/Users/33329/AppData/Local/Temp/fx_verify_20261018/shots84online/';
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
const near = (a, b, t = 3) => Math.abs(a - b) <= t;

const browser = await chromium.launch({ args: ['--no-proxy-server'] });

/* 每段独立 context：SW 必须 block（sw.js 会缓存 ?v= 资源，绕过 SW 才是真网络） */
const openAt = async (w, h) => {
  const ctx = await browser.newContext({
    viewport: { width: w, height: h }, deviceScaleFactor: 2,
    bypassCSP: true, serviceWorkers: 'block',
  });
  const p = await ctx.newPage();
  const puts = [], errs = [];
  p.on('request', (r) => { if (r.method() === 'PUT' && /api\.github\.com/.test(r.url())) puts.push(r.url()); });
  p.on('pageerror', (e) => errs.push(String(e)));
  p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  const go = async () => {
    for (let i = 1; i <= 4; i++) {
      try { await p.goto(SITE + 'watch.html', { waitUntil: 'domcontentloaded', timeout: 45000 }); return; }
      catch (e) { if (i === 4) throw e; await p.waitForTimeout(2000); }
    }
  };
  return { ctx, p, puts, errs, go };
};

/* ================= A 内容指纹 ================= */
console.log('== A 内容指纹 ==');
{
  const { ctx, p, go } = await openAt(1440, 900);
  await go();
  const fetched = await p.evaluate(async (site) => {
    const get = async (u) => (await fetch(site + u, { cache: 'reload' })).text();
    const [html, css, js, data] = await Promise.all([
      get('watch.html'), get('watch.css?v=22'), get('watch.js?v=16'), get('data/watch.json'),
    ]);
    return { html, css, js, data };
  }, SITE);

  ok('A1 线上 watch.html 引用 watch.css?v=22 / watch.js?v=16',
    /watch\.css\?v=22/.test(fetched.html) && /watch\.js\?v=16/.test(fetched.html),
    (fetched.html.match(/watch\.(css|js)\?v=\d+/g) || []).join(' '));

  ok('A2 线上 watch.css 与本地逐字节相同（CRLF 归一后 md5 全等）',
    md5txt(fetched.css) === md5txt(localCss), md5txt(fetched.css).slice(0, 12));

  ok('A3 线上 watch.js 与本地逐字节相同（本轮未动，防误伤）',
    md5txt(fetched.js) === md5txt(localJs), md5txt(fetched.js).slice(0, 12));

  const liveData = JSON.parse(fetched.data);
  ok(`A4 线上数据 ${liveData.items.length} 条 = 本地 ${N} 条`,
    liveData.items.length === N, `线上 ${liveData.items.length} / 本地 ${N}`);
  await ctx.close();
}

/* ================= B 390 移动端（三条 P0 的线上证据） ================= */
console.log('\n== B 390 移动端 ==');
{
  const { ctx, p, puts, errs, go } = await openAt(390, 844);
  await go();
  await p.waitForFunction(() => document.querySelectorAll('#w-grid .poster').length > 20, null, { timeout: 30000 }).catch(() => {});
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(600);

  const grid = await p.evaluate(() => {
    const box = (s) => { const e = document.querySelector(s); if (!e) return null;
      const b = e.getBoundingClientRect();
      return { t: +b.top.toFixed(1), h: +b.height.toFixed(1), w: +b.width.toFixed(1) }; };
    const t = document.querySelector('.w-title');
    const cs = t ? getComputedStyle(t) : null;
    return {
      header: box('.w-header'), title: box('.w-title'), seg: box('.w-seg'), sort: box('.w-sort'),
      poster: box('.poster'), vw: document.documentElement.clientWidth,
      font: cs && cs.fontSize, ls: cs && cs.letterSpacing,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });

  ok('B1 页眉高度 ≤200px（改前 240；两行式后约 183）',
    grid.header && grid.header.h <= 200 && near(grid.header.h, 183, 5), `header ${grid.header?.h}px`);
  ok('B2 标题单行（块高 ≤80px；改前折 3 行 211px）',
    grid.title && grid.title.h <= 80, `title ${grid.title?.h}px`);
  ok('B3 标题字号仍 44px / 字距 1px（与首页 .site-title 同值，未因两行式缩字）',
    grid.font === '44px' && grid.ls === '1px', `${grid.font} / ${grid.ls}`);
  ok('B4 分类段与排序两组各占满一行（宽度 ≈ 视口 − 36，两行 top 不同）',
    grid.seg && grid.sort && near(grid.seg.w, grid.vw - 36, 3) && near(grid.sort.w, grid.vw - 36, 3)
    && Math.abs(grid.seg.t - grid.sort.t) > 20,
    `seg ${grid.seg?.w}@${grid.seg?.t} / sort ${grid.sort?.w}@${grid.sort?.t} / vw ${grid.vw}`);
  ok('B5 两组等宽（差 ≤1px，改前 274 vs 167）',
    grid.seg && grid.sort && Math.abs(grid.seg.w - grid.sort.w) <= 1, `${grid.seg?.w} / ${grid.sort?.w}`);
  ok('B6 首张海报起点 ≤330px（改前 379，页眉省下的高度直接让给了内容）',
    grid.poster && grid.poster.t <= 330, `poster.t ${grid.poster?.t}`);
  ok('B7 390 无横向溢出', grid.overflow === 0, `overflow ${grid.overflow}`);

  /* 切到时间轴，量缩略图与片名是否顶对齐 + 短评末行是否孤字 */
  await p.click('#w-avatar');
  await p.waitForSelector('#w-tl .tl-item', { timeout: 20000 }).catch(() => {});
  await p.waitForTimeout(700);

  const tl = await p.evaluate((fnSrc) => {
    const lastLineChars = eval('(' + fnSrc + ')');
    const items = [...document.querySelectorAll('#w-tl .tl-item')].slice(0, 3);
    return items.map((it) => {
      const tb = it.querySelector('.tl-thumb').getBoundingClientRect();
      const nb = it.querySelector('.tl-name').getBoundingClientRect();
      return {
        name: (it.querySelector('.tl-name')?.textContent || '').trim().slice(0, 8),
        delta: +(tb.top - nb.top).toFixed(1),
        lastLen: lastLineChars(it.querySelector('.tl-note')),
      };
    });
  }, `(el) => {
    if (!el) return -1;
    const t = el.firstChild;
    if (!t || t.nodeType !== 3 || t.length < 2) return 99;
    const r = document.createRange();
    const topOf = (i) => { r.setStart(t, i); r.setEnd(t, i + 1); return r.getBoundingClientRect().top; };
    const lastTop = topOf(t.length - 1);
    let n = 1;
    for (let i = t.length - 2; i >= 0; i--) { if (Math.abs(topOf(i) - lastTop) > 2) break; n++; }
    return n;
  }`);

  const worst = tl.reduce((a, r) => Math.max(a, Math.abs(r.delta)), 0);
  ok('B8 时间轴缩略图与片名顶对齐（差 ≤2px；改前缩略图漂在文字块中间 +48.6）',
    tl.length > 0 && worst <= 2, tl.map((r) => `${r.name}:${r.delta}`).join(' '));
  ok('B9 前 3 条短评末行不是单字（text-wrap:pretty 生效）',
    tl.length > 0 && tl.every((r) => r.lastLen !== 1),
    tl.map((r) => `${r.name}:${r.lastLen}`).join(' '));

  /* 截图前等缩略图真解码：`.tl-thumb img` 是 lazy 的，新 context 首次访问要一张张下载；
     只等第一张不够（实测第 2、3 张仍是灰块）→ 等首屏可见的前 3 张都 complete */
  await p.waitForFunction(() => {
    const ims = [...document.querySelectorAll('#w-tl .tl-item img')].slice(0, 3);
    return ims.length >= 3 && ims.every((im) => im.complete && im.naturalWidth > 0);
  }, null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(400);
  await p.screenshot({ path: OUT + '01_390_时间轴.png' });

  ok('B10 390 全程 0 次 PUT、0 个 JS 异常', puts.length === 0 && errs.length === 0,
    `PUT ${puts.length} / err ${errs.length}${errs.length ? ' :: ' + errs[0].slice(0, 60) : ''}`);
  await ctx.close();
}

/* ================= C 1440 桌面守护（必须完全不受影响） ================= */
console.log('\n== C 1440 桌面守护 ==');
{
  const { ctx, p, go } = await openAt(1440, 900);
  await go();
  await p.waitForFunction(() => document.querySelectorAll('#w-grid .poster').length > 20, null, { timeout: 30000 }).catch(() => {});
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(600);

  const d = await p.evaluate(() => {
    const box = (s) => { const e = document.querySelector(s); if (!e) return null;
      const b = e.getBoundingClientRect();
      return { t: +b.top.toFixed(1), h: +b.height.toFixed(1), w: +b.width.toFixed(1), l: +b.left.toFixed(1) }; };
    const t = document.querySelector('.w-title');
    const cs = t ? getComputedStyle(t) : null;
    /* 首行 = 与最高处那一行 top 相同（±2px）的卡片里有多少个不同的 left ——
       不能直接取「前 8 张卡片的 top 去重数」，1440 下前 8 张必然跨两行 */
    const cards = [...document.querySelectorAll('#w-grid .poster')].slice(0, 10);
    const tops = cards.map((c) => c.getBoundingClientRect().top);
    const t0 = tops.length ? Math.min(...tops) : 0;
    const firstRow = new Set(cards.filter((c, i) => Math.abs(tops[i] - t0) < 2)
      .map((c) => Math.round(c.getBoundingClientRect().left))).size;
    return {
      header: box('.w-header'), title: box('.w-title'), seg: box('.w-seg'), sort: box('.w-sort'),
      font: cs && cs.fontSize, ls: cs && cs.letterSpacing, firstRow,
    };
  });

  ok('C1 桌面页眉仍 173±2px（两行式只在 ≤480 生效）',
    d.header && near(d.header.h, 173, 2), `header ${d.header?.h}px`);
  ok('C2 桌面标题字号仍 70px 且单行（块高 ≈ 行高 112，不是 70——别把字号当块高）',
    d.font === '70px' && d.title && d.title.h <= 120, `${d.font} / 块高 ${d.title?.h}px`);
  ok('C3 桌面筛选条仍同一行（seg/sort top 相同）+ 网格首行 5 列',
    d.seg && d.sort && Math.abs(d.seg.t - d.sort.t) < 1 && d.firstRow === 5,
    `seg@${d.seg?.t} sort@${d.sort?.t} 首行 ${d.firstRow} 列`);

  await p.click('#w-avatar');
  await p.waitForSelector('#w-tl .tl-item', { timeout: 20000 }).catch(() => {});
  await p.waitForTimeout(600);
  const desk = await p.evaluate(() => {
    const it = document.querySelector('#w-tl .tl-item');
    if (!it) return null;
    const tb = it.querySelector('.tl-thumb').getBoundingClientRect();
    const ib = it.getBoundingClientRect();
    return { thumbCy: +((tb.top + tb.bottom) / 2).toFixed(1), itemCy: +((ib.top + ib.bottom) / 2).toFixed(1) };
  });
  ok('C4 桌面时间轴缩略图仍垂直居中（thumb.cy ≈ item.cy；顶对齐只在 ≤860）',
    desk && Math.abs(desk.thumbCy - desk.itemCy) < 1, `thumb ${desk?.thumbCy} / item ${desk?.itemCy}`);

  await p.screenshot({ path: OUT + '02_1440_桌面.png' });
  await ctx.close();
}

await browser.close();
console.log(`\n===== 第 84 轮 watch 线上复验：PASS ${pass} / FAIL ${fail} =====`);
process.exit(fail === 0 ? 0 : 1);
