/* _p113_rows.mjs — 找出截图里所有「有内容」的横行（文字/点），输出 y 带与主色 */
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const sharp = require('sharp');

const f = process.argv[2];
const xa = Number(process.argv[3] || 0);
const xb = Number(process.argv[4] || 99999);
const { data, info } = await sharp(f).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height, C = info.channels;

const rows = [];
for (let y = 0; y < H; y++) {
  let n = 0, bluish = 0;
  for (let x = Math.max(0, xa); x <= Math.min(W - 1, xb); x++) {
    const i = (y * W + x) * C;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const L = 0.299 * r + 0.587 * g + 0.114 * b;
    if (L > 42) n++;
    if (b > 90 && b > r + 30 && b > g + 20) bluish++;
  }
  rows.push({ y, n, bluish });
}
const bands = [];
let s = -1;
for (const r of rows) {
  if (r.n > 4) { if (s < 0) s = r.y; }
  else if (s >= 0) { bands.push([s, r.y - 1]); s = -1; }
}
if (s >= 0) bands.push([s, H - 1]);
const out = bands.map(([a, b]) => {
  let bl = 0;
  for (let y = a; y <= b; y++) bl += rows[y].bluish;
  return { a, b, h: b - a + 1, bluishPx: bl };
});
console.log(JSON.stringify(out, null, 1));
