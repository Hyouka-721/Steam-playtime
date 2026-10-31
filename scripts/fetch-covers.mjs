#!/usr/bin/env node
/**
 * 第 84 轮：把 Steam 封面图下载成本地 WebP，让榜单/底纹不再依赖 Steam CDN。
 *
 * 产物：docs/img/covers/<appid>.webp（460 宽、q78）
 *   · 460 是 Steam header.jpg 的原生宽度，只缩不放；
 *   · 榜单显示 130×60、时间轴大图 148×69、悬停底纹是模糊背景 —— 460 足够，不必更大。
 *
 * 增量：文件已存在就跳过（新游戏入库时重跑一次即可）。
 * 用法：node scripts/fetch-covers.mjs [--force]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const META = path.join(ROOT, 'docs', 'data', 'meta.json');
const OUT_DIR = path.join(ROOT, 'docs', 'img', 'covers');
const FORCE = process.argv.includes('--force');

const log = (...a) => console.log('[covers]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchHeader(appid) {
  const url = `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`;
  for (let i = 1; i <= 3; i++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (e) {
      clearTimeout(timer);
      if (i === 3) throw e;
      await sleep(700 * i);
    }
  }
  return null;
}

async function main() {
  if (!fs.existsSync(META)) {
    console.error('[covers] 缺少 docs/data/meta.json，请先 npm run build');
    process.exit(1);
  }
  const meta = JSON.parse(fs.readFileSync(META, 'utf8'));
  const games = Object.values(meta.games_lifetime ?? {});
  fs.mkdirSync(OUT_DIR, { recursive: true });

  let added = 0, skipped = 0, failed = 0, bytes = 0;
  for (const g of games) {
    const out = path.join(OUT_DIR, `${g.appid}.webp`);
    if (!FORCE && fs.existsSync(out)) { skipped++; continue; }
    try {
      const buf = await fetchHeader(g.appid);
      if (!buf) throw new Error('空响应');
      const info = await sharp(buf)
        .resize({ width: 460, withoutEnlargement: true })
        .webp({ quality: 78, effort: 4 })
        .toFile(out);
      bytes += info.size;
      added++;
    } catch (e) {
      failed++;
      console.warn(`[covers] WARN ${g.name}(${g.appid}): ${e.message}`);
    }
    await sleep(120);
  }
  log(`新增 ${added} / 跳过 ${skipped} / 失败 ${failed}，合计 ${(bytes / 1024).toFixed(0)}KB`);
  log(`目录：docs/img/covers/（${fs.readdirSync(OUT_DIR).filter((f) => f.endsWith('.webp')).length} 个）`);
}

main().catch((e) => {
  console.error('[covers] FATAL', e);
  process.exit(1);
});
