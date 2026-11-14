#!/usr/bin/env node
/* ============================================================
   shard-lib.mjs · watch.json 按年分片的唯一定义（第 91 轮 A8）
   ------------------------------------------------------------
   ⚠️ docs/watch.js 里的 buildShards() 必须与本文件**逐字一致**，
      否则前端对账永远失败、静默回退整份主文件，分片等于白做。

   结构（兼容双轨，watch.json 仍是权威写入源）：
     docs/data/watch/manifest.json
       { version:1, source:'watch.json', updated_at, total,
         years:[{ year, file, count }] }            // 年份降序
     docs/data/watch/<year>.json
       { year, items:[ ...原条目，保持主文件顺序... ] }

   分片是**投影**，不存任何主文件里没有的字段；删掉整个 watch/ 目录，
   页面会自动回退 data/watch.json，功能不受影响。
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '..', '..');
export const DATA_FILE = path.join(ROOT, 'docs', 'data', 'watch.json');
export const SHARD_DIR = path.join(ROOT, 'docs', 'data', 'watch');
export const SHARD_VERSION = 1;

export function serialize(obj) {
  return JSON.stringify(obj, null, 2) + '\n';
}

/** 与 docs/watch.js 的 shardYearOf() 一致：只认 watched_at 的前四位，异常归 '0000' */
export function yearOf(it) {
  const m = /^(\d{4})/.exec(String((it && it.watched_at) || ''));
  return m ? m[1] : '0000';
}

export function buildShards(data) {
  const items = Array.isArray(data && data.items) ? data.items : [];
  const by = {};
  items.forEach((it) => {
    const y = yearOf(it);
    (by[y] = by[y] || []).push(it);
  });
  const years = Object.keys(by).sort().reverse();
  return {
    manifest: {
      version: SHARD_VERSION,
      source: 'watch.json',
      updated_at: (data && data.updated_at) || '',
      total: items.length,
      years: years.map((y) => ({ year: y, file: y + '.json', count: by[y].length }))
    },
    chunks: years.map((y) => ({ year: y, items: by[y] }))
  };
}

function yearFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => /^\d{4}\.json$/.test(f)).sort();
}

function writeIfChanged(file, text) {
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === text) return false;
  fs.writeFileSync(file, text, 'utf8');
  return true;
}

/** 从主文件重建全部分片。幂等：内容没变就不写盘（避免每晚 CI 制造 git 噪音）。 */
export function rebuildShards(data, opts = {}) {
  const dir = opts.dir || SHARD_DIR;
  const s = buildShards(data);
  const written = [], unchanged = [], removed = [];
  const expected = new Set(s.chunks.map((c) => c.year + '.json'));

  if (!opts.dry) fs.mkdirSync(dir, { recursive: true });

  s.chunks.forEach((c) => {
    const file = path.join(dir, c.year + '.json');
    const text = serialize(c);
    const changed = opts.dry ? true : writeIfChanged(file, text);
    (changed ? written : unchanged).push(c.year + '.json');
  });
  const mfFile = path.join(dir, 'manifest.json');
  const mfChanged = opts.dry ? true : writeIfChanged(mfFile, serialize(s.manifest));
  (mfChanged ? written : unchanged).push('manifest.json');

  // 年份被删空的旧分片要清掉，否则 manifest 不再指向它、文件却永远留着
  yearFiles(dir).forEach((f) => {
    if (expected.has(f)) return;
    removed.push(f);
    if (!opts.dry) fs.unlinkSync(path.join(dir, f));
  });

  return {
    written, unchanged, removed,
    years: s.manifest.years.map((y) => ({ ...y })),
    total: s.manifest.total
  };
}

/** 只读校验：分片是否与主文件完全一致。返回 { ok, errors, total, years }。 */
export function verifyShards(data, opts = {}) {
  const dir = opts.dir || SHARD_DIR;
  const s = buildShards(data);
  const errors = [];

  const mfFile = path.join(dir, 'manifest.json');
  if (!fs.existsSync(mfFile)) {
    errors.push('缺少 manifest.json');
  } else {
    let mf = null;
    try { mf = JSON.parse(fs.readFileSync(mfFile, 'utf8')); }
    catch (e) { errors.push('manifest.json 无法解析：' + e.message); }
    if (mf) {
      if (serialize(mf) !== serialize(s.manifest)) errors.push('manifest.json 与主文件不一致');
      else if (mf.version !== SHARD_VERSION) errors.push('manifest 版本不是 ' + SHARD_VERSION);
    }
  }

  s.chunks.forEach((c) => {
    const f = path.join(dir, c.year + '.json');
    if (!fs.existsSync(f)) { errors.push('缺少 ' + c.year + '.json'); return; }
    try {
      const got = JSON.parse(fs.readFileSync(f, 'utf8'));
      if (serialize(got) !== serialize(c)) errors.push(c.year + '.json 与主文件不一致');
    } catch (e) { errors.push(c.year + '.json 无法解析：' + e.message); }
  });
  const expected = new Set(s.chunks.map((c) => c.year + '.json'));
  yearFiles(dir).forEach((f) => {
    if (!expected.has(f)) errors.push('多余的分片文件：' + f);
  });

  return {
    ok: errors.length === 0,
    errors,
    total: s.manifest.total,
    years: s.manifest.years.map((y) => y.year)
  };
}

export function readMaster(file = DATA_FILE) {
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (Array.isArray(j)) return { updated_at: '', items: j };
  return { updated_at: j.updated_at || '', items: Array.isArray(j.items) ? j.items : [] };
}
