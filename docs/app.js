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

    // 数据卡：数据截至时间
    $('c-data').textContent = asOf ? `截至 ${asOf}` : '等待采集';

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

    const max = Math.max(...lifetime.map((g) => g.lifetime_minutes), 1);
    const totalShown = list.reduce((a, g) => a + g.lifetime_minutes, 0);

    box.innerHTML = list
      .map((g, i) => {
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
          <span class="rank-bar"><span style="${barStyle}"></span></span>
          <span class="rank-min">${hm(g.lifetime_minutes)}</span>
          <span class="rank-last">${g.last_played ?? '—'}</span>
        </div>`;
      })
      .join('');

    box.insertAdjacentHTML(
      'beforeend',
      `<p class="list-foot">共 ${list.length} 款游戏 · 合计 ${hm(totalShown)}</p>`,
    );
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
  /** 每天每款游戏的时长已在 daily 数据中；这里负责折线展示 */
  function buildDrillSelect() {
    const sel = $('drill-game');
    const gl = Object.values(state.meta.games_lifetime ?? {})
      .filter((g) => g.lifetime_minutes > 0)
      .sort((a, b) => b.lifetime_minutes - a.lifetime_minutes);
    sel.innerHTML =
      '<option value="">全部游戏</option>' +
      gl.map((g) => `<option value="${g.appid}">${escapeHtml(g.name)}</option>`).join('');
  }

  function openDrill(appid) {
    state.drill.appid = appid;
    $('drill-game').value = appid ?? '';
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

    const barColor = appid
      ? { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: '#66c0f4' }, { offset: 1, color: '#1c5b8f' }] }
      : { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: '#f0a35c' }, { offset: 1, color: '#9a5a24' }] };
    const lineColor = appid ? '#7fd1a8' : '#eef5fb';

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
          textStyle: { color: '#8fa5ba', fontSize: 12, fontWeight: 400 },
        },
        legend: {
          top: 0, right: 8,
          data: ['累计时长', '每日时长'],
          textStyle: { color: '#8fa5ba', fontSize: 11 },
          inactiveColor: '#3a4a5a',
        },
        tooltip: {
          trigger: 'axis',
          backgroundColor: '#0d1420',
          borderColor: '#263650',
          textStyle: { color: '#c7d5e0', fontSize: 12 },
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
          axisLabel: { color: '#8fa5ba', fontSize: 11 },
          axisLine: { lineStyle: { color: '#263650' } },
        },
        yAxis: [
          {
            type: 'value',
            name: '',
            axisLabel: {
              color: '#8fa5ba', fontSize: 11,
              formatter: (v) => Math.round((v / 60) * 10) / 10,
            },
            splitLine: { lineStyle: { color: '#1a2634' } },
          },
          {
            type: 'value',
            name: '',
            axisLabel: { color: '#8fa5ba', fontSize: 11 },
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
  }

  function bind() {
    // 三张导航卡：游戏时长 / 最近游玩 / 数据
    // 游戏时长卡：他页 → 回列表；列表 → 每日与累计趋势；趋势中 → 返回列表
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
    $('card-data').addEventListener('click', () => switchView('data'));

    // 游戏累计列表：点击整行 → 该游戏每日时长趋势
    $('lt-list').addEventListener('click', (e) => {
      const row = e.target.closest('.rank-item');
      if (!row) return;
      openDrill(row.dataset.appid);
    });

    $('drill-game').addEventListener('change', (e) => {
      state.drill.appid = e.target.value || null;
      renderDrill();
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
      if (!(await load())) return;
      clearTimeout(watchdog);
      renderCards();

      renderLifetime();
      renderRecent();
      renderHealth();
      buildDrillSelect();
      switchView('lifetime');
    } catch (err) {
      clearTimeout(watchdog);
      console.error('初始化失败：', err);
      showFatal('页面初始化出错');
    }
  })();
})();
