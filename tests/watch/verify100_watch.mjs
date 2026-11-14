/* 第 100 轮 watch 侧回归：表单精简 · 年度影视海报墙 · 饼图去黑缝
 *
 * 用户原话（三条）：
 *   1. 删除「上映日期」及其界面；将「排序 / 国别 / 标签」并列到同一行；
 *      同时删掉国别的说明文字（逗号或顿号分隔，可留空；如 美国, 英国）和标签的说明文字（逗号或顿号分隔）。
 *   2. 年度影视中海报采用网格视图相同规格，仅展示海报和年份，不展示片名和评分。
 *   3. 饼图中两个区块之间有黑色的区域分隔，删除这些黑色。
 *
 * ① 表单：#add-release 整条录入线删干净（HTML / FIELD_IDS / readReleaseField / 预填 / 两处写库），
 *    时间轴 releaseText() 对历史数据的兜底读取与 CLI --release 保留（与界面无关，数据里 0 条有该字段）。
 * ② 年度影视：只渲染 .st-top-img + .st-top-year；海报用 .poster-pic 同款规格
 *    （2:3 / --r-md / 1px 边框 / --card-shadow / hover 上浮），列宽与 .w-grid 同档 234/200/156。
 * ③ 饼图：stPie 原来 1.1° 的缝靠面板底色透出来（就是黑色分隔），改成首尾相接画满整圆。
 *
 * ⚠️ 功能性删除/变更，旧套件判据已同步改判（verify91 A2/A3、verify96 B6、verify97 B4、
 *    verify99 A6/B2/B4、online91 B7、online96 A4/A5/B5/D1、online99 A6/B2/B4），理由写在各自 ok 文案里。
 */
import { createRequire } from 'module';
import fs from 'fs';
import { fileURLToPath } from 'url';

const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const BASE = 'http://127.0.0.1:8895/';
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const rd = (p) => fs.readFileSync(ROOT + 'docs/' + p, 'utf8').replace(/\r\n/g, '\n');
const stripCmt = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');

const html = rd('watch.html');
const js = stripCmt(rd('watch.js'));
const css = stripCmt(rd('watch.css'));

const PICKS = ['2026', '2025', '2024', '2023', '2022', '2021', '2020', '2019', '2018'];

let pass = 0, fail = 0;
const ok = (n, c, extra = '') => {
  c ? (pass++, console.log(`PASS ${n}${extra ? '  — ' + extra : ''}`))
    : (fail++, console.log(`FAIL ${n}  — ${extra}`));
};
const angDiff = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

/* ---------------- A 静态契约 ---------------- */
console.log('== A 静态契约 ==');
ok('A1 版本号：watch.html 引用 watch.css?v=41 / watch.js?v=33（三个 docs 文件都改了，两条缓存键各 bump）',
  /watch\.css\?v=41/.test(html) && /watch\.js\?v=33/.test(html),
  (html.match(/watch\.(css|js)\?v=\d+/g) || []).join(' '));

/* ⚠️ 源码注释里写了「删除上映日期」这句话，静态判据必须先剥 HTML 注释再判界面标记；
   弹窗里到底有没有该字样，由 B4 用 DOM textContent 正面验证（注释不会进 textContent）。 */
const htmlNC = html.replace(/<!--[\s\S]*?-->/g, '');
ok('A2 上映日期入口已删：HTML（剥注释后）无 #add-release、无「上映日期」字样、无对应 label/hint',
  !/id="add-release"/.test(htmlNC) && !/上映日期/.test(htmlNC) && !/for="add-release"/.test(htmlNC));

/* 三字段必须包进同一个 w-row-3，且顺序为 排序 → 国别 → 标签。
   从最近一个 w-row-3 开标签到 add-tags 之间应有 2 个 </div>（关掉前两个 .w-field）。 */
const oi = html.indexOf('id="add-order"');
const ci = html.indexOf('id="add-country"');
const ti = html.indexOf('id="add-tags"');
const rowOpen = html.lastIndexOf('<div class="w-row w-row-3">', ci);
const seg = html.slice(rowOpen, ti + 20);
ok('A3 排序 / 国别 / 标签包进同一个 .w-row.w-row-3（三列栅格，顺序正确）',
  rowOpen > 0 && oi > rowOpen && ci > oi && ti > ci && (seg.match(/<\/div>/g) || []).length === 2,
  `rowOpen@${rowOpen} order@${oi} country@${ci} tags@${ti}`);

ok('A4 国别与标签的说明文字都删了，label 只剩「国别」/「标签」二字',
  /for="add-country">国别<\/label>/.test(html) && /for="add-tags">标签<\/label>/.test(html) &&
  !/for="add-country">国别<span/.test(html) && !/for="add-tags">标签<span/.test(html) &&
  !/逗号或顿号分隔/.test(html));

ok('A5 JS 里上映日期录入整条线已删干净；releaseText() 对历史数据的兜底读取仍在',
  !/'add-release'|id="add-release"|readReleaseField|rejectRelease|releaseRead|RELEASE_ERR/.test(js) &&
  !/next\.release_date|item\.release_date/.test(js) &&
  /if \(it\.release_date\) return String\(it\.release_date\)/.test(js));

ok('A6 年度影视只渲染海报 + 年份；CSS 里海报用网格视图同款规格、列宽同档、860 块仍只有 1 个',
  /'<img class="st-top-img"/.test(js) && /'<span class="st-top-year">'/.test(js) &&
  !/st-top-name|st-top-score/.test(js) && !/\.st-top-name|\.st-top-score/.test(css) &&
  /\.st-top-list \{[^}]*display: grid;[^}]*minmax\(234px, 1fr\)/.test(css) &&
  /\.st-top-img \{[^}]*aspect-ratio: 2 \/ 3;[^}]*var\(--r-md\)[^}]*var\(--card-border\)[^}]*var\(--card-shadow\)/.test(css) &&
  /\.w-stats \.st-top-list \{[^}]*minmax\(156px, 1fr\)/.test(css) &&
  (css.match(/@media \(max-width: 860px\)/g) || []).length === 1,
  '860块=' + (css.match(/@media \(max-width: 860px\)/g) || []).length);

ok('A7 饼图不再留 1.1° 缝：源码首尾相接（a0=ang / a1=ang+sweep）、无 gap、stroke 仍为 none',
  /var ang = -90;/.test(js) && /var a0 = ang, a1 = ang \+ sweep;/.test(js) &&
  !/gap = 1\.1|1\.1° 的缝/.test(js) && /\.st-pie-slice \{ stroke: none; \}/.test(css));

/* ---------------- B 1920 运行时 ---------------- */
console.log('== B 1920 运行时 ==');
const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1200 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
await page.goto(BASE + 'watch.html', { waitUntil: 'load' });
await page.waitForSelector('#w-grid .poster', { timeout: 20000 });

/* 先在网格态量一张真实海报的规格，作为「网格视图相同规格」的基准 */
const gridSpec = await page.evaluate(() => {
  const e = document.querySelector('#w-grid .poster-pic');
  const cs = getComputedStyle(e);
  const b = e.getBoundingClientRect();
  return {
    w: Math.round(b.width), h: Math.round(b.height),
    radius: cs.borderRadius, border: cs.borderTopWidth, shadow: cs.boxShadow,
    ratio: cs.aspectRatio, fit: getComputedStyle(e.querySelector('img')).objectFit
  };
});

await page.click('#w-avatar');                       /* 年报按钮只在时间轴出现（第 93 轮契约） */
await page.waitForSelector('#w-tl .tl-item', { timeout: 20000 });
await page.click('#w-stats-btn');
await page.waitForSelector('.st-panel[data-panel="buckets"] svg.st-pie-chart', { timeout: 10000 });
await page.waitForTimeout(800);

const r = await page.evaluate(() => {
  const items = [...document.querySelectorAll('.st-top-item')].map((li) => {
    const img = li.querySelector('.st-top-img');
    const yr = li.querySelector('.st-top-year');
    const ib = img ? img.getBoundingClientRect() : null;
    const yb = yr ? yr.getBoundingClientRect() : null;
    const cs = img ? getComputedStyle(img) : null;
    return {
      year: yr ? yr.textContent.trim() : '',
      hasImg: !!(img && img.getAttribute('src')),
      w: ib ? Math.round(ib.width) : 0, h: ib ? Math.round(ib.height) : 0,
      ratio: cs ? cs.aspectRatio : '', radius: cs ? cs.borderRadius : '',
      border: cs ? cs.borderTopWidth : '', shadow: cs ? cs.boxShadow : '',
      fit: cs ? cs.objectFit : '',
      yearBelow: !!(ib && yb && yb.top >= ib.bottom - 1),
    };
  });
  const list = document.querySelector('.st-top-list');
  const lcs = list ? getComputedStyle(list) : null;
  /* 饼图：把每片 path 的起止角反算出来，验证首尾严格相接、整圆闭合 */
  const paths = [...document.querySelectorAll('[data-panel="buckets"] .st-pie-slice')];
  const ang = (x, y) => (Math.atan2(Number(y) - 50, Number(x) - 50) * 180 / Math.PI + 360) % 360;
  const segs = paths.map((p) => {
    const m = /L ([\d.]+) ([\d.]+) A 46 46 0 \d 1 ([\d.]+) ([\d.]+)/.exec(p.getAttribute('d') || '');
    return m ? { a0: ang(m[1], m[2]), a1: ang(m[3], m[4]) } : null;
  });
  return {
    items,
    cols: lcs ? lcs.gridTemplateColumns.split(' ').length : 0,
    display: lcs ? lcs.display : '',
    hasName: !!document.querySelector('.st-top-name'),
    hasScore: !!document.querySelector('.st-top-score'),
    segs, stroke: paths[0] ? getComputedStyle(paths[0]).stroke : '',
    ov: document.documentElement.scrollWidth - document.documentElement.clientWidth
  };
});

ok('B1 年度影视 9 条：年份逐条正确、每条有海报、DOM 里没有片名与评分节点',
  r.items.length === 9 && PICKS.every((y, i) => r.items[i] && r.items[i].year === y) &&
  r.items.every((it) => it.hasImg) && !r.hasName && !r.hasScore,
  r.items.map((it) => it.year + '·' + (it.hasImg ? '有' : '缺')).join(' '));

ok('B2 海报网格：grid 且 ≥3 列；海报 2:3 比例、圆角/边框/阴影/object-fit 与网格视图海报逐项全等，宽度差 ≤20%',
  r.display === 'grid' && r.cols >= 3 &&
  r.items.every((it) => it.ratio === gridSpec.ratio && it.radius === gridSpec.radius &&
    it.border === gridSpec.border && it.shadow === gridSpec.shadow && it.fit === gridSpec.fit &&
    Math.abs(it.w / it.h - 2 / 3) < 0.02 &&
    Math.abs(it.w - gridSpec.w) <= gridSpec.w * 0.2),
  `列${r.cols} 年度海报${r.items[0].w}×${r.items[0].h} / 网格海报${gridSpec.w}×${gridSpec.h} ratio=${r.items[0].ratio}`);

ok('B3 年份显示在海报下方（9/9），不再有片名/评分占位',
  r.items.every((it) => it.yearBelow), r.items.filter((it) => it.yearBelow).length + '/9');

/* 表单：打开弹窗量三字段是否同行、上映日期是否真的没了 */
await page.click('#w-fab');
await page.waitForFunction(() => {
  const c = document.getElementById('add-country');
  return c && c.getBoundingClientRect().width > 0;
}, null, { timeout: 5000 });
const f = await page.evaluate(() => {
  const ids = ['add-order', 'add-country', 'add-tags'];
  const tops = ids.map((id) => Math.round(document.getElementById(id).getBoundingClientRect().top));
  const wrap = document.getElementById('add-order').closest('.w-row');
  const hints = ids.map((id) => !!(document.querySelector('label[for="' + id + '"]') || {}).querySelector?.('.w-hint'));
  const labels = ids.map((id) => (document.querySelector('label[for="' + id + '"]') || {}).textContent?.trim() || '');
  return {
    tops, inRow3: !!wrap && wrap.classList.contains('w-row-3'), hints, labels,
    hasRelease: !!document.getElementById('add-release'),
    dialogHasReleaseText: (document.querySelector('.w-add-body') || { textContent: '' }).textContent.includes('上映日期'),
  };
});
ok('B4 表单：无上映日期框/字样；排序 / 国别 / 标签三者严格同行且包在 .w-row.w-row-3；三个 label 都无说明文字',
  !f.hasRelease && !f.dialogHasReleaseText && f.inRow3 &&
  f.tops.every((t) => Math.abs(t - f.tops[0]) <= 2) && f.hints.every((h) => !h) &&
  f.labels.join('/') === '排序/国别/标签',
  `tops=${f.tops.join('/')} labels=${f.labels.join('/')} inRow3=${f.inRow3}`);

const seamsOk = r.segs.length > 1 && r.segs.every(Boolean) &&
  r.segs.every((s, i) => i === r.segs.length - 1 || angDiff(r.segs[i + 1].a0, s.a1) < 0.02) &&
  angDiff(r.segs[0].a0, r.segs[r.segs.length - 1].a1) < 0.02;
ok('B5 饼图片间无缝：相邻片首尾角严格相接（≤0.02°）、整圆闭合、stroke=none',
  seamsOk && r.stroke === 'none',
  `片${r.segs.length} 角度=${r.segs.map((s) => s && s.a0.toFixed(1) + '→' + s.a1.toFixed(1)).join(' ')} stroke=${r.stroke}`);

ok('B6 1920 无横向溢出 + 零 JS 异常', r.ov <= 0 && errs.length === 0, `ov=${r.ov} err=${errs.length}`);
await ctx.close();

/* ---------------- C 390 ---------------- */
console.log('== C 390 ==');
const c2 = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
const p2 = await c2.newPage();
const e2 = [];
p2.on('pageerror', (e) => e2.push(String(e)));
await p2.goto(BASE + 'watch.html', { waitUntil: 'load' });
await p2.waitForSelector('#w-grid .poster', { timeout: 20000 });

await p2.click('#w-fab');
await p2.waitForFunction(() => {
  const c = document.getElementById('add-country');
  return c && c.getBoundingClientRect().width > 0;
}, null, { timeout: 5000 });
const m = await p2.evaluate(() => {
  const ids = ['add-order', 'add-country', 'add-tags'];
  return {
    tops: ids.map((id) => Math.round(document.getElementById(id).getBoundingClientRect().top)),
    ov: document.documentElement.scrollWidth - document.documentElement.clientWidth
  };
});
ok('C1 390 三字段回单列（w-row-3 折叠成 1fr，排序 → 国别 → 标签 依次下移）',
  m.tops[1] > m.tops[0] + 10 && m.tops[2] > m.tops[1] + 10 && m.ov <= 0,
  `tops=${m.tops.join('/')} ov=${m.ov}`);

await p2.click('#w-add-close');       /* 关掉弹窗，否则遮住后面的头像 */
await p2.waitForTimeout(200);
await p2.click('#w-avatar');
await p2.waitForSelector('#w-tl .tl-item', { timeout: 20000 });
await p2.click('#w-stats-btn');
await p2.waitForSelector('.st-panel[data-panel="buckets"] svg.st-pie-chart', { timeout: 10000 });
await p2.waitForTimeout(800);
const m2 = await p2.evaluate(() => {
  const paths = [...document.querySelectorAll('[data-panel="buckets"] .st-pie-slice')];
  const ang = (x, y) => (Math.atan2(Number(y) - 50, Number(x) - 50) * 180 / Math.PI + 360) % 360;
  const segs = paths.map((p) => {
    const mm = /L ([\d.]+) ([\d.]+) A 46 46 0 \d 1 ([\d.]+) ([\d.]+)/.exec(p.getAttribute('d') || '');
    return mm ? { a0: ang(mm[1], mm[2]), a1: ang(mm[3], mm[4]) } : null;
  });
  const vw = document.documentElement.clientWidth;
  const imgs = [...document.querySelectorAll('.st-top-img')].map((i) => i.getBoundingClientRect());
  return {
    count: document.querySelectorAll('.st-top-item').length,
    years: [...document.querySelectorAll('.st-top-year')].map((y) => y.textContent.trim()),
    hasName: !!document.querySelector('.st-top-name'), hasScore: !!document.querySelector('.st-top-score'),
    imgsIn: imgs.every((b) => b.left >= -1 && b.right <= vw + 1),
    segs, ov: document.documentElement.scrollWidth - vw
  };
});
ok('C2 390 年度影视 9 条年份齐全、无片名/评分、海报不越界、无横向溢出 + 零 JS 异常',
  m2.count === 9 && m2.years.join('/') === PICKS.join('/') && !m2.hasName && !m2.hasScore &&
  m2.imgsIn && m2.ov <= 0 && e2.length === 0,
  `top=${m2.count} ov=${m2.ov} err=${e2.length}`);

const cSeams = m2.segs.length > 1 && m2.segs.every(Boolean) &&
  m2.segs.every((s, i) => i === m2.segs.length - 1 || angDiff(m2.segs[i + 1].a0, s.a1) < 0.02) &&
  angDiff(m2.segs[0].a0, m2.segs[m2.segs.length - 1].a1) < 0.02;
ok('C3 390 饼图同样首尾相接无缝（响应式下不得回退到旧缝）', cSeams, `片${m2.segs.length}`);
await c2.close();

await browser.close();
console.log('');
console.log(`第 100 轮：${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
