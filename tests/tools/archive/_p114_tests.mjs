/* _p114_tests.mjs — 第 114 轮：把三个受影响套件的判据改到新契约上（下钻不再有点阵）
   ⚠️ 这是**需求变更**（用户明确要求删掉单游戏点阵），不是调阈值凑绿。 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const P = (f) => path.join(ROOT, f);
const hits = [];
function sub(file, from, to, label) {
  let s = fs.readFileSync(P(file), 'utf8');
  const n = s.split(from).length - 1;
  if (n !== 1) throw new Error(`[${label}] 命中 ${n} 次`);
  s = s.split(from).join(to);
  fs.writeFileSync(P(file), s);
  hits.push(label);
}

/* ---------- verify103 D4 ---------- */
sub('tests/verify/verify103.mjs',
  `const d = await page.evaluate(() => ({
  active: document.querySelector('.view.active')?.id,
  cells: document.querySelectorAll('#hx-grid .hx-c').length,
  hash: location.hash,
}));
ok('D4 点累计榜行 → 切到热力图且可用', d.active === 'view-recent' && d.cells > 0, d);`,
  `const d = await page.evaluate(() => ({
  active: document.querySelector('.view.active')?.id,
  cells: document.querySelectorAll('#hx-grid .hx-c').length,
  detail: !!document.querySelector('#drill-more .dm-share'),
  hash: location.hash,
}));
/* 第 114 轮（用户：删掉单个游戏下的点阵）：下钻只显示该游戏详情，不再有格子 */
ok('D4 点累计榜行 → 切到「最近游玩」并显示该游戏详情（点阵不再渲染）',
  d.active === 'view-recent' && d.detail && d.cells === 0, d);`,
  'verify103:D4');

/* ---------- verify104 F1/F2 + H1 ---------- */
sub('tests/verify/verify104.mjs',
  `ok('F1 点累计榜行仍可进入带筛选的热力图', f.active === 'view-recent' && /#\\/recent\\/g\\/\\d+/.test(f.hash), f);
ok('F2 下钻后热力图有数据', f.cells > 0, f);`,
  `ok('F1 点累计榜行仍可进入该游戏详情', f.active === 'view-recent' && /#\\/recent\\/g\\/\\d+/.test(f.hash), f);
/* 第 114 轮（用户：删掉单个游戏下的点阵）：面板只剩「返回 + 游戏名 + 详情卡」 */
ok('F2 下钻后不再渲染点阵，改显示该游戏详情卡', f.cells === 0 && f.detailVisible, f);`,
  'verify104:F1F2');

sub('tests/verify/verify104.mjs',
  `await page.waitForSelector('#hx-grid .hx-c', { timeout: 30000 });
await page.waitForTimeout(700);
const h = await snap();
ok('H1 深链直达带筛选热力图', h.active === 'view-recent' && /#\\/recent\\/g\\/\\d+/.test(h.hash) && h.cells > 0, h);`,
  `await page.waitForSelector('#drill-more .dm-share', { timeout: 30000 });
await page.waitForTimeout(700);
const h = await snap();
ok('H1 深链直达该游戏详情（第 114 轮起不再带点阵）',
  h.active === 'view-recent' && /#\\/recent\\/g\\/\\d+/.test(h.hash) && h.cells === 0 && h.detailVisible, h);`,
  'verify104:H1');

/* ---------- verify83_index B1 → B1 + B1b ---------- */
sub('tests/verify/verify83_index.mjs',
  `const heat = await page.evaluate(() => {
  const cells = [...document.querySelectorAll('#hx-grid .hx-c')];
  const real = cells.filter((c) => !c.classList.contains('is-blank'));
  return {
    total: cells.length,
    real: real.length,
    /* 第 111 轮：点阵用 l0~l4 / lna 五档（旧月历是 is-blank + h1~h4） */
    lit: cells.filter((c) => / (l[1-4])\\b/.test(' ' + c.className)).length,
    month: (document.getElementById('hx-sum').textContent || '').trim(),   // 第 111 轮：月份切换器 → 年份选择器
  };
});
ok('B1 下钻是一年点阵：格子数 = 一年天数、有已点亮的日期、汇总含年份',
  heat.total >= 365 && heat.total <= 371 && heat.lit > 0 &&
  /^\\d{4} 年 · /.test(heat.month), JSON.stringify(heat));
await page.click('#btn-drill-back');
await page.waitForTimeout(500);`,
  `/* 第 114 轮（用户：删掉单个游戏下的热力图/点阵图，只留最近游玩的总点阵）：
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
await page.waitForTimeout(900);
const heat = await page.evaluate(() => {
  const cells = [...document.querySelectorAll('#hx-grid .hx-c')];
  return {
    total: cells.length,
    /* 第 111 轮：点阵用 l0~l4 / lna 五档 */
    lit: cells.filter((c) => / (l[1-4])\\b/.test(' ' + c.className)).length,
    month: (document.getElementById('hx-sum').textContent || '').trim(),
  };
});
ok('B1b 总览仍是一年点阵：格子数 = 一年天数、有已点亮的日期、汇总含年份',
  heat.total >= 365 && heat.total <= 371 && heat.lit > 0 &&
  /^\\d{4} 年 · /.test(heat.month), JSON.stringify(heat));
await page.click('#card-lifetime');
await page.waitForTimeout(500);`,
  'verify83_index:B1');

console.log('OK 改判：\n - ' + hits.join('\n - '));
