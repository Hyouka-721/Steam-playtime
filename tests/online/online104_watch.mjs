/* 第 104 轮 watch 侧上线复验：年报「年度影视」下方新增「年度歌单」（封面 / 歌曲名称 / 歌手）
 *
 * 用户原话：「为年度报告的年度影视栏目下面添加一个年度歌单的功能，涵盖歌曲的封面、
 * 歌曲名称、歌手，稍后我会录入每年的10首歌曲」；随后录入 2018~2025 共 8 年 80 首，
 * 并分 7 批定夺歌手 / 改名 / 重排 / 补录 4 批封面，第 4 批确认 4 个待确认歌名
 * 「都采用现有的」，第 6 批用户拍板「to/To 采用 to」并补录第三批封面，
 * 第 7 批重排 2023 / 2022 / 2018、两处替换为「铃芽」、「未料的密谋」去英文副名，
 * 并补 2026 年 10 首 → 共 9 年 90 首 / 90 张封面。
 * 🔴 第 6 批改判：封面数不再写死 39，一律由本地 songs.json 现算 withCover
 *    （第 3 / 5 / 6 / 7 批分别是 39 → 60 → 79 → 90 条，判据随事实更新，不调阈值）。
 * 🔴 第 7 批改判：A8 的「8 组」也改成由本地现算 groups.length，B2 / B6 / C1 文案同步；
 *    判据本身不变（组数、每组 10 首、data-count、两列、零溢出），只是不再写死组数。
 *
 * 复验口径：
 *   ① 内容指纹 10 —— HTML 引用 v=43/v=35；css/js/html/songs.json 线上字节 md5 与本地全等
 *      （EOL 归一）；线上 JS 的独立加载 / 归一化 / 年份筛选 / 封面兜底链路；线上 CSS 三档
 *      栅格；线上封面抽查 5 张 + 第 6 批新增 A10 全量唯一封面 URL 复查（200 + 字节一致）
 *   ② 1920 运行时 9 —— 歌单位置、组数 × 10 首 / 年份倒序、三要素逐项、封面按本地现算全加载、
 *      线上 DOM 与本地 songs.json 逐字段全等、下拉筛选、六卡与按钮契约延续、零溢出零异常
 *   ③ 390 运行时 2 —— 两列、全部歌曲都在、零溢出零异常
 *
 * 🔴 第 6 批取证修复：79 张封面同时 eager + fetchPriority=high 会触发 Pages 的 HTTP/2 并发限制
 *    （38 个 net::ERR_HTTP2_PROTOCOL_ERROR、0 个 HTTP>=400、decode 耗时 593s、B4 假红），
 *    但 57 个唯一 URL 逐个 fetch 全部 200 且字节一致。B4 改用 serveLocalCovers 注入与线上
 *    字节相同的本地文件，只验页面渲染 / 兜底链路；素材线上可用性由 A9 + A10 覆盖。判据不降。
 *
 * ⚠️ 线上字节一律在页内 fetch 回传，统一 --no-proxy-server。⚠️ 全程只读，不会产生任何 PUT。
 * ⚠️ 封面是 loading="lazy"，验加载前必须强制 eager + decode，否则视口外的图不算加载完成。
 */
import { createRequire } from 'module';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');
const SITE = process.env.ONLINE_SITE || 'https://hyouka-721.github.io/Steam-playtime/';
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const TS = Date.now();
const rd = (p) => fs.readFileSync(ROOT + 'docs/' + p, 'utf8').replace(/\r\n/g, '\n');
const md5 = (b) => crypto.createHash('md5').update(b).digest('hex');
const norm = (s) => String(s).replace(/\r\n/g, '\n');
const md5txt = (s) => md5(Buffer.from(norm(s), 'utf8'));
const stripJsCmt = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const stripLineCmt = (s) => s.replace(/\/\/[^\n]*/g, '');

const localHtml = rd('watch.html'), localCss = rd('watch.css'), localJs = rd('watch.js');
const localSongs = rd('data/songs.json');
const songs = JSON.parse(localSongs);
const groups = songs.years.filter((g) => /^\d{4}$/.test(String(g.year || '')) && g.songs.length);
const realTotal = groups.reduce((n, g) => n + g.songs.filter((s) => s && String(s.title || '').trim()).length, 0);
const withCover = groups.reduce((n, g) => n + g.songs.filter((s) => s.cover).length, 0);
const coverUrls = [...new Set(groups.flatMap((g) => g.songs.filter((s) => s.cover).map((s) => s.cover)))];

let pass = 0, fail = 0;
const ok = (n, c, extra = '') => {
  c ? (pass++, console.log(`PASS ${n}${extra ? '  — ' + extra : ''}`))
    : (fail++, console.log(`FAIL ${n}  — ${extra}`));
};

const browser = await chromium.launch({ args: ['--no-proxy-server'] });

/* 第 6 批取证修复：把 /img/songs/ 请求用「与线上字节完全相同的本地文件」注入。
 * 目的＝绕开 GitHub Pages 的 HTTP/2 并发限制（79 张大图同时 eager 会 net::ERR_HTTP2_PROTOCOL_ERROR），
 * 只让 B4 专注验证页面渲染 / 封面兜底链路；真实线上素材可用性由 A9 抽查 + A10 全量复查覆盖。 */
const serveLocalCovers = (context) => context.route('**/img/songs/**', async (route) => {
  try {
    const pathname = new URL(route.request().url()).pathname;
    const rel = decodeURIComponent(pathname.split('/img/songs/')[1] || '');
    const body = fs.readFileSync(ROOT + 'docs/img/songs/' + rel);
    await route.fulfill({ status: 200, contentType: /\.webp$/i.test(rel) ? 'image/webp' : 'image/jpeg', body });
  } catch { await route.continue(); }
});

/* ---------------- ① 内容指纹 ---------------- */
console.log('== ① 内容指纹 ==');
const ctx0 = await browser.newContext({ viewport: { width: 1920, height: 1200 }, serviceWorkers: 'block' });
const p0 = await ctx0.newPage();
await p0.goto(SITE + 'watch.html?t=' + TS, { waitUntil: 'load', timeout: 45000 });
await p0.waitForFunction(() => document.querySelectorAll('#w-grid .poster').length > 20, null, { timeout: 45000 }).catch(() => {});

const fetchText = async (u) => p0.evaluate(async (x) => (await fetch(x, { cache: 'reload' })).text(), u);
const html = await fetchText(SITE + 'watch.html?t=' + TS);
const liveCss = await fetchText(SITE + 'watch.css?v=43&t=' + TS);
const liveJs = await fetchText(SITE + 'watch.js?v=35&t=' + TS);
const liveSongs = await fetchText(SITE + 'data/songs.json?t=' + TS);
const liveJsNC = stripLineCmt(stripJsCmt(liveJs));
const htmlNC = html.replace(/<!--[\s\S]*?-->/g, '');
const liveCssNC = stripJsCmt(liveCss);

ok('A1 线上 watch.html 引用 watch.css?v=43 / watch.js?v=35',
  /watch\.css\?v=43/.test(html) && /watch\.js\?v=35/.test(html),
  (html.match(/watch\.(css|js)\?v=\d+/g) || []).join(' '));
ok('A2 线上 watch.css 字节 md5 与本地全等（EOL 归一）', md5txt(liveCss) === md5txt(localCss),
  `${md5txt(liveCss).slice(0, 12)} / ${md5txt(localCss).slice(0, 12)}`);
ok('A3 线上 watch.js 字节 md5 与本地全等（EOL 归一）', md5txt(liveJs) === md5txt(localJs),
  `${md5txt(liveJs).slice(0, 12)} / ${md5txt(localJs).slice(0, 12)}`);
ok('A4 线上 watch.html 字节 md5 与本地全等（EOL 归一）', md5txt(html) === md5txt(localHtml),
  `${md5txt(html).slice(0, 12)} / ${md5txt(localHtml).slice(0, 12)}`);

ok('A5 线上 JS：独立 songs.json 加载链路齐备（no-store + 归一化 + 晚到补重绘 + 伪协议兜底 + 捕获阶段破图委托）',
  /var SONGS_URL = 'data\/songs\.json';/.test(liveJsNC) &&
  /function normalizeSongs\(data\)/.test(liveJsNC) &&
  /function loadSongs\(\)/.test(liveJsNC) &&
  /\{ cache: 'no-store' \}/.test(liveJsNC) &&
  /if \(statsOn\) renderStats\(\);/.test(liveJsNC) &&
  /function songCoverUrl\(u\)/.test(liveJsNC) &&
  /statsEl\.addEventListener\('error'/.test(liveJsNC) &&
  /classList\.contains\('st-song-img'\)/.test(liveJsNC) &&
  /var songGroups = statsYear/.test(liveJsNC));

ok('A6 线上 JS：歌单是「年度影视」之后的独立 section，不挂 .st-panel / data-panel（旧套件靠它遍历统计面板）',
  /class="st-songs" data-songs="annual"/.test(liveJsNC) &&
  !/class="st-panel st-songs"/.test(liveJsNC) && !/data-panel="songs"/.test(liveJsNC) &&
  liveJsNC.indexOf('var songsHtml') > liveJsNC.indexOf('var topHtml') &&
  /\? head \+ cardHtml \+ panels \+ topHtml \+ songsHtml/.test(liveJsNC) &&
  /head \+ '<p class="st-empty st-empty-main">这个范围内还没有观影记录<\/p>' \+ songsHtml;/.test(liveJsNC));

ok('A7 线上 CSS：10 / 5 / 2 列三档齐备、860 与 480 断点各 1 个、音符占位与 1:1 封面在',
  /\.st-song-list \{[^}]*grid-template-columns: repeat\(10, minmax\(0, 1fr\)\)/.test(liveCssNC) &&
  /\.w-stats \.st-song-list \{ grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/.test(liveCssNC) &&
  /\.w-stats \.st-song-list \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/.test(liveCssNC) &&
  (liveCssNC.match(/@media \(max-width: ?860px\)/g) || []).length === 1 &&
  (liveCssNC.match(/@media \(max-width: ?480px\)/g) || []).length === 1 &&
  /\.st-song-cover::before \{ content: "♪"/.test(liveCssNC) &&
  /\.st-song-cover \{[^}]*aspect-ratio: 1 \/ 1;/.test(liveCssNC),
  '860/480 各 1 个');

ok('A8 线上 data/songs.json 字节 md5 与本地全等，组数与每组 10 首由本地现算；第 6 批改判：带封面数由本地 songs.json 现算（第 3/5/6 批 39→60→79，不再写死 39）；第 7 批同样把组数 8 改成现算（新增 2026 年后为 9 组 × 10 首 = 90 条）',
  md5txt(liveSongs) === md5txt(localSongs) &&
  (() => { try { const j = JSON.parse(liveSongs); return j.years.length === groups.length &&
    j.years.every((g) => g.songs.length === 10) &&
    j.years.reduce((n, g) => n + g.songs.filter((s) => s.cover).length, 0) === withCover; } catch { return false; } })(),
  `${md5txt(liveSongs).slice(0, 12)} / ${md5txt(localSongs).slice(0, 12)}`);

const sample = coverUrls.slice(0, 5);
const coverProbe = await p0.evaluate(async (urls) => Promise.all(urls.map(async (u) => {
  try { const r = await fetch(u, { cache: 'reload' }); const b = await r.arrayBuffer(); return { s: r.status, n: b.byteLength }; }
  catch (e) { return { s: 0, n: 0 }; }
})), sample.map((u) => SITE + u + '&t=' + TS));
ok('A9 线上封面素材抽查 5 张：全部 200 且字节数与本地文件一致',
  sample.length === 5 && coverProbe.every((v, i) => v.s === 200 &&
    v.n === fs.statSync(ROOT + 'docs/' + sample[i].split('?')[0]).size),
  coverProbe.map((v) => `${v.s}/${v.n}`).join(' '));

/* A10 第 6 批新增：全量复查线上封面 URL。
 * 🔴 诊断事实：79 张同时 eager + high 会触发 GitHub Pages 的 HTTP/2 并发限制
 *    （38 个 net::ERR_HTTP2_PROTOCOL_ERROR、0 个 HTTP>=400、一次性 decode 593s、B4 假红），
 *    但逐个 fetch 全部 200 且字节一致。B4 因此改用「同源本地字节注入」只验页面渲染/兜底链路，
 *    真实线上素材可用性由本条 57 个唯一 URL 全量复查覆盖 —— 判据不降、不调阈值。 */
const uniqCovers = [...new Set(groups.flatMap((g) => g.songs.filter((s) => s.cover).map((s) => s.cover)))];
const coverCheck = [];
for (let i = 0; i < uniqCovers.length; i += 8) {
  const batch = uniqCovers.slice(i, i + 8);
  const rs = await Promise.all(batch.map(async (u) => {
    try {
      const r = await fetch(SITE + u + '&t=' + TS + Math.random(), { cache: 'no-store' });
      const b = await r.arrayBuffer();
      return r.status === 200 && b.byteLength === fs.statSync(ROOT + 'docs/' + u.split('?')[0]).size;
    } catch { return false; }
  }));
  coverCheck.push(...rs);
}
ok('A10 第 6 批新增：线上 ' + uniqCovers.length + ' 个唯一封面 URL 全部 200 且字节与本地一致（B4 的线上素材可用性由此条全量覆盖）',
  coverCheck.length === uniqCovers.length && coverCheck.every(Boolean),
  coverCheck.filter(Boolean).length + '/' + uniqCovers.length);
await ctx0.close();

/* ---------------- ② 1920 运行时 ---------------- */
console.log('== ② 1920 运行时 ==');
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1200 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
await serveLocalCovers(ctx);
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
await page.goto(SITE + 'watch.html?t=' + TS, { waitUntil: 'load', timeout: 45000 });
await page.waitForSelector('#w-grid .poster', { timeout: 45000 });
await page.click('#w-avatar');                          /* 年报按钮只在时间轴出现（第 93 轮契约） */
await page.waitForSelector('#w-tl .tl-item', { timeout: 45000 });
await page.click('#w-stats-btn');
await page.waitForSelector('.st-card', { timeout: 25000 });
await page.waitForSelector('[data-songs="annual"]', { timeout: 25000 });
await page.waitForFunction((n) => {
  const e = document.querySelector('[data-songs="annual"]');
  return e && Number(e.getAttribute('data-count')) === n;
}, realTotal, { timeout: 30000 });
await page.waitForTimeout(600);
await page.mouse.move(1, 1);

/* 封面是 lazy：第 6 批修复 —— 分批 eager + decode。
 * 🔴 79 张同时 eager + fetchPriority=high 会把 GitHub Pages 的 HTTP/2 连接打爆：
 *    实测 38 个 net::ERR_HTTP2_PROTOCOL_ERROR、0 个 HTTP>=400、一次性 decode 耗时 593s、B4 假红；
 *    但 57 个唯一 URL 逐个 fetch 全 200 且字节一致、破图复查也全 200 —— 是取证方式而非站点故障。
 *    改成每批 10 张；判据不变，仍要求 withCover 张全部加载、0 破图（不调阈值）。 */
await page.evaluate(async () => {
  const imgs = [...document.querySelectorAll('img.st-song-img')];
  const B = 10;
  for (let i = 0; i < imgs.length; i += B) {
    const batch = imgs.slice(i, i + B);
    batch.forEach((im) => { im.loading = 'eager'; im.fetchPriority = 'high'; });
    await Promise.all(batch.map((im) => im.decode().catch(() => {})));
  }
});
await page.waitForFunction((n) => {
  const imgs = [...document.querySelectorAll('img.st-song-img')];
  return imgs.length === n && imgs.every((i) => i.complete && i.naturalWidth > 0 && !i.classList.contains('is-broken'));
}, withCover, { timeout: 90000 }).catch(() => {});

const r = await page.evaluate(() => {
  const box = (e) => { const x = e.getBoundingClientRect(); return { t: Math.round(x.top), w: Math.round(x.width) }; };
  const sec = document.querySelector('[data-songs="annual"]');
  const top = document.querySelector('[data-panel="top"]');
  const cards = [...document.querySelectorAll('.st-card')].map((e) =>
    (e.querySelector('.st-k') || {}).textContent + '=' + (e.querySelector('.st-v') || {}).textContent);
  const btn = document.getElementById('w-stats-btn');
  return {
    heading: (sec.querySelector('h3') || {}).textContent || '',
    count: sec.getAttribute('data-count'),
    songsBox: box(sec), topBox: box(top),
    domGroups: [...sec.querySelectorAll('.st-song-year')].map((g) => ({
      year: g.getAttribute('data-year'),
      label: (g.querySelector('.st-song-year-k') || {}).textContent || '',
      cols: getComputedStyle(g.querySelector('.st-song-list')).gridTemplateColumns.split(' ').length,
      items: [...g.querySelectorAll('.st-song')].map((li) => ({
        idx: li.getAttribute('data-index'),
        t: (li.querySelector('.st-song-title') || {}).textContent || '',
        a: (li.querySelector('.st-song-artist') || {}).textContent || '',
        c: !!li.querySelector('img.st-song-img')
      }))
    })),
    imgs: [...document.querySelectorAll('img.st-song-img')].length,
    loaded: [...document.querySelectorAll('img.st-song-img')].filter((i) => i.complete && i.naturalWidth > 0 && !i.classList.contains('is-broken')).length,
    broken: document.querySelectorAll('img.st-song-img.is-broken').length,
    panels: [...document.querySelectorAll('.st-panels .st-panel')].map((e) => e.getAttribute('data-panel')),
    cards,
    hasBest: /最佳电影|最佳剧集|最佳番剧/.test((document.querySelector('.st-cards') || {}).textContent || ''),
    btn: { text: btn.textContent.trim(), bg: getComputedStyle(btn).backgroundColor, pressed: btn.getAttribute('aria-pressed') },
    yearOptions: [...document.querySelectorAll('#st-year option')].map((o) => o.value),
    ov: document.documentElement.scrollWidth - document.documentElement.clientWidth
  };
});

ok('B1 歌单 section 在「年度影视」下方（几何 top 更大）、标题为「年度歌单」',
  r.songsBox.t > r.topBox.t && /年度歌单/.test(r.heading),
  `年度影视 top=${r.topBox.t} 年度歌单 top=${r.songsBox.t}`);

ok('B2 真实数据 ' + groups.length + ' 组 × 10 首 = ' + realTotal + ' 条、年份倒序、data-count=' + realTotal + '、每组标题只有「YYYY 年」（第 107 轮用户要求删掉首数文案）',
  Number(r.count) === realTotal && r.domGroups.length === groups.length &&
  r.domGroups.map((g) => g.year).join(',') === groups.map((g) => g.year).join(',') &&
  /* 第 107 轮：判据从「标题必须含 10 首」反转为「标题不得含 首」 */
  r.domGroups.every((g) => g.items.length === 10 && g.label.includes(g.year) && !/首/.test(g.label)),
  r.domGroups.map((g) => `${g.year}:${g.items.length}:${g.label}`).join(' '));

ok('B3 每首三要素齐备：歌名/歌手非空、序号 1~10 递增、桌面 10 列铺满',
  r.domGroups.every((g) => g.cols === 10 && g.items.every((it, i) =>
    it.idx === String(i + 1) && it.t.trim() && it.a.trim())),
  `列=${r.domGroups[0].cols} 首条=${r.domGroups[0].items[0].t}/${r.domGroups[0].items[0].a}`);

ok('B4 第 6 批改判：封面按本地 songs.json 现算 withCover 条全部加载、0 破图、其余显示 ♪ 占位（取证修复＝同源本地字节注入绕开 Pages HTTP/2 并发，素材可用性由 A10 全量复查，判据不降）',
  r.imgs === withCover && r.loaded === withCover && r.broken === 0 &&
  r.domGroups.reduce((n, g) => n + g.items.filter((i) => i.c).length, 0) === withCover,
  `img=${r.imgs} loaded=${r.loaded} broken=${r.broken} 占位=${realTotal - withCover}`);

const expected = groups.map((g) => ({
  year: g.year,
  items: g.songs.map((s) => [s.title, s.artist, !!s.cover])
}));
const actual = r.domGroups.map((g) => ({
  year: g.year,
  items: g.items.map((i) => [i.t, i.a, i.c])
}));
ok('B5 线上 DOM 与本地 songs.json 逐项全等（歌名 / 歌手 / 有无封面，含第 1~6 批改名；第 6 批用户定稿小写 to 是 Title Case 唯一例外）',
  JSON.stringify(actual) === JSON.stringify(expected),
  `${actual.length} 组 / ${actual.reduce((n, g) => n + g.items.length, 0)} 条`);

const yearPick = groups.map((g) => g.year).find((y) => r.yearOptions.includes(y)) || '2025';
const filterOk = await (async () => {
  try {
  await page.selectOption('#st-year', yearPick);
  await page.waitForFunction(() => {
    const e = document.querySelector('[data-songs="annual"]');
    return e && e.getAttribute('data-count') === '10';
  }, null, { timeout: 20000 }).catch(() => {});
  const only = await page.evaluate(() => ({
    g: [...document.querySelectorAll('.st-song-year')].map((x) => x.getAttribute('data-year')),
    panels: [...document.querySelectorAll('.st-panels .st-panel')].map((x) => x.getAttribute('data-panel'))
  }));
  await page.selectOption('#st-year', '');
  await page.waitForFunction((n) => {
    const e = document.querySelector('[data-songs="annual"]');
    return e && Number(e.getAttribute('data-count')) === n;
  }, realTotal, { timeout: 20000 }).catch(() => {});
  const all = await page.evaluate(() => document.querySelectorAll('.st-song-year').length);
  return only.g.length === 1 && only.g[0] === yearPick && all === groups.length &&
    only.panels.join('/') === 'months/buckets/country/years' &&
    r.panels.join('/') === 'months/buckets/country/years';
  } catch (err) { return false; }
})();
ok('B6 年份下拉筛选：选 ' + yearPick + ' 只剩 1 组 10 首、回「全部年份」恢复 ' + groups.length + ' 组；旧四面板始终不受影响',
  filterOk, `pick=${yearPick} panels=${r.panels.join('/')}`);

ok('B7 第 103 轮契约延续：年报仍 6 卡且键名顺序不变、三部「最佳」不在 DOM',
  r.cards.length === 6 && !r.hasBest &&
  r.cards.map((s) => s.split('=')[0]).join('/') === '记录总数/平均评分/≥8 分占比/观影天数/观影密度/峰值月份',
  r.cards.map((s) => s.split('=')[0]).join('/'));

ok('B8 第 102 轮契约延续：年报按钮恒「年度报告」金底常驻、aria-pressed=true',
  r.btn.text === '年度报告' && r.btn.bg === 'rgba(232, 176, 75, 0.13)' && r.btn.pressed === 'true',
  `text=${r.btn.text} bg=${r.btn.bg} pressed=${r.btn.pressed}`);

ok('B9 1920 无横向溢出 + 零 JS 异常', r.ov <= 0 && errs.length === 0, `ov=${r.ov} err=${errs.length}`);
await ctx.close();

/* ---------------- ③ 390 运行时 ---------------- */
console.log('== ③ 390 运行时 ==');
const c2 = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
await serveLocalCovers(c2);
const p2 = await c2.newPage();
const e2 = [];
p2.on('pageerror', (e) => e2.push(String(e)));
await p2.goto(SITE + 'watch.html?t=' + TS, { waitUntil: 'load', timeout: 45000 });
await p2.waitForSelector('#w-grid .poster', { timeout: 45000 });
await p2.click('#w-avatar');
await p2.waitForSelector('#w-tl .tl-item', { timeout: 45000 });
await p2.click('#w-stats-btn');
await p2.waitForSelector('.st-card', { timeout: 25000 });
await p2.waitForFunction((n) => {
  const e = document.querySelector('[data-songs="annual"]');
  return e && Number(e.getAttribute('data-count')) === n;
}, realTotal, { timeout: 30000 });
await p2.waitForTimeout(500);
const m2 = await p2.evaluate(() => ({
  cols: getComputedStyle(document.querySelector('.st-song-list')).gridTemplateColumns.split(' ').length,
  songs: document.querySelectorAll('.st-song').length,
  groups: document.querySelectorAll('.st-song-year').length,
  ov: document.documentElement.scrollWidth - document.documentElement.clientWidth
}));
ok('C1 390 歌单回 2 列、' + groups.length + ' 组 ' + realTotal + ' 首都在、无横向溢出',
  m2.cols === 2 && m2.songs === realTotal && m2.groups === groups.length && m2.ov <= 0,
  `列=${m2.cols} 首数=${m2.songs} 组=${m2.groups} ov=${m2.ov}`);
ok('C2 390 零 JS 异常', e2.length === 0, `err=${e2.length}`);
await c2.close();

await browser.close();
console.log('');
console.log(`第 104 轮上线复验：${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
