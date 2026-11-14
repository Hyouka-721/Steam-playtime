/* 第 92 轮 watch 侧上线复验：年报按钮从左侧筛选条搬进右排胶囊
 *
 * ⚠️ **本轮尚未上线时不要跑**：线上此刻仍是第 91 轮（v=29 / v=18，年报按钮还在左排）。
 *    等用户说「上线」→ push → Pages 指纹轮询命中后再执行本脚本。
 *
 * 复验口径：
 *   ① 指纹：watch.html 引用 watch.css?v=38 / watch.js?v=30；线上 css/js 字节 md5 与本地全等；
 *      线上 CSS 里确实有这轮的两条硬证据（`.w-sort .w-stats-btn` 并入胶囊 + `.w-sort [hidden]` 兜底）
 *   ② 1440：网格 = 左排 4 档 + 右排 3 个（年报在最左）；时间轴 = 右排只剩年报，两个排序按钮
 *      **computed display:none**（这才是「死控件已修」的硬证据，只看 hidden 属性不够）；
 *      年报展开 = 只剩「返回列表」；返回后三个都回来
 *   ③ 390：仍两行、首张海报 ≤330、时间轴第二行只剩年报、全程 0 溢出 0 异常
 *
 * ⚠️ 线上字节一律在页内 fetch 回传（Node 直连 github.io 不通），统一 --no-proxy-server。
 */
import { createRequire } from 'module';
import fs from 'fs';
import crypto from 'crypto';
const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const SITE = 'https://hyouka-721.github.io/Steam-playtime/';
const ROOT = 'C:/Users/33329/WorkBuddy/2026-10-13-18-17-49/steam-playtime/docs/';
const TS = Date.now();
const md5 = (b) => crypto.createHash('md5').update(b).digest('hex');
const norm = (s) => String(s).replace(/\r\n/g, '\n');
const md5txt = (s) => md5(Buffer.from(norm(s), 'utf8'));
const stripCmt = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');

const localCss = norm(fs.readFileSync(ROOT + 'watch.css', 'utf8'));
const localJs = norm(fs.readFileSync(ROOT + 'watch.js', 'utf8'));
const N = JSON.parse(norm(fs.readFileSync(ROOT + 'data/watch.json', 'utf8'))).items.length;

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
await page.waitForTimeout(900);

/* ---------- ① 内容指纹 ---------- */
console.log('== ① 内容指纹 ==');
const html = await page.evaluate(async (u) => (await fetch(u, { cache: 'reload' })).text(), SITE + 'watch.html?t=' + TS);
ok('A1 线上 watch.html 引用 watch.css?v=38 / watch.js?v=30',
  /watch\.css\?v=38/.test(html) && /watch\.js\?v=30/.test(html),
  (html.match(/watch\.(css|js)\?v=\d+/g) || []).join(' '));

const liveCss = await page.evaluate(async (u) => (await fetch(u, { cache: 'reload' })).text(), SITE + 'watch.css?v=38&t=' + TS);
const liveJs = await page.evaluate(async (u) => (await fetch(u, { cache: 'reload' })).text(), SITE + 'watch.js?v=30&t=' + TS);
ok('A2 线上 watch.css 字节 md5 与本地全等', md5txt(liveCss) === md5txt(localCss),
  `${md5txt(liveCss).slice(0, 12)} / ${md5txt(localCss).slice(0, 12)}`);
ok('A3 线上 watch.js 字节 md5 与本地全等（js 也改了 paint，必须一起上线）',
  md5txt(liveJs) === md5txt(localJs), `${md5txt(liveJs).slice(0, 12)} / ${md5txt(localJs).slice(0, 12)}`);

const liveNoCmt = stripCmt(liveCss);
ok('A4 线上 CSS 带本轮两条硬证据：年报并入胶囊 + [hidden] 兜底',
  /\.w-sort \.w-stats-btn \{[\s\S]*?border: 0; background: none;/.test(liveNoCmt) &&
  /\.w-sort \[hidden\] \{ display: none; \}/.test(liveNoCmt));

const liveHtmlSeg = (html.match(/<div class="w-seg"[\s\S]*?\n  <\/div>/) || [''])[0];
const liveHtmlSort = (html.match(/<div class="w-sort"[\s\S]*?\n  <\/div>/) || [''])[0];
ok('A5 线上 HTML 结构：年报在 #w-sort 内、左排只剩 4 档',
  /id="w-stats-btn"/.test(liveHtmlSort) && !/id="w-stats-btn"/.test(liveHtmlSeg) &&
  (liveHtmlSeg.match(/class="w-seg-btn/g) || []).length === 4 &&
  /aria-label="视图与排序"/.test(liveHtmlSort),
  `左排 ${(liveHtmlSeg.match(/class="w-seg-btn/g) || []).length} 个`);

/* ---------- ② 1440 运行时 ---------- */
console.log('== ② 1440 运行时 ==');
const probe = () => page.evaluate(() => {
  const shown = (e) => !!e && !e.hidden && getComputedStyle(e).display !== 'none';
  const txt = (e) => e.textContent.trim();
  const sortEl = document.getElementById('w-sort');
  const sb = sortEl.getBoundingClientRect();
  const stb = document.getElementById('w-stats-btn');
  return {
    segBtns: [...document.querySelectorAll('.w-seg > .w-seg-btn')].map(txt),
    segHasStats: !!document.querySelector('.w-seg #w-stats-btn'),
    sortVisible: [...sortEl.querySelectorAll('.w-sort-btn')].filter(shown).map((b) => b.dataset.sort),
    sortAll: [...sortEl.querySelectorAll('.w-sort-btn')].length,
    statsShown: shown(stb), statsText: txt(stb),
    wrapShown: shown(sortEl), wrapW: +sb.width.toFixed(0),
    statsW: +stb.getBoundingClientRect().width.toFixed(0),
    statsLeft: +stb.getBoundingClientRect().left.toFixed(0),
    sortFirstLeft: +sortEl.querySelector('.w-sort-btn').getBoundingClientRect().left.toFixed(0),
    grid: document.querySelectorAll('#w-grid .poster').length,
    gridShown: shown(document.getElementById('w-grid')),
    tlShown: shown(document.getElementById('w-tl')),
    ov: document.documentElement.scrollWidth - document.documentElement.clientWidth
  };
});

const g = await probe();
ok('B1 网格：左排 4 档、右排三个都在、年报在最左、年报不在左排',
  g.segBtns.length === 4 && !g.segHasStats && g.sortVisible.length === 2 && g.statsShown &&
  g.statsText === '年报' && g.statsLeft < g.sortFirstLeft && g.grid === N,
  `左 ${g.segBtns.join('/')}；年报@${g.statsLeft} 排序@${g.sortFirstLeft}；卡片 ${g.grid}`);

await page.click('#w-avatar');
await page.waitForFunction(() => !document.getElementById('w-tl').hidden, null, { timeout: 15000 });
await page.waitForTimeout(500);
const t = await probe();
ok('B2 时间轴：两个排序按钮 computed display:none（死控件已修，不是靠 hidden 属性糊过去）',
  t.sortVisible.length === 0 && t.sortAll === 2, `可见 ${t.sortVisible.length} / 共 ${t.sortAll}`);
ok('B3 时间轴：右排容器还在、只剩年报、胶囊收缩到年报本身',
  t.wrapShown && t.statsShown && t.statsText === '年报' && t.wrapW <= t.statsW + 12,
  `容器 ${t.wrapW}px / 年报 ${t.statsW}px`);

await page.click('#w-stats-btn');
await page.waitForTimeout(500);
const s = await probe();
ok('B4 年报展开：右排只剩「返回列表」，容器与按钮都在（用户能退出来）',
  s.wrapShown && s.statsShown && s.statsText === '返回列表' && s.sortVisible.length === 0,
  `${s.statsText} 容器 ${s.wrapW}px`);

await page.click('#w-stats-btn');
await page.waitForTimeout(500);
const back = await probe();
ok('B5 返回：回到时间轴，两个排序按钮仍隐藏（因为还在时间轴）',
  back.tlShown && !back.gridShown && back.sortVisible.length === 0 && back.statsText === '年报',
  `时间轴=${back.tlShown} 排序可见=${back.sortVisible.length}`);

await page.click('#w-avatar');
await page.waitForFunction(() => !document.getElementById('w-grid').hidden, null, { timeout: 8000 });
await page.waitForTimeout(400);
const g2 = await probe();
ok('B6 切回网格：三个按钮全回来、卡片 ' + N + ' 张、无横向溢出',
  g2.sortVisible.length === 2 && g2.statsShown && g2.grid === N && g2.ov <= 0,
  `排序可见=${g2.sortVisible.length} 卡片=${g2.grid} ov=${g2.ov}`);
ok('B7 1440 零 JS 异常', errs.length === 0, errs.slice(0, 3).join(' | '));
await ctx.close();

/* ---------- ③ 390 运行时 ---------- */
console.log('== ③ 390 运行时 ==');
const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
const mp = await mctx.newPage();
const merrs = [];
mp.on('pageerror', (e) => merrs.push(String(e)));
await mp.goto(SITE + 'watch.html?t=' + TS, { waitUntil: 'load' });
await mp.waitForFunction(() => document.querySelectorAll('#w-grid .poster').length > 20, null, { timeout: 30000 }).catch(() => {});
await mp.waitForTimeout(900);
const m = await mp.evaluate(() => {
  const b = (s) => { const r = document.querySelector(s).getBoundingClientRect(); return { l: +r.left.toFixed(0), r: +r.right.toFixed(0), t: +r.top.toFixed(0), w: +r.width.toFixed(0) }; };
  return {
    vw: window.innerWidth, seg: b('.w-seg'), sort: b('.w-sort'), first: b('#w-grid .poster'),
    ov: document.documentElement.scrollWidth - window.innerWidth,
    shown: [...document.querySelectorAll('#w-sort .w-sort-btn')].filter((x) => getComputedStyle(x).display !== 'none').length
  };
});
ok('C1 390 仍是两行：两排各占满一行、首张海报起点 ≤330、三按钮等分',
  m.seg.w >= m.vw - 40 && m.sort.w >= m.vw - 40 && m.sort.t >= m.seg.t + 30 &&
  m.first.t <= 330 && m.ov <= 0 && m.shown === 2,
  `首图 ${m.first.t} / ov=${m.ov}`);

await mp.click('#w-avatar');
await mp.waitForFunction(() => !document.getElementById('w-tl').hidden, null, { timeout: 15000 });
await mp.waitForTimeout(400);
const mt = await mp.evaluate(() => {
  const b = (s) => { const r = document.querySelector(s).getBoundingClientRect(); return { l: +r.left.toFixed(0), r: +r.right.toFixed(0) }; };
  return {
    vw: window.innerWidth, sort: b('.w-sort'),
    shown: [...document.querySelectorAll('#w-sort > button')].filter((x) => getComputedStyle(x).display !== 'none').map((x) => x.textContent.trim()),
    ov: document.documentElement.scrollWidth - window.innerWidth
  };
});
ok('C2 390 时间轴：第二行只剩「年报」，不越界、无溢出',
  mt.shown.length === 1 && mt.shown[0] === '年报' &&
  mt.sort.l >= -1 && mt.sort.r <= mt.vw + 1 && mt.ov <= 0,
  `第二行 ${mt.shown.join('/')} ov=${mt.ov}`);
ok('C3 390 零 JS 异常', merrs.length === 0, merrs.slice(0, 3).join(' | '));

await browser.close();
console.log(`\n===== 第 92 轮 watch 线上复验（年报按钮搬进右排）：${pass} PASS / ${fail} FAIL =====`);
process.exit(fail ? 1 : 0);
