/* 一次性诊断：合成亮底、**默认静息态**（鼠标移开）下横切评分角标，
   打印：① 逐像素亮度曲线 ② 盘面区间最大单像素跳变 ③ 10%~90% 渐变带宽度
   ④ 字形核心 vs 紧邻暗晕的局部对比（这才是眼睛判断可读性的量） */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const OUT = path.join(os.tmpdir(), 'shots89dbg');
fs.mkdirSync(OUT, { recursive: true });
const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const L = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a, b) => +(((Math.max(a, b)) + 0.05) / ((Math.min(a, b)) + 0.05)).toFixed(2);

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
/* 关键：先滚到位、再把鼠标移到角落，确保量的是「默认安静」而不是 hover 点亮态 */
const badge = p.locator('#w-grid .poster-score').first();
await badge.scrollIntoViewIfNeeded();
await p.mouse.move(4, 4);
await p.waitForTimeout(360);

const bb = await badge.boundingBox();
const PAD = 16;            // CSS px，左右各留 16（= 32 设备像素）
const clip = { x: bb.x - PAD, y: bb.y - PAD, width: bb.width + PAD * 2, height: bb.height + PAD * 2 };
const buf = await p.screenshot({ clip, path: path.join(OUT, 'solid-rest.png') });
const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
const ch = info.channels, W = info.width, H = info.height;
const y = Math.floor(H / 2);
const lum = [];
for (let x = 0; x < W; x++) { const i = (y * W + x) * ch; lum.push(+L(data[i], data[i + 1], data[i + 2]).toFixed(4)); }

const dpr = 2;
const left = Math.round(PAD * dpr);                 // 角标左边界（设备像素）
const right = Math.round((PAD + bb.width) * dpr);   // 角标右边界
const textL = left + 8 * dpr, textR = right - 8 * dpr;   // 文字区 = 去掉 8px padding

console.log(`badge ${bb.width.toFixed(1)}x${bb.height.toFixed(1)} CSS  clip ${W}x${H}  ch=${ch}`);
console.log(`左边界 x=${left}  右边界 x=${right}  文字区 ${textL}~${textR}`);
console.log('\n--- 亮度曲线（每 2 设备像素）---');
const line = [];
for (let x = 0; x < W; x += 2) line.push(`${x}:${lum[x]}`);
console.log(line.join(' '));

/* ① 盘面区间（左边界外侧 → 文字开始前）最大单像素跳变 */
let maxJump = 0, at = 0;
for (let x = 1; x <= textL; x++) {
  const d = Math.abs(lum[x] - lum[x - 1]);
  if (d > maxJump) { maxJump = d; at = x; }
}
console.log(`\n盘面区间 maxJump = ${maxJump.toFixed(4)} @x=${at}`);

/* ② 10%~90% 渐变带：降序剖面 → 起点=首次跌破 t90，终点=首次跌破 t10（原算法两个条件都在找暗侧，写反了） */
const a0 = lum[0], b0 = lum[textL];
const lo = Math.min(a0, b0), hi = Math.max(a0, b0), span = hi - lo;
const desc = a0 > b0;
const t90 = desc ? lo + span * 0.1 : lo + span * 0.9;   // "刚进入过渡"
const t10 = desc ? lo + span * 0.9 : lo + span * 0.1;   // "过渡结束"
let s1 = -1, s2 = -1;
for (let x = 0; x <= textL; x++) {
  const v = lum[x];
  if (s1 < 0 && (desc ? v <= t90 : v >= t90)) s1 = x;
  if (s1 >= 0 && s2 < 0 && (desc ? v <= t10 : v >= t10)) s2 = x;
}
console.log(`a0=${a0.toFixed(3)} b0=${b0.toFixed(3)} t90=${t90.toFixed(3)} t10=${t10.toFixed(3)}`);
console.log(`渐变带 s1=${s1} s2=${s2}  → ramp = ${s2 > s1 ? s2 - s1 : 0} 设备像素`);

/* ③ 字形核心 vs 紧邻暗晕（局部对比）：文字区最亮 = 字芯；文字区最暗 = 字间暗晕 */
let gMax = 0, gAt = 0, gMin = 1, mAt = 0;
for (let x = textL; x < textR; x++) {
  if (lum[x] > gMax) { gMax = lum[x]; gAt = x; }
  if (lum[x] < gMin) { gMin = lum[x]; mAt = x; }
}
console.log(`\n字芯 L=${gMax.toFixed(3)} @x=${gAt}   暗晕 L=${gMin.toFixed(3)} @x=${mAt}   局部对比 ${ratio(gMax, gMin)}:1`);

/* ④ 盘面「满强度」参考：padding 竖带内最暗点（不是字） */
let pMin = 1, pAt = 0;
for (let x = left; x <= textL; x++) if (lum[x] < pMin) { pMin = lum[x]; pAt = x; }
console.log(`盘面最暗 L=${pMin.toFixed(3)} @x=${pAt}  → 字芯/盘面 ${ratio(gMax, pMin)}:1`);
console.log(`纯合成底 L=${a0.toFixed(3)}  → 盘面/亮底 ${ratio(a0, pMin)}:1`);

await browser.close();
