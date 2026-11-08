/* _p115_js.mjs — 第 115 轮：app.js 清理（html / css 已在前面两步改完） */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const FILE = path.join(ROOT, 'docs/app.js');
let s = fs.readFileSync(FILE, 'utf8');
const hits = [];
function sub(from, to, label) {
  const n = s.split(from).length - 1;
  if (n !== 1) throw new Error(`[${label}] 命中 ${n} 次`);
  s = s.split(from).join(to);
  hits.push(label);
}

/* ---------- A 状态与函数 ---------- */
sub(`    drill: { appid: null, year: null, sel: null }, // 二级界面：null = 全部游戏；year = 热力图年份；sel = 最近点开的那天`,
  `    drill: { year: null, sel: null }, // 点阵状态：year = 显示的年份；sel = 点开的那一天`,
  'A1 state.drill');

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
  'A2 minutesOn + 删 openDrill/closeDrill');

/* ---------- B 气泡与当日列表 ---------- */
sub(`    const min = minutesOn(ds, state.drill.appid);`, `    const min = minutesOn(ds);`, 'B1 tip-minutes');

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
  'B2 hxday-list');

sub(`        list.length ? \`\${scopeName ? scopeName + ' · ' : ''}\${list.length} 款 · 合计 \${hm(total)}\` : '无游玩记录'`,
  `        list.length ? \`\${list.length} 款 · 合计 \${hm(total)}\` : '无游玩记录'`,
  'B3 hxday-sum');

/* ---------- C renderDrill ---------- */
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
  'C1 renderDrill-head');

sub(`      const min = minutesOn(ds, appid);`, `      const min = minutesOn(ds);`, 'C2 drill-min');
sub(`          ? \`\${hxDateLabel(ds)}，\${appid ? '这款玩了 ' : '当天 '}\${hm(min)}，查看当天游戏\``,
  `          ? \`\${hxDateLabel(ds)}，当天 \${hm(min)}，查看当天游戏\``, 'C3 drill-label1');
sub(`          : \`\${hxDateLabel(ds)}，\${appid ? '这款当天没玩' : '当天没有游玩'}，仍可查看当天游戏\`;`,
  `          : \`\${hxDateLabel(ds)}，当天没有游玩，仍可查看当天游戏\`;`, 'C4 drill-label2');
sub(`    renderHxDay();
    renderDrillMore(appid);
  }`, `    renderHxDay();
  }`, 'C5 drill-call');

/* ---------- D 删 renderDrillMore ---------- */
const a = s.indexOf('  /* ---------- #18 单游戏详情：占比 / 期段 / 成就解锁 ---------- */');
const b = s.indexOf('  /* ---------- #19 深链 ---------- */');
if (a < 0 || b < 0 || b < a) throw new Error('renderDrillMore 边界没找到');
s = s.slice(0, a) + s.slice(b);
hits.push('D1 renderDrillMore');

/* ---------- E 深链 ---------- */
sub(`    const parts = ['#/' + state.view];
    if (state.view === 'recent' && state.drill.appid) parts.push('g/' + state.drill.appid);
    const next = parts.join('/');`,
  `    const next = '#/' + state.view;`, 'E1 syncHash');
sub(`    switchView(view, { instant: true });
    const gi = seg.indexOf('g');
    const appid = gi >= 0 ? seg[gi + 1] : null;
    if (appid && (view === 'recent' || view === 'lifetime')) openDrill(appid);
    return true;`,
  `    // 第 115 轮：'g/<appid>' 段已废弃（单游戏下钻整条线删除），带了也只按视图处理
    switchView(view, { instant: true });
    return true;`, 'E2 applyHash');

/* ---------- F 徽章点击 ---------- */
sub(`    const drillTo = (e) => {
      const b = e.target.closest('[data-appid]');
      if (b) openDrill(b.dataset.appid);
    };
    if ($('badges')) $('badges').addEventListener('click', drillTo);
    if ($('suggest')) $('suggest').addEventListener('click', drillTo);
`, `    /* 第 115 轮：勋章墙与「临门一脚」里的 [data-appid] 徽章原本点击会下钻到单游戏详情，
       下钻删除后它们只是展示用的标记（悬停底纹仍按 data-appid 走 setHero）。 */
`, 'F1 drillTo');

/* ---------- G switchView ---------- */
sub(`      if (v === 'lifetime') closeDrill();
`, '', 'G1 closeDrill-call');

/* ---------- H pickDay ---------- */
sub(`        if (minutesOn(ds, state.drill.appid) === null) return false;`,
  `        if (minutesOn(ds) === null) return false;`, 'H1 pickDay');

/* ---------- I 榜单行 / 返回按钮 ---------- */
sub(`    // 游戏累计列表：点击整行 → 该游戏每日时长热力图（下钻）
    $('lt-list').addEventListener('click', (e) => {
      const row = e.target.closest('.rank-item');
      if (!row) return;
      openDrill(row.dataset.appid);
    });
`, `    /* 第 115 轮（用户：「从累计榜点进某款游戏时没反应，不可点击」）：
       榜单整行不再挂点击（原来点行会下钻到该游戏的热力图）。
       现在行只是展示 + 悬停换底纹（setHero），cursor 也回到默认。 */
`, 'I1 lt-list-click');

sub(`    $('btn-drill-back').addEventListener('click', () => {
      switchView('lifetime');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

`, '', 'I2 back-btn');

fs.writeFileSync(FILE, s);
console.log('OK app.js 命中：\n - ' + hits.join('\n - '));
