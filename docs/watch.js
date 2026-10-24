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
            /* 2026-10-24 第 62 轮：改为横向一行 —— 名称与英文名同占一列（英文名在中文名正下方），
               日期 / 类别 / 上映时间 / 评级 / 评语 与名称同一行依次排列，
               顺序仍是 名称 → 英文名 → 日期 → 类别 → 上映时间 → 评级 → 评语。 */
            '<div class="tl-body">' +
              '<div class="tl-head">' +
                '<h3 class="tl-name">' + esc(it.title) + '</h3>' +
                (it.title_en ? '<p class="tl-en">' + esc(it.title_en) + '</p>' : '') +
              '</div>' +
              '<div class="tl-meta">' +
                '<span class="tl-date">' + (it.watched_at ? esc(it.watched_at) : '时间未知') + '</span>' +
                '<span class="tl-kind">' + kindLabel(it.kind) + '</span>' +
                (it.year ? '<span class="tl-year">' + esc(it.year) + '</span>' : '') +
                scoreHtml(it.rating, 'tl-score') +
              '</div>' +
              (it.note ? '<p class="tl-note" title="' + esc(it.note) + '">' + esc(it.note) + '</p>' : '') +
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

  /* ---------- 手动添加：加号 → 表单 → 直接提交进 GitHub 仓库 ----------
     纯静态站没有后端，所以这里的「保存」= 用本机保存的 fine-grained PAT 调
     GitHub Contents API，把海报与 docs/data/watch.json 一起提交进仓库，
     Pages 约 15~40 秒后全设备可见。
     · Token 只存本机 localStorage（键 watch-gh-token），页面源码里没有任何密钥
     · 压图 / 内容哈希命名 / 同 id 即更新 / 倒序重排 —— 与 scripts/watch-add.mjs 同一套规则
     · 不选海报时自动生成一张带片名的 2:3 深色占位图，保证网格视图不缺图 */
  var GH = { owner: 'Hyouka-721', repo: 'Steam-playtime', branch: 'main' };
  var GH_API = 'https://api.github.com';
  var TOKEN_KEY = 'watch-gh-token';
  var DATA_PATH = 'docs/data/watch.json';
  var POSTER_DIR = 'docs/img/watch';
  var POSTER_W = 640;
  var POSTER_Q = 0.8;

  var fabEl = document.getElementById('w-fab');
  var dlgEl = document.getElementById('w-add');
  var formEl = document.getElementById('w-add-form');
  var msgEl = document.getElementById('w-add-msg');
  var submitEl = document.getElementById('w-add-submit');
  var fileEl = document.getElementById('add-poster');
  var previewEl = document.getElementById('add-preview');
  var previewPhEl = document.getElementById('add-poster-ph');
  var tokenEl = document.getElementById('add-token');
  var tokenStateEl = document.getElementById('add-token-state');
  var toastEl = document.getElementById('w-toast');

  function getToken() {
    try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; }
  }
  function syncTokenState() {
    if (tokenStateEl) tokenStateEl.textContent = getToken() ? '已设置' : '未设置';
  }
  var toastTimer = 0;
  function toast(text, kind) {
    if (!toastEl) return;
    toastEl.textContent = text;
    if (kind) toastEl.dataset.kind = kind; else toastEl.removeAttribute('data-kind');
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.hidden = true; }, 4600);
  }
  function setMsg(text, kind) {
    if (!msgEl) return;
    msgEl.textContent = text || '';
    if (kind) msgEl.dataset.kind = kind; else msgEl.removeAttribute('data-kind');
  }
  function pad2(n) { return n < 10 ? '0' + n : String(n); }
  function localDateValue(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }
  function localStamp(d) {
    var off = -d.getTimezoneOffset();
    var sign = off >= 0 ? '+' : '-';
    var m = Math.abs(off);
    return localDateValue(d) + 'T' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' +
      pad2(d.getSeconds()) + sign + pad2(Math.floor(m / 60)) + ':' + pad2(m % 60);
  }
  // 与 scripts/watch-add.mjs 的 slugify / makeSlug 完全一致
  function slugify(s) {
    return String(s || '').toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48);
  }
  function makeSlug(en, title) {
    return slugify(en) || slugify(title) || 'item';
  }
  function bytesToB64(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i += 0x8000) {
      s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(s);
  }
  function textToB64(text) {
    return bytesToB64(new TextEncoder().encode(text));
  }
  function b64ToText(b64) {
    var bin = atob(String(b64 || '').replace(/\s/g, ''));
    var arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(arr);
  }
  function sha8(bytes) {
    return crypto.subtle.digest('SHA-256', bytes).then(function (buf) {
      return Array.prototype.map.call(new Uint8Array(buf), function (b) {
        return ('0' + b.toString(16)).slice(-2);
      }).join('').slice(0, 8);
    });
  }
  function canvasToWebp(cv) {
    return new Promise(function (res, rej) {
      cv.toBlob(function (blob) {
        if (!blob) { rej(new Error('这个浏览器导出不了 WebP，请换 Chrome / Edge / Safari 14+')); return; }
        blob.arrayBuffer().then(function (ab) {
          res({ bytes: new Uint8Array(ab), blob: blob, w: cv.width, h: cv.height });
        });
      }, 'image/webp', POSTER_Q);
    });
  }
  function posterFromFile(file) {
    return createImageBitmap(file).then(function (bmp) {
      var w = Math.min(POSTER_W, bmp.width);          // 只缩不放
      var h = Math.max(1, Math.round(bmp.height * (w / bmp.width)));
      var cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      cv.getContext('2d').drawImage(bmp, 0, 0, w, h);
      if (bmp.close) bmp.close();
      return canvasToWebp(cv);
    });
  }
  function posterPlaceholder(title) {
    var w = POSTER_W, h = Math.round(POSTER_W * 1.5);   // 2:3
    var cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    var ctx = cv.getContext('2d');
    var g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#1b1b23'); g.addColorStop(0.55, '#14141a'); g.addColorStop(1, '#22222c');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(232,176,75,.42)';
    ctx.lineWidth = 3;
    ctx.strokeRect(18, 18, w - 36, h - 36);
    var chars = Array.from(String(title || '未命名'));
    var per = 7, lines = [], i;
    for (i = 0; i < chars.length && lines.length < 4; i += per) lines.push(chars.slice(i, i + per).join(''));
    ctx.fillStyle = '#e8b04b';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '600 46px "PingFang SC","Microsoft YaHei",sans-serif';
    var lh = 62;
    var top = h / 2 - ((lines.length - 1) * lh) / 2;
    for (i = 0; i < lines.length; i++) ctx.fillText(lines[i], w / 2, top + i * lh);
    return canvasToWebp(cv);
  }

  /* ---- GitHub Contents API ---- */
  function ghHeaders() {
    return {
      Authorization: 'Bearer ' + getToken(),
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json'
    };
  }
  function ghError(r, what) {
    if (r.status === 401) return new Error(what + '失败：Token 无效或已过期（401）');
    if (r.status === 403) return new Error(what + '失败：Token 没有该仓库的 Contents 写权限（403）');
    if (r.status === 404) return new Error(what + '失败：仓库/路径不存在，或 Token 无权限（404）');
    if (r.status === 409) return new Error(what + '失败：文件刚被别处改动，请重试（409）');
    return new Error(what + '失败：HTTP ' + r.status);
  }
  function ghGet(path) {
    var url = GH_API + '/repos/' + GH.owner + '/' + GH.repo + '/contents/' + path +
      '?ref=' + GH.branch + '&t=' + Date.now();
    return fetch(url, { headers: ghHeaders(), cache: 'no-store' }).then(function (r) {
      if (r.status === 404) return null;
      if (!r.ok) throw ghError(r, '读取');
      return r.json();
    });
  }
  function ghPut(path, b64, message, sha) {
    var body = { message: message, content: b64, branch: GH.branch };
    if (sha) body.sha = sha;
    return fetch(GH_API + '/repos/' + GH.owner + '/' + GH.repo + '/contents/' + path, {
      method: 'PUT', headers: ghHeaders(), body: JSON.stringify(body)
    }).then(function (r) {
      if (!r.ok) throw ghError(r, '提交');
      return r.json();
    });
  }

  /* ---- 表单交互 ---- */
  var previewUrl = '';
  function resetPreview() {
    if (previewEl) { previewEl.hidden = true; previewEl.removeAttribute('src'); }
    if (previewPhEl) previewPhEl.hidden = false;
    if (fileEl) fileEl.value = '';
    if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = ''; }
  }
  function onPick() {
    var f = fileEl && fileEl.files && fileEl.files[0];
    if (!f) { resetPreview(); return; }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(f);
    previewEl.src = previewUrl;
    previewEl.hidden = false;
    previewPhEl.hidden = true;
  }
  function openAdd() {
    setMsg('');
    syncTokenState();
    var d = document.getElementById('add-watched');
    if (d && !d.value) d.value = localDateValue(new Date());
    if (!dlgEl) return;
    if (typeof dlgEl.showModal === 'function') dlgEl.showModal();
    else dlgEl.setAttribute('open', '');
    setTimeout(function () {
      var t = document.getElementById('add-title');
      if (t) t.focus();
    }, 40);
  }
  function closeAdd() {
    if (!dlgEl) return;
    if (typeof dlgEl.close === 'function') dlgEl.close();
    else dlgEl.removeAttribute('open');
  }

  function submitAdd(e) {
    if (e) e.preventDefault();
    var titleEl = document.getElementById('add-title');
    var title = titleEl ? titleEl.value.trim() : '';
    if (!title) { setMsg('片名不能为空', 'err'); if (titleEl) titleEl.focus(); return; }
    if (!getToken()) {
      setMsg('还没设置 GitHub Token —— 展开最下方「GitHub Token」填一次即可', 'err');
      var box = document.getElementById('add-token-box');
      if (box) box.open = true;
      return;
    }
    var watchedEl = document.getElementById('add-watched');
    var watched = (watchedEl && watchedEl.value) || localDateValue(new Date());
    var kindEl = document.getElementById('add-kind');
    var kind = kindEl && kindEl.value === 'series' ? 'series' : 'movie';
    var enEl = document.getElementById('add-en');
    var en = enEl ? enEl.value.trim() : '';
    var yearEl = document.getElementById('add-year');
    var yearRaw = yearEl ? yearEl.value.trim() : '';
    var ratingEl = document.getElementById('add-rating');
    var ratingRaw = ratingEl ? ratingEl.value.trim() : '';
    var tagsEl = document.getElementById('add-tags');
    var tagsRaw = tagsEl ? tagsEl.value.trim() : '';
    var noteEl = document.getElementById('add-note');
    var note = noteEl ? noteEl.value.trim() : '';

    var slug = makeSlug(en, title);
    var id = watched + '-' + slug;

    submitEl.disabled = true;
    var file = fileEl && fileEl.files && fileEl.files[0];
    setMsg(file ? '正在压缩海报…' : '正在生成占位海报…', 'busy');

    var pic = null;
    var posterName = '';
    var posterPath = '';
    (file ? posterFromFile(file) : posterPlaceholder(title))
      .then(function (p) {
        pic = p;
        return sha8(p.bytes);
      })
      .then(function (hash) {
        posterName = slug + '-' + hash + '.webp';
        posterPath = 'img/watch/' + posterName;
        setMsg('正在上传海报…', 'busy');
        return ghGet(POSTER_DIR + '/' + posterName);
      })
      .then(function (existing) {
        // 同名说明内容哈希相同（之前传过同一张图），跳过上传
        if (existing) return null;
        return ghPut(POSTER_DIR + '/' + posterName, bytesToB64(pic.bytes),
          'data(watch): 海报 ' + posterName, null);
      })
      .then(function () {
        setMsg('正在写入 watch.json…', 'busy');
        return ghGet(DATA_PATH);
      })
      .then(function (cur) {
        var data = cur ? JSON.parse(b64ToText(cur.content)) : { updated_at: '', items: [] };
        if (!Array.isArray(data.items)) data.items = [];
        var item = {
          id: id, title: title, kind: kind, watched_at: watched,
          poster: posterPath, poster_w: pic.w, poster_h: pic.h
        };
        if (en) item.title_en = en;
        if (yearRaw) item.year = Number(yearRaw) || yearRaw;
        if (ratingRaw !== '' && !isNaN(Number(ratingRaw))) item.rating = Number(ratingRaw);
        if (tagsRaw) item.tags = tagsRaw.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
        if (note) item.note = note;

        // 同 id 即更新：先移除旧的同 id 条目
        data.items = data.items.filter(function (it) { return it && it.id !== id; });
        data.items.push(item);
        data.items.sort(function (a, b) {
          var d2 = sortKey(b.watched_at).localeCompare(sortKey(a.watched_at));
          if (d2 !== 0) return d2;
          return String(b.id || '').localeCompare(String(a.id || ''));
        });
        data.updated_at = localStamp(new Date());
        var text = JSON.stringify(data, null, 2) + '\n';
        return ghPut(DATA_PATH, textToB64(text), 'data(watch): 添加《' + title + '》', cur ? cur.sha : null)
          .then(function () { return item; });
      })
      .then(function (item) {
        // 本机立刻可见：海报先用 blob URL 顶着，Pages 生效后刷新即为正式路径
        item.poster = URL.createObjectURL(pic.blob);
        ALL = ALL.filter(function (it) { return it && it.id !== item.id; });
        ALL.push(item);
        ALL.sort(function (a, b) {
          var d2 = sortKey(b.watched_at).localeCompare(sortKey(a.watched_at));
          return d2 !== 0 ? d2 : String(b.id || '').localeCompare(String(a.id || ''));
        });
        paint();
        if (formEl) formEl.reset();
        resetPreview();
        closeAdd();
        toast('已提交 · 约 15~40 秒后全设备生效', 'ok');
      })
      .catch(function (err) {
        console.error('[watch] add failed', err);
        setMsg(String(err && err.message ? err.message : err), 'err');
      })
      .then(function () {
        submitEl.disabled = false;
      });
  }

  if (fabEl) fabEl.addEventListener('click', openAdd);
  var closeBtn = document.getElementById('w-add-close');
  if (closeBtn) closeBtn.addEventListener('click', closeAdd);
  var cancelBtn = document.getElementById('w-add-cancel');
  if (cancelBtn) cancelBtn.addEventListener('click', closeAdd);
  if (fileEl) fileEl.addEventListener('change', onPick);
  if (formEl) formEl.addEventListener('submit', submitAdd);
  var tokenSave = document.getElementById('add-token-save');
  if (tokenSave) tokenSave.addEventListener('click', function () {
    var v = (tokenEl.value || '').trim();
    if (!v) { setMsg('Token 为空', 'err'); return; }
    try { localStorage.setItem(TOKEN_KEY, v); } catch (e) {}
    tokenEl.value = '';
    syncTokenState();
    setMsg('Token 已保存到本机（不会上传到任何地方）', 'ok');
  });
  var tokenClear = document.getElementById('add-token-clear');
  if (tokenClear) tokenClear.addEventListener('click', function () {
    try { localStorage.removeItem(TOKEN_KEY); } catch (e) {}
    syncTokenState();
    setMsg('Token 已清除', 'ok');
  });
  syncTokenState();

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
