/* p102_poll.mjs — 第 102 轮推送后轮询 Pages 是否已生效
   判据：index.html 引用 style.css?v=130 / app.js?v=115，且两个文件字节（CRLF→LF 归一后）与本地一致
   本机 hosts 把 github 域名指到 127.0.0.1 → 必须走 Playwright（--no-proxy-server）+ 页内 fetch
   用法：node tests/tools/p102_poll.mjs */
import { createRequire } from 'module';
import fs from 'fs';
import crypto from 'crypto';

const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const SITE = 'https://hyouka-721.github.io/Steam-playtime/';
const ROOT = 'C:/Users/33329/WorkBuddy/2026-10-13-18-17-49/steam-playtime/docs/';
const md5 = (s) => crypto.createHash('md5').update(Buffer.from(String(s).replace(/\r\n/g, '\n'), 'utf8')).digest('hex');

const localCss = md5(fs.readFileSync(ROOT + 'style.css', 'utf8'));
const localJs = md5(fs.readFileSync(ROOT + 'app.js', 'utf8'));
console.log('本地 style.css md5', localCss.slice(0, 12), '| app.js md5', localJs.slice(0, 12));

const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const ctx = await browser.newContext({ serviceWorkers: 'block' });
const p = await ctx.newPage();
await p.goto(SITE, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});

for (let i = 1; i <= 20; i++) {
  const r = await p.evaluate(async ({ site }) => {
    const g = async (u) => { const res = await fetch(site + u, { cache: 'reload' }); return { s: res.status, t: await res.text() }; };
    const html = await g('index.html?cb=' + Date.now());
    const css = await g('style.css?v=130');
    const js = await g('app.js?v=115');
    return {
      status: html.s,
      cssTag: (html.t.match(/style\.css\?v=\d+/) || [])[0],
      jsTag: (html.t.match(/app\.js\?v=\d+/) || [])[0],
      css: css.t, js: js.t, cssLen: css.t.length, jsLen: js.t.length,
    };
  }, { site: SITE }).catch((e) => ({ err: e.message }));

  if (r.err) {
    console.log(`[${i}] err ${r.err}`);
  } else {
    const cssOk = md5(r.css) === localCss;
    const jsOk = md5(r.js) === localJs;
    console.log(`[${i}] ${r.cssTag} ${r.jsTag} | css ${r.cssLen}B 匹配=${cssOk} | js ${r.jsLen}B 匹配=${jsOk}`);
    if (r.cssTag === 'style.css?v=130' && r.jsTag === 'app.js?v=115' && cssOk && jsOk) {
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
