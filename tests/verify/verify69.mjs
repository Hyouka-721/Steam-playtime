/* 第 69 轮：时间轴条目「点击编辑」回归
   · 点击 / Enter 打开 #w-add 的编辑模式，字段预填正确、海报只读展示
   · 取消：关闭且时间轴不变
   · 保存：PUT 到 contents API（**用 route 拦截，绝不碰真实仓库**），时间轴即时更新
   · id 跟随「观看日期 + slug」变化；未改字段（海报 / 未填的可选项）保持原样 */
import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const BASE = process.env.BASE || 'http://127.0.0.1:8895/';
const ROOT = 'C:/Users/33329/WorkBuddy/2026-10-13-18-17-49/steam-playtime/docs/';
const OUT = 'C:/Users/33329/AppData/Local/Temp/fx_verify_20261018/shots69/';
fs.mkdirSync(OUT, { recursive: true });

const rd = (f) => fs.readFileSync(ROOT + f, 'utf8').replace(/\r\n/g, '\n');
const css = rd('watch.css'), html = rd('watch.html'), js = rd('watch.js');
const cssNC = css.replace(/\/\*[\s\S]*?\*\//g, '');
const repoData = JSON.parse(rd('data/watch.json'));

let pass = 0, fail = 0;
const ok = (n, c, extra = '') => { c ? (pass++, console.log(`PASS ${n}${extra ? '  — ' + extra : ''}`)) : (fail++, console.log(`FAIL ${n}  — ${extra}`)); };

/* ================= A 静态 ================= */
console.log('== A 静态：可点语义与编辑入口 ==');
ok('A1 时间轴条目带 data-id / role=button / tabindex / aria-label',
  /'<article class="tl-item" data-id="' \+ esc\(it\.id \|\| ''\) \+ '"'/.test(js) &&
  /role="button" tabindex="0" aria-label="编辑《/.test(js));
ok('A2 点击与键盘（Enter / 空格）都走事件委托',
  /tlEl\.addEventListener\('click'/.test(js) && /tlEl\.addEventListener\('keydown'/.test(js) &&
  /openEditById\(el\.getAttribute\('data-id'\)\)/.test(js));
ok('A3 编辑模式函数齐全（openEdit / submitEdit / resetAddChrome / editingId）',
  /function openEdit\(it\)/.test(js) && /function submitEdit\(\)/.test(js) &&
  /function resetAddChrome\(\)/.test(js) && /var editingId = ''/.test(js));
ok('A4 提交时按 editingId 分流到 submitEdit',
  /if \(editingId\) \{ submitEdit\(\); return; \}/.test(js));
ok('A5 添加流程留了真实海报路径（__posterPath），编辑时不会把 blob 写进 json',
  /item\.__posterPath = item\.poster/.test(js) && /old\.__posterPath \|\|/.test(js));
ok('A6 条目可点光标 + hover 高亮片名 + 键盘焦点环',
  /\.tl-item \{ cursor: pointer; \}/.test(cssNC) && /\.tl-item:hover \.tl-name \{ color: var\(--accent\)/.test(cssNC) &&
  /\.tl-item:focus-visible \{[\s\S]*?outline: 2px solid var\(--accent\)/.test(cssNC));
ok('A7 弹窗标题单行省略（长片名不挤走关闭按钮）',
  /\.w-add-title \{[\s\S]*?text-overflow: ellipsis/.test(cssNC));
ok('A8 版本号 bump：watch.css?v=19 / watch.js?v=14',
  /watch\.css\?v=19"/.test(html) && /watch\.js\?v=14"/.test(html));

/* ================= B 运行时 ================= */
const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const errs = [];
const captured = [];   // 拦截到的 PUT

async function openPage(W = 1440, H = 900) {
  const c = await browser.newContext({ viewport: { width: W, height: H } });
  const p = await c.newPage();
  p.on('pageerror', (e) => errs.push(String(e)));
  p.on('console', (m) => { if (m.type() === 'error') errs.push('console:' + m.text().slice(0, 120)); });

  /* 拦截 GitHub API：GET 返回本地数据当「仓库现状」，PUT 只记录不落地 */
  await p.route('https://api.github.com/**', async (route) => {
    const req = route.request();
    const json = (o, st = 200) => route.fulfill({ status: st, contentType: 'application/json', body: JSON.stringify(o) });
    if (req.method() === 'GET') {
      return json({ content: Buffer.from(JSON.stringify(repoData)).toString('base64'), sha: 'mocksha' });
    }
    if (req.method() === 'PUT') {
      captured.push(JSON.parse(req.postData() || '{}'));
      return json({ content: { sha: 'newsha' } });
    }
    return json({}, 404);
  });

  await p.goto(BASE + 'watch.html', { waitUntil: 'load' });
  await p.evaluate(() => {
    try { localStorage.setItem('watch-gh-token', 'ghp_mock_for_test'); localStorage.removeItem('watch-layout'); } catch (e) {}
  });
  await p.reload({ waitUntil: 'load' });
  await p.waitForFunction(() => document.querySelectorAll('#w-grid .poster').length > 0, null, { timeout: 25000 });
  await p.click('#w-avatar');
  await p.waitForFunction(() => document.querySelectorAll('#w-tl .tl-item').length > 0
    && getComputedStyle(document.querySelector('#w-tl')).display !== 'none', null, { timeout: 20000 });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(500);
  return { c, p };
}

const row = (p, title) => p.locator('#w-tl .tl-item').filter({ hasText: title }).first();
const dlgOpen = (p) => p.evaluate(() => document.getElementById('w-add').open === true);
const fields = (p) => p.evaluate(() => {
  const v = (id) => { const e = document.getElementById(id); return e ? e.value : null; };
  return {
    heading: document.getElementById('w-add-title').textContent.trim(),
    submit: document.getElementById('w-add-submit').textContent.trim(),
    title: v('add-title'), en: v('add-en'), kind: v('add-kind'), year: v('add-year'),
    watched: v('add-watched'), rating: v('add-rating'), tags: v('add-tags'), note: v('add-note'),
    preview: (() => { const i = document.getElementById('add-preview'); return { hidden: i.hidden, src: (i.getAttribute('src') || '').slice(-40) }; })(),
    fileDisabled: document.getElementById('add-poster').disabled,
    fileHidden: document.getElementById('add-poster').hidden,
    posterTip: document.getElementById('add-poster-tip').textContent.trim().slice(0, 20),
  };
});

const target = repoData.items.find((x) => x.title === '南京照相馆');

/* ---------- B1 点击打开并预填 ---------- */
console.log('\n== B1 点击条目 → 打开编辑并预填 ==');
{
  const { c, p } = await openPage();
  await row(p, '南京照相馆').click();
  await p.waitForTimeout(300);
  ok('B1 点击条目后弹窗打开', await dlgOpen(p));
  const f = await fields(p);
  ok('B2 标题与按钮切到编辑模式', f.heading === '编辑《南京照相馆》' && f.submit === '保存修改', `${f.heading} / ${f.submit}`);
  ok('B3 各字段预填正确（名称/英文名/类别/年份/日期/评分/短评）',
    f.title === target.title && f.en === target.title_en && f.kind === target.kind &&
    String(f.year) === String(target.year) && f.watched === target.watched_at &&
    String(f.rating) === String(target.rating) && f.note === target.note,
    JSON.stringify({ t: f.title, en: f.en, k: f.kind, y: f.year, w: f.watched, r: f.rating, n: f.note }).slice(0, 160));
  ok('B4 当前海报只读展示、选图被禁用', f.preview.hidden === false && f.fileDisabled === true && f.fileHidden === true,
    JSON.stringify(f.preview) + ` disabled=${f.fileDisabled}`);
  ok('B5 海报提示改成「编辑时保持原海报」', /保持原海报/.test(f.posterTip), f.posterTip);
  await p.screenshot({ path: OUT + 'E1_编辑弹窗_1440.png' });

  /* ---------- B2 取消 ---------- */
  await p.click('#w-add-cancel');
  await p.waitForTimeout(250);
  ok('B6 取消后弹窗关闭', (await dlgOpen(p)) === false);
  const unchanged = await p.evaluate(() => {
    const it = [...document.querySelectorAll('#w-tl .tl-item')].find((x) => x.textContent.includes('南京照相馆'));
    return it ? it.querySelector('.tl-note').textContent.trim() : 'MISSING';
  });
  ok('B7 取消后时间轴内容未变', unchanged === target.note, unchanged);

  /* ---------- B3 改短评 + 评分后保存 ---------- */
  console.log('\n== B3 修改后保存（PUT 被拦截） ==');
  captured.length = 0;
  await row(p, '南京照相馆').click();
  await p.waitForTimeout(250);
  await p.fill('#add-note', '改过的短评：靖康耻，犹未雪。');
  await p.fill('#add-rating', '9.5');
  await p.click('#w-add-submit');
  await p.waitForTimeout(1200);
  ok('B8 保存后弹窗自动关闭', (await dlgOpen(p)) === false);
  ok('B9 触发了一次 PUT', captured.length === 1, `${captured.length} 次`);
  const put = captured[0] || {};
  const written = put.content ? JSON.parse(Buffer.from(put.content, 'base64').toString('utf8')) : { items: [] };
  const after = (written.items || []).find((x) => x.id === target.id) || {};
  ok('B10 写入内容：短评与评分已更新',
    after.note === '改过的短评：靖康耻，犹未雪。' && Number(after.rating) === 9.5, JSON.stringify({ n: after.note, r: after.rating }));
  ok('B11 未改字段保持原样（id / 海报路径 / 年代 / 类型 / 英文名）',
    after.id === target.id && after.poster === target.poster && String(after.year) === String(target.year) &&
    after.kind === target.kind && after.title_en === target.title_en,
    JSON.stringify({ id: after.id, poster: after.poster, year: after.year }));
  ok('B12 提交信息是「更新《南京照相馆》」', /更新《南京照相馆》/.test(put.message || ''), put.message);
  const shown = await p.evaluate(() => {
    const it = [...document.querySelectorAll('#w-tl .tl-item')].find((x) => x.textContent.includes('南京照相馆'));
    return { note: it.querySelector('.tl-note').textContent.trim(), score: it.querySelector('.tl-score').textContent.trim() };
  });
  ok('B13 保存后时间轴即时更新（不刷新页面）',
    shown.note === '改过的短评：靖康耻，犹未雪。' && shown.score === '★9.5', JSON.stringify(shown));
  const toast = await p.evaluate(() => {
    const t = document.getElementById('w-toast');
    return { hidden: t.hidden, text: t.textContent.trim() };
  });
  ok('B14 给出保存成功提示', !toast.hidden && /已保存/.test(toast.text), JSON.stringify(toast));

  /* ---------- B4 改名 + 改观看日期 → id 跟随 ---------- */
  console.log('\n== B4 改名 / 改日期 ==');
  captured.length = 0;
  await row(p, '南京照相馆').click();
  await p.waitForTimeout(250);
  await p.fill('#add-title', '南京照相馆（重看）');
  await p.fill('#add-watched', '2026-10-20');
  await p.click('#w-add-submit');
  await p.waitForTimeout(1200);
  const put2 = captured[0] || {};
  const w2 = put2.content ? JSON.parse(Buffer.from(put2.content, 'base64').toString('utf8')) : { items: [] };
  const renamed = (w2.items || []).find((x) => x.title === '南京照相馆（重看）') || {};
  ok('B15 id 跟随「观看日期 + slug」更新',
    renamed.id === '2026-10-20-dead-to-rights', renamed.id);
  ok('B16 旧 id 不再存在（不会留下重复条目）',
    !(w2.items || []).some((x) => x.id === target.id), (w2.items || []).filter((x) => x.title.indexOf('南京') === 0).map((x) => x.id).join(','));
  const renamed2 = await p.evaluate(() => {
    const it = [...document.querySelectorAll('#w-tl .tl-item')].find((x) => x.textContent.includes('南京照相馆（重看）'));
    return it ? it.querySelector('.tl-date').textContent.trim() : 'MISSING';
  });
  ok('B17 时间轴里名字与日期都即时更新', renamed2 === '2026-10-20', renamed2);
  await p.screenshot({ path: OUT + 'E2_保存后_1440.png' });
  await c.close();
}

/* ---------- B5 键盘 Enter 打开 ---------- */
console.log('\n== B5 键盘可达 ==');
{
  const { c, p } = await openPage();
  await row(p, '头脑特工队2').focus();
  await p.keyboard.press('Enter');
  await p.waitForTimeout(300);
  ok('B18 键盘 Enter 也能打开编辑', await dlgOpen(p));
  const f = await fields(p);
  ok('B19 键盘打开的预填同样正确', f.title === '头脑特工队2' && f.heading === '编辑《头脑特工队2》', `${f.heading} / ${f.title}`);
  await p.click('#w-add-cancel');
  await p.waitForTimeout(200);
  ok('B20 关闭后回到列表', (await dlgOpen(p)) === false);
  await c.close();
}

/* ---------- B6 加号仍是「添加」模式 ---------- */
console.log('\n== B6 加号模式未被污染 ==');
{
  const { c, p } = await openPage();
  await p.click('#w-fab');
  await p.waitForTimeout(300);
  const f = await fields(p);
  ok('B21 加号打开的是「添加观影记录」，字段为空、选图可用',
    f.heading === '添加观影记录' && f.submit === '提交' && f.title === '' && f.fileDisabled === false && f.fileHidden === false,
    JSON.stringify({ h: f.heading, s: f.submit, t: f.title, d: f.fileDisabled }));
  ok('B22 添加模式的海报提示已还原', /自动生成/.test(f.posterTip), f.posterTip);
  await p.click('#w-add-cancel');
  await p.waitForTimeout(200);
  /* 编辑过一条再打开加号，应仍是添加模式 */
  await row(p, '头脑特工队2').click();
  await p.waitForTimeout(250);
  await p.click('#w-add-cancel');
  await p.waitForTimeout(200);
  await p.click('#w-fab');
  await p.waitForTimeout(300);
  const f2 = await fields(p);
  ok('B23 先编辑再点加号，弹窗正确复位为添加模式', f2.heading === '添加观看记录' || f2.heading === '添加观影记录', f2.heading);
  await c.close();
}

ok('B24 全程零 JS 异常', errs.length === 0, errs.slice(0, 3).join(' | '));

await browser.close();
console.log(`\n===== 第 69 轮回归：${pass}/${pass + fail} =====`);
process.exit(fail ? 1 : 0);
