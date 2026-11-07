/* Steam 游戏时长统计 —— 零构建前端，仅依赖 ECharts CDN */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const ICON = (appid, hash) =>
    hash ? `https://media.steampowered.com/steamcommunity/public/images/apps/${appid}/${hash}.jpg` : null;
  // 游戏横幅大图：第 84 轮起本地化到 docs/img/covers/<appid>.webp
  // （scripts/fetch-covers.mjs 生成，460 宽 q78，53 张合计约 1MB）。
  // 保留 CDN 地址做兜底：新入库、还没跑过脚本的游戏仍能显示封面。
  const CAPSULE_CDN = (appid) => `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`;
  const CAPSULE = (appid) => `img/covers/${appid}.webp`;
  /* 第 93 轮：320 宽变体（scripts/cover-variants.mjs 生成，省约 47% 体积）。
     用 x 描述符而不是 w 描述符 —— 原图宽度不保证恒为 460（用户换过封面），
     而 x 描述符只表达「这是几倍图」，不依赖真实像素宽。
     榜单封面显示 130×60，所以 1x 拿 320、2x 拿原图刚好。 */
  const CAPSULE_SET = (appid) => `img/covers/${appid}-320.webp 1x, img/covers/${appid}.webp 2x`;

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
    // 第 93 轮：先用 srcset 让浏览器按 DPR 选（1x 拿 320 变体、2x 拿原图），
    // 再设 src 作为最老浏览器的兜底。注意 srcset 必须先于 src 设，
    // 否则部分浏览器会先把 1x 的那张下载下来再被 srcset 覆盖。
    const set = img.dataset.srcset;
    if (set) {
      img.srcset = set;
      delete img.dataset.srcset;
    }
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
    drill: { appid: null, year: null, sel: null }, // 二级界面：null = 全部游戏；year = 热力图年份；sel = 最近点开的那天
    heroAppid: null,  // 悬停中的游戏（背景底纹用），null = 恢复默认底
    vt: null,         // 正在跑的 ViewTransition（Chromium 不允许叠第二个）
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
  /** 2 套主题（1 浅 + 1 深）：切换只改 <html data-theme>，配色全部走 CSS 变量。
      2026-11-05 第 105 轮加入 cinema「影院黑」（与观影页 watch.html 同源的深色）。
      第 106 轮按用户要求删掉 mint / dawn / night 三套，只剩 cream 暖阳米（浅）
      与 cinema 影院黑（深）；单击史蒂夫在两套之间来回切。 */
  const THEMES = [
    { id: 'cream', name: '暖阳米', mode: 'light' },
    { id: 'cinema', name: '影院黑', mode: 'dark' },
  ];
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
    if (announce) toast(`主题：${themeName(id)}`);
  }

  /** 同步主题开关（史蒂夫头像）的无障碍名（首屏内联脚本先于本脚本应用了持久化主题，
      文案也要随之更新）。2026-10-24 起这个 id 挂在头像上，不再是小黄人。
      2026-10-31 第 82 轮：全站移除 title 悬停气泡，主题信息改由 aria-label 承载 ——
      读屏仍能读到「当前：某主题」，鼠标悬停则不再弹任何提示。 */
  function syncThemeUi(id = currentTheme()) {
    const light = $('theme-light');
    if (light) light.setAttribute('aria-label', `切换主题（当前：${themeName(id)}）`);
  }

  /** 随机挑一个与当前不同的主题；第 106 轮起只剩两套，点一次必切到另一套 */
  function randomTheme(mode) {
    const cur = currentTheme();
    const all = mode === 'all' ? THEMES : THEMES.filter((t) => t.mode === mode);
    const pool = all.filter((t) => t.id !== cur);
    // 组内全被排除时（当前主题不在该组）直接全组随机
    const list = pool.length ? pool : all;
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

    // 第 83 轮：四张卡（原「游戏库」并入游戏时长视图），数字从 0 滚上来
    countUp($('c-lifetime'), s.lifetime_minutes ?? 0, (v) => hm(v));
    // 最近游玩卡：近两周总时长。口径固定，不随日历浮层里选了哪一天而变化
    countUp($('c-recent'), lastNDaysTotal(14).minutes, (v) => hm(v));
    // 游戏库卡：玩过 / 拥有（第 85 轮随五张卡一起恢复）
    $('c-games').textContent = `${s.lifetime_played_games ?? 0} / ${s.owned_games ?? 0}`;

    if (state.ach?.stats) {
      countUp($('c-ach'), state.ach.stats.pct, (v) => `${Number(v).toFixed(1)}%`);
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
  /* 三处榜单行共用的序号类名 / 进度条样式 */
  const noCls = (i) => (i < 3 ? ` r${i + 1}` : '');
  const barStyle = (pct, i) => `width:${pct}%` + (topPalette[i] ? `;background:${topPalette[i]}` : '');

  /* 「最近游玩」首行日期上方的「游玩日历」入口图标 —— **第 87 轮已删除**：
     它负责的「点日期看当天玩了哪些游戏、各多久」已并入「游戏时长」下钻里的
     月历热力图（点格子打开当日明细浮层），所以这个绝对定位的小按钮、它的
     CSS（.cal-icon-btn / --cal-lift 那一套对位算法）与 #recent-list 的点击委托
     一并删干净了。累计榜与最近榜现在都不再有任何「行内图标」。 */

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
      const playing = (recent.get(g.appid) ?? 0) > 0;
      /* 2026-11-03（第 102 轮回退后）：日期下面那行相对时间（「9 天前」）已按用户要求删除。
         原来的 daysAgoOf / relDay 两个函数与 .rank-last 的 data-rel 属性一并移除，
         CSS 侧的 .rank-last[data-rel]::after 也删了 —— 日期恢复成单行纯日期。 */
      // 2026-10-20：累计榜已不再挂载日历入口（该入口收敛到「最近游玩」，
      // 见 CAL_ICON_BTN 处注释）。这里与其它行结构完全一致 —— .rank-last 里
      // 只有日期文字，没有多余按钮节点，也不会因缺少绝对定位子元素而改变高度。
      const lastHtml = g.last_played
        ? `<span class="rank-last">${g.last_played}</span>`
        : '<span class="rank-last">—</span>';
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
      const isPerfect = perfect.has(String(g.appid));
      return `<div class="rank-item${g.lifetime_minutes === 0 ? ' zero' : ''}" data-appid="${g.appid}">
          <span class="rank-no${noCls(i)}">${i + 1}</span>
          ${capsuleHtml(g.appid, { perfect: isPerfect, eager, icon })}
          <span class="rank-name">${escapeHtml(g.name)}${playing ? '<span class="tag playing">在玩</span>' : ''}</span>
          <span class="rank-bar"><span style="${barStyle(pct, i)}"></span></span>
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

  /* 「最近14天游玩记录」模块已整体删除（#recent-list 容器与其渲染逻辑）；
     近两周总时长仍由「最近游玩」概览卡展示，数据来源与口径不变。 */

  // ---------- ①c 二级界面（下钻）：按月热力图 ----------
  /** 2026-10-31 第 86 轮：原来的「累计柱状 + 每日折线」（ECharts，按需还要联网拉 ~1MB）
      整体换成**按月热力图**。用户要的是「哪几天玩得多」的强弱，不是精确曲线；
      顺带把 ECharts 这个最大的外部依赖从站点里彻底摘掉。 */

  /* ---------- 游玩热力图：一年点阵（2026-11-07 重做，参考「听歌统计」插件的点阵热力图） ----------
     形态：7 行（周一→周日）× N 列（每周一列，一年 53 列），**一个点 = 一天**。
     交互：悬停出气泡（日期 + 当天游玩时长），点击在点阵**下方**展开当天玩过的游戏与时长。
     数据：state.days ← docs/data/daily/YYYY-MM.json 的 days[date]：
           · total_minutes 决定点的深浅（四档，相对本年度峰值）与气泡主数值
           · games[] = [{appid, name, minutes, is_new}] 就是点击后那天的列表
           · 该日无对象 = 还没采集到（.lna 空心点），与「有记录但 0 分钟」区分开
     ⚠️ 与旧「两个月并排日历」是完全不同的 DOM（.hx-*）：旧套件里断言 .hc / .heat-mb /
        .heat-nav / .hm-title 的会失效 —— 第 111 轮起由 verify111 守新契约。 */

  /** 某天某游戏的分钟数；appid 为空 = 当天总和。返回 null = 那天还没有数据 */
  function minutesOn(date, appid) {
    const day = state.days.get(date);
    if (!day) return null;
    if (!appid) return day.total_minutes ?? 0;
    return (day.games ?? []).find((g) => String(g.appid) === String(appid))?.minutes ?? 0;
  }

  /** 点榜单某一行 → 下钻到该游戏的一年热力图 */
  function openDrill(appid) {
    state.drill.appid = appid;
    state.drill.year = null;   // 回到「最新数据所在年」
    state.drill.sel = null;    // 进入新的下钻，不保留上一个游戏点开的那天
    // 热力图归属「最近游玩」栏目：进入下钻即切过去，数据不变
    switchView('recent', { instant: true });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function closeDrill() {
    // 必须清掉 appid：否则深链会一直挂着 g/<旧游戏>（切走再切回也回不来）
    state.drill.appid = null;
    state.drill.sel = null;
  }

  /** 可选年份：首份数据年 ~ 最新数据年，外加今年 */
  function hxYears() {
    const ys = new Set();
    for (const d of state.allDates) {
      const y = Number(d.slice(0, 4));
      if (Number.isFinite(y)) ys.add(y);
    }
    ys.add(new Date().getFullYear());
    return [...ys].sort((a, b) => a - b);
  }

  /** 当前年份：state.drill.year 优先，否则落到最新数据所在年 */
  function hxYear() {
    const y = Number(state.drill.year);
    if (Number.isFinite(y) && y > 1970) return y;
    const last = state.allDates[state.allDates.length - 1];
    return last ? Number(last.slice(0, 4)) : new Date().getFullYear();
  }

  /** 周一 = 0 … 周日 = 6（原生 getUTCDay 里周日是 0） */
  const hxDowIndex = (ds) => (new Date(ds + 'T12:00:00Z').getUTCDay() + 6) % 7;
  const hxDowName = (ds) => '一二三四五六日'[hxDowIndex(ds)];
  const hxDateLabel = (ds) =>
    `${ds.slice(0, 4)}年${Number(ds.slice(5, 7))}月${Number(ds.slice(8, 10))}日`;

  /** 气泡：日期 + 当天时长（未采集的日子写「尚未记录」） */
  function hxTipShow(cell) {
    const tip = $('hx-tip');
    const root = $('hx-root');
    if (!tip || !root || !cell) return;
    const ds = cell.dataset.date;
    const min = minutesOn(ds, state.drill.appid);
    tip.innerHTML =
      `<b>${hxDateLabel(ds)}</b><span>${min === null ? '尚未记录' : `游玩时长：${hm(min)}`}</span>`;
    tip.hidden = false;
    /* 位置：默认落在格子下方 9px；周五~周日那两行贴近面板底部，改成向上弹。
       左右各留 80px，避免贴边被裁。 */
    const r = cell.getBoundingClientRect();
    const rr = root.getBoundingClientRect();
    const row = hxDowIndex(ds);            // 周一 = 0 … 周日 = 6
    const up = row >= 5;
    tip.classList.toggle('is-up', up);
    const x = Math.min(Math.max(r.left - rr.left + r.width / 2, 80), Math.max(80, rr.width - 80));
    tip.style.left = `${x.toFixed(1)}px`;
    tip.style.top = `${(up ? r.top - rr.top - 9 : r.bottom - rr.top + 9).toFixed(1)}px`;
  }

  function hxTipHide() {
    const tip = $('hx-tip');
    if (tip) tip.hidden = true;
  }

  /** 点阵下方：某一天的明细（点击格子后展开；再点同一天 = 收起）
      第 112 轮：图标与排版改成与主页榜单行一致的**横图胶囊**（复用 capsuleHtml），
      并铺满面板宽度（原来 max-width 880 让右侧空了一大块）。 */
  function renderHxDay() {
    const box = $('hx-day');
    if (!box) return;
    const ds = state.drill.sel;
    if (!ds) { box.hidden = true; box.innerHTML = ''; return; }

    const appid = state.drill.appid;
    const day = state.days.get(ds);
    const all = day?.games ?? [];
    /* 下钻某款游戏时只列这款；否则列当天全部 */
    const list = (appid ? all.filter((x) => String(x.appid) === String(appid)) : all)
      .slice()
      .sort((a, b) => (b.minutes ?? 0) - (a.minutes ?? 0));
    const total = list.reduce((a, x) => a + (x.minutes ?? 0), 0);
    const maxMin = list.reduce((a, x) => Math.max(a, x.minutes ?? 0), 0);
    const scopeName = appid ? (state.meta?.games_lifetime?.[appid]?.name ?? '这款游戏') : '';

    const rows = list.length
      ? list.map((x) => {
          const g = state.meta?.games_lifetime?.[x.appid];
          const w = maxMin > 0 ? Math.max(2, ((x.minutes ?? 0) / maxMin) * 100) : 0;
          return (
            `<div class="hx-row">` +
            /* 与主页榜单同一套胶囊：134×64 横图 + 全成就金环（这款若已全解锁会自动带上） */
            capsuleHtml(x.appid, { icon: g?.img_icon_url }) +
            `<span class="hx-nm">${escapeHtml(x.name ?? '')}${x.is_new ? '<i class="tag new">新</i>' : ''}</span>` +
            `<span class="hx-bar"><span style="width:${w.toFixed(1)}%"></span></span>` +
            `<span class="hx-tt">${hm(x.minutes ?? 0)}</span>` +
            `</div>`
          );
        }).join('')
      : `<p class="hx-none">${day ? '这天没有游玩记录。' : '这天还没有采集到数据。'}</p>`;

    box.innerHTML =
      `<div class="hx-day-head">` +
      `<b>${hxDateLabel(ds)}</b>` +
      `<span class="hx-dow-tag">周${hxDowName(ds)}</span>` +
      `<span class="hx-day-sum">${
        list.length ? `${scopeName ? scopeName + ' · ' : ''}${list.length} 款 · 合计 ${hm(total)}` : '无游玩记录'
      }</span>` +
      `<button class="hx-day-x" id="hx-day-x" type="button" aria-label="收起当天明细">×</button>` +
      `</div>` +
      `<div class="hx-day-list">${rows}</div>`;
    box.hidden = false;
    /* 胶囊图走「占位 GIF + 观察器临近视口才赋 src」的懒加载（与主页榜单同一套），
       新插入的行必须重新挂一次，否则永远是透明占位块。 */
    observeCapsules(box);
  }

  /* ---------- 点阵几何：铺满面板宽度 + 月份之间留额外间隙 ----------
     第 112 轮：用户反馈「点阵右侧留白过多」，要求「加大月份之间的间隙、适当增大列间距」。
     做法：不再用固定的 --hx（12.4px），而是按容器实测宽度反解出「格子边长 / 列间距 /
     月份间隙」三个值，让 53 列 + 11 个月份间隙刚好铺满。列模板由 JS 拼成
     `var(--hx) … var(--hx-mgap) …`，月份边界处插入一个更窄的「间隙列」（7 个 .hx-mgap 占满一列）。
     窗口变化时只改这三个 CSS 变量，不重绘 DOM。 */
  const HX_DOW_W = { 26: 26 };   // 与 CSS 的 .hx 首列宽度保持一致

  function hxFit(cols, spaces) {
    const root = $('hx-root');
    if (!root) return;
    const dowW = parseFloat(getComputedStyle(root).getPropertyValue('--hx-dow-w')) || 26;
    const W = Math.max(220, root.clientWidth - dowW);
    const total = cols + spaces;
    /* 第 112 轮（用户：加大月份间隙、增大列间距、减少右侧留白）：
       不让格子吃掉全部余量 —— 先按「间距 ≈ 0.65 倍格子」定出边长（7~14px），
       剩下的宽度全摊给列间距；这样既铺满，又不会变成一排大方块。 */
    const denom = cols + 0.9 * spaces + 0.65 * (total - 1);
    const c = Math.max(7, Math.min(14, W / denom));
    const usedByDots = c * cols + 0.9 * c * spaces;
    const gap = Math.max(2, (W - usedByDots) / (total - 1));
    const mgap = c * 0.9;
    root.style.setProperty('--hx', c.toFixed(2) + 'px');
    root.style.setProperty('--hx-gap', gap.toFixed(2) + 'px');
    root.style.setProperty('--hx-mgap', mgap.toFixed(2) + 'px');
    root.dataset.geo = `${cols}|${spaces}`;
  }

  /** 一年的点阵渲染（下钻某款游戏时，点的深浅换成那款游戏当天的分钟数） */
  function renderDrill() {
    hxTipHide();   // 重绘会移动格子，气泡留着会指向错误位置
    const appid = state.drill.appid;
    const grid = $('hx-grid');
    const monthsBox = $('hx-months');
    if (!grid || !monthsBox) return;

    const year = hxYear();
    const jan1 = `${year}-01-01`;
    const lead = hxDowIndex(jan1);
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    const daysInYear = leap ? 366 : 365;
    const cols = Math.ceil((lead + daysInYear) / 7);
    const today = todayStr();

    /* ① 先扫一遍拿到峰值：四档深浅是「相对本年度峰值」，与插件一致 */
    const days = [];
    let peak = 0, active = 0, sum = 0, tracked = 0;
    for (let i = 0; i < daysInYear; i++) {
      const ds = addDaysStr(jan1, i);
      const min = minutesOn(ds, appid);
      if (min !== null) {
        tracked++;
        if (min > 0) { active++; sum += min; if (min > peak) peak = min; }
      }
      days.push({ ds, min });
    }

    /* ② 每个月 1 号落在第几周 —— 决定「月份间隙列」插在哪里、月份刻度摆在哪儿 */
    const monthWeek = [];   // [{m, week}]
    for (let m = 1; m <= 12; m++) {
      const first = `${year}-${String(m).padStart(2, '0')}-01`;
      const doy = Math.round((Date.parse(first + 'T12:00:00Z') - Date.parse(jan1 + 'T12:00:00Z')) / 86400000);
      monthWeek.push({ m, week: Math.floor((lead + doy) / 7) });
    }
    const gaps = new Set(monthWeek.filter((x) => x.week > 0).map((x) => x.week));

    /* ③ 拼列模板：正常周用 --hx，月份边界处插一列 --hx-mgap */
    const tpl = [];
    const colOf = new Map();   // week → 该周在网格里的列号（1 基）
    for (let w = 0; w < cols; w++) {
      if (gaps.has(w)) tpl.push('var(--hx-mgap)');
      colOf.set(w, tpl.length + 1);
      tpl.push('var(--hx)');
    }
    const template = tpl.join(' ');

    /* ④ 点阵格子：.hx-pad 补首周空位；月份边界插 7 个 .hx-mgap 占满那一列 */
    const cells = [];
    const pushGapCol = () => { for (let k = 0; k < 7; k++) cells.push('<span class="hx-mgap"></span>'); };
    for (let k = 0; k < lead; k++) cells.push('<span class="hx-pad"></span>');
    days.forEach(({ ds, min }, i) => {
      /* 该格属于第几周；跨到新的一周且正好是月份边界 → 先插间隙列 */
      const week = Math.floor((lead + i) / 7);
      const prevWeek = i === 0 ? -1 : Math.floor((lead + i - 1) / 7);
      if (week !== prevWeek && gaps.has(week)) pushGapCol();

      let lv;
      if (min === null) lv = 'na';
      else if (min <= 0) lv = 0;
      else {
        const r = peak > 0 ? min / peak : 0;
        lv = r <= 0.25 ? 1 : r <= 0.5 ? 2 : r <= 0.75 ? 3 : 4;
      }
      const cls = ['hx-c', 'l' + lv];
      if (ds === today) cls.push('is-today');
      if (ds === state.drill.sel) cls.push('is-sel');
      const live = min !== null;
      const label = !live
        ? `${hxDateLabel(ds)}，尚未采集`
        : min > 0
          ? `${hxDateLabel(ds)}，${appid ? '这款玩了 ' : '当天 '}${hm(min)}，查看当天游戏`
          : `${hxDateLabel(ds)}，${appid ? '这款当天没玩' : '当天没有游玩'}，仍可查看当天游戏`;
      cells.push(
        `<span class="${cls.join(' ')}" data-date="${ds}"` +
          (live ? ` role="button" tabindex="0"` : '') +
          ` aria-label="${escapeHtml(label)}"></span>`,
      );
    });
    while (cells.length % 7 !== 0) cells.push('<span class="hx-pad"></span>');

    /* ⑤ 月份刻度：按 week 映射到真实列号（跳过间隙列），同一列重复的跳过 */
    const marks = [];
    let lastCol = -1;
    for (const { m, week } of monthWeek) {
      const col = colOf.get(Math.min(week, cols - 1)) ?? 1;
      if (col <= lastCol) continue;
      lastCol = col;
      marks.push(`<span class="hx-ml" style="grid-column:${col}">${m}月</span>`);
    }

    grid.style.gridTemplateColumns = template;
    grid.innerHTML = cells.join('');
    monthsBox.style.gridTemplateColumns = template;
    monthsBox.innerHTML = marks.join('');

    /* ⑥ 按实测宽度反解尺寸，让点阵铺满（窗口变化时只更新变量） */
    hxFit(cols, gaps.size);

    /* ⑦ 概览 + 年份选择器 */
    const sumText = tracked
      ? `${year} 年 · ${active} 天有记录 · 峰值 ${hm(peak)} · 合计 ${hm(sum)}`
      : `${year} 年 · 暂无记录`;
    const sumEl = $('hx-sum');
    if (sumEl) sumEl.textContent = sumText;

    const sel = $('hx-year');
    if (sel) {
      const ys = hxYears();
      const key = ys.join(',');
      if (sel.dataset.years !== key) {
        sel.innerHTML = ys.map((y) => `<option value="${y}">${y} 年</option>`).join('');
        sel.dataset.years = key;
      }
      sel.value = String(year);
    }

    renderHxDay();
    renderDrillMore(appid);
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
      `<img class="rank-capsule" data-src="${CAPSULE(appid)}" data-srcset="${CAPSULE_SET(appid)}" src="${BLANK_GIF}" alt=""` +
      `${eager ? ' loading="eager" fetchpriority="high"' : ''} decoding="async" width="130" height="60"` +
      ` onerror="this.removeAttribute('srcset');if(!this.dataset.fb){this.dataset.fb=1;this.src='${CAPSULE_CDN(appid)}'}else{this.onerror=null;this.classList.add('is-icon');this.src='${icon ?? ''}'}">` +
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
            <div class="ach-name${rare}">${escapeHtml(a.name)}</div>
            <div class="ach-sub"><span class="ach-game">${escapeHtml(a.game)}</span>${a.desc ? ` · ${escapeHtml(a.desc)}` : ''}</div>
          </div>
          <span class="ach-meta">
            ${p ? `<span class="ach-pct">${p}</span>` : ''}
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

  /** 热力图格子里用的短时长：数字与单位之间留一个空格（「49 min」「4.4 h」）。
      第 89 轮用户要求；只在热力图的可见文字与 aria-label 里用，时间轴角标仍是紧凑写法。 */
  function heatTime(m) {
    const s = hoursShort(m);
    return s === '0' ? s : s.replace(/^([\d.]+)(.+)$/, '$1 $2');
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

    // 按周聚合：周一 -> {start, games: Map<appid, {name, minutes}>}
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
    /* 历史补录（meta.timeline_extra，运营维护的 overrides 文件）。
       只并进这里的周聚合，**不进 state.days** —— 所以热力图、统计汇总、最近游玩、
       换算、CSV 都不会看到这些分钟数（用户明确要求「仅用于时间轴」）。
       数据本身不显示任何「补录」字样：徽章就是徽章，和真实采集的周长得一样。 */
    for (const e of state.meta?.timeline_extra ?? []) {
      const ws = weekStart(e.date);
      if (!weeks.has(ws)) weeks.set(ws, { start: ws, games: new Map() });
      const w = weeks.get(ws);
      const cur = w.games.get(e.appid);
      if (cur) cur.minutes += e.minutes;
      else w.games.set(e.appid, { appid: e.appid, name: e.name, minutes: e.minutes });
    }

    if (!weeks.size) {
      hint.textContent = '—';
      box.innerHTML = '<p class="empty">暂无每周游玩数据。</p>';
      return;
    }

    const asc = [...weeks.values()].sort((a, b) => a.start.localeCompare(b.start));
    // 累计里程碑（每满 500h 一档）：以终身累计为基准锚定，周内跨越阈值即在该周标记。
    // 第 90 轮续：补录被视为真实历史的一部分（它补的正是「没被快照覆盖的那些周」），
    // 所以这里用周内全部分钟累加，补录与采集数据一视同仁。
    const allTotal = asc.reduce((a, w) => a + [...w.games.values()].reduce((x, g) => x + g.minutes, 0), 0);
    const base = Math.max(0, (state.meta.stats?.lifetime_minutes ?? 0) - allTotal);
    const STEP = 30000; // 500h（第 91 轮：用户要求里程碑改为每 500h 记一次）
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
      return `<span class="tl-game ${cls}">
          <img src="${CAPSULE(g.appid)}" srcset="${CAPSULE_SET(g.appid)}" alt="" loading="lazy"
               onerror="this.removeAttribute('srcset');this.onerror=null;this.classList.add('is-icon');this.src='${icon ?? ''}'">
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
      ['手动修正天数', h.manual_days ?? 0, ''],
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

  /** 一周从周一起算，与 renderTimeline 的 weekStart 保持一致 */
  const todayStr = () => ymd(new Date());

  // ================= 第 83 轮新增模块 =================
  /* 用户 2026-10-31 点名的一批体验改动：#7 热力图 / #8 封面主色进度条 / #10 悬停底纹
     #11 数字滚动+视图过渡 / #12 勋章墙 / #14 临门一脚推荐 / #15 阶段报告
     #18 单游戏详情升级 / #19 深链 / #21 周目标与节奏。
     全部只用现有数据（meta / daily / achievements），不新增任何运行时接口。 */

  /** 数字滚动：从 0 滚到 to。尊重 prefers-reduced-motion；0 值直接落地。
      fmt 收到的是浮点数，由调用方决定怎么格式化（整数 / 一位小数 / 时间串）。 */
  function countUp(el, to, fmt) {
    if (!el) return;
    const target = Number(to) || 0;
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || target === 0) { el.textContent = fmt(target); return; }
    const t0 = performance.now();
    const tick = (t) => {
      const k = Math.min(1, (t - t0) / 900);
      const e = 1 - Math.pow(1 - k, 3); // ease-out cubic
      el.textContent = fmt(target * e);
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  /* ---------- #10 悬停底纹：把当前指向的游戏封面极淡地铺在页底 ---------- */
  function ensureHeroLayer() {
    if ($('hero-bg')) return;
    const d = document.createElement('div');
    d.id = 'hero-bg';
    d.className = 'hero-bg';
    d.setAttribute('aria-hidden', 'true');
    document.body.insertBefore(d, document.body.firstChild);
  }

  function setHero(appid) {
    if (state.heroAppid === appid) return;
    state.heroAppid = appid;
    const el = $('hero-bg');
    if (!el) return;
    if (!appid) { el.style.opacity = '0'; return; }
    // 两层背景：本地封面命中第一层；没下载过这张图时浏览器会自然落到 CDN 那层
    el.style.backgroundImage = `url("${CAPSULE(appid)}"), url("${CAPSULE_CDN(appid)}")`;
    el.style.opacity = '1';
  }

  /* ---------- #12 全成就勋章墙 ---------- */
  function renderBadges() {
    const panel = $('panel-badges');
    const box = $('badges');
    if (!panel || !box) return;
    const perfect = state.meta?.ach_perfect ?? [];
    if (!perfect.length) { panel.hidden = true; return; }
    const gl = state.meta.games_lifetime ?? {};
    panel.hidden = false;
    if ($('badge-hint')) $('badge-hint').textContent = `${perfect.length} 款全部解锁 · 点一枚看趋势`;
    box.innerHTML = perfect
      .map((appid) => {
        const g = gl[appid] ?? {};
        return `<button type="button" class="badge" data-appid="${appid}">
          ${capsuleHtml(appid, { perfect: true, icon: ICON(appid, g.img_icon_url) })}
          <span class="badge-name">${escapeHtml(g.name ?? 'App ' + appid)}</span>
          <span class="badge-min">${hm(g.lifetime_minutes ?? 0)}</span>
        </button>`;
      })
      .join('');
    observeCapsules(box);
  }

  /* ---------- #21 周目标与节奏 ---------- */
  function weekMinutes(offset) {
    const start = addDaysStr(weekStart(todayStr()), offset * 7);
    let sum = 0;
    for (let i = 0; i < 7; i++) sum += state.days.get(addDaysStr(start, i))?.total_minutes ?? 0;
    return sum;
  }

  function goalHours() {
    try {
      const v = Number(localStorage.getItem('weekGoalH'));
      return v > 0 && v <= 168 ? v : 10;
    } catch (e) { return 10; }
  }

  function renderPace() {
    const box = $('pace');
    if (!box) return;
    const goal = goalHours();
    const cur = weekMinutes(0);
    const prev = weekMinutes(-1);
    const pct = Math.max(0, Math.min(1, cur / (goal * 60)));
    const R = 26;
    const C = 2 * Math.PI * R;
    const delta = prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null;
    const deltaTxt = delta === null ? '上周没有记录，这是起点' : delta >= 0 ? `比上周多 ${delta}%` : `比上周少 ${-delta}%`;
    box.innerHTML = `
      <div class="pace-ring">
        <svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true">
          <circle cx="32" cy="32" r="${R}" class="pr-track"></circle>
          <circle cx="32" cy="32" r="${R}" class="pr-fill"
                  stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${(C * (1 - pct)).toFixed(1)}"></circle>
        </svg>
        <div class="pace-num">${Math.round(pct * 100)}%</div>
      </div>
      <div class="pace-txt">
        <div class="pace-main">本周 ${hm(cur)} <span class="pace-dim">/ 目标 ${goal} h</span></div>
        <div class="pace-sub">${deltaTxt}</div>
      </div>
      <label class="pace-set">周目标
        <input type="number" id="week-goal" min="1" max="168" step="1" value="${goal}" aria-label="周目标小时数">
        <span>h</span>
      </label>`;
  }

  /* ---------- #16 时间换算 ---------- */
  function renderConvert() {
    const box = $('convert');
    if (!box) return;
    const m = state.meta?.stats?.lifetime_minutes ?? 0;
    if (!m) { box.innerHTML = ''; return; }
    /* 第 88 轮修：量词只能出现一次。原先把单位写在 label 开头（「场电影」「集 30 分钟的剧」），
       模板又在数字后补了一次 unit → 渲染成「694场 场电影」「2,776集 集 30 分钟的剧」。
       现在 label 只留「是什么」，量词统一由模板拼在数字后面。 */
    const items = [
      ['电影（2 小时一部）', m / 120, '场'],
      ['30 分钟的剧', m / 30, '集'],
      ['《战争与和平》（约 35 小时）', m / (60 * 35), '遍'],
      ['通勤（每天 1 小时）', m / (60 * 365), '年'],
    ];
    const fmt = (v) => (v >= 10 ? Math.round(v).toLocaleString('zh-CN') : v.toFixed(1));
    box.innerHTML =
      '<div class="cv-title">这些时间还能换算成</div><div class="cv-list">' +
      items.map(([label, v, unit]) => `<span class="cv-item"><b>${fmt(v)}</b>${unit} ${label}</span>`).join('') +
      '</div>';
  }

  /* ---------- #15 阶段报告 ---------- */
  function renderReport() {
    const box = $('report');
    if (!box) return;
    const s = state.meta?.stats ?? {};
    const dates = state.allDates;
    const gl = state.meta?.games_lifetime ?? {};
    const top = Object.values(state.meta?.games_index ?? {})
      .filter((g) => (g.total_minutes ?? 0) > 0)
      .sort((a, b) => b.total_minutes - a.total_minutes)
      .slice(0, 3);
    const best = s.best_day;
    const cell = (label, value, sub) =>
      `<div class="rp-cell"><div class="rp-label">${label}</div><div class="rp-value">${value}</div>` +
      (sub ? `<div class="rp-sub">${sub}</div>` : '') + '</div>';
    const trackedDays = s.tracked_days ?? dates.length;
    box.innerHTML =
      cell('追踪天数', `${trackedDays} 天`, `${s.active_days ?? 0} 天有记录`) +
      cell('期内总时长', hm(s.total_minutes ?? 0), `日均 ${hm(Math.round((s.total_minutes ?? 0) / Math.max(1, trackedDays)))}`) +
      cell('最长连续', `${s.longest_streak ?? 0} 天`, `当前 ${s.current_streak ?? 0} 天`) +
      cell('最佳单日', best ? hm(best.minutes) : '—', best ? best.date : '') +
      (top.length
        ? `<div class="rp-cell rp-wide"><div class="rp-label">期内最常玩</div><div class="rp-top">${top
            .map((g, i) => `<span><b>${i + 1}</b>${escapeHtml(g.name)}<i>${hm(g.total_minutes)}</i></span>`)
            .join('')}</div></div>`
        : '');
    if ($('report-range')) {
      $('report-range').textContent = dates.length ? `${dates[0]} → ${dates[dates.length - 1]}` : '—';
    }
    renderPace();
    renderConvert();
    void gl;
  }

  /* ---------- #18 单游戏详情：占比 / 期段 / 成就解锁 ---------- */
  function renderDrillMore(appid) {
    const box = $('drill-more');
    if (!box) return;
    const gl = state.meta?.games_lifetime ?? {};
    const g = appid ? gl[appid] : null;
    const totalLife = state.meta?.stats?.lifetime_minutes ?? 0;
    const share = g && totalLife > 0 ? (g.lifetime_minutes / totalLife) * 100 : null;
    // 与月历热力图同口径：只数「当天真有时长」的日子（基线日的 0 分钟不算）
    const days = appid
      ? state.allDates.filter((d) => (state.days.get(d)?.games ?? []).some((x) => String(x.appid) === String(appid)))
      : state.allDates.filter((d) => (state.days.get(d)?.total_minutes ?? 0) > 0);
    const inPeriod = appid
      ? days.reduce((a, d) => {
          const hit = (state.days.get(d)?.games ?? []).find((x) => String(x.appid) === String(appid));
          return a + (hit?.minutes ?? 0);
        }, 0)
      : (state.meta?.stats?.total_minutes ?? 0);
    /* 第 113 轮（用户：「删除期内合计和有记录」）：这两张卡只在**年视图**出现过，
       现在整个区块留空；下钻某款游戏时的详情（占比 / 期段 / 成就）照旧。 */
    if (!g) { box.innerHTML = ''; return; }
    box.innerHTML =
      `<div class="dm-head">
          <div class="dm-share"><span>占终身时长</span><b>${share.toFixed(1)}%</b><i style="width:${Math.min(100, share).toFixed(1)}%"></i></div>
          <div class="dm-kv"><span>期内游玩</span><b>${hm(inPeriod)}</b></div>
          <div class="dm-kv"><span>首次记录</span><b>${days[0] ?? '—'}</b></div>
          <div class="dm-kv"><span>最近游玩</span><b>${g.last_played ?? '—'}</b></div>
        </div>` +
      '<div class="dm-ach" id="dm-ach"><p class="dm-empty">成就明细按需加载…</p></div>';
    ensureAchDetail().then(() => {
      const mine = state.ach?.games?.[appid];
      const box2 = $('dm-ach');
      if (!box2) return;
      if (!mine || !(mine.achievements ?? []).length) {
        box2.innerHTML = '<p class="dm-empty">这款游戏没有成就记录（无成就系统，或尚未采集）。</p>';
        return;
      }
      const un = (mine.achievements ?? []).slice().sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0)).slice(0, 8);
      box2.innerHTML =
        `<div class="dm-ach-head">已解锁 ${mine.unlocked}/${mine.total} · 最近 8 条</div>` +
        un
          .map(
            (a) => `<div class="dm-row">
            <span class="dm-name${a.percent != null && a.percent < ACH_RARE_PCT ? ' is-gold' : ''}">${escapeHtml(a.name)}</span>
            <span class="dm-pct">${a.percent != null ? a.percent + '%' : ''}</span>
            <span class="dm-date">${a.ts ? achDate(a.ts) : ''}</span>
          </div>`,
          )
          .join('');
    });
  }

  /* ---------- #19 深链 ---------- */
  function syncHash() {
    const parts = ['#/' + state.view];
    if (state.view === 'recent' && state.drill.appid) parts.push('g/' + state.drill.appid);
    const next = parts.join('/');
    if (location.hash !== next) history.replaceState(null, '', next);
  }

  function applyHash() {
    const h = (location.hash || '').replace(/^#\/?/, '');
    if (!h) return false;
    const seg = h.split('/').filter(Boolean);
    const view = ['lifetime', 'recent', 'ach', 'timeline', 'data'].includes(seg[0]) ? seg[0] : null;
    if (!view) return false;
    switchView(view, { instant: true });
    const gi = seg.indexOf('g');
    const appid = gi >= 0 ? seg[gi + 1] : null;
    if (appid && (view === 'recent' || view === 'lifetime')) openDrill(appid);
    return true;
  }

  /* ---------- 新增交互的一次性绑定（放在 bind() 之后调用，避免改动原函数体） ---------- */
  function bindMore() {
    ensureHeroLayer();
    // 第 85 轮：游戏库卡恢复独立视图后，点击绑定也要回来（第 83 轮删卡时被一并移除）
    const gamesCard = $('card-games');
    if (gamesCard) gamesCard.addEventListener('click', () => switchView('timeline'));
    const list = $('lt-list');
    if (list) {
      list.addEventListener('mouseover', (e) => {
        const row = e.target.closest('.rank-item');
        setHero(row ? row.dataset.appid : null);
      });
      list.addEventListener('mouseleave', () => setHero(null));
    }
    const drillTo = (e) => {
      const b = e.target.closest('[data-appid]');
      if (b) openDrill(b.dataset.appid);
    };
    if ($('badges')) $('badges').addEventListener('click', drillTo);
    if ($('suggest')) $('suggest').addEventListener('click', drillTo);
    const pace = $('pace');
    if (pace) {
      pace.addEventListener('change', (e) => {
        if (!e.target || e.target.id !== 'week-goal') return;
        const v = Number(e.target.value);
        if (!(v >= 1 && v <= 168)) return;
        try { localStorage.setItem('weekGoalH', String(Math.round(v))); } catch (err) { /* 隐私模式忽略 */ }
        renderPace();
      });
    }
    window.addEventListener('hashchange', () => { applyHash(); });
  }
  // ---------- tabs / init ----------
  /** opts.instant：跳过 View Transition（深链直达时用 —— 过渡的回调是异步执行的，
   *  会把紧接着 openDrill 打开的详情面板又关回去）。 */
  function switchView(v, opts = {}) {
    const run = () => {
      state.view = v;
      document.querySelectorAll('.card-nav').forEach((c) => c.classList.toggle('active', c.dataset.view === v));
      document.querySelectorAll('.view').forEach((sec) => sec.classList.toggle('active', sec.id === `view-${v}`));
      if (v === 'lifetime') closeDrill();
      if (v === 'recent') renderDrill();
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
      if (v === 'data') renderReport();
      syncHash();
    };
    // #11 视图过渡：支持的浏览器用 View Transitions，不支持的（或用户要求减少动效）直接切
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (opts.instant || !document.startViewTransition || reduce) { run(); return; }
    if (state.vt) { run(); return; }
    const t = document.startViewTransition(run);
    state.vt = t;
    Promise.resolve(t.finished).catch(() => {}).then(() => { state.vt = null; });
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
    // 只有史蒂夫头像绑定主题切换（2026-10-24 起从左侧小黄人搬过来，id 仍是 #theme-light，
    // 所以 bindFlip / syncThemeUi 一行都不用改）；
    // 左侧小黄人是观影记录入口（<a href="watch.html">，纯导航、无 JS）；
    // 氛围特效开关在页脚（fx.js 自己绑定 #fx-seg）。
    bindFlip($('theme-light'), 'all');

    /* 热力图（第 111 轮换成一年点阵）：
       悬停出气泡、点击在点阵下方展开当天游戏列表；再点同一天 = 收起。
       未采集的日子（.lna）没有 role/tabindex，不参与交互。 */
    const hxGrid = $('hx-grid');
    if (hxGrid) {
      hxGrid.addEventListener('mouseover', (e) => {
        const c = e.target.closest('.hx-c');
        if (c) hxTipShow(c); else hxTipHide();
      });
      hxGrid.addEventListener('mouseleave', hxTipHide);
      hxGrid.addEventListener('focusin', (e) => {
        const c = e.target.closest('.hx-c');
        if (c) hxTipShow(c);
      });
      hxGrid.addEventListener('focusout', hxTipHide);
      const pickDay = (cell) => {
        if (!cell || !cell.dataset.date) return false;
        const ds = cell.dataset.date;
        if (minutesOn(ds, state.drill.appid) === null) return false;
        state.drill.sel = state.drill.sel === ds ? null : ds;  // 同一天再点 = 收起
        renderDrill();
        /* 第 113 轮（用户：点开当天后「上方元素会跳一下很突兀」）：
           原来无条件 scrollIntoView({block:'nearest'}) 会把列表底边拽进视口，
           整页跟着上滚 200~300px。现在只有「列表头完全在视口外」才轻推一下，
           且只推到头行露出来为止 —— 头行本来就在视野里时一步都不滚。 */
        const box = $('hx-day');
        if (box && !box.hidden) {
          const head = box.querySelector('.hx-day-head') || box;
          const r = head.getBoundingClientRect();
          const vh = window.innerHeight;
          if (r.top > vh - 24) {
            const dy = Math.min(r.top - 96, r.top - vh + 96);
            if (dy > 0) window.scrollBy({ top: dy, behavior: 'smooth' });
          }
        }
        return true;
      };
      hxGrid.addEventListener('click', (e) => pickDay(e.target.closest('.hx-c')));
      hxGrid.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        if (pickDay(e.target.closest('.hx-c'))) e.preventDefault();
      });
    }
    const hxYearSel = $('hx-year');
    if (hxYearSel) {
      hxYearSel.addEventListener('change', (e) => {
        state.drill.year = Number(e.target.value);
        state.drill.sel = null;
        hxTipHide();
        renderDrill();
      });
    }
    /* 窗口变化只重算「格子/间距/月份间隙」三个变量，不重绘 365 个节点 */
    let hxResizeT = 0;
    window.addEventListener('resize', () => {
      clearTimeout(hxResizeT);
      hxResizeT = setTimeout(() => {
        const geo = $('hx-root')?.dataset.geo;
        if (!geo) return;
        const [c, s] = geo.split('|').map(Number);
        if (c > 0) hxFit(c, s);
      }, 160);
    });

    const hxDayBox = $('hx-day');
    if (hxDayBox) {
      hxDayBox.addEventListener('click', (e) => {
        if (!e.target.closest('#hx-day-x')) return;
        state.drill.sel = null;
        renderDrill();
      });
    }
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        hxTipHide();
        if (state.drill.sel) { state.drill.sel = null; renderDrill(); }
      }
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

    // 第 104 轮：热力图只归属「最近游玩」，只能由该卡进入。
    // 游戏时长卡只负责回到累计榜；停在本栏时再点也不再触发下钻（原 else 的 openDrill
    // 是热力图移走前的遗留分支，会把人从「游戏时长」直接带进热力图）。
    $('card-lifetime').addEventListener('click', () => {
      if (state.view !== 'lifetime') switchView('lifetime');
    });
    $('card-recent').addEventListener('click', () => switchView('recent'));
    $('card-ach').addEventListener('click', () => switchView('ach'));
    $('card-data').addEventListener('click', () => switchView('data'));

    // 成就页：游戏筛选
    $('ach-game').addEventListener('change', (e) => {
      state.achFilter = e.target.value || null;
      renderAch();
    });

    // 游戏累计列表：点击整行 → 该游戏每日时长热力图（下钻）
    $('lt-list').addEventListener('click', (e) => {
      const row = e.target.closest('.rank-item');
      if (!row) return;
      openDrill(row.dataset.appid);
    });

    /* 第 87 轮：「最近游玩」列表原本唯一的交互（首行那枚日历入口）已删除，
       该列表现在**没有任何点击行为**，所以这里不再挂监听器（原来那条
       `#recent-list` 委托已整体移除），避免留下一个空委托误导下一轮。 */

    $('btn-drill-back').addEventListener('click', () => {
      switchView('lifetime');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    // 第 111 轮：月份翻页（‹ ›）已随「两月并排日历」一起移除，
    // 现在由点阵上方的年份选择器切换范围。

    $('btn-csv-daily').addEventListener('click', () => download('steam-daily.csv', csvDaily()));
    $('btn-csv-lifetime').addEventListener('click', () => download('steam-games-lifetime.csv', csvLifetime()));
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
      renderAch();      // 此处只有 stats 摘要，成就页显示骨架
      renderHealth();
      buildAchSelect();
      // 第 83 轮新增块：热力图 / 勋章墙 / 推荐 / 阶段报告，以及新交互的一次性绑定
      bindMore();
      renderBadges();
      renderReport();
      // 有深链就按深链走（applyHash 内部已切视图）；没有就用默认视图。
      // 首屏不播 View Transition：过渡回调是异步的，会把深链打开的详情面板又关回去。
      if (!applyHash()) switchView('lifetime', { instant: true });
    } catch (err) {
      clearTimeout(watchdog);
      console.error('初始化失败：', err);
      showFatal('页面初始化出错');
    }
  })();
})();
