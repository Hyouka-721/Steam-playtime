/* 第 79 轮线上复验（push 后跑）：排序字段 order 上线 + 「网格不可点、时间轴可点」契约
   对应提交：929e2e3(feat order) / f8b0aa2(verify78) / 8786c50(verify79) / 5bfb903(共用海报守卫)

   ① 内容指纹：线上 watch.html 引用 v17/v12；watch.js、watch.css、watch.json 与本地 md5 全等
   ② 排序字段：新增面板预填 3；编辑已有条目预填 = 该条目数据里的 order（无字段归 3，
      第 83 轮起从线上数据推导 —— 原先写死「全部无 order → 预填 3」，用户真填了就误红）；
      非法值阻断且零 PUT
   ③ 顺序一致：线上 119 条顺序 = 数据推算的期望（当前含 order 级；第 80 轮用户真设了 order 后，
      原先「不含 order 的旧比较器」已不能当期望，否则会要求功能失效）
   ④ 契约：网格卡片点不开编辑（无 data-id/role/tabindex），时间轴条目点得开
   写操作安全边界：非法输入被拦 → 全程 PUT 请求必须为 0。 */
import { createRequire } from 'module';
import fs from 'fs';
import crypto from 'crypto';
const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const SITE = 'https://hyouka-721.github.io/Steam-playtime/';
const ROOT = 'C:/Users/33329/WorkBuddy/2026-10-13-18-17-49/steam-playtime/docs/';
const OUT = 'C:/Users/33329/AppData/Local/Temp/fx_verify_20261018/shots79online/';
fs.mkdirSync(OUT, { recursive: true });

const md5 = (b) => crypto.createHash('md5').update(b).digest('hex');
const rd = (f) => fs.readFileSync(ROOT + f);
/* ⚠️ 本地工作区是 CRLF（autocrlf），仓库里存的是 LF → 比字节前必须统一换行，
   否则每个文件都会「看起来不一样」 */
const norm = (s) => String(s).replace(/\r\n/g, '\n');
const md5txt = (s) => md5(Buffer.from(norm(s), 'utf8'));
const localJs = norm(rd('watch.js').toString('utf8'));
const localCss = norm(rd('watch.css').toString('utf8'));
const localData = JSON.parse(fs.readFileSync(ROOT + 'data/watch.json', 'utf8').replace(/^\uFEFF/, ''));
const N = localData.items.length;

let pass = 0, fail = 0;
const ok = (n, c, extra = '') => {
  c ? (pass++, console.log(`PASS ${n}${extra ? '  — ' + extra : ''}`))
    : (fail++, console.log(`FAIL ${n}  — ${extra}`));
};

/* 期望比较器：与 watch.js 的 cmpTime / cmpRating 逐字对齐（含第 78 轮的 order 级）
   ⚠️ 第 80 轮之前这里是「不含 order 的旧比较器」，当时用来证明老数据零影响；
   用户一旦真的填了 order，旧比较器就不再是期望 —— 会变成「要求这个功能别生效」。 */
const sk = (d) => {
  const m = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/.exec(String(d || '').trim());
  return m ? `${m[1]}-${m[2] || '00'}-${m[3] || '00'}` : '0000-00-00';
};
const stamp = (s) => { const t = Date.parse(String(s || '')); return Number.isNaN(t) ? 0 : t; };
const rv = (it) => { const n = Number(it.rating); return isFinite(n) && n > 0 ? n : -1; };
const orderVal = (it) => { const raw = it == null ? null : it.order; if (raw == null || raw === '') return 3; const n = Number(raw); return (!Number.isFinite(n) || Math.floor(n) !== n || n < 0 || n > 5) ? 3 : n; };
const oldCmpTime = (a, b) => {
  const d = sk(b.watched_at).localeCompare(sk(a.watched_at));
  if (d !== 0) return d;
  const o = orderVal(a) - orderVal(b);   // 第 78 轮的 order 级：用户真设了值就必须算
  if (o !== 0) return o;
  const s = stamp(a.added_at) - stamp(b.added_at);
  if (s !== 0) return s;
  return String(a.id || '').localeCompare(String(b.id || ''));
};
const oldCmpRating = (a, b) => { const vb = rv(b), va = rv(a); if (vb !== va) return vb - va; const o = orderVal(a) - orderVal(b); return o !== 0 ? o : oldCmpTime(a, b); };

const browser = await chromium.launch({ args: ['--no-proxy-server'] });
async function gotoRetry(p, url, tries = 4) {
  for (let i = 1; i <= tries; i++) {
    try { await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }); return; }
    catch (e) { if (i === tries) throw e; console.log('  · goto 重试 ' + i); await p.waitForTimeout(2000); }
  }
}

/* ================= A 内容指纹 ================= */
console.log('== A 内容指纹 ==');
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errs.push('console:' + m.text().slice(0, 120)); });
await gotoRetry(page, SITE + 'watch.html');

/* 等 Pages 刷到本轮：直接比 watch.js 的字节 md5，而不是看 200 */
let jsHit = false, cssHit = false, htmlTxt = '', waited = 0;
for (let i = 1; i <= 30; i++) {
  const r = await page.evaluate(async ({ base, cb }) => {
    const get = async (u) => { const x = await fetch(u + '?cb=' + cb, { cache: 'reload' }); return { status: x.status, t: await x.text() }; };
    const [h, j, c] = await Promise.all([get(base + 'watch.html'), get(base + 'watch.js'), get(base + 'watch.css')]);
    return { h: h.t, j: j.t, c: c.t };
  }, { base: SITE, cb: Date.now() });
  htmlTxt = r.h;
  jsHit = md5txt(r.j) === md5txt(localJs);
  cssHit = md5txt(r.c) === md5txt(localCss);
  if (jsHit && cssHit) break;
  waited += 5;
  console.log(`  第 ${i} 次：js=${jsHit ? '✓' : '✗'} css=${cssHit ? '✓' : '✗'}（累计 ${waited}s）`);
  await page.waitForTimeout(5000);
}

ok('A1 线上 watch.html 引用 watch.css?v=22 / watch.js?v=16',
  /watch\.css\?v=22"/.test(htmlTxt) && /watch\.js\?v=16"/.test(htmlTxt));
ok('A2 线上 watch.js 与本地整份 md5 全等（最硬的指纹）', jsHit, md5txt(localJs));
ok('A3 线上 watch.css 与本地整份 md5 全等', cssHit, md5txt(localCss));
{
  const t = htmlTxt;
  ok('A4 线上编辑表单已带「排序」字段（type=number / min0 / max5 / step1）',
    /id="add-order"/.test(t) && /id="add-order"[^>]*min="0"[^>]*max="5"[^>]*step="1"/.test(t) &&
    /排序<span class="w-hint">[^<]*0~5[^<]*默认 3/.test(t));
}

/* 数据：条数 + 整份 md5 */
const liveTxt = await page.evaluate(async (u) => (await fetch(u + '?cb=' + Date.now(), { cache: 'reload' })).text(),
  SITE + 'data/watch.json');
let live = null;
try { live = JSON.parse(liveTxt); } catch (e) { live = null; }
ok('A5 线上 watch.json 条数与本地一致，且整份 md5 全等',
  !!live && live.items.length === N && md5(JSON.stringify(live)) === md5(JSON.stringify(localData)),
  `线上 ${live ? live.items.length : '?'} 条 / 本地 ${N} 条｜${live ? md5(JSON.stringify(live)) : '—'}`);

/* ================= B 排序字段与校验 ================= */
console.log('\n== B 排序字段与校验（只测拦截，不写线上数据）==');
{
  await page.addInitScript(() => { try { localStorage.setItem('watch-gh-token', 'ghp_fake_for_online_check'); } catch (e) {} });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelectorAll('#w-grid .poster').length > 0, null, { timeout: 60000 });
  await page.waitForTimeout(600);

  let puts = 0;
  page.on('request', (r) => { if (r.method() === 'PUT') puts++; });

  await page.click('#w-fab');
  await page.waitForTimeout(400);
  const d = await page.evaluate(() => {
    const el = document.getElementById('add-order');
    return { v: el && el.value, min: el && el.min, max: el && el.max, step: el && el.step, type: el && el.type };
  });
  ok('B1 线上新增面板：排序预填 3，min=0 / max=5 / step=1',
    d.v === '3' && d.min === '0' && d.max === '5' && d.step === '1' && d.type === 'number', JSON.stringify(d));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  /* 编辑线上真实条目：线上 119 条全部没有 order 字段 → 必须预填 3 */
  await page.click('#w-avatar');
  await page.waitForFunction(() => document.querySelectorAll('#w-tl .tl-item').length > 0, null, { timeout: 60000 });
  await page.waitForTimeout(600);
  /* 编辑线上真实条目：排序预填值必须等于该条目数据里的归一化 order（无字段 → 3）。
     第 83 轮修正：原判据写死「线上全部条目都没有 order 字段 → 必须预填 3」，
     用户给《给阿嬷的情书》填了 order=2 之后这条就红了 —— 「用户用了功能」不该是失败原因。
     现在期望值从线上数据推导，零迁移语义（无字段/非法值→3）仍由 orderOf() 保证。 */
  const firstMeta = await page.evaluate(() => {
    const el = document.querySelector('#w-tl .tl-item');
    return el ? {
      name: ((el.querySelector('.tl-name') || {}).textContent || '').trim(),
      id: el.getAttribute('data-id'),
    } : null;
  });
  const orderOf = (it) => {
    const v = it && it.order;
    if (v === undefined || v === null || v === '') return 3;
    const s = String(v);
    return /^[0-5]$/.test(s) ? Number(s) : 3;
  };
  const liveItem = firstMeta && live && (live.items || []).find((x) => x.id === firstMeta.id);
  const wantOrder = orderOf(liveItem);
  await page.evaluate(() => { document.querySelector('#w-tl .tl-item').click(); });
  await page.waitForTimeout(600);
  const eForm = await page.evaluate(() => ({
    open: document.getElementById('w-add').hasAttribute('open'),
    order: (document.getElementById('add-order') || {}).value,
    title: ((document.getElementById('w-add-title') || {}).textContent || '').trim(),
  }));
  ok(`B2 编辑线上真实条目：排序预填 = 该条目 order（无字段归 3；此条期望 ${wantOrder}），且标题预填该条目`,
    eForm.open && eForm.order === String(wantOrder) && eForm.title.indexOf(firstMeta.name) >= 0,
    `${eForm.title} order=${eForm.order} 期望=${wantOrder}（数据里 order=${liveItem ? JSON.stringify(liveItem.order) : '未找到'}）`);

  const tryBad = async (val) => {
    const before = puts;
    await page.evaluate((v) => {
      const el = document.getElementById('add-order');
      el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, val);
    await page.click('#w-add-submit');
    await page.waitForTimeout(500);
    const msg = await page.evaluate(() => (document.getElementById('w-add-msg') || {}).textContent || '');
    return { msg, delta: puts - before };
  };
  const b6 = await tryBad('6');
  ok('B3 线上填 6 被拦：提示范围文案 + 零 PUT（没有碰到线上数据）',
    /排序只能填 0~5 的整数/.test(b6.msg) && b6.delta === 0, `msg=${JSON.stringify(b6.msg)} put+${b6.delta}`);
  const b35 = await tryBad('3.5');
  ok('B4 线上填 3.5 被拦：小数不合法 + 零 PUT',
    /排序只能填 0~5 的整数/.test(b35.msg) && b35.delta === 0, `put+${b35.delta}`);
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(300);
  ok('B5 全程 PUT 请求数为 0（线上数据未被任何用例触碰）', puts === 0, `PUT ${puts} 次`);
}

/* ================= C 排序结果零影响 ================= */
console.log('\n== C 线上 119 条顺序与改动前完全一致 ==');
await gotoRetry(page, SITE + 'watch.html');
await page.waitForFunction(() => document.querySelectorAll('#w-grid .poster').length > 0, null, { timeout: 60000 });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(900);

const gridNames = await page.$$eval('#w-grid .poster .poster-name', (els) => els.map((e) => e.textContent.trim()));
const expGrid = live.items.slice().sort(oldCmpRating).map((x) => x.title.trim());
ok('C1 线上网格（默认评分序）顺序 = 数据推算的期望（含 order 级，逐条相同）',
  gridNames.length === expGrid.length && gridNames.every((v, i) => v === expGrid[i]),
  `${gridNames.length} 条；首个不同位置 ${gridNames.findIndex((v, i) => v !== expGrid[i])}`);
await page.screenshot({ path: OUT + 'C_线上网格_评分序.png' });

await page.click('#w-avatar');
await page.waitForFunction(() => document.querySelectorAll('#w-tl .tl-item').length > 0, null, { timeout: 60000 });
await page.waitForTimeout(800);
const tlNames = await page.$$eval('#w-tl .tl-item .tl-name', (els) => els.map((e) => e.textContent.trim()));
const expTl = live.items.slice().sort(oldCmpTime).map((x) => x.title.trim());
ok('C2 线上时间轴顺序 = 旧 cmpTime 算出的期望（逐条相同）',
  tlNames.length === expTl.length && tlNames.every((v, i) => v === expTl[i]),
  `${tlNames.length} 条；首个不同位置 ${tlNames.findIndex((v, i) => v !== expTl[i])}`);
ok('C3 网格与时间轴条数都等于数据条数（无渲染丢失）',
  gridNames.length === N && tlNames.length === N, `grid ${gridNames.length} / tl ${tlNames.length} / 数据 ${N}`);

/* ================= D 第 79 轮契约：网格不可点、时间轴可点 ================= */
console.log('\n== D 交互契约（网格不可点 / 时间轴可点）==');
{
  /* C 段最后停在时间轴，先切回网格 */
  await gotoRetry(page, SITE + 'watch.html');
  await page.waitForFunction(() => document.querySelectorAll('#w-grid .poster').length > 0, null, { timeout: 60000 });
  await page.waitForTimeout(800);

  const before = await page.evaluate(() => document.getElementById('w-add').hasAttribute('open'));
  await page.evaluate(() => { document.querySelectorAll('#w-grid .poster').forEach((c) => c.click()); });
  await page.waitForTimeout(500);
  const after = await page.evaluate(() => document.getElementById('w-add').hasAttribute('open'));
  ok('D1 线上网格：依次点击全部卡片，编辑弹窗一次都没打开', !before && !after, `open=${after}`);

  const sem = await page.evaluate(() => {
    const c = document.querySelector('#w-grid .poster');
    return { tabIndex: c.tabIndex, role: c.getAttribute('role'), dataId: c.getAttribute('data-id') };
  });
  ok('D2 线上网格卡片无可点击/可聚焦语义（tabIndex=-1、无 role、无 data-id）',
    sem.tabIndex === -1 && !sem.role && !sem.dataId, JSON.stringify(sem));

  await page.click('#w-avatar');
  await page.waitForFunction(() => document.querySelectorAll('#w-tl .tl-item').length > 0, null, { timeout: 60000 });
  await page.waitForTimeout(600);
  const tlClick = await page.evaluate(() => {
    const el = document.querySelector('#w-tl .tl-item');
    const t = ((el.querySelector('.tl-name') || {}).textContent || '').trim();
    el.click();
    return t;
  });
  await page.waitForTimeout(600);
  const tlOpen = await page.evaluate(() => ({
    open: document.getElementById('w-add').hasAttribute('open'),
    title: ((document.getElementById('w-add-title') || {}).textContent || '').trim(),
  }));
  ok('D3 线上时间轴：点击条目打开编辑并预填该片名（唯一入口仍在时间轴）',
    tlOpen.open && tlOpen.title.indexOf(tlClick) >= 0, `${tlOpen.title} / 期望含「${tlClick}」`);
  await page.screenshot({ path: OUT + 'D_线上时间轴_可点编辑.png' });

  ok('D4 全程零 JS 异常', errs.length === 0, errs.slice(0, 3).join(' | '));
}

await ctx.close();
await browser.close();
console.log(`\n第 79 轮线上复验：PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
