/**
 * 第 87/88 轮（watch 侧）归档图：新图标（电影胶片，favicon 无底盘）在三类底色上的可读性 + 六档全集
 *
 * 说明：浏览器自带的标签条截不到（Playwright 只能截页面内容），
 * 所以这里用「真实素材 + 复刻的标签条底色」拼图，属于**模拟**而不是真机截图 —— 归档里如实标注。
 *
 * 产出（%TEMP%/shots87icons/）：
 *   01_三底可读性.png   深蓝标签条 / 影院黑 / 浅灰标签条 三行，每行 16·32·48 的 1:1 与 8× 放大
 *   02_六档全集.png     16·32·48·180·192·512 按原尺寸排一行（>140 的两档缩到 140）
 *
 * 用法：node tests/tools/shot87_icons.mjs
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = 'C:/Users/33329/WorkBuddy/2026-10-13-18-17-49/steam-playtime/docs/';
const IMG = ROOT + 'img/';
const OUT = path.join(os.tmpdir(), 'shots87icons');
fs.mkdirSync(OUT, { recursive: true });

const srcName = fs.readdirSync(IMG).find((f) => /^(?:film|camera|projector)-[0-9a-f]{8}\.png$/.test(f)) || '';
const HASH = (srcName.match(/-([0-9a-f]{8})/) || [])[1] || '';
const N = (b) => b.replace(/\.png$/, '') + '-' + HASH + '.png';

const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };
const BGS = [
  ['深色标签条', { r: 11, g: 42, b: 69, alpha: 1 }],
  ['影院黑', { r: 11, g: 11, b: 14, alpha: 1 }],
  ['浅色标签条', { r: 222, g: 225, b: 230, alpha: 1 }],
];

/* ---------- 01 三底可读性 ---------- */
const SIZES = [16, 32, 48];
const ZOOM = 8;
const cellW = 48 * ZOOM + 24;   // 8× 放大后 384，左右各 12
const cellH = 48 * ZOOM + 24;
const comps = [];
for (let r = 0; r < BGS.length; r++) {
  const y0 = 12 + r * (cellH + 12);
  const strip = await sharp({ create: { width: cellW * SIZES.length, height: cellH, channels: 4, background: BGS[r][1] } }).png().toBuffer();
  comps.push({ input: strip, left: 12, top: y0 });
  for (let c = 0; c < SIZES.length; c++) {
    const size = SIZES[c];
    const big = await sharp(IMG + N(`favicon-watch-${size}.png`))
      .resize({ width: size * ZOOM, height: size * ZOOM, kernel: 'nearest' })
      .png()
      .toBuffer();
    comps.push({ input: big, left: 12 + c * cellW + 12, top: y0 + 12 });
  }
}
await sharp({ create: { width: cellW * SIZES.length + 24, height: (cellH + 12) * BGS.length + 12, channels: 4, background: WHITE } })
  .composite(comps)
  .png()
  .toFile(path.join(OUT, '01_三底可读性.png'));
console.log('01_三底可读性.png（上行深蓝标签条 / 中行影院黑 / 下行浅灰；三列＝16·32·48 各放大 8 倍）');

/* ---------- 02 六档全集 ---------- */
const SET = [
  ['favicon-watch-16.png', 16],
  ['favicon-watch-32.png', 32],
  ['favicon-watch-48.png', 48],
  ['apple-touch-icon-watch.png', 180],
  ['icon-watch-192.png', 192],
  ['icon-watch-512.png', 512],
];
const box = 132;
const c2 = [];
for (let i = 0; i < SET.length; i++) {
  const [base, size] = SET[i];
  const show = size <= box ? size : box;
  const buf = await sharp(IMG + N(base)).resize({ width: show, height: show, fit: 'contain', kernel: 'nearest' }).png().toBuffer();
  c2.push({ input: buf, left: 10 + i * (box + 10) + Math.floor((box - show) / 2), top: 10 + Math.floor((box - show) / 2) });
}
await sharp({ create: { width: (box + 10) * SET.length + 10, height: box + 20, channels: 4, background: BGS[0][1] } })
  .composite(c2)
  .png()
  .toFile(path.join(OUT, '02_六档全集.png'));
console.log('02_六档全集.png（16 / 32 / 48 / 180 / 192 / 512，后两档缩到 132 显示）');
console.log(OUT);
