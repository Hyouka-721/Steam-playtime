/* 第 91 轮 watch 侧回归：A3 上映日期 / A4 年报 / A5 数据补齐 / A8 兼容双轨分片 / A9 防重复
 *
 * 本套件守五条新契约，并正面验证「30 个既有套件零改动」的关键前提：
 *   A8 首屏虽然优先读分片，但主文件始终是权威对账源 —— 测试注入 MOCK、manifest 缺失、
 *   分片落后时都自动回退整份 watch.json，所以老套件的 page.route 造数链路完全不受影响。
 *
 * ⚠️ watch.json 顶层是 { updated_at, items: [] }，条数一律取 .items.length。
 * ⚠️ page.route 按完整路径匹配，别用会同时罩住 watch.json 与 watch/*.json 的宽泛 glob。
 */
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';

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
const sw = rd('sw.js');
const pkg = JSON.parse(fs.readFileSync(ROOT + 'package.json', 'utf8'));
const addScript = rd('../scripts/watch/watch-add.mjs');
const libScript = rd('../scripts/watch/shard-lib.mjs');
const data = JSON.parse(rd('data/watch.json'));
const N = data.items.length;
const manifest = JSON.parse(rd('data/watch/manifest.json'));
const yearCounts = {};
data.items.forEach((it) => {
  const y = String(it.watched_at || '').slice(0, 4);
  yearCounts[y] = (yearCounts[y] || 0) + 1;
});

let pass = 0, fail = 0;
const ok = (n, c, extra = '') => {
  c ? (pass++, console.log(`PASS ${n}${extra ? '  — ' + extra : ''}`))
    : (fail++, console.log(`FAIL ${n}  — ${extra}`));
};

/* ---------------- A 静态契约 ---------------- */
console.log('== A 静态契约 ==');
ok('A1 版本号 bump：watch.html 引用 watch.css?v=29 / watch.js?v=18',
  /watch\.css\?v=29/.test(html) && /watch\.js\?v=18/.test(html),
  (html.match(/watch\.(css|js)\?v=\d+/g) || []).join(' '));

const relInput = (html.match(/<input[^>]*id="add-release"[^>]*>/) || [''])[0];
ok('A2 A3 表单有 #add-release（date）；A4 有 #w-stats / #w-stats-btn；A9 有片名 datalist',
  /type="date"/.test(relInput) &&
  /id="w-stats"[^>]*hidden/.test(html) &&
  /id="w-stats-btn"[^>]*aria-pressed="false"/.test(html) &&
  /id="w-title-list"/.test(html) && /id="add-title"[^>]*list="w-title-list"/.test(html));

ok('A3 A3 读写闭环：readReleaseField 校验、submitAdd / submitEdit 都落 release_date、releaseText 优先读它',
  /function readReleaseField\(\)/.test(js) &&
  /if \(releaseRead\.v\) item\.release_date = releaseRead\.v/.test(js) &&
  /if \(releaseRead\.v\) next\.release_date = releaseRead\.v/.test(js) &&
  /setField\('add-release'/.test(js) &&
  /if \(it\.release_date\) return String\(it\.release_date\)/.test(js) &&
  /'add-release'/.test(js));

ok('A4 A3 命令行：--release 参数、格式校验、写字段、写盘后重建分片',
  /--release <日期>/.test(addScript) && /--release 需要完整日期/.test(addScript) &&
  /release_date: releaseDate/.test(addScript) && /rebuildShards\(data\)/.test(addScript));

ok('A5 A4 年报是独立第三态：不改 layout 两态，paint() 里 statsOn 单独管三个容器',
  /var statsOn = false/.test(js) && /var statsYear = ''/.test(js) &&
  /if \(statsOn\) \{ renderStats\(\); return; \}/.test(js) &&
  /gridEl\.hidden = !\(!statsOn && layout === 'grid'/.test(js) &&
  /tlEl\.hidden = !\(!statsOn && layout === 'timeline'/.test(js) &&
  /function renderStats\(\)/.test(js) && /function statYears\(\)/.test(js));

ok('A6 A4 年报全部由 ALL 派生，不新增数据字段、不发额外请求',
  /function statsScope\(\)/.test(js) && /var base = visible\(\)/.test(js) &&
  !/fetch\(/.test(js.slice(js.indexOf('function renderStats('), js.indexOf('function normTitle('))));

ok('A7 A8 共享库与前端 buildShards 契约一致（version / source / 降序 / 文件名 / 总数）',
  /version: SHARD_VERSION/.test(libScript) && /source: 'watch\.json'/.test(libScript) &&
  /Object\.keys\(by\)\.sort\(\)\.reverse\(\)/.test(libScript) &&
  /version: 1, source: 'watch\.json'/.test(js) &&
  /function maybeSyncShards\(/.test(js) && /shardsSyncEnabled\(\)/.test(js));

ok('A8 A8 首屏对账 + SW 只缓存主文件（分片落后 / 拿不到时回退整份，离线可用）',
  /function loadData\(\)/.test(js) && /function readMaster\(\)/.test(js) &&
  /mf\.updated_at !== master\.updated_at \|\| mf\.total !== master\.items\.length/.test(js) &&
  /console\.warn\('\[watch\] 回退整份主文件：'/.test(js) &&
  /var DATA_CACHE = 'watch-data-v1'/.test(sw) && /var DATA_RE = /.test(sw) &&
  !/SHARD_RE/.test(sw));

ok('A9 A8 命令入口与单测已接进 package.json',
  !!pkg.scripts.shard && !!pkg.scripts['shard:check'] &&
  /watch-shard\.test\.mjs/.test(pkg.scripts.test) &&
  fs.existsSync(ROOT + 'tests/unit/watch-shard.test.mjs'));

ok('A10 A9 防重复是「联想 + 提示 + 两段式确认」，不硬阻止；改片名自动复位',
  /function normTitle\(/.test(js) && /function findDuplicate\(/.test(js) &&
  /function dupBlock\(/.test(js) && /var dupArmed = false/.test(js) &&
  /if \(!dupArmed\) \{/.test(js) && /function syncTitleList\(/.test(js) &&
  /addEventListener\('input'/.test(js) && /重看是允许的/.test(js));

ok('A11 A9 命令行同名只警告不阻断，并提示用 --id 精确覆盖',
  /const dupNames = data\.items\.filter/.test(addScript) && /--id <上面的 id>/.test(addScript) &&
  !/dupNames\.length && die/.test(addScript));

/* ---------------- A5 数据质量 ---------------- */
console.log('== B 数据质量与分片内容 ==');
const noEn = data.items.filter((x) => !x.title_en);
const noTags = data.items.filter((x) => !Array.isArray(x.tags) || !x.tags.length);
ok('B1 A5 title_en / tags 已补齐到全覆盖',
  noEn.length === 0 && noTags.length === 0,
  `noEn=${noEn.length} noTags=${noTags.length}`);
ok('B2 A5 补的标签都在既有 14 词词表内',
  (() => {
    const known = new Set(['剧情', '历史', '战争', '动画', '奇幻', '冒险', '温情',
      '喜剧', '爱情', '灾难', '科幻', '悬疑', '犯罪', '纪录']);
    return data.items.every((x) => (x.tags || []).every((t) => known.has(t)));
  })());
const narrow = data.items.filter((x) => !x.poster_480);
ok('B3 A5 poster_480 的 6 处缺口全是主图 <480 的合法「只缩不放」，没有被硬补',
  narrow.length === 6 && narrow.every((x) => Number(x.poster_w) < 480),
  narrow.map((x) => x.poster_w).join(','));
ok('B4 A5 release_date 没有被凭空编造（A3 只补录入能力）',
  data.items.every((x) => !x.release_date), `有值的条数=${data.items.filter((x) => x.release_date).length}`);
ok('B5 A5/manifest：版本、总数、年份降序、每片条数与主文件逐项吻合',
  manifest.version === 1 && manifest.source === 'watch.json' &&
  manifest.updated_at === data.updated_at && manifest.total === N &&
  manifest.years.length === Object.keys(yearCounts).length &&
  manifest.years.every((y, i) =>
    (i === 0 || manifest.years[i - 1].year > y.year) &&
    y.count === yearCounts[y.year] && y.file === y.year + '.json' &&
    fs.existsSync(DOCS + 'data/watch/' + y.file) &&
    JSON.parse(rd('data/watch/' + y.file)).items.length === y.count),
  `${N} 条 / ${manifest.years.length} 片`);

/* ---------------- C 运行时 ---------------- */
console.log('== C 运行时（1440 桌面） ==');
const browser = await chromium.launch({ headless: true, args: ['--no-proxy-server'] });
const errs = [];
async function newPage(opts = {}) {
  const ctx = await browser.newContext({
    viewport: opts.viewport || { width: 1440, height: 900 },
    serviceWorkers: 'block'
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(String(e)));
  if (opts.token) {
    await page.addInitScript(() => {
      try { localStorage.setItem('watch-gh-token', 'ghp_fake_for_test'); } catch (e) {}
    });
  }
  for (const r of (opts.routes || [])) await page.route(r[0], r[1]);
  return { ctx, page };
}
const MOCK3 = {
  updated_at: '2001-01-01T00:00:00+08:00',
  items: [
    { id: '2026-11-01-m1', title: '模拟片一', kind: 'movie', watched_at: '2026-11-01', rating: 8, poster: '' },
    { id: '2026-11-02-m2', title: '模拟片二', kind: 'movie', watched_at: '2026-11-02', rating: 7, poster: '' },
    { id: '2026-11-03-m3', title: '模拟片三', kind: 'series', watched_at: '2026-11-03', rating: 9, poster: '' }
  ]
};

// C1 默认态：分片可用时页面仍正常出全库卡片
{
  const { ctx, page } = await newPage();
  await page.goto(BASE + 'watch.html', { waitUntil: 'load' });
  await page.waitForSelector('#w-grid .poster', { timeout: 12000 });
  const r = await page.evaluate(() => ({
    n: document.querySelectorAll('#w-grid .poster').length,
    updated: (document.getElementById('w-updated') || {}).textContent || '',
    gridHidden: document.getElementById('w-grid').hidden,
    statsHidden: document.getElementById('w-stats').hidden,
    total: (document.getElementById('w-total') || {}).textContent || '',
    opts: document.querySelectorAll('#w-title-list option').length
  }));
  ok('C1 分片可用时首屏仍是网格 + 全库卡片，页脚时间戳来自主文件',
    r.n === N && !r.gridHidden && r.statsHidden && /2026-11-14/.test(r.updated) &&
    r.total === '共 ' + N + ' 部影视剧', `卡片 ${r.n} / ${r.total} / ${r.updated}`);
  ok('C2 A9 片名联想 datalist 填满且不重复',
    r.opts === N, `${r.opts} 个 option`);

  // C3 正向验证「分片确实被使用」：只篡改一个年片里的片名，主文件与 manifest 不变
  await ctx.close();
}
{
  const tampered = JSON.parse(rd('data/watch/2020.json'));
  tampered.items[0].title = '分片注入探针';
  const { ctx, page } = await newPage({
    routes: [['**/data/watch/2020.json*', (r) => r.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify(tampered)
    })]]
  });
  await page.goto(BASE + 'watch.html', { waitUntil: 'load' });
  await page.waitForSelector('#w-grid .poster', { timeout: 12000 });
  const hit = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#w-grid .poster-name')).some((e) => e.textContent === '分片注入探针'));
  ok('C3 A8 正向：对账通过时渲染走的是分片数据（篡改单个年片可见）', hit);
  await ctx.close();
}

// C4/C5 两条回退路径（正是「老套件零改动」的关键）
{
  const { ctx, page } = await newPage({
    routes: [['**/data/watch.json*', (r) => r.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify(MOCK3)
    })]]
  });
  await page.goto(BASE + 'watch.html', { waitUntil: 'load' });
  await page.waitForSelector('#w-grid .poster', { timeout: 12000 });
  const n = await page.evaluate(() => document.querySelectorAll('#w-grid .poster').length);
  ok('C4 A8 对账：page.route 注入 MOCK 时自动落回主文件（老套件造数链路不受影响）',
    n === 3, `卡片 ${n}`);
  await ctx.close();
}
{
  const { ctx, page } = await newPage({
    routes: [['**/data/watch/manifest.json*', (r) => r.fulfill({ status: 404, body: '' })]]
  });
  await page.goto(BASE + 'watch.html', { waitUntil: 'load' });
  await page.waitForSelector('#w-grid .poster', { timeout: 12000 });
  const n = await page.evaluate(() => document.querySelectorAll('#w-grid .poster').length);
  ok('C5 A8 回退：manifest 缺失时整份主文件顶上', n === N, `卡片 ${n}`);
  await ctx.close();
}

// C6 年报视图
{
  const { ctx, page } = await newPage();
  await page.goto(BASE + 'watch.html', { waitUntil: 'load' });
  await page.waitForSelector('#w-grid .poster', { timeout: 12000 });
  await page.click('#w-stats-btn');
  const r = await page.evaluate(() => ({
    statsHidden: document.getElementById('w-stats').hidden,
    gridHidden: document.getElementById('w-grid').hidden,
    tlHidden: document.getElementById('w-tl').hidden,
    sortHidden: document.getElementById('w-sort').hidden,
    pressed: document.getElementById('w-stats-btn').getAttribute('aria-pressed'),
    btnText: document.getElementById('w-stats-btn').textContent.trim(),
    cards: document.querySelectorAll('.st-card').length,
    v0: (document.querySelector('.st-card .st-v') || {}).textContent || '',
    bars: document.querySelectorAll('.st-bar').length,
    rows: document.querySelectorAll('.st-row').length,
    chips: document.querySelectorAll('.st-chip').length,
    top: document.querySelectorAll('.st-top-item').length,
    years: document.querySelectorAll('#st-year option').length,
    title: (document.querySelector('.st-title') || {}).textContent || ''
  }));
  ok('C6 A4 年报展开：三个容器状态正确、按钮 aria-pressed 与文案同步',
    !r.statsHidden && r.gridHidden && r.tlHidden && r.sortHidden &&
    r.pressed === 'true' && r.btnText === '返回列表');
  ok('C7 A4 内容齐备：4 卡 / 12 月柱 / 8 横行 / 标签 / Top5 / 10 个年份选项',
    r.cards === 4 && r.bars === 12 && r.rows === 8 && r.chips > 0 && r.chips <= 8 &&
    r.top === 5 && r.years === 10 && r.v0 === String(N) && /全部年份/.test(r.title),
    `cards=${r.cards} bars=${r.bars} rows=${r.rows} chips=${r.chips} top=${r.top} years=${r.years} 总数=${r.v0}`);

  await page.selectOption('#st-year', '2020');
  const r2 = await page.evaluate(() => ({
    v0: (document.querySelector('.st-card .st-v') || {}).textContent || '',
    title: (document.querySelector('.st-title') || {}).textContent || ''
  }));
  ok('C8 A4 年份下拉按派生数据切换：2020 年 = 主文件里该年的真实条数',
    r2.v0 === String(yearCounts['2020']) && /2020/.test(r2.title),
    `2020=${r2.v0} / 应=${yearCounts['2020']}`);

  await page.selectOption('#st-year', '');
  await page.click('#w-stats-btn');
  const back = await page.evaluate(() => ({
    statsHidden: document.getElementById('w-stats').hidden,
    gridHidden: document.getElementById('w-grid').hidden,
    n: document.querySelectorAll('#w-grid .poster').length,
    pressed: document.getElementById('w-stats-btn').getAttribute('aria-pressed')
  }));
  ok('C9 A4 再点返回列表：完全还原网格、卡片数与 aria-pressed 都对',
    back.statsHidden && !back.gridHidden && back.n === N && back.pressed === 'false');
  await ctx.close();
}

// C10 A3 编辑模式预填 release_date + 时间轴优先显示完整上映日期
{
  const withRelease = {
    updated_at: '2001-01-01T00:00:00+08:00',
    items: [{
      id: '2026-11-01-rel', title: '上映日期探针', title_en: 'Release Probe',
      kind: 'movie', watched_at: '2026-11-01', year: 2019,
      release_date: '2019-07-20', rating: 8, poster: '', note: 'x'
    }]
  };
  const { ctx, page } = await newPage({
    routes: [['**/data/watch.json*', (r) => r.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify(withRelease)
    })]]
  });
  await page.goto(BASE + 'watch.html', { waitUntil: 'load' });
  await page.waitForSelector('#w-grid .poster', { timeout: 12000 });
  await page.click('#w-avatar');                       // 切到时间轴
  await page.waitForSelector('#w-tl .tl-item', { timeout: 8000 });
  const yearText = await page.evaluate(() =>
    ((document.querySelector('#w-tl .tl-year') || {}).textContent || '').trim());
  await page.click('#w-tl .tl-item');
  const v = await page.evaluate(() => ({
    release: (document.getElementById('add-release') || {}).value || '',
    type: (document.getElementById('add-release') || {}).type || ''
  }));
  ok('C10 A3 releaseText 优先读完整上映日期，编辑弹窗预填同一个值',
    yearText === '2019-07-20' && v.release === '2019-07-20' && v.type === 'date',
    `tl-year=${yearText} form=${v.release}`);
  await ctx.close();
}

// C11 A9 防重复两段式
{
  const calls = [];
  const { ctx, page } = await newPage({
    token: true,
    routes: [['https://api.github.com/**', (r) => {
      calls.push({ method: r.request().method(), url: r.request().url() });
      return r.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ content: 'e30=', sha: 'sha-x' }) });
    }]]
  });
  await page.goto(BASE + 'watch.html', { waitUntil: 'load' });
  await page.waitForSelector('#w-grid .poster', { timeout: 12000 });
  await page.click('#w-fab');
  await page.fill('#add-title', '阿甘正传');
  await page.click('#w-add-submit');
  const r1 = await page.evaluate(() => ({
    msg: (document.getElementById('w-add-msg') || {}).textContent || '',
    btn: (document.getElementById('w-add-submit') || {}).textContent || '',
    open: document.getElementById('w-add').hasAttribute('open')
  }));
  ok('C11 A9 第一次提交被重名拦下：提示含已有记录 + 观影日期，按钮变「确认重复添加」，0 次 API 调用',
    /库里已有记录/.test(r1.msg) && /阿甘正传/.test(r1.msg) && /观影于/.test(r1.msg) &&
    r1.btn.trim() === '确认重复添加' && r1.open && calls.length === 0,
    `api=${calls.length} btn=${r1.btn.trim()}`);

  await page.fill('#add-title', '完全不重复的新片名');
  const r2 = await page.evaluate(() => ({
    msg: (document.getElementById('w-add-msg') || {}).textContent || '',
    btn: (document.getElementById('w-add-submit') || {}).textContent || ''
  }));
  ok('C12 A9 片名一改就复位确认态，提示清空',
    r2.msg === '' && r2.btn.trim() === '提交');

  await page.fill('#add-title', '狂飙');
  await page.click('#w-add-submit');
  const r3 = await page.evaluate(() => ({
    msg: (document.getElementById('w-add-msg') || {}).textContent || '',
    btn: (document.getElementById('w-add-submit') || {}).textContent || ''
  }));
  ok('C13 A9 换成另一部已有片名仍会再次拦下（不是只拦第一次）',
    /狂飙/.test(r3.msg) && r3.btn.trim() === '确认重复添加' && calls.length === 0);
  await ctx.close();
}

// C14 A8 生产同步链路（?syncshards=1 显式开启）
{
  const puts = [];
  const masterB64 = Buffer.from(rd('data/watch.json'), 'utf8').toString('base64');
  const { ctx, page } = await newPage({
    token: true,
    routes: [['https://api.github.com/**', (r) => {
      const req = r.request();
      if (req.method() === 'PUT') puts.push(req.url());
      return r.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ content: masterB64, sha: 'sha-x' }) });
    }]]
  });
  await page.goto(BASE + 'watch.html?syncshards=1', { waitUntil: 'load' });
  await page.waitForSelector('#w-grid .poster', { timeout: 12000 });
  await page.click('#w-fab');
  await page.fill('#add-title', '第91轮分片同步探针');
  await page.fill('#add-watched', '2026-11-14');
  await page.fill('#add-rating', '8');
  await page.click('#w-add-submit');
  await page.waitForFunction(() => {
    const t = document.getElementById('w-toast');
    return t && !t.hidden && /已提交/.test(t.textContent || '');
  }, null, { timeout: 20000 }).catch(() => {});
  const has = (s) => puts.some((u) => u.includes(s));
  // 分片同步是后台 fire-and-forget（失败不该拖累主流程），toast 出现时 manifest
  // 可能还在飞 —— 最多再等 8 秒，别用「toast 一出现就断言」造成假红
  for (let i = 0; i < 40 && !has('/contents/docs/data/watch/manifest.json'); i++) {
    await page.waitForTimeout(200);
  }
  ok('C14 A8 录入后同步链路完整：主文件 + 目标年份分片 + manifest 都写了回仓库',
    has('/contents/docs/data/watch.json') &&
    has('/contents/docs/data/watch/2026.json') &&
    has('/contents/docs/data/watch/manifest.json'),
    `PUT ${puts.length} 次`);
  await ctx.close();
}

/* ---------------- D 窄屏 ---------------- */
console.log('== D 390 窄屏 ==');
{
  const { ctx, page } = await newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(BASE + 'watch.html', { waitUntil: 'load' });
  await page.waitForSelector('#w-grid .poster', { timeout: 12000 });
  const gridOverflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - window.innerWidth);
  await page.click('#w-stats-btn');
  const r = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - window.innerWidth,
    cols: getComputedStyle(document.querySelector('.st-cards')).gridTemplateColumns.split(' ').length,
    seg: (() => { const b = document.querySelector('.w-seg').getBoundingClientRect(); return { l: b.left, r: b.right }; })(),
    sort: (() => { const b = document.querySelector('.w-sort').getBoundingClientRect(); return { l: b.left, r: b.right }; })(),
    vw: window.innerWidth
  }));
  ok('D1 A4 窄屏年报无横向溢出，卡片收成 2 列，两组控件都不越界',
    gridOverflow <= 0 && r.overflow <= 0 && r.cols === 2 &&
    r.seg.l >= -1 && r.seg.r <= r.vw + 1 && r.sort.l >= -1 && r.sort.r <= r.vw + 1,
    `grid=${gridOverflow} stats=${r.overflow} cols=${r.cols}`);
  await ctx.close();
}

ok('D2 全程零 JS 异常', errs.length === 0, errs.slice(0, 3).join(' | '));
await browser.close();

console.log(`\n===== 第 91 轮 watch（A3/A4/A5/A8/A9）：${pass} PASS / ${fail} FAIL =====`);
if (fail) process.exit(1);
