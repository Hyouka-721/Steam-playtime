/* ============================================================================
   门户主页 · home.js   v=1
   第 137 轮新增 —— 三种取句方式：
     ① 今日签：默认，按日期做稳定 hash 取模，同一天刷新不变、隔天自动换
     ② 点击换一句：点诗句随机换，避开当前句；结果写入 localStorage，刷新沿用
     ③ 刷新随机：把 localStorage 的 choice 清掉（或首访）即回到按日取句
   实际体验：进站每天一句 → 点一下换一句并记住 → 想回到"每日一句"就清掉 choice。
   🔴 独立文件，不碰两页；诗句数据只读 window.POEMS（poems.js）。
   ============================================================================ */
(function () {
  'use strict';

  var KEY = 'home.quote.choice';
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
  render(current);

  /* 点击 / 键盘换一句：随机且避开当前；只有一句时不重复无意义 */
  function next(fromKeyboard) {
    if (fromKeyboard) { /* 通道不同，行为一致 */ }
    var i;
    if (poems.length === 1) i = 0;
    else {
      i = Math.floor(Math.random() * poems.length);
      if (i === current) i = (i + 1) % poems.length;   // 保证一定换到不同句
    }
    current = i;
    writeChoice(i);
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
    reset: function () { try { localStorage.removeItem(KEY); } catch (e) {} },
    setChoice: function (i) { writeChoice(i); },
    next: next
  };
})();
