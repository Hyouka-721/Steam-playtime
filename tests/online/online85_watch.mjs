/* 第 85 轮 watch 侧线上复验：视觉评审第二批 P1（字阶归一 / 片名单行省略 / 评分牌加边）
   对应提交：6d6ec4b，预期推送 48a9865..6d6ec4b（线上 watch.css?v=23）

   ① 内容指纹：线上引用 v23；css/js 与本地 md5 全等；条数从数据推导
   ② 1440：121 张片名全部单行、同排短评对齐、长名走省略号、评分牌 1px 描边、
      计算后字号落在整数档（12px）、无溢出
   ③ 390：仍有片名折两行（clamp 未被单行规则带走）、评分牌不越界、无溢出
   ④ 守护：时间轴 21 / 19 两档未被字阶归一影响（第 64 轮契约）

   ⚠️ 另一条线的 `online85*.mjs` 属 index 站，本文件带 `_watch` 后缀区分。
   ⚠️ 等图片要等**首屏可见的前 3 张**缩略图/海报 complete，只等第一张会截出灰块。 */
import { createRequire } from 'module';
import fs from 'fs';
import crypto from 'crypto';
const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const SITE = 'https://hyouka-721.github.io/Steam-playtime/';
const ROOT = 'C:/Users/33329/WorkBuddy/2026-10-13-18-17-49/steam-playtime/docs/';
const OUT = 'C:/Users/33329/AppData/Local/Temp/fx_verify_20261018/shots85online/';
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
const openAt = async (w, h) => {
  const ctx = await browser.newContext({
    viewport: { width: w, height: h }, deviceScaleFactor: 2, bypassCSP: true, serviceWorkers: 'block',
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
      get('watch.html'), get('watch.css?v=23'), get('watch.js?v=16'), get('data/watch.json'),
    ]);
    return { html, css, js, data };
  }, SITE);

  ok('A1 线上 watch.html 引用 watch.css?v=23 / watch.js?v=16（js 本轮未动）',
    /watch\.css\?v=23/.test(fetched.html) && /watch\.js\?v=16/.test(fetched.html),
    (fetched.html.match(/watch\.(css|js)\?v=\d+/g) || []).join(' '));
  ok('A2 线上 watch.css 与本地逐字节相同（CRLF 归一后 md5 全等）',
    md5txt(fetched.css) === md5txt(localCss), md5txt(fetched.css).slice(0, 12));
  ok('A3 线上 watch.js 与本地逐字节相同（防误伤）',
    md5txt(fetched.js) === md5txt(localJs), md5txt(fetched.js).slice(0, 12));
  const liveData = JSON.parse(fetched.data);
  ok(`A4 线上数据 ${liveData.items.length} 条 = 本地 ${N} 条`, liveData.items.length === N);
  await ctx.close();
}

/* 量一遍网格：单行 / 同排对齐 / 省略 / 描边 / 字号 */
const measure = async (W, H) => {
  const { ctx, p, puts, errs, go } = await openAt(W, H);
  await go();
  await p.waitForFunction(() => document.querySelectorAll('#w-grid .poster').length > 20, null, { timeout: 30000 }).catch(() => {});
  await p.evaluate(() => document.fonts.ready);
  await p.waitForFunction(() => {
    const ims = [...document.querySelectorAll('#w-grid .poster img')].slice(0, 3);
    return ims.length >= 3 && ims.every((im) => im.complete && im.naturalWidth > 0);
  }, null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(400);
  const data = await p.evaluate(() => {
    const cards = [...document.querySelectorAll('#w-grid .poster')];
    const rows = cards.map((c) => {
      const n = c.querySelector('.poster-name');
      const note = c.querySelector('.poster-note');
      const score = c.querySelector('.poster-score');
      const pic = c.querySelector('.poster-pic');
      const cs = getComputedStyle(n);
      const lh = parseFloat(cs.lineHeight);
      const sR = score.getBoundingClientRect(), pR = pic.getBoundingClientRect();
      return {
        cardTop: Math.round(c.getBoundingClientRect().top),
        name: n.textContent.trim(),
        lines: +(n.getBoundingClientRect().height / lh).toFixed(2),
        clipped: n.scrollWidth > n.clientWidth + 1,
        ellipsis: cs.textOverflow,
        noteTop: +note.getBoundingClientRect().top.toFixed(1),
        nameFs: parseFloat(cs.fontSize),
        noteFs: parseFloat(getComputedStyle(note).fontSize),
        dateFs: parseFloat(getComputedStyle(c.querySelector('.poster-date')).fontSize),
        scoreBorder: getComputedStyle(score).borderTopWidth,
        scoreFs: parseFloat(getComputedStyle(score).fontSize),
        scoreInside: sR.right <= pR.right + 0.6 && sR.bottom <= pR.bottom + 0.6
          && sR.left >= pR.left - 0.6 && sR.top >= pR.top - 0.6,
      };
    });
    const groups = new Map();
    rows.forEach((r) => { const g = groups.get(r.cardTop) || []; g.push(r.noteTop); groups.set(r.cardTop, g); });
    return {
      n: rows.length, rows,
      worstSpread: Math.max(...[...groups.values()].map((v) => +(Math.max(...v) - Math.min(...v)).toFixed(1))),
      multiLine: rows.filter((r) => r.lines > 1.5).length,
      clipped: rows.filter((r) => r.clipped),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  await p.screenshot({ path: OUT + `P1_${W}.png` });
  await ctx.close();
  return { data, puts, errs };
};

/* ================= B 1440 桌面 ================= */
console.log('\n== B 1440 桌面 ==');
{
  const { data, puts, errs } = await measure(1440, 950);
  const multi = data.rows.filter((r) => r.lines > 1.2);
  ok(`B1 全部 ${data.n} 张卡片片名单行（行数 ≤1.2；改前有 2 张两行）`,
    multi.length === 0, multi.map((r) => `${r.name}:${r.lines}`).slice(0, 3).join(' '));
  ok('B2 同一行内短评起始位置对齐（差 ≤0.5px；改前含长名那排差 19.6px）',
    data.worstSpread <= 0.5, `最差 ${data.worstSpread}px`);
  ok(`B3 超长片名走省略号（本地那 2 部在线上仍存在且被裁剪）`,
    data.clipped.length > 0 && data.clipped.every((r) => r.ellipsis === 'ellipsis'),
    data.clipped.map((r) => r.name).slice(0, 3).join(' / ') || '无裁剪');
  ok('B4 评分牌 1px 描边 + 字号 13px（加边没把尺寸撑大、也没缩小字）',
    data.rows.every((r) => r.scoreBorder === '1px') && data.rows[0].scoreFs === 13,
    `${data.rows[0].scoreBorder} / ${data.rows[0].scoreFs}px`);
  ok('B5 计算后字号落在整数档（片名 14 / 日期 12 / 短评 12；不再是 14.5-12.5-11.5 那套）',
    data.rows.every((r) => r.nameFs === 14 && r.dateFs === 12 && r.noteFs === 12),
    `name ${data.rows[0].nameFs} / date ${data.rows[0].dateFs} / note ${data.rows[0].noteFs}`);
  ok('B6 1440 无横向溢出 + 0 次 PUT + 零 JS 异常',
    data.overflow === 0 && puts.length === 0 && errs.length === 0,
    `overflow ${data.overflow} / PUT ${puts.length} / err ${errs.length}`);
}

/* ================= C 390 窄屏 ================= */
console.log('\n== C 390 窄屏 ==');
{
  const { data, errs } = await measure(390, 844);
  ok(`C1 窄屏仍有片名折两行（${data.multiLine} 张；clamp 没被单行规则带走）`,
    data.multiLine > 0, `multiLine ${data.multiLine}`);
  ok('C2 评分牌完全落在海报矩形内（描边未越界）',
    data.rows.every((r) => r.scoreInside), `越界 ${data.rows.filter((r) => !r.scoreInside).length} 张`);
  ok('C3 390 无横向溢出 + 零 JS 异常', data.overflow === 0 && errs.length === 0,
    `overflow ${data.overflow} / err ${errs.length}`);
}

/* ================= D 时间轴守护 ================= */
console.log('\n== D 时间轴守护（第 64 轮字号契约） ==');
{
  const { ctx, p, go } = await openAt(1440, 900);
  await go();
  await p.click('#w-avatar');
  await p.waitForSelector('#w-tl .tl-item', { timeout: 25000 }).catch(() => {});
  await p.waitForTimeout(600);
  const fs_ = await p.evaluate(() => {
    const it = document.querySelector('#w-tl .tl-item');
    const g = (s) => (it && it.querySelector(s) ? parseFloat(getComputedStyle(it.querySelector(s)).fontSize) : -1);
    return { name: g('.tl-name'), en: g('.tl-en'), note: g('.tl-note') };
  });
  ok('D1 时间轴 21 / 18.5 / 19 三档未被字阶归一改动',
    fs_.name === 21 && fs_.en === 18.5 && fs_.note === 19,
    `${fs_.name} / ${fs_.en} / ${fs_.note}`);
  await ctx.close();
}

await browser.close();
console.log(`\n===== 第 85 轮 watch 线上复验：PASS ${pass} / FAIL ${fail} =====`);
process.exit(fail === 0 ? 0 : 1);
