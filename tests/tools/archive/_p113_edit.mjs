/* _p113_edit.mjs — 第 113 轮改动（一次性脚本，跑完即删）
   1) 删死码：当日明细浮层（#cal-overlay / openDayDetail / closeCal / stepCalDay ...）
   2) 点阵行距收紧（row-gap = 列距 × 0.5）
   3) 点开当日明细不再整块 scrollIntoView（改成「完全看不见时才轻推」）+ scrollbar-gutter
   4) 年视图删掉「期内合计 / 有记录」两张卡
*/
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const P = (f) => path.join(ROOT, 'docs', f);

let hits = [];
function sub(src, from, to, label, expect = 1) {
  const parts = src.split(from);
  if (parts.length - 1 !== expect) {
    throw new Error(`[${label}] 期望命中 ${expect} 次，实际 ${parts.length - 1} 次`);
  }
  hits.push(label);
  return parts.join(to);
}

/* ===================== style.css ===================== */
let css = fs.readFileSync(P('style.css'), 'utf8');

// A. 滚动条出现不再改变视口宽度
css = sub(css, '\nhtml, body {\n  margin: 0;',
  '\n/* 第 113 轮：点开当日明细会让页面变高、突然冒出滚动条，进而改变视口宽度 →\n' +
  '   整页横向挤一下（用户：「上方元素会跳一下」）。留住滚动条槽位就彻底不抖了。 */\n' +
  'html { scrollbar-gutter: stable; }\n\nhtml, body {\n  margin: 0;', 'css:scrollbar-gutter');

// B. 行距变量
css = sub(css, '  --hx-gap: calc(var(--hx) * 0.30);\n',
  '  --hx-gap: calc(var(--hx) * 0.30);\n' +
  '  /* 第 113 轮（用户：两行之间的间隔缩小、更紧密）：行距单独取列距的一半，\n' +
  '     列距仍按第 112 轮定下的 --hx-gap 走。 */\n' +
  '  --hx-rowgap: calc(var(--hx-gap) * 0.5);\n', 'css:--hx-rowgap');

// C. dow 列与点阵共用行距
css = sub(css,
  '.hx-dow { grid-column: 1; grid-row: 2; display: grid; grid-template-rows: repeat(7, var(--hx)); gap: var(--hx-gap); }',
  '.hx-dow { grid-column: 1; grid-row: 2; display: grid; grid-template-rows: repeat(7, var(--hx)); row-gap: var(--hx-rowgap); }',
  'css:.hx-dow');

css = sub(css,
  '  display: grid; grid-auto-flow: column; grid-template-rows: repeat(7, var(--hx)); gap: var(--hx-gap);',
  '  display: grid; grid-auto-flow: column; grid-template-rows: repeat(7, var(--hx));\n' +
  '  column-gap: var(--hx-gap); row-gap: var(--hx-rowgap);',
  'css:.hx-grid');

// D. 整段删掉「当日明细浮层」样式（含 480 媒体查询）
const cssStart = css.indexOf('/* ================= 当日明细浮层 ================= */');
const cssEnd = css.indexOf('/* ================= 第 83 轮新增组件 ================= */');
if (cssStart < 0 || cssEnd < 0 || cssEnd < cssStart) throw new Error('css: 浮层区段边界没找到');
css = css.slice(0, cssStart) + css.slice(cssEnd);
hits.push('css:del-overlay');

fs.writeFileSync(P('style.css'), css);

/* ===================== index.html ===================== */
let html = fs.readFileSync(P('index.html'), 'utf8');
const hStart = html.indexOf('<!-- 当日明细浮层（Esc / 点击空白处 / × 关闭）');
const hEnd = html.indexOf('<!-- fx.js 自己绑定页脚的氛围开关');
if (hStart < 0 || hEnd < 0 || hEnd < hStart) throw new Error('html: 浮层边界没找到');
html = html.slice(0, hStart) + html.slice(hEnd);
hits.push('html:del-overlay');
fs.writeFileSync(P('index.html'), html);

/* ===================== app.js ===================== */
let js = fs.readFileSync(P('app.js'), 'utf8');

// 1. 删掉 hmText（只被浮层用）
js = sub(js, `  /** 当天明细用的可读时长：'2 小时 11 分钟' / '45 分钟' / '不足 1 分钟'。
      整分钟数据里 0 分钟 = 玩了一下但不足一分钟，不能显示成 '0 分钟'（会被当成没玩） */
  function hmText(m) {
    const n = Math.round(Number(m) || 0);
    if (n <= 0) return '不足 1 分钟';
    if (n < 60) return \`\${n} 分钟\`;
    const h = Math.floor(n / 60);
    const r = n % 60;
    return r === 0 ? \`\${h} 小时\` : \`\${h} 小时 \${r} 分钟\`;
  }
`, '', 'js:hmText');

// 2. state.cal
js = sub(js, `    // ---- 当日明细浮层（第 87 轮：入口改为下钻月历热力图的格子）----
    cal: { open: false, busy: false, lastFocus: null, day: null },
`, '', 'js:state.cal');

// 3. 整段浮层逻辑（保留 todayStr）
const jsStart = js.indexOf('  // ---------- 当日明细浮层（第 87 轮：入口改为下钻月历热力图的格子） ----------');
const jsEnd = js.indexOf('  // ================= 第 83 轮新增模块 =================');
if (jsStart < 0 || jsEnd < 0 || jsEnd < jsStart) throw new Error('js: 浮层区段边界没找到');
js = js.slice(0, jsStart) +
  '  /** 一周从周一起算，与 renderTimeline 的 weekStart 保持一致 */\n' +
  '  const todayStr = () => ymd(new Date());\n\n' +
  js.slice(jsEnd);
hits.push('js:del-overlay-fns');

// 4. 浮层绑定
js = sub(js, `    // 当日明细浮层（第 87 轮：入口已从「最近游玩」的小日历图标改为下钻热力图的格子）
    $('cal-day-close').addEventListener('click', () => closeCal());
    $('cal-day-prev').addEventListener('click', () => stepCalDay(-1));
    $('cal-day-next').addEventListener('click', () => stepCalDay(1));
    $('cal-overlay').addEventListener('click', (e) => {
      if (e.target.closest('.cal-panel')) return; // 面板内的点击不关闭
      if (!state.cal.busy) closeCal();
    });

`, '', 'js:del-overlay-bind');

// 5. Esc 不再看浮层状态
js = sub(js, "      if (e.key === 'Escape' && !state.cal.open) {", "      if (e.key === 'Escape') {", 'js:esc');

// 6. 点开当天不再整块滚动
js = sub(js, `        renderDrill();
        $('hx-day')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        return true;`,
  `        renderDrill();
        /* 第 113 轮（用户：点开当天后「上方元素会跳一下很突兀」）：
           原来无条件 scrollIntoView({block:'nearest'}) 会把列表底边拽进视口，
           整页跟着上滚 200~300px。现在只有「列表头完全在视口外」才轻推一下，
           且只推到头行露出来为止 —— 头行本来就在视野里时一步都不滚。 */
        const box = $('hx-day');
        if (box && !box.hidden) {
          const head = box.querySelector('.hx-day-head') || box;
          const r = head.getBoundingClientRect();
          const vh = window.innerHeight;
          if (r.top > vh - 24) {
            const dy = Math.min(r.top - 96, r.top - vh + 96);
            if (dy > 0) window.scrollBy({ top: dy, behavior: 'smooth' });
          }
        }
        return true;`, 'js:no-scroll');

// 7. 年视图不再挂「期内合计 / 有记录」
js = sub(js, `    const head = g
      ? \`<div class="dm-head">
          <div class="dm-share"><span>占终身时长</span><b>\${share.toFixed(1)}%</b><i style="width:\${Math.min(100, share).toFixed(1)}%"></i></div>
          <div class="dm-kv"><span>期内游玩</span><b>\${hm(inPeriod)}</b></div>
          <div class="dm-kv"><span>首次记录</span><b>\${days[0] ?? '—'}</b></div>
          <div class="dm-kv"><span>最近游玩</span><b>\${g.last_played ?? '—'}</b></div>
        </div>\`
      : \`<div class="dm-head"><div class="dm-kv"><span>期内合计</span><b>\${hm(inPeriod)}</b></div>
         <div class="dm-kv"><span>有记录</span><b>\${days.length} 天</b></div></div>\`;
    box.innerHTML = head + (appid ? '<div class="dm-ach" id="dm-ach"><p class="dm-empty">成就明细按需加载…</p></div>' : '');
    if (!appid) return;`,
  `    /* 第 113 轮（用户：「删除期内合计和有记录」）：这两张卡只在**年视图**出现过，
       现在整个区块留空；下钻某款游戏时的详情（占比 / 期段 / 成就）照旧。 */
    if (!g) { box.innerHTML = ''; return; }
    box.innerHTML =
      \`<div class="dm-head">
          <div class="dm-share"><span>占终身时长</span><b>\${share.toFixed(1)}%</b><i style="width:\${Math.min(100, share).toFixed(1)}%"></i></div>
          <div class="dm-kv"><span>期内游玩</span><b>\${hm(inPeriod)}</b></div>
          <div class="dm-kv"><span>首次记录</span><b>\${days[0] ?? '—'}</b></div>
          <div class="dm-kv"><span>最近游玩</span><b>\${g.last_played ?? '—'}</b></div>
        </div>\` +
      '<div class="dm-ach" id="dm-ach"><p class="dm-empty">成就明细按需加载…</p></div>';`, 'js:dm-kv');

fs.writeFileSync(P('app.js'), js);

console.log('OK 命中：\n - ' + hits.join('\n - '));
