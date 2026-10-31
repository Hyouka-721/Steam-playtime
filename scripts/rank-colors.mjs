#!/usr/bin/env node
/**
 * 第 83 轮 #8：从 Steam 封面图里提主色，生成「每款游戏自己的进度条配色」。
 *
 * 产物：data/overrides/game-colors.json
 *   { "730": "linear-gradient(90deg, #b8602c, #e08a54)", ... }
 * build.mjs 会把它合并进 meta.games_lifetime[].bar，前端直接用作进度条背景；
 * 缺这张表也不会报错 —— 前端回落到十色 topPalette。
 *
 * 为什么构建期做而不是浏览器端做：Canvas 读跨域图会被污染，提取颜色必须同源；
 * 而且 53 张图各算一次会把首屏拖垮。
 *
 * 用法：node scripts/rank-colors.mjs [--force]
 *   --force  已有配色也重算（默认增量：表里已有的直接跳过）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const META = path.join(ROOT, 'docs', 'data', 'meta.json');
const OUT_DIR = path.join(ROOT, 'data', 'overrides');
const OUT = path.join(OUT_DIR, 'game-colors.json');
const FORCE = process.argv.includes('--force');

const log = (...a) => console.log('[colors]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const rgb2hsl = (r, g, b) => {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return [h * 360, s * 100, l * 100];
};

const hsl = (h, s, l) => `hsl(${Math.round(h)} ${Math.round(s)}% ${Math.round(l)}%)`;

/** 主色 → 两段渐变。饱和度/亮度做钳制，保证在浅色与深色底上都够清楚。 */
function toBar([r, g, b]) {
  let [h, s, l] = rgb2hsl(r, g, b);
  s = Math.max(32, Math.min(72, s));
  l = Math.max(38, Math.min(58, l));
  return `linear-gradient(90deg, ${hsl(h, s, l)}, ${hsl(h, s, Math.min(74, l + 20))})`;
}

async function fetchCover(appid) {
  const url = `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`;
  for (let i = 1; i <= 3; i++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (e) {
      clearTimeout(timer);
      if (i === 3) throw e;
      await sleep(600 * i);
    }
  }
  return null;
}

async function main() {
  if (!fs.existsSync(META)) {
    console.error('[colors] 缺少 docs/data/meta.json，请先跑 npm run build');
    process.exit(1);
  }
  const meta = JSON.parse(fs.readFileSync(META, 'utf8'));
  const games = Object.values(meta.games_lifetime ?? {});
  if (!games.length) {
    console.error('[colors] meta 里没有 games_lifetime');
    process.exit(1);
  }

  const table = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
  log(`共 ${games.length} 款；已有配色 ${Object.keys(table).length} 款`);

  let done = 0, skipped = 0, failed = 0;
  for (const g of games) {
    if (!FORCE && table[g.appid]) { skipped++; continue; }
    try {
      const buf = await fetchCover(g.appid);
      if (!buf) throw new Error('空响应');
      // 先缩小再取主色：避免噪点/边框干扰，也快得多
      const { dominant } = await sharp(buf).resize(48, 22, { fit: 'inside' }).stats();
      table[g.appid] = toBar([dominant.r, dominant.g, dominant.b]);
      done++;
      if (done % 10 === 0) log(`  已处理 ${done} 款…`);
    } catch (e) {
      failed++;
      console.warn(`[colors] WARN 提色失败 ${g.name}(${g.appid}): ${e.message}`);
    }
    await sleep(120);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(table, null, 2) + '\n', 'utf8');
  log(`写入 data/overrides/game-colors.json：新增 ${done} / 跳过 ${skipped} / 失败 ${failed}，表内共 ${Object.keys(table).length} 款`);
}

main().catch((e) => {
  console.error('[colors] FATAL', e);
  process.exit(1);
});
