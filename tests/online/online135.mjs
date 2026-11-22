/* online135.mjs — 第 135 轮上线复验：不牺牲性能的流畅度增强
 * ① 指纹：motion.css?v=1 / motion.js?v=1 线上四资源 md5 与本地全等，两页都引用
 * ② 静态：content-visibility 只在 .st-panel；rv/flat 变体；微反馈伪元素；reduced-motion 全关
 * ③ 运行时：两页卡片 rv 淡入、榜单 flat、poster 仍 w-fade-in未被接管、reduced-motion 不淡入
 * 用法：node tests/online/online135.mjs */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import crypto from 'node:crypto';

const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');
const SITE = process.env.ONLINE_SITE || 'https://hyouka-721.github.io/Steam-playtime/';
const ROOT = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
let pass = 0, fail = 0;
const ok = (n, c, x) => {
  c ? (pass++, console.log('PASS ', n, x === undefined ? '' : '— ' + JSON.stringify(x)))
    : (fail++, console.log('FAIL ', n, '— ' + JSON.stringify(x)));
};
const md5 = (s) => crypto.createHash('md5').update(Buffer.from(String(s).replace(/\r\n/g, '\n'), 'utf8')).digest('hex');

const L = {
  css: fs.readFileSync(ROOT + 'docs/motion.css', 'utf8'),
  js: fs.readFileSync(ROOT + 'docs/motion.js', 'utf8'),
};
const browser = await chromium.launch({ args: ['--no-proxy-server'] });

// 指纹
const c0 = await browser.newContext({ serviceWorkers: 'block' });
const fp = await c0.newPage();
await fp.goto(SITE, { waitUntil: 'domcontentloaded', timeout: 60000 });
const D = await fp.evaluate(async ({ site }) => {
  const g = async (u) => { const r = await fetch(site + u, { cache: 'reload' }); return { s: r.status, t: await r.text() }; };
  const cb = Date.now();
  const [c, j, i, w] = await Promise.all([g('motion.css?v=1&cb=' + cb), g('motion.js?v=1&cb=' + cb), g('index.html?cb=' + cb), g('watch.html?cb=' + cb)]);
  return { c: c.t, j: j.t, i: i.t, w: w.t, st: [c.s, j.s, i.s, w.s] };
}, { site: SITE });
ok('A1 线上 motion.css/js 与两页引用全 200',
  D.st.every(s => s === 200) && /motion\.css\?v=1/.test(D.i) && /motion\.js\?v=1/.test(D.i) &&
  /motion\.css\?v=1/.test(D.w) && /motion\.js\?v=1/.test(D.w), { st: D.st });
ok('A2 motion.css / motion.js md5 与本地全等',
  md5(D.c) === md5(L.css) && md5(D.j) === md5(L.js));
const code = D.c.replace(/\/\*[\s\S]*?\*\//g, '');
ok('A3 content-visibility 只给 .st-panel，不碰 rank-item/tl-item',
  /\.st-panel\s*\{[^}]*content-visibility:\s*auto/.test(code) &&
  !/\.rank-item\s*\{[^}]*content-visibility:\s*auto/.test(code) &&
  !/\.tl-item\s*\{[^}]*content-visibility:\s*auto/.test(code));
ok('A4 rv/flat 变体 + 微反馈 + reduced-motion 全关',
  /\.rv\.flat \{ transform: none; \}/.test(code) &&
  /\.card:hover::after/.test(code) && /\.w-sort-btn:active::after/.test(code) &&
  /@media \(prefers-reduced-motion: reduce\)/.test(code));
await c0.close();

// 运行时：index
const c1 = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
const p1 = await c1.newPage();
await p1.goto(SITE + '?cb=' + Date.now(), { waitUntil: 'load', timeout: 60000 });
await p1.waitForTimeout(1400);
const r1 = await p1.evaluate(() => {
  const cards = [...document.querySelectorAll('.card')];
  const rows = [...document.querySelectorAll('#lt-list .rank-item')];
  return { cards: cards.length, cardsIn: cards.filter(e => e.classList.contains('in')).length,
    rows: rows.length, rowsFlat: rows.filter(e => e.classList.contains('flat')).length };
});
ok('B1 GameTime：卡片 rv 淡入 + 榜单 flat（纯 opacity）',
  r1.cards > 0 && r1.cardsIn === r1.cards && r1.rows > 0 && r1.rowsFlat === r1.rows, r1);
await c1.close();

// 运行时：watch poster 契约
const c2 = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
const p2 = await c2.newPage();
await p2.goto(SITE + 'watch.html?cb=' + Date.now(), { waitUntil: 'load', timeout: 60000 });
// 线上比本地慢：必须等海报渲染出来再验，否则 posters=0 是采样太早而非功能问题
await p2.waitForSelector('#w-grid .poster', { timeout: 40000 });
await p2.waitForTimeout(500);
const r2 = await p2.evaluate(() => ({
  posters: document.querySelectorAll('.poster').length,
  rvPosters: document.querySelectorAll('.poster.rv').length,
  anim: (() => { const e = document.querySelector('#w-grid .poster'); return e ? getComputedStyle(e).animationName : 'no-el'; })()
}));
ok('B2 WatchList：poster 未被 rv 接管，仍 w-fade-in（verify128 契约）',
  r2.posters > 0 && r2.rvPosters === 0 && (r2.anim === 'w-fade-in' || r2.anim === 'none'), r2);
await c2.close();

// 运行时：reduced-motion
const c3 = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
const p3 = await c3.newPage();
await p3.goto(SITE + '?cb=' + Date.now(), { waitUntil: 'load', timeout: 60000 });
await p3.waitForTimeout(800);
const r3 = await p3.evaluate(() => {
  const e = document.querySelector('.card');
  return e ? { rv: e.classList.contains('rv'), opacity: getComputedStyle(e).opacity } : null;
});
ok('B3 reduced-motion 下卡片不淡入（可见且不挂 rv）', !!r3 && !r3.rv && r3.opacity === '1', r3);
await c3.close();

await browser.close();
console.log(`\n线上第 135 轮：${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
