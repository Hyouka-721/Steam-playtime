// Steam Web API 封装。零第三方依赖，仅用 Node 22 内置 fetch。
// 已实测确认的字段行为（2026-10-13）：
//   GetOwnedGames       -> response.{game_count, games[]}
//   GetRecentlyPlayedGames -> response.{total_count, games[]}
//   GetPlayerAchievements -> playerstats.{steamID, gameName, achievements[]}   ← 顶层无 response！
//   GetSchemaForGame    -> game.{gameName, availableGameStats.{stats, achievements[]}} ← 顶层无 response！
//   ⚠ IPlayerService 系列payload 在 response 里，ISteamUserStats 系列在顶层自定义键里。
//     因此 call() 提供 raw 选项：raw=true 时原样返回整个 JSON，由调用方自行取键。
//   ⚠ GetSchemaForGame 现行版本是 v2（v1 为遗留版本），必须显式传 version: 2。
//   GetSchemaForGame 的 achievements[] 含 percent 字段，但**实测值恒为 null**
//     （2026-10-19 查证：2504 条成就全为 null，key 存在、值为空，不是解析 bug）。
//     真正的全球完成率要走 GetGlobalAchievementPercentagesForApp（无需 API key），
//     该接口返回 {"achievementpercentages":{"achievements":[{name,percent:"87.0"}]}}，
//     percent 是**字符串**，需 Number() 归一化。
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

async function call(path, params, { attempts = 4, timeoutMs = 30000, base = BASE, version = 1, raw = false } = {}) {
  const url = new URL(`${base}/${path}/v${version}/`);
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
      if (raw) return json ?? {};
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

/** 归一化 Steam 的 percent 字段（全球玩家完成率，float 百分比，如 45.6 = 45.6%）。
 *  ⚠ 必须先判 null/undefined/空串：Number(null) === 0、Number('') === 0，
 *  不拦就会被当成"0% 完成率"这个**有效值**，前端渲染出一片 0.0%。
 *  这正是 2026-10-19「成就完成率全为 0」事故的第二层成因。
 *  缺失 / 非数字 / 负数一律置 null，由前端决定不渲染。 */
function normalizePercent(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
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

/** 取玩家某款游戏的全部成就状态。无成就系统的游戏返回 HTTP 400 → 归一为 null。
 *  响应顶层键是 playerstats（无 response 包裹），必须 raw: true。 */
export async function fetchPlayerAchievements(key, steamid, appid) {
  try {
    const res = await call('GetPlayerAchievements', { key, steamid, appid }, { base: STATS_BASE, attempts: 2, raw: true });
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

/** 取游戏成就 Schema（l=schinese 时 displayName/description 为中文）。无成就系统返回 null。
 *  响应顶层键是 game（无 response 包裹），必须 raw: true；现行版本为 v2。 */
export async function fetchAchievementSchema(key, appid) {
  try {
    const res = await call('GetSchemaForGame', { key, appid, l: 'schinese' }, { base: STATS_BASE, attempts: 2, version: 2, raw: true });
    const stats = res.game?.availableGameStats;
    if (!stats || !Array.isArray(stats.achievements)) return null;
    // 注意：v2 的 a.percent 实测恒为 null（见文件头注释），此处保留只为兜底；
    // 真正的全球完成率由 fetchGlobalAchievementPercent 单独拉取并合并。
    return stats.achievements.map((a) => ({
      api: a.name,
      name: a.displayName ?? a.name,
      desc: a.description ?? null,
      icon: a.icon ?? null,
      percent: normalizePercent(a.percent),
    }));
  } catch (e) {
    if (e instanceof SteamApiError && e.code === 'HTTP') return null;
    throw e;
  }
}

/** 取某款游戏全部成就的**全球玩家完成率**。
 *  接口：ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2（**无需 API key**）
 *  返回：{ [apiname]: number }，如 { TIMBER: 87, NO_HOBO: 70.8 }
 *  无成就系统 / 无数据 → 空对象（不抛错，调用方按"无完成率"处理）。
 *  为什么不用 GetSchemaForGame 的 percent：实测该字段恒为 null（2026-10-19 查证
 *  2504 条成就无一非空），与字段级 bug 无关，是上游不填。 */
export async function fetchGlobalAchievementPercent(appid) {
  let res;
  try {
    res = await call('GetGlobalAchievementPercentagesForApp', { gameid: appid }, { base: STATS_BASE, attempts: 3, version: 2, raw: true });
  } catch (e) {
    // 400/403（无成就系统、私密游戏）按"无完成率"处理，不让单款游戏拖垮整体采集
    if (e instanceof SteamApiError && (e.code === 'HTTP' || e.code === 'BAD_RESPONSE')) return {};
    throw e;
  }
  const list = res?.achievementpercentages?.achievements;
  if (!Array.isArray(list)) return {};
  const out = {};
  for (const a of list) {
    if (!a?.name) continue;
    const n = normalizePercent(a.percent); // 接口给的是字符串 "87.0"
    if (n !== null) out[a.name] = n;
  }
  return out;
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
