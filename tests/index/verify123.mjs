/* verify123.mjs — 第 123 轮：雨滴 → 雨丝（回归守卫）
   背景：用户实测 DOM 水珠即使 contain:none、blur(8px) brightness(1.35)
   仍是灰片 —— 均匀深色背景下 backdrop-filter 没有可折射纹理。
   本轮换成雨丝，本套件专门守「不许退回灰片」：
   ① 全仓 rain.css/js 不得再出现 backdrop-filter / .rain-drop；
   ② 雨丝不得是实心圆（无 radial-gradient 填充、无 box-shadow 灰边）；
   ③ 必须是细长渐隐线（宽度 ≤2px、linear-gradient 两端透明、有 blur）；
   ④ 运行时不存在任何 .rain-drop / 旧 canvas。
   用法：node tests/index/verify123.mjs（需先起 8895 静态服务） */
import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const ROOT = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const LOCAL = 'http://127.0.0.1:8895/index.html';
let pass = 0, fail = 0;
const ok = (n, c, x) => {
  c ? (pass++, console.log('PASS ', n, x === undefined ? '' : '— ' + JSON.stringify(x)))
    : (fail++, console.log('FAIL ', n, '— ' + JSON.stringify(x)));
};

const rainJs = fs.readFileSync(ROOT + 'docs/rain.js', 'utf8');
const rainCss = fs.readFileSync(ROOT + 'docs/rain.css', 'utf8');
const idx = fs.readFileSync(ROOT + 'docs/index.html', 'utf8');
const wat = fs.readFileSync(ROOT + 'docs/watch.html', 'utf8');
const rainCssCode = rainCss.replace(/\/\*[\s\S]*?\*\//g, '');
const rainJsCode = rainJs.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/* 第 137 轮：雨丝提亮只改 rain.css（v=7→8），rain.js 仍是 v=7，判据随版本同步 */
ok('A1 两页都引用 v=8 的 rain.css / v=7 的 rain.js，且没有旧 canvas / rain-drop',
  /rain\.css\?v=8/.test(idx) && /rain\.js\?v=7/.test(idx) &&
  /rain\.css\?v=8/.test(wat) && /rain\.js\?v=7/.test(wat) &&
  !/rain-canvas/.test(idx + wat));
ok('A2 rain.css / rain.js 已无 backdrop-filter 与 .rain-drop',
  !/backdrop-filter/.test(rainCssCode) && !/backdrop-filter/.test(rainJsCode) &&
  !/\.rain-drop/.test(rainCssCode) && !/rain-drop'/.test(rainJsCode));
ok('A3 雨丝不是实心圆片：无 radial-gradient 圆底、无 box-shadow 灰边',
  !/\.rain-streak \{[\s\S]*?radial-gradient/.test(rainCss) &&
  !/\.rain-streak \{[\s\S]*?box-shadow/.test(rainCss));
ok('A4 雨丝是细长渐隐线：linear-gradient + 两端透明 + 宽度由 JS 控制',
  /linear-gradient\(/.test(rainCss) &&
  /rgba\(255, 255, 255, 0\) 0%/.test(rainCss) && /rgba\(255, 255, 255, 0\) 100%/.test(rainCss) &&
  /el\.style\.width = pick\(d\.w\)/.test(rainJs));

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto(LOCAL + '?cb=' + Date.now(), { waitUntil: 'load' });
await page.evaluate(() => { localStorage.setItem('theme', 'cinema'); localStorage.removeItem('rain.enabled'); });
await page.reload({ waitUntil: 'load' });
await page.waitForFunction(() => window.__rain && window.__rain.ready(), null, { timeout: 20000 });
await page.waitForTimeout(250);

const live = await page.evaluate(() => ({
  oldDrops: document.querySelectorAll('.rain-drop').length,
  oldCanvas: document.querySelectorAll('#rain-canvas').length,
  streaks: document.querySelectorAll('.rain-streak').length,
  bg: getComputedStyle(document.querySelector('.rain-streak')).backgroundImage,
}));
ok('B1 运行时只有 .rain-streak，旧水珠/旧 canvas 数量为 0',
  live.streaks > 0 && live.oldDrops === 0 && live.oldCanvas === 0, live);
ok('B2 实际渲染的是 linear-gradient（不是纯色/径向圆）',
  /linear-gradient/.test(live.bg), { bg: live.bg.slice(0, 60) });
ok('B3 全程零 JS 异常', errs.length === 0, errs.slice(0, 3));

await browser.close();
console.log(`\n第 123 轮雨丝回归守卫：${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
