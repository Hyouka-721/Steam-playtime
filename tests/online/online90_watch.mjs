/* 第 90 轮 watch 侧上线复验：「★和金色评分数字移到影视剧名称旁边」
 *
 * ⚠️ **本轮尚未上线时不要跑**：线上此刻仍是上一版（零填充、评分在海报右下角）。
 *    等用户说「上线」→ fetch/merge → push → Pages 指纹轮询命中后再执行本脚本。
 *
 * 复验口径：
 *   ① 指纹：watch.html 引用 watch.css?v=35 / watch.js?v=25；线上 css/js 字节 md5
 *      与本地全等（CRLF 归一）；线上 CSS 确实是「静态流入标题行」那一版；
 *      线上 watch.json 与本地全等（条数从 items 推导，不手抄）
 *   ② 1440 全库：DOM 顺序、12px 空格、海报内零评分、日期贴右、★/金色/零背景、
 *      hover 不位移不画盘、时间轴 tl-score 隔离、无溢出零异常
 *   ③ 390：间距仍 12px、评分与片名同排、日期独占第二行右对齐、无溢出零异常
 *
 * ⚠️ 线上字节一律在页内 fetch 回传（Node 直连 github.io 不通），统一 --no-proxy-server。
 * ⚠️ 旧 online89_watch 的 B5/C1「角标仍在海报内」是上一版快照，已过期，留档不跑。
 */
import { createRequire } from 'module';
import fs from 'fs';
import crypto from 'crypto';
const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const SITE = 'https://hyouka-721.github.io/Steam-playtime/';
const ROOT = 'C:/Users/33329/WorkBuddy/2026-10-13-18-17-49/steam-playtime/docs/';
const TS = Date.now();
const stripCmt = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const md5 = (b) => crypto.createHash('md5').update(b).digest('hex');
const norm = (s) => String(s).replace(/\r\n/g, '\n');
const md5txt = (s) => md5(Buffer.from(norm(s), 'utf8'));
const localCss = norm(fs.readFileSync(ROOT + 'watch.css', 'utf8'));
const localJs = norm(fs.readFileSync(ROOT + 'watch.js', 'utf8'));
const localWatchRaw = norm(fs.readFileSync(ROOT + 'data/watch.json', 'utf8'));
const localWatch = JSON.parse(localWatchRaw).items;
const N_RATED = localWatch.filter((x) => Number(x.rating) > 0).length;

let pass = 0, fail = 0;
const ok = (n, c, extra = '') => {
  c ? (pass++, console.log(`PASS ${n}${extra ? '  — ' + extra : ''}`))
    : (fail++, console.log(`FAIL ${n}  — ${extra}`));
};

const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
await page.goto(SITE + 'watch.html?t=' + TS, { waitUntil: 'load' });
await page.waitForFunction(() => document.querySelectorAll('#w-grid .poster').length > 20, null, { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(800);

/* ---------- ① 内容指纹 ---------- */
console.log('== ① 内容指纹 ==');
const html = await page.evaluate(async (u) => (await fetch(u, { cache: 'reload' })).text(), SITE + 'watch.html?t=' + TS);
ok('A1 线上 watch.html 引用 watch.css?v=35 / watch.js?v=25',
  /watch\.css\?v=35/.test(html) && /watch\.js\?v=25/.test(html),
  (html.match(/watch\.(css|js)\?v=\d+/g) || []).join(' '));

const liveCss = await page.evaluate(async (u) => (await fetch(u, { cache: 'reload' })).text(), SITE + 'watch.css?v=35&t=' + TS);
const liveJs = await page.evaluate(async (u) => (await fetch(u, { cache: 'reload' })).text(), SITE + 'watch.js?v=25&t=' + TS);
ok('A2 线上 watch.css 字节 md5 与本地全等（CRLF 归一成 LF 后比）',
  md5txt(liveCss) === md5txt(localCss), `${md5txt(liveCss).slice(0, 12)} / ${md5txt(localCss).slice(0, 12)}`);
ok('A3 线上 watch.js 字节 md5 与本地全等（本轮改了 renderGrid，js 必须一起上线）',
  md5txt(liveJs) === md5txt(localJs), `${md5txt(liveJs).slice(0, 12)} / ${md5txt(localJs).slice(0, 12)}`);
const liveNoCmt = stripCmt(liveCss);
const mScore = liveNoCmt.match(/\.poster-score\s*\{([^}]*)\}/);
ok('A4 线上 CSS 是「搬进标题行」那版：无 absolute、有 flex 0 0 auto / margin-left 4px，且零填充未回潮',
  !!mScore && !/position:\s*absolute/.test(mScore[1]) && /flex:\s*0 0 auto/.test(mScore[1]) &&
  /margin-left:\s*4px/.test(mScore[1]) && !/background|box-shadow|filter:/.test(mScore[1]) &&
  !/\.poster-score\s*::\s*(before|after)/.test(liveNoCmt) && /text-shadow:/.test(mScore[1]));
const liveWatch = await page.evaluate(async (u) => (await fetch(u, { cache: 'reload' })).text(), SITE + 'data/watch.json?t=' + TS);
ok('A5 线上 watch.json 与本地全等', norm(liveWatch) === localWatchRaw, `本地 ${localWatch.length} 条`);

/* ---------- ② 1440 运行时 ---------- */
console.log('== ② 1440 运行时（全库逐张） ==');
const MEASURE = () => {
  const cards = [...document.querySelectorAll('#w-grid .poster')];
  const R = (e) => (e ? e.getBoundingClientRect() : null);
  const rows = cards.map((c) => {
    const hd = c.querySelector('.poster-head'), nm = c.querySelector('.poster-name');
    const s = c.querySelector('.poster-score'), dt = c.querySelector('.poster-date');
    const pc = c.querySelector('.poster-pic');
    const cr = R(c), hr = R(hd), nr = R(nm), sr = R(s), dr = R(dt);
    return {
      order: hd ? [...hd.children].map((x) => x.className).join(',') : '',
      inPic: pc ? pc.querySelector('.poster-score') !== null : null,
      gap: sr && nr ? +(sr.left - nr.right).toFixed(2) : null,
      inHead: sr && hr ? (sr.right <= hr.right + .6 && sr.bottom <= hr.bottom + .6 &&
        sr.left >= hr.left - .6 && sr.top >= hr.top - .6) : null,
      noOverlap: sr && dr ? sr.right <= dr.left + .6 : null,
      dateRight: cr && dr ? +(cr.right - dr.right).toFixed(2) : null,
      dateBelow: nr && dr ? dr.top >= nr.bottom - 2 : null,
      sameRow: sr && nr ? Math.abs(sr.top - nr.top) <= 2 : null,
      text: s ? s.textContent.trim() : null,
      star: s ? !!s.querySelector('i') : null,
    };
  });
  return {
    n: rows.length, rows, gaps: rows.map((r) => r.gap),
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  };
};
const spread = (a) => +(Math.max(...a) - Math.min(...a)).toFixed(2);
const rt = await page.evaluate(MEASURE);
ok('B1 线上卡片数 = 本地 watch.json 条数', rt.n === localWatch.length, `线上 ${rt.n} / 本地 ${localWatch.length}`);
ok('B2 全库 DOM 顺序 name→score→date，海报内零评分',
  rt.rows.every((r) => r.order === 'poster-name,poster-score,poster-date' && !r.inPic));
ok('B3 线上「一定空格」全库恒 12px（极差 ≤0.6px）',
  spread(rt.gaps) <= 0.6 && Math.abs(rt.gaps.reduce((a, b) => a + b, 0) / rt.n - 12) <= 0.6,
  `${Math.min(...rt.gaps)}~${Math.max(...rt.gaps)}`);
ok('B4 全库评分在标题行内、与片名同排、不与日期重叠、日期贴右',
  rt.rows.every((r) => r.inHead && r.sameRow && r.noOverlap && r.dateRight <= 1.5 && !r.dateBelow));
ok('B5 ★ + 一位小数全库齐全',
  rt.rows.every((r) => /^★\d+\.\d$/.test(r.text) && r.star), rt.rows.slice(0, 4).map((r) => r.text).join(' '));
const cs = await page.evaluate(() => {
  const s = document.querySelector('.poster-score'), st = s.querySelector('i');
  const c = getComputedStyle(s), b = getComputedStyle(s, '::before');
  return { fs: c.fontSize, fw: c.fontWeight, color: c.color, bg: c.backgroundColor,
    border: c.borderTopWidth, shadow: c.textShadow, box: c.boxShadow,
    bf: (c.backdropFilter || c.webkitBackdropFilter || 'none'),
    pre: b.content, starFs: getComputedStyle(st).fontSize };
});
ok('B6 线上零填充未回潮：12/600/#dcb978、底透明 / border 0 / 无投影无滤镜、::before 不生成、★ 仍 9px、暗晕在',
  cs.fs === '12px' && cs.fw === '600' && cs.color === 'rgb(220, 185, 120)' &&
  /rgba\(0,\s*0,\s*0,\s*0\)|transparent/.test(cs.bg) && parseFloat(cs.border) === 0 &&
  cs.box === 'none' && cs.bf === 'none' && cs.pre === 'none' &&
  /rgba\(0,\s*0,\s*0/.test(cs.shadow) && cs.starFs === '9px',
  `${cs.fs} ${cs.fw} ${cs.color} ★${cs.starFs}`);

const first = page.locator('#w-grid .poster').first();
await first.hover();
await page.waitForTimeout(420);
const hov = await page.evaluate(() => {
  const card = document.querySelector('#w-grid .poster');
  const nm = card.querySelector('.poster-name'), s = card.querySelector('.poster-score');
  const c = getComputedStyle(s);
  return { gap: +(s.getBoundingClientRect().left - nm.getBoundingClientRect().right).toFixed(2),
    color: c.color, bg: c.backgroundColor, box: c.boxShadow };
});
ok('B7 hover 只换字色：间距不变、仍零背景（不位移、不画盘）',
  Math.abs(hov.gap - 12) <= 0.6 && hov.color === 'rgb(232, 176, 75)' &&
  /rgba\(0,\s*0,\s*0,\s*0\)|transparent/.test(hov.bg) && hov.box === 'none',
  `gap=${hov.gap} ${hov.color}`);

await page.mouse.move(1, 1);
await page.click('#w-avatar');
await page.waitForFunction(() => document.querySelectorAll('#w-tl .tl-item').length > 0 &&
  getComputedStyle(document.querySelector('#w-tl')).display !== 'none', null, { timeout: 15000 });
const tl = await page.evaluate(() => ({
  n: document.querySelectorAll('#w-tl .tl-score').length,
  inMeta: [...document.querySelectorAll('#w-tl .tl-score')].every((x) => x.parentElement.classList.contains('tl-meta')),
  mixed: document.querySelectorAll('#w-tl .poster-score').length,
}));
ok('B8 线上时间轴隔离：tl-score 条数 = 有评分条数（' + N_RATED + '）、父仍是 tl-meta、无 poster-score 混入',
  tl.n === N_RATED && tl.inMeta && tl.mixed === 0, `n=${tl.n} 混入=${tl.mixed}`);
ok('B9 1440 无横向溢出 + 零 JS 异常', rt.overflow === 0 && errs.length === 0,
  `ov=${rt.overflow} err=${errs.length}`);
await ctx.close();

/* ---------- ③ 390 运行时 ---------- */
console.log('== ③ 390 运行时 ==');
const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
const mp = await mctx.newPage();
const merrs = [];
mp.on('pageerror', (e) => merrs.push(String(e)));
await mp.goto(SITE + 'watch.html?t=' + TS, { waitUntil: 'load' });
await mp.waitForFunction(() => document.querySelectorAll('#w-grid .poster').length > 20, null, { timeout: 30000 }).catch(() => {});
await mp.waitForTimeout(800);
const m = await mp.evaluate(MEASURE);
ok('C1 390 下全库仍 12px、评分与片名同排、日期独占第二行右对齐、海报内零评分',
  spread(m.gaps) <= 0.6 && Math.abs(m.gaps.reduce((a, b) => a + b, 0) / m.n - 12) <= 0.6 &&
  m.rows.every((r) => r.inHead && r.sameRow && r.dateBelow && r.dateRight <= 1.5 && !r.inPic),
  `gap ${Math.min(...m.gaps)}~${Math.max(...m.gaps)} / 第二行 ${m.rows.filter((r) => r.dateBelow).length}/${m.n}`);
ok('C2 390 无横向溢出 + 零 JS 异常', m.overflow === 0 && merrs.length === 0,
  `ov=${m.overflow} err=${merrs.length}`);

await browser.close();
console.log(`\n===== 第 90 轮 watch 线上复验（评分移入标题行）：${pass} PASS / ${fail} FAIL =====`);
process.exit(fail ? 1 : 0);
