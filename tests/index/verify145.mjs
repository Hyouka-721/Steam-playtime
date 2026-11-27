/* verify145.mjs — 第 145 轮：修复第 8 行被错峰淡入藏成透明
   用户实测：innerWidth 1168 / innerHeight 942 / varH 64.6px / firstTop 378.95，
   第 8 行底部 937.75 < 942，几何上完全可见；但只看到 7 款。
   根因：motion.js 的 IntersectionObserver 统一用 rootMargin:'0px 0px -8% 0px'，
   把视口底收掉 ~75px，第 8 行顶部 873.15 > 866.64，永不进入观察区 →
   拿不到 .in → .rv 保持 opacity:0。滚动后拿到 .in 才显形，正是用户描述的现象。

   契约：
     ① motion.js?v=2 两页都更新，motion.css 未动不 bump；
     ② JS 拆成两个观察器：榜单行 rootMargin 0，其它元素保留 -8%；
     ③ 1168×942 / 1920×958 刷新后第 8 行在视口内、拿到 .in、opacity=1；
     ④ 8 整行、0 半行、CLS 0；窄屏与 reduced-motion 不回退。
   用法：node tests/index/verify145.mjs */
import { createRequire } from 'module';
import fs from 'fs';

const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const ROOT = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const LOCAL = 'http://127.0.0.1:8895/index.html';
let pass = 0, fail = 0;
const ok = (n, c, x) => { c ? (pass++, console.log('PASS ', n, x === undefined ? '' : '— ' + JSON.stringify(x))) : (fail++, console.log('FAIL ', n, '— ' + JSON.stringify(x))); };

const idx = fs.readFileSync(ROOT + 'docs/index.html', 'utf8');
const wat = fs.readFileSync(ROOT + 'docs/watch.html', 'utf8');
const js = fs.readFileSync(ROOT + 'docs/motion.js', 'utf8');

ok('A1 motion.js?v=2 两页同步，motion.css 仍是 v1',
  /motion\.js\?v=2/.test(idx) && /motion\.js\?v=2/.test(wat) &&
  /motion\.css\?v=1/.test(idx) && /motion\.css\?v=1/.test(wat),
  '理由：第145轮只改 motion.js，按红线2单侧 bump，css 不动');

ok('A2 榜单行观察器底边不内收，其它元素保留 -8%',
  /observe\(rankNodes, '0px 0px 0px 0px'\)/.test(js) &&
  /observe\(otherNodes, '0px 0px -8% 0px'\)/.test(js) &&
  /\(el\.classList\.contains\('rank-item'\) \? rankNodes : otherNodes\)\.push\(el\)/.test(js),
  '理由：fitRankRows 给第 8 行只留 4px 底边，任何负 bottom margin 都会把它排除在观察区外');

const browser = await chromium.launch({ args: ['--no-proxy-server'] });

async function measure(w, h, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: opts.reduce ? 'reduce' : 'no-preference' });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    window.__cls = 0;
    try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true }); } catch (e) {}
  });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(LOCAL + '?t=' + Date.now(), { waitUntil: 'load' });
  await page.waitForSelector('#lt-list .rank-item', { state: 'visible', timeout: 40000 });
  await page.waitForTimeout(1200);
  const m = await page.evaluate(() => {
    const L = document.getElementById('lt-list');
    const items = [...L.querySelectorAll(':scope > .rank-item')];
    const vh = innerHeight;
    const r = (el) => el.getBoundingClientRect();
    const eighth = items[7];
    return {
      vh, total: items.length,
      full: items.filter((el) => r(el).bottom <= vh + 0.5).length,
      partial: items.filter((el) => r(el).top < vh - 0.5 && r(el).bottom > vh + 0.5).length,
      varH: L.style.getPropertyValue('--rank-row-h') || '',
      eighthTop: eighth ? +r(eighth).top.toFixed(1) : null,
      eighthBottom: eighth ? +r(eighth).bottom.toFixed(1) : null,
      eighthIn: eighth ? eighth.classList.contains('in') : false,
      eighthOpacity: eighth ? getComputedStyle(eighth).opacity : null,
      cls: +window.__cls.toFixed(4),
    };
  });
  return { ctx, m, errs };
}

for (const [w, h] of [[1168, 942], [1920, 958]]) {
  const s = await measure(w, h);
  ok(`B1 ${w}×${h}：8 整行、第 8 行拿到 .in 且 opacity=1`,
    s.m.full === 8 && s.m.partial === 0 && s.m.eighthIn && s.m.eighthOpacity === '1' && s.m.cls < 0.01, s.m);
  ok(`B2 ${w}×${h}：第 8 行确实落在视口内`,
    s.m.eighthBottom !== null && s.m.eighthBottom <= s.m.vh + 0.5 && s.m.varH !== '', s.m);
  await s.ctx.close();
}

const rm = await measure(1440, 900, { reduce: true });
ok('B3 reduced-motion 下仍 8 整行、第 8 行可见',
  rm.m.full === 8 && rm.m.eighthOpacity === '1', rm.m);
await rm.ctx.close();

console.log(`\n===== verify145  PASS=${pass} FAIL=${fail} =====`);
await browser.close();
process.exit(fail ? 1 : 0);
