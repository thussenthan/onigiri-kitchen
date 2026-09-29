// Made-up numbers for the stats preview (dev/stats_order.html), in the same
// shape as main.py stats_payload(). A seeded random, so every shot matches.
(function () {
  let seed = 7;
  const rnd = () => ((seed = (seed * 48271) % 2147483647) / 2147483647);
  const today = new Date('2026-09-29T12:00:00');
  const iso = (d) => d.toISOString().slice(0, 10);
  const back = (n) => { const d = new Date(today); d.setDate(d.getDate() - n); return d; };
  const daily = [];
  for (let i = 29; i >= 0; i--) {
    const sessions = rnd() < 0.18 ? 0 : 1 + Math.floor(rnd() * 6);
    daily.push({ date: iso(back(i)), sessions, minutes: Math.round(sessions * (18 + rnd() * 9)) });
  }
  const shape = (peak, spread) => Array.from({ length: 24 }, (_, h) => Math.round(Math.max(0, 1 - Math.abs(h - peak) / spread) ** 1.5 * (80 + rnd() * 40)));
  const year = [];
  for (let i = 364; i >= 0; i--) {
    const off = rnd() < 0.12;
    year.push({ date: iso(back(i)), count: off ? 0 : Math.round(60 + rnd() * 340 + (i < 60 ? 150 : 0)) });
  }
  const minutes = daily.reduce((a, d) => a + d.minutes, 0) + 2710;
  window.OKS = {
    today: iso(today),
    version: '1.8.0',
    pomo: {
      since: '2026-07-02', first: '2026-07-02', sessions: 212, minutes,
      today: { sessions: 3, minutes: 75, cards: 118 }, week: { sessions: 19, minutes: 452, cards: 804 },
      month: { sessions: 71, minutes: daily.reduce((a, d) => a + d.minutes, 0), cards: 2960 },
      avgMinutes: 23.4, longestMinutes: 25, full: 151, goal: 22, early: 17, endless: 22, completion: 91,
      cards: 8720, cardsPerSession: 41.1, cardsPerMinute: 1.76, activeDays: 64, avgPerDay: 3.3, minutesPerDay: 78,
      bestDay: { date: '2026-09-14', sessions: 9, minutes: 214 }, streak: 12, bestStreak: 19,
      breaks: 188, breakMinutes: 1320, longBreaks: 41, breaksSkipped: 9, idlePauses: 27, resets: 4,
      daily, byHour: shape(20, 8), byWeekday: [412, 388, 455, 301, 276, 520, 610],
    },
    reviews: {
      total: 48213, days: 312, average: 155, today: 142, last7: 1290, last30: 5120, last365: 40210,
      streak: 12, bestStreak: 47, busiest: { date: '2026-06-18', count: 812 }, first: '2025-08-21',
      timeHours: 214.6, secondsPerCard: 16.0, retention: 87.4, retention30: 89.1, newCards: 6120,
      buttons: [6210, 1840, 36920, 3243], byHour: shape(21, 9).map((v) => v * 25), byWeekday: [7120, 6890, 7410, 6620, 5980, 6810, 7383],
      year,
      collection: { cards: 9840, new: 3120, mature: 4210, young: 2140, learning: 180, suspended: 190, avgInterval: 38.5, avgEase: 247, notes: 7210, decks: 14 },
    },
    kitchen: {
      since: '2026-07-02', served: 4821, byKind: { regular: 4280, golden: 212, leech: 329 },
      mon: 186, earned: 15420, spent: 12860, bySource: { tips: 14210, takeout: 640, daruma: 390, rabbit: 120, gifts: 60, keepsakes: 0 },
      topDecks: [['Japanese::Kanji', 1840], ['Japanese::Vocab', 1210], ['Pharmacology', 812], ['Anatomy', 544], ['Biochemistry', 290], ['Spanish', 125]],
      onigiriMade: 96, fishFed: 104, daysOpen: 89, firstSeen: '2026-07-02', items: 11, pets: 3, rewards: 2, catalog: 17,
      level: 24, levelFrom: 'onigiri', specials: 11,
      pet: { name: 'Tama', species: 'cat', stage: '看板猫 Shop cat', studyDays: 64, petted: 530, gifts: 9, giftsTotal: 15 },
    },
  };
})();
