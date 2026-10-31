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

const js = rd('watch.js'), css = rd('watch.css'), html = rd('watch.html');
const cssNC = stripCmt(css);
const blk = (s, q) => { const i = s.indexOf(q); if (i < 0) return ''; const st = s.indexOf('{', i); let d = 0, j = st; for (; j < s.length; j++) { if (s[j] === '{') d++; else if (s[j] === '}') { d--; if (d === 0) break; } } return s.slice(st + 1, j); };

/* ================= A 静态 ================= */
console.log('== A 静态：DOM 与样式 ==');
const tplStart = js.indexOf("'<div class=\"tl-body\">'");
const tpl = js.slice(tplStart, js.indexOf("'</article>'", tplStart));
const at = (s) => tpl.indexOf(s);
ok('A1 名称与英文名同在一个 .tl-head 里（一列两行），其余在 .tl-meta / .tl-note',
  at('tl-head') > -1 && at('tl-head') < at('tl-name') && at('tl-name') < at('tl-en') &&
  at('tl-en') < at('</div>') && at('tl-meta') > at('tl-head') && at('tl-note') > at('tl-meta'));
ok('A2 顺序仍是 名称 → 英文名 → 日期 → 类别 → 上映时间 → 评级 → 评语',
  at('tl-date') < at('tl-kind') && at('tl-kind') < at('tl-year') && at('tl-year') < at('scoreHtml'));
const body = (cssNC.match(/\.tl-body \{([^}]*)\}/) || [, ''])[1];
ok('A3 .tl-body 横向 flex + 垂直居中（第 63 轮 baseline→center）+ 桌面不折行',
  /display: flex/.test(body) && /flex-wrap: nowrap/.test(body) && /align-items: center/.test(body),
  body.replace(/\s+/g, ' ').trim());
ok('A3b ≤860px 才允许折行（窄屏兜底）', /\.tl-body \{ flex-wrap: wrap; \}/.test(blk(cssNC, '@media (max-width: 860px)')));
const head = (cssNC.match(/\.tl-head \{([^}]*)\}/) || [, ''])[1];
ok('A4 .tl-head 竖排（英文名在中文名正下方）', /flex-direction: column/.test(head), head.replace(/\s+/g, ' ').trim());
const meta = (cssNC.match(/\.tl-meta \{([^}]*)\}/) || [, ''])[1];
ok('A5 .tl-meta 横排（日期/类别/上映/评级 并排 + 垂直居中）', /flex-direction: row/.test(meta) && /align-items: center/.test(meta));
const note = (cssNC.match(/\.tl-note \{([^}]*)\}/) || [, ''])[1];
ok('A6 .tl-note 单行省略（超长 hover 看 title）', /white-space: nowrap/.test(note) && /text-overflow: ellipsis/.test(note));
ok('A7 缩略图已撤掉第 61 轮的 align-self:flex-start（回到居中）',
  !/align-self: flex-start/.test(cssNC));
ok('A8 版本号 bump：watch.css?v=19 / watch.js?v=14',
  /watch\.css\?v=19"/.test(html) && /watch\.js\?v=14"/.test(html));

/* ================= B 浏览器 ================= */
const DATA = JSON.parse(rd('data/watch.json'));
/* 真实数据里有的条目缺 rating / year / note（如《太平年》无评分），期望值也取「七项齐全」那条 */
const it0 = DATA.items.find((i) => i.title_en && i.year && i.rating && i.note) || DATA.items[0];
const KIND = { movie: '电影', series: '剧集' };
console.log(`\n== B 真实数据（${it0.title}）横向布局 ==`);

const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const errs = [];
const geo = async (W) => {
  const ctx = await browser.newContext({ viewport: { width: W, height: 1000 } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(`${W}:${e}`));
  await p.goto(BASE, { waitUntil: 'load' });
  await p.waitForTimeout(500);
  await p.click('#w-avatar');
  await p.waitForTimeout(700);
  const r = await p.evaluate(() => {
    const items = [...document.querySelectorAll('#w-tl .tl-item')];
    const item = items.find((x) => x.querySelector('.tl-en') && x.querySelector('.tl-year') && x.querySelector('.tl-score') && x.querySelector('.tl-note')) || items[0];
    const g = (s) => {
      const e = item.querySelector(s);
      if (!e) return null;
      const b = e.getBoundingClientRect();
      const cs = getComputedStyle(e);
      return { text: e.textContent.trim(), left: +b.left.toFixed(2), right: +b.right.toFixed(2),
        top: +b.top.toFixed(2), bottom: +b.bottom.toFixed(2), w: +b.width.toFixed(2), h: +b.height.toFixed(2), fs: cs.fontSize };
    };
    const bd = item.querySelector('.tl-body').getBoundingClientRect();
    return { name: g('.tl-name'), en: g('.tl-en'), head: g('.tl-head'), meta: g('.tl-meta'),
      date: g('.tl-date'), kind: g('.tl-kind'), year: g('.tl-year'), score: g('.tl-score'), note: g('.tl-note'),
      bodyH: +bd.height.toFixed(2), bodyW: +bd.width.toFixed(2), itemH: +item.getBoundingClientRect().height.toFixed(2),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      noteEllipsis: (() => { const n = item.querySelector('.tl-note'); return n ? n.scrollWidth > Math.ceil(n.clientWidth) + 1 : false; })(),
      noteTitle: (() => { const n = item.querySelector('.tl-note'); return n ? n.getAttribute('title') : null; })() };
  });
  await ctx.close();
  return r;
};
const ov = (a, b) => Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
const sameRow = (a, b) => ov(a, b) > Math.min(a.h, b.h) * 0.5;

for (const W of [1440, 1100, 900, 860]) {
  const r = await geo(W);
  ok(`B[${W}] 英文名在中文名正下方（同 left、top 在名称底部之下）`,
    Math.abs(r.en.left - r.name.left) < 0.02 && r.en.top >= r.name.bottom - 0.6,
    `name.left=${r.name.left} en.left=${r.en.left} name.bottom=${r.name.bottom} en.top=${r.en.top}`);
  ok(`B[${W}] 日期/类别/上映/评级 四项彼此同行（top 差 < 8）`,
    [r.date, r.kind, r.year, r.score].every((x) => Math.abs(x.top - r.date.top) < 8),
    [r.date, r.kind, r.year, r.score].map((x) => x.top).join(','));
  /* 第 63 轮 align-items 改成 center 后，名称（head 上半）与居中的四项不再有 50% 垂直重叠，
     改判「四项完整落在 .tl-head 的纵向区间内」—— head 是 .tl-body 最高项，单行时两者等高 */
  ok(`B[${W}] 四项完整落在同一 flex 行内（落在 head 纵向区间内）`,
    r.meta.top >= r.head.top - 0.6 && r.meta.bottom <= r.head.bottom + 0.6);
  /* 第 66 轮：真实数据《太平年》的上映写成完整日期后，≤860px 的「评语整段折到下一行」兜底
     （第 62 轮既定行为）会被更早触发 → 分成「同行」与「折行」两种合规形态分别断言 */
  const noteSameLine = r.note.top >= r.head.top - 0.6 && r.note.bottom <= r.head.bottom + 0.6;
  ok(`B[${W}] 评语形态合规（${noteSameLine ? '与四项同行' : '整段折到下一行'}）`,
    noteSameLine ? (r.name.right <= r.meta.left + 0.6 && r.score.right <= r.note.left + 0.6)
      : (r.note.top > r.meta.bottom - 0.6 && Math.abs(r.note.w - r.bodyW) < 1.5),
    noteSameLine ? `note.left=${r.note.left}（在四项右侧）` : `note ${r.note.top}~ — 独占整行 w=${r.note.w}`);
  ok(`B[${W}] 横向顺序递增：名称 → 日期 → 类别 → 上映 → 评级`,
    r.name.right <= r.meta.left + 0.6 && r.meta.left <= r.date.left + 0.6 &&
    r.date.left < r.kind.left && r.kind.left < r.year.left && r.year.left < r.score.left,
    `${r.name.left} / ${r.meta.left} / ${r.date.left}<${r.kind.left}<${r.year.left}<${r.score.left}`);
  /* 第 63 轮：中英文之间留白 12px，单行时正文块高 = 名称 + 12 + 英文名 */
  ok(`B[${W}] 正文块尺寸正确（单行 = 名称+12+英文名 / 折行时 = 再加一行评语）`,
    (noteSameLine ? Math.abs(r.bodyH - (r.name.h + 12 + r.en.h)) < 0.6
      : Math.abs(r.bodyH - (r.name.h + 12 + r.en.h + 6 + r.note.h)) < 0.8) && r.overflow === 0,
    `bodyH=${r.bodyH} noteSameLine=${noteSameLine}`);
  /* 第 64 轮：时间轴文字统一 +4px */
  ok(`B[${W}] 字号 21 / 18.5 / 19（第 64 轮 +4px）`, r.name.fs === '21px' && r.date.fs === '18.5px' && r.note.fs === '19px',
    `${r.name.fs} ${r.date.fs} ${r.note.fs}`);
  ok(`B[${W}] 文本内容正确`, r.name.text === it0.title && r.en.text === it0.title_en &&
    r.date.text === it0.watched_at && r.kind.text === (KIND[it0.kind] || '电影') &&
    /* 第 66 轮：上映优先完整日期 release_date；评级统一一位小数（9 → 9.0） */
    r.year.text === (it0.release_date ? String(it0.release_date) : String(it0.year)) &&
    r.score.text === '★' + Number(it0.rating).toFixed(1) && r.note.text === it0.note,
    [r.name.text, r.en.text, r.date.text, r.kind.text, r.year.text, r.score.text, r.note.text].join(' | '));
  /* 第 66 轮：真实数据里上映写了完整日期（2026-02-14），861~1000px 一行装不下时
     由评语承担收缩（设计如此）→ 判据从「必须全文」放宽为「完整在一行内、省略号生效、title 有全文」 */
  /* 第 66 轮：评语要么与四项同一行（够宽全文 / 不够宽省略号），要么在 ≤860 整段折到下一行 */
  ok(`B[${W}] 短评不丢字：title 有全文，且要么同行、要么整段折行`,
    r.noteTitle === it0.note &&
    ((r.note.top >= r.head.top - 0.6 && r.note.bottom <= r.head.bottom + 0.6) || r.note.top > r.meta.bottom - 0.6),
    `ellipsis=${r.noteEllipsis} title=${r.noteTitle === it0.note} note.top=${r.note.top}`);
}

console.log('\n== C 窄屏兜底（折行但英文名仍在名称正下方）==');
for (const W of [480, 390, 360]) {
  const r = await geo(W);
  ok(`C[${W}] 英文名仍在中文名正下方（同 left）且未与名称并排`,
    Math.abs(r.en.left - r.name.left) < 0.02 && r.en.top >= r.name.bottom - 0.6,
    `name.left=${r.name.left} en.left=${r.en.left}`);
  ok(`C[${W}] 无横向溢出（内容按行折开）`, r.overflow === 0, `overflow=${r.overflow}`);
  /* 第 64 轮：字号 +4 后 390/360 下四项在 238px 内会折成两行（`.tl-meta` 允许 wrap），
     不再要求「top 相同」，改判「四项全部落在 .tl-meta 区间内、不越出」 */
  ok(`C[${W}] 四项完整落在 .tl-meta 区间内（窄屏允许折行）`,
    [r.date, r.kind, r.year, r.score].every((x) => x.top >= r.meta.top - 0.6 && x.bottom <= r.meta.bottom + 0.6));
  ok(`C[${W}] 评语换到下一行（不挤压前缀）+ 文字不被裁切`,
    r.note.top > r.meta.bottom - 0.6,
    `meta.bottom=${r.meta.bottom} note.top=${r.note.top} ellipsis=${r.noteEllipsis}`);
}

/* ================= D 长评语 / 字段缺失 ================= */
console.log('\n== D 长评语与字段缺失 ==');
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
const errsD = [];
p.on('pageerror', (e) => errsD.push(String(e)));
await p.route('**/data/watch.json*', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
  updated_at: '2026-10-24T10:00:00+08:00', items: [
    { id: 'long', title: '长评语', title_en: 'Long Note', kind: 'movie', year: 2020, watched_at: '2026-10-02',
      rating: 9, note: Array(14).fill('这是一段特别长的评语用来验证同一行内会不会溢出容器').join('，') + '。',
      poster: 'img/minion-0ef9a202.webp' },
    { id: 'min', title: '只有片名', kind: 'movie', watched_at: '2026-10-01', poster: 'img/minion-0ef9a202.webp' },
  ] }) }));
await p.goto(BASE, { waitUntil: 'load' });
await p.waitForTimeout(500);
await p.click('#w-avatar');
await p.waitForTimeout(700);
const longs = await p.evaluate(() => {
  const items = [...document.querySelectorAll('#w-tl .tl-item')];
  const one = (name) => {
    const el = items.find((x) => (x.querySelector('.tl-name') || {}).textContent === name);
    if (!el) return null;
    const n = el.querySelector('.tl-note');
    return { itemH: +el.getBoundingClientRect().height.toFixed(2),
      hasEn: !!el.querySelector('.tl-en'), hasYear: !!el.querySelector('.tl-year'), hasScore: !!el.querySelector('.tl-score'),
      noteOverflow: n ? n.scrollWidth > Math.ceil(n.clientWidth) + 1 : null,
      noteH: n ? +n.getBoundingClientRect().height.toFixed(2) : null,
      bodyOverflowX: el.querySelector('.tl-body').scrollWidth - Math.ceil(el.querySelector('.tl-body').clientWidth) };
  };
  return { long: one('长评语'), min: one('只有片名'),
    pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
});
ok('D1 超长评语：同一行内省略显示（scrollWidth > clientWidth），不撑破布局',
  longs.long.noteOverflow === true && longs.long.noteH <= 30 && longs.pageOverflow === 0,   // 第 64 轮：评语 19px / 行高 1.5 = 28.5
  JSON.stringify(longs.long));
ok('D2 无英文名的条目：占位不塌（名称仍在原位、无空行）',
  longs.min.hasEn === false && longs.min.hasYear === false && longs.min.hasScore === false && longs.min.itemH < longs.long.itemH + 1,
  JSON.stringify(longs.min));
ok('D3 长评语 / 缺字段场景零 JS 异常', errsD.length === 0, errsD.join(' | '));
await ctx.close();
ok('D4 全程零 JS 异常', errs.length === 0, errs.join(' | '));

await browser.close();
console.log(`\n===== 第 62 轮回归：${pass}/${pass + fail} =====`);
process.exit(fail ? 1 : 0);
