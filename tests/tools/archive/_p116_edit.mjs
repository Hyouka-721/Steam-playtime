/* _p116_edit.mjs — 第 116 轮：自 tracking_since 起缺数据的日期按 0 分钟补齐（不再有「未采集」空缺） */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const f = path.join(ROOT, 'docs/app.js');
const raw = fs.readFileSync(f, 'utf8');
const crlf = raw.includes('\r\n');
let s = raw.replace(/\r\n/g, '\n');
const hits = [];
function sub(a, b, label) {
  const n = s.split(a).length - 1;
  if (n !== 1) throw new Error(`[${label}] 命中 ${n} 次`);
  s = s.split(a).join(b);
  hits.push(label);
}

/* 1) 新增口径助手：范围 = [tracking_since, last_snapshot_date] */
sub(`  /** 某天的总分钟数；返回 null = 那天还没有数据
      （第 115 轮：删除「下钻单个游戏」后不再有「某款游戏那天玩了多久」的口径） */
  function minutesOn(date) {
    const day = state.days.get(date);
    return day ? day.total_minutes ?? 0 : null;
  }
`,
`  /** 某天的总分钟数；返回 null = 那天没有记录
      （第 115 轮：删除「下钻单个游戏」后不再有「某款游戏那天玩了多久」的口径） */
  function minutesOn(date) {
    const day = state.days.get(date);
    return day ? day.total_minutes ?? 0 : null;
  }

  /* ---------- 统计口径（第 116 轮，用户：自 10.13 起缺数据的日子一律按 0 分钟补齐） ----------
     范围 = [meta.tracking_since, meta.last_snapshot_date]：
       · 范围内缺记录 → 明确按 0 分钟处理（.l0 灰点，可点，气泡「游玩时长：0 min」，当日列表「这天没有游玩记录」）
       · 范围外（开始统计之前 / 最新快照之后还没到的日子）→ 仍是 .lna「尚未记录」，不可点
     这样点阵里每个已统计日期都有确定的分钟数，口径统一，不会出现「空白格」被误读成漏采。 */
  function hxScope() {
    const since = state.meta?.tracking_since;
    const last = state.meta?.last_snapshot_date ?? state.allDates[state.allDates.length - 1];
    return since && last ? { since, last } : null;
  }

  /** 统计用分钟数：范围内缺记录补 0，范围外返回 null（未采集） */
  function hxMinutes(date) {
    const v = minutesOn(date);
    if (v !== null) return v;
    const sc = hxScope();
    return sc && date >= sc.since && date <= sc.last ? 0 : null;
  }
`, 'helper');

/* 2) 气泡 */
sub(`    const min = minutesOn(ds);
    tip.innerHTML =`, `    const min = hxMinutes(ds);
    tip.innerHTML =`, 'tip');

/* 3) 年视图扫描：按新口径取数 */
sub(`      const ds = addDaysStr(jan1, i);
      const min = minutesOn(ds);`, `      const ds = addDaysStr(jan1, i);
      const min = hxMinutes(ds);`, 'renderDrill-scan');

/* 4) 点格子守卫 */
sub(`        if (minutesOn(ds) === null) return false;`, `        if (hxMinutes(ds) === null) return false;`, 'pickDay');

/* 5) 当日列表空态文案：范围内缺记录 = 这天没玩，而不是「还没采集到数据」 */
sub(`      : \`<p class="hx-none">\${day ? '这天没有游玩记录。' : '这天还没有采集到数据。'}</p>\`;`,
  `      : \`<p class="hx-none">\${day || hxMinutes(ds) !== null ? '这天没有游玩记录。' : '这天还没有采集到数据。'}</p>\`;`,
  'day-empty-text');

fs.writeFileSync(f, crlf ? s.replace(/\n/g, '\r\n') : s);
console.log('OK 命中：\n - ' + hits.join('\n - '));
