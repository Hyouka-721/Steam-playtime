/* ============================================================================
 * 背景氛围效果：流星
 * ---------------------------------------------------------------------------
 * · 零第三方依赖：原生 Canvas 2D + requestAnimationFrame
 * · 单模式开关：史蒂夫头像单击 开 / 关（状态写入 localStorage）
 * · 全屏 fixed 图层 + pointer-events:none，不影响任何点击 / 表单输入
 * · 页面隐藏（切标签、最小化）自动暂停；恢复可见自动续播
 * · 移动端 / 窄屏自动降低 DPR
 * · 遵循系统 prefers-reduced-motion 偏好
 * · 颜色取自当前主题的 CSS 变量 --fx-meteor，随主题切换自动刷新
 * ---------------------------------------------------------------------------
 * 2026-10-18：按用户要求移除雨 / 雪两种效果（含积水层、飞溅、涟漪、
 * 雪花预染贴图等全部相关代码），仅保留流星；页脚多选切换器同步移除，
 * 开关统一由右上史蒂夫头像承担（见 app.js onSteveActivate）。
 * ---------------------------------------------------------------------------
 * 调参入口：下方 CONFIG.meteor —— 密度 / 速度 / 尾迹 / 亮度全部集中在这里
 * ========================================================================== */
(function () {
  'use strict';

  /* ========================== ① 集中配置 ========================== */
  const CONFIG = {
    /** 初始状态：默认 'meteor' —— 流星是站点氛围的一部分，首次访问直接开启
     *  （2026-10-18 起仅剩流星；reduced-motion 且无存储值时仍保持 off，
     *    不替系统偏好做决定；存过 'rain' / 'snow' 的旧访客自动回落为流星） */
    mode: 'meteor',
    storageKey: 'fx-mode',

    // ---- 流星 ----
    meteor: {
      colorVar: '--fx-meteor',  // 主题变量：三套主题各有一颗流星色
      spawnPerSec: [1.1, 2.3], // 密度：每秒出现几颗（2026-10-18 按用户要求
                               // 由 0.7–1.7 适度上调约 50%——同屏更常见，但仍稀疏）
      maxAlive: 18,            // 同屏最多几颗（2026-10-18 由 14 适度上调，
                               // 给密度留出余量；远低于影响内容可读性的水平）
      speed: [560, 1050],      // 速度 px/秒
      length: [110, 260],      // 尾迹长度 px
      thickness: [1.0, 2.2],   // 头部线宽 px
      alpha: [0.35, 0.72],     // 头部亮度
      halo: 3.2,               // 外发光宽度（相对线宽的倍数）
      angleDeg: 33,            // 方向：与水平线夹角，向右下方划落 → 取负值向左下
      fadeIn: 130,             // 淡入距离 px（避免突兀出现）
      spawnArea: [0.25, 1.15], // 出生点在宽度上的分布
    },

    /** 降级策略：窄屏 / 触屏设备降低 DPR，优先保证流畅 */
    lite: { maxWidth: 720, dpr: 1.5 },
    maxDpr: 2,
  };

  /* ========================== ② 基础工具 ========================== */
  const canvas = document.getElementById('fx-canvas');
  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext('2d');

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const coarse = window.matchMedia('(pointer: coarse)');

  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }
  function hexToRgb(str) {
    const s = String(str).trim().replace('#', '');
    if (s.length === 3) {
      const n = parseInt(s.split('').map((c) => c + c).join(''), 16);
      return Number.isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [160, 160, 160];
    }
    const n = parseInt(s, 16);
    return Number.isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [160, 160, 160];
  }

  /* ========================== ③ 运行时状态 ========================== */
  let mode = 'off';            // 当前状态（'off' | 'meteor'）
  let w = 0, h = 0, dpr = 1;   // 画布尺寸（CSS 像素）与设备像素比
  let particles = [];          // 当前粒子池
  let raf = 0, last = 0;       // 动画帧句柄与上一帧时间戳
  let spawnAcc = 0;            // 流星生成累加器
  let colors = { meteor: [232, 150, 74] };  // 流星色（默认 = 浅色主题 --fx-meteor）

  function refreshColors() {
    // 流星走主题 CSS 变量（--fx-meteor），三套主题各不相同
    colors.meteor = hexToRgb(cssVar(CONFIG.meteor.colorVar));
  }

  function isLite() {
    return window.innerWidth <= CONFIG.lite.maxWidth || coarse.matches;
  }

  /* ========================== ④ 尺寸处理 ========================== */
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, isLite() ? CONFIG.lite.dpr : CONFIG.maxDpr);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /* ========================== ⑤ 流星引擎 ========================== */
  function buildMeteor() {
    particles = [];
    spawnAcc = 0;
  }

  function spawnMeteor() {
    const c = CONFIG.meteor;
    if (particles.length >= c.maxAlive) return;
    // angleDeg：轨迹与水平线的夹角（向下）。默认往左下方划落；改成向右下只需
    // 把下面的 -Math.cos 换成 Math.cos。
    const rad = (Math.abs(c.angleDeg) * Math.PI) / 180;
    const dirX = -Math.cos(rad);
    const dirY = Math.sin(rad);
    const spd = rand(c.speed[0], c.speed[1]);
    const a = c.spawnArea;
    particles.push({
      x: rand(w * a[0], w * a[1]),
      y: rand(-0.12 * h, h * 0.5),
      len: rand(c.length[0], c.length[1]),
      thick: rand(c.thickness[0], c.thickness[1]),
      a: rand(c.alpha[0], c.alpha[1]),
      vx: spd * dirX,
      vy: spd * dirY,
      dx: dirX,
      dy: dirY,
      traveled: 0,
    });
  }

  function stepMeteor(dt) {
    const c = CONFIG.meteor;
    // 「密度」在这里体现为每秒生成颗数
    spawnAcc += dt * rand(c.spawnPerSec[0], c.spawnPerSec[1]);
    while (spawnAcc >= 1) {
      spawnAcc -= 1;
      spawnMeteor();
    }
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      const step = Math.hypot(p.vx, p.vy) * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.traveled += step;
      if (p.y - p.len > h || p.x + p.len < -80) particles.splice(i, 1);
    }
  }

  function drawMeteor() {
    const col = colors.meteor;
    ctx.lineCap = 'round';
    for (const p of particles) {
      // 淡入：出场的一段距离内逐步变亮，避免凭空出现
      const fade = clamp(p.traveled / CONFIG.meteor.fadeIn, 0, 1);
      const alpha = p.a * fade;
      if (alpha <= 0.001) continue;
      const tailX = p.x - p.dx * p.len;
      const tailY = p.y - p.dy * p.len;
      const g = ctx.createLinearGradient(p.x, p.y, tailX, tailY);
      g.addColorStop(0, rgba(col, alpha));
      g.addColorStop(0.35, rgba(col, alpha * 0.45));
      g.addColorStop(1, rgba(col, 0));
      // 外层柔光 + 内层亮线，两遍即可做出发光尾迹
      ctx.strokeStyle = g;
      ctx.lineWidth = p.thick * CONFIG.meteor.halo;
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(tailX, tailY);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.lineWidth = p.thick;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(tailX, tailY);
      ctx.stroke();
      // 头部亮点
      ctx.fillStyle = rgba(col, alpha);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.thick * 1.1, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const ENGINES = {
    meteor: { build: buildMeteor, step: stepMeteor, draw: drawMeteor },
  };

  /* ========================== ⑥ 动画循环 ========================== */
  function tick(ts) {
    if (!last) last = ts;
    // 切回标签页时时间戳会跳很大，夹一下避免粒子瞬移
    const dt = Math.min((ts - last) / 1000, 0.05);
    last = ts;
    const e = ENGINES[mode];
    if (!e) return stop();
    ctx.clearRect(0, 0, w, h);
    e.step(dt);
    e.draw();
    raf = requestAnimationFrame(tick);
  }

  function start() {
    if (raf) return;
    last = 0;
    raf = requestAnimationFrame(tick);
  }

  function stop() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    last = 0;
  }

  function clearCanvas() {
    ctx.clearRect(0, 0, w, h);
  }

  /** 真正生效的条件：开着 + 系统未要求减少动效 + 页面可见 */
  function active() {
    return mode !== 'off' && !reduced.matches && !document.hidden;
  }

  /* ========================== ⑦ 开关与状态 ========================== */
  function setMode(next, persist) {
    const valid = next === 'off' || !!ENGINES[next];
    mode = valid ? next : 'off';
    if (persist !== false) {
      try {
        localStorage.setItem(CONFIG.storageKey, mode);
      } catch (e) {
        /* 隐私模式下忽略 */
      }
    }
    notifyFxChange(); // 外部 UI（史蒂夫头像）同步状态
    if (!active()) {
      stop();
      clearCanvas();
      return;
    }
    resize();
    ENGINES[mode].build();
    start();
  }

  function readStored() {
    try {
      const v = localStorage.getItem(CONFIG.storageKey);
      // 旧访客可能存着已移除的 'rain' / 'snow' —— 一律回落为默认效果
      return v in ENGINES || v === 'off' ? v : CONFIG.mode;
    } catch (e) {
      return CONFIG.mode;
    }
  }

  /* ========================== ⑧ 事件绑定 ========================== */
  // 切标签 / 最小化 → 暂停；回来 → 续播
  document.addEventListener('visibilitychange', () => {
    if (!active()) {
      stop();
      if (mode === 'off' || reduced.matches) clearCanvas();
    } else {
      resize();
      ENGINES[mode].build();
      start();
    }
  });

  // 视口变化重建画布与粒子（节流，避免 resize 卡顿）
  let rt = 0;
  window.addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(() => {
      if (!active()) return;
      resize();
      ENGINES[mode].build();
      start();
    }, 160);
  });

  // 主题切换后刷新粒子配色（三套主题的 --fx-meteor 各不相同）
  new MutationObserver(refreshColors).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });

  // 系统「减少动态效果」开关变化 → 立即生效
  const onReducedChange = () => setMode(mode, false);
  if (reduced.addEventListener) reduced.addEventListener('change', onReducedChange);
  else if (reduced.addListener) reduced.addListener(onReducedChange);

  /* ========================== ⑨ 启动 ========================== */
  resize();
  refreshColors();
  // 默认开着；但系统要求减少动效、且用户从未显式选择过时，保持"关"——
  // 不替系统偏好做决定（显式选过则尊重其选择）
  let initial = readStored();
  if (reduced.matches && initial === CONFIG.mode) {
    let hasStored = false;
    try { hasStored = localStorage.getItem(CONFIG.storageKey) !== null; } catch (e) {}
    if (!hasStored) initial = 'off';
  }
  if (initial !== 'off' && ENGINES[initial]) {
    mode = initial;
    if (active()) {
      ENGINES[mode].build();
      start();
    }
  }

  /* ========================== ⑩ 对外最小 API ==========================
   * 供页面元素复用同一套状态管理（开关 + localStorage），避免第二份真相：
   * · mode()       当前状态（'off' | 'meteor'）
   * · toggle()     单击语义（史蒂夫头像）：关 → 开；开 → 关
   * · onChange(cb) 状态每次变化后触发（头像同步；系统偏好变化也含）
   * 注意：index.html 中本脚本先于 app.js 加载，保证 app.js 绑定时就已就绪。 */
  const fxListeners = [];
  function notifyFxChange() {
    for (const fn of fxListeners) {
      try {
        fn(mode);
      } catch (e) {
        /* 单个监听器异常不影响其他监听器与动画本身 */
      }
    }
  }
  window.__fx = {
    mode: () => mode,
    toggle() {
      // 系统开启「减少动态效果」时不允许启用，直接返回当前状态，
      // 由调用方据此给出提示
      if (mode === 'off' && reduced.matches) return mode;
      setMode(mode === 'off' ? 'meteor' : 'off');
      return mode;
    },
    onChange(fn) {
      if (typeof fn === 'function') fxListeners.push(fn);
    },
  };
})();
