/* _p115_edit.mjs — 第 115 轮：彻底删掉「下钻单个游戏」这条线
   用户：「进一步删除剩下的 ← 返回 + 游戏名 + 该游戏的占比/期段/成就卡。从累计榜点进某款游戏时，没反应，不可点击」
   删除内容：openDrill / closeDrill / renderDrillMore / #drill-more / #btn-drill-back /
            state.drill.appid / g/<appid> 深链 / 榜单行与徽章的点击 / .is-drill 隐藏 /
            .drill-more + .dm-* + .btn-back 样式 / 行的 cursor:pointer
*/
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const load = (f) => { const raw = fs.readFileSync(f, 'utf8'); return { crlf: raw.includes('\r\n'), text: raw.replace(/\r\n/g, '\n') }; };
const save = (f, o, text) => fs.writeFileSync(f, o ? text.replace(/\n/g, '\r\n') : text);
const P = (f) => path.join(ROOT, 'docs', f);
const hits = [];
let cur = '';

function sub(from, to, label) {
  const n = cur.split(from).length - 1;
  if (n !== 1) throw new Error(`[${label}] 命中 ${n} 次`);
  cur = cur.split(from).join(to);
  hits.push(label);
}

/* ===================== index.html ===================== */
cur = fs.readFileSync(P('index.html'), 'utf8');
sub(`        <div class="panel-title">
          <button class="btn btn-back" id="btn-drill-back">← 返回</button>
          <h2 class="hx-title">游玩热力图</h2>
        </div>`,
  `        <div class="panel-title">
          <h2 class="hx-title">游玩热力图</h2>
        </div>`,
  'html:back-btn');
sub(`        <div class="ctrl ctrl-year">`, `        <div class="ctrl">`, 'html:ctrl-year');
sub(`      <!-- 点击某天 → 这里展开当天玩过的游戏与时长 -->
      <div class="hx-day" id="hx-day" hidden></div>
      <div id="drill-more" class="drill-more"></div>`,
  `      <!-- 点击某天 → 这里展开当天玩过的游戏与时长 -->
      <div class="hx-day" id="hx-day" hidden></div>`,
  'html:drill-more');
fs.writeFileSync(P('index.html'), cur);

/* ===================== style.css ===================== */
cur = fs.readFileSync(P('style.css'), 'utf8');
// ① 行不再可点
sub('gap: 14px; align-items: center; cursor: pointer;', 'gap: 14px; align-items: center;', 'css:rank-cursor');
// ② .is-drill 隐藏规则（第 114 轮加的，现在没有下钻了）
const drillStart = cur.indexOf('/* 第 114 轮（用户：删除单个游戏下的热力图/点阵图，只保留最近游玩下的总点阵）：');
const drillEnd = cur.indexOf('/* 悬停气泡：与插件同款「深色小卡 + 两行」');
if (drillStart < 0 || drillEnd < 0 || drillEnd < drillStart) throw new Error('css: is-drill 块边界没找到');
cur = cur.slice(0, drillStart) + cur.slice(drillEnd);
hits.push('css:is-drill');
// ③ .btn-back（只服务于那个返回按钮）
sub(`.btn-back {
  padding: 5px 12px; font-size: 13.5px; color: var(--text-dim);
  background: transparent; white-space: nowrap;
}
.btn-back:hover { color: var(--accent); border-color: var(--tint-border); background: var(--tint-1); }
`, '', 'css:btn-back');
// ④ #drill-more / .dm-* 整块
const dmStart = cur.indexOf('.drill-more { margin-top: 10px; }');
const dmEnd = cur.indexOf('/* ---------- #20 周目标 / 节奏 ---------- */');
if (dmStart < 0 || dmEnd < 0 || dmEnd < dmStart) throw new Error('css: dm 块边界没找到');
cur = cur.slice(0, dmStart) + cur.slice(dmEnd);
hits.push('css:dm-block');
// ⑤ 480 媒体查询里的两条 dm 规则
sub(`  .dm-row { grid-template-columns: minmax(0, 1fr) 54px; }
  .dm-date { display: none; }
`, '', 'css:dm-480');
fs.writeFileSync(P('style.css'), cur);

/* ===================== app.js ===================== */
cur = fs.readFileSync(P('app.js'), 'utf8');

// 1) state
sub(`    drill: { appid: null, year: null, sel: null }, // 二级界面：null = 全部游戏；year = 热力图年份；sel = 最近点开的那天`,
  `    drill: { year: null, sel: null }, // 点阵状态：year = 显示的年份；sel = 点开的那一天`,
  'js:state.drill');

// 2) minutesOn + 删 openDrill / closeDrill
sub(`  /** 某天某游戏的分钟数；appid 为空 = 当天总和。返回 null = 那天还没有数据 */
  function minutesOn(date, appid) {
    const day = state.days.get(date);
    if (!day) return null;
    if (!appid) return day.total_minutes ?? 0;
    return (day.games ?? []).find((g) => String(g.appid) === String(appid))?.minutes ?? 0;
  }

  /** 点榜单某一行 → 下钻到该游戏的一年热力图 */
  function openDrill(appid) {
    state.drill.appid = appid;
    state.drill.year = null;   // 回到「最新数据所在年」
    state.drill.sel = null;    // 进入新的下钻，不保留上一个游戏点开的那天
    // 热力图归属「最近游玩」栏目：进入下钻即切过去，数据不变
    switchView('recent', { instant: true });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function closeDrill() {
    // 必须清掉 appid：否则深链会一直挂着 g/<旧游戏>（切走再切回也回不来）
    state.drill.appid = null;
    state.drill.sel = null;
  }
`,
  `  /** 某天的总分钟数；返回 null = 那天还没有数据
      （第 115 轮：删除「下钻单个游戏」后不再有「某款游戏那天玩了多久」的口径） */
  function minutesOn(date) {
    const day = state.days.get(date);
    return day ? day.total_minutes ?? 0 : null;
  }
`,
  'js:minutesOn+drill-fns');

// 3) hxTipShow
sub(`    const min = minutesOn(ds, state.drill.appid);`, `    const min = minutesOn(ds);`, 'js:tip-minutes');

// 4) renderHxDay：去掉 appid 过滤与 scopeName
sub(`    const appid = state.drill.appid;
    const day = state.days.get(ds);
    const all = day?.games ?? [];
    /* 下钻某款游戏时只列这款；否则列当天全部 */
    const list = (appid ? all.filter((x) => String(x.appid) === String(appid)) : all)
      .slice()
      .sort((a, b) => (b.minutes ?? 0) - (a.minutes ?? 0));
    const total = list.reduce((a, x) => a + (x.minutes ?? 0), 0);
    const maxMin = list.reduce((a, x) => Math.max(a, x.minutes ?? 0), 0);
    const scopeName = appid ? (state.meta?.games_lifetime?.[appid]?.name ?? '这款游戏') : '';
`,
  `    const day = state.days.get(ds);
    const list = (day?.games ?? [])
      .slice()
      .sort((a, b) => (b.minutes ?? 0) - (a.minutes ?? 0));
    const total = list.reduce((a, x) => a + (x.minutes ?? 0), 0);
    const maxMin = list.reduce((a, x) => Math.max(a, x.minutes ?? 0), 0);
`,
  'js:hxday-list');
sub(`        list.length ? \`\${scopeName ? scopeName + ' · ' : ''}\${list.length} 款 · 合计 \${hm(total)}\` : '无游玩记录'`,
  `        list.length ? \`\${list.length} 款 · 合计 \${hm(total)}\` : '无游玩记录'`,
  'js:hxday-sum');

// 5) renderDrill：删掉下钻分支与 appid
sub(`    const appid = state.drill.appid;
    const grid = $('hx-grid');
    const monthsBox = $('hx-months');
    if (!grid || !monthsBox) return;

    /* 第 114 轮（用户：删除单个游戏下的热力图/点阵图，只保留最近游玩下的总点阵）：
       下钻某款游戏时**不渲染任何格子**，整块点阵由 .is-drill 隐藏，面板只剩
       「← 返回 + 游戏名 + 这款游戏的详情卡（占比 / 期段 / 成就）」。
       这样点阵只属于「最近游玩」的总览，一个游戏一份点阵的历史到此结束。 */
    const gDrill = appid ? state.meta?.games_lifetime?.[appid] : null;
    const drilling = !!appid;
    const panel = $('lt-detail');
    if (panel) panel.classList.toggle('is-drill', drilling);
    const titleEl = panel?.querySelector('.hx-title');
    if (titleEl) titleEl.textContent = drilling ? (gDrill?.name ?? '游戏详情') : '游玩热力图';
    if (drilling) {
      grid.innerHTML = '';
      grid.style.gridTemplateColumns = '';
      monthsBox.innerHTML = '';
      monthsBox.style.gridTemplateColumns = '';
      hxTipHide();
      state.drill.sel = null;   // 没有格子就没有「选中的那天」
      renderHxDay();            // 清掉可能残留的当日列表
      renderDrillMore(appid);
      return;
    }

    const year = hxYear();`,
  `    const grid = $('hx-grid');
    const monthsBox = $('hx-months');
    if (!grid || !monthsBox) return;

    const year = hxYear();`,
  'js:renderDrill-head');

fs.writeFileSync(P('app.js'), cur);
console.log('OK 第一批命中：\n - ' + hits.join('\n - '));
