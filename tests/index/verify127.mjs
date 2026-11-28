/* verify127.mjs — 第 127 轮：Game Time 七项视觉精修
   ① 视觉层级：导航卡顶部强调短线（绝对定位，不占布局）
   ② 布局结构：数据页四面板宽屏 auto-fit 两列、报告独占整行
   ③ 配色：cinema 金银铜提亮（cream 不动）
   ④ 字体：数字 tabular-nums lining-nums
   ⑤ 留白：卡片标签字距微增
   ⑥ 组件风格：勋章展台两级柔光 box-shadow
   ⑦ 动效：--t-1/2/3/--ease token + 视图淡入（不位移，reduced-motion 关闭）
   冻结值守门：panel padding18 / head margin14 / 6.73em 标题 / 卡片27px 与列宽 / 860 断点数量。
   用法：node tests/index/verify127.mjs（需先起 8895 静态服务） */
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

const css = fs.readFileSync(ROOT + 'docs/style.css', 'utf8');
const code = css.replace(/\/\*[\s\S]*?\*\//g, '');   // 剥注释再查，避免注释里的字面量假红
const idx = fs.readFileSync(ROOT + 'docs/index.html', 'utf8');

// ---- A. 静态契约 ----
ok('A1 只 bump style.css→v147（第131轮修数据视图越界）；app129/fx19 未动',
  /style\.css\?v=159/.test(idx) && /app\.js\?v=141/.test(idx) && /fx\.js\?v=19/.test(idx) &&
  !/v=144/.test(code));
// 第 129 轮：导航卡顶部短线按用户要求删除（数据视图保留）→ A2 去掉短线要求，改守其余六项
// 第 131 轮：数据页 grid 必须限定在 .view.active#view-data（不能用裸 #view-data 的 ID 选择器，
//            否则权重压过 .view{display:none} → 数据视图在其他卡下也常驻显示）
ok('A2 六项规则齐备（数据grid/ lining/字距/勋章柔光/淡入/token）；卡短线已删；grid 限 active',
  !/\.card-nav\.active\)::before/.test(code) &&
  /\.view\.active#view-data \{[\s\S]*?display: grid/.test(code) &&
  !/(^|\n)#view-data \{[\s\S]*?display: grid/.test(code) &&
  /lining-nums/.test(code) &&
  /\.card-label \{ letter-spacing: 1\.4px/.test(code) &&
  /\.badges \.badge:hover/.test(code) &&
  /@keyframes view-fade/.test(code) &&
  /--t-1:/.test(code) && /--ease:/.test(code));
ok('A3 冻结值未动：panel padding18 / head margin14 / 6.73em / 卡片列宽 / 860断点=3',
  /padding: 18px 20px; margin-bottom: 20px;/.test(code) &&
  /margin-bottom: 14px/.test(code) &&
  /width: 6\.73em/.test(code) &&
  /grid-template-columns: 1\.2fr 1fr 1fr 0\.85fr 1fr/.test(code) &&
  (code.match(/@media \(max-width: 860px\)/g) || []).length === 3);
ok('A4 cinema 金银铜提亮、cream 原值保留',
  /--medal-1: #f5c45e; --medal-2: #d3cfe0; --medal-3: #e0a273/.test(code) &&
  /--medal-1: #c58a00; --medal-2: #8d8175; --medal-3: #b3703c/.test(code));

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto(BASE + 'index.html?cb=' + Date.now(), { waitUntil: 'load' });
await page.waitForFunction(() => document.querySelector('.card-value:not(.sk-value)') ||
  document.querySelectorAll('.card-value').length >= 5, null, { timeout: 20000 });
await page.waitForTimeout(300);

// ① 卡片强调短线：第 129 轮按用户要求删除 → 守「已不存在」
const heroBefore = await page.evaluate(() => {
  const cs = getComputedStyle(document.querySelector('.card-hero'), '::before');
  return { content: cs.content, position: cs.position };
});
ok('B1 hero 卡强调短线已删除（::before content=none）｜第129轮按用户要求',
  heroBefore.content === 'none', heroBefore);

// ④ 字体 lining-nums
const fv = await page.evaluate(() => getComputedStyle(document.querySelector('.card-value')).fontVariantNumeric);
ok('B2 数字 tabular-nums + lining-nums 生效', /tabular-nums/.test(fv) && /lining-nums/.test(fv), { fv });

// ③ 配色：切 cinema 读勋章色，再切回 cream
await page.evaluate(() => { document.documentElement.dataset.theme = 'cinema'; });
await page.waitForTimeout(100);
const cinemaMedal = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--medal-1').trim());
await page.evaluate(() => { document.documentElement.dataset.theme = 'cream'; });
await page.waitForTimeout(100);
const creamMedal = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--medal-1').trim());
ok('B3 cinema 金牌 #f5c45e、cream 仍 #c58a00',
  cinemaMedal.toLowerCase() === '#f5c45e' && creamMedal.toLowerCase() === '#c58a00', { cinemaMedal, creamMedal });

// 🔴 第 131 轮守护：切到数据以外的卡时，view-data 必须隐藏（防 ID 选择器 bug 复发）
await page.click('#card-lifetime');
await page.waitForTimeout(300);
const leak = await page.evaluate(() => {
  const vis = [...document.querySelectorAll('.view')].filter((v) => getComputedStyle(v).display !== 'none').map((v) => v.id);
  return { visibleViews: vis, dataDisplay: getComputedStyle(document.getElementById('view-data')).display };
});
ok('B3b 游戏时长视图下只有 view-lifetime 可见，view-data 不越界常驻｜第131轮修特异性bug',
  leak.visibleViews.length === 1 && leak.visibleViews[0] === 'view-lifetime' && leak.dataDisplay === 'none', leak);

// ② 数据页 grid 两列 + 报告独占整行（此时需 active）
await page.click('#card-data');
await page.waitForTimeout(300);
const grid = await page.evaluate(() => {
  const v = document.getElementById('view-data');
  const cs = getComputedStyle(v);
  const cols = cs.gridTemplateColumns.split(' ').filter(Boolean).length;
  const report = document.getElementById('panel-report');
  const rc = getComputedStyle(report).gridColumnStart + '/' + getComputedStyle(report).gridColumnEnd;
  return { display: cs.display, cols, reportCol: rc, active: v.classList.contains('active') };
});
ok('B4 数据页 grid 至少两列、阶段报告独占整行（active 时才 grid）',
  grid.display === 'grid' && grid.cols >= 2 && grid.reportCol === '1/-1' && grid.active, grid);

// ⑤ 字距
const ls = await page.evaluate(() => getComputedStyle(document.querySelector('.card-label')).letterSpacing);
ok('B5 卡片标签字距 1.4px', Math.abs(parseFloat(ls) - 1.4) < 0.05, { ls });

// ⑦ 动效 token + 淡入不位移
const anim = await page.evaluate(() => {
  const cs = getComputedStyle(document.querySelector('#view-data .panel'));
  const root = getComputedStyle(document.documentElement);
  return {
    name: cs.animationName,
    trans: cs.animationTimingFunction,
    t1: root.getPropertyValue('--t-1').trim(),
    ease: root.getPropertyValue('--ease').trim(),
  };
});
ok('B6 面板淡入动画用 view-fade + token 曲线，--t-1/--ease 已声明',
  anim.name === 'view-fade' && /cubic-bezier/.test(anim.trans) && anim.t1 === '.16s' && /cubic-bezier/.test(anim.ease), anim);

// 冻结值几何：panel padding-top 18、head margin-bottom 14（运行时实测）
const frozen = await page.evaluate(() => {
  const p = document.querySelector('#view-data .panel');
  const h = p.querySelector('.panel-head');
  return { padTop: getComputedStyle(p).paddingTop, headMb: getComputedStyle(h).marginBottom };
});
ok('B7 冻结值运行时仍是 padding-top18 / head margin14',
  parseFloat(frozen.padTop) === 18 && parseFloat(frozen.headMb) === 14, frozen);

// reduced-motion：淡入关闭
const rmCtx = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
const rm = await rmCtx.newPage();
await rm.goto(BASE + 'index.html?cb=' + Date.now(), { waitUntil: 'load' });
await rm.waitForFunction(() => document.querySelectorAll('.card-value').length >= 5, null, { timeout: 20000 });
const rmAnim = await rm.evaluate(() => getComputedStyle(document.querySelector('#view-lifetime .panel')).animationName);
ok('B8 reduced-motion 下视图淡入关闭', rmAnim === 'none', { rmAnim });
await rmCtx.close();

ok('C1 全程零 JS 异常', errs.length === 0, errs.slice(0, 4));
await browser.close();
console.log(`\n第 127 轮视觉精修：${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
