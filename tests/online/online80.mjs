/* 线上复验（push 后跑）：第 80 轮六项体验优化 + 第 81 轮撤销标签 chip
   第 80 轮对应提交：d120985(feat 七项) / 34b5161(revert A1) / e74ad2a(合并远端 tags)
   第 81 轮：用户指令「在所有界面删除 P2 标签 chip 筛选」→ chip 行连同筛选逻辑整体下线

   ① 内容指纹：线上 watch.html 引用 v19/v14；watch.css / watch.js 与工作区 md5 全等；
      sw.js 与 **HEAD 提交** md5 全等（两页共用文件，工作区可能被另一条线改到一半）
   ② A1 已回退：CSS 里没有 .poster[data-score]，线上网格 0 张卡片带该属性
   ③ 六项生效：颗粒+光晕（含页眉那层）、时间轴 hover、--text-dim、
      编辑模式才出现的删除按钮（第一下只举手、零请求）
   ④ 第 81 轮：线上 HTML 无 #w-tags、页面 DOM 无 chip、排序条与网格之间没有残留空档
   ⑤ 数据：线上 119 条与本地逐条同 tags，词表 14 个（含用户在网页端加的「灾难」）
      —— tags 字段**保留**，只是不再有筛选 UI
   ⑥ SW：watch.json 经 SW 处理且已写入 watch-data-v1（网络优先生效的证据）
   写操作安全边界：全程 api.github.com 的 PUT 必须为 0（线上绝不真删/真写）。 */
import { createRequire } from 'module';
import fs from 'fs';
import crypto from 'crypto';
import { execFileSync } from 'child_process';
const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const SITE = 'https://hyouka-721.github.io/Steam-playtime/';
const ROOT = 'C:/Users/33329/WorkBuddy/2026-10-13-18-17-49/steam-playtime/docs/';
const OUT = 'C:/Users/33329/AppData/Local/Temp/fx_verify_20261018/shots80online/';
fs.mkdirSync(OUT, { recursive: true });

const md5 = (b) => crypto.createHash('md5').update(b).digest('hex');
const norm = (s) => String(s).replace(/\r\n/g, '\n');
const md5txt = (s) => md5(Buffer.from(norm(s), 'utf8'));
const localCss = norm(fs.readFileSync(ROOT + 'watch.css', 'utf8'));
const localJs = norm(fs.readFileSync(ROOT + 'watch.js', 'utf8'));
/* sw.js 是 index 与 watch 两页共用的文件，另一条线可能在工作区里改到一半（未提交）。
   线上部署永远来自「已推送的提交」，所以 A4 比 HEAD 而不是工作区 —— 比的是部署结果，
   不是同事的草稿。判断依据换成 git 对象，工作区脏了也不会误报。（第 83 轮修正） */
const localSw = (() => {
  try {
    return norm(execFileSync('git', ['show', 'HEAD:docs/sw.js'], {
      cwd: 'C:/Users/33329/WorkBuddy/2026-10-13-18-17-49/steam-playtime', encoding: 'utf8', maxBuffer: 1 << 24,
    }));
  } catch (e) {
    console.log('  (提示) 取不到 HEAD 版 sw.js，回落工作区：' + e.message.split('\n')[0]);
    return norm(fs.readFileSync(ROOT + 'sw.js', 'utf8'));
  }
})();
const localData = JSON.parse(fs.readFileSync(ROOT + 'data/watch.json', 'utf8').replace(/^\uFEFF/, ''));
const N = localData.items.length;
const localTags = JSON.stringify(localData.items.map((x) => [x.title, x.tags]));
const vocab = [...new Set(localData.items.flatMap((x) => x.tags || []))].sort();

let pass = 0, fail = 0;
const ok = (n, c, extra = '') => {
  c ? (pass++, console.log(`PASS ${n}${extra ? '  — ' + extra : ''}`))
    : (fail++, console.log(`FAIL ${n}  — ${extra}`));
};

const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, bypassCSP: true });
const p = await ctx.newPage();
const puts = [];
const errs = [];
p.on('request', (r) => { if (r.method() === 'PUT' && /api\.github\.com/.test(r.url())) puts.push(r.url()); });
p.on('pageerror', (e) => errs.push(String(e)));
p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

async function gotoRetry(url, tries = 4) {
  for (let i = 1; i <= tries; i++) {
    try { await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }); return; }
    catch (e) { if (i === tries) throw e; await p.waitForTimeout(2000); }
  }
}

/* ================= A 内容指纹 ================= */
console.log('== A 内容指纹 ==');
const fetched = await (async () => {
  await gotoRetry(SITE + 'watch.html');
  return p.evaluate(async (site) => {
    const get = async (u) => (await fetch(site + u, { cache: 'reload' })).text();
    const [html, css, js, sw, data] = await Promise.all([
      get('watch.html'), get('watch.css?v=21'), get('watch.js?v=16'), get('sw.js'), get('data/watch.json'),
    ]);
    return { html, css, js, sw, data };
  }, SITE);
})();

ok('A1 线上 watch.html 引用 watch.css?v=21 / watch.js?v=16',
  /watch\.css\?v=21/.test(fetched.html) && /watch\.js\?v=16/.test(fetched.html),
  (fetched.html.match(/watch\.(css|js)\?v=\d+/g) || []).join(' '));

ok('A2 线上 watch.css 与本地逐字节相同（CRLF 归一后 md5 全等）',
  md5txt(fetched.css) === md5txt(localCss), md5txt(fetched.css).slice(0, 12));

ok('A3 线上 watch.js 与本地逐字节相同',
  md5txt(fetched.js) === md5txt(localJs), md5txt(fetched.js).slice(0, 12));

ok('A4 线上 sw.js 与 HEAD 提交逐字节相同（两页共用文件，不比工作区草稿）',
  md5txt(fetched.sw) === md5txt(localSw), md5txt(fetched.sw).slice(0, 12));

const liveData = JSON.parse(fetched.data);
const liveTags = JSON.stringify(liveData.items.map((x) => [x.title, x.tags]));
ok(`A5 线上 ${liveData.items.length} 条 = 本地 ${N} 条，且每条 tags 与本地逐条相同`,
  liveData.items.length === N && liveTags === localTags,
  liveTags === localTags ? '逐条一致' : '存在差异');

const liveVocab = [...new Set(liveData.items.flatMap((x) => x.tags || []))].sort();
const nj = liveData.items.find((x) => x.title === '南京照相馆');
ok(`A6 线上词表 = 本地 ${vocab.length} 个；南京照相馆的合串在线上也是拆开的 3 个`,
  JSON.stringify(liveVocab) === JSON.stringify(vocab) && !!nj && nj.tags.length === 3,
  `${liveVocab.length} 个：${liveVocab.join('/')}`);

/* ============ B A1 回退 + 六项生效（静态） ============ */
console.log('\n== B A1 回退 / 六项静态指纹 ==');
const cssNC = fetched.css.replace(/\/\*[\s\S]*?\*\//g, '');

ok('B1 A1 已回退：线上 CSS 里没有任何 .poster[data-score] 规则',
  !/data-score/.test(cssNC));

ok('B2 A2 颗粒：body::before 两层点阵 + pointer-events:none（不挡点击）',
  /body::before \{[\s\S]{0,420}pointer-events: none/.test(cssNC) &&
  /body::before \{[\s\S]{0,640}background-size: 3px 3px, 5px 5px/.test(cssNC));

ok('B3 A2 光晕：--bg-glow 首层 560×152 + 页眉单独叠一层暖光',
  /--bg-glow: radial-gradient\(560px 152px at 50% -34px/.test(cssNC) &&
  /\.w-header \{[\s\S]{0,420}radial-gradient\(560px 128px/.test(cssNC));

ok('B4 A3 时间轴 hover：右移 + 金线 + 缩略图放大',
  /\.tl-item:hover \{[^}]*transform: translateX\(3px\)/.test(cssNC) &&
  /\.tl-item:hover \.tl-thumb img \{ transform: scale\(1\.04\); \}/.test(cssNC));

ok('B5 A4 --text-dim = #9696a6，旧值 #82828f 已不存在',
  /--text-dim: #9696a6;/.test(cssNC) && !/#82828f/.test(cssNC));

ok('B6 第 81 轮：线上 HTML 已无 chip 容器 #w-tags；P6 删除按钮仍在且默认 hidden',
  !/id="w-tags"/.test(fetched.html) && !/class="w-tags"/.test(fetched.html) &&
  /id="w-add-delete"[^>]*hidden/.test(fetched.html));

ok('B7 P7 sw.js 有独立数据缓存且网络优先（fetch 在前，catch 才读缓存）',
  /watch-data-v1/.test(fetched.sw) &&
  /DATA_RE\.test\(url\.pathname\)[\s\S]{0,220}fetch\(req\)[\s\S]{0,400}catch/.test(fetched.sw));

/* ================= C 运行时 ================= */
console.log('\n== C 运行时（真实页面）==');
await p.waitForFunction(() => document.querySelectorAll('#w-grid .poster').length > 50, null, { timeout: 30000 });
await p.waitForTimeout(800);

ok('C1 线上网格 0 张卡片带 data-score（A1 确实回退了）',
  (await p.$$eval('#w-grid .poster[data-score]', (e) => e.length)) === 0);

/* 第 81 轮：chip 行下线 —— DOM 里查不到，排序条到网格之间也没有它留下的空档 */
const gone = await p.evaluate(() => {
  const r = (sel) => {
    const el = document.querySelector(sel);
    return el ? el.getBoundingClientRect() : { top: 0, bottom: 0 };
  };
  return {
    box: document.querySelectorAll('#w-tags').length,
    chips: document.querySelectorAll('.w-tag, .w-tags').length,
    d: Math.round(r('#w-grid').top - r('#w-sort').bottom),
  };
});
ok('C2 第 81 轮：线上无 chip 行（DOM 计数 0），排序条→网格间距 ≤ 60px（无残留空档）',
  gone.box === 0 && gone.chips === 0 && gone.d >= 0 && gone.d <= 60,
  `#w-tags=${gone.box}｜chip=${gone.chips}｜间距=${gone.d}px`);

/* P6：编辑模式才有删除；第一下只举手，且绝不发请求 */
await p.click('#w-avatar');
await p.waitForFunction(() => document.querySelectorAll('#w-tl .tl-item').length > 50, null, { timeout: 30000 });
await p.waitForTimeout(500);
const addModeHidden = await p.evaluate(() => document.getElementById('w-add-delete').hidden);
await p.evaluate(() => document.querySelector('#w-tl .tl-item').click());
await p.waitForTimeout(700);
const editInfo = await p.evaluate(() => {
  const b = document.getElementById('w-add-delete');
  return { hidden: b.hidden, label: b.textContent.trim() };
});
await p.click('#w-add-delete');
await p.waitForTimeout(400);
const armed = await p.evaluate(() => {
  const b = document.getElementById('w-add-delete');
  return {
    label: b.textContent.trim(),
    armed: /is-armed/.test(b.className),
    msg: (document.getElementById('w-add-msg') || {}).textContent || '',
    open: document.getElementById('w-add').hasAttribute('open'),
  };
});
ok('C3 P6 删除按钮：新增模式隐藏、编辑模式出现，第一下只变「确认删除？」',
  addModeHidden === true && editInfo.hidden === false && editInfo.label === '删除这条' &&
  armed.label === '确认删除？' && armed.armed && /再点一次确认删除/.test(armed.msg) && armed.open === true,
  `隐藏=${addModeHidden}/${editInfo.hidden}｜${editInfo.label} → ${armed.label}`);

ok('C4 写操作安全边界：点第一下全程 0 次 PUT（线上绝不会误删）',
  puts.length === 0, `PUT ${puts.length} 次`);

/* SW：数据请求经 SW 且已入 watch-data-v1（网络优先顺带写缓存）
   ⚠️ 首次加载时 SW 只是「注册上」，还没控制页面（clients.claim 要等 activate 完成）→
   必须先等 ready 再 reload 一次，reload 后的那次 watch.json 请求才真的经过 SW。 */
await p.evaluate(() => navigator.serviceWorker.ready);
await p.reload({ waitUntil: 'load' });
await p.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 30000 }).catch(() => {});
await p.waitForFunction(() => document.querySelectorAll('#w-grid .poster').length > 50, null, { timeout: 30000 }).catch(() => {});
await p.waitForTimeout(700);
const swInfo = await p.evaluate(async () => {
  await new Promise((r) => setTimeout(r, 300));
  const keys = await caches.keys();
  let hit = false;
  if (keys.indexOf('watch-data-v1') >= 0) {
    const c = await caches.open('watch-data-v1');
    hit = !!(await c.match('/Steam-playtime/data/watch.json')) || !!(await c.match('/data/watch.json'));
  }
  const ent = performance.getEntriesByType('resource').filter((e) => /data\/watch\.json/.test(e.name));
  return {
    via: ent.some((e) => e.workerStart > 0),
    controlled: !!navigator.serviceWorker.controller,
    keys, hit, n: ent.length,
  };
});
ok('C5 SW：watch.json 请求经 SW 处理，且 watch-data-v1 里已有副本',
  swInfo.controlled === true && swInfo.via === true && swInfo.hit === true,
  `受控=${swInfo.controlled}｜SW线程=${swInfo.via}｜缓存命中=${swInfo.hit}｜${swInfo.n} 条请求`);

ok('C6 全程零 JS 异常', errs.length === 0, errs.slice(0, 2).join(' | '));

await p.keyboard.press('Escape').catch(() => {});
await p.screenshot({ path: OUT + 'online80_首屏.png' });
await ctx.close();
await browser.close();
console.log(`\n===== 第 80 轮线上复验：${pass}/${pass + fail} =====`);
process.exit(fail ? 1 : 0);
