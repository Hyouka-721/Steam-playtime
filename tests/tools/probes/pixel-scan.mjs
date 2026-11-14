/* _p113_px2.mjs — 干净版：只在点阵簇区域内量行/列间距与点的宽高 */
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const sharp = require('sharp');

const f = process.argv[2];
const y0 = Number(process.argv[3] || 0), y1 = Number(process.argv[4] || 9999);
const x0 = Number(process.argv[5] || 0), x1 = Number(process.argv[6] || 99999);

const { data, info } = await sharp(f).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height, C = info.channels;
const isDot = (r, g, b) => b > 90 && b > r + 30 && b > g + 20;

const ya = Math.max(0, y0), yb = Math.min(H - 1, y1), xa = Math.max(0, x0), xb = Math.min(W - 1, x1);
const rowHit = new Array(H).fill(0), colHit = new Array(W).fill(0);
let minX = 1e9, maxX = -1, minY = 1e9, maxY = -1;
for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) {
  const i = (y * W + x) * C;
  if (isDot(data[i], data[i + 1], data[i + 2])) {
    rowHit[y]++; colHit[x]++;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
}
const bands = (arr, thr) => {
  const out = []; let s = -1;
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] > thr) { if (s < 0) s = i; } else if (s >= 0) { out.push([s, i - 1]); s = -1; }
  }
  if (s >= 0) out.push([s, arr.length - 1]);
  return out.map(([a, b]) => ({ a, b, w: b - a + 1, c: +((a + b) / 2).toFixed(1) }));
};
const rb = bands(rowHit, 8), cb = bands(colHit, 8);
const pitch = (bs) => bs.slice(1).map((v, i) => +(v.c - bs[i].c).toFixed(1));
console.log(JSON.stringify({
  file: f.split(/[\\/]/).pop(), W, H,
  bbox: { minX, maxX, minY, maxY },
  rows: rb.length, rowCenters: rb.map((b) => b.c), rowHeights: rb.map((b) => b.w), rowPitch: pitch(rb),
  cols: cb.length, colCenters: cb.slice(0, 14).map((b) => b.c), colWidths: cb.slice(0, 14).map((b) => b.w), colPitch: pitch(cb).slice(0, 14),
}, null, 1));
