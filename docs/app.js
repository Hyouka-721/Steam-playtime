/* Steam 游戏时长统计 —— 零构建前端，仅依赖 ECharts CDN */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const ICON = (appid, hash) =>
    hash ? `https://media.steampowered.com/steamcommunity/public/images/apps/${appid}/${hash}.jpg` : null;
  // 游戏横幅大图（Steam 官方 CDN，460x215）
  const CAPSULE = (appid) => `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`;

  const state = {
    meta: null,
    ach: null,            // docs/data/achievements.json（可能尚未生成）
    achFilter: null,      // 成就页游戏筛选
    days: new Map(),      // 'YYYY-MM-DD' -> day
    allDates: [],
    view: 'lifetime',
    drill: { appid: null },   // 二级趋势界面：null = 每日总时长
    drillRange: 30,
    charts: {},
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
    syncThemeUi(id);
    // 图表画在 canvas 上，不会跟随 CSS 变量，需重新渲染
    if (state.charts.drill) renderDrill();
    if (announce) toast(`主题：${themeName(id)}`);
  }

  /** 同步杰瑞/汤姆的 title 提示（主题由首屏内联脚本随机决定时也要更新文案） */
  function syncThemeUi(id = currentTheme()) {
    const light = $('theme-light');
    const dark = $('theme-switch');
    if (light) light.title = `当前主题：${themeName(id)} · 点击切换浅色主题`;
    if (dark) dark.title = `当前主题：${themeName(id)} · 点击切换浅色主题`;
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

    // 成就数据：可选资源，404 / 占位（ready:false）时卡片与详情页显示待采集
    try {
      const ach = await jget('data/achievements.json');
      if (ach && ach.ready && ach.stats?.total > 0) state.ach = ach;
    } catch (e) {
      console.warn('成就数据未生成（每日采集任务自明日开始产出）');
    }
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

    const rowHtml = (g, i) => {
      const icon = ICON(g.appid, g.img_icon_url);
      const pct = Math.max(g.lifetime_minutes > 0 ? 1.5 : 0, (g.lifetime_minutes / max) * 100);
      const barStyle = i < topPalette.length ? `width:${pct}%;background:${topPalette[i]}` : `width:${pct}%`;
      const playing = (recent.get(g.appid) ?? 0) > 0;
      const noCls = i < 3 ? ` r${i + 1}` : '';
      return `<div class="rank-item${g.lifetime_minutes === 0 ? ' zero' : ''}" data-appid="${g.appid}" title="点击查看该游戏每日时长趋势">
          <span class="rank-no${noCls}">${i + 1}</span>
          <img class="rank-capsule" src="${CAPSULE(g.appid)}" alt="" loading="lazy"
               onerror="this.onerror=null;this.classList.add('is-icon');this.src='${icon ?? ''}'">
          <span class="rank-name" title="${escapeHtml(g.name)}">${escapeHtml(g.name)}${playing ? '<span class="tag playing">在玩</span>' : ''}</span>
          <span class="rank-bar"><span style="${barStyle}"></span>${i === 0 ? '<img class="rank-cat" src="garfield.png?v=3" alt="" draggable="false"><img class="rank-tj" src="tomjerry.png?v=1" alt="" draggable="false"><img class="rank-penguin" src="penguins.png?v=1" alt="" draggable="false">' : ''}</span>
          <span class="rank-min">${hm(g.lifetime_minutes)}</span>
          <span class="rank-last">${g.last_played ?? '—'}</span>
        </div>`;
    };

    let html = played.map(rowHtml).join('');
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
    };
    toggle.addEventListener('click', flip);
    toggle.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        flip();
      }
    });
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
          <img class="rank-capsule" src="${CAPSULE(g.appid)}" alt="" loading="lazy"
               onerror="this.onerror=null;this.classList.add('is-icon');this.src='${icon ?? ''}'">
          <span class="rank-name" title="${escapeHtml(g.name)}">${escapeHtml(g.name)}</span>
          <span class="rank-bar"><span style="${barStyle}"></span></span>
          <span class="rank-min">${hm(g.recent)}</span>
          <span class="rank-last">${g.last_played ?? '—'}</span>
        </div>`;
      })
      .join('');
  }

  // ---------- ①c 二级趋势界面（游戏累计下钻） ----------
  /** 每天每款游戏的时长已在 daily 数据中；这里负责折线展示。游戏由列表点击进入，不做切换下拉 */

  function openDrill(appid) {
    state.drill.appid = appid;
    $('lt-main').hidden = true;
    $('lt-detail').hidden = false;
    renderDrill();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function closeDrill() {
    $('lt-detail').hidden = true;
    $('lt-main').hidden = false;
  }

  function renderDrill() {
    const el = $('chart-drill');
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
    // 杰瑞（站标）：点击随机切换浅色主题；汤姆（头像）：点击随机切换深色主题
    // 键盘 Enter / 空格同样支持
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
    bindFlip($('theme-light'), 'light');
    bindFlip($('theme-switch'), 'light');

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
        openDrill(null);
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
    $('lt-list').addEventListener('click', (e) => {
      const row = e.target.closest('.rank-item');
      if (!row) return;
      openDrill(row.dataset.appid);
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
      // 主题已由 <head> 内联脚本随机决定，这里只同步头像提示文案
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
