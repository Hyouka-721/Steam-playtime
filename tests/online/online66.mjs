/* 第 66 轮线上复验：六项需求在 Pages 上逐条生效 + 本地/线上内容指纹一致
   注意事项（前几轮的坑）：
   · 本机到 Pages 带宽抖动大 → goto 用 domcontentloaded + 重试，再用 waitForFunction 等数据渲染
   · paint() 一次只渲染一种视图 → 时间轴条目要在切过去之后再数
   · 截图前先预热图片（.poster-pic img 默认 opacity:0，靠 load 事件加 is-loaded） */
import { createRequire } from 'module';
import fs from 'fs';
import crypto from 'crypto';
const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const SITE = 'https://hyouka-721.github.io/Steam-playtime/';
const ROOT = 'C:/Users/33329/WorkBuddy/2026-10-13-18-17-49/steam-playtime/docs/';
const OUT = 'C:/Users/33329/AppData/Local/Temp/fx_verify_20261018/shots66online/';
fs.mkdirSync(OUT, { recursive: true });

const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');
const local = (f) => fs.readFileSync(ROOT + f, 'utf8').replace(/\r\n/g, '\n');
const norm = (s) => s.replace(/\r\n/g, '\n');

let pass = 0, fail = 0;
const ok = (n, c, extra = '') => { c ? (pass++, console.log(`PASS ${n}${extra ? '  — ' + extra : ''}`)) : (fail++, console.log(`FAIL ${n}  — ${extra}`)); };

const browser = await chromium.launch({ args: ['--no-proxy-server'] });

async function gotoRetry(p, url, tries = 4) {
  for (let i = 1; i <= tries; i++) {
    try { await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }); return; }
    catch (e) {
      if (i === tries) throw e;
      console.log(`  · goto 第 ${i} 次失败（${e.message.split('\n')[0]}），重试`);
      await p.waitForTimeout(2000);
    }
  }
}
const waitGrid = (p) => p.waitForFunction(() => document.querySelectorAll('#w-grid .poster').length > 0, null, { timeout: 60000 });
const waitTl = (p) => p.waitForFunction(() => document.querySelectorAll('#w-tl .tl-item').length > 0
  && getComputedStyle(document.querySelector('#w-tl')).display !== 'none', null, { timeout: 40000 });
async function waitImgs(p, sel, capMs = 240000) {
  const t0 = Date.now();
  while (Date.now() - t0 < capMs) {
    const s = await p.evaluate((q) => {
      const a = [...document.querySelectorAll(q)];
      return { done: a.filter((i) => i.complete && i.naturalWidth > 0).length, all: a.length };
    }, sel);
    if (s.all > 0 && s.done === s.all) return { ...s, ms: Date.now() - t0 };
    await p.waitForTimeout(2500);
  }
  const s = await p.evaluate((q) => {
    const a = [...document.querySelectorAll(q)];
    return { done: a.filter((i) => i.complete && i.naturalWidth > 0).length, all: a.length };
  }, sel);
  return { ...s, timeout: true };
}

/* ---------- A Pages 生效（判内容指纹，不只看 200） ---------- */
console.log('== A 等 Pages 生效 ==');
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await gotoRetry(page, SITE);
let hit = false, waited = 0, snap = null;
for (let i = 1; i <= 20; i++) {
  try {
  snap = await page.evaluate(async (base) => {
    const t = Date.now();
    return {
      h: await (await fetch(base + 'watch.html?cb=' + t, { cache: 'reload' })).text(),
      c: await (await fetch(base + 'watch.css?cb=' + t, { cache: 'reload' })).text(),
      j: await (await fetch(base + 'watch.js?cb=' + t, { cache: 'reload' })).text(),
      d: await (await fetch(base + 'data/watch.json?cb=' + t, { cache: 'reload' })).text(),
    };
  }, SITE);
  } catch (e) { console.log(`  第 ${i} 次拉取失败：${String(e.message).split(String.fromCharCode(10))[0]}，重试`); await page.waitForTimeout(5000); waited += 5; continue; }
  const nc = snap.c.replace(/\/\*[\s\S]*?\*\//g, '');
  const ver = /watch\.css\?v=12/.test(snap.h) && /watch\.js\?v=7/.test(snap.h);
  const code = /\.poster-head \{[^}]*display: flex/.test(nc) && !/\.poster-kind \{[^}]*position/.test(nc);
  console.log(`  第 ${i} 次：v=12/js=7 ${ver} / .poster-head 在 & .poster-kind 已删 ${code}（累计 ${waited}s）`);
  if (ver && code) { hit = true; break; }
  waited += 5;
  await page.waitForTimeout(5000);
}
ok('A1 Pages 已生效（watch.css?v=12 / watch.js?v=7 + .poster-head 存在、.poster-kind 已删）', hit, `耗时约 ${waited}s`);
ok('A2 线上 watch.css 与本地去 CR 后 md5 全等', md5(norm(snap.c)) === md5(local('watch.css')),
  `${md5(norm(snap.c))} / ${md5(local('watch.css'))}`);
ok('A3 线上 watch.html 与本地去 CR 后 md5 全等', md5(norm(snap.h)) === md5(local('watch.html')), md5(norm(snap.h)));
ok('A4 线上 watch.js 与本地去 CR 后 md5 全等', md5(norm(snap.j)) === md5(local('watch.js')), md5(norm(snap.j)));
const rIdx = await page.evaluate(async (base) => {
  const h = await (await fetch(base + 'index.html?cb=' + Date.now(), { cache: 'reload' })).text();
  return ['style.css?v=110', 'app.js?v=105', 'fx.js?v=16'].filter((v) => !h.includes(v));
}, SITE);
ok('A5 首页三个版本号未受影响', rIdx.length === 0, rIdx.join(',') || '全部命中');
const liveData = JSON.parse(snap.d);
const N = liveData.items.length;
ok(`A6 线上数据已包含新的 ${N} 条（含《奥本海默》《紫罗兰永恒花园 剧场版》）`,
  N >= 26 && liveData.items.some((x) => x.title === '奥本海默') && liveData.items.some((x) => x.title.includes('紫罗兰')),
  `${N} 条`);
await ctx.close();

/* ---------- B 六项需求逐条（线上） ---------- */
console.log('\n== B 六项需求（线上真实数据） ==');
const errs = [];
for (const W of [1440, 860, 390]) {
  const c = await browser.newContext({ viewport: { width: W, height: 900 } });
  const p = await c.newPage();
  p.on('pageerror', (e) => errs.push(`${W}:${e}`));
  await gotoRetry(p, SITE + 'watch.html');
  await p.evaluate(() => document.fonts.ready);
  await waitGrid(p);
  await p.waitForTimeout(500);

  /* ① 标题无 title 属性 */
  const t = await p.evaluate(() => {
    const el = document.getElementById('w-title');
    return { hasTitle: el.hasAttribute('title'), label: el.getAttribute('aria-label'), cursor: getComputedStyle(el).cursor };
  });
  ok(`B[${W}] ① 标题无 title 属性（悬停无提示），仍是按钮`,
    t.hasTitle === false && t.label === '回到页面顶部' && t.cursor === 'pointer', JSON.stringify(t));

  /* ⑥ 网格：无角标、无年份、片名+日期同排、短评紧跟 */
  const g = await p.evaluate(() => {
    const cards = [...document.querySelectorAll('#w-grid .poster')];
    const bad = [];
    let sameRow = 0, dateRight = 0, headKids = 0, notes = 0, noteOk = 0;
    for (const cd of cards) {
      const head = cd.querySelector('.poster-head'), nm = cd.querySelector('.poster-name'), dt = cd.querySelector('.poster-date'), nt = cd.querySelector('.poster-note');
      if (!head || !nm || !dt) { bad.push('缺 head/name/date'); continue; }
      headKids += head.children.length;
      const cr = cd.getBoundingClientRect(), nr = nm.getBoundingClientRect(), dr = dt.getBoundingClientRect();
      if (dr.top + dr.height / 2 >= nr.top - 1 && dr.top + dr.height / 2 <= nr.bottom + 1) sameRow++;
      if (Math.abs(dr.right - cr.right) <= 1.5 && dr.left >= nr.left - 0.5) dateRight++;
      if (nt && nt.getBoundingClientRect().height > 0) { notes++; if (Math.round(nt.getBoundingClientRect().top - head.getBoundingClientRect().bottom) <= 12) noteOk++; }
      if (cd.querySelector('.poster-kind')) bad.push('仍有 poster-kind');
      if (cd.querySelector('.poster-sub')) bad.push('仍有 poster-sub');
      if (cd.querySelector('.poster-pic').children.length > 2) bad.push('海报内多出元素');
      if (nt && nt.previousElementSibling !== head) bad.push('短评未紧跟片名行');
    }
    return { n: cards.length, bad: bad.slice(0, 3), sameRow, dateRight, headKids, notes, noteOk,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      scores: cards.map((x) => { const s = x.querySelector('.poster-score'); return s ? s.textContent.trim() : ''; }).filter(Boolean) };
  });
  ok(`B[${W}] ③⑥ 无「电影/剧集」角标、无年份、片名+日期同排（${g.n} 张）`,
    g.bad.length === 0 && g.sameRow === g.n && g.dateRight === g.n && g.headKids === g.n * 2,
    g.bad.join(' | ') || `同排 ${g.sameRow}/${g.n} 贴右 ${g.dateRight}/${g.n}`);
  ok(`B[${W}] ⑥ 短评紧贴片名行（可见 ${g.notes} 条，合格 ${g.noteOk}）`, g.noteOk === g.notes);
  ok(`B[${W}] ④ 评分全部一位小数`, g.scores.every((x) => /^★\d+\.\d$/.test(x)), g.scores.slice(0, 6).join(' '));
  ok(`B[${W}] 整页无横向溢出`, g.overflow === 0, `overflow=${g.overflow}`);

  /* ②⑤ 时间轴：太平年数据 + 三部剧集 */
  await p.click('#w-avatar');
  await waitTl(p);
  await p.waitForTimeout(500);
  const tl = await p.evaluate(() => {
    const get = (el, s) => { const x = el.querySelector(s); return x ? x.textContent.trim() : null; };
    const items = [...document.querySelectorAll('#w-tl .tl-item')];
    const find = (t2) => items.find((x) => get(x, '.tl-name') === t2);
    const tp = find('太平年');
    const three = ['士兵突击', '赛博朋克：边缘行者', '英雄联盟：双城之战'].map((x) => (find(x) ? get(find(x), '.tl-kind') : 'MISSING'));
    return {
      n: items.length,
      tp: tp ? { score: get(tp, '.tl-score'), year: get(tp, '.tl-year'), kind: get(tp, '.tl-kind'), date: get(tp, '.tl-date') } : null,
      three,
      scores: items.map((x) => get(x, '.tl-score')).filter(Boolean),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      worst: items.map((x) => { const b = x.querySelector('.tl-body'); return b.scrollWidth - Math.ceil(b.clientWidth); }).sort((a, b) => b - a)[0],
    };
  });
  ok(`B[${W}] ② 太平年：★8.5 / 上映 2026-02-14 / 剧集 / 观看日期不变`,
    tl.tp && tl.tp.score === '★8.5' && tl.tp.year === '2026-02-14' && tl.tp.kind === '剧集' && tl.tp.date === '2026-10-24',
    JSON.stringify(tl.tp));
  ok(`B[${W}] ⑤ 三部剧集显示「剧集」`, tl.three.every((x) => x === '剧集'), tl.three.join(' / '));
  ok(`B[${W}] ④ 时间轴评分全部一位小数`, tl.scores.every((x) => /^★\d+\.\d$/.test(x)), tl.scores.slice(0, 6).join(' '));
  ok(`B[${W}] 时间轴 ${tl.n} 条、无横向溢出`, tl.n === N && tl.overflow === 0 && tl.worst <= 0,
    `n=${tl.n}/${N} overflow=${tl.overflow} bodyX=${tl.worst}`);
  await c.close();
}

/* ---------- C 标题回顶仍可用 ---------- */
console.log('\n== C 标题点击回顶 ==');
{
  const c = await browser.newContext({ viewport: { width: 1440, height: 700 } });
  const p = await c.newPage();
  p.on('pageerror', (e) => errs.push(`C:${e}`));
  await gotoRetry(p, SITE + 'watch.html');
  await waitGrid(p);
  await p.waitForTimeout(600);
  await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await p.waitForTimeout(600);
  const bottom = await p.evaluate(() => window.scrollY);
  await p.click('#w-title');
  let top = bottom;
  for (let i = 0; i < 25; i++) { top = await p.evaluate(() => window.scrollY); if (top === 0) break; await p.waitForTimeout(120); }
  ok('C1 点击标题仍回到顶端', bottom > 0 && top === 0, `scrollY ${bottom} → ${top}`);
  await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await p.waitForTimeout(500);
  await p.focus('#w-title');
  await p.keyboard.press('Enter');
  let top2 = 1;
  for (let i = 0; i < 25; i++) { top2 = await p.evaluate(() => window.scrollY); if (top2 === 0) break; await p.waitForTimeout(120); }
  ok('C2 键盘 Enter 仍能回顶', top2 === 0, `scrollY=${top2}`);
  ok('C3 全程零 JS 异常', errs.length === 0, errs.slice(0, 3).join(' | '));
  await c.close();
}

/* ---------- D 线上截图 ---------- */
console.log('\n== D 线上截图（先预热图片） ==');
async function shot(W, H, name, tlView) {
  const c = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
  const p = await c.newPage();
  await gotoRetry(p, SITE + 'watch.html');
  await p.evaluate(() => { try { localStorage.removeItem('watch-layout'); } catch (e) {} });
  await p.reload({ waitUntil: 'domcontentloaded' });
  await waitGrid(p);
  await p.evaluate(() => document.fonts.ready);
  const gi = await waitImgs(p, '#w-grid .poster img');
  console.log(`  ${name} 网格图 ${gi.done}/${gi.all}${gi.timeout ? '(超时)' : ''}`);
  if (tlView) {
    await p.click('#w-avatar');
    await waitTl(p);
    await p.waitForTimeout(400);
    const ti = await waitImgs(p, '#w-tl .tl-thumb img', 150000);
    console.log(`  ${name} 缩略图 ${ti.done}/${ti.all}${ti.timeout ? '(超时)' : ''}`);
  }
  await p.waitForTimeout(700);
  await p.screenshot({ path: OUT + name + '.png' });
  await c.close();
}
await shot(1440, 900, 'L1_线上_网格_1440', false);
await shot(1440, 900, 'L2_线上_时间轴_1440', true);
await shot(390, 844, 'L3_线上_网格_390', false);

await browser.close();
console.log(`\n===== 第 66 轮线上复验：${pass}/${pass + fail} =====`);
process.exit(fail ? 1 : 0);
