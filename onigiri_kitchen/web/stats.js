/* Onigiri Kitchen - 統計 Stats window. Draws window.OKS (built by main.py
   stats_payload): pomodoro, reviews and kitchen numbers, with charts. */
(function () {
  'use strict';

  const D = window.OKS || {};
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const num = (n) => (n == null ? '–' : Number(n).toLocaleString());
  const pct = (n) => (n == null ? '–' : `${n}%`);
  const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const WEEKDAYS_JP = ['月', '火', '水', '木', '金', '土', '日'];

  // 95 → "1 h 35 m", 25 → "25 m"
  function dur(minutes) {
    if (minutes == null) return '–';
    const m = Math.round(minutes);
    if (m < 60) return `${m} m`;
    const h = Math.floor(m / 60);
    return m % 60 ? `${num(h)} h ${m % 60} m` : `${num(h)} h`;
  }
  function day(iso, withYear) {
    if (!iso) return '–';
    const d = new Date(iso + 'T12:00:00');
    return d.toLocaleDateString(undefined, withYear ? { year: 'numeric', month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', weekday: 'short' });
  }
  const hourLabel = (h) => (h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`);
  const hourRange = (h) => `${hourLabel(h)}–${hourLabel((h + 1) % 24)}`.replace(/a|p/g, (x) => (x === 'a' ? ' am' : ' pm'));

  // -------------------------------------------------------------- pieces
  function tile(label, value, note, tip) {
    return `<div class="oks-tile"${tip ? ` data-tip="${esc(tip)}"` : ''}><small>${label}</small><b>${value}</b>${note ? `<em>${note}</em>` : ''}</div>`;
  }
  function section(el, jp, en, sub, html) {
    el.innerHTML = `<div class="oks-sec-head"><span class="jp">${jp}</span><b>${en}</b>${sub ? `<span class="oks-sec-sub">${sub}</span>` : ''}</div>${html}`;
  }
  function niceMax(v) {
    if (v <= 0) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    const f = v / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
  }
  // thin columns from one baseline, a hairline grid, a tooltip per column
  function columns(title, sub, items, fmt, opts) {
    opts = opts || {};
    const top = Math.max(0, ...items.map((it) => it.value));
    const max = opts.minutes && top > 60 ? niceMax(top / 60) * 60 : niceMax(top);
    const grid = [0, 0.5, 1].map((f) => `<div class="oks-gridline" style="bottom:${f * 100}%"><i>${fmt(max * f, true)}</i></div>`).join('');
    const bars = items.map((it) => {
      const h = max ? (it.value / max) * 100 : 0;
      return `<div class="oks-bar${it.value ? '' : ' zero'}" data-tip="${esc(it.tip)}"><span style="height:${h}%"></span></div>`;
    }).join('');
    const axis = items.map((it, i) => `<i>${opts.every && i % opts.every ? '' : esc(it.label)}</i>`).join('');
    return `<div class="oks-chart${opts.wide ? ' wide' : ''}"><h4>${title}${sub ? `<span>${sub}</span>` : ''}</h4>` +
      `<div class="oks-cols">${grid}<div class="oks-bars">${bars}</div></div><div class="oks-axis">${axis}</div></div>`;
  }
  // horizontal bars with the label on the left and the value on the right
  function rows(title, sub, items, opts) {
    opts = opts || {};
    const max = Math.max(1, ...items.map((it) => it.value));
    const body = items.length
      ? items.map((it) => `<div class="oks-row" data-tip="${esc(it.tip || '')}"><span>${it.label}</span>` +
        `<div class="oks-track"><i style="width:${Math.max(it.value ? 1.5 : 0, (it.value / max) * 100)}%"></i></div><b>${it.shown != null ? it.shown : num(it.value)}</b></div>`).join('')
      : '<div class="oks-row"><span>Nothing yet</span></div>';
    return `<div class="oks-chart${opts.wide ? ' wide' : ''}"><h4>${title}${sub ? `<span>${sub}</span>` : ''}</h4><div class="oks-rows">${body}</div></div>`;
  }
  function byHour(list, unit) {
    return list.map((v, h) => ({ label: h % 3 === 0 ? hourLabel(h) : '', value: v, tip: `<b>${hourRange(h)}</b>\n${unit(v)}` }));
  }
  function byWeekday(list, unit) {
    return list.map((v, i) => ({ label: WEEKDAYS[i], value: v, tip: `<b>${WEEKDAYS_JP[i]} ${WEEKDAYS[i]}</b>\n${unit(v)}` }));
  }

  // axis ticks for minutes: 90 → "1.5h", 45 → "45m"
  const hm = (v) => (v >= 60 ? `${Math.round(v / 6) / 10}h` : `${Math.round(v)}m`);

  // --------------------------------------------------------- 集中 pomodoro
  function renderPomo() {
    const p = D.pomo || {};
    const since = p.since ? `Recorded since ${day(p.since, true)}` : '';
    let html = '';
    if (!p.sessions) {
      html += '<div class="oks-note">Pomodoro stats start counting from this version. Finish a focus session and they\'ll show up here.</div>';
    }
    html += '<div class="oks-hero">' +
      tile('Focus time', dur(p.minutes), `${num(p.sessions)} session${p.sessions === 1 ? '' : 's'}`) +
      tile('Current streak', `${num(p.streak)} day${p.streak === 1 ? '' : 's'}`, `best ${num(p.bestStreak)}`, 'Days in a row with at least one focus session') +
      tile('Completion rate', pct(p.completion), 'timed sessions finished', 'Timed sessions that ran their full length or reached your card goal, out of all timed sessions (endless ones not included)') +
      tile('Cards in focus', num(p.cards), `${p.cardsPerSession || 0} per session`) +
      '</div><div class="oks-grid">' +
      tile('Today', dur(p.today && p.today.minutes), `${num(p.today && p.today.sessions)} sessions · ${num(p.today && p.today.cards)} cards`) +
      tile('Last 7 days', dur(p.week && p.week.minutes), `${num(p.week && p.week.sessions)} sessions · ${num(p.week && p.week.cards)} cards`) +
      tile('Last 30 days', dur(p.month && p.month.minutes), `${num(p.month && p.month.sessions)} sessions · ${num(p.month && p.month.cards)} cards`) +
      tile('Average session', dur(p.avgMinutes)) +
      tile('Longest session', dur(p.longestMinutes)) +
      tile('Cards per minute', p.cardsPerMinute || 0, 'while focusing') +
      tile('Active days', num(p.activeDays), 'with a focus session') +
      tile('Sessions per active day', p.avgPerDay || 0) +
      tile('Focus per active day', dur(p.minutesPerDay)) +
      tile('Best day', p.bestDay ? dur(p.bestDay.minutes) : '–', p.bestDay ? `${day(p.bestDay.date, true)} · ${p.bestDay.sessions} sessions` : '') +
      tile('Best streak', `${num(p.bestStreak)} days`) +
      tile('Full-length sessions', num(p.full), 'ran the whole timer') +
      tile('Card-goal finishes', num(p.goal), 'ended at your card goal') +
      tile('Cut short', num(p.early), 'skipped before the end') +
      tile('Endless sessions', num(p.endless), '∞ mode, a focus-length each') +
      tile('Breaks taken', num(p.breaks), dur(p.breakMinutes) + ' of rest') +
      tile('祭り Festival nights', num(p.longBreaks), 'long breaks') +
      tile('Breaks skipped', num(p.breaksSkipped)) +
      tile('Idle pauses', num(p.idlePauses), 'timer paused while away') +
      tile('Resets', num(p.resets), 'cycles reset mid-way') +
      tile('First session', day(p.first, true)) +
      '</div><div class="oks-charts">' +
      columns('Focus time, last 30 days', 'minutes per day', (p.daily || []).map((d, i, a) => ({
        label: (a.length - 1 - i) % 7 === 0 ? day(d.date).replace(/^\w+,?\s*/, '') : '', // weekly, counting back from today
        value: d.minutes,
        tip: `<b>${day(d.date)}</b>\n${dur(d.minutes)} · ${d.sessions} session${d.sessions === 1 ? '' : 's'}`,
      })), hm, { wide: true, minutes: true }) +
      columns('Time of day', 'when you focus', byHour(p.byHour || [], (v) => `${dur(v)} of focus`), hm, { minutes: true }) +
      columns('Day of the week', 'focus time', byWeekday(p.byWeekday || [], (v) => `${dur(v)} of focus`), hm, { minutes: true }) +
      rows('How sessions ended', 'all sessions', [
        { label: 'Full length', value: p.full || 0, tip: 'Ran the whole focus timer' },
        { label: 'Card goal', value: p.goal || 0, tip: 'Ended when you reached your card goal' },
        { label: 'Endless (∞)', value: p.endless || 0, tip: 'A focus-length in endless mode' },
        { label: 'Cut short', value: p.early || 0, tip: 'Skipped before the timer ran out' },
      ], { wide: true }) +
      '</div>';
    section($('oks-pomo'), '集中', 'Pomodoro', since, html);
  }

  // ----------------------------------------------------------- 復習 reviews
  function heatmap(year) {
    if (!year || !year.length) return '';
    const max = Math.max(1, ...year.map((d) => d.count));
    const level = (c) => (!c ? 0 : c <= max * 0.25 ? 1 : c <= max * 0.5 ? 2 : c <= max * 0.75 ? 3 : 4);
    // weeks run Monday to Sunday, top to bottom
    const first = new Date(year[0].date + 'T12:00:00');
    const pad = (first.getDay() + 6) % 7;
    let cells = '<i class="oks-c pad"></i>'.repeat(pad);
    cells += year.map((d) => `<i class="oks-c" data-l="${level(d.count)}" data-tip="${esc(`<b>${day(d.date)}</b>\n${num(d.count)} review${d.count === 1 ? '' : 's'}`)}"></i>`).join('');
    const legend = [0, 1, 2, 3, 4].map((l) => `<i class="oks-c" data-l="${l}"></i>`).join('');
    return `<div class="oks-chart wide"><h4>The last year<span>reviews per day · darker is more</span></h4><div class="oks-heat">${cells}</div>` +
      `<div class="oks-legend">Less ${legend} More</div></div>`;
  }
  // what's in the collection right now
  function collection(c) {
    if (!c) return '';
    const of = (n) => (c.cards ? `${Math.round((n / c.cards) * 1000) / 10}% of cards` : '');
    return '<h4 class="oks-sub-head">Your collection</h4><div class="oks-grid">' +
      tile('Cards', num(c.cards), `${num(c.notes)} notes`) +
      tile('Decks', num(c.decks)) +
      tile('New', num(c.new), of(c.new), 'Cards you haven\'t studied yet') +
      tile('Learning', num(c.learning), of(c.learning), 'Cards in (re)learning steps') +
      tile('Young', num(c.young), of(c.young), 'Review cards with an interval under 21 days') +
      tile('Mature', num(c.mature), of(c.mature), 'Review cards with an interval of 21 days or more') +
      tile('Suspended', num(c.suspended), of(c.suspended)) +
      tile('Average interval', c.avgInterval == null ? '–' : `${num(c.avgInterval)} days`, 'review cards') +
      tile('Average ease', c.avgEase == null ? '–' : `${c.avgEase}%`, 'review cards') +
      '</div>';
  }
  function renderReviews() {
    const r = D.reviews;
    if (!r) {
      section($('oks-rev'), '復習', 'Reviews', '', '<div class="oks-note">Couldn\'t read your review history.</div>');
      return;
    }
    const b = r.buttons || [0, 0, 0, 0];
    const bTotal = b.reduce((a, c) => a + c, 0) || 1;
    const share = (n) => `${Math.round((n / bTotal) * 1000) / 10}%`;
    const perCard = (v) => `${num(v)} review${v === 1 ? '' : 's'}`;
    const html = '<div class="oks-hero">' +
      tile('Total reviews', num(r.total), r.first ? `since ${day(r.first, true)}` : '') +
      tile('Days studied', num(r.days), `${num(r.average)} reviews per study day`) +
      tile('Current streak', `${num(r.streak)} day${r.streak === 1 ? '' : 's'}`, `best ${num(r.bestStreak)}`) +
      tile('Retention', pct(r.retention), `last 30 days: ${pct(r.retention30)}`, 'Share of review-card answers that weren\'t Again') +
      '</div><div class="oks-grid">' +
      tile('Today', num(r.today)) +
      tile('Last 7 days', num(r.last7), `${num(Math.round(r.last7 / 7))} a day`) +
      tile('Last 30 days', num(r.last30), `${num(Math.round(r.last30 / 30))} a day`) +
      tile('Last 365 days', num(r.last365), `${num(Math.round(r.last365 / 365))} a day`) +
      tile('Busiest day', r.busiest ? num(r.busiest.count) : '–', r.busiest ? day(r.busiest.date, true) : '') +
      tile('Best streak', `${num(r.bestStreak)} days`) +
      tile('Time reviewing', `${num(r.timeHours)} h`, 'as timed by Anki') +
      tile('Per card', `${r.secondsPerCard || 0} s`, 'average answer time') +
      tile('Cards learned', num(r.newCards), 'first seen as new') +
      tile('Again', share(b[0]), num(b[0])) +
      tile('Hard', share(b[1]), num(b[1])) +
      tile('Good', share(b[2]), num(b[2])) +
      tile('Easy', share(b[3]), num(b[3])) +
      '</div>' + collection(r.collection) + '<div class="oks-charts">' +
      heatmap(r.year) +
      columns('Time of day', 'when you review', byHour(r.byHour || [], perCard), (v) => (v >= 1000 ? `${Math.round(v / 100) / 10}k` : `${Math.round(v)}`)) +
      columns('Day of the week', 'reviews', byWeekday(r.byWeekday || [], perCard), (v) => (v >= 1000 ? `${Math.round(v / 100) / 10}k` : `${Math.round(v)}`)) +
      rows('Answer buttons', 'every answer', [
        { label: 'Again', value: b[0], shown: `${num(b[0])} · ${share(b[0])}` },
        { label: 'Hard', value: b[1], shown: `${num(b[1])} · ${share(b[1])}` },
        { label: 'Good', value: b[2], shown: `${num(b[2])} · ${share(b[2])}` },
        { label: 'Easy', value: b[3], shown: `${num(b[3])} · ${share(b[3])}` },
      ], { wide: true }) +
      '</div>';
    section($('oks-rev'), '復習', 'Reviews', 'From your Anki review history', html);
  }

  // ----------------------------------------------------------- 食堂 kitchen
  function renderKitchen() {
    const k = D.kitchen || {};
    const kinds = k.byKind || {};
    const src = k.bySource || {};
    const pet = k.pet || {};
    const SOURCES = [['tips', 'Tips'], ['takeout', 'Takeout'], ['daruma', '達磨 Daruma wishes'], ['rabbit', '兎 Rabbit\'s mochi'], ['gifts', 'Coins from your pet'], ['keepsakes', '宝物 Keepsake set']];
    const html = '<div class="oks-hero">' +
      tile('Guests served', num(k.served), 'all time') +
      tile('Mon earned', `${num(k.earned)} 文`, k.since ? `since ${day(k.since, true)}` : '', 'Mon (文) your guests and pets brought in since stats began') +
      tile('Restaurant level', `Lv ${num(k.level)}`, k.levelFrom === 'study' ? 'from your study days' : 'from Onigiri') +
      tile('Your pet', esc(pet.name || '–'), `${esc(pet.stage || '')} · ${num(pet.studyDays)} study days`) +
      '</div><div class="oks-grid">' +
      tile('Mon now', `${num(k.mon)} 文`) +
      tile('Mon spent', `${num(k.spent)} 文`, 'in the shop') +
      tile('金 Golden guests', num(kinds.golden), 'from focus sessions') +
      tile('梅 Sour plums', num(kinds.leech), 'leech guests cheered up') +
      tile('Regular guests', num(kinds.regular)) +
      tile('Onigiri made ahead', num(k.onigiriMade), 'for the tray') +
      tile('Fish fed', num(k.fishFed)) +
      tile('Times petted', num(pet.petted)) +
      tile('Keepsakes found', `${num(pet.gifts)} / ${num(pet.giftsTotal)}`) +
      tile('Decor owned', `${num(k.items)} / ${num(k.catalog)}`) +
      tile('Companions', num(k.pets), 'milestone pets') +
      tile('Rewards earned', num(k.rewards), 'from Onigiri specials') +
      tile('Specials on the menu', num(k.specials), 'in your Specials Book') +
      tile('Days open', num(k.daysOpen), k.firstSeen ? `since ${day(k.firstSeen, true)}` : '') +
      '</div><div class="oks-charts">' +
      rows('Guests by deck', 'top decks, all time', (k.topDecks || []).map(([name, n]) => ({ label: esc(name), value: n, tip: `<b>${esc(name)}</b>\n${num(n)} guests` }))) +
      rows('Where mon came from', 'since stats began', SOURCES.map(([id, label]) => ({ label, value: src[id] || 0, shown: `${num(src[id] || 0)} 文` }))) +
      '</div>';
    section($('oks-kitchen'), '食堂', 'Kitchen', '', html);
  }

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

  function render() {
    $('oks-sub').textContent = `Everything Onigiri Kitchen keeps count of · ${day(D.today, true)}`;
    renderPomo();
    renderReviews();
    renderKitchen();
    $('oks-foot').textContent = `Onigiri Kitchen${D.version ? ' v' + D.version : ''} · Pomodoro and kitchen numbers are kept from the version that added stats; reviews come from Anki.`;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render);
  else render();
})();
