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
const blk = (s, q) => { const i = s.indexOf(q); if (i < 0) return ''; const st = s.indexOf('{', i); let d = 0, j = st; for (; j < s.length; j++) { if (s[j] === '{') d++; else if (s[j] === '}') { d--; if (d === 0) break; } } return s.slice(st + 1, j); };

/* ================= A 静态 ================= */
console.log('== A 静态：允许收缩 ==');
const head = (cssNC.match(/\.tl-head \{([^}]*)\}/) || [, ''])[1];
ok('A1 .tl-head flex: 0 1 auto（可收缩，超长英文名才折行而不是顶宽）', /flex: 0 1 auto/.test(head), head.replace(/\s+/g, ' ').trim());
const meta = (cssNC.match(/\.tl-meta \{([^}]*)\}/) || [, ''])[1];
ok('A2 .tl-meta flex: 0 1 auto + flex-wrap: wrap + min-width: 0',
  /flex: 0 1 auto/.test(meta) && /flex-wrap: wrap/.test(meta) && /min-width: 0/.test(meta));
const b480 = blk(cssNC, '@media (max-width: 480px)');
ok('A3 ≤480px：.tl-head 与 .tl-meta 都独占一行（1 1 100%）',
  /\.tl-head \{ flex: 1 1 100%; \}/.test(b480) && /\.tl-meta \{ flex: 1 1 100%; \}/.test(b480));
ok('A4 版本号 bump：watch.css?v=17', /watch\.css\?v=17"/.test(html));

/* ================= B 浏览器 ================= */
const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const errs = [];
const ov = async (W, opts = {}) => {
  const ctx = await browser.newContext({ viewport: { width: W, height: 900 } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(`${W}:${e}`));
  if (opts.mock) await p.route('**/data/watch.json*', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(opts.mock) }));
  await p.goto(BASE, { waitUntil: 'load' });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(600);
  await p.click('#w-avatar');
  await p.waitForTimeout(700);
  const r = await p.evaluate(() => {
    const items = [...document.querySelectorAll('#w-tl .tl-item')];
    const widest = items.map((el) => {
      const b = el.querySelector('.tl-body');
      const en = el.querySelector('.tl-en');
      return { title: (el.querySelector('.tl-name') || {}).textContent || '',
        bodyX: b ? b.scrollWidth - Math.ceil(b.clientWidth) : 0,
        enLines: en ? Math.round(en.getBoundingClientRect().height / parseFloat(getComputedStyle(en).lineHeight)) : 0 };
    }).sort((a, b) => b.bodyX - a.bodyX);
    return { pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      n: items.length, worst: widest[0], worstByEn: widest.slice().sort((a, b) => b.enLines - a.enLines)[0] };
  });
  await ctx.close();
  return r;
};

console.log('\n== B 真实数据（16 条，含 42 字符英文名）==');
for (const W of [1440, 1100, 860, 480, 390, 360]) {
  const r = await ov(W);
  ok(`B[${W}] 整页无横向溢出（${r.n} 条，最宽条目正文溢出 ${r.worst.bodyX}）`,
    r.pageOverflow === 0 && r.worst.bodyX <= 0, `pageOverflow=${r.pageOverflow}`);
}

console.log('\n== C 极端数据：超长英文名 / 无连字符长单词 ==');
const LONG = {
  updated_at: '2026-10-24T10:00:00+08:00',
  items: [
    { id: 'l1', title: '三块广告牌', title_en: 'Three Billboards Outside Ebbing Missouri', kind: 'movie',
      year: 2017, watched_at: '2026-10-20', rating: 9, note: '一个母亲的执拗',
      poster: 'img/watch/dead-to-rights-5fbb0d46.webp' },
    { id: 'l2', title: '无连字符超长词', title_en: 'Supercalifragilisticexpialidociousandmorelettershere',
      kind: 'movie', year: 2020, watched_at: '2026-10-19', rating: 7, note: '测试无空格长单词',
      poster: 'img/watch/dead-to-rights-5fbb0d46.webp' },
    { id: 'l3', title: '超长中文片名测试用例很长的标题', title_en: '', kind: 'series', year: 2021,
      watched_at: '2026-10-18', rating: 8, note: '中文片名也很长的一段话用来占位测试布局是否会被顶宽',
      poster: 'img/watch/dead-to-rights-5fbb0d46.webp' },
  ],
};
for (const W of [1440, 860, 390, 360]) {
  const r = await ov(W, { mock: LONG });
  ok(`C[${W}] 超长英文名 / 无空格长词 / 超长中文片名：整页无横向溢出`,
    r.pageOverflow === 0 && r.worst.bodyX <= 0,
    `pageOverflow=${r.pageOverflow} worstBodyX=${r.worst.bodyX} worstByEn=${r.worstByEn.title || '-'}(${r.worstByEn.enLines} 行)`);
}
const narrow = await ov(390, { mock: LONG });
ok('C* 390px 下超长英文名确实折成多行（未靠溢出解决）', narrow.worstByEn.enLines >= 2,
  `${narrow.worstByEn.enLines} 行`);

ok('D1 全程零 JS 异常', errs.length === 0, errs.join(' | '));

await browser.close();
console.log(`\n===== 第 65 轮回归：${pass}/${pass + fail} =====`);
process.exit(fail ? 1 : 0);
