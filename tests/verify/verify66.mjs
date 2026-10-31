/* 第 66 轮回归：六项需求逐条验收
   1 去掉标题 hover 的原生「回到页面顶部」提示
   2 太平年：评级 8.5 + 上映 2026-02-14
   3 删除海报左上角「电影 / 剧集」角标
   4 评分统一一位小数（9 → 9.0）
   5 士兵突击 / 赛博朋克：边缘行者 / 英雄联盟：双城之战 改为「剧集」
   6 网格视图不再显示上映年份、观看日期移到片名同排右侧、短评上移
   并回归「其他功能不受影响」：海报比例与列宽、筛选、视图切换、加号、首页版本号 */
import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const BASE = process.env.BASE || 'http://127.0.0.1:8895/';
const ROOT = 'C:/Users/33329/WorkBuddy/2026-10-13-18-17-49/steam-playtime/docs/';
const OUT = 'C:/Users/33329/AppData/Local/Temp/fx_verify_20261018/shots66/';
fs.mkdirSync(OUT, { recursive: true });

const rd = (f) => fs.readFileSync(ROOT + f, 'utf8').replace(/\r\n/g, '\n');
const css = rd('watch.css'), html = rd('watch.html'), js = rd('watch.js');
const cssNC = css.replace(/\/\*[\s\S]*?\*\//g, '');
// 预演模式：BASE 指向别的目录时，数据也从那儿读，避免「页面是 26 条、期望是 22 条」
const data = JSON.parse(fs.readFileSync(process.env.DATA_FILE || (ROOT + 'data/watch.json'), 'utf8').replace(/\r\n/g, '\n'));

let pass = 0, fail = 0;
const ok = (n, c, extra = '') => { c ? (pass++, console.log(`PASS ${n}${extra ? '  — ' + extra : ''}`)) : (fail++, console.log(`FAIL ${n}  — ${extra}`)); };

/* ================= A 静态 ================= */
console.log('== A 静态：源码与数据 ==');

const h1 = (html.match(/<h1[^>]*id="w-title"[^>]*>/) || [''])[0];
ok('A1 标题 <h1> 已无 title 属性（不会再弹原生悬停提示）', h1 && !/\stitle=/.test(h1), h1.replace(/\s+/g, ' '));
ok('A2 标题仍保留 role / tabindex / aria-label（无障碍与键盘行为不退化）',
  /role="button"/.test(h1) && /tabindex="0"/.test(h1) && /aria-label="回到页面顶部"/.test(h1));

ok('A3 删除「电影 / 剧集」角标：CSS 无 .poster-kind 规则', !/\.poster-kind\s*\{/.test(cssNC));
ok('A4 删除角标：JS 不再生成 .poster-kind 元素', !/poster-kind/.test(js));

ok('A5 网格卡片改用 .poster-head（片名 + 日期同排），旧的 .poster-sub 已退役',
  /poster-head/.test(js) && /poster-date/.test(js) && !/poster-sub/.test(js) && !/\.poster-sub\s*\{/.test(cssNC) && !/function subLine/.test(js));
ok('A6 .poster-head 是 flex 行、.poster-date 不换行靠右，片名可缩',
  /\.poster-head \{[^}]*display: flex/.test(cssNC) && /\.poster-date \{[^}]*white-space: nowrap/.test(cssNC) &&
  /\.poster-name \{[^}]*flex: 1 1 auto/s.test(cssNC));

ok('A7 评分格式改为 toFixed(1)（整数也带小数位）', /n\.toFixed\(1\)/.test(js) && !/n % 1 === 0/.test(js));
ok('A8 上映字段优先取 release_date，缺省回退 year',
  /function releaseText\(it\)/.test(js) && /it\.release_date/.test(js) && /releaseText\(it\)/.test(js));

ok('A9 版本号 bump：watch.css?v=23 / watch.js?v=16',
  /watch\.css\?v=23"/.test(html) && /watch\.js\?v=16"/.test(html));

/* -- 数据 -- */
const byTitle = (t) => data.items.filter((x) => x.title === t);
const tp = byTitle('太平年')[0] || {};
ok('A10 太平年：评级 8.5', tp.rating === 8.5, 'rating=' + tp.rating);
/* 第 67 轮：上映只到年份，完整日期改放到「观看时间」 */
ok('A11 太平年：上映只有年份 2026、无 release_date，观看时间 = 2026-02-14',
  tp.year === 2026 && !tp.release_date && tp.watched_at === '2026-02-14',
  `year=${tp.year} release_date=${tp.release_date} watched=${tp.watched_at}`);
ok('A12 太平年仍是剧集（未被误改）', tp.kind === 'series', tp.kind);

/* 第 73 轮：新增「番剧」类别（用户确认范围：仅日本动画）。
   赛博朋克：边缘行者是日本动画 → anime；士兵突击（真人剧）与
   英雄联盟：双城之战（美国动画）不在该范围，留在 series。 */
const three = ['士兵突击', '赛博朋克：边缘行者', '英雄联盟：双城之战'];
const kinds = three.map((t) => (byTitle(t)[0] || {}).kind);
ok('A13 三部：真人剧与欧美动画留 series、日本动画改进 anime',
  kinds[0] === 'series' && kinds[1] === 'anime' && kinds[2] === 'series',
  three.map((t, i) => `${t}=${kinds[i]}`).join(' / '));
const N = data.items.length;
const nSeries = data.items.filter(function (x) { return x.kind === 'series'; }).length;
const nAnime = data.items.filter(function (x) { return x.kind === 'anime'; }).length;
ok('A14 数据条数合理、无重复 id（' + N + ' 条）',
  N >= 22 && new Set(data.items.map(function (x) { return x.id; })).size === N,
  N + ' 条 / series ' + nSeries);
ok('A15 全库没有 0/负数/超 10 的评级', data.items.every((x) => x.rating == null || (x.rating > 0 && x.rating <= 10)),
  data.items.filter((x) => x.rating != null).map((x) => x.rating).join(','));

/* ================= 运行时 ================= */
const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const errs = [];

async function open(W, H) {
  const c = await browser.newContext({ viewport: { width: W, height: H } });
  const p = await c.newPage();
  p.on('pageerror', (e) => errs.push(`${W}:${e}`));
  p.on('console', (m) => { if (m.type() === 'error') errs.push(`${W}:console:${m.text().slice(0, 120)}`); });
  await p.goto(BASE + 'watch.html', { waitUntil: 'load' });
  await p.evaluate(() => { try { localStorage.removeItem('watch-layout'); localStorage.removeItem('watch-kind'); } catch (e) {} });
  await p.reload({ waitUntil: 'load' });
  await p.waitForFunction(() => document.querySelectorAll('#w-grid .poster').length > 0, null, { timeout: 20000 });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(400);
  return { c, p };
}

/* ---------- B 网格视图 ---------- */
console.log('\n== B 网格视图（六档） ==');
const gridStats = {};
for (const W of [1440, 1100, 860, 480, 390, 360]) {
  const { c, p } = await open(W, 900);
  const r = await p.evaluate(() => {
    const cards = [...document.querySelectorAll('#w-grid .poster')];
    const bad = [];
    let sameRow = 0, dateRight = 0, noteGap = 0, noteVisible = 0, dateText = 0, headKids = 0;
    for (const cd of cards) {
      const head = cd.querySelector('.poster-head');
      const nm = cd.querySelector('.poster-name');
      const dt = cd.querySelector('.poster-date');
      const nt = cd.querySelector('.poster-note');
      const pic = cd.querySelector('.poster-pic');
      if (!head || !nm || !dt) { bad.push('缺 head/name/date'); continue; }
      headKids += head.children.length;
      if (/^\d{4}-\d{2}-\d{2}$/.test(dt.textContent.trim())) dateText++;
      const cr = cd.getBoundingClientRect(), nr = nm.getBoundingClientRect(), dr = dt.getBoundingClientRect();
      // 同一排：日期纵向中心落在片名纵向区间内
      const cy = dr.top + dr.height / 2;
      if (cy >= nr.top - 1 && cy <= nr.bottom + 1) sameRow++;
      // 日期靠右：右边缘贴齐卡片右边缘，且不压住片名
      if (Math.abs(dr.right - cr.right) <= 1.5 && dr.left >= nr.left - 0.5) dateRight++;
      // 短评紧跟 head（中间没有别的行）
      if (nt && nt.getBoundingClientRect().height > 0) {   // ≤860px 短评 display:none，只算可见的
        const gap = nt.getBoundingClientRect().top - head.getBoundingClientRect().bottom;
        noteVisible++;
        if (gap >= 0 && gap <= 12) noteGap++;
        if (nt.parentElement !== cd || nt.previousElementSibling !== head) bad.push('短评未紧跟片名行');
      }
      // 海报内只剩 img + 评分角标
      if (pic.querySelector('.poster-kind')) bad.push('仍有 poster-kind');
      if (pic.children.length > 2) bad.push('海报内多出元素:' + pic.children.length);
    }
    const first = cards[0].getBoundingClientRect();
    const cols = cards.filter((x) => Math.abs(x.getBoundingClientRect().top - first.top) < 2).length;
    return {
      n: cards.length, cols, w: +first.width.toFixed(2), h: +cards[0].querySelector('.poster-pic').getBoundingClientRect().height.toFixed(2),
      bad: bad.slice(0, 3), sameRow, dateRight, noteGap, dateText, headKids,
      noteAll: cards.filter((x) => x.querySelector('.poster-note')).length, noteVisible,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      scores: cards.map((x) => { const s = x.querySelector('.poster-score'); return s ? s.textContent.trim() : null; }).filter(Boolean),
    };
  });
  gridStats[W] = r;

  ok(`B[${W}] 无「电影 / 剧集」角标、海报内只剩 2 个子元素`, r.bad.length === 0, r.bad.join(' | ') || 'ok');
  ok(`B[${W}] 全部 ${r.n} 张卡片：片名 + 观看日期同排且日期贴右`,
    r.sameRow === r.n && r.dateRight === r.n && r.dateText === r.n && r.headKids === r.n * 2,
    `同排 ${r.sameRow}/${r.n} 贴右 ${r.dateRight}/${r.n} 日期格式 ${r.dateText}/${r.n} head 子元素 ${r.headKids}`);
  ok(`B[${W}] 短评紧贴片名行（可见 ${r.noteVisible} 条，间隙 0~12px）`,
    r.noteVisible === r.noteGap,
    `可见 ${r.noteVisible} / 合格 ${r.noteGap}（全库 ${r.noteAll} 条，窄屏为 CSS 隐藏）`);
  ok(`B[${W}] 评分全部一位小数`,
    r.scores.length === 0 || r.scores.every((t) => /^★\d+\.\d$/.test(t)), r.scores.slice(0, 4).join(' ') || '（窄屏无评分卡）');
  ok(`B[${W}] 整页无横向溢出`, r.overflow === 0, `overflow=${r.overflow}`);
  await c.close();
}

ok('B[1440] 海报列宽与列数未被这次改动影响（5 列 / 267.19px）',
  gridStats[1440].cols === 5 && Math.abs(gridStats[1440].w - 267.19) <= 0.6,
  `cols=${gridStats[1440].cols} w=${gridStats[1440].w}`);
ok('B[1440] 海报仍是 2:3（高 = 宽 × 1.5）',
  Math.abs(gridStats[1440].h - gridStats[1440].w * 1.5) <= 1,
  `w=${gridStats[1440].w} h=${gridStats[1440].h}`);
ok('B[1440] 评分样例：9 显示为 9.0、8.5 仍为 8.5',
  gridStats[1440].scores.includes('★9.0') && gridStats[1440].scores.includes('★8.5'),
  gridStats[1440].scores.slice(0, 8).join(' '));

/* ---------- C 时间轴视图 ---------- */
console.log('\n== C 时间轴视图：上映 / 评级 / 分类 ==');
for (const W of [1440, 860, 390]) {
  const { c, p } = await open(W, 900);
  await p.click('#w-avatar');
  await p.waitForFunction(() => document.querySelectorAll('#w-tl .tl-item').length > 0
    && getComputedStyle(document.querySelector('#w-tl')).display !== 'none', null, { timeout: 15000 });
  await p.waitForTimeout(500);
  const r = await p.evaluate(() => {
    const items = [...document.querySelectorAll('#w-tl .tl-item')];
    const get = (el, s) => { const x = el.querySelector(s); return x ? x.textContent.trim() : null; };
    const find = (t) => items.find((x) => (get(x, '.tl-name') || '') === t);
    const tp = find('太平年');
    const three = ['士兵突击', '赛博朋克：边缘行者', '英雄联盟：双城之战'].map((t) => {
      const el = find(t); return el ? get(el, '.tl-kind') : 'MISSING';
    });
    const scores = items.map((x) => get(x, '.tl-score')).filter(Boolean);
    const worst = items.map((x) => { const b = x.querySelector('.tl-body'); return b.scrollWidth - Math.ceil(b.clientWidth); }).sort((a, b) => b - a)[0];
    return {
      n: items.length,
      tpRating: tp ? get(tp, '.tl-score') : 'MISSING',
      tpYear: tp ? get(tp, '.tl-year') : 'MISSING',
      tpKind: tp ? get(tp, '.tl-kind') : 'MISSING',
      tpDate: tp ? get(tp, '.tl-date') : 'MISSING',
      three, scores,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      worstBodyX: worst,
      monthLabels: document.querySelectorAll('#w-tl .tl-month').length,
    };
  });
  ok(`C[${W}] 太平年：评级 ★8.5 / 上映 2026 / 类别 剧集 / 观看 2026-02-14`,
    r.tpRating === '★8.5' && r.tpYear === '2026' && r.tpKind === '剧集' && r.tpDate === '2026-02-14',
    `${r.tpRating} | ${r.tpYear} | ${r.tpKind} | ${r.tpDate}`);
  // 第 73 轮：赛博朋克：边缘行者改归「番剧」，另两部仍显示「剧集」
  ok(`C[${W}] 三部在时间轴里显示「剧集 / 番剧 / 剧集」`,
    r.three[0] === '剧集' && r.three[1] === '番剧' && r.three[2] === '剧集', r.three.join(' / '));
  ok(`C[${W}] 时间轴评分全部一位小数`, r.scores.every((t) => /^★\d+\.\d$/.test(t)), r.scores.slice(0, 5).join(' '));
  ok(`C[${W}] 加了完整上映日期后仍无横向溢出`, r.overflow === 0 && r.worstBodyX <= 0,
    `overflow=${r.overflow} bodyX=${r.worstBodyX}`);
  await c.close();
}

/* ---------- D 筛选：三部剧集归位 ---------- */
console.log('\n== D 分类筛选 ==');
{
  const { c, p } = await open(1440, 900);
  const r = await p.evaluate(async () => {
    const click = (k) => document.querySelector(`.w-seg-btn[data-kind="${k}"]`).click();
    const names = () => [...document.querySelectorAll('#w-grid .poster-name')].map((x) => x.textContent.trim());
    click('series');
    await new Promise((r) => setTimeout(r, 120));
    const series = names();
    click('anime');
    await new Promise((r) => setTimeout(r, 120));
    const anime = names();
    click('movie');
    await new Promise((r) => setTimeout(r, 120));
    const movie = names();
    click('all');
    await new Promise((r) => setTimeout(r, 120));
    return { series, anime, movie, all: names(), sortOn: document.querySelector('.w-sort-btn.is-on').getAttribute('data-sort'), sortHidden: document.getElementById('w-sort').hidden };
  });
  const seriesSix = ['士兵突击', '英雄联盟：双城之战', '太平年', '漫长的季节', '越狱'];
  ok('D1 筛「剧集」共 ' + nSeries + ' 部，真人剧与欧美动画都在',
    r.series.length === nSeries && seriesSix.every((t) => r.series.includes(t)),
    `${r.series.length} 部：${r.series.join('、')}`);
  ok('D1b 筛「番剧」共 ' + nAnime + ' 部，日本动画都在（赛博朋克：边缘行者 / 冰菓）',
    r.anime.length === nAnime && r.anime.includes('赛博朋克：边缘行者') && r.anime.includes('冰菓'),
    `${r.anime.length} 部：${r.anime.join('、')}`);
  ok('D2 三部已不属于「电影」', ['士兵突击', '赛博朋克：边缘行者', '英雄联盟：双城之战'].every((t) => !r.movie.includes(t)),
    `电影 ${r.movie.length} 部`);
  // 第 72 轮：原「共 N 部」计数条已换成排序切换（.w-count 删除）；第 75 轮起默认评分序、网格视图可见
  ok('D3 排序切换在位（默认评分、网格视图可见）',
    r.sortOn === 'rating' && r.sortHidden === false && r.all.length === N &&
      r.movie.length === N - nSeries - nAnime,
    `sort=${r.sortOn} hidden=${r.sortHidden}`);
  await c.close();
}

/* ---------- E 标题交互（去掉提示 ≠ 去掉功能） ---------- */
console.log('\n== E 标题：无悬停提示、点击仍回顶 ==');
{
  const c = await browser.newContext({ viewport: { width: 1440, height: 700 } });
  const p = await c.newPage();
  p.on('pageerror', (e) => errs.push(`E:${e}`));
  await p.goto(BASE + 'watch.html', { waitUntil: 'load' });
  await p.waitForFunction(() => document.querySelectorAll('#w-grid .poster').length > 0, null, { timeout: 20000 });
  await p.waitForTimeout(400);
  const t = await p.evaluate(() => {
    const el = document.getElementById('w-title');
    return { hasTitle: el.hasAttribute('title'), titleVal: el.getAttribute('title'),
      label: el.getAttribute('aria-label'), cursor: getComputedStyle(el).cursor };
  });
  ok('E1 标题没有 title 属性（鼠标悬停不会再出现提示条）', t.hasTitle === false, JSON.stringify(t));
  ok('E2 仍是可点的按钮（cursor:pointer + aria-label）', t.cursor === 'pointer' && t.label === '回到页面顶部', t.cursor);
  await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await p.waitForTimeout(500);
  const bottom = await p.evaluate(() => window.scrollY);
  await p.click('#w-title');
  let top = bottom;
  for (let i = 0; i < 25; i++) { top = await p.evaluate(() => window.scrollY); if (top === 0) break; await p.waitForTimeout(120); }
  ok('E3 点击标题仍回到最顶端', bottom > 0 && top === 0, `scrollY ${bottom} → ${top}`);
  await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await p.waitForTimeout(400);
  await p.focus('#w-title');
  await p.keyboard.press('Enter');
  let top2 = 1;
  for (let i = 0; i < 25; i++) { top2 = await p.evaluate(() => window.scrollY); if (top2 === 0) break; await p.waitForTimeout(120); }
  ok('E4 键盘 Enter 仍能回顶', top2 === 0, `scrollY=${top2}`);
  await c.close();
}

/* ---------- F 其他功能不受影响 ---------- */
console.log('\n== F 其他功能不受影响 ==');
{
  const { c, p } = await open(1440, 900);
  const r1a = await p.evaluate(() => document.querySelectorAll('#w-grid .poster').length);
  await p.click('#w-avatar');
  await p.waitForTimeout(500);
  // paint() 一次只渲染一种视图 → 时间轴条目要在切过去之后才存在
  const r1b = await p.evaluate(() => document.querySelectorAll('#w-tl .tl-item').length);
  const r1 = { grid: r1a, tl: r1b };
  const r2 = await p.evaluate(() => ({ gridHidden: document.getElementById('w-grid').hidden, tlHidden: document.getElementById('w-tl').hidden, pressed: document.getElementById('w-avatar').getAttribute('aria-pressed') }));
  await p.click('#w-avatar');
  await p.waitForTimeout(500);
  const r3 = await p.evaluate(() => ({ gridHidden: document.getElementById('w-grid').hidden, tlHidden: document.getElementById('w-tl').hidden, pressed: document.getElementById('w-avatar').getAttribute('aria-pressed') }));
  ok('F1 史蒂夫仍能切换网格 ⇄ 时间轴',
    r2.gridHidden === true && r2.tlHidden === false && r2.pressed === 'true' &&
    r3.gridHidden === false && r3.tlHidden === true && r3.pressed === 'false',
    JSON.stringify([r2, r3]));
  ok('F2 两个视图都能渲染出全部 ' + N + ' 条', r1.grid === N && r1.tl === N, JSON.stringify(r1));

  const dlg = await p.evaluate(() => {
    document.getElementById('w-fab').click();
    const d = document.getElementById('w-add');
    const f = ['add-title', 'add-en', 'add-watched', 'add-kind', 'add-year', 'add-rating', 'add-note', 'add-poster'];
    return { open: !!d.open, missing: f.filter((id) => !document.getElementById(id)),
      ratingStep: (document.getElementById('add-rating') || {}).step };
  });
  ok('F3 加号表单仍完整（字段齐全、评分支持 0.5 步长）',
    dlg.open && dlg.missing.length === 0 && dlg.ratingStep === '0.5', JSON.stringify(dlg));
  await p.evaluate(() => document.getElementById('w-add').close());

  const idx = await p.evaluate(async (base) => {
    const h = await (await fetch(base + 'index.html', { cache: 'no-cache' })).text();
    return ['style.css?v=110', 'app.js?v=105', 'fx.js?v=16'].filter((v) => !h.includes(v));
  }, BASE);
  ok('F4 首页三个版本号未受影响', idx.length === 0, idx.join(',') || '全部命中');
  await c.close();
}

ok('F5 全程零 JS 异常 / console error', errs.length === 0, errs.slice(0, 3).join(' | '));

/* ---------- G 截图留档 ---------- */
const shot = async (W, H, name, tl) => {
  const c = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
  const p = await c.newPage();
  await p.goto(BASE + 'watch.html', { waitUntil: 'load' });
  await p.evaluate(() => { try { localStorage.removeItem('watch-layout'); } catch (e) {} });
  await p.reload({ waitUntil: 'load' });
  await p.waitForFunction(() => document.querySelectorAll('#w-grid .poster').length > 0, null, { timeout: 20000 });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(700);
  if (tl) {
    await p.click('#w-avatar');
    await p.waitForFunction(() => document.querySelectorAll('#w-tl .tl-item').length > 0
      && getComputedStyle(document.querySelector('#w-tl')).display !== 'none', null, { timeout: 15000 });
    await p.waitForTimeout(700);
  }
  await p.screenshot({ path: OUT + name + '.png' });
  await c.close();
};
await shot(1440, 900, 'G1_网格_1440', false);
await shot(390, 844, 'G2_网格_390', false);
await shot(1440, 900, 'G3_时间轴_1440', true);
await shot(390, 844, 'G4_时间轴_390', true);

await browser.close();
console.log(`\n===== 第 66 轮回归：${pass}/${pass + fail} =====`);
process.exit(fail ? 1 : 0);
