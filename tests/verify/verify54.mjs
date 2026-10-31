/* verify54.mjs — 第 54 轮验证：两个图标职能对调
 *
 * 需求：
 *   ① 原本由「左侧小黄人」承担的**点击切换主题**，集成到「史蒂夫头像」上
 *   ② 「左侧小黄人」改为负责**进入 / 退出观影记录界面**
 *
 * 覆盖：
 *   A1-A5 静态指纹：版本号、id 归属、素材未被换错、绑定只有一处、观影页返回文案
 *   B1    头部结构不变（3 个 grid 子项、高 173）
 *   B2-B3 小黄人 = 链接（href=watch.html，无 role=button）、史蒂夫 = 可聚焦控件
 *   B4-B6 史蒂夫：单击切主题 + 持久化、连点始终在 3 套主题内、键盘 Enter/Space 可用
 *   B7-B8 小黄人：进得去 watch.html、观影页同一个形象退得回来
 *   B9    小黄人仍保留可点击反馈（cursor / transition / 最小可用热区）
 *   B10   互不干扰：点史蒂夫不改氛围特效、页脚 #fx-seg 仍正常
 *   B11   主题刷新后保持
 *   B12   零 JS 异常
 *   C1-C3 390px：无横向溢出、两个图标都在、尺寸按断点缩小
 */
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const BASE = process.env.BASE || 'http://127.0.0.1:8895/';
const URL = BASE + 'index.html';
let pass = 0, fail = 0;
const ok = (msg, cond, extra) => {
  if (cond) { pass++; console.log('PASS  ' + msg + (extra !== undefined ? '  — ' + JSON.stringify(extra) : '')); }
  else { fail++; console.log('FAIL  ' + msg + (extra !== undefined ? '  — ' + JSON.stringify(extra) : '')); }
};

const browser = await chromium.launch({ args: ['--no-proxy-server'] });

/* ================= A. 静态指纹 ================= */
const ctxA = await browser.newContext();
const pa = await ctxA.newPage();
await pa.goto(URL, { waitUntil: 'domcontentloaded' });
const grab = (u) => pa.evaluate(async (x) => (await fetch(x, { cache: 'reload' })).text(), u);
const html = await grab('index.html?cb=' + Date.now());
const app = await grab('app.js?v=105&cb=' + Date.now());
const watchHtml = await grab('watch.html?cb=' + Date.now());

ok('A1 版本号 style.css?v=110 / app.js?v=105 / fx.js?v=16',
  /style\.css\?v=110/.test(html) && /app\.js\?v=105/.test(html) && /fx\.js\?v=16/.test(html));

ok('A2 小黄人是链接（class=logo + href=watch.html + id=logo-watch），不再是 theme-light',
  /<a class="logo" id="logo-watch" href="watch\.html"/.test(html) && !/logo"[^>]*id="theme-light"/.test(html));

ok('A3 #theme-light 挂在史蒂夫头像上',
  /<div class="header-avatar" id="theme-light" role="button" tabindex="0"/.test(html));

ok('A4 小黄人素材没被换错（仍是 minion-0ef9a202.webp）',
  /<a class="logo"[^>]*>\s*<img src="img\/minion-0ef9a202\.webp"/.test(html.replace(/\r?\n\s*/g, ' ')));

ok('A5 主题仍由 app.js 的 bindFlip 绑在 #theme-light 上（第 83 轮起四套一起随机，mode=all）',
  /const bindFlip = \(el, mode\) =>/.test(app)
  && /bindFlip\(\$\('theme-light'\), 'all'\);/.test(app)
  && !/bindFlip\(\$\('logo/.test(app)
  && (app.match(/bindFlip\(\$/g) || []).length === 1,
  { calls: (app.match(/bindFlip\(\$/g) || []).length });

ok('A6 观影页的返回入口文案已改为「退出观影记录」，且由 aria-label 承载（第 83 轮起无 title 气泡）',
  /class="w-home"[^>]*aria-label="退出观影记录/.test(watchHtml) &&
  !/class="w-home"[^>]*\btitle=/.test(watchHtml), (watchHtml.match(/class="w-home"[^>]*/) || [])[0]);
await ctxA.close();

/* ================= B. 浏览器实测 ================= */
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await page.goto(URL, { waitUntil: 'load' });
await page.waitForTimeout(900);

const geo = await page.evaluate(() => {
  const header = document.querySelector('.site-header');
  const logo = document.querySelector('.logo');
  const av = document.querySelector('.header-avatar');
  const lcs = getComputedStyle(logo), acs = getComputedStyle(av);
  return {
    kids: [...header.children].map((n) => n.className),
    headerH: +header.getBoundingClientRect().height.toFixed(2),
    logoTag: logo.tagName, logoHref: logo.getAttribute('href'), logoRole: logo.getAttribute('role'),
    logoTitle: logo.getAttribute('title'), logoAria: logo.getAttribute('aria-label'),
    logoRect: (() => { const r = logo.getBoundingClientRect(); return [+r.width.toFixed(2), +r.height.toFixed(2)]; })(),
    logoCursor: lcs.cursor, logoTransition: lcs.transitionDuration, logoUnderline: lcs.textDecorationLine,
    avRole: av.getAttribute('role'), avTab: av.getAttribute('tabindex'),
    avTitle: av.getAttribute('title'), avAria: av.getAttribute('aria-label'), avHidden: av.getAttribute('aria-hidden'),
    avCursor: acs.cursor, avTransition: acs.transitionDuration,
    avRect: (() => { const r = av.getBoundingClientRect(); return [+r.width.toFixed(2), +r.height.toFixed(2)]; })(),
  };
});

ok('B1 头部仍是 3 个 grid 子项，高度 173 未变',
  geo.kids.length === 3 && geo.kids[0] === 'brand' && Math.abs(geo.headerH - 173) < 1, { kids: geo.kids, h: geo.headerH });
ok('B2 小黄人是 <a href="watch.html">，不再声明 role=button；语义归 aria-label、已无 title 气泡',
  geo.logoTag === 'A' && geo.logoHref === 'watch.html' && geo.logoRole === null
  && geo.logoAria === '进入观影记录' && geo.logoTitle === null && geo.logoUnderline === 'none', geo);
ok('B3 史蒂夫可聚焦、可点击（role=button / tabindex=0 / aria-label 含当前主题 / 无 title 气泡 / 无 aria-hidden）',
  geo.avRole === 'button' && geo.avTab === '0' && /当前/.test(geo.avAria || '')
  && geo.avTitle === null && geo.avHidden === null, geo.avAria);
ok('B4 史蒂夫尺寸未变（132×132，与小黄人同体量）',
  geo.avRect[0] === 132 && geo.avRect[1] === 132 && geo.logoRect[0] === 132, { av: geo.avRect, logo: geo.logoRect });
ok('B5 两个图标都保留点击反馈（cursor:pointer + transition 非 0）',
  geo.logoCursor === 'pointer' && geo.avCursor === 'pointer'
  && parseFloat(geo.logoTransition) > 0 && parseFloat(geo.avTransition) > 0,
  { lc: geo.logoCursor, ac: geo.avCursor, lt: geo.logoTransition, at: geo.avTransition });

// —— 主题切换：点史蒂夫
const t0 = await page.evaluate(() => ({ theme: document.documentElement.dataset.theme, stored: localStorage.getItem('theme'), aria: document.querySelector('.header-avatar').getAttribute('aria-label') }));
await page.click('.header-avatar');
await page.waitForTimeout(300);
const t1 = await page.evaluate(() => ({
  theme: document.documentElement.dataset.theme,
  stored: localStorage.getItem('theme'),
  aria: document.querySelector('.header-avatar').getAttribute('aria-label'),
  toast: (document.querySelector('.toast') || {}).textContent || '',
}));
ok('B6 点史蒂夫 → 主题切换 + 写入 localStorage + aria-label/toast 同步（title 恒为空）',
  t1.theme !== t0.theme && t1.stored === t1.theme && /当前：/.test(t1.aria) && /主题/.test(t1.toast)
  && (await page.evaluate(() => document.querySelector('.header-avatar').getAttribute('title'))) === null,
  { before: t0.theme, after: t1.theme, stored: t1.stored, aria: t1.aria });

// 连点 6 次，始终落在 3 套浅色主题内且每次都变
const seq = [t1.theme];
for (let i = 0; i < 6; i++) {
  await page.click('.header-avatar');
  await page.waitForTimeout(160);
  seq.push(await page.evaluate(() => document.documentElement.dataset.theme));
}
// 第 83 轮：新增第四套深色主题 night，随机池从三套扩到四套
const THEMES = ['cream', 'mint', 'dawn', 'night'];
ok('B7 连点 6 次：每次都换、且只落在 cream/mint/dawn/night 四套主题',
  seq.every((v, i) => i === 0 || v !== seq[i - 1]) && seq.every((v) => THEMES.includes(v)), seq);

// 键盘：聚焦史蒂夫后 Enter / Space
await page.focus('.header-avatar');
const tk0 = await page.evaluate(() => document.documentElement.dataset.theme);
await page.keyboard.press('Enter');
await page.waitForTimeout(220);
const tk1 = await page.evaluate(() => document.documentElement.dataset.theme);
await page.keyboard.press('Space');
await page.waitForTimeout(220);
const tk2 = await page.evaluate(() => document.documentElement.dataset.theme);
ok('B8 键盘 Enter / Space 在史蒂夫上同样切换主题', tk1 !== tk0 && tk2 !== tk1, { tk0, tk1, tk2 });

// 互不干扰
const fxBefore = await page.evaluate(() => window.__fx.mode());
await page.click('.header-avatar');
await page.waitForTimeout(200);
const fxAfter = await page.evaluate(() => window.__fx.mode());
ok('B9 点史蒂夫不影响氛围特效（仍是页脚 #fx-seg 的地盘）', fxBefore === fxAfter, { fxBefore, fxAfter });

await page.click('#fx-seg button[data-fx="off"]');
await page.waitForTimeout(200);
const segOk = await page.evaluate(() => window.__fx.mode() === 'off' && document.querySelector('#fx-seg button[data-fx="off"]').classList.contains('active'));
ok('B10 页脚氛围开关仍正常工作', segOk);
await page.click('#fx-seg button[data-fx="meteor"]');
await page.waitForTimeout(150);

// 刷新后主题保持
const beforeReload = await page.evaluate(() => document.documentElement.dataset.theme);
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(700);
const afterReload = await page.evaluate(() => document.documentElement.dataset.theme);
ok('B11 刷新后主题保持', beforeReload === afterReload, { before: beforeReload, after: afterReload });

// —— 小黄人：进入观影记录
await page.click('.logo');
await page.waitForURL(/watch\.html/, { timeout: 6000 }).catch(() => {});
await page.waitForTimeout(500);
const w1 = page.url();
const watchInfo = await page.evaluate(() => ({
  theme: document.documentElement.dataset.theme,
  home: !!document.querySelector('.w-home'),
  // 第 83 轮：删掉 title 悬停气泡，「说明退出」的语义改由 aria-label 承载
  homeLabel: (document.querySelector('.w-home') || { getAttribute: () => null }).getAttribute('aria-label') || '',
  homeTitle: (document.querySelector('.w-home') || {}).title || '',
}));
ok('B12 点小黄人 → 进入 watch.html', /watch\.html/.test(w1), w1.split('/').pop());
ok('B13 观影页同一形象是「退出」入口（.w-home 指向首页，说明文字在 aria-label、无 title 气泡）',
  watchInfo.home && /退出/.test(watchInfo.homeLabel) && watchInfo.homeTitle === '' &&
  watchInfo.theme === 'cinema', watchInfo);

// —— 退出
await page.click('.w-home');
await page.waitForTimeout(700);
const backUrl = page.url();
const backTheme = await page.evaluate(() => document.documentElement.dataset.theme);
ok('B14 观影页点小黄人 → 退回游戏时长页，且主题沿用', !/watch\.html/.test(backUrl) && THEMES.includes(backTheme), { url: backUrl.split('/').pop(), theme: backTheme });

ok('B15 零 JS 异常', errs.length === 0, errs.slice(0, 3));
await ctx.close();

/* ================= C. 窄屏 ================= */
const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
const p2 = await ctx2.newPage();
await p2.goto(URL, { waitUntil: 'load' });
await p2.waitForTimeout(800);
const nar = await p2.evaluate(() => {
  const d = document.documentElement;
  const l = document.querySelector('.logo'), a = document.querySelector('.header-avatar');
  return {
    overflow: d.scrollWidth - d.clientWidth,
    logo: [+l.getBoundingClientRect().width.toFixed(1), +l.getBoundingClientRect().height.toFixed(1)],
    av: [+a.getBoundingClientRect().width.toFixed(1), +a.getBoundingClientRect().height.toFixed(1)],
  };
});
ok('C1 390px 无横向溢出', nar.overflow === 0, nar.overflow);
ok('C2 390px 两个图标都按断点缩到 88px', nar.logo[0] === 88 && nar.av[0] === 88, nar);
await ctx2.close();

await browser.close();
console.log('\n================ ' + pass + ' / ' + (pass + fail) + ' ================');
if (fail) process.exitCode = 1;
