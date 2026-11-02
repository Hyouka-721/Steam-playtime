#!/usr/bin/env node
/* ============================================================
   inline-css.mjs — 第 93 轮 P0：把 style.css 直接内联进 index.html
 *
   为什么：GitHub Pages 的 TTFB ≈400ms **与文件大小无关**，所以首屏多一个请求
   就多付 400ms。实测 4G 下 `style.css 650ms 到达 → 首绘 1416ms`，它是首绘的
   唯一闸门（FP == FCP 就是因为它）。
   内联后：HTML 一次到手，CSS 随解析就位，首屏不再有「等样式」的窗口。

   成本：HTML(gzip) 12.8KB → 约 42KB。4G 下多传约 210ms，但省掉一个 400ms 的
   RTT + 29.6KB 的独立传输，净赚约 300ms。二次访问不受影响（走 SW 的 HTML 缓存）。

   ⚠️ 关键设计：把 `style.css?v=NN` 写进 <style> 的注释里。
      这样 ① `bump90_index.mjs` 仍能照常替换版本号；② 十几处测试里
      `style.css?v=NN` 的断言**一条都不用改**；③ `sw.js` 的 warmup 正则要求
      前面是 `src=`/`href=`，注释里的不会被误当资源去预缓存。
   ⚠️ style.css 文件本身保留（它是构建源，也是版本号的真实载体）。

   幂等：用固定标记块包裹，重复运行只替换块内容。
   用法：node scripts/inline-css.mjs [--dry]
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DOCS = path.join(ROOT, 'docs');
const HTML = path.join(DOCS, 'index.html');
const CSS = path.join(DOCS, 'style.css');

const START = '<!-- INLINE_CSS_START -->';
const END = '<!-- INLINE_CSS_END -->';
const dry = process.argv.includes('--dry');

let html = fs.readFileSync(HTML, 'utf8');
const css = fs.readFileSync(CSS, 'utf8');

// 版本号从现有的 link 里取（不写死）；已经内联过就从注释里取
let v = (html.match(/<link rel="stylesheet" href="style\.css\?v=(\d+)">/) || [])[1];
if (!v) v = (html.match(/\/\* style\.css\?v=(\d+) /) || [])[1];
if (!v) throw new Error('找不到 style.css 版本号（link 与内联注释里都没有）');

const safeCss = css.replace(/<\/style/gi, '<\\/style');
const block =
  `${START}\n` +
  `<style>/* style.css?v=${v} —— 第 93 轮内联（scripts/inline-css.mjs 生成，请勿手改）\n` +
  `   省掉首屏一个关键 RTT（Pages 的 TTFB ≈400ms，与文件大小无关）。\n` +
  `   改样式请编辑 docs/style.css，然后跑 node scripts/build.mjs 重新内联。 */\n` +
  `${safeCss}\n</style>\n` +
  `${END}`;

if (html.includes(START) && html.includes(END)) {
  html = html.replace(new RegExp(`${START}[\\s\\S]*?${END}`), block);
  console.log(`[inline-css] 已更新内联块（v=${v}）`);
} else {
  const linkRe = new RegExp(`\\s*<link rel="stylesheet" href="style\\.css\\?v=${v}">\\s*`);
  if (!linkRe.test(html)) throw new Error('找不到 <link rel="stylesheet"> 那一行');
  html = html.replace(linkRe, `\n${block}\n`);
  console.log(`[inline-css] 首次内联（v=${v}），已移除 <link rel="stylesheet">`);
}

if (dry) {
  console.log('[inline-css] --dry，未写入');
} else {
  fs.writeFileSync(HTML, html, 'utf8');
  const kb = (fs.statSync(HTML).size / 1024).toFixed(1);
  console.log(`[inline-css] index.html 现在 ${kb}KB（内联 CSS ${(css.length / 1024).toFixed(1)}KB）`);
}
