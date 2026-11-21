/* online131.mjs — 第 131 轮上线复验：修数据视图越界（CSS 特异性）
 * ① 指纹：线上 index 引用 style.css?v=147 / app129 / fx19；index/style.css/app.js md5 与本地全等。
 * ② 静态：线上 CSS 用 .view.active#view-data 限定 grid，且无裸 `#view-data{display:grid}` 规则。
 * ③ 运行时：逐卡切换，每次只有对应视图可见；view-data 仅在数据卡下显示（其他卡 display:none）。
 * 用法：node tests/online/online131.mjs */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import crypto from 'node:crypto';

const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');
const SITE = process.env.ONLINE_SITE || 'https://hyouka-721.github.io/Steam-playtime/';
const ROOT = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
let pass = 0, fail = 0;
const ok = (n, c, x) => {
  c ? (pass++, console.log('PASS ', n, x === undefined ? '' : '— ' + JSON.stringify(x)))
    : (fail++, console.log('FAIL ', n, '— ' + JSON.stringify(x)));
};
const md5 = (s) => crypto.createHash('md5').update(Buffer.from(String(s).replace(/\r\n/g, '\n'), 'utf8')).digest('hex');

const cssLocal = fs.readFileSync(ROOT + 'docs/style.css', 'utf8');
const appLocal = fs.readFileSync(ROOT + 'docs/app.js', 'utf8');
const idxLocal = fs.readFileSync(ROOT + 'docs/index.html', 'utf8');
const browser = await chromium.launch({ args: ['--no-proxy-server'] });

const fpCtx = await browser.newContext({ serviceWorkers: 'block' });
const fpPage = await fpCtx.newPage();
await fpPage.goto(SITE, { waitUntil: 'domcontentloaded', timeout: 60000 });
const fp = await fpPage.evaluate(async ({ site }) => {
  const g = async (u) => { const r = await fetch(site + u, { cache: 'reload' }); return { s: r.status, t: await r.text() }; };
  const cb = Date.now();
  const [i, c, j] = await Promise.all([g('index.html?cb=' + cb), g('style.css?v=147&cb=' + cb), g('app.js?v=129&cb=' + cb)]);
  return { i: i.t, c: c.t, j: j.t, st: [i.s, c.s, j.s] };
}, { site: SITE });
ok('A1 线上 style147/app129 三资源全 200',
  fp.st.every((s) => s === 200) && /style\.css\?v=147/.test(fp.i) && /app\.js\?v=129/.test(fp.i), { st: fp.st });
ok('A2 线上 index/style.css/app.js md5 与本地全等',
  md5(fp.i) === md5(idxLocal) && md5(fp.c) === md5(cssLocal) && md5(fp.j) === md5(appLocal));
const code = fp.c.replace(/\/\*[\s\S]*?\*\//g, '');
ok('A3 grid 限 .view.active#view-data；无裸 #view-data{display:grid}',
  /\.view\.active#view-data \{[\s\S]*?display: grid/.test(code) &&
  !/(^|\n)\s*#view-data \{[\s\S]*?display: grid/.test(code));
await fpCtx.close();

const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto(SITE + '?cb=' + Date.now(), { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => document.querySelectorAll('.card-value').length >= 5, null, { timeout: 25000 });
await page.waitForTimeout(400);

// 初始（游戏时长）时，view-data 必须隐藏
const init = await page.evaluate(() => ({
  dataDisplay: getComputedStyle(document.getElementById('view-data')).display,
  visible: [...document.querySelectorAll('.view')].filter((v) => getComputedStyle(v).display !== 'none').map((v) => v.id),
}));
ok('B1 初始（游戏时长）时 view-data 隐藏，仅 view-lifetime 可见', init.dataDisplay === 'none' && init.visible.length === 1 && init.visible[0] === 'view-lifetime', init);

// 逐卡切换：每次只有对应视图可见
const expect = { 'card-lifetime': 'view-lifetime', 'card-recent': 'view-recent', 'card-ach': 'view-ach', 'card-games': 'view-timeline', 'card-data': 'view-data' };
let bad = [];
for (const [card, view] of Object.entries(expect)) {
  await page.click('#' + card);
  await page.waitForTimeout(280);
  const r = await page.evaluate(() => ({ visible: [...document.querySelectorAll('.view')].filter((v) => getComputedStyle(v).display !== 'none').map((v) => v.id) }));
  if (!(r.visible.length === 1 && r.visible[0] === view)) bad.push({ card, want: view, got: r.visible });
}
ok('B2 逐卡切换每次只有对应视图可见（view-data 不越界常驻）', bad.length === 0, { bad });

// 数据卡内容仍在
const dv = await page.evaluate(() => ({
  reportCells: document.querySelectorAll('#report .rp-cell').length,
  pace: !!document.querySelector('#pace .pace-ring'),
  health: document.querySelectorAll('#health .h-item').length,
  export: !!document.getElementById('btn-csv-daily'),
}));
ok('B3 数据卡下内容完整（报告/周目标/健康度/导出）', dv.reportCells >= 4 && dv.pace && dv.health >= 4 && dv.export, dv);
ok('C1 全程零 JS 异常', errs.length === 0, errs.slice(0, 3));
await browser.close();
console.log(`\n线上第 131 轮：${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
