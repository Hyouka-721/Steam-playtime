#!/usr/bin/env node
/**
 * 生成前端可直接消费的数据：docs/data/meta.json + docs/data/daily/YYYY-MM.json
 * 脱敏：meta 中绝不包含完整 steamid，只放 steamid_hash。
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { utcISO, shanghaiDate, addDays } from './lib/dates.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DAILY_DIR = path.join(ROOT, 'data', 'daily');
const OVERRIDE_DIR = path.join(ROOT, 'data', 'overrides');
const SNAP_DIR = path.join(ROOT, 'data', 'snapshots');
const ACH_DIR = path.join(ROOT, 'data', 'achievements');
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
  // date 取内容日：凌晨抓的快照（cron 延迟）data_date 已修正为前一天，站点应显示数据的真实截止日
  return { games: latest.games ?? {}, hash: latest.steamid_hash ?? null, date: latest.data_date ?? latest.date ?? null };
}

/** 读取最新一份成就快照（成就解锁是累积状态，最新一份即权威） */
function loadLatestAchievements() {
  if (!fs.existsSync(ACH_DIR)) return null;
  const files = fs.readdirSync(ACH_DIR).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  if (!files.length) return null;
  try {
    return readJson(path.join(ACH_DIR, files[files.length - 1]));
  } catch (e) {
    console.warn('[build] WARN: 成就快照解析失败:', e.message);
    return null;
  }
}

/** 判断一款游戏是否「全部成就已解锁」。
 *  边界：total 必须 > 0 —— 0/0（无成就系统的游戏或缺字段）不算全解锁，
 *  否则 0 === 0 会把一大批没有成就的游戏误判成"已全解锁"。 */
function isAchComplete(g) {
  const total = Number(g?.total);
  const unlocked = Number(g?.unlocked);
  if (!Number.isFinite(total) || total <= 0) return false;
  if (!Number.isFinite(unlocked)) return false;
  return unlocked >= total;
}

/** 生成 docs/data/achievements.json；无成就数据时写占位文件，前端据此显示待采集
 *  返回值：{ stats, perfect } —— stats 摘要写进 meta.ach_stats（首屏概览卡用），
 *          perfect 是「全成就已解锁」游戏的 appid 列表，写进 meta.ach_perfect
 *          （主界面胶囊图的金色描边要用，同样不能为此下载 285KB 明细）。
 *  2026-10-18 首屏优化：前端首屏只需要 unlocked/total/pct 三个数，不该为此下载
 *  285KB 的明细文件；把摘要同步进 meta（13KB）后，概览卡可立即渲染，明细推迟到
 *  用户真正打开「成就」页时再取。 */
function buildAchievementsDoc(nameOverrides) {
  const OUT_ACH = path.join(OUT_DIR, 'achievements.json');
  const ach = loadLatestAchievements();
  if (!ach) {
    fs.writeFileSync(OUT_ACH, JSON.stringify({ schema: 1, ready: false }, null, 2) + '\n', 'utf8');
    log('无成就数据，已写占位 docs/data/achievements.json');
    return null;
  }

  const games = {};
  const perfect = [];
  let unlockedTotal = 0;
  let totalTotal = 0;
  for (const [appid, g] of Object.entries(ach.games ?? {})) {
    const all = (g.achievements ?? []).slice();
    // 有时间戳的按解锁时间倒序；无时间戳（罕见）排在末尾
    all.sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0));
    games[appid] = {
      appid,
      name: nameOverrides[appid] ?? g.name ?? `App ${appid}`,
      total: g.total ?? 0,
      unlocked: g.unlocked ?? 0,
      achievements: all,
    };
    unlockedTotal += g.unlocked ?? 0;
    totalTotal += g.total ?? 0;
    if (isAchComplete(games[appid])) perfect.push(String(appid));
  }
  perfect.sort(); // 顺序稳定，便于比对差异

  const doc = {
    schema: 1,
    ready: true,
    generated_at: utcISO(),
    snapshot_date: ach.data_date ?? ach.date ?? null,
    stats: {
      unlocked: unlockedTotal,
      total: totalTotal,
      pct: totalTotal ? Math.round((unlockedTotal / totalTotal) * 1000) / 10 : 0,
      games: Object.keys(games).length,
    },
    games,
  };
  fs.writeFileSync(OUT_ACH, JSON.stringify(doc, null, 2) + '\n', 'utf8');
  log(`已生成 docs/data/achievements.json（${unlockedTotal}/${totalTotal}，${doc.stats.pct}%，${doc.stats.games} 款游戏，其中 ${perfect.length} 款已全解锁）`);
  return { stats: doc.stats, perfect }; // 摘要与全解锁列表写进 meta，供首屏直接使用
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
  for (const f of monthFiles) {
    const obj = readJson(path.join(DAILY_DIR, f));
    const days = {};
    for (const [date, day] of Object.entries(obj.days ?? {})) {
      const games = (day.games ?? []).map((g) => {
        const cn = nameOverrides[g.appid];
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

  // ---- 终身累计（playtime_forever，来自最新快照）----
  // 这才是「截至当日所有游戏的累计时长」的权威数据；games_index 只覆盖追踪期内有差分的游戏。
  const snapGames = snapMeta.games ?? {};
  const gamesLifetime = {};
  let lifetimeMinutes = 0;
  let lifetimePlayed = 0;
  for (const [appid, g] of Object.entries(snapGames)) {
    const minutes = g.playtime_forever ?? 0;
    lifetimeMinutes += minutes;
    if (minutes > 0) lifetimePlayed++;
    const rtime = g.rtime_last_played;
    gamesLifetime[appid] = {
      appid,
      name: nameOverrides[appid] ?? g.name ?? `App ${appid}`,
      img_icon_url: g.img_icon_url ?? null,
      lifetime_minutes: minutes,
      last_played: rtime ? shanghaiDate(new Date(rtime * 1000)) : null,
    };
  }

  // 「中文名覆盖」= 译名映射实际生效的游戏款数（统计确立在本命名字典上，而非 daily 里的出现次数）
  const overwritten = Object.entries(gamesLifetime).filter(
    ([appid, g]) => nameOverrides[appid] && g.name === nameOverrides[appid],
  ).length;

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

  // 先算成就摘要与全解锁列表：要写进 meta.ach_stats / meta.ach_perfect（首屏用），
  // 所以得早于 meta 落盘
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const { stats: achStats, perfect: achPerfect } = buildAchievementsDoc(nameOverrides) ?? { stats: null, perfect: [] };

  const meta = {
    schema: 2,
    tz: 'Asia/Shanghai',
    unit: 'minute',
    generated_at: utcISO(),
    generated_at_local: today,
    tracking_since: dates[0] ?? null,
    last_snapshot_date: snapMeta.date ?? null,
    steamid_hash: snapMeta.hash ?? null,
    months: monthFiles.map((f) => f.replace('.json', '')),
    // 成就摘要（2026-10-18 起）：前端首屏只读这里，不再为首屏一个百分比
    // 下载 285KB 的 achievements.json；明细按需加载
    ach_stats: achStats,
    // 「全部成就已解锁」的游戏 appid（2026-10-19 起）：主界面胶囊图要描一圈金光，
    // 但首屏不能为此下载明细，故构建期算好随 meta 下发
    ach_perfect: achPerfect,
    stats: {
      // 终身累计（截至最新快照日，Steam 服务器统计）
      lifetime_minutes: lifetimeMinutes,
      lifetime_hours: Math.round((lifetimeMinutes / 60) * 10) / 10,
      owned_games: Object.keys(snapGames).length,
      lifetime_played_games: lifetimePlayed,
      // 追踪期（差分）统计
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
    games_lifetime: gamesLifetime,
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

  log(`已生成 docs/data/meta.json（${dates.length} 天，${playedGames} 款追踪期游戏 / ${lifetimePlayed} 款终身有游玩）`);
  log(`终身累计 ${lifetimeMinutes} min（${meta.stats.lifetime_hours} h），追踪期累计 ${totalMinutes} min`);
  log('⚠ 校验：meta.json 中不含完整 steamid =', !JSON.stringify(meta).includes('7656119'));

  // 最后把首屏数据内联进 index.html（2026-10-18）：GitHub Pages 每个请求的
  // TTFB 要 320~580ms，为此让首屏少发 1~2 次请求比省几 KB 更值钱。
  // 单独拆成脚本是为了可以幂等重跑；这里自动串上，避免 CI 产出过期内联数据。
  const r = spawnSync(process.execPath, [path.join(__dirname, 'inline-boot.mjs')], { stdio: 'inherit' });
  if (r.status !== 0) log('⚠ inline-boot 失败，首屏将回退到 fetch 取数');
}

main();
