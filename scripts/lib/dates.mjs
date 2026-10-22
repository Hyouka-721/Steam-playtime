// 时区工具：所有「自然日」一律以 Asia/Shanghai 为准，禁止使用本地时区。
// 2026-10-22 清理：删掉全仓零引用的 monthOf / eachDate / humanMinutes；
// 把从未被外部 import 的 TZ、assertDateStr 降为模块内私有（仍在本文件内使用）。
// 保留 shanghaiDateTime / daysBetween —— 它们分别被 scripts/fetch.mjs 与 lib/diff-core.mjs 引用。
const TZ = 'Asia/Shanghai';

const dateFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const timeFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

/** "YYYY-MM-DD" —— 传入 Date 或 ISO 字符串 */
export function shanghaiDate(input = new Date()) {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) throw new Error(`invalid date: ${input}`);
  return dateFmt.format(d);
}

/** "YYYY-MM-DD HH:mm:ss" —— 用于日志 */
export function shanghaiDateTime(input = new Date()) {
  const d = input instanceof Date ? input : new Date(input);
  return timeFmt.format(d).replace(', ', ' ');
}

/** ISO8601 UTC，带 Z */
export function utcISO(input = new Date()) {
  const d = input instanceof Date ? input : new Date(input);
  return d.toISOString();
}

function assertDateStr(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    throw new Error(`expected YYYY-MM-DD, got: ${s}`);
  }
  return s;
}

// 用 UTC 中午做锚点，规避夏令时/跨时区误差（上海无 DST，但保持稳健）
function toUTCms(dateStr) {
  return Date.parse(`${dateStr}T12:00:00Z`);
}

/** b - a，单位为自然日，恒为正或 0（要求 b >= a） */
export function daysBetween(a, b) {
  assertDateStr(a);
  assertDateStr(b);
  return Math.round((toUTCms(b) - toUTCms(a)) / 86400000);
}

export function addDays(dateStr, n) {
  assertDateStr(dateStr);
  const d = new Date(toUTCms(dateStr) + n * 86400000);
  return d.toISOString().slice(0, 10);
}
