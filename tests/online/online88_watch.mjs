/* 第 87/88 轮 watch 侧线上复验：站点图标（电影胶片，favicon 无底盘）
   对应提交 6800ff3（+ 1c07576 / 57c00b2），预期线上 watch.css?v=40 不变、六条 link 指向 -97e35b7b

   ① 指纹：六条 link 都在 → -97e35b7b；不再引用 -064bab46 / minion webp；css/js 与本地 md5 全等
   ② 文件：六张 200 + image/png + 真实像素尺寸 = 声明；字节 md5 与本地全等
   ③ 盘型：小档四角 alpha=0；大档满幅不透明且底色纯白；占比 0.938 / 0.779（线上解码量，不看本地）
   ④ 旧 URL：-064bab46 六张必须 404（换 hash 的意义就在这 —— 旧缓存不会顶上来）
   ⑤ 1440 / 390 运行时：DOM 六条 link、浏览器实际解码宽度、页眉 logo 仍小黄人、零 JS 异常

   ⚠️ 本文件带 `_watch` 后缀：另一条线也有 `online88.mjs`（index 站热力图两月并排），轮号撞号、文件名不撞。
   ⚠️ 所有套件统一 --no-proxy-server；图标字节在页内 fetch 后 base64 回传，避开 Node 直连不通的问题。 */
import { createRequire } from 'module';
import fs from 'fs';
import crypto from 'crypto';
import sharp from 'sharp';
const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const SITE = 'https://hyouka-721.github.io/Steam-playtime/';
const ROOT = 'C:/Users/33329/WorkBuddy/2026-10-13-18-17-49/steam-playtime/docs/';
const HASH = '97e35b7b';
const OLD = '064bab46';
const TS = Date.now();

const md5 = (b) => crypto.createHash('md5').update(b).digest('hex');
const norm = (s) => String(s).replace(/\r\n/g, '\n');
const md5txt = (s) => md5(Buffer.from(norm(s), 'utf8'));
const localCss = norm(fs.readFileSync(ROOT + 'watch.css', 'utf8'));
const localJs = norm(fs.readFileSync(ROOT + 'watch.js', 'utf8'));

let pass = 0, fail = 0;
const ok = (n, c, extra = '') => {
  c ? (pass++, console.log(`PASS ${n}${extra ? '  — ' + extra : ''}`))
    : (fail++, console.log(`FAIL ${n}  — ${extra}`));
};

const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));

/* 页内 fetch：拿回 status / content-type / base64 字节，避开 Node 直连 */
const grab = (url) => page.evaluate(async (u) => {
  const r = await fetch(u, { cache: 'reload' });
  const buf = new Uint8Array(await r.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
  return { status: r.status, type: r.headers.get('content-type') || '', b64: btoa(bin) };
}, url);

await page.goto(SITE + 'watch.html?t=' + TS, { waitUntil: 'load' });
await page.waitForTimeout(600);
const html = await page.evaluate(async (u) => (await fetch(u, { cache: 'reload' })).text(), SITE + 'watch.html?t=' + TS);

const FILES = [
  ['favicon-watch-16.png', 16],
  ['favicon-watch-32.png', 32],
  ['favicon-watch-48.png', 48],
  ['icon-watch-192.png', 192],
  ['icon-watch-512.png', 512],
  ['apple-touch-icon-watch.png', 180],
];
const N = (b) => b.replace(/\.png$/, '') + '-' + HASH + '.png';

/* ---------- ① 指纹 ---------- */
console.log('== ① 内容指纹 ==');
const links = [...html.matchAll(/<link[^>]+rel="(?:icon|apple-touch-icon)"[^>]*>/g)].map((m) => m[0]);
ok('A1 线上六条图标 link 都在（5 条 rel=icon + 1 条 apple-touch-icon）', links.length === 6, `${links.length} 条`);
ok('A2 六条 link 全部指向 -' + HASH,
  links.every((l) => l.includes('-' + HASH + '.png')) && !links.some((l) => l.includes(OLD)),
  links.map((l) => (l.match(/href="([^"]+)"/) || [])[1]).join(' | '));
ok('A3 不再拿 img/minion-*.webp 当 favicon（小黄人仍是站内 logo，不删）',
  !/<link rel="icon"[^>]*image\/webp/.test(html) && /minion-[0-9a-f]{8}\.webp/.test(html));

const liveCss = await page.evaluate(async (u) => (await fetch(u, { cache: 'reload' })).text(), SITE + 'watch.css?v=40&t=' + TS);
const liveJs = await page.evaluate(async (u) => (await fetch(u, { cache: 'reload' })).text(), SITE + 'watch.js?v=31&t=' + TS);
ok('A4 watch.css?v=40 / watch.js?v=31 未变（本轮不 bump —— 换的是文件 URL），且与本地字节全等',
  /watch\.css\?v=40/.test(html) && /watch\.js\?v=31/.test(html) &&
  md5txt(liveCss) === md5txt(localCss) && md5txt(liveJs) === md5txt(localJs),
  `css ${md5txt(liveCss).slice(0, 12)} / js ${md5txt(liveJs).slice(0, 12)}`);

/* ---------- ② 文件 ---------- */
console.log('== ② 六档文件 ==');
const got = {};
for (const [base, size] of FILES) {
  const g = await grab(SITE + 'img/' + N(base) + '?t=' + TS);
  got[base] = { ...g, size, buf: Buffer.from(g.b64, 'base64') };
}
const bad = FILES.filter(([b]) => got[b].status !== 200 || !/image\/png/.test(got[b].type));
ok('A5 六张图标线上全部 200 且 content-type 是 image/png', bad.length === 0,
  FILES.map(([b]) => `${b.replace('.png', '')}:${got[b].status}`).join(' '));
ok('A6 六张图标线上字节 md5 与本地全等（→ 像素属性必然一致）',
  FILES.every(([b]) => md5(got[b].buf) === md5(fs.readFileSync(ROOT + 'img/' + N(b)))),
  FILES.map(([b]) => got[b].buf.length + 'B').join(' / '));

const metas = {};
for (const [b] of FILES) metas[b] = await sharp(got[b].buf).metadata();
ok('A7 解码出的真实像素尺寸 = 声明的 sizes',
  FILES.every(([b, s]) => metas[b].width === s && metas[b].height === s),
  FILES.map(([b, s]) => `${s}→${metas[b].width}x${metas[b].height}`).join(' '));

/* ---------- ③ 盘型 ---------- */
console.log('== ③ 盘型与一致性 ==');
const corners = async (b) => {
  const { data, info } = await sharp(got[b].buf).raw().toBuffer({ resolveWithObject: true });
  const px = (x, y) => {
    const i = (y * info.width + x) * info.channels;
    return info.channels === 4 ? data[i + 3] : 255;
  };
  return [px(0, 0), px(info.width - 1, 0), px(0, info.height - 1), px(info.width - 1, info.height - 1)];
};
const small = ['favicon-watch-16.png', 'favicon-watch-32.png', 'favicon-watch-48.png'];
const big = ['apple-touch-icon-watch.png', 'icon-watch-192.png', 'icon-watch-512.png'];
const cSmall = await Promise.all(small.map(corners));
ok('A8 小档 16/32/48 四角 alpha 全 0（真透明，没有白框硬边）',
  cSmall.every((c) => c.every((a) => a === 0)), cSmall.map((c) => c.join(',')).join(' | '));

const cBig = await Promise.all(big.map(corners));
ok('A9 大档 180/192/512 满幅不透明（iOS 不会把透明填成黑底）',
  cBig.every((c) => c.every((a) => a === 255)), cBig.map((c) => c.join(',')).join(' | '));

/* 主体占比：非透明且非近白的包围盒 / 画布边长（第 88 轮口径，不绑素材配色） */
const ratio = async (b) => {
  const { data, info } = await sharp(got[b].buf).raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels;
  let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * ch;
      const a = ch === 4 ? data[i + 3] : 255;
      if (a < 128) continue;
      if (data[i] > 243 && data[i + 1] > 243 && data[i + 2] > 243) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return +(((x1 - x0 + 1) / info.width)).toFixed(3);
};
const rSmall = await Promise.all(small.map(ratio));
const rBig = await Promise.all(big.map(ratio));
ok('A10 小档主体占比一致（0.94，极差 ≤0.02）',
  rSmall.every((r) => Math.abs(r - 0.938) <= 0.02) && Math.max(...rSmall) - Math.min(...rSmall) <= 0.02,
  rSmall.join(' / '));
ok('A11 大档主体占比一致（0.78，极差 ≤0.01，且比小档小 —— 留了系统圆角的安全区）',
  rBig.every((r) => Math.abs(r - 0.779) <= 0.01) && Math.max(...rBig) - Math.min(...rBig) <= 0.01,
  rBig.join(' / '));

/* ---------- ④ 旧 URL 必须 404 ---------- */
console.log('== ④ 旧 hash 已下线 ==');
const olds = [];
for (const [base] of FILES) {
  const g = await grab(SITE + 'img/' + base.replace(/\.png$/, '') + '-' + OLD + '.png?t=' + TS);
  olds.push(`${base.replace('.png', '')}:${g.status}`);
}
ok('A12 旧 hash（-064bab46）六张线上全部 404 —— 换 hash 就是为了让旧缓存顶不上来',
  olds.every((s) => s.endsWith(':404')), olds.join(' '));

/* ---------- ⑤ 运行时 ---------- */
console.log('== ⑤ 1440 / 390 运行时 ==');
const rt = async (w, h) => {
  const c2 = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, serviceWorkers: 'block' });
  const p = await c2.newPage();
  const e2 = [];
  p.on('pageerror', (x) => e2.push(String(x)));
  await p.goto(SITE + 'watch.html?t=' + TS, { waitUntil: 'load' });
  await p.waitForTimeout(900);
  const r = await p.evaluate(() => {
    const ls = [...document.querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"]')].map((l) => l.getAttribute('href'));
    const av = document.querySelector('.w-home img');
    return {
      links: ls.length,
      allNew: ls.every((x) => /-97e35b7b\.png$/.test(x)),
      apple: ls.find((x) => x.includes('apple-touch')) || '',
      logo: av ? { src: av.getAttribute('src'), ok: av.complete && av.naturalWidth > 0, alt: av.alt } : null,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  await c2.close();
  return { ...r, errs: e2 };
};
const d = await rt(1440, 900);
ok('B1 1440 下 DOM 里 6 条图标 link，且全部指向新 hash', d.links === 6 && d.allNew, `${d.links} 条`);
ok('B2 apple-touch-icon 指向 -97e35b7b（iOS 添加到主屏用的就是它）', /apple-touch-icon-watch-97e35b7b\.png$/.test(d.apple), d.apple);
ok('B3 页眉 logo 仍是小黄人且已加载（只换 favicon，不动站内形象）', !!d.logo && d.logo.ok, d.logo ? `${d.logo.src} alt=${d.logo.alt}` : 'MISSING');
ok('B4 1440 无横向溢出 + 零 JS 异常', d.overflow === 0 && d.errs.length === 0, `ov=${d.overflow} err=${d.errs.length}`);

const m = await rt(390, 844);
ok('C1 390 下仍是 6 条图标 link（不靠媒体查询才挂）', m.links === 6, `${m.links} 条`);
ok('C2 390 零 JS 异常 + 不横向溢出', m.errs.length === 0 && m.overflow === 0, `ov=${m.overflow} err=${m.errs.length}`);

await browser.close();
console.log(`\n===== 第 88 轮 watch 线上复验：${pass} PASS / ${fail} FAIL =====`);
process.exit(fail ? 1 : 0);
