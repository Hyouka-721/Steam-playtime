// 成就接口响应封装的回归验证（2026-10-17 事故复盘）：
// ISteamUserStats 系列的 payload 在顶层自定义键（game / playerstats），不在 response 里。
// call() 曾一律取 json.response，导致两个成就接口永远拿到 {}，
// 全部游戏被误判为「无成就系统」并缓存空 Schema，站点成就卡永远显示「—」。
// 本文件锁死：raw 透传、GetSchemaForGame 必须走 v2、字段映射正确、IPlayerService 默认行为不变。
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { fetchAchievementSchema, fetchPlayerAchievements, fetchOwnedGames } from './lib/steam.mjs';

/** 临时替换 globalThis.fetch，返回恢复函数 */
const mockFetch = (handler) => {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  return () => {
    globalThis.fetch = original;
  };
};

const jsonRes = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: new Headers(),
  json: async () => body,
});

describe('成就接口响应封装（2026-10-17 回归）', () => {
  test('GetSchemaForGame: 顶层 game.availableGameStats 必须正确解析（事故核心）', async () => {
    let calledUrl = '';
    const restore = mockFetch(async (url) => {
      calledUrl = String(url);
      return jsonRes({
        game: {
          gameName: 'Test Game',
          availableGameStats: {
            achievements: [
              { name: 'ACH_ONE', displayName: '成就一', description: '描述一', icon: 'http://icon/1.jpg', percent: 45.6 },
              { name: 'ACH_TWO', displayName: '成就二', description: '描述二', icon: 'http://icon/2.jpg', percent: 12.34 },
            ],
          },
        },
      });
    });
    try {
      const schema = await fetchAchievementSchema('KEY', 730);
      assert.equal(schema.length, 2, '必须解析出 2 条成就，而不是返回 null/[]');
      assert.deepEqual(
        schema[0],
        { api: 'ACH_ONE', name: '成就一', desc: '描述一', icon: 'http://icon/1.jpg', percent: 45.6 },
      );
      assert.equal(schema[1].api, 'ACH_TWO');
      // 版本号回归：必须走 v2（v1 为遗留版本，曾与封装 bug 叠加）
      assert.match(calledUrl, /\/GetSchemaForGame\/v2\//, `应请求 v2，实际: ${calledUrl}`);
      assert.match(calledUrl, /l=schinese/, '应请求中文 Schema');
    } finally {
      restore();
    }
  });

  test('GetSchemaForGame: percent 归一化（站点成就页全球完成率）', async () => {
    const restore = mockFetch(async () =>
      jsonRes({
        game: {
          gameName: 'Pct Test',
          availableGameStats: {
            achievements: [
              { name: 'A', displayName: '甲', percent: 100 },        // 100 → 保留 100
              { name: 'B', displayName: '乙', percent: '7.25' },     // 字符串数字 → 7.25
              { name: 'C', displayName: '丙', percent: 0 },          // 0 是有效值（极少数人完成）
              { name: 'D', displayName: '丁' },                      // 缺失 → null
              { name: 'E', displayName: '戊', percent: 'abc' },      // 非数字 → null
              { name: 'F', displayName: '己', percent: -3 },         // 负值 → null
            ],
          },
        },
      }),
    );
    try {
      const schema = await fetchAchievementSchema('KEY', 730);
      assert.deepEqual(
        schema.map((a) => a.percent),
        [100, 7.25, 0, null, null, null],
      );
    } finally {
      restore();
    }
  });

  test('GetSchemaForGame: 无 availableGameStats 时返回 null', async () => {
    const restore = mockFetch(async () => jsonRes({ game: { gameName: 'No Stats' } }));
    try {
      assert.equal(await fetchAchievementSchema('KEY', 730), null);
    } finally {
      restore();
    }
  });

  test('GetSchemaForGame: HTTP 400（无成就系统）归一为 null 且不抛出', async () => {
    const restore = mockFetch(async () => jsonRes({}, 400));
    try {
      assert.equal(await fetchAchievementSchema('KEY', 730), null);
    } finally {
      restore();
    }
  });

  test('GetPlayerAchievements: 顶层 playerstats.achievements 必须正确解析', async () => {
    const restore = mockFetch(async () =>
      jsonRes({
        playerstats: {
          steamID: '76561190000000001',
          gameName: 'Test Game',
          achievements: [
            { apiname: 'ACH_ONE', achieved: 1, unlocktime: 1729000000 },
            { apiname: 'ACH_TWO', achieved: 0, unlocktime: 0 },
          ],
        },
      }),
    );
    try {
      const list = await fetchPlayerAchievements('KEY', '76561190000000001', 730);
      assert.equal(list.length, 2, '必须解析出 2 条成就，而不是返回 null');
      assert.deepEqual(list[0], { api: 'ACH_ONE', achieved: true, ts: 1729000000 });
      assert.deepEqual(list[1], { api: 'ACH_TWO', achieved: false, ts: 0 });
    } finally {
      restore();
    }
  });

  test('GetPlayerAchievements: 无 playerstats 或 achievements 缺失时返回 null', async () => {
    const restore = mockFetch(async () => jsonRes({ playerstats: { steamID: '76561190000000001' } }));
    try {
      assert.equal(await fetchPlayerAchievements('KEY', '76561190000000001', 730), null);
    } finally {
      restore();
    }
  });

  test('IPlayerService 默认行为不变：仍取 response 包裹（raw 默认关闭）', async () => {
    const restore = mockFetch(async () =>
      jsonRes({
        response: {
          game_count: 2,
          games: [
            { appid: 730, name: 'CS2', playtime_forever: 786 },
            { appid: 570, name: 'Dota', playtime_forever: 100 },
          ],
        },
      }),
    );
    try {
      const owned = await fetchOwnedGames('KEY', '76561190000000001');
      assert.equal(owned.game_count, 2);
      assert.equal(owned.games.length, 2);
    } finally {
      restore();
    }
  });
});
