/* motion.js — 第 135 轮：滚动错峰淡入（第 146 轮：榜单行退出动画）
 * 给 .card / .tl-item / .st-panel 加 .rv，元素临近视口时加 .in，
 * 同批进入的元素按序错开 40ms（CSS 变量 --rv-d）。
 * ⚠️ 不碰 .poster（verify128 B5 要 w-fade-in），不碰标题/页眉（verify56/58/133）。
 * reduced-motion 直接跳过绑定，元素保持可见。
 *
 * 第 145 轮曾把 .rank-item 拆成独立观察器、底边不内收，解决了第 8 行透明；
 * 第 146 轮用户反馈刷新后榜单仍会闪一下：数据渲染后轮询 bind() 给新行挂
 * .rv（opacity:0），IO 再补 .in 淡入，肉眼就是一次闪烁。榜单行本就有
 * fitRankRows() 保证零 CLS、无位移，不需要淡入，直接不参与 .rv 最稳。
 */
(function () {
  'use strict';
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || !('IntersectionObserver' in window)) return;

  // 第 146 轮：.rank-item 不再进选择器，刷新后榜单始终可见、零闪烁。
  var SEL = '.card, .tl-item, .st-panel';

  function observe(nodes, margin) {
    if (!nodes.length) return;
    var io = new IntersectionObserver(function (entries) {
      var shown = 0;
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        var el = e.target;
        el.style.setProperty('--rv-d', Math.min(shown++, 8) * 40 + 'ms');
        el.classList.add('in');
        io.unobserve(el);
      });
    }, { rootMargin: margin, threshold: 0.05 });
    nodes.forEach(function (el) { io.observe(el); });
  }

  function bind(root) {
    var nodes = [];
    (root || document).querySelectorAll(SEL).forEach(function (el) {
      if (el.classList.contains('rv')) return;
      el.classList.add('rv');
      // 走几何断言的元素用 flat（纯 opacity）：年报卡、条目高。
      // 位移版 .rv 只留给 .card 这种没有几何断言的装饰性容器。
      if (!el.classList.contains('card')) el.classList.add('flat');
      nodes.push(el);
    });
    if (!nodes.length) return;
    observe(nodes, '0px 0px -8% 0px');
  }

  // 首屏：DOM 就绪后绑一次（脚本 defer，DOM 已解析）
  bind(document);
  // 视图切换 / 数据渲染后会新增节点 —— 用轻量轮询覆盖新增，不用 MutationObserver 省开销
  var ticks = 0;
  var timer = setInterval(function () {
    bind(document);
    if (++ticks >= 12) clearInterval(timer);  // 6 秒内最多补 12 次，之后停止
  }, 500);

  window.__motionReveal = bind;   // 暴露给渲染函数按需立即绑定
})();
