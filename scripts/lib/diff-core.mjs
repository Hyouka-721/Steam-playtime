// 差分核心（纯函数，无 IO，可被 node:test 直接覆盖 18 条边界用例）
import { daysBetween } from './dates.mjs';

// 2026-10-22 清理：这两个常量只在本文件内使用（外部从未 import），去掉 export。
const MINUTES_PER_DAY = 1440;
const TOLERANCE = 1.1; // 10% 容差

const ORDER = ['high', 'medium', 'low'];
const worse = (a, b) => (ORDER.indexOf(a) >= ORDER.indexOf(b) ? a : b);

/** 单游戏单日增量的合理上限 */
export function maxPerGame(spanDays) {
  return Math.round(MINUTES_PER_DAY * Math.max(1, spanDays) * TOLERANCE);
}

function emptyDay(date, spanDays = 1) {
  return {
    total_minutes: 0,
    span_days: Math.max(1, spanDays),
    confidence: 'high',
    source: 'auto',
    flags: [],
    games: [],
  };
}

/**
 * 首次快照：没有对比基准，无法计算增量。产出一条占位记录，保证日历连续。
 * 用例 #1
 */
// 同样只被本文件的 computeDay 调用，去掉 export
function firstDay(snapshot) {
  return {
    ...emptyDay(snapshot.date, 1),
    total_minutes: 0,
    confidence: 'low',
    flags: ['first_snapshot'],
  };
}

/**
 * 核心差分。
 * @param cur  当日快照 { date, games: { appid: {playtime_forever,...} } }
 * @param prev 上一份快照 { date, games }（同结构）
 * @param everSeen Set<string> 在 cur 之前所有快照中出现过的 appid，用于区分「真新游戏」与「家庭共享回归」
 */
export function computeDay(cur, prev, everSeen = new Set()) {
  if (!prev) return firstDay(cur);

  const spanDays = Math.max(1, daysBetween(prev.date, cur.date));
  const cap = maxPerGame(spanDays);
  const flags = new Set();
  const games = [];

  let confidence = 'high';
  if (spanDays === 2) confidence = 'medium';
  if (spanDays >= 3) confidence = 'low';

  const appids = new Set([...Object.keys(cur.games ?? {}), ...Object.keys(prev.games ?? {})]);

  for (const appid of appids) {
    const c = cur.games?.[appid];
    // 用例 #9 游戏从库中消失（退款/下架/家庭共享归还）：跳过，不影响增量
    if (!c) {
      flags.add('game_removed');
      continue;
    }
    const p = prev.games?.[appid];
    const ever = everSeen?.has?.(appid) ?? false;

    let minutes;
    let isNew = false;

    if (!p) {
      // 用例 #5/#6 新游戏；#10 家庭共享首现；#11 共享游戏隔 >14 天再玩
      isNew = true;
      minutes = Number(c.playtime_forever) || 0;
      flags.add(ever ? 'shared_reentry' : 'new_game');
      if (minutes > cap) {
        // 上一次快照中不存在的游戏，其 forever 可能是「累计」而非「当日」
        minutes = 0;
        flags.add('implausible_delta');
      } else if (confidence === 'high') {
        confidence = 'medium';
      }
    } else {
      minutes = (Number(c.playtime_forever) || 0) - (Number(p.playtime_forever) || 0);
      if (minutes < 0) {
        // 用例 #4 负增量（Steam 回滚 / 换号 / 共享归还）
        minutes = 0;
        flags.add('negative_delta');
      } else if (minutes > cap) {
        minutes = 0;
        flags.add('implausible_delta');
      }
    }

    if (minutes > 0) {
      games.push({ appid, name: c.name ?? `App ${appid}`, minutes, is_new: isNew });
    }
  }

  games.sort((a, b) => b.minutes - a.minutes || a.appid.localeCompare(b.appid));

  let total = games.reduce((s, g) => s + g.minutes, 0);

  // 用例 #18 全天总量超阈值：不拦截数据，仅降级标记
  const totalCap = cap;
  if (total > totalCap) {
    flags.add('total_implausible');
    confidence = worse(confidence, 'medium');
  }

  if (flags.has('negative_delta') || flags.has('implausible_delta')) {
    confidence = 'low';
  }
  if (spanDays > 1) flags.add('gap_filled');
  if (spanDays >= 3) flags.add('multi_day');

  return {
    total_minutes: total,
    span_days: spanDays,
    confidence,
    source: 'auto',
    flags: [...flags].sort(),
    games,
  };
}

/**
 * 应用手动补录。
 * mode = 'replace' -> 完全替换 (#12)
 * mode = 'merge'   -> 同 appid 以 manual 为准，其余保留 auto
 */
export function applyManual(autoDay, manual, date) {
  const list = (manual?.games ?? []).map((g) => ({
    appid: String(g.appid),
    name: g.name ?? `App ${g.appid}`,
    minutes: Math.max(0, Math.round(Number(g.minutes) || 0)),
    is_new: false,
  }));
  list.sort((a, b) => b.minutes - a.minutes || a.appid.localeCompare(b.appid));
  const total = list.reduce((s, g) => s + g.minutes, 0);

  if (manual?.mode === 'replace' || !autoDay) {
    return {
      total_minutes: total,
      span_days: autoDay?.span_days ?? 1,
      confidence: 'manual',
      source: 'manual',
      flags: ['manual_override'],
      games: list,
    };
  }

  const map = new Map((autoDay.games ?? []).map((g) => [g.appid, g]));
  for (const g of list) {
    const old = map.get(g.appid);
    map.set(g.appid, { ...g, is_new: old?.is_new ?? false });
  }
  const merged = [...map.values()].sort(
    (a, b) => b.minutes - a.minutes || a.appid.localeCompare(b.appid),
  );
  return {
    total_minutes: merged.reduce((s, g) => s + g.minutes, 0),
    span_days: autoDay.span_days,
    confidence: 'manual',
    source: 'merged',
    flags: [...new Set([...(autoDay.flags ?? []), 'manual_override'])].sort(),
    games: merged,
  };
}

/**
 * 用例 #15 部分返回守卫：game_count 骤降 > 20% 视为异常批次，拒绝写入。
 * 返回原因字符串，正常时返回 null。
 */export function detectPartial(prevGameCount, curGameCount) {
  if (prevGameCount == null || !Number.isFinite(prevGameCount)) return null;
  if (prevGameCount <= 0) return null;
  const threshold = Math.floor(prevGameCount * 0.8);
  if (curGameCount < threshold) {
    return `partial_snapshot: game_count ${curGameCount} < 80% of previous ${prevGameCount} (threshold ${threshold})`;
  }
  return null;
}

/**
 * 用例 #13 同日重跑：按日期去重，同一天保留「最后写入」的那份快照。
 * 输入可为任意顺序，输出按日期升序。
 */
export function dedupeByDate(snapshots) {
  const map = new Map();
  for (const s of [...snapshots].sort((a, b) => a.date.localeCompare(b.date))) {
    map.set(s.date, s);
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * 按内容日分组，产出参与差分的快照链。
 * 背景：GitHub Actions cron 常延迟数小时，凌晨抓的快照内容实为「前一天终态」，
 * 归属日已在 readSnapshots 阶段修正为内容日（data_date），因此同一内容日可能出现两份快照。
 * 规则：
 *   - 每组只保留「最晚一份」作为当日终态（playtime_forever 单调递增，中间份无信息损失）；
 *   - 首组额外保留「最早一份」作为差分基线（产出 first_snapshot 占位）。
 * 输入须已按抓取顺序（文件名日期）升序；输出保持该顺序。
 */
export function pickSnapshotChain(snapshots) {
  // 稳定排序（同内容日保持输入序 = 抓取序：早抓的基线在前）
  const sorted = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));
  const groups = new Map();
  for (const s of sorted) {
    if (!groups.has(s.date)) groups.set(s.date, []);
    groups.get(s.date).push(s);
  }
  const chain = [];
  let firstGroup = true;
  for (const g of groups.values()) {
    if (firstGroup) {
      chain.push(g[0]);
      if (g.length > 1) chain.push(g[g.length - 1]);
      firstGroup = false;
    } else {
      chain.push(g[g.length - 1]);
    }
  }
  return chain;
}

/** 合并同一天的两条差分记录（如基线占位 + 当日窗口增量）：增量相加、标记取并集 */
export function mergeDays(a, b) {
  const map = new Map();
  for (const g of [...(a.games ?? []), ...(b.games ?? [])]) {
    const old = map.get(g.appid);
    if (old) {
      old.minutes += g.minutes;
      old.is_new = old.is_new || g.is_new;
    } else {
      map.set(g.appid, { ...g });
    }
  }
  const games = [...map.values()].sort(
    (x, y) => y.minutes - x.minutes || x.appid.localeCompare(y.appid),
  );
  return {
    total_minutes: (a.total_minutes ?? 0) + (b.total_minutes ?? 0),
    span_days: Math.max(a.span_days ?? 1, b.span_days ?? 1),
    confidence: worse(a.confidence ?? 'high', b.confidence ?? 'high'),
    source: a.source === 'manual' || b.source === 'manual' ? 'manual' : 'auto',
    flags: [...new Set([...(a.flags ?? []), ...(b.flags ?? [])])].sort(),
    games,
  };
}

/**
 * 从全量快照重建所有日记录（幂等：每次都从第一份快照重算，方便修 bug 后回溯重放）。
 * @param snapshots 已按抓取顺序升序；date = 内容日（快照数据实际所属的自然日）
 * @param manuals   Map<'YYYY-MM-DD', manualObject>
 */
export function rebuildDays(snapshots, manuals = new Map()) {
  const list = pickSnapshotChain(snapshots);
  const everSeen = new Set();
  const out = new Map();

  for (let i = 0; i < list.length; i++) {
    const snap = list[i];
    const prev = i === 0 ? null : list[i - 1];
    let day = computeDay(snap, prev, everSeen);

    // 同一内容日可能有多个窗口（首日：基线占位 + 当日增量），合并而非覆盖
    const existing = out.get(snap.date);
    if (existing) day = mergeDays(existing, day);

    const manual = manuals.get(snap.date);
    if (manual) day = applyManual(day, manual, snap.date);

    out.set(snap.date, day);
    for (const appid of Object.keys(snap.games ?? {})) everSeen.add(appid);
  }
  return out;
}
