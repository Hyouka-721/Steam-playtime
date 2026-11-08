/* _p115_css.mjs — 第 115 轮：CSS 清理（index.html 已在 _p115_edit.mjs 里改完） */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const FILE = path.join(ROOT, 'docs/style.css');
let s = fs.readFileSync(FILE, 'utf8');
const hits = [];
function sub(from, to, label) {
  const n = s.split(from).length - 1;
  if (n !== 1) throw new Error(`[${label}] 命中 ${n} 次`);
  s = s.split(from).join(to);
  hits.push(label);
}

// ① 榜单行不再可点
sub('gap: 14px; align-items: center; cursor: pointer;', 'gap: 14px; align-items: center;', 'css:rank-cursor');

// ② .is-drill 隐藏规则（第 114 轮加的，现在整条下钻线没了）
const drillStart = s.indexOf('/* 第 114 轮（用户：删除单个游戏下的热力图/点阵图，只保留最近游玩下的总点阵）：');
const drillEnd = s.indexOf('/* 悬停气泡：与插件同款「深色小卡 + 两行」');
if (drillStart < 0 || drillEnd < 0 || drillEnd < drillStart) throw new Error('css: is-drill 边界没找到');
s = s.slice(0, drillStart) + s.slice(drillEnd);
hits.push('css:is-drill');

// ③ .btn-back（只服务于那个返回按钮）
sub(`.btn-back {
  padding: 5px 12px; font-size: 13.5px; color: var(--text-dim);
  background: transparent; white-space: nowrap;
}
.btn-back:hover { color: var(--accent); border-color: var(--tint-border); background: var(--tint-1); }
`, '', 'css:btn-back');

// ④ .drill-more / .dm-* 整块（从 "#18 单游戏详情扩展" 注释到 "#11 视图切换过渡"）
const dmStart = s.indexOf('/* #18 单游戏详情扩展 */');
const dmEnd = s.indexOf('/* #11 视图切换过渡（View Transitions API');
if (dmStart < 0 || dmEnd < 0 || dmEnd < dmStart) throw new Error('css: dm 块边界没找到');
s = s.slice(0, dmStart) + s.slice(dmEnd);
hits.push('css:dm-block');

// ⑤ 480 媒体查询里的两条 dm 规则
sub(`  .dm-row { grid-template-columns: minmax(0, 1fr) 54px; }
  .dm-date { display: none; }
`, '', 'css:dm-480');

fs.writeFileSync(FILE, s);
console.log('OK CSS 命中：\n - ' + hits.join('\n - '));
