/* 第 89 轮 watch 侧回归：评分角标「降噪」（A 软边 + B 默认安静、hover 点亮）
   用户原话：「如何淡化评分和灰色背景填充的存在感」→ 选 A + B。

   改前（第 85 轮 P1-3 定稿）：底 rgba(8,8,11,.76) + 1px 金描边 + 内高光 + 0 2px 8px 硬投影，
   blur(4px) 在 0.76 不透明度下其实没起作用 —— 在浅色海报上就是一块贴纸。
   存在感来自**硬边界 + 三层边界强调**，不是「黑」。

   ⚠️ 关键实测（第一版走错了，记在这里）：曾用 background + backdrop-filter 的
   brightness(0.55) 做「软边」，横切胶囊边界量到**单像素亮度跳变 0.39** —— 因为
   backdrop-filter 的滤镜区恒等于元素 border-box，边界一定硬。真正能软边的是
   `filter: blur()` 画出来的形状：底盘改成 `.poster-score::before`
   （inset -2px + blur(6px)），边界自己糊成 ~10px 渐变。

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
ok('A1 watch.html 引用 watch.css?v=25 / watch.js?v=16（纯 CSS 改动，js 未动）',
  /watch\.css\?v=25/.test(html) && /watch\.js\?v=16/.test(html));

const sc = rule('.poster-score');
ok('A2 本体不再有底色（「灰色填充」从元素本身上撤掉，改由 ::before 画）',
  !/background:/.test(sc) && !/backdrop-filter:/.test(sc), sc.slice(0, 96));
ok('A3 硬描边整条删除（border: 0，规则体里不再出现 1px solid）',
  /border:\s*0;/.test(sc) && !/border(-top|-right|-bottom|-left)?:\s*1px/.test(sc));
ok('A4 本体也没有 box-shadow（硬投影不许偷偷回来）', !/box-shadow:/.test(sc));

const pre = rule('.poster-score::before');
ok('A5 底盘画在 ::before 上：rgba(8,8,11,0.55) + filter: blur(6px) + inset -2px + z-index -1 + radius inherit',
  /background:\s*rgba\(8,\s*8,\s*11,\s*0\.55\)/.test(pre) && /filter:\s*blur\(6px\)/.test(pre) &&
  /inset:\s*-2px/.test(pre) && /z-index:\s*-1/.test(pre) && /border-radius:\s*inherit/.test(pre),
  pre.slice(0, 110));

ok('A6 字号 13/700 → 12/600（少一档字号、少一档字重）',
  /font-size:\s*12px/.test(sc) && /font-weight:\s*600/.test(sc));
ok('A7 金色降饱和：#dcb978（不再是 var(--accent) 那支亮金）',
  /color:\s*#dcb978/.test(sc) && !/color:\s*var\(--accent\)/.test(sc));
ok('A8 字上有一层双层暗晕（text-shadow，底盘淡了以后局部对比全靠它）',
  /text-shadow:\s*0 1px 3px rgba\(0,\s*0,\s*0,\s*0\.72\), 0 0 1px rgba\(0,\s*0,\s*0,\s*0\.55\)/.test(sc));
ok('A9 结构未动：圆角仍 --r-pill、定位仍 right/bottom 8px、padding 2px 8px',
  /right:\s*8px;\s*bottom:\s*8px/.test(sc) && /border-radius:\s*var\(--r-pill\)/.test(sc) && /padding:\s*2px 8px/.test(sc));
const star = rule('.poster-score i');
ok('A10 星星缩到 9px / opacity .7（原 10px / .85）',
  /font-size:\s*9px/.test(star) && /opacity:\s*\.7/.test(star), star);

/* B 段：默认安静 + hover 点亮 */
const hStart = css.indexOf('.poster:hover .poster-score');
const hBody = css.slice(hStart, css.indexOf('}', hStart));
const hBefore = css.slice(css.indexOf('::before', hStart), css.indexOf('}', css.indexOf('::before', hStart)));
ok('A11 hover：字色回到 var(--accent)（本体规则）', /color:\s*var\(--accent\)/.test(hBody));
ok('A12 focus-within 也点亮（键盘与触屏可达，不只靠 hover）',
  /\.poster:focus-within \.poster-score/.test(css));
ok('A13 hover 时 ::before 底盘加实到 0.74、模糊收到 4px（点亮 = 更实 + 更清楚）',
  /background:\s*rgba\(8,\s*8,\s*11,\s*0\.74\)/.test(hBefore) && /filter:\s*blur\(4px\)/.test(hBefore),
  hBefore.replace(/\s+/g, ' ').slice(0, 100));
ok('A14 过渡都走 --t-2 + --ease：本体 color、::before 的 background-color 与 filter',
  /transition:\s*color var\(--t-2\) var\(--ease\)/.test(sc) &&
  /transition:\s*background-color var\(--t-2\) var\(--ease\),\s*filter var\(--t-2\) var\(--ease\)/.test(pre));
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
    preBg: bs.backgroundColor, preFilter: bs.filter,
    fs: cs.fontSize, fw: cs.fontWeight, color: cs.color,
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
ok('B3 ::before 计算样式：rgba(8,8,11,0.55) + blur(6px) 真的生效',
  /rgba\(8,\s*8,\s*11,\s*0\.55\)/.test(rt.preBg) && /blur\(6px\)/.test(rt.preFilter),
  `${rt.preBg} | ${rt.preFilter}`);
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
  return { color: getComputedStyle(s).color, preBg: getComputedStyle(s, '::before').backgroundColor };
});
ok('B7 hover 后字色回到原亮金 rgb(232,176,75)、::before 加实到 0.74（B 段真的生效）',
  !!hov && hov.color === 'rgb(232, 176, 75)' && /rgba\(8,\s*8,\s*11,\s*0\.74\)/.test(hov.preBg),
  hov ? `${hov.color} | ${hov.preBg}` : 'hover 未命中');

/* ---------- B8/B9/B10 软边剖面 + 可读性（合成底，去掉海报内容的干扰）----------
   ⚠️ 采样的三个坑（都踩过）：
   ① 按颜色剔「金色像素」再取背景中位 → 亮黄海报的路面 r-b 也有 80+，被当成字剔掉，
      剩下全是最暗角落，对比度虚高到 10+（假绿）；
   ② 只取左右内边距两条竖带 → 右侧正好压在海报深色区，中位被拉黑，同样虚高；
   ③ 取「字周围 3px 内最亮的非字像素」→ 抗锯齿边像素比字暗一点点、又过不了金色判据，
      被判成"背景"，对比度掉到 1.1（假红）。
   → 干脆把海报换成**纯色合成底**（img 藏起来、.poster-pic 填色），底盘就完全可计算了。

   ⚠️ 第四个坑（B8/B9 第一版假红）：B7 刚把鼠标 hover 在第一张卡上，此时 ::before 还停在
   点亮态（0.74 / blur 4px），边界自然更实 —— 量到的 0.051 是 hover 档，不是用户抱怨的
   静息档。软边剖面必须**先把鼠标移开**。
   ⚠️ 第五个坑：10%~90% 的起止条件写反（降序剖面下两个条件都在找暗侧），s1/s2 挤在相邻
   像素上，ramp 恒为 0。降序时「刚开始过渡」= 首次跌破 hi−10%span，「过渡结束」= 首次
   跌破 hi−90%span。
   ⚠️ 第六个坑：混用 CSS px 与设备像素。clip / boundingBox 都是 CSS px，截图却是 dpr=2 的
   位图 —— 取样窗口按 `pad*2 + 8` 算会越过 pad-left（8 CSS px = 16 设备像素）直接吃进
   星星字形，取到金色像素，对比度掉到 0.96（假红）。坐标一律先乘 DPR 再取整。 */
const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const L = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a, b) => +(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toFixed(2));

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

  /* ① 盘面区间（左边界外 → 文字开始前）最大单像素亮度跳变。
     只扫到文字起点：再往后就是金色字，字/底跳变 0.5 级会盖掉边界本身的量。 */
  const y = Math.floor(H / 2);
  const lum = [];
  for (let x = 0; x < W; x++) { const i = (y * W + x) * ch; lum.push(L(data[i], data[i + 1], data[i + 2])); }
  let maxJump = 0, at = 0;
  for (let x = 1; x <= textL && x < W; x++) {
    const d = Math.abs(lum[x] - lum[x - 1]);
    if (d > maxJump) { maxJump = d; at = x; }
  }

  /* ② 10%~90% 渐变带宽度（设备像素） */
  const a0 = lum[0], b0 = lum[Math.min(textL, W - 1)];
  const hi = Math.max(a0, b0), lo = Math.min(a0, b0), span = hi - lo;
  const descending = a0 > b0;
  const tIn = descending ? hi - span * 0.1 : lo + span * 0.1;
  const tOut = descending ? hi - span * 0.9 : lo + span * 0.9;
  let s1 = -1, s2 = -1;
  for (let x = 0; x <= textL && x < W; x++) {
    const v = lum[x];
    if (s1 < 0 && (descending ? v <= tIn : v >= tIn)) s1 = x;
    if (s1 >= 0 && s2 < 0 && (descending ? v <= tOut : v >= tOut)) s2 = x;
  }

  /* ③ 2D：文字区内最亮 = 字形核心；最暗 = 字间暗晕（text-shadow 打出来的）。
     ④ 2D：padding 竖带内最暗 = 盘面满强度（模糊过渡带吃不到的地方）。 */
  let gMax = 0, gMin = 1, pMin = 1;
  const y0 = Math.floor(H * 0.3), y1 = Math.ceil(H * 0.7);
  for (let yy = y0; yy < y1; yy++) {
    for (let x = Math.max(0, textL); x < Math.min(W, textR); x++) {
      const i = (yy * W + x) * ch, v = L(data[i], data[i + 1], data[i + 2]);
      if (v > gMax) gMax = v;
      if (v < gMin) gMin = v;
    }
    for (let x = left; x < Math.min(W, textL - 2); x++) {
      const i = (yy * W + x) * ch, v = L(data[i], data[i + 1], data[i + 2]);
      if (v < pMin) pMin = v;
    }
  }
  return {
    maxJump: +maxJump.toFixed(4), at, rampPx: s2 > s1 ? s2 - s1 : 0, W, H,
    local: ratio(gMax, gMin), vsPlate: ratio(gMax, pMin), plateVsBg: ratio(a0, pMin),
    gMax: +gMax.toFixed(3), gMin: +gMin.toFixed(3), pMin: +pMin.toFixed(3),
  };
};

/* 量静息档之前必须把鼠标移开（B7 把它悬停在第一张卡上了） */
await p.mouse.move(1, 1);
await p.waitForTimeout(320);

const BRIGHT = '#f6efe9';   // 比《冰菓》的亮黄路面更亮的合成底
await setSolid(BRIGHT);
await p.waitForTimeout(300);
const badge = p.locator('#w-grid .poster-score').first();
await badge.scrollIntoViewIfNeeded();
await p.mouse.move(1, 1);
await p.waitForTimeout(240);
const bb = await badge.boundingBox();
const clip = { x: bb.x - PAD, y: bb.y - PAD, width: bb.width + PAD * 2, height: bb.height + PAD * 2 };
const pr3 = await profile(bb, clip);
ok('B8 软边：静息态横切胶囊边界，最大单像素亮度跳变 ≤0.05（改前 1px 硬边实测 0.39）',
  pr3.maxJump <= 0.05, `jump=${pr3.maxJump} @x=${pr3.at}/${pr3.W}`);
ok('B9 软边：边界过渡带 ≥8 设备像素（≈4 CSS px 以上，不是一刀切；改前 0）',
  pr3.rampPx >= 8, `ramp=${pr3.rampPx} 设备像素`);
ok('B10 可读性（局部）：字芯 vs 紧邻暗晕 ≥4.5:1（12px/600 属小字，取 AA 档；底盘淡了全靠 text-shadow）',
  pr3.local >= 4.5, `字芯 L=${pr3.gMax} / 暗晕 L=${pr3.gMin} → ${pr3.local}:1`);
ok('B11 反过度淡化：底盘满强度仍在，字芯/盘面 ≥2.0:1（再淡下去字就浮在亮海报上了）',
  pr3.vsPlate >= 2.0, `字芯/盘面 ${pr3.vsPlate}:1，盘面/亮底 ${pr3.plateVsBg}:1`);

await setSolid('');
await c.close();

console.log('== C 390 运行时 ==');
const mob = await open(390, 844);
const mr = await mob.p.evaluate(() => {
  const s = document.querySelector('.poster-score');
  const pic = s.closest('.poster-pic');
  const r = s.getBoundingClientRect(), pr2 = pic.getBoundingClientRect();
  return {
    inside: r.right <= pr2.right + 0.6 && r.bottom <= pr2.bottom + 0.6 && r.left >= pr2.left - 0.6 && r.top >= pr2.top - 0.6,
    h: +r.height.toFixed(1),
    pre: getComputedStyle(s, '::before').filter,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  };
});
ok('C1 390 下角标仍在海报内、尺寸不塌（高 ≥20px）、::before 的 blur 仍在',
  mr.inside && mr.h >= 20 && /blur\(/.test(mr.pre), `h=${mr.h} ${mr.pre}`);
ok('C2 390 无横向溢出 + 零 JS 异常', mr.overflow === 0 && mob.errs.length === 0, `ov=${mr.overflow} err=${mob.errs.length}`);

await browser.close();
console.log(`\n===== 第 89 轮 watch（评分角标降噪）：${pass} PASS / ${fail} FAIL =====`);
process.exit(fail ? 1 : 0);
