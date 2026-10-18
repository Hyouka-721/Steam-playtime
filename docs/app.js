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
    meta: null,       // 当前生效的 meta：正常态为原始值，回看态为按目标日反推的派生快照
    ach: null,        // docs/data/achievements.json（可能尚未生成）
    achFilter: null,  // 成就页游戏筛选
    days: new Map(),  // 'YYYY-MM-DD' -> day（始终保留全量，回看只截断日期索引）
    allDates: [],
    view: 'lifetime',
    drill: { appid: null },   // 二级趋势界面：null = 每日总时长
    drillRange: 30,
    charts: {},
    // ---- 数据回看（史蒂夫头像 → 游玩日历）----
    review: null,       // 回看日期 'YYYY-MM-DD'；null = 最新数据（今天）
    metaFull: null,     // 原始 meta 留底，退出回看时还原
    achFull: null,      // 原始成就留底
    allDatesFull: [],   // 原始日期索引留底
    cal: { open: false, ym: '2026-10', busy: false, lastFocus: null },
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
  async function jget(url, tries = 3) {
    let lastErr;
    for (let i = 0; i < tries; i++) {
      try {
        const r = await fetch(url, { cache: 'no-store' });
        if (!r.ok) throw new Error(`${url} -> HTTP ${r.status}`);
        return await r.json();
      } catch (e) {
        lastErr = e;
        if (i < tries - 1) await new Promise((res) => setTimeout(res, 900 * (i + 1)));
      }
    }
    throw lastErr;
  }

  /** 致命错误兜底：给出可见提示与重试按钮，避免页面无声空白 */
  function showFatal(msg) {
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
      文案也要随之更新）。头像（史蒂夫）自 2026-10-18 起不再参与主题切换——它改作
      「游玩日历」入口，提示文案由 renderReviewBar / exitReview 负责维护，故不在此同步。 */
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

  // ---------- load ----------
  async function load() {
    try {
      state.meta = await jget('data/meta.json');
    } catch (e) {
      showFatal('数据加载失败');
      return false;
    }
    for (const m of state.meta.months ?? []) {
      try {
        const month = await jget(`data/daily/${m}.json`);
        for (const [date, day] of Object.entries(month.days ?? {})) state.days.set(date, day);
      } catch (e) {
        console.warn('月份加载失败', m, e);
      }
    }
    state.allDates = [...state.days.keys()].sort();
    // 留底：进入「数据回看」时会被按目标日截断，退出时靠这两份还原
    state.allDatesFull = state.allDates;
    state.metaFull = state.meta;

    // 成就数据：可选资源，404 / 占位（ready:false）时卡片与详情页显示待采集
    try {
      const ach = await jget('data/achievements.json');
      if (ach && ach.ready && ach.stats?.total > 0) state.ach = ach;
    } catch (e) {
      console.warn('成就数据未生成（每日采集任务自明日开始产出）');
    }
    if (state.ach) state.achFull = state.ach;
    return true;
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

    $('c-lifetime').textContent = hm(s.lifetime_minutes ?? 0);

    // 最近游玩卡：近两周总时长
    $('c-recent').textContent = hm(lastNDaysTotal(14).minutes);

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

  /* 首行日期上方的「游玩日历」入口图标（2026-10-18 职能对调后）：
     透明小日历（无底色无边框），CSS 里绝对定位于日期文字上方，不占布局、不改行高；
     点击打开月历浮层选日期回看（即原先挂在右上史蒂夫头像上的职能）；
     史蒂夫头像已改为氛围特效开关（单击 开 / 关，仅流星）。
     点击在 #lt-list 的委托里最先拦截，不会误触发行下钻；日期文字本身的
     点击行为不变（仍下钻）。回看中：图标着色 --accent 并显示圆点（.cal-mark）。 */
  const CAL_ICON_BTN =
    '<button class="cal-icon-btn" type="button" data-cal-toggle ' +
    'title="点击打开游玩日历，选择日期进行数据回看" aria-label="打开游玩日历，选择有游玩记录的日期进行数据回看">' +
    '<svg viewBox="0 0 20 20" width="22" height="22" aria-hidden="true" focusable="false">' +
    '<rect x="2.6" y="4.2" width="14.8" height="13.6" rx="2.2"></rect>' +
    '<path d="M2.6 8.6h14.8M7 2.6v3M13 2.6v3"></path>' +
    '<circle class="cal-mark" cx="10" cy="13.4" r="1.3"></circle>' +
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

    const rowHtml = (g, i, noCal) => {
      const icon = ICON(g.appid, g.img_icon_url);
      const pct = Math.max(g.lifetime_minutes > 0 ? 1.5 : 0, (g.lifetime_minutes / max) * 100);
      const barStyle = i < topPalette.length ? `width:${pct}%;background:${topPalette[i]}` : `width:${pct}%`;
      const playing = (recent.get(g.appid) ?? 0) > 0;
      const noCls = i < 3 ? ` r${i + 1}` : '';
      // 仅首行（折叠区 noCal=true 不渲染）在日期文字上方放日历入口图标；
      // 图标为绝对定位，日期文字本身的位置与行高不受影响
      const lastHtml = !noCal && i === 0
        ? `<span class="rank-last">${CAL_ICON_BTN}${g.last_played ?? '—'}</span>`
        : `<span class="rank-last">${g.last_played ?? '—'}</span>`;
      // 胶囊图按需加载（2026-10-18 首屏优化）：原生 loading="lazy" 的判定时机
      // 在各浏览器/无头环境下差异很大——实测 53 行会一次性发起 53 个 Steam CDN
      // 请求，首屏带宽被远端的列表图抢走，反而拖慢首屏那几张关键图。
      // 这里改为「占位透明 GIF + IntersectionObserver 临近视口才赋 src」：
      // 首屏可见的几行由观察器立刻接管（rootMargin 提前 200px 预热），
      // 屏幕外的行在滚动到附近前完全零请求。首行额外走高优先级，让焦点图先到。
      const eager = i === 0;
      return `<div class="rank-item${g.lifetime_minutes === 0 ? ' zero' : ''}" data-appid="${g.appid}" title="点击查看该游戏每日时长趋势">
          <span class="rank-no${noCls}">${i + 1}</span>
          <img class="rank-capsule" data-src="${CAPSULE(g.appid)}" src="${BLANK_GIF}" alt=""
               ${eager ? 'loading="eager" fetchpriority="high"' : ''} decoding="async" width="130" height="60"
               onerror="this.onerror=null;this.classList.add('is-icon');this.src='${icon ?? ''}'">
          <span class="rank-name" title="${escapeHtml(g.name)}">${escapeHtml(g.name)}${playing ? '<span class="tag playing">在玩</span>' : ''}</span>
          <span class="rank-bar"><span style="${barStyle}"></span>${i === 0 ? '<img class="rank-cat" src="data:image/png;base64,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" alt="" draggable="false" width="298" height="168" decoding="async"><img class="rank-tj" src="data:image/png;base64,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" alt="" draggable="false" width="165" height="124" decoding="async"><img class="rank-penguin" src="data:image/png;base64,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" alt="" draggable="false" width="381" height="154" decoding="async">' : ''}</span>
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
        `<div id="idle-list" class="rank-list" hidden>${idle.map((g, i) => rowHtml(g, played.length + i, true)).join('')}</div>`;
    }
    html +=
      `<p class="list-foot">共 ${played.length} 款已游玩游戏 · 合计 ${hm(totalShown)}` +
      (idle.length ? `　<span class="list-foot-dim">另有 ${idle.length} 款从未启动</span>` : '') +
      `</p>`;

    box.innerHTML = html;
    observeCapsules(box); // 登记新渲染出的胶囊图（视口临近才真正下载）
    syncCalIcon(); // 列表重渲染后，把日历图标状态对齐当前回看日期
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

  /* ---- 首行日期上方的「游玩日历」入口（状态随回看变化） ---- */
  function calIconEl() {
    return document.querySelector('#lt-list [data-cal-toggle]');
  }

  /** 把日历图标的视觉状态（回看着色 / 圆点 / 提示文案）对齐到当前回看日期 */
  function syncCalIcon() {
    const btn = calIconEl();
    if (!btn) return;
    const d = state.review;
    btn.classList.toggle('reviewing', !!d);
    btn.title = d ? `正在回看 ${d} · 点击选择其它日期` : '点击打开游玩日历，选择日期进行数据回看';
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
  function renderRecent() {
    const box = $('recent-list');
    const hint = $('recent-hint');
    const lifetime = state.meta.games_lifetime ?? {};
    const recent = recentMinutesByApp(14);
    const list = Object.values(lifetime)
      .map((g) => ({ ...g, recent: recent.get(g.appid) ?? 0 }))
      .filter((g) => g.recent > 0)
      .sort((a, b) => b.recent - a.recent);

    if (!list.length) {
      hint.textContent = '—';
      box.innerHTML = '<p class="empty">最近两周还没有游玩记录（每日数据自首次快照后开始积累）。</p>';
      return;
    }
    hint.textContent = `近 14 天 · 共 ${list.length} 款游戏`;
    const max = Math.max(...list.map((g) => g.recent), 1);

    box.innerHTML = list
      .map((g, i) => {
        const icon = ICON(g.appid, g.img_icon_url);
        const pct = Math.max(1.5, (g.recent / max) * 100);
        const barStyle = i < topPalette.length ? `width:${pct}%;background:${topPalette[i]}` : `width:${pct}%`;
        const noCls = i < 3 ? ` r${i + 1}` : '';
        return `<div class="rank-item">
          <span class="rank-no${noCls}">${i + 1}</span>
          <img class="rank-capsule" data-src="${CAPSULE(g.appid)}" src="${BLANK_GIF}" alt="" decoding="async"
               width="130" height="60"
               onerror="this.onerror=null;this.classList.add('is-icon');this.src='${icon ?? ''}'">
          <span class="rank-name" title="${escapeHtml(g.name)}">${escapeHtml(g.name)}</span>
          <span class="rank-bar"><span style="${barStyle}"></span></span>
          <span class="rank-min">${hm(g.recent)}</span>
          <span class="rank-last">${g.last_played ?? '—'}</span>
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

  /** Steam 全球完成率 → 显示文本：>=10% 取整，<10% 保留一位小数；无数据返回 null */
  const achPctText = (p) => {
    const n = Number(p);
    if (!Number.isFinite(n) || n < 0) return null;
    return n >= 10 ? `${Math.round(n)}%` : `${n.toFixed(1)}%`;
  };

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
        return `<div class="ach-item">
          <img class="ach-icon" src="${a.icon ?? ''}" alt="" loading="lazy"
               onerror="this.onerror=null;this.replaceWith(Object.assign(document.createElement('span'),{className:'icon-ph ach-icon-ph'}))">
          <div class="ach-main">
            <div class="ach-name" title="${escapeHtml(a.name)}">${escapeHtml(a.name)}</div>
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

  // ---------- 史蒂夫头像 → 游玩日历 + 数据回看 ----------
  /** 一周从周一起算，与 renderTimeline 的 weekStart 保持一致 */
  const todayStr = () => ymd(new Date());
  /** 有游玩记录 = 当日分钟数 > 0（CI 可能写入 0 分钟的占位日，那也按无记录处理） */
  const hasPlay = (d) => (state.days.get(d)?.total_minutes ?? 0) > 0;

  /** 可翻阅的月份范围受限于已落盘的 data/daily/*.json（meta.months），避免翻到空月份 */
  function calRange() {
    const ms = (state.metaFull?.months ?? []).slice().sort();
    return ms.length ? { min: ms[0], max: ms[ms.length - 1] } : null;
  }

  /** 打开日历时的默认月：最新快照所在月（当前数据即 2026-10），退化到有数据的最后一个月 */
  function calDefaultMonth() {
    const snap = state.metaFull?.last_snapshot_date;
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

  function renderCalGrid() {
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

    if (!state.metaFull) {
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
      if (ds === state.review) cls.push('sel');
      const tip = play
        ? `${ds} · 游玩 ${hm(day.total_minutes)}　点击回溯到这一天`
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
    setCalStatus(state.review ? `正在回看 ${state.review}` : `本月 ${activeCount} 天有记录`);
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

  function openCal(ym) {
    if (state.cal.open) return;
    state.cal.open = true;
    state.cal.lastFocus = document.activeElement;
    state.cal.ym = (ym || state.review || calDefaultMonth()).slice(0, 7);
    const ov = $('cal-overlay');
    ov.hidden = false;
    setCalBusy(false);
    setCalStatus('');
    renderCalGrid();
    document.addEventListener('keydown', onCalKey, true);
    const first = $('cal-grid').querySelector('.cal-day.sel') ?? $('cal-close');
    if (first) first.focus();
  }

  function closeCal() {
    if (!state.cal.open) return;
    state.cal.open = false;
    setCalBusy(false);
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
      closeCal();
    } else if (e.key === 'ArrowLeft' && !state.cal.busy) {
      stepMonth(-1);
    } else if (e.key === 'ArrowRight' && !state.cal.busy) {
      stepMonth(1);
    }
  }

  /** 按目标日重建一份「当时的 meta 快照」。
      仓库只保存每日差分（以及一份当前终身累计），没有历史全量快照，因此：
        · 每日相关统计 —— 在截断到该日的每日记录上真实重算（精确）
        · 终身累计 —— 用「当前值 − 该日之后的每日增量」反推（估算）
        · 成就 —— 按解锁时间过滤（精确）
      无法精确还原的部分统一记进 notes，由状态条明示给用户。 */
  function buildSnapshot(date) {
    const full = state.metaFull;
    if (!full) throw new Error('数据尚未加载完成');
    const within = state.allDatesFull.filter((d) => d <= date);
    const after = state.allDatesFull.filter((d) => d > date);
    if (!within.length) throw new Error('该日之前没有任何每日记录，无法回溯');
    if (!full.games_lifetime || !Object.keys(full.games_lifetime).length) {
      throw new Error('缺少游戏终身时长数据，无法还原');
    }

    const notes = [];
    // 之后的每日增量 / 每款游戏的增量
    const laterTotal = after.reduce((a, d) => a + (state.days.get(d)?.total_minutes ?? 0), 0);
    const laterByApp = new Map();
    for (const d of after) {
      for (const g of state.days.get(d)?.games ?? []) {
        const k = String(g.appid);
        laterByApp.set(k, (laterByApp.get(k) ?? 0) + g.minutes);
      }
    }

    const day = state.days.get(date);
    if (laterTotal > 0) notes.push('终身累计为按「当前值 − 之后增量」反推的估算值');
    if (!day) {
      notes.push('当日没有独立快照，展示的是此前最近一次记录的状态');
    } else {
      if ((day.span_days ?? 1) > 1) notes.push(`当日覆盖 ${day.span_days} 天（含补采），数值偏高`);
      if (day.confidence === 'low') notes.push('当日为低置信度快照');
      else if (day.confidence === 'medium') notes.push('当日置信度中等');
      if ((day.flags ?? []).length) notes.push(`标记：${day.flags.join('、')}`);
    }

    // ---- 每日维度：精确重算 ----
    const totalMin = within.reduce((a, d) => a + (state.days.get(d)?.total_minutes ?? 0), 0);
    const appSet = new Set();
    for (const d of within) {
      for (const g of state.days.get(d)?.games ?? []) appSet.add(String(g.appid));
    }
    let cur = 0;
    let p = date;
    while (hasPlay(p)) {
      cur++;
      p = addDaysStr(p, -1);
    }
    let longest = 0;
    let run = 0;
    for (const d of eachDate(within[0], date)) {
      if (hasPlay(d)) {
        run++;
        if (run > longest) longest = run;
      } else run = 0;
    }
    const weekMin = eachDate(addDaysStr(date, -6), date).reduce(
      (a, d) => a + (state.days.get(d)?.total_minutes ?? 0),
      0,
    );
    let best = null;
    for (const d of within) {
      const mm = state.days.get(d)?.total_minutes ?? 0;
      if (mm > 0 && (!best || mm > best.minutes)) best = { date: d, minutes: mm };
    }
    const lifetimeMin = Math.max(0, (full.stats?.lifetime_minutes ?? 0) - laterTotal);
    const stats = {
      ...(full.stats ?? {}),
      lifetime_minutes: lifetimeMin,
      lifetime_hours: Math.round((lifetimeMin / 60) * 10) / 10,
      total_minutes: totalMin,
      total_hours: Math.round((totalMin / 60) * 10) / 10,
      tracked_days: within.length,
      active_days: within.filter(hasPlay).length,
      current_streak: cur,
      longest_streak: longest,
      week_minutes: weekMin,
      played_games: appSet.size,
      best_day: best,
    };

    // ---- 每款游戏的终身时长：减去之后增量反推；last_played 一并截断 ----
    const gl = {};
    for (const [k, g] of Object.entries(full.games_lifetime ?? {})) {
      const later = laterByApp.get(String(g.appid)) ?? 0;
      let last = g.last_played ?? null;
      if (last && last > date) {
        last = null;
        for (const d of within) {
          if ((state.days.get(d)?.games ?? []).some((x) => String(x.appid) === String(g.appid))) last = d;
        }
      }
      gl[k] = { ...g, lifetime_minutes: Math.max(0, (g.lifetime_minutes ?? 0) - later), last_played: last };
    }

    // ---- games_index 同步重算（保持派生 meta 的形状完整） ----
    const gi = {};
    for (const d of within) {
      for (const g of state.days.get(d)?.games ?? []) {
        const k = String(g.appid);
        const it =
          gi[k] ??
          (gi[k] = {
            appid: g.appid,
            name: g.name,
            img_icon_url: full.games_lifetime?.[k]?.img_icon_url ?? '',
            total_minutes: 0,
            first_day: d,
            last_day: d,
          });
        it.total_minutes += g.minutes;
        it.last_day = d;
      }
    }

    const health = {
      ...(full.health ?? {}),
      gap_days: within.filter((d) => (state.days.get(d)?.span_days ?? 1) > 1).length,
      low_confidence_days: within.filter((d) => state.days.get(d)?.confidence === 'low').length,
    };

    return {
      meta: { ...full, last_snapshot_date: date, stats, games_lifetime: gl, games_index: gi, health },
      notes,
    };
  }

  /** 成就回看：按解锁时间（Asia/Shanghai）截断，重算解锁数与完成度 */
  function buildAchSnapshot(date) {
    const full = state.achFull;
    if (!full?.stats) return null;
    const games = {};
    let unlocked = 0;
    for (const [k, g] of Object.entries(full.games ?? {})) {
      const list = (g.achievements ?? []).filter((a) => (achDate(a.ts) ?? '') <= date);
      unlocked += list.length;
      games[k] = { ...g, unlocked: list.length, achievements: list };
    }
    const total = full.stats.total ?? 0;
    return {
      ...full,
      games,
      stats: { ...full.stats, unlocked, pct: total ? Math.round((unlocked / total) * 1000) / 10 : 0 },
    };
  }

  /** 所有模块按「当前生效的 meta / allDates」重渲染（回看进入与退出共用） */
  function renderAll() {
    renderCards();
    renderLifetime();
    renderRecent();
    renderAch();
    renderHealth();
    buildAchSelect();
    renderTimeline();
    switchView(state.view);
    // switchView('lifetime') 会 closeDrill，所以要在其后判断下钻界面是否仍然打开
    if (!$('lt-detail').hidden && window.echarts) {
      try {
        renderDrill();
      } catch (e) {
        console.warn('回看态重绘趋势图失败', e);
      }
    }
  }

  function renderReviewBar(date, notes = []) {
    const bar = $('review-bar');
    if (!bar) return;
    bar.hidden = false;
    $('review-date').textContent = date;
    const latest = state.metaFull?.last_snapshot_date;
    const note = notes.length
      ? notes.map(escapeHtml).join('；')
      : '已按该日状态重建全部模块（每日数据为精确重算）';
    const tail = latest && latest !== date ? `<span class="review-dim">　最新快照：${escapeHtml(latest)}</span>` : '';
    $('review-note').innerHTML = note + tail;
    syncCalIcon(); // 回看标识落在首行日历图标上（着色 + 圆点）
  }

  async function enterReview(date) {
    if (state.cal.busy) return;
    if (!state.metaFull) {
      setCalStatus('数据尚未加载完成，请稍候再试', true);
      return;
    }
    if (!hasPlay(date)) {
      setCalStatus('该日期没有游玩记录', true);
      return;
    }
    setCalStatus('');
    setCalBusy(true, '正在回溯数据…');
    try {
      // 派生快照是同步 CPU 操作，先让浏览器把 loading 画出来
      await new Promise((r) => setTimeout(r, 60));
      const snap = buildSnapshot(date);
      state.review = date;
      state.meta = snap.meta;
      state.ach = buildAchSnapshot(date);
      state.allDates = state.allDatesFull.filter((d) => d <= date);
      renderReviewBar(date, snap.notes);
      renderAll();
      closeCal();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      toast(`已回溯到 ${date}`);
    } catch (err) {
      // 关键：失败只提示，绝不改动 state.meta / state.allDates，页面保持原样
      console.error('回溯失败', err);
      setCalStatus(`回溯失败：${err.message}（页面状态未改变）`, true);
    } finally {
      setCalBusy(false);
    }
  }

  function exitReview() {
    if (!state.review) return;
    state.review = null;
    state.meta = state.metaFull;
    state.ach = state.achFull;
    state.allDates = state.allDatesFull;
    $('review-bar').hidden = true;
    syncCalIcon();
    renderAll();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    toast('已返回最新数据');
  }

  // ---------- tabs / init ----------
  function switchView(v) {
    state.view = v;
    document.querySelectorAll('.card-nav').forEach((c) => c.classList.toggle('active', c.dataset.view === v));
    document.querySelectorAll('.view').forEach((s) => s.classList.toggle('active', s.id === `view-${v}`));
    if (v === 'lifetime') closeDrill();
    if (v === 'recent') renderRecent();
    if (v === 'ach') renderAch();
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
    // 游玩日历入口为首行日期上方的小日历图标 + 回看状态条的「更改日期」按钮。
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

    // 日历浮层：上下月、关闭、点空白关闭、点有记录的日期回溯
    $('cal-prev').addEventListener('click', () => stepMonth(-1));
    $('cal-next').addEventListener('click', () => stepMonth(1));
    $('cal-close').addEventListener('click', () => closeCal());
    $('cal-overlay').addEventListener('click', (e) => {
      if (e.target.closest('.cal-panel')) return; // 面板内的点击不关闭
      if (!state.cal.busy) closeCal();
    });
    $('cal-grid').addEventListener('click', (e) => {
      const cell = e.target.closest('.cal-day.on');
      if (cell && !state.cal.busy) enterReview(cell.dataset.date);
    });
    $('cal-grid').addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const cell = e.target.closest('.cal-day.on');
      if (!cell || state.cal.busy) return;
      e.preventDefault();
      enterReview(cell.dataset.date);
    });

    // 回看状态条：更改日期 / 返回今天
    $('btn-review-cal').addEventListener('click', () => openCal());
    $('btn-review-exit').addEventListener('click', exitReview);

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
    // 首行日期上方的日历图标只打开月历浮层，必须最先拦截，避免误触发行下钻
    // （日期文字本身仍是行的一部分，点击行为与以往一致 = 下钻）
    $('lt-list').addEventListener('click', (e) => {
      const calBtn = e.target.closest('[data-cal-toggle]');
      if (calBtn) {
        openCal();
        return;
      }
      const row = e.target.closest('.rank-item');
      if (!row) return;
      openDrill(row.dataset.appid).catch((e) => console.warn('趋势图打开失败', e));
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
      // 主题已由 <head> 内联脚本按 localStorage 决定（默认 cream），这里只同步站标提示文案
      syncThemeUi();
      if (!(await load())) return;
      clearTimeout(watchdog);
      renderCards();

      renderLifetime();
      renderRecent();
      renderAch();
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
