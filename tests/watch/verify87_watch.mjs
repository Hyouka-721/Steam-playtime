/* 第 87 轮 watch 侧：站点图标换成用户素材的「电影胶片」（六档一次生成）
   ⚠️ 素材换过三次：放映机 → 摄像机 → 电影胶片。前两次主体是深色，favicon 铺了暖白圆角盘；
   第 88 轮用户明确说「不想要铺暖白盘的 favicon」，换成亮蓝圆盘后 favicon 回到**纯透明**，
   只有 iOS/Android 那三档仍铺实底（纯白）—— 套件里 A6/A7/A8 就是这三条口径的守卫。
   对 http://127.0.0.1:8895 跑。⚠️ 与 index 线的 verify92（首页换成游戏手柄）不同文件，本文件带 _watch 后缀。

   ① 静态：html 的六条 link / 旧小黄人 favicon 已撤 / 六个文件的真实像素尺寸 /
            盘型与底色（小档盘外透明、大档满幅不透明）/ 主体占比六档一致 / 生成器与源素材在 /
            文件名带源图哈希（换素材＝换 URL，不用改缓存版本号）
   ② 1440 运行时：每条 link 都能 200、能解码且 naturalWidth = 声明尺寸、站内 logo 仍是小黄人
   ③ 390 运行时：图标照样能取到（与视口无关，但确认没有靠媒体查询才挂上去）
   ④ 守护：watch.css 未被本次改动波及（版本仍是 v24）、页面无 JS 异常 */
import { createRequire } from 'module';
import fs from 'fs';
import sharp from 'sharp';

const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const BASE = 'http://127.0.0.1:8895/';
const ROOT = 'C:/Users/33329/WorkBuddy/2026-10-13-18-17-49/steam-playtime/';
const DOCS = ROOT + 'docs/';

const html = fs.readFileSync(DOCS + 'watch.html', 'utf8').replace(/\r\n/g, '\n');

/* 源素材名里的 8 位哈希就是图标文件名的后缀 —— 从磁盘推导，不手抄（换图时套件自动跟上） */
const srcName = fs.readdirSync(DOCS + 'img').find((f) => /^(?:film|camera|projector)-[0-9a-f]{8}\.png$/.test(f)) || '';
const HASH = (srcName.match(/-([0-9a-f]{8})\.png$/) || [])[1] || '';
const N = (base) => base.replace(/\.png$/, '') + '-' + HASH + '.png';

let pass = 0, fail = 0;
const ok = (n, c, extra = '') => {
  c ? (pass++, console.log(`PASS ${n}${extra ? '  — ' + extra : ''}`))
    : (fail++, console.log(`FAIL ${n}  — ${extra}`));
};

/* ================= A 静态 ================= */

/* A1 六条 link 齐备且指向新文件 */
const iconLinks = [...html.matchAll(/<link rel="icon"[^>]*>/g)].map((m) => m[0]);
const appleLink = (html.match(/<link rel="apple-touch-icon"[^>]*>/) || [''])[0];
const wantLinks = [
  ['16x16', 'img/' + N('favicon-watch-16.png')],
  ['32x32', 'img/' + N('favicon-watch-32.png')],
  ['48x48', 'img/' + N('favicon-watch-48.png')],
  ['192x192', 'img/' + N('icon-watch-192.png')],
  ['512x512', 'img/' + N('icon-watch-512.png')],
];
ok('A1 五条 rel=icon（16/32/48/192/512）都指向新的电影胶片图标',
  iconLinks.length === 5 && wantLinks.every(([s, h]) => iconLinks.some((l) => l.includes(`sizes="${s}"`) && l.includes(h))),
  iconLinks.map((l) => (l.match(/sizes="([^"]+)"/) || [])[1] + '→' + (l.match(/href="([^"]+)"/) || [])[1]).join(' | '));

ok('A2 apple-touch-icon 180 指向 img/apple-touch-icon-watch-<hash>.png',
  /sizes="180x180"/.test(appleLink) && appleLink.includes('href="img/' + N('apple-touch-icon-watch.png') + '"'), appleLink);

/* A3 旧的小黄人 favicon（webp、无尺寸）已撤 —— 但它仍是站内 logo，别一起删了 */
ok('A3 不再把 img/minion-*.webp 当 favicon（type="image/webp" 的 icon link 计数 0）',
  !/<link rel="icon"[^>]*type="image\/webp"/.test(html) && !iconLinks.some((l) => l.includes('minion')),
  iconLinks.filter((l) => l.includes('minion')).length);
ok('A4 小黄人仍是站内 logo（.w-home 里那张图没被删）',
  /<a class="w-home"[^>]*>\s*<img src="img\/minion-0ef9a202\.webp"/.test(html.replace(/\n\s*/g, ' ')));

/* A5 六个文件的真实像素尺寸（按 sharp 读，不看文件名） */
const FILES = [
  [N('favicon-watch-16.png'), 16],
  [N('favicon-watch-32.png'), 32],
  [N('favicon-watch-48.png'), 48],
  [N('apple-touch-icon-watch.png'), 180],
  [N('icon-watch-192.png'), 192],
  [N('icon-watch-512.png'), 512],
];
const metas = {};
for (const [f, size] of FILES) {
  const p = DOCS + 'img/' + f;
  metas[f] = fs.existsSync(p) ? await sharp(p).metadata() : null;
  metas[f] = metas[f] && { ...metas[f], _size: size };
}
ok('A5 六个图标文件都在，且像素尺寸与声明一致',
  FILES.every(([f, s]) => metas[f] && metas[f].width === s && metas[f].height === s),
  FILES.map(([f, s]) => `${f}:${metas[f] ? metas[f].width : 'MISSING'}/${s}`).join(' '));

/* A6 盘型：小档盘外透明、盘内实底；大档满幅不透明（iOS 不吃透明，会填黑） */
const px = async (f) => (await sharp(DOCS + 'img/' + f).raw().toBuffer({ resolveWithObject: true })).data;
const alphaAt = (data, w, x, y) => data[(y * w + x) * 4 + 3];
const S1 = [N('favicon-watch-16.png'), N('favicon-watch-32.png'), N('favicon-watch-48.png')];
const smallCorner = [];
for (const f of S1) {
  const d = await px(f);
  smallCorner.push(alphaAt(d, metas[f].width, 0, 0));
}
ok('A6 三档 favicon 四角透明 —— 没有底盘，标签页上不留白框的硬边（第 88 轮去盘后重新钉的一条）',
  smallCorner.every((a) => a === 0), smallCorner.join(','));

const S2 = [N('apple-touch-icon-watch.png'), N('icon-watch-192.png'), N('icon-watch-512.png')];
const bigOpaque = [];
for (const f of S2) {
  const st = await sharp(DOCS + 'img/' + f).stats();
  bigOpaque.push(st.isOpaque);
}
ok('A7 180/192/512 三档满幅不透明（iOS 不会把透明填成黑底）',
  bigOpaque.every(Boolean), bigOpaque.join(','));

/* A8 大档实底是纯白 rgb(255,255,255)（保住黑环轮廓）；小档不铺底，四角已在 A6 验过透明 */
const bgSamples = [];
for (const f of S2) {
  const { data, info } = await sharp(DOCS + 'img/' + f).raw().toBuffer({ resolveWithObject: true });
  const i = 0;                                   /* 左上角就是纯底色：大档内容占比 0.78，角落必是背景 */
  bgSamples.push([f, data[i], data[i + 1], data[i + 2]]);
}
ok('A8 180/192/512 的实底是纯白 rgb(255,255,255)',
  bgSamples.every(([, r, g, b]) => r === 255 && g === 255 && b === 255),
  bgSamples.map(([f, r, g, b]) => `${f.split('-')[0]}:${r},${g},${b}`).join(' '));

/* A9 一致性：主体占画布的比例六档各自一致（这就是「各尺寸不跑形」的量化口径） */
const ratios = {};
for (const [f, size] of FILES) {
  const { data, info } = await sharp(DOCS + 'img/' + f).raw().toBuffer({ resolveWithObject: true });
  let minX = 1e9, maxX = -1, minY = 1e9, maxY = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const ch = info.channels;
      const i = (y * info.width + x) * ch;
      /* ⚠️ 调色板 PNG 满幅不透明时 sharp 解出来是 **3 通道**（没有 alpha），
         照旧读 data[i+3] 会把隔壁像素的蓝值当成 alpha → 掩码乱掉、bbox 缩水（第 88 轮踩的） */
      const a = ch === 4 ? data[i + 3] : 255;
      if (a < 128) continue;                     /* 透明不算主体 */
      /* 非背景 = 既不是透明也不是近白（白底 / 白色圆孔）。第 88 轮改的：
         原来只数「亮度 < 120」的像素，而这张图的亮蓝 #2F88FF 亮度 125 差一点就被漏掉，
         量法绑在素材配色上迟早再翻车 → 改成「与背景色无关」的口径 */
      if (data[i] > 243 && data[i + 1] > 243 && data[i + 2] > 243) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  ratios[f] = { w: (maxX - minX + 1) / size, h: (maxY - minY + 1) / size, size };
}
const spread = (arr) => Math.max(...arr) - Math.min(...arr);
const smallW = S1.map((f) => ratios[f].w);
const bigW = S2.map((f) => ratios[f].w);
ok('A9 小档 16/32/48 的主体宽度占比一致（0.94 主体 / 极差 ≤0.02）',
  spread(smallW) <= 0.02 && smallW.every((v) => Math.abs(v - 0.938) <= 0.03),
  smallW.map((v) => v.toFixed(3)).join(' / '));
ok('A10 大档 180/192/512 的主体宽度占比一致（0.78 / 极差 ≤0.01，且比小档小 —— 留了系统圆角的安全区）',
  spread(bigW) <= 0.01 && bigW.every((v) => Math.abs(v - 0.779) <= 0.01) && bigW[0] < smallW[0],
  bigW.map((v) => v.toFixed(3)).join(' / '));

/* A11 体积：标签页那张别超过 4KB（每开一个标签就取一次） */
const bytes = FILES.map(([f]) => fs.statSync(DOCS + 'img/' + f).size);
const kb = (n) => (n / 1024).toFixed(1) + 'KB';
ok('A11 16/32/48 三档单张 ≤4KB，整套 ≤60KB（大档走 32 色调色板 PNG：512 从 41KB 压到 19KB）',
  bytes.slice(0, 3).every((b) => b <= 4096) && bytes.reduce((a, b) => a + b, 0) <= 60 * 1024,
  bytes.map(kb).join(' / '));

/* A12 可复现：生成器与源素材都在（下次换图照着重跑） */
const genSrc = fs.readFileSync(ROOT + 'scripts/media/watch-icons.mjs', 'utf8');
const BASES = ['favicon-watch-16.png', 'favicon-watch-32.png', 'favicon-watch-48.png', 'apple-touch-icon-watch.png', 'icon-watch-192.png', 'icon-watch-512.png'];
ok('A12 生成器 scripts/media/watch-icons.mjs 在，SET 里是这六个基名 + 源素材在库 + 文件名按哈希拼',
  BASES.every((b) => genSrc.includes(`'${b}'`)) && !!srcName && /NAME\(name\)/.test(genSrc),
  BASES.filter((b) => !genSrc.includes(`'${b}'`)).join(',') || `源 ${srcName} → 后缀 ${HASH}`);

/* A13 本次只动图标，样式与脚本版本不该被顺带改掉 */
const cssRaw = fs.readFileSync(DOCS + 'watch.css', 'utf8');
ok('A13 仍引用 watch.css?v=36（本轮没碰样式）',
  /watch\.css\?v=36/.test(html) && cssRaw.length > 30000,
  (html.match(/watch\.css\?v=\d+/) || [])[0]);

/* ================= B 运行时（1440） ================= */

const browser = await chromium.launch({ args: ['--no-proxy-server'] });

async function run(width, tag, cb) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(BASE + 'watch.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await cb(page, errs);
  await ctx.close();
}

await run(1440, '1440', async (page, errs) => {
  const links = await page.$$eval('link[rel="icon"], link[rel="apple-touch-icon"]', (els) =>
    els.map((l) => ({ rel: l.rel, sizes: l.getAttribute('sizes'), href: l.getAttribute('href'), abs: l.href }))
  );
  ok('B1 运行时 DOM 里是 5 条 icon + 1 条 apple-touch，没有残留的 webp',
    links.filter((l) => l.rel === 'icon').length === 5 && links.filter((l) => l.rel === 'apple-touch-icon').length === 1,
    links.length);

  /* 逐条真取一次：状态码 + 可解码 + naturalWidth 与 sizes 相等 */
  const results = await page.evaluate(async (list) => {
    const out = [];
    for (const it of list) {
      const r = await fetch(it.abs, { cache: 'reload' });
      const blob = await r.blob();
      const bmp = await createImageBitmap(blob);
      out.push({ href: it.href, status: r.status, type: r.headers.get('content-type'), w: bmp.width, h: bmp.height, bytes: blob.size });
    }
    return out;
  }, links);
  ok('B2 六条图标全部 200 且 content-type 是 image/png',
    results.every((r) => r.status === 200 && /image\/png/.test(r.type || '')),
    results.map((r) => r.status).join(','));
  ok('B3 每条都能解码，且像素宽度 = 声明的 sizes（书签栏缩到 16、iOS 用 180，各取所需）',
    results.every((r, i) => r.w === parseInt(links[i].sizes, 10) && r.w === r.h),
    results.map((r) => `${r.w}=${links[results.indexOf(r)].sizes}`).join(' '));

  /* 站内 logo 仍是小黄人 —— 图标换了不等于形象换了 */
  const logo = await page.$eval('.w-home img', (img) => ({ src: img.getAttribute('src'), ok: img.complete && img.naturalWidth > 0, alt: img.alt }));
  ok('B4 页眉 logo 仍是小黄人且已加载（只换 favicon，不动站内形象）',
    /minion-.*\.webp/.test(logo.src || '') && logo.ok, `${logo.src} alt=${logo.alt}`);

  ok('B5 1440 下无 JS 异常', errs.length === 0, errs.join(' | '));
});

await run(390, '390', async (page, errs) => {
  const links = await page.$$eval('link[rel="icon"], link[rel="apple-touch-icon"]', (els) => els.length);
  ok('C1 390 下图标 link 仍是 6 条（不靠媒体查询才挂）', links === 6, links);
  const touch = await page.$eval('link[rel="apple-touch-icon"]', (l) => l.getAttribute('href'));
  ok('C2 390 下 apple-touch-icon 指向观影页那份（iOS 添加到主屏用的就是它）',
    touch === 'img/' + N('apple-touch-icon-watch.png'), touch);
  ok('C3 390 下无 JS 异常', errs.length === 0, errs.join(' | '));
});

await browser.close();

console.log(`\n合计 ${pass + fail} 条：PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
