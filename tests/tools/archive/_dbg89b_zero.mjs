/* 一次性诊断：第 89 轮迭代「完全删除背景填充」后，
   ① 角标盒外沿 / 内边距是否等于纯合成底（零填充的硬证据）
   ② 字形核心 vs 紧邻暗晕的局部对比还有多少（可读性全靠 text-shadow 了）
   ③ 字形核心 vs 纯亮底（这就是「淡化到极致」的代价） */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const OUT = path.join(os.tmpdir(), 'shots89zero');
fs.mkdirSync(OUT, { recursive: true });
const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const L = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a, b) => +(((Math.max(a, b)) + 0.05) / ((Math.min(a, b)) + 0.05)).toFixed(2);
const BG = L(246, 239, 233);

const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
const p = await ctx.newPage();
await p.goto('http://127.0.0.1:8895/watch.html?t=' + Date.now(), { waitUntil: 'load' });
await p.waitForTimeout(700);
await p.evaluate(() => {
  [...document.querySelectorAll('#w-grid .poster')].slice(0, 14).forEach((card) => {
    const pic = card.querySelector('.poster-pic');
    const img = pic.querySelector('img');
    if (img) img.style.visibility = 'hidden';
    pic.style.background = '#f6efe9';
  });
});
const badge = p.locator('#w-grid .poster-score').first();
await badge.scrollIntoViewIfNeeded();
await p.mouse.move(1, 1);           // 静置，别停在 hover 点亮态
await p.waitForTimeout(380);

const bb = await badge.boundingBox();
const PAD = 16, DPR = 2;
const clip = { x: bb.x - PAD, y: bb.y - PAD, width: bb.width + PAD * 2, height: bb.height + PAD * 2 };
const buf = await p.screenshot({ clip, path: path.join(OUT, 'zero.png') });
const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
const ch = info.channels, W = info.width, H = info.height;
const left = Math.round((bb.x - clip.x) * DPR);
const right = left + Math.round(bb.width * DPR);
const textL = left + 8 * DPR, textR = right - 8 * DPR;
const y = Math.floor(H / 2);
const lum = [];
for (let x = 0; x < W; x++) { const i = (y * W + x) * ch; lum.push(+L(data[i], data[i + 1], data[i + 2]).toFixed(4)); }
console.log(`badge ${bb.width.toFixed(1)}x${bb.height.toFixed(1)} CSS  clip ${W}x${H}  left=${left} right=${right} text ${textL}~${textR}`);
console.log('纯合成底 L =', BG.toFixed(4));
console.log('\n--- 亮度曲线（每 2 设备像素）---');
const line = [];
for (let x = 0; x < W; x += 2) line.push(`${x}:${lum[x]}`);
console.log(line.join(' '));

/* ① 零填充：盒外沿 x∈[0,left-2] 与内边距 x∈[left,left+8] 逐像素偏离纯底的最大值 */
const dev = (a, b) => {
  let mx = 0, at = 0;
  for (let x = a; x < b; x++) { const d = Math.abs(lum[x] - BG); if (d > mx) { mx = d; at = x; } }
  return { max: +mx.toFixed(4), at, min: +Math.min(...lum.slice(a, b)).toFixed(4) };
};
console.log('\n盒外沿 [0,' + (left - 2) + '] =', JSON.stringify(dev(0, left - 2)));
console.log('内边距 [' + left + ',' + (left + 8) + '] =', JSON.stringify(dev(left, left + 8)));
console.log('文字区 [' + textL + ',' + textR + '] =', JSON.stringify(dev(textL, textR)));

/* ② 2D：字芯 / 字间暗晕 */
let gMax = 0, gMin = 1, pure = 0, total = 0;
const y0 = Math.floor(H * 0.3), y1 = Math.ceil(H * 0.7);
for (let yy = y0; yy < y1; yy++) {
  for (let x = textL; x < Math.min(W, textR); x++) {
    const i = (yy * W + x) * ch, v = L(data[i], data[i + 1], data[i + 2]);
    if (v > gMax) gMax = v;
    if (v < gMin) gMin = v;
    total++;
    if (Math.abs(v - BG) <= 0.01) pure++;
  }
}
console.log(`\n文字区起点 L=${gMax.toFixed(3)}  最暗(暗晕) L=${gMin.toFixed(3)} → 亮底/暗晕 ${ratio(gMax, gMin)}:1`);
console.log(`文字区内「完全未被改动」的亮底像素占比 = ${(pure / total * 100).toFixed(1)}%  (${pure}/${total})`);
const GOLD = L(220, 185, 120);
console.log(`金字理论 L=${GOLD.toFixed(3)} → 金/暗晕 ${ratio(GOLD, gMin)}:1，金/亮底 ${ratio(GOLD, BG)}:1`);
await browser.close();
