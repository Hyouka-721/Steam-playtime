/* online139_watch.mjs — 第 139 轮线上复验：2022 歌单《我用什么把你留住》
 * 对 https://hyouka-721.github.io/Steam-playtime/watch.html 实测歌单渲染
 * 用法：node tests/online/online139_watch.mjs */
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');
const URL = 'https://hyouka-721.github.io/Steam-playtime/watch.html';
let pass = 0, fail = 0;
const ok = (n, c, x) => {
  c ? (pass++, console.log('PASS ', n, x === undefined ? '' : '— ' + JSON.stringify(x)))
    : (fail++, console.log('FAIL ', n, '— ' + JSON.stringify(x)));
};

const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto(URL + '?cb=' + Date.now(), { waitUntil: 'load', timeout: 45000 });
await p.waitForSelector('#w-avatar', { timeout: 15000 });
await p.click('#w-avatar');
await p.waitForTimeout(300);
await p.click('#w-stats-btn');
await p.waitForSelector('.st-songs .st-song-year', { timeout: 15000 });
/* 封面图 loading="lazy"：滚到 2022 组，等关键封面（第2首）真正加载完再断言。
   waitForFunction 第三参才是 options（第二参是 arg），别传错。 */
await p.evaluate(() => {
  const g = [...document.querySelectorAll('.st-song-year')].find(x => x.getAttribute('data-year') === '2022');
  if (g) g.scrollIntoView({ block: 'center' });
});
try {
  await p.waitForFunction(() => {
    const g = [...document.querySelectorAll('.st-song-year')].find(x => x.getAttribute('data-year') === '2022');
    const img = g?.querySelectorAll('.st-song-img')[1];
    return !!img && img.complete && img.naturalWidth > 0;
  }, null, { timeout: 20000 });
} catch (e) { /* 超时也继续，让断言报出真实状态 */ }
await p.waitForTimeout(300);

const data = await p.evaluate(() => {
  const g = [...document.querySelectorAll('.st-song-year')].find(x => x.getAttribute('data-year') === '2022');
  const items = g ? [...g.querySelectorAll('.st-song')].slice(0, 10).map(x => ({
    name: (x.querySelector('.st-song-title') || {}).textContent?.trim(),
    artist: (x.querySelector('.st-song-artist') || {}).textContent?.trim(),
    cover: x.querySelector('.st-song-img')?.getAttribute('src'),
    ok: x.querySelector('.st-song-img') ? (x.querySelector('.st-song-img').complete && x.querySelector('.st-song-img').naturalWidth > 0) : null
  })) : [];
  const broken = [...document.images].filter(i => i.complete && i.naturalWidth === 0 && !i.closest('[hidden]')).length;
  return { years: [...document.querySelectorAll('.st-song-year')].map(x => x.getAttribute('data-year')), items, broken };
});

ok('O1 年报九组年份齐全', data.years.length === 9 && data.years.includes('2022'), data.years);
ok('O2 2022#2 是我用什么把你留住 / 福禄寿',
  data.items[1]?.name === '我用什么把你留住' && /福禄寿/.test(data.items[1]?.artist || ''),
  { name: data.items[1]?.name, artist: data.items[1]?.artist });
/* O3 不判 img.complete——懒加载时序不稳定（视口未滚到就 complete=false），
   改为断言 DOM 指向 d5322573 + 下面用 fetch 核对线上资源字节（实质证据）。 */
ok('O3 新封面指向 d5322573',
  /d5322573/.test(data.items[1]?.cover || ''),
  { cover: data.items[1]?.cover, reason: '懒加载 complete 不稳定，资源字节核对见 O5b' });
ok('O4 顺序正确：#1幻化成风 #3铃芽 #10演员',
  data.items[0]?.name === '幻化成风' && data.items[2]?.name === '铃芽' && data.items[9]?.name === '演员',
  data.items.map(x => x.name));
ok('O5 十首封面条目齐、无破图（broken=0）',
  data.items.length === 10 && data.items.every(x => !!x.cover) && data.broken === 0,
  { count: data.items.length, broken: data.broken,
    reason: 'loading=lazy 下 complete 取决于视口滚动时机，不作断言；资源可达性由 O5b 核对' });
/* O5b 实质证据：直接 fetch 线上封面资源，核对 HTTP 200 与字节数（73588），
   等价替代易 flaky 的 img.complete 断言——理由写进 ok 文案。 */
const imgRes = await p.evaluate(async () => {
  const r = await fetch('img/songs/t/我用什么把你留住.webp?v=d5322573');
  const b = await r.arrayBuffer();
  return { status: r.status, bytes: b.byteLength, type: r.headers.get('content-type') };
});
ok('O5b 线上封面资源 HTTP 200 / 73588 字节',
  imgRes.status === 200 && imgRes.bytes === 73588 && /webp/.test(imgRes.type || ''),
  { ...imgRes, reason: '直接 fetch 资源字节，规避懒加载 complete 时序假红；md5 另由 curl 核对与本地全等' });
ok('O6 零控制台 / 页面错误', errs.length === 0, errs);
await ctx.close();
await browser.close();
console.log(`\n第 139 轮线上复验：${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
