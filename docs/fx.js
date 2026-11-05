/* ============================================================================
 * 背景氛围效果：流星
 * ---------------------------------------------------------------------------
 * · 零第三方依赖：原生 Canvas 2D + requestAnimationFrame
 * · 开关：页脚 #fx-seg 两态（关 / 流星），状态写入 localStorage
 * · 全屏 fixed 图层 + pointer-events:none，不影响任何点击 / 表单输入
 * · 页面隐藏（切标签、最小化）自动暂停；恢复可见自动续播
 * · 移动端 / 窄屏自动降低 DPR
 * · 遵循系统 prefers-reduced-motion 偏好
 * · 颜色取自当前主题的 CSS 变量 --fx-meteor，随主题切换自动刷新
 * ---------------------------------------------------------------------------
 * 2026-10-18：按用户要求移除雨 / 雪两种效果，仅保留流星。
 * 2026-11-05 第 108 轮：视觉优化（不改风格 / 布局 / 功能）。
 *   目标从「橙色亮线划屏」改为「背景深处偶尔飘过一缕极淡暖光」：
 *   · 远 / 中 / 近三档层次 + 极淡静态微光尘底噪
 *   · 速度、密度、亮度、尾迹长度全面下调，并按视口宽度缩放（窄屏更稀更短）
 *   · 双向渐隐（出现与消失都柔和），方向轻微散布，生成带随机静默期
 *   · 内容区亮度衰减：核心内容上方自动更淡，避免划过文字 / 柱条
 *   · 每颗粒子出生时锁定颜色 → 主题切换时在屏粒子不突变
 *   · 每帧绘制次数受同屏上限约束；微光尘预渲染到离屏画布，只做一次 drawImage
 * ---------------------------------------------------------------------------
 * 调参入口：下方 CONFIG（meteor / layers / dust / lite）集中了全部视觉参数
 * ========================================================================== */
(function () {
  'use strict';

  /* ========================== ① 集中配置 ========================== */
  const CONFIG = {
    /** 初始状态：默认 'meteor'；reduced-motion 且无存储值时仍保持 off */
    mode: 'meteor',
    storageKey: 'fx-mode',

    // ---- 流星 ----
    meteor: {
      colorVar: '--fx-meteor',
      spawnPerSec: [0.55, 1.15], // 每秒颗数（原 1.1–2.3，约减半）
      maxAlive: 6,               // 同屏上限（原 18，按视口再缩）
      speed: [240, 460],         // px/秒（原 560–1050）
      length: [70, 170],         // 尾迹 px（原 110–260）
      thickness: [0.7, 1.5],     // 头部线宽 px（原 1.0–2.2）
      alpha: [0.20, 0.36],       // 峰值亮度（原 0.35–0.72）；经层次 / 内容区折减后仍柔和
      halo: 4.6,                 // 外发光更宽
      haloAlpha: 0.28,           // 外发光适度提亮：亮度给光带而非针尖（原 0.35）
      angleDeg: 30,              // 与水平线夹角，向左下划落
      angleJitter: 6,            // 方向轻微散布，不再全部平行
      ttl: [1.6, 2.6],           // 生命周期秒：保证单颗可见 ≥1.2s
      fadeInFrac: 0.14,          // 前段淡入
      fadeOutFrac: 0.32,         // 后段淡出（原来只有淡入，边缘会突断）
      minGap: 0.45,              // 最小生成间隔，防扎堆
      silence: [0.1, 0.4],       // 额外随机静默期，形成呼吸节奏
      spawnTop: [-0.14, 0.42],   // 出生 y 区间（视口高度比例），偏上
      spawnSideBias: 0.62,       // 偏向左右留白的概率
      avoidAlpha: 0.72,          // 落在内容区时的亮度系数（内容区仍可见但明显更淡）
    },

    /** 远 / 中 / 近三档：权重与速度 / 长度 / 粗细 / 亮度倍率
        远层极细极淡最慢且最多，近层极少且最短，形成纵深而不抢眼 */
    layers: [
      { w: 0.55, speed: 0.55, len: 0.62, thick: 0.62, alpha: 0.55 },
      { w: 0.38, speed: 1.00, len: 1.00, thick: 1.00, alpha: 1.00 },
      { w: 0.07, speed: 1.20, len: 0.80, thick: 1.15, alpha: 0.90 },
    ],

    /** 静态微光尘：预渲染到离屏画布，每帧一次 drawImage，不随密度增加成本 */
    dust: {
      countAt1440: 22,           // 1440×900 下的点数，按面积缩放
      radius: [0.5, 1.3],
      alpha: [0.03, 0.08],
      breath: 4200,              // 极慢的整体明度呼吸 ms
    },

    /** 降级策略：窄屏 / 触屏设备降低 DPR，优先保证流畅 */
    lite: { maxWidth: 720, dpr: 1.5 },
    maxDpr: 2,
  };

  /* ========================== ② 基础工具 ========================== */
  const canvas = document.getElementById('fx-canvas');
  const seg = document.getElementById('fx-seg');
  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext('2d');

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const coarse = window.matchMedia('(pointer: coarse)');

  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  const smooth = (v) => v * v * (3 - 2 * v); // smoothstep：首尾渐隐更柔

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
  let mode = 'off';                       // 'off' | 'meteor'
  let w = 0, h = 0, dpr = 1, scale = 1;   // 画布尺寸（CSS 像素）/ DPR / 视口缩放
  let particles = [];
  let raf = 0, last = 0, spawnIn = 0, avoidClock = 0;
  let colors = { meteor: [201, 173, 142] };
  let avoidRects = [];                    // 内容区矩形（低频刷新，绘制时只做廉价包含判断）
  let dust = null, dustCtx = null;        // 离屏微光尘

  function refreshColors() {
    colors.meteor = hexToRgb(cssVar(CONFIG.meteor.colorVar));
    buildDust(); // 主题色变化时重建底噪；在屏流星保留自己的颜色，不会突变
  }

  function isLite() {
    return window.innerWidth <= CONFIG.lite.maxWidth || coarse.matches;
  }

  function pickLayer() {
    const r = Math.random();
    let acc = 0;
    for (const L of CONFIG.layers) { acc += L.w; if (r <= acc) return L; }
    return CONFIG.layers[1];
  }

  /* ========================== ④ 尺寸 / 底噪 / 内容区 ========================== */
  function buildDust() {
    if (!w || !h) return;
    if (!dust) {
      dust = document.createElement('canvas');
      dustCtx = dust.getContext('2d');
    }
    if (!dustCtx) return;
    dust.width = Math.round(w * dpr);
    dust.height = Math.round(h * dpr);
    dustCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    dustCtx.clearRect(0, 0, w, h);
    const col = colors.meteor;
    const n = Math.max(8, Math.round(CONFIG.dust.countAt1440 * (w * h) / (1440 * 900)));
    for (let i = 0; i < n; i++) {
      dustCtx.fillStyle = rgba(col, rand(CONFIG.dust.alpha[0], CONFIG.dust.alpha[1]));
      dustCtx.beginPath();
      dustCtx.arc(Math.random() * w, Math.random() * h,
        rand(CONFIG.dust.radius[0], CONFIG.dust.radius[1]), 0, Math.PI * 2);
      dustCtx.fill();
    }
  }

  /** 每 1 秒刷新一次内容区矩形：覆盖滚动、视图切换与窗口变化，
      不在每帧查询 DOM，避免影响滚动帧率 */
  function rebuildAvoid() {
    const rects = [];
    document.querySelectorAll('.site-header, .cards, .view.active .panel').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width > 40 && r.height > 20 && r.bottom > 0 && r.top < h) {
        rects.push([r.left, r.top, r.right, r.bottom]);
      }
    });
    avoidRects = rects;
  }
  function inContent(x, y) {
    for (const r of avoidRects) {
      if (x >= r[0] && x <= r[2] && y >= r[1] && y <= r[3]) return true;
    }
    return false;
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, isLite() ? CONFIG.lite.dpr : CONFIG.maxDpr);
    w = window.innerWidth;
    h = window.innerHeight;
    scale = clamp(w / 1440, 0.42, 1);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildDust();
    rebuildAvoid();
  }

  /* ========================== ⑤ 流星引擎 ========================== */
  function buildMeteor() {
    particles = [];
    spawnIn = rand(0.4, 1.2);
    avoidClock = 0;
  }

  function aliveCap() {
    // 直接随视口缩放：1440 → 6 颗，390 → 3 颗，窄屏绝不密集
    return Math.max(2, Math.round(CONFIG.meteor.maxAlive * scale));
  }

  function spawnMeteor() {
    const c = CONFIG.meteor;
    if (particles.length >= aliveCap()) return;
    const L = pickLayer();
    const ang = (c.angleDeg + rand(-c.angleJitter, c.angleJitter)) * Math.PI / 180;
    const dirX = -Math.cos(ang), dirY = Math.sin(ang);
    const spd = rand(c.speed[0], c.speed[1]) * L.speed * (0.65 + 0.35 * scale);
    // 出生点偏向左右留白与页眉上方，避开内容核心区
    let x;
    if (Math.random() < c.spawnSideBias) {
      x = Math.random() < 0.5 ? rand(-0.05 * w, 0.28 * w) : rand(0.74 * w, 1.08 * w);
    } else {
      x = rand(0.05 * w, 1.05 * w);
    }
    particles.push({
      x,
      y: rand(c.spawnTop[0] * h, c.spawnTop[1] * h),
      len: rand(c.length[0], c.length[1]) * L.len * (0.55 + 0.45 * scale),
      thick: rand(c.thickness[0], c.thickness[1]) * L.thick,
      a: rand(c.alpha[0], c.alpha[1]) * L.alpha,
      vx: spd * dirX, vy: spd * dirY,
      dx: dirX, dy: dirY,
      life: 0,
      ttl: rand(c.ttl[0], c.ttl[1]),
      col: colors.meteor.slice(), // 锁定出生色：主题切换时在屏粒子平滑留旧色
    });
  }

  function stepMeteor(dt) {
    const c = CONFIG.meteor;
    spawnIn -= dt;
    if (spawnIn <= 0) {
      spawnMeteor();
      const rate = rand(c.spawnPerSec[0], c.spawnPerSec[1]) * (0.6 + 0.4 * scale);
      spawnIn = Math.max(c.minGap, 1 / rate + rand(c.silence[0], c.silence[1]));
    }
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.life >= p.ttl || p.y - p.len > h || p.x + p.len < -80) particles.splice(i, 1);
    }
  }

  function drawMeteor() {
    const c = CONFIG.meteor;
    ctx.lineCap = 'round';
    for (const p of particles) {
      const t = p.life / p.ttl;
      // 双向渐隐：出现与消失都柔和，杜绝边缘突断与突然闪烁
      const env = smooth(clamp(t / c.fadeInFrac, 0, 1)) *
                  smooth(clamp((1 - t) / c.fadeOutFrac, 0, 1));
      const alpha = p.a * env * (inContent(p.x, p.y) ? c.avoidAlpha : 1);
      if (alpha <= 0.002) continue;
      const tailX = p.x - p.dx * p.len;
      const tailY = p.y - p.dy * p.len;
      // 多段平滑衰减的光带，取代原来偏硬的 3 色标直线。
      // 中段系数刻意放缓：亮度预算从「头部针尖」摊到整条尾迹上，
      // 让流星在深色背景里是一缕可辨的暖光，而不是一个几乎看不见的小点。
      const g = ctx.createLinearGradient(p.x, p.y, tailX, tailY);
      g.addColorStop(0, rgba(p.col, alpha));
      g.addColorStop(0.28, rgba(p.col, alpha * 0.88));
      g.addColorStop(0.65, rgba(p.col, alpha * 0.42));
      g.addColorStop(1, rgba(p.col, 0));
      ctx.strokeStyle = g;
      // ① 最外层宽光晕：负责「融进背景」
      ctx.lineWidth = p.thick * c.halo;
      ctx.globalAlpha = c.haloAlpha;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(tailX, tailY); ctx.stroke();
      // ② 中层实体光带：给尾迹一点可见的宽度，但不抬高头部峰值
      ctx.lineWidth = p.thick * 2.4;
      ctx.globalAlpha = 0.45;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(tailX, tailY); ctx.stroke();
      // ③ 细主线：只保留极窄的亮脊
      ctx.globalAlpha = 1;
      ctx.lineWidth = p.thick;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(tailX, tailY); ctx.stroke();
      // 头部改为两层极淡柔光晕，不再是实心「针尖」
      ctx.fillStyle = rgba(p.col, alpha * 0.18);
      ctx.beginPath(); ctx.arc(p.x, p.y, p.thick * 3.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = rgba(p.col, alpha * 0.38);
      ctx.beginPath(); ctx.arc(p.x, p.y, p.thick * 1.2, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawDust(ts) {
    if (!dust) return;
    ctx.globalAlpha = 0.72 + 0.28 * Math.sin(ts / CONFIG.dust.breath);
    ctx.drawImage(dust, 0, 0, w, h);
    ctx.globalAlpha = 1;
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
    avoidClock += dt;
    if (avoidClock >= 1) { avoidClock = 0; rebuildAvoid(); }
    drawDust(ts);
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
  function syncButtons() {
    if (!seg) return;
    const off = reduced.matches;
    seg.querySelectorAll('button').forEach((b) => {
      const fx = b.dataset.fx;
      b.classList.toggle('active', fx === mode);
      b.setAttribute('aria-pressed', fx === mode ? 'true' : 'false');
      // 系统偏好「减少动态效果」时只允许「关」
      const disabled = off && fx !== 'off';
      b.disabled = disabled;
      if (disabled && fx === mode) b.classList.remove('active');
    });
  }

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
    syncButtons();
    notifyFxChange();
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
      return v in ENGINES || v === 'off' ? v : CONFIG.mode;
    } catch (e) {
      return CONFIG.mode;
    }
  }

  /* ========================== ⑧ 事件绑定 ========================== */
  if (seg) {
    seg.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b || b.disabled) return;
      if (b.dataset.fx !== mode) setMode(b.dataset.fx);
    });
  }

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

  // 主题切换后刷新粒子配色与底噪；在屏粒子保留出生色，故不会瞬间变色
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
  syncButtons();
  let initial = readStored();
  if (reduced.matches && initial === CONFIG.mode) {
    let hasStored = false;
    try { hasStored = localStorage.getItem(CONFIG.storageKey) !== null; } catch (e) {}
    if (!hasStored) initial = 'off';
  }
  if (initial !== 'off' && ENGINES[initial]) {
    mode = initial;
    syncButtons();
    if (active()) {
      ENGINES[mode].build();
      start();
    }
  }

  /* ========================== ⑩ 对外最小 API ==========================
   * mode() / toggle() / onChange(cb) 保持不变，供页面元素复用同一套状态管理。 */
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
      if (mode === 'off' && reduced.matches) return mode;
      setMode(mode === 'off' ? 'meteor' : 'off');
      return mode;
    },
    onChange(fn) {
      if (typeof fn === 'function') fxListeners.push(fn);
    },
  };
})();
