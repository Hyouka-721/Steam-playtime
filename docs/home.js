/* ============================================================================
   门户主页 · home.js   v=2
   第 137 轮新增 —— 三种取句方式：
     ① 今日签：默认，按日期做稳定 hash 取模，同一天刷新不变、隔天自动换
     ② 点击换一句：点诗句随机换，避开当前句；结果写入 localStorage，刷新沿用
     ③ 刷新随机：把 localStorage 的 choice 清掉（或首访）即回到按日取句
   实际体验：进站每天一句 → 点一下换一句并记住 → 想回到"每日一句"就清掉 choice。
   v=2：加「近期不重复」——记住最近 KEEP 句（含页面刷新，存 localStorage），换句只在
     窗口外的句子中抽；修用户反馈的"刷新时撞见前几次刚出现过的"。
   🔴 独立文件，不碰两页；诗句数据只读 window.POEMS（poems.js）。
   ============================================================================ */
(function () {
  'use strict';

  var KEY = 'home.quote.choice';
  var RECENT_KEY = 'home.quote.recent';
  var KEEP = 12;                     // 最近 12 句内不重复；库远大于此，池子始终充足
  var poems = window.POEMS || [];
  var quoteEl = document.getElementById('home-quote');
  if (!poems.length || !quoteEl) return;

  /* 日期 → 稳定整数（FNV-1a 变体），保证同一天任何设备取到同一句 */
  function dayHash(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function todayKey() {
    var d = new Date();
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }
  function dailyIndex() { return dayHash(todayKey()) % poems.length; }

  function readChoice() {
    try {
      var v = localStorage.getItem(KEY);
      if (v === null || v === '') return null;
      var n = Number(v);
      return Number.isInteger(n) && n >= 0 && n < poems.length ? n : null;
    } catch (e) { return null; }   // 隐私模式读写抛错 → 静默回落今日签
  }
  function writeChoice(i) {
    try { localStorage.setItem(KEY, String(i)); } catch (e) {}
  }

  /* 最近出现过的索引（越靠后越新）。持久化 → 刷新页面也不会立刻重播刚才那几句。 */
  function readRecent() {
    try {
      var arr = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
      if (!Array.isArray(arr)) return [];
      return arr.filter(function (n) {
        return typeof n === 'number' && Number.isInteger(n) && n >= 0 && n < poems.length;
      }).slice(-KEEP);
    } catch (e) { return []; }
  }
  function writeRecent(arr) {
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(arr.slice(-KEEP))); } catch (e) {}
  }
  var recent = readRecent();
  function remember(i) {
    var at = recent.indexOf(i);
    if (at >= 0) recent.splice(at, 1);   // 同句不占两格
    recent.push(i);
    if (recent.length > KEEP) recent.shift();
    writeRecent(recent);
  }

  /* 渲染：「句子」- 作者；无作者时省掉 "- 作者"；\n 由 CSS white-space:pre-line 换行。
     第 137 轮格式：」与 - 紧贴（」自带留白），- 后空一格再接作者 →「句」- 作者 */
  function render(i) {
    var row = poems[i];
    var text = '「' + row[0] + '」';
    quoteEl.textContent = '';
    quoteEl.appendChild(document.createTextNode(text));
    if (row[1]) {
      var by = document.createElement('span');
      by.className = 'by';
      by.textContent = '- ' + row[1];
      quoteEl.appendChild(by);
    }
    quoteEl.setAttribute('data-index', String(i));
  }

  var current = readChoice();
  if (current === null) current = dailyIndex();
  remember(current);                 // 首屏这句也算"刚出现过"
  render(current);

  /* 点击 / 键盘换一句：从"最近 KEEP 句之外"的池子里抽；池子被抽空才退回"非当前句" */
  function next(fromKeyboard) {
    if (fromKeyboard) { /* 通道不同，行为一致 */ }
    var i;
    if (poems.length === 1) i = 0;
    else {
      var pool = [];
      for (var k = 0; k < poems.length; k++) {
        /* 排除最近出现过的、以及当前这句（双保险，防止"点了没变化"） */
        if (recent.indexOf(k) === -1 && k !== current) pool.push(k);
      }
      if (!pool.length) {            // 库比 KEEP 还小：退化为"不重复当前句"
        for (var m = 0; m < poems.length; m++) if (m !== current) pool.push(m);
      }
      i = pool[Math.floor(Math.random() * pool.length)];
      if (i === undefined) i = (current + 1) % poems.length;
    }
    current = i;
    writeChoice(i);
    remember(i);
    render(i);
  }
  quoteEl.addEventListener('click', function () { next(false); });
  quoteEl.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); next(true); }
  });

  /* 暴露给回归套件：验证三种取句方式；不影响正常用户 */
  window.__home = {
    count: poems.length,
    dailyIndex: dailyIndex,
    currentIndex: function () { return current; },
    choiceKey: KEY,
    reset: function () {
      try { localStorage.removeItem(KEY); localStorage.removeItem(RECENT_KEY); } catch (e) {}
      recent = [];
    },
    setChoice: function (i) { writeChoice(i); },
    recentIndices: function () { return recent.slice(); },
    keep: KEEP,
    next: next
  };
})();
