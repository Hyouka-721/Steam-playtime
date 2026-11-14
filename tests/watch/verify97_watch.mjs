/* 第 97 轮 watch 侧回归：评分区间 + 国别构成改成饼图
 *
 * 用户原话：「评分区间与国别构成改成饼图」
 *         →「饼图当前使用的颜色种类过少，数据项之间缺乏足够的视觉区分度…兼顾色盲友好」
 *         →「评分区间的颜色差异不够大，国别的饼图少于 10 的国家合并为其他」
 *
 * 做法（都在 docs/watch.js / watch.css 里，零依赖、零请求）：
 *   ① 新增 `stPie(pairs, ariaLabel)`：纯 SVG 手绘扇形，`<path d="M cx cy L … A … Z">`；
 *      片与片之间留 1.1° 的缝（靠面板底色透出来当分隔），不描边 —— `--card-bg` 是
 *      linear-gradient，拿不到可用的纯色，描出来是花的。
 *   ② 0 值的档位**不画片**（画不出面积），但图例照列并打 `is-zero`：口径不能因为视觉
 *      实现而丢档。只剩一档时改画 `<circle>`（留缝会多出一个缺口，看着像掉了一块）。
 *   ③ 图例复用 .st-row 家族、只换列模板（.st-row--pie），所以旧套件数 .st-row /
 *      .st-row-k / .st-row-v 的判据一个字都不用改。
 *   ④ 面板跨度 8+4 → 6+6：饼要近方形才放得下，两个饼同行等分。
 *   ⑤ 配色重做：国别 10 色、评分区间有序五档（判据见 A10~A13，都是量化指标不是看着像）。
 *   ⑥ 长尾合并：<10 部的国别折成「其他」（中性灰），样本不足阈值时退回前 8 名（A14/A15、C4）。
 *
 * ⚠️ 年报按钮只在时间轴视图出现（第 93 轮契约），所以每次都要先点头像再点年报。
 * ⚠️ 图例必须限宽（max-width: 320px）：铺满式 flex 会把「片名」和「数量」一左一右
 *    拉开 300px，读起来像表格断了 —— 第 96 轮 Top5 踩过同一个坑。
 * ⚠️ 饼的分母是**面板实际画出来的那几项**之和，不是全部国别合计（第 97 轮第一版错在这里）。
 */
import { createRequire } from 'module';
import fs from 'fs';

const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const BASE = 'http://127.0.0.1:8895/';
const ROOT = 'C:/Users/33329/WorkBuddy/2026-10-13-18-17-49/steam-playtime/';
const DOCS = ROOT + 'docs/';
const rd = (p) => fs.readFileSync(DOCS + p, 'utf8').replace(/\r\n/g, '\n');
const stripCmt = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');

const html = rd('watch.html');
const js = stripCmt(rd('watch.js'));
const css = stripCmt(rd('watch.css'));
const data = JSON.parse(rd('data/watch.json'));

/* 与面板同口径的期望值 */
const RATED = data.items.filter((it) => Number(it.rating) > 0);
const BUCKETS = [0, 0, 0, 0, 0];
RATED.forEach((it) => {
  const r = Number(it.rating);
  BUCKETS[r < 6 ? 0 : r < 7 ? 1 : r < 8 ? 2 : r < 9 ? 3 : 4]++;
});
const CNT = {};
data.items.forEach((it) => (it.countries || []).forEach((c) => { CNT[c] = (CNT[c] || 0) + 1; }));
const CRANK = Object.keys(CNT).sort((a, b) => CNT[b] - CNT[a] || a.localeCompare(b));
/* 第 97 轮第三段（用户：「国别的饼图少于 10 的国家合并为其他」）改了口径：
   面板 = 前 8 个「≥10 部」的国别 + 一行「其他」（装下全部长尾）。
   ⚠️ 分母是**面板实际画出来的那几项**之和，不是全部国别的合计 —— 这两者不相等，
   第一版就错在这里，国别扇形角度全崩。 */
const CMIN = 10;
const CMAJOR = CRANK.filter((k) => CNT[k] >= CMIN).slice(0, 8);
const MINOR_SUM = CRANK.filter((k) => !CMAJOR.includes(k)).reduce((s, k) => s + CNT[k], 0);
const CSHOWN = CMAJOR.map((k) => [k, CNT[k]]).concat(MINOR_SUM ? [['其他', MINOR_SUM]] : []);
const CSUM = CSHOWN.reduce((s, x) => s + x[1], 0);
const CSV = CSHOWN.map((x) => x[1]).filter((v) => v > 0);
const CLIVE = CSV.length;
const OTHER_RGB = 'rgb(140, 140, 170)';   /* #8C8CAA */
const BZERO = BUCKETS.filter((v) => v === 0).length;

/* ---------- 配色体检工具（第 97 轮追加）----------
   用户第二轮要求：「颜色种类过少、缺乏视觉区分度、要色盲友好」——所以判据不能只看
   「有几个颜色」，得真的算颜色距离，并且**在红绿色盲下再算一遍**。
   ΔE 用 CIE76（Lab 欧氏距离），色盲模拟用 Viénot/Brettel 1999 的线性 sRGB 矩阵。 */
const BG_HEX = '#14141a';
const hex2rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const srgb2lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lin2srgb = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const relLum = (rgb) => { const [r, g, b] = rgb.map(srgb2lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const [x, y] = [relLum(a), relLum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const rgb2lab = (rgb) => {
  const [r, g, b] = rgb.map(srgb2lin);
  let x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
  let y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  let z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  [x, y, z] = [f(x), f(y), f(z)];
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
};
const dE76 = (a, b) => { const A = rgb2lab(a), B = rgb2lab(b); return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]); };
const CVD = {
  protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]]
};
const cvdSim = (rgb, kind) => {
  if (!kind) return rgb;
  const M = CVD[kind], lin = rgb.map(srgb2lin);
  return M.map((row) => lin2srgb(Math.min(1, Math.max(0, row[0] * lin[0] + row[1] * lin[1] + row[2] * lin[2]))));
};
const views = (rgb) => [rgb, cvdSim(rgb, 'deutan'), cvdSim(rgb, 'protan')];
/* 一对颜色的「可辨度」＝ 正常 / 绿盲 / 红盲三种视觉里最差的那个 ΔE */
const pairScore = (a, b) => {
  const va = views(a), vb = views(b);
  return Math.min(dE76(va[0], vb[0]), dE76(va[1], vb[1]), dE76(va[2], vb[2]));
};
const minPair = (list, fn) => {
  let m = Infinity, pair = '';
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const s = fn(list[i], list[j]);
    if (s < m) { m = s; pair = list[i] + '/' + list[j]; }
  }
  return [m, pair];
};
const grabPalette = (name) => {
  const m = new RegExp('var ' + name + ' = \\[([\\s\\S]*?)\\];').exec(js);
  return m ? [...m[1].matchAll(/'(#[0-9A-Fa-f]{6})'/g)].map((x) => x[1]) : [];
};
const BUCKET_PAL = grabPalette('BUCKET_COLORS');
const COUNTRY_PAL = grabPalette('COUNTRY_COLORS');

let pass = 0, fail = 0;
const ok = (n, c, extra = '') => {
  c ? (pass++, console.log(`PASS ${n}${extra ? '  — ' + extra : ''}`))
    : (fail++, console.log(`FAIL ${n}  — ${extra}`));
};

/* ---------------- A 静态契约 ---------------- */
console.log('== A 静态契约 ==');
ok('A1 版本号：watch.html 引用 watch.css?v=36 / watch.js?v=28（CSS 与 JS 都改了，两个都要 bump）',
  /watch\.css\?v=36/.test(html) && /watch\.js\?v=28/.test(html),
  (html.match(/watch\.(css|js)\?v=\d+/g) || []).join(' '));

ok('A2 JS 有 stPie + 两套色板；评分区间与国别都走它（stPie(buckets) / stPie(countries)）',
  /function stPie\(pairs, ariaLabel\)/.test(js) && /var BUCKET_COLORS = \[/.test(js) &&
  /var COUNTRY_COLORS = \[/.test(js) &&
  /stPie\(buckets, '评分区间饼图'\)/.test(js) && /stPie\(countries, '国别构成饼图'\)/.test(js));

ok('A3 这两个面板不再用横条（stRows 只剩「类型构成」一处调用），改的是呈现不是删功能',
  !/stRows\(buckets\)/.test(js) && !/stRows\(countries\)/.test(js) &&
  /stRows\(kinds\)/.test(js) && (js.match(/stRows\(/g) || []).length === 2,
  `stRows( 出现 ${(js.match(/stRows\(/g) || []).length} 次（1 处定义 + 1 处调用）`);

ok('A4 两个饼面板都占 6 栏（近方形才放得下饼+图例；第 98 轮换位后各与月度/标签同行）',
  /\.st-panel\[data-panel="buckets"\] \{ grid-column: span 6; \}/.test(css) &&
  /\.st-panel\[data-panel="country"\] \{ grid-column: span 6; \}/.test(css));

ok('A5 饼图与图例的样式齐备：.st-pie / .st-pie-chart / .st-pie-slice / .st-row--pie / .st-row-pct',
  /\.st-pie \{/.test(css) && /\.st-pie-chart \{/.test(css) && /\.st-pie-slice \{/.test(css) &&
  /\.st-row--pie \{/.test(css) && /\.st-row-pct \{/.test(css));

const legendW = (/\.st-rows--pie \{[\s\S]*?max-width:\s*(\d+)px/.exec(css) || [, ''])[1];
ok('A6 🔴 图例限宽（否则片名与数量被一左一右拉开，像表格断了）', Number(legendW) > 0 && Number(legendW) <= 380,
  `max-width=${legendW}px`);

const m860 = css.match(/@media \(max-width: 860px\)/g) || [];
ok('A7 本轮没新增断点：全文件仍只有 1 个 @media (max-width:860px)', m860.length === 1, `${m860.length} 个`);

/* 圆角白名单：把新增那一段的圆角值逐个取出比对（饼图不需要圆角，只该出现 50%） */
const pieSeg = (css.match(/\.st-pie \{[\s\S]{0,900}/) || [''])[0];
const radii = [...pieSeg.matchAll(/border-radius:\s*([^;]+);/g)].map((m) => m[1].trim());
ok('A8 新规则圆角只用令牌 / 50% / 2px（共 ' + radii.length + ' 处）',
  radii.length > 0 && radii.every((v) =>
    v.split(/\s+/).every((x) => /^var\(--r-(xs|sm|md|lg|pill)\)$/.test(x) || x === '50%' || x === '2px')),
  radii.join(' / '));

ok('A9 纯 SVG 手绘：没有 canvas、没有引第三方图表库，svg 带 role="img" 与 aria-label',
  !/<canvas/.test(js) && !/chart\.js|d3\.|echarts/i.test(js) &&
  /'<svg class="st-pie-chart" viewBox="0 0 100 100" role="img" aria-label="'/.test(js));

/* ---- 配色：数量 / 唯一性 / 色盲可辨度 / 明度单调 ---- */
ok('A10 色板规模够用且无重复：评分区间 5 色、国别 10 色，去重后长度不变',
  BUCKET_PAL.length === 5 && COUNTRY_PAL.length === 10 &&
  new Set(BUCKET_PAL).size === 5 && new Set(COUNTRY_PAL).size === 10 &&
  BUCKET_PAL.length === BUCKETS.length && COUNTRY_PAL.length >= 8,
  `区间 ${BUCKET_PAL.length} 色 / 国别 ${COUNTRY_PAL.length} 色`);

const [cMin, cPair] = minPair(COUNTRY_PAL, (a, b) => pairScore(hex2rgb(a), hex2rgb(b)));
const [cNorm, cNormPair] = minPair(COUNTRY_PAL, (a, b) => dE76(hex2rgb(a), hex2rgb(b)));
ok('A11 国别 10 色色盲友好：模拟绿盲/红盲后最小 ΔE ≥ 12（正常视觉 ≥ 18）',
  cMin >= 12 && cNorm >= 18,
  `三视图 ${cMin.toFixed(1)} @${cPair} / 正常 ${cNorm.toFixed(1)} @${cNormPair}`);

const cCon = Math.min(...COUNTRY_PAL.map((h) => contrast(hex2rgb(h), hex2rgb(BG_HEX))));
const bCon = Math.min(...BUCKET_PAL.map((h) => contrast(hex2rgb(h), hex2rgb(BG_HEX))));
ok('A12 所有扇区色对面板底 #14141a 的对比度 ≥ 3（深底上不会糊成一片）',
  cCon >= 3 && bCon >= 3, `国别 min ${cCon.toFixed(2)} / 区间 min ${bCon.toFixed(2)}`);

const bL = BUCKET_PAL.map((h) => rgb2lab(hex2rgb(h))[0]);
const mono = bL.every((v, i) => i === 0 || v > bL[i - 1]);
const adjMin = Math.min(...BUCKET_PAL.slice(1).map((h, i) => pairScore(hex2rgb(BUCKET_PAL[i]), hex2rgb(h))));
ok('A13 评分区间五档是有序色阶：L* 单调递增，且相邻档三视图 ΔE ≥ 8（全色盲也能排出高低）',
  mono && adjMin >= 8,
  `L* ${bL.map((x) => x.toFixed(1)).join(' < ')} / 相邻 ΔE min ${adjMin.toFixed(1)}`);

/* ---- 第三段：国别长尾合并「其他」 ---- */
const otherHex = ((/var OTHER_COLOR = '(#[0-9A-Fa-f]{6})'/.exec(js) || [, ''])[1] || '').toUpperCase();
const countryMin = Number((/var COUNTRY_MIN = (\d+);/.exec(js) || [, 0])[1]);
const otherScore = otherHex
  ? Math.min(...COUNTRY_PAL.slice(0, 5).map((h) => pairScore(hex2rgb(otherHex), hex2rgb(h)))) : -1;
const otherCon = otherHex ? contrast(hex2rgb(otherHex), hex2rgb(BG_HEX)) : -1;
ok('A14 长尾合并：COUNTRY_MIN = 10 + 独立的中性灰 OTHER_COLOR（不占用国别彩色，与前 5 色 ΔE ≥ 15）',
  countryMin === 10 && /^#[0-9A-F]{6}$/.test(otherHex) && otherScore >= 15 && otherCon >= 3 &&
  !COUNTRY_PAL.includes(otherHex),
  `阈值 ${countryMin} / 其他 ${otherHex} / 三视图 ΔE min ${otherScore.toFixed(1)} / 对底 ${otherCon.toFixed(2)}`);

/* 兜底：样本还小（一个 ≥10 部的都没有）时不能把整张饼涂成一块灰，要退回「前 8 名」老口径 */
ok('A15 分流写全了：有 ≥10 部的走「major + 其他」，一个都没有时退回前 8 名；脚注只在真有其他时补那句话',
  /var majors = countryAll\.filter\(function \(p\) \{ return p\.v >= COUNTRY_MIN; \}\)/.test(js) &&
  /countries = countryAll\.slice\(0, 8\);/.test(js) &&
  /少于 ' \+ COUNTRY_MIN \+ ' 部的国别（/.test(js) &&
  /hasOther \?/.test(js));


/* ---------------- B 1920 运行时 ---------------- */
console.log('== B 1920 运行时 ==');
const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1200 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
await page.goto(BASE + 'watch.html', { waitUntil: 'load' });
await page.waitForSelector('#w-grid .poster', { timeout: 20000 });
await page.click('#w-avatar');
await page.waitForSelector('#w-tl .tl-item', { timeout: 20000 });
await page.click('#w-stats-btn');
await page.waitForSelector('.st-panel[data-panel="buckets"] svg.st-pie-chart', { timeout: 10000 });
await page.waitForTimeout(700);

const probe = () => page.evaluate(() => {
  const box = (e) => { if (!e) return null; const r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), t: Math.round(r.top), l: Math.round(r.left), r: Math.round(r.right), b: Math.round(r.bottom) }; };
  /* 从扇形 path 反算扫过角度：M cx cy L x0 y0 A r r 0 large 1 x1 y1 Z
     → 数字序列 [cx,cy,x0,y0,r,r,0,large,1,x1,y1]，首尾两点相对圆心求角差。 */
  const sweepOf = (d) => {
    const n = d.match(/-?\d+(?:\.\d+)?/g).map(Number);
    const cx = n[0], cy = n[1];
    const a0 = Math.atan2(n[3] - cy, n[2] - cx) * 180 / Math.PI;
    const a1 = Math.atan2(n[n.length - 1] - cy, n[n.length - 2] - cx) * 180 / Math.PI;
    let sw = a1 - a0;
    while (sw <= 0) sw += 360;
    return sw;
  };
  const panel = (k) => {
    const sec = document.querySelector('[data-panel="' + k + '"]');
    if (!sec) return null;
    const slices = [...sec.querySelectorAll('.st-pie-slice')];
    const rows = [...sec.querySelectorAll('.st-row')];
    return {
      sec: box(sec), pie: box(sec.querySelector('.st-pie-chart')), leg: box(sec.querySelector('.st-rows--pie')),
      pieces: slices.length,
      isCircle: sec.querySelectorAll('.st-pie-chart circle').length,
      sweeps: slices.map((s) => (s.tagName.toLowerCase() === 'path' ? sweepOf(s.getAttribute('d')) : 360)),
      titles: slices.map((s) => (s.querySelector('title') || {}).textContent || ''),
      fills: slices.map((s) => s.getAttribute('fill')),
      rows: rows.length,
      keys: rows.map((x) => x.querySelector('.st-row-k').textContent.trim()),
      vs: rows.map((x) => x.querySelector('.st-row-v').textContent.trim()),
      pcts: rows.map((x) => x.querySelector('.st-row-pct').textContent.trim()),
      dots: rows.map((x) => getComputedStyle(x.querySelector('.st-row-dot')).backgroundColor),
      note: (sec.querySelector('.st-note') || {}).textContent || '',
      zeros: rows.filter((x) => x.classList.contains('is-zero')).length,
      zeroOpacity: rows.filter((x) => x.classList.contains('is-zero')).map((x) => getComputedStyle(x).opacity),
      nan: /NaN/.test(sec.innerHTML)
    };
  };
  return {
    pies: document.querySelectorAll('svg.st-pie-chart').length,
    b: panel('buckets'), c: panel('country'),
    ov: document.documentElement.scrollWidth - document.documentElement.clientWidth
  };
});

const r = await probe();
const sumPct = (a) => a.reduce((s, x) => s + parseFloat(x), 0);
const expSweep = (v, tot) => v / tot * 360;

ok('B1 两个饼都画出来了（评分区间 + 国别），不是空态也不是横条',
  r.pies === 2 && r.b.pieces > 0 && r.c.pieces > 0, `饼 ${r.pies} / 片 ${r.b.pieces}+${r.c.pieces}`);

ok('B2 评分区间：5 档全在（4 片还是 5 片取决于有没有 0 值档），图例 5 行、百分比合计约 100%',
  r.b.rows === 5 && r.b.pieces === 5 - BZERO && Math.abs(sumPct(r.b.pcts) - 100) < 0.35,
  `片 ${r.b.pieces}（0 值档 ${BZERO}）/ 行 ${r.b.rows} / 合计 ${sumPct(r.b.pcts).toFixed(1)}%`);

ok('B3 国别：' + CMAJOR.length + ' 个 ≥' + CMIN + ' 部的国别 + 「其他」= ' + CSHOWN.length +
  ' 行，首行 ' + CMAJOR[0] + '、末行「其他」=' + MINOR_SUM + '、百分比合计约 100%、片数 = 非零项数',
  r.c.rows === CSHOWN.length && r.c.keys[0] === CMAJOR[0] && r.c.vs[0] === String(CNT[CMAJOR[0]]) &&
  (MINOR_SUM ? (r.c.keys[r.c.keys.length - 1] === '其他' &&
    r.c.vs[r.c.vs.length - 1] === String(MINOR_SUM)) : true) &&
  Math.abs(sumPct(r.c.pcts) - 100) < 0.35 && r.c.pieces === CLIVE,
  `${r.c.keys.map((k, i) => k + '=' + r.c.vs[i]).join('/')} / 片 ${r.c.pieces} / 合计 ${sumPct(r.c.pcts).toFixed(1)}%`);

/* 几何：每片扫过的角度必须是 v/total*360 再各让 0.55°（缝）——这条能抓住「比例算错」 */
const TOTAL_B = BUCKETS.reduce((a, b) => a + b, 0);
const liveB = BUCKETS.filter((v) => v > 0);
const bGeo = r.b.sweeps.every((sw, i) => {
  const want = expSweep(liveB[i], TOTAL_B) - (liveB.length > 1 ? 1.1 : 0);
  return Math.abs(sw - want) < 0.35;
});
const cGeo = CSV.every((v, i) => Math.abs(r.c.sweeps[i] - (expSweep(v, CSUM) - 1.1)) < 0.35);
ok('B4 扇形角度与计数成比例（各让 0.55° 的缝），不是画着好看的假图',
  bGeo && cGeo,
  `区间 ${r.b.sweeps.map((x) => x.toFixed(1)).join('/')} | 国别 ${r.c.sweeps.map((x) => x.toFixed(1)).join('/')}`);

ok('B5 片与图例一一对应：每片 title = 「名称 数量」，图例色点与扇形同色，「其他」用中性灰',
  r.b.titles.every((t) => /^\S+ \d+$/.test(t)) && r.c.titles.every((t) => /^\S+ \d+$/.test(t)) &&
  r.c.titles[0] === CMAJOR[0] + ' ' + CNT[CMAJOR[0]] &&
  r.c.dots[0] === 'rgb(232, 176, 75)' &&
  (!MINOR_SUM || (r.c.dots[r.c.rows - 1] === OTHER_RGB && r.c.fills[r.c.pieces - 1] === otherHex)),
  `首片 ${r.c.titles[0]} / 色 ${r.c.dots[0]} / 末色 ${r.c.dots[r.c.rows - 1]}`);

ok('B6 真实数据没有 0 值档，is-zero 空态分支不误报；也没有 NaN 漏进 SVG',
  r.b.zeros === 0 && r.c.zeros === 0 && !r.b.nan && !r.c.nan, `is-zero ${r.b.zeros}+${r.c.zeros}`);

ok('B10 渲染后色点两两不同：' + r.c.rows + ' 行国别 = ' + new Set(r.c.dots).size +
  ' 种颜色、5 个区间 = ' + new Set(r.b.dots).size + ' 种，扇形 fill 也不重复',
  new Set(r.c.dots).size === r.c.rows && new Set(r.b.dots).size === r.b.rows &&
  new Set(r.c.fills).size === r.c.pieces && new Set(r.b.fills).size === r.b.pieces,
  `国别 ${new Set(r.c.dots).size}/${r.c.rows} · 区间 ${new Set(r.b.dots).size}/${r.b.rows}`);

/* 第 98 轮起两块饼不再同行（用户要求各自挪到别的位置），所以只断言等宽 + 饼图例不重叠 */
ok('B7 版式：两个饼面板等宽（都占 6 栏），各自饼在左、图例在右且不重叠',
  Math.abs(r.b.sec.w - r.c.sec.w) <= 2 &&
  r.b.pie.r <= r.b.leg.l && r.c.pie.r <= r.c.leg.l,
  `区间 ${r.b.sec.w} / 国别 ${r.c.sec.w} 间距 ${r.b.leg.l - r.b.pie.r}/${r.c.leg.l - r.c.pie.r}`);

ok('B8 饼按 clamp(150,16vw,240) 长到 240（1920），图例限宽 320 没被拉开',
  Math.round(r.b.pie.w) === 240 && Math.round(r.b.pie.h) === 240 && r.b.leg.w <= 320,
  `饼 ${r.b.pie.w}×${r.b.pie.h} / 图例 ${r.b.leg.w}`);

ok('B9 1920 无横向溢出 + 零 JS 异常', r.ov <= 0 && errs.length === 0, `ov=${r.ov} err=${errs.length}`);

/* 合并是「把长尾收起来」，不是「把长尾删掉」——被合并的国别必须在某处还查得到，
   否则用户会以为那几部片没算进统计里。
   ⚠️ 写进脚注而不是 `title=` 气泡：① `verify83 A3` 守着「watch.js 里不许写 DOM title」
   （第 83 轮把原生气泡删净了，不能为这个功能破例）；② 触屏根本没有 hover。 */
ok('B11 脚注写清合并规则 + 点名列出被合并的国别（合并≠丢信息）',
  /少于 10 部的国别（/.test(r.c.note) && /）合并为「其他」/.test(r.c.note) &&
  /按国别累计/.test(r.c.note) &&
  CRANK.filter((k) => !CMAJOR.includes(k)).every((k) => r.c.note.includes(k)),
  `脚注「${r.c.note}」`);

/* ---------------- C 造数：只剩一档 / 有 0 值档 ---------------- */
console.log('== C 造数（单一评分档位） ==');
const mock = {
  updated_at: '2026-11-14T00:00:00+08:00',
  items: [
    { id: '2020-01-01-a', title: '八分片A', kind: 'movie', watched_at: '2020-01-01', year: 2020, rating: 8.5, poster: '', note: '', countries: ['日本'] },
    { id: '2020-01-02-b', title: '八分片B', kind: 'series', watched_at: '2020-01-05', year: 2020, rating: 8.5, poster: '', note: '', countries: ['日本'] }
  ]
};
const c2 = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
const p2 = await c2.newPage();
const e2 = [];
p2.on('pageerror', (e) => e2.push(String(e)));
await p2.route('**/data/watch/manifest.json*', (r0) => r0.fulfill({ status: 404, body: '' }));
await p2.route('**/data/watch.json*', (r0) => r0.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mock) }));
await p2.goto(BASE + 'watch.html', { waitUntil: 'load' });
await p2.waitForSelector('#w-grid .poster', { timeout: 15000 });
await p2.click('#w-avatar');
await p2.waitForSelector('#w-tl .tl-item', { timeout: 15000 });
await p2.click('#w-stats-btn');
await p2.waitForSelector('[data-panel="buckets"] svg.st-pie-chart', { timeout: 8000 });
await p2.waitForTimeout(500);
const m = await p2.evaluate(() => {
  const sec = document.querySelector('[data-panel="buckets"]');
  const rows = [...sec.querySelectorAll('.st-row')];
  return {
    circles: sec.querySelectorAll('.st-pie-chart circle').length,
    paths: sec.querySelectorAll('path.st-pie-slice').length,
    rows: rows.length,
    zeros: rows.filter((x) => x.classList.contains('is-zero')).length,
    zeroOp: rows.filter((x) => x.classList.contains('is-zero')).map((x) => getComputedStyle(x).opacity),
    zeroPct: rows.filter((x) => x.classList.contains('is-zero')).map((x) => x.querySelector('.st-row-pct').textContent.trim()),
    liveKey: (rows.find((x) => !x.classList.contains('is-zero')) || {}).textContent || '',
    pct: rows.map((x) => x.querySelector('.st-row-pct').textContent.trim()),
    nan: /NaN/.test(sec.innerHTML),
    svgAttr: sec.querySelector('.st-pie-chart').getAttribute('aria-label'),
    /* 样本只有日本 2 部 —— 没有任何国别够 10 部，必须退回「前 8 名」而不是把饼涂成一块灰 */
    cKeys: [...document.querySelectorAll('[data-panel="country"] .st-row-k')].map((x) => x.textContent.trim()),
    cNote: (document.querySelector('[data-panel="country"] .st-note') || {}).textContent || '',
    cSlices: document.querySelectorAll('[data-panel="country"] .st-pie-slice').length
  };
});
ok('C1 只剩一档评分时画整圆（<circle>），不是 359.9° 的缺口扇形',
  m.circles === 1 && m.paths === 0, `circle ${m.circles} path ${m.paths}`);

ok('C2 0 值档位不画片但图例照列（4 行 is-zero，压暗到 0.38，百分比 0.0%）',
  m.rows === 5 && m.zeros === 4 && m.zeroPct.every((t) => t === '0.0%') &&
  m.zeroOp.every((o) => Number(o) < 0.5),
  `行 ${m.rows} 零 ${m.zeros} 透明度 ${m.zeroOp.join('/')}`);

ok('C3 唯一非零档占比 100.0%，且没有 NaN / aria-label 仍在',
  m.pct.filter((t) => t === '100.0%').length === 1 && !m.nan && m.svgAttr === '评分区间饼图',
  `pct=${m.pct.join('/')} label=${m.svgAttr} err=${e2.length}`);

/* 小样本兜底：2 部片、同一个国别（1 个国别 2 部 < 阈值 10），
   如果无脑合并就会得到「其他 2」一块灰 —— 那面板等于废了。 */
ok('C4 样本不足 10 部时不合并：国别仍是「日本 2」一整块，脚注也不提「其他」',
  m.cKeys.join('/') === '日本' && m.cSlices === 1 &&
  !/其他/.test(m.cNote) && /按国别累计/.test(m.cNote),
  `行 ${m.cKeys.join('/')} / 片 ${m.cSlices} / 脚注「${m.cNote}」`);
await c2.close();

/* ---------------- D 1440 ---------------- */
console.log('== D 1440 ==');
const dctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
const dp = await dctx.newPage();
const derrs = [];
dp.on('pageerror', (e) => derrs.push(String(e)));
await dp.goto(BASE + 'watch.html', { waitUntil: 'load' });
await dp.waitForSelector('#w-grid .poster', { timeout: 20000 });
await dp.click('#w-avatar');
await dp.waitForSelector('#w-tl .tl-item', { timeout: 20000 });
await dp.click('#w-stats-btn');
await dp.waitForTimeout(700);
const d = await dp.evaluate(() => {
  const b = (s) => document.querySelector(s).getBoundingClientRect();
  const pie = b('[data-panel="buckets"] .st-pie-chart');
  const leg = b('[data-panel="buckets"] .st-rows--pie');
  const sec = b('[data-panel="buckets"]');
  return { pieW: Math.round(pie.width), secW: Math.round(sec.width), gap: Math.round(leg.left - pie.right),
    legW: Math.round(leg.width), ov: document.documentElement.scrollWidth - document.documentElement.clientWidth };
});
ok('D1 1440 饼随 vw 缩到 230、仍在面板内、图例不重叠',
  d.pieW === 230 && d.pieW < d.secW && d.gap > 0 && d.legW <= 320,
  `饼 ${d.pieW} 面板 ${d.secW} 间距 ${d.gap} 图例 ${d.legW}`);

ok('D2 1440 无横向溢出 + 零 JS 异常', d.ov <= 0 && derrs.length === 0, `ov=${d.ov} err=${derrs.length}`);
await dctx.close();

/* ---------------- E 390 ---------------- */
console.log('== E 390 ==');
const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
const mp = await mctx.newPage();
const merrs = [];
mp.on('pageerror', (e) => merrs.push(String(e)));
await mp.goto(BASE + 'watch.html', { waitUntil: 'load' });
await mp.waitForSelector('#w-grid .poster', { timeout: 20000 });
await mp.click('#w-avatar');
await mp.waitForSelector('#w-tl .tl-item', { timeout: 20000 });
await mp.click('#w-stats-btn');
await mp.waitForTimeout(800);
const mo = await mp.evaluate(() => {
  const b = (s) => document.querySelector(s).getBoundingClientRect();
  const pie = b('[data-panel="buckets"] .st-pie-chart');
  const leg = b('[data-panel="buckets"] .st-rows--pie');
  const sec = b('[data-panel="buckets"]');
  return {
    pieW: Math.round(pie.width), pieBottom: Math.round(pie.bottom), legTop: Math.round(leg.top),
    secW: Math.round(sec.width), legW: Math.round(leg.width),
    pctFont: getComputedStyle(document.querySelector('.st-row-pct')).fontSize,
    ov: document.documentElement.scrollWidth - document.documentElement.clientWidth
  };
});
ok('E1 390 改竖排：饼在上（132px）、图例整宽在下方，不横挤',
  mo.pieW === 132 && mo.legTop >= mo.pieBottom && mo.legW > mo.pieW && mo.legW <= mo.secW,
  `饼 ${mo.pieW} 底 ${mo.pieBottom} / 图例 ${mo.legW} 顶 ${mo.legTop}`);

ok('E2 390 无横向溢出 + 零 JS 异常', mo.ov <= 0 && merrs.length === 0, `ov=${mo.ov} err=${merrs.length}`);
await mctx.close();

await browser.close();
console.log(`\n第 97 轮：${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
