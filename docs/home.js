/* ============================================================================
   门户主页 · home.js   v=5
   第 137 轮 —— 取句与交互：
     ① 今日签：按日期 FNV-1a 稳定取模，同一天不变；满月度配额时顺延到下一句
     ② 点击换一句：从「本月<2 次 + 非最近 20 句」池子里抽
     ③ 刷新沿用 choice（存 hash，不存下标——防止诗句库增删后错位）
   v=5：删「不喜欢」按钮；诗句与作者拆成两个元素，功能隔离——点诗句换句、双击作者点踩。
   v=4（热修）：兼容老用户数字 choice（否则卡在"加载中…"）、脏数据兜底。
   v=3 新增：
     · 稳定 ID：每句用 poems.js 第三列的 hash；旧版数字 choice 自动迁移
     · 月度配额：同一句本月最多出现 2 次（localStorage 按 YYYY-MM 分桶），
       进站首次 +1、点击 +1、刷新沿用不加；池小则三级降级
     · 点踩：本机计数，同句同月只算一次，满 3 次进待删名单并本地隐藏
     · 三击昵称：弹出待删名单面板，可一键复制 JSON
     · 作者独占一行，渲染不再带 '- ' 前缀（由 CSS 控制换行）
   🔴 独立文件，不碰两页；诗句数据只读 window.POEMS（poems.js）。
   ============================================================================ */
(function () {
  'use strict';

  var KEY = 'home.quote.choice';
  var RECENT_KEY = 'home.quote.recent';
  var MONTH_KEY = 'poem.monthly';       // { "2026-11": { hash: count } }
  var DISLIKE_KEY = 'poem.dislikes';    // { hash: count }
  var PENDING_KEY = 'poem.pending';     // [hash]
  var KEEP = 20;                        // 最近 20 句不重复（1000 句库）
  var MONTH_CAP = 2;                    // 同一句本月最多出现 2 次
  var DISLIKE_CAP = 3;                  // 点踩满 3 次进待删名单

  var poems = window.POEMS || [];
  var quoteEl = document.getElementById('home-quote');
  var nameEl = document.querySelector('.name');
  if (!poems.length || !quoteEl) return;

  /* ---------- 稳定 ID ---------- */
  function hashOf(i) {
    var row = poems[i];
    return (row && row[2]) || String(i);       // 老数据没 hash 时退回下标
  }
  var byHash = {};
  for (var k = 0; k < poems.length; k++) byHash[hashOf(k)] = k;
  function indexOfHash(h) {
    if (Object.prototype.hasOwnProperty.call(byHash, h) && byHash[h] >= 0 && byHash[h] < poems.length) return byHash[h];
    return null;
  }

  /* ---------- 存储工具（隐私模式静默失败） ---------- */
  function lsGet(k, fallback) {
    try { var v = localStorage.getItem(k); return v === null ? fallback : JSON.parse(v); }
    catch (e) { return fallback; }
  }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function monthId() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }
  function dayKey() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  /* ---------- 月度配额 / 点踩 ---------- */
  function monthly() {
    var all = lsGet(MONTH_KEY, {});
    if (!all || typeof all !== 'object' || Array.isArray(all)) all = {};
    var m = monthId();
    if (!all[m]) all[m] = {};
    // 只保留最近 2 个月，避免无限增长
    var keys = Object.keys(all).sort();
    while (keys.length > 2) { delete all[keys.shift()]; }
    return { all: all, bucket: all[m] };
  }
  function timesThisMonth(h) { return monthly().bucket[h] || 0; }
  function countOnce(h) {                      // 一次"出现"：进站首次 / 点击换句
    var st = monthly();
    st.bucket[h] = (st.bucket[h] || 0) + 1;
    lsSet(MONTH_KEY, st.all);
  }
  function dislikes() { return lsGet(DISLIKE_KEY, {}); }
  function pending() {
    var p = lsGet(PENDING_KEY, []);
    return Array.isArray(p) ? p : [];
  }
  function dislike(h) {
    var d = dislikes();
    // 纯本地方案：同一句可被点踩多次（用户要"三次即入待删名单"），
    // 不做同月去重——否则同一人永远凑不满 3 次。
    d[h] = (d[h] || 0) + 1;
    lsSet(DISLIKE_KEY, d);
    if (d[h] >= DISLIKE_CAP) {
      var p = pending();
      if (p.indexOf(h) === -1) { p.push(h); lsSet(PENDING_KEY, p); }
    }
    return { counted: true, count: d[h] };
  }
  function isPending(h) { return pending().indexOf(h) >= 0; }

  /* ---------- 近期窗口（存 hash） ---------- */
  function readRecent() {
    var arr = lsGet(RECENT_KEY, []);
    if (!Array.isArray(arr)) return [];
    return arr.filter(function (h) { return typeof h === 'string' && indexOfHash(h) !== null; }).slice(-KEEP);
  }
  var recent = readRecent();
  function remember(h) {
    var at = recent.indexOf(h);
    if (at >= 0) recent.splice(at, 1);
    recent.push(h);
    if (recent.length > KEEP) recent.shift();
    lsSet(RECENT_KEY, recent);
  }

  /* ---------- 日期 → 整数 ---------- */
  function dayHash(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  /* ---------- 候选池：月度配额 + 近期窗口 + 待删名单，三级降级 ---------- */
  function poolFor(excludeHash, tier) {
    var cap = tier === 0 ? MONTH_CAP : (tier === 1 ? 3 : Infinity);
    var useRecent = tier < 2;
    var out = [];
    for (var i = 0; i < poems.length; i++) {
      var h = hashOf(i);
      if (h === excludeHash) continue;
      if (isPending(h)) continue;              // 待删的本地直接不再出现
      if (useRecent && recent.indexOf(h) >= 0) continue;
      if (tier < 2 && timesThisMonth(h) >= cap) continue;
      out.push(i);
    }
    return out;
  }
  function pickFrom(pool) { return pool[Math.floor(Math.random() * pool.length)]; }

  function dailyIndex() {
    var base = dayHash(dayKey()) % poems.length;
    // 今日签若已用尽配额/在待删名单，从 base 开始线性探测下一句可用的
    for (var step = 0; step < poems.length; step++) {
      var i = (base + step) % poems.length;
      var h = hashOf(i);
      if (isPending(h)) continue;
      if (timesThisMonth(h) < MONTH_CAP) return i;
    }
    return base;
  }

  /* ---------- 渲染：作者独占一行，不带 "- " ---------- */
  function render(i) {
    var row = poems[i];
    if (!row) {                                // 极端脏数据兜底：绝不把页面卡在"加载中…"
      i = 0; row = poems[0];
    }
    var text = '「' + row[0] + '」';
    quoteEl.textContent = '';
    /* v=5：诗句与作者拆成两个元素，功能隔离——点诗句换句，双击作者点踩，互不触发 */
    var verse = document.createElement('span');
    verse.className = 'verse';
    verse.textContent = text;
    quoteEl.appendChild(verse);
    if (row[1]) {
      var by = document.createElement('span');
      by.className = 'by';
      by.textContent = row[1];                 // 不再加 '- '
      quoteEl.appendChild(by);
    }
    quoteEl.setAttribute('data-index', String(i));
    quoteEl.setAttribute('data-hash', hashOf(i));
  }

  /* ---------- 选句入口 ---------- */
  function choose(mode) {
    var pool, i;
    if (mode === 'daily') {
      i = dailyIndex();
    } else {
      pool = poolFor(hashOf(current), 0);
      if (!pool.length) pool = poolFor(hashOf(current), 1);
      if (!pool.length) pool = poolFor(hashOf(current), 2);
      i = pickFrom(pool);
      if (i === undefined) i = (current + 1) % poems.length;
    }
    current = i;
    var h = hashOf(i);
    lsSet(KEY, h);
    countOnce(h);                              // 本次"出现"计一次
    remember(h);
    render(i);
    return i;
  }

  /* ---------- 初始化：读 choice（hash），兼容旧数字下标 ---------- */
  var current = 0;
  var saved = lsGet(KEY, null);                 // JSON 存储：读到的是解析后的 hash 字符串
  /* 🔴 老版本（v≤2）choice 存的是数字下标字符串 "413"，JSON.parse 后是数字 413。
     旧代码只在 typeof === 'string' 时迁移，数字会绕过 → indexOfHash(413)=null → render(null)
     抛错、整段脚本中断，页面永远停在"加载中…"（用户 2026-11-24 实测踩到）。
     这里数字/字符串两种形态都迁移。 */
  if (typeof saved === 'number') {
    saved = Number.isInteger(saved) && saved >= 0 && saved < poems.length ? hashOf(saved) : null;
  } else if (typeof saved === 'string' && saved !== '') {
    if (/^\d+$/.test(saved)) {                 // 老版本未 JSON 化的纯数字下标
      var old = Number(saved);
      saved = old >= 0 && old < poems.length ? hashOf(old) : null;
    } else if (indexOfHash(saved) === null) {
      saved = null;
    }
  } else if (saved !== null) {
    saved = null;                              // 其它异常形态一律回落今日签
  }
  if (saved === null || isPending(saved)) {
    current = dailyIndex();
    lsSet(KEY, hashOf(current));
    countOnce(hashOf(current));                // 进站首次计一次
    remember(hashOf(current));
    render(current);
  } else {
    var idx = indexOfHash(saved);
    if (idx === null) {                        // 兜底：任何未预料形态都回落今日签
      current = dailyIndex();
      lsSet(KEY, hashOf(current));
      countOnce(hashOf(current));
      remember(hashOf(current));
      render(current);
    } else {
      current = idx;
      remember(saved);                         // 刷新沿用，不再 +1
      render(current);
    }
  }

  /* ---------- 交互：诗句与作者功能隔离 ----------
     点诗句（.verse）→ 换句；双击作者（.by 500ms 内两次）→ 点踩。
     两者互不冒泡、互不触发；键盘 Enter/空格在诗句上仍可换句。 */
  quoteEl.addEventListener('click', function (e) {
    /* 用 closest 判断来源，避免点到作者时冒泡成"换句" */
    if (e.target.closest && e.target.closest('.by')) return;   // 作者区不触发换句
    choose('next');
  });
  quoteEl.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose('next'); }
  });

  /* 双击作者点踩：500ms 内点两次作者即记一次踩，然后换句 */
  var byTaps = 0, byTimer = 0;
  quoteEl.addEventListener('click', function (e) {
    var by = e.target.closest && e.target.closest('.by');
    if (!by) return;
    e.stopPropagation();                       // 隔离：不让这次点击冒泡成换句
    byTaps++;
    clearTimeout(byTimer);
    byTimer = setTimeout(function () { byTaps = 0; }, 500);
    if (byTaps >= 2) {
      byTaps = 0;
      var h = hashOf(current);
      dislike(h);
      choose('next');                          // 点踩后照常换下一句
    }
  });

  /* 三击昵称导出待删名单 */
  var taps = 0, tapTimer = 0;
  function showPendingPanel() {
    var list = pending();
    var lines = list.map(function (h) {
      var i = indexOfHash(h);
      return i === null ? h : ('「' + poems[i][0] + '」 — ' + (poems[i][1] || '佚名') + ' [' + h + ']');
    });
    var panel = document.createElement('div');
    panel.className = 'pending-panel';
    panel.setAttribute('role', 'dialog');
    panel.innerHTML = '<div class="pending-box">' +
      '<strong>待删名单（点踩满 ' + DISLIKE_CAP + ' 次）</strong>' +
      '<pre>' + (lines.length ? lines.join('\n') : '（空）') + '</pre>' +
      '<div class="pending-actions"><button type="button" data-act="copy">复制 JSON</button>' +
      '<button type="button" data-act="close">关闭</button></div></div>';
    document.body.appendChild(panel);
    var payload = JSON.stringify(list.map(function (h) {
      var i = indexOfHash(h);
      return { hash: h, text: i === null ? '' : poems[i][0], author: i === null ? '' : poems[i][1] };
    }), null, 2);
    panel.addEventListener('click', function (ev) {
      var act = ev.target.getAttribute && ev.target.getAttribute('data-act');
      if (act === 'copy') {
        try {
          navigator.clipboard.writeText(payload).then(function () {
            panel.querySelector('.pending-actions').insertAdjacentHTML('beforeend', '<em style="margin-left:8px">已复制</em>');
          });
        } catch (e) {}
      } else if (act === 'close' || ev.target === panel) {
        panel.remove();
      }
    });
    document.addEventListener('keydown', function onEsc(e) {
      if (e.key === 'Escape') { panel.remove(); document.removeEventListener('keydown', onEsc); }
    });
  }
  if (nameEl) {
    nameEl.addEventListener('click', function () {
      taps++;
      clearTimeout(tapTimer);
      tapTimer = setTimeout(function () { taps = 0; }, 600);
      if (taps >= 3) { taps = 0; showPendingPanel(); }
    });
  }

  /* ---------- 暴露给回归套件 ---------- */
  window.__home = {
    count: poems.length,
    hashOf: hashOf,
    currentIndex: function () { return current; },
    currentHash: function () { return hashOf(current); },
    choiceKey: KEY,
    keep: KEEP,
    dailyIndex: dailyIndex,
    monthCap: MONTH_CAP,
    dislikeCap: DISLIKE_CAP,
    timesThisMonth: timesThisMonth,
    pending: pending,
    dislikes: dislikes,
    dislike: dislike,
    next: function () { return choose('next'); },
    setChoice: function (h) {
      var i = typeof h === 'number' ? h : indexOfHash(h);
      if (i === null) return;
      current = i;
      lsSet(KEY, hashOf(i));
      render(i);
    },
    reset: function () {
      try {
        localStorage.removeItem(KEY); localStorage.removeItem(RECENT_KEY);
        localStorage.removeItem(MONTH_KEY); localStorage.removeItem(DISLIKE_KEY);
        localStorage.removeItem(PENDING_KEY);
      } catch (e) {}
      recent = [];
    }
  };
})();
