/* online92.mjs — 第 92 轮上线复验：手柄图标 + 站名 Game Time
 *
 * ⚠️ 本轮**没有 bump 版本号**（css/js 一个字节都没动），所以不能用 `style.css?v=NN` 判断
 *    「Pages 是否已生效」——改用**内容指纹**：`<title>Game Time</title>` + favicon 里的素材 hash。
 *
 *   A 指纹：新 HTML 已上线、六个图标可访问、旧图标必须 404、manifest 已同步
 *   B 运行时：document.title / 页眉 h1 / 三条 favicon link / 图标能解码且尺寸对
 *   C 布局：页眉几何（1440 一行、≤480 仍 44px、不溢出、不压头像）、点它回顶部的交互
 *   D 跨页：watch 页脚返回链接
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const SITE = 'https://hyouka-721.github.io/Steam-playtime/';
const HASH = 'fb74092c'; // 素材 hash，出现在所有图标文件名里

let pass = 0;
let fail = 0;
const ok = (n, c, extra = '') => {
  const s = extra === '' ? '' : '  — ' + (typeof extra === 'string' ? extra : JSON.stringify(extra));
  c ? (pass++, console.log(`PASS ${n}${s}`)) : (fail++, console.log(`FAIL ${n}${s}`));
};

/* ---------- 本地期望（从仓库读，不写死尺寸表以外的内容） ---------- */
const localHtml = fs.readFileSync('docs/index.html', 'utf8');
const localManifest = JSON.parse(fs.readFileSync('docs/manifest.webmanifest', 'utf8'));
// 期望尺寸一律从 link 的 sizes 属性读：apple-touch-icon 的文件名里没有数字
const expectIcons = [...localHtml.matchAll(/<link rel="(?:icon|apple-touch-icon)"[^>]*sizes="(\d+)x\d+"[^>]*href="([^"]+)"/g)]
  .map((m) => ({ size: Number(m[1]), href: m[2] }));
console.log('本地期望图标：', expectIcons.map((i) => `${i.href}(${i.size})`).join(', '));

const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));

/* ---------- A 等 Pages 生效 ---------- */
console.log('== A 等待 Pages 生效 ==');
let html = '';
for (let i = 1; i <= 40; i++) {
  try {
    const r = await page.goto(`${SITE}index.html?t=${Date.now()}-${i}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    html = await r.text();
  } catch (e) {
    console.log(`  · 第 ${i} 次打开失败：${e.message.split('\n')[0]}`);
    await page.waitForTimeout(8000);
    continue;
  }
  const fresh = html.includes('<title>Game Time</title>') && html.includes(HASH);
  console.log(`  第 ${i} 次：${fresh ? '已生效' : '仍是旧版'}`);
  if (fresh) break;
  await page.waitForTimeout(10000);
}
ok('A1 线上 index.html 已是新版（title = Game Time 且 favicon 带素材 hash）',
  html.includes('<title>Game Time</title>') && html.includes(HASH),
  { title: (html.match(/<title>[^<]*<\/title>/) || [])[0], hasHash: html.includes(HASH) });
ok('A2 页眉 h1 也是「Game Time」，不再有 My 前缀',
  /aria-label="返回顶部">Game Time<\/h1>/.test(html) && !html.includes('My Game Time'));
ok('A3 线上不再有内联 base64 图标', !/href="data:image\/png;base64,/.test(html));

/* ---------- A4/A5 图标文件 ---------- */
for (const { href: rel, size: want } of expectIcons) {
  const url = `${SITE}${rel}?t=${Date.now()}`;
  const res = await fetch(url);
  ok(`A4 ${rel} 线上 200`, res.status === 200, res.status);
  if (res.status === 200) {
    const buf = Buffer.from(await res.arrayBuffer());
    const bmp = await page.evaluate(async (b64) => {
      const bin = atob(b64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const im = await createImageBitmap(new Blob([arr], { type: 'image/png' }));
      return { w: im.width, h: im.height };
    }, buf.toString('base64'));
    ok(`A5 ${rel} 解码尺寸 = ${want}×${want}`, bmp.w === want && bmp.h === want, `${bmp.w}×${bmp.h} / ${(buf.length / 1024).toFixed(1)}KB`);
  }
}

/* 旧图标必须 404（已从仓库删除，线上也应消失） */
for (const old of ['img/icon-192.png', 'img/icon-512.png']) {
  const res = await fetch(`${SITE}${old}?t=${Date.now()}`);
  ok(`A6 旧图标 ${old} 已 404`, res.status === 404, res.status);
}

/* manifest */
{
  const m = await (await fetch(`${SITE}manifest.webmanifest?t=${Date.now()}`)).json();
  ok('A7 线上 manifest：name 已去掉 My、icons 指向带 hash 的新文件',
    m.name === 'Game Time · Steam 游戏时长'
    && m.icons.length === 2
    && m.icons.every((i) => /icon-game-\d+-[0-9a-f]{8}\.png$/.test(i.src)),
    { name: m.name, icons: m.icons.map((i) => i.src) });
}

/* ---------- B 运行时 ---------- */
console.log('== B 运行时 ==');
await page.waitForSelector('#lt-list .rank-item', { timeout: 25000 });
await page.waitForTimeout(800);
ok('B1 document.title = Game Time', (await page.title()) === 'Game Time', await page.title());
const head = await page.evaluate(() => {
  const el = document.getElementById('site-title');
  const links = [...document.querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"]')]
    .map((l) => ({ rel: l.rel, sizes: l.getAttribute('sizes'), href: l.getAttribute('href') }));
  return {
    text: el?.textContent?.trim(),
    role: el?.getAttribute('role'),
    tab: el?.getAttribute('tabindex'),
    label: el?.getAttribute('aria-label'),
    links,
  };
});
ok('B2 页眉 h1 = Game Time，且「点它回顶部」的 role/tabindex/aria-label 都在',
  head.text === 'Game Time' && head.role === 'button' && head.tab === '0' && head.label === '返回顶部', head);
ok('B3 四条图标 link：favicon 16/32/48 + apple-touch 180',
  head.links.length === 4
  && ['16x16', '32x32', '48x48'].every((s) => head.links.some((l) => l.rel === 'icon' && l.sizes === s))
  && head.links.some((l) => l.rel === 'apple-touch-icon' && l.sizes === '180x180'),
  head.links.map((l) => `${l.rel} ${l.sizes}`));

/* ---------- C 布局（改名后的页眉几何） ---------- */
console.log('== C 布局 ==');
const wide = await page.evaluate(() => {
  const el = document.getElementById('site-title');
  const av = document.getElementById('theme-light');
  const r = el.getBoundingClientRect();
  const a = av.getBoundingClientRect();
  const cs = getComputedStyle(el);
  return {
    fs: cs.fontSize, lines: Math.max(1, Math.round(r.height / parseFloat(cs.lineHeight))),
    overlapsAvatar: !(r.right <= a.left || r.left >= a.right || r.bottom <= a.top || r.top >= a.bottom),
    docOverflow: document.documentElement.scrollWidth - window.innerWidth,
    userSelect: cs.userSelect,
  };
});
ok('C1 1440：站名一行、不压头像、无横向溢出', wide.lines === 1 && !wide.overlapsAvatar && wide.docOverflow <= 0, wide);
ok('C2 站名仍不可被框选（user-select:none）', wide.userSelect === 'none', wide.userSelect);

for (const w of [480, 390]) {
  await page.setViewportSize({ width: w, height: 900 });
  await page.waitForTimeout(350);
  const m = await page.evaluate(() => {
    const el = document.getElementById('site-title');
    const av = document.getElementById('theme-light');
    const r = el.getBoundingClientRect();
    const a = av.getBoundingClientRect();
    return {
      fs: getComputedStyle(el).fontSize,
      overlapsAvatar: !(r.right <= a.left || r.left >= a.right || r.bottom <= a.top || r.top >= a.bottom),
      docOverflow: document.documentElement.scrollWidth - window.innerWidth,
    };
  });
  ok(`C3 ${w}：不溢出、不压头像、≤480 仍 44px`,
    m.docOverflow <= 0 && !m.overlapsAvatar && m.fs === '44px', m);
}

/* ---------- D 跨页 ---------- */
{
  const wHtml = await (await fetch(`${SITE}watch.html?t=${Date.now()}`)).text();
  ok('D1 watch 页脚返回链接已是「← 回到 Game Time」',
    wHtml.includes('← 回到 Game Time') && !wHtml.includes('回到 My Game Time'),
    (wHtml.match(/← 回到 [^<]*/) || [])[0]);
}

await ctx.close();
await browser.close();
ok('E1 全程零 JS 异常', errs.length === 0, errs.slice(0, 3));
console.log(`\n===== online92 PASS=${pass} FAIL=${fail} =====`);
process.exit(fail ? 1 : 0);
