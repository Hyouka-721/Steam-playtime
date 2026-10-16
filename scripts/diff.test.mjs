// 18 条边界用例的可执行验证：node --test scripts/
// 每条用例对应实施方案中的编号，改动算法前必须保证全绿。
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  computeDay,
  applyManual,
  detectPartial,
  dedupeByDate,
  rebuildDays,
  maxPerGame,
  mergeDays,
  pickSnapshotChain,
} from './lib/diff-core.mjs';
import { fetchOwnedGames, SteamApiError } from './lib/steam.mjs';

// ---- helpers ----
const snap = (date, games) => ({ date, games });
const game = (name, forever, extra = {}) => ({
  name,
  playtime_forever: forever,
  img_icon_url: null,
  playtime_2weeks: null,
  rtime_last_played: null,
  origin: 'owned',
  ...extra,
});
const totalOf = (d) => d.total_minutes;
const gamesById = (d) => Object.fromEntries(d.games.map((g) => [g.appid, g]));

describe('diff 边界用例', () => {
  // #1 首次快照
  test('#1 first_snapshot: 无基准时产出占位记录', () => {
    const d = computeDay(snap('2026-10-13', { 730: game('CS2', 786) }), null);
    assert.equal(totalOf(d), 0);
    assert.equal(d.confidence, 'low');
    assert.deepEqual(d.flags, ['first_snapshot']);
    assert.equal(d.games.length, 0);
  });

  // #2 正常游玩
  test('#2 normal: 正常增量', () => {
    const prev = snap('2026-10-12', { 730: game('CS2', 1000) });
    const cur = snap('2026-10-13', { 730: game('CS2', 1060) });
    const d = computeDay(cur, prev);
    assert.equal(totalOf(d), 60);
    assert.equal(d.span_days, 1);
    assert.equal(d.confidence, 'high');
    assert.deepEqual(d.flags, []);
    assert.equal(d.games[0].is_new, false);
  });

  // #3 零游玩
  test('#3 zero_play: 当天没玩仍写记录，保证日历连续', () => {
    const prev = snap('2026-10-12', { 730: game('CS2', 1000) });
    const cur = snap('2026-10-13', { 730: game('CS2', 1000) });
    const d = computeDay(cur, prev);
    assert.equal(totalOf(d), 0);
    assert.equal(d.confidence, 'high');
    assert.deepEqual(d.games, []);
  });

  // #4 负增量
  test('#4 negative_delta: 负增量归零并标记', () => {
    const prev = snap('2026-10-12', { 730: game('CS2', 1000) });
    const cur = snap('2026-10-13', { 730: game('CS2', 980) });
    const d = computeDay(cur, prev);
    assert.equal(totalOf(d), 0);
    assert.equal(d.confidence, 'low');
    assert.ok(d.flags.includes('negative_delta'));
  });

  // #5 新游戏小增量
  test('#5 new_game_small: 新游戏小增量采纳', () => {
    const prev = snap('2026-10-12', {});
    const cur = snap('2026-10-13', { 570: game('DL', 25) });
    const d = computeDay(cur, prev);
    assert.equal(totalOf(d), 25);
    assert.equal(d.confidence, 'medium');
    assert.ok(d.flags.includes('new_game'));
    assert.equal(d.games[0].is_new, true);
  });

  // #6 新游戏大增量
  test('#6 new_game_large: 超过上限视为累计值，记 0', () => {
    const prev = snap('2026-10-12', {});
    const cur = snap('2026-10-13', { 570: game('BG3', 8000) });
    const d = computeDay(cur, prev);
    assert.equal(totalOf(d), 0);
    assert.equal(d.confidence, 'low');
    assert.ok(d.flags.includes('implausible_delta'));
    assert.ok(d.flags.includes('new_game'));
  });

  // #7 漏采 1 天
  test('#7 gap_1day: span_days=2 并降置信度', () => {
    const prev = snap('2026-10-11', { 730: game('CS2', 1000) });
    const cur = snap('2026-10-13', { 730: game('CS2', 1200) });
    const d = computeDay(cur, prev);
    assert.equal(totalOf(d), 200);
    assert.equal(d.span_days, 2);
    assert.equal(d.confidence, 'medium');
    assert.ok(d.flags.includes('gap_filled'));
  });

  // #8 漏采 >=3 天
  test('#8 gap_multi_day: span_days=4 标 low + multi_day', () => {
    const prev = snap('2026-10-09', { 730: game('CS2', 1000) });
    const cur = snap('2026-10-13', { 730: game('CS2', 1900) });
    const d = computeDay(cur, prev);
    assert.equal(d.span_days, 4);
    assert.equal(d.confidence, 'low');
    assert.ok(d.flags.includes('multi_day'));
    // 900 < cap(1440*4*1.1) 故仍采纳
    assert.equal(totalOf(d), 900);
  });

  // #9 游戏消失
  test('#9 game_removed: 消失的游戏不影响其他增量', () => {
    const prev = snap('2026-10-12', { 999: game('Refunded', 500), 730: game('CS2', 1000) });
    const cur = snap('2026-10-13', { 730: game('CS2', 1060) });
    const d = computeDay(cur, prev);
    assert.equal(totalOf(d), 60);
    assert.ok(d.flags.includes('game_removed'));
  });

  // #10 家庭共享首现
  test('#10 shared_first: 未见过的 appid 判为 new_game', () => {
    const prev = snap('2026-10-12', { 730: game('CS2', 1000) });
    const cur = snap('2026-10-13', {
      730: game('CS2', 1000),
      246420: game('Kingdom Rush', 30, { origin: 'recent', rtime_last_played: null }),
    });
    const d = computeDay(cur, prev, new Set(['730']));
    assert.equal(totalOf(d), 30);
    assert.ok(d.flags.includes('new_game'));
    assert.ok(!d.flags.includes('shared_reentry'));
  });

  // #11 共享游戏隔 >14 天再玩
  test('#11 shared_reentry: 历史上出现过则标 shared_reentry', () => {
    const prev = snap('2026-10-12', { 730: game('CS2', 1000) });
    const cur = snap('2026-10-13', {
      730: game('CS2', 1000),
      1174180: game('RDR2', 9000, { origin: 'recent' }),
    });
    const d = computeDay(cur, prev, new Set(['730', '1174180']));
    assert.ok(d.flags.includes('shared_reentry'));
    assert.equal(totalOf(d), 0, '累计值不应被当作当日时长');
    assert.ok(d.flags.includes('implausible_delta'));
  });

  // #12 手动补录
  test('#12 manual_override: replace 与 merge 两种模式', () => {
    const prev = snap('2026-10-12', { 730: game('CS2', 1000) });
    const cur = snap('2026-10-13', { 730: game('CS2', 1060) });
    const auto = computeDay(cur, prev);

    const replaced = applyManual(auto, {
      date: '2026-10-13',
      mode: 'replace',
      games: [{ appid: '730', name: 'CS2', minutes: 120 }],
    });
    assert.equal(totalOf(replaced), 120);
    assert.equal(replaced.source, 'manual');
    assert.equal(replaced.confidence, 'manual');
    assert.ok(replaced.flags.includes('manual_override'));

    const merged = applyManual(auto, {
      date: '2026-10-13',
      mode: 'merge',
      games: [
        { appid: '730', name: 'CS2', minutes: 120 },
        { appid: '570', name: 'Dota 2', minutes: 45 },
      ],
    });
    assert.equal(totalOf(merged), 165, '730 被手动覆盖为 120，570 为新增');
    assert.equal(merged.source, 'merged');
    assert.equal(merged.confidence, 'manual');
    const byId = gamesById(merged);
    assert.equal(byId['730'].minutes, 120);
    assert.equal(byId['570'].minutes, 45);
  });

  // #13 同日重跑
  test('#13 same_day_rerun: 同一天多份快照只保留最后一份', () => {
    const list = dedupeByDate([
      snap('2026-10-13', { 730: game('CS2', 1000) }),
      snap('2026-10-12', { 730: game('CS2', 900) }),
      snap('2026-10-13', { 730: game('CS2', 1050) }),
    ]);
    assert.equal(list.length, 2);
    assert.deepEqual(list.map((s) => s.date), ['2026-10-12', '2026-10-13']);
    const rerun = list.find((s) => s.date === '2026-10-13');
    assert.equal(rerun.games['730'].playtime_forever, 1050, '应取重跑后的值');
  });

  // #14 API 失败
  test('#14 fetch_failed: 私有/空响应必须抛错而不是写入脏数据', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ response: {} }),
    });
    try {
      await assert.rejects(
        () => fetchOwnedGames('KEY', '76561190000000001'),
        (err) => err instanceof SteamApiError && err.code === 'PRIVATE',
        'GetOwnedGames 返回 {"response":{}} 时必须抛 PRIVATE 错误',
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // #15 部分返回
  test('#15 partial_snapshot: game_count 骤降 >20% 触发守卫', () => {
    assert.equal(detectPartial(null, 10), null, '无历史快照时不拦截');
    assert.equal(detectPartial(53, 50), null, '正常范围内放行');
    assert.equal(detectPartial(53, 43), null, '刚好不低于 80% 阈值(42) 放行');
    const bad = detectPartial(53, 40);
    assert.ok(bad && bad.includes('partial_snapshot'), `应返回 partial_snapshot，实际: ${bad}`);
    assert.ok(detectPartial(100, 10)?.includes('partial_snapshot'));
  });

  // #16 离线游玩
  test('#16 offline_play: Steam 已把离线时长并入 forever，正常计入', () => {
    const prev = snap('2026-10-12', { 570: game('Dota', 5000) });
    const cur = snap('2026-10-13', {
      570: game('Dota', 5090, { playtime_disconnected: 90 }),
    });
    const d = computeDay(cur, prev);
    assert.equal(totalOf(d), 90);
    assert.equal(d.confidence, 'high');
  });

  // #17 跨月
  test('#17 cross_month: rebuildDays 跨月连续且按日对齐', () => {
    const snapshots = [
      snap('2026-09-30', { 730: game('CS2', 1000) }),
      snap('2026-10-01', { 730: game('CS2', 1100) }),
      snap('2026-10-02', { 730: game('CS2', 1180) }),
    ];
    const days = rebuildDays(snapshots);
    assert.deepEqual([...days.keys()], ['2026-09-30', '2026-10-01', '2026-10-02']);
    assert.equal(days.get('2026-09-30').total_minutes, 0, '首份为基准');
    assert.equal(days.get('2026-10-01').total_minutes, 100);
    assert.equal(days.get('2026-10-02').total_minutes, 80);
  });

  // #18 总量超阈值
  test('#18 total_implausible: 单游戏合法但总和超阈值时降级', () => {
    const prev = snap('2026-10-12', { 730: game('CS2', 0), 570: game('Dota', 0) });
    const cur = snap('2026-10-13', { 730: game('CS2', 1000), 570: game('Dota', 1000) });
    const d = computeDay(cur, prev);
    // 单游戏 1000 < cap(1584) 通过，但 total=2000 > cap 触发总阈值标记
    assert.equal(totalOf(d), 2000);
    assert.ok(d.flags.includes('total_implausible'));
    assert.equal(d.confidence, 'medium');
  });
});

describe('阈值与辅助', () => {
  test('maxPerGame 随 span_days 线性放宽', () => {
    assert.equal(maxPerGame(1), 1584); // 1440 * 1.1
    assert.equal(maxPerGame(2), 3168);
    assert.equal(maxPerGame(4), 6336);
  });

  test('rebuildDays 幂等：重复重放结果一致', () => {
    const snapshots = [
      snap('2026-10-11', { 730: game('CS2', 1000) }),
      snap('2026-10-12', { 730: game('CS2', 1080) }),
      snap('2026-10-13', { 730: game('CS2', 1080), 570: game('Dota', 40) }),
    ];
    const a = rebuildDays(snapshots);
    const b = rebuildDays(snapshots);
    assert.deepEqual([...a], [...b]);
    assert.equal(a.get('2026-10-12').total_minutes, 80);
    assert.equal(a.get('2026-10-13').total_minutes, 40);
  });

  test('rebuildDays 会忽略 order 混乱的输入', () => {
    const snapshots = [
      snap('2026-10-13', { 730: game('CS2', 1080) }),
      snap('2026-10-11', { 730: game('CS2', 1000) }),
      snap('2026-10-12', { 730: game('CS2', 1050) }),
    ];
    const days = rebuildDays(snapshots);
    assert.deepEqual([...days.keys()], ['2026-10-11', '2026-10-12', '2026-10-13']);
    assert.equal(days.get('2026-10-13').total_minutes, 30);
  });

  // ---- 内容日归属（凌晨采集修正，2026-10-16） ----
  test('pickSnapshotChain: 同内容日两份快照，首组保留基线+终态，其余组只留终态', () => {
    const chain = pickSnapshotChain([
      snap('2026-10-13', { 730: game('CS2', 1000) }), // 基线，当天 19:18 抓
      snap('2026-10-13', { 730: game('CS2', 1049) }), // 次日凌晨 03:xx 抓（10-13 终态）
      snap('2026-10-14', { 730: game('CS2', 1131) }), // 10-14 终态
    ]);
    assert.equal(chain.length, 3);
    assert.deepEqual(
      chain.map((s) => s.games[730].playtime_forever),
      [1000, 1049, 1131],
    );
  });

  test('rebuildDays: 基线+凌晨终态合并，增量归前一天', () => {
    const days = rebuildDays([
      snap('2026-10-13', { 730: game('CS2', 1000) }), // 当天 19:18 基线
      snap('2026-10-13', { 730: game('CS2', 1049) }), // 归一化后同为 10-13 的凌晨终态
      snap('2026-10-14', { 730: game('CS2', 1131) }),
    ]);
    assert.deepEqual([...days.keys()], ['2026-10-13', '2026-10-14']);
    assert.equal(days.get('2026-10-13').total_minutes, 49);
    assert.equal(days.get('2026-10-14').total_minutes, 82);
    assert.ok(days.get('2026-10-13').flags.includes('first_snapshot'));
  });

  test('mergeDays: 同日多窗口增量相加、flags 取并集、confidence 就低', () => {
    const a = {
      total_minutes: 30, span_days: 1, confidence: 'high', source: 'auto', flags: [],
      games: [{ appid: '730', name: 'CS2', minutes: 30, is_new: false }],
    };
    const b = {
      total_minutes: 12, span_days: 1, confidence: 'low', source: 'auto', flags: ['negative_delta'],
      games: [{ appid: '730', name: 'CS2', minutes: 12, is_new: false }],
    };
    const m = mergeDays(a, b);
    assert.equal(m.total_minutes, 42);
    assert.equal(m.confidence, 'low');
    assert.deepEqual(m.flags, ['negative_delta']);
    assert.equal(m.games[0].minutes, 42);
  });
});
