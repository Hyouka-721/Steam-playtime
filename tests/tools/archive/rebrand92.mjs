/* 第 92 轮：把 index.html 的标题/图标/站名换成「Game Time + 手柄图标」
   ⚠️ favicon 原来是两条超长 base64（data URI），必须用「整行匹配」替换，不能逐字手抄 */
import fs from 'node:fs';

const P = 'docs/index.html';
let s = fs.readFileSync(P, 'utf8');
const before = s;

/* ① title：Game time → Game Time（用户要求 T 大写） */
const t1 = s.split('<title>Game time</title>').length - 1;
if (t1 !== 1) throw new Error(`title 命中 ${t1} 处，应为 1`);
s = s.replace('<title>Game time</title>', '<title>Game Time</title>');

/* ② favicon：两行 base64 → 三条按尺寸的文件引用 */
const iconLines = s.split('\n');
const iFav = iconLines.findIndex((l) => l.startsWith('<link rel="icon" type="image/png" href="data:image/png;base64,'));
const iApple = iconLines.findIndex((l) => l.startsWith('<link rel="apple-touch-icon" href="data:image/png;base64,'));
if (iFav < 0) throw new Error('找不到内联 favicon 行');
if (iApple < 0) throw new Error('找不到内联 apple-touch-icon 行');
console.log(`内联 favicon 行 ${iFav + 1}（${iconLines[iFav].length} 字符）、apple-touch 行 ${iApple + 1}（${iconLines[iApple].length} 字符）`);

iconLines[iFav] = [
  '  <link rel="icon" type="image/png" sizes="16x16" href="img/favicon-16.png">',
  '  <link rel="icon" type="image/png" sizes="32x32" href="img/favicon-32.png">',
  '  <link rel="icon" type="image/png" sizes="48x48" href="img/favicon-48.png">',
].join('\n');
iconLines[iApple] = '  <link rel="apple-touch-icon" sizes="180x180" href="img/apple-touch-icon.png">';
s = iconLines.join('\n');

/* ③ 页眉站名 */
const t3 = s.split('aria-label="返回顶部">My Game Time</h1>').length - 1;
if (t3 !== 1) throw new Error(`站名命中 ${t3} 处，应为 1`);
s = s.replace('aria-label="返回顶部">My Game Time</h1>', 'aria-label="返回顶部">Game Time</h1>');

if (s === before) throw new Error('没有任何改动');
fs.writeFileSync(P, s, 'utf8');
console.log('index.html 已改：title / favicon / apple-touch-icon / 站名');

/* ④ manifest */
const M = 'docs/manifest.webmanifest';
let m = fs.readFileSync(M, 'utf8');
m = m.replace('"name": "My Game Time · Steam 游戏时长"', '"name": "Game Time · Steam 游戏时长"');
m = m.replace('"short_name": "Game Time"', '"short_name": "Game Time"'); // 已是目标值，确认无「My」前缀
m = m.replace('"src": "img/icon-192.png"', '"src": "img/icon-game-192.png"');
m = m.replace('"src": "img/icon-512.png"', '"src": "img/icon-game-512.png"');
if (m.includes('My Game Time') || m.includes('img/icon-192')) throw new Error('manifest 替换失败');
fs.writeFileSync(M, m, 'utf8');
console.log('manifest 已改：name + 两个 icon 路径');

/* ⑤ sw.js 的预缓存清单（两处） */
const S = 'docs/sw.js';
let w = fs.readFileSync(S, 'utf8');
const n1 = w.split("'img/icon-192.png', 'img/icon-512.png'").length - 1;
if (n1 !== 2) throw new Error(`sw.js 预缓存清单命中 ${n1} 处，应为 2`);
w = w.split("'img/icon-192.png', 'img/icon-512.png'").join("'img/icon-game-192.png', 'img/icon-game-512.png'");
fs.writeFileSync(S, w, 'utf8');
console.log('sw.js 已改：两处预缓存清单');

/* ⑥ watch.html 的返回链接文案 */
const W = 'docs/watch.html';
let x = fs.readFileSync(W, 'utf8');
if (!x.includes('← 回到 My Game Time')) throw new Error('watch.html 找不到返回链接');
x = x.replace('← 回到 My Game Time', '← 回到 Game Time');
fs.writeFileSync(W, x, 'utf8');
console.log('watch.html 已改：返回链接文案');
