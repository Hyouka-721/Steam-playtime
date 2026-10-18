/* scripts/inline-boot.mjs
 * 2026-10-18 首屏优化：把首屏必需的数据（meta + 当月 daily）内联进 docs/index.html。
 *
 * 为什么：GitHub Pages 每个请求的 TTFB 要 320~580ms，而这份数据 gzip 后不到 5KB。
 * 与其让浏览器排队等 1~2 次往返，不如直接写进 HTML——DOM 解析完数据就到手了。
 *
 * 幂等：用固定标记块包裹，重复运行只会替换块内容，不会叠加。
 * 时效：块里带 generated_at，前端超过 36 小时就自动忽略、回退到 fetch，
 *       因此即使某天忘了跑构建，页面也不会展示过期数据。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DOCS = path.join(ROOT, 'docs');
const HTML = path.join(DOCS, 'index.html');

const START = '<!-- BOOT_DATA_START -->';
const END = '<!-- BOOT_DATA_END -->';

const meta = JSON.parse(fs.readFileSync(path.join(DOCS, 'data', 'meta.json'), 'utf8'));
const months = meta.months ?? [];

// 只内联最近一个月（当前只有 1 个）；其余保持按需拉取
const daily = {};
for (const m of months.slice(-1)) {
  const p = path.join(DOCS, 'data', 'daily', `${m}.json`);
  if (fs.existsSync(p)) daily[m] = JSON.parse(fs.readFileSync(p, 'utf8'));
}

const boot = { generated_at: meta.generated_at, meta, daily };
// 压缩 JSON：去掉换行与冗余空格（<script> 里不怕丑，省字节）
const payload = JSON.stringify(boot).replace(/<\//g, '<\\/');

const block =
  `${START}\n` +
  `  <!-- 首屏数据内联（scripts/inline-boot.mjs 生成，请勿手改）：\n` +
  `       meta + 当月 daily 合并为一份，省掉首屏 1~2 次请求往返。\n` +
  `       前端超过 36 小时会忽略它并回退到 fetch，不会展示过期数据。 -->\n` +
  `  <script>window.__BOOT=${payload};</script>\n` +
  `  ${END}`;

let html = fs.readFileSync(HTML, 'utf8');

if (html.includes(START) && html.includes(END)) {
  // 替换已有块（保留缩进无关，整块换掉）
  html = html.replace(new RegExp(`${START}[\\s\\S]*?${END}`), block);
} else {
  // 首次：插在 </head> 之前 —— 必须早于 app.js，且不阻塞首屏绘制
  html = html.replace('</head>', `${block}\n</head>`);
}

fs.writeFileSync(HTML, html, 'utf8');

const kb = (n) => (n / 1024).toFixed(1) + 'KB';
console.log(`[inline-boot] 已内联 meta(${kb(JSON.stringify(meta).length)}) + daily(${Object.keys(daily).join(',') || '无'}) → index.html`);
console.log(`[inline-boot] index.html 现在 ${kb(fs.statSync(HTML).size)}`);
