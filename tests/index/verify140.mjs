/* verify140.mjs — 第 140 轮契约：Game Time 液体主题切换（1.2× / 2040ms）
 * 新主题从史蒂夫按钮下方以液柱→飞溅→波浪液面覆盖全屏，用 SVG clipPath 裁剪揭示。
 * ⚠️ 第 141 轮架构变更为「双层真实 DOM」（揭示层 #liquid-reveal 取代 VT 快照），
 *    A3/B2/B4 判据随架构更新，理由已写进各 ok 文案 + tests/README.md；阈值未放宽。
 * 用法：node tests/index/verify140.mjs（需先起 8895 服务） */
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

const html = fs.readFileSync(ROOT + 'docs/index.html', 'utf8');
const css = fs.readFileSync(ROOT + 'docs/style.css', 'utf8');
const js = fs.readFileSync(ROOT + 'docs/app.js', 'utf8');
const cssPlain = css.replace(/\/\*[\s\S]*?\*\//g, '');

// ── A 静态契约 ──
ok('A1 版本 style.css v=155 / app.js v=133',
  /style\.css\?v=155/.test(html) && /app\.js\?v=133/.test(html),
  '理由：第140轮改了 css/js 两文件，按红线2各 bump 一次');

ok('A2 SVG clipPath 定义就位（userSpaceOnUse + path id）',
  /<clipPath id="liquidClip" clipPathUnits="userSpaceOnUse"/.test(html) &&
  /<path id="liquidPath"/.test(html),
  '理由：液体裁剪的地基，0 尺寸 SVG 不占布局、aria-hidden');

ok('A3 液体裁剪规则用 #liquid-reveal 严格 scope，不污染视图切换（第141轮改双层DOM）',
  /#liquid-reveal\s*\{[^}]*clip-path:\s*url\(#liquidClip\)/.test(cssPlain) &&
  /#liquid-reveal\s*\{[^}]*z-index:\s*11/.test(cssPlain) &&
  /::view-transition-old\(root\)\s*\{\s*animation-duration:\s*\.18s/.test(cssPlain),
  '理由：第141轮把 VT 静态快照换成双层真实 DOM（揭示层 #liquid-reveal），clip-path 与 z=11 分层移到该容器；#11 视图切换的 .18s/.24s 规则仍须原样保留');

ok('A4 时长 2040ms = 1700 × 1.2，共用 state.vt 锁',
  /LIQUID_DUR\s*=\s*2040/.test(js) &&
  /applyThemeLiquid/.test(js) && /state\.vt\s*=\s*true/.test(js) &&
  /if \(announce\) toast/.test(js),
  '理由：用户指定 1.2×；锁与视图切换共用避免叠加 VT；toast 延后避免快照冻结');

ok('A5 三函数结构：液柱/飞溅/液面 + rAF 只改 path 的 d',
  /function liquidPath/.test(js) && /p < 0\.32/.test(js) && /p < 0\.52/.test(js) &&
  /pathEl\.setAttribute\('d'/.test(js) && /requestAnimationFrame\(frame\)/.test(js),
  '理由：单一 rAF 逐帧只更新 SVG 属性，不重建 DOM、不重渲染');

ok('A6 回退分支：不支持/减少动效/有锁时直接切',
  /prefers-reduced-motion: reduce/.test(js) && /!document\.startViewTransition/.test(js) &&
  /\|\| state\.vt\)/.test(js) && /applyTheme\(id,\s*\{\s*announce\s*\}\)/.test(js),
  '理由：API 不可用/减少动效/其它 VT 在跑时必须无动画直接切，行为等同原版');

// ── B 运行时 ──
const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto(BASE + 'index.html?cb=' + Date.now(), { waitUntil: 'load' });
await p.waitForSelector('#theme-light', { timeout: 10000 });
await p.waitForTimeout(500);

const before = await p.evaluate(() => ({
  theme: document.documentElement.dataset.theme,
  hasPath: !!document.getElementById('liquidPath'),
  clip: getComputedStyle(document.documentElement, '::view-transition-new(root)').clipPath
}));
ok('B1 首屏主题与 SVG 就位', ['cream', 'cinema'].includes(before.theme) && before.hasPath, before);

// 强制回到 cream 以便测浅→深
await p.evaluate(() => {
  if (document.documentElement.dataset.theme !== 'cream') document.getElementById('theme-light').click();
});
await p.waitForTimeout(2400);

let d0 = '', dMid = '';
await p.click('#theme-light');
await p.waitForTimeout(300);
d0 = await p.evaluate(() => document.getElementById('liquidPath').getAttribute('d'));
await p.waitForTimeout(1000);
const mid = await p.evaluate(() => {
  const rev = document.getElementById('liquid-reveal');
  return {
    liquid: document.documentElement.classList.contains('liquid-vt'),
    d: document.getElementById('liquidPath').getAttribute('d'),
    reveal: !!rev,
    ariaHidden: rev ? rev.getAttribute('aria-hidden') : null,
    inert: rev ? rev.hasAttribute('inert') : null,
    clip: rev ? getComputedStyle(rev).clipPath : 'none'
  };
});
dMid = mid.d;
ok('B2 动画中 class 挂载 + 揭示层 clip-path 指向 SVG（第141轮改双层DOM）',
  mid.liquid === true && mid.reveal === true && mid.ariaHidden === 'true' &&
  mid.inert === true && /url\(.*liquidClip/.test(mid.clip),
  { liquid: mid.liquid, reveal: mid.reveal, ariaHidden: mid.ariaHidden, inert: mid.inert, clip: mid.clip });
ok('B3 path 逐帧变化（液柱→液面）',
  d0 !== dMid && dMid.length > 50 && /L /.test(dMid),
  { d0len: d0.length, dMidlen: dMid.length });

await p.waitForTimeout(1400); // 合计 2700ms > 2040ms
const after = await p.evaluate(() => ({
  theme: document.documentElement.dataset.theme,
  liquid: document.documentElement.classList.contains('liquid-vt'),
  d: document.getElementById('liquidPath').getAttribute('d'),
  revealGone: !document.getElementById('liquid-reveal')
}));
ok('B4 动画结束：主题切换完成、class 清除、path 复位、揭示层移除（第141轮）',
  after.theme === 'cinema' && after.liquid === false && after.d === 'M0 0 Z' &&
  after.revealGone === true, after);

// 键盘 Enter 深→浅
await p.focus('#theme-light');
await p.keyboard.press('Enter');
await p.waitForTimeout(2400);
const kb = await p.evaluate(() => ({
  theme: document.documentElement.dataset.theme,
  liquid: document.documentElement.classList.contains('liquid-vt')
}));
ok('B5 键盘 Enter 同样触发液体切换（深→浅）',
  kb.theme === 'cream' && kb.liquid === false, kb);

// 视图切换不受污染：点卡片切视图，仍正常
await p.click('#card-recent');
await p.waitForTimeout(600);
const view = await p.evaluate(() => ({
  active: document.querySelector('.view.active')?.id,
  liquid: document.documentElement.classList.contains('liquid-vt')
}));
ok('B6 视图切换未被液体规则污染', view.active === 'view-recent' && view.liquid === false, view);

ok('B7 零控制台 / 页面错误', errs.length === 0, errs);
await ctx.close();

// 窄屏 + reduced-motion 回退验证
const c2 = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
const p2 = await c2.newPage();
await p2.goto(BASE + 'index.html?cb=' + Date.now(), { waitUntil: 'load' });
await p2.waitForSelector('#theme-light', { timeout: 10000 });
await p2.click('#theme-light');
await p2.waitForTimeout(400);
const mob = await p2.evaluate(() => ({
  theme: document.documentElement.dataset.theme,
  liquid: document.documentElement.classList.contains('liquid-vt'),
  docW: document.documentElement.scrollWidth, inner: innerWidth
}));
ok('B8 减少动效：直接切换（无液体）+ 窄屏无溢出',
  mob.liquid === false && mob.docW <= mob.inner && ['cream', 'cinema'].includes(mob.theme), mob);
await c2.close();
await browser.close();
console.log(`\n第 140 轮 Game Time 液体主题切换：${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
