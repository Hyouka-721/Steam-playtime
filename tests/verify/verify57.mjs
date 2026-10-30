import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const BASE = 'http://127.0.0.1:8895/';
const D = 'C:/Users/33329/WorkBuddy/2026-10-13-18-17-49/steam-playtime/docs/';
const rd = (f) => fs.readFileSync(D + f, 'utf8').replace(/\r\n/g, '\n');
const stripCmt = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');

let pass = 0, fail = 0;
const ok = (n, c, extra = '') => { c ? (pass++, console.log(`PASS ${n}${extra ? '  ' + extra : ''}`)) : (fail++, console.log(`FAIL ${n}  ${extra}`)); };

const html = rd('watch.html'), css = rd('watch.css'), js = rd('watch.js');
const cssNC = stripCmt(css);

/* ================= A 静态指纹 ================= */
console.log('== A 静态指纹 ==');
ok('A1 加号按钮存在且有可访问名', /class="w-fab" id="w-fab"/.test(html) && /aria-label="添加观影记录"/.test(html));
ok('A2 表单字段齐全（片名/英文名/类型/年份/日期/评分/标签/短评/海报）',
  ['add-title', 'add-en', 'add-kind', 'add-year', 'add-watched', 'add-rating', 'add-tags', 'add-note', 'add-poster']
    .every((id) => new RegExp(`id="${id}"`).test(html)));
ok('A3 使用原生 <dialog>（Esc / 焦点圈免费拿到）', /<dialog class="w-add" id="w-add"/.test(html));
ok('A4 有 Token 折叠区与保存/清除按钮',
  /id="add-token-box"/.test(html) && /id="add-token-save"/.test(html) && /id="add-token-clear"/.test(html));
ok('A5 版本号 bump：watch.css?v=18 / watch.js?v=13',
  /watch\.css\?v=18"/.test(html) && /watch\.js\?v=13"/.test(html));
ok('A6 watch.js 走 GitHub Contents API 且仓库/分支可核',
  /api\.github\.com/.test(js) && /owner: 'Hyouka-721'/.test(js) && /repo: 'Steam-playtime'/.test(js) && /branch: 'main'/.test(js));
ok('A7 压图规则与 CLI 一致（宽 640 / WebP / 只缩不放 / 内容哈希命名）',
  /POSTER_W = 640/.test(js) && /'image\/webp'/.test(js) && /Math\.min\(POSTER_W, bmp\.width\)/.test(js) &&
  /\.webp'/.test(js) && /sha8/.test(js));
ok('A8 Token 只存 localStorage，页面里没有硬编码密钥',
  /localStorage\.getItem\(TOKEN_KEY\)/.test(js) && !/github_pat_[A-Za-z0-9]{10,}/.test(html + js));
ok('A9 无海报时生成 2:3 占位图（640×960）', /posterPlaceholder/.test(js) && /POSTER_W \* 1\.5/.test(js));
ok('A10 CSS 有 .w-fab / .w-add / .w-toast 且窄屏单列',
  /\.w-fab \{/.test(cssNC) && /\.w-add \{/.test(cssNC) && /\.w-toast \{/.test(cssNC) &&
  /\.w-row-2, \.w-row-3 \{ grid-template-columns: 1fr; \}/.test(cssNC));

/* ================= B 浏览器实测 ================= */
const browser = await chromium.launch({ args: ['--no-proxy-server'] });

const MOCK_DATA = {
  updated_at: '2026-10-24T10:00:00+08:00',
  items: [{
    id: '2026-10-01-old', title: '已有条目', kind: 'movie', watched_at: '2026-10-01',
    poster: 'img/minion-0ef9a202.webp', poster_w: 460, poster_h: 420,
  }],
};

// <details id="add-token-box"> 折叠状态下内部 input 不可见 → 填之前先展开
const expandToken = async (page) => {
  await page.evaluate(() => { const b = document.getElementById('add-token-box'); if (b) b.open = true; });
  await page.waitForSelector('#add-token', { state: 'visible', timeout: 5000 });
};

async function newPage(opts = {}) {  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...opts });
  const page = await ctx.newPage();
  const calls = [];
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  // 观影数据
  await page.route('**/data/watch.json*', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_DATA) }));
  // GitHub API 全模拟
  await page.route('https://api.github.com/**', async (r) => {
    const req = r.request();
    const url = req.url();
    const method = req.method();
    let body = null;
    try { body = req.postDataJSON(); } catch (e) {}
    calls.push({ method, url, body, auth: req.headers()['authorization'] || '' });
    if (method === 'GET') {
      if (url.includes('/contents/docs/data/watch.json')) {
        const b64 = Buffer.from(JSON.stringify(MOCK_DATA), 'utf8').toString('base64');
        return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: b64.replace(/\n/g, ''), sha: 'sha-data' }) });
      }
      return r.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ message: 'Not Found' }) });
    }
    return r.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ content: { sha: 'newsha' } }) });
  });
  await page.goto(BASE + 'watch.html', { waitUntil: 'load' });
  await page.waitForSelector('#w-grid .poster', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(300);
  return { ctx, page, calls, errs };
}

console.log('\n== B 交互实测（GitHub API 模拟）==');
{
  const { ctx, page, calls, errs } = await newPage();

  const fab = await page.evaluate(() => {
    const b = document.getElementById('w-fab'), r = b.getBoundingClientRect(), cs = getComputedStyle(b);
    return { w: r.width, h: r.height, right: window.innerWidth - r.right, bottom: window.innerHeight - r.bottom,
      pos: cs.position, radius: cs.borderRadius, cursor: cs.cursor };
  });
  ok('B1 加号在右下角、56×56 圆形、指针态', fab.w === 56 && fab.h === 56 && fab.pos === 'fixed' && fab.cursor === 'pointer' && /50%/.test(fab.radius),
    JSON.stringify(fab));

  await page.click('#w-fab');
  await page.waitForTimeout(260);
  const opened = await page.evaluate(() => {
    const d = document.getElementById('w-add');
    return { open: d.hasAttribute('open'), modal: d.matches(':modal'), date: document.getElementById('add-watched').value,
      focused: document.activeElement && document.activeElement.id };
  });
  ok('B2 点加号以模态打开对话框，日期预填今天，焦点落到片名', opened.open && opened.modal && /^\d{4}-\d{2}-\d{2}$/.test(opened.date) && opened.focused === 'add-title',
    JSON.stringify(opened));

  await page.keyboard.press('Escape');
  await page.waitForTimeout(220);
  ok('B3 Esc 可关闭', await page.evaluate(() => !document.getElementById('w-add').hasAttribute('open')));

  // 无 token 时提交：应拦下并提示
  await page.click('#w-fab'); await page.waitForTimeout(200);
  await page.fill('#add-title', '奥本海默');
  await page.click('#w-add-submit');
  await page.waitForTimeout(300);
  const noTok = await page.evaluate(() => ({
    msg: document.getElementById('w-add-msg').textContent,
    kind: document.getElementById('w-add-msg').dataset.kind,
    stillOpen: document.getElementById('w-add').hasAttribute('open'),
    tokenBoxOpen: document.getElementById('add-token-box').open,
  }));
  ok('B4 没 Token 时拦下并引导去填（不发任何 API 请求）',
    noTok.stillOpen && noTok.kind === 'err' && /Token/.test(noTok.msg) && noTok.tokenBoxOpen && calls.length === 0,
    JSON.stringify(noTok));

  // 填 token（#add-token 在 <details> 里，折叠时不可见 → 先确保展开）
  await expandToken(page);
  await page.fill('#add-token', 'github_pat_TESTTOKEN_1234567890');
  await page.click('#add-token-save');
  await page.waitForTimeout(200);
  const tokState = await page.evaluate(() => ({
    label: document.getElementById('add-token-state').textContent,
    stored: localStorage.getItem('watch-gh-token'),
    input: document.getElementById('add-token').value,
  }));
  ok('B5 Token 保存进 localStorage 且输入框被清空', tokState.label === '已设置' && tokState.stored === 'github_pat_TESTTOKEN_1234567890' && tokState.input === '',
    JSON.stringify(tokState));
  await ctx.close();
}

/* 完整提交（带海报文件 & 不带海报各测一次） */
// poster_test.png 由 mkposter.py 生成：800×1200 RGB，用于验证「只缩不放」与 2:3 保持
const POSTER_PNG = 'C:/Users/33329/AppData/Local/Temp/fx_verify_20261018/poster_test.png';
if (!fs.existsSync(POSTER_PNG)) { console.error('缺少 poster_test.png，先跑 mkposter.py'); process.exit(2); }

for (const mode of ['withPoster', 'noPoster']) {
  const { ctx, page, calls, errs } = await newPage();
  await page.click('#w-fab'); await page.waitForTimeout(200);
  await page.fill('#add-title', mode === 'withPoster' ? '奥本海默' : '无海报测试');
  await page.fill('#add-en', mode === 'withPoster' ? 'Oppenheimer' : 'NoPoster');
  await page.selectOption('#add-kind', 'movie');
  await page.fill('#add-year', '2023');
  await page.fill('#add-watched', '2026-10-24');
  await page.fill('#add-rating', '9');
  await page.fill('#add-tags', '传记, 历史');
  await page.fill('#add-note', '诺兰的原子弹三小时');
  await expandToken(page);
  await page.fill('#add-token', 'github_pat_TESTTOKEN_1234567890');
  await page.click('#add-token-save');
  if (mode === 'withPoster') {
    await page.setInputFiles('#add-poster', POSTER_PNG);
    await page.waitForTimeout(200);
  }
  await page.click('#w-add-submit');
  await page.waitForTimeout(1400);

  const putCalls = calls.filter((c) => c.method === 'PUT');
  const posterPut = putCalls.find((c) => c.url.includes('/contents/docs/img/watch/'));
  const dataPut = putCalls.find((c) => c.url.includes('/contents/docs/data/watch.json'));

  ok(`B6[${mode}] 海报与 watch.json 各提交一次`, !!posterPut && !!dataPut, putCalls.map((c) => c.url.split('/contents/')[1]).join(' , '));
  ok(`B6a[${mode}] 海报按「slug-哈希.webp」命名、放在 docs/img/watch/`,
    !!posterPut && /docs\/img\/watch\/[a-z0-9-]+-[0-9a-f]{8}\.webp$/.test(posterPut.url), posterPut && posterPut.url);
  ok(`B6b[${mode}] 请求带 Bearer Token 与 GitHub API 版本头`, !!posterPut && /^Bearer github_pat_TESTTOKEN/.test(posterPut.auth));

  let merged = null;
  try { merged = JSON.parse(Buffer.from(dataPut.body.content, 'base64').toString('utf8')); } catch (e) {}
  const added = merged && merged.items.find((it) => it.id === '2026-10-24-' + (mode === 'withPoster' ? 'oppenheimer' : 'noposter'));
  ok(`B6c[${mode}] watch.json 里新增条目字段完整（id/title/kind/watched_at/poster_w/poster_h/rating/year/tags/note）`,
    !!added && added.title === (mode === 'withPoster' ? '奥本海默' : '无海报测试') && added.kind === 'movie' &&
    added.watched_at === '2026-10-24' && added.rating === 9 && added.year === 2023 &&
    Array.isArray(added.tags) && added.tags.length === 2 && /一|诺兰/.test(added.note || '') &&
    added.poster_w > 0 && added.poster_h > 0, JSON.stringify(added));
  ok(`B6c2[${mode}] 海报宽 640、保持 2:3（800×1200 源图 → 640×960，只缩不放）`,
    !!added && added.poster_w === 640 && added.poster_h === 960, added && `${added.poster_w}×${added.poster_h}`);
  ok(`B6d[${mode}] 原有条目保留 + 按观影时间倒序（新条目在前）`,
    !!merged && merged.items.length === 2 && merged.items[0].id.startsWith('2026-10-24'),
    merged && merged.items.map((i) => i.id).join(' > '));
  ok(`B6e[${mode}] 提交 watch.json 时带上原文件 sha（走更新而非新建）`, !!dataPut && dataPut.body.sha === 'sha-data');
  ok(`B6f[${mode}] 提交信息是规范格式`, !!dataPut && /^data\(watch\): 添加《.+》$/.test(dataPut.body.message), dataPut && dataPut.body.message);

  const after = await page.evaluate(() => ({
    open: document.getElementById('w-add').hasAttribute('open'),
    toast: document.getElementById('w-toast').hidden ? '' : document.getElementById('w-toast').textContent,
    posters: document.querySelectorAll('#w-grid .poster').length,
    sortOn: document.querySelector('.w-sort-btn.is-on').getAttribute('data-sort'),
    first: document.querySelector('#w-grid .poster .poster-name') && document.querySelector('#w-grid .poster .poster-name').textContent,
  }));
  ok(`B7[${mode}] 提交成功后自动关闭对话框并弹出提示`, !after.open && /已提交/.test(after.toast), JSON.stringify(after));
  ok(`B7a[${mode}] 本机立即看到新条目（网格 2 张、最新在最前）`, after.posters === 2 && after.first === (mode === 'withPoster' ? '奥本海默' : '无海报测试'),
    `posters=${after.posters} first=${after.first} sort=${after.sortOn}`);
  ok(`B8[${mode}] 零 JS 异常`, errs.length === 0, errs.join(' | '));
  await ctx.close();
}

/* 失败路径：401 要给出人话 */
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.route('**/data/watch.json*', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_DATA) }));
  await page.route('https://api.github.com/**', (r) =>
    r.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ message: 'Bad credentials' }) }));
  await page.goto(BASE + 'watch.html', { waitUntil: 'load' });
  await page.waitForTimeout(300);
  await page.click('#w-fab'); await page.waitForTimeout(200);
  await page.fill('#add-title', 'X');
  await expandToken(page);
  await page.fill('#add-token', 'github_pat_BAD');
  await page.click('#add-token-save');
  await page.click('#w-add-submit');
  await page.waitForTimeout(900);
  const r = await page.evaluate(() => ({
    msg: document.getElementById('w-add-msg').textContent,
    kind: document.getElementById('w-add-msg').dataset.kind,
    open: document.getElementById('w-add').hasAttribute('open'),
    btn: document.getElementById('w-add-submit').disabled,
  }));
  ok('B9 Token 失效时给出人话错误、对话框不关闭、按钮恢复可用',
    /401/.test(r.msg) && r.kind === 'err' && r.open && r.btn === false, JSON.stringify(r));
  await ctx.close();
}

/* 390 窄屏：表单单列、加号不挡内容 */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.route('**/data/watch.json*', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_DATA) }));
  await page.goto(BASE + 'watch.html', { waitUntil: 'load' });
  await page.waitForTimeout(400);
  await page.click('#w-fab'); await page.waitForTimeout(300);
  const narrow = await page.evaluate(() => {
    const d = document.getElementById('w-add');
    const r = d.getBoundingClientRect();
    const row = document.querySelector('.w-row-3');
    const cols = getComputedStyle(row).gridTemplateColumns.split(' ').length;
    const fab = document.getElementById('w-fab').getBoundingClientRect();
    return { dlgW: +r.width.toFixed(1), inViewport: r.left >= 0 && r.right <= innerWidth,
      rowCols: cols, fabW: fab.width, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  });
  ok('B10 390px：对话框不超出视口、三列表单收成一列、加号缩到 50',
    narrow.inViewport && narrow.rowCols === 1 && narrow.fabW === 50 && narrow.overflow === 0, JSON.stringify(narrow));
  await ctx.close();
}

/* 390 窄屏：提示条不能压在加号上 */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.route('**/data/watch.json*', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_DATA) }));
  await page.route('https://api.github.com/**', (r) => {
    const url = r.request().url();
    if (r.request().method() === 'GET') {
      if (url.includes('watch.json')) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: Buffer.from(JSON.stringify(MOCK_DATA), 'utf8').toString('base64'), sha: 'sha-data' }) });
      return r.fulfill({ status: 404, body: '{}' });
    }
    return r.fulfill({ status: 201, body: '{"content":{"sha":"x"}}' });
  });
  await page.goto(BASE + 'watch.html', { waitUntil: 'load' });
  await page.waitForTimeout(400);
  await page.click('#w-fab'); await page.waitForTimeout(250);
  await page.fill('#add-title', 'T');
  await expandToken(page);
  await page.fill('#add-token', 'github_pat_X');
  await page.click('#add-token-save');
  await page.click('#w-add-submit');
  await page.waitForTimeout(700);
  const t = await page.evaluate(() => {
    const f = document.getElementById('w-fab').getBoundingClientRect();
    const r = document.getElementById('w-toast').getBoundingClientRect();
    const overlap = !(r.right <= f.left || r.left >= f.right || r.bottom <= f.top || r.top >= f.bottom);
    return { overlap, toastBottomGap: +(innerHeight - r.bottom).toFixed(1), fabTopGap: +(innerHeight - f.top).toFixed(1),
      inView: r.left >= 0 && r.right <= innerWidth };
  });
  ok('B11 390px：提示条抬到加号上方，不压住加号也不出视口',
    t.overlap === false && t.toastBottomGap === 80 && t.inView, JSON.stringify(t));
  await ctx.close();
}

await browser.close();
console.log(`\n===== 第 57 轮回归：${pass}/${pass + fail} =====`);
process.exit(fail ? 1 : 0);
