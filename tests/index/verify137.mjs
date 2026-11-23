/* verify137.mjs — 第 137 轮：门户主页 home.html（头像 / 昵称 / 随机诗句 / 两入口）
 * ① 独立文件、不碰两页版本号；② 诗句库 108 句、格式与署名规则；
 * ③ 三种取句（今日签稳定 / 点击换句避开当前 / 刷新沿用 choice）；
 * ④ 两入口指向 index/watch、图片全加载、壁纸 fixed、零控制台错误。
 * 用法：node tests/index/verify137.mjs（需先起 8895 服务） */
import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');
const ROOT = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const BASE = 'http://127.0.0.1:8895/';
let pass = 0, fail = 0;
const ok = (n, c, x) => {
  c ? (pass++, console.log('PASS ', n, x === undefined ? '' : '— ' + JSON.stringify(x)))
    : (fail++, console.log('FAIL ', n, '— ' + JSON.stringify(x)));
};

const html = fs.readFileSync(ROOT + 'docs/home.html', 'utf8');
const css = fs.readFileSync(ROOT + 'docs/home.css', 'utf8');
const js = fs.readFileSync(ROOT + 'docs/home.js', 'utf8');
const poemsSrc = fs.readFileSync(ROOT + 'docs/poems.js', 'utf8');

// ── A 静态契约 ──
ok('A1 主页挂自己的 v=1 资源，且未引用两页版本化资源',
  /home\.css\?v=1/.test(html) && /home\.js\?v=1/.test(html) && /poems\.js\?v=1/.test(html) &&
  !/style\.css\?v=|app\.js\?v=|watch\.css\?v=|watch\.js\?v=/.test(html),
  '理由：主页独立，bump 两页会误伤已上线版本');

ok('A2 两页 index.html / watch.html 一字未动（主页是纯新增）',
  /GAME TIME|Game Time/.test(fs.readFileSync(ROOT + 'docs/index.html', 'utf8')) &&
  /My Watch List/.test(fs.readFileSync(ROOT + 'docs/watch.html', 'utf8')),
  '理由：红线1——docs 内文件不改名、两页为已上线回归基线');

ok('A3 头像/壁纸/两图标均为带源图哈希的 WebP，文件名固定',
  /avatar-hyouka-b5c4c979\.webp/.test(html) &&
  /wallpaper-sketch-10e388d7\.webp/.test(css) &&
  /steve-ceb15b8a\.webp/.test(html) && /minion-0ef9a202\.webp/.test(html),
  '理由：文件名含内容哈希，换素材换名、不靠版本参数');

ok('A4 壁纸 fixed 铺底 + 内容居中（第三版改判）+ 圆角全部走 --r-*',
  /background:[^;]*wallpaper-sketch-10e388d7\.webp[^;]*fixed/.test(css) &&
  /justify-content:\s*center/.test(css) &&
  !/border-radius:\s*\d+px/.test(css.replace(/\/\*[\s\S]*?\*\//g, '')),
  '理由：用户要求删除所有背景框、头像放正中 → 由"卡片靠右"改判为"内容居中"；壁纸保留；圆角白名单见红线10');

ok('A5 两入口 href 精确指向 index.html / watch.html',
  /href="index\.html"[^>]*aria-label="进入 Game Time/.test(html) &&
  /href="watch\.html"[^>]*aria-label="进入 Watch List/.test(html),
  '理由：主页核心功能就是这两个跳转');

const cssPlain = css.replace(/\/\*[\s\S]*?\*\//g, '');
ok('A5b 头像无白圈底框/阴影/占位底色（用户要求"删除头像后的背景"）',
  /\.avatar\s*\{[^}]*border-radius:\s*50%/.test(cssPlain) &&
  !/\.avatar\s*\{[^}]*(border:|box-shadow:|background:)/.test(cssPlain) &&
  /<img class="avatar"/.test(html),
  '理由：头像只保留圆形裁剪，白边/阴影/底色全部去掉；第四版结构改 hero 容器，"profile 后紧跟 img"的形式判据随之放宽为"存在 avatar"');

ok('A5c 图标列竖排居中对齐、无 Game Time / 游戏时长等文字',
  /\.entries\s*\{[^}]*flex-direction:\s*column/.test(cssPlain) &&
  /\.entries\s*\{[^}]*align-items:\s*center/.test(cssPlain) &&
  !/Game Time<\/span>|游戏时长<\/small>|Watch List<\/span>|观影记录<\/small>/.test(html),
  '理由：史蒂夫在上、小黄人在下、居中对齐；入口图标旁不再写任何文字');

ok('A5d 删除所有背景：卡片白底与图标框底都去掉（壁纸保留）',
  !/\.card\s*\{[^}]*(background:|box-shadow:|border:)/.test(cssPlain) &&
  !/\.entry\s*\{[^}]*(background:|box-shadow:|border:)/.test(cssPlain) &&
  /body\s*\{[^}]*wallpaper-sketch-10e388d7\.webp/.test(cssPlain),
  '理由：用户要求"删除所有背景"——卡片/图标框无底色无阴影，壁纸继续铺底（用户二次确认保留）');

// 诗句库静态校验（在 node 沙箱里 eval，因 poems.js 是 IIFE 挂 globalThis）
(0, eval)(poemsSrc);
const P = globalThis.POEMS || [];
ok('A6 诗句库规模 ≥ 100 句、格式全为 [句子, 作者] 且无重复',
  P.length >= 100 && P.every(x => Array.isArray(x) && x.length === 2 &&
    typeof x[0] === 'string' && typeof x[1] === 'string') &&
  new Set(P.map(x => x[0])).size === P.length,
  { count: P.length, reason: '红线5——规模走实际数组、不写死快照数字；下界即可' });

const noAuthor = P.filter(x => x[1] === '');
const withAuthor = P.filter(x => x[1] !== '');
ok('A7 影视剧/游戏来源不署名、有传世作品的作者署名（含张舜民）',
  noAuthor.some(x => /遥远的事物/.test(x[0])) &&
  noAuthor.some(x => /谁也没有见过风/.test(x[0])) &&
  withAuthor.some(x => x[0] === '笙歌归院落，灯火下楼台' && x[1] === '白居易') &&
  withAuthor.some(x => x[0] === '回首夕阳红尽处，应是长安' && x[1] === '张舜民'),
  { noAuthor: noAuthor.length, reason: '用户口径：只有文学史上留名的作者署名' });

ok('A8 长句用 \\n 分两行，常规句不超 20 字（下界守卫）',
  P.some(x => x[0].includes('\n') && /谁也没有见过爱情/.test(x[0])) &&
  P.filter(x => !x[0].includes('\n')).every(x => x[0].replace(/[，；、]/g, '').length <= 20),
  '理由：用户要求"一般不超过20字，太长可分两行"');

ok('A9 渲染为「句子」- 作者、无作者省略；\\n 由 pre-line 换行',
  /'「' \+ row\[0\] \+ '」'/.test(js) &&
  /by\.textContent = '- ' \+ row\[1\]/.test(js) &&
  /if \(row\[1\]\)/.test(js) && /white-space:\s*pre-line/.test(css),
  '理由：用户指定签名格式（第九版：」紧接 -，- 后空格再接作者）');

// ── B 运行时 ──
const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto(BASE + 'home.html?cb=' + Date.now(), { waitUntil: 'load' });
await p.waitForFunction(() => window.__home && document.querySelector('#home-quote')?.getAttribute('data-index') !== null);
await p.waitForTimeout(400);

const view = await p.evaluate(() => ({
  title: document.title,
  name: document.querySelector('.name')?.textContent,
  quote: document.querySelector('#home-quote')?.textContent,
  idx: Number(document.querySelector('#home-quote')?.getAttribute('data-index')),
  entries: [...document.querySelectorAll('.entry')].map(a => ({
    href: a.getAttribute('href'), label: a.getAttribute('aria-label')
  })),
  imgs: [...document.images].map(i => ({ src: i.getAttribute('src'), ok: i.complete && i.naturalWidth > 0 })),
  bg: getComputedStyle(document.body).backgroundImage,
  count: window.__home.count,
  // 布局几何：头像 → 昵称 → 诗句自上而下；两图标竖排且水平对齐；头像无底框
  geo: (() => {
    const box = s => document.querySelector(s).getBoundingClientRect();
    const av = box('.avatar'), nm = box('.name'), q = box('#home-quote');
    const e0 = box('.entries .entry:first-child'), e1 = box('.entries .entry:last-child');
    const acs = getComputedStyle(document.querySelector('.avatar'));
    return {
      avatarAboveName: av.bottom <= nm.top,
      nameAboveQuote: nm.bottom <= q.top,
      entryStacked: e1.top >= e0.bottom,
      entryAligned: Math.abs(e0.left - e1.left) <= 1,
      avatarNoFrame: acs.borderTopWidth === '0px' && acs.boxShadow === 'none' &&
        acs.backgroundColor === 'rgba(0, 0, 0, 0)',
      entryTextEmpty: [...document.querySelectorAll('.entry')].every(a => a.textContent.trim() === ''),
      // 第九版：头像组整体左移 24px（中心比视口中线小 ~24）；卡片与图标无背景底
      avatarCentered: Math.abs((av.left + av.right) / 2 - (innerWidth / 2 - 24)) <= 3,
      groupAligned: (() => {
        const cx = s => { const r = document.querySelector(s).getBoundingClientRect(); return (r.left + r.right) / 2; };
        return Math.abs(cx('.avatar') - cx('.name')) <= 2 && Math.abs(cx('.name') - cx('#home-quote')) <= 2;
      })(),
      // 图标 222×210、离头像右缘 80、两图标间距 30
      avatarSize: Math.round(av.width),
      iconSize: [Math.round(e0.width), Math.round(e0.height)],
      iconRightOfAvatar: e0.left >= av.right,
      iconOffset: Math.round(e0.left - av.right),
      iconVerticalGap: Math.round(e1.top - e0.bottom),
      noBg: (() => {
        const card = getComputedStyle(document.querySelector('.card'));
        const entry = getComputedStyle(document.querySelector('.entry'));
        const transparent = s => s.backgroundColor === 'rgba(0, 0, 0, 0)' || s.backgroundColor === 'transparent';
        return transparent(card) && transparent(entry) && card.boxShadow === 'none' && entry.boxShadow === 'none';
      })()
    };
  })()
}));
ok('B1 页面标题 / 昵称 / 诗句都渲染出来',
  view.title === 'Hyouka' && view.name === 'Hyouka' &&
  /^「.+」(- .+)?$/.test(view.quote) && view.idx >= 0 && view.idx < view.count,
  { quote: view.quote, idx: view.idx, reason: '首屏三要素齐全（第九版格式：」后紧接 -，- 后空格）' });

ok('B2 三张图（头像/史蒂夫/小黄人）全部加载成功',
  view.imgs.length === 3 && view.imgs.every(i => i.ok),
  { imgs: view.imgs.map(i => i.src.split('/').pop()), reason: '缺图=线上 404 或文件名错' });

ok('B3 两个入口的 href 与可访问标签就位',
  view.entries.length === 2 &&
  view.entries[0].href === 'index.html' && view.entries[1].href === 'watch.html' &&
  /Game Time/.test(view.entries[0].label) && /Watch List/.test(view.entries[1].label),
  view.entries);

ok('B4 壁纸已作为 body 背景加载（fixed 铺底）',
  /wallpaper-sketch-10e388d7\.webp/.test(view.bg), view.bg);

ok('B4b 布局：头像组无底框且整体对齐、昵称诗句在下、两图标竖排无文字、卡片图标无背景',
  view.geo.avatarAboveName && view.geo.nameAboveQuote && view.geo.entryStacked &&
  view.geo.entryAligned && view.geo.avatarNoFrame && view.geo.entryTextEmpty &&
  view.geo.avatarCentered && view.geo.groupAligned && view.geo.noBg,
  { ...view.geo, reason: '第九版：头像组整体左移 24px（第八版 48→24 右移 24），三组中心仍对齐' });

ok('B4c 第九版：头像 300、图标 222×210、离头像 220px、图标间距 30',
  view.geo.avatarSize === 300 &&
  view.geo.iconSize[0] === 222 && view.geo.iconSize[1] === 210 &&
  view.geo.iconRightOfAvatar && view.geo.iconOffset >= 215 &&
  view.geo.iconVerticalGap >= 25,
  { avatarSize: view.geo.avatarSize, iconSize: view.geo.iconSize,
    iconOffset: view.geo.iconOffset, iconVerticalGap: view.geo.iconVerticalGap,
    reason: '用户要求两图标继续右移到离头像 220px（第八版≥195 的判据随需求收紧）' });

ok('B4d 已删除"点一下，换一句"提示、昵称与诗句间距用负边距再收紧',
  !/点一下，换一句/.test(html) && !/class="hint"/.test(html) &&
  /\.name\s*\{[^}]*margin:\s*0\s+0\s+-4px/.test(css.replace(/\/\*[\s\S]*?\*\//g, '')),
  '理由：用户要求删掉换句提示、昵称与诗句间距再收紧（0→-4px，有效间距 8-gap→4）');

ok('B4e 诗句格式：」与 - 紧贴、- 后空一格 →「句」- 作者',
  /by\.textContent\s*=\s*'- '\s*\+/.test(js) &&
  !/by\.textContent\s*=\s*' - '\s*\+/.test(js) &&
  /^「.+」- .+$/.test(view.quote),
  { quote: view.quote, reason: '用户要求」自带留白故其后不加空格、- 后加一个空格' });

ok('B5 零控制台 / 页面错误',
  errs.length === 0, errs);

// 今日签：清掉 choice → 同日两次取 index 相同，且与 __home.dailyIndex 一致
const daily = await p.evaluate(() => {
  window.__home.reset();
  const a = window.__home.dailyIndex();
  const b = window.__home.dailyIndex();
  return { a, b, stable: a === b, inRange: a >= 0 && a < window.__home.count };
});
ok('B6 今日签：按日期稳定取句（同日 hash 一致、范围合法）',
  daily.stable && daily.inRange, daily);

// 刷新沿用 choice（第一次随机方式）
await p.evaluate(() => window.__home.setChoice(3));
await p.reload({ waitUntil: 'load' });
await p.waitForFunction(() => window.__home && document.querySelector('#home-quote')?.getAttribute('data-index') !== null);
const kept = await p.evaluate(() => Number(document.querySelector('#home-quote').getAttribute('data-index')));
ok('B7 刷新沿用上次 choice（点过换一句后刷新保持该句）',
  kept === 3, { kept, reason: 'localStorage 记住用户选择' });

// 点击换一句：index 变化且避开当前；连续 20 次都不重复当前
const clicks = await p.evaluate(() => {
  const el = document.querySelector('#home-quote');
  let bad = 0, seen = new Set();
  const before = Number(el.getAttribute('data-index'));
  for (let k = 0; k < 20; k++) {
    const prev = Number(el.getAttribute('data-index'));
    el.click();
    const now = Number(el.getAttribute('data-index'));
    if (now === prev) bad++;
    seen.add(now);
  }
  return { before, bad, distinct: seen.size };
});
ok('B8 点击换一句：20 次全部换到不同句、覆盖多句',
  clicks.bad === 0 && clicks.distinct > 5, clicks);

// 无作者句：渲染文本里不出现 " - "
const noDash = await p.evaluate(() => {
  window.__home.setChoice(window.POEMS.findIndex(x => x[1] === ''));
  location.reload();
  return true;
});
await p.waitForFunction(() => window.__home && document.querySelector('#home-quote')?.getAttribute('data-index') !== null && window.__home.currentIndex() === window.POEMS.findIndex(x => x[1] === ''));
const dashText = await p.evaluate(() => document.querySelector('#home-quote').textContent);
ok('B9 无作者句只显示「句子」，不出现 "- 作者"',
  !dashText.includes('- '), { dashText, reason: '用户要求影视剧/游戏句不署名（第九版格式下无作者不含 "- "）' });

await ctx.close();

// 窄屏：卡片居中不溢出
const c2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
const p2 = await c2.newPage();
await p2.goto(BASE + 'home.html?cb=' + Date.now(), { waitUntil: 'load' });
await p2.waitForTimeout(400);
const mob = await p2.evaluate(() => {
  const card = document.querySelector('.card').getBoundingClientRect();
  const ics = [...document.querySelectorAll('.entry')].map(e => e.getBoundingClientRect());
  return { left: card.left, right: card.right, vw: innerWidth,
    docW: document.documentElement.scrollWidth,
    iconRight: Math.round(Math.max(...ics.map(r => r.right))),
    // 第四版图标绝对定位在头像右侧，可能越过卡片边界 —— 必须连图标一并检查
    fits: card.left >= 0 && card.right <= innerWidth &&
      ics.every(r => r.right <= innerWidth) &&
      document.documentElement.scrollWidth <= innerWidth };
});
ok('B10 窄屏无横向溢出（含绝对定位的图标；第四版收紧判据）', mob.fits, mob);
await c2.close();

await browser.close();
console.log(`\n第 137 轮门户主页：${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
