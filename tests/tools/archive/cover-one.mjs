/* cover-one.mjs — 补抓单张本地封面（fetch-covers.mjs 只按 meta.games_lifetime 遍历，
   补录数据里出现的新游戏不在 meta 里，抓不到）
   用法：node tests/tools/cover-one.mjs <appid> [appid...]
   产物：docs/img/covers/<appid>.webp（460 宽 / q78，参数与 fetch-covers.mjs 一致） */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const OUT_DIR = 'docs/img/covers';
const ids = process.argv.slice(2).filter((x) => /^\d+$/.test(x));
if (!ids.length) {
  console.error('用法：node tests/tools/cover-one.mjs <appid> [appid...]');
  process.exit(1);
}
fs.mkdirSync(OUT_DIR, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

for (const appid of ids) {
  const out = path.join(OUT_DIR, `${appid}.webp`);
  if (fs.existsSync(out) && !process.argv.includes('--force')) {
    console.log(`${appid} 已存在，跳过（加 --force 覆盖）`);
    continue;
  }
  let buf = null;
  for (let i = 1; i <= 3; i++) {
    try {
      const res = await fetch(`https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      buf = Buffer.from(await res.arrayBuffer());
      break;
    } catch (e) {
      if (i === 3) console.error(`${appid} 失败：${e.message}`);
      else await sleep(700 * i);
    }
  }
  if (!buf) continue;
  const info = await sharp(buf)
    .resize({ width: 460, withoutEnlargement: true })
    .webp({ quality: 78, effort: 4 })
    .toFile(out);
  console.log(`${appid} -> ${out}  ${info.width}x${info.height}  ${(info.size / 1024).toFixed(0)}KB`);
  await sleep(120);
}
