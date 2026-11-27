/* verify125.mjs — 第 125 轮：三态氛围（关 / 流星 / 雨滴）+ 两页同步
   用户要求：把「关/流星」与「雨滴」合并成一个控件；流星同步到 watch；
   切换页面时氛围保持不变；雨滴要盖过页眉（从最顶部开始）。
   契约：
     ① 两页都有 #ambience-seg 三个按钮（off / meteor / rain），旧 #fx-seg / #rain-toggle 删除；
     ② 状态只存 localStorage['ambience.mode']，两个引擎由 ambience.js 协调；
     ③ 雨丝 z=12 > 页眉 10；流星画布 z=20；watch 也有 #fx-canvas；
     ④ 三态互斥：rain → fx off + rain on；meteor → rain off + fx on；off → 全关；
     ⑤ 切换页面保持同一氛围（rain 在 watch 继续 rain）。
   用法：node tests/index/verify125.mjs（需先起 8895 静态服务） */
import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const ROOT = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const BASE = 'http://127.0.0.1:8895/';
let pass = 0, fail = 0;
const ok = (n, c, x) => {
  c ? (pass++, console.log('PASS ', n, x === undefined ? '' : '— ' + JSON.stringify(x)))
    : (fail++, console.log('FAIL ', n, '— ' + JSON.stringify(x)));
};

const idx = fs.readFileSync(ROOT + 'docs/index.html', 'utf8');
const wat = fs.readFileSync(ROOT + 'docs/watch.html', 'utf8');
const amb = fs.readFileSync(ROOT + 'docs/ambience.js', 'utf8');
const css = fs.readFileSync(ROOT + 'docs/rain.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

ok('A1 两页都有三态控件，旧 #fx-seg / #rain-toggle 已删除',
  [idx, wat].every((h) => /id="ambience-seg"/.test(h) &&
    /data-amb="off"/.test(h) && /data-amb="meteor"/.test(h) && /data-amb="rain"/.test(h)) &&
  !/id="fx-seg"/.test(idx + wat) && !/id="rain-toggle"/.test(idx + wat));
ok('A2 两页都引入 ambience.js；状态键 ambience.mode，统一调度两个引擎',
  /ambience\.js\?v=1/.test(idx) && /ambience\.js\?v=1/.test(wat) &&
  /ambience\.mode/.test(amb) && /window\.__fx\.toggle\(\)/.test(amb) && /window\.__rain\.set\(mode === 'rain'\)/.test(amb));
ok('A3 雨丝 z=12（> 页眉 10）、流星 z=20；watch 也有 #fx-canvas',
  /#rain-layer \{[\s\S]*?z-index: 12;/.test(css) && /#fx-canvas \{[\s\S]*?z-index: 20;/.test(css) &&
  /<canvas id="fx-canvas"/.test(wat));

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto(BASE + 'index.html?cb=' + Date.now(), { waitUntil: 'load' });
await page.evaluate(() => { localStorage.clear(); });
await page.reload({ waitUntil: 'load' });
// 第148轮：快照恢复会让 ambience.boot() 的 80ms 轮询略晚于 __rain.ready()，
// 等到默认 meteor 真正应用再断言；判据不变，只是不抢跑。
await page.waitForFunction(() => window.__ambience && window.__rain && window.__rain.ready() &&
  window.__ambience.mode() === 'meteor', null, { timeout: 20000 });

const st0 = await page.evaluate(() => ({
  amb: window.__ambience.mode(), fx: window.__fx.mode(), rain: window.__rain.enabled(),
  zRain: getComputedStyle(document.getElementById('rain-layer')).zIndex,
  zHead: getComputedStyle(document.querySelector('.site-header')).zIndex,
}));
ok('B1 默认「流星」：fx=meteor、rain=off；雨丝 z=12 > 页眉 z=10',
  st0.amb === 'meteor' && st0.fx === 'meteor' && st0.rain === false &&
  parseInt(st0.zRain, 10) > parseInt(st0.zHead, 10),
  st0);

await page.click('#ambience-seg button[data-amb="rain"]');
await page.waitForTimeout(300);
const r = await page.evaluate(() => ({
  amb: window.__ambience.mode(), fx: window.__fx.mode(), rain: window.__rain.enabled(),
  hidden: document.getElementById('rain-layer').hidden, ls: localStorage.getItem('ambience.mode'),
  pressed: document.querySelector('#ambience-seg button[data-amb="rain"]').getAttribute('aria-pressed'),
}));
ok('B2 选「雨滴」：fx 关、雨丝开、状态写 rain、按钮选中',
  r.amb === 'rain' && r.fx === 'off' && r.rain === true && r.hidden === false && r.ls === 'rain' && r.pressed === 'true', r);

await page.click('#ambience-seg button[data-amb="off"]');
await page.waitForTimeout(250);
const o = await page.evaluate(() => ({
  amb: window.__ambience.mode(), fx: window.__fx.mode(), rain: window.__rain.enabled(),
  hidden: document.getElementById('rain-layer').hidden, ls: localStorage.getItem('ambience.mode'),
}));
ok('B3 选「关」：两个引擎全关、状态写 off', o.amb === 'off' && o.fx === 'off' && o.rain === false && o.hidden === true && o.ls === 'off', o);

await page.click('#ambience-seg button[data-amb="meteor"]');
await page.waitForTimeout(300);
const m = await page.evaluate(() => ({
  amb: window.__ambience.mode(), fx: window.__fx.mode(), rain: window.__rain.enabled(),
  hidden: document.getElementById('rain-layer').hidden,
}));
ok('B4 选「流星」：流星开、雨丝关', m.amb === 'meteor' && m.fx === 'meteor' && m.rain === false && m.hidden === true, m);

// 跨页：index 选雨滴 → watch 仍是雨滴
await page.click('#ambience-seg button[data-amb="rain"]');
await page.waitForTimeout(250);
await page.goto(BASE + 'watch.html?cb=' + Date.now(), { waitUntil: 'load' });
await page.waitForFunction(() => window.__ambience && window.__rain && window.__rain.ready(), null, { timeout: 20000 });
await page.waitForFunction(() => window.__ambience.mode() === 'rain', null, { timeout: 5000 });
const w = await page.evaluate(() => ({
  amb: window.__ambience.mode(), fx: window.__fx.mode(), rain: window.__rain.enabled(),
  hidden: document.getElementById('rain-layer').hidden,
  zRain: getComputedStyle(document.getElementById('rain-layer')).zIndex,
  zHead: getComputedStyle(document.querySelector('.w-header')).zIndex,
  hasFx: !!document.getElementById('fx-canvas'),
}));
ok('B5 watch 保持「雨滴」：雨丝可见、盖过页眉、流星画布也在',
  w.amb === 'rain' && w.rain === true && w.hidden === false && w.fx === 'off' && w.hasFx &&
  parseInt(w.zRain, 10) > parseInt(w.zHead, 10), w);

await page.click('#ambience-seg button[data-amb="meteor"]');
await page.waitForTimeout(300);
const wm = await page.evaluate(() => ({
  amb: window.__ambience.mode(), fx: window.__fx.mode(), rain: window.__rain.enabled(),
  hidden: document.getElementById('rain-layer').hidden,
  cw: document.getElementById('fx-canvas').width,
}));
ok('B6 watch 切「流星」：fx 启动、雨丝关闭、画布有尺寸',
  wm.amb === 'meteor' && wm.fx === 'meteor' && wm.rain === false && wm.hidden === true && wm.cw > 0, wm);

await page.reload({ waitUntil: 'load' });
await page.waitForFunction(() => window.__ambience && window.__ambience.mode() === 'meteor', null, { timeout: 20000 });
ok('B7 刷新后保持「流星」', await page.evaluate(() => window.__fx.mode() === 'meteor' && window.__rain.enabled() === false));

const rmCtx = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
const rm = await rmCtx.newPage();
await rm.goto(BASE + 'index.html?cb=' + Date.now(), { waitUntil: 'load' });
await rm.waitForFunction(() => window.__ambience && window.__rain && window.__rain.ready(), null, { timeout: 20000 });
const rmSt = await rm.evaluate(() => ({
  amb: window.__ambience.mode(),
  disabled: [...document.querySelectorAll('#ambience-seg button')].map((b) => b.disabled),
}));
ok('B8 prefers-reduced-motion：强制关，流星/雨滴按钮禁用、只留「关」',
  rmSt.amb === 'off' && rmSt.disabled[0] === false && rmSt.disabled[1] === true && rmSt.disabled[2] === true, rmSt);
await rmCtx.close();

ok('C1 全程零 JS 异常', errs.length === 0, errs.slice(0, 3));
await browser.close();
console.log(`\n第 125 轮三态氛围：${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
