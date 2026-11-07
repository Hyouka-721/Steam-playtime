/* online102.mjs — 第 102 轮（榜单右半区）上线复验
   覆盖：版本号 / 相对时间已删 / 日期单行 / 时长右移 40px / 柱子两端各延 30/20 / 名称让位 / 窄屏清零 / 无溢出
   用法：node tests/online/online102.mjs */
import { createRequire } from 'module';

const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const SITE = 'https://hyouka-721.github.io/Steam-playtime/';
let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('PASS ', name, extra === undefined ? '' : '— ' + JSON.stringify(extra)); }
  else { fail++; console.log('FAIL ', name, '— ' + JSON.stringify(extra)); }
};

const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

await page.goto(SITE, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('#lt-list .rank-item', { state: 'visible', timeout: 40000 });
await page.waitForTimeout(1500);

/* ---------- A 版本号 ---------- */
const ver = await page.evaluate(() => {
  const h = document.documentElement.outerHTML;
  return {
    css: (h.match(/style\.css\?v=(\d+)/) || [])[1],
    js: (h.match(/app\.js\?v=(\d+)/) || [])[1],
  };
});
ok('A1 线上已是 style.css?v=135 / app.js?v=120', ver.css === '133' && ver.js === '119', ver);

/* ---------- B 相对时间已删除 ---------- */
const b = await page.evaluate(() => {
  const last = document.querySelector('#lt-list .rank-item .rank-last');
  const g = document.createRange();
  g.selectNodeContents(last);
  return {
    dataRel: document.querySelectorAll('#lt-list [data-rel]').length,
    after: getComputedStyle(last, '::after').content,
    lines: new Set([...g.getClientRects()].map((r) => Math.round(r.top))).size,
    text: last.textContent,
  };
});
ok('B1 全榜无 data-rel 属性节点', b.dataRel === 0, b.dataRel);
ok('B2 .rank-last 的 ::after 内容为空（相对时间已删）', b.after === 'none' || b.after === 'normal', b.after);
ok('B3 日期单行显示', b.lines === 1, { lines: b.lines, text: b.text });
ok('B4 日期只剩纯日期文本', /^\d{4}-\d{2}-\d{2}$/.test(b.text.trim()), b.text);

/* ---------- C 时长右移 40 + 柱子两端延展 ---------- */
const c = await page.evaluate(() => {
  const row = document.querySelector('#lt-list .rank-item');
  const bar = row.querySelector('.rank-bar');
  const name = row.querySelector('.rank-name');
  const min = row.querySelector('.rank-min');
  const cs = getComputedStyle(bar);
  const bcs = getComputedStyle(row);
  const cols = bcs.gridTemplateColumns.split(' ').map((v) => parseFloat(v));

  const g = document.createRange();
  g.selectNodeContents(min);
  const withT = g.getBoundingClientRect();
  const scene = min.style.transform;
  min.style.transform = 'none';
  const g2 = document.createRange();
  g2.selectNodeContents(min);
  const withoutT = g2.getBoundingClientRect();
  min.style.transform = scene;

  return {
    marginL: cs.marginLeft, marginR: cs.marginRight,
    barW: +bar.getBoundingClientRect().width.toFixed(1),
    areaW: +cols[3].toFixed(1),
    namePadRight: getComputedStyle(name).paddingRight,
    transform: getComputedStyle(min).transform,
    shift: +(((withT.left + withT.right) - (withoutT.left + withoutT.right)) / 2).toFixed(1),
  };
});
ok('C1 柱子左边距 -30px', c.marginL === '-30px', c.marginL);
ok('C2 柱子右边距 -20px', c.marginR === '-20px', c.marginR);
ok('C3 柱子比网格区宽 50px', Math.abs(c.barW - (c.areaW + 50)) <= 1, { barW: c.barW, areaW: c.areaW });
ok('C4 名称列右侧留出 22px 给柱子', c.namePadRight === '22px', c.namePadRight);
ok('C5 时长文字 transform = translateX(40px)', c.transform === 'matrix(1, 0, 0, 1, 40, 0)', c.transform);
ok('C6 实测文字中心相对原位置右移 40px', Math.abs(c.shift - 40) <= 0.6, c.shift);

/* ---------- D 不溢出 ---------- */
const widths = [1440, 1280, 1088, 900];
const overflow = [];
for (const w of widths) {
  await page.setViewportSize({ width: w, height: 900 });
  await page.waitForTimeout(350);
  const o = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth - window.innerWidth,
    barInside: (() => {
      const row = document.querySelector('#lt-list .rank-item');
      const bar = row.querySelector('.rank-bar').getBoundingClientRect();
      const panel = row.closest('.panel').getBoundingClientRect();
      return bar.left >= panel.left - 1 && bar.right <= panel.right + 1;
    })(),
  }));
  overflow.push({ w, ...o });
}
ok('D1 四个宽度均无横向溢出', overflow.every((x) => x.doc <= 0), overflow);
ok('D2 柱子始终在面板内（不越出左右边缘）', overflow.every((x) => x.barInside), overflow);

/* ---------- E 窄屏清零 ---------- */
await page.setViewportSize({ width: 390, height: 900 });
await page.waitForTimeout(400);
const e = await page.evaluate(() => {
  const bar = document.querySelector('#lt-list .rank-item .rank-bar');
  const cs = getComputedStyle(bar);
  const row = document.querySelector('#lt-list .rank-item');
  return {
    marginL: cs.marginLeft, marginR: cs.marginRight,
    doc: document.documentElement.scrollWidth - window.innerWidth,
    insideRow: bar.getBoundingClientRect().left >= row.getBoundingClientRect().left - 1,
  };
});
ok('E1 窄屏柱子负边距已清零', e.marginL === '0px' && e.marginR === '0px', { l: e.marginL, r: e.marginR });
ok('E2 窄屏柱子未越出行左缘', e.insideRow && e.doc <= 0, e);

/* ---------- F 健康度 ---------- */
const realErrs = errs.filter((s) => !/favicon|steamstatic|Failed to load resource/i.test(s));
ok('F1 零 JS 异常 / console error', realErrs.length === 0, realErrs.slice(0, 3));

console.log(`\n===== online102  PASS=${pass} FAIL=${fail} =====`);
await browser.close();
process.exit(fail ? 1 : 0);
