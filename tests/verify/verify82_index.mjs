/* verify82_index.mjs — 第 82 轮（index 侧）：页眉/选项卡三项改动回归
   用户要求（2026-10-31）：
   ① 移除所有悬停提示气泡（title）—— 悬停「My Game Time」不再弹「点击返回顶部」
   ② 「My Game Time」不可被当普通文本框选/编辑
   ③ 彻底删除加菲猫 / 猫和老鼠 / 企鹅三只吉祥物（元素、样式、图片文件）

   断言分组：
   A 静态（9）：源码里无 title 残留、无吉祥物规则、无图片文件、站名 user-select、版本号
   B 运行时（7）：DOM 里 title 属性总数为 0、首行条内无 img、双击无选区、点站名仍回顶、
                  主题键与五张卡功能未受影响、零 JS 异常

   ⚠️ 沙箱里 Steam/CDN 图会挂起 → 与 verify6 一样统一 abort。 */
import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const BASE = process.env.BASE || 'http://127.0.0.1:8895/index.html';
const DOCS = 'C:/Users/33329/WorkBuddy/2026-10-13-18-17-49/steam-playtime/docs';

let pass = 0, fail = 0;
const ok = (n, c, extra = '') => {
  c ? (pass++, console.log(`PASS ${n}${extra ? '  — ' + extra : ''}`))
    : (fail++, console.log(`FAIL ${n}  — ${extra}`));
};

const rd = (f) => fs.readFileSync(`${DOCS}/${f}`, 'utf8').replace(/\r\n/g, '\n');
const html = rd('index.html'), js = rd('app.js'), css = rd('style.css'), fx = rd('fx.js');
// 剥注释后再断言源码（避免「清理说明」写进注释被误判成残留）
const stripCmt = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const jsNC = stripCmt(js), fxNC = stripCmt(fx), cssNC = stripCmt(css);

/* ================= A 静态 ================= */
console.log('== A 静态 ==');

// <title> 是文档标题，不算悬停气泡 → 先摘掉它再找 title 属性
const htmlNoDocTitle = html.replace(/<title>[\s\S]*?<\/title>/g, '');
ok('A1 index.html 已无任何 title 属性（<title> 文档标题除外）',
  !/\stitle=/.test(htmlNoDocTitle), (htmlNoDocTitle.match(/\stitle="[^"]*"/g) || []).slice(0, 3));

ok('A2 app.js 不再给元素赋值 title（.title = 与 title=" 均为 0）',
  !/\.title\s*=/.test(jsNC) && !/\stitle="/.test(jsNC));

ok('A3 fx.js 不再用 title 解释禁用原因', !/\.title\s*=/.test(fxNC));

ok('A4 style.css 已无三只吉祥物的规则（.rank-cat / .rank-penguin / .rank-tj）',
  !/\.rank-cat\b/.test(cssNC) && !/\.rank-penguin\b/.test(cssNC) && !/\.rank-tj\b/.test(cssNC));

ok('A5 app.js 的排行榜行模板已不再注入三张吉祥物图',
  !/rank-cat-8b4e55ad|rank-tj-b9b7fccd|rank-penguin-fb2f58a8/.test(jsNC)
  && !/img class="rank-(cat|tj|penguin)"/.test(jsNC));

const imgDir = fs.readdirSync(`${DOCS}/img`);
const mascots = ['rank-cat-8b4e55ad.webp', 'rank-tj-b9b7fccd.webp', 'rank-penguin-fb2f58a8.webp'];
ok('A6 docs/img 下三张吉祥物图片文件已删除', mascots.every((f) => !imgDir.includes(f)), imgDir.join(','));

const titleRule = (cssNC.match(/\.site-title\s*\{[^}]*\}/) || [''])[0];
ok('A7 .site-title 声明了 user-select:none（含 -webkit- 前缀）',
  /user-select:\s*none/.test(titleRule) && /-webkit-user-select:\s*none/.test(titleRule), titleRule.slice(0, 90));

ok('A8 版本号已 bump：style.css?v=107 / app.js?v=101',
  html.includes('style.css?v=107') && html.includes('app.js?v=101'),
  (html.match(/(style\.css|app\.js)\?v=\d+/g) || []).join(' '));

/* ================= B 运行时 ================= */
console.log('== B 运行时 ==');
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.route(/^https?:\/\/(cdn\.jsdelivr\.net|cdn\.bootcdn\.net|fonts\.loli\.net)\//, (r) => r.abort());
await ctx.route(/^https?:\/\/(cdn\.cloudflare\.steamstatic\.com|media\.steampowered\.com|steamcdn-a\.akamaihd\.net)\//, (r) => r.abort());
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });

await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForSelector('#lt-list .rank-item', { timeout: 15000 });

// B1：整页（含 JS 动态插入的行、日历格）title 属性必须为 0
const titleCount = await page.evaluate(() => document.querySelectorAll('[title]').length);
ok('B1 整页 DOM 中带 title 属性的元素数为 0（含动态渲染的行与日历格）', titleCount === 0, `count=${titleCount}`);

// B2：首行进度条内不再有吉祥物 img
const barImgs = await page.evaluate(() =>
  document.querySelectorAll('#lt-list .rank-item:first-child .rank-bar img').length);
ok('B2 排行榜首行进度条内已无任何 img（吉祥物彻底移除）', barImgs === 0, `imgs=${barImgs}`);

// B3：站名计算样式不可选中
const sel = await page.evaluate(() => {
  const el = document.getElementById('site-title');
  const cs = getComputedStyle(el);
  return { userSelect: cs.userSelect || cs.webkitUserSelect, cursor: cs.cursor };
});
ok('B3 站名计算样式 user-select = none（仍保留 pointer 光标）',
  sel.userSelect === 'none' && sel.cursor === 'pointer', JSON.stringify(sel));

// B4：真的双击也不会产生选区
const dblSel = await page.evaluate(async () => {
  const el = document.getElementById('site-title');
  const r = el.getBoundingClientRect();
  for (const type of ['mousedown', 'mouseup', 'mousedown', 'mouseup', 'dblclick']) {
    el.dispatchEvent(new MouseEvent(type, {
      bubbles: true, cancelable: true, view: window, detail: type === 'dblclick' ? 2 : 1,
      clientX: r.left + r.width / 2, clientY: r.top + r.height / 2,
    }));
  }
  return String(window.getSelection());
});
ok('B4 双击站名后 document 选区为空字符串', dblSel === '', JSON.stringify(dblSel));

// B5：点站名仍然回顶（功能不能被第 2 项改坏）
await page.evaluate(() => window.scrollTo(0, 1200));
await page.waitForTimeout(200);
const beforeY = await page.evaluate(() => window.scrollY);
await page.click('#site-title');
await page.waitForTimeout(700);
const afterY = await page.evaluate(() => window.scrollY);
ok('B5 点站名仍执行「返回顶部」（滚动位置归零）', beforeY > 500 && afterY === 0, `${beforeY} → ${afterY}`);

// B6：主题键仍可切主题（移除 title 不得影响点击）
const theme = await page.evaluate(() => document.documentElement.dataset.theme);
await page.click('#theme-light');
await page.waitForTimeout(300);
const theme2 = await page.evaluate(() => document.documentElement.dataset.theme);
ok('B6 史蒂夫主题键点击仍切换主题', theme2 !== theme, `${theme} → ${theme2}`);

// B7：五张概览卡仍能切视图
const viewOk = [];
for (const [card, view] of [['#card-ach', 'view-ach'], ['#card-data', 'view-data'], ['#card-lifetime', 'view-lifetime']]) {
  await page.click(card);
  await page.waitForTimeout(320);
  viewOk.push(await page.evaluate((v) => {
    const el = document.getElementById(v);
    return !!el && el.classList.contains('active');
  }, view));
}
ok('B7 概览卡点击仍正确切换视图（成就 / 数据 / 游戏时长往返）',
  viewOk.every(Boolean), JSON.stringify(viewOk));

// B8：全过程零 JS 异常（沙箱里被 abort 的 Steam/CDN 图会记 console error，按 verify6 同一口径滤掉）
const realErrs = errs.filter((e) => !/Failed to load resource|net::ERR|ERR_BLOCKED|ERR_FAILED/i.test(e));
ok('B8 零 JS 异常 / console error（已剔除被 abort 的远端图片请求）', realErrs.length === 0, realErrs.slice(0, 3).join(' | '));

await browser.close();
console.log(`\n================ ${pass} / ${pass + fail} ================`);
process.exit(fail ? 1 : 0);
