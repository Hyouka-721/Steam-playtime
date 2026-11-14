/* 第 95 轮 watch 侧回归：国别字段 + 国别面板
 *
 * 数据形态 `countries: ["美国", "英国"]`（数组；合拍片单值会丢信息）。
 * 归一化：别名表把 美 / US / USA 收敛成「美国」，港澳统一成「中国香港 / 中国澳门」，
 * 台湾与大陆并进「中国」（第 98 轮口径，见 verify98 A7）。
 * 这份表在网页端是内联副本、在 scripts/watch/country-lib.mjs 是权威值，
 * 两边一致性由 tests/unit/watch-country.test.mjs 守着。
 *
 * 口径要点：
 *   · 国别按「各出品国各计一次」累计 —— 合拍片会让合计超过记录总数（第 101 轮起脚注说明已删，规则保留）
 *   · 没填国别的条目单独计数，在标题右侧显示「N 部待补」
 *   · 编辑时表单已预填，清空 = 用户主动清除 → 字段被删掉
 *   · 「+」录入不预填，所以同 id 重录若没填国别，沿用已有值（别让重录把国别弄丢）
 */
import { createRequire } from 'module';
import fs from 'fs';

const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const BASE = 'http://127.0.0.1:8895/';
const ROOT = 'C:/Users/33329/WorkBuddy/2026-10-13-18-17-49/steam-playtime/';
const DOCS = ROOT + 'docs/';
const rd = (p) => fs.readFileSync(DOCS + p, 'utf8').replace(/\r\n/g, '\n');
const stripCmt = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');

const html = rd('watch.html');
const js = stripCmt(rd('watch.js'));
const css = stripCmt(rd('watch.css'));
const data = JSON.parse(rd('data/watch.json'));
const N = data.items.length;

let pass = 0, fail = 0;
const ok = (n, c, extra = '') => {
  c ? (pass++, console.log(`PASS ${n}${extra ? '  — ' + extra : ''}`))
    : (fail++, console.log(`FAIL ${n}  — ${extra}`));
};

/* ---------------- A 静态契约 ---------------- */
console.log('== A 静态契约 ==');
ok('A1 版本号 bump：watch.html 引用 watch.css?v=40 / watch.js?v=31',
  /watch\.css\?v=40/.test(html) && /watch\.js\?v=31/.test(html),
  (html.match(/watch\.(css|js)\?v=\d+/g) || []).join(' '));

const cInput = (html.match(/<input[^>]*id="add-country"[^>]*>/) || [''])[0];
ok('A2 表单有 #add-country（文本框，label for 对得上）',
  /type="text"/.test(cInput) && /<label class="w-label" for="add-country"/.test(html), cInput.slice(0, 60));

ok('A3 FIELD_IDS 含 add-country（否则「打开加号」不会清空上一条留下的国别）',
  /'add-country', 'add-tags'/.test(js));

/* 第 98 轮改判：台湾从「中国台湾」并进「中国」（用户要求），所以这里断言的值跟着变 ——
   归一化规则本身由 `watch-country` 单测逐条守。 */
ok('A4 归一化：别名表里有 美/USA→美国、香港→中国香港、台湾→中国；readCountryField 走它',
  /'美': '美国'/.test(js) && /'usa': '美国'/.test(js) &&
  /'香港': '中国香港'/.test(js) && /'台湾': '中国'/.test(js) &&
  /function normCountry\(/.test(js) && /function readCountryField\(/.test(js));

ok('A5 写入链路：新增落 countries；同 id 重录保留旧值；编辑留空即删除',
  /if \(countryAdd\.v\.length\) item\.countries = countryAdd\.v;/.test(js) &&
  /else if \(upd && Array\.isArray\(upd\.countries\)/.test(js) &&
  /if \(countryRead\.v\.length\) next\.countries = countryRead\.v;/.test(js));

const spanOf = (k) => {
  const m = css.match(new RegExp('\\.st-panel\\[data-panel="' + k + '"\\]\\s*\\{\\s*grid-column:\\s*span\\s*(\\d+)'));
  return m ? Number(m[1]) : 0;
};
/* 第 101 轮改判＋宽度微调：国别与评分区间（两块饼）都收窄到 2 栏。 */
ok('A6 国别面板挂 data-panel="country"、占 2 栏；评分区间也占 2 栏（第 101 轮宽度微调）',
  /data-panel="country"/.test(js) && spanOf('country') === 2 && spanOf('buckets') === 2,
  `country=${spanOf('country')} buckets=${spanOf('buckets')}`);

ok('A7 🔴 860 块的面板跨度复位仍在（新增面板同样受它保护，否则窄屏横向溢出）',
  /@media \(max-width: 860px\)[\s\S]*?\.w-stats \.st-panel\[data-panel\] \{ grid-column: auto; \}/.test(css));

const m860 = css.match(/@media \(max-width: 860px\)/g) || [];
ok('A8 本轮没新增断点：全文件仍只有 1 个 @media (max-width:860px)', m860.length === 1, `${m860.length} 个`);

/* ---------------- B 1440 运行时 ---------------- */
console.log('== B 1440 运行时 ==');
const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
await page.goto(BASE + 'watch.html', { waitUntil: 'load' });
await page.waitForSelector('#w-grid .poster', { timeout: 15000 });
await page.click('#w-avatar');
await page.waitForSelector('#w-tl .tl-item', { timeout: 15000 });
await page.click('#w-stats-btn');
await page.waitForTimeout(600);

const r0 = await page.evaluate(() => {
  const sec = document.querySelector('[data-panel="country"]');
  const rows = sec ? [...sec.querySelectorAll('.st-row')] : [];
  const first = rows[0];
  return {
    exists: !!sec,
    rows: rows.length,
    first: first ? first.querySelector('.st-row-k').textContent.trim() : '',
    firstV: first ? first.querySelector('.st-row-v').textContent.trim() : '',
    hint: sec && sec.querySelector('.st-hint') ? sec.querySelector('.st-hint').textContent.trim() : '',
    empty: sec && sec.querySelector('.st-empty') ? sec.querySelector('.st-empty').textContent.trim() : '',
    ov: document.documentElement.scrollWidth - document.documentElement.clientWidth
  };
});
/* 第 96 轮改判：数据已把 124 条国别全部补齐，所以真实数据不再是空态。
   判据从「空态 + N 部待补」改成「出真行、首行=实际最多的那个国别、待补 0」。
   —— 这不是调阈值：空态分支由下面的造数用例（B3 的 1 部待补）继续守着。
   第 97 轮再改判一次：面板把「<10 部」的国别折成一行「其他」，所以行数不再是 min(8, 国别数)。
   —— 也不是调阈值：合并规则本身由 verify97 A14/A15/B3/B11/C4 守，这里只跟真实数据对账。 */
const R95 = {};
data.items.forEach((it) => (it.countries || []).forEach((c) => { R95[c] = (R95[c] || 0) + 1; }));
const R95K = Object.keys(R95).sort((a, b) => R95[b] - R95[a] || a.localeCompare(b));
const R95MAJ = R95K.filter((c) => R95[c] >= 10).slice(0, 8);
const R95MIN = R95K.filter((c) => !R95MAJ.includes(c)).reduce((s, c) => s + R95[c], 0);
const R95EXP = R95MAJ.length ? R95MAJ.length + (R95MIN ? 1 : 0) : Math.min(8, R95K.length);
const R95NO = data.items.filter((it) => !(Array.isArray(it.countries) && it.countries.length)).length;
const R95ROW = r0.rows > 0 ? r0.rows : 0;
const R95FIRST = R95K[0];
ok('B1 真实数据已补齐国别：面板出 ' + R95EXP + ' 行、首行 ' + R95FIRST +
  '=' + R95[R95FIRST] + '、无待补、无空态',
  R95ROW === R95EXP && r0.first === R95FIRST && r0.firstV === String(R95[R95FIRST]) &&
  R95NO === 0 && r0.hint === '' && r0.empty === '',
  `行=${R95ROW} 首行=${r0.first}/${r0.firstV} 提示「${r0.hint}」空态=${r0.empty ? '有' : '无'} 待补=${R95NO}`);
await ctx.close();

/* ---------------- B2 造数：国别构成 + 截断到 8 ---------------- */
console.log('== B2 造数：国别构成 ==');
{
  const names = ['美国', '日本', '英国', '法国', '德国', '韩国', '中国', '意大利', '加拿大', '西班牙', '澳大利亚'];
  const items = [];
  // 美国 5 部、日本 3 部、其余各 1 部 → 共 11 个国别，面板只显示前 8
  names.forEach((c, ci) => {
    const times = ci === 0 ? 5 : ci === 1 ? 3 : 1;
    for (let k = 0; k < times; k++) {
      items.push({
        id: '2024-0' + ((ci % 9) + 1) + '-0' + k + '-p' + ci,
        title: c + '片' + k, kind: 'movie', watched_at: '2024-0' + ((ci % 9) + 1) + '-1' + (k % 9),
        year: 2024, rating: 8, poster: '', note: '', countries: [c]
      });
    }
  });
  // 再插一条合拍片（美 / 英）验证「按国别累计可超总数」
  items.push({ id: '2024-09-09-co', title: '合拍片', kind: 'movie', watched_at: '2024-09-09',
    year: 2024, rating: 9, poster: '', note: '', countries: ['美国', '英国'] });
  // 一条没填国别 → 计入待补
  items.push({ id: '2024-09-10-no', title: '没填国别', kind: 'movie', watched_at: '2024-09-10',
    year: 2024, rating: 7, poster: '', note: '' });

  const c2 = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
  const p2 = await c2.newPage();
  const e2 = [];
  p2.on('pageerror', (e) => e2.push(String(e)));
  await p2.route('**/data/watch/manifest.json*', (r) => r.fulfill({ status: 404, body: '' }));
  await p2.route('**/data/watch.json*', (r) => r.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ updated_at: '2026-11-14T00:00:00+08:00', items })
  }));
  await p2.goto(BASE + 'watch.html', { waitUntil: 'load' });
  await p2.waitForSelector('#w-grid .poster', { timeout: 15000 });
  await p2.click('#w-avatar');
  await p2.waitForSelector('#w-tl .tl-item', { timeout: 15000 });
  await p2.click('#w-stats-btn');
  await p2.waitForTimeout(600);
  const r = await p2.evaluate(() => {
    const sec = document.querySelector('[data-panel="country"]');
    return {
      rows: [...sec.querySelectorAll('.st-row')].map((x) => ({
        k: x.querySelector('.st-row-k').textContent.trim(),
        v: x.querySelector('.st-row-v').textContent.trim()
      })),
      hint: sec.querySelector('.st-hint') ? sec.querySelector('.st-hint').textContent.trim() : '',
      note: sec.querySelector('.st-note') ? sec.querySelector('.st-note').textContent.trim() : '',
      text: sec.textContent,
      ov: document.documentElement.scrollWidth - document.documentElement.clientWidth
    };
  });
  const top = r.rows[0] || {};
  const uk = r.rows.find((x) => x.k === '英国') || {};
  ok('B2 国别构成：按数量倒序、只显示前 8 行；美国 6 部（5+合拍）、英国 2 部（1+合拍）',
    r.rows.length === 8 && top.k === '美国' && top.v === '6' && uk.v === '2',
    r.rows.map((x) => x.k + '=' + x.v).join('/'));
  /* 第 101 轮改判（用户「删除国别构成的说明文字」）：脚注整条删除，标题提示仍在；
     长尾合并规则本身没删（第 97 轮契约），由 verify101 静态守着。 */
  ok('B3 标题提示「1 部待补」仍在，国别说明文字与脚注已删净',
    r.hint === '1 部待补' && r.note === '' &&
    !/按国别累计|可超过记录总数|少于 10 部|合拍片/.test(r.text),
    `提示=${r.hint} 脚注「${r.note}」`);
  ok('B4 造数场景无横向溢出 + 零 JS 异常', r.ov <= 0 && e2.length === 0, `ov=${r.ov} err=${e2.length}`);
  await c2.close();
}

/* ---------------- B5 录入：归一化 + 去重后落库 ---------------- */
console.log('== B5 录入归一化 ==');
{
  const masterB64 = Buffer.from(rd('data/watch.json'), 'utf8').toString('base64');
  const puts = [];
  const c3 = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
  const p3 = await c3.newPage();
  const e3 = [];
  p3.on('pageerror', (e) => e3.push(String(e)));
  await p3.addInitScript(() => { try { localStorage.setItem('watch-gh-token', 'ghp_fake_for_test'); } catch (e) {} });
  await p3.route('https://api.github.com/**', (r) => {
    const req = r.request();
    if (req.method() === 'PUT') puts.push({ url: req.url(), body: req.postData() || '' });
    return r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ content: masterB64, sha: 'sha-x' }) });
  });
  await p3.goto(BASE + 'watch.html', { waitUntil: 'load' });
  await p3.waitForSelector('#w-grid .poster', { timeout: 15000 });
  await p3.click('#w-fab');
  await p3.fill('#add-title', '第95轮国别探针');
  await p3.fill('#add-watched', '2026-11-14');
  await p3.fill('#add-rating', '8');
  // 故意用四种写法 + 一个重复
  await p3.fill('#add-country', '美, USA、日本; 香港 / 日本');
  await p3.click('#w-add-submit');
  await p3.waitForFunction(() => {
    const t = document.getElementById('w-toast');
    return t && !t.hidden && /已提交/.test(t.textContent || '');
  }, null, { timeout: 20000 }).catch(() => {});

  let saved = null;
  for (const p of puts) {
    if (!/\/contents\/docs\/data\/watch\.json$/.test(p.url.split('?')[0])) continue;
    try {
      const body = JSON.parse(p.body || '{}');
      const text = Buffer.from(String(body.content || ''), 'base64').toString('utf8');
      const parsed = JSON.parse(text);
      saved = (parsed.items || []).find((it) => it.title === '第95轮国别探针');
      if (saved) break;
    } catch (e) { /* 继续找 */ }
  }
  ok('B5 录入「美, USA、日本; 香港 / 日本」落库为 ["美国","日本","中国香港"]（归一化 + 去重 + 保序）',
    !!saved && Array.isArray(saved.countries) &&
    saved.countries.join('|') === '美国|日本|中国香港',
    saved ? JSON.stringify(saved.countries) : `没抓到 PUT（${puts.length} 次）`);
  ok('B6 录入链路零 JS 异常', e3.length === 0, e3.slice(0, 2).join(' | '));
  await c3.close();
}

/* ---------------- B7 编辑：预填与清空 ---------------- */
console.log('== B7 编辑预填与清空 ==');
{
  const mock = {
    updated_at: '2026-11-14T00:00:00+08:00',
    items: [{
      id: '2024-05-01-edit', title: '国别编辑探针', kind: 'movie', watched_at: '2024-05-01',
      year: 2024, rating: 8.5, poster: 'img/watch/probe.webp',
      note: '', countries: ['美国', '英国']
    }]
  };
  const masterB64 = Buffer.from(JSON.stringify(mock, null, 2) + '\n', 'utf8').toString('base64');
  const puts = [];
  const c4 = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
  const p4 = await c4.newPage();
  const e4 = [];
  p4.on('pageerror', (e) => e4.push(String(e)));
  await p4.addInitScript(() => { try { localStorage.setItem('watch-gh-token', 'ghp_fake_for_test'); } catch (e) {} });
  await p4.route('**/data/watch/manifest.json*', (r) => r.fulfill({ status: 404, body: '' }));
  await p4.route('**/data/watch.json*', (r) => r.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(mock)
  }));
  await p4.route('https://api.github.com/**', (r) => {
    const req = r.request();
    if (req.method() === 'PUT') puts.push({ url: req.url(), body: req.postData() || '' });
    return r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ content: masterB64, sha: 'sha-x' }) });
  });
  await p4.goto(BASE + 'watch.html', { waitUntil: 'load' });
  await p4.waitForSelector('#w-grid .poster', { timeout: 15000 });
  await p4.click('#w-avatar');
  await p4.waitForSelector('#w-tl .tl-item', { timeout: 15000 });
  await p4.click('#w-tl .tl-item');
  await p4.waitForTimeout(400);
  const pre = await p4.evaluate(() => (document.getElementById('add-country') || {}).value || '');
  ok('B7 编辑弹窗预填国别为「美国, 英国」', pre === '美国, 英国', `值=${pre}`);

  await p4.fill('#add-country', '');
  await p4.click('#w-add-submit');
  await p4.waitForFunction(() => {
    const t = document.getElementById('w-toast');
    return t && !t.hidden && /已/.test(t.textContent || '');
  }, null, { timeout: 20000 }).catch(() => {});
  let saved = null;
  for (const p of puts) {
    if (!/\/contents\/docs\/data\/watch\.json$/.test(p.url.split('?')[0])) continue;
    try {
      const body = JSON.parse(p.body || '{}');
      const parsed = JSON.parse(Buffer.from(String(body.content || ''), 'base64').toString('utf8'));
      // id 会跟随「观看日期 + slug」重算（第 72 轮契约），所以按片名找而不是按旧 id
      saved = (parsed.items || []).find((it) => it.title === '国别编辑探针');
      if (saved) break;
    } catch (e) { /* nope */ }
  }
  ok('B8 清空国别后保存：字段被删除（编辑表单已预填，清空即用户主动清除）',
    !!saved && !('countries' in saved), saved ? JSON.stringify(saved.countries) : `没抓到 PUT（${puts.length} 次）`);
  ok('B9 编辑链路零 JS 异常', e4.length === 0, e4.slice(0, 2).join(' | '));
  await c4.close();
}

/* ---------------- C 390 窄屏 ---------------- */
console.log('== C 390 窄屏 ==');
const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
const mp = await mctx.newPage();
const merrs = [];
mp.on('pageerror', (e) => merrs.push(String(e)));
await mp.goto(BASE + 'watch.html', { waitUntil: 'load' });
await mp.waitForSelector('#w-grid .poster', { timeout: 15000 });
await mp.click('#w-avatar');
await mp.waitForSelector('#w-tl .tl-item', { timeout: 15000 });
await mp.click('#w-stats-btn');
await mp.waitForTimeout(700);
const m = await mp.evaluate(() => {
  const cols = (s) => getComputedStyle(document.querySelector(s)).gridTemplateColumns.split(' ').length;
  const sec = document.querySelector('[data-panel="country"]');
  return {
    panelCols: cols('.st-panels'),
    countryW: sec ? Math.round(sec.getBoundingClientRect().width) : -1,
    vw: window.innerWidth,
    ov: document.documentElement.scrollWidth - window.innerWidth
  };
});
ok('C1 390：国别面板跟着收成单列、宽度不越界、无横向溢出',
  m.panelCols === 1 && m.countryW > 0 && m.countryW <= m.vw && m.ov <= 0,
  `面板 ${m.panelCols} 列 / country ${m.countryW} / ov=${m.ov}`);
ok('C2 390 零 JS 异常', merrs.length === 0, merrs.slice(0, 3).join(' | '));

await browser.close();
console.log(`\n===== 第 95 轮 watch（国别字段 + 国别面板）：${pass} PASS / ${fail} FAIL =====`);
process.exit(fail ? 1 : 0);
