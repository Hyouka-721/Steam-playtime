// 时区工具：所有「自然日」一律以 Asia/Shanghai 为准，禁止使用本地时区。
export const TZ = 'Asia/Shanghai';

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

/** "YYYY-MM" */
export function monthOf(dateStr) {
  assertDateStr(dateStr);
  return dateStr.slice(0, 7);
}

export function assertDateStr(s) {
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

/** 返回从 start 到 end（含）之间的所有日期字符串 */
export function eachDate(start, end) {
  assertDateStr(start);
  assertDateStr(end);
  const out = [];
  const n = daysBetween(start, end);
  for (let i = 0; i <= n; i++) out.push(addDays(start, i));
  return out;
}

/** "7:30" 或 "18h 20m" */
export function humanMinutes(m) {
  const n = Math.round(Number(m) || 0);
  if (n < 60) return `${n} 分钟`;
  const h = Math.floor(n / 60);
  const rest = n % 60;
  return rest === 0 ? `${h} 小时` : `${h} 小时 ${rest} 分钟`;
}
