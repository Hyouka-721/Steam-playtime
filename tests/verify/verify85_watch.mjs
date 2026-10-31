/* 第 85 轮 watch 侧回归：视觉评审第二批 P1（字阶归一 / 片名单行省略 / 评分牌加边）

   三条改动各守什么：
   ① P1-1 字阶归一：11.5 / 12.5 / 13.5 / 14.5 这四个半像素档并入 12 / 12 / 13 / 14，
      全文件不再出现 `font-size: (11|12|13|14).5px`。⚠️ 但 `.tl-*` 的 18.5px 是第 64 轮
      「字号统一 +4」定下的契约（21 / 18.5 / 19），**不在归一范围**，A6 反向守着。
   ② P1-2 片名单行省略：1440 下 121 部里只有 2 部会折两行，但那一排的短评起始位置会低一整行
      （19.6px）→ 改单行后同排短评对齐。≤480 恢复两行 clamp（390 下有 23 部折行）。
   ③ P1-3 评分牌加 1px 金边：原来只有半透明黑底，压在浅色海报上边缘糊掉。

   写法约定：静态断言读 docs/watch.css 原文（**先剥注释**）；运行时走本地 8895。 */
import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const BASE = 'http://127.0.0.1:8895/';
const ROOT = 'C:/Users/33329/WorkBuddy/2026-10-13-18-17-49/steam-playtime/docs/';
const OUT = 'C:/Users/33329/AppData/Local/Temp/fx_verify_20261018/shots85/';
fs.mkdirSync(OUT, { recursive: true });

let pass = 0, fail = 0;
const ok = (n, c, extra = '') => {
  c ? (pass++, console.log(`PASS ${n}${extra ? '  — ' + extra : ''}`))
    : (fail++, console.log(`FAIL ${n}  — ${extra}`));
};

/* ---------- A 静态指纹 ---------- */
console.log('== A 静态指纹 ==');
const html = fs.readFileSync(ROOT + 'watch.html', 'utf8');
const rawCss = fs.readFileSync(ROOT + 'watch.css', 'utf8');
/* ⚠️ 必须先剥注释：注释里若出现选择器字面量，正则会把注释当规则体（第 84 轮的坑） */
const css = rawCss.replace(/\/\*[\s\S]*?\*\//g, '');
const rule = (sel, scope = css) => {
  const m = scope.match(new RegExp('\\' + sel.replace(/^\./, '.') + '\\s*\\{([^}]*)\\}'));
  return m ? m[1] : '';
};
const baseCss = css.slice(0, css.indexOf('@media'));           // 默认规则（首个 @media 之前）
const i480 = css.indexOf('@media (max-width: 480px)');
const b480 = css.slice(i480, css.indexOf('@media', i480 + 10));

ok('A1 watch.html 引用 watch.css?v=23 / watch.js?v=16（js 本轮未动）',
  /watch\.css\?v=23/.test(html) && /watch\.js\?v=16/.test(html),
  (html.match(/watch\.(css|js)\?v=\d+/g) || []).join(' '));

const halfPx = css.match(/font-size:\s*(?:11|12|13|14)\.5px/g) || [];
ok('A2 全文件不再有 11.5 / 12.5 / 13.5 / 14.5 半像素字号（并入整数档）',
  halfPx.length === 0, halfPx.join(' '));

const pn = rule('.poster-name', baseCss);
ok('A3 默认 .poster-name 单行省略（nowrap + ellipsis，且无 -webkit-line-clamp）',
  /white-space:\s*nowrap/.test(pn) && /text-overflow:\s*ellipsis/.test(pn) && !/-webkit-line-clamp/.test(pn),
  pn.replace(/\s+/g, ' ').slice(0, 110));

const pn480 = rule('.poster-name', b480);
ok('A4 ≤480 块内 .poster-name 恢复两行 clamp（390 下 23 部会折行，不能砍信息）',
  /-webkit-line-clamp:\s*2/.test(pn480) && /white-space:\s*normal/.test(pn480),
  pn480.replace(/\s+/g, ' ').slice(0, 110));

const sc = rule('.poster-score', baseCss);
ok('A5 .poster-score 有 1px 描边，且 padding 收到 1px 7px 抵消边框占位',
  /border:\s*1px solid/.test(sc) && /padding:\s*1px 7px/.test(sc),
  sc.replace(/\s+/g, ' ').slice(0, 120));

/* 反守卫：第 62/64 轮定的时间轴字号一个都不许被「字阶归一」顺手改掉。
   ⚠️ 这四条规则位于 465 行之后（第一个 @media 在 455 行），**不能拿 baseCss 查**，
      必须用剥注释后的全文；hover 规则里没有 font-size，正则不会误取。 */
const tlName = rule('.tl-name', css);
const tlEn = rule('.tl-en', css);
const tlMeta = rule('.tl-meta', css);
const tlNote = rule('.tl-note', css);
ok('A6 时间轴 21 / 18.5 / 18.5 / 19 四档未被归一（第 64 轮契约）',
  /font-size:\s*21px/.test(tlName) && /font-size:\s*18\.5px/.test(tlEn)
  && /font-size:\s*18\.5px/.test(tlMeta) && /font-size:\s*19px/.test(tlNote),
  [tlName, tlEn, tlMeta, tlNote].map((s) => (s.match(/font-size:\s*[\d.]+px/) || ['?'])[0]).join(' | '));

ok('A7 .poster-date 桌面 12px / 窄屏 11px（窄屏再收一档是第 66 轮的有意设计）',
  /font-size:\s*12px/.test(rule('.poster-date', baseCss))
  && /font-size:\s*11px/.test(rule('.poster-date', b480)));

ok('A8 .poster-note 12px（原 12.5 归一到 12）',
  /font-size:\s*12px/.test(rule('.poster-note', baseCss)), rule('.poster-note', baseCss).slice(0, 60));

/* ---------- B/C 运行时 ---------- */
const browser = await chromium.launch({ args: ['--no-proxy-server'] });

const run = async (W, H) => {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e)));
  await p.goto(BASE + 'watch.html', { waitUntil: 'load' });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForFunction(() => document.querySelectorAll('#w-grid .poster').length > 20, null, { timeout: 30000 }).catch(() => {});
  await p.waitForTimeout(500);
  const data = await p.evaluate(() => {
    const cards = [...document.querySelectorAll('#w-grid .poster')];
    const rows = cards.map((c) => {
      const n = c.querySelector('.poster-name');
      const note = c.querySelector('.poster-note');
      const score = c.querySelector('.poster-score');
      const pic = c.querySelector('.poster-pic');
      const cs = getComputedStyle(n);
      const lh = parseFloat(cs.lineHeight);
      const sRect = score.getBoundingClientRect();
      const pRect = pic.getBoundingClientRect();
      return {
        cardTop: Math.round(c.getBoundingClientRect().top),
        name: n.textContent.trim(),
        nameH: +n.getBoundingClientRect().height.toFixed(1),
        lineH: +lh.toFixed(1),
        lines: +(n.getBoundingClientRect().height / lh).toFixed(2),
        clipped: n.scrollWidth > n.clientWidth + 1,
        overflowX: cs.textOverflow,
        noteTop: +note.getBoundingClientRect().top.toFixed(1),
        scoreBorder: getComputedStyle(score).borderTopWidth,
        scoreFont: parseFloat(getComputedStyle(score).fontSize),
        scoreInside: sRect.right <= pRect.right + 0.6 && sRect.bottom <= pRect.bottom + 0.6
          && sRect.left >= pRect.left - 0.6 && sRect.top >= pRect.top - 0.6,
      };
    });
    const groups = new Map();
    rows.forEach((r) => { const g = groups.get(r.cardTop) || []; g.push(r.noteTop); groups.set(r.cardTop, g); });
    const rowSpread = [...groups.values()].map((v) => +(Math.max(...v) - Math.min(...v)).toFixed(1));
    return {
      n: rows.length,
      rows,
      worstSpread: Math.max(...rowSpread),
      multiLine: rows.filter((r) => r.lines > 1.5).length,
      clipped: rows.filter((r) => r.clipped).map((r) => r.name),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  await p.screenshot({ path: OUT + `P1_${W}.png` });
  await ctx.close();
  return { data, errs };
};

console.log('\n== B 1440 桌面：单行 + 同排短评对齐 + 评分牌描边 ==');
{
  const { data, errs } = await run(1440, 950);
  const multi = data.rows.filter((r) => r.lines > 1.2);
  ok(`B1 全部 ${data.n} 张卡片片名都是单行（行数 ≤1.2，改前有 2 张是两行）`,
    multi.length === 0, multi.map((r) => `${r.name}:${r.lines} 行`).slice(0, 3).join(' '));

  ok('B2 同一行内短评起始位置严格对齐（rows 内 max−min ≤0.5px；改前含长名的那排差 19.6px）',
    data.worstSpread <= 0.5, `最差 ${data.worstSpread}px`);

  ok(`B3 超长片名确实走省略号（${data.clipped.length} 张 clipped，text-overflow=ellipsis）`,
    data.clipped.length > 0 && data.rows.filter((r) => r.clipped).every((r) => r.overflowX === 'ellipsis'),
    data.clipped.slice(0, 3).join(' / '));

  const s = data.rows[0];
  ok('B4 评分牌 computed 1px 描边 + 字号 ≥13px（视觉不变小）',
    data.rows.every((r) => r.scoreBorder === '1px') && s.scoreFont >= 13,
    `${s.scoreBorder} / ${s.scoreFont}px`);
  ok('B5 1440 无横向溢出 + 零 JS 异常', data.overflow === 0 && errs.length === 0,
    `overflow ${data.overflow} / err ${errs.length}`);
}

console.log('\n== C 390 窄屏：两行 clamp 仍生效 + 评分牌不越界 ==');
{
  const { data, errs } = await run(390, 844);
  ok(`C1 窄屏仍有片名折两行（${data.multiLine} 张两行，clamp 生效而不是被单行规则带走）`,
    data.multiLine > 0, `multiLine ${data.multiLine}`);
  ok('C2 评分牌完全落在海报矩形内（描边没有把它顶出去）',
    data.rows.every((r) => r.scoreInside), `越界 ${data.rows.filter((r) => !r.scoreInside).length} 张`);
  ok('C3 390 无横向溢出 + 零 JS 异常', data.overflow === 0 && errs.length === 0,
    `overflow ${data.overflow} / err ${errs.length}`);
}

await browser.close();
console.log(`\n===== 第 85 轮（watch · 第二批 P1）：PASS ${pass} / FAIL ${fail} =====`);
process.exit(fail === 0 ? 0 : 1);
