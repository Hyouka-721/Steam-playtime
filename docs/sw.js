/* ============================================================
   My Watch List · Service Worker（第 75 轮新增）
   解决的问题：GitHub Pages 对静态资源只给 Cache-Control: max-age=600，
   刷新间隔超过 10 分钟，102 张海报就要逐一走协商（304），白等几百毫秒。
   海报与 320/480 变体都是「内容哈希命名」的不可变资源 → cache-first，
   二次访问零网络；新海报是新文件名，天然不会读到旧缓存。

   ⚠️ 只拦截 /img/watch/*.webp 与 /data/watch.json 两处，其余（html / css / js /
   跨域）一律不 respondWith —— 保持浏览器默认行为，页面更新逻辑完全不受影响。
   第 80 轮新增数据缓存：**网络优先**（先 fetch，成功顺带存一份，失败才回落缓存），
   所以「刷新即最新」的语义没变，只是断网时列表不再是空的。
   改本文件逻辑时同步 bump 下面的 CACHE / DATA_CACHE 版本号，旧缓存才会在 activate 时清掉。
   ============================================================ */
var CACHE = 'watch-posters-v1';
var DATA_CACHE = 'watch-data-v1';
// 海报及其 320/480 变体（文件名含内容哈希，永不变内容）
var IMMUTABLE_RE = /\/img\/watch\/[^?#]+\.webp$/;
// 观影数据：可变资源，只做「网络优先 + 失败回落」
var DATA_RE = /\/data\/watch\.json$/;

self.addEventListener('install', function () {
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.map(function (k) {
          // 第 80 轮：两个缓存都保留，其余（旧版本）清掉
          return (k === CACHE || k === DATA_CACHE) ? null : caches.delete(k);
        }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== self.location.origin) return;          // 跨域不碰

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
