/* _p115_tests.mjs — 第 115 轮：把受影响的套件改到「整条下钻线删除」的新契约 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const hits = [];
function patch(rel, pairs) {
  const f = path.join(ROOT, rel);
  const raw = fs.readFileSync(f, 'utf8');
  const crlf = raw.includes('\r\n');
  let s = raw.replace(/\r\n/g, '\n');
  for (const [a, b, label] of pairs) {
    const n = s.split(a).length - 1;
    if (n !== 1) throw new Error(`[${rel} ${label}] 命中 ${n} 次`);
    s = s.split(a).join(b);
    hits.push(`${rel} ${label}`);
  }
  fs.writeFileSync(f, crlf ? s.replace(/\n/g, '\r\n') : s);
}

/* ---------------- verify6 ---------------- */
patch('tests/verify/verify6.mjs', [
  [`await page.click('#btn-drill-back'); // 回到榜单列表，后续断言在列表视图上做`,
   `await page.click('#card-lifetime'); // 第 115 轮：返回按钮已删除，改点卡片回榜单`, 'D3-card'],
  [`// 下钻：第 114 轮起单游戏**不再渲染点阵**（用户要求），只显示该游戏详情卡；ECharts 永不加载
await page.click('#lt-list .rank-item');
await page.waitForTimeout(900);
const drill = await page.evaluate(() => ({
  open: !document.getElementById('lt-detail').hidden,
  cells: document.querySelectorAll('#hx-grid .hx-c').length,
  hxHidden: getComputedStyle(document.getElementById('hx-root')).display === 'none',
  share: !!document.querySelector('#drill-more .dm-share'),
  title: (document.querySelector('#lt-detail .hx-title')?.textContent || '').trim(),
  echarts: typeof window.echarts,
  legacyChart: !!document.getElementById('chart-drill'),
}));
check('回归：下钻显示该游戏详情卡、点阵不渲染（无 ECharts）',
  drill.open && drill.cells === 0 && drill.hxHidden && drill.share &&
  drill.title.length > 0 && drill.title !== '游玩热力图' &&
  drill.echarts === 'undefined' && !drill.legacyChart,
  JSON.stringify(drill));`,
   `// 榜单行：第 115 轮起**整条下钻线删除**（用户：「从累计榜点进某款游戏时没反应，不可点击」）
await page.click('#card-lifetime');
await page.waitForTimeout(500);
const beforeRow = await page.evaluate(() => ({
  view: document.querySelector('.view.active')?.id,
  hash: location.hash,
}));
await page.click('#lt-list .rank-item');
await page.waitForTimeout(800);
const row = await page.evaluate(() => ({
  view: document.querySelector('.view.active')?.id,
  hash: location.hash,
  cursor: getComputedStyle(document.querySelector('#lt-list .rank-item')).cursor,
  drillMore: !!document.getElementById('drill-more'),
  backBtn: !!document.getElementById('btn-drill-back'),
  echarts: typeof window.echarts,
  legacyChart: !!document.getElementById('chart-drill'),
}));
check('回归：点累计榜行毫无反应（不切视图 / 不改 hash / cursor 非 pointer / 无详情卡 / 无 ECharts）',
  row.view === beforeRow.view && row.hash === beforeRow.hash &&
  row.cursor !== 'pointer' && !row.drillMore && !row.backBtn &&
  row.echarts === 'undefined' && !row.legacyChart,
  JSON.stringify({ before: beforeRow, ...row }));`, 'drill-contract'],
  [`await page.evaluate(() => document.querySelector('#btn-drill-back')?.click());`,
   `await page.evaluate(() => document.getElementById('card-lifetime')?.click());`, 'lazy-capsule-back'],
]);

/* ---------------- verify103 ---------------- */
patch('tests/verify/verify103.mjs', [
  [`await page.click('#btn-drill-back');
await page.waitForTimeout(500);
ok('D3 「← 返回」回到「游戏时长」', (await page.evaluate(() => document.querySelector('.view.active')?.id)) === 'view-lifetime');`,
   `await page.click('#card-lifetime');
await page.waitForTimeout(500);
ok('D3 点「游戏时长」卡回到累计榜（返回按钮第 115 轮已删除）',
  (await page.evaluate(() => document.querySelector('.view.active')?.id)) === 'view-lifetime');`, 'D3'],
  [`await page.locator('#lt-list .rank-item').first().click();
await page.waitForTimeout(700);
const d = await page.evaluate(() => ({
  active: document.querySelector('.view.active')?.id,
  cells: document.querySelectorAll('#hx-grid .hx-c').length,
  detail: !!document.querySelector('#drill-more .dm-share'),
  hash: location.hash,
}));
/* 第 114 轮（用户：删掉单个游戏下的点阵）：下钻只显示该游戏详情，不再有格子 */
ok('D4 点累计榜行 → 切到「最近游玩」并显示该游戏详情（点阵不再渲染）',
  d.active === 'view-recent' && d.detail && d.cells === 0, d);
ok('D5 深链仍带 g/<appid>', /#\\/recent\\/g\\/\\d+/.test(d.hash), d.hash);`,
   `const dBefore = await page.evaluate(() => ({ view: document.querySelector('.view.active')?.id, hash: location.hash }));
await page.locator('#lt-list .rank-item').first().click();
await page.waitForTimeout(700);
const d = await page.evaluate(() => ({
  active: document.querySelector('.view.active')?.id,
  cells: document.querySelectorAll('#hx-grid .hx-c').length,
  drillMore: !!document.getElementById('drill-more'),
  backBtn: !!document.getElementById('btn-drill-back'),
  cursor: getComputedStyle(document.querySelector('#lt-list .rank-item')).cursor,
  hash: location.hash,
}));
/* 第 115 轮（用户：「从累计榜点进某款游戏时没反应，不可点击」）：整行不再可点 */
ok('D4 点累计榜行毫无反应（不切视图 / 不改 hash / 非 pointer 光标）',
  d.active === dBefore.view && d.hash === dBefore.hash && d.cursor !== 'pointer',
  { before: dBefore, ...d });
ok('D5 单游戏详情整条线已删除（无 #drill-more / 无返回按钮）', !d.drillMore && !d.backBtn, { more: d.drillMore, back: d.backBtn });`, 'D4D5'],
]);

/* ---------------- verify104 ---------------- */
patch('tests/verify/verify104.mjs', [
  [`/* ---------- F 内容层下钻仍保留（点榜单行 = 查看该游戏热力图） ---------- */
await page.click('#lt-list .rank-item');
await page.waitForTimeout(900);
const f = await snap();
ok('F1 点累计榜行仍可进入该游戏详情', f.active === 'view-recent' && /#\\/recent\\/g\\/\\d+/.test(f.hash), f);
/* 第 114 轮（用户：删掉单个游戏下的点阵）：面板只剩「返回 + 游戏名 + 详情卡」 */
ok('F2 下钻后不再渲染点阵，改显示该游戏详情卡', f.cells === 0 && f.detailVisible, f);

/* ---------- G 返回按钮 ---------- */
await page.click('#btn-drill-back');
await page.waitForTimeout(600);
const g = await snap();
ok('G1 返回按钮回累计榜', g.active === 'view-lifetime' && g.hash === '#/lifetime', g);

/* ---------- H 深链直达仍可用 ---------- */
await page.goto(LOCAL + '?t=' + Date.now() + '#/recent/g/431960', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#drill-more .dm-share', { timeout: 30000 });
await page.waitForTimeout(700);
const h = await snap();
ok('H1 深链直达该游戏详情（第 114 轮起不再带点阵）',
  h.active === 'view-recent' && /#\\/recent\\/g\\/\\d+/.test(h.hash) && h.cells === 0 && h.detailVisible, h);`,
   `/* ---------- F 榜单行不可点（第 115 轮：单游戏详情整条线删除） ---------- */
await page.click('#lt-list .rank-item');
await page.waitForTimeout(900);
const f = await snap();
ok('F1 点累计榜行毫无反应（停在累计榜、hash 不变）', f.active === 'view-lifetime' && f.hash === '#/lifetime', f);
ok('F2 页面上没有单游戏详情卡，也没有返回按钮',
  !(await page.evaluate(() => !!document.getElementById('drill-more'))) &&
  !(await page.evaluate(() => !!document.getElementById('btn-drill-back'))), null);

/* ---------- G 连点不同行也无变化 ---------- */
await page.evaluate(() => document.querySelectorAll('#lt-list .rank-item')[1]?.click());
await page.waitForTimeout(500);
const g = await snap();
ok('G1 连点另一行仍停在累计榜', g.active === 'view-lifetime' && g.hash === '#/lifetime', g);

/* ---------- H 旧深链 g/<appid> 只按视图处理 ---------- */
await page.goto(LOCAL + '?t=' + Date.now() + '#/recent/g/431960', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#hx-grid .hx-c', { timeout: 30000 });
await page.waitForTimeout(700);
const h = await snap();
ok('H1 旧深链 #/recent/g/<appid> 落到「最近游玩」总览（365 格、hash 去掉 g 段）',
  h.active === 'view-recent' && h.hash === '#/recent' && h.cells >= 365, h);`, 'FGH'],
]);

/* ---------------- verify83_index ---------------- */
patch('tests/verify/verify83_index.mjs', [
  [`/* 第 114 轮（用户：删掉单个游戏下的热力图/点阵图，只留最近游玩的总点阵）：
   下钻点阵消失，只剩该游戏详情卡；总览点阵原样保留。 */
const drill = await page.evaluate(() => ({
  cells: document.querySelectorAll('#hx-grid .hx-c').length,
  hxHidden: getComputedStyle(document.getElementById('hx-root')).display === 'none',
  share: !!document.querySelector('#drill-more .dm-share'),
  kv: document.querySelectorAll('#drill-more .dm-kv').length,
  title: (document.querySelector('#lt-detail .hx-title')?.textContent || '').trim(),
}));
ok('B1 下钻单款游戏不再渲染点阵（整块隐藏），只留该游戏详情卡',
  drill.cells === 0 && drill.hxHidden && drill.share && drill.kv >= 3 && drill.title !== '游玩热力图',
  JSON.stringify(drill));

await page.click('#btn-drill-back');
await page.waitForTimeout(500);
await page.click('#card-recent');
await page.waitForTimeout(900);`,
   `/* 第 115 轮（用户：「从累计榜点进某款游戏时没反应，不可点击」）：点行不再下钻 */
const rowClick = await page.evaluate(() => {
  const before = { view: document.querySelector('.view.active')?.id, hash: location.hash };
  document.querySelector('#lt-list .rank-item')?.click();
  return before;
});
await page.waitForTimeout(700);
const afterClick = await page.evaluate(() => ({
  view: document.querySelector('.view.active')?.id,
  hash: location.hash,
  cursor: getComputedStyle(document.querySelector('#lt-list .rank-item')).cursor,
  drillMore: !!document.getElementById('drill-more'),
}));
ok('B1 点累计榜行毫无反应（视图与 hash 都不变、cursor 非 pointer、无详情卡）',
  afterClick.view === rowClick.view && afterClick.hash === rowClick.hash &&
  afterClick.cursor !== 'pointer' && !afterClick.drillMore,
  JSON.stringify({ before: rowClick, ...afterClick }));

await page.click('#card-recent');
await page.waitForTimeout(900);`, 'B1'],
  [`await page.click('#card-lifetime');
await page.waitForTimeout(500);
await page.click('#lt-list .rank-item');
await page.waitForTimeout(1200);
const dm = await page.evaluate(() => ({
  share: !!document.querySelector('#drill-more .dm-share'),
  kv: document.querySelectorAll('#drill-more .dm-kv').length,
}));
ok('B12 单游戏详情仍有「占终身比重 + 期段信息」', dm.share && dm.kv >= 3, JSON.stringify(dm));`,
   `/* 第 115 轮：单游戏详情（占比 / 期段 / 成就）随下钻整条线一起删除 */
await page.click('#card-lifetime');
await page.waitForTimeout(500);
await page.click('#lt-list .rank-item');
await page.waitForTimeout(800);
const dm = await page.evaluate(() => ({
  drillMore: !!document.getElementById('drill-more'),
  back: !!document.getElementById('btn-drill-back'),
  view: document.querySelector('.view.active')?.id,
}));
ok('B12 单游戏详情卡整块已删除，点行仍停在累计榜',
  !dm.drillMore && !dm.back && dm.view === 'view-lifetime', JSON.stringify(dm));`, 'B12'],
]);

/* ---------------- verify113 ---------------- */
patch('tests/verify/verify113.mjs', [
  [`/* B9 下钻某游戏：详情卡仍在（占比 + 3 项期段） */
await page.click('#card-lifetime');
await page.waitForTimeout(500);
await page.click('#lt-list .rank-item');
await page.waitForTimeout(1200);
const drill = await page.evaluate(() => ({
  share: !!document.querySelector('#drill-more .dm-share'),
  kv: document.querySelectorAll('#drill-more .dm-kv').length,
  detail: document.querySelector('#drill-more .dm-share b')?.textContent,
}));
ok('B9 下钻游戏后「占终身时长 + 期段」仍在', drill.share && drill.kv >= 3, drill);`,
   `/* B9 第 115 轮：单游戏详情整条线删除，点行不再有任何下钻 */
await page.click('#card-lifetime');
await page.waitForTimeout(500);
await page.click('#lt-list .rank-item');
await page.waitForTimeout(800);
const drill = await page.evaluate(() => ({
  view: document.querySelector('.view.active')?.id,
  hash: location.hash,
  drillMore: !!document.getElementById('drill-more'),
  back: !!document.getElementById('btn-drill-back'),
}));
ok('B9 点累计榜行不再下钻（无详情卡 / 无返回按钮 / 停在累计榜）',
  drill.view === 'view-lifetime' && drill.hash === '#/lifetime' && !drill.drillMore && !drill.back, drill);`, 'B9'],
]);

console.log('OK 改判：\n - ' + hits.join('\n - '));
