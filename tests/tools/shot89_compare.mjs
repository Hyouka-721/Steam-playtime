/**
 * 第 89 轮：评分角标 before / after 对照图（三张）
 *
 * 用法：node tests/tools/shot89_compare.mjs
 * 输入：%TEMP%/shots89badge/{before,after}-<片名>[-close|-hover].png（由 shot89_badge.mjs 生成）
 * 产出：00_对照.png   角标特写（放大 3×）× 两张最坏情况海报 × 改前/改后
 *       01_hover.png  冰菓：改后默认态 vs hover 态（B 段就是靠这两张对比才看得出）
 *       02_整卡.png   整张海报 1:1（用户实际看到的尺寸，判断"存在感"以这张为准）
 *
 * 用 HTML + Playwright 出图（不是 sharp 硬拼）：要写标签、要多列等高对齐，手算坐标容易错位。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const OUT = path.join(os.tmpdir(), 'shots89badge');
const uri = (f) => 'data:image/png;base64,' + fs.readFileSync(path.join(OUT, f)).toString('base64');

const HEAD = `<!doctype html><meta charset="utf-8"><style>
  body { margin:0; padding:20px; background:#15151a; color:#cfd3dc;
         font:13px/1.5 "Segoe UI","Microsoft YaHei",sans-serif; }
  h2 { margin:0 0 14px; font-size:14px; font-weight:600; color:#e8b04b; letter-spacing:.3px; }
  table { border-collapse:separate; border-spacing:14px 12px; }
  th { font-weight:600; font-size:12px; color:#9aa3b2; text-align:center; padding-bottom:6px; }
  th small { display:block; font-weight:400; opacity:.72; font-size:11px; margin-top:3px;
             font-family:ui-monospace,Consolas,monospace; }
  td { padding:0; vertical-align:top; }
  .name { font-size:12px; color:#9aa3b2; padding-right:8px; text-align:right; white-space:nowrap; }
  .name b { display:block; color:#dfe3ea; font-size:13px; }
</style>`;

const fig1 = `${HEAD}
<h2>① 角标特写（放大 3×，同一张海报同一位置）</h2>
<table>
  <tr><th></th>
    <th>改前（第 85 轮）<small>0.76 近黑底 + 1px 金描边 + 内高光 + 硬投影 · 13/700 · #e8b04b</small></th>
    <th>改后（第 89 轮 A+B）<small>::before 0.55 + blur(6px) 软晕，无描边无投影 · 12/600 · #dcb978 · hover 点亮</small></th></tr>
  ${[['情书', '深蓝夜景（中暗）'], ['冰菓', '粉白樱花 + 亮黄路面（最亮）']].map(([r, d]) => `<tr>
    <td class="name"><b>${r}</b>${d}</td>
    <td><img src="${uri(`before-${r}-close.png`)}" style="width:300px;border-radius:6px;display:block"></td>
    <td><img src="${uri(`after-${r}-close.png`)}" style="width:300px;border-radius:6px;display:block"></td>
  </tr>`).join('')}
</table>`;

const fig2 = `${HEAD}
<h2>② B 段：默认安静，鼠标停在卡片上才点亮（《冰菓》）</h2>
<table>
  <tr>
    <th>默认态<small>::before 0.55 / blur 6px · #dcb978 · 不抢注意力</small></th>
    <th>hover 态<small>::before 0.74 / blur 4px · var(--accent) · 回到原来的强度</small></th>
  </tr>
  <tr>
    <td><img src="${uri('after-冰菓-close.png')}" style="width:330px;border-radius:6px;display:block"></td>
    <td><img src="${uri('after-冰菓-hover.png')}" style="width:330px;border-radius:6px;display:block"></td>
  </tr>
</table>`;

const fig3 = `${HEAD}
<h2>③ 整张海报 1:1（用户实际看到的尺寸 —— 「存在感」以这张为准）</h2>
<table>
  <tr><th></th><th>改前</th><th>改后</th></tr>
  ${[['情书', '深蓝夜景'], ['冰菓', '粉白 + 亮黄']].map(([r, d]) => `<tr>
    <td class="name"><b>${r}</b>${d}</td>
    <td><img src="${uri(`before-${r}.png`)}" style="width:190px;border-radius:6px;display:block"></td>
    <td><img src="${uri(`after-${r}.png`)}" style="width:190px;border-radius:6px;display:block"></td>
  </tr>`).join('')}
</table>`;

const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const ctx = await browser.newContext({ viewport: { width: 1200, height: 1000 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
for (const [name, html] of [['00_对照.png', fig1], ['01_hover.png', fig2], ['02_整卡.png', fig3]]) {
  await page.setContent(html, { waitUntil: 'load' });
  await page.waitForTimeout(200);
  const b = await (await page.$('body')).boundingBox();
  await page.screenshot({
    path: path.join(OUT, name),
    clip: { x: b.x, y: b.y, width: Math.ceil(b.width), height: Math.ceil(b.height) },
  });
  console.log(name);
}
await browser.close();
console.log(OUT);
