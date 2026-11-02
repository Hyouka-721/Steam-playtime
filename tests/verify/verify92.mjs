/* verify92.mjs — 第 92 轮：站点图标换成「游戏手柄」+ 站名改成 Game Time（T 大写）
 *
 * 用户两项：
 *   a「游戏网站图标改为 [游戏手柄图]」
 *   b「名称改为 Game Time，T 大写」
 *   （截图给的是浏览器标签页：原来是小黄人图标 +「Game time」）
 *
 * 覆盖：
 *  0 静态：title / 页眉 h1 / manifest / 三条 favicon link / apple-touch-icon /
 *          六个图标文件的存在与像素尺寸 / 旧 icon-192·512 已删 / sw.js 预缓存清单
 *  1 运行时：document.title、h1 文本、图标真能 200、图片能解码且尺寸对
 *  2 布局：.site-title 的字号契约（44/1px 在 ≤480）没被改名破坏，窄屏不溢出、不被头像压住、
 *          点击回顶部的交互（role/tabindex）仍在
 *  3 跨页：watch 页的返回链接文案同步成「回到 Game Time」
 *  4 全程无 JS 异常
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const URL = process.env.URL || 'http://127.0.0.1:8895/index.html';
const DOCS = 'docs';
let pass = 0;
let fail = 0;
const ok = (msg, cond, extra) => {
  if (cond) { pass++; console.log('PASS  ' + msg + (extra !== undefined ? '  — ' + JSON.stringify(extra) : '')); }
  else { fail++; console.log('FAIL  ' + msg + (extra !== undefined ? '  — ' + JSON.stringify(extra) : '')); }
};

/* ================= 0 静态 ================= */
const html = fs.readFileSync(`${DOCS}/index.html`, 'utf8');
const watchHtml = fs.readFileSync(`${DOCS}/watch.html`, 'utf8');
const manifest = JSON.parse(fs.readFileSync(`${DOCS}/manifest.webmanifest`, 'utf8'));
const sw = fs.readFileSync(`${DOCS}/sw.js`, 'utf8');

ok('0.1 <title> 是「Game Time」（T 大写）', /<title>Game Time<\/title>/.test(html), (html.match(/<title>[^<]*<\/title>/) || [])[0]);
ok('0.2 页眉站名仍是「My Game Time」（第 93 轮纠正：用户只要求改标签页标题，页眉不动）',
  /aria-label="返回顶部">My Game Time<\/h1>/.test(html));
ok('0.3 manifest 的 name / short_name 都是 Game Time 口径',
  manifest.name === 'Game Time · Steam 游戏时长' && manifest.short_name === 'Game Time', { name: manifest.name, short: manifest.short_name });

const favLinks = [...html.matchAll(/<link rel="icon"[^>]*>/g)].map((m) => m[0]);
ok('0.4 favicon 是 16/32/48 三条按尺寸的 link（不再是一条无尺寸的 data URI）',
  favLinks.length === 3
  && ['16x16', '32x32', '48x48'].every((s) => favLinks.some((l) => l.includes(`sizes="${s}"`) && new RegExp('img/favicon-' + s.split('x')[0] + '(-[0-9a-f]{8})?\\.png').test(l))),
  favLinks);
ok('0.5 不再有内联 base64 图标（data:image/png;base64 计数为 0）',
  !/href="data:image\/png;base64,/.test(html), (html.match(/href="data:image\/png;base64,/g) || []).length);
ok('0.6 apple-touch-icon 指向 img/apple-touch-icon.png（180）',
  /<link rel="apple-touch-icon" sizes="180x180" href="img\/apple-touch-icon(-[0-9a-f]{8})?\.png">/.test(html));

// 六个图标的存在 + 真实像素尺寸（用 sharp 读，避免只看文件名）
// 按包名动态导入：从 tests/verify/ 向上会解析到仓库根的 node_modules/sharp
const sharp = (await import('sharp')).default;

/* 图标文件名带素材 hash（sw.js 对 *.png 是 cache-first，固定名会让换图被旧缓存挡住），
   所以这里一律「从 HTML / manifest 里读出实际路径」，不写死 hash —— 换素材后不用改套件。 */
const IMG_RE = /^img\/(favicon|apple-touch-icon|icon-game)-\d+(-[0-9a-f]{8})?\.png$/;
const wantSize = { 'favicon-16': 16, 'favicon-32': 32, 'favicon-48': 48, 'apple-touch-icon': 180, 'icon-game-192': 192, 'icon-game-512': 512 };

const iconsOnPage = [...html.matchAll(/href="(img\/(?:favicon|apple-touch-icon)-[^"]+)"/g)].map((m) => m[1]);
const iconsInManifest = manifest.icons.map((i) => i.src);
const allIconPaths = [...new Set([...iconsOnPage, ...iconsInManifest])];
const sizes = {};
for (const rel of allIconPaths) {
  const p = `${DOCS}/${rel}`;
  const key = rel.replace(/^img\//, '').replace(/\.png$/, '').replace(/-[0-9a-f]{8}$/, '');
  if (!fs.existsSync(p)) { sizes[key] = null; continue; }
  const m = await sharp(p).metadata();
  sizes[key] = { file: rel, w: m.width, h: m.height, alpha: m.hasAlpha, kb: +(fs.statSync(p).size / 1024).toFixed(1) };
}
ok('0.7 页面 + manifest 引用的六个图标文件都在，且像素尺寸与命名一致',
  Object.keys(wantSize).every((k) => sizes[k] && sizes[k].w === wantSize[k] && sizes[k].h === wantSize[k]),
  { 期望: wantSize, 实际: sizes });
ok('0.8 favicon 三档保留透明通道（标签页不出现白框）',
  ['favicon-16', 'favicon-32', 'favicon-48'].every((k) => sizes[k]?.alpha === true),
  ['favicon-16', 'favicon-32', 'favicon-48'].map((k) => `${k}:${sizes[k]?.alpha}`));
ok('0.9 图标文件名都带素材 hash（换图 = 换 URL，绕开 SW 的 cache-first）',
  allIconPaths.length > 0 && allIconPaths.every((p) => /-[0-9a-f]{8}\.png$/.test(p)), allIconPaths);
ok('0.10 旧的 icon-192.png / icon-512.png 已删除（避免两份图标并存）',
  !fs.existsSync(`${DOCS}/img/icon-192.png`) && !fs.existsSync(`${DOCS}/img/icon-512.png`));
ok('0.11 manifest 与 sw.js 的预缓存清单用的是同一批带 hash 的名字',
  manifest.icons.every((i) => /icon-game-\d+-[0-9a-f]{8}\.png$/.test(i.src))
  && manifest.icons.every((i) => sw.includes(`'${i.src}'`))
  && !sw.includes("'img/icon-192.png'"),
  { manifest: manifest.icons.map((i) => i.src) });
ok('0.12 源素材已入库（docs/img/gamepad-*.webp，可从它重新生成全部图标）',
  fs.readdirSync(`${DOCS}/img`).some((f) => /^gamepad-[0-9a-f]{8}\.webp$/.test(f)),
  fs.readdirSync(`${DOCS}/img`).filter((f) => f.startsWith('gamepad')));

/* ================= 1 运行时 ================= */
const errs = [];
const browser = await chromium.launch({ args: ['--no-proxy-server'] });
let ctx, page;
const fresh = async (vw = 1440, vh = 950, dsf = 1) => {
  if (ctx) await ctx.close();
  ctx = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: dsf });
  page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
};
await fresh(1440, 950, 1);
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('#lt-list .rank-item', { state: 'visible', timeout: 30000 });
await page.waitForTimeout(600);

ok('1.1 document.title 运行时是「Game Time」', (await page.title()) === 'Game Time', await page.title());
const h1 = await page.evaluate(() => {
  const el = document.getElementById('site-title');
  return { text: el?.textContent?.trim(), role: el?.getAttribute('role'), tab: el?.getAttribute('tabindex'), label: el?.getAttribute('aria-label') };
});
ok('1.2 页眉 h1 文本是「My Game Time」，与 <title> 的「Game Time」各自独立', h1.text === 'My Game Time', h1);
ok('1.3 「点它回顶部」的交互没被改名破坏（role=button + tabindex=0 + aria-label）',
  h1.role === 'button' && h1.tab === '0' && h1.label === '返回顶部', h1);

// 图标真能取到，且浏览器解码后的尺寸与文件一致
const icons = await page.evaluate(async () => {
  const hrefs = [...document.querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"]')]
    .map((l) => ({ href: l.getAttribute('href'), sizes: l.getAttribute('sizes') }));
  const out = [];
  for (const h of hrefs) {
    const res = await fetch(h.href, { cache: 'no-store' });
    const blob = await res.blob();
    const bmp = await createImageBitmap(blob);
    out.push({ ...h, status: res.status, bytes: blob.size, w: bmp.width, h: bmp.height });
  }
  return out;
});
ok('1.4 四个图标链接全部 HTTP 200 且能解码',
  icons.length === 4 && icons.every((i) => i.status === 200 && i.w > 0), icons);
ok('1.5 解码尺寸与声明的 sizes 一致',
  icons.every((i) => `${i.w}x${i.h}` === i.sizes), icons.map((i) => `${i.href.split('/').pop()} ${i.w}×${i.h} vs ${i.sizes}`));

/* ================= 2 布局（改名后的字号契约） ================= */
const wide = await page.evaluate(() => {
  const el = document.getElementById('site-title');
  const av = document.getElementById('theme-light');
  const r = el.getBoundingClientRect();
  const a = av.getBoundingClientRect();
  const cs = getComputedStyle(el);
  return {
    fs: cs.fontSize, lh: cs.lineHeight, userSelect: cs.userSelect,
    overlapsAvatar: !(r.right <= a.left || r.left >= a.right || r.bottom <= a.top || r.top >= a.bottom),
    docOverflow: document.documentElement.scrollWidth - window.innerWidth,
    w: +r.width.toFixed(1),
  };
});
ok('2.1 桌面站名不压到头像、无横向溢出', wide.overlapsAvatar === false && wide.docOverflow <= 0, wide);
ok('2.2 站名仍不可被框选（user-select:none 没有被改名一起弄丢）', wide.userSelect === 'none', wide.userSelect);

for (const w of [860, 480, 390, 360]) {
  await page.setViewportSize({ width: w, height: 900 });
  await page.waitForTimeout(320);
  const m = await page.evaluate(() => {
    const el = document.getElementById('site-title');
    const av = document.getElementById('theme-light');
    const r = el.getBoundingClientRect();
    const a = av.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      fs: cs.fontSize, lh: cs.lineHeight,
      overlapsAvatar: !(r.right <= a.left || r.left >= a.right || r.bottom <= a.top || r.top >= a.bottom),
      docOverflow: document.documentElement.scrollWidth - window.innerWidth,
      lines: Math.round(r.height / parseFloat(cs.lineHeight)),
    };
  });
  const fsOk = w <= 480 ? m.fs === '44px' : true;
  ok(`2.${w} 站名不溢出、不被头像压住${w <= 480 ? '、≤480 仍是 44px' : ''}`,
    m.docOverflow <= 0 && m.overlapsAvatar === false && fsOk, m);
}

/* ================= 3 跨页联动 ================= */
ok('3.1 watch 页的返回链接文案同步成「← 回到 Game Time」',
  watchHtml.includes('← 回到 Game Time') && !watchHtml.includes('回到 My Game Time'),
  (watchHtml.match(/← 回到 [^<]*/) || [])[0]);

await ctx.close();
await browser.close();
ok('4.1 全程零 JS 异常 / console error', errs.length === 0, errs.slice(0, 3));
console.log(`\n===== 第92轮 PASS=${pass} FAIL=${fail} =====`);
process.exit(fail ? 1 : 0);
