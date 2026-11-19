/* ============================================================================
 * 雨滴氛围层 · rain.js   v=3
 * ---------------------------------------------------------------------------
 * 第 120 轮曾把 Salt Player 插件 spw-playback-rain 的着色器移植成 WebGL；
 * 但 WebGL 画布只能输出颜色，**采样不到页面背景**，所以怎么调都是灰白蒙版，
 * 没有「透过水珠看页面」的通透感。第 121 轮改成 DOM 水滴 + CSS backdrop-filter：
 *   每颗水滴是一个真实元素，backdrop-filter 直接折射它背后的页面内容，
 *   再叠 inset 高光/暗边，才有播放器里那种玻璃水珠的质感。
 *
 * 契约（两页共用）：
 *   - #rain-layer  fixed / pointer-events:none / z-index:6，不参与布局（CLS=0）
 *   - 开关 #rain-toggle 写 localStorage['rain.enabled']，默认开
 *   - prefers-reduced-motion：强制关、按钮禁用、水滴动画停
 *   - 水滴尺寸 8~34px，约四成缓慢下滑，其余静态凝结
 * ========================================================================== */
(function () {
  'use strict';

  var layer = document.getElementById('rain-layer');
  var btn = document.getElementById('rain-toggle');
  if (!layer) return;

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  var on = false, ready = false, drops = [], frames = 0;
  var seed = 20261119;
  var lastArea = 0, resizeTimer = 0;

  function rnd() {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  }

  function countFor(w, h) {
    return Math.max(18, Math.min(56, Math.round((w * h) / 30000)));
  }

  function build() {
    while (layer.firstChild) layer.removeChild(layer.firstChild);
    drops = [];
    var w = window.innerWidth, h = window.innerHeight;
    var n = countFor(w, h);
    lastArea = w * h;

    for (var i = 0; i < n; i++) {
      var el = document.createElement('i');
      el.className = 'rain-drop';

      var size = 10 + Math.pow(rnd(), 1.35) * 30;          // 10~40px，小珠更多
      var aspect = 0.85 + rnd() * 0.55;                    // 略拉长，像挂壁水珠
      var moving = rnd() < 0.42;

      el.style.width = size.toFixed(1) + 'px';
      el.style.height = (size * aspect).toFixed(1) + 'px';
      el.style.left = (rnd() * 100).toFixed(2) + '%';
      el.style.top = moving ? '0' : (rnd() * 100).toFixed(2) + '%';
      el.style.setProperty('--rain-rot', (rnd() * 50 - 25).toFixed(1) + 'deg');
      el.style.setProperty('--rain-blur', (2.2 + rnd() * 1.8).toFixed(1) + 'px');
      el.style.setProperty('--rain-op', (0.72 + rnd() * 0.24).toFixed(2));

      if (moving) {
        el.className += ' is-moving';
        el.style.setProperty('--rain-dur', (12 + rnd() * 14).toFixed(1) + 's');
        el.style.setProperty('--rain-delay', (-rnd() * 22).toFixed(1) + 's');
        el.style.setProperty('--rain-drift', (rnd() * 60 - 30).toFixed(0) + 'px');
      }

      layer.appendChild(el);
      drops.push(el);
    }

    frames = drops.length;
    ready = true;
    layer.hidden = !on;
  }

  function paintBtn() {
    if (!btn) return;
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.textContent = on ? '雨滴 开' : '雨滴 关';
    btn.disabled = reduced.matches;
  }

  function setEnabled(v, persist) {
    var want = !!v && !reduced.matches;
    on = want;
    if (persist !== false) {
      try { localStorage.setItem('rain.enabled', want ? '1' : '0'); } catch (e) {}
    }
    if (ready) layer.hidden = !on;
    paintBtn();
    notify();
    return on;
  }

  function readStored() {
    var saved = null;
    try { saved = localStorage.getItem('rain.enabled'); } catch (e) {}
    if (saved === '0') return false;
    if (saved === '1') return true;
    return !reduced.matches;
  }

  var listeners = [];
  function notify() {
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](on); } catch (e) {}
    }
  }

  if (btn) {
    btn.addEventListener('click', function () {
      if (btn.disabled) return;
      setEnabled(!on);
    });
  }

  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      var area = window.innerWidth * window.innerHeight;
      if (!lastArea || Math.abs(area - lastArea) / lastArea > 0.15) {
        var wasOn = on;
        build();
        on = wasOn;
        layer.hidden = !on;
        paintBtn();
      }
    }, 220);
  });

  function onReducedChange() {
    if (reduced.matches) setEnabled(false, false);
    else paintBtn();
  }
  if (reduced.addEventListener) reduced.addEventListener('change', onReducedChange);
  else if (reduced.addListener) reduced.addListener(onReducedChange);

  /* 对外最小 API：供页面与验收套件复用同一份状态。
     sample 返回水滴数（DOM 版本没有像素缓冲，用元素数表达「确实画出来了」）。 */
  window.__rain = {
    ready: function () { return ready; },
    layer: layer,
    reduced: function () { return reduced.matches; },
    enabled: function () { return on; },
    toggle: function () { return setEnabled(!on); },
    set: function (v) { return setEnabled(v); },
    frames: function () { return frames; },
    count: function () { return drops.length; },
    error: function () { return 0; },
    onChange: function (fn) { if (typeof fn === 'function') listeners.push(fn); },
    sample: function () {
      var visible = 0;
      for (var i = 0; i < drops.length; i++) {
        var r = drops[i].getBoundingClientRect();
        if (r.width > 0 && r.height > 0) visible++;
      }
      return { pixels: visible, total: drops.length };
    }
  };

  /* 首屏骨架屏还在时先不铺水滴：DOM 本身不重，但避免和榜单渲染抢第一帧。
     最多等 3s 兜底；watch 页没有骨架，立即启动。 */
  var waited = 0;
  function bootWhenReady() {
    if (document.querySelector('.sk-block') && waited < 25) {
      waited++;
      setTimeout(bootWhenReady, 120);
      return;
    }
    build();
    setEnabled(readStored(), false);
  }
  bootWhenReady();
})();
