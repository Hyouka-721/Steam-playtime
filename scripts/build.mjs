#!/usr/bin/env node
/**
 * 生成前端可直接消费的数据：docs/data/meta.json + docs/data/daily/YYYY-MM.json
 * 脱敏：meta 中绝不包含完整 steamid，只放 steamid_hash。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { utcISO, shanghaiDate, addDays } from './lib/dates.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DAILY_DIR = path.join(ROOT, 'data', 'daily');
const OVERRIDE_DIR = path.join(ROOT, 'data', 'overrides');
const SNAP_DIR = path.join(ROOT, 'data', 'snapshots');
const OUT_DIR = path.join(ROOT, 'docs', 'data');
const OUT_DAILY_DIR = path.join(OUT_DIR, 'daily');

const log = (...a) => console.log('[build]', ...a);

const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));

function loadNameOverrides() {
  const file = path.join(OVERRIDE_DIR, 'game-names.json');
  if (!fs.existsSync(file)) return {};
  try {
    return readJson(file);
  } catch (e) {
    console.warn('[build] WARN: overrides/game-names.json 解析失败:', e.message);
    return {};
  }
}

/** 最新快照里的游戏元信息（名称/图标），权威来源是 Steam */
function loadGameMetaFromLatestSnapshot() {
  if (!fs.existsSync(SNAP_DIR)) return {};
  const files = fs.readdirSync(SNAP_DIR).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  if (!files.length) return {};
  const latest = readJson(path.join(SNAP_DIR, files[files.length - 1]));
  return { games: latest.games ?? {}, hash: latest.steamid_hash ?? null, date: latest.date ?? null };
}

function computeStreaks(allDays) {
  const dates = Object.keys(allDays).sort();
  const active = new Set(dates.filter((d) => (allDays[d].total_minutes ?? 0) > 0));

  // 最长连续
  let longest = 0;
  let run = 0;
  for (const d of dates) {
    if (active.has(d)) {
      run++;
      longest = Math.max(longest, run);
    } else {
      run = 0;
    }
  }

  // 当前连续：从最后一个有记录的日期向前数
  const today = shanghaiDate();
  const lastDate = dates[dates.length - 1];
  const anchor = lastDate <= today ? lastDate : today;
  let current = 0;
  let probe = anchor;
  while (active.has(probe)) {
    current++;
    probe = addDays(probe, -1);
  }
  return { longest, current };
}

function main() {
  if (!fs.existsSync(DAILY_DIR)) {
    console.error('[build] 缺少 data/daily，请先运行 npm run diff');
    process.exit(1);
  }

  const nameOverrides = loadNameOverrides();
  const snapMeta = loadGameMetaFromLatestSnapshot();

  const monthFiles = fs.readdirSync(DAILY_DIR).filter((f) => /^\d{4}-\d{2}\.json$/.test(f)).sort();
  const allDays = {};
  for (const f of monthFiles) {
    const obj = readJson(path.join(DAILY_DIR, f));
    Object.assign(allDays, obj.days ?? {});
  }
  const dates = Object.keys(allDays).sort();

  fs.mkdirSync(OUT_DAILY_DIR, { recursive: true });

  // 逐月写出前端数据，同时应用中文名覆盖
  let overwritten = 0;
  for (const f of monthFiles) {
    const obj = readJson(path.join(DAILY_DIR, f));
    const days = {};
    for (const [date, day] of Object.entries(obj.days ?? {})) {
      const games = (day.games ?? []).map((g) => {
        const cn = nameOverrides[g.appid];
        if (cn && cn !== g.name) overwritten++;
        return { ...g, name: cn ?? g.name };
      });
      days[date] = { ...day, games };
    }
    fs.writeFileSync(
      path.join(OUT_DAILY_DIR, f),
      JSON.stringify({ ...obj, generated_at: utcISO(), days }, null, 2) + '\n',
      'utf8',
    );
  }

  // 汇总统计
  const gamesIndex = {};
  let totalMinutes = 0;
  let bestDay = null;
  let gapDays = 0;
  let lowConfidenceDays = 0;
  let manualDays = 0;

  for (const date of dates) {
    const day = allDays[date];
    totalMinutes += day.total_minutes ?? 0;
    if ((day.total_minutes ?? 0) > 0) {
      if (!bestDay || day.total_minutes > bestDay.minutes) {
        bestDay = { date, minutes: day.total_minutes };
      }
    }
    if ((day.span_days ?? 1) > 1) gapDays++;
    if (day.confidence === 'low') lowConfidenceDays++;
    if (day.source === 'manual' || day.source === 'merged') manualDays++;

    for (const g of day.games ?? []) {
      const e = (gamesIndex[g.appid] ??= {
        appid: g.appid,
        name: g.name,
        img_icon_url: snapMeta.games?.[g.appid]?.img_icon_url ?? null,
        total_minutes: 0,
        first_day: null,
        last_day: null,
      });
      e.total_minutes += g.minutes;
      if (!e.first_day || date < e.first_day) e.first_day = date;
      if (!e.last_day || date > e.last_day) e.last_day = date;
      // 名称以后续快照为准（Steam 可能改过名）
      if (snapMeta.games?.[g.appid]?.name) e.name = snapMeta.games[g.appid].name;
    }
  }

  for (const appid of Object.keys(gamesIndex)) {
    const cn = nameOverrides[appid];
    if (cn) gamesIndex[appid].name = cn;
  }

  const { longest, current } = computeStreaks(allDays);

  // 本周（周一起算，Asia/Shanghai）
  const today = shanghaiDate();
  const dow = new Date(`${today}T12:00:00Z`).getUTCDay(); // 0=周日
  const mondayOffset = (dow + 6) % 7;
  const weekStart = addDays(today, -mondayOffset);
  let weekMinutes = 0;
  for (const d of dates) {
    if (d >= weekStart && d <= today) weekMinutes += allDays[d].total_minutes ?? 0;
  }

  const activeDays = dates.filter((d) => (allDays[d].total_minutes ?? 0) > 0).length;
  const playedGames = Object.values(gamesIndex).filter((g) => g.total_minutes > 0).length;

  const meta = {
    schema: 1,
    tz: 'Asia/Shanghai',
    unit: 'minute',
    generated_at: utcISO(),
    generated_at_local: today,
    tracking_since: dates[0] ?? null,
    last_snapshot_date: snapMeta.date ?? null,
    steamid_hash: snapMeta.hash ?? null,
    months: monthFiles.map((f) => f.replace('.json', '')),
    stats: {
      total_minutes: totalMinutes,
      total_hours: Math.round((totalMinutes / 60) * 10) / 10,
      tracked_days: dates.length,
      active_days: activeDays,
      current_streak: current,
      longest_streak: longest,
      week_minutes: weekMinutes,
      played_games: playedGames,
      best_day: bestDay,
    },
    games_index: gamesIndex,
    health: {
      gap_days: gapDays,
      low_confidence_days: lowConfidenceDays,
      manual_days: manualDays,
      shared_game_count: Object.values(snapMeta.games ?? {}).filter((g) => g.origin === 'recent').length,
      name_overrides: overwritten,
      last_error: null,
    },
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'meta.json'), JSON.stringify(meta, null, 2) + '\n', 'utf8');

  log(`已生成 docs/data/meta.json（${dates.length} 天，${playedGames} 款游戏）`);
  log(`累计 ${totalMinutes} 分钟 / ${meta.stats.total_hours} 小时，当前连续 ${current} 天`);
  log('⚠ 校验：meta.json 中不含完整 steamid =', !JSON.stringify(meta).includes('7656119'));
}

main();
