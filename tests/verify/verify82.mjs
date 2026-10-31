/* 第 82 轮回归：页脚「影视剧总数」说明文字
   用户要求（2026-10-31）：底部的文字区（更新于 … · ← 回到 My Game Time）加一句影视剧总数。

   设计取舍：
   · 数字取 **ALL.length（全量）**，与「类型」筛选无关 —— 筛到只剩 3 部时也报总数，
     否则这个数字会和「当前列表有几部」混淆。
   · 同步点放在 paint() 里（加载 / 新增 / 编辑 / 删除之后都会重绘），不另设事件，
     这样任何改动数据的地方都自动跟上，不会漏。
   · 数据没加载完时 HTML 初值是「共 — 部影视剧」（破折号），不显示 0。

   断言分组：
   A 静态（4）：HTML 有 #w-total 且初值正确、JS 有 syncCount 且在 paint 里调用、
      页脚三段顺序（更新于 → 总数 → 返回）、版本号 v15
   B 运行时（5）：真实数据计数 = watch.json 条数；mock 下「切类型不变」；
      时间轴视图不变；删除一条后 -1；零 JS 异常
   C 窄屏（2）：390px 下整行不溢出、总数不折成多行
   ⚠️ mock 必须 serviceWorkers:'block' —— 第 80 轮起 SW 也拦 watch.json（网络优先）。 */
import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const BASE = 'http://127.0.0.1:8895/';
const D = 'C:/Users/33329/WorkBuddy/2026-10-13-18-17-49/steam-playtime/docs/';
const rd = (f) => fs.readFileSync(D + f, 'utf8').replace(/\r\n/g, '\n');
const stripCmt = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');

let pass = 0, fail = 0;
const ok = (n, c, extra = '') => {
  c ? (pass++, console.log(`PASS ${n}${extra ? '  ' + extra : ''}`))
    : (fail++, console.log(`FAIL ${n}  ${extra}`));
};

const html = rd('watch.html'), js = rd('watch.js'), css = rd('watch.css');
const jsNC = stripCmt(js);
const P = 'img/minion-0ef9a202.webp';

/* ================= A 静态 ================= */
console.log('== A 静态 ==');
ok('A1 页脚有 #w-total，数据未到时的初值是「共 — 部影视剧」（不显示 0）',
  /<span id="w-total">共 — 部影视剧<\/span>/.test(html));

ok('A2 watch.js 有 syncCount() 且在 paint() 开头被调用（加载/新增/编辑/删除都会跟上）',
  /function syncCount\(\) \{[\s\S]{0,200}countEl\.textContent = '共 ' \+ ALL\.length \+ ' 部影视剧'/.test(jsNC) &&
  /function paint\(\) \{\s*syncCount\(\);/.test(jsNC));

ok('A3 页脚三段顺序：更新于 → 总数 → 回到 My Game Time（DOM 顺序 = 视觉顺序）',
  (() => {
    const i = html.indexOf('id="w-updated"'), j = html.indexOf('id="w-total"'), k = html.indexOf('回到 My Game Time');
    return i > 0 && j > i && k > j;
  })());

ok('A4 版本号：watch.js?v=15 / watch.css?v=20（js 加计数，css 加窄屏竖排）',
  /watch\.js\?v=15"/.test(html) && /watch\.css\?v=20"/.test(html));

/* ================= mock ================= */
const MOCK = {
  updated_at: '2026-10-31T10:00:00+08:00',
  items: [
    { id: '2026-10-10-a', title: '甲', kind: 'movie', watched_at: '2026-10-10', rating: 9.9, order: 1, poster: P },
    { id: '2026-10-09-b', title: '乙', kind: 'movie', watched_at: '2026-10-09', rating: 8.5, order: 2, poster: P },
    { id: '2026-10-08-c', title: '丙', kind: 'anime', watched_at: '2026-10-08', rating: 7.5, order: 3, poster: P },
    { id: '2026-10-07-d', title: '丁', kind: 'series', watched_at: '2026-10-07', rating: 6, order: 4, poster: P },
    { id: '2026-10-06-e', title: '戊', kind: 'movie', watched_at: '2026-10-06', rating: 5, order: 5, poster: P },
  ],
};

const browser = await chromium.launch({ args: ['--no-proxy-server'] });

async function newPage(opts = {}) {
  const ctx = await browser.newContext({
    viewport: { width: opts.w || 1440, height: opts.h || 900 },
    serviceWorkers: 'block',
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  if (opts.mock !== false) {
    await page.addInitScript(() => { try { localStorage.setItem('watch-gh-token', 'ghp_fake_for_test'); } catch (e) {} });
    await page.route('**/data/watch.json*', (r) => r.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify(opts.data || MOCK),
    }));
    await page.route('https://api.github.com/**', async (r) => {
      const req = r.request();
      if (req.method() === 'GET') {
        const b64 = Buffer.from(JSON.stringify(opts.data || MOCK), 'utf8').toString('base64');
        return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: b64, sha: 'sha' }) });
      }
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: { sha: 'new' } }) });
    });
  }
  await page.goto(BASE + 'watch.html', { waitUntil: 'load' });
  await page.waitForSelector('#w-grid .poster', { timeout: 15000 });
  await page.waitForTimeout(450);
  return { ctx, page, errs };
}

const countText = (page) => page.$eval('#w-total', (e) => e.textContent.trim());

/* ================= B 运行时 ================= */
console.log('\n== B 运行时 ==');
{
  /* 真实数据：数字必须等于 watch.json 的条数（从数据推导，不写死） */
  const N = JSON.parse(rd('data/watch.json')).items.length;
  const { ctx, page, errs } = await newPage({ mock: false });
  const t = await countText(page);
  ok(`B1 真实数据：页脚 = 「共 ${N} 部影视剧」，与 watch.json 条数一致`,
    t === `共 ${N} 部影视剧`, t);
  ok('B2 真实数据第一次渲染同步完成：没有停在初值「共 — 部影视剧」', !/—/.test(t), t);
  ok('B3 真实数据零 JS 异常', errs.length === 0, errs.slice(0, 2).join(' | '));
  await ctx.close();
}
{
  const { ctx, page, errs } = await newPage();
  const all = await countText(page);
  ok('B4 mock 5 条：总数 = 5', all === '共 5 部影视剧', all);

  /* 切「电影」：卡片变 3 张，但总数仍报 5（这是「总数」而非「当前显示数」） */
  await page.click('.w-seg-btn[data-kind="movie"]');
  await page.waitForTimeout(350);
  const posters = await page.$$eval('#w-grid .poster', (e) => e.length);
  const afterKind = await countText(page);
  ok('B5 切「电影」→ 3 张卡片，但页脚仍是「共 5 部影视剧」（总数不随筛选变）',
    posters === 3 && afterKind === '共 5 部影视剧', `${posters} 张｜${afterKind}`);

  /* 时间轴视图同样显示 */
  await page.click('.w-seg-btn[data-kind="all"]');
  await page.waitForTimeout(250);
  await page.click('#w-avatar');
  await page.waitForFunction(() => document.querySelectorAll('#w-tl .tl-item').length > 0, null, { timeout: 15000 });
  await page.waitForTimeout(300);
  const tlCount = await countText(page);
  ok('B6 时间轴视图下页脚照常显示总数', tlCount === '共 5 部影视剧', tlCount);

  /* 删除一条（两段式）→ 总数必须变 4，证明数字是活的而不是写死的 */
  await page.evaluate(() => document.querySelector('#w-tl .tl-item').click());
  await page.waitForTimeout(600);
  await page.click('#w-add-delete');
  await page.waitForTimeout(250);
  await page.click('#w-add-delete');
  await page.waitForTimeout(900);
  const afterDel = await countText(page);
  const left = await page.$$eval('#w-tl .tl-item', (e) => e.length);
  ok('B7 删除一条后总数 -1（共 4 部影视剧），与列表剩余条数一致',
    afterDel === '共 4 部影视剧' && left === 4, `${afterDel}｜剩 ${left} 条`);

  ok('B8 mock 全程零 JS 异常', errs.length === 0, errs.slice(0, 2).join(' | '));
  await ctx.close();
}

/* ================= C 窄屏 ================= */
console.log('\n== C 窄屏 390 ==');
{
  const { ctx, page } = await newPage({ w: 390, h: 844, mock: false });
  const r = await page.evaluate(() => {
    const f = document.querySelector('.w-foot');
    const c = document.getElementById('w-total');
    return {
      footW: Math.round(f.getBoundingClientRect().width),
      scrollW: Math.round(f.scrollWidth),
      clientW: Math.round(f.clientWidth),
      docW: document.documentElement.scrollWidth,
      countRects: c.getClientRects().length,
      countW: Math.round(c.getBoundingClientRect().width),
    };
  });
  ok('C1 390px：页脚不产生横向溢出（文档宽度 = 视口 390）',
    r.docW <= 391 && r.scrollW <= r.clientW + 1,
    `doc=${r.docW}｜foot ${r.scrollW}/${r.clientW}`);
  ok('C2 390px：总数是一整段连续文字（只占 1 个行盒），没被挤成竖排',
    r.countRects === 1 && r.countW >= 80, `${r.countRects} 行｜宽 ${r.countW}px`);
  await ctx.close();
}

await browser.close();
console.log(`\n第 82 轮：PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
