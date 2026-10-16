#!/usr/bin/env node
/**
 * 由全量快照重算每日时长 → data/daily/YYYY-MM.json
 * 幂等：每次都从第一份快照完整重放，算法修复后历史自动纠正。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { utcISO } from './lib/dates.mjs';
import { rebuildDays } from './lib/diff-core.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SNAP_DIR = path.join(ROOT, 'data', 'snapshots');
const DAILY_DIR = path.join(ROOT, 'data', 'daily');
const MANUAL_DIR = path.join(ROOT, 'data', 'manual');

const log = (...a) => console.log('[diff]', ...a);

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function readSnapshots() {
  if (!fs.existsSync(SNAP_DIR)) return [];
  return fs
    .readdirSync(SNAP_DIR)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort() // 文件名序 = 抓取顺序
    .map((f) => {
      const s = readJson(path.join(SNAP_DIR, f));
      if (s.schema !== 1) throw new Error(`未知 snapshot schema: ${f} (${s.schema})`);
      // date 一律取「内容日」：data_date 是快照数据实际所属的自然日。
      // 凌晨抓取的快照（cron 延迟）内容是前一天终态，data_date 已在前一天，防止差分整体错位一天。
      return { date: s.data_date ?? s.date, games: s.games ?? {} };
    });
}

function readManuals() {
  const map = new Map();
  if (!fs.existsSync(MANUAL_DIR)) return map;
  for (const f of fs.readdirSync(MANUAL_DIR).filter((x) => x.endsWith('.json')).sort()) {
    const obj = readJson(path.join(MANUAL_DIR, f));
    const date = obj.date ?? f.replace(/\.json$/, '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      console.warn(`[diff] WARN: manual/${f} 缺少合法 date 字段，已跳过`);
      continue;
    }
    map.set(date, obj);
  }
  return map;
}

function main() {
  const snapshots = readSnapshots();
  if (snapshots.length === 0) {
    console.error('[diff] 没有找到任何快照，请先运行 npm run fetch');
    process.exit(1);
  }

  const manuals = readManuals();
  log(`载入 ${snapshots.length} 份快照，${manuals.size} 份手动补录`);

  const days = rebuildDays(snapshots, manuals);

  const months = new Map();
  for (const [date, day] of days) {
    const m = date.slice(0, 7);
    if (!months.has(m)) months.set(m, {});
    months.get(m)[date] = day;
  }

  fs.mkdirSync(DAILY_DIR, { recursive: true });

  let allTotal = 0;
  let activeDays = 0;
  let flagged = 0;

  for (const [month, daysObj] of [...months].sort((a, b) => a[0].localeCompare(b[0]))) {
    const out = {
      schema: 1,
      month,
      tz: 'Asia/Shanghai',
      unit: 'minute',
      generated_at: utcISO(),
      days: daysObj,
    };
    fs.writeFileSync(
      path.join(DAILY_DIR, `${month}.json`),
      JSON.stringify(out, null, 2) + '\n',
      'utf8',
    );
    for (const d of Object.values(daysObj)) {
      allTotal += d.total_minutes;
      if (d.total_minutes > 0) activeDays++;
      if (d.flags?.length) flagged++;
    }
  }

  log(`生成 ${months.size} 个月份文件: ${[...months.keys()].join(', ')}`);
  log(`累计追踪 ${allTotal} 分钟，活跃 ${activeDays} 天，带标记 ${flagged} 天`);
}

main();
