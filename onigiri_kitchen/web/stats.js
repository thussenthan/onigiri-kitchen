/* Onigiri Kitchen - 統計 Stats window. Draws window.OKS (built by main.py
   stats_payload). Python sends the raw log (sessions, breaks, reviews per day,
   per-range review summaries); every number and chart here is worked out for
   the chosen time range. */
(function () {
  'use strict';

  const D = window.OKS || {};
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const num = (n) => (n == null || Number.isNaN(n) ? '–' : Number(n).toLocaleString());
  const pct = (n) => (n == null || Number.isNaN(n) ? '–' : `${n}%`);
  const round1 = (n) => Math.round(n * 10) / 10;
  const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const WD_JP = ['月', '火', '水', '木', '金', '土', '日'];
  const RANGES = [['7', '7 days'], ['30', '30 days'], ['365', '1 year'], ['all', 'All time']];

  // ------------------------------------------------------------- dates
  const TODAY = D.today || new Date().toISOString().slice(0, 10);
  const toDate = (s) => new Date(s + 'T12:00:00');
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const addDays = (s, n) => { const d = toDate(s); d.setDate(d.getDate() + n); return iso(d); };
  const between = (a, b) => Math.round((toDate(b) - toDate(a)) / 86400000);
  function fmtDay(s, style) {
    if (!s) return '–';
    const o = style === 'year' ? { year: 'numeric', month: 'short', day: 'numeric' }
      : style === 'month' ? { year: 'numeric', month: 'short' }
        : style === 'short' ? { month: 'short', day: 'numeric' }
          : { weekday: 'short', month: 'short', day: 'numeric' };
    return toDate(s).toLocaleDateString(undefined, o);
  }
  // 95 → "1 h 35 m", 25 → "25 m"
  function dur(minutes) {
    if (minutes == null || Number.isNaN(minutes)) return '–';
    const m = Math.round(minutes);
    if (m < 60) return `${m} m`;
    const h = Math.floor(m / 60);
    return m % 60 ? `${num(h)} h ${m % 60} m` : `${num(h)} h`;
  }
  const hm = (v) => (v >= 60 ? `${round1(v / 60)}h` : `${Math.round(v)}m`);
  const kfmt = (v) => (v >= 10000 ? `${Math.round(v / 1000)}k` : v >= 1000 ? `${round1(v / 1000)}k` : `${Math.round(v)}`);
  const hourLabel = (h) => (h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`);
  const hourName = (h) => hourLabel(h).replace('a', ' am').replace('p', ' pm');

  // the chosen range (remembered between visits)
  let range = '30';
  try {
    const saved = new URLSearchParams(location.search).get('range') || localStorage.getItem('oksRange');
    if (saved && RANGES.some((r) => r[0] === saved)) range = saved;
  } catch (e) {}
  function rangeStart(firstEver) {
    if (range === 'all') return firstEver && firstEver < TODAY ? firstEver : TODAY;
    return addDays(TODAY, -(parseInt(range, 10) - 1));
  }
  const rangeName = () => ({ 7: 'the last 7 days', 30: 'the last 30 days', 365: 'the last year', all: 'all time' }[range]);

  // a time series: by day up to a month, by week up to a year, else by month
  function buckets(start) {
    const span = between(start, TODAY) + 1;
    const unit = span <= 31 ? 'day' : span <= 380 ? 'week' : 'month';
    const list = [];
    let cur = start;
    if (unit === 'week') cur = addDays(start, -((toDate(start).getDay() + 6) % 7)); // back to Monday
    if (unit === 'month') cur = `${start.slice(0, 7)}-01`;
    while (cur <= TODAY) {
      let next;
      if (unit === 'day') next = addDays(cur, 1);
      else if (unit === 'week') next = addDays(cur, 7);
      else { const d = toDate(cur); d.setMonth(d.getMonth() + 1, 1); next = iso(d); }
      list.push({ from: cur, to: addDays(next, -1), label: unit === 'month' ? fmtDay(cur, 'month') : fmtDay(cur, 'short'), value: 0, extra: 0 });
      cur = next;
    }
    return { unit, list };
  }
  function fill(b, date, v, extra) {
    for (const x of b.list) if (date >= x.from && date <= x.to) { x.value += v; x.extra += extra || 0; return; }
  }
  const unitWord = (u) => ({ day: 'per day', week: 'per week', month: 'per month' }[u]);
  const bucketTitle = (x) => (x.from === x.to ? fmtDay(x.from) : `${fmtDay(x.from, 'short')} – ${fmtDay(x.to > TODAY ? TODAY : x.to, 'year')}`);

  // current and best runs of consecutive days (the current one survives until today ends)
  function streaks(dates) {
    const days = Array.from(new Set(dates)).sort();
    let best = 0;
    let run = 0;
    let prev = null;
    for (const d of days) { run = prev && between(prev, d) === 1 ? run + 1 : 1; best = Math.max(best, run); prev = d; }
    const current = days.length && between(days[days.length - 1], TODAY) <= 1 ? run : 0;
    return { current, best };
  }

  // -------------------------------------------------------------- pieces
  function tile(label, value, note, tip, cls) {
    return `<div class="oks-tile ${cls || ''}"${tip ? ` data-tip="${esc(tip)}"` : ''}><small>${label}</small><b>${value}</b>${note ? `<em>${note}</em>` : ''}</div>`;
  }
  const hero = (label, value, note, tip) => tile(label, value, note, tip, 'oks-hero-tile');
  function card(title, sub, body, cls) {
    return `<div class="oks-chart ${cls || ''}"><h4>${title}${sub ? `<span>${sub}</span>` : ''}</h4>${body}</div>`;
  }
  function niceMax(v) {
    if (v <= 0) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    const f = v / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; // halves stay round: 0.5, 1, 2.5, 5
  }
  function scaleMax(values, minutes) {
    const top = Math.max(0, ...values);
    return minutes && top > 60 ? niceMax(top / 60) * 60 : niceMax(top);
  }
  function gridlines(max, fmt) {
    return [0, 0.5, 1].map((f) => `<div class="oks-gridline" style="bottom:${f * 100}%"><i>${fmt(max * f)}</i></div>`).join('');
  }
  // labels under a chart, at most about six of them, always including the last
  function axis(items, every) {
    const last = items.length - 1;
    return `<div class="oks-axis">${items.map((it, i) => `<i>${(last - i) % every === 0 ? esc(it.label) : ''}</i>`).join('')}</div>`;
  }
  const labelEvery = (n) => (n <= 8 ? 1 : n <= 16 ? 2 : n <= 31 ? 7 : Math.ceil(n / 6));

  // thin columns from one baseline, a hairline grid, a tooltip per column
  function columns(items, fmt, opts) {
    opts = opts || {};
    const max = scaleMax(items.map((i) => i.value), opts.minutes);
    const bars = items.map((it) => `<div class="oks-bar${it.value ? '' : ' zero'}" data-tip="${esc(it.tip)}"><span style="height:${(it.value / max) * 100}%"></span></div>`).join('');
    return `<div class="oks-cols">${gridlines(max, fmt)}<div class="oks-bars">${bars}</div></div>${axis(items, opts.every || labelEvery(items.length))}`;
  }

  // an area chart: a 2px line over a light wash, with a hover crosshair and dot per
  // point. A null value is a gap (nothing to measure that day), not a zero.
  function area(items, fmt, opts) {
    opts = opts || {};
    const n = items.length;
    const max = scaleMax(items.map((i) => i.value || 0), opts.minutes);
    const W = 1000;
    const H = 100;
    const x = (i) => (n === 1 ? W / 2 : (i / (n - 1)) * W);
    const y = (v) => H - (v / max) * H;
    // runs of points with data; each gets its own line and wash
    const runs = [];
    let run = [];
    items.forEach((it, i) => {
      if (it.value == null) { if (run.length) runs.push(run); run = []; } else run.push(i);
    });
    if (run.length) runs.push(run);
    let paths = '';
    for (const r of runs) {
      const pts = r.map((i) => `${x(i).toFixed(1)},${y(items[i].value).toFixed(1)}`);
      if (r.length === 1) pts.push(pts[0]);
      paths += `<path class="oks-wash" d="M${x(r[0])},${H} L${pts.join(' L')} L${x(r[r.length - 1])},${H} Z"/>` +
        `<path class="oks-line" d="M${pts.join(' L')}" vector-effect="non-scaling-stroke"/>`;
    }
    const solo = new Set(runs.filter((r) => r.length === 1).map((r) => r[0])); // a lone day: show its dot
    const hits = items.map((it, i) => `<div class="oks-hit${solo.has(i) ? ' solo' : ''}" style="left:${n === 1 ? 50 : (i / (n - 1)) * 100}%;width:${100 / Math.max(1, n - 1)}%" data-tip="${esc(it.tip)}">${it.value == null ? '' : `<i style="bottom:${(it.value / max) * 100}%"></i>`}</div>`).join('');
    return `<div class="oks-cols oks-area">${gridlines(max, fmt)}` +
      `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">${paths}</svg>` +
      `<div class="oks-hits">${hits}</div></div>${axis(items, opts.every || labelEvery(n))}`;
  }

  // a 100% stacked bar in fixed categorical order, with a legend naming every part
  function stack(parts) {
    const total = parts.reduce((a, p) => a + p.value, 0);
    if (!total) return '<div class="oks-empty">Nothing yet in this range.</div>';
    const share = (v) => `${round1((v / total) * 100)}%`;
    const segs = parts.filter((p) => p.value).map((p) => `<i class="s${p.slot}" style="flex-grow:${p.value}" data-tip="${esc(`<b>${p.label}</b>\n${num(p.value)} · ${share(p.value)}${p.note ? '\n' + p.note : ''}`)}"></i>`).join('');
    const legend = parts.map((p) => `<span${p.note ? ` data-tip="${esc(p.note)}"` : ''}><i class="s${p.slot}"></i>${p.label} <b>${num(p.value)}</b> <em>${share(p.value)}</em></span>`).join('');
    return `<div class="oks-stack">${segs}</div><div class="oks-key">${legend}</div>`;
  }

  // weekday × hour grid, one hue light to dark
  const heatKey = () => `<div class="oks-legend">Less ${[0, 1, 2, 3, 4].map((l) => `<i class="oks-c" data-l="${l}"></i>`).join('')} More</div>`;
  function punchcard(grid, unit) {
    const max = Math.max(1, ...grid);
    const lvl = (v) => (!v ? 0 : v <= max * 0.2 ? 1 : v <= max * 0.45 ? 2 : v <= max * 0.7 ? 3 : 4);
    let cells = '<div class="oks-punch"><i></i>';
    for (let h = 0; h < 24; h++) cells += `<b class="oks-punch-h">${h % 3 === 0 ? hourLabel(h) : ''}</b>`;
    for (let d = 0; d < 7; d++) {
      cells += `<b class="oks-punch-d">${WD[d]}</b>`;
      for (let h = 0; h < 24; h++) {
        const v = grid[d * 24 + h] || 0;
        cells += `<i class="oks-c" data-l="${lvl(v)}" data-tip="${esc(`<b>${WD_JP[d]} ${WD[d]}, ${hourName(h)}</b>\n${unit(v)}`)}"></i>`;
      }
    }
    return `${cells}</div>${heatKey()}`;
  }

  // horizontal bars: label, bar, value
  function rows(items) {
    if (!items.length) return '<div class="oks-empty">Nothing yet.</div>';
    const max = Math.max(1, ...items.map((it) => it.value));
    return `<div class="oks-rows">${items.map((it) => `<div class="oks-row"${it.tip ? ` data-tip="${esc(it.tip)}"` : ''}><span>${it.label}</span>` +
      `<div class="oks-track"><i style="width:${Math.max(it.value ? 1.5 : 0, (it.value / max) * 100)}%"></i></div><b>${it.shown != null ? it.shown : num(it.value)}</b></div>`).join('')}</div>`;
  }

  // a running total over the range
  function cumulative(b, fmt, unit, opts) {
    let sum = 0;
    const items = b.list.map((x) => { sum += x.value; return { label: x.label, value: sum, tip: `<b>${bucketTitle(x)}</b>\n${unit(sum)} so far` }; });
    return area(items, fmt, opts);
  }

  function section(el, jp, en, sub, html) {
    el.innerHTML = `<div class="oks-sec-head"><span class="jp">${jp}</span><b>${en}</b>${sub ? `<span class="oks-sec-sub">${sub}</span>` : ''}</div>${html}`;
  }

  // --------------------------------------------------------- 集中 pomodoro
  function renderPomo() {
    const p = D.pomo || {};
    const all = (p.sessions || []).map(([date, hour, wd, secs, cards, how]) => ({ date, hour, wd, min: secs / 60, cards, how }));
    const first = all.reduce((a, s) => (!a || s.date < a ? s.date : a), null);
    const start = rangeStart(first);
    const S = all.filter((s) => s.date >= start);
    const Bk = (p.breaks || []).filter((b) => b[0] >= start);
    const minutes = S.reduce((a, s) => a + s.min, 0);
    const cards = S.reduce((a, s) => a + s.cards, 0);
    const n = S.length;
    const count = (h) => S.filter((s) => s.how === h).length;
    const full = count('f');
    const goal = count('g');
    const early = count('x');
    const endless = count('e');
    const timed = full + goal + early;
    const byDay = {};
    S.forEach((s) => { const d = (byDay[s.date] = byDay[s.date] || { n: 0, min: 0 }); d.n++; d.min += s.min; });
    const dayList = Object.entries(byDay);
    const best = dayList.reduce((a, e) => (!a || e[1].min > a[1].min ? e : a), null);
    const st = streaks(all.map((s) => s.date));
    const spanDays = between(start, TODAY) + 1;
    // fastest pace in a session of at least 10 cards
    const fastest = S.filter((s) => s.cards >= 10).reduce((a, s) => (!a || s.min / s.cards < a.min / a.cards ? s : a), null);

    let html = '';
    if (!all.length) html += '<div class="oks-note">Pomodoro stats start counting from version 1.8.0. Finish a focus session and they\'ll show up here.</div>';
    html += '<div class="oks-hero">' +
      hero('Focus time', dur(minutes), `${num(n)} session${n === 1 ? '' : 's'} in ${rangeName()}`) +
      hero('Current streak', `${num(st.current)} day${st.current === 1 ? '' : 's'}`, `best ever ${num(st.best)}`, 'Days in a row with at least one focus session') +
      hero('Completion rate', timed ? pct(Math.round(((full + goal) / timed) * 100)) : '–', 'timed sessions finished', 'Timed sessions that ran their full length or reached your card goal, out of all timed sessions (endless ones aren\'t timed)') +
      hero('Pace', cards ? `${round1((minutes * 60) / cards)} s` : '–', cards ? `a card · ${num(cards)} cards in focus` : 'seconds per card while focusing', 'Focus time divided by the cards you reviewed in it') +
      '</div><div class="oks-grid">' +
      tile('Average session', dur(n ? minutes / n : null)) +
      tile('Longest session', dur(n ? Math.max(...S.map((s) => s.min)) : null)) +
      tile('Cards per session', n ? round1(cards / n) : '–', `${num(cards)} cards in focus`) +
      tile('Fastest session', fastest ? `${round1(fastest.min * 60 / fastest.cards)} s` : '–', fastest ? `a card · ${fmtDay(fastest.date, 'year')}` : 'needs 10+ cards') +
      tile('Focus per day', dur(minutes / spanDays), `over ${num(spanDays)} day${spanDays === 1 ? '' : 's'}`) +
      tile('Active days', num(dayList.length), `${Math.round((dayList.length / spanDays) * 100)}% of days`) +
      tile('Per active day', dur(dayList.length ? minutes / dayList.length : null), dayList.length ? `${round1(n / dayList.length)} sessions` : '') +
      tile('Best day', best ? dur(best[1].min) : '–', best ? `${fmtDay(best[0], 'year')} · ${best[1].n} sessions` : '') +
      tile('Breaks taken', num(Bk.length), `${dur(Bk.reduce((a, b) => a + b[1], 0) / 60)} of rest`) +
      tile('Short breaks', num(Bk.filter((b) => !b[2]).length), 'between sessions') +
      tile('Long breaks', num(Bk.filter((b) => b[2]).length), 'after a full cycle') +
      tile('Breaks skipped', num(Bk.filter((b) => b[3]).length)) +
      tile('Endless share', n ? pct(Math.round((endless / n) * 100)) : '–', '∞ mode sessions') +
      tile('Idle pauses', num(p.idlePauses), `all time · ${num(p.resets)} resets`) +
      '</div>';

    const b = buckets(start);
    S.forEach((s) => fill(b, s.date, s.min, 1));
    const bp = buckets(start);
    S.forEach((s) => fill(bp, s.date, s.min * 60, s.cards)); // seconds, cards
    const paceSeries = bp.list.map((x) => ({ label: x.label, value: x.extra ? round1(x.value / x.extra) : null, tip: `<b>${bucketTitle(x)}</b>\n${x.extra ? `${round1(x.value / x.extra)} s a card · ${num(x.extra)} cards` : 'No cards'}` }));
    const series = b.list.map((x) => ({ label: x.label, value: Math.round(x.value), tip: `<b>${bucketTitle(x)}</b>\n${dur(x.value)} · ${x.extra} session${x.extra === 1 ? '' : 's'}` }));
    const grid = new Array(168).fill(0);
    const wd = new Array(7).fill(0);
    const hours = new Array(24).fill(0);
    S.forEach((s) => { grid[s.wd * 24 + s.hour] += s.min; wd[s.wd] += s.min; hours[s.hour] += s.min; });
    const peak = hours.indexOf(Math.max(...hours));
    const focusOf = (v) => `${dur(v)} of focus`;
    html += '<div class="oks-charts">' +
      card('Focus time', `${unitWord(b.unit)} · ${rangeName()}`, columns(series, hm, { minutes: true }), 'wide') +
      card('When you focus', `weekday × hour · ${rangeName()}`, punchcard(grid, focusOf), 'wide') +
      card('Time of day', n ? `busiest around ${hourName(peak)}` : 'focus time', columns(hours.map((v, h) => ({ label: h % 6 === 0 ? hourLabel(h) : '', value: Math.round(v), tip: `<b>${hourName(h)}–${hourName((h + 1) % 24)}</b>\n${focusOf(v)}` })), hm, { minutes: true, every: 1 })) +
      card('Day of the week', 'focus time', columns(wd.map((v, i) => ({ label: WD[i], value: Math.round(v), tip: `<b>${WD_JP[i]} ${WD[i]}</b>\n${focusOf(v)}` })), hm, { minutes: true, every: 1 })) +
      card('Pace', `seconds per card while focusing · ${unitWord(bp.unit)} · lower is faster`, area(paceSeries, (v) => `${round1(v)}s`), 'wide') +
      card('How sessions ended', rangeName(), stack([
        { slot: 1, label: 'Full length', value: full, note: 'Ran the whole focus timer' },
        { slot: 2, label: 'Card goal', value: goal, note: 'Ended when you reached your card goal' },
        { slot: 3, label: 'Endless (∞)', value: endless, note: 'A focus-length in endless mode' },
        { slot: 4, label: 'Cut short', value: early, note: 'Skipped before the timer ran out' },
      ]), 'wide') +
      card('Focus time, adding up', `running total · ${rangeName()}`, cumulative(b, hm, dur, { minutes: true }), 'wide') +
      '</div>';
    section($('oks-pomo'), '集中', 'Pomodoro', p.since ? `Recorded since ${fmtDay(p.since, 'year')}` : '', html);
  }

  // ----------------------------------------------------------- 復習 reviews
  function yearHeatmap(daily) {
    const counts = {};
    daily.forEach(([d, c]) => { counts[d] = c; });
    const start = addDays(TODAY, -364);
    const vals = [];
    for (let d = start; d <= TODAY; d = addDays(d, 1)) vals.push([d, counts[d] || 0]);
    const max = Math.max(1, ...vals.map((v) => v[1]));
    const lvl = (c) => (!c ? 0 : c <= max * 0.25 ? 1 : c <= max * 0.5 ? 2 : c <= max * 0.75 ? 3 : 4);
    const pad = (toDate(start).getDay() + 6) % 7;
    let cells = '<i class="oks-c pad"></i>'.repeat(pad);
    const months = [];
    vals.forEach(([d, c], i) => {
      if (d.slice(8) === '01' || i === 0) months.push([Math.floor((i + pad) / 7), d.slice(0, 7)]);
      cells += `<i class="oks-c" data-l="${lvl(c)}" data-tip="${esc(`<b>${fmtDay(d)}</b>\n${num(c)} review${c === 1 ? '' : 's'}`)}"></i>`;
    });
    const cols = Math.ceil((vals.length + pad) / 7);
    const monthRow = `<div class="oks-heat-months" style="grid-template-columns:repeat(${cols}, 11px)">` +
      months.filter((m, i) => i > 0 || months.length < 2 || months[1][0] - m[0] > 2)
        .map(([c, m]) => `<span style="grid-column:${c + 1}">${toDate(m + '-01').toLocaleDateString(undefined, { month: 'short' })}</span>`).join('') + '</div>';
    const studied = vals.filter((v) => v[1]).length;
    return card('The last year', `${num(studied)} of 365 days studied · darker is more`,
      `<div class="oks-heat-wrap">${monthRow}<div class="oks-heat">${cells}</div></div>${heatKey()}`, 'wide');
  }
  function renderReviews() {
    const r = D.reviews;
    if (!r) { section($('oks-rev'), '復習', 'Reviews', '', '<div class="oks-note">Couldn\'t read your review history.</div>'); return; }
    const daily = r.daily || [];
    const first = daily.length ? daily[0][0] : null;
    const start = rangeStart(first);
    const inRange = daily.filter(([d]) => d >= start);
    const total = inRange.reduce((a, [, c]) => a + c, 0);
    const allTotal = daily.reduce((a, [, c]) => a + c, 0);
    const spanDays = between(start, TODAY) + 1;
    const rg = (r.ranges || {})[range] || {};
    const btn = rg.buttons || [0, 0, 0, 0];
    const presses = btn.reduce((a, x) => a + x, 0);
    const retention = rg.reviewAnswers ? round1((1 - rg.fails / rg.reviewAnswers) * 100) : null;
    const st = streaks(daily.filter(([, c]) => c).map(([d]) => d));
    const busiest = inRange.reduce((a, e) => (!a || e[1] > a[1] ? e : a), null);
    const c = r.collection || {};

    let html = '<div class="oks-hero">' +
      hero('Reviews', num(total), `in ${rangeName()}`) +
      hero('Per day', num(Math.round(total / spanDays)), `${num(inRange.length ? Math.round(total / inRange.length) : 0)} per study day`) +
      hero('Retention', pct(retention), 'review cards remembered', 'Share of answers on review cards that weren\'t Again') +
      hero('Current streak', `${num(st.current)} day${st.current === 1 ? '' : 's'}`, `best ever ${num(st.best)}`) +
      '</div><div class="oks-grid">' +
      tile('Days studied', num(inRange.length), `${Math.round((inRange.length / spanDays) * 100)}% of days`) +
      tile('Busiest day', busiest ? num(busiest[1]) : '–', busiest ? fmtDay(busiest[0], 'year') : '') +
      tile('Time reviewing', dur((rg.ms || 0) / 60000), 'as timed by Anki') +
      tile('Per card', total ? `${round1((rg.ms || 0) / 1000 / total)} s` : '–', 'average answer time') +
      tile('Cards learned', num(rg.newCards), 'first seen as new') +
      tile('Again rate', presses ? pct(round1((btn[0] / presses) * 100)) : '–', `${num(btn[0])} presses`) +
      tile('All-time reviews', num(allTotal), first ? `since ${fmtDay(first, 'year')}` : '') +
      tile('All-time days', num(daily.length), `${num(daily.length ? Math.round(allTotal / daily.length) : 0)} per study day`) +
      '</div>';

    const b = buckets(start);
    inRange.forEach(([d, cnt]) => fill(b, d, cnt));
    const bt = buckets(start);
    inRange.forEach(([d, cnt, ms]) => fill(bt, d, (ms || 0) / 1000, cnt)); // seconds, cards
    const answerSeries = bt.list.map((x) => ({ label: x.label, value: x.extra ? round1(x.value / x.extra) : null, tip: `<b>${bucketTitle(x)}</b>\n${x.extra ? `${round1(x.value / x.extra)} s a card · ${num(x.extra)} reviews` : 'No reviews'}` }));
    const series = b.list.map((x) => ({ label: x.label, value: x.value, tip: `<b>${bucketTitle(x)}</b>\n${num(x.value)} review${x.value === 1 ? '' : 's'}` }));
    const wd = new Array(7).fill(0);
    const hours = new Array(24).fill(0);
    (rg.grid || []).forEach((v, i) => { wd[Math.floor(i / 24)] += v; hours[i % 24] += v; });
    const perReview = (v) => `${num(v)} review${v === 1 ? '' : 's'}`;
    html += '<div class="oks-charts">' +
      card('Reviews', `${unitWord(b.unit)} · ${rangeName()}`, area(series, kfmt), 'wide') +
      yearHeatmap(daily) +
      card('When you review', `weekday × hour · ${rangeName()}`, punchcard(rg.grid || new Array(168).fill(0), perReview), 'wide') +
      card('Time of day', total ? `busiest around ${hourName(hours.indexOf(Math.max(...hours)))}` : 'reviews', columns(hours.map((v, h) => ({ label: h % 6 === 0 ? hourLabel(h) : '', value: v, tip: `<b>${hourName(h)}–${hourName((h + 1) % 24)}</b>\n${perReview(v)}` })), kfmt, { every: 1 })) +
      card('Day of the week', 'reviews', columns(wd.map((v, i) => ({ label: WD[i], value: v, tip: `<b>${WD_JP[i]} ${WD[i]}</b>\n${perReview(v)}` })), kfmt, { every: 1 })) +
      card('Answer time', `seconds per card, as timed by Anki · ${unitWord(bt.unit)} · lower is faster`, area(answerSeries, (v) => `${round1(v)}s`), 'wide') +
      card('Pace by card type', `seconds per answer, as timed by Anki · ${rangeName()}`, rows(
        [['Learning', 'New cards in their learning steps'], ['Review', 'Cards coming back for review'], ['Relearning', 'Cards you forgot, back in their steps'], ['Filtered', 'Answers in filtered decks']]
          .map(([label, note], i) => { const [cnt, ms] = (rg.byType || [])[i] || [0, 0]; return { label, value: cnt ? round1(ms / 1000 / cnt) : 0, shown: cnt ? `${round1(ms / 1000 / cnt)} s · ${num(cnt)}` : '–', tip: `<b>${label}</b>\n${note}${cnt ? `\n${num(cnt)} answers · ${dur(ms / 60000)} in all` : ''}` }; })
          .filter((r, i) => i < 3 || ((rg.byType || [])[3] || [0])[0])), 'wide') +
      card('Answer buttons', rangeName(), stack([
        { slot: 1, label: 'Again', value: btn[0] }, { slot: 2, label: 'Hard', value: btn[1] },
        { slot: 3, label: 'Good', value: btn[2] }, { slot: 4, label: 'Easy', value: btn[3] },
      ]), 'wide') +
      card('Reviews, adding up', `running total · ${rangeName()}`, cumulative(b, kfmt, perReview), 'wide') +
      card('Your collection', `${num(c.cards)} cards · ${num(c.notes)} notes · ${num(c.decks)} decks`, stack([
        { slot: 1, label: 'New', value: c.new || 0, note: 'Not studied yet' },
        { slot: 2, label: 'Learning', value: c.learning || 0, note: 'In (re)learning steps' },
        { slot: 3, label: 'Young', value: c.young || 0, note: 'Interval under 21 days' },
        { slot: 4, label: 'Mature', value: c.mature || 0, note: 'Interval of 21 days or more' },
        { slot: 5, label: 'Suspended', value: c.suspended || 0, note: 'Suspended cards' },
      ]) + `<div class="oks-mini">${tile('Average interval', c.avgInterval == null ? '–' : `${num(c.avgInterval)} days`, 'review cards')}${tile('Average ease', c.avgEase == null ? '–' : `${c.avgEase}%`, 'review cards')}${tile('Mature share', c.cards ? pct(round1((c.mature / c.cards) * 100)) : '–', 'of all cards')}</div>`, 'wide') +
      '</div>';
    section($('oks-rev'), '復習', 'Reviews', 'From your whole Anki review history', html);
  }

  // ----------------------------------------------------------- 食堂 kitchen
  function renderKitchen() {
    const k = D.kitchen || {};
    const days = k.days || [];
    const first = days.length ? days[0][0] : null;
    const start = rangeStart(first);
    const inRange = days.filter(([d]) => d >= start);
    const guests = inRange.reduce((a, d) => a + d[1], 0);
    const earned = inRange.reduce((a, d) => a + d[2], 0);
    const spent = inRange.reduce((a, d) => a + d[3], 0);
    const kinds = k.byKind || {};
    const src = k.bySource || {};
    const pet = k.pet || {};
    const SOURCES = [['tips', 'Tips'], ['takeout', 'Takeout'], ['daruma', '達磨 Daruma wishes'], ['rabbit', '兎 Rabbit\'s mochi'], ['gifts', 'Coins from your pet'], ['keepsakes', '宝物 Keepsake set']];
    let html = '<div class="oks-hero">' +
      hero('Guests served', num(guests), `in ${rangeName()} · ${num(k.served)} all time`) +
      hero('Mon earned', `${num(earned)} 文`, `in ${rangeName()}`, 'Mon (文) your guests and pets brought in') +
      hero('Mon spent', `${num(spent)} 文`, `in ${rangeName()} · ${num(k.mon)} 文 now`) +
      hero('Restaurant', `Lv ${num(k.level)}`, k.levelFrom === 'study' ? 'from your study days' : 'from Onigiri') +
      '</div><div class="oks-grid">' +
      tile('Your pet', esc(pet.name || '–'), `${esc(pet.stage || '')} · ${num(pet.studyDays)} study days`) +
      tile('Times petted', num(pet.petted)) +
      tile('Keepsakes found', `${num(pet.gifts)} / ${num(pet.giftsTotal)}`) +
      tile('Fish fed', num(k.fishFed)) +
      tile('Onigiri made ahead', num(k.onigiriMade), 'for the tray') +
      tile('Decor owned', `${num(k.items)} / ${num(k.catalog)}`) +
      tile('Companions', num(k.pets), 'milestone pets') +
      tile('Rewards earned', num(k.rewards), 'from Onigiri specials') +
      tile('Specials on the menu', num(k.specials), 'in your Specials Book') +
      tile('Days open', num(k.daysOpen), k.firstSeen ? `since ${fmtDay(k.firstSeen, 'year')}` : '') +
      '</div>';
    const bg = buckets(start);
    const bm = buckets(start);
    inRange.forEach(([d, g, m]) => { fill(bg, d, g); fill(bm, d, m); });
    html += '<div class="oks-charts">' +
      card('Guests served', `${unitWord(bg.unit)} · ${rangeName()}`, columns(bg.list.map((x) => ({ label: x.label, value: x.value, tip: `<b>${bucketTitle(x)}</b>\n${num(x.value)} guest${x.value === 1 ? '' : 's'}` })), kfmt)) +
      card('Mon earned', `${unitWord(bm.unit)} · ${rangeName()}`, area(bm.list.map((x) => ({ label: x.label, value: x.value, tip: `<b>${bucketTitle(x)}</b>\n${num(x.value)} 文` })), kfmt)) +
      card('Guests by type', 'since stats began', stack([
        { slot: 1, label: 'Regular', value: kinds.regular || 0, note: 'Every 10 reviews in a deck' },
        { slot: 2, label: '金 Golden', value: kinds.golden || 0, note: 'From finished focus sessions' },
        { slot: 3, label: '梅 Sour plum', value: kinds.leech || 0, note: 'Leech cards you got right' },
      ]), 'wide') +
      card('Guests by deck', 'top decks, all time', rows((k.topDecks || []).map(([name, cnt]) => ({ label: esc(name), value: cnt, tip: `<b>${esc(name)}</b>\n${num(cnt)} guests` })))) +
      card('Where mon came from', 'since stats began', rows(SOURCES.map(([id, label]) => ({ label, value: src[id] || 0, shown: `${num(src[id] || 0)} 文` })))) +
      '</div>';
    section($('oks-kitchen'), '食堂', 'Kitchen', k.since ? `Recorded since ${fmtDay(k.since, 'year')}` : '', html);
  }

  // ------------------------------------------------------------ range bar
  function renderRange() {
    $('oks-range').innerHTML = '<span>Show</span>' + RANGES.map(([id, label]) => `<button type="button" data-range="${id}" class="${id === range ? 'on' : ''}">${label}</button>`).join('');
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('[data-range]');
    if (!b) return;
    range = b.dataset.range;
    try { localStorage.setItem('oksRange', range); } catch (err) {}
    render();
  });

  // --------------------------------------------------------------- tooltip
  const tip = $('oks-tip');
  document.addEventListener('mousemove', (e) => {
    const t = e.target.closest && e.target.closest('[data-tip]');
    if (!t || !t.dataset.tip) { tip.hidden = true; return; }
    tip.innerHTML = t.dataset.tip;
    tip.hidden = false;
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    let x = e.clientX + 14;
    let y = e.clientY + 16;
    if (x + w > window.innerWidth - 8) x = e.clientX - w - 12;
    if (y + h > window.innerHeight - 8) y = e.clientY - h - 12;
    tip.style.left = x + 'px';
    tip.style.top = y + 'px';
  });
  document.addEventListener('mouseleave', () => { tip.hidden = true; });

  // light or dark, as in the kitchen (the theme_mode setting)
  let ANKI_DARK = null;
  function applyTheme() {
    if (ANKI_DARK === null) ANKI_DARK = document.body.classList.contains('nightMode') || document.documentElement.classList.contains('night-mode');
    const mode = D.themeMode || 'anki';
    const h = new Date().getHours() + new Date().getMinutes() / 60;
    const dark = mode === 'dark' || (mode === 'auto' && (h < 5.5 || h >= 19.5)) || (mode === 'anki' && ANKI_DARK);
    document.body.classList.toggle('nightMode', dark);
    document.body.classList.toggle('night_mode', dark);
    document.documentElement.classList.toggle('night-mode', dark);
  }
  function render() {
    applyTheme();
    $('oks-sub').textContent = `Everything Onigiri Kitchen keeps count of · ${fmtDay(TODAY, 'year')}`;
    renderRange();
    renderPomo();
    renderReviews();
    renderKitchen();
    $('oks-foot').textContent = `Onigiri Kitchen${D.version ? ' v' + D.version : ''} · Pomodoro and kitchen numbers are recorded from 1.8.0 on; reviews come from your whole Anki history.`;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render);
  else render();
  setInterval(() => { if (document.body) applyTheme(); }, 60000);
})();
