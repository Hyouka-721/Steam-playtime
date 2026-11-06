/* 第 90 轮：诊断「合成底剖面」为什么整片偏暗 —— 打印截图像素，不猜。 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';
import sharp from 'sharp';
const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
void require;

const P = path.join(os.tmpdir(), 'shots89verify', 'solid-bright.png');
const { data, info } = await sharp(fs.readFileSync(P)).raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H, channels: ch } = info;
console.log('size', W, H, 'channels', ch);
const rgb = (x, y) => { const i = (y * W + x) * ch; return [data[i], data[i + 1], data[i + 2]]; };
const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const L = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const y = Math.floor(H / 2);
console.log('mid row y=', y);
for (const x of [2, 8, 16, 24, 30, 40, 60, 80, 100, 110, 120, W - 3]) {
  const [r, g, b] = rgb(x, y);
  console.log(' x=' + x, 'rgb', r, g, b, 'L=' + L(r, g, b).toFixed(4));
}
console.log('vertical at x=8:');
for (const yy of [4, 12, 20, 28, 32, 40, 48, 56, 64, 72, 80, H - 4]) {
  const [r, g, b] = rgb(8, yy);
  console.log(' y=' + yy, 'rgb', r, g, b, 'L=' + L(r, g, b).toFixed(4));
}
