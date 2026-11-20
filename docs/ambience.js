/* ============================================================================
 * 氛围总控 · ambience.js   v=1
 * ---------------------------------------------------------------------------
 * 第 125 轮：把首页的「关 / 流星」与单独的「雨滴 开/关」合并成一个三态控件
 *   关 / 流星 / 雨滴；并把同一控件与同一状态带到 watch 页。
 *
 * 状态只存一个键：localStorage['ambience.mode'] = 'off' | 'meteor' | 'rain'
 *   - 切换页面时读同一个键 → 氛围保持不变
 *   - 旧数据迁移：没有新键时依次读 'fx-mode'、'rain.enabled'
 *
 * 本文件不直接画任何东西：流星交给 window.__fx，雨丝交给 window.__rain；
 *   两者都未就绪时短暂轮询（rain.js 是 async 引入，可能晚到）。
 * ========================================================================== */
(function () {
  'use strict';

  var KEY = 'ambience.mode';
  var seg = document.getElementById('ambience-seg');
  if (!seg) return;

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  var mode = 'off';
  var buttons = [].slice.call(seg.querySelectorAll('button'));
  var bootTimer = 0, bootTries = 0;

  function valid(v) { return v === 'off' || v === 'meteor' || v === 'rain'; }

  function readStored() {
    try {
      var v = localStorage.getItem(KEY);
      if (valid(v)) return v;
      var fx = localStorage.getItem('fx-mode');
      if (fx === 'off' || fx === 'meteor') return fx;
      if (localStorage.getItem('rain.enabled') === '1') return 'rain';
    } catch (e) {}
    return 'meteor';   // 与首页原默认一致
  }

  function sync() {
    for (var i = 0; i < buttons.length; i++) {
      var b = buttons[i];
      var on = b.getAttribute('data-amb') === mode;
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.disabled = reduced.matches && b.getAttribute('data-amb') !== 'off';
    }
  }

  function apply(next, persist) {
    mode = valid(next) ? next : 'off';
    if (reduced.matches && mode !== 'off') mode = 'off';
    if (persist !== false) {
      try { localStorage.setItem(KEY, mode); } catch (e) {}
    }
    if (window.__fx) {
      var wantFx = mode === 'meteor' ? 'meteor' : 'off';
      if (window.__fx.mode() !== wantFx) window.__fx.toggle();
    }
    if (window.__rain) window.__rain.set(mode === 'rain');
    sync();
    return mode;
  }

  function set(next) { return apply(next, true); }

  /* 只要两个引擎的 API 已存在就能 apply：rain.js 还在等骨架屏退场时，
     __rain.set(true) 会先记下状态，build() 完成后按 on 显示，不必等 ready。 */
  function ready() {
    return !!(window.__fx && window.__rain);
  }

  function boot() {
    if (!ready() && bootTries < 120) {
      bootTries++;
      bootTimer = setTimeout(boot, 80);
      return;
    }
    clearTimeout(bootTimer);
    apply(readStored(), false);
  }

  seg.addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b || b.disabled) return;
    var next = b.getAttribute('data-amb');
    if (next !== mode) set(next);
  });

  function onReducedChange() {
    if (reduced.matches) apply('off', false);
    else sync();
  }
  if (reduced.addEventListener) reduced.addEventListener('change', onReducedChange);
  else if (reduced.addListener) reduced.addListener(onReducedChange);

  window.__ambience = {
    mode: function () { return mode; },
    set: set,
    ready: ready
  };

  boot();
})();
