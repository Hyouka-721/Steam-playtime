/* 第 89 轮 watch 侧回归：评分角标「完全删除背景填充，只保留金色评分数字」
   用户先后两句：
     ①「如何淡化评分和灰色背景填充的存在感」→ 选 A 软边 + B 默认安静；
     ②「完全删除背景填充，只保留金色评分数字」→ 把 ① 的软边底盘也删掉，最终态。

   演化：
     第 85 轮 P1-3：rgba(8,8,11,.76) 胶囊 + 1px 金描边 + 内高光 + 硬投影 + backdrop-filter
       → 在浅色海报上就是一块贴纸；存在感来自**硬边界 + 三层边界强调**，不是「黑」。
     第 89 轮第一版：::before + blur(6px) 软边暗影（跳变 0.393→0.034，渐变带 30 设备像素）。
     第 89 轮迭代（本文件守的最终态）：**底盘整条删除**，角标只剩一串纯金文字。

   ⚠️ 关键实测（走错的路，记在这里）：曾用 background + backdrop-filter 的
   brightness(0.55) 做「软边」，横切量到单像素亮度跳变 0.39 —— 因为 backdrop-filter
   的滤镜区恒等于元素 border-box，边界一定硬。这个教训在最终态仍然成立：任何
   `background` / `::before` / `filter` 回来都会被 A5/B3/B8/B9 抓住。
   ⚠️ 唯一保留的「暗」是 text-shadow：它只跟着字形走、不形成块状区域。底盘没了以后，
   纯金字压亮黄路面只有 1.64:1，可读性 100% 靠字形暗晕（亮底/暗晕 5.14:1）撑着。
   它不是背景填充，**不要顺手删掉**。

   ⚠️ 判据口径换过：上一版「字芯 vs 暗晕」取文字区最亮像素，当时底盘把背景压暗了，
   最亮就是金字；零填充后最亮变成亮海报本身（0.872 > 金字 0.513），所以改成
   ① 亮底/暗晕（轮廓对比）② 金字理论亮度/暗晕 ③ 文字区「未改动亮底」占比。

   静态断言读 docs/watch.css（**先剥注释**）；运行时走本地 8895。 */
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
import sharp from 'sharp';
const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const BASE = 'http://127.0.0.1:8895/';
const ROOT = 'C:/Users/33329/WorkBuddy/2026-10-13-18-17-49/steam-playtime/docs/';
const OUT = path.join(os.tmpdir(), 'shots89verify');
fs.mkdirSync(OUT, { recursive: true });

let pass = 0, fail = 0;
const ok = (n, c, extra = '') => {
  c ? (pass++, console.log(`PASS ${n}${extra ? '  — ' + extra : ''}`))
    : (fail++, console.log(`FAIL ${n}  — ${extra}`));
};

const stripCmt = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const css = stripCmt(fs.readFileSync(ROOT + 'watch.css', 'utf8').replace(/\r\n/g, '\n'));
const html = fs.readFileSync(ROOT + 'watch.html', 'utf8');
const rule = (sel, scope = css) => {
  const esc = sel.replace(/\./g, '\\.').replace(/:/g, '\\:').replace(/ /g, '\\s+');
  const m = scope.match(new RegExp(esc + '\\s*\\{([^}]*)\\}'));
  return m ? m[1].replace(/\s+/g, ' ') : '';
};

/* ---------- A 静态契约 ---------- */
console.log('== A 静态契约 ==');
ok('A1 watch.html 引用 watch.css?v=26 / watch.js?v=16（纯 CSS 改动，js 未动）',
  /watch\.css\?v=26/.test(html) && /watch\.js\?v=16/.test(html));

const sc = rule('.poster-score');
ok('A2 本体彻底透明：无 background、无 backdrop-filter、无 isolation',
  !/background/.test(sc) && !/backdrop-filter/.test(sc) && !/isolation/.test(sc), sc.slice(0, 96));
ok('A3 硬描边整条删除（border: 0，规则体里不再出现 1px solid）',
  /border:\s*0;/.test(sc) && !/border(-top|-right|-bottom|-left)?:\s*1px/.test(sc));
ok('A4 本体也没有 box-shadow（硬投影不许偷偷回来）', !/box-shadow:/.test(sc));
/* 这是「完全删除背景填充」最硬的一条静态守卫：伪元素底盘不许以任何形式复活 */
ok('A5 反向守卫：CSS 里不存在 .poster-score 的任何 ::before / ::after 规则',
  !/\.poster-score\s*::\s*(before|after)/.test(css),
  (css.match(/\.poster-score\s*::\s*(before|after)/g) || []).join(',') || '零命中');

ok('A6 字号 13/700 → 12/600（少一档字号、少一档字重）',
  /font-size:\s*12px/.test(sc) && /font-weight:\s*600/.test(sc));
ok('A7 金色降饱和：#dcb978（不再是 var(--accent) 那支亮金）',
  /color:\s*#dcb978/.test(sc) && !/color:\s*var\(--accent\)/.test(sc));
ok('A8 字形自带双层紧暗晕（零填充后可读性唯一来源，删了浅海报上就读不出来）',
  /text-shadow:\s*0 1px 3px rgba\(0,\s*0,\s*0,\s*0\.78\), 0 0 2px rgba\(0,\s*0,\s*0,\s*0\.6\)/.test(sc));
ok('A9 结构未动：圆角仍 --r-pill、定位仍 right/bottom 8px、padding 2px 8px',
  /right:\s*8px;\s*bottom:\s*8px/.test(sc) && /border-radius:\s*var\(--r-pill\)/.test(sc) && /padding:\s*2px 8px/.test(sc));
const star = rule('.poster-score i');
ok('A10 星星缩到 9px / opacity .7（原 10px / .85）',
  /font-size:\s*9px/.test(star) && /opacity:\s*\.7/.test(star), star);

/* B 段：hover / focus-within 只换字色 + 暗晕，绝不引入背景 */
const hStart = css.indexOf('.poster:hover .poster-score');
const hBody = css.slice(hStart, css.indexOf('}', hStart));
ok('A11 hover：字色回到 var(--accent)（本体规则）',
  /color:\s*var\(--accent\)/.test(hBody) && /text-shadow:/.test(hBody));
ok('A12 focus-within 也点亮（键盘可达，不只靠 hover）',
  /\.poster:focus-within \.poster-score/.test(css));
ok('A13 反向守卫：hover 规则里不出现 background / filter / box-shadow / ::before',
  !/background|filter:|box-shadow|::before|::after/.test(hBody), hBody.replace(/\s+/g, ' ').slice(0, 100));
ok('A14 过渡都走 --t-2 + --ease：本体 color 与 text-shadow（没有 background-color / filter）',
  /transition:\s*color var\(--t-2\) var\(--ease\),\s*text-shadow var\(--t-2\) var\(--ease\)/.test(sc) &&
  !/background-color var\(--t-2\)/.test(css));
ok('A15 反守卫：时间轴评分 .tl-score 未动（本轮只改网格角标）',
  /\.tl-meta \.tl-score \{ color: var\(--accent\); font-weight: 600; \}/.test(css) && !/\.tl-score[^}]*#dcb978/.test(css));

/* ---------- 运行时 ---------- */
const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const open = async (w, h) => {
  const c = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, serviceWorkers: 'block' });
  const p = await c.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e)));
  await p.goto(BASE + 'watch.html?t=' + Date.now(), { waitUntil: 'load' });
  await p.waitForFunction(() => document.querySelectorAll('#w-grid .poster').length > 20, null, { timeout: 30000 }).catch(() => {});
  await p.waitForTimeout(700);
  return { c, p, errs };
};

console.log('== B 1440 运行时 ==');
const { c, p, errs } = await open(1440, 1000);
const rt = await p.evaluate(() => {
  const s = document.querySelector('.poster-score');
  const pic = s.closest('.poster-pic');
  const cs = getComputedStyle(s), bs = getComputedStyle(s, '::before');
  const r = s.getBoundingClientRect(), pr2 = pic.getBoundingClientRect();
  return {
    bg: cs.backgroundColor, border: cs.borderTopWidth,
    none: (cs.backdropFilter || cs.webkitBackdropFilter || 'none') + '|' + cs.boxShadow,
    preContent: bs.content, preBg: bs.backgroundColor, preFilter: bs.filter,
    fs: cs.fontSize, fw: cs.fontWeight, color: cs.color,
    trans: cs.transitionProperty,
    w: +r.width.toFixed(1), h: +r.height.toFixed(1),
    inside: r.right <= pr2.right + 0.6 && r.bottom <= pr2.bottom + 0.6 && r.left >= pr2.left - 0.6 && r.top >= pr2.top - 0.6,
    /* ⚠️ .poster-pic 自己有 1px 边框，绝对定位参照的是它的内边距盒 → 实测 gap 是 8+1 */
    picBorder: parseFloat(getComputedStyle(pic).borderRightWidth) || 0,
    gapRight: +(pr2.right - r.right).toFixed(1), gapBottom: +(pr2.bottom - r.bottom).toFixed(1),
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  };
});
ok('B1 角标仍在海报内，右边距 / 下边距 = 8px + 海报边框 1px',
  rt.inside && Math.abs(rt.gapRight - (8 + rt.picBorder)) <= 0.6 && Math.abs(rt.gapBottom - (8 + rt.picBorder)) <= 0.6,
  `gap ${rt.gapRight}/${rt.gapBottom}（pic 边框 ${rt.picBorder}）`);
ok('B2 本体：底透明 / border 0 / 无 backdrop-filter、无 box-shadow',
  /rgba\(0,\s*0,\s*0,\s*0\)|transparent/.test(rt.bg) && parseFloat(rt.border) === 0 && rt.none === 'none|none',
  `${rt.bg} | border=${rt.border} | ${rt.none}`);
ok('B3 ::before 根本不生成（content none / 背景透明 / filter none）—— 底盘真的没了',
  rt.preContent === 'none' && /rgba\(0,\s*0,\s*0,\s*0\)|transparent/.test(rt.preBg) && rt.preFilter === 'none',
  `content=${rt.preContent} | ${rt.preBg} | ${rt.preFilter}`);
ok('B4 计算样式：12px / 600 / #dcb978', rt.fs === '12px' && rt.fw === '600' && rt.color === 'rgb(220, 185, 120)',
  `${rt.fs} ${rt.fw} ${rt.color}`);
ok('B5 角标尺寸比改动前小一档但仍不塌（高 20~24px，宽 40~60px）',
  rt.h >= 20 && rt.h <= 24 && rt.w >= 40 && rt.w <= 60, `${rt.w}×${rt.h}`);
ok('B6 1440 无横向溢出 + 零 JS 异常', rt.overflow === 0 && errs.length === 0, `ov=${rt.overflow} err=${errs.length}`);

/* hover 点亮：真鼠标移上去再读计算值 */
const first = p.locator('#w-grid .poster').first();
await first.scrollIntoViewIfNeeded();
await first.hover();
await p.waitForTimeout(420);
const hov = await p.evaluate(() => {
  const s = document.querySelector('#w-grid .poster:hover .poster-score');
  if (!s) return null;
  const cs = getComputedStyle(s), bs = getComputedStyle(s, '::before');
  return { color: cs.color, bg: cs.backgroundColor, shadow: cs.boxShadow, preBg: bs.backgroundColor };
});
ok('B7 hover 后字色回到原亮金 rgb(232,176,75)，且仍零背景（只换字，不画盘）',
  !!hov && hov.color === 'rgb(232, 176, 75)' && /rgba\(0,\s*0,\s*0,\s*0\)|transparent/.test(hov.bg) &&
  hov.shadow === 'none' && /rgba\(0,\s*0,\s*0,\s*0\)|transparent/.test(hov.preBg),
  hov ? `${hov.color} | bg=${hov.bg} | shadow=${hov.shadow}` : 'hover 未命中');

/* ---------- B8~B11 零填充剖面（合成底，去掉海报内容的干扰）----------
   ⚠️ 采样的坑（都踩过）：
   ① 按颜色剔「金色像素」再取背景中位 → 亮黄海报的路面 r-b 也有 80+，被当成字剔掉，
      剩下全是最暗角落，对比度虚高到 10+（假绿）；
   ② 只取左右内边距两条竖带 → 右侧正好压在海报深色区，中位被拉黑，同样虚高；
   ③ 取「字周围 3px 内最亮的非字像素」→ 抗锯齿边像素被判成背景，对比度掉到 1.1（假红）；
   ④ B7 刚 hover 过卡片，量到的是点亮态 → 剖面取样前必须 `page.mouse.move(1,1)`；
   ⑤ CSS px 与设备像素混用：clip / boundingBox 是 CSS px，截图是 dpr=2 位图，坐标先乘 DPR。
   → 把海报换成**纯色合成底**（img 藏起来、.poster-pic 填色），填充与否就完全可计算了：
     没有底盘时，除字形及其紧暗晕以外的每一个像素都必须逐像素等于合成底。 */
const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const L = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a, b) => +(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toFixed(2));
const BRIGHT_HEX = '#f6efe9';               // 比《冰菓》的亮黄路面更亮的合成底
const BG = L(246, 239, 233);                // = 0.8721
const GOLD = L(220, 185, 120);              // #dcb978 的理论相对亮度 = 0.5129

const setSolid = (color) => p.evaluate((col) => {
  [...document.querySelectorAll('#w-grid .poster')].slice(0, 14).forEach((card) => {
    const pic = card.querySelector('.poster-pic');
    const img = pic.querySelector('img');
    if (img) img.style.visibility = 'hidden';
    pic.style.background = col;
  });
}, color);

const DPR = 2, PAD = 16;   // PAD 是 CSS px（左右各留 16 CSS = 32 设备像素）

const profile = async (bb, clip) => {
  const buf = await p.screenshot({ clip, path: path.join(OUT, 'solid-bright.png') });
  const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels, W = info.width, H = info.height;
  const left = Math.round((bb.x - clip.x) * DPR);            // 角标左边界（设备像素）
  const textL = left + 8 * DPR;                              // 文字起点 = 左边界 + pad-left 8
  const textR = left + Math.round(bb.width * DPR) - 8 * DPR;  // 文字终点 = 右边界 - pad-right 8

  const y = Math.floor(H / 2);
  const lum = [];
  for (let x = 0; x < W; x++) { const i = (y * W + x) * ch; lum.push(L(data[i], data[i + 1], data[i + 2])); }
  /* ① 盒外沿 + ② 内边距：逐像素偏离纯合成底的最大值。有底盘 / 软边 / 描边时这里必 >0.1 */
  const dev = (a, b) => {
    let mx = 0, at = 0;
    for (let x = a; x < b && x < W; x++) { const d = Math.abs(lum[x] - BG); if (d > mx) { mx = d; at = x; } }
    return { max: +mx.toFixed(4), at };
  };
  const outside = dev(0, left - 2);
  const padding = dev(left, left + 8);

  /* ③ 2D 文字区：最暗 = 字形暗晕；「完全未被改动」的亮底像素占比 = 有没有块状填充 */
  let halo = 1, pure = 0, total = 0;
  const y0 = Math.floor(H * 0.3), y1 = Math.ceil(H * 0.7);
  for (let yy = y0; yy < y1; yy++) {
    for (let x = textL; x < Math.min(W, textR); x++) {
      const i = (yy * W + x) * ch, v = L(data[i], data[i + 1], data[i + 2]);
      if (v < halo) halo = v;
      total++;
      if (Math.abs(v - BG) <= 0.01) pure++;
    }
  }
  return {
    outsideMax: outside.max, outsideAt: outside.at,
    padMax: padding.max, padAt: padding.at,
    halo: +halo.toFixed(3), purePct: +(pure / total * 100).toFixed(1),
    outline: ratio(BG, halo), goldVsHalo: ratio(GOLD, halo), goldVsBg: ratio(GOLD, BG),
    W, H,
  };
};

/* 量静息档之前必须把鼠标移开（B7 把它悬停在第一张卡上了） */
await p.mouse.move(1, 1);
await p.waitForTimeout(320);

await setSolid(BRIGHT_HEX);
await p.waitForTimeout(300);
const badge = p.locator('#w-grid .poster-score').first();
await badge.scrollIntoViewIfNeeded();
await p.mouse.move(1, 1);
await p.waitForTimeout(240);
const bb = await badge.boundingBox();
const clip = { x: bb.x - PAD, y: bb.y - PAD, width: bb.width + PAD * 2, height: bb.height + PAD * 2 };
const pr3 = await profile(bb, clip);
ok('B8 零填充：角标盒外沿逐像素等于纯合成底（偏离 ≤0.01；改前硬边 0.39 / 软边 0.03）',
  pr3.outsideMax <= 0.01, `max|ΔL|=${pr3.outsideMax} @x=${pr3.outsideAt}/${pr3.W}`);
ok('B9 零填充：角标盒内边距也逐像素等于纯合成底（偏离 ≤0.01，连软晕都不能有）',
  pr3.padMax <= 0.01, `max|ΔL|=${pr3.padMax} @x=${pr3.padAt}`);
ok('B10 文字区不是一块被填满的暗板：仍有 ≥15% 像素是未改动的亮底（实测 33.7%）',
  pr3.purePct >= 15, `未改动亮底 ${pr3.purePct}%`);
ok('B11 零底盘后仍可读：亮底/字形暗晕 ≥4.5:1 且 金字/暗晕 ≥2.5:1（全靠 text-shadow）',
  pr3.outline >= 4.5 && pr3.goldVsHalo >= 2.5,
  `暗晕 L=${pr3.halo} → 亮底/暗晕 ${pr3.outline}:1，金/暗晕 ${pr3.goldVsHalo}:1，金/亮底 ${pr3.goldVsBg}:1`);

await setSolid('');
await c.close();

console.log('== C 390 运行时 ==');
const mob = await open(390, 844);
const mr = await mob.p.evaluate(() => {
  const s = document.querySelector('.poster-score');
  const pic = s.closest('.poster-pic');
  const r = s.getBoundingClientRect(), pr2 = pic.getBoundingClientRect();
  const bs = getComputedStyle(s, '::before');
  return {
    inside: r.right <= pr2.right + 0.6 && r.bottom <= pr2.bottom + 0.6 && r.left >= pr2.left - 0.6 && r.top >= pr2.top - 0.6,
    h: +r.height.toFixed(1),
    preContent: bs.content, bg: getComputedStyle(s).backgroundColor,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  };
});
ok('C1 390 下角标仍在海报内、尺寸不塌（高 ≥20px）、依然零底盘',
  mr.inside && mr.h >= 20 && mr.preContent === 'none' && /rgba\(0,\s*0,\s*0,\s*0\)|transparent/.test(mr.bg),
  `h=${mr.h} content=${mr.preContent} bg=${mr.bg}`);
ok('C2 390 无横向溢出 + 零 JS 异常', mr.overflow === 0 && mob.errs.length === 0, `ov=${mr.overflow} err=${mob.errs.length}`);

await browser.close();
console.log(`\n===== 第 89 轮 watch（评分角标零填充）：${pass} PASS / ${fail} FAIL =====`);
process.exit(fail ? 1 : 0);
