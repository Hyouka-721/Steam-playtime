#!/usr/bin/env node
/**
 * 第 87 轮（watch 侧）建、第 88 轮改：生成观影页的站点图标
 * （浏览器标签页 / 书签 / iOS 桌面 / Android 主屏 四类场景）。
 *
 * 与 `scripts/media/make-icons.mjs`（首页图标）并列而不是合并，原因：
 * 两页各有自己的形象素材与底色（首页 cream 主题、观影页影院黑），
 * 合成一个脚本就得传一堆参数；分开后各自读一张源图、各自一套输出名，互不干扰。
 *
 * 源素材：docs/img/film-97e35b7b.png（用户给的 256×256 透明底「电影胶片」，主体 #2F88FF 亮蓝）
 *         第 87 轮先后用过 projector-a60e802b（放映机）、camera-064bab46（摄像机），
 *         两者都是**深色主体**，当时为了在深色标签条上看清，favicon 铺了暖白圆角盘；
 *         第 88 轮用户明确说「不想要铺暖白盘的 favicon」，换成这张亮蓝圆盘 —— 深色底上本来就亮，不需要盘。
 *
 * 底色策略（这一轮是「去盘」而不是「加盘」）：
 *   · favicon 16/32/48：**纯透明**，主体占 94%（与首页 make-icons.mjs 同参数）
 *     亮蓝圆盘 + 黑环 + 白色圆孔，深浅两种标签条上都看得清，不需要底盘
 *   · apple-touch-icon / 192 / 512：**必须铺实底** —— iOS 不支持透明，透明会被填成黑底；
 *     这里铺**纯白**（保住那圈黑环的轮廓，与浅色标签条上的观感一致）。
 *     想换成影院黑（#0b0b0e）只改下面 BG_APP 一个常量：环会并进背景、只剩蓝盘
 *
 * 尺寸策略：
 *   · 源图主体裁掉四周透明后正好 1:1（236×236），没有宽图缩进方画布的麻烦
 *   · 文件名带源图哈希（与首页 make-icons.mjs 同规矩）：换素材 = 换文件名 = 换 URL，
 *     浏览器与 Service Worker 里的旧图自然失效，不用改缓存版本号
 *   · 小尺寸 0.94（圆盘贴边一点，16px 才够醒目），大尺寸 0.78（给 iOS/Android 的圆角遮罩留余量）
 *
 * 用法：node scripts/media/watch-icons.mjs
 *      node scripts/media/watch-icons.mjs --preview   # 只在 %TEMP% 出对比图，不写 docs/img
 */
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCS = path.resolve(__dirname, '..', '..', 'docs');
const IMG = path.join(DOCS, 'img');
const SRC = path.join(IMG, 'film-97e35b7b.png');

/* 大图标（iOS / Android）的实底：纯白 —— 保住黑环轮廓。换影院黑只要改这一行 */
const BG_APP = { r: 255, g: 255, b: 255, alpha: 1 };
const BG_APP_HEX = '#ffffff';

const PREVIEW = process.argv.includes('--preview');
/* 文件名后缀取源图名里的 8 位哈希（film-97e35b7b.png → 97e35b7b），与 index 侧一致 */
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

/** 纯透明底：主体居中，四周透明（favicon 用） */
async function bare(size, ratio, buf) {
  const inner = Math.round(size * ratio);
  const s = await sharp(buf).resize({ width: inner, height: inner, fit: 'inside', kernel: 'lanczos3' }).png().toBuffer({ resolveWithObject: true });
  const padX = size - s.info.width;
  const padY = size - s.info.height;
  return sharp(s.data)
    .extend({
      top: Math.floor(padY / 2),
      bottom: Math.ceil(padY / 2),
      left: Math.floor(padX / 2),
      right: Math.ceil(padX / 2),
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/** 满幅实底（iOS / Android 用）：不自己画圆角，系统会遮
 *  大尺寸走**调色板 PNG**（32 色）：这张图只有纯白 / 纯黑 / 亮蓝 + 抗锯齿过渡，
 *  真彩 512 要 41KB，32 色同一张 19KB、肉眼无差 —— 主屏图标没必要背那么大 */
async function fullBleed(size, ratio, buf) {
  const inner = Math.round(size * ratio);
  return sharp({ create: { width: size, height: size, channels: 4, background: BG_APP } })
    .composite([{ input: await fitBody(buf, inner), gravity: 'center' }])
    .png({ palette: true, colours: 32, compressionLevel: 9 })
    .toBuffer();
}

const bodyBuf = await body();
const meta = await sharp(bodyBuf).metadata();
log(`源主体 ${meta.width}×${meta.height}（已裁掉四周透明）`);

/* 一整套：文件名、像素尺寸、盘型、主体占比 */
const SET = [
  ['favicon-watch-16.png', 16, 'bare', 0.94],
  ['favicon-watch-32.png', 32, 'bare', 0.94],
  ['favicon-watch-48.png', 48, 'bare', 0.94],
  ['apple-touch-icon-watch.png', 180, 'full', 0.78],
  ['icon-watch-192.png', 192, 'full', 0.78],
  ['icon-watch-512.png', 512, 'full', 0.78],
];

if (PREVIEW) {
  /* 对比图：三种背景 × 三档尺寸（放大 8 倍） + 右侧两格 180 实底对照 */
  const BGS = [
    ['深蓝标签条', { r: 11, g: 42, b: 69, alpha: 1 }],
    ['影院黑', { r: 11, g: 11, b: 14, alpha: 1 }],
    ['浅色标签条', { r: 222, g: 225, b: 230, alpha: 1 }],
  ];
  const sizes = [16, 32, 48];
  const ZOOM = 8;
  const cellW = 48 * ZOOM + 24;
  const cellH = cellW;
  const side = 180;
  const comps = [];
  const W = cellW * sizes.length + 24 + side * 2 + 32;
  const H = (cellH + 12) * BGS.length + 24;
  for (let r = 0; r < BGS.length; r++) {
    const y0 = 12 + r * (cellH + 12);
    const strip = await sharp({ create: { width: cellW * sizes.length, height: cellH, channels: 4, background: BGS[r][1] } }).png().toBuffer();
    comps.push({ input: strip, left: 12, top: y0 });
    for (let c = 0; c < sizes.length; c++) {
      const size = sizes[c];
      const big = await sharp(await bare(size, 0.94, bodyBuf))
        .resize({ width: size * ZOOM, height: size * ZOOM, kernel: 'nearest' })
        .png()
        .toBuffer();
      comps.push({ input: big, left: 12 + c * cellW + 12, top: y0 + 12 });
    }
  }
  /* 右侧两格：180 白底 / 180 影院黑底（实际只产白底那版，黑的仅作对照） */
  const white180 = await fullBleed(side, 0.78, bodyBuf);
  const black180 = await sharp({ create: { width: side, height: side, channels: 4, background: { r: 11, g: 11, b: 14, alpha: 1 } } })
    .composite([{ input: await fitBody(bodyBuf, Math.round(side * 0.78)), gravity: 'center' }])
    .png()
    .toBuffer();
  comps.push({ input: white180, left: 12 + cellW * sizes.length + 16, top: 12 });
  comps.push({ input: black180, left: 12 + cellW * sizes.length + 16 + side + 16, top: 12 });
  const outDir = path.join(os.tmpdir(), 'watch_icons_preview');
  fs.mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, 'bare-compare.png');
  await sharp({ create: { width: W, height: H, channels: 4, background: { r: 250, g: 250, b: 250, alpha: 1 } } }).composite(comps).png().toFile(out);
  log(`对比图 ${out}（左：三底 × 16/32/48 放大 8×；右：180 白底 / 180 影院黑底）`);
} else {
  for (const [name, size, kind, ratio] of SET) {
    const buf = kind === 'bare' ? await bare(size, ratio, bodyBuf) : await fullBleed(size, ratio, bodyBuf);
    fs.writeFileSync(path.join(IMG, NAME(name)), buf);
    const m = await sharp(buf).metadata();
    log(`${NAME(name)} ← ${m.width}×${m.height}  ${kind === 'bare' ? '纯透明' : BG_APP_HEX + ' 实底'}  主体占比 ${ratio}  ${(buf.length / 1024).toFixed(1)}KB`);
  }
  log('完成');
}
