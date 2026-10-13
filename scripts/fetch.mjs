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
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { shanghaiDate, shanghaiDateTime, utcISO } from './lib/dates.mjs';
import {
  fetchOwnedGames,
  fetchRecentlyPlayedGames,
  mergeSources,
  SteamApiError,
} from './lib/steam.mjs';
import { detectPartial } from './lib/diff-core.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SNAP_DIR = path.join(ROOT, 'data', 'snapshots');

const log = (...a) => console.log('[fetch]', ...a);

function die(msg, err) {
  console.error('[fetch] FATAL:', msg);
  if (err?.stack) console.error(err.stack);
  process.exit(1);
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
  const date = process.env.OVERRIDE_DATE?.trim() || shanghaiDate();

  const target = path.join(SNAP_DIR, `${date}.json`);
  if (fs.existsSync(target) && !force) {
    log(`快照 ${date}.json 已存在，跳过（需要覆盖请设 FORCE=true）`);
    return;
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
