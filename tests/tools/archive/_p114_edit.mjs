/* _p114_edit.mjs — 第 114 轮：下钻单个游戏时不再渲染点阵，只保留最近游玩的总点阵
   1) index.html：年份下拉的容器加 .ctrl-year 以便隐藏
   2) style.css：#lt-detail.is-drill 下隐藏点阵区 / 概览小字 / 年份下拉 / 当日列表
   3) app.js：renderDrill() 开头判断下钻模式 → 清空点阵、改标题为游戏名、直接返回
*/
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const P = (f) => path.join(ROOT, 'docs', f);
const hits = [];
function sub(src, from, to, label, expect = 1) {
  const n = src.split(from).length - 1;
  if (n !== expect) throw new Error(`[${label}] 期望 ${expect} 次，实际 ${n} 次`);
  hits.push(label);
  return src.split(from).join(to);
}

/* ---------- index.html ---------- */
let html = fs.readFileSync(P('index.html'), 'utf8');
html = sub(html,
  `        <div class="ctrl">
          <select class="hx-year" id="hx-year" aria-label="选择年份"></select>
        </div>`,
  `        <div class="ctrl ctrl-year">
          <select class="hx-year" id="hx-year" aria-label="选择年份"></select>
        </div>`,
  'html:.ctrl-year');
fs.writeFileSync(P('index.html'), html);

/* ---------- style.css ---------- */
let css = fs.readFileSync(P('style.css'), 'utf8');
css = sub(css, `/* 悬停气泡：与插件同款「深色小卡 + 两行」，两套主题共用（浅色下也是深卡，读得清） */`,
  `/* 第 114 轮（用户：删除单个游戏下的热力图/点阵图，只保留最近游玩下的总点阵）：
   下钻某款游戏时，整块点阵连同概览小字、年份下拉、当日列表一起隐藏 ——
   那时面板只剩「← 返回 + 游戏名 + 该游戏的详情卡」。
   ⚠️ 不能用 [hidden]：.hx / .ctrl 自己的 display 会盖掉 UA 的 [hidden]{display:none}。 */
#lt-detail.is-drill .hx,
#lt-detail.is-drill .hx-sum,
#lt-detail.is-drill .ctrl-year,
#lt-detail.is-drill #hx-day { display: none; }

/* 悬停气泡：与插件同款「深色小卡 + 两行」，两套主题共用（浅色下也是深卡，读得清） */`,
  'css:is-drill');
fs.writeFileSync(P('style.css'), css);

/* ---------- app.js ---------- */
let js = fs.readFileSync(P('app.js'), 'utf8');

// renderDrill 开头：下钻模式的分支
js = sub(js,
  `    const appid = state.drill.appid;
    const grid = $('hx-grid');
    const monthsBox = $('hx-months');
    if (!grid || !monthsBox) return;

    const year = hxYear();`,
  `    const appid = state.drill.appid;
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
  'js:drill-branch');
fs.writeFileSync(P('app.js'), js);

console.log('OK 命中：\n - ' + hits.join('\n - '));
