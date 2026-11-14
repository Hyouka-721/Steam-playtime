/* 第 86 轮 watch 侧：视觉评审第三批（P2-1 颜色令牌 / P2-2 表单文案 / P2-3 圆角 / P3 动效）
   对 http://127.0.0.1:8895 跑。⚠️ 与 index 线的 verify86 不同文件（那边是游戏站热力图），本文件带 _watch 后缀。

   ① 静态：token 齐备 / 零颜色字面量残留 / 圆角只落 5 档 / 过渡只用 3 档 + 1 曲线 / 三处补的过渡 / 表单自绘按钮 / 文案
   ② 1440 运行时：令牌计算值生效、圆角计算值落档、缓动曲线一致、.w-btn 含 filter、表单无英文
   ③ 390 运行时：file 行不溢出、海报说明文字行数收敛
   ④ 守护：时间轴 21/18.5/19（第 64 轮）与无半像素字号（第 85 轮） */
import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire('C:/Users/33329/.workbuddy/binaries/node/workspace/');
const { chromium } = require('playwright');

const BASE = 'http://127.0.0.1:8895/';
const ROOT = 'C:/Users/33329/WorkBuddy/2026-10-13-18-17-49/steam-playtime/docs/';
const OUT = 'C:/Users/33329/AppData/Local/Temp/fx_verify_20261018/shots86v/';
fs.mkdirSync(OUT, { recursive: true });

/* 剥注释但保留换行，便于按行定位 */
const rawCss = fs.readFileSync(ROOT + 'watch.css', 'utf8').replace(/\r\n/g, '\n');
const css = rawCss.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
const html = fs.readFileSync(ROOT + 'watch.html', 'utf8');
const js = fs.readFileSync(ROOT + 'watch.js', 'utf8');

/* 变量块单独抠出来，剩下的才是「规则体」 */
const themeBlock = (css.match(/\[data-theme="cinema"\]\s*\{[^}]*\}/) || [''])[0];
const rulesOnly = css.replace(themeBlock, '');

const has = (s) => themeBlock.includes(s);
const ruleOf = (sel) => {
  const m = rulesOnly.match(new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}'));
  return m ? m[1] : '';
};

let pass = 0, fail = 0;
const ok = (n, c, extra = '') => {
  c ? (pass++, console.log(`PASS ${n}${extra ? '  — ' + extra : ''}`))
    : (fail++, console.log(`FAIL ${n}  — ${extra}`));
};

/* ================= A 静态 ================= */
console.log('== A 静态 ==');

ok('A1 版本号 v24（css）/ v16（js，本轮未动）',
  /watch\.css\?v=38/.test(html) && /watch\.js\?v=30/.test(html),
  (html.match(/watch\.(css|js)\?v=\d+/g) || []).join(' '));

const NEED_TOKENS = ['--text-soft', '--text-faint', '--well', '--img-bg', '--on-accent', '--danger',
  '--accent-wash', '--accent-edge', '--accent-line',
  '--r-xs', '--r-sm', '--r-md', '--r-lg', '--r-pill',
  '--t-1', '--t-2', '--t-3', '--ease'];
const missTok = NEED_TOKENS.filter((t) => !new RegExp(t.replace(/-/g, '\\-') + '\\s*:').test(themeBlock));
ok(`A2 新增 ${NEED_TOKENS.length} 个令牌全部定义在 [data-theme="cinema"] 里`, missTok.length === 0,
  missTok.length ? '缺 ' + missTok.join(' ') : `${NEED_TOKENS.length}/${NEED_TOKENS.length}`);

/* 这些值只允许出现在令牌定义里，规则体必须走 var() */
const LITERALS = ['#6a6a77', '#5b5b67', '#a8a8b4', '#0e0e12', '#0e0e13', '#1a1a22', '#1a1408', '#d65c5c',
  'rgba(232, 176, 75, 0.13)', 'rgba(232, 176, 75, 0.42)', 'rgba(232, 193, 90'];
const leftOver = LITERALS.filter((x) => rulesOnly.includes(x));
ok('A3 规则体里零颜色字面量残留（全部走 var()，同值只写一次）', leftOver.length === 0,
  leftOver.length ? '残留 ' + leftOver.join(' ') : `${LITERALS.length} 个值已归零`);

/* 圆角：只允许 5 档令牌 + 圆形 + 2px 竖线。
   ⚠️ :focus-visible 的圆角**不参与归一**：第 56 轮 verify56 把头像/站名的焦点环钉成跨页契约
      （与首页 .header-avatar / .site-title 逐字一致），而 index 线不会跟着 token 化。 */
const noFocus = rulesOnly.replace(/[\w-]+:focus-visible\s*\{[^}]*\}/g, '');
/* 第 89 轮：伪元素的 `border-radius: inherit` **不是新档位** —— 它复制的是父元素已经落档的
   令牌值（软边底盘曾用它跟住胶囊圆角）。第 89 轮迭代后底盘已彻底删除，但保留这条剔除：
   以后伪元素再引入 inherit / 其它写法时，真元素的「只落 5 档令牌」契约仍不被稀释。 */
const noPseudo = noFocus.replace(/[\w-]+(?:::before|::after)\s*\{[^}]*\}/g, '');
const radii = [...noPseudo.matchAll(/border-radius:\s*([^;]+);/g)].map((m) => m[1].trim());
const OK_RADII = new Set(['var(--r-xs)', 'var(--r-sm)', 'var(--r-md)', 'var(--r-lg)', 'var(--r-pill)', '50%', '2px']);
const badRadii = [...new Set(radii.filter((v) => !OK_RADII.has(v)))];
ok(`A4 圆角（:focus-visible 除外）只落 5 档令牌 + 50% + 2px（共 ${radii.length} 处，改前 26 处 / 12 种写法）`,
  badRadii.length === 0, badRadii.length ? '越档 ' + badRadii.join(' | ') : `${new Set(radii).size} 种写法`);

/* 过渡：时长只允许 --t-1/2/3，曲线只允许 --ease。
   ⚠️ .w-avatar 主规则的 transition 同样被跨页契约钉死（首页 .header-avatar 是 .18s ease），剔除后再统计 */
const noAvatar = rulesOnly.replace(/\.w-avatar\s*\{[^}]*\}/g, '');
const trs = [...noAvatar.matchAll(/transition:\s*([^;]+);/g)].map((m) => m[1]);
const durTokens = new Set();
trs.forEach((t) => { (t.match(/--t-[123]/g) || []).forEach((d) => durTokens.add(d)); });
const bareDur = trs.filter((t) => /\b\d*\.?\d+m?s\b/.test(t) && !/\.01ms/.test(t));
const bareEase = trs.filter((t) => /\bease(-in|-out|-in-out)?\b/.test(t) && !/var\(--ease\)/.test(t));
ok('A5 过渡时长只用 --t-1 / --t-2 / --t-3 三档（改前 8 档：.16/.18/.2/.22/.24/.28/.3/.35）',
  bareDur.length === 0 && durTokens.size === 3 && trs.every((t) => t.includes('var(--t-')),
  bareDur.length ? '裸时长 ' + bareDur.slice(0, 3).join(' | ') : `${trs.length} 条过渡，用到 ${[...durTokens].join('/')}`);

ok('A6 缓动只有一条 --ease = cubic-bezier(0.22, 0.68, 0.28, 1)，无裸 ease',
  /--ease:\s*cubic-bezier\(0\.22, 0\.68, 0\.28, 1\);/.test(themeBlock) && bareEase.length === 0,
  bareEase.length ? '裸曲线 ' + bareEase.slice(0, 2).join(' | ') : 'ok');

const btnRule = ruleOf('.w-btn');
ok('A7 .w-btn 的过渡补上了 filter（主按钮 hover 用 brightness，改前不在列表里 → 瞬变）',
  /transition:[^;]*filter/.test(btnRule), (btnRule.match(/transition:[^;]*/) || [''])[0].slice(0, 90));

ok('A8 .tl-name 与 .w-foot a 补上过渡（这两处 hover 改颜色，改前是瞬变）',
  /transition:\s*color var\(--t-1\)/.test(ruleOf('.tl-name')) && /transition:/.test(ruleOf('.w-foot a')),
  `tl-name=${/transition:/.test(ruleOf('.tl-name'))} foota=${/transition:/.test(ruleOf('.w-foot a'))}`);

ok('A9 .w-hint 走 --text-faint（不再是裸露的灰），.w-req「必填」标记仍在',
  /\.w-hint\s*\{[^}]*var\(--text-faint\)/.test(rulesOnly) && /\.w-req\s*\{/.test(rulesOnly) && /class="w-req"/.test(html));

ok('A10 文件选择改成自绘：HTML 有 .w-file-btn 与 .w-file-name，input 用 clip 隐藏且有 [hidden] 联动',
  /class="w-file-btn"[^>]*for="add-poster"/.test(html) && /id="add-poster-name"/.test(html)
  && /\.w-file\s*\{[^}]*clip:\s*rect\(0 0 0 0\)/.test(rulesOnly)
  && /#add-poster\[hidden\]\s*~\s*\.w-file-btn/.test(rulesOnly),
  'label+名字+clip+联动');

const tipTxt = (html.match(/id="add-poster-tip">([^<]*)</) || [, ''])[1];
/* 第 100 轮改判（用户明确要求删掉国别与标签的说明文字，非调阈值）：
   A11 从「标签有『逗号或顿号分隔』」改成「两处说明小字都已删、label 只留字段名」；
   海报提示与 .w-token-tip 行高这两条第 86 轮原始契约继续守。 */
ok('A11 第 100 轮：国别/标签说明文字已删，海报提示仍砍掉技术细节、.w-token-tip 行高 1.55',
  !/逗号或顿号分隔/.test(html) &&
  /for="add-country">国别<\/label>/.test(html) && /for="add-tags">标签<\/label>/.test(html) &&
  !/宽 640/.test(tipTxt) && /\.w-token-tip\s*\{[^}]*line-height:\s*1\.55/.test(rulesOnly),
  tipTxt.slice(0, 40));

ok('A12 第 85 轮守卫仍成立：无半像素字号；第 64 轮时间轴 21 / 18.5 / 19 未被本轮回溯',
  !/(11|12|13|14)\.5px/.test(css)
  && /\.tl-name\s*\{[^}]*font-size:\s*21px/.test(css)
  && /\.tl-note\s*\{[^}]*font-size:\s*19px/.test(css),
  '无半像素档 + 时间轴原档');

/* 第 56 轮跨页契约：头像 / 站名的 transition 与 focus-visible 圆角保持字面量，且与首页一致 */
const styleCss = fs.readFileSync(ROOT + 'style.css', 'utf8').replace(/\r\n/g, '\n');
const hda = (styleCss.match(/\.header-avatar \{[^}]*\}/) || [''])[0];
const wavBody = ruleOf('.w-avatar');
ok('A13 跨页契约（第 56 轮 verify56）：头像 transition 与 focus-visible 圆角不参与归一，且与首页 .header-avatar 逐字一致',
  /transition: transform \.18s ease;/.test(wavBody) && /transition: transform \.18s ease;/.test(hda)
  && /border-radius: 12px;/.test(ruleOf('.w-avatar:focus-visible'))
  && /border-radius: 12px;/.test((styleCss.match(/\.header-avatar:focus-visible \{[^}]*\}/) || [''])[0])
  && /border-radius: 8px;/.test(ruleOf('.w-title:focus-visible'))
  && /border-radius: 8px;/.test((styleCss.match(/\.site-title:focus-visible \{[^}]*\}/) || [''])[0]),
  'avatar .18s ease / 焦点环 12·8');

/* ================= 运行时工具 ================= */
/* ⚠️ 所有套件统一 --no-proxy-server：本机代理会把 127.0.0.1 也劫走，goto 直接超时 */
const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const openAt = async (w, h) => {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  const puts = [], errs = [];
  p.on('request', (r) => { if (r.method() === 'PUT') puts.push(r.url()); });
  p.on('pageerror', (e) => errs.push(String(e)));
  p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await p.goto(BASE + 'watch.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(400);
  return { ctx, p, puts, errs };
};

/* ================= B 1440 ================= */
console.log('\n== B 1440 桌面 ==');
{
  const { ctx, p, puts, errs } = await openAt(1440, 950);
  const d = await p.evaluate(() => {
    const cs = (s) => { const e = document.querySelector(s); return e ? getComputedStyle(e) : null; };
    const note = cs('.poster-note'), tlNote = cs('.tl-note');
    const rad = (s) => { const c = cs(s); return c ? c.borderTopLeftRadius : null; };
    return {
      noteColor: note && note.color,
      tlNoteColor: tlNote ? tlNote.color : '(时间轴未开)',
      radii: {
        posterPic: rad('.poster-pic'), score: rad('.poster-score'), seg: rad('.w-seg'),
      },
      easeSeg: (cs('.w-seg-btn') || {}).transitionTimingFunction,
      easeFab: (cs('.w-fab') || {}).transitionTimingFunction,
      btnProps: (cs('.w-btn') || { transitionProperty: '' }).transitionProperty,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  ok('B1 令牌真的生效：短评 / 时间轴评语 = rgb(168,168,180)（--text-soft）',
    d.noteColor === 'rgb(168, 168, 180)', `poster-note=${d.noteColor} tl-note=${d.tlNoteColor}`);

  const R_OK = { '12px': 0, '999px': 0, '8px': 0, '18px': 0, '6px': 0 };
  const rOk = Object.values(d.radii).every((v) => R_OK[v] === 0);
  ok('B2 圆角计算值全部落在 6/8/12/18/999 五档（海报 12、评分牌 999、段控件 12）',
    rOk, JSON.stringify(d.radii));

  /* 一个元素可能同时过渡多个属性 → computed 会返回用逗号分隔的多段曲线，逐段比对 */
  const sameEase = (s) => {
    const parts = String(s || '').match(/cubic-bezier\([^)]*\)/g) || [];
    return parts.length > 0 && parts.every((x) => x === 'cubic-bezier(0.22, 0.68, 0.28, 1)');
  };
  ok('B3 缓动计算值统一为 cubic-bezier(0.22, 0.68, 0.28, 1)（改前全是 ease）',
    sameEase(d.easeSeg) && sameEase(d.easeFab),
    `seg=${d.easeSeg} fab=${d.easeFab}`);

  ok('B4 主按钮 transitionProperty 含 filter（这是第 86 轮修掉的瞬变）',
    /\bfilter\b/.test(d.btnProps), d.btnProps);

  /* 表单 */
  await p.click('.w-fab', { force: true });
  await p.waitForSelector('#add-title', { timeout: 15000 });
  await p.waitForTimeout(400);
  const f = await p.evaluate(() => {
    const btn = document.querySelector('.w-file-btn');
    const name = document.getElementById('add-poster-name');
    const row = document.querySelector('.w-file-row');
    const hint = document.querySelector('.w-hint');
    const tip = document.getElementById('add-poster-tip');
    const b = btn && btn.getBoundingClientRect();
    return {
      btnText: btn ? btn.textContent.trim() : '',
      btnVisible: !!b && b.width > 0 && b.height > 0,
      nameText: name ? name.textContent.trim() : '',
      rowH: row ? +row.getBoundingClientRect().height.toFixed(1) : 0,
      hintColor: hint ? getComputedStyle(hint).color : '',
      tipLines: tip ? +(tip.getBoundingClientRect().height / parseFloat(getComputedStyle(tip).lineHeight)).toFixed(2) : 0,
      bodyHasEnglish: /Choose File|No file chosen/i.test(document.body.innerText),
      dlgRadius: getComputedStyle(document.querySelector('.w-add')).borderTopLeftRadius,
      inputRadius: getComputedStyle(document.getElementById('add-title')).borderTopLeftRadius,
    };
  });
  ok('B5 表单：自绘「选择海报」按钮可见、「未选择文件」就位，页面再无 Choose File / No file chosen',
    f.btnVisible && f.btnText === '选择海报' && f.nameText === '未选择文件' && !f.bodyHasEnglish,
    `btn=${f.btnText} / name=${f.nameText} / 英文残留=${f.bodyHasEnglish}`);
  ok('B6 表单：.w-hint 走 --text-faint（rgb(106,106,119)）、弹窗圆角 18、输入框圆角 8、无横向溢出',
    f.hintColor === 'rgb(106, 106, 119)' && f.dlgRadius === '18px' && f.inputRadius === '8px' && d.overflow === 0,
    `hint=${f.hintColor} dlg=${f.dlgRadius} input=${f.inputRadius} overflow=${d.overflow}`);
  ok('B7 1440 全程 0 次 PUT + 零 JS 异常', puts.length === 0 && errs.length === 0,
    `PUT ${puts.length} / err ${errs.length}`);
  await p.locator('.w-add').screenshot({ path: OUT + 'form_1440.png' }).catch(() => {});
  await ctx.close();
}

/* ================= C 390 ================= */
console.log('\n== C 390 窄屏 ==');
{
  const { ctx, p, errs } = await openAt(390, 844);
  await p.click('.w-fab', { force: true });
  await p.waitForSelector('#add-title', { timeout: 15000 });
  await p.waitForTimeout(400);
  const d = await p.evaluate(() => {
    const r = (s) => { const e = document.querySelector(s); return e && e.getBoundingClientRect(); };
    const row = r('.w-file-row'), btn = r('.w-file-btn'), name = r('.w-file-name');
    const tip = document.getElementById('add-poster-tip');
    const tipCs = getComputedStyle(tip);
    return {
      rowInside: !!row && row.width <= document.querySelector('.w-pick-tip').getBoundingClientRect().width + 1,
      noOverlap: !!btn && !!name && btn.right <= name.left + 1,
      btnW: btn ? +btn.width.toFixed(1) : 0,
      nameClipped: (() => { const e = document.querySelector('.w-file-name'); return e ? e.scrollWidth > e.clientWidth + 1 : false; })(),
      tipLines: +(tip.getBoundingClientRect().height / parseFloat(tipCs.lineHeight)).toFixed(2),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  ok('C1 390：文件行不出容器、按钮与文件名不重叠', d.rowInside && d.noOverlap,
    `btnW=${d.btnW} rowInside=${d.rowInside} noOverlap=${d.noOverlap}`);
  ok(`C2 390：海报说明文字折行收敛（${d.tipLines} 行，改前 4 行）`, d.tipLines <= 3,
    `tipLines=${d.tipLines} nameClipped=${d.nameClipped}`);
  ok('C3 390：无横向溢出 + 零 JS 异常', d.overflow === 0 && errs.length === 0,
    `overflow=${d.overflow} / err ${errs.length}`);
  await p.locator('.w-add').screenshot({ path: OUT + 'form_390.png' }).catch(() => {});
  await ctx.close();
}

/* ================= D 守护 ================= */
console.log('\n== D 时间轴守护 ==');
{
  const { ctx, p } = await openAt(1440, 900);
  await p.click('#w-avatar');
  await p.waitForSelector('#w-tl .tl-item', { timeout: 25000 }).catch(() => {});
  await p.waitForTimeout(600);
  const d = await p.evaluate(() => {
    const it = document.querySelector('#w-tl .tl-item');
    if (!it) return null;
    const g = (s) => parseFloat(getComputedStyle(it.querySelector(s)).fontSize);
    return {
      name: g('.tl-name'), en: g('.tl-en'), note: g('.tl-note'),
      noteColor: getComputedStyle(it.querySelector('.tl-note')).color,
      nameTr: getComputedStyle(it.querySelector('.tl-name')).transitionDuration,
      radius: getComputedStyle(it).borderTopLeftRadius,
    };
  });
  ok('D1 时间轴 21 / 18.5 / 19 字号未变；评语走 --text-soft；片名过渡 0.16s；条目圆角 12',
    !!d && d.name === 21 && d.en === 18.5 && d.note === 19
    && d.noteColor === 'rgb(168, 168, 180)' && d.nameTr === '0.16s' && d.radius === '12px',
    d ? `${d.name}/${d.en}/${d.note} color=${d.noteColor} tr=${d.nameTr} r=${d.radius}` : '时间轴未渲染');
  await ctx.close();
}

await browser.close();
console.log(`\n===== 第 86 轮 watch 回归：PASS ${pass} / FAIL ${fail} =====`);
process.exit(fail === 0 ? 0 : 1);
