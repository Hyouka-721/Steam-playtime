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
 *   （例外：雨滴按用户要求固定为深色雨丝——半透明深灰蓝、纺锤形柔边轮廓，见 CONFIG.rain.rgb）
 * · 雨模式附加：视口底部积水层（波动水面线 + 雨滴水中倒影），雨滴落地触发
 *   飞溅水花粒子与扩散涟漪圆环——落点检测与绘制共用同一水面函数 surfaceY()，
 *   保证判定位置与视觉效果一致
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
      rgb: [58, 64, 72],         // 主体：半透明深色雨丝（2026-10-18 按用户要求，深灰蓝）
      density: 170,        // 每 1e6 px² 的雨滴数（1440×950 ≈ 256 根；再被 min/max 夹住）
      min: 60, max: 420,   // 粒子数量上下限
      speed: [1150, 1750], // 下落速度 px/秒（2026-10-18：雨丝调短后适当提高，保持画面节奏）
      length: [3, 8],      // 雨丝长度 px（2026-10-18 大幅调短——更接近真实雨滴的短促形态）
      thickness: [0.5, 1.2],// 线宽 px
      alpha: [0.5, 0.7],    // 主体透明度区间
      angleDeg: 14,         // 方向：与竖直方向的夹角，正数 = 向右下方飘
      jitter: 0.22,         // 个体速度随机抖动比例（让雨有层次）
      endRatio: 0.32,       // 形状：两端收窄到的宽度比例（相对中段；0=尖头尖尾，1=圆柱）
      taper: 0.75,          // 形状：收尾锐度（正弦包络指数；<1 更尖、>1 更圆）
      seg: 9,               // 形状：沿长度的采样分段数（越大轮廓越平滑，开销线性增长）
    },

    // ---- 雨：画面底部积水层与落地飞溅 ----
    puddle: {
      height: 96,        // 积水层高度（视口底部，CSS px；矮视口按 30% 高度内缩）
      waveAmp: 2.6,      // 水面线波动振幅 px（两条正弦谐波叠加，随时间缓慢涌动）
      alpha: 0.10,       // 积水基底不透明度（水面处最大，向下渐隐至 35%）
      lineAlpha: 0.42,   // 水面线不透明度
      reflectRange: 92,  // 倒影作用范围：雨滴距水面多高以内绘制水中镜像
      reflectAlpha: 0.3, // 倒影透明度系数（相对雨滴本体）
      squash: 0.26,      // 涟漪压扁系数（椭圆 ry = rx × 此值，营造透视）
    },
    splash: {
      chance: 0.55,        // 落地时产生飞溅粒子的概率（配合上限控制粒子总量）
      perHit: [3, 6],      // 每次飞溅的粒子数
      particleMax: 240,    // 同屏飞溅粒子上限（窄屏/触屏按 lite.countRatio 缩减）
      rippleChance: 0.6,   // 落地时产生涟漪圆环的概率
      rippleMax: 80,       // 同屏涟漪上限
      speed: [70, 240],    // 飞溅粒子初速 px/s（向上半圆随机方向）
      gravity: 1600,       // 飞溅粒子重力 px/s²（抛物线落回水面即消失）
      life: [0.3, 0.55],   // 飞溅粒子寿命 s
      ringTtl: [0.55, 0.95], // 涟漪寿命 s（逐渐消失）
      ringR: [16, 34],     // 涟漪最大半径 px
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
  let colors = { rain: [58, 64, 72], snow: [195, 210, 223], meteor: [232, 150, 74] };
  let clock = 0;               // 雨模式时钟（秒）：驱动积水水面波动
  let groundY = 0;             // 积水平均水面线 y（CSS px）：surfaceY() 围绕它起伏
  let splashParts = [];        // 飞溅水花粒子池（仅雨模式使用）
  let ripples = [];            // 积水涟漪圆环池（仅雨模式使用）

  function refreshColors() {
    // rgb 字段（固定色）优先于主题 CSS 变量：雨滴按用户要求固定为深色雨丝、
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
    // 积水层贴视口底部；矮视口按 30% 高度内缩，避免水面挤占画面主体
    groundY = h - Math.min(CONFIG.puddle.height, h * 0.3);
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
        // 初始撒点压到水面之上并留 30px 余量（groundY 由 resize 预先算好）：
        // 避免刚开特效就有一批雨滴贴脸触水、凭空刷一片飞溅
        y: spread ? rand(-h * 0.2, Math.max(10, groundY - 30)) : rand(-h * 0.35, -10),
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
    splashParts = [];  // 重建（切模式 / resize / 重新可见）时清空飞溅与涟漪，
    ripples = [];      // 防止上一轮的旧粒子残留
    for (let i = 0; i < n; i++) particles.push(spawn(true));
  }

  /** 积水水面线：绘制与落点检测共用同一函数，保证判定位置与视觉效果一致。
   *  两条正弦谐波叠加、随时间缓慢涌动（clock 驱动），幅度见 CONFIG.puddle.waveAmp */
  function surfaceY(x) {
    const c = CONFIG.puddle;
    return groundY
      + Math.sin(x * 0.018 + clock * 1.1) * c.waveAmp
      + Math.sin(x * 0.043 - clock * 0.7 + 1.7) * c.waveAmp * 0.45;
  }

  function stepRain(dt) {
    for (const p of particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const sy = surfaceY(p.x);
      if (p.y >= sy) {
        // 触水回收：本帧起点为 (p.x - p.vx*dt, p.y - p.vy*dt)，落点按帧内
        // 线性插值回溯到水面处——dt 在分子分母中约掉，得到精确的水面交点
        // 横坐标，保证「检测位置 = 溅射位置 = 水面线位置」三者一致
        const lx = p.x - p.vx * (p.y - sy) / Math.max(p.vy, 1);
        spawnSplash(lx, sy);
        p.x = rand(-0.15 * w, w * 1.05);
        p.y = rand(-h * 0.35, -10);
        continue;
      }
      if (p.x < -0.3 * w || p.x > w * 1.3) {
        p.x = rand(-0.15 * w, w * 1.05);
        p.y = rand(-h * 0.35, -10);
      }
    }
  }

  /** 落地飞溅：在 (x, y) 生成向外扩散的小水花粒子与逐渐消失的涟漪圆环。
   *  概率 + 上限双保险：chance / rippleChance 掷点控制触发频率，
   *  particleMax / rippleMax 封住同屏总量（lite 按 countRatio 再缩减），
   *  密集落雨时粒子预算恒定，不会随落点频率膨胀 */
  function spawnSplash(x, y) {
    const c = CONFIG.splash;
    if (x < -40 || x > w + 40) return;      // 屏幕外落点没有水面可溅（插值偶发）
    const cap = isLite() ? CONFIG.lite.countRatio : 1;
    const pMax = Math.floor(c.particleMax * cap);
    const rMax = Math.floor(c.rippleMax * cap);
    if (Math.random() < c.chance && splashParts.length < pMax) {
      const n = Math.floor(rand(c.perHit[0], c.perHit[1] + 1));
      for (let i = 0; i < n; i++) {
        if (splashParts.length >= pMax) break;
        const ang = rand(-Math.PI * 0.9, -Math.PI * 0.1); // 向上半圆随机方向
        const spd = rand(c.speed[0], c.speed[1]);
        splashParts.push({
          x, y,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd,          // 负值 = 向上
          life: rand(c.life[0], c.life[1]),
          age: 0,
        });
      }
    }
    if (Math.random() < c.rippleChance && ripples.length < rMax) {
      ripples.push({
        x, y,
        r: rand(2, 5),                      // 初始半径：贴近落点的一小圈
        rMax: rand(c.ringR[0], c.ringR[1]) * cap,
        ttl: rand(c.ringTtl[0], c.ringTtl[1]),
        age: 0,
      });
    }
  }

  /** 飞溅/涟漪推进：水花受重力走抛物线、落回水面即消失；
   *  涟漪只累计年龄，扩散与淡出都在绘制端按 age/ttl 计算 */
  function stepSplash(dt) {
    const c = CONFIG.splash;
    for (let i = splashParts.length - 1; i >= 0; i--) {
      const p = splashParts[i];
      p.age += dt;
      p.vy += c.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.age >= p.life || p.y >= surfaceY(p.x)) splashParts.splice(i, 1);
    }
    for (let i = ripples.length - 1; i >= 0; i--) {
      const r = ripples[i];
      r.age += dt;
      if (r.age >= r.ttl) ripples.splice(i, 1);
    }
  }

  /* 雨丝渲染：两端收窄、中段略粗的纺锤形实心轮廓 + 垂直渐变柔边
   * （2026-10-18 按用户要求重写：此前“宽描边 + 细主体”两遍画法有中空长方形观感、
   *  纯白主体在浅色面板上像发白高亮块；现改为单色深灰蓝一次填充：
   *  ① 轮廓沿长度按正弦包络收窄——两端窄、中段宽，无生硬直角；
   *  ② 填充色沿垂直雨丝方向做 透明→实色→透明 渐变——边缘柔化，无边框感）
   * 2026-10-18 追加积水层后：形状逻辑抽成 drawStreak() 供雨滴本体与水中倒影
   *  共用（倒影 = 同一根雨丝以水面为镜面、纵向 0.5 压扁的浅淡镜像）。
   * 调参：CONFIG.rain.endRatio 头尾端残余宽度比例（0=尖头尖尾）；
   *      taper 收尾锐度（<1 更尖、>1 更圆）；seg 沿长度采样分段数 */
  function drawRain() {
    const c = CONFIG.puddle;
    for (const p of particles) {
      const hx = p.x, hy = p.y;              // 头端（运动方向前方）
      const tx = hx - p.ux * p.len;          // 尾端
      const ty = hy - p.uy * p.len;
      drawStreak(hx, hy, tx, ty, p.thick, p.a);
      // 水中倒影：距水面 reflectRange 以内才画；以本地水面线为镜面、
      // 0.5 纵向压扁，透明度 × reflectAlpha，且越近水面越实
      const sy = surfaceY(p.x);
      const above = hy - sy;                 // 头端高出水面多少（触水帧可能略小于 0）
      if (above < c.reflectRange) {
        const fade = clamp(1 - above / c.reflectRange, 0, 1);
        drawStreak(
          hx, sy + Math.max(above, 0) * 0.5,
          tx, sy + Math.max(sy - ty, 0) * 0.5,
          p.thick,
          p.a * c.reflectAlpha * fade,
        );
      }
    }
  }

  /** 单根雨丝（本体或倒影）绘制：传入头/尾端点、线宽与透明度即可。
   *  轮廓沿长度按正弦包络收窄（两端窄、中段宽）；填充沿垂直方向
   *  透明→实色→透明 渐变，一次 fill 成实心柔边形状 */
  function drawStreak(hx, hy, tx, ty, thick, alpha) {
    if (alpha <= 0.002) return;
    const col = colors.rain;
    const END = CONFIG.rain.endRatio;  // 两端收窄到的宽度比例（相对中段半宽）
    const TAPER = CONFIG.rain.taper;   // 正弦包络指数
    const SEG = CONFIG.rain.seg;       // 沿雨丝长度的采样段数
    const L = Math.hypot(hx - tx, hy - ty) || 1;
    const ux = (hx - tx) / L, uy = (hy - ty) / L;   // 轴向单位向量（尾→头）
    const t = thick / 2;                            // 中段半宽（雨丝最粗处）
    ctx.beginPath();
    for (let i = 0; i <= SEG; i++) {
      const s = i / SEG;                                        // 0=尾 1=头
      const wdt = t * (END + (1 - END) * Math.pow(Math.sin(Math.PI * s), TAPER));
      const cx = tx + (hx - tx) * s;
      const cy = ty + (hy - ty) * s;
      const ex = cx - uy * wdt, ey = cy + ux * wdt;             // 垂直于轴偏移 ±wdt
      if (i === 0) ctx.moveTo(ex, ey); else ctx.lineTo(ex, ey);
    }
    for (let i = SEG; i >= 0; i--) {
      const s = i / SEG;
      const wdt = t * (END + (1 - END) * Math.pow(Math.sin(Math.PI * s), TAPER));
      const cx = tx + (hx - tx) * s;
      const cy = ty + (hy - ty) * s;
      ctx.lineTo(cx + uy * wdt, cy - ux * wdt);
    }
    ctx.closePath();
    // 柔边：以雨丝中点为原点、沿垂直方向铺 透明→实色→透明 渐变后填充
    const mx = (tx + hx) / 2, my = (ty + hy) / 2;
    const g = ctx.createLinearGradient(mx - uy * t, my + ux * t, mx + uy * t, my - ux * t);
    g.addColorStop(0, rgba(col, 0));
    g.addColorStop(0.5, rgba(col, alpha));
    g.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = g;
    ctx.fill();
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

  /** 积水层：半透明基底（水面处最实、向下渐隐至 35%）+ 一条随时间涌动的水面线。
   *  水面线由 surfaceY() 采样连线——与落点检测同一函数，视觉与判定严格一致 */
  function drawPuddle() {
    const c = CONFIG.puddle;
    const top = groundY - c.waveAmp * 2;        // 渐变上沿盖住波动最大行程
    const g = ctx.createLinearGradient(0, top, 0, h);
    g.addColorStop(0, rgba(colors.rain, c.alpha));
    g.addColorStop(1, rgba(colors.rain, c.alpha * 0.35));
    ctx.fillStyle = g;
    ctx.fillRect(0, top, w, h - top);
    ctx.beginPath();
    const stepPx = 12;                          // 水面线采样步长 px
    for (let x = 0; x <= w + stepPx; x += stepPx) {
      const y = surfaceY(x);
      if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = rgba(colors.rain, c.lineAlpha);
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  /** 涟漪圆环：落点处扩散的压扁椭圆（ry = rx × squash 营造水面透视），
   *  半径先快后慢扩张、透明度随寿命衰减直至消失；
   *  裁剪到水面线以下——涟漪在水面上，不飘到空气中 */
  function drawRipples() {
    const squash = CONFIG.puddle.squash;
    const col = colors.rain;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, groundY - CONFIG.puddle.waveAmp * 2, w, h);
    ctx.clip();
    ctx.lineWidth = 1;
    for (const r of ripples) {
      const t = r.age / r.ttl;                  // 0→1 寿命进度
      const ease = 1 - Math.pow(1 - t, 2.2);    // 先快后慢的扩散曲线
      const rx = r.r + (r.rMax - r.r) * ease;
      const alpha = (1 - t) * 0.5;
      if (alpha <= 0.01) continue;
      ctx.strokeStyle = rgba(col, alpha);
      ctx.beginPath();
      ctx.ellipse(r.x, r.y, rx, Math.max(rx * squash, 0.8), 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** 飞溅水花：一粒粒短促的向上小水珠（沿速度方向反向拖 2.4px 短线），
   *  透明度随剩余寿命衰减；落回水面或寿终即消失（消失逻辑在 stepSplash） */
  function drawSplashParts() {
    const col = colors.rain;
    ctx.lineCap = 'round';
    ctx.lineWidth = 1;
    for (const p of splashParts) {
      const k = 1 - p.age / p.life;
      if (k <= 0) continue;
      const m = Math.hypot(p.vx, p.vy) || 1;
      const ux = p.vx / m, uy = p.vy / m;
      ctx.strokeStyle = rgba(col, 0.5 * k);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - ux * 2.4, p.y - uy * 2.4);
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
  }

  /** 雨模式单帧入口：clock 驱动水面波动；粒子 + 飞溅 + 涟漪一次推进完 */
  function stepRainAll(dt) {
    clock += dt;
    stepRain(dt);
    stepSplash(dt);
  }

  /** 雨模式绘制入口：先积水基底与水面线，再雨滴与倒影，最后涟漪与飞溅——
   *  由远及近，落点效果（涟漪/飞溅）自然压在水面视觉效果之上 */
  function drawRainAll() {
    drawPuddle();
    drawRain();
    drawRipples();
    drawSplashParts();
  }

  const ENGINES = {
    rain: { build: buildRain, step: stepRainAll, draw: drawRainAll },
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
