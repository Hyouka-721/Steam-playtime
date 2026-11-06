/* 一次性：把 verify89_watch 里旧的两套对比度取样（都有已知偏差）换成「合成底 + 软边剖面」 */
import fs from 'node:fs';

const P = 'C:/Users/33329/WorkBuddy/2026-10-13-18-17-49/steam-playtime/tests/verify/verify89_watch.mjs';
let src = fs.readFileSync(P, 'utf8').replace(/\r\n/g, '\n');

const START = '/* ---------- B7 可读性实测：两个数，都要报 ---------- */';
const ENDMARK = '样本 ${fills.join(\'/\')}`);';

const i = src.indexOf(START);
const j = src.indexOf(ENDMARK);
if (i < 0 || j < 0) { console.error('锚点没找到', i, j); process.exit(1); }
const end = j + ENDMARK.length;

const NEW = `/* ---------- B7/B8 实测：合成底 + 软边剖面 ---------- */
/* ⚠️ 踩过的三个取样坑（都写成注释，免得再犯）：
   ① 按颜色剔「金色像素」再取背景中位 → 亮黄海报的路面 r-b 也有 80+，被当成字剔掉，
      剩下全是最暗角落，对比度虚高到 10+（假绿）；
   ② 只取左右内边距两条竖带 → 右侧正好压在海报深色区，中位被拉黑，同样虚高；
   ③ 取「字周围 3px 内最亮的非字像素」→ 抗锯齿边缘像素比字暗一点点、又过不了金色判据，
      于是被判成"背景"，对比度掉到 1.1（假红）。
   → 结论：**不要把"可读性"寄托在按颜色分类上**。这里做两件确定性的事：
      A. 把海报换成**纯色合成底**（把 img 藏起来、给 .poster-pic 填色），底盘变得可计算；
      B. 量**软边剖面**——沿胶囊左边界横切，最大单像素亮度跳变 + 渐变带宽度。
         「A 软边」就是这一条，1px 硬边会给出 0.3 级的跳变，软晕是十几 px 的缓坡。 */
const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const L = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const GOLD = L(220, 185, 120);

const setSolid = (color) => p.evaluate((c) => {
  [...document.querySelectorAll('#w-grid .poster')].slice(0, 14).forEach((card) => {
    const pic = card.querySelector('.poster-pic');
    const img = pic.querySelector('img');
    if (img) img.style.visibility = 'hidden';
    pic.style.background = c;
  });
}, color);

/* 剖面：横切胶囊左边界（y 取胶囊中线），返回 {maxJump, rampPx} */
const profile = async (buf, badgeLeftCss) => {
  const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels, W = info.width, H = info.height;
  const y = Math.floor(H / 2);
  const lum = [];
  for (let x = 0; x < W; x++) { const i = (y * W + x) * ch; lum.push(L(data[i], data[i + 1], data[i + 2])); }
  /* 只扫到胶囊内部前 40%（避开文字），找最大的相邻跳变 */
  const stop = Math.min(W - 1, Math.round(badgeLeftCss * 2 + 20));
  let maxJump = 0, at = 0;
  for (let x = 1; x < stop; x++) {
    const d = Math.abs(lum[x] - lum[x - 1]);
    if (d > maxJump) { maxJump = d; at = x; }
  }
  /* 渐变带：从"平台值"的 10%~90% 之间的宽度（像素） */
  const left = lum[0], right = lum[Math.min(stop, W - 1)];
  const lo = Math.min(left, right), hi = Math.max(left, right);
  const t10 = lo + (hi - lo) * 0.1, t90 = lo + (hi - lo) * 0.9;
  let a = -1, b2 = -1;
  for (let x = 0; x < stop; x++) {
    const v = lum[x];
    if (a < 0 && (left > right ? v <= t10 : v >= t90)) a = x;
    if (a >= 0 && b2 < 0 && (left > right ? v <= t90 : v >= t10)) b2 = x;
  }
  return { maxJump: +maxJump.toFixed(3), rampPx: b2 > a ? b2 - a : 0, at, W, H };
};

const BRIGHT = '#f6efe9';           // 比《冰菓》的亮黄路面更亮的合成底（更接近纯白的最坏情况）
await setSolid(BRIGHT);
await p.waitForTimeout(260);
const badge = p.locator('#w-grid .poster-score').first();
await badge.scrollIntoViewIfNeeded();
await p.waitForTimeout(200);
const bb = await badge.boundingBox();
const pad = 16;
const clipBuf = await p.screenshot({
  clip: { x: bb.x - pad, y: bb.y - pad, width: bb.width + pad * 2, height: bb.height + pad * 2 },
  path: path.join(OUT, 'solid-bright.png'),
});
const pr = await profile(clipBuf, pad);
ok('B7 软边：横切胶囊边界，最大单像素亮度跳变 ≤0.05（1px 硬边会到 0.3 级）',
  pr.maxJump <= 0.05, \`jump=\${pr.maxJump} @x=\${pr.at}/\${pr.W}\`);
ok('B8 软边：边界过渡带 ≥4 设备像素（≈2 CSS px 以上，不是一刀切）',
  pr.rampPx >= 4, \`ramp=\${pr.rampPx}px\`);

/* 亮底上的字/底对比：只作为「淡化代价」的知情记录，阈值按大号装饰文字的宽松档 */
const inner = await sharp(clipBuf).extract({
  left: Math.round(pad * 2 * 0.42), top: Math.round(pad * 2 * 0.42),
  width: Math.round(bb.width * 2 * 0.16), height: Math.round(bb.height * 2 * 0.5),
}).raw().toBuffer({ resolveWithObject: true }).catch(() => null);
let fillL = null;
if (inner) {
  const { data, info } = inner, ch = info.channels;
  const ls = [];
  for (let k = 0; k < data.length; k += ch * 3) ls.push(L(data[k], data[k + 1], data[k + 2]));
  ls.sort((x, y2) => x - y2);
  fillL = ls[Math.floor(ls.length / 2)];
}
const fillRatio = fillL === null ? null : +((GOLD + 0.05) / (fillL + 0.05)).toFixed(2);
ok('B9 亮合成底上 金字/底盘 对比 ≥2.2:1（报数：这是「淡化」的代价，靠 text-shadow 补局部对比）',
  fillRatio !== null && fillRatio >= 2.2, \`对比 \${fillRatio ?? '-'}（底 L=\${fillL === null ? '-' : fillL.toFixed(3)}）\`);

await setSolid('');`;

src = src.slice(0, i) + NEW + src.slice(end);
fs.writeFileSync(P, src);
console.log('ok, 新块 ' + NEW.split('\n').length + ' 行');
