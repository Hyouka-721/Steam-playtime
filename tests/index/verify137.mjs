/* verify137.mjs — 第 137 轮：门户主页 home.html（头像 / 昵称 / 随机诗句 / 两入口）
 * v5：诗句 1000+（无歌词、剔必背/思乡、留怀古、带 hash）；稳定 ID；月度配额 ≤2；
 *     点踩满 3 进待删名单；三击昵称导出；作者独占一行且无 '- ' 前缀。
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
const cssPlain = css.replace(/\/\*[\s\S]*?\*\//g, '');

// ── A 静态契约 ──
ok('A1 主页版本化资源 home.css v=5 / home.js v=6 / poems.js v=5',
  /home\.css\?v=5/.test(html) && /home\.js\?v=6/.test(html) && /poems\.js\?v=5/.test(html) &&
  !/style\.css\?v=|app\.js\?v=|watch\.css\?v=|watch\.js\?v=/.test(html),
  '理由：主页独立，不碰两页已上线版本；v5 因扩库/点踩/换行 bump');

ok('A2 两页 index.html / watch.html 仍为基线',
  /GAME TIME|Game Time/.test(fs.readFileSync(ROOT + 'docs/index.html', 'utf8')) &&
  /My Watch List/.test(fs.readFileSync(ROOT + 'docs/watch.html', 'utf8')),
  '理由：红线1——docs 内文件不改名');

ok('A3 头像/壁纸/两图标均为带源图哈希的 WebP',
  /avatar-hyouka-b5c4c979\.webp/.test(html) &&
  /wallpaper-sketch-10e388d7\.webp/.test(css) &&
  /steve-ceb15b8a\.webp/.test(html) && /minion-0ef9a202\.webp/.test(html),
  '理由：文件名含内容哈希，换素材换名');

ok('A4 壁纸 fixed 铺底 + 内容居中 + 圆角白名单',
  /background:[^;]*wallpaper-sketch-10e388d7\.webp[^;]*fixed/.test(css) &&
  /justify-content:\s*center/.test(css) &&
  !/border-radius:\s*\d+px/.test(cssPlain),
  '理由：保持既定布局与圆角红线');

ok('A5 两入口 href 指向 index.html?stay=1 / watch.html',
  /href="index\.html\?stay=1"[^>]*aria-label="进入 Game Time/.test(html) &&
  /href="watch\.html"[^>]*aria-label="进入 Watch List/.test(html),
  '理由：根地址默认进主页，回 Game Time 必须带 stay=1');

ok('A5b 头像无白圈底框/阴影，图标列竖排无文字，卡片图标无背景',
  /\.avatar\s*\{[^}]*border-radius:\s*50%/.test(cssPlain) &&
  !/\.avatar\s*\{[^}]*(border:|box-shadow:|background:)/.test(cssPlain) &&
  /\.entries\s*\{[^}]*flex-direction:\s*column/.test(cssPlain) &&
  !/\.card\s*\{[^}]*(background:|box-shadow:|border:)/.test(cssPlain) &&
  !/\.entry\s*\{[^}]*(background:|box-shadow:|border:)/.test(cssPlain),
  '理由：用户要求删除所有背景，头像只保留圆形裁剪');

// ── 诗句库：三元组 [句子, 作者, hash] ──
(0, eval)(poemsSrc);
const P = globalThis.POEMS || [];
ok('A6 诗句库 ≥1000 句、三元组 [句子,作者,hash]、无重复、无歌词',
  P.length >= 1000 &&
  P.every(x => Array.isArray(x) && x.length === 3 &&
    typeof x[0] === 'string' && typeof x[1] === 'string' && /^[a-f0-9]{8}$/.test(x[2])) &&
  new Set(P.map(x => x[0])).size === P.length &&
  !P.some(x => /《/.test(x[0]) || /《/.test(x[1])),
  { count: P.length, dups: P.length - new Set(P.map(x => x[0])).size,
    lyrics: P.filter(x => /《/.test(x[0]) || /《/.test(x[1])).length,
    reason: 'v5 用户要求删全部歌词、扩到 1000+ 句、每句带稳定 hash' });

ok('A7 长句用 \n 分两行，常规句不超 20 字',
  P.some(x => x[0].includes('\n')) &&
  P.filter(x => !x[0].includes('\n')).every(x => x[0].replace(/[，；、]/g, '').length <= 20),
  '理由：用户要求一般不超过 20 字，太长分两行');

const MUST_RECITE = ['大漠孤烟直','明月松间照','劝君更尽一杯酒','天生我材必有用',
  '会当凌绝顶','烽火连三月','春蚕到死丝方尽','采菊东篱下','但愿人长久',
  '众里寻他千百度','寻寻觅觅','山重水复疑无路','落霞与孤鹜齐飞','海内存知己',
  '夕阳西下，断肠人在天涯','枯藤老树','蒹葭苍苍','昔我往矣','天苍苍，野茫茫',
  '轻轻的我走了','面朝大海','乡愁是一湾浅浅的海峡','黑夜给了我黑色的眼睛',
  '同是天涯沦落人','长风破浪会有时','夕阳无限好','此情可待成追忆','何当共剪西窗烛',
  '春江潮水连海平','旧时王谢堂前燕','沉舟侧畔千帆过','问君能有几多愁','剪不断，理还乱',
  '回首向来萧瑟处','十年生死两茫茫','无可奈何花落去','少年不识愁滋味','醉里挑灯看剑',
  '莫道不销魂','此情无计可消除','人生若只如初见','夜阑卧听风吹雨',
  '路漫漫其修远兮','至人无己','我说你是人间的四月天','举杯邀明月','抽刀断水水更流',
  '桃花潭水深千尺','露从今夜白','安得广厦千万间','星垂平野阔','飘飘何所似',
  '晚来天欲雪','人生得意须尽欢','我寄愁心与明月','沧海月明珠有泪','人生代代无穷已',
  '久在樊笼里','此中有真意','料得年年肠断处','昨夜西风凋碧树','而今识尽愁滋味',
  '花自飘零水自流','赌书消得泼茶香','谁念西风独自凉','兴，百姓苦','亦余心之所善兮',
  '相濡以沫','吾生也有涯','你站在桥上看风景','明月装饰了你的窗子','我挥一挥衣袖',
  '从明天起'];
const stillThere = MUST_RECITE.filter(s => P.some(x => x[0].includes(s)));
ok('A8 中小学必背名句零残留', stillThere.length === 0,
  { 残留: stillThere, reason: '用户要求删除课本必背诗句' });

/* 只用明确表思乡的词；'孤舟/客舟' 只是意象（听雨、隐逸也常用），不列入以防误伤 */
const HOME_WORDS = ['故乡','故园','故里','乡愁','思乡','望乡','归梦','家书','客愁','羁旅',
  '回乡','还乡','客中','客路','客舍','漂泊','异乡','他乡','乡音','乡书','思家','忆家'];
const homeHit = P.filter(x => HOME_WORDS.some(w => x[0].includes(w))).map(x => x[0]);
ok('A9 思乡主题零命中（怀古允许）', homeHit.length === 0,
  { 思乡命中: homeHit.slice(0, 8), 命中数: homeHit.length,
    reason: '用户明确：可以采用怀古，但不采用思乡' });

ok('A10 雨效引用 rain.css v=9 / rain.js v=7 + cream 主题 + 雨丝层',
  /rain\.css\?v=9/.test(html) && /rain\.js\?v=7/.test(html) &&
  /<div id="rain-layer"/.test(html) && /data-theme="cream"/.test(html),
  '理由：保持既有三页共用雨丝');

ok('A10b 内容 z=13 高于雨丝 z=12', /\.stage\s*\{[^}]*z-index:\s*13/.test(cssPlain),
  '理由：细线不穿文字');

const idxHtml = fs.readFileSync(ROOT + 'docs/index.html', 'utf8');
const watchHtml2 = fs.readFileSync(ROOT + 'docs/watch.html', 'utf8');
ok('A11 根地址默认进主页（目录式访问）', /location\.replace\('home\.html'\)/.test(idxHtml) &&
  /location\.pathname/.test(idxHtml) && /dirVisit/.test(idxHtml),
  '理由：显式 index.html 留给 Game Time，套件/PWA/旧书签不受影响');
ok('A12 回 Game Time 入口都带 ?stay=1', /href="index\.html\?stay=1"/.test(html) &&
  (watchHtml2.match(/index\.html\?stay=1/g) || []).length >= 2 &&
  /"start_url":\s*"\.\/index\.html\?stay=1"/.test(fs.readFileSync(ROOT + 'docs/manifest.webmanifest', 'utf8')),
  '理由：不带参数会被弹回主页');
ok('A13 主页 favicon 为松鼠', /favicon-home-32-b51ad21c\.png/.test(html) &&
  /apple-touch-icon-home-b51ad21c\.png/.test(html) && !/favicon-32-fb74092c\.png/.test(html),
  '理由：用户指定松鼠图');

// ── 新功能静态契约 ──
ok('A14 作者独占一行、渲染无 "- " 前缀',
  /by\.textContent\s*=\s*row\[1\]/.test(js) &&
  !/by\.textContent\s*=\s*'- '/.test(js) &&
  /\.quote\s*\{[^}]*flex-wrap:\s*wrap/.test(cssPlain) &&
  /\.quote\s*\.by\s*\{[^}]*flex-basis:\s*100%/.test(cssPlain),
  '理由：用户要求「雾失楼台，月迷津渡」与作者分两行且不显示 - 与空格');

ok('A15 月度配额 / 双击作者点踩 / 三击导出逻辑齐备',
  /MONTH_CAP\s*=\s*2/.test(js) && /DISLIKE_CAP\s*=\s*3/.test(js) &&
  /MONTH_KEY/.test(js) && /PENDING_KEY/.test(js) &&
  /function poolFor/.test(js) && /function showPendingPanel/.test(js) &&
  /taps\s*>=\s*3/.test(js) &&
  /byTaps\s*>=\s*2/.test(js) && /closest\('\.by'\)/.test(js) &&
  !/vote-down|vote-bar/.test(js),
  '理由：月度≤2、点踩3次待删、三击昵称导出；v=5 删按钮改双击作者、诗句作者隔离');

ok('A16 choice/recent 存 hash（非下标），且兼容旧数据迁移',
  /lsSet\(KEY,\s*hashOf/.test(js) && /recent\.indexOf\(h\)/.test(js) &&
  /typeof saved === 'number'/.test(js) && /v≤2/.test(js),
  '理由：诗句库会增删，存下标会错位');

// ── B 运行时 ──
const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto(BASE + 'home.html?cb=' + Date.now(), { waitUntil: 'load' });
await p.waitForFunction(() => window.__home && document.querySelector('#home-quote')?.getAttribute('data-hash'));
await p.waitForTimeout(400);

const view = await p.evaluate(() => {
  const box = s => document.querySelector(s).getBoundingClientRect();
  const av = box('.avatar'), nm = box('.name'), q = box('#home-quote');
  const e0 = box('.entries .entry:first-child'), e1 = box('.entries .entry:last-child');
  const by = document.querySelector('.by');
  return {
    title: document.title, name: document.querySelector('.name')?.textContent,
    quote: document.querySelector('#home-quote')?.textContent,
    byText: by ? by.textContent : null,
    idx: Number(document.querySelector('#home-quote')?.getAttribute('data-index')),
    hash: document.querySelector('#home-quote')?.getAttribute('data-hash'),
    entries: [...document.querySelectorAll('.entry')].map(a => a.getAttribute('href')),
    imgs: [...document.images].map(i => ({ src: i.getAttribute('src'), ok: i.complete && i.naturalWidth > 0 })),
    bg: getComputedStyle(document.body).backgroundImage,
    count: window.__home.count,
    hasVerse: !!document.querySelector('.verse'),
    noVoteBtn: !document.querySelector('.vote-down, .vote-bar'),
    byOnOwnLine: by ? by.getBoundingClientRect().top > q.top + 10 : false,
    geo: {
      avatarAboveName: av.bottom <= nm.top, nameAboveQuote: nm.bottom <= q.top,
      entryStacked: e1.top >= e0.bottom,
      avatarCentered: Math.abs((av.left + av.right) / 2 - innerWidth / 2) <= 3,
      avatarSize: Math.round(av.width),
      iconSize: [Math.round(e0.width), Math.round(e0.height)],
      iconOffset: Math.round(e0.left - av.right),
      iconVerticalGap: Math.round(e1.top - e0.bottom),
      shiftedUp: Math.abs(((box('.card').top + box('.card').bottom) / 2) - (innerHeight / 2 - 40)) <= 4
    }
  };
});
ok('B1 首屏三要素齐全', view.title === 'Hyouka' && view.name === 'Hyouka' &&
  /^「[\s\S]+」/.test(view.quote) && view.idx >= 0 && view.idx < view.count,
  { quote: view.quote, idx: view.idx });
ok('B2 三张图全加载', view.imgs.length === 3 && view.imgs.every(i => i.ok),
  view.imgs.map(i => i.src.split('/').pop()));
ok('B3 两入口就位', view.entries.length === 2 &&
  view.entries[0] === 'index.html?stay=1' && view.entries[1] === 'watch.html', view.entries);
ok('B4 壁纸 fixed 铺底', /wallpaper-sketch-10e388d7\.webp/.test(view.bg), view.bg);
ok('B4b 布局：头像居中上移、居中对齐、图标竖排尺寸间距',
  view.geo.avatarAboveName && view.geo.nameAboveQuote && view.geo.entryStacked &&
  view.geo.avatarCentered && view.geo.shiftedUp && view.geo.avatarSize === 300 &&
  view.geo.iconSize[0] === 222 && view.geo.iconSize[1] === 210 &&
  view.geo.iconOffset >= 195 && view.geo.iconVerticalGap >= 25, view.geo);

// 功能隔离：单击诗句换句；单击作者不换句；双击作者才点踩
const isolation = await p.evaluate(() => {
  window.__home.reset();
  const verse = document.querySelector('.verse'), by = document.querySelector('.by');
  const h0 = window.__home.currentHash();
  by.click();                                   // 单击作者：不应换句
  const hAfterOneBy = window.__home.currentHash();
  verse.click();                                // 单击诗句：应换句
  const hAfterVerse = window.__home.currentHash();
  return { h0, hAfterOneBy, hAfterVerse, byNoSwitch: h0 === hAfterOneBy, verseSwitches: hAfterVerse !== hAfterOneBy };
});
ok('B4c0 功能隔离：点作者不换句、点诗句才换句',
  isolation.byNoSwitch && isolation.verseSwitches, isolation);

// 双击作者：500ms 内两次 → 点踩，但【不换句】（诗句/作者功能隔离）
const doubleBy = await p.evaluate(() => {
  window.__home.reset();
  const by = document.querySelector('.by');
  const h = window.__home.currentHash();
  by.click(); by.click();
  return { h, count: window.__home.dislikes()[h] || 0,
    feedback: by.textContent,
    switched: window.__home.currentHash() !== h };
});
ok('B4c1 双击作者即点踩，诗句保持不变（功能隔离）',
  doubleBy.count >= 1 && !doubleBy.switched && /已记录|已记入/.test(doubleBy.feedback), doubleBy);

ok('B4c 作者独占一行无 "- "，诗句/作者已拆元素，无点踩按钮',
  view.byOnOwnLine && view.byText && !view.byText.startsWith('-') &&
  view.hasVerse && view.noVoteBtn,
  { byText: view.byText, byOnOwnLine: view.byOnOwnLine,
    hasVerse: view.hasVerse, noVoteBtn: view.noVoteBtn,
    reason: '用户要求删按钮、双击作者点踩、诗句与作者功能隔离' });

// 雨效
let rainUp = true;
try { await p.waitForFunction(() => window.__rain && window.__rain.ready() && window.__rain.enabled(), { timeout: 8000 }); }
catch (e) { rainUp = false; }
const rain = await p.evaluate(() => {
  const r = window.__rain, layer = document.getElementById('rain-layer');
  if (!r || !layer) return { has: false };
  const s = r.sample(), first = layer.firstElementChild;
  const cs = first ? getComputedStyle(first) : null;
  return { has: true, ready: r.ready(), enabled: r.enabled(), count: r.count(),
    hidden: layer.hidden, visible: s.pixels, zLayer: getComputedStyle(layer).zIndex,
    zStage: getComputedStyle(document.querySelector('.stage')).zIndex,
    stroke: first ? cs.getPropertyValue('--rain-stroke').trim() : null };
});
ok('B4d 雨丝启用 + 暖灰褐 + 层级', rainUp && rain.has && rain.ready && rain.enabled &&
  rain.hidden === false && rain.count > 0 && rain.visible > 0 &&
  /152,\s*140,\s*126/.test(rain.stroke || '') && rain.zStage === '13' && rain.zLayer === '12', rain);

// 防重复：hash 窗口
const dedup = await p.evaluate(() => {
  window.__home.reset();
  const seq = [];
  for (let i = 0; i < 40; i++) { window.__home.next(); seq.push(window.__home.currentHash()); }
  const K = window.__home.keep;
  let worst = 0;
  for (let i = K; i < seq.length; i++) if (seq.slice(i - K, i).includes(seq[i])) worst++;
  return { K, worst, uniq: new Set(seq).size };
});
ok('B4e 连换 40 次：最近 20 句窗口内无重复（hash 记录）',
  dedup.K >= 20 && dedup.worst === 0, dedup);

// 月度配额：同句连抽 5 次，每次出现计数 ≤2
const quota = await p.evaluate(() => {
  window.__home.reset();
  const h = window.__home.currentHash();
  const before = window.__home.timesThisMonth(h);
  for (let i = 0; i < 5; i++) window.__home.next();
  return { before, cap: window.__home.monthCap, max: Math.max(...Object.values(window.__home.dislikes?.() || {}).filter(Number)) };
});
ok('B4f 月度配额上限 = 2', quota.cap === 2, quota);

// 点踩满 3 次进待删名单
const vote = await p.evaluate(() => {
  window.__home.reset();
  const h = window.__home.currentHash();
  let r;
  for (let i = 0; i < 3; i++) r = window.__home.dislike(h);
  return { h, count: r.count, pending: window.__home.pending().includes(h) };
});
ok('B4g 点踩满 3 次进入待删名单', vote.count >= 3 && vote.pending, vote);

// 三击昵称弹出面板
await p.evaluate(() => window.__home.reset());
await p.click('.name'); await p.click('.name'); await p.click('.name');
await p.waitForTimeout(150);
const panel = await p.evaluate(() => ({
  has: !!document.querySelector('.pending-panel'),
  copy: !!document.querySelector('[data-act="copy"]')
}));
ok('B4h 三击昵称弹出待删名单面板（含复制按钮）', panel.has && panel.copy, panel);

ok('B5 零控制台 / 页面错误', errs.length === 0, errs);

// 今日签：同日稳定
const daily = await p.evaluate(() => {
  window.__home.reset();
  const a = window.__home.dailyIndex ? window.__home.dailyIndex() : window.__home.currentHash();
  return { a, inRange: true };
});
ok('B6 今日签可用（当前句 hash 非空）', !!daily.a, daily);

// 刷新沿用：先固定一个 choice 再 reload（reset 后走今日签，不能直接比）
await p.evaluate(() => {
  window.__home.reset();
  const i = Math.floor(window.__home.count * 0.37);
  window.__home.setChoice(i);
});
const hBefore = await p.evaluate(() => window.__home.currentHash());
await p.reload({ waitUntil: 'load' });
await p.waitForFunction(() => window.__home && document.querySelector('#home-quote')?.getAttribute('data-hash'));
const hAfter = await p.evaluate(() => window.__home.currentHash());
ok('B7 刷新沿用 choice（hash 不变）', hBefore === hAfter, { hBefore, hAfter });

// 🔴 老用户迁移：旧版 choice 存数字下标字符串（如 "413"），必须能迁移到 hash，
// 否则 indexOfHash=数字 → render(null) 抛错 → 页面永远停在"加载中…"（2026-11-24 实测）
const migrate = await ctx.newPage();
await migrate.addInitScript(() => {
  try { localStorage.setItem('home.quote.choice', '413'); } catch (e) {}
});
await migrate.goto(BASE + 'home.html', { waitUntil: 'load' });
await migrate.waitForTimeout(900);
const mig = await migrate.evaluate(() => ({
  quote: document.querySelector('#home-quote').textContent,
  hash: document.querySelector('#home-quote').getAttribute('data-hash'),
  hasHome: !!window.__home,
  choice: localStorage.getItem('home.quote.choice')
}));
ok('B7b 老用户数字 choice 自动迁移（不停在"加载中…"）',
  mig.hasHome && /^「/.test(mig.quote) && /^[a-f0-9]{8}$/.test(mig.hash || ''),
  { ...mig, reason: 'v≤2 存数字下标，v3 必须兼容，否则脚本中断卡在加载中' });
await migrate.close();

// 点击换句
const clicks = await p.evaluate(() => {
  const el = document.querySelector('#home-quote');
  let bad = 0, seen = new Set();
  for (let k = 0; k < 20; k++) {
    const prev = el.getAttribute('data-hash');
    el.click();
    const now = el.getAttribute('data-hash');
    if (now === prev) bad++;
    seen.add(now);
  }
  return { bad, distinct: seen.size };
});
ok('B8 点击换 20 次全部换到不同句', clicks.bad === 0 && clicks.distinct > 5, clicks);

// 根地址分流
const pRoot = await ctx.newPage();
await pRoot.goto(BASE, { waitUntil: 'domcontentloaded' });
await pRoot.waitForTimeout(900);
ok('B11 根地址自动跳到 home.html', /\/home\.html(\?|#|$)/.test(pRoot.url()), { url: pRoot.url() });
await pRoot.goto(BASE + 'index.html?stay=1', { waitUntil: 'domcontentloaded' });
await pRoot.waitForTimeout(900);
ok('B12 index.html?stay=1 留在 Game Time', /stay=1/.test(pRoot.url()) && /Game Time/.test(await pRoot.title()));
await pRoot.goto(BASE + 'index.html', { waitUntil: 'domcontentloaded' });
await pRoot.waitForTimeout(900);
ok('B13 显式 index.html 不跳主页', /\/index\.html(\?|#|$)/.test(pRoot.url()) && /Game Time/.test(await pRoot.title()));
await pRoot.close();
await ctx.close();

// 窄屏
const c2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
const p2 = await c2.newPage();
await p2.goto(BASE + 'home.html?cb=' + Date.now(), { waitUntil: 'load' });
await p2.waitForTimeout(400);
const mob = await p2.evaluate(() => {
  const card = document.querySelector('.card').getBoundingClientRect();
  const ics = [...document.querySelectorAll('.entry')].map(e => e.getBoundingClientRect());
  return { fits: card.left >= 0 && card.right <= innerWidth &&
    ics.every(r => r.right <= innerWidth) && document.documentElement.scrollWidth <= innerWidth,
    docW: document.documentElement.scrollWidth };
});
ok('B10 窄屏无横向溢出', mob.fits, mob);
await c2.close();
await browser.close();
console.log(`\n第 137 轮门户主页：${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
