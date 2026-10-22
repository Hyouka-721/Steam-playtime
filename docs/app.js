/* Steam 游戏时长统计 —— 零构建前端，仅依赖 ECharts CDN */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const ICON = (appid, hash) =>
    hash ? `https://media.steampowered.com/steamcommunity/public/images/apps/${appid}/${hash}.jpg` : null;
  // 游戏横幅大图（Steam 官方 CDN，460x215）
  const CAPSULE = (appid) => `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`;

  /* 1x1 透明 GIF 占位（35 字节）：
     胶囊图在真正需要时才赋 src（见 observeCapsules）。用 data URI 而不是
     留空 src —— 空 src 会被解析成「当前页面 URL」，触发二次文档请求。 */
  const BLANK_GIF =
    'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

  /* 胶囊图懒加载观察器：单例复用，列表重渲染时把新节点重新登记。
     rootMargin 200px 让图在滚到前半屏开外就开始下载，用户不会看到空框。
     不支持 IntersectionObserver 的旧浏览器 → 直接全部加载（等价旧行为）。 */
  let capsuleIO = null;
  const capsuleSeen = new WeakSet();

  function hydrateCapsule(img) {
    if (capsuleSeen.has(img)) return;
    capsuleSeen.add(img);
    const src = img.dataset.src;
    if (src) {
      img.src = src;
      delete img.dataset.src;
    }
  }

  function observeCapsules(root) {
    const imgs = root ? root.querySelectorAll('img.rank-capsule[data-src]') : [];
    if (!imgs.length) return;
    if (!('IntersectionObserver' in window)) {
      imgs.forEach(hydrateCapsule);
      return;
    }
    if (!capsuleIO) {
      capsuleIO = new IntersectionObserver(
        (entries, obs) => {
          for (const e of entries) {
            if (!e.isIntersecting) continue;
            hydrateCapsule(e.target);
            obs.unobserve(e.target); // 赋过 src 就不再观察，避免重复回调
          }
        },
        { rootMargin: '200px 0px' } // 上下都提前，滚动方向无关
      );
    }
    imgs.forEach((img) => capsuleIO.observe(img));
  }

  const state = {
    meta: null,       // 站点 meta（唯一一份：2026-10-21 起不再有"按回看日期反推"的派生快照）
    ach: null,        // 成就数据：首屏只有 stats（轻量摘要），明细按需加载后才有 games
    achReady: false,  // 成就**明细**（games / achievements）是否已加载
    achLoading: null, // 明细加载中的 Promise（并发去重）
    achFilter: null,  // 成就页游戏筛选
    days: new Map(),  // 'YYYY-MM-DD' -> day（全量；日历二级界面按日期直接取用）
    allDates: [],     // 有记录的日期索引（升序）
    view: 'lifetime',
    drill: { appid: null },   // 二级趋势界面：null = 每日总时长
    drillRange: 30,
    charts: {},
    // ---- 游玩日历浮层（点击「最近游玩」首行日期上方的小日历图标打开）----
    cal: { open: false, ym: '2026-10', busy: false, lastFocus: null, day: null },
  };

  // ---------- utils ----------
  function hm(m) {
    const n = Math.round(Number(m) || 0);
    if (n <= 0) return '0 min';
    if (n < 60) return `${n} min`;
    const h = Math.floor(n / 60);
    const r = n % 60;
    return r === 0 ? `${h} h` : `${h} h ${r} min`;
  }
  /** 当天明细用的可读时长：'2 小时 11 分钟' / '45 分钟' / '不足 1 分钟'。
      整分钟数据里 0 分钟 = 玩了一下但不足一分钟，不能显示成 '0 分钟'（会被当成没玩） */
  function hmText(m) {
    const n = Math.round(Number(m) || 0);
    if (n <= 0) return '不足 1 分钟';
    if (n < 60) return `${n} 分钟`;
    const h = Math.floor(n / 60);
    const r = n % 60;
    return r === 0 ? `${h} 小时` : `${h} 小时 ${r} 分钟`;
  }
  const ymd = (d) => (d instanceof Date ? d : new Date(d)).toISOString().slice(0, 10);
  function addDaysStr(dateStr, n) {
    const d = new Date(`${dateStr}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }
  function eachDate(start, end) {
    const out = [];
    for (let d = start; d <= end; d = addDaysStr(d, 1)) out.push(d);
    return out;
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  /* 数据请求（2026-10-18 首屏优化重写）
     原实现 `fetch(url, { cache: 'no-store' })` —— 每次刷新都绕过 HTTP 缓存重新下载，
     而 GitHub Pages 本身给了 `Cache-Control: max-age=600` + ETag，等于把服务端缓存
     权限主动放弃了。实测 achievements.json(285KB) 冷启动 13.6s、即使热连接 0.94s，
     每次刷新都要重付这笔钱。
     现在：默认走浏览器 HTTP 缓存（命中则 0 字节），过期后由 ETag 协商（304 极快）。
     数据每天 23:30 更新一次，10 分钟的新鲜度完全够用；需要绝对新鲜时用 Ctrl+F5，
     或在 URL 上加时间戳（见 metaVersion）。 */
  async function jget(url, tries = 3) {
    let lastErr;
    for (let i = 0; i < tries; i++) {
      try {
        const r = await fetch(url, { cache: 'default' }); // 交给 HTTP 缓存 + ETag 协商
        if (!r.ok) throw new Error(`${url} -> HTTP ${r.status}`);
        return await r.json();
      } catch (e) {
        lastErr = e;
        // 失败重试：900ms/1800ms 递增退避。首屏关键请求只试 1 次（tries=1），
        // 避免一个慢请求把整个首屏拖到秒级；非关键资源再重试。
        if (i < tries - 1) await new Promise((res) => setTimeout(res, 900 * (i + 1)));
      }
    }
    throw lastErr;
  }

  /* ---------- 骨架屏（2026-10-18 首屏优化）----------
     用户反馈"每次刷新都先长时间停在加载画面"——数据到位前页面是一张全是「—」的
     空白卡片 + 空列表框，观感上像卡死。骨架屏用与真实内容同形状的浅色块占位，
     让等待有明确的"正在来"的信号；配合增量渲染，概览卡与列表可以先各自到位。 */
  function rankSkeleton(n = 8) {
    return Array.from({ length: n }, () =>
      '<div class="sk-row">' +
      '<span class="sk-block sk-no"></span>' +
      '<span class="sk-block sk-cap"></span>' +
      '<span class="sk-block sk-line"></span>' +
      '<span class="sk-block sk-bar"></span>' +
      '<span class="sk-block sk-min"></span>' +
      '<span class="sk-block sk-date"></span>' +
      '</div>'
    ).join('');
  }
  function achSkeleton(n = 6) {
    return Array.from({ length: n }, () =>
      '<div class="sk-row" style="grid-template-columns:40px 1fr 120px">' +
      '<span class="sk-block" style="width:40px;height:40px;border-radius:8px"></span>' +
      '<span class="sk-block sk-line"></span>' +
      '<span class="sk-block sk-date"></span>' +
      '</div>'
    ).join('');
  }
  /** 首屏骨架（兜底）：骨架已由 index.html 静态预置，随首个字节即显示，
   *  不必等本脚本下载执行。这里只处理"HTML 版本较旧、没有预置骨架"的情况
   *  （例如用户缓存了旧 HTML），保证任何情况下都不会露出空白框。 */
  function paintSkeletons() {
    const lt = $('lt-list');
    if (lt && !lt.querySelector('.sk-row') && !lt.querySelector('.rank-item')) {
      lt.innerHTML = rankSkeleton(8);
    }
    ['c-lifetime', 'c-recent', 'c-ach', 'c-games', 'c-data'].forEach((id) => {
      const el = $(id);
      if (el && el.textContent.trim() === '—') el.classList.add('sk-value');
    });
  }
  function clearCardSkeleton() {
    ['c-lifetime', 'c-recent', 'c-ach', 'c-games', 'c-data'].forEach((id) => {
      $(id)?.classList.remove('sk-value');
    });
  }

  /** 致命错误兜底：给出可见提示与重试按钮，避免页面无声空白 */
  function showFatal(msg) {
    clearCardSkeleton(); // 出错时不留下一直闪的骨架块
    document.querySelectorAll('.view').forEach((v) => (v.style.display = 'none'));
    if (document.querySelector('.load-error')) return;
    const el = document.createElement('div');
    el.className = 'load-error';
    el.innerHTML =
      `<p><strong>⚠ ${msg}</strong></p>` +
      '<p class="load-error-sub">可能是网络波动，或站点正在重新部署（刚推送过更新）。</p>' +
      '<button class="btn" id="btn-reload">重新加载</button>';
    document.querySelector('.cards')?.insertAdjacentElement('afterend', el);
    $('btn-reload').addEventListener('click', () => location.reload());
  }

  // ---------- 主题 ----------
  /** 3 套主题（全浅色）：切换只改 <html data-theme>，配色全部走 CSS 变量 */
  const THEMES = [
    { id: 'cream', name: '暖阳米', mode: 'light' },
    { id: 'mint', name: '薄荷晨', mode: 'light' },
    { id: 'dawn', name: '晨曦紫', mode: 'light' },
  ];
  /** 读取当前主题的 CSS 变量（图表画在 canvas 上，必须显式取色） */
  const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const themeName = (id) => (THEMES.find((t) => t.id === id) ?? THEMES[0]).name;

  function currentTheme() {
    const t = document.documentElement.dataset.theme;
    return THEMES.some((x) => x.id === t) ? t : 'cream';
  }

  function applyTheme(id, { announce = false } = {}) {
    if (!THEMES.some((t) => t.id === id)) id = 'cream';
    document.documentElement.dataset.theme = id;
    // 持久化：刷新 / 重新进入页面时沿用（2026-10-18 起取代刷新随机换主题）；
    // <head> 内联脚本首屏前读同一 key，隐私模式下静默失败不影响当前会话
    try { localStorage.setItem('theme', id); } catch (e) { /* 隐私模式下忽略 */ }
    syncThemeUi(id);
    // 图表画在 canvas 上，不会跟随 CSS 变量，需重新渲染
    // （echarts 按需加载，尚未加载时 renderDrill 内部直接返回，不会报错）
    if (state.charts.drill) renderDrill();
    if (announce) toast(`主题：${themeName(id)}`);
  }

  /** 同步站标（小黄人）的 title 提示（首屏内联脚本先于本脚本应用了持久化主题，
      文案也要随之更新）。 */
  function syncThemeUi(id = currentTheme()) {
    const light = $('theme-light');
    if (light) light.title = `当前主题：${themeName(id)} · 点击切换浅色主题`;
  }

  /** 在指定深/浅组内随机挑一个与当前不同的主题 */
  function randomTheme(mode) {
    const cur = currentTheme();
    const pool = THEMES.filter((t) => t.mode === mode && t.id !== cur);
    // 组内全被排除时（当前主题不在该组）直接全组随机
    const list = pool.length ? pool : THEMES.filter((t) => t.mode === mode);
    return list[Math.floor(Math.random() * list.length)].id;
  }

  function toast(msg) {
    document.querySelectorAll('.toast').forEach((t) => t.remove());
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1500);
  }

  /* ---------- load ----------
     2026-10-18 首屏优化（两轮）：
     第一轮解决了「串行 + no-store + 285KB 进关键路径」；
     第二轮发现真正的成本是 **GitHub Pages 的 TTFB**：连接复用后每个请求仍要
     排 320~580ms 才回第一个字节，而文件本身只有几 KB。所以"减少请求数"比
     "减小体积"更值钱。于是：
       ① meta + 当月的 daily **合成一个请求**（原 2 个 → 1 个，省一次排队）；
       ② 构建期把这份合并数据**内联进 index.html**（window.__BOOT），
          首屏连这 1 个请求都不用发——DOM 解析完数据就在手上了；
       ③ 内联数据带日期戳，过期（跨天/换了快照）则自动回退到 fetch，
          保证数据永远是新的；
       ④ 月份数据若有多个，第一个进内联，其余仍并行拉取。
     兜底：没有内联数据（例如老页面缓存、构建未运行）时走原来的 fetch 路径。 */
  const BOOT_MAX_AGE_H = 36; // 内联数据的最长可用时长（小时）；采集每天 23:30 跑一次

  function bootDataIsFresh(b) {
    if (!b || !b.generated_at) return false;
    const t = Date.parse(b.generated_at);
    if (!Number.isFinite(t)) return false;
    return Date.now() - t < BOOT_MAX_AGE_H * 3600 * 1000;
  }

  async function load() {
    const boot = window.__BOOT;
    let monthData = null;

    if (bootDataIsFresh(boot)) {
      // 快路径：内联数据即可用，零网络请求
      state.meta = boot.meta;
      monthData = boot.daily; // { '2026-10': {...} }
    } else {
      try {
        state.meta = await jget('data/meta.json', 1); // 首屏关键：快速失败，交给 showFatal
      } catch (e) {
        showFatal('数据加载失败');
        return false;
      }
    }

    // 月份数据：内联里已带的直接用，缺的并行补拉
    const months = state.meta.months ?? [];
    if (monthData) {
      for (const m of months) {
        const d = monthData[m];
        if (d) for (const [date, day] of Object.entries(d.days ?? {})) state.days.set(date, day);
      }
    }
    const missing = months.filter((m) => !monthData || !monthData[m]);
    if (missing.length) {
      const results = await Promise.allSettled(missing.map((m) => jget(`data/daily/${m}.json`, 2)));
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') {
          for (const [date, day] of Object.entries(r.value.days ?? {})) state.days.set(date, day);
        } else {
          console.warn('月份加载失败', missing[i], r.reason);
        }
      });
    }
    state.allDates = [...state.days.keys()].sort();

    // 成就摘要（轻量）：优先用 meta 里 CI 同步过来的 ach_stats，
    // 这样概览卡立刻有值，不必等 285KB 的明细文件。
    const s = state.meta.ach_stats;
    if (s && Number(s.total) > 0) {
      state.ach = { stats: s }; // 只有 stats，games 待 ensureAchDetail 补齐
    }
    return true;
  }

  /* 成就**明细**按需加载（进入「成就」视图时才调用）。
     - 并发去重：同一时刻多次调用只发一个请求
     - 失败静默降级：成就页显示"尚未采集"文案，不影响其余页面
     - 旧快照无 meta.ach_stats 时，这里也顺手兜底填充 stats */
  function ensureAchDetail() {
    if (state.achReady) return Promise.resolve(state.ach);
    if (state.achLoading) return state.achLoading;
    state.achLoading = (async () => {
      try {
        const ach = await jget('data/achievements.json', 2);
        if (ach && ach.ready && ach.stats?.total > 0) {
          state.achReady = true;
          state.ach = ach;
        }
      } catch (e) {
        console.warn('成就明细加载失败（每日采集任务自明日开始产出）', e);
      } finally {
        state.achLoading = null;
      }
      return state.ach;
    })();
    return state.achLoading;
  }

  // ---------- 概览卡片 ----------
  function lastNDaysTotal(n) {
    if (!state.allDates.length) return { minutes: 0, start: null, end: null };
    const end = state.allDates[state.allDates.length - 1];
    const start = addDaysStr(end, -(n - 1));
    let minutes = 0;
    for (const d of eachDate(start, end)) minutes += state.days.get(d)?.total_minutes ?? 0;
    return { minutes, start, end };
  }

  function renderCards() {
    const s = state.meta.stats ?? {};
    const asOf = state.meta.last_snapshot_date;
    clearCardSkeleton(); // 有值了就把占位块撤掉（HTML 里预置的 sk-value 类）

    $('c-lifetime').textContent = hm(s.lifetime_minutes ?? 0);

    // 最近游玩卡：近两周总时长。口径固定，不随日历浮层里选了哪一天而变化
    // （2026-10-21 前此处会跟随"回看态"显示当天总时长，整页回看已移除）
    $('c-recent').textContent = hm(lastNDaysTotal(14).minutes);
    const recentCard = $('card-recent');
    if (recentCard) recentCard.title = '点击查看近两周的游玩记录';

    // 游戏库卡：玩过 / 拥有
    $('c-games').textContent = `${s.lifetime_played_games ?? 0} / ${s.owned_games ?? 0}`;

    // 成就卡：完成百分比（2026-10-17 起不再显示「已解锁/总数」小字）；无数据时只显示占位符
    if (state.ach?.stats) {
      $('c-ach').textContent = `${state.ach.stats.pct}%`;
    } else {
      $('c-ach').textContent = '—';
    }

    // 数据卡：数据截止时间（不加速度前缀，保持卡片轻量）
    $('c-data').textContent = asOf ?? '等待采集';

    const dr = $('data-range');
    if (dr) {
      dr.textContent = asOf
        ? `数据截至 ${asOf}` + (state.meta.tracking_since ? ` · 每日记录自 ${state.meta.tracking_since}` : '')
        : '等待首次采集';
    }

    $('footer-gen').textContent = `数据生成于 ${state.meta.generated_at_local ?? '—'}`;
  }

  // ---------- ① 游戏累计 ----------
  /** 追踪期内每款游戏的近期时长（近 N 天），用于「在玩」标记与最近游玩页 */
  function recentMinutesByApp(windowDays) {
    const map = new Map();
    if (!state.allDates.length) return map;
    const end = state.allDates[state.allDates.length - 1];
    const start = addDaysStr(end, -(windowDays - 1));
    for (const d of eachDate(start, end)) {
      for (const g of state.days.get(d)?.games ?? []) {
        map.set(g.appid, (map.get(g.appid) ?? 0) + g.minutes);
      }
    }
    return map;
  }

  const topPalette = [
    '#f0a35c', '#4ba3e3', '#7fd1a8', '#e8b13a', '#c98ad1',
    '#9d8cff', '#66c0f4', '#e8766a', '#5ad0c0', '#b8d45a',
  ];

  /* 「最近游玩」首行日期上方的「游玩日历」入口图标（2026-10-20 收敛为全站唯一入口）：
     透明小日历（无底色无边框），CSS 里绝对定位于日期文字上方，不占布局、不改行高；
     点击只做一件事：弹出日历浮层（一级月历 → 二级当天明细），不改变浮层以外的
     任何页面状态（2026-10-21 前点它会把整页切到"回看态"，该逻辑已整体移除）。
     史蒂夫头像已改为氛围特效开关（单击 开 / 关，仅流星）。

     2026-10-20 收敛：累计榜（#lt-list）里的同一枚图标已整体摘除，相关渲染分支、
     事件拦截、状态同步全部删干净，日历入口只保留在「最近游玩」首行。
     累计榜首行现在与其它行结构完全一致（.rank-last 里只有日期文字），
     不会留下空节点、多余占位或高度变化。#recent-list 的委托负责点击；
     该列表的行本身没有下钻行为，因此这里只处理日历按钮。 */
  const CAL_ICON_BTN =
    '<button class="cal-icon-btn" type="button" data-cal-toggle ' +
    'title="点击打开游玩日历，查看某一天的游戏明细" aria-label="打开游玩日历，查看有游玩记录的那一天的游戏明细">' +
    '<svg viewBox="0 0 20 20" width="22" height="22" aria-hidden="true" focusable="false">' +
    '<rect x="2.6" y="4.2" width="14.8" height="13.6" rx="2.2"></rect>' +
    '<path d="M2.6 8.6h14.8M7 2.6v3M13 2.6v3"></path>' +
    '</svg></button>';

  function renderLifetime() {
    const box = $('lt-list');
    const lifetime = Object.values(state.meta.games_lifetime ?? {});
    if (!lifetime.length) {
      box.innerHTML = '<p class="empty">暂无游戏数据。首次快照采集完成后即会显示。</p>';
      return;
    }
    const recent = recentMinutesByApp(14);
    const list = lifetime.slice().sort((a, b) => b.lifetime_minutes - a.lifetime_minutes);
    // 0 时长的「从未游玩」游戏不参与竞争，收进折叠区，避免占据半屏视觉空间
    const played = list.filter((g) => g.lifetime_minutes > 0);
    const idle = list.filter((g) => g.lifetime_minutes === 0);

    const max = Math.max(...played.map((g) => g.lifetime_minutes), 1);
    const totalShown = played.reduce((a, g) => a + g.lifetime_minutes, 0);
    // 全成就解锁集合只算一次，供所有行复用（不在每行里重建 Set）
    const perfect = perfectGameSet();

    const rowHtml = (g, i) => {
      const icon = ICON(g.appid, g.img_icon_url);
      const pct = Math.max(g.lifetime_minutes > 0 ? 1.5 : 0, (g.lifetime_minutes / max) * 100);
      const barStyle = i < topPalette.length ? `width:${pct}%;background:${topPalette[i]}` : `width:${pct}%`;
      const playing = (recent.get(g.appid) ?? 0) > 0;
      const noCls = i < 3 ? ` r${i + 1}` : '';
      // 2026-10-20：累计榜已不再挂载日历入口（该入口收敛到「最近游玩」，
      // 见 CAL_ICON_BTN 处注释）。这里与其它行结构完全一致 —— .rank-last 里
      // 只有日期文字，没有多余按钮节点，也不会因缺少绝对定位子元素而改变高度。
      const lastHtml = `<span class="rank-last">${g.last_played ?? '—'}</span>`;
      // 胶囊图按需加载（2026-10-18 首屏优化）：原生 loading="lazy" 的判定时机
      // 在各浏览器/无头环境下差异很大——实测 53 行会一次性发起 53 个 Steam CDN
      // 请求，首屏带宽被远端的列表图抢走，反而拖慢首屏那几张关键图。
      // 这里改为「占位透明 GIF + IntersectionObserver 临近视口才赋 src」：
      // 首屏可见的几行由观察器立刻接管（rootMargin 提前 200px 预热），
      // 屏幕外的行在滚动到附近前完全零请求。首行额外走高优先级，让焦点图先到。
      const eager = i === 0;
      // 全部成就已解锁 → 给整个 wrap 加 .is-perfect，内嵌的「多色流动渐变环」就此显形
      // （见 style.css .rank-capsule-wrap / .ring-*）。img 自身不加任何类，
      // 宽高与 object-fit 保持原样，网格列宽、行高、序号位置全不受影响。
      const perfectCls = perfect.has(String(g.appid)) ? ' is-perfect' : '';
      return `<div class="rank-item${g.lifetime_minutes === 0 ? ' zero' : ''}" data-appid="${g.appid}" title="点击查看该游戏每日时长趋势">
          <span class="rank-no${noCls}">${i + 1}</span>
          ${capsuleHtml(g.appid, { perfect: !!perfectCls, eager, icon })}
          <span class="rank-name" title="${escapeHtml(g.name)}">${escapeHtml(g.name)}${playing ? '<span class="tag playing">在玩</span>' : ''}</span>
          <span class="rank-bar"><span style="${barStyle}"></span>${i === 0 ? '<img class="rank-cat" src="img/rank-cat-4657a654.webp" alt="" draggable="false" width="400" height="225" decoding="async"><img class="rank-tj" src="img/rank-tj-b9b7fccd.webp" alt="" draggable="false" width="560" height="420" decoding="async"><img class="rank-penguin" src="img/rank-penguin-fb2f58a8.webp" alt="" draggable="false" width="520" height="210" decoding="async">' : ''}</span>
          <span class="rank-min">${hm(g.lifetime_minutes)}</span>
          ${lastHtml}
        </div>`;
    };

    let html = played.map((g, i) => rowHtml(g, i)).join('');
    if (idle.length) {
      html +=
        `<div class="idle-toggle" id="idle-toggle" role="button" tabindex="0" aria-expanded="false">` +
        `<span class="idle-caret">▸</span>` +
        `<span class="idle-label">展开 ${idle.length} 款未游玩的游戏</span>` +
        `</div>` +
        `<div id="idle-list" class="rank-list" hidden>${idle.map((g, i) => rowHtml(g, played.length + i)).join('')}</div>`;
    }
    html +=
      `<p class="list-foot">共 ${played.length} 款已游玩游戏 · 合计 ${hm(totalShown)}` +
      (idle.length ? `　<span class="list-foot-dim">另有 ${idle.length} 款从未启动</span>` : '') +
      `</p>`;

    box.innerHTML = html;
    observeCapsules(box); // 登记新渲染出的胶囊图（视口临近才真正下载）
    if (idle.length) bindIdleToggle(idle.length);
  }

  /** 折叠区标题点击 / 回车均可展开与收起 */
  function bindIdleToggle(count) {
    const toggle = $('idle-toggle');
    const list = $('idle-list');
    const caret = toggle.querySelector('.idle-caret');
    const label = toggle.querySelector('.idle-label');
    const flip = () => {
      const willOpen = list.hidden;
      list.hidden = !willOpen;
      toggle.setAttribute('aria-expanded', String(willOpen));
      toggle.classList.toggle('open', willOpen);
      caret.textContent = willOpen ? '▾' : '▸';
      label.textContent = willOpen ? '收起未游玩的游戏' : `展开 ${count} 款未游玩的游戏`;
      // 展开时才把折叠区里的胶囊图登记进观察器：收起状态下不产生任何请求
      if (willOpen) observeCapsules(list);
    };
    toggle.addEventListener('click', flip);
    toggle.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        flip();
      }
    });
  }

  /* ---- 右上史蒂夫头像 → 氛围特效开关 ----
   * 单击：开 → 关 → 开 ……（2026-10-18 起仅剩流星一种效果，策略在 fx.js 的
   * toggle()；此前的 雨/雪/流星 循环与「双击关闭」已按用户要求整体移除）。
   * 状态提示（title 文案）由 syncSteveFx 统一同步。 */
  const FX_NAME = '流星';

  /** 同步头像的特效状态标识：data-fx（状态标记）+ title 文案 */
  function syncSteveFx() {
    const el = $('fx-toggle');
    if (!el) return;
    const m = window.__fx ? window.__fx.mode() : 'off';
    if (m === 'off') delete el.dataset.fx;
    else el.dataset.fx = m;
    el.title = m === 'off'
      ? '氛围效果：关 · 单击开启'
      : `氛围效果：${FX_NAME} · 单击关闭`;
    el.setAttribute('aria-label', m === 'off' ? '氛围效果已关闭，单击开启' : `氛围效果：${FX_NAME}`);
  }

  /** 头像被激活（点击 / 回车 / 空格）→ 开关特效 */
  function onSteveActivate() {
    const fx = window.__fx;
    if (!fx) return;
    const before = fx.mode();
    const after = fx.toggle();
    // 被系统「减少动态效果」拦住（状态没变）→ 给个两秒临时说明
    if (after === before && before === 'off') flashSteve('系统已开启「减少动态效果」，暂不启用动画');
  }

  /** 在头像 title 上显示 2 秒临时说明（不改变任何状态） */
  function flashSteve(text) {
    const el = $('fx-toggle');
    if (!el) return;
    el.title = text;
    setTimeout(() => {
      if (el.isConnected && el.title === text) syncSteveFx();
    }, 2000);
  }

  // ---------- ①b 最近游玩（近两周时长） ----------
  // 2026-10-22：头部「近 14 天 · 共 N 款游戏」提示行已按用户要求删除，
  // #recent-hint 元素与这里的两处赋值一并移除（不再有 hint 引用）。
  function renderRecent() {
    const box = $('recent-list');
    const lifetime = state.meta.games_lifetime ?? {};
    const recent = recentMinutesByApp(14);
    const list = Object.values(lifetime)
      .map((g) => ({ ...g, recent: recent.get(g.appid) ?? 0 }))
      .filter((g) => g.recent > 0)
      .sort((a, b) => b.recent - a.recent);

    if (!list.length) {
      box.innerHTML = '<p class="empty">最近两周还没有游玩记录（每日数据自首次快照后开始积累）。</p>';
      return;
    }
    const max = Math.max(...list.map((g) => g.recent), 1);
    // 与累计榜同一口径：全成就解锁的游戏胶囊图标金（集合只建一次）
    const perfect = perfectGameSet();

    box.innerHTML = list
      .map((g, i) => {
        const icon = ICON(g.appid, g.img_icon_url);
        const pct = Math.max(1.5, (g.recent / max) * 100);
        const barStyle = i < topPalette.length ? `width:${pct}%;background:${topPalette[i]}` : `width:${pct}%`;
        const noCls = i < 3 ? ` r${i + 1}` : '';
        const perfectCls = perfect.has(String(g.appid)) ? ' is-perfect' : '';
        // 「最近游玩」首行日期上方的「游玩日历」入口（2026-10-20 起全站唯一）：
        // 与原先累计榜那个按钮**同一个常量、同一套 CSS**，因此尺寸/样式/居中方式一致。
        // 图标绝对定位在日期文字上方，不占布局，日期文字位置与行高不受影响；
        // 点击由 #recent-list 委托处理（共用的 data-cal-toggle + openCal()）。
        const lastHtml = i === 0
          ? `<span class="rank-last">${CAL_ICON_BTN}${g.last_played ?? '—'}</span>`
          : `<span class="rank-last">${g.last_played ?? '—'}</span>`;
        return `<div class="rank-item">
          <span class="rank-no${noCls}">${i + 1}</span>
          ${capsuleHtml(g.appid, { perfect: !!perfectCls, icon })}
          <span class="rank-name" title="${escapeHtml(g.name)}">${escapeHtml(g.name)}</span>
          <span class="rank-bar"><span style="${barStyle}"></span></span>
          <span class="rank-min">${hm(g.recent)}</span>
          ${lastHtml}
        </div>`;
      })
      .join('');
    observeCapsules(box); // 与累计榜同一套按需加载
  }

  // ---------- ①c 二级趋势界面（游戏累计下钻） ----------
  /** 每天每款游戏的时长已在 daily 数据中；这里负责折线展示。游戏由列表点击进入，不做切换下拉 */

  /** ECharts 按需加载（2026-10-18 首屏优化）
   *  原先在 <head> 里同步加载 ~1MB 的 echarts.min.js，会阻塞首屏渲染与
   *  DOMContentLoaded，而首屏（概览卡 + 列表）根本用不到图表。
   *  现在改为**第一次真正需要画图时**才注入 script，加载完成前 renderDrill
   *  会排队等待；主 CDN 失败自动切备用 CDN，两者都失败则给出可见提示并
   *  保持页面其余部分正常（图表区降级，不影响卡片/列表/日历）。 */
  const ECHARTS_SRC = [
    'https://cdn.jsdelivr.net/npm/echarts@5.5.1/dist/echarts.min.js',
    'https://cdn.bootcdn.net/ajax/libs/echarts/5.5.1/echarts.min.js',
  ];
  let echartsPromise = null;

  function loadEcharts() {
    if (window.echarts) return Promise.resolve(window.echarts);
    if (echartsPromise) return echartsPromise;
    echartsPromise = new Promise((resolve, reject) => {
      const tryAt = (i) => {
        if (i >= ECHARTS_SRC.length) {
          echartsPromise = null; // 允许下次重试
          reject(new Error('echarts 全部源加载失败'));
          return;
        }
        const s = document.createElement('script');
        s.src = ECHARTS_SRC[i];
        s.async = true;
        s.onload = () => (window.echarts ? resolve(window.echarts) : tryAt(i + 1));
        s.onerror = () => tryAt(i + 1);
        document.head.appendChild(s);
      };
      tryAt(0);
    });
    return echartsPromise;
  }

  async function openDrill(appid) {
    state.drill.appid = appid;
    $('lt-main').hidden = true;
    $('lt-detail').hidden = false;
    try {
      await loadEcharts();
    } catch (e) {
      const box = $('chart-drill');
      if (box) {
        box.style.display = 'flex';
        box.style.alignItems = 'center';
        box.style.justifyContent = 'center';
        box.style.color = 'var(--text-dim)';
        box.style.fontSize = '13px';
        box.textContent = '图表组件加载失败（可能是网络波动），请刷新后重试；其余数据不受影响。';
      }
    }
    renderDrill();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function closeDrill() {
    $('lt-detail').hidden = true;
    $('lt-main').hidden = false;
  }

  function renderDrill() {
    const el = $('chart-drill');
    if (!window.echarts) return; // 按需加载未完成 / 失败：跳过，openDrill 已处理提示
    if (!state.charts.drill) state.charts.drill = echarts.init(el);
    if (!state.allDates.length) return;

    const appid = state.drill.appid;
    const gl = state.meta.games_lifetime ?? {};
    const title = appid ? (gl[appid]?.name ?? `App ${appid}`) : '全部游戏';
    $('drill-title').textContent = `${title} · 每日与累计时长趋势`;

    const today = ymd(new Date());
    const lastDate = state.allDates[state.allDates.length - 1];
    const end = today < lastDate ? today : lastDate;
    let start;
    if (state.drillRange === 'all') start = state.allDates[0];
    else start = addDaysStr(end, -(state.drillRange - 1));
    if (start < state.allDates[0]) start = state.allDates[0];

    const dates = eachDate(start, end);
    const data = dates.map((d) => {
      const day = state.days.get(d);
      if (!day) return 0;
      if (!appid) return day.total_minutes ?? 0;
      return (day.games ?? []).find((g) => String(g.appid) === String(appid))?.minutes ?? 0;
    });
    const totalMin = data.reduce((a, b) => a + b, 0);
    const activeDays = data.filter((v) => v > 0).length;
    // 累计曲线：以 Steam 终身累计为基准，把「追踪前历史」锚定到起点，
    // 保证曲线终点 = 卡片上的真实总时长（如 1364 h）
    const lifetimeMin = appid
      ? (gl[appid]?.lifetime_minutes ?? null)
      : (state.meta.stats?.lifetime_minutes ?? null);
    const base = lifetimeMin != null ? Math.max(0, lifetimeMin - totalMin) : 0;
    const cum = [];
    let acc = base;
    for (const v of data) {
      acc += v;
      cum.push(acc);
    }
    const finalMin = acc;

    const CA = cssVar('--chart-axis');
    const CS = cssVar('--chart-split');
    const barColor = appid
      ? { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: cssVar('--chart-cum-a2') }, { offset: 1, color: cssVar('--chart-cum-b2') }] }
      : { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: cssVar('--chart-cum-a') }, { offset: 1, color: cssVar('--chart-cum-b') }] };
    const lineColor = cssVar(appid ? '--chart-line2' : '--chart-line');

    state.charts.drill.setOption(
      {
        backgroundColor: 'transparent',
        // 入场动画：累计柱生长 + 每日曲线延伸
        animation: true,
        animationDuration: 1100,
        animationEasing: 'cubicOut',
        animationDurationUpdate: 600,
        grid: { left: 58, right: 58, top: 40, bottom: 40 },
        title: {
          text: `${dates[0]} → ${end} · 最终累计 ${hm(finalMin)} · 期内游玩 ${hm(totalMin)} · 有记录 ${activeDays} 天`,
          left: 8, top: 0,
          textStyle: { color: cssVar('--chart-title'), fontSize: 12, fontWeight: 400 },
        },
        legend: {
          top: 0, right: 8,
          data: ['累计时长', '每日时长'],
          textStyle: { color: CA, fontSize: 11 },
          inactiveColor: cssVar('--chart-legend-off'),
        },
        tooltip: {
          trigger: 'axis',
          backgroundColor: cssVar('--chart-tip-bg'),
          borderColor: cssVar('--chart-tip-border'),
          textStyle: { color: cssVar('--chart-tip-text'), fontSize: 12 },
          formatter: (ps) => {
            const date = ps[0].axisValue;
            const cumP = ps.find((p) => p.seriesName === '累计时长');
            const dayP = ps.find((p) => p.seriesName === '每日时长');
            const day = state.days.get(date);
            let s = `${date}<br/>${cumP.marker}<b>累计：${hm(cumP.value ?? 0)}</b><br/>${dayP.marker}当日：${hm(dayP.value ?? 0)}`;
            if (day && day.span_days > 1) s += `<br/><span style="color:#e8b13a">覆盖 ${day.span_days} 天</span>`;
            return s;
          },
        },
        xAxis: {
          type: 'category',
          data: dates,
          axisLabel: { color: CA, fontSize: 11 },
          axisLine: { lineStyle: { color: CS } },
        },
        yAxis: [
          {
            type: 'value',
            name: '',
            axisLabel: {
              color: CA, fontSize: 11,
              formatter: (v) => Math.round((v / 60) * 10) / 10,
            },
            splitLine: { lineStyle: { color: CS } },
          },
          {
            type: 'value',
            name: '',
            axisLabel: { color: CA, fontSize: 11 },
            splitLine: { show: false },
          },
        ],
        series: [
          {
            name: '累计时长',
            type: 'bar',
            barWidth: '62%',
            barMaxWidth: 28,
            itemStyle: { color: barColor, borderRadius: [3, 3, 0, 0] },
            data: cum,
          },
          {
            name: '每日时长',
            type: 'line',
            yAxisIndex: 1,
            smooth: true,
            symbol: 'circle',
            symbolSize: 4,
            showSymbol: data.length <= 60,
            itemStyle: { color: lineColor },
            lineStyle: { width: 2.6, color: lineColor, shadowBlur: 8, shadowColor: lineColor, shadowOpacity: 0.35 },
            data,
          },
        ],
      },
      true,
    );
  }

  // ---------- ①d 成就详情 ----------
  /** 解锁时间戳 → Asia/Shanghai 日期 */
  const achDate = (ts) => {
    if (!ts) return null;
    return new Date(ts * 1000 + 8 * 3600 * 1000).toISOString().slice(0, 10);
  };

  /** Steam 全球完成率 → 显示文本：>=10% 取整，<10% 保留一位小数；无数据返回 null
   *  ⚠ 必须先拦 null/undefined/空串：Number(null) === 0、Number('') === 0，
   *  否则缺失值会被格式化成 "0.0%"，整列看起来像"完成率全为 0"。
   *  这里刻意返回 null 而非 "—"：调用方据此整段不渲染（保持原来的留白设计）。 */
  const achPctText = (p) => {
    if (p === null || p === undefined || p === '') return null;
    const n = Number(p);
    if (!Number.isFinite(n) || n < 0) return null;
    return n >= 10 ? `${Math.round(n)}%` : `${n.toFixed(1)}%`;
  };

  /* ---------- 高亮判定（2026-10-19）----------
     两条规则：
       ① 成就名：全球完成率**严格小于** 10% → 文字金色（.is-gold）
       ② 游戏胶囊图：全部成就已解锁 → 描一圈多色流动渐变（第 28 轮起，
          由原来的纯金 box-shadow 改为 .rank-capsule-wrap 内的 .ring-* 环层）
     判定集中在这里，阈值具名，避免条件散落各处。 */

  /** 稀有成就阈值：全球完成率严格小于该值即标金 */
  const ACH_RARE_PCT = 10;

  /** 成就名是否标金。
   *  边界：percent 为 null/undefined/空串（无数据）→ false，绝不参与比较
   *  （Number(null) === 0 会把它误判成 0% 而标金）；percent === 10 → false（不含等号）。 */
  const isRareAch = (p) => {
    if (p === null || p === undefined || p === '') return false;
    const n = Number(p);
    if (!Number.isFinite(n) || n < 0) return false;
    return n < ACH_RARE_PCT; // 严格小于
  };

  /** 一款游戏是否「全部成就已解锁」（胶囊图标金）。
   *  边界：total 必须 > 0 —— 0/0（无成就系统的游戏）与缺字段都不算全解锁，
   *  否则 0 === 0 会把一大批无成就游戏误判成已全解锁。 */
  const isAchComplete = (g) => {
    if (!g) return false;
    const total = Number(g.total);
    const unlocked = Number(g.unlocked);
    if (!Number.isFinite(total) || total <= 0) return false;
    if (!Number.isFinite(unlocked)) return false;
    return unlocked >= total;
  };

  /** 「全成就已解锁」游戏的 appid 集合（胶囊图标金用）。
   *  两条数据来源，优先前者：
   *   1) 已加载的成就明细 state.ach.games —— 打开过成就页后可用，最精确；
   *   2) meta.ach_perfect —— 构建期算好随 meta 下发（已内联进首屏），
   *      首屏明细尚未加载时用它，避免为主界面一个边框去下载 285KB 明细。
   *  每次列表渲染只调用一次（结果传给行渲染函数），不在每行里重复建 Set。 */
  function perfectGameSet() {
    const out = new Set();
    const games = state.ach?.games;
    if (games && Object.keys(games).length) {
      for (const [appid, g] of Object.entries(games)) {
        if (isAchComplete(g)) out.add(String(appid));
      }
      return out;
    }
    for (const id of state.meta?.ach_perfect ?? []) out.add(String(id));
    return out;
  }

  /* 胶囊图 DOM（2026-10-19 第 28 轮）：外面套一层 .rank-capsule-wrap。
     为什么套：全成就的「多色流动渐变环」由多个绝对定位子元素组成，
     而 img 本身是 grid 的直接子项——直接在 img 上加 ::before/::after
     会让它变成 grid item、多占一列，整个列表错位。
     wrap 顶替 img 的位置与尺寸（130×60，窄屏 100×46），img 在里面铺满，
     环层 absolute 定位不参与布局。perfect=false 时只多一层 span，不渲染环。
     流光动画纯 CSS（style.css 的 .ring-a / .ring-b），无 JS 逐帧，无背景图、无滤镜图片。 */
  function capsuleHtml(appid, { perfect: isPerfect, eager, icon } = {}) {
    /* 环的结构（自下而上）：
         ring-backdrop  深色底衬（深色主题下托住浅色环）
         ring-glow      同色柔光（blur）
         ring-clip      裁切容器 overflow:hidden + 2px 内边距 → 只露出环带
           ring-b         流动层 B（90° 绿→绿，逆时针）
           ring-a         流动层 A（0° 黄→蓝，顺时针 + 呼吸）
       旋转层是比环大的正方形，超出环的部分被 ring-clip 裁掉，
       所以永远只会看到"一圈"，不会勾到封面上。 */
    const rings = isPerfect
      ? '<span class="ring ring-backdrop"></span>' +
        '<span class="ring ring-glow"></span>' +
        '<span class="ring ring-clip">' +
          '<span class="ring-base"></span>' +
          '<span class="ring-b"></span>' +
          '<span class="ring-a"></span>' +
        '</span>'
      : '';
    return `<span class="rank-capsule-wrap${isPerfect ? ' is-perfect' : ''}">` +
      `<img class="rank-capsule" data-src="${CAPSULE(appid)}" src="${BLANK_GIF}" alt=""` +
      `${eager ? ' loading="eager" fetchpriority="high"' : ''} decoding="async" width="130" height="60"` +
      ` onerror="this.onerror=null;this.classList.add('is-icon');this.src='${icon ?? ''}'">` +
      `${rings}</span>`;
  }

  function buildAchSelect() {
    const sel = $('ach-game');
    if (!state.ach) {
      sel.innerHTML = '<option value="">全部游戏</option>';
      return;
    }
    // 按完成度降序排列，完成度相同的按解锁数降序
    const list = Object.values(state.ach.games ?? {}).sort(
      (x, y) => y.unlocked / (y.total || 1) - x.unlocked / (x.total || 1) || y.unlocked - x.unlocked,
    );
    sel.innerHTML =
      '<option value="">全部游戏</option>' +
      list.map((g) => `<option value="${g.appid}">${escapeHtml(g.name)}（${g.unlocked}/${g.total}）</option>`).join('');
  }

  function renderAch() {
    const box = $('ach-list');
    const hint = $('ach-hint');
    const stats = state.ach?.stats;

    if (!stats) {
      hint.textContent = '—';
      box.innerHTML =
        '<p class="empty">成就数据尚未采集。成就由每日 23:30（北京时间）的采集任务自动生成，\n        首次采集完成后即可在此查看。</p>';
      return;
    }

    // 摘要已就位但明细（285KB）还在路上：给「加载中」而不是误报「暂无成就」
    if (!state.achReady) {
      hint.textContent = `已解锁 ${stats.unlocked} / ${stats.total} 项 · 完成度 ${stats.pct}% · 覆盖 ${stats.games} 款游戏`;
      box.innerHTML = achSkeleton(6);
      return;
    }

    const appid = state.achFilter;
    const games = appid
      ? [state.ach.games?.[appid]].filter(Boolean)
      : Object.values(state.ach.games ?? {});

    // 展平后按完成日期由新到旧
    const rows = [];
    for (const g of games) {
      for (const a of g.achievements ?? []) rows.push({ ...a, game: g.name });
    }
    rows.sort((x, y) => (y.ts ?? 0) - (x.ts ?? 0));

    hint.textContent = appid
      ? `${games[0]?.name ?? ''} · 已解锁 ${games[0]?.unlocked ?? 0} / ${games[0]?.total ?? 0} 项`
      : `已解锁 ${stats.unlocked} / ${stats.total} 项 · 完成度 ${stats.pct}% · 覆盖 ${stats.games} 款游戏`;

    if (!rows.length) {
      box.innerHTML = '<p class="empty">该游戏暂无已解锁的成就。</p>';
      return;
    }

    box.innerHTML = rows
      .map((a) => {
        const d = achDate(a.ts);
        const p = achPctText(a.percent);
        // 稀有成就（全球完成率 < 10%）名称标金：仅加 class，不改结构与文案，
        // 布局零影响（.is-gold 只改颜色，不动字号字重）
        const rare = isRareAch(a.percent) ? ' is-gold' : '';
        return `<div class="ach-item">
          <img class="ach-icon" src="${a.icon ?? ''}" alt="" loading="lazy"
               onerror="this.onerror=null;this.replaceWith(Object.assign(document.createElement('span'),{className:'icon-ph ach-icon-ph'}))">
          <div class="ach-main">
            <div class="ach-name${rare}" title="${escapeHtml(a.name)}">${escapeHtml(a.name)}</div>
            <div class="ach-sub"><span class="ach-game">${escapeHtml(a.game)}</span>${a.desc ? ` · ${escapeHtml(a.desc)}` : ''}</div>
          </div>
          <span class="ach-meta">
            ${p ? `<span class="ach-pct" title="全球玩家完成率">${p}</span>` : ''}
            <span class="ach-date">${d ?? '已解锁'}</span>
          </span>
        </div>`;
      })
      .join('');
  }

  // ---------- ①d 游戏时间轴（按周聚合，图标大小随时长） ----------
  /** 短时长格式：'12.3h' / '45min'（时间轴角标用，比 hm 紧凑） */
  function hoursShort(m) {
    const n = Math.round(Number(m) || 0);
    if (n <= 0) return '0';
    if (n < 60) return `${n}min`;
    const h = Math.round((n / 60) * 10) / 10;
    return `${h % 1 === 0 ? Math.round(h) : h.toFixed(1)}h`;
  }

  /** 该日期所在周的周一（Asia/Shanghai 无关紧要：数据本身就是日期字符串） */
  function weekStart(dateStr) {
    const dow = (new Date(`${dateStr}T12:00:00Z`).getUTCDay() + 6) % 7; // 周一=0
    return addDaysStr(dateStr, -dow);
  }

  function renderTimeline() {
    const box = $('timeline');
    const hint = $('tl-hint');
    if (!state.allDates.length) {
      hint.textContent = '—';
      box.innerHTML = '<p class="empty">每日数据还在积累中。首次快照采集完成后即可看到时间轴。</p>';
      return;
    }

    // 按周聚合：周一 -> {games: Map<appid, {name, minutes}>}
    const weeks = new Map();
    for (const d of state.allDates) {
      const day = state.days.get(d);
      if (!day) continue;
      const ws = weekStart(d);
      if (!weeks.has(ws)) weeks.set(ws, { start: ws, games: new Map() });
      const w = weeks.get(ws);
      for (const g of day.games ?? []) {
        const cur = w.games.get(g.appid);
        if (cur) cur.minutes += g.minutes;
        else w.games.set(g.appid, { appid: g.appid, name: g.name, minutes: g.minutes });
      }
    }
    if (!weeks.size) {
      hint.textContent = '—';
      box.innerHTML = '<p class="empty">暂无每周游玩数据。</p>';
      return;
    }

    const asc = [...weeks.values()].sort((a, b) => a.start.localeCompare(b.start));
    // 累计里程碑（每满 100h 一档）：以终身累计为基准锚定，周内跨越阈值即在该周标记
    const allTotal = asc.reduce((a, w) => a + [...w.games.values()].reduce((x, g) => x + g.minutes, 0), 0);
    const base = Math.max(0, (state.meta.stats?.lifetime_minutes ?? 0) - allTotal);
    const STEP = 6000; // 100h
    let cum = base;
    for (const w of asc) {
      const before = cum;
      for (const g of w.games.values()) cum += g.minutes;
      w.milestones = [];
      for (let m = Math.floor(before / STEP) + 1; m * STEP <= cum; m++) {
        w.milestones.push(m * STEP);
      }
    }

    const totalWeeks = asc.length;
    hint.textContent = `按周汇总（周一至周日）· 共 ${totalWeeks} 周 · 图标大小与该周游玩时长成正比`;

    const cap = (g, cls) => {
      const icon = ICON(g.appid, (state.meta.games_lifetime ?? {})[g.appid]?.img_icon_url);
      return `<span class="tl-game ${cls}" title="${escapeHtml(g.name)} · ${hm(g.minutes)}">
          <img src="${CAPSULE(g.appid)}" alt="" loading="lazy"
               onerror="this.onerror=null;this.classList.add('is-icon');this.src='${icon ?? ''}'">
          <span class="tl-badge">${hoursShort(g.minutes)}</span>
        </span>`;
    };

    // 由新到旧渲染
    const desc = asc.slice().reverse();
    let prevMonth = null;
    box.innerHTML = desc
      .map((w) => {
        const end = addDaysStr(w.start, 6);
        const list = [...w.games.values()].filter((g) => g.minutes > 0).sort((a, b) => b.minutes - a.minutes);
        if (!list.length) return '';
        const max = Math.max(...list.map((g) => g.minutes));
        const month = w.start.slice(0, 7).replace('-', '.');
        const showMonth = month !== prevMonth;
        prevMonth = month;
        const range = `${Number(w.start.slice(5, 7))}.${Number(w.start.slice(8, 10))}-${Number(end.slice(5, 7))}.${Number(end.slice(8, 10))}`;
        const games = list
          .map((g) => {
            const r = g.minutes / max;
            const cls = r >= 0.66 || list.length === 1 ? 'lg' : r >= 0.3 ? 'md' : 'sm';
            return cap(g, cls);
          })
          .join('');
        const ms = (w.milestones ?? [])
          .map((m) => `<div class="tl-milestone">游戏时长突破 <b>${hoursShort(m)}</b></div>`)
          .join('');
        return `<div class="tl-item">
          <div class="tl-left">
            ${showMonth ? `<div class="tl-month">${month}</div>` : '<div class="tl-month tl-month-ph"></div>'}
            <div class="tl-week">${range}</div>
          </div>
          <div class="tl-node"><span class="tl-dot"></span></div>
          <div class="tl-body">
            <div class="tl-games">${games}</div>
            ${ms}
          </div>
        </div>`;
      })
      .join('');
  }

  // ---------- ④ 数据页 ----------
  function renderHealth() {
    const h = state.meta.health ?? {};
    const s = state.meta.stats ?? {};
    const items = [
      ['最新快照日', state.meta.last_snapshot_date ?? '—', ''],
      ['每日记录天数', s.tracked_days ?? 0, ''],
      ['漏采合并天数', h.gap_days ?? 0, (h.gap_days ?? 0) > 0 ? 'warn' : 'ok'],
      ['低置信度天数', h.low_confidence_days ?? 0, (h.low_confidence_days ?? 0) > 0 ? 'warn' : 'ok'],
      ['手动补录天数', h.manual_days ?? 0, ''],
      ['中文名覆盖', h.name_overrides ?? 0, ''],
    ];
    $('health').innerHTML = items
      .map(([l, v, cls]) => `<div class="h-item"><div class="h-label">${l}</div><div class="h-value ${cls}">${v}</div></div>`)
      .join('');
  }

  function download(name, content) {
    const blob = new Blob(['\ufeff' + content], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  function csvDaily() {
    const rows = [['date', 'total_minutes', 'span_days', 'confidence', 'source', 'flags', 'games']];
    for (const d of state.allDates) {
      const day = state.days.get(d);
      rows.push([
        d,
        day.total_minutes,
        day.span_days,
        day.confidence,
        day.source,
        (day.flags ?? []).join('|'),
        (day.games ?? []).map((g) => `${g.name}:${g.minutes}`).join('|'),
      ]);
    }
    return rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  }

  function csvLifetime() {
    const rows = [['appid', 'name', 'lifetime_minutes', 'last_played']];
    const list = Object.values(state.meta.games_lifetime ?? {}).sort((a, b) => b.lifetime_minutes - a.lifetime_minutes);
    for (const g of list) rows.push([g.appid, g.name, g.lifetime_minutes, g.last_played ?? '']);
    return rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  }

  // ---------- 游玩日历浮层（月历 → 当天明细） ----------
  /** 一周从周一起算，与 renderTimeline 的 weekStart 保持一致 */
  const todayStr = () => ymd(new Date());
  /** 有游玩记录 = 当日分钟数 > 0（CI 可能写入 0 分钟的占位日，那也按无记录处理） */
  const hasPlay = (d) => (state.days.get(d)?.total_minutes ?? 0) > 0;

  /** 可翻阅的月份范围受限于已落盘的 data/daily/*.json（meta.months），避免翻到空月份 */
  function calRange() {
    const ms = (state.meta?.months ?? []).slice().sort();
    return ms.length ? { min: ms[0], max: ms[ms.length - 1] } : null;
  }

  /** 打开日历时的默认月：最新快照所在月（当前数据即 2026-10），退化到有数据的最后一个月 */
  function calDefaultMonth() {
    const snap = state.meta?.last_snapshot_date;
    if (snap) {
      const r = calRange();
      const m = snap.slice(0, 7);
      if (!r || (m >= r.min && m <= r.max)) return m;
      return r.max;
    }
    const r = calRange();
    return r ? r.max : todayStr().slice(0, 7);
  }

  function setCalStatus(msg, isErr = false) {
    const el = $('cal-status');
    if (!el) return;
    el.textContent = msg ?? '';
    el.classList.toggle('err', !!isErr);
  }

  function setCalBusy(on, text) {
    state.cal.busy = on;
    const mask = $('cal-mask');
    if (mask) {
      mask.hidden = !on;
      const t = mask.querySelector('.cal-mask-text');
      if (t) t.textContent = text ?? '加载中…';
    }
  }

  function renderCalGrid(selDate) {
    const grid = $('cal-grid');
    if (!grid) return;
    const ym = state.cal.ym;
    const [y, m] = ym.split('-').map(Number);
    $('cal-title').textContent = `${y} 年 ${m} 月`;

    const range = calRange();
    const prev = $('cal-prev');
    const next = $('cal-next');
    if (prev) prev.disabled = !!range && ym <= range.min;
    if (next) next.disabled = !!range && ym >= range.max;

    if (!state.meta) {
      grid.innerHTML = '<div class="cal-empty">数据尚未加载完成，请稍候再试</div>';
      setCalStatus('数据未就绪', true);
      return;
    }

    // 周一为一周首日 → 1 号之前要补几个空格
    const lead = (new Date(`${ym}-01T12:00:00Z`).getUTCDay() + 6) % 7;
    const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const today = todayStr();

    const cells = [];
    for (let i = 0; i < lead; i++) cells.push('<span class="cal-day pad" aria-hidden="true"></span>');
    let activeCount = 0;
    for (let n = 1; n <= dim; n++) {
      const ds = `${ym}-${String(n).padStart(2, '0')}`;
      const day = state.days.get(ds);
      const play = hasPlay(ds);
      if (play) activeCount++;
      const cls = ['cal-day', play ? 'on' : 'off'];
      if (ds === today) cls.push('today');
      // 选中态 = 二级界面当前（或刚才）看的那一天，从二级返回一级时便于定位。
      // 2026-10-21 前这里跟随"回看日期"，整页回看移除后改跟 state.cal.day。
      // 注意 backToCalMonth 会先 resetCalLevel()（把 day 置空）再重绘，
      // 所以选中日必须由调用方用参数显式传进来，不能只读 state.cal.day。
      if (ds === (selDate ?? state.cal.day)) cls.push('sel');
      const tip = play
        ? `${ds} · 游玩 ${hm(day.total_minutes)}　点击查看当天明细`
        : `${ds} · 无游玩记录`;
      cells.push(
        `<span class="${cls.join(' ')}" data-date="${ds}"` +
          ` role="${play ? 'button' : 'presentation'}" tabindex="${play ? 0 : -1}"` +
          ` aria-disabled="${play ? 'false' : 'true'}" title="${escapeHtml(tip)}">` +
          `<span class="cal-num">${n}</span>` +
          (play ? `<span class="cal-min">${hoursShort(day.total_minutes)}</span>` : '') +
          `</span>`,
      );
    }
    grid.innerHTML = cells.join('');
    setCalStatus(`本月 ${activeCount} 天有记录`);
  }

  function stepMonth(delta) {
    const [y, m] = state.cal.ym.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    const next = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    const r = calRange();
    if (r && (next < r.min || next > r.max)) return;
    state.cal.ym = next;
    renderCalGrid();
  }

  // ---------- 日历二级界面：某一天的游戏游玩明细 ----------
  /** 图标 hash 查表：daily 数据里只有 appid/name/minutes，图标要从 meta 的 games_lifetime 取 */
  function gameIconHash(appid) {
    const k = String(appid);
    return state.meta?.games_lifetime?.[k]?.img_icon_url ?? '';
  }

  /** 当天游玩明细：同一游戏当天的多条记录合并为「当天总时长」；
      按当天时长降序，时长相同按游戏名称排序（中文按拼音，localeCompare 稳定）。
      只收录当天 games 里出现过的游戏 —— 没记录的根本不会进这个数组。 */
  function calDayGames(date) {
    const day = state.days.get(date);
    const merged = new Map();
    for (const g of day?.games ?? []) {
      const k = String(g.appid);
      const cur = merged.get(k);
      if (cur) {
        cur.minutes += Number(g.minutes) || 0;
        if (!cur.name && g.name) cur.name = g.name; // 个别记录可能缺 name，用已知的补上
      } else {
        merged.set(k, {
          appid: g.appid,
          name: g.name ?? String(g.appid),
          minutes: Number(g.minutes) || 0,
        });
      }
    }
    return [...merged.values()].sort(
      (a, b) => b.minutes - a.minutes || String(a.name).localeCompare(String(b.name), 'zh-Hans-CN'),
    );
  }

  /** 只切两级页面的显隐，不重绘（openCal / closeCal / backToCalMonth 共用） */
  function resetCalLevel() {
    state.cal.day = null;
    $('cal-page-month').hidden = false;
    $('cal-page-day').hidden = true;
  }

  /** 二级界面可步进的日期范围：首条每日记录 ~ 最新快照日。
      刻意不拿「今天」当上界：数据滞后一天，翻到没有数据的月份会渲染出整月灰格，
      而月历的可翻页范围（meta.months）本来就只覆盖有数据的月份。
      范围内**允许**落到没有记录的日子（如采集缺口），此时展示空状态。 */
  function calDayRange() {
    const min = state.allDates[0];
    const max = state.meta?.last_snapshot_date ?? state.allDates[state.allDates.length - 1];
    return min && max ? { min, max } : null;
  }

  /** 按当前日期刷新「前一天 / 后一天」的可用状态，并在状态行说明边界原因 */
  function syncCalDayNav(date, gamesCount) {
    const prev = $('cal-day-prev');
    const next = $('cal-day-next');
    const status = $('cal-day-status');
    if (!prev || !next) return;
    const r = calDayRange();
    const atMin = !r || addDaysStr(date, -1) < r.min;
    const atMax = !r || addDaysStr(date, 1) > r.max;
    prev.disabled = atMin;
    next.disabled = atMax;
    // 焦点不能落在被禁用的按钮上：浏览器会把它丢到 body，键盘用户就迷路了
    const a = document.activeElement;
    if (a && a !== document.body && a.matches('.cal-step') && a.disabled) {
      const other = a === prev ? next : prev;
      if (other && !other.disabled) other.focus();
    }
    if (status) {
      status.classList.remove('err');
      status.textContent = !gamesCount
        ? '该日没有游玩记录'
        : atMin
          ? '已是最早一天的记录'
          : atMax
            ? '已是最新一天的记录'
            : '按当天时长从高到低';
    }
  }

  /** 二级界面里切换前一天 / 后一天（日期文本两侧的按钮） */
  function stepCalDay(delta) {
    if (state.cal.busy) return;
    const cur = state.cal.day;
    if (!cur) return;
    const to = addDaysStr(cur, delta);
    // 越界时静默返回：按钮此时是 disabled，键盘方向键同样不该有动作
    // （越界日没有每日记录，二级界面只会显示空态，翻过去没有意义）
    const r = calDayRange();
    if (r && (to < r.min || to > r.max)) return;
    openCalDay(to);
  }

  function renderCalDay(date) {
    const day = state.days.get(date);
    const games = calDayGames(date);
    // total_minutes 缺失或为 0 时退回合并和，避免摘要与列表对不上
    const total = (day?.total_minutes ?? 0) || games.reduce((a, g) => a + g.minutes, 0);
    const wd = '周' + '日一二三四五六'[new Date(`${date}T12:00:00Z`).getUTCDay()];
    const [, m, d] = date.split('-').map(Number);
    $('cal-day-title').textContent = `${m} 月 ${d} 日 ${wd}`;
    // 没有明细时显示 0 分钟，不能用 hmText(0)（那是"不足 1 分钟"，语义相反）
    $('cal-day-total').textContent = games.length ? hmText(total) : '0 分钟';
    $('cal-day-note').textContent = `${date} · 共 ${games.length} 款游戏`;

    const box = $('cal-day-games');
    if (!games.length) {
      // 范围内但当日没有明细：采集缺口，或尚未采集的日期
      box.innerHTML = '<p class="cal-empty">当天没有游玩记录</p>';
      syncCalDayNav(date, 0);
      return;
    }
    const max = Math.max(...games.map((g) => g.minutes), 1);
    box.innerHTML = games
      .map((g, i) => {
        const hash = gameIconHash(g.appid);
        // 查不到图标时给透明占位：否则 onerror 会把 src 设成空串（解析成当前页 URL）
        const icon = hash ? ICON(g.appid, hash) : BLANK_GIF;
        const pct = Math.max(2, (g.minutes / max) * 100);
        const noCls = i < 3 ? ` r${i + 1}` : '';
        return (
          `<div class="cal-game">` +
          `<span class="cal-game-no${noCls}">${i + 1}</span>` +
          capsuleHtml(g.appid, { icon }) +
          `<span class="cal-game-name" title="${escapeHtml(g.name)}">${escapeHtml(g.name)}</span>` +
          `<span class="cal-game-min">${hmText(g.minutes)}</span>` +
          `<span class="cal-game-bar"><span style="width:${pct}%"></span></span>` +
          `</div>`
        );
      })
      .join('');
    syncCalDayNav(date, games.length);
    observeCapsules(box); // 与其它列表同一套按需加载
  }

  /** 点击某一天 / 前一天 / 后一天 → 进入（或在）二级界面看当天明细。
      只影响浮层内部状态：浮层外的页面布局与数据一律不动
      （2026-10-21 前此处会把整页切到"回看态"，该逻辑已移除）。 */
  function openCalDay(date) {
    if (state.cal.busy) return;
    if (!state.meta) {
      setCalStatus('数据尚未加载完成，请稍候再试', true);
      return;
    }
    setCalStatus('');
    // 已经在二级界面里 → 这是步进，不要抢焦点（用户正盯着某个按钮）
    const stepping = state.cal.day !== null;
    setCalBusy(true, stepping ? '正在切换日期…' : '正在载入当天明细…');
    // 渲染是同步 CPU 操作，先让浏览器把遮罩画出来再算
    requestAnimationFrame(() => {
      try {
        renderCalDay(date);
        state.cal.day = date;
        // 跨月步进时同步月历视图：返回一级后看到的还是这个月
        const ym = date.slice(0, 7);
        if (ym !== state.cal.ym) state.cal.ym = ym;
        $('cal-page-month').hidden = true;
        $('cal-page-day').hidden = false;
        setCalBusy(false);
        if (!stepping) $('cal-back').focus();
      } catch (err) {
        // 失败只提示，浮层外的页面与浮层内已渲染的内容都不受影响
        console.error('载入当天明细失败', err);
        setCalBusy(false);
        backToCalMonth();
        setCalStatus(`载入失败：${err.message}`, true);
      }
    });
  }

  /** 二级界面 → 返回一级月历（selection = 刚才看的那一天，便于继续选别的日期） */
  function backToCalMonth() {
    const sel = state.cal.day;
    resetCalLevel();
    renderCalGrid(sel);
    focusCalDay();
  }

  /** 一级月历的初始焦点：优先选中日 → 最后一个有记录的日期 → 关闭按钮 */
  function focusCalDay() {
    const grid = $('cal-grid');
    const target =
      grid?.querySelector('.cal-day.sel') ??
      grid?.querySelector('.cal-day.on:last-of-type') ??
      $('cal-close');
    if (target) target.focus();
  }

  function openCal(ym) {
    if (state.cal.open) return;
    state.cal.open = true;
    state.cal.lastFocus = document.activeElement;
    state.cal.ym = (ym || calDefaultMonth()).slice(0, 7);
    const ov = $('cal-overlay');
    ov.hidden = false;
    setCalBusy(false);
    setCalStatus('');
    // 每次打开都停在一级月历；二级界面只能由「点击某一天」进入
    resetCalLevel();
    renderCalGrid();
    document.addEventListener('keydown', onCalKey, true);
    focusCalDay();
  }

  function closeCal() {
    if (!state.cal.open) return;
    state.cal.open = false;
    setCalBusy(false);
    resetCalLevel(); // 下次打开一律从一级月历开始
    $('cal-overlay').hidden = true;
    document.removeEventListener('keydown', onCalKey, true);
    const f = state.cal.lastFocus;
    if (f && f.isConnected && f.focus) f.focus();
  }

  function onCalKey(e) {
    if (e.key === 'Escape') {
      if (state.cal.busy) return;
      e.preventDefault();
      e.stopPropagation();
      // 二级界面里 Esc 先退回一级月历，再按才关闭浮层
      if (state.cal.day) backToCalMonth();
      else closeCal();
    } else if (e.key === 'ArrowLeft' && !state.cal.busy) {
      // 二级界面里方向键步进「前一天 / 后一天」，一级月历里才是上下月
      if (state.cal.day) stepCalDay(-1);
      else stepMonth(-1);
    } else if (e.key === 'ArrowRight' && !state.cal.busy) {
      if (state.cal.day) stepCalDay(1);
      else stepMonth(1);
    }
  }

  // ---------- tabs / init ----------
  function switchView(v) {
    state.view = v;
    document.querySelectorAll('.card-nav').forEach((c) => c.classList.toggle('active', c.dataset.view === v));
    document.querySelectorAll('.view').forEach((s) => s.classList.toggle('active', s.id === `view-${v}`));
    if (v === 'lifetime') closeDrill();
    if (v === 'recent') renderRecent();
    if (v === 'ach') {
      // 成就**明细**（285KB）按需加载：首屏只带 stats 摘要，这里才去取 games。
      // 先同步渲染一次（显示摘要 + "加载中"），到位后再渲染一次（填充明细列表）。
      renderAch();
      if (!state.achReady) {
        ensureAchDetail().then(() => {
          if (state.view !== 'ach') return; // 用户已切走就不必重绘
          renderAch();
          buildAchSelect();
        });
      }
    }
    if (v === 'timeline') renderTimeline();
  }

  function bind() {
    // 站标（小黄人）：点击随机切换浅色主题；键盘 Enter / 空格同样支持
    const bindFlip = (el, mode) => {
      if (!el) return;
      const flip = () => applyTheme(randomTheme(mode), { announce: true });
      el.addEventListener('click', flip);
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          flip();
        }
      });
    };
    // 只有站标（小黄人）绑定主题切换；史蒂夫头像是氛围特效开关（下方），
    // 游玩日历入口是「最近游玩」首行日期上方的小日历图标（全站唯一）。
    bindFlip($('theme-light'), 'light');

    // 史蒂夫头像 → 氛围特效开关（单击 开 / 关，仅流星；
    // 回车 / 空格同样支持，长按重复不算多次激活）。
    const steve = $('fx-toggle');
    if (steve) {
      steve.addEventListener('click', onSteveActivate);
      steve.addEventListener('keydown', (e) => {
        if (e.repeat) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSteveActivate();
        }
      });
      syncSteveFx();
    }
    // 特效状态变化（头像开关 / 系统偏好）→ 同步头像的提示文案
    if (window.__fx && window.__fx.onChange) window.__fx.onChange(syncSteveFx);

    // 日历浮层：上下月、关闭、点空白关闭、二级界面返回/关闭、点有记录的日期看当天明细
    $('cal-prev').addEventListener('click', () => stepMonth(-1));
    $('cal-next').addEventListener('click', () => stepMonth(1));
    $('cal-close').addEventListener('click', () => closeCal());
    $('cal-back').addEventListener('click', () => backToCalMonth());
    $('cal-day-close').addEventListener('click', () => closeCal());
    // 二级界面：日期文本两侧的「前一天 / 后一天」
    $('cal-day-prev').addEventListener('click', () => stepCalDay(-1));
    $('cal-day-next').addEventListener('click', () => stepCalDay(1));
    $('cal-overlay').addEventListener('click', (e) => {
      if (e.target.closest('.cal-panel')) return; // 面板内的点击不关闭
      if (!state.cal.busy) closeCal();
    });
    $('cal-grid').addEventListener('click', (e) => {
      const cell = e.target.closest('.cal-day.on');
      if (cell && !state.cal.busy) openCalDay(cell.dataset.date);
    });
    $('cal-grid').addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const cell = e.target.closest('.cal-day.on');
      if (!cell || state.cal.busy) return;
      e.preventDefault();
      openCalDay(cell.dataset.date);
    });

    // 网站名：点击返回顶部（键盘 Enter / 空格同样支持）
    const titleHome = $('site-title');
    if (titleHome) {
      const backTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });
      titleHome.addEventListener('click', backTop);
      titleHome.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          backTop();
        }
      });
    }

    // 三张导航卡：游戏时长 / 最近游玩 / 数据
    // 游戏时长卡：他页 → 回列表；列表 → 每日与累计趋势；趋势中（全部游戏或单游戏）→ 点对应主卡返回列表
    $('card-lifetime').addEventListener('click', () => {
      if (state.view !== 'lifetime') {
        switchView('lifetime');
      } else if (!$('lt-detail').hidden) {
        closeDrill();
      } else {
        openDrill(null).catch((e) => console.warn('趋势图打开失败', e));
      }
    });
    $('card-recent').addEventListener('click', () => switchView('recent'));
    $('card-ach').addEventListener('click', () => switchView('ach'));
    $('card-games').addEventListener('click', () => switchView('timeline'));
    $('card-data').addEventListener('click', () => switchView('data'));

    // 成就页：游戏筛选
    $('ach-game').addEventListener('change', (e) => {
      state.achFilter = e.target.value || null;
      renderAch();
    });

    // 游戏累计列表：点击整行 → 该游戏每日时长趋势
    // （2026-10-20：原先挂在这里的日历图标入口已随「日历收敛到最近游玩」一并移除，
    //  所以不再需要 [data-cal-toggle] 的提前拦截；整行点击行为回到纯粹的下一级趋势图）
    $('lt-list').addEventListener('click', (e) => {
      const row = e.target.closest('.rank-item');
      if (!row) return;
      openDrill(row.dataset.appid).catch((e) => console.warn('趋势图打开失败', e));
    });

    // 最近游玩列表：全站唯一的日历入口（2026-10-20）。
    // 该列表原本没有任何点击行为（行不下钻），所以这里**只**处理日历按钮，
    // 不新增行点击逻辑，避免改变既有交互。
    $('recent-list').addEventListener('click', (e) => {
      if (e.target.closest('[data-cal-toggle]')) openCal();
    });

    $('btn-drill-back').addEventListener('click', () => {
      closeDrill();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    $('drill-range').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      [...$('drill-range').children].forEach((x) => x.classList.toggle('active', x === b));
      state.drillRange = b.dataset.r === 'all' ? 'all' : Number(b.dataset.r);
      renderDrill();
    });

    $('btn-csv-daily').addEventListener('click', () => download('steam-daily.csv', csvDaily()));
    $('btn-csv-lifetime').addEventListener('click', () => download('steam-games-lifetime.csv', csvLifetime()));
    window.addEventListener('resize', () => {
      Object.values(state.charts).forEach((c) => c?.resize());
    });
  }

  (async function init() {
    // 看门狗：请求挂起（一直 pending 不报错）时，12 秒后给出可见提示
    const watchdog = setTimeout(() => {
      if (!state.meta) showFatal('加载超时');
    }, 12000);
    try {
      bind();
      // 先把骨架铺上（同步执行，早于任何网络请求）：用户立刻看到"内容正在来"，
      // 而不是一张全是「—」的空白卡片
      paintSkeletons();
      // 主题已由 <head> 内联脚本按 localStorage 决定（默认 cream），这里只同步站标提示文案
      syncThemeUi();
      if (!(await load())) return;
      clearTimeout(watchdog);
      clearCardSkeleton();
      renderCards();

      // 下面这些只依赖 meta（已在 load 里拿到），可立即渲染，
      // 不必等成就明细——这正是"首屏不再等 285KB"的关键
      renderLifetime();
      renderRecent();
      renderAch();      // 此处只有 stats 摘要，成就页显示骨架
      renderHealth();
      buildAchSelect();
      renderTimeline();
      switchView('lifetime');
    } catch (err) {
      clearTimeout(watchdog);
      console.error('初始化失败：', err);
      showFatal('页面初始化出错');
    }
  })();
})();
