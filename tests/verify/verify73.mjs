/* 第 73 轮回归：
   ① 影视类别新增「番剧」（动画剧集）：筛选条四档、录入/编辑表单、kind 标签映射全链路
   ② 《她和她的猫》换海报（p2249039182.jpg → item-b73c9fed.webp，537×800，hash 命名自洽）
   ③ 既有条目按用户确认范围重分类：仅日本动画 → 番剧（上线合并时共 34 部，
      含用户随后用网页加号新录的某科学的超电磁炮/T、埃罗芒阿老师、异度侵入、神之塔）；
      国漫（雾山五行/大理寺日志）与欧美动画（双城之战/变形金刚）留「剧集」，动画电影留「电影」
   ④ 顺带修两处客观错分：半泽直树（TBS 日剧）、洛基（Disney+ 剧集）movie → series
   ⚠️ 条数相关断言全部从数据推导（用户会持续用网页加号加片），只对「必须是/必须不是番剧」的清单做强断言
   ⚠️ B1 的 rating 期望 7.5 = 用户在网页端改过的值（合并窗口期编辑，须保留用户改动，不回退 8） */
import { createRequire } from 'module';
import fs from 'fs';
import crypto from 'crypto';
const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const BASE = process.env.BASE || 'http://127.0.0.1:8895/';
const ROOT = 'C:/Users/33329/WorkBuddy/2026-10-13-18-17-49/steam-playtime/docs/';
const OUT = 'C:/Users/33329/AppData/Local/Temp/fx_verify_20261018/shots73/';
fs.mkdirSync(OUT, { recursive: true });

const rd = (f) => fs.readFileSync(ROOT + f, 'utf8').replace(/\r\n/g, '\n');
const html = rd('watch.html');
const js = rd('watch.js');
const addJs = rd('../scripts/watch-add.mjs');
const data = JSON.parse(fs.readFileSync(ROOT + 'data/watch.json', 'utf8'));
const N = data.items.length;

let pass = 0, fail = 0;
const ok = (n, c, extra = '') => { c ? (pass++, console.log(`PASS ${n}${extra ? '  — ' + extra : ''}`)) : (fail++, console.log(`FAIL ${n}  — ${extra}`)); };

function sortKey(d) {
  const m = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/.exec(String(d || '').trim());
  if (!m) return '0000-00-00';
  return m[1] + '-' + (m[2] || '00') + '-' + (m[3] || '00');
}
function stampKey(s) { const t = Date.parse(String(s || '')); return Number.isNaN(t) ? 0 : t; }
function cmpTime(a, b) {
  const d = sortKey(b.watched_at).localeCompare(sortKey(a.watched_at));
  if (d !== 0) return d;
  const s = stampKey(a.added_at) - stampKey(b.added_at);
  if (s !== 0) return s;
  return String(a.id || '').localeCompare(String(b.id || ''));
}

/* ================= A 静态：番剧类别全链路 ================= */
console.log('== A 静态 ==');
ok('A1 筛选条四档：全部 / 电影 / 剧集 / 番剧（data-kind=anime）',
  /data-kind="all"[^>]*aria-pressed="true">全部/.test(html) &&
  /data-kind="movie"[^>]*aria-pressed="false">电影/.test(html) &&
  /data-kind="series"[^>]*aria-pressed="false">剧集/.test(html) &&
  /data-kind="anime"[^>]*aria-pressed="false">番剧/.test(html));
ok('A2 录入/编辑表单类型选择器有「番剧」选项',
  /<select class="w-input" id="add-kind">[\s\S]*?<option value="movie">电影<\/option>[\s\S]*?<option value="series">剧集<\/option>[\s\S]*?<option value="anime">番剧<\/option>[\s\S]*?<\/select>/.test(html));
ok('A3 watch.js：kindLabel 映射 anime → 番剧',
  /function kindLabel\(k\) \{\s*return k === 'series' \? '剧集' : k === 'anime' \? '番剧' : '电影';/.test(js));
ok('A4 watch.js：setKind 接受 anime（否则回落 all）',
  /kind = \(next === 'movie' \|\| next === 'series' \|\| next === 'anime'\) \? next : 'all';/.test(js));
ok('A5 watch.js：新增录入解析 anime', /kindEl\.value === 'anime'/.test(js));
ok('A6 watch.js：编辑保存解析 anime', /kind = \(kind === 'series' \|\| kind === 'anime'\) \? kind : 'movie';/.test(js));
ok('A7 watch.js：编辑回填 anime（select 预置）',
  /setField\('add-kind', \(it\.kind === 'series' \|\| it\.kind === 'anime'\) \? it\.kind : 'movie'\)/.test(js));
ok('A8 scripts/watch-add.mjs：--kind 接受 anime', /args\.kind === 'series' \|\| args\.kind === 'anime'/.test(addJs));
ok('A9 版本号 bump：watch.css?v=16 / watch.js?v=10',
  /watch\.css\?v=16"/.test(html) && /watch\.js\?v=10"/.test(html));

/* ================= B 数据：海报 + 重分类 ================= */
console.log('\n== B 数据 ==');
ok('B1 《她和她的猫》：kind=anime、id 不变、added_at 保留首录时间',
  (() => {
    const it = data.items.find((x) => x.title === '她和她的猫');
    return !!it && it.kind === 'anime' && it.id === '2020-07-17-item' &&
      it.added_at === '2026-10-25T14:27:13+08:00' &&
      it.watched_at === '2020-07-17' && it.year === 1999 && it.rating === 7.5 &&
      it.title_en === '彼女と彼女の猫' && it.note === '猫和遥远星星的声音';
  })(),
  (() => { const it = data.items.find((x) => x.title === '她和她的猫'); return it && `${it.id} ${it.kind} ${it.added_at} r=${it.rating}`; })());
ok('B2 《她和她的猫》海报换成 item-b73c9fed.webp：文件在、hash 自洽、537×800',
  (() => {
    const it = data.items.find((x) => x.title === '她和她的猫');
    if (!it || it.poster !== 'img/watch/item-b73c9fed.webp') return false;
    if (!fs.existsSync(ROOT + it.poster)) return false;
    const buf = fs.readFileSync(ROOT + it.poster);
    const h = crypto.createHash('sha256').update(buf).digest('hex').slice(0, 8);
    // 源图 537×800（<640 只缩不放）→ WebP 后应保持 537×800
    return h === 'b73c9fed' && it.poster_w === 537 && it.poster_h === 800;
  })(),
  (() => { const it = data.items.find((x) => x.title === '她和她的猫'); return it && `${it.poster} ${it.poster_w}×${it.poster_h}`; })());
ok('B3 旧海报 item-58c40d47.webp 已删除（无死链）',
  !fs.existsSync(ROOT + 'img/watch/item-58c40d47.webp') &&
  !data.items.some((x) => String(x.poster || '').includes('58c40d47')));
ok('B4 海报库无孤儿：每个 img/watch/*.webp 都被恰好一条引用',
  (() => {
    const dir = ROOT + 'img/watch/';
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.webp'));
    const used = data.items.map((x) => String(x.poster || '').replace('img/watch/', ''));
    const orphan = files.filter((f) => !used.includes(f));
    const missing = used.filter((u) => !files.includes(u));
    return orphan.length === 0 && missing.length === 0 && used.length === new Set(used).size;
  })(),
  (() => {
    const dir = ROOT + 'img/watch/';
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.webp'));
    return `${files.length} 个海报文件 / ${data.items.length} 条记录`;
  })());

const anime = data.items.filter((x) => x.kind === 'anime').map((x) => x.title);
const series = data.items.filter((x) => x.kind === 'series').map((x) => x.title);
const movie = data.items.filter((x) => (x.kind || 'movie') === 'movie').map((x) => x.title);
ok('B5 kind 三值齐全、总数自洽（anime ≥ 34，movie/series 非空）',
  anime.length >= 34 && series.length > 0 && movie.length > 0 &&
  anime.length + series.length + movie.length === N,
  `anime=${anime.length} series=${series.length} movie=${movie.length} 总=${N}`);
const EXPECT_ANIME = ['冰菓', '青春猪头少年不会梦到兔女郎学姐', '徒然喜欢你', '辉夜大小姐想让我告白',
  '工作细胞', '中二病也要谈恋爱！', '她和她的猫', '欢迎来到实力至上主义教室', '轻音少女',
  '境界的彼方', '在下坂本，有何贵干？', '末日三问', '小林家的龙女仆', '魔女之旅',
  '工作细胞2', '玉子市场', '工作细胞BLACK', '咒术回战', '总之就是非常可爱',
  '多罗罗', '冰海战记', '在魔王城说晚安', '重启咲良田', 'Re：从零开始的异世界生活',
  '奇巧出租车', '鬼灭之刃：游郭篇', '新世纪福音战士', '游戏人生', '赛博朋克：边缘行者',
  // 第 73 轮上线合并后新增的日本动画剧集（用户网页加号录入，默认落成 movie/series）
  '某科学的超电磁炮', '某科学的超电磁炮T', '埃罗芒阿老师', '异度侵入', '神之塔'];
ok('B6 清单内 34 部日本动画全是番剧（一部不差；用户后续新录的番剧不在清单内也允许）',
  EXPECT_ANIME.every((t) => anime.includes(t)) && anime.length >= EXPECT_ANIME.length,
  `缺：${EXPECT_ANIME.filter((t) => !anime.includes(t)).join('、') || '无'}`);
ok('B7 国漫与欧美动画按确认范围留在「剧集」',
  ['雾山五行', '大理寺日志', '英雄联盟：双城之战', '变形金刚 领袖之证'].every((t) => series.includes(t)),
  series.join('、'));
ok('B8 动画电影留在「电影」（玉子爱情故事 / 铃芽之旅 / 风之谷 / 紫罗兰永恒花园外传：永远与自动手记人偶）',
  ['玉子爱情故事', '铃芽之旅', '风之谷', '紫罗兰永恒花园外传：永远与自动手记人偶', '紫罗兰永恒花园 剧场版', '萤火之森'].every((t) => movie.includes(t)),
  movie.length + ' 部');
ok('B9 顺带修的两处客观错分：半泽直树 / 洛基 movie → series',
  ['半泽直树', '洛基'].every((t) => series.includes(t)),
  series.filter((t) => t === '半泽直树' || t === '洛基').join('、'));
ok('B10 items 顺序仍是 cmpTime 序（重分类不动排序）',
  JSON.stringify(data.items.map((i) => i.id)) ===
  JSON.stringify(data.items.slice().sort(cmpTime).map((i) => i.id)));

/* ================= C 运行时：筛选 + 标签 ================= */
console.log('\n== C 运行时 ==');
const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const errs = [];
const gridNames = (p) => p.evaluate(() =>
  [...document.querySelectorAll('#w-grid .poster-name')].map((x) => x.textContent.trim()));

{
  const c = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await c.newPage();
  p.on('pageerror', (e) => errs.push('C:' + e));
  await p.goto(BASE + 'watch.html', { waitUntil: 'load' });
  await p.waitForFunction(() => document.querySelectorAll('#w-grid .poster').length > 0, null, { timeout: 25000 });
  await p.waitForTimeout(400);

  await p.click('.w-seg-btn[data-kind="anime"]');
  await p.waitForTimeout(300);
  const r = await p.evaluate(() => ({
    on: document.querySelector('.w-seg-btn.is-on').getAttribute('data-kind'),
    pressed: document.querySelector('.w-seg-btn[data-kind="anime"]').getAttribute('aria-pressed'),
    others: [...document.querySelectorAll('.w-seg-btn')].map((b) => b.getAttribute('aria-pressed')),
    stored: localStorage.getItem('watch-kind'),
  }));
  const expectAnime = data.items.filter((x) => x.kind === 'anime').slice().sort(cmpTime).map((i) => i.title);
  const namesA = await gridNames(p);
  ok('C1 点「番剧」：按钮态/aria-pressed/localStorage 正确，网格只剩 29 部番剧',
    r.on === 'anime' && r.pressed === 'true' && r.stored === 'anime' &&
    r.others.filter((x) => x === 'true').length === 1 &&
    JSON.stringify(namesA) === JSON.stringify(expectAnime),
    `${namesA.length} 部（期望 ${expectAnime.length}）`);
  ok('C2 番剧视图含她和她的猫 / 冰菓 / 辉夜大小姐，不含雾山五行 / 双城之战 / 铃芽之旅',
    namesA.includes('她和她的猫') && namesA.includes('冰菓') && namesA.includes('辉夜大小姐想让我告白') &&
    !namesA.includes('雾山五行') && !namesA.includes('英雄联盟：双城之战') && !namesA.includes('铃芽之旅'),
    namesA.slice(0, 3).join('、') + ' …');
  await p.screenshot({ path: OUT + 'C2_番剧筛选_网格_1440.png' });

  await p.reload({ waitUntil: 'load' });
  await p.waitForFunction(() => document.querySelectorAll('#w-grid .poster').length > 0, null, { timeout: 25000 });
  await p.waitForTimeout(400);
  ok('C3 刷新后仍是番剧筛选（localStorage 持久化）',
    JSON.stringify(await gridNames(p)) === JSON.stringify(expectAnime) &&
    (await p.evaluate(() => localStorage.getItem('watch-kind'))) === 'anime');

  await p.click('.w-seg-btn[data-kind="all"]');
  await p.waitForTimeout(250);
  await p.click('#w-avatar');
  await p.waitForFunction(() => document.querySelectorAll('#w-tl .tl-item').length > 0, null, { timeout: 25000 });
  await p.waitForTimeout(500);
  const tl = await p.evaluate(() => {
    const items = [...document.querySelectorAll('#w-tl .tl-item')];
    const find = (t) => items.find((x) => (x.querySelector('.tl-name') || {}).textContent === t);
    const g = (el, s) => { const x = el && el.querySelector(s); return x ? x.textContent.trim() : 'MISSING'; };
    return {
      n: items.length,
      cat: g(find('她和她的猫'), '.tl-kind'),
      hyouka: g(find('冰菓'), '.tl-kind'),
      kirara: g(find('雾山五行'), '.tl-kind'),
      tamakoMovie: g(find('玉子爱情故事'), '.tl-kind'),
      hanzawa: g(find('半泽直树'), '.tl-kind'),
    };
  });
  ok('C4 时间轴类别标签：她和她的猫 / 冰菓 = 番剧，雾山五行 = 剧集，玉子爱情故事 = 电影，半泽直树 = 剧集',
    tl.cat === '番剧' && tl.hyouka === '番剧' && tl.kirara === '剧集' &&
    tl.tamakoMovie === '电影' && tl.hanzawa === '剧集', JSON.stringify(tl));
  await p.screenshot({ path: OUT + 'C4_时间轴_番剧标签_1440.png' });
  await c.close();
}

/* ================= D 运行时：表单链路 ================= */
console.log('\n== D 表单链路 ==');
const MOCK_DATA = {
  updated_at: '2026-10-25T10:00:00+08:00',
  items: [
    { id: '2026-10-20-item', title: '旧番剧条目', kind: 'anime', watched_at: '2026-10-20',
      poster: 'img/minion-0ef9a202.webp', poster_w: 460, poster_h: 420, added_at: '2026-10-25T11:10:00+08:00' },
  ],
};
{
  const c = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await c.newPage();
  p.on('pageerror', (e) => errs.push('D:' + e));
  const calls = [];
  await p.route('**/data/watch.json*', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_DATA) }));
  await p.route('https://api.github.com/**', async (r) => {
    const req = r.request();
    let body = null;
    try { body = req.postDataJSON(); } catch (e) {}
    calls.push({ method: req.method(), url: req.url(), body });
    if (req.method() === 'GET' && req.url().includes('/contents/docs/data/watch.json')) {
      const b64 = Buffer.from(JSON.stringify(MOCK_DATA), 'utf8').toString('base64');
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: b64.replace(/\n/g, ''), sha: 'sha-data' }) });
    }
    if (req.method() === 'GET') return r.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ message: 'Not Found' }) });
    return r.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ content: { sha: 'newsha' } }) });
  });
  await p.goto(BASE + 'watch.html', { waitUntil: 'load' });
  await p.waitForTimeout(400);

  // D1 表单选项值
  const opts = await p.evaluate(() =>
    [...document.querySelectorAll('#add-kind option')].map((o) => o.value + ':' + o.textContent));
  ok('D1 表单类型选项 = movie:电影 / series:剧集 / anime:番剧',
    JSON.stringify(opts) === JSON.stringify(['movie:电影', 'series:剧集', 'anime:番剧']), opts.join(' '));

  // D2 选「番剧」提交（mock GitHub）→ 写入 json 的 kind = anime
  await p.click('#w-fab');
  await p.waitForTimeout(200);
  await p.evaluate(() => { const b = document.getElementById('add-token-box'); if (b) b.open = true; });
  await p.waitForSelector('#add-token', { state: 'visible', timeout: 5000 });
  await p.fill('#add-token', 'github_pat_TESTTOKEN_1234567890');
  await p.click('#add-token-save');
  await p.waitForTimeout(200);
  await p.keyboard.press('Escape');   // 关对话框，再以「添加模式」重新打开
  await p.waitForTimeout(200);
  await p.click('#w-fab'); await p.waitForTimeout(200);
  await p.fill('#add-title', '测试新番');
  await p.fill('#add-watched', '2026-10-25');
  await p.selectOption('#add-kind', 'anime');
  await p.click('#w-add-submit');
  await p.waitForTimeout(1800);
  const puts = calls.filter((x) => x.method === 'PUT' && x.url.includes('/contents/docs/data/watch.json'));
  let written = null;
  try { written = JSON.parse(Buffer.from(puts[puts.length - 1].body.content, 'base64').toString('utf8')); } catch (e) {}
  const added = written && written.items.find((x) => x.title === '测试新番');
  ok('D2 选「番剧」提交：json 新条目 kind=anime、id 同日无撞车、added_at 可解析',
    !!added && added.kind === 'anime' && added.id === '2026-10-25-item' &&
    stampKey(added.added_at) > 0 && written.items.length === 2,
    added && `${added.id} ${added.kind} ${added.poster}`);

  // D3 编辑模式：打开一条番剧条目，表单回填 anime
  await p.click('#w-avatar');
  await p.waitForFunction(() => document.querySelectorAll('#w-tl .tl-item').length > 0, null, { timeout: 15000 });
  await p.waitForTimeout(400);
  await p.click('#w-tl .tl-item:has-text("旧番剧条目")');
  await p.waitForTimeout(400);
  const edit = await p.evaluate(() => ({
    open: document.getElementById('w-add').hasAttribute('open'),
    title: document.getElementById('w-add-title').textContent,
    kind: document.getElementById('add-kind').value,
  }));
  ok('D3 编辑番剧条目：弹窗打开、表单类型回填 anime',
    edit.open && /编辑《旧番剧条目》/.test(edit.title) && edit.kind === 'anime', JSON.stringify(edit));
  await c.close();
}

/* ================= E 收尾 ================= */
ok('E1 全程零 JS 异常', errs.length === 0, errs.join(' | '));
console.log(`\n第 73 轮：PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
