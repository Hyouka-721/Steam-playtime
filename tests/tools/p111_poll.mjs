/* p111_poll.mjs — 推送后轮询 Pages 是否已生效
   判据：index.html 同时引用 style.css?v=141 与 app.js?v=127，
        且 **两个文件的字节（CRLF→LF 归一）md5 都与本地一致**
   ⚠️ 只比 CSS 会漏判：某轮只改了 app.js（CSS 未 bump）时，旧页面的 CSS 本来就与本地相同，
      轮询会立刻报 READY，其实新脚本还没上。所以两件一起比。
   本机 hosts 把 github 域名指到 127.0.0.1 → 必须走 Playwright（--no-proxy-server）+ 页内 fetch
   用法：node tests/tools/p111_poll.mjs */
import { createRequire } from 'module';
import fs from 'fs';
import crypto from 'crypto';

const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const SITE = 'https://hyouka-721.github.io/Steam-playtime/';
const ROOT = 'C:/Users/33329/WorkBuddy/2026-10-13-18-17-49/steam-playtime/docs/';
const CSS_V = '141';
const APP_V = '127';
const md5 = (s) => crypto.createHash('md5').update(Buffer.from(String(s).replace(/\r\n/g, '\n'), 'utf8')).digest('hex');

const localCss = md5(fs.readFileSync(ROOT + 'style.css', 'utf8'));
const localApp = md5(fs.readFileSync(ROOT + 'app.js', 'utf8'));
console.log('本地 css', localCss.slice(0, 12), '| app', localApp.slice(0, 12), `| 判据 ${CSS_V}/${APP_V}`);

const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const ctx = await browser.newContext({ serviceWorkers: 'block' });
const p = await ctx.newPage();
await p.goto(SITE, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});

for (let i = 1; i <= 20; i++) {
  const r = await p.evaluate(async ({ site, cssV, appV }) => {
    const g = async (u) => { const res = await fetch(site + u, { cache: 'reload' }); return { s: res.status, t: await res.text() }; };
    const html = await g('index.html?cb=' + Date.now());
    const [css, app] = await Promise.all([g(`style.css?v=${cssV}`), g(`app.js?v=${appV}`)]);
    return {
      status: html.s,
      cssTag: (html.t.match(/style\.css\?v=\d+/) || [])[0],
      jsTag: (html.t.match(/app\.js\?v=\d+/) || [])[0],
      css: css.t, app: app.t,
      hxMinutes: /function hxMinutes\(/.test(app.t),
    };
  }, { site: SITE, cssV: CSS_V, appV: APP_V }).catch((e) => ({ err: e.message }));

  if (r.err) {
    console.log(`[${i}] err ${r.err}`);
  } else {
    const cssOk = md5(r.css) === localCss;
    const appOk = md5(r.app) === localApp;
    console.log(`[${i}] ${r.cssTag} ${r.jsTag} | css ${r.css.length}B ${cssOk ? '✓' : '✗'} | app ${r.app.length}B ${appOk ? '✓' : '✗'} | hxMinutes=${r.hxMinutes}`);
    if (r.cssTag === `style.css?v=${CSS_V}` && r.jsTag === `app.js?v=${APP_V}` && cssOk && appOk && r.hxMinutes) {
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
