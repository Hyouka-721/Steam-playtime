/* ============================================================
   My Watch List · Service Worker（第 75 轮新增）
   解决的问题：GitHub Pages 对静态资源只给 Cache-Control: max-age=600，
   刷新间隔超过 10 分钟，102 张海报就要逐一走协商（304），白等几百毫秒。
   海报与 320/480 变体都是「内容哈希命名」的不可变资源 → cache-first，
   二次访问零网络；新海报是新文件名，天然不会读到旧缓存。

   ⚠️ 只拦截 /img/watch/*.webp 这一类请求，其余（html / css / js /
   watch.json / 跨域）一律不 respondWith —— 保持浏览器默认行为，
   数据协商与页面更新逻辑完全不受影响。
   改本文件逻辑时同步 bump 下面的 CACHE 版本号，旧缓存才会在 activate 时清掉。
   ============================================================ */
var CACHE = 'watch-posters-v1';
// 海报及其 320/480 变体（文件名含内容哈希，永不变内容）
var IMMUTABLE_RE = /\/img\/watch\/[^?#]+\.webp$/;

self.addEventListener('install', function () {
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.map(function (k) {
          return k === CACHE ? null : caches.delete(k);
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
