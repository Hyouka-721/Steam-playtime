#!/usr/bin/env node
/**
 * 第 83 轮 #20 建、第 92 轮改：生成站点全部图标（PWA + 浏览器标签页 + iOS 桌面）。
 *
 * 第 92 轮用户把自己的「游戏手柄」图（256×256、真透明）指定为站点图标，所以：
 *   · 源素材换成 docs/img/gamepad-<hash>.webp（不再用史蒂夫）
 *   · 除 PWA 的 192/512，还一并产出 favicon 16/32/48 与 apple-touch-icon 180
 *     —— 以前 favicon 是内联在 index.html 里的 base64，改成文件后一处生成、一处引用
 *
 * 底色策略（很重要）：
 *   · icon-game-192/512 与 apple-touch-icon 铺 cream 底（#fbf7f1，与主题 --bg 一致）：
 *     iOS 的 apple-touch-icon 不支持透明，透明会被填成黑底
 *   · favicon 16/32/48 保留透明：标签页背景色由浏览器决定，透明才不会出现白框
 *
 * 用法：node scripts/media/make-icons.mjs
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCS = path.resolve(__dirname, '..', '..', 'docs');
const SRC = path.join(DOCS, 'img', 'gamepad-fb74092c.webp');
// 输出文件名带素材 hash：sw.js 对 *.png 是 cache-first，固定名会让换图被旧缓存挡住
const HASH = (path.basename(SRC).match(/-([0-9a-f]{8})\.webp$/) || [])[1] || 'v1';
const NAME = (base) => base.replace(/\.png$/, '') + '-' + HASH + '.png';
const BG = { r: 251, g: 247, b: 241, alpha: 1 }; // 与 cream 主题的 --bg 一致

const log = (...a) => console.log('[icons]', ...a);

/** 铺底色 + 居中主体 */
async function makeOnBg(size, out, innerRatio) {
  const inner = Math.round(size * innerRatio);
  const body = await sharp(SRC).resize({ width: inner, height: inner, fit: 'inside' }).png().toBuffer();
  const meta = await sharp(body).metadata();
  await sharp({ create: { width: size, height: size, channels: 4, background: BG } })
    .composite([{ input: body, gravity: 'center' }])
    .png({ compressionLevel: 9 })
    .toFile(path.join(DOCS, 'img', out));
  log(`${out} ← ${size}×${size}（主体 ${meta.width}×${meta.height}，cream 底）`);
}

/** 透明底：等比缩放后四周补透明，避免 16px 贴边糊成一团 */
async function makeTransparent(size, out, innerRatio) {
  const inner = Math.round(size * innerRatio);
  const pad = size - inner;
  await sharp(SRC)
    .resize({ width: inner, height: inner, fit: 'inside', kernel: 'lanczos3' })
    .extend({
      top: Math.floor(pad / 2),
      bottom: Math.ceil(pad / 2),
      left: Math.floor(pad / 2),
      right: Math.ceil(pad / 2),
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png({ compressionLevel: 9 })
    .toFile(path.join(DOCS, 'img', out));
  log(`${out} ← ${size}×${size}（主体 ${inner}，透明底）`);
}

// PWA（manifest 引用）
await makeOnBg(192, NAME('icon-game-192.png'), 0.72);
await makeOnBg(512, NAME('icon-game-512.png'), 0.72);
// iOS 桌面图标
await makeOnBg(180, NAME('apple-touch-icon.png'), 0.72);
// 浏览器标签页：16 最容易糊，主体占比给到 0.94 才认得出
await makeTransparent(16, NAME('favicon-16.png'), 0.94);
await makeTransparent(32, NAME('favicon-32.png'), 0.94);
await makeTransparent(48, NAME('favicon-48.png'), 0.94);

log('完成');
