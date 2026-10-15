/* Steam 游戏时长统计 —— 零构建前端，仅依赖 ECharts CDN */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const ICON = (appid, hash) =>
    hash ? `https://media.steampowered.com/steamcommunity/public/images/apps/${appid}/${hash}.jpg` : null;

  const state = {
    meta: null,
    days: new Map(),      // 'YYYY-MM-DD' -> day
    allDates: [],
    view: 'lifetime',
    ltSearch: '',
    ltSort: 'lifetime',
    selectedDate: null,   // 每日记录选中的日期
    trendRange: 30,
    stacked: false,
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
  async function jget(url) {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error(`${url} -> HTTP ${r.status}`);
    return r.json();
  }

  // ---------- load ----------
  async function load() {
    try {
      state.meta = await jget('data/meta.json');
    } catch (e) {
      $('subtitle').textContent = '数据加载失败：尚未构建数据或部署未完成';
      document.querySelectorAll('.view').forEach((v) => (v.style.display = 'none'));
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

    $('c-games').textContent = `${s.lifetime_played_games ?? 0} / ${s.owned_games ?? 0}`;

    const w7 = lastNDaysTotal(7);
    $('c-week').textContent = hm(w7.minutes);

    // 昨日 = 最新快照日的前一天（快照每天 23:30 采集，最新快照日即「今天」）
    let yesterdayMin = 0;
    if (asOf && state.allDates.length) {
      const y = addDaysStr(asOf, -1);
      yesterdayMin = state.days.get(y)?.total_minutes ?? 0;
    }
    $('c-yesterday').textContent = hm(yesterdayMin);

    $('subtitle').textContent = asOf
      ? `数据截至 ${asOf}${state.meta.tracking_since ? ` · 每日记录自 ${state.meta.tracking_since}` : ''}`
      : '等待首次采集';

    const h = state.meta.health ?? {};
    const badge = $('badge-health');
    const problems = (h.gap_days ?? 0) + (h.low_confidence_days ?? 0);
    if (problems === 0) {
      badge.textContent = '采集状态正常';
      badge.className = 'src-badge ok';
    } else {
      badge.textContent = `${problems} 天需注意`;
      badge.className = 'src-badge warn';
    }
    $('footer-gen').textContent = `数据生成于 ${state.meta.generated_at_local ?? '—'}`;
  }

  // ---------- ① 游戏累计 ----------
  /** 追踪期内每款游戏的近期时长（近 14 天），用于「在玩」标记 */
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

  function renderLifetime() {
    const box = $('lt-list');
    const lifetime = Object.values(state.meta.games_lifetime ?? {});
    if (!lifetime.length) {
      box.innerHTML = '<p class="empty">暂无游戏数据。首次快照采集完成后即会显示。</p>';
      return;
    }
    const recent = recentMinutesByApp(14);
    const q = state.ltSearch.trim().toLowerCase();
    let list = lifetime.filter((g) => !q || g.name.toLowerCase().includes(q));

    const key = state.ltSort;
    if (key === 'name') list.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));
    else if (key === 'last_played') list.sort((a, b) => (b.last_played ?? '').localeCompare(a.last_played ?? '') || b.lifetime_minutes - a.lifetime_minutes);
    else list.sort((a, b) => b.lifetime_minutes - a.lifetime_minutes);

    const max = Math.max(...lifetime.map((g) => g.lifetime_minutes), 1);
    const totalShown = list.reduce((a, g) => a + g.lifetime_minutes, 0);

    box.innerHTML = list
      .map((g, i) => {
        const icon = ICON(g.appid, g.img_icon_url);
        const pct = Math.max(g.lifetime_minutes > 0 ? 1.5 : 0, (g.lifetime_minutes / max) * 100);
        const playing = (recent.get(g.appid) ?? 0) > 0;
        return `<div class="rank-item${g.lifetime_minutes === 0 ? ' zero' : ''}">
          <span class="rank-no">${i + 1}</span>
          ${icon ? `<img class="rank-icon" src="${icon}" alt="" loading="lazy">` : '<span class="rank-icon"></span>'}
          <span class="rank-name" title="${escapeHtml(g.name)}">${escapeHtml(g.name)}${playing ? '<span class="tag playing">在玩</span>' : ''}</span>
          <span class="rank-bar"><span style="width:${pct}%"></span></span>
          <span class="rank-min">${hm(g.lifetime_minutes)}</span>
          <span class="rank-last">${g.last_played ?? '—'}</span>
        </div>`;
      })
      .join('');

    box.insertAdjacentHTML(
      'beforeend',
      `<p class="list-foot">共 ${list.length} 款游戏 · 合计 ${hm(totalShown)}${q ? '（已过滤）' : ''}</p>`,
    );
  }

  // ---------- ② 每日记录 ----------
  function clampDate(d) {
    const first = state.allDates[0];
    const today = ymd(new Date());
    let max = state.meta.last_snapshot_date ?? today;
    if (max > today) max = today;
    if (d < first) return first;
    if (d > max) return max;
    return d;
  }

  function renderDay() {
    const date = state.selectedDate;
    const body = $('day-body');
    $('day-date').value = date;
    const day = state.days.get(date);

    if (!day) {
      body.innerHTML = `<p class="empty">${date} 没有采集记录。每日数据从 ${state.allDates[0] ?? '—'} 开始。</p>`;
      return;
    }

    const gi = state.meta.games_lifetime ?? state.meta.games_index ?? {};
    const games = (day.games ?? []).slice().sort((a, b) => b.minutes - a.minutes);
    const flags = (day.flags ?? []).filter((f) => f !== 'first_snapshot');
    const summary = [`共 <b>${hm(day.total_minutes)}</b>`, `置信度 <b>${day.confidence}</b>`];
    if (day.span_days > 1) summary.push(`<span class="warn-text">覆盖 ${day.span_days} 天</span>`);
    if (flags.length) summary.push(`标记：${flags.join(', ')}`);
    if ((day.flags ?? []).includes('first_snapshot')) summary.push('首个基准快照日，无法计算当日差分');

    const max = Math.max(...games.map((g) => g.minutes), 1);
    const items = games
      .map((g) => {
        const pct = Math.max(3, Math.round((g.minutes / max) * 100));
        const icon = ICON(g.appid, gi[g.appid]?.img_icon_url);
        const tags = [
          g.is_new ? '<span class="tag new">新游戏</span>' : '',
          (day.flags ?? []).includes('multi_day') ? '<span class="tag multi">多日</span>' : '',
        ].join('');
        return `<li>
          ${icon ? `<img src="${icon}" alt="" loading="lazy">` : '<span class="icon-ph"></span>'}
          <span class="gname">${escapeHtml(g.name)}${tags}</span>
          <span class="gbar-wrap">
            <span class="gbar"><span style="width:${pct}%"></span></span>
            <span class="gmin">${hm(g.minutes)}</span>
          </span>
        </li>`;
      })
      .join('');

    body.innerHTML =
      `<p class="day-summary">${date} · ${summary.join(' · ')}</p>` +
      (items ? `<ul class="glist">${items}</ul>` : '<p class="empty">这一天没有游玩记录。</p>');
  }

  function shiftDay(n) {
    state.selectedDate = clampDate(addDaysStr(state.selectedDate, n));
    renderDay();
  }

  function availableYears() {
    const set = new Set(state.allDates.map((d) => d.slice(0, 4)));
    set.add(String(new Date().getFullYear()));
    return [...set].sort();
  }

  function renderCalendar() {
    const el = $('chart-calendar');
    if (!state.charts.calendar) state.charts.calendar = echarts.init(el);

    const years = availableYears();
    const sel = $('cal-year');
    if (sel.dataset.built !== '1') {
      sel.innerHTML = years.map((y) => `<option value="${y}">${y} 年</option>`).join('');
      sel.value = (state.selectedDate ?? String(new Date().getFullYear())).slice(0, 4);
      sel.dataset.built = '1';
      sel.addEventListener('change', renderCalendar);
    }
    const year = sel.value || String(new Date().getFullYear());

    const data = [];
    for (const [date, day] of state.days) {
      if (!date.startsWith(year)) continue;
      const item = { value: [date, day.total_minutes ?? 0] };
      if (day.confidence === 'low' || (day.flags ?? []).includes('first_snapshot')) {
        item.itemStyle = { opacity: 0.45 };
      }
      data.push(item);
    }

    const today = ymd(new Date());
    const range = today.startsWith(year) ? [today, today] : [`${year}-12-31`, `${year}-12-31`];

    state.charts.calendar.setOption(
      {
        backgroundColor: 'transparent',
        tooltip: {
          backgroundColor: '#0d1420',
          borderColor: '#263650',
          textStyle: { color: '#c7d5e0', fontSize: 12 },
          formatter: (p) => {
            const d = p.value[0];
            const day = state.days.get(d);
            if (!day) return `${d}<br/>未采集`;
            const parts = [`${d}<br/><b>${hm(day.total_minutes)}</b>`];
            if (day.total_minutes > 0 && (day.games ?? []).length) {
              parts.push((day.games || []).slice(0, 5).map((g) => `${escapeHtml(g.name)}：${hm(g.minutes)}`).join('<br/>'));
            }
            if (day.span_days > 1) parts.push(`<span style="color:#e8b13a">覆盖 ${day.span_days} 天</span>`);
            if (day.confidence === 'low') parts.push('<span style="color:#e8b13a">低置信度</span>');
            return parts.join('<br/>');
          },
        },
        visualMap: {
          type: 'piecewise',
          orient: 'horizontal',
          left: 'center',
          top: 0,
          show: false,
          pieces: [
            { min: 360, color: '#f08c3c' },
            { min: 180, max: 359, color: '#d99a5b' },
            { min: 90, max: 179, color: '#4ba3e3' },
            { min: 30, max: 89, color: '#2073ab' },
            { min: 1, max: 29, color: '#17456e' },
            { value: 0, color: '#101a26' },
          ],
        },
        calendar: {
          top: 30,
          left: 40,
          right: 20,
          range,
          cellSize: ['auto', 16],
          itemStyle: { color: '#1a2634', borderWidth: 3, borderColor: '#0d1420' },
          splitLine: { show: false },
          yearLabel: { show: false },
          monthLabel: { color: '#8fa5ba', fontSize: 11 },
          dayLabel: { color: '#5c7089', fontSize: 10, firstDay: 1 },
        },
        series: [
          {
            type: 'heatmap',
            coordinateSystem: 'calendar',
            calendarIndex: 0,
            data,
            itemStyle: { borderRadius: 3 },
          },
        ],
      },
      true,
    );

    state.charts.calendar.off('click');
    state.charts.calendar.on('click', (p) => {
      if (p.value && p.value[0]) {
        state.selectedDate = clampDate(p.value[0]);
        renderDay();
      }
    });
  }

  // ---------- ③ 趋势 ----------
  function renderTrend() {
    const el = $('chart-trend');
    if (!state.charts.trend) state.charts.trend = echarts.init(el);
    if (!state.allDates.length) return;

    const today = ymd(new Date());
    const lastDate = state.allDates[state.allDates.length - 1];
    const end = today < lastDate ? today : lastDate;
    let start;
    if (state.trendRange === 'all') start = state.allDates[0];
    else start = addDaysStr(end, -(state.trendRange - 1));
    if (start < state.allDates[0]) start = state.allDates[0];

    const dates = eachDate(start, end);
    const totals = dates.map((d) => state.days.get(d)?.total_minutes ?? 0);

    const ma7 = totals.map((_, i) => {
      const seg = totals.slice(Math.max(0, i - 6), i + 1);
      return Math.round(seg.reduce((a, b) => a + b, 0) / seg.length);
    });

    const series = [];
    const base = {
      backgroundColor: 'transparent',
      grid: { left: 55, right: 20, top: 34, bottom: 40 },
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#0d1420',
        borderColor: '#263650',
        textStyle: { color: '#c7d5e0', fontSize: 12 },
        formatter: (ps) => {
          const date = ps[0].axisValue;
          const day = state.days.get(date);
          let s = `${date}`;
          let sum = 0;
          for (const p of ps) {
            if (p.seriesType === 'line') continue;
            s += `<br/>${p.marker}${escapeHtml(p.seriesName)}：${hm(p.value ?? 0)}`;
            sum += Number(p.value) || 0;
          }
          const ma = ps.find((p) => p.seriesType === 'line');
          if (ma) s += `<br/>${ma.marker}7 日均：${hm(ma.value ?? 0)}`;
          if (day && day.span_days > 1) s += `<br/><span style="color:#e8b13a">覆盖 ${day.span_days} 天</span>`;
          return s;
        },
      },
      legend: {
        top: 0,
        textStyle: { color: '#8fa5ba', fontSize: 11 },
        inactiveColor: '#3a4a5a',
      },
      xAxis: {
        type: 'category',
        data: dates,
        axisLabel: { color: '#8fa5ba', fontSize: 11 },
        axisLine: { lineStyle: { color: '#263650' } },
      },
      yAxis: {
        type: 'value',
        name: 'min',
        nameTextStyle: { color: '#8fa5ba', fontSize: 11 },
        axisLabel: { color: '#8fa5ba', fontSize: 11 },
        splitLine: { lineStyle: { color: '#1a2634' } },
      },
    };

    if (state.stacked) {
      const counter = new Map();
      for (const d of dates) {
        for (const g of state.days.get(d)?.games ?? []) {
          counter.set(g.appid, (counter.get(g.appid) ?? 0) + g.minutes);
        }
      }
      const top = [...counter.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map((e) => e[0]);
      const palette = ['#4ba3e3', '#f08c3c', '#7fd1a8', '#d99a5b', '#66c0f4', '#c96f5e', '#2073ab', '#9db8d4'];
      const names = {};
      for (const g of Object.values(state.meta.games_lifetime ?? state.meta.games_index ?? {})) {
        names[g.appid] = g.name;
      }
      top.forEach((appid, i) => {
        series.push({
          name: names[appid] ?? `App ${appid}`,
          type: 'bar',
          stack: 'total',
          emphasis: { focus: 'series' },
          itemStyle: { color: palette[i % palette.length] },
          data: dates.map((d) => (state.days.get(d)?.games ?? []).find((g) => g.appid === appid)?.minutes ?? 0),
        });
      });
      series.push({
        name: '7 日均',
        type: 'line',
        smooth: true,
        symbol: 'none',
        lineStyle: { width: 2, color: '#e6eef5', opacity: 0.85 },
        data: ma7,
      });
    } else {
      series.push({
        name: '每日时长',
        type: 'bar',
        itemStyle: {
          color: (p) => {
            const v = p.value ?? 0;
            if (v >= 360) return '#f08c3c';
            if (v >= 180) return '#d99a5b';
            if (v >= 90) return '#4ba3e3';
            if (v >= 30) return '#2073ab';
            if (v > 0) return '#17456e';
            return '#101a26';
          },
          borderRadius: [2, 2, 0, 0],
        },
        data: totals,
      });
      series.push({
        name: '7 日均',
        type: 'line',
        smooth: true,
        symbol: 'none',
        lineStyle: { width: 2, color: '#66c0f4' },
        data: ma7,
      });
    }

    state.charts.trend.setOption({ ...base, series }, true);
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
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === v));
    document.querySelectorAll('.view').forEach((s) => s.classList.toggle('active', s.id === `view-${v}`));
    if (v === 'daily') requestAnimationFrame(() => state.charts.calendar?.resize());
    if (v === 'trend') requestAnimationFrame(() => state.charts.trend?.resize());
  }

  function bind() {
    document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => switchView(t.dataset.view)));

    $('lt-search').addEventListener('input', (e) => {
      state.ltSearch = e.target.value;
      renderLifetime();
    });
    $('lt-sort').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      [...$('lt-sort').children].forEach((x) => x.classList.toggle('active', x === b));
      state.ltSort = b.dataset.k;
      renderLifetime();
    });

    $('day-prev').addEventListener('click', () => shiftDay(-1));
    $('day-next').addEventListener('click', () => shiftDay(1));
    $('day-latest').addEventListener('click', () => {
      state.selectedDate = clampDate(state.meta.last_snapshot_date ?? ymd(new Date()));
      renderDay();
    });
    $('day-date').addEventListener('change', (e) => {
      if (e.target.value) {
        state.selectedDate = clampDate(e.target.value);
        renderDay();
      }
    });

    $('trend-range').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      [...$('trend-range').children].forEach((x) => x.classList.toggle('active', x === b));
      state.trendRange = b.dataset.r === 'all' ? 'all' : Number(b.dataset.r);
      renderTrend();
    });
    $('trend-stack').addEventListener('change', (e) => {
      state.stacked = e.target.checked;
      renderTrend();
    });

    $('btn-csv-daily').addEventListener('click', () => download('steam-daily.csv', csvDaily()));
    $('btn-csv-lifetime').addEventListener('click', () => download('steam-games-lifetime.csv', csvLifetime()));
    window.addEventListener('resize', () => {
      Object.values(state.charts).forEach((c) => c?.resize());
    });
  }

  (async function init() {
    bind();
    if (!(await load())) return;
    renderCards();

    const lastSnapshot = state.meta.last_snapshot_date ?? state.allDates[state.allDates.length - 1] ?? ymd(new Date());
    state.selectedDate = lastSnapshot;

    renderLifetime();
    renderDay();
    renderCalendar();
    renderTrend();
    renderHealth();
    switchView('lifetime');
  })();
})();
