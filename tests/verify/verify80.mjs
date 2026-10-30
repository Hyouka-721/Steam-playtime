/* 第 80 轮回归：A2 胶片颗粒+放映机光晕 / A3 时间轴 hover 统一 / A4 次要文字提亮 /
   P2 标签 chip 筛选 / P6 网页端删除 / P7 SW 缓存 watch.json
   ⚠️ A1「评分 → 海报描边三档」已被用户回退，本套件不再覆盖它。

   断言分组：
   A 静态指纹（9）：CSS 规则、HTML 结构、JS 函数、sw.js 策略顺序
   C 标签筛选（9）：chip 生成 / 点选 / 取消 / 叠加 / 空态 / 时间轴 / 脏数据归一
   D 删除（7）：只在编辑模式出现、两段确认、无 Token 零请求、有 Token 一次 PUT 且数据真的少了、
      390px 页脚不把提示压成一字一行
   E 实体数据（2）：全部条目有标签、词表符合约定
   ⚠️ 版本号：watch.css?v=18 / watch.js?v=13（第 80 轮 bump）
   ⚠️ 所有 mock 上下文都带 serviceWorkers:'block' —— 第 80 轮起 SW 也拦 watch.json
      （网络优先），屏蔽 SW 才能保证 page.route 造数绝对生效。 */
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

const html = rd('watch.html'), css = rd('watch.css'), js = rd('watch.js'), sw = rd('sw.js');
const cssNC = stripCmt(css), jsNC = stripCmt(js), swNC = stripCmt(sw);
const P = 'img/minion-0ef9a202.webp';

/* ================= A 静态指纹 ================= */
console.log('== A 静态指纹 ==');
ok('A1 版本号 bump：watch.css?v=18 / watch.js?v=13',
  /watch\.css\?v=18"/.test(html) && /watch\.js\?v=13"/.test(html));

ok('A2 胶片颗粒：body::before 两层点阵 + pointer-events:none（不挡点击）',
  /body::before \{[\s\S]{0,420}pointer-events: none/.test(cssNC) &&
  /body::before \{[\s\S]{0,640}background-size: 3px 3px, 5px 5px/.test(cssNC));

ok('A3 顶部放映机光晕：--bg-glow 首层收窄成 560×152 的暖光束',
  /--bg-glow: radial-gradient\(560px 152px at 50% -34px/.test(cssNC));

ok('A4 时间轴 hover 与网格统一：位移 + 金线 + 缩略图放大',
  /\.tl-item:hover \{[^}]*transform: translateX\(3px\)/.test(cssNC) &&
  /\.tl-item:hover::after \{[^}]*opacity: \.85/.test(cssNC) &&
  /\.tl-item:hover \.tl-thumb img \{ transform: scale\(1\.04\); \}/.test(cssNC));

ok('A5 次要文字提亮：--text-dim 已是 #9696a6，旧值 #82828f 不再出现',
  /--text-dim: #9696a6;/.test(cssNC) && !/#82828f/.test(cssNC));

ok('A6 P2 标签 chip：HTML 有容器、JS 有聚合与筛选四件套',
  /<div class="w-tags" id="w-tags"/.test(html) &&
  /function tagList\(it\)/.test(jsNC) && /function allTags\(\)/.test(jsNC) &&
  /function renderTags\(\)/.test(jsNC) && /function setTag\(next\)/.test(jsNC) &&
  /tagList\(it\)\.indexOf\(tagFilter\) >= 0/.test(jsNC));

ok('A7 P6 删除：按钮在表单页脚、两段式确认、走 PUT 覆盖 JSON（不删图片）',
  /id="w-add-delete"/.test(html) &&
  /var DELETE_ARMED = '确认删除？';/.test(jsNC) &&
  /function submitDelete\(id\)/.test(jsNC) &&
  /data\(watch\): 删除《/.test(jsNC) &&
  /deleteBtn\.hidden = true/.test(jsNC) && /deleteBtn\.hidden = false/.test(jsNC));

ok('A8 P7 SW 缓存数据：独立缓存名 + 网络优先（先 fetch，失败才读缓存）',
  /var DATA_CACHE = 'watch-data-v1';/.test(swNC) &&
  /var DATA_RE = \/\\\/data\\\/watch\\\.json\$\/;/.test(swNC) &&
  (() => {
    const a = swNC.indexOf('if (DATA_RE.test(url.pathname))');
    const b = swNC.indexOf('if (!IMMUTABLE_RE.test(url.pathname))');
    const seg = swNC.slice(a, b);
    const iFetch = seg.indexOf('fetch(req)');
    const iCatch = seg.indexOf('.catch(function ()');
    const iMatch = seg.indexOf('c.match(req)');
    return a > 0 && b > a && iFetch >= 0 && iCatch > iFetch && iMatch > iCatch;
  })(), '网络优先：fetch → catch → cache.match');

ok('A9 P7 activate 保留两个缓存（否则每次发布都把数据缓存清掉）',
  /\(k === CACHE \|\| k === DATA_CACHE\) \? null : caches\.delete\(k\)/.test(swNC));

/* ================= mock 数据 ================= */
const MOCK = {
  updated_at: '2026-10-31T10:00:00+08:00',
  items: [
    { id: '2026-10-10-a', title: '九点九', kind: 'movie', watched_at: '2026-10-10', rating: 9.9, order: 1, poster: P, tags: ['科幻', '剧情'], note: '甲' },
    { id: '2026-10-09-b', title: '八点五', kind: 'movie', watched_at: '2026-10-09', rating: 8.5, order: 2, poster: P, tags: ['科幻'], note: '乙' },
    { id: '2026-10-08-c', title: '七点五', kind: 'anime', watched_at: '2026-10-08', rating: 7.5, order: 3, poster: P, tags: ['动画', '喜剧'], note: '丙' },
    // 脏写法：一个字符串里塞三个标签（历史数据里真的存在）
    { id: '2026-10-07-d', title: '五点零', kind: 'movie', watched_at: '2026-10-07', rating: 5, order: 4, poster: P, tags: ['剧情，历史，战争'], note: '丁' },
    { id: '2026-10-06-e', title: '无标签', kind: 'series', watched_at: '2026-10-06', rating: 8, order: 5, poster: P, note: '戊' },
  ],
};

const browser = await chromium.launch({ args: ['--no-proxy-server'] });

async function newPage(opts = {}) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    serviceWorkers: 'block',      // 见文件头：屏蔽 SW，保证 page.route 造数生效
  });
  const page = await ctx.newPage();
  const calls = [];
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  if (opts.token !== false) {
    await page.addInitScript(() => { try { localStorage.setItem('watch-gh-token', 'ghp_fake_for_test'); } catch (e) {} });
  }
  await page.route('**/data/watch.json*', (r) => r.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(opts.data || MOCK),
  }));
  await page.route('https://api.github.com/**', async (r) => {
    const req = r.request(), method = req.method();
    let body = null;
    try { body = req.postDataJSON(); } catch (e) {}
    calls.push({ method, url: req.url(), body });
    if (method === 'GET') {
      const b64 = Buffer.from(JSON.stringify(opts.data || MOCK), 'utf8').toString('base64');
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: b64, sha: 'sha-data' }) });
    }
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: { sha: 'newsha' } }) });
  });
  await page.goto(BASE + 'watch.html', { waitUntil: 'load' });
  await page.waitForSelector('#w-grid .poster', { timeout: 10000 });
  await page.waitForTimeout(450);
  return { ctx, page, calls, errs };
}

async function gridNames(page) {
  return page.$$eval('#w-grid .poster .poster-name', (els) => els.map((e) => e.textContent.trim()));
}
async function toTimeline(page) {
  await page.click('#w-avatar');
  await page.waitForFunction(() => document.querySelectorAll('#w-tl .tl-item').length > 0, null, { timeout: 20000 });
  await page.waitForTimeout(350);
}
async function toGrid(page) {
  await page.click('#w-avatar');
  await page.waitForFunction(() => document.querySelectorAll('#w-grid .poster').length > 0, null, { timeout: 20000 });
  await page.waitForTimeout(350);
}
async function clickChip(page, tag) {
  await page.evaluate((t) => {
    const el = [...document.querySelectorAll('#w-tags .w-tag')].find((b) => b.getAttribute('data-tag') === t);
    if (el) el.click();
  }, tag);
  await page.waitForTimeout(350);
}

/* ================= C 标签 chip ================= */
console.log('\n== C 标签 chip 筛选（P2）==');
{
  const { ctx, page, errs } = await newPage();

  const chips = await page.$$eval('#w-tags .w-tag', (els) =>
    els.map((e) => ({ t: e.getAttribute('data-tag'), on: e.getAttribute('aria-pressed') })));
  const names = chips.map((c) => c.t);
  const expectSet = ['科幻', '剧情', '动画', '喜剧', '历史', '战争'];
  ok('C1 chip 行 = 数据里出现过的 6 个标签，且「出现 2 次」的排在前面',
    names.length === 6 && expectSet.every((t) => names.indexOf(t) >= 0) &&
    ['科幻', '剧情'].indexOf(names[0]) >= 0 && ['科幻', '剧情'].indexOf(names[1]) >= 0,
    names.join(' / '));

  const before = await gridNames(page);
  ok('C2 默认（无标签筛选）顺序 = 评分倒序（9.9 / 8.5 / 8.0 / 7.5 / 5.0）',
    JSON.stringify(before) === JSON.stringify(['九点九', '八点五', '无标签', '七点五', '五点零']),
    before.join(' > '));

  await clickChip(page, '科幻');
  const afterClick = await gridNames(page);
  const onState = await page.evaluate(() => {
    const b = [...document.querySelectorAll('#w-tags .w-tag')].find((x) => x.getAttribute('data-tag') === '科幻');
    return { on: b.getAttribute('aria-pressed'), cls: b.className };
  });
  ok('C3 点「科幻」：只剩 2 部，chip 变选中态（is-on + aria-pressed=true）',
    JSON.stringify(afterClick) === JSON.stringify(['九点九', '八点五']) &&
    onState.on === 'true' && /is-on/.test(onState.cls),
    `${afterClick.join('、')}｜${onState.on}`);

  await clickChip(page, '科幻');
  const afterOff = await gridNames(page);
  const offState = await page.evaluate(() => {
    const b = [...document.querySelectorAll('#w-tags .w-tag')].find((x) => x.getAttribute('data-tag') === '科幻');
    return b.getAttribute('aria-pressed');
  });
  ok('C4 再点同一枚 = 取消筛选，回到 5 部且 aria-pressed=false',
    afterOff.length === 5 && offState === 'false', `${afterOff.length} 部`);

  await page.click('.w-seg-btn[data-kind="anime"]');
  await page.waitForTimeout(300);
  await clickChip(page, '动画');
  const combo = await gridNames(page);
  ok('C5 与类型筛选叠加：番剧 + 标签「动画」→ 只剩 1 部（七点五）',
    JSON.stringify(combo) === JSON.stringify(['七点五']), combo.join('、'));

  await clickChip(page, '科幻');
  const none = await page.evaluate(() => ({
    posters: document.querySelectorAll('#w-grid .poster').length,
    note: ((document.querySelector('#w-grid .w-none') || {}).textContent || '').trim(),
  }));
  ok('C6 组合筛不出结果时给一句话，不留白屏（.w-none + 0 张卡片）',
    none.posters === 0 && /没有符合条件的作品/.test(none.note), `${none.posters} 张｜${none.note.slice(0, 20)}`);

  /* 脏数据归一：'五点零' 的标签是一个合串 "剧情，历史，战争" → 应能被单独筛出来 */
  await page.click('.w-seg-btn[data-kind="all"]');
  await page.waitForTimeout(250);
  await clickChip(page, '科幻');   // 先取消（当前是选中态）
  await clickChip(page, '历史');
  const dirty = await gridNames(page);
  ok('C7 脏写法归一：「剧情，历史，战争」被拆成 3 个标签，点「历史」能筛出它',
    JSON.stringify(dirty) === JSON.stringify(['五点零']), dirty.join('、'));

  await toTimeline(page);
  await clickChip(page, '战争');
  const tlN = await page.evaluate(() => ({
    n: document.querySelectorAll('#w-tl .tl-item').length,
    names: [...document.querySelectorAll('#w-tl .tl-item .tl-name')].map((e) => e.textContent.trim()),
  }));
  ok('C8 时间轴视图下标签筛选同样生效（只剩 1 条）',
    tlN.n === 1 && tlN.names[0] === '五点零', `${tlN.n} 条｜${tlN.names.join('、')}`);

  ok('C9 全程零 JS 异常', errs.length === 0, errs.slice(0, 2).join(' | '));
  await ctx.close();
}

/* ================= D 删除 ================= */
console.log('\n== 网页端删除（P6）==');
{
  const { ctx, page, calls } = await newPage();
  const putCount = () => calls.filter((c) => c.method === 'PUT').length;

  await page.click('#w-fab');
  await page.waitForTimeout(350);
  const inAdd = await page.evaluate(() => {
    const b = document.getElementById('w-add-delete');
    return { hidden: b.hidden, label: b.textContent.trim() };
  });
  ok('D1 新增模式：删除按钮隐藏（不会误删到刚录的片子）',
    inAdd.hidden === true, JSON.stringify(inAdd));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  await toTimeline(page);
  await page.evaluate(() => { document.querySelector('#w-tl .tl-item').click(); });
  await page.waitForTimeout(450);
  const inEdit = await page.evaluate(() => {
    const b = document.getElementById('w-add-delete');
    return { hidden: b.hidden, label: b.textContent.trim() };
  });
  ok('D2 编辑模式：按钮出现，文案「删除这条」',
    inEdit.hidden === false && inEdit.label === '删除这条', JSON.stringify(inEdit));

  await page.click('#w-add-delete');
  await page.waitForTimeout(300);
  const armed = await page.evaluate(() => {
    const b = document.getElementById('w-add-delete');
    return {
      label: b.textContent.trim(),
      cls: b.className,
      msg: ((document.getElementById('w-add-msg') || {}).textContent || '').trim(),
    };
  });
  ok('D3 第一次点击只「举手」：变「确认删除？」+ 提示 + 零请求',
    armed.label === '确认删除？' && /is-armed/.test(armed.cls) &&
    /再点一次确认删除/.test(armed.msg) && putCount() === 0,
    `${armed.label}｜PUT ${putCount()} 次`);
  await page.keyboard.press('Escape').catch(() => {});
  await ctx.close();
}

{
  /* 无 Token：两下点完也必须 0 请求（安全边界） */
  const { ctx, page, calls } = await newPage({ token: false });
  await toTimeline(page);
  await page.evaluate(() => { document.querySelector('#w-tl .tl-item').click(); });
  await page.waitForTimeout(450);
  await page.click('#w-add-delete');
  await page.waitForTimeout(200);
  await page.click('#w-add-delete');
  await page.waitForTimeout(500);
  const r = await page.evaluate(() => ({
    msg: ((document.getElementById('w-add-msg') || {}).textContent || '').trim(),
    open: document.getElementById('w-add').hasAttribute('open'),
    posters: document.querySelectorAll('#w-grid .poster').length,
  }));
  const total = calls.length;
  ok('D4 无 Token 时点两下：提示去填 Token + 一个请求都不发（api 调用 0 次）',
    /Token/.test(r.msg) && total === 0 && r.open === true, `msg=${JSON.stringify(r.msg.slice(0, 24))}｜api ${total} 次`);
  await ctx.close();
}

{
  /* 有 Token：两下点完 → 恰 1 次 PUT，写回的 JSON 少一条，网格同步 */
  const { ctx, page, calls } = await newPage();
  await toTimeline(page);
  const target = await page.evaluate(() => {
    const el = [...document.querySelectorAll('#w-tl .tl-item')]
      .find((x) => ((x.querySelector('.tl-name') || {}).textContent || '').trim() === '七点五');
    const t = ((el.querySelector('.tl-name') || {}).textContent || '').trim();
    el.click();
    return t;
  });
  await page.waitForTimeout(450);
  await page.click('#w-add-delete');
  await page.waitForTimeout(200);
  await page.click('#w-add-delete');
  await page.waitForTimeout(1200);

  const puts = calls.filter((c) => c.method === 'PUT');
  let saved = null;
  if (puts.length && puts[puts.length - 1].body && puts[puts.length - 1].body.content) {
    saved = JSON.parse(Buffer.from(puts[puts.length - 1].body.content, 'base64').toString('utf8'));
  }
  const after = await page.evaluate(() => ({
    open: document.getElementById('w-add').hasAttribute('open'),
    tl: document.querySelectorAll('#w-tl .tl-item').length,
    toast: ((document.getElementById('w-toast') || {}).textContent || '').trim(),
  }));
  ok(`D5 有 Token 删「${target}」：恰 1 次 PUT，写回 JSON 只剩 4 条且该条已消失`,
    puts.length === 1 && !!saved && saved.items.length === 4 &&
    !saved.items.some((x) => x.title === target) &&
    /删除/.test(String(puts[0].body.message || '')),
    `PUT ${puts.length} 次｜剩 ${saved ? saved.items.length : '?'} 条｜${puts.length ? puts[0].body.message : ''}`);

  /* 当前是时间轴视图：删除后只重绘时间轴，网格元素只是 hidden（旧 HTML 还在）——
     所以先数时间轴条目，再切回网格数卡片，两个视图都必须同步到 4 */
  const tlAfter = after.tl;
  await toGrid(page);
  const postersAfter = await page.evaluate(() => document.querySelectorAll('#w-grid .poster').length);
  ok('D6 删除后弹窗关闭、时间轴与网格都同步剩 4、toast 提示已删除',
    after.open === false && tlAfter === 4 && postersAfter === 4 && /已删除/.test(after.toast),
    `open=${after.open}｜tl=${tlAfter}｜posters=${postersAfter}｜${after.toast.slice(0, 20)}`);
  await ctx.close();
}

{
  /* 窄屏：页脚要装「提示 + 删除 + 取消 + 保存」四件，提示曾被 flex 压成一字一行（竖排），
     把弹窗顶得老高。这里锁死「提示横排 + 三枚按钮同一行 + 都在视口内」。 */
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
    serviceWorkers: 'block', isMobile: true, hasTouch: true,
  });
  const page = await ctx.newPage();
  await page.route('**/data/watch.json*', (r) => r.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(MOCK),
  }));
  await page.goto(BASE + 'watch.html', { waitUntil: 'load' });
  await page.waitForSelector('#w-grid .poster', { timeout: 10000 });
  await page.click('#w-avatar');
  await page.waitForSelector('#w-tl .tl-item', { timeout: 10000 });
  await page.evaluate(() => document.querySelector('#w-tl .tl-item').click());
  await page.waitForTimeout(600);
  await page.click('#w-add-delete');
  await page.waitForTimeout(300);
  const m = await page.evaluate(() => {
    const msg = document.getElementById('w-add-msg');
    const del = document.getElementById('w-add-delete');
    const canc = document.getElementById('w-add-cancel');
    const acts = del.parentElement;   // 删除按钮就在 .w-add-actions 里
    const mr = msg.getBoundingClientRect(), dr = del.getBoundingClientRect();
    const cr = canc.getBoundingClientRect(), ar = acts.getBoundingClientRect();
    // 删除 vs 取消 必须同一行且不互相压住（父子关系的不算）
    const overlap = !(dr.right <= cr.left || cr.right <= dr.left || dr.bottom <= cr.top || cr.bottom <= dr.top);
    return {
      msgW: Math.round(mr.width), msgH: Math.round(mr.height),
      inView: dr.right <= innerWidth + 1 && ar.right <= innerWidth + 1 && dr.left >= -1,
      overlap,
    };
  });
  ok('D7 390px：删除提示横排（不再一字一行）、三枚按钮同一行且都在视口内',
    m.msgW > 200 && m.msgH < 70 && m.inView && !m.overlap,
    `提示 ${m.msgW}×${m.msgH}｜在视口=${m.inView}｜重叠=${m.overlap}`);
  await ctx.close();
}

/* ================= E 实体数据 ================= */
console.log('\n== 实体数据（P2 前提）==');
{
  const data = JSON.parse(rd('data/watch.json'));
  const N = data.items.length;
  const noTag = data.items.filter((x) => !Array.isArray(x.tags) || !x.tags.length);
  ok(`E1 本地 ${N} 条全部有非空 tags 数组（一条不落，chip 才有意义）`,
    N > 0 && noTag.length === 0, noTag.map((x) => x.title).slice(0, 5).join('、'));

  /* 13 个预设词 + 「灾难」（用户在网页端自己加的，2026-10-30 合并远端时保留，不要静默丢掉用户的输入） */
  const ALLOW = ['剧情', '爱情', '犯罪', '悬疑', '科幻', '奇幻', '动画', '历史', '战争', '温情', '喜剧', '冒险', '纪录', '灾难'];
  const used = new Set();
  let bad = [];
  data.items.forEach((x) => (x.tags || []).forEach((t) => {
    used.add(t);
    if (ALLOW.indexOf(t) < 0) bad.push(x.title + ':' + t);
  }));
  const nanjing = data.items.find((x) => x.title === '南京照相馆');
  ok(`E2 词表收敛为 ${ALLOW.length} 个预设值、无越界词；南京照相馆的合串已拆成 3 个`,
    bad.length === 0 && used.size === ALLOW.length && ALLOW.every((t) => used.has(t)) &&
    !!nanjing && Array.isArray(nanjing.tags) && nanjing.tags.length === 3,
    `实有 ${used.size} 个：${[...used].join('/')}${bad.length ? '｜越界 ' + bad.join(',') : ''}`);
}

await browser.close();
console.log(`\n第 80 轮：PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
