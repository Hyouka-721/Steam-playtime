/**
 * 第 90 轮：评分搬进标题行 —— 几何诊断 + before/after 对照图
 *
 * before 不靠改文件：用 page.route 把 watch.css / watch.js 的响应换成
 *   `git show HEAD:docs/watch.*`（上一版，评分还压在海报右下角），
 *   同一份 watch.json、同一个浏览器、同一视口，只有这两份资源不同。
 *
 * 用法：node tests/tools/shot90_layout.mjs
 * 前提：先把上一版两份资源导到 %TEMP%/old90_watch.css / .js
 * 产出：%TEMP%/shots90layout/{before,after}-{1440,390}.png + 00_对照.png
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const TMP = os.tmpdir();
const OUT = path.join(TMP, 'shots90layout');
fs.mkdirSync(OUT, { recursive: true });
const OLD_CSS = fs.readFileSync(path.join(TMP, 'old90_watch.css'), 'utf8');
const OLD_JS = fs.readFileSync(path.join(TMP, 'old90_watch.js'), 'utf8');
const BASE = 'http://127.0.0.1:8895/watch.html';

const browser = await chromium.launch({ args: ['--no-proxy-server'] });

const open = async (mode, W, H) => {
  const ctx = await browser.newContext({
    viewport: { width: W, height: H }, deviceScaleFactor: 2, serviceWorkers: 'block',
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console:' + m.text().slice(0, 160)); });
  if (mode === 'before') {
    /* 注意：用 glob 前缀匹配会连 data/watch.json 一起拦（该文件名前八个字符
       正好是 watch.js），把 JS 文本当 JSON 返回会直接白屏 —— 改成按 pathname 精确匹配。
       另外这个注释里不能写出那个 glob 本身：星号加斜杠会提前闭合块注释。 */
    await page.route((u) => u.pathname.endsWith('/watch.css'),
      (r) => r.fulfill({ status: 200, contentType: 'text/css; charset=utf-8', body: OLD_CSS }));
    await page.route((u) => u.pathname.endsWith('/watch.js'),
      (r) => r.fulfill({ status: 200, contentType: 'application/javascript; charset=utf-8', body: OLD_JS }));
  }
  await page.goto(BASE + '?t=' + Date.now() + mode, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => document.querySelectorAll('#w-grid .poster').length > 20, null, { timeout: 30000 }).catch(() => {});
  await page.waitForFunction(() => {
    const im = [...document.querySelectorAll('#w-grid .poster-pic img')].slice(0, 5);
    return im.length === 5 && im.every((x) => x.complete);
  }, null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(500);
  const st = await page.evaluate(() => ({
    cards: document.querySelectorAll('#w-grid .poster').length,
    grid: !!document.getElementById('w-grid'),
    bodyLen: document.body.innerHTML.length,
  }));
  if (st.cards === 0) console.log('DBG', mode, W, JSON.stringify(st), errs.slice(0, 4));
  return { ctx, page, errs };
};

const MEASURE = () => {
  const cards = [...document.querySelectorAll('#w-grid .poster')];
  const R = (e) => (e ? e.getBoundingClientRect() : null);
  const first = cards[0];
  if (!first) return { n: 0, cols: 0, cardW: 0, clipped: 0, rowNoteSpread: null,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    tlScore: 0, first3: [] };
  const rowTop = R(first).top;
  const row = cards.filter((c) => Math.abs(R(c).top - rowTop) < 2);
  const pick = (c) => {
    const hd = c.querySelector('.poster-head');
    const nm = c.querySelector('.poster-name');
    const sc = c.querySelector('.poster-score');
    const dt = c.querySelector('.poster-date');
    const pc = c.querySelector('.poster-pic');
    const nt = c.querySelector('.poster-note');
    const cr = R(c), nr = R(nm), sr = R(sc), dr = R(dt), hr = R(hd), pr = R(pc);
    return {
      name: nm ? nm.textContent.trim() : null,
      scoreText: sc ? sc.textContent.trim() : null,
      scoreParent: sc ? sc.parentElement.className : null,
      scoreInPic: pc ? pc.contains(sc) : null,
      order: hd ? [...hd.children].map((x) => x.className) : [],
      gapNameScore: sr && nr ? +(sr.left - nr.right).toFixed(1) : null,
      gapScoreDate: sr && dr ? +(dr.left - sr.right).toFixed(1) : null,
      dateRightGap: dr && cr ? +(cr.right - dr.right).toFixed(1) : null,
      dateBelowName: dr && nr ? dr.top >= nr.bottom - 2 : null,
      headH: hr ? +hr.height.toFixed(1) : null,
      nameH: nr ? +nr.height.toFixed(1) : null,
      scoreH: sr ? +sr.height.toFixed(1) : null,
      scoreW: sr ? +sr.width.toFixed(1) : null,
      scoreInsidePic: sr && pr ? (sr.right <= pr.right + .6 && sr.bottom <= pr.bottom + .6 && sr.left >= pr.left - .6 && sr.top >= pr.top - .6) : null,
      nameClipped: nm ? nm.scrollWidth > nm.clientWidth + 1 : null,
      noteTop: nt && nt.getBoundingClientRect().height > 0 ? +R(nt).top.toFixed(1) : null,
      noteGap: nt && nt.getBoundingClientRect().height > 0 ? +(R(nt).top - hr.bottom).toFixed(1) : null,
      picKids: pc ? pc.children.length : null,
    };
  };
  const noteTops = row.map((c) => pick(c).noteTop).filter((x) => x != null);
  return {
    n: cards.length,
    cols: row.length,
    cardW: +R(first).width.toFixed(1),
    clipped: cards.filter((c) => pick(c).nameClipped).length,
    rowNoteSpread: noteTops.length ? +(Math.max(...noteTops) - Math.min(...noteTops)).toFixed(1) : null,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    tlScore: document.querySelectorAll('#w-tl .tl-score').length,
    first3: row.slice(0, 3).map(pick),
  };
};

const results = {};
for (const W of [1440, 390]) {
  for (const mode of ['before', 'after']) {
    const { ctx, page, errs } = await open(mode, W, W === 390 ? 844 : 1000);
    const m = await page.evaluate(MEASURE);
    m.errs = errs.length;
    results[`${mode}-${W}`] = m;
    /* 截第一排前 3 张卡（含海报 + 标题 + 短评），before/after 用同一个 clip 口径 */
    const clip = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('#w-grid .poster')];
      const top = cards[0].getBoundingClientRect().top;
      const row = cards.filter((c) => Math.abs(c.getBoundingClientRect().top - top) < 2).slice(0, 3);
      const rs = row.map((c) => c.getBoundingClientRect());
      const x = Math.min(...rs.map((r) => r.left)) - 6;
      const y = Math.min(...rs.map((r) => r.top)) - 6;
      const right = Math.max(...rs.map((r) => r.right)) + 6;
      const bottom = Math.max(...rs.map((r) => r.bottom)) + 6;
      return { x, y, width: right - x, height: bottom - y };
    });
    await page.screenshot({ path: path.join(OUT, `${mode}-${W}.png`), clip });
    /* 390 另截一张长片名卡：flex-wrap 下长片名曾把评分挤到第二行，修复要对这类卡片可见。
       ⚠️ 这张卡在首屏之外、海报是 loading="lazy"，必须先滚进视口等 complete，
          否则 elementHandle.screenshot 会截出一块空灰底（第一次就踩了）。 */
    if (W === 390) {
      const LONG = '紫罗兰永恒花园外传';
      await page.evaluate((nm) => {
        const c = [...document.querySelectorAll('#w-grid .poster')].find((x) => {
          const n = x.querySelector('.poster-name');
          return n && n.textContent.includes(nm);
        });
        if (c) c.scrollIntoView({ block: 'center' });
      }, LONG);
      await page.waitForFunction((nm) => {
        const c = [...document.querySelectorAll('#w-grid .poster')].find((x) => {
          const n = x.querySelector('.poster-name');
          return n && n.textContent.includes(nm);
        });
        const img = c && c.querySelector('.poster-pic img');
        return !!img && img.complete && img.naturalWidth > 0;
      }, LONG, { timeout: 20000 }).catch(() => {});
      await page.waitForTimeout(350);
      const handle = await page.evaluateHandle((nm) =>
        [...document.querySelectorAll('#w-grid .poster')].find((c) => {
          const n = c.querySelector('.poster-name');
          return n && n.textContent.includes(nm);
        }) || null, LONG);
      const el = handle.asElement();
      if (el) await el.screenshot({ path: path.join(OUT, `${mode}-390-long.png`) });
    }
    await ctx.close();
  }
}
fs.writeFileSync(path.join(OUT, 'diag.json'), JSON.stringify(results, null, 2), 'utf8');
console.log(JSON.stringify(results, null, 2));

/* ---------- 合成对照图（HTML + Playwright，避免手算坐标） ---------- */
const uri = (f) => 'data:image/png;base64,' + fs.readFileSync(path.join(OUT, f)).toString('base64');
const HEAD = `<!doctype html><meta charset="utf-8"><style>
  body { margin:0; padding:22px; background:#15151a; color:#cfd3dc;
         font:13px/1.5 "Segoe UI","Microsoft YaHei",sans-serif; }
  h2 { margin:0 0 6px; font-size:15px; font-weight:600; color:#e8b04b; }
  p.sub { margin:0 0 16px; font-size:12px; color:#9aa3b2; }
  table { border-collapse:separate; border-spacing:14px 10px; }
  th { font-weight:600; font-size:12px; color:#9aa3b2; text-align:left; padding-bottom:4px; }
  th small { display:block; font-weight:400; opacity:.75; font-size:11px; margin-top:3px; }
  td { padding:0; vertical-align:top; }
  .name { font-size:12px; color:#9aa3b2; text-align:right; white-space:nowrap; padding-right:8px; }
</style>`;
const rows = [1440, 390].map((W) => `<tr>
  <td class="name"><b>${W}px</b>${W === 1440 ? '桌面 · 5 列' : '窄屏 · 2 列'}</td>
  <td><img src="${uri(`before-${W}.png`)}" style="width:${W === 1440 ? 660 : 340}px;border-radius:6px;display:block"></td>
  <td><img src="${uri(`after-${W}.png`)}" style="width:${W === 1440 ? 660 : 340}px;border-radius:6px;display:block"></td>
</tr>`).join('');
const longRow = `<tr>
  <td class="name"><b>390 · 长片名</b>《紫罗兰永恒花园外传…》</td>
  <td><img src="${uri('before-390-long.png')}" style="width:190px;border-radius:6px;display:block"></td>
  <td><img src="${uri('after-390-long.png')}" style="width:190px;border-radius:6px;display:block"></td>
</tr>`;
const html = `${HEAD}
<h2>第 90 轮 · ★ 与金色评分移到影视剧名称旁边</h2>
<p class="sub">改前：评分压在海报右下角（纯金字，零填充） · 改后：评分成为标题行第二个元素，紧跟片名，固定 12px 空格；日期仍靠右（窄屏独占第二行）</p>
<table>
  <tr><th></th>
    <th>改前<small>评分在海报右下角 right/bottom 8px</small></th>
    <th>改后<small>片名 → ★评分 →（12px）→ 日期</small></th></tr>
  ${rows}
  ${longRow}
</table>`;
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1200 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.setContent(html, { waitUntil: 'load' });
await page.waitForTimeout(250);
const bb = await (await page.$('body')).boundingBox();
await page.screenshot({ path: path.join(OUT, '00_对照.png'), clip: { x: bb.x, y: bb.y, width: Math.ceil(bb.width), height: Math.ceil(bb.height) } });
await ctx.close();
await browser.close();
console.log('OUT =', OUT);
