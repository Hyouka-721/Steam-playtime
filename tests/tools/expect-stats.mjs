/**
 * 年报「6 卡」期望值的**独立复算**（第 107 轮新增）。
 *
 * 为什么要有它：`verify94/102/103` 与 `online91/94/95/102/103` 里曾经把
 * 124 部 / 7.70 分 / 46.0% / 115 天 / 3.6% / 7月·16 部 这些数字**写死**。
 * 用户每加一部片，这 8 个套件就一起变红 —— 红的不是代码，是数据。
 * 所以改成：期望值由本模块从 `docs/data/watch.json` 按 **watch.js 同一套口径**重算一遍，
 * 页面渲染结果必须与这份独立复算逐项相等。
 * 🔴 这不是放水：口径仍写在这里（含首尾的跨度天数、跨年合并的「几月」、并列取靠前的月份），
 *    页面算错就照样红 —— 变化只是「数字跟着数据走」，而不是「数字跟着上一轮快照走」。
 */
import fs from 'fs';

export function expectStats(dataFile) {
  const raw = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  const items = Array.isArray(raw) ? raw : (raw.items || []);
  const rated = items.filter((it) => Number(it.rating) > 0);
  const avg = rated.length ? rated.reduce((s, it) => s + Number(it.rating), 0) / rated.length : 0;

  /* 观影天数 / 密度：有记录的天数 ÷ 首末条跨度天数（含首尾，与 watch.js 一致） */
  const days = [...new Set(items.map((it) => String(it.watched_at || '')))].sort();
  const span = days.length
    ? Math.round((new Date(days[days.length - 1]) - new Date(days[0])) / 86400000) + 1
    : 0;
  const density = days.length && span ? (days.length / span) * 100 : 0;

  /* ≥8 分占比：分母是「有评分」的条目数 */
  const highCount = rated.filter((it) => Number(it.rating) >= 8).length;
  const highPct = rated.length ? (highCount / rated.length) * 100 : 0;

  /* 峰值月份：与月度面板同口径 —— 跨年合并的「几月」，并列时取靠前的月份 */
  const months = Array.from({ length: 12 }, (_, i) => ({ k: i + 1 + '月', v: 0 }));
  items.forEach((it) => {
    const m = /^\d{4}-(\d{2})-\d{2}$/.exec(String(it.watched_at || ''));
    if (m) {
      const i = parseInt(m[1], 10) - 1;
      if (i >= 0 && i < 12) months[i].v++;
    }
  });
  let peak = { k: '—', v: 0 };
  months.forEach((p) => { if (p.v > peak.v) peak = p; });

  return {
    total: String(items.length),
    avg: rated.length ? avg.toFixed(2) : '—',
    highPct: rated.length ? highPct.toFixed(1) : '—',
    days: String(days.length),
    density: days.length ? density.toFixed(1) : '—',
    peakK: peak.v ? peak.k : '—',
    peakV: peak.v ? peak.v + ' 部' : '',
    ratedCount: rated.length,
    summary: `${items.length} 部 / ${rated.length ? avg.toFixed(2) : '—'} / ${rated.length ? highPct.toFixed(1) : '—'}% / ${days.length} 天 / ${days.length ? density.toFixed(1) : '—'}% / ${peak.v ? peak.k + '·' + peak.v + ' 部' : '—'}`,
  };
}
