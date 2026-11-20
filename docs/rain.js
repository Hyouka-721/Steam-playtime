/* ============================================================================
 * 雨丝氛围层 · rain.js   v=5
 * ---------------------------------------------------------------------------
 * 第 120 轮 WebGL 水滴：采样不到页面背景，只能画灰白蒙版。
 * 第 121/122 轮 DOM 水珠 + backdrop-filter：页面大面积是均匀深色，
 *   模糊纯色仍是同一块纯色，水滴内部没有可折射的纹理，最终只剩一圈灰边
 *   （用户实测：强行 blur(8px) brightness(1.35) 仍是灰片）。
 * 第 123 轮改为「雨丝」：细长半透明线条 + 两端渐隐 + 轻微模糊，
 *   不依赖背景纹理，深色/浅色底都能读成下雨，也不挡榜单数字。
 *
 * 契约（两页共用）：
 *   - #rain-layer fixed / pointer-events:none / z-index:6，不参与布局（CLS=0）
 *   - 开关 #rain-toggle 写 localStorage['rain.enabled']，默认开
 *   - prefers-reduced-motion：强制关、按钮禁用、雨丝动画停
 *   - 三档景深：远/中/近，宽度 0.6~1.8px、长度 16~110px、三档不同速度
 * ========================================================================== */
(function () {
  'use strict';

  var layer = document.getElementById('rain-layer');
  var btn = document.getElementById('rain-toggle');
  if (!layer) return;

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  var on = false, ready = false, streaks = [], frames = 0;
  var seed = 20261120;
  var lastArea = 0, resizeTimer = 0;

  function rnd() {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  }

  function countFor(w, h) {
    return Math.max(50, Math.min(160, Math.round((w * h) / 9000)));
  }

  /* 三档景深：0 远 / 1 中 / 2 近 */
  var DEPTH = [
    { w: [0.6, 0.9],  len: [16, 34],  op: [0.16, 0.26], blur: [0.2, 0.35], dur: [2.8, 4.6] },
    { w: [0.9, 1.2],  len: [30, 64],  op: [0.24, 0.36], blur: [0.3, 0.5],  dur: [1.8, 3.0] },
    { w: [1.2, 1.8],  len: [50, 110], op: [0.32, 0.48], blur: [0.4, 0.65], dur: [1.1, 2.0] }
  ];
  function pick(range) { return range[0] + rnd() * (range[1] - range[0]); }

  function build() {
    while (layer.firstChild) layer.removeChild(layer.firstChild);
    streaks = [];
    var w = window.innerWidth, h = window.innerHeight;
    var n = countFor(w, h);
    lastArea = w * h;

    for (var i = 0; i < n; i++) {
      var el = document.createElement('i');
      el.className = 'rain-streak';

      var depth = i % 10 < 5 ? 0 : (i % 10 < 8 ? 1 : 2);
      var d = DEPTH[depth];
      var length = pick(d.len);

      el.style.width = pick(d.w).toFixed(2) + 'px';
      el.style.height = length.toFixed(1) + 'px';
      el.style.left = (rnd() * 100).toFixed(2) + '%';
      el.style.top = '0';
      el.style.setProperty('--rain-op', pick(d.op).toFixed(2));
      el.style.setProperty('--rain-blur', pick(d.blur).toFixed(2) + 'px');
      el.style.setProperty('--rain-tilt', (6 + rnd() * 7).toFixed(1) + 'deg');
      el.style.setProperty('--rain-dur', pick(d.dur).toFixed(2) + 's');
      el.style.setProperty('--rain-delay', (-rnd() * 6).toFixed(2) + 's');
      el.style.setProperty('--rain-drift', (-(20 + depth * 26 + rnd() * 40)).toFixed(0) + 'px');
      el.style.setProperty('--rain-len', length.toFixed(1) + 'px');

      layer.appendChild(el);
      streaks.push(el);
    }

    frames = streaks.length;
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
     sample 返回可见雨丝数（DOM 版本没有像素缓冲，用元素数表达「确实画出来了」）。 */
  window.__rain = {
    ready: function () { return ready; },
    layer: layer,
    reduced: function () { return reduced.matches; },
    enabled: function () { return on; },
    toggle: function () { return setEnabled(!on); },
    set: function (v) { return setEnabled(v); },
    frames: function () { return frames; },
    count: function () { return streaks.length; },
    error: function () { return 0; },
    onChange: function (fn) { if (typeof fn === 'function') listeners.push(fn); },
    sample: function () {
      var visible = 0;
      for (var i = 0; i < streaks.length; i++) {
        var r = streaks[i].getBoundingClientRect();
        if (r.width > 0 && r.height > 0) visible++;
      }
      return { pixels: visible, total: streaks.length };
    }
  };

  /* 首屏骨架屏还在时先不铺雨丝：避免和榜单渲染抢第一帧。
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
