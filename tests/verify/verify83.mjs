/* 第 83 轮回归：watch 列表页移除全部 title 悬停气泡
   用户要求（2026-10-31）：「删除本界面包括小黄人和史蒂夫在内的所有悬停提示气泡」。

   处理原则（与首页第 82 轮 index 线的做法一致）：**删 title，语义全部由 aria-label 承载**，
   不牺牲可访问性 —— 三个图形控件（小黄人返回、史蒂夫切视图、右下角加号）本来就没有可见
   文字，删掉 title 后 aria-label 是它们唯一的无障碍名称，必须还在。

   本轮删掉的 6 处：
   1. `watch.html`  `.w-home`（小黄人）      title="退出观影记录（回到游戏时长）"
   2. `watch.html`  `#w-avatar`（史蒂夫）    title="切换到时间轴视图"
   3. `watch.html`  `#w-fab`（加号）        title="添加观影记录"
   4. `watch.js`    `syncAvatar()` 里动态写 `avatarEl.title = label`
   5. `watch.js`    `.poster-note`（网格短评）`title="<整段评语>"`
   6. `watch.js`    `.tl-note`（时间轴评语）`title="<整段评语>"`

   ⚠️ 副作用（已知并接受）：`.poster-note` 是 2 行 clamp、`.tl-note` 是单行 ellipsis，
      原来靠 title 悬停看全文，现在要读全文得点开该条目的编辑弹窗。

   断言分组：
   A 静态（4）：html 里 0 个 title、三处 aria-label 都在、js 里 0 处写 DOM title、版本号
   B 运行时（5）：全页 [title] 计数 0、三控件逐个无 title、悬停后仍无、短评无 title、零异常
   C 可访问性（2）：图形控件仍有 aria-label、键盘仍可聚焦
   ⚠️ mock 必须 serviceWorkers:'block'（第 80 轮起 SW 也拦 watch.json）。 */
import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const BASE = 'http://127.0.0.1:8895/';
const D = 'C:/Users/33329/WorkBuddy/2026-10-13-18-17-49/steam-playtime/docs/';
const rd = (f) => fs.readFileSync(D + f, 'utf8').replace(/\r\n/g, '\n');
const stripCmt = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '');

let pass = 0, fail = 0;
const ok = (n, c, extra = '') => {
  c ? (pass++, console.log(`PASS ${n}${extra ? '  ' + extra : ''}`))
    : (fail++, console.log(`FAIL ${n}  ${extra}`));
};

const html = rd('watch.html'), js = rd('watch.js');
const htmlNC = stripCmt(html), jsNC = stripCmt(js);
const P = 'img/minion-0ef9a202.webp';

/* ================= A 静态 ================= */
console.log('== A 静态 ==');
{
  const n = (htmlNC.match(/\btitle\s*=/g) || []).length;
  ok('A1 watch.html 里 title 属性共 0 处（小黄人 / 史蒂夫 / 加号的气泡都已删）', n === 0, `实有 ${n} 处`);
}
ok('A2 三个图形控件的 aria-label 都还在（删气泡不等于删语义）',
  /class="w-home"[^>]*aria-label="退出观影记录，回到游戏时长"/.test(htmlNC) &&
  /id="w-avatar"[^>]*aria-label="切换到时间轴视图"/.test(htmlNC) &&
  /id="w-fab"[^>]*aria-label="添加观影记录"/.test(htmlNC));

/* ⚠️ 判据要用 `=(?!=)`：数据里本来就有 `clash.title === title` 这种比较，
   单纯写 `\.title\s*=` 会把 `===` 的第一位 `=` 算成赋值。 */
ok('A3 watch.js 里没有任何「写 DOM title」的代码（.title= / setAttribute(\'title\' / title=" ）',
  !/\.title\s*=(?!=)/.test(jsNC) && !/setAttribute\(\s*['"]title['"]/.test(jsNC) && !/\btitle="/.test(jsNC),
  (jsNC.match(/\.title\s*=(?!=)/g) || []).join(' '));

ok('A4 syncAvatar() 仍同步 aria-label（只是不再写 title）',
  /avatarEl\.setAttribute\('aria-label', timeline \? '切换到网格视图' : '切换到时间轴视图'\)/.test(jsNC));

ok('A5 版本号：watch.css?v=21 / watch.js?v=16', /watch\.css\?v=21"/.test(html) && /watch\.js\?v=16"/.test(html));

/* ================= mock ================= */
const MOCK = {
  updated_at: '2026-10-31T10:00:00+08:00',
  items: [
    { id: '2026-10-10-a', title: '甲', kind: 'movie', watched_at: '2026-10-10', rating: 9.9, order: 1, poster: P, note: '这是一条很长的评语，用来验证短评不再靠 title 气泡显示全文，而网格里只截两行。' },
    { id: '2026-10-09-b', title: '乙', kind: 'movie', watched_at: '2026-10-09', rating: 8.5, order: 2, poster: P, note: '第二条评语同样很长，时间轴里会被省略号截断。' },
    { id: '2026-10-08-c', title: '丙', kind: 'anime', watched_at: '2026-10-08', rating: 7.5, order: 3, poster: P },
  ],
};

const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
await page.route('**/data/watch.json*', (r) => r.fulfill({
  status: 200, contentType: 'application/json', body: JSON.stringify(MOCK),
}));
await page.goto(BASE + 'watch.html', { waitUntil: 'load' });
await page.waitForSelector('#w-grid .poster', { timeout: 15000 });
await page.waitForTimeout(400);

/* ================= B 运行时 ================= */
console.log('\n== B 运行时 ==');
const all = await page.evaluate(() => ({
  n: document.querySelectorAll('[title]').length,
  list: [...document.querySelectorAll('[title]')].slice(0, 5).map((e) => e.tagName + '.' + e.className),
}));
ok('B1 首屏 DOM 里带 title 的元素共 0 个', all.n === 0, `实有 ${all.n} 个 ${all.list.join(',')}`);

const three = await page.evaluate(() => {
  const g = (s) => document.querySelector(s);
  return {
    home: g('.w-home').getAttribute('title') || g('.w-home').hasAttribute('title'),
    av: g('#w-avatar').getAttribute('title') || g('#w-avatar').hasAttribute('title'),
    fab: g('#w-fab').getAttribute('title') || g('#w-fab').hasAttribute('title'),
    homeLabel: g('.w-home').getAttribute('aria-label'),
    avLabel: g('#w-avatar').getAttribute('aria-label'),
    fabLabel: g('#w-fab').getAttribute('aria-label'),
  };
});
ok('B2 小黄人 / 史蒂夫 / 加号三处都没有 title 属性',
  three.home === false && three.av === false && three.fab === false,
  `home=${three.home} av=${three.av} fab=${three.fab}`);

/* 真悬停：悬停不应该让浏览器/脚本再补一个 title 出来 */
for (const sel of ['.w-home', '#w-avatar', '#w-fab']) await page.hover(sel);
await page.waitForTimeout(300);
ok('B3 依次悬停三个控件后，DOM 里仍无任何 title 元素',
  (await page.evaluate(() => document.querySelectorAll('[title]').length)) === 0);

const notes = await page.evaluate(() => ({
  grid: document.querySelectorAll('#w-grid .poster-note[title]').length,
  gridTotal: document.querySelectorAll('#w-grid .poster-note').length,
}));
ok('B4 网格短评不再带 title（截断时不再有原文气泡）', notes.grid === 0 && notes.gridTotal > 0,
  `${notes.grid}/${notes.gridTotal} 条带 title`);

await page.click('#w-avatar');
await page.waitForFunction(() => document.querySelectorAll('#w-tl .tl-item').length > 0, null, { timeout: 15000 });
await page.waitForTimeout(400);
const tl = await page.evaluate(() => ({
  noteTitle: document.querySelectorAll('#w-tl .tl-note[title]').length,
  noteTotal: document.querySelectorAll('#w-tl .tl-note').length,
  avTitle: document.getElementById('w-avatar').hasAttribute('title'),
  avLabel: document.getElementById('w-avatar').getAttribute('aria-label'),
  anyTitle: document.querySelectorAll('[title]').length,
}));
ok('B5 切到时间轴后：评语无 title、史蒂夫无 title 且 aria-label 已翻转、全页仍 0 个 title',
  tl.noteTitle === 0 && tl.noteTotal > 0 && tl.avTitle === false &&
  tl.avLabel === '切换到网格视图' && tl.anyTitle === 0,
  `评语 ${tl.noteTitle}/${tl.noteTotal}｜标签「${tl.avLabel}」｜全页 ${tl.anyTitle}`);

ok('B6 全程零 JS 异常', errs.length === 0, errs.slice(0, 2).join(' | '));

/* ================= C 可访问性 ================= */
console.log('\n== C 可访问性（删气泡不能把语义一起删）==');
ok('C1 三个图形控件都有非空 aria-label',
  !!three.homeLabel && !!three.avLabel && !!three.fabLabel,
  `${three.homeLabel} / ${three.avLabel} / ${three.fabLabel}`);
ok('C2 史蒂夫仍是 role=button + tabindex=0（键盘可达）',
  await page.evaluate(() => {
    const a = document.getElementById('w-avatar');
    return a.getAttribute('role') === 'button' && a.getAttribute('tabindex') === '0';
  }));

await ctx.close();
await browser.close();
console.log(`\n第 83 轮：PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
