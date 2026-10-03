// Made-up numbers for the stats preview (dev/stats_order.html), in the same
// shape as main.py stats_payload(): about 14 months of sessions, reviews and
// kitchen days. A seeded random, so every screenshot matches.
(function () {
  let seed = 11;
  const rnd = () => ((seed = (seed * 48271) % 2147483647) / 2147483647);
  const TODAY = '2026-09-29';
  const toDate = (s) => new Date(s + 'T12:00:00');
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const back = (n) => { const d = toDate(TODAY); d.setDate(d.getDate() - n); return iso(d); };
  const wdOf = (s) => (toDate(s).getDay() + 6) % 7;

  const sessions = [];
  const breaks = [];
  const daily = [];
  const days = [];
  const grid = new Array(168).fill(0);
  const hoursPick = [9, 10, 14, 16, 19, 20, 20, 21, 21, 22, 22, 23];
  for (let i = 430; i >= 0; i--) {
    const d = back(i);
    const wd = wdOf(d);
    const ramp = 0.55 + 0.45 * (1 - i / 430); // busier lately
    const off = rnd() < (wd >= 5 ? 0.1 : 0.16);
    // reviews
    const reviews = off ? 0 : Math.round((80 + rnd() * 220) * ramp * (wd === 6 ? 1.3 : 1));
    if (reviews) daily.push([d, reviews, Math.round(reviews * (13000 + rnd() * 6000 - i * 8))]);
    // focus sessions (recorded for the last ~90 days)
    let guests = 0;
    let mon = 0;
    if (i <= 90 && !off) {
      const n = 1 + Math.floor(rnd() * 5 * ramp);
      for (let k = 0; k < n; k++) {
        const hour = hoursPick[Math.floor(rnd() * hoursPick.length)];
        const r = rnd();
        const how = r < 0.72 ? 'f' : r < 0.83 ? 'g' : r < 0.92 ? 'e' : 'x';
        const secs = how === 'x' ? Math.round(300 + rnd() * 900) : how === 'g' ? Math.round(900 + rnd() * 500) : 1500;
        { const c = Math.round(secs / 60 * (1.4 + rnd() * 0.8)); const rv = Math.round(c * 0.6); sessions.push([d, hour, wd, secs, c, how, rv, Math.round(rv * (0.08 + rnd() * 0.06)), Math.round(c * (6500 + rnd() * 2500))]); }
        if (how !== 'e') breaks.push([d, rnd() < 0.2 ? 900 : 300, rnd() < 0.2 ? 1 : 0, rnd() < 0.06 ? 1 : 0]);
      }
      guests = Math.round(reviews / 10) + n;
      mon = Math.round(guests * (3 + rnd()));
      days.push([d, guests, mon, rnd() < 0.08 ? Math.round(50 + rnd() * 250) : 0]);
    }
  }
  const rangeOf = (n) => {
    const start = n ? back(n - 1) : '0000';
    const rows = daily.filter(([d]) => d >= start);
    const total = rows.reduce((a, [, c]) => a + c, 0);
    const g = new Array(168).fill(0);
    rows.forEach(([d, c]) => {
      const wd = wdOf(d);
      [8, 12, 15, 19, 20, 21, 22, 23, 0].forEach((h, j) => { g[wd * 24 + h] += Math.round(c * [0.04, 0.06, 0.08, 0.12, 0.16, 0.18, 0.17, 0.12, 0.07][j]); });
    });
    const again = Math.round(total * 0.13);
    return { byType: [[Math.round(total * 0.2), Math.round(total * 0.2 * 11400), Math.round(total * 0.2 * 0.3)], [Math.round(total * 0.62), Math.round(total * 0.62 * 17200), Math.round(total * 0.62 * 0.11)], [Math.round(total * 0.18), Math.round(total * 0.18 * 14100), Math.round(total * 0.18 * 0.22)], [0, 0, 0]], buttons: [again, Math.round(total * 0.04), Math.round(total * 0.76), total - again - Math.round(total * 0.04) - Math.round(total * 0.76)], reviewAnswers: Math.round(total * 0.62), fails: Math.round(total * 0.62 * 0.12), ms: total * 15800, newCards: Math.round(total * 0.14), grid: g };
  };
  window.OKS = {
    today: TODAY,
    studyToday: { cards: 142, seconds: 1080, pace: 7.6, retention: 89.4, newCards: 20, byType: [[48, 330000, 14], [80, 590000, 8], [14, 160000, 3], [0, 0, 0]], due: { new: 20, learn: 12, review: 96, total: 128 }, estimateSeconds: 1330, paces: { learning: 7.1, review: 7.1, relearning: 8.7, answersPerNew: 2.9 } },
    version: '1.8.0',
    pomo: { since: back(90), sessions, breaks, idlePauses: 27, resets: 4 },
    reviews: {
      daily,
      ranges: { 7: rangeOf(7), 30: rangeOf(30), 365: rangeOf(365), all: rangeOf(0) },
      collection: { cards: 9840, new: 3120, mature: 4210, young: 2140, learning: 180, suspended: 190, avgInterval: 38.5, avgEase: 247, notes: 7210, decks: 14 },
    },
    kitchen: {
      since: back(90), days, served: 4821, byKind: { regular: 4280, golden: 212, leech: 329 },
      mon: 186, bySource: { tips: 14210, takeout: 640, daruma: 390, rabbit: 120, gifts: 60, keepsakes: 0 },
      topDecks: [['Japanese::Kanji', 1840], ['Japanese::Vocab', 1210], ['Pharmacology', 812], ['Anatomy', 544], ['Biochemistry', 290], ['Spanish', 125]],
      onigiriMade: 96, fishFed: 104, daysOpen: 89, firstSeen: back(90), items: 11, animals: 3, animalTotal: 6, rewards: 2, catalog: 17,
      level: 24, levelFrom: 'onigiri', specials: 11,
      pet: { name: 'Tama', species: 'cat', stage: '看板猫 Shop cat', studyDays: 64, petted: 530, gifts: 9, giftsTotal: 15 },
    },
  };
})();
