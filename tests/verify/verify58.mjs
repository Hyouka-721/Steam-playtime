import { createRequire } from 'module';
import fs from 'fs';
import crypto from 'crypto';
const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const BASE = 'http://127.0.0.1:8895/';
const D = 'C:/Users/33329/WorkBuddy/2026-10-13-18-17-49/steam-playtime/docs/';
const rd = (f) => fs.readFileSync(D + f, 'utf8').replace(/\r\n/g, '\n');
const stripCmt = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');

let pass = 0, fail = 0;
const ok = (n, c, extra = '') => { c ? (pass++, console.log(`PASS ${n}${extra ? '  ' + extra : ''}`)) : (fail++, console.log(`FAIL ${n}  ${extra}`)); };

const wcss = rd('watch.css'), scss = rd('style.css'), html = rd('watch.html');
const wNC = stripCmt(wcss), sNC = stripCmt(scss);

/* ================= A 静态：两页标题字号逐档同值 ================= */
console.log('== A 静态：.w-title 与 .site-title 逐档同值 ==');
const decl = (css, sel, extra = '') => {
  const re = new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' \\{([^}]*)\\}');
  const m = css.match(re);
  if (!m) return null;
  const b = m[1];
  const fs2 = (b.match(/font-size:\s*(\d+)px/) || [])[1];
  const ls = (b.match(/letter-spacing:\s*(\d+)px/) || [])[1];
  return { fs: fs2, ls };
};
const baseW = decl(wNC, '.w-title'), baseS = decl(sNC, '.site-title');
ok('A1 桌面档：.w-title 70px/2px 与 .site-title 完全同值',
  !!baseW && !!baseS && baseW.fs === '70' && baseW.ls === '2' && baseW.fs === baseS.fs && baseW.ls === baseS.ls,
  JSON.stringify({ w: baseW, s: baseS }));

/* 取 ≤860 断点块内容 */
const blk = (css, q) => {
  const i = css.indexOf(q);
  if (i < 0) return '';
  const start = css.indexOf('{', i);
  let depth = 0, j = start;
  for (; j < css.length; j++) { if (css[j] === '{') depth++; else if (css[j] === '}') { depth--; if (depth === 0) break; } }
  return css.slice(start + 1, j);
};
const b860 = blk(wNC, '@media (max-width: 860px)');
const b480W = blk(wNC, '@media (max-width: 480px)');
const b480S = blk(sNC, '@media (max-width: 480px)');
ok('A2 ≤860px 断点内已无 .w-title 覆盖（首页该档不缩，仍 70px）',
  !/\.w-title\s*\{/.test(b860), b860.length + ' chars');
const small = (b) => {
  const m = b.match(/\.(?:w-title|site-title)\s*\{([^}]*)\}/);
  if (!m) return null;
  return { fs: (m[1].match(/font-size:\s*(\d+)px/) || [])[1], ls: (m[1].match(/letter-spacing:\s*(\d+)px/) || [])[1] };
};
const s480W = small(b480W), s480S = small(b480S);
ok('A3 ≤480px 档：.w-title 44px/1px 与 .site-title 完全同值',
  !!s480W && !!s480S && s480W.fs === '44' && s480W.ls === '1' && s480W.fs === s480S.fs && s480W.ls === s480S.ls,
  JSON.stringify({ w: s480W, s: s480S }));
ok('A4 字体族与字重也与首页一致（Black Rose / normal）', (() => {
  const w = (wNC.match(/\.w-title \{[^}]*\}/) || [''])[0];
  const s = (sNC.match(/\.site-title \{[^}]*\}/) || [''])[0];
  const fam = (t) => (t.match(/font-family:\s*([^;]+);/) || [])[1];
  const wt = (t) => (t.match(/font-weight:\s*([^;]+);/) || [])[1];
  return fam(w) === fam(s) && wt(w) === wt(s);
})());
ok('A5 版本号 bump：watch.css?v=16', /watch\.css\?v=16"/.test(html));

/* ================= B 浏览器：十一档实测 ================= */
const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const read = (p, sel, hdrSel) => p.evaluate(([s, h]) => {
  const el = document.querySelector(s);
  const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
  const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.6;
  return {
    fs: cs.fontSize, ls: cs.letterSpacing, w: +r.width.toFixed(2), h: +r.height.toFixed(2),
    lines: Math.round(r.height / lh),
    hdrH: +document.querySelector(h).getBoundingClientRect().height.toFixed(2),
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    clipped: el.scrollWidth > Math.ceil(el.clientWidth) + 1,
  };
}, [sel, hdrSel]);
const box = (p, sel) => p.evaluate((s) => {
  const r = document.querySelector(s).getBoundingClientRect();
  return { w: +r.width.toFixed(2), h: +r.height.toFixed(2), left: +r.left.toFixed(2), right: +r.right.toFixed(2) };
}, sel);

console.log('\n== B 十一档实测（computed 字号 / 行数 / 页眉高 / 溢出 / 图标）==');
const errs = [];
for (const W of [1440, 1280, 1100, 1000, 900, 861, 860, 700, 480, 390, 360]) {
  const ctx = await browser.newContext({ viewport: { width: W, height: 900 } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(`${W}:${e}`));
  await p.goto(BASE + 'index.html', { waitUntil: 'load' });
  await p.waitForTimeout(320);
  const a = await read(p, '.site-title', '.site-header');
  const aL = await box(p, '.logo'), aA = await box(p, '.header-avatar');
  await p.goto(BASE + 'watch.html', { waitUntil: 'load' });
  await p.waitForTimeout(320);
  const b = await read(p, '.w-title', '.w-header');
  const bL = await box(p, '.w-home'), bA = await box(p, '.w-avatar');
  const same = a.fs === b.fs && a.ls === b.ls;
  const iconsOK = aL.w === bL.w && aL.h === bL.h && aA.w === bA.w && aA.h === bA.h && aA.left === bA.left && aA.right === bA.right;
  /* 第 70 轮：站名改成「Watch List」后两页文案长度不同，行数与页眉高必然不同 →
     不再要求相等，改回比对真正的契约（字号 / 字距 / 无溢出 / 图标 / 未截断） */
  const good = same && a.overflow === 0 && b.overflow === 0 && iconsOK && !b.clipped;
  ok(`B[${W}] 字号 ${a.fs}/${a.ls} 两侧一致 + 无溢出 + 图标同 + 标题未截断（行数 ${a.lines}/${b.lines}、页眉高 ${a.hdrH}/${b.hdrH} 随文案换行）`, good,
    good ? '' : JSON.stringify({ a, b, iconsOK }));
  await ctx.close();
}

/* ================= C 视觉一致性 ================= */
console.log('\n== C 视觉 ==');
const c = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const p2 = await c.newPage();
const errs2 = [];
p2.on('pageerror', (e) => errs2.push(String(e)));
await p2.goto(BASE + 'watch.html', { waitUntil: 'load' });
await p2.waitForTimeout(500);
const vis = await p2.evaluate(() => {
  const t = document.querySelector('.w-title');
  const r = t.getBoundingClientRect();
  const hdr = document.querySelector('.w-header').getBoundingClientRect();
  const fab = document.getElementById('w-fab').getBoundingClientRect();
  const av = document.getElementById('w-avatar').getBoundingClientRect();
  const home = document.querySelector('.w-home').getBoundingClientRect();
  const overlapHdr = !(r.bottom <= hdr.top || r.top >= hdr.bottom);
  const hitFab = !(r.right <= fab.left || r.left >= fab.right || r.bottom <= fab.top || r.top >= fab.bottom);
  const hitAv = !(r.right <= av.left || r.left >= av.right || r.bottom <= av.top || r.top >= av.bottom);
  const hitHome = !(r.right <= home.left || r.left >= home.right || r.bottom <= home.top || r.top >= home.bottom);
  return { inHdr: overlapHdr, hitFab, hitAv, hitHome, fs: getComputedStyle(t).fontSize,
    h: +r.height.toFixed(2), hdrH: +hdr.height.toFixed(2) };
});
ok('C1 标题 70px、完全落在页眉内、不压史蒂夫/小黄人/加号',
  vis.fs === '70px' && vis.inHdr && !vis.hitFab && !vis.hitAv && !vis.hitHome, JSON.stringify(vis));
const lhRatio = await p2.evaluate(() => {
  const t = document.querySelector('.w-title');
  return +(t.getBoundingClientRect().height / parseFloat(getComputedStyle(t).fontSize)).toFixed(3);
});
ok('C2 单行高/字号 ≈ 1.6（与首页同一行高模型，未被撑开或压扁）', Math.abs(lhRatio - 1.6) < 0.02, `ratio=${lhRatio}`);
await p2.goto(BASE + 'index.html', { waitUntil: 'load' });
await p2.waitForTimeout(400);
const aH = await p2.evaluate(() => +document.querySelector('.site-title').getBoundingClientRect().height.toFixed(2));
const bH = vis.h;
ok('C3 桌面两页标题盒子高度完全相同（同一行高、同一字重）', aH === bH, `${aH} vs ${bH}`);
ok('C4 全程零 JS 异常', errs.length === 0 && errs2.length === 0, (errs.concat(errs2)).join(' | '));

/* ================= D 同文案同底色逐像素：证「同一字体同一字号」 ================= */
console.log('\n== D 同文案 / 同底色 / 去 text-shadow 后逐像素比对 ==');
const md5f = (p) => crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex');
/* 截图自校验：字体 swap 期间可能抓到中间态 -> 连续截到两次 md5 相同才采信（最多 6 次） */
/* 第 70 轮：6 次／320ms 不够（字体 swap 会连抓 6 张不同的）；放宽到 12 次／380ms，
   并丢弃第一张（第一张常在字体换字中间态）。 */
const stableShot = async (loc, path) => {
  let prev = null;
  for (let i = 0; i < 12; i++) {
    await loc.screenshot({ path });
    const cur = md5f(path);
    if (prev && cur === prev) return cur;
    prev = cur;
    await loc.page().waitForTimeout(380);
  }
  return prev;
};
const SHOT = 'C:/Users/33329/AppData/Local/Temp/fx_verify_20261018/shots58/';
fs.mkdirSync(SHOT, { recursive: true });
const flatten = (pg, ts, hs) => pg.evaluate(([t, h]) => {
  const hdr = document.querySelector(h);
  hdr.style.background = '#ffffff';
  hdr.style.backdropFilter = 'none';
  hdr.style.setProperty('-webkit-backdrop-filter', 'none');
  const el = document.querySelector(t);
  el.textContent = 'Game time';
  el.style.color = '#000000';
  el.style.textShadow = 'none';
  el.style.cursor = 'default';
  el.style.width = 'max-content';
  el.style.whiteSpace = 'nowrap';
}, [ts, hs]);

for (const W of [1440, 860]) {
  const cx = await browser.newContext({ viewport: { width: W, height: 900 }, deviceScaleFactor: 2 });
  const pg = await cx.newPage();
  await pg.goto(BASE + 'index.html', { waitUntil: 'load' });
  await pg.evaluate(() => document.fonts.ready);
  await pg.waitForTimeout(450);
  await flatten(pg, '.site-title', '.site-header');
  await pg.evaluate(() => document.fonts.ready);
  await pg.waitForTimeout(600);   /* 第 70 轮：等注入文案重排 + 字体替换落定 */
  const fa = `${SHOT}flat_idx_${W}.png`;
  const ma = await stableShot(pg.locator('.site-title'), fa);
  await pg.goto(BASE + 'watch.html', { waitUntil: 'load' });
  await pg.evaluate(() => document.fonts.ready);
  await pg.waitForTimeout(450);
  await flatten(pg, '.w-title', '.w-header');
  await pg.evaluate(() => document.fonts.ready);
  await pg.waitForTimeout(600);   /* 第 70 轮：同上 */
  const fb = `${SHOT}flat_watch_${W}.png`;
  const mb = await stableShot(pg.locator('.w-title'), fb);
  ok(`D[${W}] 同一文案渲染逐字节相同（两次稳定截图 md5 相等）`, ma === mb, `${ma.slice(0, 12)} / ${mb.slice(0, 12)}`);
  await cx.close();
}
/* 390 档两页 grid 不同（首页 1fr auto 1fr / 观影页 ≤480 auto 1fr auto）→ 标题水平位置差 6px，
   会带来亚像素抗锯齿相位差，故判据改为「同一文案的文字盒尺寸完全相同」 */
{
  const cx = await browser.newContext({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2 });
  const pg = await cx.newPage();
  const rect = async (url, ts, hs) => {
    await pg.goto(BASE + url, { waitUntil: 'load' });
    await pg.waitForTimeout(450);
    await flatten(pg, ts, hs);
    await pg.waitForTimeout(200);
    return pg.evaluate((t) => {
      const r = document.querySelector(t).getBoundingClientRect();
      return { w: +r.width.toFixed(3), h: +r.height.toFixed(3) };
    }, ts);
  };
  const ra = await rect('index.html', '.site-title', '.site-header');
  const rb = await rect('watch.html', '.w-title', '.w-header');
  ok('D[390] 同一文案的文字盒尺寸完全相同（196.141 × 70.391，仅水平位置差 6px 属 grid 差异）',
    ra.w === rb.w && ra.h === rb.h, `${ra.w}×${ra.h} vs ${rb.w}×${rb.h}`);
  await cx.close();
}

await c.close();
await browser.close();
console.log(`\n===== 第 58 轮回归：${pass}/${pass + fail} =====`);
process.exit(fail ? 1 : 0);
