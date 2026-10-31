/* 第 78 轮回归：手动「排序」字段（order 0~5，默认 3）
   需求要点（逐条对应断言）：
   ① 所有作品的编辑界面都有「排序」输入，只能填 0~5 的整数
   ② 非法输入要提示并阻断保存（不能静默改成默认值）
   ③ 未填写时默认 3，且默认值在「读取时」生效（老数据零迁移）
   ④ 观看时间或评分相同时，order 小的排在前；三种并列情形都要对
   ⑤ 老数据（全部无 order）列表顺序必须与改动前完全一致

   A 静态指纹 / B 表单与校验（GitHub API 全 mock）/ C 排序行为（mock 数据精确比对）
   ⚠️ 版本号断言：watch.css?v=19 / watch.js?v=14（第 78 轮 bump） */
import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const BASE = 'http://127.0.0.1:8895/';
const D = 'C:/Users/33329/WorkBuddy/2026-10-13-18-17-49/steam-playtime/docs/';
const rd = (f) => fs.readFileSync(D + f, 'utf8').replace(/\r\n/g, '\n');
const stripCmt = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');

let pass = 0, fail = 0;
const ok = (n, c, extra = '') => {
  c ? (pass++, console.log(`PASS ${n}${extra ? '  ' + extra : ''}`))
    : (fail++, console.log(`FAIL ${n}  ${extra}`));
};

const html = rd('watch.html'), css = rd('watch.css'), js = rd('watch.js');
const jsNC = stripCmt(js), cssNC = stripCmt(css);
const cli = fs.readFileSync('C:/Users/33329/WorkBuddy/2026-10-13-18-17-49/steam-playtime/scripts/watch-add.mjs', 'utf8');
const P = 'img/minion-0ef9a202.webp';   // 复用现成图，避免 404 噪音

/* ================= A 静态指纹 ================= */
console.log('== A 静态指纹 ==');
ok('A1 编辑表单有「排序」输入，且是 number / min 0 / max 5 / step 1',
  /id="add-order"/.test(html) && /type="number" id="add-order"/.test(html) &&
  /id="add-order"[^>]*min="0"[^>]*max="5"[^>]*step="1"/.test(html),
  (html.match(/<input[^>]*id="add-order"[^>]*>/) || [''])[0]);
ok('A2 标签写清了取值范围与默认值（0~5 / 默认 3 / 小的在前）',
  /for="add-order">排序<span class="w-hint">[^<]*0~5[^<]*默认 3[^<]*小的排在前/.test(html));
ok('A3 版本号 bump：watch.css?v=19 / watch.js?v=14',
  /watch\.css\?v=19"/.test(html) && /watch\.js\?v=14"/.test(html));
ok('A4 CSS 给排序输入单独收窄（个位数不必占满整行）',
  /\.w-input\.w-input-order \{ width: 118px; \}/.test(cssNC));
ok('A5 默认值常量与读取归一化函数就位（ORDER_DEFAULT=3 / orderVal）',
  /var ORDER_DEFAULT = 3;/.test(jsNC) && /function orderVal\(it\)/.test(jsNC));
ok('A6 orderVal 的兜底：缺字段 / 空串 / 非整数 / 越界 全回落默认 3',
  /raw == null \|\| raw === ''/.test(jsNC) && /Math\.floor\(n\) !== n/.test(jsNC) &&
  /n < 0 \|\| n > 5/.test(jsNC) && /return ORDER_DEFAULT;/.test(jsNC));
ok('A7 比较器拆出 cmpOrder（升序）与 cmpAdded（上传时间→id 兜底）',
  /function cmpOrder\(a, b\) \{\s*return orderVal\(a\) - orderVal\(b\);/.test(jsNC) &&
  /function cmpAdded\(a, b\)/.test(jsNC));
{
  const t = jsNC.indexOf('function cmpTime(a, b)');
  const r = jsNC.indexOf('function cmpRating(a, b)');
  const segT = jsNC.slice(t, t + 420);
  const iDate = segT.indexOf('sortKey(b.watched_at)');
  const iOrder = segT.indexOf('cmpOrder(a, b)');
  const iAdded = segT.indexOf('cmpAdded(a, b)');
  ok('A8 cmpTime 顺序：观影时间倒序 → 排序升序 → 上传时间正序',
    t > 0 && iDate >= 0 && iOrder > iDate && iAdded > iOrder,
    `date=${iDate} order=${iOrder} added=${iAdded}`);
  const segR = jsNC.slice(r, r + 320);
  const rOrder = segR.indexOf('cmpOrder(a, b)');
  const rTime = segR.indexOf('cmpTime(a, b)');
  ok('A9 cmpRating 顺序：评分倒序 → 排序升序 → 回落 cmpTime',
    r > 0 && segR.indexOf('vb - va') < rOrder && rOrder < rTime && rTime > 0,
    `order=${rOrder} time=${rTime}`);
}
ok('A10 排序输入只接受 0~5 的单个数字（/^[0-5]$/）',
  /if \(!\/\^\[0-5\]\$\/\.test\(raw\)\) return \{ ok: false \};/.test(jsNC));
ok('A11 浏览器原生 number 控件的 badInput 单独判（否则 "abc" 会被当留空存成 3）',
  /el\.validity && el\.validity\.badInput\) return \{ ok: false \}/.test(jsNC));
ok('A12 编辑 / 新增两条路径都做了校验（rejectOrder 各调用一次）',
  (jsNC.match(/rejectOrder\(\); return;/g) || []).length === 2,
  `调用 ${(jsNC.match(/rejectOrder\(\); return;/g) || []).length} 处`);
ok('A13 打开编辑时用 orderVal 预填（老数据没字段也显示 3）',
  /setField\('add-order', orderVal\(it\)\)/.test(jsNC));
ok('A14 打开新增时预填默认值 3（不是留空）',
  /if \(o\) o\.value = String\(ORDER_DEFAULT\);/.test(jsNC));
ok('A15 保存时显式落库 order（编辑 next.order / 新增 item.order）',
  /next\.order = orderRead\.v;/.test(jsNC) && /item\.order = orderRead\.v;/.test(jsNC));
ok('A16 CLI 同步支持 --order，且校验 0~5 整数',
  /--order <0-5>/.test(cli) && /Number\.isInteger\(o\) \|\| o < 0 \|\| o > 5/.test(cli) &&
  /const ORDER_DEFAULT = 3;/.test(cli));

/* ================= B 表单与校验 ================= */
const MOCK = {
  updated_at: '2026-10-30T12:00:00+08:00',
  items: [
    // 组 1：同日期、评分不同 → 组内评分序看评分，时间轴看 order
    { id: '2020-01-01-a', title: '甲', kind: 'movie', watched_at: '2020-01-01', rating: 9, order: 5, poster: P, added_at: '2020-01-01T00:00:02+08:00' },
    { id: '2020-01-01-b', title: '乙', kind: 'movie', watched_at: '2020-01-01', rating: 8, order: 0, poster: P, added_at: '2020-01-01T00:00:01+08:00' },
    // 组 2：同评分、日期不同 → 评分序看 order，时间轴看日期
    { id: '2020-02-10-c', title: '丙', kind: 'movie', watched_at: '2020-02-10', rating: 7, order: 5, poster: P, added_at: '2020-02-01T00:00:01+08:00' },
    { id: '2020-02-01-d', title: '丁', kind: 'movie', watched_at: '2020-02-01', rating: 7, order: 0, poster: P, added_at: '2020-02-01T00:00:02+08:00' },
    // 组 3：日期与评分都相同 → 两种视图都看 order
    { id: '2020-03-05-e', title: '戊', kind: 'movie', watched_at: '2020-03-05', rating: 6, order: 4, poster: P, added_at: '2020-03-01T00:00:01+08:00' },
    { id: '2020-03-05-f', title: '己', kind: 'movie', watched_at: '2020-03-05', rating: 6, order: 1, poster: P, added_at: '2020-03-01T00:00:03+08:00' },
    // 组 4：默认值 / 非法值兜底 → 全部当 3，按上传时间排
    { id: '2020-04-07-g', title: '庚', kind: 'movie', watched_at: '2020-04-07', rating: 5, poster: P, added_at: '2020-04-01T00:00:02+08:00' },              // 缺字段
    { id: '2020-04-07-h', title: '辛', kind: 'movie', watched_at: '2020-04-07', rating: 5, order: 3, poster: P, added_at: '2020-04-01T00:00:01+08:00' },   // 显式 3
    { id: '2020-04-07-i', title: '壬', kind: 'movie', watched_at: '2020-04-07', rating: 5, order: 9, poster: P, added_at: '2020-04-01T00:00:03+08:00' },   // 越界
    { id: '2020-04-07-j', title: '癸', kind: 'movie', watched_at: '2020-04-07', rating: 5, order: 2.5, poster: P, added_at: '2020-04-01T00:00:04+08:00' }, // 非整数
  ],
};

const browser = await chromium.launch({ args: ['--no-proxy-server'] });

async function newPage(withToken = true, data = MOCK) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const calls = [];
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  if (withToken) {
    await page.addInitScript(() => { try { localStorage.setItem('watch-gh-token', 'ghp_fake_for_test'); } catch (e) {} });
  }
  await page.route('**/data/watch.json*', (r) => r.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(data),
  }));
  await page.route('https://api.github.com/**', async (r) => {
    const req = r.request(), url = req.url(), method = req.method();
    let body = null;
    try { body = req.postDataJSON(); } catch (e) {}
    calls.push({ method, url, body });
    if (method === 'GET') {
      const b64 = Buffer.from(JSON.stringify(data), 'utf8').toString('base64');
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: b64, sha: 'sha-data' }) });
    }
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: { sha: 'newsha' } }) });
  });
  await page.goto(BASE + 'watch.html', { waitUntil: 'load' });
  await page.waitForSelector('#w-grid .poster', { timeout: 10000 });
  await page.waitForTimeout(350);
  return { ctx, page, calls, errs };
}

const names = (arr) => arr.map((x) => String(x).trim());
const idxOf = (arr, n) => arr.indexOf(n);

async function gridNames(page) {
  return names(await page.$$eval('#w-grid .poster .poster-name', (els) => els.map((e) => e.textContent)));
}
async function tlNames(page) {
  return names(await page.$$eval('#w-tl .tl-item .tl-name', (els) => els.map((e) => e.textContent)));
}
async function toTimeline(page) {
  await page.click('#w-avatar');
  await page.waitForFunction(() => document.querySelectorAll('#w-tl .tl-item').length > 0, null, { timeout: 20000 });
  await page.waitForTimeout(300);
}
async function toGrid(page) {
  await page.click('#w-avatar');
  await page.waitForFunction(() => document.querySelectorAll('#w-grid .poster').length > 0, null, { timeout: 20000 });
  await page.waitForTimeout(300);
}

console.log('\n== B 表单与校验（GitHub API 全模拟）==');
{
  const { ctx, page, calls } = await newPage();

  await page.click('#w-fab');
  await page.waitForTimeout(300);
  const addDefault = await page.evaluate(() => {
    const el = document.getElementById('add-order');
    return { exists: !!el, val: el && el.value, type: el && el.type, min: el && el.min, max: el && el.max, step: el && el.step };
  });
  ok('B1 新增面板：排序预填 3，控件 min=0 / max=5 / step=1',
    addDefault.exists && addDefault.val === '3' && addDefault.min === '0' &&
    addDefault.max === '5' && addDefault.step === '1', JSON.stringify(addDefault));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);

  /* 打开「乙」（order 0）与「庚」（无 order 字段）核对预填。
     ⚠️ 条目点击编辑只挂在时间轴（第 69 轮的事件委托在 #w-tl 上），网格卡片点不开 */
  await toTimeline(page);
  const openByName = async (n) => {
    await page.evaluate((t) => {
      const cs = [...document.querySelectorAll('#w-tl .tl-item')];
      const el = cs.find((c) => ((c.querySelector('.tl-name') || {}).textContent || '').trim() === t);
      if (el) el.click();
    }, n);
    await page.waitForTimeout(400);
    return page.evaluate(() => {
      const el = document.getElementById('add-order');
      return {
        val: el && el.value, title: (document.getElementById('w-add-title') || {}).textContent,
        open: document.getElementById('w-add').hasAttribute('open'),
      };
    });
  };

  const editB = await openByName('乙');
  ok('B2 编辑已有 order=0 的条目：排序预填 0',
    editB.open && editB.val === '0' && /乙/.test(editB.title || ''), JSON.stringify(editB));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  const editG = await openByName('庚');
  ok('B3 编辑没有 order 字段的老条目：排序预填 3（默认值在读取时生效）',
    editG.open && editG.val === '3' && /庚/.test(editG.title || ''), JSON.stringify(editG));

  /* 非法输入：必须提示且不发起任何 PUT */
  const putCount = () => calls.filter((c) => c.method === 'PUT').length;
  const tryBad = async (val) => {
    const before = putCount();
    await page.evaluate((v) => {
      const el = document.getElementById('add-order');
      el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, val);
    await page.click('#w-add-submit');
    await page.waitForTimeout(400);
    const msg = await page.evaluate(() => (document.getElementById('w-add-msg') || {}).textContent || '');
    const focused = await page.evaluate(() => document.activeElement && document.activeElement.id);
    return { msg, focused, delta: putCount() - before };
  };

  const bad6 = await tryBad('6');
  ok('B4 填 6 被拦：提示范围文案 + 不提交', /排序只能填 0~5 的整数/.test(bad6.msg) && bad6.delta === 0, JSON.stringify(bad6));
  const bad35 = await tryBad('3.5');
  ok('B5 填 3.5 被拦：小数不合法 + 不提交', /排序只能填 0~5 的整数/.test(bad35.msg) && bad35.delta === 0, JSON.stringify(bad35));
  const badNeg = await tryBad('-1');
  ok('B6 填 -1 被拦：负数不合法 + 不提交', /排序只能填 0~5 的整数/.test(badNeg.msg) && badNeg.delta === 0, JSON.stringify(badNeg));

  /* 合法：0 要真的落库成 0（别被「假值」逻辑吞掉）*/
  await page.evaluate(() => { document.getElementById('add-order').value = '0'; });
  await page.click('#w-add-submit');
  await page.waitForTimeout(900);
  const put0 = calls.filter((c) => c.method === 'PUT').slice(-1)[0];
  let savedOrder = null, savedTitle = null;
  if (put0 && put0.body && put0.body.content) {
    /* ⚠️ 按片名找，不按 id —— 编辑会按「观影日期 + slug」重算 id（中文片名回落 item） */
    const j = JSON.parse(Buffer.from(put0.body.content, 'base64').toString('utf8'));
    const t = j.items.find((x) => x.title === '庚');
    if (t) { savedOrder = t.order; savedTitle = t.title; }
  }
  ok('B7 填 0 保存成功：写入的 order 就是 0（不是被判空回落到 3）',
    savedOrder === 0 && savedTitle === '庚',
    `order=${savedOrder} title=${savedTitle}｜PUT ${putCount()} 次｜msg=${JSON.stringify(await page.evaluate(() => (document.getElementById('w-add-msg') || {}).textContent || ''))}`);
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(300);

  /* 留空：应写入默认 3 */
  const editG2 = await openByName('乙');
  ok('B8 二次打开仍是内存里的值（乙 order=0）', editG2.val === '0', JSON.stringify(editG2));
  await page.evaluate(() => { document.getElementById('add-order').value = ''; });
  const before3 = putCount();
  await page.click('#w-add-submit');
  await page.waitForTimeout(900);
  const put3 = calls.filter((c) => c.method === 'PUT').slice(-1)[0];
  let emptySaved = null;
  if (putCount() > before3 && put3 && put3.body && put3.body.content) {
    const j = JSON.parse(Buffer.from(put3.body.content, 'base64').toString('utf8'));
    const t = j.items.find((x) => x.title === '乙');
    if (t) emptySaved = t.order;
  }
  ok('B9 留空保存：按默认 3 落库', emptySaved === 3, `order=${emptySaved}｜PUT ${putCount()} 次`);

  await ctx.close();
}

/* ================= C 排序行为 ================= */
console.log('\n== C 排序行为（mock 数据精确比对）==');
{
  const { ctx, page, errs } = await newPage();

  const GRID = await gridNames(page);
  ok('C0 默认（评分序）渲染 10 条，顺序与预期完全一致',
    JSON.stringify(GRID) === JSON.stringify(['甲', '乙', '丁', '丙', '己', '戊', '辛', '庚', '壬', '癸']),
    GRID.join(' > '));

  /* 情形一：仅观看时间相同（评分不同）→ 评分序里仍看评分，order 不参与 */
  ok('C1 仅观看时间相同：评分序仍由评分决定（甲 9 分在前），order 不干预',
    idxOf(GRID, '甲') >= 0 && idxOf(GRID, '甲') < idxOf(GRID, '乙'),
    `甲#${idxOf(GRID, '甲')} < 乙#${idxOf(GRID, '乙')}（甲 order 5 / 乙 order 0，评分 9 vs 8）`);

  /* 情形二：仅评分相同、日期不同 → 评分序由 order 决定（压过日期） */
  ok('C2 仅评分相同：评分序由 order 决定（丁 order 0 排在日期更新的丙 order 5 之前）',
    idxOf(GRID, '丁') < idxOf(GRID, '丙'),
    `丁#${idxOf(GRID, '丁')} < 丙#${idxOf(GRID, '丙')}（丁 2020-02-01 / 丙 2020-02-10）`);

  /* 情形三：日期与评分都相同 → 评分序由 order 决定 */
  ok('C3 日期评分都相同：评分序由 order 决定（己 order 1 在戊 order 4 之前）',
    idxOf(GRID, '己') < idxOf(GRID, '戊'),
    `己#${idxOf(GRID, '己')} < 戊#${idxOf(GRID, '戊')}`);

  /* 默认值 + 非法值兜底：缺字段 / 显式 3 / 越界 9 / 小数 2.5 → 全按 3，退回上传时间正序 */
  const sub = ['庚', '辛', '壬', '癸'].map((n) => idxOf(GRID, n));
  ok('C4 缺字段 / 越界 / 非整数一律按默认 3，组内退回上传时间正序（辛 庚 壬 癸）',
    sub.every((v) => v >= 0) &&
    idxOf(GRID, '辛') < idxOf(GRID, '庚') && idxOf(GRID, '庚') < idxOf(GRID, '壬') && idxOf(GRID, '壬') < idxOf(GRID, '癸'),
    `#${sub.join(' #')}`);

  /* 时间轴：cmpTime 主序 → order → added_at */
  await toTimeline(page);
  const TL = await tlNames(page);
  ok('C5 时间轴：观影时间倒序为第一主序（04 月 → 03 月 → 02 月 → 01 月）',
    JSON.stringify(TL) === JSON.stringify(['辛', '庚', '壬', '癸', '己', '戊', '丙', '丁', '乙', '甲']),
    TL.join(' > '));
  ok('C6 时间轴 · 仅观看时间相同：由 order 决定（乙 order 0 在甲 order 5 之前）',
    idxOf(TL, '乙') < idxOf(TL, '甲'), `乙#${idxOf(TL, '乙')} < 甲#${idxOf(TL, '甲')}`);
  ok('C7 时间轴 · 仅评分相同：由日期决定，order 不干预（02-10 的丙在 02-01 的丁之前）',
    idxOf(TL, '丙') < idxOf(TL, '丁'), `丙#${idxOf(TL, '丙')} < 丁#${idxOf(TL, '丁')}`);
  ok('C8 时间轴 · 日期评分都相同：由 order 决定（己 order 1 在戊 order 4 之前）',
    idxOf(TL, '己') < idxOf(TL, '戊'), `己#${idxOf(TL, '己')} < 戊#${idxOf(TL, '戊')}`);
  ok('C9 时间轴 · 默认/非法 order 按 3 处理（组内上传时间正序 辛 庚 壬 癸）',
    idxOf(TL, '辛') === 0 && idxOf(TL, '庚') === 1 && idxOf(TL, '壬') === 2 && idxOf(TL, '癸') === 3,
    TL.slice(0, 4).join(' > '));

  ok('C10 全程零 JS 异常（排序比较器不抛错）', errs.length === 0, errs.slice(0, 2).join(' | '));
  await ctx.close();
}

/* ================= D 对既有列表的影响 ================= */
console.log('\n== D 老数据零影响 ==');
{
  /* 造一份与线上结构相同、但**全部没有 order 字段**的数据，再逐条按「旧逻辑」算一遍期望值 */
  const LEGACY = {
    updated_at: '2026-10-30T12:00:00+08:00',
    items: [
      { id: '2020-05-02-x', title: '戊1', kind: 'movie', watched_at: '2020-05-02', rating: 8, poster: P, added_at: '2020-05-02T10:00:00+08:00' },
      { id: '2020-05-02-y', title: '戊2', kind: 'movie', watched_at: '2020-05-02', rating: 8, poster: P, added_at: '2020-05-02T09:00:00+08:00' },
      { id: '2020-05-02-z', title: '戊3', kind: 'movie', watched_at: '2020-05-02', rating: 9, poster: P, added_at: '2020-05-02T11:00:00+08:00' },
      { id: '2020-06-01-x', title: '己1', kind: 'movie', watched_at: '2020-06-01', rating: 9, poster: P, added_at: '2020-06-01T08:00:00+08:00' },
      { id: '2020-06-01-y', title: '己2', kind: 'movie', watched_at: '2020-06-01', rating: 9, poster: P, added_at: '2020-06-01T07:00:00+08:00' },
    ],
  };
  const sk = (d) => {
    const m = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/.exec(String(d || '').trim());
    return m ? `${m[1]}-${m[2] || '00'}-${m[3] || '00'}` : '0000-00-00';
  };
  const stamp = (s) => { const t = Date.parse(String(s || '')); return Number.isNaN(t) ? 0 : t; };
  const rv = (it) => { const n = Number(it.rating); return isFinite(n) && n > 0 ? n : -1; };
  // 第 78 轮之前的原始比较器（不含 order）
  const oldCmpTime = (a, b) => {
    const d = sk(b.watched_at).localeCompare(sk(a.watched_at));
    if (d !== 0) return d;
    const s = stamp(a.added_at) - stamp(b.added_at);
    if (s !== 0) return s;
    return String(a.id || '').localeCompare(String(b.id || ''));
  };
  const oldCmpRating = (a, b) => {
    const vb = rv(b), va = rv(a);
    if (vb !== va) return vb - va;
    return oldCmpTime(a, b);
  };
  const expGrid = LEGACY.items.slice().sort(oldCmpRating).map((x) => x.title);
  const expTl = LEGACY.items.slice().sort(oldCmpTime).map((x) => x.title);

  const { ctx, page } = await newPage(false, LEGACY);
  const actGrid = await gridNames(page);
  ok('D1 老数据（全部无 order）：评分序与改动前「旧比较器」完全一致',
    JSON.stringify(actGrid) === JSON.stringify(expGrid),
    `实际 ${actGrid.join(' > ')}｜期望 ${expGrid.join(' > ')}`);
  await toTimeline(page);
  const actTl = await tlNames(page);
  ok('D2 老数据（全部无 order）：时间轴顺序与改动前完全一致',
    JSON.stringify(actTl) === JSON.stringify(expTl),
    `实际 ${actTl.join(' > ')}｜期望 ${expTl.join(' > ')}`);
  await ctx.close();
}

await browser.close();
console.log(`\n第 78 轮：PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);

