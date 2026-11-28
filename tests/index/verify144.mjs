/* verify144.mjs — 第 144 轮：SW 导航必须绕过 index.html 的 HTTP 缓存
   用户反馈：第 143 轮已 push，但普通刷新后仍跑旧脚本、只显示 7 款。
   取证：线上 index.html/app.js/style.css 都已是新版本；GitHub Pages 给
   index.html 的 Cache-Control: max-age=600，而 SW 的导航分支用普通
   fetch(req)，会命中浏览器 HTTP 缓存 → 老用户 10 分钟内仍拿到旧 HTML。

   契约：
     ① sw.js 的 SHELL 缓存名 bump 到 v2，旧 shell 在 activate 时清掉；
     ② netFirst 接受 init 并把原样交给 fetch；
     ③ 导航分支传 { cache: 'reload' }，APP_DATA 分支仍不传（数据另有语义）；
     ④ 用 vm 注入假 fetch/caches，真实执行 sw.js 的 fetch 监听器，
        断言导航调用带 reload、数据调用不带；
     ⑤ 浏览器内 SW 接管后重载仍是 8 整行，且版本指向 v158/v135。
   用法：node tests/index/verify144.mjs */
import { createRequire } from 'module';
import fs from 'fs';
import vm from 'vm';

const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const ROOT = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const LOCAL = 'http://127.0.0.1:8895/index.html';
let pass = 0, fail = 0;
const ok = (n, c, x) => { c ? (pass++, console.log('PASS ', n, x === undefined ? '' : '— ' + JSON.stringify(x))) : (fail++, console.log('FAIL ', n, '— ' + JSON.stringify(x))); };

const sw = fs.readFileSync(ROOT + 'docs/sw.js', 'utf8');
const html = fs.readFileSync(ROOT + 'docs/index.html', 'utf8');

ok('A1 版本未动：style.css?v=159 / app.js?v=138（本轮只改 sw.js）',
  /style\.css\?v=159/.test(html) && /app\.js\?v=138/.test(html),
  '理由：第144轮只改 sw.js 缓存策略，css/js 一字节未动，按红线2不 bump');

ok('A2 SHELL 缓存名 bump 到 v2，旧 shell 会在 activate 清掉',
  /var SHELL = 'app-shell-v2';/.test(sw) &&
  /return \(k === CACHE \|\| k === DATA_CACHE \|\| k === SHELL \|\| k === APP_DATA\) \? null : caches\.delete\(k\)/.test(sw),
  '理由：导航策略变了，旧 app-shell-v1 里缓存的旧 HTML 必须随 activate 清掉');

ok('A3 netFirst 把 init 原样交给 fetch，导航分支传 reload',
  /function netFirst\(req, cacheName, init\) \{[\s\S]{0,120}return fetch\(req, init\)/.test(sw) &&
  /e\.respondWith\(netFirst\(req, SHELL, \{ cache: 'reload' \}\)\)/.test(sw) &&
  /e\.respondWith\(netFirst\(req, APP_DATA\)\)/.test(sw),
  '理由：只让导航绕开 HTTP 缓存；数据仍走原有网络优先语义，避免误改数据缓存');

/* ---- B 用 vm 真跑 sw.js 的 fetch 监听器 ---- */
const listeners = {};
const calls = [];
const cacheStore = {
  match: async () => null,
  put: async () => {},
};
const sandbox = {
  URL,
  Promise,
  console,
  self: {
    location: { origin: 'https://example.test' },
    addEventListener: (type, fn) => { listeners[type] = fn; },
    skipWaiting: () => {},
    clients: { claim: async () => {} },
  },
  caches: {
    keys: async () => ['app-shell-v1', 'app-shell-v2', 'watch-data-v1'],
    delete: async () => true,
    open: async () => cacheStore,
  },
  fetch: async (req, init) => {
    calls.push({ url: typeof req === 'string' ? req : req.url, init });
    return { ok: true, status: 200, clone() { return this; } };
  },
  Response: { error: () => new Error('network error') },
};
vm.createContext(sandbox);
vm.runInContext(sw, sandbox);

async function fireFetch(url, mode) {
  let p;
  listeners.fetch({ request: { method: 'GET', mode, url }, respondWith: (x) => { p = x; } });
  await p;
}

await fireFetch('https://example.test/Steam-playtime/index.html', 'navigate');
ok('B1 真实执行 fetch 监听器：导航 fetch 带 cache:reload',
  calls.length === 1 && calls[0].init && calls[0].init.cache === 'reload', calls);

calls.length = 0;
await fireFetch('https://example.test/Steam-playtime/data/meta.json', 'cors');
ok('B2 APP_DATA 分支仍走普通 fetch（不误伤数据缓存）',
  calls.length === 1 && calls[0].init === undefined, calls);

/* ---- C 浏览器冒烟：SW 接管后重载仍是 8 整行 ---- */
const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 958 } });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
await page.goto(LOCAL + '?t=' + Date.now(), { waitUntil: 'load' });
await page.waitForSelector('#lt-list .rank-item', { state: 'visible', timeout: 40000 });
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#lt-list .rank-item', { state: 'visible', timeout: 40000 });
await page.waitForTimeout(900);
const m = await page.evaluate(() => {
  const L = document.getElementById('lt-list');
  const items = [...L.querySelectorAll(':scope > .rank-item')];
  const vh = innerHeight;
  const r = (el) => el.getBoundingClientRect();
  return {
    sw: !!navigator.serviceWorker.controller,
    css: [...document.styleSheets].some((s) => (s.href || '').includes('style.css?v=159')),
    js: [...document.scripts].some((s) => (s.src || '').includes('app.js?v=138')),
    full: items.filter((el) => r(el).bottom <= vh + 0.5).length,
    partial: items.filter((el) => r(el).top < vh - 0.5 && r(el).bottom > vh + 0.5).length,
    varH: L.style.getPropertyValue('--rank-row-h'),
  };
});
ok('C1 SW 接管、新版本资源、刷新即 8 整行',
  m.sw && m.css && m.js && m.full === 8 && m.partial === 0 && m.varH === '66.6px', m);
ok('C2 零 JS 异常',
  errs.filter((s) => !/steamstatic|steamcdn|Failed to load resource/i.test(s)).length === 0, errs.slice(0, 3));

await ctx.close();
await browser.close();
console.log(`\n===== verify144  PASS=${pass} FAIL=${fail} =====`);
process.exit(fail ? 1 : 0);
