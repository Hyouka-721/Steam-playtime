/* verify145.mjs — 榜单末行稳定性（第 145 轮修透明，第 146 轮改为彻底不参与淡入）
   第 145 轮：第 8 行几何上落在视口内，却被统一 rootMargin 的 -8% 排除出
   IntersectionObserver，拿不到 .in → .rv 保持 opacity:0，看起来只有 7 款。
   第 146 轮：拆观察器后第 8 行能显示，但用户反馈刷新会闪一下——数据渲染后
   轮询 bind() 给新行挂 .rv（opacity:0），IO 再补 .in 淡入，肉眼就是闪烁。
   最终方案：.rank-item 完全不进 SEL，始终可见、零动画、零闪烁。

   契约：
     ① motion.js?v=3 两页同步，motion.css 未动不 bump；
     ② JS 源码（去注释后）选择器不含 rank-item，其它元素仍走 flat；
     ③ 1168×942 / 1920×958 刷新后 8 整行、第 8 行无 rv/flat、opacity=1；
     ④ reduced-motion 不回退；CLS 仍 0。
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
const js = fs.readFileSync(ROOT + 'docs/motion.js', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

ok('A1 motion.js?v=3 两页同步，motion.css 仍是 v1',
  /motion\.js\?v=3/.test(idx) && /motion\.js\?v=3/.test(wat) &&
  /motion\.css\?v=1/.test(idx) && /motion\.css\?v=1/.test(wat),
  '理由：第146轮只改 motion.js，按红线2单侧 bump，css 不动');

ok('A2 榜单行已退出错峰淡入选择器，其它元素仍保留 flat',
  /var SEL = '\.card, \.tl-item, \.st-panel';/.test(js) && !/rankNodes/.test(js) && /flat/.test(js),
  '理由：第145轮拆观察器仍会 .rv→.in 闪一下；第146轮让榜单行彻底不参与动画，始终可见');

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
  await page.waitForTimeout(1000);
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
      eighthBottom: eighth ? +r(eighth).bottom.toFixed(1) : null,
      eighthRv: eighth ? eighth.classList.contains('rv') : true,
      eighthFlat: eighth ? eighth.classList.contains('flat') : true,
      eighthOpacity: eighth ? getComputedStyle(eighth).opacity : null,
      allOpaque: items.every((el) => getComputedStyle(el).opacity === '1'),
      cls: +window.__cls.toFixed(4),
    };
  });
  return { ctx, m, errs };
}

for (const [w, h] of [[1168, 942], [1920, 958]]) {
  const s = await measure(w, h);
  ok(`B1 ${w}×${h}：8 整行、全榜无 rv/flat 且始终不透明（无闪烁）`,
    s.m.full === 8 && s.m.partial === 0 && !s.m.eighthRv && !s.m.eighthFlat &&
    s.m.eighthOpacity === '1' && s.m.allOpaque && s.m.cls < 0.01, s.m);
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
