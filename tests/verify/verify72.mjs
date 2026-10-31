/* 第 72 轮回归：
   ① 页眉改回 My Watch List（<title> 站名仍 Watch List，两处分工）
   ② 网格排序切换（评分 / 观看时间）取代「共 N 部」计数条
   ③ 同日记录按上传时间 added_at 正序（先上传居前）
   ④ 玉子市场 / 玉子爱情故事同 id 互相覆盖事故修复：两部并存 + 录入 id 防撞车
   ⑤ 工作细胞换海报（item-4bb7a3f7.webp，命名 hash 自洽） */
import { createRequire } from 'module';
import fs from 'fs';
import crypto from 'crypto';
const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const BASE = process.env.BASE || 'http://127.0.0.1:8895/';
const ROOT = 'C:/Users/33329/WorkBuddy/2026-10-13-18-17-49/steam-playtime/docs/';
const OUT = 'C:/Users/33329/AppData/Local/Temp/fx_verify_20261018/shots72/';
fs.mkdirSync(OUT, { recursive: true });

const rd = (f) => fs.readFileSync(ROOT + f, 'utf8').replace(/\r\n/g, '\n');
const html = rd('watch.html');
const js = rd('watch.js');
const data = JSON.parse(fs.readFileSync(process.env.DATA_FILE || (ROOT + 'data/watch.json'), 'utf8'));
const N = data.items.length;

let pass = 0, fail = 0;
const ok = (n, c, extra = '') => { c ? (pass++, console.log(`PASS ${n}${extra ? '  — ' + extra : ''}`)) : (fail++, console.log(`FAIL ${n}  — ${extra}`)); };

/* ---------- 比较器（与 watch.js cmpTime / cmpRating 同规则，node 侧重放） ---------- */
function sortKey(d) {
  const m = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/.exec(String(d || '').trim());
  if (!m) return '0000-00-00';
  return m[1] + '-' + (m[2] || '00') + '-' + (m[3] || '00');
}
function stampKey(s) { const t = Date.parse(String(s || '')); return Number.isNaN(t) ? 0 : t; }
function ratingVal(it) { const n = Number(it && it.rating); return Number.isFinite(n) && n > 0 ? n : -1; }
/* 第 78 轮把「排序」order 插进了两级比较器，本套件的 node 侧重放必须同步，
   否则用户一旦给某条设了 order（例如《史前星球》order=1），并列时的期望顺序
   就与页面不一致 —— 这不是页面错了，是这套比较器过期了。 */
function orderVal(it) {
  const raw = it == null ? null : it.order;
  if (raw == null || raw === '') return 3;
  const n = Number(raw);
  if (!Number.isFinite(n) || Math.floor(n) !== n || n < 0 || n > 5) return 3;
  return n;
}
function cmpTime(a, b) {
  const d = sortKey(b.watched_at).localeCompare(sortKey(a.watched_at));
  if (d !== 0) return d;
  const o = orderVal(a) - orderVal(b);   // 第 78 轮：并列时 order 升序
  if (o !== 0) return o;
  const s = stampKey(a.added_at) - stampKey(b.added_at);
  if (s !== 0) return s;
  return String(a.id || '').localeCompare(String(b.id || ''));
}
function cmpRating(a, b) {
  const vb = ratingVal(b), va = ratingVal(a);
  if (vb !== va) return vb - va;
  const o = orderVal(a) - orderVal(b);   // 第 78 轮：评分并列时 order 升序
  if (o !== 0) return o;
  return cmpTime(a, b);
}

/* ================= A 静态：源码与数据 ================= */
console.log('== A 静态 ==');
ok('A1 页眉是 My Watch List、<title> 站名仍是 Watch List（两处分工）',
  /<h1[^>]*class="w-title"[^>]*>\s*My Watch List\s*<\/h1>/.test(html) &&
  /<title>Watch List<\/title>/.test(html) && !/<title>[^<]*My Watch List/.test(html));
ok('A2 「共 N 部」计数条已删，换成 #w-sort 两按钮（默认观看时间）',
  !/w-count/.test(html) && /id="w-sort"/.test(html) &&
  /data-sort="time"[^>]*aria-pressed="true"/.test(html) && /data-sort="rating"[^>]*aria-pressed="false"/.test(html));
ok('A3 版本号 bump：watch.css?v=23 / watch.js?v=16',
  /watch\.css\?v=23"/.test(html) && /watch\.js\?v=16"/.test(html));
ok('A4 玉子两部并存：id 不同、同日、按上传时间正序',
  (() => {
    const a = data.items.find((x) => x.title === '玉子爱情故事');
    const m = data.items.find((x) => x.title === '玉子市场');
    return !!a && !!m && a.id !== m.id && a.watched_at === m.watched_at &&
      stampKey(a.added_at) < stampKey(m.added_at) &&
      m.kind === 'anime' && m.year === 2013 && m.rating === 8.5 && m.poster.endsWith('item-5e1496bd.webp') &&
      fs.existsSync(ROOT + m.poster);
  })(),
  data.items.filter((x) => /玉子/.test(x.title)).map((x) => `${x.title}(${x.id})`).join(' / '));
ok('A5 工作细胞换上海报：json 指向 + 文件名 hash 自洽 + 旧海报已删',
  (() => {
    const it = data.items.find((x) => x.title === '工作细胞');
    if (!it || it.poster !== 'img/watch/item-4bb7a3f7.webp') return false;
    const buf = fs.readFileSync(ROOT + it.poster);
    const h = crypto.createHash('sha256').update(buf).digest('hex').slice(0, 8);
    return h === '4bb7a3f7' && !fs.existsSync(ROOT + 'img/watch/item-5480e3e4.webp') &&
      it.poster_w === 640 && it.poster_h === 959;
  })(),
  (() => { const it = data.items.find((x) => x.title === '工作细胞'); return it && `${it.poster} ${it.poster_w}×${it.poster_h}`; })());
ok('A6 全部条目都有可解析的 added_at', data.items.every((it) => stampKey(it.added_at) > 0),
  `${data.items.filter((it) => stampKey(it.added_at) > 0).length}/${N}`);
ok('A7 items 数组顺序就是 cmpTime 序（观影倒序 + 同日上传正序）',
  JSON.stringify(data.items.map((i) => i.id)) ===
  JSON.stringify(data.items.slice().sort(cmpTime).map((i) => i.id)));
ok('A8 watch.js 有排序/上传时间/防撞车实现（第 75 轮起默认 rating 且不持久化）',
  /var sort = 'rating'/.test(js) && /function cmpTime/.test(js) && /function cmpRating/.test(js) &&
  /function stampKey/.test(js) && /baseId/.test(js) && /next.added_at = old.added_at/.test(js));

/* ================= B 运行时：网格排序 ================= */
console.log('\n== B 网格排序 ==');
const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const errs = [];
const gridNames = (p) => p.evaluate(() =>
  [...document.querySelectorAll('#w-grid .poster-name')].map((x) => x.textContent.trim()));

{
  const c = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await c.newPage();
  p.on('pageerror', (e) => errs.push('B:' + e));
  await p.goto(BASE + 'watch.html', { waitUntil: 'load' });
  await p.waitForFunction(() => document.querySelectorAll('#w-grid .poster').length > 0, null, { timeout: 25000 });
  await p.waitForTimeout(400);

  const expectTime = data.items.slice().sort(cmpTime).map((i) => i.title);
  const expectRating = data.items.slice().sort(cmpRating).map((i) => i.title);

  // 第 75 轮起默认评分序（用户要求「默认按评分排序」，且不再持久化）
  ok('B1 默认（评分）网格顺序 = 数据 cmpRating 序', JSON.stringify(await gridNames(p)) === JSON.stringify(expectRating));

  // 每个同日组：网格里的先后必须与「评分降序 → 上传正序」一致（评分序下的同日规则）
  const byDay = {};
  data.items.forEach((it) => { (byDay[it.watched_at] = byDay[it.watched_at] || []).push(it); });
  const names0 = await gridNames(p);
  const dayOK = Object.keys(byDay).filter((k) => byDay[k].length > 1).every((k) => {
    const seq = byDay[k].slice().sort(cmpRating).map((i) => names0.indexOf(i.title));
    return seq.every((v, i) => i === 0 || seq[i - 1] < v);
  });
  const groups = Object.keys(byDay).filter((k) => byDay[k].length > 1).length;
  ok(`B2 ${groups} 个同日组都按上传时间正序（先上传居前）`, dayOK && groups > 0, `${groups} 组`);

  await p.click('.w-sort-btn[data-sort="rating"]');
  await p.waitForTimeout(250);
  const r1 = await p.evaluate(() => ({
    on: document.querySelector('.w-sort-btn.is-on').getAttribute('data-sort'),
    pressed: document.querySelector('.w-sort-btn[data-sort="rating"]').getAttribute('aria-pressed'),
    timePressed: document.querySelector('.w-sort-btn[data-sort="time"]').getAttribute('aria-pressed'),
    stored: localStorage.getItem('watch-sort'),
  }));
  ok('B3 点评分：按钮态/aria-pressed 切过去（第 75 轮起不再写 localStorage）',
    r1.on === 'rating' && r1.pressed === 'true' && r1.timePressed === 'false' && r1.stored === null, JSON.stringify(r1));
  const namesR = await gridNames(p);
  ok('B4 评分序 = 数据 cmpRating 序（高分段在前，无评分沉底）',
    JSON.stringify(namesR) === JSON.stringify(expectRating));
  await p.screenshot({ path: OUT + 'B4_评分序_网格_1440.png' });

  await p.reload({ waitUntil: 'load' });
  await p.waitForFunction(() => document.querySelectorAll('#w-grid .poster').length > 0, null, { timeout: 25000 });
  await p.waitForTimeout(400);
  ok('B5 刷新后回到默认评分序（第 75 轮起默认即评分序、不持久化）',
    JSON.stringify(await gridNames(p)) === JSON.stringify(expectRating));

  await p.click('.w-sort-btn[data-sort="time"]');
  await p.waitForTimeout(250);
  ok('B6 点回观看时间即恢复时间序（同样不持久化）',
    JSON.stringify(await gridNames(p)) === JSON.stringify(expectTime) &&
    (await p.evaluate(() => localStorage.getItem('watch-sort'))) === null);
  await c.close();
}

/* ================= C 运行时：时间轴不受排序影响 ================= */
console.log('\n== C 时间轴 ==');
{
  const c = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await c.newPage();
  p.on('pageerror', (e) => errs.push('C:' + e));
  await p.goto(BASE + 'watch.html', { waitUntil: 'load' });
  await p.waitForFunction(() => document.querySelectorAll('#w-grid .poster').length > 0, null, { timeout: 25000 });
  await p.click('.w-sort-btn[data-sort="rating"]');   // 先切成评分序
  await p.waitForTimeout(200);
  await p.click('#w-avatar');                          // 再切时间轴
  await p.waitForFunction(() => document.querySelectorAll('#w-tl .tl-item').length > 0, null, { timeout: 25000 });
  await p.waitForTimeout(500);
  const r = await p.evaluate(() => ({
    sortHidden: document.getElementById('w-sort').hidden,
    dates: [...document.querySelectorAll('#w-tl .tl-date')].map((x) => x.textContent.trim()),
  }));
  const keys = r.dates.map(sortKey);
  const nonIncreasing = keys.every((v, i) => i === 0 || keys[i - 1] >= v);
  ok('C1 时间轴视图下排序切换隐藏', r.sortHidden === true, `hidden=${r.sortHidden}`);
  ok('C2 即使全局是评分序，时间轴仍按观影时间倒序', nonIncreasing && r.dates.length === N,
    `${r.dates.length} 条，首 ${r.dates[0]} 尾 ${r.dates[r.dates.length - 1]}`);
  await p.screenshot({ path: OUT + 'C2_时间轴_排序隐藏_1440.png' });
  await c.close();
}

/* ================= D mock：id 防撞车 + 上传时间保留 ================= */
console.log('\n== D 录入防撞车（mock api.github.com） ==');
const MOCK_DATA = {
  updated_at: '2026-10-25T10:00:00+08:00',
  items: [
    { id: '2021-08-02-love-letter', title: '情书', kind: 'movie', watched_at: '2021-08-02',
      poster: 'img/minion-0ef9a202.webp', poster_w: 460, poster_h: 420, added_at: '2026-10-25T11:10:00+08:00' },
    { id: '2021-08-02-item', title: '冰海战记', kind: 'movie', watched_at: '2021-08-02',
      poster: 'img/minion-0ef9a202.webp', poster_w: 460, poster_h: 420, added_at: '2026-10-25T11:12:00+08:00' },
  ],
};
const expandToken = async (page) => {
  await page.evaluate(() => { const b = document.getElementById('add-token-box'); if (b) b.open = true; });
  await page.waitForSelector('#add-token', { state: 'visible', timeout: 5000 });
};
async function mockPage() {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const calls = [];
  page.on('pageerror', (e) => errs.push('D:' + e));
  await page.route('**/data/watch.json*', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_DATA) }));
  await page.route('https://api.github.com/**', async (r) => {
    const req = r.request();
    const method = req.method();
    let body = null;
    try { body = req.postDataJSON(); } catch (e) {}
    calls.push({ method, url: req.url(), body, auth: req.headers()['authorization'] || '' });
    if (method === 'GET') {
      if (req.url().includes('/contents/docs/data/watch.json')) {
        const b64 = Buffer.from(JSON.stringify(MOCK_DATA), 'utf8').toString('base64');
        return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: b64.replace(/\n/g, ''), sha: 'sha-data' }) });
      }
      return r.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ message: 'Not Found' }) });
    }
    return r.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ content: { sha: 'newsha' } }) });
  });
  await page.goto(BASE + 'watch.html', { waitUntil: 'load' });
  await page.waitForTimeout(400);
  // <details id="add-token-box"> 在 <dialog> 里：必须先开对话框再展开，否则 input 不可见
  await page.click('#w-fab');
  await page.waitForTimeout(200);
  await expandToken(page);
  await page.fill('#add-token', 'github_pat_TESTTOKEN_1234567890');
  await page.click('#add-token-save');
  await page.waitForTimeout(200);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  return { ctx, page, calls };
}
const putJson = (calls) => {
  const puts = calls.filter((x) => x.method === 'PUT' && x.url.includes('/contents/docs/data/watch.json'));
  const put = puts[puts.length - 1];   // 取最近一次提交
  if (!put) return null;
  try { return JSON.parse(Buffer.from(put.body.content, 'base64').toString('utf8')); } catch (e) { return null; }
};

{
  const { ctx, page, calls } = await mockPage();
  // D1：同日、无英文名的新片 → 基 id 被「冰海战记」占用 → 必须追 -2，不能覆盖
  await page.click('#w-fab'); await page.waitForTimeout(200);
  await page.fill('#add-title', '测试甲');
  await page.fill('#add-watched', '2021-08-02');
  await page.click('#w-add-submit');
  await page.waitForTimeout(1500);
  const j1 = putJson(calls);
  const newItem = j1 && j1.items.find((x) => x.title === '测试甲');
  ok('D1 同日无英文名新片拿到 -2 后缀 id，冰海战记原样保留',
    !!newItem && newItem.id === '2021-08-02-item-2' && j1.items.length === 3 &&
    j1.items.find((x) => x.title === '冰海战记').poster.endsWith('minion-0ef9a202.webp'),
    newItem && newItem.id);

  // D2：同 id 同片名重新录入 → 更新而非新增，added_at 沿用首次录入
  await page.click('#w-fab'); await page.waitForTimeout(200);
  await page.fill('#add-title', '冰海战记');
  await page.fill('#add-watched', '2021-08-02');
  await page.click('#w-add-submit');
  await page.waitForTimeout(1500);
  const puts = calls.filter((x) => x.method === 'PUT' && x.url.includes('/contents/docs/data/watch.json'));
  const j2 = putJson(calls);
  const reItem = j2 && j2.items.find((x) => x.title === '冰海战记');
  ok('D2 重复录入同片 = 更新（条数不增、id 不变、added_at 不刷新）',
    puts.length === 2 && !!reItem && reItem.id === '2021-08-02-item' &&
    reItem.added_at === '2026-10-25T11:12:00+08:00' && j2.items.length === 2,
    `puts=${puts.length} added_at=${reItem && reItem.added_at}`);
  await ctx.close();
}
{
  const { ctx, page, calls } = await mockPage();
  // D3：时间轴点条目编辑 → 保存后 id / added_at 原样，只改表单字段
  await page.click('#w-avatar');
  await page.waitForFunction(() => document.querySelectorAll('#w-tl .tl-item').length > 0, null, { timeout: 15000 });
  await page.waitForTimeout(400);
  await page.click('#w-tl .tl-item:has-text("冰海战记")');
  await page.waitForTimeout(400);
  const dlg = await page.evaluate(() => ({
    title: document.getElementById('w-add-title').textContent,
    editing: document.getElementById('w-add').hasAttribute('open'),
  }));
  ok('D3a 时间轴条目点开的是编辑模式', dlg.editing && /编辑《冰海战记》/.test(dlg.title), JSON.stringify(dlg));
  await page.fill('#add-note', '第 72 轮改过的短评');
  await page.click('#w-add-submit');
  await page.waitForTimeout(1500);
  const j3 = putJson(calls);
  const ed = j3 && j3.items.find((x) => x.title === '冰海战记');
  ok('D3b 编辑保存：id / added_at 原样，只改表单字段',
    !!ed && ed.id === '2021-08-02-item' && ed.added_at === '2026-10-25T11:12:00+08:00' &&
    ed.note === '第 72 轮改过的短评', ed && `${ed.id} / ${ed.added_at} / ${ed.note}`);
  await ctx.close();
}

/* ================= E 收尾 ================= */
ok('E1 全程零 JS 异常', errs.length === 0, errs.join(' | '));
console.log(`\n第 72 轮：PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
