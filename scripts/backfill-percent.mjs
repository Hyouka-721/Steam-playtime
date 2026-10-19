#!/usr/bin/env node
/**
 * 一次性回填脚本：给已采集的成就快照补上「全球完成率」。
 *
 * 背景（2026-10-19 事故）：成就页每条百分比都显示 0.0%。
 *  第一层成因：GetSchemaForGame v2 的 percent 字段实测恒为 null（2504 条无一非空），
 *             而采集代码把它当作唯一来源，于是明细里 percent 全是 null。
 *  第二层成因：normalizePercent(null) → Number(null) === 0 → 被当成有效的「0%」，
 *             前端 achPctText 再把它格式化成 "0.0%"。
 * 修复后新采集会走 GetGlobalAchievementPercentagesForApp 拿真实值；
 * 本脚本用于把**历史快照**也补上，避免要等下一次采集才生效。
 *
 * 用法：node scripts/backfill-percent.mjs [YYYY-MM-DD]
 *   不给日期则处理 data/achievements/ 下最新一份。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { fetchGlobalAchievementPercent } from './lib/steam.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const ACH_DIR = path.join(ROOT, 'data', 'achievements');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('[backfill]', ...a);

const arg = process.argv[2];
const files = fs.readdirSync(ACH_DIR).filter((f) => f.endsWith('.json')).sort();
const target = arg ? `${arg}.json` : files[files.length - 1];
if (!target || !fs.existsSync(path.join(ACH_DIR, target))) {
  console.error(`[backfill] FATAL: 快照不存在 ${target}`);
  process.exit(1);
}

const file = path.join(ACH_DIR, target);
const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
log(`处理 ${target}：${Object.keys(doc.games ?? {}).length} 款游戏`);

let filled = 0;
let missing = 0;
const appids = Object.keys(doc.games ?? {});
for (let i = 0; i < appids.length; i++) {
  const appid = appids[i];
  const g = doc.games[appid];
  if (!g.achievements?.length) continue;
  if (g.achievements.every((a) => a.percent != null)) continue; // 已有值，跳过

  let pct = {};
  try {
    pct = await fetchGlobalAchievementPercent(appid);
  } catch (e) {
    log(`  ${g.name}(${appid}) 获取失败：${e.message}`);
  }
  for (const a of g.achievements) {
    if (a.percent == null && pct[a.api] != null) {
      a.percent = pct[a.api];
      filled++;
    } else if (a.percent == null) {
      missing++;
    }
  }
  log(`  ${g.name}(${appid}): ${g.achievements.filter((a) => a.percent != null).length}/${g.achievements.length} 项有完成率`);
  await sleep(200);
}

fs.writeFileSync(file, JSON.stringify(doc, null, 2) + '\n', 'utf8');
log(`完成：回填 ${filled} 项，仍有 ${missing} 项无完成率（该成就全局无人达成或接口未收录）`);
log(`已写回 ${file}`);
