/**
 * 第 87/88 轮（watch 侧）归档图：新图标（电影胶片，favicon 无底盘）在三类底色上的可读性 + 六档全集
 *
 * 说明：浏览器自带的标签条截不到（Playwright 只能截页面内容），
 * 所以这里用「真实素材 + 复刻的标签条底色」拼图，属于**模拟**而不是真机截图 —— 归档里如实标注。
 *
 * 第 88 轮改成 HTML + Playwright 出图（原来是 sharp 硬拼，没有文字标签，归档时看不懂哪行是哪档）；
 * 图标都内联成 data URI，不依赖本地服务，也不需要临时图片文件。
 *
 * 产出（%TEMP%/shots87icons/）：
 *   01_三底可读性.png   三行（深蓝标签条 / 影院黑 / 浅灰）× 三列（16·32·48，各放大 8 倍、最近邻不糊）
 *   02_六档全集.png     16·32·48·180·192·512 按 1:1 排一行（192/512 缩到 132 显示）
 *
 * 用法：node tests/tools/shot87_icons.mjs
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const IMG = 'C:/Users/33329/WorkBuddy/2026-10-13-18-17-49/steam-playtime/docs/img/';
const OUT = path.join(os.tmpdir(), 'shots87icons');
fs.mkdirSync(OUT, { recursive: true });

const srcName = fs.readdirSync(IMG).find((f) => /^(?:film|camera|projector)-[0-9a-f]{8}\.png$/.test(f)) || '';
const HASH = (srcName.match(/-([0-9a-f]{8})/) || [])[1] || '';
const N = (b) => b.replace(/\.png$/, '') + '-' + HASH + '.png';
const dataUri = (b) => 'data:image/png;base64,' + fs.readFileSync(IMG + N(b)).toString('base64');

const BGS = [
  ['深色标签条', '#0b2a45', '#cdd7e2'],
  ['影院黑', '#0b0b0e', '#9a9aa6'],
  ['浅色标签条', '#dee1e6', '#5b6472'],
];
const SIZES = [16, 32, 48];
const ZOOM = 8;

const html01 = `<!doctype html><meta charset="utf-8"><style>
  body { margin:0; padding:18px; background:#f4f4f6; font:12px/1.4 "Segoe UI","Microsoft YaHei",sans-serif; color:#3a3a44; }
  table { border-collapse:separate; border-spacing:8px; }
  th { font-weight:600; font-size:12px; color:#5b6472; padding:0 0 2px; }
  th.row { text-align:right; white-space:nowrap; padding-right:6px; }
  th.row small { display:block; font-weight:400; opacity:.75; font-family:ui-monospace,Consolas,monospace; }
  td { padding:0; }
  .strip { width:${48 * ZOOM + 24}px; height:${48 * ZOOM + 24}px; display:grid; place-items:center; border-radius:4px; }
  .strip img { image-rendering:pixelated; display:block; }
</style><table>
  <tr><th></th>${SIZES.map((s) => `<th>${s}px（放大 ${ZOOM}×）</th>`).join('')}</tr>
  ${BGS.map(([name, bg, fg]) => `<tr>
    <th class="row">${name}<small>${bg}</small></th>
    ${SIZES.map((s) => `<td><div class="strip" style="background:${bg}"><img src="${dataUri('favicon-watch-' + s + '.png')}" style="width:${s * ZOOM}px;height:${s * ZOOM}px"></div></td>`).join('')}
  </tr>`).join('')}
</table>`;

const SET = [
  ['favicon-watch-16.png', 16, '标签页 16'],
  ['favicon-watch-32.png', 32, '书签 32'],
  ['favicon-watch-48.png', 48, '高分屏 48'],
  ['apple-touch-icon-watch.png', 180, 'iOS 180'],
  ['icon-watch-192.png', 192, 'Android 192'],
  ['icon-watch-512.png', 512, 'Android 512'],
];
const BOX = 140;
const html02 = `<!doctype html><meta charset="utf-8"><style>
  body { margin:0; padding:18px; background:#0b2a45; font:12px/1.4 "Segoe UI","Microsoft YaHei",sans-serif; color:#cdd7e2; }
  .row { display:flex; gap:14px; }
  figure { margin:0; width:${BOX}px; text-align:center; }
  .cell { width:${BOX}px; height:${BOX}px; display:grid; place-items:center; background:rgba(255,255,255,.05); border-radius:6px; }
  .cell img { display:block; }
  figcaption { margin-top:6px; font-size:11px; opacity:.85; }
  figcaption b { display:block; font-weight:600; opacity:1; }
</style><div class="row">
  ${SET.map(([base, size, label]) => {
    const show = Math.min(size, BOX - 16);
    return `<figure><div class="cell"><img src="${dataUri(base)}" style="width:${show}px;height:${show}px"></div>
    <figcaption><b>${label}</b>${size === show ? size + ' px 1:1' : size + ' px → 缩至 ' + show}</figcaption></figure>`;
  }).join('')}
</div>`;

const browser = await chromium.launch({ args: ['--no-proxy-server'] });
/* ⚠️ 视口必须比整图高：`clip` 超出视口时 Chromium 只截到视口内，第三行会被整行切掉
   （第 88 轮实测 900 高只出两行，看着像「浅灰底不需要展示」） */
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1700 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const shots = [
  ['01_三底可读性.png', html01],
  ['02_六档全集.png', html02],
];
for (const [name, html] of shots) {
  await page.setContent(html, { waitUntil: 'load' });
  await page.waitForTimeout(150);
  /* 直接截 body 的盒子：body 自带 18px padding，盒子已含它，再叠 clip 就会留不对称白边 */
  const body = await (await page.$('body')).boundingBox();
  await page.screenshot({
    path: path.join(OUT, name),
    clip: { x: body.x, y: body.y, width: Math.ceil(body.width), height: Math.ceil(body.height) },
  });
  console.log(name);
}
await browser.close();
console.log('01_三底可读性.png（行＝三种底色；列＝16·32·48 各放大 8 倍，最近邻）');
console.log('02_六档全集.png（16 / 32 / 48 / 180 / 192 / 512；192、512 缩到 124 显示）');
console.log(OUT);
