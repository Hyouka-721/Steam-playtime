/* Steam 每日游戏时长 —— 零构建前端，仅依赖 ECharts CDN */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const ICON = (appid, hash) =>
    hash ? `https://media.steampowered.com/steamcommunity/public/images/apps/${appid}/${hash}.jpg` : null;

  const state = {
    meta: null,
    days: new Map(), // 'YYYY-MM-DD' -> day
    allDates: [],
    view: 'calendar',
    trendRange: 30,
    stacked: false,
    rankSort: 'total',
    charts: {},
  };

  // ---------- utils ----------
  function hm(m) {
    const n = Math.round(Number(m) || 0);
    if (n <= 0) return '0 分钟';
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

  // ---------- ① 概览卡片 ----------
  /** 最近 N 天（含最后采集日）的总时长 */
  function lastNDaysTotal(n) {
    if (!state.allDates.length) return { minutes: 0, start: null, end: null };
    const end = state.allDates[state.allDates.length - 1];
    const start = addDaysStr(end, -(n - 1));
    let minutes = 0;
    for (const d of eachDate(start, end)) minutes += state.days.get(d)?.total_minutes ?? 0;
    return { minutes, start, end };
  }

  /** 最近 N 天里时长最长的游戏 */
  function topGameInLastDays(n) {
    if (!state.allDates.length) return null;
    const end = state.allDates[state.allDates.length - 1];
    const start = addDaysStr(end, -(n - 1));
    const counter = new Map();
    for (const d of eachDate(start, end)) {
      for (const g of state.days.get(d)?.games ?? []) {
        counter.set(g.appid, (counter.get(g.appid) ?? 0) + g.minutes);
      }
    }
    let best = null;
    for (const [appid, minutes] of counter) {
      if (!best || minutes > best.minutes) {
        best = { appid, name: state.meta.games_index?.[appid]?.name ?? `App ${appid}`, minutes };
      }
    }
    return best;
  }

  function renderCards() {
    const s = state.meta.stats ?? {};
    const lastDate = state.allDates[state.allDates.length - 1];
    $('c-total').textContent = `${s.total_hours ?? 0} 小时`;
    $('c-total-sub').textContent = `截至 ${lastDate ?? '—'} · ${s.total_minutes ?? 0} 分钟`;

    $('c-games').textContent = s.played_games ?? 0;
    $('c-games-sub').textContent = `有游玩记录的游戏`;

    const hot = topGameInLastDays(14);
    if (hot && hot.minutes > 0) {
      $('c-streak').textContent = hot.name;
      $('c-streak-sub').textContent = `近 14 天 ${hm(hot.minutes)}`;
    } else {
      $('c-streak').textContent = '—';
      $('c-streak-sub').textContent = '近 14 天暂无游玩记录';
    }

    const w7 = lastNDaysTotal(7);
    $('c-week').textContent = hm(w7.minutes);
    $('c-week-sub').textContent = w7.start ? `${w7.start} → ${w7.end}` : '暂无数据';

    if (s.best_day) {
      $('c-best').textContent = hm(s.best_day.minutes);
      $('c-best-sub').textContent = s.best_day.date;
    } else {
      $('c-best').textContent = '—';
      $('c-best-sub').textContent = '暂无数据';
    }

    const since = state.meta.tracking_since;
    $('subtitle').textContent = since
      ? `自 ${since} 起累计 ${s.tracked_days ?? 0} 天` + (s.tracked_days <= 1 ? ' · 首日仅作为基准，次日开始产出时长' : '')
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

  // ---------- ② 当日游戏时长柱状图 ----------
  function renderTodayChart() {
    const el = $('chart-today');
    const hint = $('today-hint');
    if (!state.charts.today) state.charts.today = echarts.init(el);

    const lastDate = state.allDates[state.allDates.length - 1];
    if (!lastDate) {
      hint.textContent = '暂无数据';
      return;
    }
    const day = state.days.get(lastDate) ?? { games: [], total_minutes: 0 };
    const games = (day.games ?? []).filter((g) => g.minutes > 0).slice(0, 12);
    hint.textContent = `${lastDate} · 共 ${hm(day.total_minutes)}`;

    if (!games.length) {
      state.charts.today.setOption(
        {
          backgroundColor: 'transparent',
          title: {
            text: '最近一个采集日没有游玩记录',
            left: 'center',
            top: 'middle',
            textStyle: { color: '#7e93a8', fontSize: 14, fontWeight: 400 },
          },
          xAxis: { show: false, type: 'category', data: [] },
          yAxis: { show: false },
          series: [],
        },
        true,
      );
      return;
    }

    const gi = state.meta.games_index ?? {};
    const rich = {};
    games.forEach((g, i) => {
      const url = ICON(g.appid, gi[g.appid]?.img_icon_url);
      rich[`g${i}`] = url
        ? { backgroundColor: { image: url }, width: 30, height: 30, borderRadius: 4 }
        : { backgroundColor: '#22303f', width: 30, height: 30, borderRadius: 4 };
    });
    const short = (n) => (String(n).length > 10 ? String(n).slice(0, 9) + '…' : String(n));

    state.charts.today.setOption(
      {
        backgroundColor: 'transparent',
        grid: { left: 60, right: 20, top: 60, bottom: 60 },
        tooltip: {
          backgroundColor: '#0f1620',
          borderColor: '#263340',
          textStyle: { color: '#c7d5e0', fontSize: 12 },
          formatter: (p) => {
            const g = games[p.dataIndex];
            return `${escapeHtml(g.name)}<br/><b>${hm(g.minutes)}</b>${g.is_new ? '<br/><span style="color:#66c0f4">新游戏</span>' : ''}`;
          },
        },
        xAxis: {
          type: 'category',
          data: games.map((g) => short(g.name)),
          axisLabel: { color: '#7e93a8', fontSize: 11, interval: 0, rotate: games.length > 6 ? 18 : 0 },
          axisLine: { lineStyle: { color: '#263340' } },
          axisTick: { show: false },
        },
        yAxis: {
          type: 'value',
          name: '分钟',
          nameTextStyle: { color: '#7e93a8', fontSize: 11 },
          axisLabel: { color: '#7e93a8', fontSize: 11 },
          splitLine: { lineStyle: { color: '#1e2b39' } },
        },
        series: [
          {
            type: 'bar',
            barMaxWidth: 46,
            data: games.map((g) => g.minutes),
            itemStyle: {
              borderRadius: [4, 4, 0, 0],
              color: (p) => {
                const v = p.value ?? 0;
                if (v >= 360) return '#e8763a';
                if (v >= 180) return '#d99a5b';
                if (v >= 90) return '#5fa8d3';
                if (v >= 30) return '#2e7cb8';
                return '#1f4e79';
              },
            },
            label: {
              show: true,
              position: 'top',
              distance: 8,
              formatter: (p) => `{g${p.dataIndex}|}`,
              rich,
            },
          },
        ],
      },
      true,
    );
  }

  // ---------- ③ 日历热力图 ----------
  function availableYears() {
    const set = new Set(state.allDates.map((d) => d.slice(0, 4)));
    const todayYear = String(new Date().getFullYear());
    set.add(todayYear);
    return [...set].sort();
  }

  function renderCalendar() {
    const el = $('chart-calendar');
    if (!state.charts.calendar) state.charts.calendar = echarts.init(el);

    // 年份下拉
    const years = availableYears();
    const sel = $('cal-year');
    if (sel.dataset.built !== '1') {
      sel.innerHTML = years.map((y) => `<option value="${y}">${y} 年</option>`).join('');
      sel.value = years[years.length - 1];
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

    // 保证至少有今天，避免整图空白
    const today = ymd(new Date());
    const range = today.startsWith(year) ? [today, today] : [`${year}-12-31`, `${year}-12-31`];

    state.charts.calendar.setOption(
      {
        backgroundColor: 'transparent',
        tooltip: {
          backgroundColor: '#0f1620',
          borderColor: '#263340',
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
            { min: 360, color: '#e8763a' },
            { min: 180, max: 359, color: '#d99a5b' },
            { min: 90, max: 179, color: '#5fa8d3' },
            { min: 30, max: 89, color: '#2e7cb8' },
            { min: 1, max: 29, color: '#1f4e79' },
            { value: 0, color: '#16202d' },
          ],
        },
        calendar: {
          top: 30,
          left: 40,
          right: 20,
          range,
          cellSize: ['auto', 15],
          itemStyle: { color: '#22303f', borderWidth: 2, borderColor: '#0f1620' },
          splitLine: { lineStyle: { color: '#2b3d52', width: 1 } },
          yearLabel: { show: false },
          monthLabel: { color: '#7e93a8', fontSize: 11 },
          dayLabel: { color: '#7e93a8', fontSize: 10, firstDay: 1 },
        },
        series: [
          {
            type: 'heatmap',
            coordinateSystem: 'calendar',
            calendarIndex: 0,
            data,
            itemStyle: { borderRadius: 2 },
          },
        ],
      },
      true,
    );

    state.charts.calendar.off('click');
    state.charts.calendar.on('click', (p) => {
      if (p.value && p.value[0]) showDay(p.value[0]);
    });
  }

  function showDay(date) {
    const day = state.days.get(date);
    const box = $('day-detail');
    $('day-detail-close').hidden = false;
    if (!day) {
      $('day-detail-title').textContent = `${date} · 未采集`;
      box.innerHTML = '<p class="empty">这一天没有采集记录。</p>';
      return;
    }
    $('day-detail-title').textContent = `${date} · ${hm(day.total_minutes)}`;
    const flags = (day.flags ?? []).filter((f) => f !== 'first_snapshot');
    const summary = [];
    summary.push(`共 <b>${hm(day.total_minutes)}</b>`);
    summary.push(`置信度 <b>${day.confidence}</b>`);
    summary.push(`来源 <b>${day.source}</b>`);
    if (day.span_days > 1) summary.push(`<span style="color:#e8b13a">覆盖 ${day.span_days} 天</span>`);
    if (flags.length) summary.push(`标记：${flags.join(', ')}`);
    if ((day.flags ?? []).includes('first_snapshot')) summary.push('这是第一份基准快照，无法计算当日时长');

    const items = (day.games ?? [])
      .map((g) => {
        const max = Math.max(...(day.games ?? []).map((x) => x.minutes), 1);
        const pct = Math.max(3, Math.round((g.minutes / max) * 100));
        const tags = [
          g.is_new ? '<span class="tag new">新游戏</span>' : '',
          (day.flags ?? []).includes('multi_day') ? '<span class="tag multi">多日</span>' : '',
        ].join('');
        const icon = ICON(g.appid, (state.meta.games_index || {})[g.appid]?.img_icon_url);
        return `<li>
          ${icon ? `<img src="${icon}" alt="" loading="lazy">` : '<span style="width:34px"></span>'}
          <span class="gname">${escapeHtml(g.name)}${tags}</span>
          <span class="gbar-wrap">
            <span class="gbar"><span style="width:${pct}%"></span></span>
            <span class="gmin">${hm(g.minutes)}</span>
          </span>
        </li>`;
      })
      .join('');

    box.innerHTML =
      `<p class="day-summary">${summary.join(' · ')}</p>` +
      (items ? `<ul class="glist">${items}</ul>` : '<p class="empty">这一天没有游玩记录。</p>');
    $('day-detail-panel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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

    // 7 日移动平均
    const ma7 = totals.map((_, i) => {
      const seg = totals.slice(Math.max(0, i - 6), i + 1);
      return Math.round(seg.reduce((a, b) => a + b, 0) / seg.length);
    });

    const series = [];
    const yAxisLabel = { color: '#7e93a8', fontSize: 11 };
    const base = {
      backgroundColor: 'transparent',
      grid: { left: 55, right: 20, top: 30, bottom: 40 },
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#0f1620',
        borderColor: '#263340',
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
        textStyle: { color: '#7e93a8', fontSize: 11 },
        inactiveColor: '#3a4a5a',
      },
      xAxis: {
        type: 'category',
        data: dates,
        axisLabel: { color: '#7e93a8', fontSize: 11 },
        axisLine: { lineStyle: { color: '#263340' } },
      },
      yAxis: {
        type: 'value',
        name: '分钟',
        nameTextStyle: { color: '#7e93a8', fontSize: 11 },
        axisLabel: yAxisLabel,
        splitLine: { lineStyle: { color: '#1e2b39' } },
      },
    };

    if (state.stacked) {
      // 取范围内 Top 8 游戏，其余归入「其他」
      const counter = new Map();
      for (const d of dates) {
        for (const g of state.days.get(d)?.games ?? []) {
          counter.set(g.appid, (counter.get(g.appid) ?? 0) + g.minutes);
        }
      }
      const top = [...counter.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map((e) => e[0]);
      const palette = ['#2e7cb8', '#e8763a', '#5fa8d3', '#d99a5b', '#66c0f4', '#a8614a', '#1f4e79', '#8fb8d4'];
      const idx = Object.fromEntries(state.meta.games_index ? Object.entries(state.meta.games_index) : []);
      top.forEach((appid, i) => {
        series.push({
          name: idx[appid]?.name ?? `App ${appid}`,
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
            if (v >= 360) return '#e8763a';
            if (v >= 180) return '#d99a5b';
            if (v >= 90) return '#5fa8d3';
            if (v >= 30) return '#2e7cb8';
            if (v > 0) return '#1f4e79';
            return '#16202d';
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

  // ---------- ④ 排行 ----------
  /** 从每日数据聚合：全部游戏时长 + 近 14 天时长 */
  function buildGameStats(windowDays) {
    const gi = state.meta.games_index ?? {};
    const map = new Map();
    const end = state.allDates[state.allDates.length - 1];
    const winStart = end ? addDaysStr(end, -(windowDays - 1)) : null;
    for (const d of state.allDates) {
      for (const g of state.days.get(d)?.games ?? []) {
        const e =
          map.get(g.appid) ??
          map.set(g.appid, {
            appid: g.appid,
            name: gi[g.appid]?.name ?? g.name ?? `App ${g.appid}`,
            icon: gi[g.appid]?.img_icon_url ?? null,
            total: 0,
            recent: 0,
            first_day: null,
            last_day: null,
          }).get(g.appid);
        e.total += g.minutes;
        if (winStart && d >= winStart) e.recent += g.minutes;
        if (!e.first_day || d < e.first_day) e.first_day = d;
        if (!e.last_day || d > e.last_day) e.last_day = d;
      }
    }
    return [...map.values()].filter((g) => g.total > 0);
  }

  function renderRank() {
    const box = $('rank-list');
    const key = state.rankSort === 'last14' ? 'recent' : 'total';
    const list = buildGameStats(14).sort((a, b) => b[key] - a[key] || b.total - a.total);

    $('rank-hint').textContent = list.length ? `共 ${list.length} 款游戏` : '—';
    if (!list.length) {
      box.innerHTML = '<p class="empty">还没有游戏时长数据。第二次采集后，这里会开始填充。</p>';
      return;
    }
    const max = list[0][key] || 1;
    box.innerHTML = list
      .map((g, i) => {
        const icon = ICON(g.appid, g.icon);
        const pct = Math.max(2, Math.round((g[key] / max) * 100));
        const recentCls = g.recent > 0 ? 'recent-on' : 'recent-off';
        return `<div class="rank-item">
          <span class="rank-no">${i + 1}</span>
          ${icon ? `<img class="rank-icon" src="${icon}" alt="" loading="lazy">` : '<span class="rank-icon"></span>'}
          <span class="rank-name" title="${escapeHtml(g.name)}">${escapeHtml(g.name)}</span>
          <span class="rank-bar"><span style="width:${pct}%"></span></span>
          <span class="rank-meta">
            <span class="t">累计 ${hm(g.total)}</span>
            <span class="d ${recentCls}">近 14 天 ${g.recent > 0 ? hm(g.recent) : '未游玩'}</span>
          </span>
          <span class="rank-range">${g.first_day ?? '—'} → ${g.last_day ?? '—'}</span>
        </div>`;
      })
      .join('');
  }

  // ---------- ⑤ 数据页 ----------
  function renderHealth() {
    const h = state.meta.health ?? {};
    const s = state.meta.stats ?? {};
    const items = [
      ['最近快照', state.meta.last_snapshot_date ?? '—', ''],
      ['累计采集天数', s.tracked_days ?? 0, ''],
      ['漏采合并天数', h.gap_days ?? 0, (h.gap_days ?? 0) > 0 ? 'warn' : 'ok'],
      ['低置信度天数', h.low_confidence_days ?? 0, (h.low_confidence_days ?? 0) > 0 ? 'warn' : 'ok'],
      ['手动补录天数', h.manual_days ?? 0, ''],
      ['家庭共享游戏', h.shared_game_count ?? 0, ''],
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

  function csvGames() {
    const rows = [['appid', 'name', 'total_minutes', 'first_day', 'last_day']];
    for (const g of Object.values(state.meta.games_index ?? {}).sort((a, b) => b.total_minutes - a.total_minutes)) {
      rows.push([g.appid, g.name, g.total_minutes, g.first_day, g.last_day]);
    }
    return rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  }

  // ---------- tabs / init ----------
  function switchView(v) {
    state.view = v;
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === v));
    document.querySelectorAll('.view').forEach((s) => s.classList.toggle('active', s.id === `view-${v}`));
    if (v === 'calendar') requestAnimationFrame(() => { state.charts.today?.resize(); state.charts.calendar?.resize(); });
    if (v === 'trend') requestAnimationFrame(() => state.charts.trend?.resize());
  }

  function bind() {
    document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => switchView(t.dataset.view)));
    $('trend-range').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      [...$('trend-range').children].forEach((x) => x.classList.toggle('active', x === b));
      state.trendRange = b.dataset.r === 'all' ? 'all' : Number(b.dataset.r);
      renderTrend();
    });
    $('rank-sort').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      [...$('rank-sort').children].forEach((x) => x.classList.toggle('active', x === b));
      state.rankSort = b.dataset.k;
      renderRank();
    });
    $('trend-stack').addEventListener('change', (e) => {
      state.stacked = e.target.checked;
      renderTrend();
    });
    $('day-detail-close').addEventListener('click', () => {
      $('day-detail').innerHTML = '<p class="empty">在上方日历中选择一天</p>';
      $('day-detail-title').textContent = '当日明细';
      $('day-detail-close').hidden = true;
    });
    $('btn-csv-daily').addEventListener('click', () => download('steam-daily.csv', csvDaily()));
    $('btn-csv-games').addEventListener('click', () => download('steam-games.csv', csvGames()));
    window.addEventListener('resize', () => {
      Object.values(state.charts).forEach((c) => c?.resize());
    });
  }

  (async function init() {
    bind();
    if (!(await load())) return;
    renderCards();
    renderTodayChart();
    renderCalendar();
    renderTrend();
    renderRank();
    renderHealth();
    switchView('calendar');
  })();
})();
