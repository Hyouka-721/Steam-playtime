/* 第 69 轮线上复验：编辑入口在 Pages 上可用，且不会误写仓库
   安全边界：全程只做「打开 / 预填 / 取消」，另外故意在无 Token 时点保存，
             验证会被守卫拦住（线上浏览器里没有 token，请求根本发不出去） */
import { createRequire } from 'module';
import fs from 'fs';
import crypto from 'crypto';
const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const SITE = 'https://hyouka-721.github.io/Steam-playtime/';
const ROOT = 'C:/Users/33329/WorkBuddy/2026-10-13-18-17-49/steam-playtime/docs/';
const OUT = 'C:/Users/33329/AppData/Local/Temp/fx_verify_20261018/shots69online/';
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
    catch (e) { if (i === tries) throw e; console.log(`  · goto 重试 ${i}`); await p.waitForTimeout(2000); }
  }
}
const waitGrid = (p) => p.waitForFunction(() => document.querySelectorAll('#w-grid .poster').length > 0, null, { timeout: 60000 });
const waitTl = (p) => p.waitForFunction(() => document.querySelectorAll('#w-tl .tl-item').length > 0
  && getComputedStyle(document.querySelector('#w-tl')).display !== 'none', null, { timeout: 40000 });

/* ---------- A Pages 生效 ---------- */
console.log('== A 等 Pages 生效（内容指纹） ==');
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
  } catch (e) { console.log(`  第 ${i} 次拉取失败，重试`); await page.waitForTimeout(4000); waited += 4; continue; }
  const nc = snap.c.replace(/\/\*[\s\S]*?\*\//g, '');
  const ver = /watch\.css\?v=15/.test(snap.h) && /watch\.js\?v=8/.test(snap.h);
  const edit = /function openEdit\(it\)/.test(snap.j) && /data-id/.test(snap.j) && /cursor: pointer/.test(nc);
  console.log(`  第 ${i} 次：v=15/js=8 ${ver} / 编辑逻辑 ${edit}（累计 ${waited}s）`);
  if (ver && edit) { hit = true; break; }
  waited += 5; await page.waitForTimeout(5000);
}
ok('A1 Pages 已生效（watch.css?v=15 / watch.js?v=8 + openEdit/ data-id）', hit, `约 ${waited}s`);
ok('A2 线上 watch.css 与本地 md5 全等', md5(norm(snap.c)) === md5(local('watch.css')), md5(norm(snap.c)));
ok('A3 线上 watch.html 与本地 md5 全等', md5(norm(snap.h)) === md5(local('watch.html')));
ok('A4 线上 watch.js 与本地 md5 全等', md5(norm(snap.j)) === md5(local('watch.js')));
const liveData = JSON.parse(snap.d);
const N = liveData.items.length;
ok(`A5 线上数据 ${N} 条（含新录入的哈利·波特 / 甄嬛传 / 奇巧出租车）`,
  N >= 39 && ['哈利·波特与魔法石', '甄嬛传', '奇巧出租车'].every((t) => liveData.items.some((x) => x.title === t)), `${N} 条`);
ok('A6 太平年数据仍是「观看 2026-02-14 / 上映 2026」',
  (() => { const tp = liveData.items.find((x) => x.title === '太平年'); return tp && tp.watched_at === '2026-02-14' && tp.year === 2026 && !tp.release_date; })());
const rIdx = await page.evaluate(async (base) => {
  const h = await (await fetch(base + 'index.html?cb=' + Date.now(), { cache: 'reload' })).text();
  return ['style.css?v=106', 'app.js?v=100', 'fx.js?v=16'].filter((v) => !h.includes(v));
}, SITE);
ok('A7 首页三个版本号未受影响', rIdx.length === 0, rIdx.join(',') || '全部命中');
await ctx.close();

/* ---------- B 编辑入口 ---------- */
const errs = [];
const { c, p } = await (async () => {
  const cc = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const pp = await cc.newPage();
  pp.on('pageerror', (e) => errs.push(String(e)));
  await gotoRetry(pp, SITE + 'watch.html');
  await pp.evaluate(() => { try { localStorage.removeItem('watch-layout'); } catch (e) {} });
  await pp.reload({ waitUntil: 'domcontentloaded' });
  await waitGrid(pp);
  await pp.click('#w-avatar');
  await waitTl(pp);
  await pp.evaluate(() => document.fonts.ready);
  await pp.waitForTimeout(700);
  return { c: cc, p: pp };
})();

console.log('\n== B 点击条目编辑（线上，只开窗不保存） ==');
const row = p.locator('#w-tl .tl-item').filter({ hasText: '甄嬛传' }).first();
await row.click();
await p.waitForTimeout(400);
const opened = await p.evaluate(() => document.getElementById('w-add').open === true);
ok('B1 点击线上条目能打开编辑弹窗', opened);

const f = await p.evaluate(() => {
  const v = (id) => { const e = document.getElementById(id); return e ? e.value : null; };
  return {
    heading: document.getElementById('w-add-title').textContent.trim(),
    submit: document.getElementById('w-add-submit').textContent.trim(),
    title: v('add-title'), watched: v('add-watched'), kind: v('add-kind'), note: v('add-note'),
    fileDisabled: document.getElementById('add-poster').disabled,
    previewHidden: document.getElementById('add-preview').hidden,
  };
});
const src = liveData.items.find((x) => x.title === '甄嬛传') || {};
ok('B2 标题/按钮进入编辑模式', f.heading === '编辑《甄嬛传》' && f.submit === '保存修改', `${f.heading} / ${f.submit}`);
ok('B3 字段按线上数据预填（片名/观看日期/类型/短评）',
  f.title === '甄嬛传' && f.watched === src.watched_at && f.kind === src.kind && f.note === (src.note || ''),
  JSON.stringify(f).slice(0, 160));
ok('B4 海报只读展示、选图禁用', f.fileDisabled === true && f.previewHidden === false);
await p.screenshot({ path: OUT + 'L1_线上_编辑弹窗_1440.png' });

console.log('\n== C 取消 / 无 Token 守卫 ==');
await p.click('#w-add-cancel');
await p.waitForTimeout(300);
ok('C1 取消后弹窗关闭', (await p.evaluate(() => document.getElementById('w-add').open === true)) === false);
const unchanged = await p.evaluate(() => {
  const it = [...document.querySelectorAll('#w-tl .tl-item')].find((x) => x.textContent.includes('甄嬛传'));
  return it ? it.querySelector('.tl-name').textContent.trim() : 'MISSING';
});
ok('C2 取消后时间轴未变', unchanged === '甄嬛传', unchanged);

/* 无 token 时点保存：应被守卫拦住，不会发起 PUT */
await p.locator('#w-tl .tl-item').filter({ hasText: '甄嬛传' }).first().click();
await p.waitForTimeout(300);
let putCalls = 0;
p.on('request', (r) => { if (r.method() === 'PUT') putCalls++; });
await p.click('#w-add-submit');
await p.waitForTimeout(1200);
const guard = await p.evaluate(() => ({
  msg: document.getElementById('w-add-msg').textContent.trim(),
  open: document.getElementById('w-add').open === true,
  tokenBoxOpen: document.getElementById('add-token-box').open === true,
}));
ok('C3 无 Token 时点保存被拦住（提示 Token、弹窗不关、不发出 PUT）',
  /Token/i.test(guard.msg) && guard.open === true && putCalls === 0, JSON.stringify(guard) + ` PUT=${putCalls}`);
await p.screenshot({ path: OUT + 'L2_线上_无Token拦截_1440.png' });
await p.click('#w-add-cancel');
await p.waitForTimeout(200);

/* ---------- D 键盘 ---------- */
console.log('\n== D 键盘可达 ==');
await p.locator('#w-tl .tl-item').filter({ hasText: '奇巧出租车' }).first().focus();
await p.keyboard.press('Enter');
await p.waitForTimeout(400);
const kb = await p.evaluate(() => ({ open: document.getElementById('w-add').open === true, h: document.getElementById('w-add-title').textContent.trim() }));
ok('D1 键盘 Enter 也能打开，且预填的是被聚焦那条', kb.open && kb.h === '编辑《奇巧出租车》', JSON.stringify(kb));
await p.click('#w-add-cancel');
await p.waitForTimeout(200);

/* ---------- E 其他契约不回归 ---------- */
console.log('\n== E 布局与六项契约 ==');
const layout = await p.evaluate(() => {
  const items = [...document.querySelectorAll('#w-tl .tl-item')];
  const u = (sel) => [...new Set(items.map((it) => { const e = it.querySelector(sel); return e ? Math.round(e.getBoundingClientRect().left) : null; }).filter((x) => x != null))];
  const m = document.querySelector('.w-main');
  const rail = m.getBoundingClientRect().left + parseFloat(getComputedStyle(m).paddingLeft);
  return {
    rail: +rail.toFixed(1),
    thumb: +document.querySelector('#w-tl .tl-thumb').getBoundingClientRect().left.toFixed(1),
    cols: { date: u('.tl-date'), kind: u('.tl-kind'), year: u('.tl-year'), score: u('.tl-score'), note: u('.tl-note') },
    cursor: getComputedStyle(items[0]).cursor,
    role: items[0].getAttribute('role'), tab: items[0].getAttribute('tabindex'),
    aria: items[0].getAttribute('aria-label'),
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    n: items.length,
  };
});
ok('E1 左轨未变（缩略图在内容左轨）', Math.abs(layout.thumb - layout.rail) < 0.6, `thumb=${layout.thumb} rail=${layout.rail}`);
ok('E2 六列仍各自唯一 x', Object.values(layout.cols).every((a) => a.length === 1), JSON.stringify(layout.cols));
ok('E3 条目可点语义齐全（cursor/role/tabindex/aria-label）',
  layout.cursor === 'pointer' && layout.role === 'button' && layout.tab === '0' && /^编辑《/.test(layout.aria || ''),
  `${layout.cursor} / ${layout.role} / ${layout.tab} / ${layout.aria}`);
ok(`E4 线上 ${layout.n} 条、无横向溢出`, layout.n === N && layout.overflow === 0, `n=${layout.n}/${N}`);
await p.screenshot({ path: OUT + 'L3_线上_时间轴_1440.png' });
ok('E5 全程零 JS 异常', errs.length === 0, errs.slice(0, 3).join(' | '));

await c.close();
await browser.close();
console.log(`\n===== 第 69 轮线上复验：${pass}/${pass + fail} =====`);
process.exit(fail ? 1 : 0);
