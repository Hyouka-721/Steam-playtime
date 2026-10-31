/* 第 84 轮（watch 侧 · 第一批 P0）移动端布局修复
   用户指令：「先做第一批」—— 即设计评审里的三条 P0：

   P0-1 移动端页眉改两行式：标题不再折三行，页眉 240px → 183px
   P0-2 移动端筛选条两组各占满一行：换行后不再「都贴左」
   P0-3 移动端时间轴缩略图顶对齐 + 短评 text-wrap:pretty（治段末孤字）

   ⚠️ 三条契约边界（继续由别的套件守，本套件不得放宽）：
   ① 标题字号仍是 44px/1px，与首页 .site-title 同值 —— verify58 A3
   ② .w-header 横向 padding 仍是 16px，logo/avatar 的 left/right 与首页逐像素相同 —— verify58 B
   ③ 桌面 ≥861 完全不受影响：时间轴缩略图仍垂直居中 —— verify62 A7

   写法约定：静态断言读 docs/watch.css 原文；运行时断言走本地 8895 静态服务。 */
import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const BASE = 'http://127.0.0.1:8895/';
const ROOT = 'C:/Users/33329/WorkBuddy/2026-10-13-18-17-49/steam-playtime/docs/';
const OUT = 'C:/Users/33329/AppData/Local/Temp/fx_verify_20261018/shots84/';
fs.mkdirSync(OUT, { recursive: true });

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('PASS ' + name + (extra ? '  — ' + extra : '')); }
  else { fail++; console.log('FAIL ' + name + (extra ? '  — ' + extra : '')); }
};

const css = fs.readFileSync(ROOT + 'watch.css', 'utf8');
const html = fs.readFileSync(ROOT + 'watch.html', 'utf8');
const ncss = css.replace(/\r\n/g, '\n');

/* 按「块起点」取某个 @media 块的内容（到下一个同级 @media 或文件末） */
const blockOf = (src, head) => {
  const i = src.indexOf(head);
  if (i < 0) return '';
  const rest = src.slice(i + head.length);
  const next = rest.search(/\n@media /);
  return next < 0 ? rest : rest.slice(0, next);
};
/* ⚠️ 必须先剥注释再匹配：注释里若出现「.w-title{...}」这种字面量，
   正则会把它当成规则体，取出一条 `...` 的假声明（第 84 轮踩过）。 */
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const b480 = stripComments(blockOf(ncss, '@media (max-width: 480px)'));
const b860 = stripComments(blockOf(ncss, '@media (max-width: 860px)'));
const rule = (src, sel) => {
  const m = src.match(new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}'));
  return m ? m[1] : '';
};

console.log('== A 静态：CSS 规则 ==');

const title480 = rule(b480, '.w-title');
ok('A1 ≤480 块 .w-title 两行式定位 + 字号 44px/1px 未动（verify58 A3 的契约）',
  /grid-row:\s*2/.test(title480) && /grid-column:\s*1\s*\/\s*-1/.test(title480) &&
  /font-size:\s*44px/.test(title480) && /letter-spacing:\s*1px/.test(title480),
  title480.trim().replace(/\s+/g, ' '));

ok('A2 ≤480 块 .w-home / .w-avatar 都落在 grid-row:1（与标题分行）',
  /grid-row:\s*1/.test(rule(b480, '.w-home')) && /grid-row:\s*1/.test(rule(b480, '.w-avatar')) &&
  /grid-column:\s*1/.test(rule(b480, '.w-home')) && /grid-column:\s*3/.test(rule(b480, '.w-avatar')));

const header480 = rule(b480, '.w-header');
ok('A3 ≤480 块 .w-header 横向 padding 仍是 16px（改 18 会让两页图标错位、verify58 B FAIL）',
  /padding:\s*12px\s+16px\s+10px/.test(header480) && !/padding:[^;]*18px/.test(header480),
  header480.trim());

ok('A4 ≤480 块：两组控件各占满一行、按钮等分',
  /\.w-seg,\s*\.w-sort\s*\{[^}]*flex:\s*1\s+1\s+100%/.test(b480) &&
  /\.w-seg-btn,\s*\.w-sort-btn\s*\{[^}]*flex:\s*1\b/.test(b480));

ok('A5 .tl-item 顶对齐写在**既有的** 860 块里，且全文件只有 1 个 860 块（verify60/62 的取值前提）',
  (ncss.match(/@media \(max-width: 860px\)/g) || []).length === 1 &&
  /\.tl-item\s*\{[^}]*align-items:\s*flex-start/.test(b860));

ok('A6 ≤480 块 .tl-note 带 text-wrap:pretty',
  /text-wrap:\s*pretty/.test(rule(b480, '.tl-note')));

ok('A7 版本号 watch.css?v=22 / watch.js?v=16',
  /watch\.css\?v=22/.test(html) && /watch\.js\?v=16/.test(html));

console.log('\n== B 运行时 390px ==');

const browser = await chromium.launch({ args: ['--no-proxy-server'] });

const lastLineChars = (el) => {
  if (!el) return -1;
  const t = el.firstChild;
  if (!t || t.nodeType !== 3 || t.length < 2) return 99;
  const r = document.createRange();
  const topOf = (i) => { r.setStart(t, i); r.setEnd(t, i + 1); return r.getBoundingClientRect().top; };
  const lastTop = topOf(t.length - 1);
  let n = 1;
  for (let i = t.length - 2; i >= 0; i--) {
    if (Math.abs(topOf(i) - lastTop) > 2) break;
    n++;
  }
  return n;
};

{
  const errs = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(String(e).slice(0, 120)));
  await p.goto(BASE + 'watch.html', { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => document.querySelectorAll('#w-grid .poster').length > 0, null, { timeout: 40000 });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(900);

  const m = await p.evaluate(() => {
    const r = (s) => { const e = document.querySelector(s); return e ? e.getBoundingClientRect() : null; };
    const t = document.querySelector('.w-title');
    const cs = t && getComputedStyle(t);
    const seg = r('.w-seg'), sort = r('.w-sort');
    const poster = r('#w-grid .poster');
    return {
      headerH: Math.round(r('.w-header').height),
      titleH: Math.round(t.getBoundingClientRect().height),
      lines: Math.round(t.getBoundingClientRect().height / parseFloat(cs.lineHeight)),
      fs: cs.fontSize, ls: cs.letterSpacing,
      segW: Math.round(seg.width), sortW: Math.round(sort.width),
      segTop: Math.round(seg.top), sortTop: Math.round(sort.top),
      available: Math.round(document.querySelector('.w-seg').getBoundingClientRect().width),
      posterTop: Math.round(poster.top),
      vw: window.innerWidth,
    };
  });
  await p.screenshot({ path: OUT + 'B_390_首屏.png' });

  ok('B1 页眉 ≤ 190px（改前实测 240）', m.headerH <= 190 && m.headerH > 0, m.headerH + 'px');
  ok('B2 标题单行（改前三行）', m.lines === 1, m.lines + ' 行 / 高 ' + m.titleH + 'px');
  ok('B3 标题字号仍 44px/1px（跨页契约，不许为了排版缩字号）', m.fs === '44px' && m.ls === '1px', m.fs + ' / ' + m.ls);
  ok('B4 两组控件等宽且撑满可用宽（视口 − 36）',
    m.segW === m.sortW && Math.abs(m.segW - (m.vw - 36)) <= 2, `seg=${m.segW} sort=${m.sortW} 期望=${m.vw - 36}`);
  ok('B5 两组确实分成两行（top 不同），且都铺满 → 不会出现「单元素行退化成左对齐」',
    Math.abs(m.segTop - m.sortTop) > 20, `segTop=${m.segTop} sortTop=${m.sortTop}`);
  ok('B6 首屏首张海报起点 ≤ 330px（改前 379）', m.posterTop <= 330, m.posterTop + 'px');

  await p.click('#w-avatar');
  await p.waitForFunction(() => document.querySelectorAll('#w-tl .tl-item').length > 0, null, { timeout: 40000 });
  await p.waitForTimeout(800);

  const tl = await p.evaluate((fn) => {
    const items = [...document.querySelectorAll('#w-tl .tl-item')].slice(0, 3);
    const lastChar = new Function('el', 'return (' + fn + ')(el)');
    const rows = items.map((it) => {
      const th = it.querySelector('.tl-thumb').getBoundingClientRect();
      const nm = it.querySelector('.tl-name').getBoundingClientRect();
      const note = it.querySelector('.tl-note');
      return {
        name: (it.querySelector('.tl-name') || {}).textContent || '',
        delta: Math.round(th.top - nm.top),
        lastLen: note ? lastChar(note) : -1,
      };
    });
    return { rows, n: document.querySelectorAll('#w-tl .tl-item').length };
  }, lastLineChars.toString());
  await p.screenshot({ path: OUT + 'B_390_时间轴.png' });

  const worst = tl.rows.reduce((a, r) => Math.max(a, Math.abs(r.delta)), 0);
  ok('B7 时间轴缩略图与片名顶对齐（差 ≤ 2px；改前缩略图漂在文字块中间）',
    worst <= 2, tl.rows.map((r) => `${r.name}:${r.delta}`).join(' '));

  const lone = tl.rows.filter((r) => r.lastLen === 1);
  ok('B8 前 3 条短评末行不是单字（text-wrap:pretty 生效）',
    tl.rows.length > 0 && lone.length === 0,
    tl.rows.map((r) => `${r.name}:末行${r.lastLen}字`).join(' '));

  ok('B9 390px 全程零 JS 异常', errs.length === 0, errs.slice(0, 2).join(' | '));
  await ctx.close();
}

console.log('\n== C 桌面守护（≥861 不许受影响）==');
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  await p.goto(BASE + 'watch.html', { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => document.querySelectorAll('#w-grid .poster').length > 0, null, { timeout: 40000 });
  await p.waitForTimeout(900);

  const d = await p.evaluate(() => {
    const r = (s) => document.querySelector(s).getBoundingClientRect();
    const t = document.querySelector('.w-title');
    const cs = getComputedStyle(t);
    const seg = r('.w-seg'), sort = r('.w-sort');
    return {
      headerH: Math.round(r('.w-header').height),
      fs: cs.fontSize,
      lines: Math.round(t.getBoundingClientRect().height / parseFloat(cs.lineHeight)),
      sameRow: Math.abs(Math.round(seg.top) - Math.round(sort.top)) < 4,
      cols: getComputedStyle(document.getElementById('w-grid')).gridTemplateColumns.split(' ').length,
    };
  });
  ok('C1 桌面页眉 173±2px、标题 70px 单行（两行式只在 ≤480 生效）',
    Math.abs(d.headerH - 173) <= 2 && d.fs === '70px' && d.lines === 1,
    `hdr=${d.headerH} fs=${d.fs} lines=${d.lines}`);
  ok('C2 桌面筛选条仍在同一行、网格仍 5 列', d.sameRow && d.cols === 5, `sameRow=${d.sameRow} cols=${d.cols}`);

  await p.click('#w-avatar');
  await p.waitForFunction(() => document.querySelectorAll('#w-tl .tl-item').length > 0, null, { timeout: 40000 });
  await p.waitForTimeout(700);
  const tl = await p.evaluate(() => {
    const it = document.querySelector('#w-tl .tl-item');
    const th = it.querySelector('.tl-thumb').getBoundingClientRect();
    const nm = it.querySelector('.tl-name').getBoundingClientRect();
    return { delta: Math.round(th.top - nm.top) };
  });
  ok('C3 桌面时间轴缩略图仍垂直居中（delta < 0，第 63 轮设计；flex-start 只在窄屏）',
    tl.delta < 0, 'delta=' + tl.delta + 'px');
  await p.screenshot({ path: OUT + 'C_1440_首屏.png' });
  await ctx.close();
}

await browser.close();
console.log(`\n===== 第 84 轮（watch · 第一批 P0）：PASS ${pass} / FAIL ${fail} =====`);
if (fail > 0) process.exitCode = 1;
