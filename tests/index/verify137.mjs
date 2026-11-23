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
ok('A1 主页挂自己的版本化资源（home.css v=3 / home.js v=2 / poems.js v=3），不引用两页私有资源',
  /home\.css\?v=3/.test(html) && /home\.js\?v=2/.test(html) && /poems\.js\?v=3/.test(html) &&
  !/style\.css\?v=|app\.js\?v=|watch\.css\?v=|watch\.js\?v=/.test(html),
  '理由：主页独立，bump 两页会误伤已上线版本；home.css 加雨效层级、home.js 加防重复、poems.js 加歌词，各自 v=1→2');

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

ok('A5 两入口 href 指向 index.html?stay=1 / watch.html',
  /href="index\.html\?stay=1"[^>]*aria-label="进入 Game Time/.test(html) &&
  /href="watch\.html"[^>]*aria-label="进入 Watch List/.test(html),
  '理由：主页核心功能是这两个跳转；index 带 stay=1 以免被根地址跳转弹回主页');

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
/* v=3 删掉中小学必背篇目后规模降了一半，下界随之下调（红线5：写下界、不写快照） */
ok('A6 诗句库规模 ≥ 40 句、格式全为 [句子, 作者] 且无重复',
  P.length >= 40 && P.every(x => Array.isArray(x) && x.length === 2 &&
    typeof x[0] === 'string' && typeof x[1] === 'string') &&
  new Set(P.map(x => x[0])).size === P.length,
  { count: P.length, reason: 'v=3 剔除必背篇目后 50 句；规模走下界，不写死快照数字' });

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

ok('A10 主页复用两页共用雨效（rain.css v=9 / rain.js v=7、#rain-layer、cream 主题）',
  /rain.css\?v=9/.test(html) && /rain\.js\?v=7/.test(html) &&
  /<div id="rain-layer"/.test(html) &&
  /data-theme="cream"/.test(html),
  '理由：用户要求加入两站共有下雨特效；cream 让浅色壁纸上的雨丝走蓝灰描边');

ok('A10b 内容抬到雨丝层(z=12)之上，雨丝不穿文字',
  /\.stage\s*\{[^}]*z-index:\s*13/.test(css.replace(/\/\*[\s\S]*?\*\//g, '')),
  '理由：细线穿过诗句会干扰可读性');

// 根地址默认进主页：index.html 无 ?stay=1 时跳 home.html；主页/watch 回 Game Time 都带 stay=1
const idxHtml = fs.readFileSync(ROOT + 'docs/index.html', 'utf8');
const watchHtml2 = fs.readFileSync(ROOT + 'docs/watch.html', 'utf8');
ok('A11 根地址（目录式访问）默认进主页，显式 index.html 不跳',
  /location\.replace\('home\.html'\)/.test(idxHtml) &&
  /location\.pathname/.test(idxHtml) && /dirVisit/.test(idxHtml),
  '理由：只在 pathname 以 / 结尾时跳；显式 index.html 留给 Game Time，套件/PWA/旧书签不受影响');

ok('A12 回 Game Time 的入口都带 ?stay=1（主页史蒂夫 / watch 两处 / manifest start_url）',
  /href="index\.html\?stay=1"/.test(html) &&
  (watchHtml2.match(/index\.html\?stay=1/g) || []).length >= 2 &&
  /"start_url":\s*"\.\/index\.html\?stay=1"/.test(fs.readFileSync(ROOT + 'docs/manifest.webmanifest', 'utf8')),
  '理由：不带参数会被根地址跳转弹回主页，形成回不去的死循环');

ok('A13 主页 favicon 换成松鼠（不再引用站内手柄图标）',
  /favicon-home-32-b51ad21c\.png/.test(html) &&
  /apple-touch-icon-home-b51ad21c\.png/.test(html) &&
  !/favicon-32-fb74092c\.png/.test(html),
  '理由：用户指定松鼠图作门户图标');

const poemRows = [...fs.readFileSync(ROOT + 'docs/poems.js', 'utf8')
  .matchAll(/\['([^']*)',\s*'([^']*)'\]/g)]
  .map(m => [m[1].replace(/\\n/g, ''), m[2]]);
const lyricRows = poemRows.filter(r => /《.+》/.test(r[1]));
const poemDup = poemRows.length - new Set(poemRows.map(r => r[0])).size;
/* v=3：歌词必须成对（上句 + 下句），且不得再出现中小学必背篇目的名句 */
const lyricOneLiners = lyricRows.filter(r => !/[，；]/.test(r[0])).map(r => r[0]);
ok('A14 歌词 ≥15 句且全部成对（含逗号/分号），全库无重复',
  lyricRows.length >= 15 && lyricOneLiners.length === 0 && poemDup === 0,
  { total: poemRows.length, lyrics: lyricRows.length, dups: poemDup,
    oneLiners: lyricOneLiners, reason: '用户要求歌词至少两句，凑不成对的不收' });

const MUST_RECITE = ['大漠孤烟直', '明月松间照', '劝君更尽一杯酒', '天生我材必有用',
  '会当凌绝顶', '烽火连三月', '春蚕到死丝方尽', '采菊东篱下', '但愿人长久',
  '众里寻他千百度', '寻寻觅觅', '山重水复疑无路', '落霞与孤鹜齐飞', '海内存知己',
  '夕阳西下，断肠人在天涯', '枯藤老树', '蒹葭苍苍', '昔我往矣', '天苍苍，野茫茫',
  '轻轻的我走了', '面朝大海', '乡愁是一湾浅浅的海峡', '黑夜给了我黑色的眼睛',
  '同是天涯沦落人', '长风破浪会有时', '夕阳无限好', '此情可待成追忆', '何当共剪西窗烛',
  '春江潮水连海平', '旧时王谢堂前燕', '沉舟侧畔千帆过', '问君能有几多愁', '剪不断，理还乱',
  '回首向来萧瑟处', '十年生死两茫茫', '无可奈何花落去', '少年不识愁滋味', '醉里挑灯看剑',
  '莫道不销魂', '此情无计可消除', '人生若只如初见', '夜阑卧听风吹雨',
  '路漫漫其修远兮', '至人无己', '我说你是人间的四月天', '举杯邀明月', '抽刀断水水更流',
  '桃花潭水深千尺', '露从今夜白', '安得广厦千万间', '星垂平野阔', '飘飘何所似',
  '晚来天欲雪', '人生得意须尽欢', '我寄愁心与明月', '沧海月明珠有泪', '人生代代无穷已',
  '久在樊笼里', '此中有真意', '料得年年肠断处', '昨夜西风凋碧树', '而今识尽愁滋味',
  '花自飘零水自流', '赌书消得泼茶香', '谁念西风独自凉', '兴，百姓苦', '亦余心之所善兮',
  '相濡以沫', '吾生也有涯', '你站在桥上看风景', '明月装饰了你的窗子', '我挥一挥衣袖',
  '从明天起'];
const stillThere = MUST_RECITE.filter(s => poemRows.some(r => r[0].includes(s)));
ok('A16 中小学必背篇目的名句已全部剔除',
  stillThere.length === 0,
  {残留: stillThere, reason: '用户要求删除课本必背诗句' });

ok('A15 home.js 有近期不重复逻辑（recent 窗口 + 持久化 + 池外抽取）',
  /RECENT_KEY/.test(js) && /recent\.indexOf\(k\)\s*===\s*-1/.test(js) &&
  /function remember/.test(js),
  '理由：修用户反馈的"刷新撞见前几次出现过的"');

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
      // 第十一版：头像组回到水平正中（中心≈视口中线）；卡片与图标无背景底
      avatarCentered: Math.abs((av.left + av.right) / 2 - innerWidth / 2) <= 3,
      groupAligned: (() => {
        const cx = s => { const r = document.querySelector(s).getBoundingClientRect(); return (r.left + r.right) / 2; };
        return Math.abs(cx('.avatar') - cx('.name')) <= 2 && Math.abs(cx('.name') - cx('#home-quote')) <= 2;
      })(),
      // 第十版：整体上移 40px（card 中心高于视口中心约 40）
      shiftedUp: Math.abs(((document.querySelector('.card').getBoundingClientRect().top + document.querySelector('.card').getBoundingClientRect().bottom) / 2) - (innerHeight / 2 - 40)) <= 4,
      // 图标 222×210、离头像右缘 200、两图标间距 30
      avatarSize: Math.round(av.width),
      iconSize: [Math.round(e0.width), Math.round(e0.height)],
      iconRightOfAvatar: e0.left >= av.right,
      iconOffset: Math.round(e0.left - av.right),
      iconVerticalGap: Math.round(e1.top - e0.bottom),
      // 两图标整体下移：图标列中心比头像中心低约 --ic-down(48)
      iconDown: Math.round((e0.top + e1.bottom) / 2 - (av.top + av.bottom) / 2),
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
  /^「[\s\S]+」(- [\s\S]+)?$/.test(view.quote) && view.idx >= 0 && view.idx < view.count,
  { quote: view.quote, idx: view.idx, reason: '首屏三要素齐全（第九版格式：」后紧接 -，- 后空格）' });

ok('B2 三张图（头像/史蒂夫/小黄人）全部加载成功',
  view.imgs.length === 3 && view.imgs.every(i => i.ok),
  { imgs: view.imgs.map(i => i.src.split('/').pop()), reason: '缺图=线上 404 或文件名错' });

ok('B3 两个入口的 href 与可访问标签就位',
  view.entries.length === 2 &&
  view.entries[0].href === 'index.html?stay=1' && view.entries[1].href === 'watch.html' &&
  /Game Time/.test(view.entries[0].label) && /Watch List/.test(view.entries[1].label),
  view.entries);

ok('B4 壁纸已作为 body 背景加载（fixed 铺底）',
  /wallpaper-sketch-10e388d7\.webp/.test(view.bg), view.bg);

ok('B4b 布局：头像组无底框且整体对齐、昵称诗句在下、两图标竖排无文字、卡片图标无背景',
  view.geo.avatarAboveName && view.geo.nameAboveQuote && view.geo.entryStacked &&
  view.geo.entryAligned && view.geo.avatarNoFrame && view.geo.entryTextEmpty &&
  view.geo.avatarCentered && view.geo.groupAligned && view.geo.noBg &&
  view.geo.shiftedUp,
  { ...view.geo, reason: '第十一版：头像组回水平正中且整体上移 40px，三组中心仍对齐' });

ok('B4c 第十版：头像 300、图标 222×210、离头像 200px、图标间距 30',
  view.geo.avatarSize === 300 &&
  view.geo.iconSize[0] === 222 && view.geo.iconSize[1] === 210 &&
  view.geo.iconRightOfAvatar && view.geo.iconOffset >= 195 &&
  view.geo.iconVerticalGap >= 25,
  { avatarSize: view.geo.avatarSize, iconSize: view.geo.iconSize,
    iconOffset: view.geo.iconOffset, iconVerticalGap: view.geo.iconVerticalGap,
    reason: '用户要求两图标离头像改为 200px（第九版≥215 的判据随需求放宽）' });

ok('B4c2 第十一版：两图标整体下移（图标列中心低于头像中心约 48px）',
  view.geo.iconDown >= 40 && view.geo.iconDown <= 60,
  { iconDown: view.geo.iconDown, reason: '用户要求两图标整体下移' });

ok('B4d 已删除"点一下，换一句"提示、昵称与诗句间距为 -6px',
  !/点一下，换一句/.test(html) && !/class="hint"/.test(html) &&
  /\.name\s*\{[^}]*margin:\s*0\s+0\s+-6px/.test(css.replace(/\/\*[\s\S]*?\*\//g, '')),
  '理由：用户要求昵称与诗句边距回调到 -6px（-8→-6）');

const qfont = await p.evaluate(() => {
  const qEl = document.querySelector('#home-quote');
  const qs = getComputedStyle(qEl);
  const byEl = qEl.querySelector('.by');
  const byFam = byEl ? getComputedStyle(byEl).fontFamily : null;
  const byInherit = byEl ? getComputedStyle(byEl).fontFamily === qs.fontFamily : false;
  return { family: qs.fontFamily, size: parseFloat(qs.fontSize),
    byFamily: byFam, byInherit };
});
ok('B4f 第十二版：诗句用行楷/楷体字体（非宋体非无衬线），作者同字体',
  /Xingkai|STKaiti|KaiTi|Kaiti|楷/i.test(qfont.family) &&
  !/Songti|STSong|SimSun/i.test(qfont.family) &&
  qfont.size >= 21 && qfont.byInherit,
  { ...qfont, reason: '用户要求略带行楷、作者字体同步' });

// 雨效：等 rain.js 就绪并启用（async 引入 + 启动脚本轮询，最多等 8s）
let rainUp = true;
try {
  await p.waitForFunction(() => window.__rain && window.__rain.ready() && window.__rain.enabled(), { timeout: 8000 });
} catch (e) { rainUp = false; }
const rain = await p.evaluate(() => {
  const r = window.__rain, layer = document.getElementById('rain-layer');
  if (!r || !layer) return { has: false };
  const s = r.sample();
  const first = layer.firstElementChild;
  const cs = first ? getComputedStyle(first) : null;
  return {
    has: true, ready: r.ready(), enabled: r.enabled(), count: r.count(),
    hidden: layer.hidden, visible: s.pixels, total: s.total,
    zLayer: getComputedStyle(layer).zIndex,
    zStage: getComputedStyle(document.querySelector('.stage')).zIndex,
    stroke: first ? cs.getPropertyValue('--rain-stroke').trim() : null
  };
});
ok('B4g 主页雨丝已启用：__rain ready/enabled、layer 可见、有可见雨丝',
  rainUp && rain.has && rain.ready && rain.enabled && rain.hidden === false &&
  rain.count > 0 && rain.visible > 0,
  { ...rain, reason: '用户要求加入两站共有下雨特效' });

ok('B4h 内容层级高于雨丝（stage z=13 > rain-layer z=12）',
  rain.zStage === '13' && rain.zLayer === '12',
  { zStage: rain.zStage, zLayer: rain.zLayer, reason: '雨丝只作背景，不穿文字' });

ok('B4i cream 浅底雨丝用中性暖灰褐（v=9：不偏蓝、不发灰蓝）',
  /152,\s*140,\s*126/.test(rain.stroke || ''),
  { stroke: rain.stroke,
    reason: '用户否掉了冷白/蓝/灰蓝；v=9 改 rgba(152,140,126,.46) 并减半模糊，线条利落不发糊' });

// 防重复：清状态后连换 30 次，任意连续 12 次不得出现同一句
const dedup = await p.evaluate(() => {
  window.__home.reset();
  const seq = [];
  for (let i = 0; i < 30; i++) { window.__home.next(); seq.push(window.__home.currentIndex()); }
  const keep = window.__home.keep;
  let worst = 0;
  for (let i = keep; i < seq.length; i++) {
    if (seq.slice(i - keep, i).includes(seq[i])) worst++;
  }
  return { seq, keep, worst, recentLen: window.__home.recentIndices().length };
});
ok('B4j 连换 30 次：最近 KEEP 句窗口内无重复（防重复生效）',
  dedup.keep >= 10 && dedup.worst === 0,
  { keep: dedup.keep, worst: dedup.worst, recentLen: dedup.recentLen,
    seq: dedup.seq.slice(0, 8), reason: '修"刷新撞见前几次出现过的"' });

ok('B4e 诗句格式：」与 - 紧贴、- 后空一格 →「句」- 作者',
  /by\.textContent\s*=\s*'- '\s*\+/.test(js) &&
  !/by\.textContent\s*=\s*' - '\s*\+/.test(js) &&
  /^「[\s\S]+」- [\s\S]+$/.test(view.quote),
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

// 根地址分流：/ 应被 index.html 的内联脚本 replace 到 home.html；?stay=1 则留在 Game Time
const pRoot = await ctx.newPage();
await pRoot.goto(BASE, { waitUntil: 'domcontentloaded' });
await pRoot.waitForTimeout(900);
const rootUrl = pRoot.url();
ok('B11 根地址自动跳到 home.html', /\/home\.html(\?|#|$)/.test(rootUrl), { url: rootUrl });

await pRoot.goto(BASE + 'index.html?stay=1', { waitUntil: 'domcontentloaded' });
await pRoot.waitForTimeout(900);
const stayUrl = pRoot.url(), stayTitle = await pRoot.title();
ok('B12 index.html?stay=1 留在 Game Time（不再被弹回主页）',
  /stay=1/.test(stayUrl) && /Game Time/.test(stayTitle), { url: stayUrl, title: stayTitle });

// 关键：显式 index.html（无任何参数）也必须留在 Game Time —— 套件/PWA/旧书签都走这条
await pRoot.goto(BASE + 'index.html', { waitUntil: 'domcontentloaded' });
await pRoot.waitForTimeout(900);
const plainUrl = pRoot.url(), plainTitle = await pRoot.title();
ok('B13 显式访问 index.html（无参数）不跳主页，留在 Game Time',
  /\/index\.html(\?|#|$)/.test(plainUrl) && /Game Time/.test(plainTitle),
  { url: plainUrl, title: plainTitle, reason: '目录式访问才跳，显式点名本页即有意进入' });
await pRoot.close();

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
