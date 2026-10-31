/* ============================================================
   Service Worker —— 两个页面共用一个（同域同 scope，只能存在一个）。
   第 75 轮起只管观影页；第 84 轮扩到首页，于是规则分两条线：

   A. 观影页（原规则一字未改）
      · /img/watch/*.webp          cache-first（文件名含内容哈希，永不变）
      · /data/watch.json           网络优先（刷新即最新，断网才回落）

   B. 首页 / 游戏时长（第 84 轮新增，为「离线也能看」）
      · 页面导航（index / watch）   网络优先 → 断网回落上次的 HTML
      · /data/meta.json 等数据      网络优先（每晚 CI 会改，绝不吃旧值）
      · ?v= 的 css/js / 字体 / 图标 / manifest   cache-first（新发布=新 URL）
      · /img/covers/*.webp          cache-first（本地化后的游戏封面）

   ⚠️ 改本文件逻辑时同步 bump 下面的缓存版本号，旧缓存才会在 activate 时清掉。
   ⚠️ 不要在这里碰 /sw.js 自身（浏览器不缓存 SW 脚本的代理响应）。
   ============================================================ */
var CACHE = 'watch-posters-v1';
var DATA_CACHE = 'watch-data-v1';
var SHELL = 'app-shell-v1';
var APP_DATA = 'app-data-v1';

// 海报及其 320/480 变体（文件名含内容哈希，永不变内容）
var IMMUTABLE_RE = /\/img\/watch\/[^?#]+\.webp$/;
// 观影数据：可变资源，只做「网络优先 + 失败回落」
var DATA_RE = /\/data\/watch\.json$/;
// 本地化封面（第 84 轮）：文件名是 appid，内容可能随发布变化 → 仍按 URL 缓存，靠版本发布更替
var COVER_RE = /\/img\/covers\/[^?#]+\.webp$/;
// 首页数据（可变，网络优先）
var APP_DATA_RE = /\/data\/(?:meta\.json|achievements\.json|daily\/\d{4}-\d{2}\.json)$/;
// 带版本号的静态资源（css / js / 字体 / 图标 / manifest）
var ASSET_RE = /\.(?:css|js|woff2?|png|webmanifest)$/;

/* 首屏外壳：只预缓存不随数据变化的那几件，避免每次 bump 都回来改清单 */
var SHELL_LIST = ['./', 'index.html', 'manifest.webmanifest', 'img/icon-192.png', 'img/icon-512.png', 'blackrose.woff2'];

self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(warmup());
});

/** 预热外壳缓存：逐个失败互不影响（addAll 是全成或全败，这里不用它）。
 *  ⚠️ 必须把 style.css / app.js / fx.js 一起收进来 —— 首次访问时 SW 还没接管，
 *  这几个请求根本没经过 fetch 事件，不预热的话「断网刷新」会没有脚本、整页空白。
 *  版本号是变的，所以这里**从 index.html 现场解析**（?v=NN），不在 SW 里写死。 */
function warmup() {
  return caches.open(SHELL).then(function (cache) {
    var base = ['./', 'index.html', 'manifest.webmanifest', 'img/icon-192.png', 'img/icon-512.png', 'blackrose.woff2'];
    return fetch('index.html', { cache: 'reload' })
      .then(function (r) { return r.ok ? r.text() : ''; })
      .catch(function () { return ''; })
      .then(function (html) {
        var list = base.slice();
        var re = /(?:src|href)="((?:style|app|fx)\.(?:css|js)\?v=\d+)"/g;
        var m;
        while ((m = re.exec(html))) list.push(m[1]);
        return Promise.all(list.map(function (u) {
          return cache.match(u).then(function (hit) {
            if (hit) return null;
            return fetch(u).then(function (res) {
              if (res && res.ok) return cache.put(u, res);
              return null;
            }).catch(function () {});
          });
        }));
      });
  }).catch(function () {});
}

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.map(function (k) {
          // 第 84 轮：四个缓存都保留，其余（旧版本）清掉
          return (k === CACHE || k === DATA_CACHE || k === SHELL || k === APP_DATA) ? null : caches.delete(k);
        }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

/** 网络优先：先 fetch，成功顺手存一份；失败才读缓存。 */
function netFirst(req, cacheName) {
  return fetch(req).then(function (res) {
    if (res && res.ok) {
      var copy = res.clone();
      caches.open(cacheName).then(function (c) { c.put(req, copy); });
    }
    return res;
  }).catch(function () {
    return caches.open(cacheName).then(function (c) { return c.match(req); })
      .then(function (hit) { return hit || Response.error(); });
  });
}

/** 缓存优先：命中即返回，未命中再 fetch 并存。 */
function cacheFirst(req, cacheName) {
  return caches.open(cacheName).then(function (cache) {
    return cache.match(req).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (res) {
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      });
    });
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== self.location.origin) return;          // 跨域不碰

  /* ---- 页面导航：网络优先，断网回落到上次成功的那份 HTML ---- */
  if (req.mode === 'navigate') {
    e.respondWith(netFirst(req, SHELL));
    return;
  }

  // 第 80 轮：数据 —— 网络优先。fetch 先走，成功就顺手更新缓存；只有网络真失败
  // （离线 / DNS 挂）才回落到上一次成功的副本，避免断网时整页空白。
  if (DATA_RE.test(url.pathname)) {
    e.respondWith(
      fetch(req).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(DATA_CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () {
        return caches.open(DATA_CACHE).then(function (c) { return c.match(req); })
          .then(function (hit) { return hit || Response.error(); });
      })
    );
    return;
  }

  /* ---- 第 84 轮：首页数据（meta / 月度 / 成就）—— 同样网络优先 ---- */
  if (APP_DATA_RE.test(url.pathname)) {
    e.respondWith(netFirst(req, APP_DATA));
    return;
  }

  /* ---- 第 84 轮：本地封面 + 带版本号的静态资源 —— 缓存优先 ---- */
  if (COVER_RE.test(url.pathname)) {
    e.respondWith(cacheFirst(req, SHELL));
    return;
  }
  if (ASSET_RE.test(url.pathname) && url.pathname !== '/sw.js') {
    e.respondWith(cacheFirst(req, SHELL));
    return;
  }

  if (!IMMUTABLE_RE.test(url.pathname)) return;             // 只处理海报

  // 不可变资源：先缓存后网络，命中即返回（零网络）
  e.respondWith(
    caches.open(CACHE).then(function (cache) {
      return cache.match(req).then(function (hit) {
        if (hit) return hit;
        return fetch(req).then(function (res) {
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        });
      });
    })
  );
});
