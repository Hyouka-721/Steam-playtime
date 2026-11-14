/* 第 90 轮 watch 侧回归：「★和金色评分数字移到影视剧名称旁边，保持一定空格」
 *
 * 这是**结构迁移**，不是样式微调：评分从 .poster-pic 内（absolute right/bottom 8px）
 * 搬进 .poster-head，成为片名后的第二个 flex 子项。本套件正面守四件事：
 *   ① 位置与 DOM 顺序（全库 124 张逐张验，不是抽第一张）
 *   ② 「一定空格」是可量化的稳定值：标题行 gap 8px + 评分 margin-left 4px = 12px，
 *      且不受片名长短、省略号、评分位数（9.9 / 10.0）影响
 *   ③ 隔离：时间轴 .tl-score 一个都不许被牵动；零填充 / ★ / 金色 / 暗晕全部保留
 *   ④ 版面没被撑坏：同排短评仍对齐、≥861 日期同排、≤480 日期独占第二行右对齐
 *
 * ⚠️ 旧的位置契约由 verify66 / verify85_watch / verify89_watch 按需求变更**改判**，
 *    这里不重复它们的零填充与字阶断言，只补新契约。
 * ⚠️ 条数一律从 data/watch.json 的 items 推导（顶层是对象，不是数组）。
 */
import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const BASE = 'http://127.0.0.1:8895/';
const ROOT = 'C:/Users/33329/WorkBuddy/2026-10-13-18-17-49/steam-playtime/docs/';
const stripCmt = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const norm = (s) => s.replace(/\r\n/g, '\n');
const css = stripCmt(norm(fs.readFileSync(ROOT + 'watch.css', 'utf8')));
const js = stripCmt(norm(fs.readFileSync(ROOT + 'watch.js', 'utf8')));
const html = fs.readFileSync(ROOT + 'watch.html', 'utf8');
const data = JSON.parse(norm(fs.readFileSync(ROOT + 'data/watch.json', 'utf8')));
const N = data.items.length;
const N_RATED = data.items.filter((x) => Number(x.rating) > 0).length;

const rule = (sel, scope = css) => {
  const esc = sel.replace(/\./g, '\\.').replace(/:/g, '\\:').replace(/ /g, '\\s+');
  const m = scope.match(new RegExp(esc + '\\s*\\{([^}]*)\\}'));
  return m ? m[1].replace(/\s+/g, ' ') : '';
};
const i480 = css.indexOf('@media (max-width: 480px)');
const nextMedia = css.indexOf('@media', i480 + 10);
const b480 = css.slice(i480, nextMedia > 0 ? nextMedia : css.length);

let pass = 0, fail = 0;
const ok = (n, c, extra = '') => {
  c ? (pass++, console.log(`PASS ${n}${extra ? '  — ' + extra : ''}`))
    : (fail++, console.log(`FAIL ${n}  — ${extra}`));
};

/* ---------- A 静态契约 ---------- */
console.log('== A 静态契约 ==');
ok('A1 watch.html 引用 watch.css?v=37 / watch.js?v=29（同时改了样式与渲染，两条都 bump）',
  /watch\.css\?v=37/.test(html) && /watch\.js\?v=29/.test(html),
  (html.match(/watch\.(css|js)\?v=\d+/g) || []).join(' '));

const gStart = js.indexOf('function renderGrid(');
const gEnd = js.indexOf('function renderTimeline(');
const gridFn = js.slice(gStart, gEnd);
const iPic = gridFn.indexOf('\'<div class="poster-pic">\'');
const iPicEnd = gridFn.indexOf('\'<div class="poster-head">\'');
const iName = gridFn.indexOf('\'<h3 class="poster-name">\'');
const iScore = gridFn.indexOf('scoreHtml(it.rating)');
const iDate = gridFn.indexOf('\'<span class="poster-date">\'');
ok('A2 renderGrid：评分已出海报、进标题行，且严格排在片名之后 / 日期之前',
  gStart > 0 && gEnd > gStart && iPic > 0 && iPicEnd > iPic &&
  !gridFn.slice(iPic, iPicEnd).includes('scoreHtml') &&
  iName > iPicEnd && iScore > iName && iScore < iDate,
  `pic=${iPic} head=${iPicEnd} name=${iName} score=${iScore} date=${iDate}`);

ok('A3 scoreHtml 未动：★ + 一位小数 + cls 参数，时间轴仍用 tl-score',
  /function scoreHtml\(r, cls\)/.test(js) && /<i>★<\/i>/.test(js) && /n\.toFixed\(1\)/.test(js) &&
  /scoreHtml\(it\.rating, 'tl-score'\)/.test(js) && /\(cls \|\| 'poster-score'\)/.test(js));

const sc = rule('.poster-score');
ok('A4 .poster-score 静态流入标题行：flex 0 0 auto、无 absolute、margin-left 4px、padding 0、nowrap',
  /flex:\s*0 0 auto/.test(sc) && !/position:\s*absolute/.test(sc) && !/\bright:\s*8px/.test(sc) &&
  /margin-left:\s*4px/.test(sc) && /padding:\s*0/.test(sc) && /white-space:\s*nowrap/.test(sc),
  sc.slice(0, 150));

ok('A5 空格是布局而非裸字符：标题行 gap 8px + 片名只缩不涨 + 日期 auto 外边距贴右',
  /gap:\s*8px/.test(rule('.poster-head')) && /flex:\s*0 1 auto/.test(rule('.poster-name')) &&
  /margin-left:\s*auto/.test(rule('.poster-date')),
  `head=${rule('.poster-head').slice(0, 60)}`);

ok('A6 ≤480 断点：标题行 wrap、row-gap 2px、日期独占第二行右对齐且仍 11px',
  i480 > 0 && /flex-wrap:\s*wrap/.test(rule('.poster-head', b480)) &&
  /gap:\s*2px 8px/.test(rule('.poster-head', b480)) &&
  /flex:\s*1 1 100%/.test(rule('.poster-date', b480)) &&
  /text-align:\s*right/.test(rule('.poster-date', b480)) &&
  /font-size:\s*11px/.test(rule('.poster-date', b480)));

ok('A7 零填充未被迁移带坏：本体无 background / box-shadow / filter，CSS 无角标伪元素',
  !/background|box-shadow|filter:/.test(sc) && !/\.poster-score\s*::\s*(before|after)/.test(css) &&
  /text-shadow:/.test(sc));

/* ---------- 运行时 ---------- */
const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const open = async (W, H) => {
  const c = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, serviceWorkers: 'block' });
  const p = await c.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e)));
  await p.goto(BASE + 'watch.html?t=' + Date.now(), { waitUntil: 'load' });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForFunction(() => document.querySelectorAll('#w-grid .poster').length > 20, null, { timeout: 30000 }).catch(() => {});
  await p.waitForTimeout(500);
  return { c, p, errs };
};

const MEASURE = () => {
  const cards = [...document.querySelectorAll('#w-grid .poster')];
  const R = (e) => (e ? e.getBoundingClientRect() : null);
  const rows = cards.map((c) => {
    const hd = c.querySelector('.poster-head'), nm = c.querySelector('.poster-name');
    const s = c.querySelector('.poster-score'), dt = c.querySelector('.poster-date');
    const pc = c.querySelector('.poster-pic'), nt = c.querySelector('.poster-note');
    const cr = R(c), hr = R(hd), nr = R(nm), sr = R(s), dr = R(dt);
    return {
      order: hd ? [...hd.children].map((x) => x.className).join(',') : '',
      inPic: pc ? pc.querySelector('.poster-score') !== null : null,
      picKids: pc ? pc.children.length : null,
      gap: sr && nr ? +(sr.left - nr.right).toFixed(2) : null,
      inHead: sr && hr ? (sr.right <= hr.right + .6 && sr.bottom <= hr.bottom + .6 &&
        sr.left >= hr.left - .6 && sr.top >= hr.top - .6) : null,
      scoreSameRow: sr && nr ? Math.abs(sr.top - nr.top) <= 2 : null,
      noOverlap: sr && dr ? sr.right <= dr.left + .6 : null,
      dateRight: cr && dr ? +(cr.right - dr.right).toFixed(2) : null,
      dateBelow: nr && dr ? dr.top >= nr.bottom - 2 : null,
      headH: hr ? +hr.height.toFixed(2) : null,
      nameH: nr ? +nr.height.toFixed(2) : null,
      scoreH: sr ? +sr.height.toFixed(2) : null,
      nameLines: nr ? +(nr.height / parseFloat(getComputedStyle(nm).lineHeight)).toFixed(2) : null,
      text: s ? s.textContent.trim() : null,
      star: s ? !!s.querySelector('i') : null,
      noteTop: nt && R(nt).height > 0 ? +R(nt).top.toFixed(2) : null,
      cardTop: +cr.top.toFixed(1),
    };
  });
  const firstRow = rows.filter((r) => r.cardTop === rows[0].cardTop);
  const noteTops = firstRow.map((r) => r.noteTop).filter((x) => x != null);
  return {
    n: rows.length, rows,
    gaps: rows.map((r) => r.gap),
    noteSpread: noteTops.length ? +(Math.max(...noteTops) - Math.min(...noteTops)).toFixed(2) : null,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  };
};
const spread = (a) => +(Math.max(...a) - Math.min(...a)).toFixed(2);

console.log('== B 1440 运行时（全库逐张） ==');
const { c, p, errs } = await open(1440, 1000);
const rt = await p.evaluate(MEASURE);
ok('B1 卡片数 = watch.json 的 items 条数（' + N + '）', rt.n === N, `${rt.n}/${N}`);
ok('B2 全库 DOM 顺序恒为 name→score→date，海报内零评分且只剩 img',
  rt.rows.every((r) => r.order === 'poster-name,poster-score,poster-date' && !r.inPic && r.picKids === 1),
  `异类 ${rt.rows.filter((r) => r.order !== 'poster-name,poster-score,poster-date' || r.inPic || r.picKids !== 1).length} 张`);
ok('B3 「一定空格」= 全库恒 12px（gap 8 + margin 4），极差 ≤0.6px，不受片名/评分位数影响',
  spread(rt.gaps) <= 0.6 && Math.abs(rt.gaps.reduce((a, b) => a + b, 0) / rt.n - 12) <= 0.6,
  `min=${Math.min(...rt.gaps)} max=${Math.max(...rt.gaps)} 极差=${spread(rt.gaps)}`);
ok('B4 全库评分完整落在标题行内，且与日期不重叠',
  rt.rows.every((r) => r.inHead && r.noOverlap),
  `越界 ${rt.rows.filter((r) => !r.inHead).length} / 重叠 ${rt.rows.filter((r) => !r.noOverlap).length}`);
ok('B5 全库日期仍贴卡片右边缘（≤1.5px）',
  rt.rows.every((r) => r.dateRight <= 1.5), `最大偏离 ${Math.max(...rt.rows.map((r) => r.dateRight))}`);
ok('B6 ★ 与金色一位小数都在（全库 /^★\\d+\\.\\d$/，且 i 元素存在）',
  rt.rows.every((r) => /^★\d+\.\d$/.test(r.text) && r.star),
  rt.rows.slice(0, 4).map((r) => r.text).join(' '));
const starFs = await p.evaluate(() => getComputedStyle(document.querySelector('.poster-score i')).fontSize);
ok('B6b ★ 仍是 9px（第 85→89 轮的字阶未被迁移顺手改掉）', starFs === '9px', starFs);
ok('B7 版面未被撑坏：同排短评起始位极差 ≤0.5px、全库标题行等高、评分不高于片名行',
  rt.noteSpread !== null && rt.noteSpread <= 0.5 && spread(rt.rows.map((r) => r.headH)) <= 0.6 &&
  rt.rows.every((r) => r.scoreH <= r.nameH + 1),
  `短评极差 ${rt.noteSpread} / headH 极差 ${spread(rt.rows.map((r) => r.headH))} / headH ${rt.rows[0].headH}`);

/* hover 只换字色，不许把评分挪走或画回底盘 */
const firstCard = p.locator('#w-grid .poster').first();
await firstCard.hover();
await p.waitForTimeout(400);
const hov = await p.evaluate(() => {
  const card = document.querySelector('#w-grid .poster');
  const nm = card.querySelector('.poster-name'), s = card.querySelector('.poster-score');
  const r = s.getBoundingClientRect(), nr = nm.getBoundingClientRect(), cs = getComputedStyle(s);
  return { gap: +(r.left - nr.right).toFixed(2), color: cs.color, bg: cs.backgroundColor, shadow: cs.boxShadow };
});
ok('B8 hover 点亮字色，但间距不变、仍零背景（不位移、不画盘）',
  Math.abs(hov.gap - 12) <= 0.6 && hov.color === 'rgb(232, 176, 75)' &&
  /rgba\(0,\s*0,\s*0,\s*0\)|transparent/.test(hov.bg) && hov.shadow === 'none',
  `gap=${hov.gap} ${hov.color} bg=${hov.bg}`);

/* 时间轴隔离：切视图后 .tl-score 仍原样，且没被网格的 .poster-score 污染 */
await p.mouse.move(1, 1);
await p.click('#w-avatar');
await p.waitForFunction(() => document.querySelectorAll('#w-tl .tl-item').length > 0 &&
  getComputedStyle(document.querySelector('#w-tl')).display !== 'none', null, { timeout: 15000 });
const tl = await p.evaluate(() => {
  const all = [...document.querySelectorAll('#w-tl .tl-score')];
  return {
    n: all.length,
    inMeta: all.every((x) => x.parentElement.classList.contains('tl-meta')),
    noPosterScore: document.querySelectorAll('#w-tl .poster-score').length,
    color: all.length ? getComputedStyle(all[0]).color : null,
    star: all.length ? !!all[0].querySelector('i') : null,
  };
});
ok('B9 时间轴隔离：tl-score 条数 = 有评分条数（' + N_RATED + '）、父容器仍是 tl-meta、无 poster-score 混入',
  tl.n === N_RATED && tl.inMeta && tl.noPosterScore === 0 && tl.star,
  `n=${tl.n} inMeta=${tl.inMeta} 混入=${tl.noPosterScore} color=${tl.color}`);
ok('B10 1440 无横向溢出 + 零 JS 异常', rt.overflow === 0 && errs.length === 0,
  `ov=${rt.overflow} err=${errs.length}`);
await c.close();

console.log('== C 390 运行时（日期换行的那档） ==');
const mob = await open(390, 844);
const m = await mob.p.evaluate(MEASURE);
ok('C1 390 下全库仍是 12px 空格、评分在标题行内、日期独占第二行且右对齐',
  spread(m.gaps) <= 0.6 && Math.abs(m.gaps.reduce((a, b) => a + b, 0) / m.n - 12) <= 0.6 &&
  m.rows.every((r) => r.inHead && r.dateBelow && r.dateRight <= 1.5 && !r.inPic),
  `gap ${Math.min(...m.gaps)}~${Math.max(...m.gaps)} / 第二行 ${m.rows.filter((r) => r.dateBelow).length}/${m.n}`);
/* ⚠️ 这里不要求「全库等高」：第 85 轮起窄屏本来就有 16 张片名折两行（两行 clamp），
   headH 自然是 37.1 / 54.7 两档，差正好一个行高 17.6px。真正该守的是
   「评分与片名严格同排」——flex-wrap 下长片名曾把评分挤到第二行，那条才是真 bug。 */
const hBands = [...new Set(m.rows.map((r) => +r.headH.toFixed(0)))].sort((a, b) => a - b);
ok('C2 窄屏评分与片名严格同排（顶边差 ≤2px）、两行 clamp 仍生效、标题行高度只按片名行数分两档',
  m.rows.every((r) => r.scoreSameRow && r.gap >= 8) &&
  m.rows.some((r) => r.nameLines > 1.5) && hBands.length === 2 &&
  hBands[1] - hBands[0] >= 16 && hBands[1] - hBands[0] <= 19,
  `同排 ${m.rows.filter((r) => r.scoreSameRow).length}/${m.n} / 折两行 ${m.rows.filter((r) => r.nameLines > 1.5).length} 张 / headH 档 ${hBands.join(',')}`);
ok('C3 390 无横向溢出 + 零 JS 异常', m.overflow === 0 && mob.errs.length === 0,
  `ov=${m.overflow} err=${mob.errs.length}`);
await mob.c.close();

console.log('== D 断点边界（480 换行 / 860 同排） ==');
for (const [W, expectBelow] of [[480, true], [860, false]]) {
  const v = await open(W, 900);
  const d = await v.p.evaluate(MEASURE);
  ok(`D[${W}] 间距仍 12px、日期${expectBelow ? '独占第二行' : '与片名同排'}、无溢出零异常`,
    spread(d.gaps) <= 0.6 && Math.abs(d.gaps.reduce((a, b) => a + b, 0) / d.n - 12) <= 0.6 &&
    d.rows.every((r) => r.dateBelow === expectBelow) && d.overflow === 0 && v.errs.length === 0,
    `gap ${Math.min(...d.gaps)}~${Math.max(...d.gaps)} / 第二行 ${d.rows.filter((r) => r.dateBelow).length}/${d.n} / ov=${d.overflow}`);
  await v.c.close();
}

await browser.close();
console.log(`\n===== 第 90 轮 watch（评分移入标题行）：${pass} PASS / ${fail} FAIL =====`);
process.exit(fail ? 1 : 0);
