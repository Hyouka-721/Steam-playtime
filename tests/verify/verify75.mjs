/* 第 75 轮回归：图片加载性能 + 默认态
   ① 响应式变体：poster_320 / poster_480（只缩不放 / WebP q80），
      网格 srcset + sizes 按 DPR/栏宽选图；时间轴缩略图直接用 320 变体
   ② Service Worker（docs/sw.js）：海报是内容哈希不可变资源，Pages 只给
      max-age=600，刷新超 10 分钟就要 102 张逐一协商 → cache-first，
      二次访问零网络；只拦 img/watch/*.webp，其余请求一律不 respondWith
   ③ 默认态改为「网格视图 + 评分序」且不再跨刷新持久化（kind 仍持久化）
   ⚠️ Chromium 对带 w 描述符的 srcset 返回「密度校正 intrinsic 尺寸」
      （naturalWidth ≈ 卡片布局宽），真实像素宽必须 fetch currentSrc
      后 createImageBitmap 单独量（第 70 轮 C3 同款踩坑，见该文件注释） */
import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');
const sharp = require('sharp');

const BASE = process.env.BASE || 'http://127.0.0.1:8895/';
const ROOT = 'C:/Users/33329/WorkBuddy/2026-10-13-18-17-49/steam-playtime/docs/';
const OUT = 'C:/Users/33329/AppData/Local/Temp/fx_verify_20261018/shots75/';
fs.mkdirSync(OUT, { recursive: true });

const rd = (f) => fs.readFileSync(ROOT + f, 'utf8').replace(/\r\n/g, '\n');
const html = rd('watch.html');
const js = rd('watch.js');
const swjs = rd('sw.js');
const addJs = rd('../scripts/watch-add.mjs');
const data = JSON.parse(fs.readFileSync(ROOT + 'data/watch.json', 'utf8'));
const N = data.items.length;
const SIZES_ATTR = '(max-width: 480px) 45vw, (max-width: 860px) 32vw, (min-width: 1440px) 266px, 234px';

let pass = 0, fail = 0;
const ok = (n, c, extra = '') => { c ? (pass++, console.log(`PASS ${n}${extra ? '  — ' + extra : ''}`)) : (fail++, console.log(`FAIL ${n}  — ${extra}`)); };

/* ---------- 与 watch.js 同规则的排序（期望值用） ---------- */
function sortKey(d) {
  const m = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/.exec(String(d || '').trim());
  if (!m) return '0000-00-00';
  return m[1] + '-' + (m[2] || '00') + '-' + (m[3] || '00');
}
function stampKey(s) { const t = Date.parse(String(s || '')); return Number.isNaN(t) ? 0 : t; }
/* 第 78 轮把「排序」order 插进了两级比较器，本套件的 node 侧重放必须同步，
   否则用户一旦给某条设了 order（例如《史前星球》order=1），并列时的期望顺序
   就与页面不一致 —— 这不是页面错了，是这套比较器过期了。 */
function orderVal(it) {
  const raw = it == null ? null : it.order;
  if (raw == null || raw === '') return 3;
  const n = Number(raw);
  if (!Number.isFinite(n) || Math.floor(n) !== n || n < 0 || n > 5) return 3;
  return n;
}
function cmpTime(a, b) {
  const d = sortKey(b.watched_at).localeCompare(sortKey(a.watched_at));
  if (d !== 0) return d;
  const o = orderVal(a) - orderVal(b);   // 第 78 轮：并列时 order 升序
  if (o !== 0) return o;
  const s = stampKey(a.added_at) - stampKey(b.added_at);
  if (s !== 0) return s;
  return String(a.id || '').localeCompare(String(b.id || ''));
}
function ratingVal(it) { const n = Number(it && it.rating); return Number.isFinite(n) && n > 0 ? n : -1; }
function cmpRating(a, b) {
  const vb = ratingVal(b), va = ratingVal(a);
  if (vb !== va) return vb - va;
  const o = orderVal(a) - orderVal(b);   // 第 78 轮：评分并列时 order 升序
  if (o !== 0) return o;
  return cmpTime(a, b);
}

/* ================= A 静态：代码与数据契约 ================= */
console.log('== A 静态 ==');
ok('A1 watch.html 引用 watch.js?v=13（静态资源版本已 bump）',
  /<script src="watch\.js\?v=13"><\/script>/.test(html), (html.match(/watch\.js\?v=\d+/) || [''])[0]);

ok('A2 默认态常量：var layout = "grid" / var sort = "rating"',
  /var layout = 'grid';/.test(js) && /var sort = 'rating';/.test(js),
  (js.match(/var layout = '\w+';/) || [''])[0] + ' / ' + (js.match(/var sort = '\w+';/) || [''])[0]);

ok('A3 视图/排序不再持久化：无 LAYOUT_KEY / SORT_KEY 定义、无 watch-layout/sort 存取，启动段固定 setLayout(grid)/setSort(rating)',
  !/var (LAYOUT_KEY|SORT_KEY)/.test(js) && !/localStorage\.\w+\([^)]*watch-(layout|sort)/.test(js) &&
  /setLayout\('grid', true\);/.test(js) && /setSort\('rating', true\);/.test(js),
  (js.match(/setLayout\('grid', true\);[\s\S]{0,80}/) || [''])[0].replace(/\n/g, ' '));

ok('A4 响应式图片：SIZES_ATTR 四档 + posterSrcset() + renderGrid 输出 srcset/sizes',
  js.includes(`var SIZES_ATTR = '${SIZES_ATTR}';`) &&
  /function posterSrcset\(it\) \{[\s\S]*?320w[\s\S]*?480w[\s\S]*?\}/.test(js) &&
  /srcset="' \+ esc\(srcset\) \+ '" sizes="' \+ SIZES_ATTR \+ '"'/.test(js));

ok('A5 SW：watch.html 注册 sw.js；sw.js 只拦 /img/watch/*.webp、跨域与其他路径不 respondWith',
  /navigator\.serviceWorker\.register\('sw\.js'\)/.test(html) &&
  /var CACHE = 'watch-posters-v\d+';/.test(swjs) &&
  swjs.includes('var IMMUTABLE_RE = /\\/img\\/watch\\/[^?#]+\\.webp$/;') &&
  /url\.origin !== self\.location\.origin/.test(swjs) &&
  /if \(!IMMUTABLE_RE\.test\(url\.pathname\)\) return;/.test(swjs) &&
  /e\.respondWith\(/.test(swjs));

ok('A6 录入链路同一套规则：watch-add.mjs 生成 320/480 变体并写 poster_320 / poster_480 字段',
  /VARIANT_WIDTHS = \[320, 480\]/.test(addJs) && addJs.includes('`poster_${v.w}`, v.rel'));

/* 变体数据契约：覆盖完整（base 够宽就必须有变体）+ 像素宽自洽 + 只缩不放 */
const variantCheck = await (async () => {
  const dir = ROOT + 'img/watch/';
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.webp'));
  const base = (p) => String(p || '').replace('img/watch/', '');
  const used = data.items.map((x) => base(x.poster));
  const problems = [];
  let n320 = 0, n480 = 0;
  for (const it of data.items) {
    const bw = it.poster_w, bh = it.poster_h;
    const stem = base(it.poster).replace(/\.webp$/, '');
    for (const w of [320, 480]) {
      const rel = base(it['poster_' + w]);
      if (rel) {
        if (rel !== `${stem}-${w}.webp`) { problems.push(`命名不符 ${rel}`); continue; }
        if (!files.includes(rel)) { problems.push(`文件缺失 ${rel}`); continue; }
        w === 320 ? n320++ : n480++;
      } else if (bw > w) {
        problems.push(`缺 ${w} 变体：${it.title}（base 宽 ${bw}）`);
        continue;
      }
      if (rel) {
        const m = await sharp(dir + rel).metadata();
        if (m.width !== w) { problems.push(`宽度不符 ${rel}=${m.width}`); continue; }
        const expectH = Math.round(bh * w / bw);
        if (Math.abs((m.height || 0) - expectH) > 1) problems.push(`高度不符 ${rel}=${m.height} 期望≈${expectH}`);
        if ((m.height || 0) > bh) problems.push(`变体比 base 还高 ${rel}`);
      }
    }
  }
  // 磁盘无孤儿：每个文件要么是被引用的 base，要么是被字段引用的变体
  const refs = [];
  for (const it of data.items) for (const w of [320, 480]) if (it['poster_' + w]) refs.push(base(it['poster_' + w]));
  const allowed = new Set(used.concat(refs));
  const orphans = files.filter((f) => !allowed.has(f));
  if (orphans.length) problems.push(`孤儿文件 ${orphans.length} 个：${orphans.slice(0, 3).join(',')}`);
  return { problems, n320, n480, files: files.length };
})();
ok('A7 变体契约：base 够宽必有变体；变体宽 = 标注宽、高 = 比例高 ±1、只缩不放；磁盘无孤儿',
  variantCheck.problems.length === 0,
  `文件 ${variantCheck.files} 个（320×${variantCheck.n320} / 480×${variantCheck.n480}）${variantCheck.problems.slice(0, 2).join('；')}`);

/* ================= B 运行时：默认网格 + 评分序 ================= */
console.log('== B 运行时：默认态 ==');
const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const errs = [];
let ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
let p = await ctx.newPage();
p.on('pageerror', (e) => errs.push(String(e)));

async function readGridState() {
  return p.evaluate(() => {
    const grid = document.getElementById('w-grid');
    const tl = document.getElementById('w-tl');
    const cards = [...document.querySelectorAll('#w-grid .poster')];
    return {
      gridVisible: !!grid && !grid.hidden && grid.getBoundingClientRect().height > 0,
      tlHidden: !!tl && (tl.hidden || tl.getBoundingClientRect().height === 0),
      names: cards.map((c) => (c.querySelector('.poster-name') || {}).textContent || ''),
      ratingOn: (() => { const b = document.querySelector('.w-sort-btn[data-sort="rating"]'); return b ? (b.classList.contains('is-on') && b.getAttribute('aria-pressed') === 'true') : false; })(),
      timeOn: (() => { const b = document.querySelector('.w-sort-btn[data-sort="time"]'); return b ? (b.classList.contains('is-on') || b.getAttribute('aria-pressed') === 'true') : false; })(),
      avatarPressed: (document.getElementById('w-avatar') || {}).getAttribute ? document.getElementById('w-avatar').getAttribute('aria-pressed') : null,
      storedLayout: (() => { try { return localStorage.getItem('watch-layout'); } catch (e) { return 'err'; } })(),
      storedSort: (() => { try { return localStorage.getItem('watch-sort'); } catch (e) { return 'err'; } })(),
    };
  });
}

await p.goto(BASE + 'watch.html', { waitUntil: 'load' });
await p.waitForFunction(() => document.querySelectorAll('#w-grid .poster').length > 0, null, { timeout: 25000 });
await p.evaluate(() => document.fonts.ready);
await p.waitForTimeout(500);

let st = await readGridState();
ok('B1 首访即网格视图（时间轴隐藏、排序条可见）', st.gridVisible && st.tlHidden && st.names.length === N,
  `grid=${st.names.length}/${N} tlHidden=${st.tlHidden}`);

const expectOrder = data.items.slice().sort(cmpRating).map((x) => x.title);
ok('B2 网格顺序 = 评分序（高评分在前，并列回落观影时间倒序+上传正序）',
  JSON.stringify(st.names) === JSON.stringify(expectOrder),
  `首卡「${st.names[0]}」（评分 ${ratingVal(data.items.find((x) => x.title === st.names[0]))}）`);

ok('B3 排序按钮 rating 选中 / time 未选中；头像 aria-pressed=false（时间轴未开）',
  st.ratingOn && !st.timeOn && st.avatarPressed === 'false', JSON.stringify({ ratingOn: st.ratingOn, timeOn: st.timeOn, avatar: st.avatarPressed }));

ok('B4 视图/排序不写 localStorage（watch-layout / watch-sort 均未创建）',
  st.storedLayout === null && st.storedSort === null, `layout=${st.storedLayout} sort=${st.storedSort}`);

/* 塞入陈旧的持久化键再刷新：必须被忽略，仍回默认网格 + 评分序 */
await p.evaluate(() => {
  try { localStorage.setItem('watch-layout', 'timeline'); localStorage.setItem('watch-sort', 'time'); } catch (e) {}
});
await p.reload({ waitUntil: 'load' });
await p.waitForFunction(() => document.querySelectorAll('#w-grid .poster').length > 0, null, { timeout: 25000 });
await p.waitForTimeout(400);
st = await readGridState();
ok('B5 刷新后回到默认（网格 + 评分序），陈旧的 layout/sort 键被忽略',
  st.gridVisible && st.tlHidden && st.ratingOn && !st.timeOn &&
  JSON.stringify(st.names) === JSON.stringify(expectOrder),
  `grid=${st.names.length} ratingOn=${st.ratingOn}`);

/* srcset / sizes / 真实像素宽 */
const first = await p.evaluate(async () => {
  const im = document.querySelector('#w-grid .poster img');
  if (!im) return null;
  const out = { src: im.getAttribute('src'), srcset: im.getAttribute('srcset'), sizes: im.getAttribute('sizes'), cur: im.currentSrc, realW: 0, realH: 0 };
  if (im.complete && im.currentSrc) {
    try {
      const res = await fetch(im.currentSrc);
      const bmp = await createImageBitmap(await res.blob());
      out.realW = bmp.width; out.realH = bmp.height;
      if (bmp.close) bmp.close();
    } catch (e) { out.err = String(e); }
  }
  return out;
});
const firstItem = data.items.find((x) => x.title === st.names[0]) || {};
const firstCands = [firstItem.poster, firstItem.poster_320, firstItem.poster_480].filter(Boolean);
const curName = first && first.cur ? first.cur.split('/').pop() : '';
const expectW = curName.endsWith('-320.webp') ? 320 : curName.endsWith('-480.webp') ? 480 : firstItem.poster_w;
ok('B6 网格卡片 srcset 三候选齐全、sizes 四档、currentSrc ∈ 候选、真实像素宽 = 标注宽',
  !!first && first.src === firstItem.poster &&
  firstCands.every((c) => (first.srcset || '').includes(c.split('/').pop())) &&
  first.sizes === SIZES_ATTR &&
  firstCands.some((c) => first.cur.endsWith(c.split('/').pop())) &&
  first.realW === expectW,
  JSON.stringify({ cur: curName, expectW, real: first && [first.realW, first.realH], err: first && first.err }));

await p.screenshot({ path: OUT + 'B1_默认网格_评分序_1440.png' });

/* ================= C 运行时：SW cache-first ================= */
console.log('== C 运行时：Service Worker ==');
await p.evaluate(() => navigator.serviceWorker.ready);
await p.reload({ waitUntil: 'load' });
await p.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 20000 }).catch(() => {});
await p.waitForFunction(() => document.querySelectorAll('#w-grid .poster').length > 0, null, { timeout: 25000 });

/* 第二次访问：整页滚一遍，让懒加载海报全部经 SW 入缓存 */
await p.evaluate(async () => {
  const step = window.innerHeight;
  for (let y = 0; y <= document.body.scrollHeight; y += step) {
    window.scrollTo(0, y);
    await new Promise((r) => setTimeout(r, 100));
  }
});
await p.waitForFunction(() => {
  const imgs = [...document.querySelectorAll('#w-grid img')];
  return imgs.length > 0 && imgs.every((im) => im.complete);
}, null, { timeout: 40000 }).catch(() => {});

const cacheInfo = await p.evaluate(async () => {
  const c = await caches.open('watch-posters-v1');
  const keys = await c.keys();
  return keys.map((r) => r.url.split('/').pop()).filter((u) => /\.webp$/.test(u));
});
ok('C1 SW 已控制页面且缓存 watch-posters-v1 已收录海报',
  (await p.evaluate(() => !!navigator.serviceWorker.controller)) && cacheInfo.length > 0,
  `controller=${await p.evaluate(() => !!navigator.serviceWorker.controller)} 缓存 ${cacheInfo.length} 个 URL`);

/* 第三次访问：所有海报应零网络（transferSize=0） */
await p.reload({ waitUntil: 'load' });
await p.waitForFunction(() => document.querySelectorAll('#w-grid .poster').length > 0, null, { timeout: 25000 });
await p.evaluate(async () => {
  const step = window.innerHeight;
  for (let y = 0; y <= document.body.scrollHeight; y += step) {
    window.scrollTo(0, y);
    await new Promise((r) => setTimeout(r, 100));
  }
});
await p.waitForFunction(() => {
  const imgs = [...document.querySelectorAll('#w-grid img')];
  return imgs.length > 0 && imgs.every((im) => im.complete);
}, null, { timeout: 40000 }).catch(() => {});
const timing = await p.evaluate(() => {
  const es = performance.getEntriesByType('resource').filter((e) => /\/img\/watch\/[^?#]+\.webp$/.test(e.name));
  return { n: es.length, bad: es.filter((e) => e.transferSize !== 0).map((e) => `${e.name.split('/').pop()}:${e.transferSize}`) };
});
ok('C2 三次访问后所有海报 transferSize=0（SW cache-first，零网络）',
  timing.n >= 20 && timing.bad.length === 0,
  `${timing.n} 个海报资源${timing.bad.length ? '，非零：' + timing.bad.slice(0, 3).join(' ') : '，全部 0'}`);

/* 第 80 轮 P7：sw.js 也开始缓存 /data/watch.json。
   原判据是「page.route 命中 ≥2」，但 SW 接管后 page.route 拦不到 SW 发出的请求，
   计数恒为 0（代理失效，不是契约被破坏）→ 换成三条直接证据：
   ① performance 里该请求 workerStart > 0：确实经过 SW 线程（不能靠
      response.fromServiceWorker —— SW 直接透传 fetch() 的响应时 Chromium 不置该标志）；
   ② watch-data-v1 缓存里已有这条副本：P7 的「顺带存一份」真的发生了；
   ③ 内容与磁盘逐字段一致：网络优先，刷新即最新，没被旧缓存冻住。 */
const disk = JSON.parse(fs.readFileSync(ROOT + 'data/watch.json', 'utf8'));
const live = await p.evaluate(async () => {
  const res = await fetch('./data/watch.json');
  const j = await res.json();
  await new Promise((r) => setTimeout(r, 250));   // 等 SW 里那次 cache.put 落盘
  const keys = await caches.keys();
  let cached = false;
  if (keys.indexOf('watch-data-v1') >= 0) {
    const c = await caches.open('watch-data-v1');
    cached = !!(await c.match('/data/watch.json'));
  }
  const ent = performance.getEntriesByType('resource').filter((e) => /watch\.json/.test(e.name));
  return {
    viaWorker: ent.some((e) => e.workerStart > 0),
    cached,
    dataCache: keys.indexOf('watch-data-v1') >= 0,
    updated: j.updated_at,
    n: j.items.length,
  };
});
ok('C3 watch.json 经 SW 且网络优先：内容=磁盘最新，并已写入 watch-data-v1',
  live.viaWorker && live.dataCache && live.cached &&
  live.updated === disk.updated_at && live.n === disk.items.length,
  `SW线程=${live.viaWorker}｜watch-data-v1=${live.dataCache}｜命中=${live.cached}｜${live.n} 条/${live.updated}`);

ok('C4 全程零 JS 异常', errs.length === 0, errs.slice(0, 3).join(' | '));

await ctx.close();
await browser.close();
console.log(`\n===== 第 75 轮回归：${pass}/${pass + fail} =====`);
process.exit(fail ? 1 : 0);
