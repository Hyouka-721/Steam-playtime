// Steam Web API 封装。零第三方依赖，仅用 Node 22 内置 fetch。
// 已实测确认的字段行为（2026-10-13）：
//   GetOwnedGames       -> response.{game_count, games[]}
//                          games[]: appid, name, img_icon_url, has_community_visible_stats,
//                          playtime_forever, playtime_windows_forever, playtime_mac_forever,
//                          playtime_linux_forever, playtime_deck_forever, rtime_last_played,
//                          content_descriptorids, playtime_disconnected
//                          ⚠ playtime_2weeks 为「条件字段」：仅近期玩过的游戏才返回。
//   GetRecentlyPlayedGames -> response.{total_count, games[]}
//                          games[]: appid, name, img_icon_url, playtime_2weeks,
//                          playtime_forever, playtime_*_forever
//                          ⚠ 不返回 rtime_last_played。
//   ⚠ 隐私「游戏详情」非公开时，GetOwnedGames 返回 HTTP 200 + {"response":{}}（静默为空）。

const BASE = 'https://api.steampowered.com/IPlayerService';
const STATS_BASE = 'https://api.steampowered.com/ISteamUserStats';

export class SteamApiError extends Error {
  constructor(code, message, detail) {
    super(message);
    this.name = 'SteamApiError';
    this.code = code; // 'NO_KEY' | 'BAD_RESPONSE' | 'PRIVATE' | 'HTTP' | 'NETWORK' | 'RATE_LIMIT'
    this.detail = detail ?? null;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(path, params, { attempts = 4, timeoutMs = 30000, base = BASE } = {}) {
  const url = new URL(`${base}/${path}/v1/`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  url.searchParams.set('format', 'json');

  let lastErr;
  for (let i = 1; i <= attempts; i++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'steam-playtime/1.0 (+github pages tracker)' },
        signal: ctrl.signal,
      });
      clearTimeout(timer);

      if (res.status === 429 || res.status === 503) {
        const retryAfter = Number(res.headers.get('retry-after')) || 0;
        const wait = Math.max(5000, retryAfter * 1000) * i;
        lastErr = new SteamApiError('RATE_LIMIT', `HTTP ${res.status} from ${path}`, { attempt: i });
        if (i < attempts) {
          await sleep(Math.min(wait, 60000));
          continue;
        }
        throw lastErr;
      }
      if (!res.ok) {
        throw new SteamApiError('HTTP', `${path} returned HTTP ${res.status}`, { status: res.status });
      }
      const json = await res.json();
      return json?.response ?? {};
    } catch (e) {
      clearTimeout(timer);
      if (e instanceof SteamApiError && e.code !== 'NETWORK') {
        lastErr = e;
        if (i < attempts) { await sleep(2000 * i); continue; }
        throw e;
      }
      lastErr = new SteamApiError('NETWORK', `${path} request failed: ${e.message}`, { attempt: i });
      if (i < attempts) { await sleep(2000 * i); continue; }
      throw lastErr;
    }
  }
  throw lastErr ?? new SteamApiError('NETWORK', `unknown failure calling ${path}`);
}

/** 取拥有（含已玩过的免费）游戏。返回 { game_count, games[] } 原始结构。 */
export async function fetchOwnedGames(key, steamid) {
  const res = await call('GetOwnedGames', {
    key,
    steamid,
    include_appinfo: 1,
    include_played_free_games: 1,
  });
  // {"response":{}} = 静默失败（隐私或非受限账户问题）；{"response":{"game_count":0}} = 真空库
  if (res.game_count === undefined) {
    throw new SteamApiError(
      'PRIVATE',
      'GetOwnedGames returned empty response. Steam 隐私「游戏详情」需设为公开（且不要勾选"始终隐藏总游戏时长"）。',
      { raw: res },
    );
  }
  if (!Array.isArray(res.games)) {
    throw new SteamApiError('BAD_RESPONSE', 'GetOwnedGames missing games[]', { raw: res });
  }
  return { game_count: res.game_count, games: res.games };
}

/** 取近两周玩过的游戏（含家庭共享）。返回 { total_count, games[] }。 */
export async function fetchRecentlyPlayedGames(key, steamid) {
  const res = await call('GetRecentlyPlayedGames', { key, steamid });
  if (!Array.isArray(res.games)) {
    throw new SteamApiError('BAD_RESPONSE', 'GetRecentlyPlayedGames missing games[]', { raw: res });
  }
  return { total_count: res.total_count ?? res.games.length, games: res.games };
}

/** 取玩家某款游戏的全部成就状态。无成就系统的游戏返回 HTTP 400 → 归一为 null。 */
export async function fetchPlayerAchievements(key, steamid, appid) {
  try {
    const res = await call('GetPlayerAchievements', { key, steamid, appid }, { base: STATS_BASE, attempts: 2 });
    const ps = res.playerstats;
    if (!ps || !Array.isArray(ps.achievements)) return null;
    return ps.achievements.map((a) => ({
      api: a.apiname,
      achieved: !!a.achieved,
      ts: Number(a.unlocktime) || 0,
    }));
  } catch (e) {
    if (e instanceof SteamApiError && e.code === 'HTTP') return null; // 多为无成就系统的游戏
    throw e;
  }
}

/** 取游戏成就 Schema（l=schinese 时 displayName/description 为中文）。无成就系统返回 null。 */
export async function fetchAchievementSchema(key, appid) {
  try {
    const res = await call('GetSchemaForGame', { key, appid, l: 'schinese' }, { base: STATS_BASE, attempts: 2 });
    const stats = res.game?.availableGameStats;
    if (!stats || !Array.isArray(stats.achievements)) return null;
    return stats.achievements.map((a) => ({
      api: a.name,
      name: a.displayName ?? a.name,
      desc: a.description ?? null,
      icon: a.icon ?? null,
    }));
  } catch (e) {
    if (e instanceof SteamApiError && e.code === 'HTTP') return null;
    throw e;
  }
}

/**
 * 合并两个来源：owned 为主体，recent 中 owned 缺失的补入并标记 origin='recent'。
 * ⚠ 实测：GetRecentlyPlayedGames 不返回 rtime_last_played，故 recent 来源该字段为 null。
 */
export function mergeSources(ownedGames, recentGames) {
  const out = {};
  let shared = 0;

  for (const g of ownedGames ?? []) {
    out[String(g.appid)] = {
      appid: String(g.appid),
      name: g.name ?? `App ${g.appid}`,
      img_icon_url: g.img_icon_url ?? null,
      playtime_forever: Number(g.playtime_forever) || 0,
      playtime_2weeks: g.playtime_2weeks === undefined ? null : Number(g.playtime_2weeks) || 0,
      rtime_last_played: g.rtime_last_played ?? null,
      origin: 'owned',
    };
  }
  for (const g of recentGames ?? []) {
    const id = String(g.appid);
    if (out[id]) {
      // 已在 owned 中：用 recent 的 playtime_2weeks 回填（若 owned 侧缺失）
      if (out[id].playtime_2weeks === null && g.playtime_2weeks !== undefined) {
        out[id].playtime_2weeks = Number(g.playtime_2weeks) || 0;
      }
      continue;
    }
    shared++;
    out[id] = {
      appid: id,
      name: g.name ?? `App ${id}`,
      img_icon_url: g.img_icon_url ?? null,
      playtime_forever: Number(g.playtime_forever) || 0,
      playtime_2weeks: g.playtime_2weeks === undefined ? null : Number(g.playtime_2weeks) || 0,
      rtime_last_played: null, // recent 接口不提供
      origin: 'recent',
    };
  }
  return { games: out, sharedCount: shared };
}
