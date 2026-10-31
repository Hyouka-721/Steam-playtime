/* 第 79 轮回归：锁定「网格卡片不可点击编辑，只有时间轴条目可点」这条交互契约
   背景：第 69 轮把条目点击编辑做成事件委托，只挂在 #w-tl 上（网格卡片点不开）。
   第 79 轮用户明确要求保持该逻辑，本套件就是防止未来把入口误绑到 .poster 上的守卫。

   断言分组：
   A 静态（6 条）：模板与绑定范围 —— 网格卡片无可点击语义、委托只绑 tlEl
   B 运行时（8 条）：真实点击 / 键盘 / 布局切换后，网格点不开编辑、时间轴点得开
   ⚠️ 版本号断言：watch.css?v=19 / watch.js?v=14（第 78 轮 bump，本轮未改码） */
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
const P = 'img/minion-0ef9a202.webp';

/* ================= A 静态指纹 ================= */
console.log('== A 静态指纹（绑定范围）==');
ok('A1 网格与时间轴是两个独立容器（w-grid / w-tl），互不复用',
  /<section class="w-grid" id="w-grid"/.test(html) && /<section class="w-tl" id="w-tl"/.test(html));

{
  /* 取 renderGrid 段落与 renderTimeline 段落，分别检查「可点击语义」 */
  const gStart = jsNC.indexOf('function renderGrid(list)');
  const tStart = jsNC.indexOf('function renderTimeline(list)');
  const gSeg = jsNC.slice(gStart, tStart);
  const tSeg = jsNC.slice(tStart, jsNC.indexOf('function wireImages', tStart) > 0 ? jsNC.indexOf('function wireImages', tStart) : tStart + 2600);

  ok('A2 网格卡片模板：无 data-id / 无 role="button" / 无 tabindex（点不开、也聚焦不到）',
    /'<article class="poster">'/.test(gSeg) &&
    !/data-id/.test(gSeg) && !/role="button"/.test(gSeg) && !/tabindex/.test(gSeg),
    `data-id=${/data-id/.test(gSeg)} role=${/role="button"/.test(gSeg)} tabindex=${/tabindex/.test(gSeg)}`);

  ok('A3 时间轴条目模板：带 data-id + role="button" + tabindex="0"（对照项，必须保留）',
    /'<article class="tl-item" data-id="/.test(tSeg) &&
    /role="button" tabindex="0"/.test(tSeg) &&
    /aria-label="编辑《/.test(tSeg));
}

ok('A4 点击编辑的事件委托只绑在 tlEl 上（click + keydown 各一次）',
  /if \(tlEl\) \{\s*tlEl\.addEventListener\('click'/.test(jsNC) &&
  /tlEl\.addEventListener\('keydown'/.test(jsNC));

ok('A5 全文没有对网格容器绑定任何点击 / 键盘监听（gridEl.addEventListener 出现 0 次）',
  (jsNC.match(/gridEl\.addEventListener/g) || []).length === 0,
  `出现 ${(jsNC.match(/gridEl\.addEventListener/g) || []).length} 次`);

ok('A6 查找目标写死 .tl-item（closestItem 认不出网格卡片）',
  /function closestItem\(node\)[\s\S]{0,220}classList\.contains\('tl-item'\)/.test(jsNC) &&
  !/classList\.contains\('poster'\)/.test(jsNC));

{
  /* .poster 段落里不该有 cursor:pointer —— 那是「可点」的视觉暗示，只留给 .tl-item */
  const m = /\.poster \{[^}]*\}/.exec(cssNC);
  const posterBlock = m ? m[0] : '';
  ok('A7 视觉暗示也对齐：.poster 无 cursor:pointer，.tl-item 有',
    posterBlock.length > 0 && !/cursor/.test(posterBlock) &&
    /\.tl-item \{ cursor: pointer; \}/.test(cssNC),
    posterBlock.replace(/\s+/g, ' ').slice(0, 80));
}

ok('A8 版本号未被本轮改动（watch.css?v=19 / watch.js?v=14）',
  /watch\.css\?v=19"/.test(html) && /watch\.js\?v=14"/.test(html));

/* ================= B 运行时 ================= */
const MOCK = {
  updated_at: '2026-10-31T12:00:00+08:00',
  items: [
    { id: '2021-01-05-a', title: '甲', kind: 'movie', watched_at: '2021-01-05', rating: 9, order: 1, poster: P, added_at: '2021-01-05T00:00:01+08:00' },
    { id: '2021-01-04-b', title: '乙', kind: 'movie', watched_at: '2021-01-04', rating: 8, order: 2, poster: P, added_at: '2021-01-04T00:00:01+08:00' },
    { id: '2021-01-03-c', title: '丙', kind: 'movie', watched_at: '2021-01-03', rating: 7, order: 3, poster: P, added_at: '2021-01-03T00:00:01+08:00' },
    { id: '2021-01-02-d', title: '丁', kind: 'movie', watched_at: '2021-01-02', rating: 6, order: 4, poster: P, added_at: '2021-01-02T00:00:01+08:00' },
  ],
};

const browser = await chromium.launch({ args: ['--no-proxy-server'] });

async function newPage() {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.addInitScript(() => { try { localStorage.setItem('watch-gh-token', 'ghp_fake_for_test'); } catch (e) {} });
  await page.route('**/data/watch.json*', (r) => r.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(MOCK),
  }));
  await page.route('https://api.github.com/**', (r) => {
    if (r.request().method() === 'GET') {
      return r.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ content: Buffer.from(JSON.stringify(MOCK), 'utf8').toString('base64'), sha: 'sha-data' }) });
    }
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: { sha: 'newsha' } }) });
  });
  await page.goto(BASE + 'watch.html', { waitUntil: 'load' });
  await page.waitForSelector('#w-grid .poster', { timeout: 10000 });
  await page.waitForTimeout(350);
  return { ctx, page, errs };
}

const addOpen = (page) => page.evaluate(() => {
  const d = document.getElementById('w-add');
  return { open: !!(d && d.hasAttribute('open')), title: ((document.getElementById('w-add-title') || {}).textContent || '').trim() };
});

console.log('\n== B 运行时（真实点击 / 键盘）==');
{
  const { ctx, page, errs } = await newPage();

  /* B1 点海报图 —— 最常见的手滑入口，必须点不开 */
  const before = await addOpen(page);
  await page.click('#w-grid .poster .poster-pic img');
  await page.waitForTimeout(400);
  const afterPic = await addOpen(page);
  ok('B1 网格视图点击海报图：不打开编辑弹窗',
    !before.open && !afterPic.open, `before=${before.open} after=${afterPic.open}`);

  /* B2 点片名 / 点卡片空白处 —— 整张卡片都不可点 */
  await page.click('#w-grid .poster .poster-name');
  await page.waitForTimeout(250);
  const afterName = await addOpen(page);
  await page.click('#w-grid .poster .poster-head');
  await page.waitForTimeout(250);
  const afterHead = await addOpen(page);
  ok('B2 网格视图点击片名 / 卡片文字区：仍不打开（整张卡片不可点）',
    !afterName.open && !afterHead.open, `name=${afterName.open} head=${afterHead.open}`);

  /* B3 连续点 4 张不同卡片 —— 没有任何一张会打开 */
  const clicked = await page.evaluate(() => {
    const cs = [...document.querySelectorAll('#w-grid .poster')];
    cs.forEach((c) => c.click());
    return cs.length;
  });
  await page.waitForTimeout(450);
  const afterAll = await addOpen(page);
  ok('B3 依次点击全部 4 张网格卡片：一次都没打开编辑',
    clicked === 4 && !afterAll.open, `点了 ${clicked} 张，open=${afterAll.open}`);

  /* B4 键盘也进不去：卡片不可聚焦、Enter/Space 无响应 */
  const gridKb = await page.evaluate(() => {
    const c = document.querySelector('#w-grid .poster');
    c.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    c.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    return { tabIndex: c.tabIndex, role: c.getAttribute('role'), dataId: c.getAttribute('data-id') };
  });
  await page.waitForTimeout(350);
  const afterKb = await addOpen(page);
  ok('B4 网格卡片键盘 Enter / 空格不打不开，且本身不可聚焦（tabIndex=-1、无 role）',
    gridKb.tabIndex === -1 && !gridKb.role && !gridKb.dataId && !afterKb.open,
    JSON.stringify(gridKb) + ` open=${afterKb.open}`);

  /* B5 切到时间轴：条目必须点得开（对照项，确认绑定没被整体删掉）*/
  await page.click('#w-avatar');
  await page.waitForFunction(() => document.querySelectorAll('#w-tl .tl-item').length > 0, null, { timeout: 20000 });
  await page.waitForTimeout(350);
  const gridHidden = await page.evaluate(() => document.getElementById('w-grid').hidden);
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('#w-tl .tl-item')]
      .find((c) => ((c.querySelector('.tl-name') || {}).textContent || '').trim() === '乙');
    if (el) el.click();
  });
  await page.waitForTimeout(450);
  const tlOpen = await addOpen(page);
  ok('B5 切到时间轴后点击「乙」：打开编辑并预填片名（时间轴是唯一入口）',
    gridHidden === true && tlOpen.open && /乙/.test(tlOpen.title), JSON.stringify(tlOpen));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  /* B6 时间轴条目键盘可达（role=button + tabindex=0），与 B4 形成对照 */
  const tlKb = await page.evaluate(() => {
    const c = [...document.querySelectorAll('#w-tl .tl-item')]
      .find((x) => ((x.querySelector('.tl-name') || {}).textContent || '').trim() === '丙');
    const info = { tabIndex: c.tabIndex, role: c.getAttribute('role'), dataId: c.getAttribute('data-id') };
    c.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    return info;
  });
  await page.waitForTimeout(450);
  const afterTlKb = await addOpen(page);
  ok('B6 时间轴条目：tabIndex=0、role=button、带 data-id，Enter 能打开「丙」',
    tlKb.tabIndex === 0 && tlKb.role === 'button' && !!tlKb.dataId &&
    afterTlKb.open && /丙/.test(afterTlKb.title),
    JSON.stringify(tlKb) + ` open=${afterTlKb.open}`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  /* B7 布局来回切一轮后，绑定范围不能被"扩大"到网格 */
  await page.click('#w-avatar');   // → grid
  await page.waitForFunction(() => document.querySelectorAll('#w-grid .poster').length > 0, null, { timeout: 20000 });
  await page.waitForTimeout(350);
  await page.evaluate(() => { document.querySelectorAll('#w-grid .poster').forEach((c) => c.click()); });
  await page.waitForTimeout(450);
  const afterRound = await addOpen(page);
  ok('B7 网格 → 时间轴 → 网格 往返后，点网格卡片依然不打开（重绘不会误绑）',
    !afterRound.open, `open=${afterRound.open}`);

  ok('B8 全程零 JS 异常', errs.length === 0, errs.slice(0, 2).join(' | '));

  await ctx.close();
}

await browser.close();
console.log(`\n第 79 轮：PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
