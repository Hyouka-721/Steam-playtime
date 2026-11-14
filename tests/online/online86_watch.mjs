/* 第 86 轮 watch 侧线上复验：视觉评审第三批 P2+P3
   对应提交 606d424，预期线上 watch.css?v=39

   ① 内容指纹：线上引用 v24；css/js 与本地 md5 全等；条数从数据推导
   ② 1440：令牌计算值生效、圆角落档、缓动曲线一致、.w-btn 含 filter、表单无英文、0 PUT
   ③ 390：文件行不溢出、海报说明折行收敛、无溢出
   ④ 守护：时间轴字号（第 64 轮）+ 跨页契约（第 56 轮，头像不参与归一）

   ⚠️ 另一条线的 `online86.mjs` 属 index 站（热力图按月 + 环视 ECharts），本文件带 `_watch` 后缀。
   ⚠️ 所有套件统一 --no-proxy-server：本机代理会把 github 域名指向 127.0.0.1。 */
import { createRequire } from 'module';
import fs from 'fs';
import crypto from 'crypto';
const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const SITE = 'https://hyouka-721.github.io/Steam-playtime/';
const ROOT = 'C:/Users/33329/WorkBuddy/2026-10-13-18-17-49/steam-playtime/docs/';
const OUT = 'C:/Users/33329/AppData/Local/Temp/fx_verify_20261018/shots86online/';
fs.mkdirSync(OUT, { recursive: true });

const md5 = (b) => crypto.createHash('md5').update(b).digest('hex');
const norm = (s) => String(s).replace(/\r\n/g, '\n');
const md5txt = (s) => md5(Buffer.from(norm(s), 'utf8'));
const localCss = norm(fs.readFileSync(ROOT + 'watch.css', 'utf8'));
const localJs = norm(fs.readFileSync(ROOT + 'watch.js', 'utf8'));
const localData = JSON.parse(fs.readFileSync(ROOT + 'data/watch.json', 'utf8').replace(/^\uFEFF/, ''));
const N = localData.items.length;

let pass = 0, fail = 0;
const ok = (n, c, extra = '') => {
  c ? (pass++, console.log(`PASS ${n}${extra ? '  — ' + extra : ''}`))
    : (fail++, console.log(`FAIL ${n}  — ${extra}`));
};

const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const openAt = async (w, h) => {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  const puts = [], errs = [];
  p.on('request', (r) => { if (r.method() === 'PUT') puts.push(r.url()); });
  p.on('pageerror', (e) => errs.push(String(e)));
  p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  for (let i = 1; i <= 4; i++) {
    try { await p.goto(SITE + 'watch.html', { waitUntil: 'domcontentloaded', timeout: 45000 }); break; }
    catch (e) { if (i === 4) throw e; await p.waitForTimeout(2000); }
  }
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(500);
  return { ctx, p, puts, errs };
};

/* ================= A 内容指纹 ================= */
console.log('== A 内容指纹 ==');
{
  const { ctx, p } = await openAt(1440, 900);
  const got = await p.evaluate(async (site) => {
    const get = async (u) => (await fetch(site + u, { cache: 'reload' })).text();
    const [html, css, js, data] = await Promise.all([
      get('watch.html'), get('watch.css?v=39'), get('watch.js?v=31'), get('data/watch.json'),
    ]);
    return { html, css, js, data };
  }, SITE);

  ok('A1 线上 watch.html 引用 watch.css?v=39 / watch.js?v=31',
    /watch\.css\?v=39/.test(got.html) && /watch\.js\?v=31/.test(got.html),
    (got.html.match(/watch\.(css|js)\?v=\d+/g) || []).join(' '));
  ok('A2 线上 watch.css 与本地逐字节相同（CRLF 归一后 md5 全等）',
    md5txt(got.css) === md5txt(localCss), md5txt(got.css).slice(0, 12));
  ok('A3 线上 watch.js 与本地逐字节相同（本轮动了 fileNameEl 一小段）',
    md5txt(got.js) === md5txt(localJs), md5txt(got.js).slice(0, 12));
  ok(`A4 线上数据 ${JSON.parse(got.data).items.length} 条 = 本地 ${N} 条`,
    JSON.parse(got.data).items.length === N);
  await ctx.close();
}

/* ================= B 1440 ================= */
console.log('\n== B 1440 桌面 ==');
{
  const { ctx, p, puts, errs } = await openAt(1440, 950);
  await p.waitForFunction(() => document.querySelectorAll('#w-grid .poster').length > 20, null, { timeout: 30000 }).catch(() => {});

  const d = await p.evaluate(() => {
    const cs = (s) => { const e = document.querySelector(s); return e ? getComputedStyle(e) : null; };
    const rad = (s) => { const c = cs(s); return c ? c.borderTopLeftRadius : null; };
    const sameEase = (s) => {
      const parts = String(s || '').match(/cubic-bezier\([^)]*\)/g) || [];
      return parts.length > 0 && parts.every((x) => x === 'cubic-bezier(0.22, 0.68, 0.28, 1)');
    };
    return {
      noteColor: (cs('.poster-note') || {}).color,
      radii: { posterPic: rad('.poster-pic'), score: rad('.poster-score'), seg: rad('.w-seg') },
      easeOk: sameEase((cs('.w-seg-btn') || {}).transitionTimingFunction)
        && sameEase((cs('.w-fab') || {}).transitionTimingFunction),
      btnProps: (cs('.w-btn') || { transitionProperty: '' }).transitionProperty,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  ok('B1 令牌生效：短评 = rgb(168,168,180)（--text-soft）',
    d.noteColor === 'rgb(168, 168, 180)', d.noteColor);
  ok('B2 圆角全部落在 6/8/12/18/999 五档（海报 12 / 评分牌 999 / 段控件 12）',
    [d.radii.posterPic, d.radii.score, d.radii.seg].every((v) => ['12px', '999px', '8px', '18px', '6px'].includes(v)),
    JSON.stringify(d.radii));
  ok('B3 缓动统一为 cubic-bezier(0.22, 0.68, 0.28, 1)',
    d.easeOk, 'seg + fab');
  ok('B4 主按钮 transitionProperty 含 filter（本轮修掉的瞬变）',
    /\bfilter\b/.test(d.btnProps), d.btnProps);

  await p.click('.w-fab', { force: true });
  await p.waitForSelector('#add-title', { timeout: 15000 });
  await p.waitForTimeout(400);
  const f = await p.evaluate(() => {
    const btn = document.querySelector('.w-file-btn');
    const name = document.getElementById('add-poster-name');
    const b = btn && btn.getBoundingClientRect();
    const tip = document.getElementById('add-poster-tip');
    return {
      btnText: btn ? btn.textContent.trim() : '',
      btnVisible: !!b && b.width > 0 && b.height > 0,
      nameText: name ? name.textContent.trim() : '',
      hintColor: getComputedStyle(document.querySelector('.w-hint')).color,
      dlgRadius: getComputedStyle(document.querySelector('.w-add')).borderTopLeftRadius,
      inputRadius: getComputedStyle(document.getElementById('add-title')).borderTopLeftRadius,
      english: /Choose File|No file chosen/i.test(document.body.innerText),
      tipLines: +(tip.getBoundingClientRect().height / parseFloat(getComputedStyle(tip).lineHeight)).toFixed(2),
    };
  });
  ok('B5 表单：自绘「选择海报」+「未选择文件」，页面再无 Choose File / No file chosen',
    f.btnVisible && f.btnText === '选择海报' && f.nameText === '未选择文件' && !f.english,
    `btn=${f.btnText} / name=${f.nameText} / 英文=${f.english}`);
  ok('B6 表单：.w-hint = rgb(106,106,119)、弹窗圆角 18、输入框圆角 8',
    f.hintColor === 'rgb(106, 106, 119)' && f.dlgRadius === '18px' && f.inputRadius === '8px',
    `hint=${f.hintColor} dlg=${f.dlgRadius} input=${f.inputRadius}`);
  ok('B7 1440 无横向溢出 + 0 次 PUT + 零 JS 异常',
    d.overflow === 0 && puts.length === 0 && errs.length === 0,
    `overflow ${d.overflow} / PUT ${puts.length} / err ${errs.length}`);
  await p.locator('.w-add').screenshot({ path: OUT + 'form_1440.png' }).catch(() => {});
  await ctx.close();
}

/* ================= C 390 ================= */
console.log('\n== C 390 窄屏 ==');
{
  const { ctx, p, errs } = await openAt(390, 844);
  await p.click('.w-fab', { force: true });
  await p.waitForSelector('#add-title', { timeout: 15000 });
  await p.waitForTimeout(400);
  const d = await p.evaluate(() => {
    const r = (s) => { const e = document.querySelector(s); return e && e.getBoundingClientRect(); };
    const row = r('.w-file-row'), btn = r('.w-file-btn'), name = r('.w-file-name');
    const tip = document.getElementById('add-poster-tip');
    return {
      noOverlap: !!btn && !!name && btn.right <= name.left + 1,
      rowInside: !!row && row.width <= document.querySelector('.w-pick-tip').getBoundingClientRect().width + 1,
      tipLines: +(tip.getBoundingClientRect().height / parseFloat(getComputedStyle(tip).lineHeight)).toFixed(2),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  ok('C1 390：文件行不出容器、按钮与文件名不重叠', d.rowInside && d.noOverlap,
    `rowInside=${d.rowInside} noOverlap=${d.noOverlap}`);
  ok(`C2 390：海报说明折行收敛（${d.tipLines} 行，改前 4 行）`, d.tipLines <= 3, `tipLines=${d.tipLines}`);
  ok('C3 390：无横向溢出 + 零 JS 异常', d.overflow === 0 && errs.length === 0,
    `overflow ${d.overflow} / err ${errs.length}`);
  await p.locator('.w-add').screenshot({ path: OUT + 'form_390.png' }).catch(() => {});
  await ctx.close();
}

/* ================= D 守护 ================= */
console.log('\n== D 守护（第 64 轮时间轴 + 第 56 轮跨页契约） ==');
{
  const { ctx, p } = await openAt(1440, 900);
  const av = await p.evaluate(() => {
    const cs = getComputedStyle(document.querySelector('#w-avatar'));
    return { tr: cs.transitionDuration, tf: cs.transitionTimingFunction };
  });
  ok('D1 跨页契约：.w-avatar 仍是 .18s ease（没被 P3 归一掉，与首页 .header-avatar 同值）',
    av.tr === '0.18s' && av.tf === 'ease', `${av.tr} / ${av.tf}`);

  await p.click('#w-avatar');
  await p.waitForSelector('#w-tl .tl-item', { timeout: 25000 }).catch(() => {});
  await p.waitForTimeout(600);
  const t = await p.evaluate(() => {
    const it = document.querySelector('#w-tl .tl-item');
    if (!it) return null;
    const g = (s) => parseFloat(getComputedStyle(it.querySelector(s)).fontSize);
    return {
      name: g('.tl-name'), en: g('.tl-en'), note: g('.tl-note'),
      noteColor: getComputedStyle(it.querySelector('.tl-note')).color,
      radius: getComputedStyle(it).borderTopLeftRadius,
    };
  });
  ok('D2 时间轴 21 / 18.5 / 19 未变、评语走 --text-soft、条目圆角 12',
    !!t && t.name === 21 && t.en === 18.5 && t.note === 19
    && t.noteColor === 'rgb(168, 168, 180)' && t.radius === '12px',
    t ? `${t.name}/${t.en}/${t.note} color=${t.noteColor} r=${t.radius}` : '时间轴未渲染');
  await ctx.close();
}

await browser.close();
console.log(`\n===== 第 86 轮 watch 线上复验：PASS ${pass} / FAIL ${fail} =====`);
process.exit(fail === 0 ? 0 : 1);
