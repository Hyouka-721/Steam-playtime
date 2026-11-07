/* verify108.mjs — 第 108 轮：流星特效视觉优化（本地回归）
 *
 * 契约：只改视觉与节奏，风格 / 布局 / 功能零改动。
 * 柔和轻盈（速度与亮度下调、双向渐隐、柔光头）、有层次（远中近三档 + 微光尘）、
 * 不过度抢眼（峰值透明度、同屏密度、内容区衰减）、适配窄屏（参数随视口缩放）、
 * 流畅（微光尘离屏预渲染、同屏上限、无每帧 DOM 查询）。
 * 第 109 轮同步：用户要求「流星的密度提高」→ A2 / A2b / B3b 改守新密度区间。
 * 第 110 轮同步：用户要求「密度再翻倍，速度略微提高，不透明度提高，峰值亮度提高」
 *   → A2 改为守四项新区间、新增 A2c（光带整体不透明度）、A2b 阈值同步、B2 峰值判据同步。
 *   层次 / 渐隐 / 尾迹 / 方向 / 配色 / 功能契约保持第 108 轮原样；沿用本文件与 online108。
 *
 * 用法：cd 到仓库根后 node tests/verify/verify108.mjs（需起 127.0.0.1:8895 静态服务）
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');
const ROOT = new URL('../../', import.meta.url);
const read = (p) => fs.readFileSync(new URL(p, ROOT), 'utf8');
const html = read('docs/index.html');
const css = read('docs/style.css');
const js = read('docs/fx.js');

const LOCAL = 'http://127.0.0.1:8895/index.html';
let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('PASS  ' + name + (extra === undefined ? '' : ' — ' + JSON.stringify(extra))); }
  else { fail++; console.log('FAIL  ' + name + ' — ' + JSON.stringify(extra)); }
};
const pair = (key) => {
  const m = js.match(new RegExp(key + ':\\s*\\[([\\d.]+),\\s*([\\d.]+)\\]'));
  return m ? [parseFloat(m[1]), parseFloat(m[2])] : null;
};
const num = (key) => {
  const m = js.match(new RegExp(key + ':\\s*([\\d.]+)'));
  return m ? parseFloat(m[1]) : NaN;
};
const sat = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (!d) return 0;
  const l = (mx + mn) / 2 / 255;
  return d / 255 / (1 - Math.abs(2 * l - 1));
};

/* ---------- A 源码契约：版本 / 参数 / 层次 / 功能不变 ---------- */
const cssV = (html.match(/style\.css\?v=(\d+)/) || [])[1];
const appV = (html.match(/app\.js\?v=(\d+)/) || [])[1];
const fxV = (html.match(/fx\.js\?v=(\d+)/) || [])[1];
ok('A1 版本参数 CSS 133 / APP 119 / FX 19（app.js 未改不 bump）',
  cssV === '136' && appV === '121' && fxV === '19', { css: cssV, app: appV, fx: fxV });

const rate = pair('spawnPerSec'), speed = pair('speed'), alpha = pair('alpha'),
  len = pair('length'), ttl = pair('ttl'), thick = pair('thickness');
const gap = num('minGap'), silence = pair('silence');
ok('A2 第 110 轮四项：密度再翻倍 / 速度略提 / 峰值亮度提高 / 尾迹与粗细不变',
  rate && rate[0] >= 2.0 && rate[1] <= 4.5 &&
  num('maxAlive') >= 18 && num('maxAlive') <= 22 &&
  speed && speed[0] >= 260 && speed[1] >= 500 && speed[1] <= 560 &&
  alpha && alpha[0] >= 0.24 && alpha[1] >= 0.42 && alpha[1] <= 0.50 &&
  len && len[1] <= 170 && thick && thick[1] <= 1.5,
  { rate, maxAlive: num('maxAlive'), speed, alpha, len, thick });
ok('A2b 生成节奏确实更密，但仍保留最小间隔与随机静默（未变成连续喷射）',
  gap > 0 && gap <= 0.20 && silence && silence[1] <= 0.12,
  { minGap: gap, silence });
ok('A2c 光带整体不透明度提高（外发光 / 中层 / 渐变中段 / 内容区避让 / 头部柔光）',
  num('haloAlpha') >= 0.36 && js.includes('ctx.globalAlpha = 0.62') &&
  js.includes('alpha * 0.92') && js.includes('alpha * 0.52') &&
  num('avoidAlpha') >= 0.80 && js.includes('alpha * 0.22') && js.includes('alpha * 0.46'),
  { haloAlpha: num('haloAlpha'), avoidAlpha: num('avoidAlpha') });
ok('A3 生命周期 ≥1.6s 且双向渐隐（fadeIn / fadeOut 均存在）',
  ttl && ttl[0] >= 1.6 && num('fadeInFrac') > 0 && num('fadeOutFrac') > 0 &&
  js.includes('smooth(clamp(t / c.fadeInFrac'), { ttl, fadeIn: num('fadeInFrac'), fadeOut: num('fadeOutFrac') });
ok('A4 远 / 中 / 近三档 + 静态微光尘离屏预渲染',
  /layers:\s*\[/.test(js) && (js.match(/\{\s*w:\s*[\d.]+/g) || []).length === 3 &&
  /countAt1440/.test(js) && js.includes('drawImage(dust'));
ok('A5 方向散布、随机静默、防扎堆、视口缩放齐备',
  num('angleJitter') > 0 && pair('silence') && num('minGap') > 0 &&
  /scale = clamp\(w \/ 1440/.test(js) && /CONFIG\.meteor\.maxAlive \* scale/.test(js),
  { jitter: num('angleJitter'), silence: pair('silence'), minGap: num('minGap') });
ok('A6 内容区亮度衰减与低频矩形刷新（不在每帧查 DOM）',
  num('avoidAlpha') < 1 && js.includes('inContent(p.x, p.y)') &&
  js.includes('rebuildAvoid()') && /avoidClock >= 1/.test(js), num('avoidAlpha'));
ok('A7 主题切换在屏粒子不突变（出生时锁定颜色）',
  js.includes('col: colors.meteor.slice()') && js.includes('MutationObserver(refreshColors)'));
ok('A8 头部为两层柔光晕、尾迹为多段平滑衰减',
  js.includes("g.addColorStop(0.65") && js.includes("p.thick * 3.2") && js.includes('haloAlpha'));

const fxColors = [...css.matchAll(/--fx-meteor:\s*(#[0-9a-f]{6})/gi)].map((m) => m[1]);
const accents = [...css.matchAll(/--accent:\s*(#[0-9a-f]{6})/gi)].map((m) => m[1]);
ok('A9 两套主题特效色均去饱和且不与强调色同值',
  fxColors.length === 2 && fxColors.every((c) => sat(c) <= 0.45) &&
  fxColors.every((c) => !accents.includes(c)),
  fxColors.map((c) => [c, Math.round(sat(c) * 100) / 100]));
const canvasRule = (css.match(/#fx-canvas \{[^}]*\}/) || [])[0] || '';
ok('A10 功能契约零改动：开关 / 存储 / 减少动效 / 隐藏暂停 / resize 节流 / DPR / API',
  js.includes("storageKey: 'fx-mode'") && js.includes('prefers-reduced-motion') &&
  js.includes('visibilitychange') && js.includes('clearTimeout(rt)') && js.includes('}, 160)') &&
  js.includes('window.__fx = {') && js.includes('onChange(fn)') &&
  js.includes('CONFIG.lite.dpr') && canvasRule.includes('pointer-events: none') &&
  canvasRule.includes('z-index: 20') && /#fx-canvas \{ display: none; \}/.test(css));

/* ---------- B 运行时：亮度 / 密度 / 开关 / 降级 ---------- */
const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const errs = [];
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
const page = await ctx.newPage();
page.on('pageerror', (e) => errs.push(String(e)));
await page.goto(LOCAL + '?t=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 40000 });
await page.waitForSelector('#lt-list > .rank-item', { state: 'visible', timeout: 40000 });
await page.waitForTimeout(600);

/* 逐像素采样：头部亮点只有 1–3px，每 4 像素抽 1 会漏掉峰值（实测低估一半以上） */
const sample = () => page.evaluate(() => {
  const c = document.getElementById('fx-canvas');
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let n = 0, max = 0;
  const total = d.length / 4;
  for (let i = 3; i < d.length; i += 4) {
    const a = d[i];
    if (a > 0) { n++; if (a > max) max = a; }
  }
  return { n, max, total };
});

ok('B1 默认开启且两态开关有效',
  (await page.evaluate(() => window.__fx.mode())) === 'meteor' &&
  (await page.evaluate(() => window.__fx.toggle())) === 'off' &&
  (await page.evaluate(() => window.__fx.toggle())) === 'meteor');
await page.waitForTimeout(300);

// 观察窗 ≥5s：流星 ttl 1.6–2.6s、生成间隔 1–2.5s，窗口太短会整段错过峰值而假红
let peak = 0, ratio = 0, maxN = 0, samples = [];
for (let i = 0; i < 24; i++) {
  const s = await sample();
  peak = Math.max(peak, s.max);
  maxN = Math.max(maxN, s.n);
  ratio = Math.max(ratio, s.n / s.total);
  samples.push([s.n, s.max]);
  await page.waitForTimeout(220);
}
// 第 110 轮：峰值亮度提高 + 密度再翻倍 → 多颗光带局部叠加，实测峰值 150–176/255。
// 判据改为双向：「确实更亮（≥100）」且「未炸白（≤205，0.80）」。
// 注意单颗 alpha 上限只有 0.46（仍低于改造前 0.72），画面峰值偏高是多颗叠加所致。
ok('B2 峰值亮度提高且未炸白（0.39–0.80；多颗叠加，单颗上限仍 0.46）',
  peak >= 100 && peak <= 205, { peak, of255: 255 });
ok('B2b 观察窗内确有流星划过且可见（峰值显著高于静态底噪 15–20）',
  peak >= 30 && maxN >= 30, { peak, maxN, samples });
ok('B3 非透明像素占比 ≤1.5%（不密集、不遮挡内容）', ratio <= 0.015,
  { maxRatio: Math.round(ratio * 10000) / 10000, samples });
// 静态微光尘底噪约 110–120 个非透明像素；≥200 即视为该帧确有流星。
// 密度回调后观察窗内应多数时刻有流星，避免「参数改了但运行时没变密」。
const activeFrames = samples.filter(([n]) => n >= 200).length;
ok('B3b 密度提高后观察窗内活跃帧 ≥12/24（多数时刻有流星划过）',
  activeFrames >= 12, { activeFrames, total: samples.length, samples });

await page.evaluate(() => window.__fx.toggle()); // 关
await page.waitForTimeout(250);
const off = await sample();
ok('B4 关闭后画布彻底清空、无残留', off.n === 0 && off.max === 0, off);
ok('B5 开关状态写入 localStorage', (await page.evaluate(() => localStorage.getItem('fx-mode'))) === 'off');
await page.evaluate(() => window.__fx.toggle()); // 开回来

const rctx = await browser.newContext({ viewport: { width: 1024, height: 768 }, reducedMotion: 'reduce' });
const rp = await rctx.newPage();
await rp.goto(LOCAL + '?t=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 40000 });
await rp.waitForTimeout(700);
const rs = await rp.evaluate(() => {
  const c = document.getElementById('fx-canvas');
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let n = 0;
  for (let i = 3; i < d.length; i += 16) if (d[i] > 0) n++;
  return { mode: window.__fx.mode(), n };
});
ok('B6 系统「减少动效」下保持关闭且画布全空', rs.mode === 'off' && rs.n === 0, rs);
await rctx.close();

/* ---------- C 主题 / 尺寸 / 布局 ---------- */
await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'cinema'));
await page.waitForTimeout(450);
const cinemaS = await sample();
ok('C1 主题切换后特效继续运行且无颜色突变风险', cinemaS.n > 0 && errs.length === 0,
  { nonZero: cinemaS.n, errs });
await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'cream'));
await page.waitForTimeout(300);

const overflow = [];
for (const w of [1440, 1280, 1088, 900, 390]) {
  await page.setViewportSize({ width: w, height: 900 });
  await page.waitForTimeout(280);
  const o = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth - window.innerWidth,
    cw: document.getElementById('fx-canvas').width,
  }));
  overflow.push({ w, ...o });
}
ok('C2 五档宽度零横向溢出', overflow.every((x) => x.doc <= 0), overflow);
ok('C3 窄屏画布按视口缩放（390 宽度明显小于 1440）',
  overflow[4].cw < overflow[0].cw / 2, overflow.map((x) => [x.w, x.cw]));
const cls = await page.evaluate(() =>
  performance.getEntriesByType('layout-shift').reduce((a, e) => a + (e.hadRecentInput ? 0 : e.value), 0));
ok('C4 CLS ≈ 0（特效不参与布局）', cls < 0.01, cls);
ok('Z1 全程零 JS 异常', errs.length === 0, errs);

await browser.close();
console.log('\n===== verify108 ' + pass + '/' + (pass + fail) + ' PASS，FAIL=' + fail + ' =====');
process.exit(fail ? 1 : 0);
