/* ============================================================================
 * 背景氛围效果：雨 / 雪 / 流星
 * ---------------------------------------------------------------------------
 * · 零第三方依赖：原生 Canvas 2D + requestAnimationFrame
 * · 三种模式互斥切换（不叠加），选择写入 localStorage
 * · 全屏 fixed 图层 + pointer-events:none，不影响任何点击 / 表单输入
 * · 页面隐藏（切标签、最小化）自动暂停；恢复可见自动续播
 * · 移动端 / 窄屏自动降低粒子量与 DPR
 * · 遵循系统 prefers-reduced-motion 偏好
 * · 粒子颜色默认取自当前主题的 CSS 变量，随主题切换自动刷新
 *   （例外：雨滴按用户要求固定为自然纯白，见 CONFIG.rain.rgb）
 * ---------------------------------------------------------------------------
 * 调参入口：下方 CONFIG —— 数量 / 密度 / 速度 / 方向 / 透明度全部集中在这里
 * ========================================================================== */
(function () {
  'use strict';

  /* ========================== ① 集中配置 ========================== */
  const CONFIG = {
    /** 初始模式：'off' | 'rain' | 'snow' | 'meteor'（用户选择后会记住） */
    mode: 'off',
    storageKey: 'fx-mode',

    // ---- 雨 ----
    rain: {
      colorVar: '--fx-rain',     // 主题变量仅作说明；存在 rgb 字段时以 rgb 为准
      rgb: [255, 255, 255],      // 2026-10-18 按用户要求：改为自然纯白，去除偏蓝色偏
      density: 110,        // 每 1e6 px² 的雨滴数（1440×950 ≈ 150 根；再被 min/max 夹住）
      min: 40, max: 280,   // 粒子数量上下限
      speed: [820, 1400],   // 下落速度 px/秒
      length: [9, 28],      // 雨丝长度 px
      thickness: [0.5, 1.2],// 线宽 px
      alpha: [0.5, 0.7],    // 透明度区间（2026-10-18 按用户要求 0.05~0.13 → 0.5~0.7：通透且不抢眼）
      angleDeg: 14,         // 方向：与竖直方向的夹角，正数 = 向右下方飘
      jitter: 0.22,         // 个体速度随机抖动比例（让雨有层次）
    },

    // ---- 雪 ----
    snow: {
      colorVar: '--fx-snow',
      density: 70,          // 每 1e6 px² 的雪点数（1440×950 ≈ 96 片）
      min: 35, max: 180,
      speed: [18, 62],      // 下落速度 px/秒（比雨慢很多）
      radius: [0.9, 2.6],   // 雪点半径 px
      alpha: [0.28, 0.62],
      angleDeg: 8,          // 方向：整体风向偏角（负数则向左）
      swayAmp: [6, 22],     // 左右摆动幅度 px
      swaySpeed: [0.35, 1.1],// 摆动频率
      blur: 2.2,            // 边缘柔化（越大越像绒毛）
    },

    // ---- 流星 ----
    meteor: {
      colorVar: '--fx-meteor',
      spawnPerSec: [0.7, 1.7], // 密度：每秒出现几颗
      maxAlive: 14,            // 同屏最多几颗
      speed: [560, 1050],      // 速度 px/秒
      length: [110, 260],      // 尾迹长度 px
      thickness: [1.0, 2.2],   // 头部线宽 px
      alpha: [0.35, 0.72],     // 头部亮度
      halo: 3.2,               // 外发光宽度（相对线宽的倍数）
      angleDeg: 33,            // 方向：与水平线夹角，向右下方划落 → 取负值向左下
      fadeIn: 130,             // 淡入距离 px（避免突兀出现）
      spawnArea: [0.25, 1.15], // 出生点在宽度上的分布
    },

    /** 降级策略：窄屏 / 触屏设备降低粒子量与 DPR，优先保证流畅 */
    lite: { maxWidth: 720, countRatio: 0.45, dpr: 1.5 },
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
  let mode = 'off';            // 当前模式
  let w = 0, h = 0, dpr = 1;   // 画布尺寸（CSS 像素）与设备像素比
  let particles = [];          // 当前粒子池
  let raf = 0, last = 0;       // 动画帧句柄与上一帧时间戳
  let spawnAcc = 0;            // 流星生成累加器
  let colors = { rain: [255, 255, 255], snow: [195, 210, 223], meteor: [232, 150, 74] };

  function refreshColors() {
    // rgb 字段（固定色，如纯白）优先于主题 CSS 变量：雨滴按用户要求改为自然纯白、
    // 不随主题偏色；雪/流星无 rgb 字段，仍各自走主题变量
    const pick = (cfg) => (cfg.rgb ? cfg.rgb.slice() : hexToRgb(cssVar(cfg.colorVar)));
    colors = {
      rain: pick(CONFIG.rain),
      snow: pick(CONFIG.snow),
      meteor: pick(CONFIG.meteor),
    };
  }

  function isLite() {
    return window.innerWidth <= CONFIG.lite.maxWidth || coarse.matches;
  }

  /** 由「密度」换算出粒子数量，窄屏按比例缩减 */
  function targetCount(cfg) {
    const area = window.innerWidth * window.innerHeight;
    let n = Math.round((area / 1e6) * cfg.density);
    if (isLite()) n = Math.round(n * CONFIG.lite.countRatio);
    return clamp(n, cfg.min, cfg.max);
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

  /* ========================== ⑤ 粒子构建 ========================== */
  function buildRain() {
    const c = CONFIG.rain;
    const rad = (c.angleDeg * Math.PI) / 180;
    const sx = Math.sin(rad);
    const sy = Math.cos(rad);
    const spawn = (spread) => {
      const spd = rand(c.speed[0], c.speed[1]) * rand(1 - c.jitter, 1 + c.jitter);
      const len = Math.hypot(spd * sx, spd * sy) || 1; // 只是取模，用于单位向量
      return {
        x: rand(-0.15 * w, w * 1.05),
        y: spread ? rand(-h * 0.2, h) : rand(-h * 0.35, -10),
        len: rand(c.length[0], c.length[1]),
        thick: rand(c.thickness[0], c.thickness[1]),
        a: rand(c.alpha[0], c.alpha[1]),
        vx: spd * sx,
        vy: spd * sy,
        // 单位方向向量，画尾迹时直接用（省掉每帧 hypot）
        ux: (spd * sx) / len,
        uy: (spd * sy) / len,
      };
    };
    const n = targetCount(c);
    particles = [];
    for (let i = 0; i < n; i++) particles.push(spawn(true));
  }

  function stepRain(dt) {
    for (const p of particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.y - p.len > h || p.x < -0.3 * w || p.x > w * 1.3) {
        p.x = rand(-0.15 * w, w * 1.05);
        p.y = rand(-h * 0.35, -10);
      }
    }
  }

  function drawRain() {
    const col = colors.rain;
    ctx.lineCap = 'round';
    for (const p of particles) {
      const tailX = p.x - p.ux * p.len;
      const tailY = p.y - p.uy * p.len;
      ctx.strokeStyle = rgba(col, p.a);
      ctx.lineWidth = p.thick;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(tailX, tailY);
      ctx.stroke();
    }
  }

  function buildSnow() {
    const c = CONFIG.snow;
    const rad = (c.angleDeg * Math.PI) / 180;
    const sx = Math.sin(rad);
    const spawn = (spread) => ({
      x: rand(0, w),
      y: spread ? rand(0, h) : rand(-40, -5),
      r: rand(c.radius[0], c.radius[1]),
      a: rand(c.alpha[0], c.alpha[1]),
      spd: rand(c.speed[0], c.speed[1]),
      drift: rand(c.speed[0], c.speed[1]) * sx * rand(0.4, 1.2),
      phase: rand(0, Math.PI * 2),
      swayAmp: rand(c.swayAmp[0], c.swayAmp[1]),
      swaySpd: rand(c.swaySpeed[0], c.swaySpeed[1]),
    });
    const n = targetCount(c);
    particles = [];
    for (let i = 0; i < n; i++) particles.push(spawn(true));
  }

  function stepSnow(dt) {
    for (const p of particles) {
      p.phase += p.swaySpd * dt;
      p.y += p.spd * dt;
      p.x += (p.drift + Math.cos(p.phase) * p.swayAmp * p.swaySpd) * dt;
      if (p.y - p.r > h) {
        p.y = rand(-40, -5);
        p.x = rand(0, w);
      }
      if (p.x < -30) p.x = w + 20;
      else if (p.x > w + 30) p.x = -20;
    }
  }

  function drawSnow() {
    const col = colors.snow;
    for (const p of particles) {
      ctx.fillStyle = rgba(col, p.a);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

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
    rain: { build: buildRain, step: stepRain, draw: drawRain },
    snow: { build: buildSnow, step: stepSnow, draw: drawSnow },
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

  /** 真正生效的条件：选了效果 + 系统未要求减少动效 + 页面可见 */
  function active() {
    return mode !== 'off' && !reduced.matches && !document.hidden;
  }

  /* ========================== ⑦ 模式切换与 UI ========================== */
  function syncButtons() {
    if (!seg) return;
    const off = reduced.matches;
    seg.querySelectorAll('button').forEach((b) => {
      const fx = b.dataset.fx;
      b.classList.toggle('active', fx === mode);
      b.setAttribute('aria-pressed', fx === mode ? 'true' : 'false');
      // 系统偏好「减少动态效果」时只允许「关」，并给出原因提示
      const disabled = off && fx !== 'off';
      b.disabled = disabled;
      b.title = disabled ? '系统已开启「减少动态效果」，暂不启用动画' : '';
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
    notifyFxChange(); // 外部 UI（首行日期上方的开关图标）同步状态
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
      if (mode === 'off') return;
      if (!active()) return;
      resize();
      ENGINES[mode].build();
      start();
    }, 160);
  });

  // 主题切换后刷新粒子配色（三套主题的 --fx-* 各不相同）
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
  const initial = readStored();
  if (initial !== 'off' && ENGINES[initial]) {
    mode = initial;
    syncButtons();
    if (active()) {
      ENGINES[mode].build();
      start();
    }
  }

  /* ========================== ⑩ 对外最小 API ==========================
   * 供页面元素复用同一套状态管理（模式 + localStorage），避免第二份真相：
   * · mode()       当前模式（'off' | 'rain' | 'snow' | 'meteor'）
   * · cycle()      单击语义（史蒂夫头像）：关 → 第一个效果；开 → 按 ENGINES
   *                注册顺序循环下一个（雨→雪→流星→雨……）
   * · off()        双击语义：关闭
   * · onChange(cb) 模式每次变化后触发（页脚 / 头像 / 系统偏好变化均含）
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
    cycle() {
      // 系统开启「减少动态效果」时不允许启用（与页脚按钮的禁用策略一致），
      // 直接返回当前模式，由调用方据此给出提示
      if (mode === 'off' && reduced.matches) return mode;
      const keys = Object.keys(ENGINES);
      const i = keys.indexOf(mode);
      setMode(i < 0 ? keys[0] : keys[(i + 1) % keys.length]);
      return mode;
    },
    off() {
      setMode('off');
      return mode;
    },
    onChange(fn) {
      if (typeof fn === 'function') fxListeners.push(fn);
    },
  };
})();
