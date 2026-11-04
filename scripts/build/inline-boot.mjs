/* scripts/build/inline-boot.mjs
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
const ROOT = path.resolve(__dirname, '..', '..');
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
  `  <!-- 首屏数据内联（scripts/build/inline-boot.mjs 生成，请勿手改）：\n` +
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

/* 第 93 轮：首屏第一张封面 → 在 <head> 里 preload。
   理由：LCP 元素就是榜单第一行的封面图，而它要等 app.js 执行完、DOM 插入后才开始
   下载（再多叠一个 RTT）。构建时就能知道第一名是谁（默认按终身时长降序）。

   ⚠️ **默认关闭** —— 实测过，收益不成立：
      本地 4G 限速三次中位 vs 不开 preload：
        LCP 1672 → 1432（快 240ms）
        FCP 1248 → 1432（**慢 184ms**）
        首行 1960 → 1874（快 86ms）
      原因是单连接下 preload 的图会抢在 style.css 前面下载，把「白屏结束」推后；
      而在 HTTP/2 多路复用下又验证不了（本地服务是 HTTP/1.1）。
      用「白屏多 184ms」换「主图早 240ms」，不划算，所以默认不启用。
      真要启用：把 ENABLE 改成 true（代码保留，逻辑是对的，只是本站不吃这个红利）。 */
const ENABLE_HERO_PRELOAD = false;
const HERO_START = '<!-- HERO_PRELOAD_START -->';
const HERO_END = '<!-- HERO_PRELOAD_END -->';
{
  // 先把旧的 preload 块清掉（关掉开关后也要能还原）
  let h0 = fs.readFileSync(HTML, 'utf8');
  if (h0.includes(HERO_START) && h0.includes(HERO_END)) {
    h0 = h0.replace(new RegExp(`\\s*${HERO_START}[\\s\\S]*?${HERO_END}`), '');
    fs.writeFileSync(HTML, h0, 'utf8');
  }
}
if (ENABLE_HERO_PRELOAD) {
  const top = Object.entries(meta.games_lifetime ?? {})
    .filter(([, g]) => (g.lifetime_minutes ?? 0) > 0)
    .sort((a, b) => (b[1].lifetime_minutes ?? 0) - (a[1].lifetime_minutes ?? 0))[0];
  if (top) {
    const appid = top[0];
    const block =
      `${HERO_START}\n` +
      `  <!-- 首屏第一张封面预加载（scripts/build/inline-boot.mjs 生成） -->\n` +
      `  <link rel="preload" as="image" href="img/covers/${appid}-320.webp"` +
      ` imagesrcset="img/covers/${appid}-320.webp 1x, img/covers/${appid}.webp 2x">\n` +
      `  ${HERO_END}`;
    let h2 = fs.readFileSync(HTML, 'utf8');
    const anchor = /(<link rel="preload" href="blackrose\.woff2"[^>]*>)/;
    if (!anchor.test(h2)) throw new Error('找不到字体 preload 作为插入锚点');
    h2 = h2.replace(anchor, `$1\n${block}`);
    fs.writeFileSync(HTML, h2, 'utf8');
    console.log(`[inline-boot] 已 preload 首图 ${appid}（${top[1].name}）`);
  }
}

const kb = (n) => (n / 1024).toFixed(1) + 'KB';
console.log(`[inline-boot] 已内联 meta(${kb(JSON.stringify(meta).length)}) + daily(${Object.keys(daily).join(',') || '无'}) → index.html`);
console.log(`[inline-boot] index.html 现在 ${kb(fs.statSync(HTML).size)}`);
