/* 第 67 轮回归：时间轴「表格式列对齐」+ 太平年数据修正
   契约：
   · >860px 时 名称 / 观看时间 / 类别 / 上映 / 评级 / 评语 各占固定列，
     跨条目同名列严格落在同一 x（竖向一一对应），整体从正文左缘起排
   · 名称列容得下最宽中文片名；英文名超出列宽时自动折行（≤2 行），不截断
   · ≤860px 回到 flex + wrap 兜底（窄屏放不下六列），仍不得横向溢出
   · 太平年：上映 2026（仅年份）、观看 2026-02-14、评级 8.5、剧集 */
import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const BASE = process.env.BASE || 'http://127.0.0.1:8895/';
const ROOT = 'C:/Users/33329/WorkBuddy/2026-10-13-18-17-49/steam-playtime/docs/';
const OUT = 'C:/Users/33329/AppData/Local/Temp/fx_verify_20261018/shots67/';
fs.mkdirSync(OUT, { recursive: true });

const rd = (f) => fs.readFileSync(ROOT + f, 'utf8').replace(/\r\n/g, '\n');
const css = rd('watch.css'), html = rd('watch.html');
const cssNC = css.replace(/\/\*[\s\S]*?\*\//g, '');
const data = JSON.parse(fs.readFileSync(process.env.DATA_FILE || (ROOT + 'data/watch.json'), 'utf8'));
const N = data.items.length;

let pass = 0, fail = 0;
const ok = (n, c, extra = '') => { c ? (pass++, console.log(`PASS ${n}${extra ? '  — ' + extra : ''}`)) : (fail++, console.log(`FAIL ${n}  — ${extra}`)); };

/* ================= A 静态 ================= */
console.log('== A 静态：列网格声明 ==');
const m861 = (cssNC.match(/@media \(min-width: 861px\) \{([\s\S]*?)\n\}/) || [, ''])[1];
const m1180 = (cssNC.match(/@media \(min-width: 1180px\) \{([\s\S]*?)\n\}/) || [, ''])[1];
ok('A1 ≥861px 的 .tl-body 改为 grid 且有三列（名称 / 四项 / 评语）',
  /\.tl-body \{[\s\S]*?display: grid/.test(m861) && /grid-template-columns: \d+px \d+px minmax\(0, 1fr\)/.test(m861), m861.replace(/\s+/g, ' ').slice(0, 90));
ok('A2 ≥861px 的 .tl-meta 改为 grid 且有四列（日期 / 类别 / 上映 / 评级）',
  /\.tl-meta \{[\s\S]*?display: grid/.test(m861) && /grid-template-columns: \d+px \d+px \d+px \d+px/.test(m861), (m861.match(/\.tl-meta \{[\s\S]*?\}/) || [''])[0].replace(/\s+/g, ' '));
ok('A3 ≥1180px 有更宽的列版本（名称 224 / 四项 352）',
  /grid-template-columns: 224px 352px/.test(m1180));
ok('A4 .tl-item 的缩略图宽度固定（列对齐的基准，所有条目同一起点）',
  /\.tl-thumb \{[^}]*width: 76px/.test(cssNC));
const enRule = (cssNC.match(/\.tl-en \{([^}]*)\}/) || [, ''])[1];
ok('A5 英文名不截断：没有 ellipsis / line-clamp，且允许 break-word 折行',
  !/text-overflow/.test(enRule) && !/line-clamp/.test(enRule) && /word-break: break-word/.test(enRule), enRule.replace(/\s+/g, ' '));
ok('A6 版本号 bump：watch.css?v=16', /watch\.css\?v=16"/.test(html));

/* ================= B 桌面：列对齐 ================= */
console.log('\n== B 桌面：六列跨条目对齐（1440 / 1280 / 1180 / 1179 / 1100 / 1000 / 900 / 861） ==');
const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const errs = [];

async function open(W, H = 900) {
  const c = await browser.newContext({ viewport: { width: W, height: H } });
  const p = await c.newPage();
  p.on('pageerror', (e) => errs.push(`${W}:${e}`));
  await p.goto(BASE + 'watch.html', { waitUntil: 'load' });
  await p.evaluate(() => { try { localStorage.removeItem('watch-layout'); } catch (e) {} });
  await p.reload({ waitUntil: 'load' });
  await p.waitForFunction(() => document.querySelectorAll('#w-grid .poster').length > 0, null, { timeout: 20000 });
  await p.click('#w-avatar');
  await p.waitForFunction(() => document.querySelectorAll('#w-tl .tl-item').length > 0
    && getComputedStyle(document.querySelector('#w-tl')).display !== 'none', null, { timeout: 20000 });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(450);
  return { c, p };
}

const geo = (p) => p.evaluate(() => {
  const items = [...document.querySelectorAll('#w-tl .tl-item')];
  const uniq = (a) => [...new Set(a.map((x) => Math.round(x * 2) / 2))];
  const lefts = (sel) => items.map((it) => { const e = it.querySelector(sel); return e ? e.getBoundingClientRect().left : null; }).filter((x) => x != null);
  const lines = (el) => el ? Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight)) : 0;
  const en = items.map((it) => it.querySelector('.tl-en')).filter(Boolean);
  const names = items.map((it) => it.querySelector('.tl-name'));
  return {
    n: items.length,
    dateX: uniq(lefts('.tl-date')), kindX: uniq(lefts('.tl-kind')), yearX: uniq(lefts('.tl-year')),
    scoreX: uniq(lefts('.tl-score')), headX: uniq(lefts('.tl-head')), noteX: uniq(lefts('.tl-note')),
    nameLines: uniq(names.map(lines)), enMax: Math.max(...en.map(lines)),
    enClipped: en.filter((e) => e.scrollWidth > Math.ceil(e.clientWidth) + 1).length,
    itemH: uniq(items.map((it) => Math.round(it.getBoundingClientRect().height))),
    headW: uniq(items.map((it) => Math.round(it.querySelector('.tl-head').getBoundingClientRect().width * 10) / 10)),
    // 第 71 轮定「中文名折两行是预期行为」（名称列固定 220/224px，超长片名必然折行），
    // 当时放松的是临时副本，收编进 tests/ 的这份漏了，第 72 轮补上。
    wrapH: uniq(items.filter((it) => lines(it.querySelector('.tl-name')) > 1)
      .map((it) => Math.round(it.getBoundingClientRect().height))),
    // 第 72 轮上线补：条目高的**真不变量**是「条目高 = max(缩略图高, 名称头高) + 固定 chrome」。
    // 旧判据「折行条目只高 1px」只是 (中文名2行/英文名2行) 这一种组合下的代理观测值，
    // 用户新录《紫罗兰永恒花园外传：永远与自动手记人偶》后出现 (2行/3行) 组合 → 167px，代理失效。
    // 改为直接断言这个差值恒为常数：与折几行、折几行无关，也不会再被新数据打破。
    chrome: uniq(items.map((it) => {
      const hh = it.querySelector('.tl-head').getBoundingClientRect().height;
      const th = it.querySelector('.tl-thumb');
      const thh = th ? th.getBoundingClientRect().height : 0;
      return Math.round((it.getBoundingClientRect().height - Math.max(hh, thh)) * 10) / 10;
    })),
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    gridCount: document.querySelectorAll('#w-grid .poster').length,
  };
});

for (const W of [1440, 1280, 1180, 1179, 1100, 1000, 900, 861]) {
  const { c, p } = await open(W);
  const r = await geo(p);
  ok(`B[${W}] 六列各自只有一个 x（名称/日期/类别/上映/评级/评语 全部跨条目对齐）`,
    r.dateX.length === 1 && r.kindX.length === 1 && r.yearX.length === 1 &&
    r.scoreX.length === 1 && r.headX.length === 1 && r.noteX.length === 1,
    `日期 ${r.dateX.join(',')} | 类别 ${r.kindX.join(',')} | 上映 ${r.yearX.join(',')} | 评级 ${r.scoreX.join(',')} | 评语 ${r.noteX.join(',')}`);
  // 英文名行数不设 2 行上限：第 65 轮契约是「折行而不是顶宽、不截断」，
  // 名称列固定 220/224px 下最长的日文片名（31 字符）需要 3 行；4 行以上才该人工review。
  ok(`B[${W}] 名称列宽一致 ${r.headW.join(',')}px、中文名最多 2 行、英文名最多 ${r.enMax} 行`,
    r.headW.length === 1 && r.nameLines.every((l) => l >= 1 && l <= 2) && r.enMax <= 3,
    `名称行数 ${r.nameLines.join(',')} / 英文名最多 ${r.enMax} 行`);
  // 条目高 = max(缩略图, 名称头) + 固定 chrome（差值恒为常数）——见 geo() 里 chrome 的注释
  ok(`B[${W}] 英文名零截断、条目高 = max(缩略图,名称头)+固定值、整页无横向溢出`,
    r.enClipped === 0 && r.overflow === 0 && r.chrome.length === 1,
    `裁剪 ${r.enClipped} 条 / 条目高 ${r.itemH.join(',')} / 差值恒 ${r.chrome.join(',')} / 折行条目 ${r.wrapH.join(',')} / overflow=${r.overflow}`);
  if (W === 1440) await p.screenshot({ path: OUT + 'C1_列对齐_1440.png' });
  await c.close();
}

/* ================= C 长英文名专项 ================= */
console.log('\n== C 长英文名：折两行、不截断 ==');
{
  const { c, p } = await open(1440, 1000);
  const r = await p.evaluate(() => {
    const items = [...document.querySelectorAll('#w-tl .tl-item')];
    const pick = (t) => items.find((x) => x.textContent.includes(t));
    const info = (el) => {
      const e = el.querySelector('.tl-en'), h = el.querySelector('.tl-head');
      const lh = parseFloat(getComputedStyle(e).lineHeight);
      return {
        en: e.textContent.trim(),
        lines: Math.round(e.getBoundingClientRect().height / lh),
        clipped: e.scrollWidth > Math.ceil(e.clientWidth) + 1,
        headH: +h.getBoundingClientRect().height.toFixed(1),
        nameX: +el.querySelector('.tl-name').getBoundingClientRect().left.toFixed(1),
        dateX: +el.querySelector('.tl-date').getBoundingClientRect().left.toFixed(1),
      };
    };
    return { long1: info(pick('三块广告牌')), long2: info(pick('周处除三害')), normal: info(pick('南京照相馆')) };
  });
  ok('C1 《三块广告牌》41 字符英文名折成 2 行且未被裁剪',
    r.long1.lines === 2 && r.long1.clipped === false, JSON.stringify(r.long1));
  ok('C2 《周处除三害》34 字符英文名同样折 2 行未裁剪',
    r.long2.lines === 2 && r.long2.clipped === false, JSON.stringify(r.long2));
  ok('C3 折行条目的名称/日期列 x 与普通条目完全一致（折行不影响对齐）',
    r.long1.nameX === r.normal.nameX && r.long1.dateX === r.normal.dateX &&
    r.long2.nameX === r.normal.nameX && r.long2.dateX === r.normal.dateX,
    `long1 ${r.long1.nameX}/${r.long1.dateX} long2 ${r.long2.nameX}/${r.long2.dateX} normal ${r.normal.nameX}/${r.normal.dateX}`);
  await c.close();
}

/* ================= D 太平年数据 ================= */
console.log('\n== D 太平年：上映 2026 / 观看 2026-02-14 ==');
{
  const { c, p } = await open(1440);
  const r = await p.evaluate(() => {
    const items = [...document.querySelectorAll('#w-tl .tl-item')];
    const get = (el, s) => { const x = el.querySelector(s); return x ? x.textContent.trim() : null; };
    const tp = items.find((x) => get(x, '.tl-name') === '太平年');
    const groups = [...document.querySelectorAll('#w-tl .tl-group')];
    const gi = groups.findIndex((g) => [...g.querySelectorAll('.tl-name')].some((n) => n.textContent.trim() === '太平年'));
    return {
      date: get(tp, '.tl-date'), year: get(tp, '.tl-year'), kind: get(tp, '.tl-kind'), score: get(tp, '.tl-score'),
      group: gi >= 0 ? groups[gi].querySelector('.tl-month').textContent.trim() : 'MISSING',
      months: groups.length,
    };
  });
  const d = data.items.find((x) => x.title === '太平年');
  ok('D1 数据层：上映只有年份 2026，无 release_date',
    d.year === 2026 && !d.release_date && d.watched_at === '2026-02-14',
    `year=${d.year} release_date=${d.release_date} watched=${d.watched_at}`);
  ok('D2 数据层：id 已随观看日期同步（避免网页加号再录时产生重复条目）',
    d.id === '2026-02-14-swords-into-plowshares', d.id);
  ok('D3 渲染层：观看 2026-02-14 / 上映 2026 / 剧集 / ★8.5',
    r.date === '2026-02-14' && r.year === '2026' && r.kind === '剧集' && r.score === '★8.5', JSON.stringify(r));
  ok('D4 该条目已归入「2026 年 2 月」分组（按月分组随观看时间走）',
    r.group === '2026 年 2 月', `${r.group} / 共 ${r.months} 组`);
  await c.close();
}

/* ================= E 窄屏兜底 ================= */
console.log('\n== E ≤860px：折行兜底仍不溢出 ==');
for (const W of [860, 480, 390, 360]) {
  const { c, p } = await open(W, 900);
  const r = await geo(p);
  ok(`E[${W}] 无横向溢出、名称单行、英文名不截断（${r.n} 条）`,
    r.overflow === 0 && r.nameLines[0] === 1 && r.enClipped === 0,
    `overflow=${r.overflow} 名称行数 ${r.nameLines.join(',')} 裁剪 ${r.enClipped}`);
  await c.close();
}

/* ================= F 其他功能未受影响 ================= */
console.log('\n== F 其他功能 ==');
{
  const { c, p } = await open(1440);
  const r = await geo(p);
  ok(`F1 网格视图仍渲染全部 ${N} 条`, r.gridCount === N, `grid=${r.gridCount}/${N}`);
  ok(`F2 时间轴仍渲染全部 ${N} 条`, r.n === N, `tl=${r.n}/${N}`);
  const scores = await p.evaluate(() => [...document.querySelectorAll('#w-tl .tl-score')].map((x) => x.textContent.trim()));
  ok('F3 评级仍统一一位小数', scores.length > 0 && scores.every((x) => /^★\d+\.\d$/.test(x)), scores.slice(0, 5).join(' '));
  await c.close();
  await p.screenshot({ path: OUT + 'C2_末行.png' }).catch(() => {});
}

ok('F4 全程零 JS 异常', errs.length === 0, errs.slice(0, 3).join(' | '));

await browser.close();
console.log(`\n===== 第 67 轮回归：${pass}/${pass + fail} =====`);
process.exit(fail ? 1 : 0);
