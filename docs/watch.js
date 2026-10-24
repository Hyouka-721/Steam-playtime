/* ============================================================
   My Watch List · 渲染与交互（2026-10-24 新建）
   数据唯一来源：data/watch.json（结构见文件内注释 / README）
   · 网格视图：豆瓣式海报墙（2:3 固定比例，避免不同尺寸图把网格拉歪）
   · 时间轴视图：按 watched_at 倒序 + 年月分组
   · 两种视图共用同一份内存数据，只是渲染函数不同
   ============================================================ */
(function () {
  'use strict';

  var DATA_URL = 'data/watch.json';
  var LAYOUT_KEY = 'watch-layout';
  var KIND_KEY = 'watch-kind';
  var EAGER_N = 6;          // 前 N 张图改为 eager + high，其余懒加载

  var gridEl = document.getElementById('w-grid');
  var tlEl = document.getElementById('w-tl');
  var emptyEl = document.getElementById('w-empty');
  var countEl = document.getElementById('w-count');
  var updatedEl = document.getElementById('w-updated');
  // 2026-10-24 第 56 轮：网格 / 时间轴改由史蒂夫头像单选切换（原 .w-layout-btn 组已删除），
  // 头像同时负责 aria-pressed 与 title / aria-label 的动态同步。
  var avatarEl = document.getElementById('w-avatar');
  var kindBtns = Array.prototype.slice.call(document.querySelectorAll('.w-seg-btn'));

  var ALL = [];             // 全量数据（已按观影时间倒序）
  var layout = 'grid';
  var kind = 'all';

  /* ---------- 工具 ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // watched_at 允许 "2026-10-20" / "2026-10" / "2026" 三种粒度，
  // 补零成定长串再比较，保证可排序且粒度不同也能混排
  function sortKey(d) {
    var m = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/.exec(String(d || '').trim());
    if (!m) return '0000-00-00';
    return m[1] + '-' + (m[2] || '00') + '-' + (m[3] || '00');
  }

  function monthKey(d) {
    var m = /^(\d{4})(?:-(\d{2}))?/.exec(String(d || '').trim());
    if (!m) return '';
    return m[2] ? m[1] + '-' + m[2] : m[1];
  }

  function monthLabel(key) {
    var m = /^(\d{4})(?:-(\d{2}))?$/.exec(key || '');
    if (!m) return '时间未知';
    return m[2] ? m[1] + ' 年 ' + parseInt(m[2], 10) + ' 月' : m[1] + ' 年';
  }

  function kindLabel(k) {
    return k === 'series' ? '剧集' : '电影';
  }

  function scoreHtml(r, cls) {
    var n = Number(r);
    if (!isFinite(n) || n <= 0) return '';
    return '<span class="' + (cls || 'poster-score') + '"><i>★</i>' + (n % 1 === 0 ? n : n.toFixed(1)) + '</span>';
  }

  function subLine(it) {
    var parts = [];
    if (it.year) parts.push(it.year);
    if (it.watched_at) parts.push(it.watched_at);
    return esc(parts.join(' · '));
  }

  /* ---------- 筛选后的数据 ---------- */
  function visible() {
    if (kind === 'all') return ALL;
    return ALL.filter(function (it) { return (it.kind || 'movie') === kind; });
  }

  /* ---------- 图片加载态（淡入 / 失败降透明度） ---------- */
  function wireImages(root) {
    var imgs = root.querySelectorAll('img');
    Array.prototype.forEach.call(imgs, function (img) {
      if (img.complete && img.naturalWidth > 0) {
        img.classList.add('is-loaded');
      } else {
        img.addEventListener('load', function () { img.classList.add('is-loaded'); }, { once: true });
        img.addEventListener('error', function () {
          img.classList.add('is-loaded');
          img.style.opacity = '.22';   // 图挂了也保持版式，不做破图图标
        }, { once: true });
      }
    });
  }

  /* ---------- 网格视图 ---------- */
  function renderGrid(list) {
    gridEl.innerHTML = list.map(function (it, i) {
      var eager = i < EAGER_N;
      var dim = (it.poster_w ? ' width="' + esc(it.poster_w) + '"' : '') +
                (it.poster_h ? ' height="' + esc(it.poster_h) + '"' : '');
      return '' +
        '<article class="poster">' +
          '<div class="poster-pic">' +
            '<img src="' + esc(it.poster) + '" alt="' + esc(it.title) + '"' + dim +
              (eager ? ' loading="eager" fetchpriority="high"' : ' loading="lazy"') +
              ' decoding="async">' +
            '<span class="poster-kind">' + kindLabel(it.kind) + '</span>' +
            scoreHtml(it.rating) +
          '</div>' +
          '<h3 class="poster-name">' + esc(it.title) + '</h3>' +
          '<p class="poster-sub">' + subLine(it) + '</p>' +
          (it.note ? '<p class="poster-note" title="' + esc(it.note) + '">' + esc(it.note) + '</p>' : '') +
        '</article>';
    }).join('');
    wireImages(gridEl);
  }

  /* ---------- 时间轴视图 ---------- */
  function renderTimeline(list) {
    var groups = [];
    var map = {};
    list.forEach(function (it) {
      var k = monthKey(it.watched_at) || '';
      if (!map[k]) { map[k] = []; groups.push(k); }
      map[k].push(it);
    });

    tlEl.innerHTML = groups.map(function (k) {
      var rows = map[k].map(function (it) {
        return '' +
          '<article class="tl-item">' +
            '<div class="tl-thumb">' +
              '<img src="' + esc(it.poster) + '" alt="' + esc(it.title) + '" loading="lazy" decoding="async">' +
            '</div>' +
            '<div class="tl-body">' +
              '<h3 class="tl-name">' + esc(it.title) +
                (it.title_en ? '<span class="tl-en">' + esc(it.title_en) + '</span>' : '') +
              '</h3>' +
              '<div class="tl-sub">' +
                '<span>' + (it.watched_at ? esc(it.watched_at) : '时间未知') + '</span>' +
                '<span>' + kindLabel(it.kind) + (it.year ? ' · ' + esc(it.year) : '') + '</span>' +
                scoreHtml(it.rating, 'tl-score') +
              '</div>' +
              (it.note ? '<p class="tl-note">' + esc(it.note) + '</p>' : '') +
            '</div>' +
          '</article>';
      }).join('');
      return '<div class="tl-group"><div class="tl-month">' + monthLabel(k) + '</div>' + rows + '</div>';
    }).join('');

    wireImages(tlEl);
  }

  /* ---------- 总渲染 ---------- */
  function paint() {
    var list = visible();

    var total = ALL.length;
    var shown = list.length;
    if (total === 0) {
      countEl.textContent = '共 0 部';
    } else if (kind === 'all') {
      countEl.textContent = '共 ' + total + ' 部';
    } else {
      countEl.textContent = shown + ' / ' + total + ' 部';
    }

    emptyEl.hidden = total > 0;
    gridEl.hidden = !(layout === 'grid' && total > 0);
    tlEl.hidden = !(layout === 'timeline' && total > 0);

    if (total === 0) return;
    if (layout === 'grid') renderGrid(list);
    else renderTimeline(list);
  }

  /* ---------- 视图 / 筛选切换（状态持久化） ---------- */
  // 头像的可见状态：aria-pressed = 「时间轴是否开启」；
  // title / aria-label 描述「点下去会发生什么」，与首页 syncThemeUi() 的写法一致。
  function syncAvatar() {
    if (!avatarEl) return;
    var timeline = layout === 'timeline';
    avatarEl.setAttribute('aria-pressed', timeline ? 'true' : 'false');
    var label = timeline ? '切换到网格视图' : '切换到时间轴视图';
    avatarEl.title = label;
    avatarEl.setAttribute('aria-label', label);
  }

  function setLayout(next, silent) {
    layout = next === 'timeline' ? 'timeline' : 'grid';
    syncAvatar();
    try { localStorage.setItem(LAYOUT_KEY, layout); } catch (e) {}
    if (!silent) paint();
  }

  function setKind(next, silent) {
    kind = (next === 'movie' || next === 'series') ? next : 'all';
    kindBtns.forEach(function (b) {
      var on = b.getAttribute('data-kind') === kind;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    try { localStorage.setItem(KIND_KEY, kind); } catch (e) {}
    if (!silent) paint();
  }

  // 史蒂夫：点一下在网格 / 时间轴之间切换；键盘 Enter / 空格同样可用
  // （事件与 preventDefault 写法照搬首页 bindFlip，保证两页交互手感一致）
  if (avatarEl) {
    var toggleLayout = function () { setLayout(layout === 'grid' ? 'timeline' : 'grid'); };
    avatarEl.addEventListener('click', toggleLayout);
    avatarEl.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleLayout();
      }
    });
  }
  kindBtns.forEach(function (b) {
    b.addEventListener('click', function () { setKind(b.getAttribute('data-kind')); });
  });

  /* ---------- 启动 ---------- */
  var savedLayout = null, savedKind = null;
  try {
    savedLayout = localStorage.getItem(LAYOUT_KEY);
    savedKind = localStorage.getItem(KIND_KEY);
  } catch (e) {}
  setLayout(savedLayout, true);
  setKind(savedKind, true);

  // 加了 no-cache：每次向服务器做一次协商（GitHub Pages 会给 304），
  // 改完 json 刷新即见，不必等 CDN 的 10 分钟缓存过期
  fetch(DATA_URL, { cache: 'no-cache' })
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(function (data) {
      var items = Array.isArray(data) ? data : (data && data.items) || [];
      ALL = items.slice().sort(function (a, b) {
        var d = sortKey(b.watched_at).localeCompare(sortKey(a.watched_at));
        if (d !== 0) return d;
        return String(b.id || '').localeCompare(String(a.id || ''));
      });
      var upd = (data && data.updated_at) || '';
      updatedEl.textContent = upd ? '更新于 ' + String(upd).slice(0, 10) : '';
      paint();
    })
    .catch(function (err) {
      countEl.textContent = '加载失败';
      emptyEl.hidden = false;
      emptyEl.querySelector('.w-empty-title').textContent = '数据加载失败';
      emptyEl.querySelector('.w-empty-tip').textContent =
        '无法读取 ' + DATA_URL + '（' + err.message + '）。若是本地直接双击打开，请用本地服务访问。';
      var pre = emptyEl.querySelector('.w-empty-code');
      if (pre) pre.hidden = true;
      console.error('[watch] load failed', err);
    });
})();
