/* motion.js — 第 135 轮：滚动错峰淡入（第 145 轮修第 8 行透明）
 * 给 .card / .rank-item / .tl-item / .st-panel 加 .rv，元素临近视口时加 .in，
 * 同批进入的元素按序错开 40ms（CSS 变量 --rv-d）。
 * ⚠️ 不碰 .poster（verify128 B5 要 w-fade-in），不碰标题/页眉（verify56/58/133）。
 * reduced-motion 直接跳过绑定，元素保持可见。
 *
 * 第 145 轮：fitRankRows() 故意让第 8 行底部只离视口 4px，原来统一的
 * rootMargin:'0px 0px -8% 0px' 会把视口底部再收 8%（~75px），第 8 行永远
 * 不进入观察区 → 拿不到 .in → .rv 保持 opacity:0，看起来就只有 7 款。
 * 这里把榜单行拆成独立观察器、底边不内收；其它元素保留原节奏。
 */
(function () {
  'use strict';
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || !('IntersectionObserver' in window)) return;

  var SEL = '.card, .rank-item, .tl-item, .st-panel';

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
    var rankNodes = [];
    var otherNodes = [];
    (root || document).querySelectorAll(SEL).forEach(function (el) {
      if (el.classList.contains('rv')) return;
      el.classList.add('rv');
      // 所有走几何断言的元素都 flat（纯 opacity）：榜单行(verify117)、年报卡(verify94/98/99/101)、
      // 条目高(verify67)。位移版 .rv 只留给 .card 这种没有几何断言的装饰性容器。
      if (!el.classList.contains('card')) el.classList.add('flat');
      (el.classList.contains('rank-item') ? rankNodes : otherNodes).push(el);
    });
    if (!rankNodes.length && !otherNodes.length) return;

    // 榜单行底边不内收：fitRankRows() 把第 8 行放在离视口底 4px 处，
    // 任何负 bottom margin 都会把它排除在观察区之外（用户只看到 7 款的根因）。
    observe(rankNodes, '0px 0px 0px 0px');
    // 其它元素保留第 135 轮的错峰节奏。
    observe(otherNodes, '0px 0px -8% 0px');
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
