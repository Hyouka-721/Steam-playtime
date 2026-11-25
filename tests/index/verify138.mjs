/* verify138.mjs — 第 138 轮：门户主页视觉精修 + 雨天选句
 * v6：①诗句柔光衬底（.quote::before 径向薄雾）②窄屏 text-wrap:balance
 *     ③换句纯 opacity 淡入 ④作者署名提档 ⑤窄屏图标内收
 *     ⑥今日签角标（data-daily）⑦入口 hover 文字（data-label）
 *     ⑧雨天选句：雨意象句充足时约半数换句从雨句中抽（不写 poems.js 三元组）
 * 用法：node tests/index/verify138.mjs（需先起 8895 服务） */
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

const html = fs.readFileSync(ROOT + 'docs/home.html', 'utf8');
const css = fs.readFileSync(ROOT + 'docs/home.css', 'utf8');
const js = fs.readFileSync(ROOT + 'docs/home.js', 'utf8');
const cssPlain = css.replace(/\/\*[\s\S]*?\*\//g, '');

// ── A 静态契约 ──
ok('A1 版本 home.css v=6 / home.js v=7，poems 未 bump',
  /home\.css\?v=6/.test(html) && /home\.js\?v=7/.test(html) && /poems\.js\?v=5/.test(html),
  '理由：第138轮只改 css/js，poems 三元组不动，按红线2只 bump 真改的文件');

ok('A2 柔光衬底用 .quote::before 径向渐变，非实心背景框',
  /\.quote\s*\{[^}]*isolation:\s*isolate/.test(cssPlain) &&
  /\.quote::before\s*\{[^}]*radial-gradient/.test(cssPlain) &&
  /\.quote::before\s*\{[^}]*z-index:\s*-1/.test(cssPlain) &&
  !/\.card\s*\{[^}]*(background:|box-shadow:)/.test(cssPlain),
  '理由：字从插画浮出但不破坏 .card/.entry 无背景约束；z=-1 沉到文字下、不穿雨丝');

ok('A3 窄屏 text-wrap:balance + 淡入纯 opacity 无位移',
  /\.quote\s*\.verse\s*\{[^}]*text-wrap:\s*balance/.test(cssPlain) &&
  /@keyframes quote-fade\s*\{[^}]*opacity/.test(cssPlain) &&
  /\.quote\.is-fresh\s*\.verse\s*\{[^}]*animation:\s*quote-fade/.test(cssPlain) &&
  !/quote-fade[^}]*transform/.test(cssPlain),
  '理由：治孤字断行；动效一律 opacity，位移会踩几何断言红线');

ok('A4 署名提档（更深 + 字号上调）、不设粗体',
  /\.quote\s*\.by\s*\{[^}]*color:\s*#574636/.test(cssPlain) &&
  /\.quote\s*\.by\s*\{[^}]*font-size:\s*0\.92em/.test(cssPlain) &&
  !/\.quote\s*\.by\s*\{[^}]*font-weight/.test(cssPlain),
  '理由：行楷合成加粗会变脏，只靠颜色与字号提档');

ok('A5 今日签角标 + 入口 hover 文字用伪元素，不新增 DOM',
  /\.quote\[data-daily="1"\]::after\s*\{[^}]*content:\s*'今'/.test(cssPlain) &&
  /\.entry::after\s*\{[^}]*content:\s*attr\(data-label\)/.test(cssPlain) &&
  /data-label="游戏时长"/.test(html) && /data-label="观影记录"/.test(html) &&
  /quoteEl\.setAttribute\('data-daily'/.test(js),
  '理由：伪元素不新增图片/节点（B2 仍三张图），不动 .by 独占行');

ok('A6 雨天选句不写 poems 三元组，按雨意象识别且只在换句分支',
  /RAIN_RE\s*=\s*\/\[雨霖霪\]\//.test(js) && /function isRainy/.test(js) &&
  /function rainOn/.test(js) && /rainPool\.length\s*>=\s*3/.test(js) &&
  /Math\.random\(\)\s*<\s*0\.5/.test(js) && !/POEMS\.push/.test(js),
  '理由：A6(v137) 锁死三元组；雨句池不足 3 不启用，约半数换句走雨句，避免单调/耗尽');

ok('A7 圆角白名单 + 单 @media 结构未破',
  !/border-radius:\s*\d+px/.test(cssPlain) &&
  (css.match(/@media \(max-width: 680px\)/g) || []).length === 1,
  '理由：圆角只用 var/50%/2px；home.css 窄屏断点恰好 1 个');

// ── B 运行时 ──
const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto(BASE + 'home.html?cb=' + Date.now(), { waitUntil: 'load' });
await p.waitForFunction(() => window.__home && document.querySelector('#home-quote')?.getAttribute('data-hash'));
await p.waitForTimeout(400);

const desk = await p.evaluate(() => {
  const q = document.querySelector('#home-quote');
  const cs = getComputedStyle(q, '::before');
  const byCs = getComputedStyle(document.querySelector('.by'));
  const verseCs = getComputedStyle(document.querySelector('.verse'));
  const box = s => document.querySelector(s).getBoundingClientRect();
  const av = box('.avatar'), e0 = box('.entry:first-child');
  return {
    daily: q.getAttribute('data-daily'),
    fresh: q.classList.contains('is-fresh'),
    glowBg: cs.backgroundImage,
    glowZ: cs.zIndex,
    byColor: byCs.color, bySize: byCs.fontSize, byWeight: byCs.fontWeight,
    verseWrap: verseCs.textWrap || verseCs.getPropertyValue('text-wrap'),
    imgs: document.images.length,
    iconOffset: Math.round(e0.left - av.right),
    iconW: Math.round(e0.width)
  };
});
ok('B1 今日签角标：进站首句 data-daily=1 且淡入 class 已挂',
  desk.daily === '1' && desk.fresh,
  { daily: desk.daily, fresh: desk.fresh, reason: '今日签进站应打标；render 每次重挂 is-fresh 重播淡入' });

ok('B2 柔光生效：径向渐变 + z=-1，仍是三张图',
  /radial-gradient/.test(desk.glowBg) && desk.glowZ === '-1' && desk.imgs === 3,
  { glowZ: desk.glowZ, imgs: desk.imgs, bg: desk.glowBg.slice(0, 60) });

ok('B3 桌面几何未动：图标 222 宽、offset 200',
  desk.iconW === 222 && desk.iconOffset >= 195,
  { iconW: desk.iconW, iconOffset: desk.iconOffset, reason: '窄屏内收不得影响桌面冻结值' });

ok('B4 署名提档落地：颜色 #574636、字号 > 诗句 0.85em 基线',
  desk.byColor === 'rgb(87, 70, 54)' && parseFloat(desk.bySize) > 19,
  { byColor: desk.byColor, bySize: desk.bySize, byWeight: desk.byWeight,
    reason: '行楷不加粗（weight 400），颜色与字号提一档' });

// 换句：淡入重播 + 角标清除（雨天随机不影响"一定会换句"）
const switchInfo = await p.evaluate(async () => {
  window.__home.reset();
  const q = document.querySelector('#home-quote');
  window.__home.setChoice(0);
  const before = { hash: q.getAttribute('data-hash'), daily: q.getAttribute('data-daily') };
  const freshBefore = q.classList.contains('is-fresh');
  document.querySelector('.verse').click();
  const after = { hash: q.getAttribute('data-hash'), daily: q.getAttribute('data-daily') };
  return { before, after, freshBefore, switched: before.hash !== after.hash };
});
ok('B5 换句淡入每次重挂（is-fresh 复位后重加），角标随句更新',
  switchInfo.switched && switchInfo.freshBefore && !!switchInfo.after.daily,
  { ...switchInfo, reason: 'render 先 remove 再 add class，动画每次重播；data-daily 随 hash 重算' });

// 雨天选句接口 + 池规模 + 配额/去重不回退
const rain = await p.evaluate(() => {
  window.__home.reset();
  const rainy = window.__home.rainyCount();
  const total = window.__home.count;
  const rainOn = window.__home.rainOn();
  const seq = [];
  for (let i = 0; i < 60; i++) { window.__home.next(); seq.push(window.__home.currentHash()); }
  const K = window.__home.keep;
  let worst = 0;
  for (let i = K; i < seq.length; i++) if (seq.slice(i - K, i).includes(seq[i])) worst++;
  const monthly = JSON.parse(localStorage.getItem('poem.monthly') || '{}');
  const bucket = Object.values(monthly).reduce((a, b) => ({ ...a, ...b }), {});
  return { rainy, total, rainOn, worst, uniq: new Set(seq).size,
    maxMonthly: Math.max(...Object.values(bucket).filter(Number), 0) };
});
ok('B6 雨意象句池充足（≥60），占比合理',
  rain.rainy >= 60 && rain.rainy <= rain.total,
  { rainy: rain.rainy, total: rain.total, reason: '雨句够撑偏好但不至于每次同句' });

ok('B7 雨天换句不破坏去重窗口（最近20无重复）',
  rain.worst === 0 && rain.uniq > 20,
  { worst: rain.worst, uniq: rain.uniq, reason: '雨句子集从已排除 recent 的池里筛，不回退去重' });

ok('B8 雨句子集仍守月度配额（≤2 次/句）',
  rain.maxMonthly <= 2,
  { maxMonthly: rain.maxMonthly, reason: '雨天偏好只影响抽取，不改配额计数逻辑' });

// hover 文字：静态存在但默认透明，hover 后不透明
const hover = await p.evaluate(() => {
  const e = document.querySelector('.entry');
  return { label: e.getAttribute('data-label'), text: getComputedStyle(e, '::after').content,
    opacity: getComputedStyle(e, '::after').opacity };
});
ok('B9 入口标签默认隐藏（opacity=0），文本来自 data-label',
  hover.label === '游戏时长' && /游戏时长/.test(hover.text) && parseFloat(hover.opacity) === 0,
  { ...hover, reason: '默认无字，悬停才浮现，守住极简' });
await p.hover('.entry');
await p.waitForTimeout(250);
const hoverOn = await p.evaluate(() => getComputedStyle(document.querySelector('.entry'), '::after').opacity);
ok('B10 悬停后标签浮现（opacity=1）', parseFloat(hoverOn) > 0.9, { opacity: hoverOn });

ok('B11 零控制台 / 页面错误', errs.length === 0, errs);
await ctx.close();

// 窄屏：图标内收 + 柔光收窄 + 无溢出
const c2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
const p2 = await c2.newPage();
await p2.goto(BASE + 'home.html?cb=' + Date.now(), { waitUntil: 'load' });
await p2.waitForTimeout(400);
const mob = await p2.evaluate(() => {
  const box = s => document.querySelector(s).getBoundingClientRect();
  const av = box('.avatar'), e0 = box('.entry:first-child');
  const q = document.querySelector('#home-quote');
  return {
    fits: document.documentElement.scrollWidth <= innerWidth,
    docW: document.documentElement.scrollWidth,
    iconW: Math.round(e0.width), iconOffset: Math.round(e0.left - av.right),
    verseWrap: getComputedStyle(document.querySelector('.verse')).textWrap,
    rightEdge: Math.round(box('.entries').right)
  };
});
ok('B12 窄屏无横向溢出 + 图标内收（92 宽 / offset 8）',
  mob.fits && mob.iconW === 92 && mob.iconOffset <= 12 && mob.rightEdge <= 390,
  { ...mob, reason: '100→92、12→8，离右缘留白更稳' });
await c2.close();
await browser.close();
console.log(`\n第 138 轮门户主页精修：${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
