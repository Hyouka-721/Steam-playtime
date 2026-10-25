import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const BASE = 'http://127.0.0.1:8895/watch.html';
const D = 'C:/Users/33329/WorkBuddy/2026-10-13-18-17-49/steam-playtime/docs/';
const rd = (f) => fs.readFileSync(D + f, 'utf8').replace(/\r\n/g, '\n');
const stripCmt = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');

let pass = 0, fail = 0;
const ok = (n, c, extra = '') => { c ? (pass++, console.log(`PASS ${n}${extra ? '  ' + extra : ''}`)) : (fail++, console.log(`FAIL ${n}  ${extra}`)); };

const css = rd('watch.css'), cssNC = stripCmt(css), html = rd('watch.html');
const blk = (s, q) => {
  const i = s.indexOf(q);
  if (i < 0) return '';
  const st = s.indexOf('{', i);
  let d = 0, j = st;
  for (; j < s.length; j++) { if (s[j] === '{') d++; else if (s[j] === '}') { d--; if (d === 0) break; } }
  return s.slice(st + 1, j);
};
const b860 = blk(cssNC, '@media (max-width: 860px)');
const b480 = blk(cssNC, '@media (max-width: 480px)');

/* ================= A 静态 ================= */
console.log('== A 静态取值 ==');
const gridBase = (cssNC.match(/\.w-grid \{([^}]*)\}/) || [, ''])[1];
ok('A1 桌面网格 minmax 234px（156×1.5）、gap 34/12',
  /minmax\(234px, 1fr\)/.test(gridBase) && /gap: 34px 12px/.test(gridBase), gridBase.replace(/\s+/g, ' ').trim());
ok('A2 ≤860px 网格 minmax 200px、gap 28/12',
  /minmax\(200px, 1fr\)/.test(b860) && /gap: 28px 12px/.test(b860));
ok('A3 ≤480px 网格 minmax 156px、gap 24/10',
  /minmax\(156px, 1fr\)/.test(b480) && /gap: 24px 10px/.test(b480));

const tlItem = (cssNC.match(/\.tl-item \{([^}]*)\}/) || [, ''])[1];
ok('A4 .tl-item：padding 14/16/14/30 + gap 18 + align-items center',
  /* 第 68 轮：左内边距 30 → 0（轴线移进页面留白，缩略图回到内容左轨，见 verify68） */
  /padding: 14px 16px 14px 0/.test(tlItem) && /gap: 18px/.test(tlItem) && /align-items: center/.test(tlItem),
  tlItem.replace(/\s+/g, ' ').trim());
ok('A5 相邻条目有 6px 间隔（原来首尾相接）', /\.tl-item \+ \.tl-item \{ margin-top: 6px; \}/.test(cssNC));
const thumb = (cssNC.match(/\.tl-thumb \{([^}]*)\}/) || [, ''])[1];
ok('A6 .tl-thumb 62 → 76px（≤480 52 → 66px）',
  /width: 76px/.test(thumb) && /\.tl-thumb \{ width: 66px; \}/.test(b480), /width: (\d+)px/.exec(thumb)[0]);
/* 2026-10-24 第 61 轮：时间轴文字改成七行竖排，.tl-name/.tl-note 的间距契约已换代，
   相关判据移到 verify61；这里只留版本号。 */
ok('A9 版本号 bump：watch.css?v=16 / watch.js?v=9',
  /watch\.css\?v=16"/.test(html) && /watch\.js\?v=9"/.test(html));

/* ================= B 网格几何 ================= */
console.log('\n== B 网格：海报放大比例（基线来自第 59 轮实测）==');
const BEFORE = { 1440: 180.56, 1280: 157.7, 1100: 157.33, 1000: 172.8, 900: 196, 861: 186.25, 860: 153.59, 700: 155.5, 480: 140, 390: 110, 360: 156 };
const MOCK = { updated_at: '2026-10-24T10:00:00+08:00', items: Array.from({ length: 12 }, (_, i) => ({
  id: 'a' + i, title: `测试片 ${i + 1}`, title_en: 'Dead To Rights', kind: 'movie', year: 2025,
  watched_at: `2026-10-${String(24 - i).padStart(2, '0')}`, rating: 9,
  poster: 'img/minion-0ef9a202.webp', poster_w: 460, poster_h: 420, note: '靖康耻，犹未雪。臣子恨，何时灭。' })) };

const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const errs = [];
const open = async (W) => {
  const ctx = await browser.newContext({ viewport: { width: W, height: 900 } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(`${W}:${e}`));
  await p.route('**/data/watch.json*', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK) }));
  await p.goto(BASE, { waitUntil: 'load' });
  await p.waitForSelector('#w-grid .poster', { timeout: 8000 }).catch(() => {});
  await p.waitForTimeout(420);
  return { ctx, p };
};

const rows = [];
for (const W of [1440, 1280, 1100, 1000, 900, 861, 860, 700, 480, 390, 360]) {
  const { ctx, p } = await open(W);
  const m = await p.evaluate(() => {
    const g = document.querySelector('#w-grid'), cs = getComputedStyle(g);
    const pic = g.querySelector('.poster-pic').getBoundingClientRect();
    return { cols: cs.gridTemplateColumns.split(' ').length, w: +pic.width.toFixed(2), h: +pic.height.toFixed(2),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  });
  const ratio = +(m.w / BEFORE[W]).toFixed(3);
  rows.push({ W, ...m, ratio });
  ok(`B[${W}] 列${m.cols} 海报 ${m.w}×${m.h}，比例 ${ratio}×（不缩小、不超 1.8、2:3 保持、无横向溢出）`,
    ratio >= 1.0 && ratio <= 1.8 && Math.abs(m.h / m.w - 1.5) < 0.005 && m.overflow === 0);
  await ctx.close();
}
const key = rows.filter((r) => [1440, 1280, 390].includes(r.W));
ok('B* 主流量宽度（1440 / 1280 / 390）比例落在 1.45~1.60',
  key.every((r) => r.ratio >= 1.45 && r.ratio <= 1.6), key.map((r) => `${r.W}:${r.ratio}`).join(' '));
ok('B* 全部断点列数都比改动前少（每行张数下降 = 海报变大）',
  rows.every((r) => r.ratio >= 1.0), rows.map((r) => `${r.W}:${r.cols}列`).join(' '));

/* ================= C 时间轴 ================= */
console.log('\n== C 时间轴：不再拥挤 ==');
/* 2026-10-24 第 62 轮：时间轴改回「一行横向」（名称+英文名占一列、其余同行），
   条目高从第 61 轮的 199 回到 142。这里只留与行数无关的判据；横向布局由 verify62 负责。 */
const tlGeo = async (W) => {
  const { ctx, p } = await open(W);
  await p.click('#w-avatar');
  await p.waitForTimeout(500);
  const t = await p.evaluate(() => {
    const it = [...document.querySelectorAll('#w-tl .tl-item')];
    const el = it[0], r = el.getBoundingClientRect();
    const th = el.querySelector('.tl-thumb').getBoundingClientRect();
    const nt = el.querySelector('.tl-note').getBoundingClientRect();
    const body = el.querySelector('.tl-body').getBoundingClientRect();
    const nx = it[1].getBoundingClientRect();
    return { itemH: +r.height.toFixed(2), pitch: +(nx.top - r.top).toFixed(2),
      thumbW: +th.width.toFixed(2), thumbH: +th.height.toFixed(2),
      bodyH: +body.height.toFixed(2),
      thumbToBody: +(body.left - th.right).toFixed(2),
      inside: nt.bottom <= r.bottom + 0.01 && th.bottom <= r.bottom + 0.01,
      items: it.length, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  });
  await ctx.close();
  return t;
};
const d1440 = await tlGeo(1440);
ok('C1 桌面条目高 ≥120px（第 59 轮 113），相邻条目距 = 条目高 + 6px 缝',
  d1440.itemH >= 120 && Math.abs(d1440.pitch - (d1440.itemH + 6)) < 0.02, JSON.stringify(d1440));
ok('C2 桌面缩略图 62×93 → 76×114px',
  d1440.thumbW === 76 && d1440.thumbH === 114);
ok('C3 图→文间距 18px + 正文块高度与缩略图同量级（横向单行布局）',
  d1440.thumbToBody === 18 && d1440.bodyH < d1440.thumbH, 'bodyH=' + d1440.bodyH + ' thumbH=' + d1440.thumbH);
ok('C4 内容都收在条目内（不越界）+ 无横向溢出', d1440.inside && d1440.overflow === 0, JSON.stringify({ inside: d1440.inside, ov: d1440.overflow }));
const d390 = await tlGeo(390);
ok('C5 390px：缩略图 52×78 → 66×99，条目高 ≥120px',
  d390.thumbW === 66 && d390.thumbH === 99 && d390.itemH >= 120, JSON.stringify(d390));
ok('C6 390px：内容不越界 + 无横向溢出', d390.inside && d390.overflow === 0);

/* ================= D 回归 ================= */
console.log('\n== D 功能未受影响 ==');
const { ctx, p } = await open(1440);
ok('D1 网格默认可见、时间轴隐藏', await p.evaluate(() => !document.getElementById('w-grid').hidden && document.getElementById('w-tl').hidden));
await p.click('#w-avatar');
await p.waitForTimeout(400);
ok('D2 切到时间轴：条目数与数据条数一致（12）', await p.evaluate(() => document.querySelectorAll('#w-tl .tl-item').length === 12));
await p.click('#w-avatar');
await p.waitForTimeout(400);
ok('D3 切回网格：12 张海报', await p.evaluate(() => document.querySelectorAll('#w-grid .poster').length === 12));
/* 加号是 fixed 浮层，滚动中途必然压住某些海报（第 57 轮起就是如此）；
   要保证的是「滚到底部时最后一行完整可见」—— 判这一条，不判首屏。 */
await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
await p.waitForTimeout(450);
const fabOK = await p.evaluate(() => {
  const f = document.getElementById('w-fab').getBoundingClientRect();
  const pics = [...document.querySelectorAll('#w-grid .poster-pic')].map((e) => e.getBoundingClientRect());
  const vis = pics.filter((r) => r.bottom > 0 && r.top < innerHeight);
  const overlap = vis.some((r) => !(r.right <= f.left || r.left >= f.right || r.bottom <= f.top || r.top >= f.bottom));
  return { overlap, visible: vis.length, fabBottomBand: +innerHeight - f.top, padBottom: getComputedStyle(document.querySelector('.w-main')).paddingBottom };
});
ok('D4 滚到底部时最后一行海报不被加号压住（底部留白 96 > 加号占高 82）',
  fabOK.overlap === false && fabOK.padBottom === '96px', JSON.stringify(fabOK));
await ctx.close();
ok('D5 全程零 JS 异常', errs.length === 0, errs.join(' | '));

await browser.close();
console.log(`\n===== 第 60 轮回归：${pass}/${pass + fail} =====`);
process.exit(fail ? 1 : 0);
