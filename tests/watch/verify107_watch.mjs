/* 第 107 轮：年度歌单两处「首数」文案删除 + 夕颜封面替换。
 *
 * 用户原话：「夕颜海报替换。删除年度歌单中的每年 10 首、10 首这样的文字。上线」。
 *
 * 改动契约（本轮要守住的东西）：
 *   ① 歌单标题只剩「年度歌单」，不再挂「每年 10 首」小字；
 *   ② 每年分组标题只剩「2018 年」，不再挂「10 首」；
 *   ③ 空态提示里也不再出现「每年 10 首」；
 *   ④ 版本号 watch.css?v=47 / watch.js?v=35（本轮动了两份源码，必须双双 bump）；
 *   ⑤ 夕颜封面换成用户新图（t/夕颜.webp 内容哈希变化、原图 夕颜.jpg、旧图 夕颜_旧.webp 留档）。
 *
 * 🔴 判据方向：从「标题必须含 10 首」反转为「标题必须不含 首」——
 *    这是用户显式要求删文案导致的功能变更，不是为跑绿放宽阈值。
 * ⚠️ 全程只读，不造数、不写盘。
 */
import { createRequire } from 'module';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SITE = 'http://127.0.0.1:8895/';

const songsJson = JSON.parse(fs.readFileSync(ROOT + 'docs/data/songs.json', 'utf8'));
const js = fs.readFileSync(ROOT + 'docs/watch.js', 'utf8');
const css = fs.readFileSync(ROOT + 'docs/watch.css', 'utf8');
const html = fs.readFileSync(ROOT + 'docs/watch.html', 'utf8');
const all = songsJson.years.flatMap((g) => g.songs);
const withCover = all.filter((s) => s.cover);
const rels = [...new Set(withCover.map((s) => s.cover.split('?')[0]))];
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

let pass = 0, fail = 0;
const ok = (n, c, extra = '') => {
  c ? (pass++, console.log(`PASS ${n}${extra ? '  — ' + extra : ''}`))
    : (fail++, console.log(`FAIL ${n}  — ${extra}`));
};

/* ================= A 静态契约 ================= */
console.log('== A 静态契约 ==');

ok('A1 歌单标题只剩「年度歌单」：<h3> 内不再挂 st-hint「每年 10 首」',
  /'<h3>年度歌单<\/h3>'/.test(js) && !/<h3>年度歌单<span class="st-hint">/.test(js),
  `模板=${(js.match(/'<h3>年度歌单[^']*'/) || [''])[0]}`);

ok('A2 年份标题只剩「YYYY 年」：st-song-year-n 的 span 与它的 CSS 规则双双删除',
  /<h4 class="st-song-year-k">' \+ esc\(g\.year\) \+ ' 年<\/h4>/.test(js) &&
  !/st-song-year-n/.test(js) && !/\.st-song-year-n\s*\{/.test(css),
  `js=${/st-song-year-n/.test(js) ? '有残留' : '已删净'} css=${/\.st-song-year-n\s*\{/.test(css) ? '有残留' : '已删净'}`);

ok('A3 空态提示保留「还没录入」但不再提要录 10 首',
  /歌单还没录入 —— 封面 \/ 歌曲名称 \/ 歌手，稍后补上/.test(js) &&
  !/歌单还没录入[^'\n]*10 首/.test(js),
  `空态串=${(js.match(/歌单还没录入[^'\n]*/) || [''])[0]}`);

ok('A4 版本号双 bump：watch.css?v=47 / watch.js?v=35',
  /watch\.css\?v=47/.test(html) && /watch\.js\?v=35/.test(html),
  `${(html.match(/watch\.css\?v=\d+/) || [''])[0]} / ${(html.match(/watch\.js\?v=\d+/) || [''])[0]}`);

const xy = all.find((s) => s.title === '夕颜');
const xyRel = xy && xy.cover ? xy.cover.split('?')[0] : '';
const xyFile = ROOT + 'docs/' + xyRel;
const xyHashOk = xy && xy.cover ? sha(fs.readFileSync(xyFile)).slice(0, 8) === xy.cover.split('?v=')[1] : false;
ok('A5 夕颜封面 = 用户新图（t/夕颜.webp 内容哈希与 ?v= 一致，原图 夕颜.jpg 在库、旧图 夕颜_旧.webp 留档）',
  !!xy && /^img\/songs\/t\/夕颜\.webp\?v=[0-9a-f]{8}$/.test(xy.cover) && xyHashOk &&
  fs.existsSync(ROOT + 'assets/songs/夕颜.jpg') && fs.existsSync(ROOT + 'assets/songs/夕颜_旧.webp'),
  `${xy ? xy.cover : '缺条目'} hashOK=${xyHashOk}`);

ok('A6 封面总体积仍受控（唯一封面张数、单张 ≤ 100 KB、合计 ≤ 3 MB）',
  rels.length === 66 &&
  rels.every((r) => fs.statSync(ROOT + 'docs/' + r).size <= 100 * 1024) &&
  rels.reduce((n, r) => n + fs.statSync(ROOT + 'docs/' + r).size, 0) <= 3 * 1024 * 1024,
  `${rels.length} 张 / 合计 ${(rels.reduce((n, r) => n + fs.statSync(ROOT + 'docs/' + r).size, 0) / 1048576).toFixed(2)} MB`);

/* ================= 运行时 ================= */
const TOTAL = all.length;
const browser = await chromium.launch();

async function open(width, height) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(SITE + 'watch.html?t=' + Date.now(), { waitUntil: 'load', timeout: 45000 });
  await page.waitForSelector('#w-grid .poster', { timeout: 45000 });
  await page.click('#w-avatar');
  await page.waitForSelector('#w-tl .tl-item', { timeout: 45000 });
  await page.click('#w-stats-btn');
  await page.waitForSelector('[data-songs="annual"]', { timeout: 25000 });
  await page.waitForFunction((n) => {
    const e = document.querySelector('[data-songs="annual"]');
    return e && Number(e.getAttribute('data-count')) === n;
  }, TOTAL, { timeout: 25000 });
  return { page, errs };
}

console.log('== B 1920 运行时（真实数据）==');
{
  const { page, errs } = await open(1920, 1080);
  const sec = await page.$('[data-songs="annual"]');
  const b = await sec.boundingBox();
  await page.setViewportSize({ width: 1920, height: Math.ceil(b.height) + 600 });
  await page.evaluate(async () => {
    const imgs = [...document.querySelectorAll('.st-song-img')];
    imgs.forEach((i) => { i.loading = 'eager'; });
    await Promise.all(imgs.map((i) => i.decode().catch(() => {})));
  });
  await page.waitForFunction((n) => {
    const imgs = [...document.querySelectorAll('.st-song-img')];
    return imgs.length === n && imgs.every((i) => i.complete && i.naturalWidth > 0);
  }, withCover.length, { timeout: 45000 });
  await page.waitForTimeout(600);

  const r = await page.evaluate(() => {
    const labels = [...document.querySelectorAll('.st-song-year-k')].map((e) => e.textContent.trim());
    const h3 = document.querySelector('.st-songs h3');
    const cards = [...document.querySelectorAll('.st-song')];
    const c = cards.find((e) => (e.querySelector('.st-song-title') || {}).textContent?.trim() === '夕颜');
    const img = c ? c.querySelector('img.st-song-img') : null;
    return {
      h3: h3 ? h3.textContent.trim() : '',
      hint: !!(h3 && h3.querySelector('.st-hint')),
      labels,
      groups: document.querySelectorAll('.st-song-year').length,
      songs: cards.length,
      imgs: document.querySelectorAll('.st-song-img').length,
      broken: [...document.querySelectorAll('.st-song-img')].filter((i) => !i.complete || i.naturalWidth === 0).length,
      placeholders: document.querySelectorAll('.st-song-cover.is-broken').length,
      xy: img ? { src: img.getAttribute('src'), nw: img.naturalWidth } : null,
      ov: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });

  ok('B1 9 组年份标题全部只剩「YYYY 年」，无一处带「首」',
    r.groups === 9 && r.labels.length === 9 && r.labels.every((l) => /^\d{4} 年$/.test(l)),
    r.labels.slice(0, 3).join(' / ') + ' …');

  ok('B2 歌单标题无 hint 小字，h3 文本就是「年度歌单」',
    r.h3 === '年度歌单' && !r.hint, `h3="${r.h3}" hint=${r.hint}`);

  ok('B3 90 首 / 90 张封面全部加载、0 破图 0 音符占位、无横向溢出、零 JS 异常',
    r.songs === 90 && r.imgs === 90 && r.broken === 0 && r.placeholders === 0 && r.ov === 0 && errs.length === 0,
    `songs=${r.songs} imgs=${r.imgs} broken=${r.broken} 占位=${r.placeholders} ov=${r.ov} err=${errs.length}`);

  ok('B4 夕颜卡片渲染的是新缩略图（t/夕颜.webp、naturalWidth=480）',
    !!r.xy && /img\/songs\/t\/夕颜\.webp\?v=[0-9a-f]{8}$/.test(r.xy.src) && r.xy.nw === 480,
    r.xy ? `${r.xy.src} nw=${r.xy.nw}` : '未找到夕颜卡片');

  await page.context().close();
}

console.log('== C 390 运行时 ==');
{
  const { page, errs } = await open(390, 844);
  const b = await (await page.$('[data-songs="annual"]')).boundingBox();
  await page.setViewportSize({ width: 390, height: Math.ceil(b.height) + 600 });
  await page.waitForTimeout(500);
  const c = await page.evaluate(() => {
    const g = document.querySelector('.st-song-year');
    const grid = g ? (g.querySelector('.st-song-list') || g) : null;
    const st = grid ? getComputedStyle(grid) : null;
    return {
      cols: st ? (st.gridTemplateColumns || '').split(' ').filter(Boolean).length : 0,
      labels: [...document.querySelectorAll('.st-song-year-k')].map((e) => e.textContent.trim()),
      songs: document.querySelectorAll('.st-song').length,
      ov: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  ok('C1 390 两列、9 组标题同样无「首」、90 首都在、零溢出零异常',
    c.cols === 2 && c.songs === 90 && c.ov === 0 && errs.length === 0 && c.labels.every((l) => /^\d{4} 年$/.test(l)),
    `列=${c.cols} 首数=${c.songs} ov=${c.ov} err=${errs.length}`);
  await page.context().close();
}

await browser.close();
console.log(`\n第 107 轮（歌单文案精简 + 夕颜封面）：${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
