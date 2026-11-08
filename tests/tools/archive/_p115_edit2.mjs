/* _p115_edit2.mjs — 第 115 轮第二批：删 renderDrillMore / 深链 g/ / 榜单行与徽章点击 / 返回按钮 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const load = (f) => { const raw = fs.readFileSync(f, 'utf8'); return { crlf: raw.includes('\r\n'), text: raw.replace(/\r\n/g, '\n') }; };
const save = (f, o, text) => fs.writeFileSync(f, o ? text.replace(/\n/g, '\r\n') : text);
const FILE = path.join(ROOT, 'docs/app.js');
let s = fs.readFileSync(FILE, 'utf8');
const hits = [];
function sub(from, to, label) {
  const n = s.split(from).length - 1;
  if (n !== 1) throw new Error(`[${label}] 命中 ${n} 次`);
  s = s.split(from).join(to);
  hits.push(label);
}

/* 1) renderDrill 里剩下的 appid 用法 */
sub('      const min = minutesOn(ds, appid);', '      const min = minutesOn(ds);', 'js:drill-min');
sub(`          ? \`\${hxDateLabel(ds)}，\${appid ? '这款玩了 ' : '当天 '}\${hm(min)}，查看当天游戏\``,
  `          ? \`\${hxDateLabel(ds)}，当天 \${hm(min)}，查看当天游戏\``, 'js:drill-label1');
sub(`          : \`\${hxDateLabel(ds)}，\${appid ? '这款当天没玩' : '当天没有游玩'}，仍可查看当天游戏\`;`,
  `          : \`\${hxDateLabel(ds)}，当天没有游玩，仍可查看当天游戏\`;`, 'js:drill-label2');
sub(`    renderHxDay();
    renderDrillMore(appid);
  }`, `    renderHxDay();
  }`, 'js:drill-call');

/* 2) 删 renderDrillMore 整个函数 */
const a = s.indexOf('  /* ---------- #18 单游戏详情：占比 / 期段 / 成就解锁 ---------- */');
const b = s.indexOf('  /* ---------- #19 深链 ---------- */');
if (a < 0 || b < 0 || b < a) throw new Error('renderDrillMore 边界没找到');
s = s.slice(0, a) + s.slice(b);
hits.push('js:renderDrillMore');

/* 3) 深链：只保留视图段，旧的 g/<appid> 直接忽略 */
sub(`    const parts = ['#/' + state.view];
    if (state.view === 'recent' && state.drill.appid) parts.push('g/' + state.drill.appid);
    const next = parts.join('/');`,
  `    const next = '#/' + state.view;`, 'js:syncHash');
sub(`    switchView(view, { instant: true });
    const gi = seg.indexOf('g');
    const appid = gi >= 0 ? seg[gi + 1] : null;
    if (appid && (view === 'recent' || view === 'lifetime')) openDrill(appid);
    return true;`,
  `    // 第 115 轮：'g/<appid>' 段已废弃（单游戏下钻整条线删除），带了也只按视图处理
    switchView(view, { instant: true });
    return true;`, 'js:applyHash');

/* 4) 徽章 / 建议区不再能点进「单游戏详情」 */
sub(`    const drillTo = (e) => {
      const b = e.target.closest('[data-appid]');
      if (b) openDrill(b.dataset.appid);
    };
    if ($('badges')) $('badges').addEventListener('click', drillTo);
    if ($('suggest')) $('suggest').addEventListener('click', drillTo);
`, `    /* 第 115 轮：勋章墙与「临门一脚」里的 [data-appid] 徽章原本点击会下钻到单游戏详情，
       下钻删除后它们只是展示用的标记（悬停底纹仍按 data-appid 走 setHero）。 */
`, 'js:drillTo');

/* 5) switchView 不再需要 closeDrill */
sub(`      if (v === 'lifetime') closeDrill();
`, '', 'js:closeDrill-call');

/* 6) pickDay */
sub(`        if (minutesOn(ds, state.drill.appid) === null) return false;`,
  `        if (minutesOn(ds) === null) return false;`, 'js:pickDay');

/* 7) 累计榜行不再可点 */
sub(`    // 游戏累计列表：点击整行 → 该游戏每日时长热力图（下钻）
    $('lt-list').addEventListener('click', (e) => {
      const row = e.target.closest('.rank-item');
      if (!row) return;
      openDrill(row.dataset.appid);
    });
`, `    /* 第 115 轮（用户：「从累计榜点进某款游戏时没反应，不可点击」）：
       榜单整行不再挂点击（原来点行会下钻到该游戏的热力图）。
       现在行只是展示 + 悬停换底纹（setHero），cursor 也回到默认。 */
`, 'js:lt-list-click');

/* 8) 返回按钮 */
sub(`    $('btn-drill-back').addEventListener('click', () => {
      switchView('lifetime');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

`, '', 'js:back-btn');

fs.writeFileSync(FILE, s);
console.log('OK 第二批命中：\n - ' + hits.join('\n - '));
