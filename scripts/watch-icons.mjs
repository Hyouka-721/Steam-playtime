#!/usr/bin/env node
/**
 * 第 87 轮（watch 侧）建：生成观影页的站点图标
 * （浏览器标签页 / 书签 / iOS 桌面 / Android 主屏 四类场景）。
 *
 * 与 `scripts/make-icons.mjs`（首页图标）并列而不是合并，原因：
 * 两页各有自己的形象素材与底色（首页 cream 主题、观影页影院黑），
 * 合成一个脚本就得传一堆参数；分开后各自读一张源图、各自一套输出名，互不干扰。
 *
 * 源素材：docs/img/camera-064bab46.png（用户给的 256×256 透明底电影摄像机；
 *         2026-11-02 换掉了上一版的胶片放映机 —— 流程与判据一字未改，只是换了源图）
 *
 * 底色策略（与首页同一套原则，但有一处刻意的不同）：
 *   · apple-touch-icon / 192 / 512 **必须**铺实底 —— iOS 不支持透明，透明会被填成黑底
 *   · favicon 16/32/48 这次也铺了**圆角**暖白盘（#fbf7f1），而首页的 favicon 是透明的。
 *     原因见下面的「为什么 favicon 也铺底」—— 这是本页唯一一处与首页不同的决定
 *
 * 为什么 favicon 也铺底（实测，不是口味）：
 *   摄像机主体是 #321b41 深紫（不透明像素均值 rgb(70,49,82)），而标签条背景在用户机器上是
 *   深蓝 #0b2a45、影院页是 #0b0b0e —— 透明版在深色标签条上只剩「两个灰齿轮 + 一个红点」，
 *   16px 下糊成一团；铺暖白圆角盘后，深色/浅色标签条上都能一眼看出是一台摄影机（对比图见归档）。
 *   16/32/48 自己画圆角（约 22%），这样在浅色标签条上看起来像一枚图标瓦片而不是白框。
 *
 * 尺寸策略：
 *   · 源图主体是 1.15:1 的宽图（256×195，裁掉四周透明后），先按 alpha 裁掉空白再等比缩放，
 *     否则 16px 下左右各留一圈透明、主体只剩一半
 *   · 文件名带源图哈希（与首页 make-icons.mjs 同规矩）：换素材 = 换文件名 = 换 URL，
 *     浏览器与 Service Worker 里的旧图自然失效，不用改缓存版本号
 *   · 小尺寸 0.82（盘内留白，避免主体贴到盘边），大尺寸 0.72；
 *     iOS / Android 会自己套圆角，所以 180/192/512 是满幅方图
 *
 * 用法：node scripts/watch-icons.mjs
 *      node scripts/watch-icons.mjs --preview   # 只在 %TEMP% 出对比图，不写 docs/img
 */
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCS = path.resolve(__dirname, '..', 'docs');
const IMG = path.join(DOCS, 'img');
const SRC = path.join(IMG, 'camera-064bab46.png');
const CREAM = '#fbf7f1';
const CREAM_RGBA = { r: 251, g: 247, b: 241, alpha: 1 };
const PREVIEW = process.argv.includes('--preview');
/* 文件名后缀取源图名里的 8 位哈希（camera-064bab46.png → 064bab46），与 index 侧一致 */
const HASH = (path.basename(SRC).match(/-([0-9a-f]{8})\.png$/) || [])[1] || 'v1';
const NAME = (base) => base.replace(/\.png$/, '') + '-' + HASH + '.png';

const log = (...a) => console.log('[watch-icons]', ...a);

/** 裁掉四周透明空白，拿到「只剩主体」的 PNG */
async function body() {
  return sharp(SRC).trim({ threshold: 1 }).png().toBuffer();
}

/** 主体等比缩到 inner 宽（保持比例） */
async function fitBody(buf, inner) {
  return sharp(buf).resize({ width: inner, height: inner, fit: 'inside', kernel: 'lanczos3' }).png().toBuffer();
}

/** 圆角暖白盘（小尺寸用）：盘外仍透明，盘内实底 */
async function plated(size, ratio, buf) {
  const r = Math.max(2, Math.round(size * 0.22));
  const plate = Buffer.from(
    `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">` +
      `<rect x="0" y="0" width="${size}" height="${size}" rx="${r}" ry="${r}" fill="${CREAM}"/></svg>`
  );
  const inner = Math.round(size * ratio);
  return sharp(plate).composite([{ input: await fitBody(buf, inner), gravity: 'center' }]).png({ compressionLevel: 9 }).toBuffer();
}

/** 满幅实底（iOS / Android 用）：不自己画圆角，系统会遮 */
async function fullBleed(size, ratio, buf) {
  const inner = Math.round(size * ratio);
  return sharp({ create: { width: size, height: size, channels: 4, background: CREAM_RGBA } })
    .composite([{ input: await fitBody(buf, inner), gravity: 'center' }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

const bodyBuf = await body();
const meta = await sharp(bodyBuf).metadata();
log(`源主体 ${meta.width}×${meta.height}（已裁掉四周透明）`);

/* 一整套：文件名、像素尺寸、盘型、主体占比 */
const SET = [
  ['favicon-watch-16.png', 16, 'plate', 0.82],
  ['favicon-watch-32.png', 32, 'plate', 0.82],
  ['favicon-watch-48.png', 48, 'plate', 0.82],
  ['apple-touch-icon-watch.png', 180, 'full', 0.72],
  ['icon-watch-192.png', 192, 'full', 0.72],
  ['icon-watch-512.png', 512, 'full', 0.72],
];

if (PREVIEW) {
  /* 对比图：两种做法 × 三种背景 × 三档尺寸（放大 8 倍） */
  const BGS = [
    ['深蓝标签条', { r: 11, g: 42, b: 69, alpha: 1 }],
    ['影院黑', { r: 11, g: 11, b: 14, alpha: 1 }],
    ['浅色标签条', { r: 222, g: 225, b: 230, alpha: 1 }],
  ];
  const sizes = [16, 32, 48];
  const ZOOM = 8;
  const cell = 48 * ZOOM + 24;
  const variants = [
    ['透明版（弃用）', async (s) => {
      const inner = Math.round(s * 0.94);
      const b = await sharp(bodyBuf).resize({ width: inner, height: inner, fit: 'inside', kernel: 'lanczos3' }).png().toBuffer({ resolveWithObject: true });
      const px = s - b.info.width;
      const py = s - b.info.height;
      return sharp(b.data).extend({ top: Math.floor(py / 2), bottom: Math.ceil(py / 2), left: Math.floor(px / 2), right: Math.ceil(px / 2), background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    }],
    ['圆角暖白盘（采用）', (s) => plated(s, 0.82, bodyBuf)],
  ];
  const comps = [];
  const W = cell * sizes.length + 24;
  const H = (cell + 20) * BGS.length * variants.length + 24;
  for (let v = 0; v < variants.length; v++) {
    for (let r = 0; r < BGS.length; r++) {
      const y0 = 12 + (v * BGS.length + r) * (cell + 20);
      const strip = await sharp({ create: { width: cell * sizes.length, height: cell, channels: 4, background: BGS[r][1] } }).png().toBuffer();
      comps.push({ input: strip, left: 12, top: y0 - 10 });
      for (let c = 0; c < sizes.length; c++) {
        const icon = await variants[v][1](sizes[c]);
        const big = await sharp(icon).resize({ width: sizes[c] * ZOOM, kernel: 'nearest' }).png().toBuffer();
        const bm = await sharp(big).metadata();
        comps.push({ input: big, left: 12 + c * cell + Math.floor((cell - 24 - bm.width) / 2), top: y0 + Math.floor((cell - 10 - bm.height) / 2) });
      }
    }
  }
  const outDir = path.join(os.tmpdir(), 'watch_icons_preview');
  fs.mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, 'favicon-compare.png');
  await sharp({ create: { width: W, height: H, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } }).composite(comps).png().toFile(out);
  log(`对比图 ${out}`);
} else {
  for (const [name, size, kind, ratio] of SET) {
    const buf = kind === 'plate' ? await plated(size, ratio, bodyBuf) : await fullBleed(size, ratio, bodyBuf);
    fs.writeFileSync(path.join(IMG, NAME(name)), buf);
    const m = await sharp(buf).metadata();
    log(`${NAME(name)} ← ${m.width}×${m.height}  ${kind === 'plate' ? '圆角暖白盘 + 盘外透明' : '满幅暖白底'}  主体占比 ${ratio}  ${(buf.length / 1024).toFixed(1)}KB`);
  }
  log('完成');
}
