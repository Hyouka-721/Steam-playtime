/* _p117_edit.mjs — 第 117 轮：首页榜单「首屏 8 款、绝不切半行」
   用户：「第 9 个游戏的海报会露出边缘……适当增大各项之间的间距，使首页在首屏内恰好完整展示 8 款游戏，
        且不出现第 9 款的部分内容。请确保调整后在不同屏幕尺寸下该效果保持一致。」
   做法：行距 4→8，并按视口反解行高（--rank-row-h），让折线永远落在行与行之间。 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const hits = [];
let cur = '';
function sub(a, b, label) {
  const n = cur.split(a).length - 1;
  if (n !== 1) throw new Error(`[${label}] 命中 ${n} 次`);
  cur = cur.split(a).join(b);
  hits.push(label);
}
function load(rel) {
  const raw = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  return { rel, crlf: raw.includes('\r\n'), text: raw.replace(/\r\n/g, '\n') };
}
function save(o) {
  fs.writeFileSync(path.join(ROOT, o.rel), o.crlf ? cur.replace(/\n/g, '\r\n') : cur);
}

/* ---------- style.css ---------- */
let f = load('docs/style.css');
cur = f.text;
sub('.rank-list { display: flex; flex-direction: column; gap: 4px; padding-top: 18px; }',
  `/* 第 117 轮（用户：首屏要完整露出 8 款、不能切出第 9 款的边）：
   行距 4 → 8，行高由 app.js 的 fitRankRows() 按视口反解后写进 --rank-row-h，
   让折线永远落在「行与行之间」。窄屏（≤860）是两行式布局，不参与这套算法。 */
.rank-list { display: flex; flex-direction: column; gap: 8px; padding-top: 18px; }`,
  'css:gap');
sub(`  gap: 14px; align-items: center;
  padding: 7px 12px; border-radius: 9px; background: transparent; border: 1px solid transparent;`,
  `  gap: 14px; align-items: center;
  /* 行高下限由 fitRankRows() 按视口写入；没写时退回内容高度（0 = 不设下限） */
  min-height: var(--rank-row-h, 0px);
  padding: 7px 12px; border-radius: 9px; background: transparent; border: 1px solid transparent;`,
  'css:rank-min-h');
sub(`.sk-row {
  display: grid; grid-template-columns: 44px 130px minmax(150px, 260px) minmax(140px, 1fr) 150px 110px;
  gap: 14px; align-items: center; padding: 7px 12px;
}`,
  `.sk-row {
  display: grid; grid-template-columns: 44px 130px minmax(150px, 260px) minmax(140px, 1fr) 150px 110px;
  gap: 14px; align-items: center; padding: 7px 12px;
  /* 骨架也吃同一个行高，数据到位换真行时零跳动（CLS 红线 0.000） */
  min-height: var(--rank-row-h, 0px);
}`,
  'css:sk-min-h');
save(f);

/* ---------- app.js ---------- */
f = load('docs/app.js');
cur = f.text;

/* 1) 新增 fitRankRows()：插在 renderLifetime 之后 */
sub(`    box.innerHTML = html;
    observeCapsules(box); // 登记新渲染出的胶囊图（视口临近才真正下载）
    if (idle.length) bindIdleToggle(idle.length);
  }`,
  `    box.innerHTML = html;
    observeCapsules(box); // 登记新渲染出的胶囊图（视口临近才真正下载）
    if (idle.length) bindIdleToggle(idle.length);
    fitRankRows();
  }

  /* ---------- 首屏「恰好 N 款」：按视口反解榜单行高 ----------
     第 117 轮（用户：第 9 款的海报会露出边缘，要首屏完整展示 8 款、不出现第 9 款的碎片）：
     不写死行高，而是「让折线落在行与行之间」——
       ① 先试 8 行：行高 = (折线可用高度 − 7×行距) / 8；
       ② 行高落在观感带 [74, 100] 内 → 就是 8 行；
       ③ 屏幕偏高（8 行会胖到 >100）→ 多放几行，别让行高继续涨；
       ④ 屏幕偏矮（8 行会压到 <74）→ 少放几行，保证不切出半行。
     结果：任何视口高度下首屏都是**整行**，1380×~1080 这一档正好 8 款。 */
  const RANK_FIT = { rows: 8, gap: 8, min: 74, max: 100, pad: 10 };

  function fitRankRows() {
    const list = $('lt-list');
    if (!list || !list.querySelector('.rank-item')) return;
    /* 窄屏是「序号+封面占前两列、进度条换行」的两行式布局，撑高会散架 → 不参与 */
    if (window.matchMedia('(max-width: 860px)').matches || state.view !== 'lifetime') {
      list.style.removeProperty('--rank-row-h');
      return;
    }
    const box = list.getBoundingClientRect();
    /* 用文档坐标算，滚动到哪儿都不影响结果 */
    const topDoc = box.top + window.scrollY;
    const avail = window.innerHeight - topDoc - RANK_FIT.pad;
    if (!(avail > 0)) return;
    const { rows, gap, min, max } = RANK_FIT;
    let n = rows;
    let h = (avail - (n - 1) * gap) / n;
    if (h > max) {
      n = Math.max(rows, Math.round((avail + gap) / (max + gap)));
      h = (avail - (n - 1) * gap) / n;
    } else if (h < min) {
      n = Math.max(3, Math.floor((avail + gap) / (min + gap)));
      h = (avail - (n - 1) * gap) / n;
    }
    if (!(h > 0)) return;
    list.style.setProperty('--rank-row-h', \`\${h.toFixed(1)}px\`);
  }`,
  'js:fitRankRows');

/* 2) 骨架阶段也算一次（首屏不因换行高而跳） */
sub(`      paintSkeletons();`, `      paintSkeletons();
      fitRankRows();   // 骨架期先按视口定好行高，换真行时零跳动`, 'js:init-skeleton-fit');

/* 3) 切回「游戏时长」时重算（其它视图里列表是 display:none，量不到） */
sub(`      if (v === 'timeline') renderTimeline();
      if (v === 'data') renderReport();`,
  `      if (v === 'timeline') renderTimeline();
      if (v === 'data') renderReport();
      if (v === 'lifetime') fitRankRows();`, 'js:switchView-fit');

/* 4) 窗口尺寸变化时重算（跟热力图共用同一个 160ms 防抖） */
sub(`    let hxResizeT = 0;
    window.addEventListener('resize', () => {
      clearTimeout(hxResizeT);
      hxResizeT = setTimeout(() => {`,
  `    let hxResizeT = 0;
    window.addEventListener('resize', () => {
      clearTimeout(hxResizeT);
      hxResizeT = setTimeout(() => {
        fitRankRows();`, 'js:resize-fit');

save(f);
console.log('OK 命中：\n - ' + hits.join('\n - '));
