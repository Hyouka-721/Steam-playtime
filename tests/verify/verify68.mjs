/* 第 68 轮回归：全站「左轨」一致性
   契约：
   · 内容左轨 = .w-main 的 padding-left（桌面 28 / ≤860 18）；页眉图标、筛选条胶囊、页脚文字都在它上面
   · 时间轴：缩略图与月份标题的左缘 = 内容左轨；轴线与圆点画在页面留白里，不占用内容区
   · 切换网格 / 时间轴时，首个内容元素（海报卡 vs 缩略图）左缘相同，不跳动
   · 时间轴六列仍各自唯一 x（第 67 轮契约不回退）
   · 网格卡片的观看日期仍贴卡片右缘（第 66 轮契约，左右各管一边，别误改） */
import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const BASE = process.env.BASE || 'http://127.0.0.1:8895/';
const ROOT = 'C:/Users/33329/WorkBuddy/2026-10-13-18-17-49/steam-playtime/docs/';
const OUT = 'C:/Users/33329/AppData/Local/Temp/fx_verify_20261018/shots68/';
fs.mkdirSync(OUT, { recursive: true });

const rd = (f) => fs.readFileSync(ROOT + f, 'utf8').replace(/\r\n/g, '\n');
const css = rd('watch.css'), html = rd('watch.html');
const cssNC = css.replace(/\/\*[\s\S]*?\*\//g, '');

let pass = 0, fail = 0;
const ok = (n, c, extra = '') => { c ? (pass++, console.log(`PASS ${n}${extra ? '  — ' + extra : ''}`)) : (fail++, console.log(`FAIL ${n}  — ${extra}`)); };

/* ================= A 静态 ================= */
console.log('== A 静态：左轨声明 ==');
ok('A1 .w-tl 不再向左缩进（padding-left: 0）并定义 --tl-axis',
  /\.w-tl \{[^}]*padding-left: 0[^}]*--tl-axis: 12px/.test(cssNC),
  (cssNC.match(/\.w-tl \{[^}]*\}/) || [''])[0].replace(/\s+/g, ' '));
ok('A2 .tl-item 左内边距 30px → 0（缩略图落到内容左轨）',
  /\.tl-item \{[^}]*padding: 14px 16px 14px 0/.test(cssNC));
ok('A3 .tl-month 左内边距 30px → 0（月份标题与缩略图同一条左轨）',
  /\.tl-month \{[^}]*padding: 16px 0 10px 0/.test(cssNC));
ok('A4 轴线与圆点改为负偏移，画进页面留白',
  /\.tl-group::before \{[\s\S]*?left: calc\(-1 \* var\(--tl-axis\)\)/.test(cssNC) &&
  /\.tl-month::before \{[\s\S]*?left: calc\(-1 \* var\(--tl-axis\) - 5px\)/.test(cssNC));
ok('A5 ≤860px 轴线离轨收窄到 8px（页面留白只有 18px）',
  /\.w-tl \{ --tl-axis: 8px; \}/.test(cssNC));
ok('A6 ≤480px 的 .tl-item 也不再左缩进', /\.tl-item \{ padding: 12px 8px 12px 0/.test(cssNC));
ok('A7 版本号 bump：watch.css?v=15', /watch\.css\?v=15"/.test(html));

/* ================= B 运行时 ================= */
const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const errs = [];

async function open(W, H = 900) {
  const c = await browser.newContext({ viewport: { width: W, height: H } });
  const p = await c.newPage();
  p.on('pageerror', (e) => errs.push(`${W}:${e}`));
  await p.goto(BASE + 'watch.html', { waitUntil: 'load' });
  await p.evaluate(() => { try { localStorage.removeItem('watch-layout'); localStorage.removeItem('watch-kind'); } catch (e) {} });
  await p.reload({ waitUntil: 'load' });
  await p.waitForFunction(() => document.querySelectorAll('#w-grid .poster').length > 0, null, { timeout: 25000 });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(400);
  return { c, p };
}

/* 内容左轨 = .w-main 的 content-box 左缘 */
const rail = (p) => p.evaluate(() => {
  const m = document.getElementById('w-grid').closest('.w-main') || document.querySelector('.w-main');
  const cs = getComputedStyle(m);
  return +(m.getBoundingClientRect().left + parseFloat(cs.paddingLeft)).toFixed(1);
});

async function gridInfo(p) {
  return p.evaluate(() => {
    const card = document.querySelector('#w-grid .poster');
    const name = card.querySelector('.poster-name');
    const date = card.querySelector('.poster-date');
    const note = card.querySelector('.poster-note');
    const cr = card.getBoundingClientRect();
    return {
      card: +cr.left.toFixed(1), cardRight: +cr.right.toFixed(1),
      name: +name.getBoundingClientRect().left.toFixed(1),
      note: note ? +note.getBoundingClientRect().left.toFixed(1) : null,
      dateRight: +date.getBoundingClientRect().right.toFixed(1),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
}

async function tlInfo(p) {
  return p.evaluate(() => {
    const item = document.querySelector('#w-tl .tl-item');
    const month = document.querySelector('#w-tl .tl-month');
    const thumb = item.querySelector('.tl-thumb');
    const items = [...document.querySelectorAll('#w-tl .tl-item')];
    const u = (sel) => [...new Set(items.map((it) => { const e = it.querySelector(sel); return e ? Math.round(e.getBoundingClientRect().left) : null; }).filter((x) => x != null))];
    const mcs = getComputedStyle(month, '::before');
    const gcs = getComputedStyle(document.querySelector('#w-tl .tl-group'), '::before');
    const monthR = month.getBoundingClientRect();
    return {
      thumb: +thumb.getBoundingClientRect().left.toFixed(1),
      month: +monthR.left.toFixed(1),
      dotX: +(monthR.left + parseFloat(mcs.left)).toFixed(1),
      lineX: +(document.querySelector('#w-tl .tl-group').getBoundingClientRect().left + parseFloat(gcs.left)).toFixed(1),
      cols: { name: u('.tl-name'), date: u('.tl-date'), kind: u('.tl-kind'), year: u('.tl-year'), score: u('.tl-score'), note: u('.tl-note') },
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
}

console.log('\n== B 运行时：左轨一致（1440 / 1100 / 861 / 860 / 480 / 390） ==');
for (const W of [1440, 1100, 861, 860, 480, 390]) {
  const { c, p } = await open(W);
  const R = await rail(p);
  const g = await gridInfo(p);

  /* 网格：卡片 / 片名 / 短评 都在内容左轨；日期贴卡片右缘 */
  ok(`B[${W}] 网格卡片左缘 = 内容左轨 ${R}`, Math.abs(g.card - R) < 0.6 && Math.abs(g.name - R) < 0.6,
    `card=${g.card} name=${g.name} rail=${R}`);
  ok(`B[${W}] 网格观看日期仍贴卡片右缘（右对齐契约未被改动）`,
    Math.abs(g.dateRight - g.cardRight) <= 1.5, `${g.dateRight} vs ${g.cardRight}`);

  await p.click('#w-avatar');
  await p.waitForFunction(() => document.querySelectorAll('#w-tl .tl-item').length > 0
    && getComputedStyle(document.querySelector('#w-tl')).display !== 'none', null, { timeout: 20000 });
  await p.waitForTimeout(500);
  const t = await tlInfo(p);

  ok(`B[${W}] 时间轴缩略图与月份标题都落在内容左轨 ${R}（切换视图不跳动）`,
    Math.abs(t.thumb - R) < 0.6 && Math.abs(t.month - R) < 0.6 && Math.abs(t.thumb - g.card) < 0.6,
    `thumb=${t.thumb} month=${t.month} 网格卡=${g.card}`);
  ok(`B[${W}] 轴线与圆点完整落在页面留白内（dot ${t.dotX} / line ${t.lineX}）`,
    t.dotX >= 0 && t.lineX > t.dotX && t.lineX < R, `dot=${t.dotX} line=${t.lineX} rail=${R}`);
  if (W > 860) {
    ok(`B[${W}] 六列各自唯一 x（第 67 轮列对齐不回退）`,
      Object.values(t.cols).every((a) => a.length === 1), JSON.stringify(t.cols));
  } else {
    /* ≤860px 是 flex + wrap 兜底：允许参差，但必须无溢出、左轨不变 */
    ok(`B[${W}] 折行兜底档：允许列参差，但左轨与溢出仍受控`,
      t.overflow === 0 && Math.abs(t.thumb - R) < 0.6, `overflow=${t.overflow} thumb=${t.thumb}`);
  }
  ok(`B[${W}] 整页无横向溢出`, t.overflow === 0 && g.overflow === 0, `tl=${t.overflow} grid=${g.overflow}`);

  if (W === 1440) await p.screenshot({ path: OUT + 'B1_左轨_1440.png' });
  if (W === 390) await p.screenshot({ path: OUT + 'B2_左轨_390.png' });
  await c.close();
}

/* ================= C 页眉 / 筛选条 / 页脚 也在同一条左轨 ================= */
console.log('\n== C 页眉 · 筛选条 · 页脚 ==');
{
  const { c, p } = await open(1440);
  const R = await rail(p);
  const r = await p.evaluate(() => {
    const g = (sel) => { const e = document.querySelector(sel); return e ? +e.getBoundingClientRect().left.toFixed(1) : null; };
    return { home: g('.w-home'), seg: g('.w-seg'), firstBtn: g('.w-seg-btn'), foot: g('.w-foot'), grid: g('.w-grid') };
  });
  ok('C1 页眉小黄人 / 筛选条胶囊 / 内容区 三者在同一条左轨',
    Math.abs(r.home - R) < 0.6 && Math.abs(r.seg - R) < 0.6 && Math.abs(r.grid - R) < 0.6,
    `home=${r.home} seg=${r.seg} grid=${r.grid} rail=${R}`);
  ok('C2 胶囊内的首颗按钮只差「胶囊内边距 4px + 边框 1px」（组件内留白，非错位）',
    r.firstBtn - r.seg === 5, `差 ${(r.firstBtn - r.seg).toFixed(1)}px`);
  ok('C3 页脚左内边距与内容区一致', Math.abs(r.foot - 0) === 0 && /\.w-foot \{[^}]*padding: [^;]*28px/.test(cssNC),
    `foot box=${r.foot}`);
  await c.close();
}

ok('D1 全程零 JS 异常', errs.length === 0, errs.slice(0, 3).join(' | '));

await browser.close();
console.log(`\n===== 第 68 轮回归：${pass}/${pass + fail} =====`);
process.exit(fail ? 1 : 0);
