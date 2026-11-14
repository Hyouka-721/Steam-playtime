/* 第 101 轮 watch 侧回归：删两面板 · 四卡同行 · 删国别脚注
 *
 * 用户原话（三条）：
 *   1. 删除「类型构成」和「高频标签」两个选项卡。
 *   2. 将「月度分布、评分区间、国别构成、逐年趋势」按顺序并列同一行，合理调节宽度。
 *   3. 删除国别构成的说明文字「按国别累计：合拍片会在各出品国各计一次，合计可超过记录总数；
 *      少于 10 部的国别（法国、意大利、德国、瑞士、西班牙）合并为「其他」」。
 *
 * 实现要点：
 *   ① 面板只剩 4 块（months / buckets / country / years），DOM 顺序即用户指定顺序，
 *      各占 3 栏共 12 栏；kinds/tags 的渲染、数据计算、stRows 函数与 CSS 规则整条删净。
 *   ② 柱图 4 栏（1920 约 612px）、饼卡 2 栏（1920 约 299px，宽度微调），原来的 240px 饼 + 320px 图例横排
 *      一定挤爆 → 饼改按面板宽度 42% 缩放（clamp 96~168px）、图例吃剩余空间，
 *      .st-pie 加 flex-wrap 让 861~1180 区间自动换成「饼在上 / 图例整宽」。
 *   ③ 脚注删掉但**合并规则本身保留**（COUNTRY_MIN / majors 分流 / 「其他」中性灰），
 *      标题右侧「N 部待补」的 .st-hint 也保留。
 *
 * ⚠️ 静态判据一律先剥块注释：源码注释里留着「按国别累计」「类型构成 / 高频标签」等历史字样，
 *    直接拿全文 grep 会假红（第 100 轮 HTML 注释踩过同一个坑）。
 */
import { createRequire } from 'module';
import fs from 'fs';
import { fileURLToPath } from 'url';

const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const BASE = 'http://127.0.0.1:8895/';
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const rd = (p) => fs.readFileSync(ROOT + 'docs/' + p, 'utf8').replace(/\r\n/g, '\n');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');

const html = rd('watch.html');
const js = strip(rd('watch.js'));
const css = strip(rd('watch.css'));
const ORDER = ['months', 'buckets', 'country', 'years'];

let pass = 0, fail = 0;
const ok = (n, c, extra = '') => {
  c ? (pass++, console.log(`PASS ${n}${extra ? '  — ' + extra : ''}`))
    : (fail++, console.log(`FAIL ${n}  — ${extra}`));
};

/* ---------------- A 静态契约 ---------------- */
console.log('== A 静态契约 ==');
ok('A1 版本号：watch.html 引用 watch.css?v=41 / watch.js?v=33（两个 docs 文件都改了，两条缓存键各 bump）',
  /watch\.css\?v=41/.test(html) && /watch\.js\?v=33/.test(html),
  (html.match(/watch\.(css|js)\?v=\d+/g) || []).join(' '));

const pos = ORDER.map((k) => js.indexOf('data-panel="' + k + '"'));
ok('A2 面板顺序＝月度分布 / 评分区间 / 国别构成 / 逐年趋势；kinds 与 tags 面板已从渲染里删净',
  pos.every((p) => p > 0) && pos.every((p, i) => i === 0 || p > pos[i - 1]) &&
  !/data-panel="kinds"|data-panel="tags"/.test(js) &&
  !/<h3>类型构成<\/h3>|<h3>高频标签<\/h3>/.test(js),
  '位置 ' + pos.join(' < '));

const spans = ORDER.map((k) => Number((new RegExp(
  '\\.st-panel\\[data-panel="' + k + '"\\]\\s*\\{\\s*grid-column:\\s*span\\s*(\\d+)').exec(css) || [, 0])[1]));
ok('A3 月度/逐年各 4 栏、评分区间/国别各 2 栏（4+2+2+4 = 12），容器仍是 12 栅格（否则会掉进下一行留空档）',
  spans.join('/') === '4/2/2/4' && spans.reduce((a, b) => a + b, 0) === 12 &&
  /\.st-panels\s*\{[\s\S]*?grid-template-columns:\s*repeat\(12,/.test(css),
  '跨度 ' + spans.join('+') + ' = ' + spans.reduce((a, b) => a + b, 0));

ok('A4 860 块仍全文件唯一，且断点里的跨度复位仍在（1 列容器 + span 4/2 会横向溢出）',
  (css.match(/@media \(max-width: 860px\)/g) || []).length === 1 &&
  /\.w-stats \.st-panel\[data-panel\] \{ grid-column: auto; \}/.test(css) &&
  !/\.st-panel\[data-panel="kinds"\]|\.st-panel\[data-panel="tags"\]/.test(css),
  '860块=' + (css.match(/@media \(max-width: 860px\)/g) || []).length);

ok('A5 类型构成 / 高频标签整条删净：stRows 函数、kinds/tags 数据计算、st-chips 渲染都没了；st-rows 仍被饼图图例复用',
  !/function stRows\(|stRows\(/.test(js) &&
  !/var kinds = |var tagMap = |var tags = Object/.test(js) &&
  !/st-chips|st-chip/.test(js) &&
  /<div class="st-rows st-rows--pie">/.test(js));

ok('A6 国别脚注删净（剥注释后无 st-note / 说明文案），但「N 部待补」提示与合并规则本身都在',
  !/st-note|按国别累计|合拍片会在|合并为「其他」/.test(js) &&
  /<span class="st-hint">/.test(js) &&
  /var COUNTRY_MIN = 10;/.test(js) &&
  /var majors = countryAll\.filter/.test(js) &&
  /\{ k: '其他', v: restVal, other: true \}/.test(js) &&
  /var OTHER_COLOR/.test(js));

ok('A7 CSS 里脚注 / chip / 类型明度规则一并删除；饼图改成按栏缩放 + 图例自动换行（四卡 3 栏必需）',
  !/\.st-note\s*\{|\.st-chips|\.st-chip/.test(css) &&
  /clamp\(96px, 42%, 168px\)/.test(css) &&
  /\.st-pie \{[^}]*flex-wrap: wrap/.test(css) &&
  /\.st-rows--pie \{[^}]*flex: 1 1 auto/.test(css));

ok('A8 两处饼图调用与零黑缝契约未回退（第 100 轮 stPie 首尾相接、stroke:none）',
  (js.match(/stPie\(/g) || []).length === 3 &&
  /var a0 = ang, a1 = ang \+ sweep;/.test(js) &&
  !/gap = 1\.1/.test(js) && /\.st-pie-slice \{ stroke: none; \}/.test(css),
  'stPie( 出现 ' + (js.match(/stPie\(/g) || []).length + ' 次（1 定义 + 2 调用）');

/* ---------------- B 1920 运行时 ---------------- */
console.log('== B 1920 运行时 ==');
const browser = await chromium.launch({ args: ['--no-proxy-server'] });

async function openStats(page) {
  await page.goto(BASE + 'watch.html', { waitUntil: 'load' });
  await page.waitForSelector('#w-grid .poster', { timeout: 20000 });
  await page.click('#w-avatar');                       /* 年报按钮只在时间轴出现（第 93 轮契约） */
  await page.waitForSelector('#w-tl .tl-item', { timeout: 20000 });
  await page.click('#w-stats-btn');
  await page.waitForSelector('.st-panel[data-panel="buckets"] svg.st-pie-chart', { timeout: 10000 });
  await page.waitForTimeout(700);
  await page.mouse.move(1, 1);
}

async function measure(page) {
  return page.evaluate(() => {
    const b = (e) => { const x = e.getBoundingClientRect(); return { l: Math.round(x.left), t: Math.round(x.top), r: Math.round(x.right), w: Math.round(x.width), h: Math.round(x.height) }; };
    const panels = [...document.querySelectorAll('.st-panels .st-panel')]
      .map((e) => ({ k: e.dataset.panel, ...b(e) }));
    const pies = [...document.querySelectorAll('.st-pie')].map((e) => {
      const svg = b(e.querySelector('svg'));
      const leg = b(e.querySelector('.st-rows--pie'));
      return {
        w: svg.w, h: svg.h, legW: leg.w, below: leg.t >= svg.t + svg.h - 2,
        sideBySide: !!(leg.t < svg.t + svg.h - 2 && leg.l >= svg.r - 1),
        scroll: e.scrollWidth - e.clientWidth
      };
    });
    const country = document.querySelector('[data-panel="country"]');
    const labs = [...document.querySelectorAll('.st-axis .st-bar-lab')].map(b);
    let overlap = 0;
    for (let i = 1; i < labs.length; i++) if (labs[i].t === labs[i - 1].t && labs[i].l < labs[i - 1].r - 1) overlap++;
    return {
      panels, pies, overlap,
      panelContainer: b(document.querySelector('.st-panels')),
      hasKinds: !!document.querySelector('[data-panel="kinds"]'),
      hasTags: !!document.querySelector('[data-panel="tags"]'),
      hasNote: !!document.querySelector('.st-note'),
      noteText: /\u6309\u56fd\u522b\u7d2f\u8ba1|\u5408\u62cd\u7247\u4f1a\u5728/.test(country ? country.textContent : ''),
      countryRows: document.querySelectorAll('[data-panel="country"] .st-row--pie').length,
      otherRow: /其他/.test(country ? country.textContent : ''),
      monthBars: document.querySelectorAll('[data-panel="months"] .st-bar').length,
      yearBars: document.querySelectorAll('[data-panel="years"] .st-bar').length,
      ov: document.documentElement.scrollWidth - document.documentElement.clientWidth
    };
  });
}

{
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1200 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  await openStats(page);
  const r = await measure(page);

  ok('B1 DOM 里只剩 4 块统计面板且顺序正确；kinds/tags 面板、脚注节点与文案都不存在',
    r.panels.length === 4 && r.panels.map((p) => p.k).join('/') === ORDER.join('/') &&
    !r.hasKinds && !r.hasTags && !r.hasNote && !r.noteText,
    r.panels.map((p) => p.k).join(' / '));

  ok('B2 四卡严格并列同一行：top 全等、left 依次递增、柱图≈2×饼卡（4/12 vs 2/12），且合计铺满 12 栏容器',
    r.panels.every((p) => p.t === r.panels[0].t) &&
    r.panels.every((p, i) => i === 0 || p.l > r.panels[i - 1].l) &&
    Math.abs(r.panels[0].w - r.panels[3].w) <= 2 &&
    Math.abs(r.panels[1].w - r.panels[2].w) <= 2 &&
    Math.abs(r.panels[0].w / r.panels[1].w - 2) <= 0.1 &&
    r.panels[3].r <= r.panelContainer.r + 1 && r.panels[0].l >= r.panelContainer.l - 1,
    `top=${r.panels.map((p) => p.t).join('/')} 宽=${r.panels.map((p) => p.w).join('/')} 容器=${r.panelContainer.w}`);

  ok('B3 两块饼按栏缩放为正方形（≤168px），图例与饼不重叠、无内部溢出',
    r.pies.length === 2 && r.pies.every((p) => p.w <= 168 && p.w >= 96 &&
      Math.abs(p.w - p.h) <= 1 && p.scroll <= 0 && (p.sideBySide || p.below) && p.legW >= 100),
    JSON.stringify(r.pies));

  ok('B4 柱图内容未丢：月度 12 根、逐年 9 根，轴标签互不重叠',
    r.monthBars === 12 && r.yearBars === 9 && r.overlap === 0,
    `月=${r.monthBars} 年=${r.yearBars} 重叠=${r.overlap}`);

  ok('B5 国别合并规则仍在（5 行图例、含「其他」），只是说明文字删了',
    r.countryRows === 5 && r.otherRow && !r.hasNote,
    `行=${r.countryRows} 其他=${r.otherRow}`);

  ok('B6 1920 无横向溢出 + 零 JS 异常', r.ov <= 0 && errs.length === 0, `ov=${r.ov} err=${errs.length}`);
  await ctx.close();
}

/* ---------------- C 响应式 ---------------- */
console.log('== C 响应式 ==');
for (const [w, label] of [[1440, '1440'], [1000, '1000'], [390, '390']]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e)));
  await openStats(p);
  const r = await measure(p);
  if (w === 390) {
    ok('C3 390 回单列：四块依次下移、面板不超视口、脚注与 kinds/tags 仍不存在、零溢出零异常',
      r.panels.length === 4 &&
      r.panels.every((x, i) => i === 0 || x.t > r.panels[i - 1].t) &&
      r.panels.every((x) => x.r <= w + 1) && !r.hasNote && !r.hasKinds && !r.hasTags &&
      r.ov <= 0 && errs.length === 0,
      `top=${r.panels.map((x) => x.t).join('/')} ov=${r.ov} err=${errs.length}`);
  } else {
    ok(`C${w === 1440 ? '1' : '2'} ${label} 四卡仍同行、饼继续按栏缩小、图例自动换行到饼下方、零溢出零异常`,
      r.panels.length === 4 && r.panels.every((x) => x.t === r.panels[0].t) &&
      r.pies.every((x) => x.w <= 168 && x.scroll <= 0) &&
      r.pies.every((x) => x.below) &&
      r.ov <= 0 && errs.length === 0,
      `宽=${r.panels[0].w} 饼=${r.pies.map((x) => x.w + (x.below ? '↓' : '→')).join('/')} ov=${r.ov} err=${errs.length}`);
  }
  await ctx.close();
}

await browser.close();
console.log('');
console.log(`第 101 轮：${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
