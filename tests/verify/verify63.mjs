import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const BASE = 'http://127.0.0.1:8895/watch.html';
const D = 'C:/Users/33329/WorkBuddy/2026-10-13-18-17-49/steam-playtime/docs/';
const rd = (f) => fs.readFileSync(D + f, 'utf8').replace(/\r\n/g, '\n');
const stripCmt = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');

let pass = 0, fail = 0;
const ok = (n, c, extra = '') => { c ? (pass++, console.log(`PASS ${n}${extra ? '  ' + extra : ''}`)) : (fail++, console.log(`FAIL ${n}  ${extra}`)); };

const css = rd('watch.css'), html = rd('watch.html');
const cssNC = stripCmt(css);

/* ================= A 静态 ================= */
console.log('== A 静态：间距与居中声明 ==');
const head = (cssNC.match(/\.tl-head \{([^}]*)\}/) || [, ''])[1];
ok('A1 .tl-head 中英文之间 gap: 12px（原 1px）', /gap: 12px/.test(head), head.replace(/\s+/g, ' ').trim());
const body = (cssNC.match(/\.tl-body \{([^}]*)\}/) || [, ''])[1];
ok('A2 .tl-body 改为 align-items: center（原 baseline）',
  /align-items: center/.test(body) && !/align-items: baseline/.test(body), body.replace(/\s+/g, ' ').trim());
const meta = (cssNC.match(/\.tl-meta \{([^}]*)\}/) || [, ''])[1];
ok('A3 .tl-meta 也是 align-items: center', /align-items: center/.test(meta));
ok('A4 版本号 bump：watch.css?v=16', /watch\.css\?v=16"/.test(html));

/* ================= B 桌面实测 ================= */
const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const errs = [];
const geo = async (W) => {
  const ctx = await browser.newContext({ viewport: { width: W, height: 1000 } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(`${W}:${e}`));
  await p.goto(BASE, { waitUntil: 'load' });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(550);
  await p.click('#w-avatar');
  await p.waitForTimeout(700);
  const r = await p.evaluate(() => {
    const items = [...document.querySelectorAll('#w-tl .tl-item')];
    const item = items.find((x) => x.querySelector('.tl-en') && x.querySelector('.tl-year') && x.querySelector('.tl-score') && x.querySelector('.tl-note')) || items[0];
    const box = (s) => {
      const e = item.querySelector(s);
      if (!e) return null;
      const b = e.getBoundingClientRect();
      return { t: +b.top.toFixed(2), b: +b.bottom.toFixed(2), h: +b.height.toFixed(2),
        cy: +((b.top + b.bottom) / 2).toFixed(2), l: +b.left.toFixed(2) };
    };
    const th = item.querySelector('.tl-thumb').getBoundingClientRect();
    const ir = item.getBoundingClientRect();
    return { body: box('.tl-body'), head: box('.tl-head'), name: box('.tl-name'), en: box('.tl-en'),
      meta: box('.tl-meta'), note: box('.tl-note'),
      thumb: { h: +th.height.toFixed(2), cy: +((th.top + th.bottom) / 2).toFixed(2) },
      itemH: +ir.height.toFixed(2), itemCy: +((ir.top + ir.bottom) / 2).toFixed(2),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  });
  await ctx.close();
  return r;
};

console.log('\n== B 桌面：中英文留白 + 逐项垂直居中 ==');
for (const W of [1440, 1100, 860]) {
  const r = await geo(W);
  ok(`B[${W}] 中文名与英文名之间留白 = 12px（en.top − name.bottom）`,
    Math.abs((r.en.t - r.name.b) - 12) < 0.02, `${(r.en.t - r.name.b).toFixed(2)}px`);
  /* 第 66 轮：真实数据的上映写成完整日期后，≤860px 会触发「评语整段折到下一行」的既定兜底。
     单行时逐项与容器同中心；折成两行时各行在自己行内居中（行内 head.cy = meta.cy）。 */
  const twoLine = r.note.t > r.meta.b - 0.6;
  if (twoLine) {
    ok(`B[${W}] 两行布局：名称与四项仍在同一行且同行居中（head.cy = meta.cy）`,
      Math.abs(r.head.cy - r.meta.cy) < 0.5, `head ${r.head.cy} / meta ${r.meta.cy}（评语折到第二行）`);
  } else {
    ok(`B[${W}] 「中文名+英文名」整块在正文容器内垂直居中（head.cy = body.cy）`,
      Math.abs(r.head.cy - r.body.cy) < 0.5, `head ${r.head.cy} / body ${r.body.cy}`);
    ok(`B[${W}] 日期·类别·上映·评级 这一组也垂直居中（meta.cy = body.cy）`,
      Math.abs(r.meta.cy - r.body.cy) < 0.5, `meta ${r.meta.cy} / body ${r.body.cy}`);
    ok(`B[${W}] 评语也垂直居中（note.cy = body.cy）`,
      Math.abs(r.note.cy - r.body.cy) < 0.5, `note ${r.note.cy} / body ${r.body.cy}`);
  }
  ok(`B[${W}] 正文容器在条目内居中（body.cy = item.cy），海报同样居中`,
    Math.abs(r.body.cy - r.itemCy) < 0.5 && Math.abs(r.thumb.cy - r.itemCy) < 0.5,
    `body ${r.body.cy} thumb ${r.thumb.cy} item ${r.itemCy}`);
  ok(`B[${W}] 条目高仍由海报主导（142px，文字块 52.94 未把条目撑高）`,
    r.itemH === 142, `itemH=${r.itemH} bodyH=${r.body.h}`);
  ok(`B[${W}] 无横向溢出`, r.overflow === 0);
}

console.log('\n== C 窄屏（折行后仍保留 12px 留白）==');
for (const W of [480, 390, 360]) {
  const r = await geo(W);
  ok(`C[${W}] 中文名与英文名留白仍是 12px（折行不影响 head 内部间距）`,
    Math.abs((r.en.t - r.name.b) - 12) < 0.02, `${(r.en.t - r.name.b).toFixed(2)}px`);
  ok(`C[${W}] 英文名仍与中文名左对齐 + 无横向溢出`,
    Math.abs(r.en.l - r.name.l) < 0.02 && r.overflow === 0, `left ${r.name.l}/${r.en.l}`);
}

/* ================= D 无英文名 / 长评语 ================= */
console.log('\n== D 边界情况 ==');
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
const errsD = [];
p.on('pageerror', (e) => errsD.push(String(e)));
await p.route('**/data/watch.json*', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
  updated_at: '2026-10-24T10:00:00+08:00', items: [
    { id: 'noen', title: '没有英文名', kind: 'movie', year: 2021, watched_at: '2026-10-08', rating: 7,
      poster: 'img/minion-0ef9a202.webp' },
    { id: 'long', title: '长评语', title_en: 'Long Note', kind: 'movie', year: 2020, watched_at: '2026-10-02',
      rating: 9, note: Array(14).fill('这是一段特别长的评语用来验证同一行内会不会溢出容器').join('，') + '。',
      poster: 'img/minion-0ef9a202.webp' },
  ] }) }));
await p.goto(BASE, { waitUntil: 'load' });
await p.waitForTimeout(500);
await p.click('#w-avatar');
await p.waitForTimeout(700);
const edge = await p.evaluate(() => {
  const items = [...document.querySelectorAll('#w-tl .tl-item')];
  const byName = (n) => items.find((x) => (x.querySelector('.tl-name') || {}).textContent === n);
  const info = (el) => {
    const b = el.querySelector('.tl-body').getBoundingClientRect();
    const m = el.querySelector('.tl-meta').getBoundingClientRect();
    const n = el.querySelector('.tl-note');
    return { itemH: +el.getBoundingClientRect().height.toFixed(2),
      bodyH: +b.height.toFixed(2),
      metaCyOff: +(((m.top + m.bottom) / 2) - ((b.top + b.bottom) / 2)).toFixed(2),
      hasEn: !!el.querySelector('.tl-en'),
      noteOverflow: n ? n.scrollWidth > Math.ceil(n.clientWidth) + 1 : null };
  };
  return { noen: info(byName('没有英文名')), long: info(byName('长评语')),
    pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
});
ok('D1 无英文名的条目：head 只有一行，其余项仍垂直居中', edge.noen.hasEn === false && Math.abs(edge.noen.metaCyOff) < 0.5,
  JSON.stringify(edge.noen));
ok('D2 超长评语仍单行省略、不撑破布局', edge.long.noteOverflow === true && edge.pageOverflow === 0, JSON.stringify(edge.long));
ok('D3 边界场景零 JS 异常', errsD.length === 0, errsD.join(' | '));
await ctx.close();
ok('D4 全程零 JS 异常', errs.length === 0, errs.join(' | '));

await browser.close();
console.log(`\n===== 第 63 轮回归：${pass}/${pass + fail} =====`);
process.exit(fail ? 1 : 0);
