/* 第 85 轮上线后轮询 Pages：watch.html 是否已引用目标版本号，且 watch.css 字节与本地一致
   本机 hosts 把 github 域名指向 127.0.0.1 → 必须走 Playwright（--no-proxy-server）+ 页内 fetch
   用法：node tests/tools/p85_poll.mjs   （改 NEED_VER 可复用于后续轮次） */
import { createRequire } from 'module';
import fs from 'fs';
import crypto from 'crypto';
const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const NEED_VER = '23';
const SITE = 'https://hyouka-721.github.io/Steam-playtime/';
const ROOT = 'C:/Users/33329/WorkBuddy/2026-10-13-18-17-49/steam-playtime/docs/';
const md5 = (s) => crypto.createHash('md5').update(Buffer.from(String(s).replace(/\r\n/g, '\n'), 'utf8')).digest('hex');
const localCss = md5(fs.readFileSync(ROOT + 'watch.css', 'utf8'));
const VER_RE = new RegExp('watch\\.css\\?v=' + NEED_VER);
console.log('目标版本 = v' + NEED_VER + ' | 本地 watch.css md5 =', localCss.slice(0, 12));

const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const ctx = await browser.newContext({ serviceWorkers: 'block' });
const p = await ctx.newPage();
await p.goto(SITE, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});

for (let i = 1; i <= 20; i++) {
  const r = await p.evaluate(async ({ site, ver }) => {
    const g = async (u) => { const res = await fetch(site + u, { cache: 'reload' }); return { s: res.status, t: await res.text() }; };
    const html = await g('watch.html?cb=' + Date.now());
    const m = (html.t.match(/watch\.(?:css|js)\?v=(\d+)/g) || []).join(' ');
    const css = await g('watch.css?v=' + ver);
    return { status: html.s, ver: m, cssLen: css.t.length, css: css.t };
  }, { site: SITE, ver: NEED_VER }).catch((e) => ({ err: e.message }));

  if (r.err) { console.log(`[${i}] err ${r.err}`); }
  else {
    const hit = md5(r.css) === localCss;
    console.log(`[${i}] status=${r.status} ${r.ver} cssLen=${r.cssLen} md5匹配=${hit}`);
    if (VER_RE.test(r.ver) && hit) { console.log('PAGES READY'); await browser.close(); process.exit(0); }
  }
  await new Promise((s) => setTimeout(s, 15000));
}
console.log('TIMEOUT');
await browser.close();
process.exit(1);
