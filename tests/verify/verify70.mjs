/* 第 70 轮回归：① 换《哈利·波特与魔法石》海报 ② 站名改 Watch List
   海报按仓库同一套规则：宽 640 只缩不放 / WebP q80 / SHA-256 前 8 位命名，
   所以能反查「文件名里的 hash 是否等于文件字节的 sha256 前 8 位」 */
import { createRequire } from 'module';
import fs from 'fs';
import crypto from 'crypto';
const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const BASE = process.env.BASE || 'http://127.0.0.1:8895/';
const ROOT = 'C:/Users/33329/WorkBuddy/2026-10-13-18-17-49/steam-playtime/docs/';
const OUT = 'C:/Users/33329/AppData/Local/Temp/fx_verify_20261018/shots70/';
fs.mkdirSync(OUT, { recursive: true });

const rd = (f) => fs.readFileSync(ROOT + f, 'utf8').replace(/\r\n/g, '\n');
const html = rd('watch.html');
const data = JSON.parse(fs.readFileSync(process.env.DATA_FILE || (ROOT + 'data/watch.json'), 'utf8'));
const N = data.items.length;

let pass = 0, fail = 0;
const ok = (n, c, extra = '') => { c ? (pass++, console.log(`PASS ${n}${extra ? '  — ' + extra : ''}`)) : (fail++, console.log(`FAIL ${n}  — ${extra}`)); };

/* ================= A 海报 ================= */
console.log('== A 《哈利·波特与魔法石》新海报 ==');
const hp = data.items.filter((x) => x.title === '哈利·波特与魔法石');
ok('A1 数据里只有一条《哈利·波特与魔法石》', hp.length === 1, `${hp.length} 条`);
const item = hp[0] || {};
const posterRel = item.poster || '';
const posterAbs = ROOT + posterRel;

ok('A2 海报文件名符合 <slug>-<8 位 hash>.webp 约定',
  /^img\/watch\/harry-potter-and-the-sorcerer-s-stone-[0-9a-f]{8}\.webp$/.test(posterRel), posterRel);
ok('A3 文件确实存在且非空', fs.existsSync(posterAbs) && fs.statSync(posterAbs).size > 10000,
  fs.existsSync(posterAbs) ? fs.statSync(posterAbs).size + 'B' : '缺失');

const buf = fs.existsSync(posterAbs) ? fs.readFileSync(posterAbs) : Buffer.alloc(0);
const sha8 = crypto.createHash('sha256').update(buf).digest('hex').slice(0, 8);
ok('A4 文件名里的 hash = 文件字节 sha256 前 8 位（与仓库命名规则一致）',
  posterRel.includes('-' + sha8 + '.webp'), `文件名 hash vs 实算 ${sha8}`);

ok('A5 poster_w / poster_h 是正整数且宽度 = 640（压图目标宽）',
  item.poster_w === 640 && Number.isInteger(item.poster_h) && item.poster_h > 400,
  `${item.poster_w}×${item.poster_h}`);

const refs = data.items.map((x) => x.poster);
ok('A6 旧海报 e6de52af 已被替换且无任何条目引用、文件已删除',
  !refs.includes('img/watch/harry-potter-and-the-sorcerer-s-stone-e6de52af.webp') &&
  !fs.existsSync(ROOT + 'img/watch/harry-potter-and-the-sorcerer-s-stone-e6de52af.webp'));
ok('A7 每条记录的 poster 都是仓库里的真实文件（无死链）',
  data.items.every((x) => fs.existsSync(ROOT + x.poster)),
  data.items.filter((x) => !fs.existsSync(ROOT + x.poster)).map((x) => x.poster).join(',') || '全部存在');
ok('A8 海报目录没有孤儿文件（引用的集合 = 目录里 potter 相关文件集合）',
  (() => {
    const onDisk = fs.readdirSync(ROOT + 'img/watch').filter((f) => f.includes('potter')).sort();
    const used = refs.filter((p) => p.includes('potter')).map((p) => p.split('/').pop()).sort();
    return JSON.stringify(onDisk) === JSON.stringify(used);
  })());

/* ================= B 站名 ================= */
console.log('\n== B 站名 My Watch List → Watch List ==');
ok('B1 <title> 已改为 Watch List', /<title>Watch List<\/title>/.test(html));
ok('B2 页眉 <h1 class="w-title"> 文本已改为 Watch List',
  /<h1[^>]*class="w-title"[^>]*>\s*Watch List\s*<\/h1>/.test(html), (html.match(/<h1[^>]*w-title[^>]*>[\s\S]{0,40}/) || [''])[0].replace(/\s+/g, ' '));
ok('B3 watch.html 里不再出现旧站名', !/My Watch List/.test(html));
ok('B4 标题仍是可点按钮（role / tabindex / aria-label 未丢）',
  /id="w-title"[^>]*role="button"[^>]*tabindex="0"/s.test(html) && /aria-label="回到页面顶部"/.test(html));

/* ================= C 运行时 ================= */
const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const errs = [];
{
  const c = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await c.newPage();
  p.on('pageerror', (e) => errs.push(String(e)));
  await p.goto(BASE + 'watch.html', { waitUntil: 'load' });
  await p.waitForFunction(() => document.querySelectorAll('#w-grid .poster').length > 0, null, { timeout: 25000 });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(600);

  const r = await p.evaluate(() => ({
    title: document.title,
    h1: document.getElementById('w-title').textContent.trim(),
    posters: document.querySelectorAll('#w-grid .poster').length,
  }));
  ok('C1 浏览器标题与页眉标题都是 Watch List', r.title === 'Watch List' && r.h1 === 'Watch List', `${r.title} / ${r.h1}`);
  ok(`C2 网格渲染全部 ${N} 条`, r.posters === N, `grid=${r.posters}/${N}`);

  /* 新海报能真的加载出来（complete + naturalWidth），且解码为 640 宽 */
  const img = await p.evaluate(() => {
    const cards = [...document.querySelectorAll('#w-grid .poster')];
    const card = cards.find((x) => (x.querySelector('.poster-name') || {}).textContent === '哈利·波特与魔法石');
    if (!card) return null;
    const im = card.querySelector('img');
    return { src: im.getAttribute('src'), nw: im.naturalWidth, nh: im.naturalHeight, complete: im.complete };
  });
  ok('C3 网格里该卡片用的正是 json 里那张海报，且解码尺寸 = poster_w/poster_h',
    img && img.src === posterRel && img.complete &&
    img.nw === item.poster_w && img.nh === item.poster_h, JSON.stringify({ img, posterRel }));

  await p.evaluate(() => {
    const cards = [...document.querySelectorAll('#w-grid .poster')];
    const card = cards.find((x) => (x.querySelector('.poster-name') || {}).textContent === '哈利·波特与魔法石');
    if (card) card.scrollIntoView({ block: 'center' });
  });
  await p.waitForTimeout(500);
  await p.screenshot({ path: OUT + 'H1_新海报_网格_1440.png' });

  /* 页眉站名 */
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.waitForTimeout(400);
  await p.locator('.w-header').screenshot({ path: OUT + 'H2_页眉_新站名.png' });

  /* 时间轴里也换了图 */
  await p.click('#w-avatar');
  await p.waitForFunction(() => document.querySelectorAll('#w-tl .tl-item').length > 0, null, { timeout: 20000 });
  await p.waitForTimeout(700);
  const tl = await p.evaluate(() => {
    const it = [...document.querySelectorAll('#w-tl .tl-item')].find((x) => x.textContent.includes('哈利·波特与魔法石'));
    if (!it) return null;
    const im = it.querySelector('.tl-thumb img');
    return { src: im.getAttribute('src'), nw: im.naturalWidth, seed: it.querySelector('.tl-note') ? it.querySelector('.tl-note').textContent.trim() : '' };
  });
  ok('C4 时间轴缩略图同样用 json 里那张海报',
    tl && tl.src === posterRel, JSON.stringify(tl));
  const cols = await p.evaluate(() => {
    const items = [...document.querySelectorAll('#w-tl .tl-item')];
    const u = (sel) => [...new Set(items.map((it) => { const e = it.querySelector(sel); return e ? Math.round(e.getBoundingClientRect().left) : null; }).filter((x) => x != null))];
    return { date: u('.tl-date'), score: u('.tl-score') };
  });
  ok('C5 列对齐未受站名/海报改动影响', Object.values(cols).every((a) => a.length === 1), JSON.stringify(cols));
  await c.close();
}
ok('C6 全程零 JS 异常', errs.length === 0, errs.slice(0, 3).join(' | '));

await browser.close();
console.log(`\n===== 第 70 轮回归：${pass}/${pass + fail} =====`);
process.exit(fail ? 1 : 0);
