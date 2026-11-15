/* 第 104 轮：年报新增「年度歌单」——封面 / 歌曲名称 / 歌手，放在「年度影视」下方。
 *
 * 用户原话：「为年度报告的年度影视栏目下面添加一个年度歌单的功能，涵盖歌曲的封面、
 * 歌曲名称、歌手，稍后我会录入每年的10首歌曲」。录入方式经确认：
 *   ① 用户稍后把清单发到对话 → 我写进独立 docs/data/songs.json（本轮不编造任何歌曲）
 *   ② 封面随清单给图片或链接（本地 img/songs/ 相对路径 / 完整 URL）
 *
 * 复验口径：
 *   ① 静态 6 —— 版本、数据文件结构（当前必须为空）、加载/筛选/兜底链路、
 *      歌单在 .st-panels 之外、CSS 三档列宽与 860/480 块唯一
 *   ② 1920 造数 7 —— page.route 注入两个年份各 10 首，验三要素逐项、年份倒序、
 *      封面成功/失败/留空/伪协议四种分支、下拉筛选、旧四面板不受影响、零溢出零异常
 *   ③ 390 造数 2 —— 两列与零溢出
 *   ④ 真实数据 2 —— 判据随 songs.json 自适应（空数据验空态 / 已录入验分组与总数），
 *      并等异步加载的 data-count 追上真实总数再断言，避免读到首帧瞬时空态
 *
 * ⚠️ 造数只存在于 page.route 里，不写盘、不编造站内真实歌曲。全程只读、0 PUT。
 */
import { createRequire } from 'module';
import fs from 'fs';
import { fileURLToPath } from 'url';

const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SITE = 'http://127.0.0.1:8895/';
const rd = (p) => fs.readFileSync(ROOT + 'docs/' + p, 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '').replace(/\r\n/g, '\n');

const html = rd('watch.html'), js = rd('watch.js'), css = rd('watch.css');
const jsNC = strip(js);
const songsJson = JSON.parse(rd('data/songs.json'));

let pass = 0, fail = 0;
const ok = (n, c, extra = '') => {
  c ? (pass++, console.log(`PASS ${n}${extra ? '  — ' + extra : ''}`))
    : (fail++, console.log(`FAIL ${n}  — ${extra}`));
};

/* ================= A 静态 ================= */
console.log('== A 静态 ==');
ok('A1 watch.html 引用 watch.css?v=44 / watch.js?v=35（本轮 css+js 都改，两个都 bump）',
  /watch\.css\?v=44"/.test(html) && /watch\.js\?v=35"/.test(html),
  (html.match(/watch\.(css|js)\?v=\d+/g) || []).join(' '));

const yearShapeOk = songsJson.years.every((g) =>
  g && /^\d{4}$/.test(String(g.year || '')) && Array.isArray(g.songs) &&
  g.songs.every((s) => s && typeof s.title === 'string' && s.title.trim() &&
    typeof s.artist === 'string' && typeof s.cover === 'string'));
ok('A2 独立数据文件 data/songs.json：结构合法、年份/歌曲字段齐备、带 schema 说明（数据到位后本条仍成立）',
  Array.isArray(songsJson.years) && yearShapeOk &&
  typeof songsJson.schema === 'string' && /title|artist|cover/.test(songsJson.schema) &&
  typeof songsJson.updated_at === 'string',
  `years=${songsJson.years.length} 首数=${songsJson.years.reduce((n, g) => n + g.songs.length, 0)} updated_at=${songsJson.updated_at}`);

ok('A3 JS：独立加载（no-store）、归一化、年份筛选、封面兜底委托、数据晚到补重绘都在',
  /var SONGS_URL = 'data\/songs\.json';/.test(jsNC) &&
  /function normalizeSongs\(data\)/.test(jsNC) &&
  /function loadSongs\(\)/.test(jsNC) &&
  /\{ cache: 'no-store' \}/.test(jsNC) &&
  /if \(statsOn\) renderStats\(\);/.test(jsNC) &&
  /statsEl\.addEventListener\('error'/.test(jsNC) &&
  /classList\.contains\('st-song-img'\)/.test(jsNC) &&
  /var songGroups = statsYear/.test(jsNC) &&
  /function songCoverUrl\(u\)/.test(jsNC));

ok('A4 歌单是「年度影视」下方的独立 section：不挂 data-panel、不借 .st-panel 类（旧套件按它遍历统计面板）、不进 .st-panels 的四块栅格',
  /data-songs="annual"/.test(jsNC) &&
  !/data-panel="songs"/.test(jsNC) &&
  /class="st-songs" data-songs="annual"/.test(jsNC) &&
  !/class="st-panel st-songs"/.test(jsNC) &&
  jsNC.indexOf('var songsHtml') > jsNC.indexOf('var topHtml') &&
  /\? head \+ cardHtml \+ panels \+ topHtml \+ songsHtml/.test(jsNC) &&
  /head \+ '<p class="st-empty st-empty-main">这个范围内还没有观影记录<\/p>' \+ songsHtml;/.test(jsNC));

ok('A5 CSS：桌面 10 列 / 860 块 5 列 / 480 块 2 列，三档都带 .w-stats 前缀（压过文件末尾基础规则）',
  /\.st-song-list \{[^}]*grid-template-columns: repeat\(10, minmax\(0, 1fr\)\)/.test(css) &&
  /\.w-stats \.st-song-list \{ grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/.test(css) &&
  /\.w-stats \.st-song-list \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/.test(css) &&
  (css.match(/@media \(max-width: ?860px\)/g) || []).length === 1 &&
  (css.match(/@media \(max-width: ?480px\)/g) || []).length === 1,
  '860/480 块各 1 个');

ok('A6 CSS：封面 1:1 + 音符占位 + 歌名/歌手省略号；圆角只用令牌，不引入硬编码 px 圆角',
  /\.st-song-cover \{[^}]*aspect-ratio: 1 \/ 1;[^}]*border-radius: var\(--r-md\)/.test(css) &&
  /\.st-song-cover::before \{ content: "♪"/.test(css) &&
  /\.st-song-title \{[^}]*text-overflow: ellipsis/.test(css) &&
  /\.st-song-artist \{[^}]*text-overflow: ellipsis/.test(css) &&
  !/\.st-song[^{]*\{[^}]*border-radius: \d+px/.test(css) &&
  /\.st-songs \{[^}]*margin-top: 14px;[^}]*border-radius: var\(--r-md\)/.test(css) &&
  /\.st-songs h3 \{[^}]*font-size: 14px/.test(css));

/* ================= 造数 ================= */
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==';
function song(i, extra = {}) {
  return Object.assign({ title: `歌曲${i}`, artist: `歌手${i}`, cover: '' }, extra);
}
const SONGS_FIXTURE = {
  updated_at: '2026-11-15',
  years: [
    { year: '2025', songs: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => song(i, { title: `旧年曲${i}`, artist: `旧年演唱${i}` })) },
    {
      year: '2026',
      songs: [
        song(1, { title: '封面正常', artist: '演唱者甲', cover: PNG }),
        song(2, { title: '封面失效', artist: '演唱者乙', cover: 'img/songs/missing-104.webp' }),
        song(3, { title: '封面留空', artist: '演唱者丙', cover: '' }),
        song(4, { title: '伪协议被挡', artist: '演唱者丁', cover: 'javascript:alert(1)' }),
        song(5, { title: '外链封面', artist: '演唱者戊', cover: 'https://example.com/cover-104.jpg' }),
        song(6, { title: '曲六', artist: '演唱者己' }),
        song(7, { title: '曲七', artist: '演唱者庚' }),
        song(8, { title: '曲八', artist: '演唱者辛' }),
        song(9, { title: '曲九', artist: '演唱者壬' }),
        song(10, { title: '曲十', artist: '演唱者癸' })
      ]
    }
  ]
};

const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1200 }, serviceWorkers: 'block' });
const errs = [];
const attach = (p) => p.on('pageerror', (e) => errs.push(String(e)));
async function openStats(page) {
  await page.goto(SITE + 'watch.html?t=' + Date.now(), { waitUntil: 'load', timeout: 45000 });
  await page.waitForSelector('#w-grid .poster', { timeout: 45000 });
  await page.click('#w-avatar');                       /* 年报按钮只在时间轴出现（第 93 轮契约） */
  await page.waitForSelector('#w-tl .tl-item', { timeout: 45000 });
  await page.click('#w-stats-btn');
  await page.waitForSelector('.st-card', { timeout: 25000 });
  await page.waitForSelector('[data-songs="annual"]', { timeout: 25000 });
}

/* ================= B 1920 造数 ================= */
console.log('== B 1920 运行时（造数） ==');
const page = await ctx.newPage();
attach(page);
await page.route('**/data/songs.json*', (route) => route.fulfill({
  status: 200, contentType: 'application/json', body: JSON.stringify(SONGS_FIXTURE)
}));
await openStats(page);
await page.waitForFunction(() => {
  const e = document.querySelector('[data-songs="annual"]');
  return e && e.getAttribute('data-count') === '20';
}, null, { timeout: 20000 });

const r = await page.evaluate(() => {
  const box = (e) => { const x = e.getBoundingClientRect(); return { t: Math.round(x.top), l: Math.round(x.left), w: Math.round(x.width) }; };
  const songs = document.querySelector('[data-songs="annual"]');
  const top = document.querySelector('[data-panel="top"]');
  const groups = [...songs.querySelectorAll('.st-song-year')].map((g) => ({
    year: g.getAttribute('data-year'),
    label: (g.querySelector('.st-song-year-k') || {}).textContent || '',
    items: [...g.querySelectorAll('.st-song')].map((li) => ({
      idx: li.getAttribute('data-index'),
      title: (li.querySelector('.st-song-title') || {}).textContent || '',
      artist: (li.querySelector('.st-song-artist') || {}).textContent || '',
      hasImg: !!li.querySelector('img.st-song-img'),
      src: (li.querySelector('img.st-song-img') || {}).getAttribute
        ? li.querySelector('img.st-song-img').getAttribute('src') : '',
      broken: !!(li.querySelector('img.st-song-img') || { classList: { contains: () => false } })
        .classList.contains('is-broken')
    })),
    cols: getComputedStyle(g.querySelector('.st-song-list')).gridTemplateColumns.split(' ').length
  }));
  return {
    count: songs.getAttribute('data-count'),
    heading: (songs.querySelector('h3') || {}).textContent || '',
    groups,
    panels: [...document.querySelectorAll('.st-panels .st-panel')].map((e) => e.getAttribute('data-panel')),
    songsBox: box(songs), topBox: box(top),
    empty: !!songs.querySelector('.st-songs-empty'),
    ov: document.documentElement.scrollWidth - document.documentElement.clientWidth
  };
});

ok('B1 歌单 section 在「年度影视」下方（DOM 之后且几何 top 更大），标题为「年度歌单」',
  r.songsBox.t > r.topBox.t && /年度歌单/.test(r.heading) && !r.empty,
  `年度影视 top=${r.topBox.t} 年度歌单 top=${r.songsBox.t}`);

ok('B2 造数两个年份按倒序渲染，每组 10 首、标题只有「年份 + 年」不再带首数，data-count=20',
  r.count === '20' && r.groups.length === 2 &&
  r.groups[0].year === '2026' && r.groups[1].year === '2025' &&
  /* 第 107 轮：用户要求去掉「10 首」这类文案 → 标题只留年份；判据从「必须含 10 首」改为「必须不含 首」 */
  r.groups.every((g) => g.items.length === 10 && g.label.includes(g.year) && !/首/.test(g.label)),
  r.groups.map((g) => `${g.year}:${g.items.length}:${g.label}`).join(' '));

ok('B3 每首三要素逐项正确：封面节点 + 歌曲名称 + 歌手，序号 1~10 递增',
  r.groups[0].items.every((it, i) => it.idx === String(i + 1) && it.title && it.artist) &&
  r.groups[0].items[0].title === '封面正常' && r.groups[0].items[0].artist === '演唱者甲' &&
  r.groups[0].items[9].title === '曲十' && r.groups[1].items[0].title === '旧年曲1',
  r.groups[0].items.slice(0, 3).map((x) => x.title + '/' + x.artist).join(' '));

ok('B4 封面四种分支：正常图/data URI 保留、留空与伪协议不生成 img、外链与本地路径都渲染',
  r.groups[0].items[0].hasImg && /^data:image\/png/.test(r.groups[0].items[0].src) &&
  r.groups[0].items[1].hasImg && /img\/songs\/missing-104\.webp/.test(r.groups[0].items[1].src) &&
  !r.groups[0].items[2].hasImg && !r.groups[0].items[3].hasImg &&
  r.groups[0].items[4].hasImg && /^https:\/\/example\.com/.test(r.groups[0].items[4].src),
  r.groups[0].items.slice(0, 5).map((x) => x.hasImg ? 'img' : 'placeholder').join('/'));

ok('B5 封面加载失败兜底：破图被隐藏（is-broken + display:none），露出音符占位',
  await page.waitForFunction(() => {
    const im = document.querySelector('.st-song-img.is-broken');
    return im && getComputedStyle(im).display === 'none';
  }, null, { timeout: 15000 }).then(() => true).catch(() => false) &&
  await page.evaluate(() => getComputedStyle(document.querySelector('.st-song-cover'), '::before').content.includes('♪')));

ok('B6 年份下拉筛选：选 2025 只剩 1 组 10 首，回「全部年份」恢复 2 组 20 首；旧四面板始终不受影响',
  await (async () => {
    await page.selectOption('#st-year', '2025');
    await page.waitForFunction(() => {
      const e = document.querySelector('[data-songs="annual"]');
      return e && e.getAttribute('data-count') === '10';
    }, null, { timeout: 15000 });
    const only = await page.evaluate(() => ({
      groups: [...document.querySelectorAll('.st-song-year')].map((g) => g.getAttribute('data-year')),
      panels: [...document.querySelectorAll('.st-panels .st-panel')].map((e) => e.getAttribute('data-panel'))
    }));
    await page.selectOption('#st-year', '');
    await page.waitForFunction(() => {
      const e = document.querySelector('[data-songs="annual"]');
      return e && e.getAttribute('data-count') === '20';
    }, null, { timeout: 15000 });
    const all = await page.evaluate(() => [...document.querySelectorAll('.st-song-year')].map((g) => g.getAttribute('data-year')));
    return only.groups.length === 1 && only.groups[0] === '2025' && all.length === 2 &&
      only.panels.join('/') === 'months/buckets/country/years' &&
      r.panels.join('/') === 'months/buckets/country/years';
  })());

ok('B7 1920 桌面 10 列铺满、无横向溢出、零 JS 异常',
  r.groups.every((g) => g.cols === 10) && r.ov === 0 && errs.length === 0,
  `列=${r.groups[0].cols} ov=${r.ov} err=${errs.length}`);

/* ================= C 390 ================= */
console.log('== C 390 运行时（造数） ==');
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(300);
const c = await page.evaluate(() => {
  const list = document.querySelector('.st-song-list');
  return {
    cols: getComputedStyle(list).gridTemplateColumns.split(' ').length,
    songs: document.querySelectorAll('.st-song').length,
    ov: document.documentElement.scrollWidth - document.documentElement.clientWidth
  };
});
ok('C1 390 歌单回 2 列、20 首都在、无横向溢出',
  c.cols === 2 && c.songs === 20 && c.ov === 0, `列=${c.cols} 首数=${c.songs} ov=${c.ov}`);
ok('C2 390 零 JS 异常', errs.length === 0, `err=${errs.length}`);

/* ================= D 真实数据 ================= */
console.log('== D 真实数据 ==');
/* 判据随真实数据自适应：years 为空 → 验空态；用户录入后 → 验真实分组与总数。
   前后都不需要改判据，也不为跑绿调阈值。 */
const realYears = songsJson.years.filter((g) => /^\d{4}$/.test(String(g.year || '')) && g.songs.length);
const realTotal = realYears.reduce((n, g) => n + g.songs.filter((s) => s && String(s.title || '').trim()).length, 0);
const p2 = await ctx.newPage();
attach(p2);
await openStats(p2);
/* 🔴 songs.json 是独立异步加载的，年报首帧可能还是空数组 —— 有数据时必须等
   data-count 追上真实总数再断言，否则会读到「数据回来前」的瞬时空态而假红。 */
if (realTotal) {
  await p2.waitForFunction((n) => {
    const e = document.querySelector('[data-songs="annual"]');
    return e && Number(e.getAttribute('data-count')) === n;
  }, realTotal, { timeout: 25000 });
}
const d = await p2.evaluate(() => {
  const e = document.querySelector('[data-songs="annual"]');
  return {
    count: e ? e.getAttribute('data-count') : '-1',
    songs: document.querySelectorAll('.st-song').length,
    groups: document.querySelectorAll('.st-song-year').length,
    empty: !!(e && e.querySelector('.st-songs-empty')),
    text: e ? (e.querySelector('.st-songs-empty') || {}).textContent || '' : '',
    ov: document.documentElement.scrollWidth - document.documentElement.clientWidth
  };
});
ok(`D1 真实 songs.json 与页面一致（${realYears.length ? '已录入，验分组与总数' : '尚未录入，不编造歌曲 → 验空态'}）`,
  realYears.length
    ? (String(d.count) === String(realTotal) && d.songs === realTotal && d.groups === realYears.length && !d.empty)
    : (d.count === '0' && d.songs === 0 && d.empty && /歌单还没录入/.test(d.text) && !/10 首/.test(d.text)),
  `count=${d.count} songs=${d.songs} groups=${d.groups} text=${d.text.slice(0, 30)}`);
ok('D2 真实数据态零 JS 异常、无横向溢出', errs.length === 0 && d.ov === 0, `err=${errs.length} ov=${d.ov}`);

await browser.close();
console.log(`\n第 104 轮（年度歌单）：${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
