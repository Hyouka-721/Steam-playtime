#!/usr/bin/env node
/**
 * 采集一次快照 → data/snapshots/YYYY-MM-DD.json
 *
 * 环境变量：
 *   STEAM_API_KEY  必填，从 GitHub Secrets 注入，禁止出现在任何文件中
 *   STEAM_ID64     必填
 *   OVERRIDE_DATE  可选，YYYY-MM-DD（Asia/Shanghai），用于补录/指定基准日
 *   FORCE          可选，'true' 时覆盖同日已有快照
 *
 * 退出码：0 成功或跳过，1 失败（永不写入脏数据）
 *
 * 槽位保护：目标日期文件已存在但内容日不符（data_date 修正前旧代码按抓取日命名留下的
 *   错位文件）时，自动改名让位；无法让位则报错中止，绝不静默跳过吞掉当天数据。
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { addDays, shanghaiDate, shanghaiDateTime, utcISO } from './lib/dates.mjs';
import {
  fetchOwnedGames,
  fetchRecentlyPlayedGames,
  fetchPlayerAchievements,
  fetchAchievementSchema,
  mergeSources,
  SteamApiError,
} from './lib/steam.mjs';
import { detectPartial } from './lib/diff-core.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SNAP_DIR = path.join(ROOT, 'data', 'snapshots');
const ACH_DIR = path.join(ROOT, 'data', 'achievements');
const ACH_SCHEMA_CACHE = path.join(ROOT, 'data', 'cache', 'ach-schema');

const log = (...a) => console.log('[fetch]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 快照的内容归属日。
 * 背景：GitHub Actions 的 cron 延迟不可控（实测计划 23:30 会拖到次日凌晨 3 点才跑），
 * 凌晨抓到的总量实为「前一天全天结束」的状态。因此北京时间 0:00–11:59 抓取时，
 * 归属日记为前一天，避免差分整体错位一天。
 * OVERRIDE_DATE 显式补录时不受此修正影响。
 */
function resolveDataDate(now = new Date()) {
  const today = shanghaiDate(now);
  const hour = Number(shanghaiDateTime(now).slice(11, 13));
  return hour < 12 ? addDays(today, -1) : today;
}

function die(msg, err) {
  console.error('[fetch] FATAL:', msg);
  if (err?.stack) console.error(err.stack);
  process.exit(1);
}

// ---------- 成就采集 ----------

/** 读取成就 Schema 本地缓存。undefined = 无缓存；[] = 已确认无成就系统。 */
function readSchemaCache(appid) {
  const f = path.join(ACH_SCHEMA_CACHE, `${appid}.json`);
  if (!fs.existsSync(f)) return undefined;
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch {
    return undefined;
  }
}

function writeSchemaCache(appid, list) {
  fs.mkdirSync(ACH_SCHEMA_CACHE, { recursive: true });
  fs.writeFileSync(
    path.join(ACH_SCHEMA_CACHE, `${appid}.json`),
    JSON.stringify(list ?? []) + '\n',
    'utf8',
  );
}

/**
 * 对「玩过」（playtime_forever > 0）的游戏采集成就明细。
 * 未启动过的游戏不计入；无成就系统的游戏自动跳过（并缓存空 schema，次日不再重复请求）。
 * 成就 Schema 基本不变，缓存后每天只请求玩家进度部分。
 */
async function collectAchievements({ key, steamid, date, snapshot }) {
  const played = Object.values(snapshot.games).filter((g) => (g.playtime_forever ?? 0) > 0);
  log(`成就采集开始：${played.length} 款已游玩游戏（未启动的不计入）`);
  const games = {};

  for (let i = 0; i < played.length; i++) {
    const g = played[i];
    try {
      let schema = readSchemaCache(g.appid);
      if (schema === undefined) {
        schema = (await fetchAchievementSchema(key, g.appid)) ?? [];
        writeSchemaCache(g.appid, schema);
        await sleep(200);
      }
      if (!schema.length) continue; // 无成就系统的游戏

      const player = await fetchPlayerAchievements(key, steamid, g.appid);
      if (!player) continue;
      await sleep(200);

      const byApi = new Map(schema.map((a) => [a.api, a]));
      const unlocked = [];
      for (const p of player) {
        if (!p.achieved) continue;
        const s = byApi.get(p.api);
        unlocked.push({
          api: p.api,
          name: s?.name ?? p.api,
          desc: s?.desc ?? null,
          icon: s?.icon ?? null,
          ts: p.ts || null,
        });
      }
      games[g.appid] = {
        appid: g.appid,
        name: g.name,
        total: schema.length,
        unlocked: unlocked.length,
        achievements: unlocked,
      };
    } catch (e) {
      // 单款游戏失败只告警，不让整体成就采集中断
      console.warn(`[fetch] WARN 成就采集跳过 ${g.name}(${g.appid}):`, e.message);
    }
    if ((i + 1) % 10 === 0) log(`  成就进度 ${i + 1}/${played.length}`);
  }

  const out = {
    schema: 1,
    date,
    captured_at: utcISO(),
    captured_at_local: shanghaiDateTime(),
    game_count: Object.keys(games).length,
    games,
  };
  fs.mkdirSync(ACH_DIR, { recursive: true });
  fs.writeFileSync(path.join(ACH_DIR, `${date}.json`), JSON.stringify(out, null, 2) + '\n', 'utf8');
  const u = Object.values(games).reduce((a, g) => a + g.unlocked, 0);
  const t = Object.values(games).reduce((a, g) => a + g.total, 0);
  log(`成就数据已写入 data/achievements/${date}.json（${out.game_count} 款游戏，${u}/${t} 项）`);
}

/** 读取并解析单个快照文件；损坏返回 null */
function readSnapshotFile(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/** 读取最新的历史快照（用于 game_count 守卫） */
function readLatestSnapshot() {
  if (!fs.existsSync(SNAP_DIR)) return null;
  const files = fs
    .readdirSync(SNAP_DIR)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort();
  if (files.length === 0) return null;
  const file = files[files.length - 1];
  try {
    return JSON.parse(fs.readFileSync(path.join(SNAP_DIR, file), 'utf8'));
  } catch {
    return null;
  }
}

function buildSnapshot({ date, merged, gameCount, sharedCount }) {
  return {
    schema: 1,
    date,
    captured_at: utcISO(),
    captured_at_local: shanghaiDateTime(),
    source: process.env.GITHUB_ACTIONS === 'true' ? 'github-actions' : 'local',
    run_id: process.env.GITHUB_RUN_ID ?? null,
    steamid_hash: crypto
      .createHash('sha256')
      .update(String(process.env.STEAM_ID64))
      .digest('hex')
      .slice(0, 8),
    game_count: gameCount,
    played_game_count: Object.values(merged.games).filter((g) => g.playtime_forever > 0).length,
    shared_game_count: sharedCount,
    games: merged.games,
  };
}

async function main() {
  const key = process.env.STEAM_API_KEY?.trim();
  const steamid = process.env.STEAM_ID64?.trim();

  if (!key) die('缺少环境变量 STEAM_API_KEY（请配置 GitHub Secrets）');
  if (!steamid) die('缺少环境变量 STEAM_ID64（请配置 GitHub Secrets）');
  if (!/^\d{17}$/.test(steamid)) die(`STEAM_ID64 应为 17 位数字，当前为: ${steamid.length} 位`);

  const force = String(process.env.FORCE ?? '').toLowerCase() === 'true';
  const date = process.env.OVERRIDE_DATE?.trim() || resolveDataDate();

  // 把真实内容日暴露给 daily.yml 的提交信息，避免用「当前日期」掩盖归属错位
  if (process.env.GITHUB_ENV) {
    fs.appendFileSync(process.env.GITHUB_ENV, `DATA_DATE=${date}\n`, 'utf8');
  }

  const target = path.join(SNAP_DIR, `${date}.json`);
  if (fs.existsSync(target) && !force) {
    // 槽位被占。占用文件的内容日与目标一致 → 正常跳过（幂等，首抓者赢）。
    // 不一致 → data_date 修正前旧代码按「抓取当日」命名留下的错位文件；
    // 这种错位若直接跳过，会静默吞掉当天的数据——必须让位或大声失败。
    const occupant = readSnapshotFile(target);
    const occupantDate = occupant?.data_date ?? occupant?.date;
    if (occupantDate && occupantDate !== date) {
      const freed = path.join(SNAP_DIR, `${occupantDate}.json`);
      if (fs.existsSync(freed)) {
        die(
          `槽位冲突且无法自动让位：${date}.json 已存在，但其内容日是 ${occupantDate}，\n` +
            `而 ${occupantDate}.json 也被占用。继续跳过将永久丢失 ${date} 的数据。\n` +
            '请人工处理：把错位文件改名到其内容日对应的空位，或设 FORCE=true 明确覆盖后重跑。',
        );
      }
      fs.renameSync(target, freed);
      log(`槽位冲突：${date}.json 实为内容日 ${occupantDate} 的错位文件，已让位为 ${occupantDate}.json`);
      log(`继续采集内容日 ${date}`);
    } else {
      log(`快照 ${date}.json 已存在，跳过（需要覆盖请设 FORCE=true）`);
      return;
    }
  }

  log(`采集日期(Asia/Shanghai): ${date}${force ? ' [FORCE]' : ''}`);

  let owned;
  let recent;
  try {
    owned = await fetchOwnedGames(key, steamid);
    log(`GetOwnedGames OK: game_count=${owned.game_count}, games=${owned.games.length}`);
  } catch (e) {
    if (e instanceof SteamApiError && e.code === 'PRIVATE') {
      die(
        'Steam 返回空响应：请把「游戏详情」设为公开，并取消勾选"始终隐藏我的总游戏时长"，等待 2-5 分钟缓存后重试。',
        e,
      );
    }
    die(`GetOwnedGames 失败: ${e.message}`, e);
  }

  try {
    recent = await fetchRecentlyPlayedGames(key, steamid);
    log(`GetRecentlyPlayedGames OK: ${recent.games.length} 款近期游戏`);
  } catch (e) {
    // 补充源失败不致命：owned 已足够产出快照
    console.warn('[fetch] WARN: GetRecentlyPlayedGames 失败，本次不补充家庭共享游戏:', e.message);
    recent = { games: [] };
  }

  const merged = mergeSources(owned.games, recent.games);
  log(
    `合并后 ${Object.keys(merged.games).length} 款，其中家庭共享补充 ${merged.sharedCount} 款`,
  );

  // 守卫 #15：部分返回时必须中止，绝不写入污染基准
  const prev = readLatestSnapshot();
  if (prev) {
    const reason = detectPartial(prev.game_count, owned.game_count);
    if (reason) {
      die(`${reason}\n本次快照未写入，请稍后重试。`);
    }
    log(`守卫通过：上一份 game_count=${prev.game_count} → 本次 ${owned.game_count}`);
  } else {
    log('未发现历史快照，本次将作为 baseline（首份快照不产出当日时长）');
  }

  const snapshot = buildSnapshot({
    date,
    merged,
    gameCount: owned.game_count,
    sharedCount: merged.sharedCount,
  });

  fs.mkdirSync(SNAP_DIR, { recursive: true });
  fs.writeFileSync(target, JSON.stringify(snapshot, null, 2) + '\n', 'utf8');
  log(`已写入 data/snapshots/${date}.json (${snapshot.played_game_count} 款有游玩记录)`);

  // 成就采集：非致命环节，失败只告警，绝不影响快照与时长差分
  try {
    await collectAchievements({ key, steamid, date, snapshot });
  } catch (e) {
    console.warn('[fetch] WARN: 成就采集整体失败（时长数据不受影响）:', e.message);
  }

  // 顺手统计一下今天的情况，便于人工核对
  if (prev) {
    const deltas = [];
    for (const [appid, g] of Object.entries(snapshot.games)) {
      const p = prev.games?.[appid];
      if (!p) {
        if (g.playtime_forever > 0) deltas.push([g.name, g.playtime_forever, 'NEW']);
        continue;
      }
      const d = g.playtime_forever - p.playtime_forever;
      if (d > 0) deltas.push([g.name, d, '']);
    }
    deltas.sort((a, b) => b[1] - a[1]);
    if (deltas.length) {
      log('本次相对上一份快照的增量（分钟）:');
      for (const [name, d, tag] of deltas.slice(0, 10)) {
        console.log(`        ${String(d).padStart(6)}  ${name} ${tag}`);
      }
    } else {
      log('本次相对上一份快照无增量');
    }
  }
}

main().catch((e) => die('未预期的错误', e));
