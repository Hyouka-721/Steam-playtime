/* _p114_verify6.mjs — 第 114 轮：verify6 两条判据改判
   ① 请求预算：内联数据「新鲜度」决定走哪条路径 —— 原判据只描述了「内联新鲜」那条，
      本地不 pull 每日 CI 快照、超过 36h 后就必然走兜底（meta.json + 补月），红得莫名其妙。
      改成按新鲜度分流：新鲜 → 0 个 meta.json + ≤1 个历史月；过期 → 只允许 meta.json + meta.months 全量。
   ② 下钻：第 114 轮起单游戏不再渲染点阵，只显示该游戏详情卡（用户要求）。
*/
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const FILE = path.join(ROOT, 'tests/verify/verify6.mjs');
let s = fs.readFileSync(FILE, 'utf8');
const hits = [];
function sub(from, to, label) {
  const n = s.split(from).length - 1;
  if (n !== 1) throw new Error(`[${label}] 命中 ${n} 次`);
  s = s.split(from).join(to);
  hits.push(label);
}

sub(
`const dataReqs = reqs.filter((r) => r.url.includes('/data/'));
const inlineMonth = (await page.evaluate(() => Object.keys(window.__BOOT?.daily ?? {})))[0] ?? null;
const monthlyReqs = dataReqs.filter((r) => /\\/data\\/daily\\/\\d{4}-\\d{2}\\.json$/.test(r.url));
const nonMonthReqs = dataReqs.filter((r) => !/\\/data\\/daily\\/\\d{4}-\\d{2}\\.json$/.test(r.url));
check('请求：首屏最多 1 个历史月 daily 请求（当月已内联），且不请求 meta.json / achievements',
  monthlyReqs.length <= 1
  && nonMonthReqs.length === 0
  && monthlyReqs.every((r) => !inlineMonth || !r.url.includes(inlineMonth)),
  \`内联=\${inlineMonth}；月请求=\${monthlyReqs.map((r) => r.url.split('/').pop()).join(',') || '无'}；其余=\${nonMonthReqs.length}\`);`,
`const dataReqs = reqs.filter((r) => r.url.includes('/data/'));
const bootState = await page.evaluate(() => {
  const b = window.__BOOT;
  const t = b && b.generated_at ? Date.parse(b.generated_at) : NaN;
  return {
    ageH: Number.isFinite(t) ? (Date.now() - t) / 3600000 : null,
    inline: Object.keys(b?.daily ?? {}),
    months: b?.meta?.months ?? [],
  };
});
const inlineMonth = bootState.inline[0] ?? null;
const fresh = bootState.ageH !== null && bootState.ageH < 36;   // 与 app.js 的 BOOT_MAX_AGE_H 同阈值
const monthlyReqs = dataReqs.filter((r) => /\\/data\\/daily\\/\\d{4}-\\d{2}\\.json$/.test(r.url));
const nonMonthReqs = dataReqs.filter((r) => !/\\/data\\/daily\\/\\d{4}-\\d{2}\\.json$/.test(r.url));
/* 第 114 轮改判：判据按「内联新鲜度」分流 —— 夜里 CI 会重写 docs/index.html 的内联数据，
   本地不 pull 时内联必然超过 36h，走的是兜底路径（meta.json + 补缺的月），
   这不是退化。原判据只写了快路径，导致「本地两天没 pull」就假红。 */
const reqOk = fresh
  ? (monthlyReqs.length <= 1
     && nonMonthReqs.length === 0
     && monthlyReqs.every((r) => !inlineMonth || !r.url.includes(inlineMonth)))
  : (nonMonthReqs.length === 1
     && /data\\/meta\\.json$/.test(nonMonthReqs[0].url)
     && monthlyReqs.length === bootState.months.length);
check('请求：首屏只拉必要数据（内联新鲜 → 零 meta.json + ≤1 个历史月；过期 → 兜底只补 meta.json + 缺的月）',
  reqOk,
  \`内联=\${inlineMonth}（\${fresh ? '新鲜' : '已过期 ' + Math.round(bootState.ageH) + 'h'}）；月请求=\${monthlyReqs.map((r) => r.url.split('/').pop()).join(',') || '无'}；其余=\${nonMonthReqs.map((r) => r.url.split('/').pop()).join(',') || '无'}\`);`,
'verify6:req');

sub(
`// 下钻：第 86 轮起是「月历热力图」，不再加载 ECharts
await page.click('#lt-list .rank-item');
await page.waitForTimeout(900);
const drill = await page.evaluate(() => ({
  open: !document.getElementById('lt-detail').hidden,
  cells: document.querySelectorAll('#hx-grid .hx-c').length,
  month: (document.getElementById('hx-sum').textContent || '').trim(),   // 第 111 轮：月份切换器 → 年份选择器
  sum: (document.getElementById('hx-sum').textContent || '').trim(),
  echarts: typeof window.echarts,
  legacyChart: !!document.getElementById('chart-drill'),
}));
check('回归：下钻打开一年点阵（生日格子 / 有汇总 / 无 ECharts）',
  drill.open && drill.cells >= 365 && /^\\d{4} 年 · /.test(drill.month) &&
  drill.sum.length > 0 && drill.echarts === 'undefined' && !drill.legacyChart,
  JSON.stringify(drill));`,
`// 下钻：第 114 轮起单游戏**不再渲染点阵**（用户要求），只显示该游戏详情卡；ECharts 永不加载
await page.click('#lt-list .rank-item');
await page.waitForTimeout(900);
const drill = await page.evaluate(() => ({
  open: !document.getElementById('lt-detail').hidden,
  cells: document.querySelectorAll('#hx-grid .hx-c').length,
  hxHidden: getComputedStyle(document.getElementById('hx-root')).display === 'none',
  share: !!document.querySelector('#drill-more .dm-share'),
  title: (document.querySelector('#lt-detail .hx-title')?.textContent || '').trim(),
  echarts: typeof window.echarts,
  legacyChart: !!document.getElementById('chart-drill'),
}));
check('回归：下钻显示该游戏详情卡、点阵不渲染（无 ECharts）',
  drill.open && drill.cells === 0 && drill.hxHidden && drill.share &&
  drill.title.length > 0 && drill.title !== '游玩热力图' &&
  drill.echarts === 'undefined' && !drill.legacyChart,
  JSON.stringify(drill));`,
'verify6:drill');

fs.writeFileSync(FILE, s);
console.log('OK 改判：\n - ' + hits.join('\n - '));
