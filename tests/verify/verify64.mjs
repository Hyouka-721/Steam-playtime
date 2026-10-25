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

const css = rd('watch.css'), html = rd('watch.html'), js = rd('watch.js');
const cssNC = stripCmt(css);

/* ================= A 静态 ================= */
console.log('== A 静态：字号 +4 与标题按钮声明 ==');
const fs2 = (sel) => ((cssNC.match(new RegExp('\\.' + sel + ' \\{([^}]*)\\}')) || [, ''])[1].match(/font-size:\s*([\d.]+px)/) || [])[1];
ok('A1 名称 17 → 21px', fs2('tl-name') === '21px', fs2('tl-name'));
ok('A2 英文名 14.5 → 18.5px', fs2('tl-en') === '18.5px', fs2('tl-en'));
ok('A3 日期·类别·上映·评级 14.5 → 18.5px', fs2('tl-meta') === '18.5px', fs2('tl-meta'));
ok('A4 评语 15 → 19px', fs2('tl-note') === '19px', fs2('tl-note'));
ok('A5 评级星号 12 → 16px', /\.tl-meta \.tl-score i \{[^}]*font-size: 16px/.test(cssNC));
ok('A6 .tl-meta 允许折行（字号变大后窄屏不溢出）', /flex-wrap: wrap/.test((cssNC.match(/\.tl-meta \{([^}]*)\}/) || [, ''])[1]));
ok('A7 标题 role=button + tabindex + aria-label + id 齐全',
  /id="w-title"/.test(html) && /role="button"/.test(html) && /tabindex="0"/.test(html) &&
  /aria-label="回到页面顶部"/.test(html));
ok('A8 .w-title 有 pointer 光标与 focus-visible 环',
  /\.w-title \{[^}]*cursor: pointer/s.test(cssNC) && /\.w-title:focus-visible \{/.test(cssNC));
ok('A9 JS 绑定了标题的 click 与 Enter/空格，并尊重 reduced-motion',
  /getElementById\('w-title'\)/.test(js) && /prefers-reduced-motion/.test(js) &&
  /'Enter' \|\| e\.key === ' '/.test(js));
ok('A10 版本号 bump：watch.css?v=15 / watch.js?v=8',
  /watch\.css\?v=15"/.test(html) && /watch\.js\?v=8"/.test(html));

/* ================= B 字号与布局实测 ================= */
const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const errs = [];
const geo = async (W) => {
  const ctx = await browser.newContext({ viewport: { width: W, height: 900 } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(`${W}:${e}`));
  await p.goto(BASE, { waitUntil: 'load' });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(550);
  await p.click('#w-avatar');
  await p.waitForTimeout(700);
  const r = await p.evaluate(() => {
    const item = document.querySelector('#w-tl .tl-item');
    const g = (s) => { const e = item.querySelector(s); if (!e) return null; const cs = getComputedStyle(e);
      const b = e.getBoundingClientRect();
      return { fs: cs.fontSize, w: +b.width.toFixed(2), h: +b.height.toFixed(2), t: +b.top.toFixed(2) }; };
    return { name: g('.tl-name'), en: g('.tl-en'), meta: g('.tl-meta'), note: g('.tl-note'),
      head: g('.tl-head'), itemH: +item.getBoundingClientRect().height.toFixed(2),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      bodyX: (() => { const b = item.querySelector('.tl-body'); return b.scrollWidth - Math.ceil(b.clientWidth); })(),
      gapNameEn: +(g('.tl-en').t - (g('.tl-name').t + g('.tl-name').h)).toFixed(2) };
  });
  await ctx.close();
  return r;
};

console.log('\n== B 字号 +4 后不破坏布局 ==');
for (const W of [1440, 1100, 860, 480, 390, 360]) {
  const r = await geo(W);
  ok(`B[${W}] 实际字号 21 / 18.5 / 18.5 / 19`,
    r.name.fs === '21px' && r.en.fs === '18.5px' && r.meta.fs === '18.5px' && r.note.fs === '19px',
    [r.name.fs, r.en.fs, r.meta.fs, r.note.fs].join(' / '));
  ok(`B[${W}] 无横向溢出（正文溢出 ${r.bodyX}，页面溢出 ${r.overflow}）`,
    r.overflow === 0 && r.bodyX <= 0);
  ok(`B[${W}] 中英文留白仍是 12px`, Math.abs(r.gapNameEn - 12) < 0.02, `${r.gapNameEn}px`);
}
const d1440 = await geo(1440), d390 = await geo(390);
ok('B* 桌面条目高仍 142（海报 114 主导）', d1440.itemH === 142, `itemH=${d1440.itemH} bodyH=${d1440.head.h}`);
ok('B* 390 条目高随文字变大而增高（> 第 63 轮的 131）', d390.itemH > 131, `itemH=${d390.itemH}`);

/* ================= C 标题点击回顶 ================= */
console.log('\n== C 标题「My Watch List」点击回到顶部 ==');
const ctx = await browser.newContext({ viewport: { width: 1440, height: 700 } });
const p = await ctx.newPage();
const errsC = [];
p.on('pageerror', (e) => errsC.push(String(e)));
await p.goto(BASE, { waitUntil: 'load' });
await p.waitForTimeout(800);
const titleInfo = await p.evaluate(() => {
  const t = document.getElementById('w-title');
  const cs = getComputedStyle(t);
  return { cursor: cs.cursor, role: t.getAttribute('role'), tab: t.getAttribute('tabindex'),
    label: t.getAttribute('aria-label'), text: t.textContent.trim(), userSelect: cs.userSelect };
});
ok('C1 标题可识别为按钮（role/tabindex/label/cursor）',
  titleInfo.cursor === 'pointer' && titleInfo.role === 'button' && titleInfo.tab === '0' &&
  /* 第 70 轮：站名由 My Watch List 改为 Watch List */
  titleInfo.label === '回到页面顶部' && titleInfo.text === 'Watch List', JSON.stringify(titleInfo));

const openAdd = async () => { await p.click('#w-fab'); await p.waitForTimeout(250); };
const closeAdd = async () => { await p.keyboard.press('Escape'); await p.waitForTimeout(250); };

/* 造出可滚动的页面：多插几条 mock 数据 */
const c2 = await browser.newContext({ viewport: { width: 1440, height: 700 } });
const p2 = await c2.newPage();
const errsC2 = [];
p2.on('pageerror', (e) => errsC2.push(String(e)));
await p2.route('**/data/watch.json*', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
  updated_at: '2026-10-24T10:00:00+08:00',
  items: Array.from({ length: 24 }, (_, i) => ({
    id: 'x' + i, title: `片名 ${i + 1}`, title_en: 'Dead To Rights', kind: 'movie', year: 2020,
    watched_at: `2026-${String(10 - Math.floor(i / 10)).padStart(2, '0')}-${String(28 - (i % 28)).padStart(2, '0')}`,
    rating: 8, note: '这是一句评语', poster: 'img/minion-0ef9a202.webp' })),
}) }));

const scrollToBottom = async (pg) => {
  await pg.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await pg.waitForTimeout(500);
  return pg.evaluate(() => window.scrollY);
};
const scrollY = (pg) => pg.evaluate(() => window.scrollY);
const waitTop = async (pg, ms = 2500) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if ((await pg.evaluate(() => window.scrollY)) === 0) return true;
    await pg.waitForTimeout(120);
  }
  return false;
};

await p2.goto(BASE, { waitUntil: 'load' });
await p2.waitForTimeout(900);
let bottom = await scrollToBottom(p2);
ok('C2 页面确实可滚动（滚到底 scrollY > 0）', bottom > 0, `scrollY=${bottom}`);
await p2.click('#w-title');
ok('C3 点击标题后回到最顶端（平滑滚动结束 scrollY = 0）', await waitTop(p2), `scrollY=${await scrollY(p2)}`);

bottom = await scrollToBottom(p2);
await p2.focus('#w-title');
await p2.keyboard.press('Enter');
ok('C4 键盘 Enter 也能回顶', await waitTop(p2), `scrollY=${await scrollY(p2)}`);

bottom = await scrollToBottom(p2);
await p2.focus('#w-title');
await p2.keyboard.press(' ');
ok('C5 键盘空格也能回顶', await waitTop(p2), `scrollY=${await scrollY(p2)}`);

/* 时间轴视图下同样可用 */
await p2.click('#w-avatar');
await p2.waitForTimeout(600);
bottom = await scrollToBottom(p2);
await p2.click('#w-title');
ok('C6 时间轴视图下点标题同样回顶', await waitTop(p2), `scrollY=${await scrollY(p2)}`);
await c2.close();

/* 页面已在顶部时点击不出错 */
const topBefore = await scrollY(p);
await p.click('#w-title');
await p.waitForTimeout(700);
ok('C7 已在顶部时点击无副作用（仍为 0 且无异常）',
  (await scrollY(p)) === 0 && errsC.length === 0, `before=${topBefore} after=${await scrollY(p)}`);

/* reduced-motion 下应立即跳（不做平滑） */
const c3 = await browser.newContext({ viewport: { width: 1440, height: 700 }, reducedMotion: 'reduce' });
const p3 = await c3.newPage();
const errsC3 = [];
p3.on('pageerror', (e) => errsC3.push(String(e)));
await p3.route('**/data/watch.json*', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
  updated_at: '2026-10-24T10:00:00+08:00',
  items: Array.from({ length: 24 }, (_, i) => ({ id: 'y' + i, title: `片名 ${i + 1}`, kind: 'movie',
    watched_at: `2026-10-${String(28 - (i % 28)).padStart(2, '0')}`, poster: 'img/minion-0ef9a202.webp' })),
}) }));
await p3.goto(BASE, { waitUntil: 'load' });
await p3.waitForTimeout(900);
await p3.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
await p3.waitForTimeout(400);
await p3.click('#w-title');
await p3.waitForTimeout(150);
const reducedY = await p3.evaluate(() => window.scrollY);
ok('C8 prefers-reduced-motion 下立即跳顶（150ms 内 scrollY 已 0，不做平滑）', reducedY === 0, `scrollY=${reducedY}`);
await c3.close();

ok('C9 标题相关交互零 JS 异常', errsC.length === 0 && errsC2.length === 0 && errsC3.length === 0,
  errsC.concat(errsC2, errsC3).join(' | '));
await ctx.close();
ok('D1 全程零 JS 异常', errs.length === 0, errs.join(' | '));

await browser.close();
console.log(`\n===== 第 64 轮回归：${pass}/${pass + fail} =====`);
process.exit(fail ? 1 : 0);
