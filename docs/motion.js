/* motion.js — 第 135 轮：滚动错峰淡入（第 147 轮：卡片/榜单行退出动画）
 * 只给 .tl-item / .st-panel 这类滚动区元素加 .rv，临近视口时加 .in。
 * ⚠️ 不碰 .poster（verify128 B5 要 w-fade-in），不碰标题/页眉（verify56/58/133）。
 * reduced-motion 直接跳过绑定，元素保持可见。
 *
 * 第 146 轮：.rank-item 退出动画，解决第 8 行透明与刷新闪烁；
 * 第 147 轮：.card 也退出动画——用户要的是“刷新只更新数字”。卡片被挂
 * .rv（opacity:0）后再错峰淡入，肉眼就是“除了顶部栏全都消失后重新加载”。
 * 卡片数字本来就在 JS 到位后原地更新，不需要入场动画。
 */
(function () {
  'use strict';
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || !('IntersectionObserver' in window)) return;

  // 第 147 轮：.card 与 .rank-item 都不进选择器，刷新后首屏始终可见，
  // 数据到位只更新数字；动画只留给下方滚动区元素。
  var SEL = '.tl-item, .st-panel';

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
