/* p111_poll.mjs — 2026-11-07 推送后轮询 Pages 是否已生效
   判据：index.html 引用 style.css?v=135，且 style.css 字节（CRLF→LF 归一）与本地一致
   本机 hosts 把 github 域名指到 127.0.0.1 → 必须走 Playwright（--no-proxy-server）+ 页内 fetch
   用法：node tests/tools/p111_poll.mjs */
import { createRequire } from 'module';
import fs from 'fs';
import crypto from 'crypto';

const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const SITE = 'https://hyouka-721.github.io/Steam-playtime/';
const ROOT = 'C:/Users/33329/WorkBuddy/2026-10-13-18-17-49/steam-playtime/docs/';
const md5 = (s) => crypto.createHash('md5').update(Buffer.from(String(s).replace(/\r\n/g, '\n'), 'utf8')).digest('hex');

const localCss = md5(fs.readFileSync(ROOT + 'style.css', 'utf8'));
console.log('本地 style.css md5', localCss.slice(0, 12), '| 期望 v=134');

const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const ctx = await browser.newContext({ serviceWorkers: 'block' });
const p = await ctx.newPage();
await p.goto(SITE, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});

for (let i = 1; i <= 20; i++) {
  const r = await p.evaluate(async ({ site }) => {
    const g = async (u) => { const res = await fetch(site + u, { cache: 'reload' }); return { s: res.status, t: await res.text() }; };
    const html = await g('index.html?cb=' + Date.now());
    const css = await g('style.css?v=135');
    return {
      status: html.s,
      cssTag: (html.t.match(/style\.css\?v=\d+/) || [])[0],
      jsTag: (html.t.match(/app\.js\?v=\d+/) || [])[0],
      css: css.t, cssLen: css.t.length,
      hasHover: /\.site-title:hover\s*\{[^}]*var\(--accent\)/.test(css.t),
    };
  }, { site: SITE }).catch((e) => ({ err: e.message }));

  if (r.err) {
    console.log(`[${i}] err ${r.err}`);
  } else {
    const ok = md5(r.css) === localCss;
    console.log(`[${i}] ${r.cssTag} ${r.jsTag} | css ${r.cssLen}B md5匹配=${ok} hover规则=${r.hasHover}`);
    if (r.cssTag === 'style.css?v=135' && ok && r.hasHover) {
      console.log('PAGES READY');
      await browser.close();
      process.exit(0);
    }
  }
  await new Promise((s) => setTimeout(s, 15000));
}
console.log('TIMEOUT 未在 20 次轮询内生效');
await browser.close();
process.exit(1);
