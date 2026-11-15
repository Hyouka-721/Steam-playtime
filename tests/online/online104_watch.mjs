/* 第 104 轮 watch 侧上线复验：年报「年度影视」下方新增「年度歌单」（封面 / 歌曲名称 / 歌手）
 *
 * 用户原话：「为年度报告的年度影视栏目下面添加一个年度歌单的功能，涵盖歌曲的封面、
 * 歌曲名称、歌手，稍后我会录入每年的10首歌曲」；随后录入 2018~2025 共 8 年 80 首，
 * 并分 3 批定夺歌手 / 改名 / 补录 25 张桌面封面（39 条有图），第 4 批确认 4 个待确认
 * 歌名「都采用现有的」。本轮上线 = 框架 + 真实数据 + 封面素材一起发。
 *
 * 复验口径：
 *   ① 内容指纹 9 —— HTML 引用 v=42/v=34；css/js/html/songs.json 线上字节 md5 与本地全等
 *      （EOL 归一）；线上 JS 的独立加载 / 归一化 / 年份筛选 / 封面兜底链路；线上 CSS 三档
 *      栅格；线上封面素材抽查 5 张（200 + 字节数与本地一致）
 *   ② 1920 运行时 9 —— 歌单位置、8 组 × 10 首 / 年份倒序、三要素逐项、39 张封面全加载、
 *      线上 DOM 与本地 songs.json 逐字段全等、下拉筛选、六卡与按钮契约延续、零溢出零异常
 *   ③ 390 运行时 2 —— 两列、80 首、零溢出零异常
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

/* ---------------- ① 内容指纹 ---------------- */
console.log('== ① 内容指纹 ==');
const ctx0 = await browser.newContext({ viewport: { width: 1920, height: 1200 }, serviceWorkers: 'block' });
const p0 = await ctx0.newPage();
await p0.goto(SITE + 'watch.html?t=' + TS, { waitUntil: 'load', timeout: 45000 });
await p0.waitForFunction(() => document.querySelectorAll('#w-grid .poster').length > 20, null, { timeout: 45000 }).catch(() => {});

const fetchText = async (u) => p0.evaluate(async (x) => (await fetch(x, { cache: 'reload' })).text(), u);
const html = await fetchText(SITE + 'watch.html?t=' + TS);
const liveCss = await fetchText(SITE + 'watch.css?v=42&t=' + TS);
const liveJs = await fetchText(SITE + 'watch.js?v=34&t=' + TS);
const liveSongs = await fetchText(SITE + 'data/songs.json?t=' + TS);
const liveJsNC = stripLineCmt(stripJsCmt(liveJs));
const htmlNC = html.replace(/<!--[\s\S]*?-->/g, '');
const liveCssNC = stripJsCmt(liveCss);

ok('A1 线上 watch.html 引用 watch.css?v=42 / watch.js?v=34',
  /watch\.css\?v=42/.test(html) && /watch\.js\?v=34/.test(html),
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

ok('A8 线上 data/songs.json 字节 md5 与本地全等，且为 8 组 × 10 首 = 80 条（39 条带封面）',
  md5txt(liveSongs) === md5txt(localSongs) &&
  (() => { try { const j = JSON.parse(liveSongs); return j.years.length === 8 &&
    j.years.every((g) => g.songs.length === 10) &&
    j.years.reduce((n, g) => n + g.songs.filter((s) => s.cover).length, 0) === 39; } catch { return false; } })(),
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
await ctx0.close();

/* ---------------- ② 1920 运行时 ---------------- */
console.log('== ② 1920 运行时 ==');
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1200 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
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

/* 封面是 lazy：先强制 eager + decode，再验加载结果 */
await page.evaluate(async () => {
  const imgs = [...document.querySelectorAll('img.st-song-img')];
  imgs.forEach((i) => { i.loading = 'eager'; i.fetchPriority = 'high'; });
  await Promise.all(imgs.map((i) => i.decode().catch(() => {})));
});
await page.waitForFunction((n) => {
  const imgs = [...document.querySelectorAll('img.st-song-img')];
  return imgs.length === n && imgs.every((i) => i.complete && i.naturalWidth > 0 && !i.classList.contains('is-broken'));
}, withCover, { timeout: 45000 }).catch(() => {});

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

ok('B2 真实数据 8 组 × 10 首 = 80 条、年份倒序、data-count=80、每组标题带年份与首数',
  Number(r.count) === realTotal && r.domGroups.length === groups.length &&
  r.domGroups.map((g) => g.year).join(',') === groups.map((g) => g.year).join(',') &&
  r.domGroups.every((g) => g.items.length === 10 && g.label.includes(g.year) && /10 首/.test(g.label)),
  r.domGroups.map((g) => `${g.year}:${g.items.length}`).join(' '));

ok('B3 每首三要素齐备：歌名/歌手非空、序号 1~10 递增、桌面 10 列铺满',
  r.domGroups.every((g) => g.cols === 10 && g.items.every((it, i) =>
    it.idx === String(i + 1) && it.t.trim() && it.a.trim())),
  `列=${r.domGroups[0].cols} 首条=${r.domGroups[0].items[0].t}/${r.domGroups[0].items[0].a}`);

ok('B4 39 张封面全部加载成功、0 破图、其余 41 条显示 ♪ 占位',
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
ok('B5 线上 DOM 与本地 songs.json 逐项全等（歌名 / 歌手 / 有无封面，含第 1~3 批改名与 Title Case）',
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
ok('B6 年份下拉筛选：选 ' + yearPick + ' 只剩 1 组 10 首、回「全部年份」恢复 8 组；旧四面板始终不受影响',
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
ok('C1 390 歌单回 2 列、8 组 80 首都在、无横向溢出',
  m2.cols === 2 && m2.songs === realTotal && m2.groups === groups.length && m2.ov <= 0,
  `列=${m2.cols} 首数=${m2.songs} 组=${m2.groups} ov=${m2.ov}`);
ok('C2 390 零 JS 异常', e2.length === 0, `err=${e2.length}`);
await c2.close();

await browser.close();
console.log('');
console.log(`第 104 轮上线复验：${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
