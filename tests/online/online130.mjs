/* online130.mjs — 第 130 轮上线复验：恢复数据卡（保持删顶部短线）
 * ① 指纹：线上 index 引用 style.css?v=146 / app129 / fx19；index/style.css/app.js 字节 md5 与本地全等。
 * ② 静态：五卡 + 五视图；短线规则已删；数据视图四块面板在 HTML 内；其他四视图无可复用引用错位。
 * ③ 运行时：五卡齐、hero ::before content=none；点数据卡 → 报告/周目标/健康度/导出/关于数据齐全；
 *    其他四卡 report/health/export 全无；零异常。
 * 用法：node tests/online/online130.mjs */
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
  const [i, c, j] = await Promise.all([
    g('index.html?cb=' + cb), g('style.css?v=146&cb=' + cb), g('app.js?v=132&cb=' + cb),
  ]);
  return { i: i.t, c: c.t, j: j.t, st: [i.s, c.s, j.s] };
}, { site: SITE });
ok('A1 线上 style146/app129 三资源全 200',
  fp.st.every((s) => s === 200) &&
  /style\.css\?v=146/.test(fp.i) && /app\.js\?v=132/.test(fp.i) && /fx\.js\?v=19/.test(fp.i), { st: fp.st });
ok('A2 线上 index/style.css/app.js md5 与本地全等',
  md5(fp.i) === md5(idxLocal) && md5(fp.c) === md5(cssLocal) && md5(fp.j) === md5(appLocal));
const code = fp.c.replace(/\/\*[\s\S]*?\*\//g, '');
ok('A3 短线规则已删（无 .card::before 强调线）；数据页 grid 仍在',
  !/\.card-nav\.active\)::before/.test(code) && /#view-data \{[\s\S]*?display: grid/.test(code));
ok('A4 线上 HTML：五张卡 + 数据视图四块面板',
  (fp.i.match(/class="card card-nav/g) || []).length === 5 &&
  /id="card-data"/.test(fp.i) && /id="view-data"/.test(fp.i) &&
  /id="report"/.test(fp.i) && /id="health"/.test(fp.i) && /id="btn-csv-daily"/.test(fp.i) && /id="data-range"/.test(fp.i));
await fpCtx.close();

const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto(SITE + '?cb=' + Date.now(), { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => document.querySelectorAll('.card-value').length >= 5, null, { timeout: 25000 });
await page.waitForTimeout(400);
const ov = await page.evaluate(() => ({
  cards: [...document.querySelectorAll('.card-label')].map((e) => e.textContent.trim()),
  heroBefore: getComputedStyle(document.querySelector('.card-hero'), '::before').content,
}));
ok('B1 线上五卡齐（含数据），hero 短线已删（::before none）',
  JSON.stringify(ov.cards) === JSON.stringify(['游戏时长', '最近游玩', '成就', '游戏库', '数据']) &&
  ov.heroBefore === 'none', ov);

await page.click('#card-data');
await page.waitForTimeout(500);
const dv = await page.evaluate(() => ({
  active: document.getElementById('view-data')?.classList.contains('active'),
  reportCells: document.querySelectorAll('#report .rp-cell').length,
  pace: !!document.querySelector('#pace .pace-ring'),
  health: document.querySelectorAll('#health .h-item').length,
  export: !!document.getElementById('btn-csv-daily'),
  about: !!document.querySelector('#data-range'),
}));
ok('B2 数据卡下内容齐全（报告/周目标/健康度/导出/关于数据）',
  dv.active && dv.reportCells >= 4 && dv.pace && dv.health >= 4 && dv.export && dv.about, dv);

let leaked = [];
for (const [card, view] of [['card-lifetime', 'view-lifetime'], ['card-recent', 'view-recent'], ['card-ach', 'view-ach'], ['card-games', 'view-timeline']]) {
  await page.click('#' + card);
  await page.waitForTimeout(250);
  const has = await page.evaluate((v) => { const el = document.getElementById(v); return !!(el.querySelector('#report') || el.querySelector('#health') || el.querySelector('.row-actions') || el.querySelector('#pace')); }, view);
  if (has) leaked.push(view);
}
ok('B3 其他四卡底部无报告/健康度/导出/周目标（不越界）', leaked.length === 0, { leaked });
ok('C1 全程零 JS 异常', errs.length === 0, errs.slice(0, 3));
await browser.close();
console.log(`\n线上第 130 轮：${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
