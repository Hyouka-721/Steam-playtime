import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const BASE = 'http://127.0.0.1:8895/';
const D = 'C:/Users/33329/WorkBuddy/2026-10-13-18-17-49/steam-playtime/docs/';
const rd = (f) => fs.readFileSync(D + f, 'utf8').replace(/\r\n/g, '\n');
const stripCmt = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');

let pass = 0, fail = 0;
const ok = (n, c, extra = '') => { c ? (pass++, console.log(`PASS ${n}${extra ? '  ' + extra : ''}`)) : (fail++, console.log(`FAIL ${n}  ${extra}`)); };

const css = rd('watch.css'), html = rd('watch.html'), js = rd('watch.js'), styleCss = rd('style.css');
const cssNC = stripCmt(css);

/* ================= A 静态指纹 ================= */
console.log('== A 静态指纹 ==');
ok('A1 watch.html 用史蒂夫取代文字按钮（#w-avatar 存在、无 .w-layout 按钮）',
  /id="w-avatar"/.test(html) && !/w-layout-btn/.test(html) && !/class="w-layout"/.test(html));
ok('A2 头像具备与原图标一致的交互属性（role/tabindex/aria-pressed/aria-label；第 83 轮起无 title 气泡）',
  /class="w-avatar" id="w-avatar" role="button" tabindex="0"\s*\n?\s*aria-pressed="false" aria-label="切换到时间轴视图"/.test(html) &&
  !/id="w-avatar"[^>]*\btitle=/.test(html));
ok('A3 版本号 bump：watch.css?v=21 / watch.js?v=16',
  /watch\.css\?v=21"/.test(html) && /watch\.js\?v=16"/.test(html));

const wav = (cssNC.match(/\.w-avatar \{[^}]*\}/) || [''])[0];
ok('A4 .w-avatar 132×132 + 同一素材 + 同一投影',
  /width: 132px; height: 132px;/.test(wav) && /url\("img\/steve-ceb15b8a\.webp"\) center \/ contain no-repeat/.test(wav) &&
  /drop-shadow\(0 4px 12px rgba\(0, 0, 0, 0\.3\)\)/.test(wav));
ok('A5 .w-avatar 三个反馈态齐全（hover 1.05 / active 0.96 / focus-visible）',
  /\.w-avatar:hover \{ transform: scale\(1\.05\); \}/.test(cssNC) &&
  /\.w-avatar:active \{ transform: scale\(0\.96\); \}/.test(cssNC) &&
  /\.w-avatar:focus-visible \{ outline: 2px solid var\(--accent\); outline-offset: 4px; border-radius: 12px; \}/.test(cssNC));
const m480 = cssNC.slice(cssNC.indexOf('@media (max-width: 480px)'));
ok('A6 ≤480px .w-avatar 88×88', /\.w-avatar \{ width: 88px; height: 88px; \}/.test(m480));

/* 「与原图标保持一致」的硬口径：把首页 .header-avatar 与本页 .w-avatar 的声明集逐条对比 */
const declOf = (block) => block.split('\n').map((s) => s.trim()).filter((s) => s && !s.startsWith('/*') && !s.startsWith('*'));
const hda = (stripCmt(styleCss).match(/\.header-avatar \{[^}]*\}/) || [''])[0];
const norm = (b) => declOf(b.replace(/^[^{]*\{|\}$/g, '')).join(' ').replace(/\s+/g, ' ').trim();
ok('A7 与首页 .header-avatar 的声明集完全相同', norm(hda) === norm(wav), `\n     idx: ${norm(hda)}\n     wch: ${norm(wav)}`);

ok('A8 watch.css 已无 .w-layout 规则残留', !/\.w-layout/.test(cssNC));
ok('A9 watch.js 不再引用 .w-layout-btn，改为 #w-avatar',
  !/querySelectorAll\('\.w-layout-btn'\)/.test(js) && /getElementById\('w-avatar'\)/.test(js));
ok('A10 watch.js 绑定 click + Enter/Space（与首页 bindFlip 同写法）',
  /avatarEl\.addEventListener\('click', toggleLayout\)/.test(js) &&
  /e\.key === 'Enter' \|\| e\.key === ' '/.test(js) && /e\.preventDefault\(\)/.test(js));

/* ================= B 位置与尺寸 ================= */
console.log('\n== B 位置与尺寸（首页 .header-avatar vs 观影页 .w-avatar）==');
const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const box = (page, sel) => page.evaluate((s) => {
  const el = document.querySelector(s), r = el.getBoundingClientRect();
  const hdr = el.parentElement.getBoundingClientRect();
  return { w: +r.width.toFixed(2), h: +r.height.toFixed(2), left: +r.left.toFixed(2), right: +r.right.toFixed(2),
    top: +r.top.toFixed(2), rightGap: +(window.innerWidth - r.right).toFixed(2),
    hdrH: +hdr.height.toFixed(2), topInHdr: +(r.top - hdr.top).toFixed(2),
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
}, sel);

const WIDTHS = [1440, 1100, 861, 860, 700, 480, 390];
const ROWS = [];
for (const W of WIDTHS) {
  const ctx = await browser.newContext({ viewport: { width: W, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(BASE + 'index.html', { waitUntil: 'load' });
  await page.waitForTimeout(350);
  const a = await box(page, '.header-avatar');
  /* 2026-10-24 第 58 轮：标题字号已与首页同值 -> 行数判据改为「不超过首页」，不再硬编码 2 行 */
  const homeLines = await page.evaluate(() => {
    const t = document.querySelector('.site-title');
    return Math.round(t.getBoundingClientRect().height / parseFloat(getComputedStyle(t).lineHeight));
  });
  await page.goto(BASE + 'watch.html', { waitUntil: 'load' });
  await page.waitForTimeout(350);
  const b = await box(page, '.w-avatar');
  const lines = await page.evaluate(() => {
    const t = document.querySelector('.w-title');
    return Math.round(t.getBoundingClientRect().height / parseFloat(getComputedStyle(t).lineHeight));
  });
  ROWS.push({ W, a, b });
  ok(`B[${W}] 尺寸完全相同（${a.w}×${a.h} vs ${b.w}×${b.h}）`, a.w === b.w && a.h === b.h);
  ok(`B[${W}] 横向位置完全相同（left ${a.left}/${b.left}，right ${a.right}/${b.right}，右边距 ${a.rightGap}/${b.rightGap}）`,
    a.left === b.left && a.right === b.right && a.rightGap === b.rightGap);
  ok(`B[${W}] 无横向溢出 + 标题行数≤首页 + 零 JS 异常`, a.overflow === 0 && b.overflow === 0 && lines <= homeLines && errs.length === 0,
    `lines=${lines}`);
  await ctx.close();
}

const at = (w) => ROWS.find((x) => x.W === w);
ok('B8 桌面 132×132', at(1440).b.w === 132 && at(1440).b.h === 132);
ok('B9 860px 仍 132×132（不因窄屏缩小）', at(860).b.w === 132);
ok('B10 480 / 390 缩到 88×88', at(480).b.w === 88 && at(390).b.w === 88);
/* 页眉高度：≥861 两页完全一致（此处两页标题都不换行）；≤700 首页 70px 标题自身换行导致其页眉变高，
   头像在各自页眉内都是垂直居中 —— 属于首页既有行为，不是本次改动引入的差异 */
ok('B11 页眉高度在 ≥861 时两页相同（173 / 161）',
  at(1440).a.hdrH === at(1440).b.hdrH && at(860).a.hdrH === at(860).b.hdrH,
  `1440: ${at(1440).a.hdrH}/${at(1440).b.hdrH}  860: ${at(860).a.hdrH}/${at(860).b.hdrH}`);
ok('B12 头像在自身页眉内的上偏移一致（20 / 14）', ROWS.filter((r) => r.W >= 860).every((r) => r.a.topInHdr === r.b.topInHdr),
  ROWS.filter((r) => r.W >= 860).map((r) => `${r.W}:${r.a.topInHdr}/${r.b.topInHdr}`).join(' '));

/* ================= C 交互 ================= */
console.log('\n== C 交互（用 mock 数据让两种视图都能真实渲染）==');
const MOCK = { updated_at: '2026-10-24T18:00:00+08:00', items: [
  { id: 'a1', title: '测试片甲', kind: 'movie', watched_at: '2026-10-20', rating: 8, poster: 'img/minion-0ef9a202.webp', note: '一' },
  { id: 'a2', title: '测试片乙', kind: 'series', watched_at: '2026-10-18', rating: 7, poster: 'img/minion-0ef9a202.webp' },
  { id: 'a3', title: '测试片丙', kind: 'movie', watched_at: '2026-09-02', rating: 9, poster: 'img/minion-0ef9a202.webp' },
] };

const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
await page.route('**/data/watch.json*', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK) }));
await page.goto(BASE + 'watch.html', { waitUntil: 'load' });
await page.waitForSelector('#w-grid .poster', { timeout: 8000 }).catch(() => {});
await page.waitForTimeout(300);

const state = () => page.evaluate(() => {
  const av = document.getElementById('w-avatar');
  const g = document.getElementById('w-grid'), t = document.getElementById('w-tl');
  return {
    pressed: av.getAttribute('aria-pressed'),
    // 第 83 轮：title 气泡已删，语义全靠 aria-label（hasTitle 用来做反向守卫）
    title: av.title, hasTitle: av.hasAttribute('title'), label: av.getAttribute('aria-label'),
    gridHidden: g.hidden, tlHidden: t.hidden,
    posters: g.querySelectorAll('.poster').length, tlItems: t.querySelectorAll('.tl-item').length,
    stored: localStorage.getItem('watch-layout'),
  };
});

let s = await state();
ok('C1 默认网格视图：grid 可见 / tl 隐藏 / aria-pressed=false / aria-label=切换到时间轴视图（第 83 轮起无 title 气泡）',
  s.gridHidden === false && s.tlHidden === true && s.pressed === 'false' && s.label === '切换到时间轴视图' && s.hasTitle === false,
  JSON.stringify(s));

await page.click('#w-avatar');
await page.waitForTimeout(250);
s = await state();
ok('C2 点史蒂夫 → 时间轴视图（tl 可见、grid 隐藏、aria-pressed=true、aria-label 变「切换到网格视图」，始终无 title）',
  s.gridHidden === true && s.tlHidden === false && s.pressed === 'true' && s.label === '切换到网格视图' && s.hasTitle === false && s.tlItems === 3,
  JSON.stringify(s));
// 第 75 轮契约变更：视图选择不再持久化（用户要求「默认展示网格」），localStorage 不再写
ok('C3 视图选择不再持久化（watch-layout 不再写入，第 75 轮起）', s.stored === null, String(s.stored));

await page.click('#w-avatar');
await page.waitForTimeout(250);
s = await state();
ok('C4 再点一次 → 回到网格视图', s.gridHidden === false && s.tlHidden === true && s.pressed === 'false' && s.stored === null);

/* 键盘：Enter / Space */
await page.focus('#w-avatar');
await page.keyboard.press('Enter');
await page.waitForTimeout(220);
s = await state();
ok('C5 键盘 Enter 可切换到时间轴', s.tlHidden === false && s.pressed === 'true');
await page.keyboard.press(' ');
await page.waitForTimeout(220);
s = await state();
ok('C6 键盘 空格 可切回网格', s.gridHidden === false && s.pressed === 'false');

/* 刷新保持 → 第 75 轮起改为「刷新回到默认网格」 */
await page.click('#w-avatar');
await page.waitForTimeout(220);
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#w-grid .poster', { timeout: 8000 }).catch(() => {});
await page.waitForTimeout(300);
s = await state();
ok('C7 刷新后回到默认网格视图（第 75 轮起视图不持久化）',
  s.gridHidden === false && s.tlHidden === true && s.pressed === 'false', JSON.stringify(s));

/* 点击区域 = 整个 132×132：四角内缩 4px + 中心共 5 点**逐个真实点击**，每次都应切换。
   ⚠️ 不能用 elementFromPoint 判点击区域（第 56 轮踩到）：元素只要获得焦点，
   它会把右/下边缘的点判给父级 w-header —— 本地与线上表现完全一致，是浏览器取点口径问题，
   而真实鼠标点击四角都能正常切换。判「点击区域」只认真实点击。 */
await page.mouse.move(720, 620);
await page.waitForTimeout(320);
const box0 = await page.evaluate(() => {
  const b = document.getElementById('w-avatar').getBoundingClientRect();
  return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height };
});
ok('C8 量到的点击盒是 132×132', box0.w === 132 && box0.h === 132, JSON.stringify(box0));
const pts = [['左上', box0.l + 4, box0.t + 4], ['右上', box0.r - 4, box0.t + 4],
  ['左下', box0.l + 4, box0.b - 4], ['右下', box0.r - 4, box0.b - 4],
  ['中心', box0.l + box0.w / 2, box0.t + box0.h / 2]];
const results = [];
for (const [name, x, y] of pts) {
  const before = (await state()).pressed;
  await page.mouse.click(x, y);
  await page.waitForTimeout(240);
  const after = (await state()).pressed;
  results.push(`${name}:${before}→${after}`);
  if (before === after) { ok(`C9a 点击区域-${name} 应切换`, false, `${before}→${after}`); }
}
ok('C9 点击区域覆盖整个 132×132（四角 + 中心 5 点真实点击均切换）',
  results.every((s) => s.split(':')[1].split('→')[0] !== s.split(':')[1].split('→')[1]), results.join(' '));
const stBefore = (await state()).pressed;
await page.mouse.click(box0.r + 10, box0.t + box0.h / 2);
await page.waitForTimeout(240);
ok('C10 框外 10px 点击不触发切换', (await state()).pressed === stBefore, stBefore);
/* 回到网格视图，便于后续 hover 断言 */
if ((await state()).pressed === 'true') { await page.click('#w-avatar'); await page.waitForTimeout(200); }

/* hover 反馈 */
await page.hover('#w-avatar');
await page.waitForTimeout(280);
const tf = await page.evaluate(() => getComputedStyle(document.getElementById('w-avatar')).transform);
ok('C11 hover 缩放到 1.05（与首页同系数）', /matrix\(1\.05/.test(tf), tf);

/* 不影响原入口 */
await page.click('.w-home');
await page.waitForURL((u) => !/watch\.html/.test(u.href), { timeout: 8000 }).catch(() => {});
ok('C12 小黄人仍能退出观影页（原入口未受影响）', !/watch\.html/.test(page.url()), page.url());
ok('C13 全程零 JS 异常', errs.length === 0, errs.join(' | '));

await ctx.close();
await browser.close();
console.log(`\n===== 第 56 轮回归：${pass}/${pass + fail} =====`);
process.exit(fail ? 1 : 0);
