#!/usr/bin/env node
/**
 * 从 Steam 商店接口抓取游戏中文名，写入 data/overrides/game-names.json。
 * build.mjs 会自动把映射应用到 docs/data 的游戏名上。
 *
 * 策略：
 * - 只处理「有游玩时长」的游戏（没玩过的游戏永远不会显示，不浪费请求）
 * - 已在映射里的跳过（增量，每天 CI 只为新玩的游戏发请求）
 * - l=schinese 返回名与英文原名相同 → 视为无官方中文标题，不写映射
 * - 商店接口失败不影响主流程（build 仍用英文名），CI 里加 continue-on-error
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SNAP_DIR = path.join(ROOT, 'data', 'snapshots');
const OUT = path.join(ROOT, 'data', 'overrides', 'game-names.json');
const DELAY_MS = 400;
const UA = 'steam-playtime-localizer/1.0';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 本机沙箱/代理环境下 Node fetch 不读代理环境变量，需要显式走 ProxyAgent；CI 无代理时自动跳过
let dispatcher = undefined;
const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
if (proxyUrl) {
  try {
    const { ProxyAgent } = await import('undici');
    dispatcher = new ProxyAgent(proxyUrl);
    console.log(`[localize] 使用代理 ${proxyUrl}`);
  } catch {
    console.log('[localize] 未安装 undici，忽略代理设置');
  }
}

function latestSnapshot() {
  if (!fs.existsSync(SNAP_DIR)) return null;
  const files = fs.readdirSync(SNAP_DIR).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  if (!files.length) return null;
  return JSON.parse(fs.readFileSync(path.join(SNAP_DIR, files[files.length - 1]), 'utf8'));
}

/**
 * 返回 { ok: true, name } 表示请求成功拿到名字；
 * 返回 { ok: false } 表示网络失败（此时不写缓存，留待下次重试）。
 */
async function fetchCnName(appid) {
  const url = `https://store.steampowered.com/api/appdetails?appids=${appid}&l=schinese&filters=basic`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const r = await fetch(url, {
        headers: { 'User-Agent': UA, 'Accept-Language': 'zh-CN,zh;q=0.9' },
        ...(dispatcher ? { dispatcher } : {}),
      });
      if (r.status === 429) {
        console.log(`  [${appid}] 429 限流，等待 5s 重试 (${attempt}/3)`);
        await sleep(5000);
        continue;
      }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      const entry = j?.[appid];
      if (entry?.success && entry?.data?.name) return { ok: true, name: entry.data.name };
      return { ok: true, name: null };
    } catch (e) {
      console.log(`  [${appid}] 请求失败: ${e.message} (${attempt}/3)`);
      await sleep(2000 * attempt);
    }
  }
  return { ok: false };
}

async function main() {
  const snap = latestSnapshot();
  if (!snap?.games) {
    console.log('[localize] 无快照可处理，跳过');
    return;
  }
  const overrides = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};

  const targets = Object.entries(snap.games).filter(([, g]) => (g.playtime_forever ?? 0) > 0);
  const missing = targets.filter(([appid]) => !(appid in overrides));
  console.log(`[localize] 有时长的游戏 ${targets.length} 款，已有中文映射 ${targets.length - missing.length} 款，待抓取 ${missing.length} 款`);

  let added = 0;
  let failed = 0;
  for (const [appid, g] of missing) {
    const res = await fetchCnName(appid);
    if (!res.ok) {
      // 网络失败：不写缓存，下次运行自动重试
      failed++;
      console.log(`  [${appid}] 网络失败，跳过（下次重试）`);
    } else if (res.name && res.name.trim() && res.name.trim() !== g.name?.trim()) {
      overrides[appid] = res.name.trim();
      added++;
      console.log(`  [${appid}] ${g.name} -> ${res.name}`);
    } else {
      // 请求成功但没有中文标题：写入英文名占位，避免以后重复请求
      overrides[appid] = g.name;
      console.log(`  [${appid}] ${g.name} -> 无官方中文标题，保留英文`);
    }
    await sleep(DELAY_MS);
  }

  if (added > 0 || missing.length > failed) {
    const sorted = Object.fromEntries(Object.entries(overrides).sort((a, b) => Number(a[0]) - Number(b[0])));
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(sorted, null, 2) + '\n', 'utf8');
  }
  console.log(`[localize] 完成：新增中文映射 ${added} 款，网络失败 ${failed} 款（下次重试），映射总数 ${Object.keys(overrides).length}`);
}

main();
