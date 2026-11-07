/* _p113_px.mjs — 从用户截图里反解点阵的行/列间距（像素级） */
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const sharp = require('sharp');

const FILES = process.argv.slice(2);
for (const f of FILES) {
  const img = sharp(f);
  const meta = await img.metadata();
  const { data, info } = await img.raw().ensureAlpha().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, C = info.channels;
  const isDot = (i) => {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    // 影院黑主题下点阵是蓝阶：b 明显高于 r/g，且够亮
    return b > 90 && b > r + 30 && b > g + 20;
  };
  // 行带
  const rowHit = new Array(H).fill(0);
  const colHit = new Array(W).fill(0);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * C;
      if (isDot(i)) { rowHit[y]++; colHit[x]++; }
    }
  }
  const bands = (arr, thr) => {
    const out = [];
    let s = -1;
    for (let i = 0; i < arr.length; i++) {
      if (arr[i] > thr) { if (s < 0) s = i; } else if (s >= 0) { out.push([s, i - 1]); s = -1; }
    }
    if (s >= 0) out.push([s, arr.length - 1]);
    return out.map(([a, b]) => ({ a, b, len: b - a + 1, c: +((a + b) / 2).toFixed(1) }));
  };
  const rb = bands(rowHit, 3);
  const cb = bands(colHit, 2);
  const pitch = (bs) => bs.slice(1).map((v, i) => +(v.c - bs[i].c).toFixed(1));
  console.log(JSON.stringify({ f: f.split(/[\\/]/).pop(), W, H, rows: rb.length, rowBands: rb, rowPitch: pitch(rb), cols: cb.length, colBands: cb.slice(0, 8), colPitch: pitch(cb).slice(0, 8) }, null, 1));
}
