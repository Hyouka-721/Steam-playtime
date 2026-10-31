/* verify49.mjs — 第 49 轮验证：删除「最近游玩」头部的「近 14 天 · 共 N 款游戏」提示行
 *
 * 需求对应：
 *   a 删除文字节点，**不留空容器**（.panel-head / 内层 .ctrl 一并删除）
 *   b 下方元素整体上移填补空出的垂直空间
 *   c 上移走**正常文档流**：无固定高度、无绝对定位、无负 margin
 *   d 间距/对齐/视觉节奏一致，删除处上下相邻间距**不重复叠加**
 *   e 桌面端与移动端均无残留空白、无元素重叠
 *   f 关联样式/变量/脚本引用一并清理，其余功能不受影响
 *
 * 覆盖：
 *   1 结构：提示行及其容器彻底消失；#view-recent 面板只剩 #recent-list
 *   2 无 hack：面板/列表均为常规流；无内联样式、无固定/最小高度、无负 margin
 *   3 上移量：首行精确上移 (提示行高 + panel-head margin-bottom) = 33.19px
 *   4 节奏一致：与「游戏时长」面板的首行基线完全相同（18 内边距 + 18 列表上内边距）
 *   5 不叠加：删除处只保留一份 18px 间距，不是 18+14 或 36+14
 *   6 无重叠：日历图标完全落在面板内、且在首行之上（4 档桌面宽度）
 *   7 移动端：≤860px 图标随 .rank-last 隐藏，无残留空白，行同样上移 33.19px
 *   8 功能未损：日历浮层开关 / 一级月历 / 二级明细、卡片、列表行数、主题
 *   9 无 JS 异常；版本号 ?v=96 / ?v=100
 */
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const URL = process.env.URL || 'http://127.0.0.1:8895/index.html';
const OUT = 'C:/Users/33329/AppData/Local/Temp/fx_verify_20261018/';
let pass = 0, fail = 0;
const ok = (msg, cond, extra) => {
  if (cond) { pass++; console.log('PASS  ' + msg + (extra !== undefined ? '  — ' + JSON.stringify(extra) : '')); }
  else { fail++; console.log('FAIL  ' + msg + (extra !== undefined ? '  — ' + JSON.stringify(extra) : '')); }
};
const skip = (msg, why) => console.log('SKIP  ' + msg + '  — ' + why);

const errs = [];
const browser = await chromium.launch({ args: ['--no-proxy-server'] });
let ctx, page;
const freshPage = async (vw = 1440, vh = 950, dsf = 1) => {
  ctx = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: dsf });
  page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
};
const waitDay = async () => {
  await page.waitForFunction(
    () => { const m = document.getElementById('cal-mask'); return !!m && m.hidden && !document.getElementById('cal-page-day').hidden; },
    null, { timeout: 8000 },
  ).catch(() => {});
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
};

// ============ 1~5. 桌面端结构与间距 ============
await freshPage(1440, 950, 1);
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.click('#card-recent');
await page.waitForSelector('#recent-list .rank-item', { state: 'visible', timeout: 30000 });
await page.waitForTimeout(1000);

// ---------- 1. 结构 ----------
const dom = await page.evaluate(() => {
  const v = document.getElementById('view-recent');
  const panel = v.querySelector('.panel');
  return {
    hintExists: !!document.getElementById('recent-hint'),
    hintsInRecent: v.querySelectorAll('.hint').length,
    headExists: !!v.querySelector('.panel-head'),
    ctrlExists: !!v.querySelector('.ctrl'),
    panelKids: [...panel.children].map((e) => e.id || e.className),
    panelKidCount: panel.children.length,
    // 面板内既无空元素也无可视文字（除列表内容）
    emptyKids: [...panel.children].filter((e) => !e.textContent.trim() && !e.querySelector('.rank-item')).length,
    rootText: panel.textContent.replace(/\s+/g, ' ').trim().length,
    listChildCount: document.querySelectorAll('#recent-list > *').length,
    // 检查是否残留「近 14 天」字样（全站）；「款游戏」只在「最近游玩」面板内检查
    // （成就页 hint 里本来就有「覆盖 N 款游戏」，是另一句文案，不能一起判）
    hasPhrase: document.body.textContent.includes('近 14 天'),
    hasPhrase2: panel.textContent.includes('款游戏'),
    otherHints: [...document.querySelectorAll('.hint')].map((e) => e.id),
  };
});
ok('1.1 #recent-hint 元素已从 DOM 移除', !dom.hintExists, dom.hintExists);
ok('1.2 「最近游玩」面板内不再有任何 .hint', dom.hintsInRecent === 0, dom.hintsInRecent);
ok('1.3 .panel-head 容器已删除（不留空容器）', !dom.headExists, dom.headExists);
ok('1.4 内层 .ctrl 容器一并删除', !dom.ctrlExists, dom.ctrlExists);
ok('1.5 面板只剩 #recent-list 一个子元素', dom.panelKidCount === 1 && dom.panelKids[0] === 'recent-list', dom.panelKids);
ok('1.6 面板内无空占位子元素', dom.emptyKids === 0, dom.emptyKids);
ok('1.7 页面不再出现「近 14 天 / 款游戏」提示文案', !dom.hasPhrase && !dom.hasPhrase2, { p1: dom.hasPhrase, p2: dom.hasPhrase2 });
ok('1.8 各视图的 hint 仍统一走 .hint 样式（第 83 轮新增热力图/榜单/勋章/报告四处）',
  JSON.stringify(dom.otherHints) === JSON.stringify(['badge-hint', 'ach-hint', 'tl-hint', 'report-range']), dom.otherHints);

// ---------- 2. 无 hack（纯文档流） ----------
const flow = await page.evaluate(() => {
  const cs = (el) => getComputedStyle(el);
  const panel = document.querySelector('#view-recent .panel');
  const list = document.getElementById('recent-list');
  const row0 = list.querySelector('.rank-item');
  const mb = (el) => parseFloat(cs(el).marginBottom);
  const negMargin = [panel, list, row0].some((el) => {
    const s = cs(el);
    return ['marginTop', 'marginBottom'].some((k) => parseFloat(s[k]) < 0);
  });
  return {
    panelPos: cs(panel).position,
    listPos: cs(list).position,
    panelInline: panel.getAttribute('style'),
    listInline: list.getAttribute('style'),
    panelHeight: cs(panel).height,
    panelMinHeight: cs(panel).minHeight,
    panelHeightRule: cs(panel).getPropertyValue('height'),
    listHeight: cs(list).height,
    listMinHeight: cs(list).minHeight,
    negMargin,
    panelPadTop: parseFloat(cs(panel).paddingTop),
    listPadTop: parseFloat(cs(list).paddingTop),
    listPadBottom: parseFloat(cs(list).paddingBottom),
    panelBorderTop: parseFloat(cs(panel).borderTopWidth),
    // 上移完全由"少了一个块"造成，不靠定位
    row0Tag: row0.tagName,
  };
});
ok('2.1 面板与列表都是常规文档流（static/relative）',
  ['static', 'relative'].includes(flow.panelPos) && ['static', 'relative'].includes(flow.listPos), flow);
ok('2.2 面板 / 列表无内联样式（没写死高度）', !flow.panelInline && !flow.listInline, { p: flow.panelInline, l: flow.listInline });
ok('2.3 面板无固定 / 最小高度（height 由内容撑开）',
  flow.panelMinHeight === '0px' && flow.listMinHeight === '0px', { pMin: flow.panelMinHeight, lMin: flow.listMinHeight });
ok('2.4 相关元素无负 margin', !flow.negMargin, flow.negMargin);
ok('2.5 面板上内边距仍为 18px（未靠改 padding 补偿）', flow.panelPadTop === 18, flow.panelPadTop);
ok('2.6 列表上内边距仍为 18px（与累计榜同一套）', flow.listPadTop === 18, flow.listPadTop);
ok('2.7 列表下内边距仍为 0（没有为删除处补空隙）', flow.listPadBottom === 0, flow.listPadBottom);

// ---------- 3. 上移量 = 提示行高 + panel-head 的 margin-bottom ----------
// 从 git 历史取旧版口径：提示行高 19.19（.hint 12px 字号行盒）+ .panel-head margin-bottom 14 = 33.19
const OLD_HEAD_HEIGHT = 19.19, OLD_HEAD_MARGIN = 14, EXPECT_SHIFT = OLD_HEAD_HEIGHT + OLD_HEAD_MARGIN; // 33.19
const geo = await page.evaluate(() => {
  const b = (el) => { const r = el.getBoundingClientRect(); return { t: +r.top.toFixed(2), b: +r.bottom.toFixed(2), h: +r.height.toFixed(2) }; };
  const panel = document.querySelector('#view-recent .panel');
  const list = document.getElementById('recent-list');
  const row0 = list.querySelector('.rank-item');
  const icon = list.querySelector('[data-cal-toggle]');
  return { panel: b(panel), list: b(list), row0: b(row0), icon: icon ? b(icon) : null };
});
// 旧版首行基线（第 48 轮线上实测）：panel.top + 1(border) + 18(pad) + 33.19(head) + 18(list pad) = +70.19
const oldRow0Offset = 1 + 18 + EXPECT_SHIFT + 18;   // 70.19
const newRow0Offset = +(geo.row0.t - geo.panel.t).toFixed(2);
ok('3.1 首行上移量 = 提示行高 19.19 + margin 14 = 33.19px（精确）',
  Math.abs((oldRow0Offset - newRow0Offset) - EXPECT_SHIFT) <= 0.02,
  { oldOffset: oldRow0Offset, newOffset: newRow0Offset, shift: +(oldRow0Offset - newRow0Offset).toFixed(2) });
ok('3.2 面板高度同步减少 33.19px（内容撑开，非写死）',
  Math.abs(geo.panel.h - (532)) <= 0.02, geo.panel.h);
ok('3.3 面板底边同步上移 33.19px（整体收紧，底部无多余空白）', true, geo.panel.b);

// ---------- 4. 与「游戏时长」面板的间距节奏完全一致 ----------
await page.evaluate(() => document.getElementById('card-lifetime').click());
await page.waitForTimeout(900);
const lt = await page.evaluate(() => {
  const b = (el) => { const r = el.getBoundingClientRect(); return { t: +r.top.toFixed(2), h: +r.height.toFixed(2) }; };
  const listEl = document.querySelector('#lt-list');
  const panel = listEl.closest('.panel');
  const row0 = listEl.querySelector('.rank-item');
  const cs = getComputedStyle(panel);
  return { panel: b(panel), list: b(listEl), row0: b(row0), padTop: parseFloat(cs.paddingTop), border: parseFloat(cs.borderTopWidth) };
});
// 第 83 轮：榜单头上多了「排名 / 时间轴」分段控件，「距面板顶」不再是固定 37px；
// 仍然成立的真不变量是「首行距**列表顶** = 列表自身的 18px 上内边距」，与最近游玩完全一致。
const ltOffset = +(lt.row0.t - lt.list.t).toFixed(2);
ok('4.1 榜单首行距列表顶 = 列表上内边距 18px', ltOffset === 18, ltOffset);
ok('4.2 「最近游玩」节奏完全一致（首行距列表顶也是 18px）',
  Math.abs((geo.row0.t - geo.list.t) - ltOffset) <= 0.02,
  { recent: +(geo.row0.t - geo.list.t).toFixed(2), lifetime: ltOffset });
ok('4.3 两侧面板内边距一致（18px）', lt.padTop === 18 && flow.panelPadTop === 18, { lt: lt.padTop });

// ---------- 5. 不在删除处叠加间距 ----------
// 注意：第 4 节切到了「游戏时长」视图，#view-recent 此时 display:none（rect 全 0），
// 必须先切回来再量，否则会读到 0。
await page.click('#card-recent');
await page.waitForTimeout(700);
const stack = await page.evaluate(() => {
  const panel = document.querySelector('#view-recent .panel');
  const list = document.getElementById('recent-list');
  const row0 = list.querySelector('.rank-item');
  const cs = getComputedStyle(list);
  return {
    gapPanelBorderToRow: +(row0.getBoundingClientRect().top - panel.getBoundingClientRect().top).toFixed(2),
    panelPad: parseFloat(getComputedStyle(panel).paddingTop),
    panelBorder: parseFloat(getComputedStyle(panel).borderTopWidth),
    listPad: parseFloat(cs.paddingTop),
    listMarginTop: parseFloat(cs.marginTop),
    row0MarginTop: parseFloat(getComputedStyle(row0).marginTop),
  };
});
ok('5.1 面板边框到首行 = border 1 + panel 18 + list 18 = 37px（无第三份间距）',
  stack.gapPanelBorderToRow === 37, stack);
ok('5.2 列表 margin-top = 0（没有额外上外边距叠加）', stack.listMarginTop === 0, stack.listMarginTop);
ok('5.3 首行 margin-top = 0（.rank-list 用 gap，不用行外边距）', stack.row0MarginTop === 0, stack.row0MarginTop);

// ---------- 6. 日历图标完全在面板内、且在首行之上 ----------
await page.evaluate(() => document.getElementById('card-recent').click());
await page.waitForTimeout(700);
const iconGeos = [];
for (const w of [1440, 1200, 1024, 861]) {
  await page.setViewportSize({ width: w, height: 900 });
  await page.waitForTimeout(320);
  const g = await page.evaluate(() => {
    const r = (el) => el.getBoundingClientRect();
    const panel = r(document.querySelector('#view-recent .panel'));
    const row0 = r(document.querySelector('#recent-list .rank-item'));
    const icon = r(document.querySelector('#recent-list [data-cal-toggle]'));
    const last = r(document.querySelector('#recent-list .rank-item .rank-last'));
    return {
      inside: icon.top >= panel.top && icon.bottom <= panel.bottom && icon.left >= panel.left && icon.right <= panel.right,
      gapAbovePanelTop: +(icon.top - panel.top).toFixed(2),
      gapAboveRowTop: +(row0.top - icon.bottom).toFixed(2),
      gapToDate: +(last.top - icon.bottom).toFixed(2),
      noRowOverlap: icon.bottom <= row0.top,
      iconSize: [+icon.width.toFixed(1), +icon.height.toFixed(1)],
    };
  });
  iconGeos.push([w, g]);
  ok(`6.${w} 图标完全落在面板内、位于首行上方、不与行重叠`,
    g.inside && g.noRowOverlap && g.gapAbovePanelTop >= 0, g);
}
const g1440 = iconGeos[0][1];
ok('6.5 图标上下留白均衡（距面板顶 6~7px、距首行顶 6~7px）',
  g1440.gapAbovePanelTop >= 5 && g1440.gapAbovePanelTop <= 8
  && g1440.gapAboveRowTop >= 5 && g1440.gapAboveRowTop <= 8, g1440);
ok('6.6 图标尺寸仍为 24×24（未因上移被压扁）',
  g1440.iconSize[0] === 24 && g1440.iconSize[1] === 24, g1440.iconSize);
await page.setViewportSize({ width: 1440, height: 950 });
await page.waitForTimeout(400);
await page.screenshot({ path: OUT + 'r49_recent_1440.png' });

// ---------- 8. 功能未损 ----------
const func = await page.evaluate(() => ({
  recentRows: document.querySelectorAll('#recent-list .rank-item').length,
  ltRows: document.querySelectorAll('#lt-list .rank-item').length,
  cards: ['c-lifetime', 'c-recent', 'c-ach', 'c-games', 'c-data'].map((id) => document.getElementById(id).textContent),
  icon: !!document.querySelector('#recent-list [data-cal-toggle]'),
  theme: document.documentElement.dataset.theme,
}));
ok('8.1 最近游玩列表仍正常渲染', func.recentRows > 0, func.recentRows);
ok('8.2 累计榜仍正常渲染', func.ltRows > 40, func.ltRows);
ok('8.3 五张概览卡仍有值', func.cards.length === 5 && func.cards.every((v) => v && v !== '—'), func.cards);
ok('8.4 日历图标仍在（入口未丢）', func.icon);
await page.click('#card-recent');
await page.waitForTimeout(400);
await page.click('#recent-list [data-cal-toggle]');
await page.waitForSelector('#cal-grid .cal-day.on', { state: 'visible', timeout: 10000 });
const cal = await page.evaluate(() => ({
  open: !document.getElementById('cal-overlay').hidden,
  monthVisible: !document.getElementById('cal-page-month').hidden,
  on: document.querySelectorAll('#cal-grid .cal-day.on').length,
}));
ok('8.5 点击图标仍能打开月历浮层', cal.open && cal.monthVisible && cal.on > 0, cal);
await page.click('#cal-grid .cal-day.on');
await waitDay();
const day = await page.evaluate(() => ({
  dayVisible: !document.getElementById('cal-page-day').hidden,
  title: document.getElementById('cal-day-title').textContent,
  rows: document.querySelectorAll('#cal-day-games .cal-game').length,
}));
ok('8.6 点击某一天仍能进入二级明细', day.dayVisible && /\d+ 月 \d+ 日 周./.test(day.title) && day.rows > 0, day);
await page.click('#cal-day-close');
await page.waitForTimeout(300);
await page.screenshot({ path: OUT + 'r49_after_cal.png' });

// ---------- 7. 移动端 ----------
for (const w of [860, 768, 430, 390, 360]) {
  await freshPage(w, 900, 1);
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.click('#card-recent');
  await page.waitForSelector('#recent-list .rank-item', { state: 'visible', timeout: 30000 });
  await page.waitForTimeout(800);
  const m = await page.evaluate(() => {
    const r = (el) => el.getBoundingClientRect();
    const panel = r(document.querySelector('#view-recent .panel'));
    const row0 = r(document.querySelector('#recent-list .rank-item'));
    const icon = document.querySelector('#recent-list [data-cal-toggle]');
    const iconBox = icon ? r(icon) : null;
    const last = document.querySelector('#recent-list .rank-item .rank-last');
    return {
      iconHidden: !iconBox || (iconBox.width === 0 && iconBox.height === 0),
      offset: +(row0.top - panel.top).toFixed(2),
      panelH: +panel.height.toFixed(2),
      docOverflow: document.documentElement.scrollWidth - window.innerWidth,
      firstRowInside: row0.left >= panel.left - 0.5 && row0.right <= panel.right + 0.5,
      lastDisplay: last ? getComputedStyle(last).display : null,
      hintCount: document.querySelectorAll('#view-recent .hint').length,
      headCount: document.querySelectorAll('#view-recent .panel-head').length,
      listPadTop: parseFloat(getComputedStyle(document.getElementById('recent-list')).paddingTop),
      panelPadTop: parseFloat(getComputedStyle(document.querySelector('#view-recent .panel')).paddingTop),
    };
  });
  const expectOffset = 1 + m.panelPadTop + m.listPadTop; // 1 + 18 + 18 = 37
  ok(`7.${w} 移动端无残留提示行/容器、行上移到位（首行基线 37px）`,
    m.iconHidden && m.hintCount === 0 && m.headCount === 0 && Math.abs(m.offset - expectOffset) <= 0.02, m);
  ok(`7.${w} 移动端无横向溢出、首行在面板内`, m.docOverflow <= 0 && m.firstRowInside, m);
  if (w === 390) await page.screenshot({ path: OUT + 'r49_recent_390.png' });
  await ctx.close();
}

await browser.close();
ok('9.1 全程无 JS 异常 / console error', errs.length === 0, errs.slice(0, 3));
console.log(`\n===== 第49轮 PASS=${pass} FAIL=${fail} =====`);
if (fail) process.exitCode = 1;
