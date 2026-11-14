/* 第 91 轮：watch.json 按年分片 + 数据质量守卫（纯 Node，不需要浏览器）
   npm test 会跑它；也可单独 node --test tests/unit/watch-shard.test.mjs */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  ROOT, DATA_FILE, SHARD_DIR, SHARD_VERSION,
  buildShards, rebuildShards, verifyShards, readMaster, yearOf, serialize
} from '../../scripts/watch/shard-lib.mjs';

const MOCK = {
  updated_at: '2026-11-14T11:02:53+08:00',
  items: [
    { id: '2026-10-31-a', title: 'A', watched_at: '2026-10-31', rating: 9 },
    { id: '2026-01-05-b', title: 'B', watched_at: '2026-01-05', rating: 8 },
    { id: '2020-05-01-c', title: 'C', watched_at: '2020-05-01', rating: 7 },
    { id: 'bad-d', title: 'D', watched_at: '时间未知', rating: 6 }
  ]
};

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'watch-shard-91-'));
}

test('A1 yearOf 只认 watched_at 前四位，异常归 0000', () => {
  assert.equal(yearOf({ watched_at: '2020-05-01' }), '2020');
  assert.equal(yearOf({ watched_at: '2026-10' }), '2026');
  assert.equal(yearOf({ watched_at: '时间未知' }), '0000');
  assert.equal(yearOf(null), '0000');
});

test('A2 buildShards：版本 / 来源 / 总数 / 年份降序 / 每片条数', () => {
  const s = buildShards(MOCK);
  assert.equal(s.manifest.version, SHARD_VERSION);
  assert.equal(s.manifest.source, 'watch.json');
  assert.equal(s.manifest.updated_at, MOCK.updated_at);
  assert.equal(s.manifest.total, 4);
  assert.deepEqual(s.manifest.years.map((y) => y.year), ['2026', '2020', '0000']);
  assert.deepEqual(s.manifest.years.map((y) => y.count), [2, 1, 1]);
  assert.deepEqual(s.manifest.years.map((y) => y.file), ['2026.json', '2020.json', '0000.json']);
  assert.equal(s.chunks.length, 3);
  assert.deepEqual(s.chunks[0].items, MOCK.items.slice(0, 2));   // 保持主文件顺序
});

test('A3 重建 → 校验通过；重复重建幂等（第二次一个文件都不写）', () => {
  const dir = tmpDir();
  try {
    const r1 = rebuildShards(MOCK, { dir });
    assert.equal(r1.total, 4);
    assert.equal(r1.written.length, 4);          // 3 个年片 + manifest
    assert.equal(r1.removed.length, 0);
    assert.equal(verifyShards(MOCK, { dir }).ok, true);

    const r2 = rebuildShards(MOCK, { dir });
    assert.deepEqual(r2.written, []);
    assert.equal(r2.unchanged.length, 4);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('A4 分片被改坏 / 缺失 / 多余，校验都要报错', () => {
  const dir = tmpDir();
  try {
    rebuildShards(MOCK, { dir });
    fs.writeFileSync(path.join(dir, '2026.json'), '{"year":"2026","items":[]}\n', 'utf8');
    assert.equal(verifyShards(MOCK, { dir }).ok, false, '内容被改坏应报错');

    rebuildShards(MOCK, { dir });
    fs.unlinkSync(path.join(dir, '2020.json'));
    assert.equal(verifyShards(MOCK, { dir }).ok, false, '缺一个年片应报错');

    rebuildShards(MOCK, { dir });
    fs.writeFileSync(path.join(dir, '1999.json'), serialize({ year: '1999', items: [] }), 'utf8');
    const r = verifyShards(MOCK, { dir });
    assert.equal(r.ok, false, '多余年片应报错');
    assert.ok(r.errors.some((e) => e.includes('1999.json')));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('A5 年份被删空时旧分片会被清掉，并写入空片', () => {
  const dir = tmpDir();
  try {
    rebuildShards(MOCK, { dir });
    const fewer = { ...MOCK, items: MOCK.items.slice(0, 2) };
    const r = rebuildShards(fewer, { dir });
    assert.ok(r.removed.includes('2020.json'));
    assert.ok(r.removed.includes('0000.json'));
    assert.equal(verifyShards(fewer, { dir }).ok, true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('A6 真实仓库：分片与主文件逐字一致', () => {
  const data = readMaster(DATA_FILE);
  const r = verifyShards(data, { dir: SHARD_DIR });
  assert.equal(r.ok, true, r.errors.join(' / '));
  assert.equal(r.total, data.items.length);
  assert.equal(r.years.length, 9);
});

test('A7 前端 buildShards 与共享库保持同一套契约', () => {
  const js = fs.readFileSync(path.join(ROOT, 'docs', 'watch.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(js, /function buildShards\(data\)/);
  assert.match(js, /version: 1, source: 'watch\.json'/);
  assert.match(js, /updated_at: data\.updated_at \|\| ''/);
  assert.match(js, /total: \(data\.items \|\| \[\]\)\.length/);
  assert.match(js, /Object\.keys\(by\)\.sort\(\)\.reverse\(\)/);
  assert.match(js, /file: y \+ '\.json', count: by\[y\]\.length/);
});

/* ---------- A5：数据质量守卫 ---------- */
const KNOWN_TAGS = new Set(['剧情', '历史', '战争', '动画', '奇幻', '冒险', '温情',
  '喜剧', '爱情', '灾难', '科幻', '悬疑', '犯罪', '纪录']);

test('B1 title_en / tags 全覆盖（第 91 轮 A5 已补齐）', () => {
  const d = readMaster(DATA_FILE);
  const noEn = d.items.filter((x) => !x.title_en).map((x) => x.title);
  const noTags = d.items.filter((x) => !Array.isArray(x.tags) || !x.tags.length).map((x) => x.title);
  assert.deepEqual(noEn, [], '缺英文名：' + noEn.join(','));
  assert.deepEqual(noTags, [], '缺标签：' + noTags.join(','));
});

test('B2 所有标签都在既有 14 词词表内（补数据时没引入新词）', () => {
  const d = readMaster(DATA_FILE);
  const bad = [];
  d.items.forEach((x) => (x.tags || []).forEach((t) => { if (!KNOWN_TAGS.has(t)) bad.push(x.title + ':' + t); }));
  assert.deepEqual(bad, []);
});

test('B3 缺 poster_480 的条目必须主图宽 <480（只缩不放，属合法缺失）', () => {
  const d = readMaster(DATA_FILE);
  const bad = d.items.filter((x) => !x.poster_480 && Number(x.poster_w) >= 480)
    .map((x) => x.title + '(' + x.poster_w + ')');
  assert.deepEqual(bad, [], '主图够宽却没生成 480 变体：' + bad.join(','));
  const legal = d.items.filter((x) => !x.poster_480);
  assert.equal(legal.length, 6, '第 91 轮实测的 6 张窄图');
});

test('B4 release_date 若存在必须是完整 YYYY-MM-DD（A3 只补录入能力，不编造数据）', () => {
  const d = readMaster(DATA_FILE);
  const bad = d.items.filter((x) => x.release_date && !/^\d{4}-\d{2}-\d{2}$/.test(String(x.release_date)));
  assert.deepEqual(bad, []);
});

test('B5 无重复 id、无归一化重名片名（A9 没有历史债）', () => {
  const d = readMaster(DATA_FILE);
  const ids = new Set(), names = new Set(), dupI = [], dupT = [];
  const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, '');
  d.items.forEach((x) => {
    if (ids.has(x.id)) dupI.push(x.id);
    ids.add(x.id);
    const k = norm(x.title);
    if (names.has(k)) dupT.push(x.title);
    names.add(k);
  });
  assert.deepEqual(dupI, []);
  assert.deepEqual(dupT, []);
});
