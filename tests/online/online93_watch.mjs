/* 第 93 轮 watch 侧上线复验：年报按钮只在时间轴出现，网格视图右排只剩两个排序按钮
 *
 * ⚠️ **本轮尚未上线时不要跑**：线上此刻仍是第 92 轮（v=30 / v=19，网格里年报还露着）。
 *    等用户说「上线」→ push → Pages 指纹轮询命中后再执行本脚本。
 *
 * 复验口径：
 *   ① 指纹：watch.html 引用 watch.css?v=35 / watch.js?v=27；线上 css/js 字节 md5 与本地全等；
 *      线上 JS 里确实有这轮的判据（`statsBtnEl.hidden = !(statsOn || layout === 'timeline')`）
 *      —— 版本号只说明引用变了，判据在字节里才说明逻辑真的上线
 *   ② 1440：网格 = 年报 **hidden 且 computed display:none**（只看 hidden 属性不够，第 92 轮的
 *      死控件就是属性在、CSS 把它盖回来了）；时间轴 = 只剩年报；年报展开 = 只剩「返回列表」；
 *      **年报展开中点头像切网格，「返回列表」仍可见**（判据带 statsOn，别把人关在年报里）
 *   ③ 390：仍两行、年报不显示、首张海报 ≤330、时间轴第二行只剩年报、全程 0 溢出 0 异常
 *
 * ⚠️ 线上字节一律在页内 fetch 回传（Node 直连 github.io 不通），统一 --no-proxy-server。
 * ⚠️ 本套件全程只读：不点加号、不录数据，不会产生任何 PUT。
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
ok('A1 线上 watch.html 引用 watch.css?v=35 / watch.js?v=27',
  /watch\.css\?v=35/.test(html) && /watch\.js\?v=27/.test(html),
  (html.match(/watch\.(css|js)\?v=\d+/g) || []).join(' '));

const liveCss = await page.evaluate(async (u) => (await fetch(u, { cache: 'reload' })).text(), SITE + 'watch.css?v=35&t=' + TS);
const liveJs = await page.evaluate(async (u) => (await fetch(u, { cache: 'reload' })).text(), SITE + 'watch.js?v=27&t=' + TS);
ok('A2 线上 watch.css 字节 md5 与本地全等（本轮 CSS 未动，等于校验没被别的轮次串版）',
  md5txt(liveCss) === md5txt(localCss),
  `${md5txt(liveCss).slice(0, 12)} / ${md5txt(localCss).slice(0, 12)}`);
ok('A3 线上 watch.js 字节 md5 与本地全等', md5txt(liveJs) === md5txt(localJs),
  `${md5txt(liveJs).slice(0, 12)} / ${md5txt(localJs).slice(0, 12)}`);

const liveJsNoCmt = stripCmt(liveJs);
ok('A4 线上 JS 里确有本轮判据（带 statsOn，不是只按 layout 判）',
  /statsBtnEl\.hidden = !\(statsOn \|\| layout === 'timeline'\)/.test(liveJsNoCmt),
  (liveJsNoCmt.match(/statsBtnEl\.hidden[^\n]*/) || ['n/a'])[0].trim());

/* ---------- ② 1440 运行时 ---------- */
console.log('== ② 1440 运行时 ==');
const probe = () => page.evaluate(() => {
  const shown = (e) => !!e && !e.hidden && getComputedStyle(e).display !== 'none';
  const txt = (e) => e.textContent.trim();
  const sortEl = document.getElementById('w-sort');
  const sb = sortEl.getBoundingClientRect();
  const stb = document.getElementById('w-stats-btn');
  return {
    sortVisible: [...sortEl.querySelectorAll('.w-sort-btn')].filter(shown).map((b) => b.dataset.sort),
    sortAll: [...sortEl.querySelectorAll('.w-sort-btn')].length,
    statsShown: shown(stb), statsAttrHidden: stb.hidden, statsText: txt(stb),
    wrapShown: shown(sortEl), wrapW: +sb.width.toFixed(0),
    statsW: +stb.getBoundingClientRect().width.toFixed(0),
    grid: document.querySelectorAll('#w-grid .poster').length,
    gridShown: shown(document.getElementById('w-grid')),
    tlShown: shown(document.getElementById('w-tl')),
    ov: document.documentElement.scrollWidth - document.documentElement.clientWidth
  };
});

const g = await probe();
ok('B1 网格：年报 hidden 且 computed display:none，右排只剩「观看时间 / 评分」，卡片 ' + N + ' 张',
  g.statsAttrHidden && !g.statsShown && g.sortVisible.join('/') === 'time/rating' &&
  g.sortAll === 2 && g.grid === N && g.gridShown,
  `年报 hidden=${g.statsAttrHidden} 可见=${g.statsShown}；右排 ${g.sortVisible.join('/')}；卡片 ${g.grid}`);

await page.click('#w-avatar');
await page.waitForFunction(() => !document.getElementById('w-tl').hidden, null, { timeout: 15000 });
await page.waitForTimeout(500);
const t = await probe();
ok('B2 时间轴：右排有且只有「年报」，两个排序按钮收起',
  t.statsShown && t.statsText === '年报' && t.sortVisible.length === 0 && t.tlShown && !t.gridShown,
  `年报=${t.statsShown} 排序可见 ${t.sortVisible.length} 个`);
ok('B3 时间轴：右排胶囊收缩到年报本身（无残留空胶囊）',
  t.wrapShown && t.wrapW <= t.statsW + 12, `容器 ${t.wrapW}px / 年报 ${t.statsW}px`);

await page.click('#w-stats-btn');
await page.waitForTimeout(500);
const s = await probe();
ok('B4 年报展开：右排只剩「返回列表」，容器与按钮都在（用户能退出来）',
  s.wrapShown && s.statsShown && s.statsText === '返回列表' && s.sortVisible.length === 0,
  `${s.statsText} 容器 ${s.wrapW}px`);

/* ★ 本轮最关键的一条：年报展开时点头像切网格，「返回列表」必须仍然可见 */
await page.click('#w-avatar');
await page.waitForTimeout(500);
const s2 = await probe();
ok('B5 年报展开中点头像切网格：「返回列表」仍可见（statsOn 进了判据，不会把人关在年报里）',
  s2.statsShown && s2.statsText === '返回列表' && s2.ov <= 0,
  `按钮=${s2.statsText} 可见=${s2.statsShown}`);

await page.click('#w-stats-btn');
await page.waitForTimeout(500);
const back = await probe();
ok('B6 从年报返回：落在网格（头像已把它切到网格）、年报按钮重新隐藏、两个排序按钮回来',
  back.gridShown && !back.statsShown && back.statsAttrHidden &&
  back.sortVisible.join('/') === 'time/rating' && back.grid === N,
  `grid=${back.gridShown} 年报可见=${back.statsShown} 右排 ${back.sortVisible.join('/')}`);
ok('B7 1440 全程无横向溢出 + 零 JS 异常', g.ov <= 0 && s.ov <= 0 && back.ov <= 0 && errs.length === 0,
  `ov=${g.ov}/${s.ov}/${back.ov} err=${errs.length}`);
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
  const vis = (e) => !!e && !e.hidden && getComputedStyle(e).display !== 'none';
  return {
    vw: window.innerWidth, seg: b('.w-seg'), sort: b('.w-sort'), first: b('#w-grid .poster'),
    ov: document.documentElement.scrollWidth - window.innerWidth,
    btns: [...document.querySelectorAll('#w-sort > button')].filter(vis).map((x) => x.textContent.trim()),
    statsShown: vis(document.getElementById('w-stats-btn'))
  };
});
ok('C1 390 网格：第二行只剩「观看时间 / 评分」，年报不显示，首张海报起点 ≤330、无溢出',
  m.btns.length === 2 && !m.statsShown && m.seg.w >= m.vw - 40 && m.sort.w >= m.vw - 40 &&
  m.sort.t >= m.seg.t + 30 && m.first.t <= 330 && m.ov <= 0,
  `第二行 ${m.btns.join('/')} 首图 ${m.first.t} ov=${m.ov}`);

await mp.click('#w-avatar');
await mp.waitForFunction(() => !document.getElementById('w-tl').hidden, null, { timeout: 15000 });
await mp.waitForTimeout(400);
const mt = await mp.evaluate(() => {
  const b = (s) => { const r = document.querySelector(s).getBoundingClientRect(); return { l: +r.left.toFixed(0), r: +r.right.toFixed(0) }; };
  const vis = (e) => !!e && !e.hidden && getComputedStyle(e).display !== 'none';
  return {
    vw: window.innerWidth, sort: b('.w-sort'),
    btns: [...document.querySelectorAll('#w-sort > button')].filter(vis).map((x) => x.textContent.trim()),
    ov: document.documentElement.scrollWidth - window.innerWidth
  };
});
ok('C2 390 时间轴：第二行只剩「年报」，不越界、无溢出',
  mt.btns.length === 1 && mt.btns[0] === '年报' &&
  mt.sort.l >= -1 && mt.sort.r <= mt.vw + 1 && mt.ov <= 0,
  `第二行 ${mt.btns.join('/')} ov=${mt.ov}`);
ok('C3 390 零 JS 异常', merrs.length === 0, merrs.slice(0, 3).join(' | '));

await browser.close();
console.log(`\n===== 第 93 轮 watch 线上复验（网格视图隐藏年报按钮）：${pass} PASS / ${fail} FAIL =====`);
process.exit(fail ? 1 : 0);
