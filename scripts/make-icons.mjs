#!/usr/bin/env node
/**
 * 第 83 轮 #20：生成 PWA 图标（192 / 512）。
 * 素材只有 docs/img 里现成的史蒂夫（400×386，带 alpha），所以图标 = 米色圆角底 + 居中主体，
 * 不为「图标」单独引入新素材。改主题底色时重跑本脚本即可。
 *
 * 用法：node scripts/make-icons.mjs
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCS = path.resolve(__dirname, '..', 'docs');
const SRC = path.join(DOCS, 'img', 'steve-ceb15b8a.webp');
const BG = { r: 251, g: 247, b: 241, alpha: 1 }; // 与 cream 主题的 --bg 一致

const log = (...a) => console.log('[icons]', ...a);

async function make(size, out) {
  const inner = Math.round(size * 0.68);
  // 主体等比缩到 inner 宽，透明底保留
  const body = await sharp(SRC).resize({ width: inner, height: inner, fit: 'inside' }).png().toBuffer();
  const meta = await sharp(body).metadata();
  await sharp({ create: { width: size, height: size, channels: 4, background: BG } })
    .composite([{ input: body, gravity: 'center' }])
    .png({ compressionLevel: 9 })
    .toFile(path.join(DOCS, 'img', out));
  log(`${out} ← ${size}×${size}（主体 ${meta.width}×${meta.height}）`);
}

await make(192, 'icon-192.png');
await make(512, 'icon-512.png');
log('完成');
