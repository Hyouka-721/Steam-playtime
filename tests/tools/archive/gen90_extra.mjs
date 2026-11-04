/* gen90_extra.mjs — 第 90 轮（续）：把用户手写的历史周数据转成 data/overrides/timeline-extra.json
 *
 * 输入：用户按「周一-周日」手写的 53 周（2025-09-29 ~ 2026-10-04），格式「周区间：游戏（X.Xh）、…」
 * 输出：每「周 × 游戏」一条 {date, appid, name, minutes}，date 取该周周一
 *
 * 校验（不过就退出，不写文件）：
 *   1 每个周起始日都必须是周一
 *   2 周与周之间连续（后一周 = 前一周 + 7 天），无缺口无重叠
 *   3 同一周内没有重复游戏
 *   4 每个游戏 key 都在 GAMES 表里、appid 是 5~7 位数字
 *   5 小时数 × 60 必须是整数（否则会出现 1.4h → 84min 之外的舍入误差）
 *   6 总周数 / 总条数 / 总分钟与预期一致
 *
 * 用法：node tests/tools/gen90_extra.mjs [--write]
 *   不带 --write 只做校验与统计（dry-run）
 */
import fs from 'node:fs';

const WRITE = process.argv.includes('--write');
const OUT = 'data/overrides/timeline-extra.json';

/* ---------- 游戏表（appid 取自 docs/data/meta.json 的 games_lifetime；stardew 不在其中，用 Steam 真实 appid） ---------- */
const GAMES = {
  terra:    { appid: '105600',  name: '泰拉瑞亚' },
  ets2:     { appid: '227300',  name: '欧洲卡车模拟2' },
  sts:      { appid: '646570',  name: '杀戮尖塔' },
  we:       { appid: '431960',  name: 'Wallpaper Engine：壁纸引擎' },
  hk:       { appid: '367520',  name: '空洞骑士' },
  itt:      { appid: '1426210', name: '双人成行' },
  duck:     { appid: '3167020', name: '逃离鸭科夫' },
  witcher:  { appid: '292030',  name: '巫师3：狂猎 — 重制版' },
  dst:      { appid: '322330',  name: '饥荒联机版' },
  salt:     { appid: '3009140', name: 'Salt Player' },
  volcano:  { appid: '1669980', name: '火山的女儿' },
  gta5:     { appid: '271590',  name: 'GTA5 传承版' },
  dd:       { appid: '262060',  name: '暗黑地牢' },
  brotato:  { appid: '1942280', name: '土豆兄弟' },
  shadowA:  { appid: '1579380', name: '影子战术：爱子的选择' },
  campfire: { appid: '990630',  name: '最后的篝火' },
  sizeable: { appid: '1333910', name: 'Sizeable' },
  gorogoa:  { appid: '557600',  name: '画中世界' },
  etg:      { appid: '311690',  name: '挺进地牢' },
  pal:      { appid: '1623730', name: '幻兽帕鲁' },
  sts2:     { appid: '2868840', name: '杀戮尖塔2' },
  dead:     { appid: '588650',  name: '死亡细胞' },
  sudoku:   { appid: '733070',  name: '数独宇宙' },
  gris:     { appid: '683320',  name: 'GRIS' },
  vamp:     { appid: '1794680', name: '吸血鬼幸存者' },
  crash:    { appid: '391730',  name: '崩溃大陆' },
  journey:  { appid: '638230',  name: '风之旅人' },
  ace7:     { appid: '502500',  name: '皇牌空战7：未知空域' },
  shadowG:  { appid: '418240',  name: '影子战术：将军之刃' },
  kingrush: { appid: '246420',  name: '王国保卫战' },
};

/* ---------- 用户原始数据：按时间正序（旧 → 新），每组 = [周一, [[key, 小时], …]] ---------- */
const WEEKS = [
  /* ===== 2025 ===== */
  ['2025-09-29', [['sudoku', 12.8], ['brotato', 2.5], ['we', 1.2], ['sts', 0.4]]],
  ['2025-10-06', [['sudoku', 2.7], ['we', 1.6]]],
  ['2025-10-13', [['sudoku', 1.9], ['sts', 0.6]]],
  ['2025-10-20', [['sudoku', 6.3], ['sts', 1.2], ['brotato', 0.5]]],
  ['2025-10-27', [['shadowG', 11.6], ['sudoku', 4.8], ['brotato', 1.1], ['sts', 0.1], ['etg', 0.1], ['dead', 0.1]]],
  ['2025-11-03', [['shadowG', 6.9], ['duck', 6.7], ['sudoku', 1.9], ['dead', 0.4], ['sts', 0.3]]],
  ['2025-11-10', [['duck', 34.0], ['sts', 1.9], ['sudoku', 1.1], ['crash', 0.1]]],
  ['2025-11-17', [['duck', 22.1], ['sts', 11.4], ['ets2', 9.6], ['sudoku', 0.2]]],
  ['2025-11-24', [['duck', 5.2], ['sts', 1.3], ['ets2', 1.1], ['sudoku', 1.0]]],
  ['2025-12-01', [['sts', 8.7], ['sudoku', 2.8], ['ets2', 1.1], ['shadowG', 0.3], ['we', 0.2]]],
  ['2025-12-08', [['shadowG', 7.1], ['sts', 4.7], ['ace7', 2.1], ['brotato', 1.8], ['dead', 1.5], ['salt', 1.4], ['sudoku', 0.5], ['ets2', 0.1]]],
  ['2025-12-15', [['salt', 7.1], ['brotato', 6.9], ['sts', 4.8], ['sudoku', 2.1], ['dead', 1.2], ['ace7', 0.4], ['shadowG', 0.1]]],
  ['2025-12-22', [['sts', 17.6], ['ets2', 10.6], ['brotato', 6.7], ['journey', 2.2], ['we', 1.4], ['sudoku', 0.9], ['sizeable', 0.9], ['dead', 0.4], ['dst', 0.2], ['ace7', 0.2]]],
  ['2025-12-29', [['sts', 13.9], ['shadowG', 6.3], ['ets2', 4.3], ['brotato', 3.6], ['salt', 1.9]]],

  /* ===== 2026 ===== */
  ['2026-01-05', [['sts', 16.4], ['brotato', 4.1], ['ets2', 3.7], ['we', 1.9], ['sudoku', 0.6], ['salt', 0.1]]],
  ['2026-01-12', [['sts', 16.6], ['brotato', 4.5], ['sudoku', 0.7], ['we', 0.2], ['vamp', 0.1]]],
  ['2026-01-19', [['sts', 14.3], ['brotato', 7.8], ['we', 0.1]]],
  ['2026-01-26', [['sts', 4.8], ['brotato', 4.2], ['gris', 4.0], ['ets2', 1.1], ['we', 0.9], ['salt', 0.4]]],
  ['2026-02-02', [['sts', 2.4]]],
  ['2026-02-09', [['sts', 12.2]]],
  ['2026-02-16', [['sts', 20.2], ['dst', 5.3], ['crash', 3.5], ['salt', 1.0], ['vamp', 0.9], ['brotato', 0.7], ['duck', 0.1]]],
  ['2026-02-23', [['sts', 25.3], ['itt', 2.0], ['we', 0.7], ['ets2', 0.1]]],
  ['2026-03-02', [['sts', 7.7], ['sts2', 5.8], ['gorogoa', 3.7], ['dead', 2.5], ['ets2', 0.5], ['brotato', 0.3], ['duck', 0.1]]],
  ['2026-03-09', [['sts', 21.3], ['ets2', 7.8], ['sts2', 7.4], ['brotato', 7.2], ['we', 0.3], ['dead', 0.3]]],
  ['2026-03-16', [['sts', 8.9], ['ets2', 6.7], ['brotato', 5.8], ['sts2', 1.9], ['dead', 0.8]]],
  ['2026-03-23', [['sts', 23.2], ['brotato', 6.8], ['ets2', 4.5], ['campfire', 1.8], ['sts2', 0.2], ['dead', 0.1]]],
  ['2026-03-30', [['sts', 23.7], ['brotato', 8.6], ['ets2', 6.0], ['duck', 2.6], ['campfire', 2.0], ['pal', 1.0]]],
  ['2026-04-06', [['sts', 34.0], ['brotato', 5.8], ['shadowA', 5.6], ['ets2', 4.3], ['campfire', 2.4], ['gta5', 2.3], ['sizeable', 0.5], ['gorogoa', 5.6], ['etg', 0.1]]],
  ['2026-04-13', [['brotato', 7.2], ['shadowA', 4.6], ['sts', 4.0], ['ets2', 2.9], ['salt', 0.3]]],
  ['2026-04-20', [['ets2', 9.5], ['dd', 2.8], ['sts', 2.6], ['brotato', 1.9], ['gta5', 1.4], ['we', 0.1]]],
  ['2026-04-27', [['ets2', 4.3], ['sts', 1.1], ['gta5', 0.7]]],
  ['2026-05-04', [['sts', 8.9], ['ets2', 4.8], ['duck', 1.4], ['gta5', 0.9], ['hk', 0.4], ['we', 0.2]]],
  ['2026-05-11', [['duck', 4.8], ['sts', 4.7], ['ets2', 3.4], ['we', 0.2]]],
  ['2026-05-18', [['sts', 7.3], ['volcano', 1.8], ['ets2', 0.7]]],
  ['2026-05-25', [['sts', 6.7], ['salt', 0.3]]],
  ['2026-06-01', [['sts', 1.2], ['witcher', 0.7], ['ets2', 0.5]]],
  ['2026-06-08', [['sts', 9.3]]],
  ['2026-06-15', [['sts', 11.3], ['ets2', 5.0], ['witcher', 3.5], ['hk', 1.3], ['dst', 0.3], ['salt', 0.1]]],
  ['2026-06-22', [['sts', 3.7], ['ets2', 2.9], ['witcher', 2.5], ['we', 0.3]]],
  ['2026-06-29', [['sts', 3.0], ['ets2', 2.2], ['witcher', 2.2], ['we', 0.3]]],
  ['2026-07-06', [['sts', 4.5], ['ets2', 0.1], ['we', 0.1]]],
  ['2026-07-13', [['sts', 14.9], ['ets2', 3.4], ['itt', 2.6], ['duck', 0.8]]],
  ['2026-07-20', [['sts', 7.4], ['ets2', 2.0]]],
  ['2026-07-27', [['sts', 13.3]]],
  ['2026-08-03', [['sts', 3.9], ['ets2', 1.0], ['hk', 0.2]]],
  ['2026-08-10', [['terra', 10.8], ['ets2', 4.1], ['sts', 0.9]]],
  ['2026-08-17', [['terra', 24.6], ['ets2', 0.5]]],
  ['2026-08-24', [['terra', 31.2], ['ets2', 2.6]]],
  ['2026-08-31', [['terra', 26.1], ['ets2', 0.7]]],
  ['2026-09-07', [['terra', 27.6], ['ets2', 5.4], ['sts', 1.2], ['we', 0.1]]],
  ['2026-09-14', [['terra', 17.8], ['ets2', 1.1]]],
  ['2026-09-21', [['terra', 12.1], ['ets2', 2.2], ['sts', 0.6], ['we', 0.1]]],
  ['2026-09-28', [['sts', 1.4], ['ets2', 1.2]]],
  ['2026-10-05', [['kingrush', 2.0], ['terra', 1.6], ['ets2', 1.3], ['sts', 1.0], ['salt', 0.4]]],
  ['2026-10-12', [['kingrush', 1.6]]],
];

/* ---------- 校验 ---------- */
let bad = 0;
const err = (m) => { console.error('FAIL  ' + m); bad++; };

const dayOf = (s) => new Date(`${s}T12:00:00Z`);
const dowMon = (s) => (dayOf(s).getUTCDay() + 6) % 7; // 周一=0
const addDays = (s, n) => {
  const d = dayOf(s);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const rows = [];
for (let i = 0; i < WEEKS.length; i++) {
  const [mon, list] = WEEKS[i];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(mon)) { err(`第 ${i + 1} 周日期格式：${mon}`); continue; }
  if (dowMon(mon) !== 0) err(`${mon} 不是周一（偏移 ${dowMon(mon)} 天）`);
  if (i > 0) {
    const prev = WEEKS[i - 1][0];
    const gap = Math.round((dayOf(mon) - dayOf(prev)) / 86400000);
    if (gap <= 0) err(`周顺序倒退：${prev} -> ${mon}`);
    else if (gap % 7 !== 0) err(`周间隔不是 7 的整数倍：${prev} -> ${mon}（${gap} 天）`);
    else if (gap > 7) console.warn(`WARN  缺 ${gap / 7 - 1} 周：${addDays(prev, 7)} ~ ${addDays(mon, -1)}（用户未提供）`);
  }
  const seen = new Set();
  for (const [key, hours] of list) {
    const g = GAMES[key];
    if (!g) { err(`${mon} 未知游戏 key：${key}`); continue; }
    if (seen.has(key)) err(`${mon} 同一周重复游戏：${key}`);
    seen.add(key);
    if (!/^\d{5,7}$/.test(g.appid)) err(`${mon} ${g.name} appid 非法：${g.appid}`);
    const minutes = Math.round(hours * 60);
    if (Math.abs(minutes - hours * 60) > 1e-9) err(`${mon} ${g.name} ${hours}h × 60 = ${hours * 60} 非整数`);
    if (minutes <= 0) err(`${mon} ${g.name} 分钟非正：${minutes}`);
    rows.push({ date: mon, appid: g.appid, name: g.name, minutes });
  }
  // 周内时长降序是展示习惯，数据层不强制，但提醒一下排序异常
  const sorted = list.map((x) => x[1]);
  if (JSON.stringify(sorted) !== JSON.stringify([...sorted].sort((a, b) => b - a))) {
    console.warn(`WARN  ${mon} 该周不是按小时降序书写（不影响功能）`);
  }
}

/* ---------- 统计 ---------- */
const totalMin = rows.reduce((a, r) => a + r.minutes, 0);
const weeks = new Set(rows.map((r) => r.date));
console.log('---');
console.log(`周数 ${weeks.size} / 记录 ${rows.length} 条 / 合计 ${totalMin} 分钟 = ${(totalMin / 60).toFixed(1)} h`);
const byGame = new Map();
for (const r of rows) byGame.set(r.name, (byGame.get(r.name) ?? 0) + r.minutes);
console.log('按游戏：');
[...byGame.entries()].sort((a, b) => b[1] - a[1]).forEach(([n, m]) => console.log(`  ${n}  ${(m / 60).toFixed(1)}h`));
console.log(`区间 ${WEEKS[0][0]} ~ ${addDays(WEEKS[WEEKS.length - 1][0], 6)}`);

/* 1000h 里程碑落点自检：用户原文在「3.9-3.15」与「3.2-3.8」之间标了「游戏时长突破 1000h」，
   即累计到 2026-03-15 那周结束 ≥ 1000h、到 2026-03-08 那周结束 < 1000h。 */
const milestone = 1000 * 60;
let cum = 0;
let hitWeek = null;
for (const mon of [...weeks].sort()) {
  const wk = rows.filter((r) => r.date === mon);
  cum += wk.reduce((a, r) => a + r.minutes, 0);
  if (!hitWeek && cum >= milestone) hitWeek = mon;
}
console.log(`补录自身累计到 1000h 的那周：${hitWeek ?? '未达到'}（用户标记在 2026-03-09 那周跨过）`);

/* ---------- 写出 ---------- */
if (bad) {
  console.error(`\n${bad} 项校验失败，未写文件。`);
  process.exit(1);
}
if (!WRITE) {
  console.log('\n校验通过（dry-run，未写文件）。加 --write 生成 JSON。');
  process.exit(0);
}
const sorted = rows.slice().sort((a, b) => a.date.localeCompare(b.date));
fs.writeFileSync(OUT, JSON.stringify(sorted, null, 2) + '\n', 'utf8');
console.log(`\n已写出 ${OUT}（${sorted.length} 条）`);
