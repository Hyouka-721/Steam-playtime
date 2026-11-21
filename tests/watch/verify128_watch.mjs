/* verify128_watch.mjs — 第 128 轮：Watch 页六项视觉精修（不含视觉层级，用户要求）
   ① 布局结构：歌单年份分组之间极细金分隔（伪元素，不占布局，不改列数 10/5/2）
   ② 配色：海报评分 hover 辉光（只加 text-shadow，不动字色 #dcb978 / var(--accent)）
   ③ 字体：短评 poster-note/tl-note 衬线族（字号12px / 色 rgb(168,168,180) / 两行clamp 不动）
   ④ 留白：年报面板标题字距微增（h3 font-size14 / margin 不动）
   ⑤ 组件风格：录入 dialog 顶部金高光条伪元素 + 歌单 hover 柔金内高光
   ⑥ 动效：海报/年报卡入场纯 opacity 淡入（不位移）+ reduced-motion 关闭
   冻结值守门：st-panel 跨度 4/2/2/4、12栏栅格、860复位、圆角令牌、w-grid minmax234+gap34/12、
   歌单列数10/5/2、st-songs margin-top14+h3 font14、poster-note 12px、w-sort-btn.is-on 语义。
   用法：node tests/watch/verify128_watch.mjs（需先起 8895 服务） */
import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const ROOT = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const BASE = 'http://127.0.0.1:8895/';
let pass = 0, fail = 0;
const ok = (n, c, x) => {
  c ? (pass++, console.log('PASS ', n, x === undefined ? '' : '— ' + JSON.stringify(x)))
    : (fail++, console.log('FAIL ', n, '— ' + JSON.stringify(x)));
};

const css = fs.readFileSync(ROOT + 'docs/watch.css', 'utf8');
const code = css.replace(/\/\*[\s\S]*?\*\//g, '');   // 剥注释
const html = fs.readFileSync(ROOT + 'docs/watch.html', 'utf8');
const js = fs.readFileSync(ROOT + 'docs/watch.js', 'utf8');

// ---- A. 静态契约 ----
ok('A1 只 bump watch.css→v45；watch.js?v=35 未动',
  /watch\.css\?v=45/.test(html) && /watch\.js\?v=35/.test(html) &&
  !/watch\.css\?v=44/.test(html));
ok('A2 六项规则齐备：年份分隔/评分辉光/衬线/字距/dialog高光/入场淡入',
  /\.st-song-year \+ \.st-song-year::before/.test(code) &&
  /var\(--gold-soft\)/.test(code) &&
  /'Songti SC'/.test(code) && /serif/.test(code) &&
  /\.st-panel h3, \.st-songs h3 \{ letter-spacing: \.6px/.test(code) &&
  /\.w-add::before/.test(code) &&
  /@keyframes w-fade-in/.test(code));
ok('A3 冻结值未动：st-panel 跨度4/2/2/4、12栏、860复位、w-grid 234+gap34/12、歌单10/5/2、st-songs margin14',
  /\.st-panel\[data-panel="months"\]\s*\{ grid-column: span 4/.test(code) &&
  /\.st-panel\[data-panel="buckets"\]\s*\{ grid-column: span 2/.test(code) &&
  /\.st-panels \{[\s\S]*?repeat\(12,/.test(code) &&
  /@media \(max-width: 860px\)/.test(code) &&
  /minmax\(234px, 1fr\)/.test(code) && /gap: 34px 12px/.test(code) &&
  /grid-template-columns: repeat\(10, minmax\(0, 1fr\)\)/.test(code) &&
  /\.st-songs \{[^}]*margin-top: 14px/.test(code));
ok('A4 w-sort-btn.is-on 语义未动（追加规则不改它）',
  /\.w-sort \.w-stats-btn\.is-on \{[^}]*var\(--accent-wash\)/.test(code) || /\.w-sort-btn\.is-on/.test(html));
// 只检查第 128 轮追加区块（从 --gold-soft 声明起）内无裸圆角数值
const addedBlock = code.slice(code.indexOf('--gold-soft'));
ok('A5 860 断点全文件仍只 1 个；新增规则无裸圆角数值',
  (code.match(/@media \(max-width: 860px\)/g) || []).length === 1 &&
  !/border-radius:\s*\d+px/.test(addedBlock));
ok('A6 watch.js 未被本轮改动（无 title=、无新动效 JS）',
  !/w-fade-in/.test(js) && !/title="/.test(js));

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto(BASE + 'watch.html?cb=' + Date.now(), { waitUntil: 'load' });
await page.waitForFunction(() => document.querySelector('#w-grid .poster') || !!document.querySelector('.w-empty'), null, { timeout: 20000 });
await page.waitForTimeout(400);

// ③ 字体：短评衬线（有短评时验证）
const noteFam = await page.evaluate(() => {
  const n = document.querySelector('#w-grid .poster-note');
  return n ? getComputedStyle(n).fontFamily : null;
});
ok('B1 短评衬线族生效（或数据无短评时跳过但记录）',
  noteFam === null || /Songti|serif|Georgia/.test(noteFam), { noteFam });

// ⑥ 海报入场淡入（须在切到时间轴之前测，网格此时可见）
const anim = await page.evaluate(() => {
  const p = document.querySelector('#w-grid .poster');
  return p ? getComputedStyle(p).animationName : null;
});
ok('B5 海报入场动画为 w-fade-in（纯 opacity，不位移）',
  anim === null || anim === 'w-fade-in', { anim });

// 年报按钮只在时间轴视图出现（第 93 轮契约）→ 先切时间轴再展开年报
await page.click('#w-avatar');
await page.waitForFunction(() => {
  const b = document.getElementById('w-stats-btn');
  return b && !b.hidden;
}, null, { timeout: 15000 });
await page.click('#w-stats-btn');
await page.waitForFunction(() => !!document.querySelector('.st-panel h3'), null, { timeout: 15000 });
await page.waitForTimeout(400);

// ④ 字距：年报面板标题
const ls = await page.evaluate(() => {
  const h = document.querySelector('.st-panel h3');
  return h ? getComputedStyle(h).letterSpacing : null;
});
ok('B2 年报面板标题字距 0.6px',
  ls !== null && Math.abs(parseFloat(ls) - 0.6) < 0.02, { ls });

// ① 年份分隔伪元素：年报已展开
const sep = await page.evaluate(() => {
  const years = document.querySelectorAll('.st-song-year');
  if (years.length < 2) return { years: years.length, skip: true };
  const cs = getComputedStyle(years[1], '::before');
  return { years: years.length, content: cs.content, position: cs.position, height: cs.height };
});
ok('B3 歌单年份分组之间有绝对定位金分隔（不占布局）',
  sep.skip || (sep.content !== 'none' && sep.position === 'absolute' && parseFloat(sep.height) === 1), sep);

// ⑤ dialog 顶部高光条（打开录入弹窗）
await page.click('.w-fab');
await page.waitForTimeout(250);
const dlg = await page.evaluate(() => {
  const d = document.querySelector('.w-add');
  if (!d) return { missing: true };
  const cs = getComputedStyle(d, '::before');
  return { open: d.open, content: cs.content, position: cs.position, height: cs.height };
});
ok('B4 录入弹窗顶部金色高光条（伪元素，不占布局）',
  !dlg.missing && dlg.content !== 'none' && dlg.position === 'absolute' && parseFloat(dlg.height) === 2, dlg);
await page.keyboard.press('Escape');

// reduced-motion（独立 context，默认是网格视图）
const rmCtx = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
const rm = await rmCtx.newPage();
await rm.goto(BASE + 'watch.html?cb=' + Date.now(), { waitUntil: 'load' });
await rm.waitForFunction(() => document.querySelector('#w-grid .poster') || !!document.querySelector('.w-empty'), null, { timeout: 20000 });
const rmAnim = await rm.evaluate(() => {
  const p = document.querySelector('#w-grid .poster');
  return p ? getComputedStyle(p).animationName : null;
});
ok('B6 reduced-motion 下入场动画关闭', rmAnim === null || rmAnim === 'none', { rmAnim });
await rmCtx.close();

ok('C1 全程零 JS 异常', errs.length === 0, errs.slice(0, 4));
await browser.close();
console.log(`\n第 128 轮 Watch 视觉精修：${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
