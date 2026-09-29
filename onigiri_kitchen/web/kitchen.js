/* Onigiri Kitchen - the pixel restaurant.
   Everything is drawn in code onto a 320x180 canvas, then scaled up crisply. */
(function () {
  'use strict';

  // Anki's stdHtml puts scripts in <head>, before the body and before
  // OK_INIT, so wait for the document before touching the DOM.
  function boot() {

  const INIT = window.OK_INIT || {};
  const W = 320;
  const H = 180;

  // ------------------------------------------------------------ utilities
  const $ = (id) => document.getElementById(id);
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function send(cmd, arg, cb) {
    const msg = 'okitchen:' + cmd + (arg != null ? ':' + arg : '');
    if (typeof pycmd === 'function') pycmd(msg, cb || (() => {}));
    else if (cb) cb(null);
  }

  function hexToRgb(hex) {
    let h = hex.replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h.slice(0, 6), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
  }
  function shade(hex, amt) {
    const [r, g, b] = hexToRgb(hex);
    if (amt >= 0) return rgbToHex(r + (255 - r) * amt, g + (255 - g) * amt, b + (255 - b) * amt);
    return rgbToHex(r * (1 + amt), g * (1 + amt), b * (1 + amt));
  }
  function mix(a, b, t) {
    const x = hexToRgb(a);
    const y = hexToRgb(b);
    return rgbToHex(lerp(x[0], y[0], t), lerp(x[1], y[1], t), lerp(x[2], y[2], t));
  }

  // --------------------------------------------------------------- canvas
  const low = document.createElement('canvas');
  low.width = W;
  low.height = H;
  const g = low.getContext('2d');
  const view = $('ok-canvas');
  const v = view.getContext('2d');
  let cssScale = 3;
  let dpr = 1;

  function R(x, y, w, h, c) {
    g.fillStyle = c;
    g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }
  function P(x, y, c) {
    g.fillStyle = c;
    g.fillRect(Math.round(x), Math.round(y), 1, 1);
  }
  function ellipse(cx, cy, rx, ry, c) {
    g.fillStyle = c;
    for (let dy = -ry; dy <= ry; dy++) {
      const t = dy / (ry + 0.5);
      const hw = Math.round(rx * Math.sqrt(Math.max(0, 1 - t * t)));
      g.fillRect(Math.round(cx - hw), Math.round(cy + dy), hw * 2 + 1, 1);
    }
  }
  function line(x0, y0, x1, y1, c) {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1;
    for (let i = 0; i <= steps; i++) P(lerp(x0, x1, i / steps), lerp(y0, y1, i / steps), c);
  }

  const C = {
    ink: '#2a2320',
    outline: '#3b2d28',
    rice: '#fbf7ee',
    riceSh: '#e6dccb',
    riceHi: '#ffffff',
    nori: '#2f4a3c',
    noriHi: '#44664f',
    noriDk: '#223629',
    blush: '#f3aaa0',
    woodDk: '#3e2717',
    wood: '#5a3a22',
    woodMd: '#7a4d2c',
    woodLt: '#8a5a34',
    woodHi: '#a8743f',
    woodTop: '#c89464',
    woodTopHi: '#dcaa74',
    tatami: '#cdbb7e',
    tatamiLn: '#c1ae70',
    tatamiDk: '#b39f62',
    heri: '#2f4a3a',
    paper: '#f3e6c8',
    paperSh: '#dccaa0',
    shu: '#c8412f',
    shuDk: '#9a2f22',
    gold: '#e8c25a',
    goldDk: '#b8902e',
  };

  // --------------------------------------------------------------- state
  const onigiri = INIT.onigiri || { name: 'Onigiri Kitchen', level: 0, xpInto: 0, xpNext: 50, themeColor: '#D49083' };
  const catalog = INIT.catalog || [];
  let S = Object.assign({ mon: 0, owned: [], hidden: [], guestsWaiting: 0, today: {} }, INIT.state || {});
  let conf = Object.assign({}, INIT.conf || {});
  let timer = (INIT.timer && INIT.timer.pomo) || { phase: 'idle' };
  const INIT_TIMER_MODE = { endless: !!(INIT.timer && INIT.timer.endlessMode) };
  let dispMon = S.mon;
  const theme = onigiri.themeColor || '#D49083';
  document.documentElement.style.setProperty('--theme', theme);
  let rush = false;

  const SEAT_X = [54, 132, 82, 160, 216];
  const seatCount = clamp(2 + Math.floor((onigiri.level || 0) / 5), 2, 5);
  const seats = SEAT_X.slice(0, seatCount).map((x) => ({ x, guest: null }));
  const DOOR_X = 277;

  let time = 0;
  let hover = null;
  let regions = [];
  let customers = [];
  let particles = [];
  let coins = [];
  let plates = [];
  let walkers = [];
  let orders = [];
  let trayDishes = []; // dishes the chef made ahead, waiting on the tray
  let claiming = false;
  let spawnTimer = 2.5;
  let walkerTimer = rand(3, 8);
  let fireworkTimer = 0;
  let norenSway = 0;
  let radioOn = false;
  let radioTimer = 0;
  let radioStep = 3;
  let windTimer = rand(20, 40);
  let festival = false;
  let nextId = 1;

  const chef = { state: 'idle', t: 0, target: null, blink: 2, look: 0, lookT: 3, press: 0, lineT: rand(25, 45) };
  const sparrow = { on: false, t: 0, x: 0, y: 0, phase: 'none' };
  const fish = [{ x: 0, dir: 1, y: 0 }, { x: 5, dir: -1, y: 3 }];
  const shake = {}; // per-object wobble timers

  const has = (id) => S.owned.includes(id) && !S.hidden.includes(id);

  // ---------------------------------------------------- time, sky, season
  function hourNow() {
    if (window.OK_DEBUG_HOUR != null) return window.OK_DEBUG_HOUR;
    const d = new Date();
    return d.getHours() + d.getMinutes() / 60;
  }
  const SKY = [
    [0, '#10152c', '#252a4d'],
    [4.5, '#1b2044', '#3a3a66'],
    [6, '#6c6aa8', '#f3b28a'],
    [7.5, '#86bfe0', '#d8ecf0'],
    [16, '#7cbde3', '#d4eaf0'],
    [17.5, '#e9985a', '#f7d6a0'],
    [19, '#4d3b6e', '#d9786a'],
    [20.5, '#18193a', '#302f58'],
    [24, '#10152c', '#252a4d'],
  ];
  function skyColors(h) {
    for (let i = 0; i < SKY.length - 1; i++) {
      const a = SKY[i];
      const b = SKY[i + 1];
      if (h >= a[0] && h <= b[0]) {
        const t = (h - a[0]) / (b[0] - a[0] || 1);
        return [mix(a[1], b[1], t), mix(a[2], b[2], t)];
      }
    }
    return [SKY[0][1], SKY[0][2]];
  }
  function darkness(h) {
    if (h >= 7.5 && h < 16.5) return 0;
    if (h >= 16.5 && h < 19) return (h - 16.5) / 2.5 * 0.3;
    if (h >= 5 && h < 7.5) return (7.5 - h) / 2.5 * 0.3;
    return 0.34;
  }
  function season() {
    const m = new Date().getMonth() + 1;
    if (m >= 3 && m <= 5) return 'spring';
    if (m >= 6 && m <= 8) return 'summer';
    if (m >= 9 && m <= 11) return 'autumn';
    return 'winter';
  }
  function isRaining() {
    if (window.OK_DEBUG_RAIN != null) return !!window.OK_DEBUG_RAIN;
    const d = new Date();
    const key = d.toDateString() + '|' + Math.floor(d.getHours() / 3);
    return (hash(key) % 100) < 18;
  }
  const SEASON = season();
  let raining = isRaining();
  const SEASON_LABEL = { spring: '春 · Spring', summer: '夏 · Summer', autumn: '秋 · Autumn', winter: '冬 · Winter' }[SEASON];

  // ------------------------------------------------------------ onigiri!
  // Draws an onigiri body with its top-left at (x, y). w should be odd.
  function onigiriShape(x, y, w, h, o) {
    o = o || {};
    const hwMax = (w - 1) / 2;
    const tri = Math.round(h * 0.68);
    const noriRows = o.noNori ? 0 : Math.max(2, Math.round(h * 0.34));
    const cx = x + hwMax;
    const rows = [];
    for (let r = 0; r < h; r++) {
      let hw;
      if (r < tri) hw = Math.round(hwMax * Math.min(1, 0.26 + 0.86 * ((r + 0.5) / tri)));
      else hw = hwMax;
      if (r === h - 1) hw -= 1;
      rows.push(hw);
    }
    const rice = o.rice || C.rice;
    const riceSh = o.riceSh || shade(rice, -0.09);
    const outline = o.outline || C.outline;
    // outline
    for (let r = 0; r < h; r++) R(cx - rows[r] - 1, y + r, rows[r] * 2 + 3, 1, outline);
    R(cx - rows[0] + 1, y - 1, rows[0] * 2 - 1, 1, outline);
    R(cx - rows[h - 1] + 1, y + h, rows[h - 1] * 2 - 1, 1, outline);
    // rice
    for (let r = 0; r < h - noriRows; r++) {
      R(cx - rows[r], y + r, rows[r] * 2 + 1, 1, rice);
      if (rows[r] > 1) R(cx + rows[r] - 1, y + r, 2, 1, riceSh);
    }
    P(cx - rows[1] + 1, y + 1, o.riceHi || C.riceHi);
    P(cx - rows[2] + 1, y + 2, o.riceHi || C.riceHi);
    // rice grains texture
    if (w >= 13) {
      const seed = o.seed || 1;
      for (let i = 0; i < Math.floor(w / 3); i++) {
        const rr = 1 + ((seed * (i + 3) * 7) % Math.max(1, tri - 2));
        const off = ((seed * (i + 5) * 13) % (rows[rr] * 2 + 1)) - rows[rr];
        P(cx + off, y + rr, riceSh);
      }
    }
    // nori band with a front flap
    if (noriRows) {
      const nori = o.nori || C.nori;
      for (let r = h - noriRows; r < h; r++) R(cx - rows[r], y + r, rows[r] * 2 + 1, 1, nori);
      const flap = Math.max(2, Math.round(w * 0.22));
      R(cx - flap, y + h - noriRows - 1, flap * 2 + 1, noriRows + 1, o.noriFlap || shade(nori, 0.1));
      R(cx - flap, y + h - noriRows - 1, flap * 2 + 1, 1, o.noriHi || C.noriHi);
      R(cx - rows[h - noriRows], y + h - noriRows, 1, noriRows - 1, shade(nori, -0.2));
    }
    return { cx, tri, noriTop: y + h - noriRows, rows };
  }

  function face(cx, ey, spread, o) {
    o = o || {};
    const ink = C.ink;
    const big = spread >= 5;
    const lx = cx - spread;
    const rx = cx + spread;
    if (o.mood === 'happy') {
      // ^ ^
      P(lx - 1, ey + 1, ink); P(lx, ey, ink); P(lx + 1, ey + 1, ink);
      P(rx - 1, ey + 1, ink); P(rx, ey, ink); P(rx + 1, ey + 1, ink);
    } else if (o.blink) {
      R(lx - (big ? 1 : 0), ey + 1, big ? 3 : 2, 1, ink);
      R(rx - (big ? 1 : 0), ey + 1, big ? 3 : 2, 1, ink);
    } else {
      const lo = o.look || 0;
      R(lx + lo, ey, big ? 2 : 1, 2, ink);
      R(rx + lo - (big ? 1 : 0), ey, big ? 2 : 1, 2, ink);
      if (big) { P(lx + lo, ey, '#6d625c'); P(rx + lo - 1, ey, '#6d625c'); }
    }
    if (o.mood === 'grumpy') {
      P(lx - 1, ey - 2, ink); P(lx, ey - 1, ink);
      P(rx + 1, ey - 2, ink); P(rx, ey - 1, ink);
    }
    // blush
    R(lx - 2, ey + 2, 2, 1, o.blush || C.blush);
    R(rx + 1, ey + 2, 2, 1, o.blush || C.blush);
    // mouth
    const my = ey + 3;
    if (o.mouth === 'open') {
      R(cx - 1, my, 3, 2, '#7a2b2b');
      P(cx, my + 1, '#e57b7b');
    } else if (o.mood === 'grumpy') {
      R(cx - 1, my + 1, 3, 1, ink);
    } else if (big) {
      P(cx - 2, my, ink); P(cx - 1, my + 1, ink); P(cx, my + 1, ink); P(cx + 1, my + 1, ink); P(cx + 2, my, ink);
    } else {
      P(cx - 1, my, ink); P(cx, my + 1, ink); P(cx + 1, my, ink);
    }
  }

  const FLAVORS = [
    { id: 'shake', name: 'Salmon', jp: '鮭', c: '#f08a6a' },
    { id: 'ume', name: 'Pickled plum', jp: '梅', c: '#c8304a' },
    { id: 'kombu', name: 'Kombu', jp: '昆布', c: '#4a4632' },
    { id: 'tuna', name: 'Tuna mayo', jp: 'ツナ', c: '#e3cf9f' },
    { id: 'okaka', name: 'Bonito', jp: 'おかか', c: '#8a5a3a' },
    { id: 'mentai', name: 'Mentaiko', jp: '明太子', c: '#ef7a78' },
  ];
  const ACCESSORIES = ['none', 'glasses', 'bow', 'sprout', 'headband', 'beret', 'scarf', 'cap', 'none'];
  const ACC_COLORS = ['#3b4a6b', '#c8412f', '#6f9a5c', '#e0a13a', '#8e5aa8', '#3d8a9a'];

  function guestLook(guest) {
    const key = guest.deck || guest.kind || 'guest';
    const hv = hash(key);
    return {
      flavor: FLAVORS[hv % FLAVORS.length],
      acc: guest.kind === 'golden' ? 'crown' : guest.kind === 'leech' ? 'none' : ACCESSORIES[(hv >> 4) % ACCESSORIES.length],
      accColor: ACC_COLORS[(hv >> 9) % ACC_COLORS.length],
      seed: (hv % 97) + 3,
    };
  }

  function drawGuest(cx, bottom, c, opts) {
    const w = 15;
    const h = 15;
    const x = cx - 7;
    const y = bottom - h - (opts.hop || 0);
    const golden = c.guest.kind === 'golden';
    const leech = c.guest.kind === 'leech';
    const rice = golden ? '#f6d77a' : leech && !c.cured ? '#efdcef' : C.rice;
    const shape = onigiriShape(x, y, w, h, { rice, seed: c.look.seed, riceHi: golden ? '#fff6cc' : undefined });
    // filling peeking out the top
    const fc = leech ? '#9a3b7a' : c.look.flavor.c;
    R(shape.cx - 1, y + 2, 3, 2, fc);
    P(shape.cx, y + 2, shade(fc, 0.3));
    const mood = leech && !c.cured ? 'grumpy' : opts.mood;
    face(shape.cx, y + 7, 3, { mood, blink: opts.blink, mouth: opts.mouth, look: opts.look });
    drawAccessory(shape, x, y, w, h, c.look);
    if (golden && Math.floor(time * 3 + c.id) % 4 === 0) P(x + rand(0, w), y + rand(0, h), '#fff9d9');
  }

  function drawAccessory(shape, x, y, w, h, look) {
    const cx = shape.cx;
    const col = look.accColor;
    switch (look.acc) {
      case 'glasses':
        R(cx - 5, y + 6, 4, 4, C.ink); R(cx - 4, y + 7, 2, 2, '#dff2f7');
        R(cx + 2, y + 6, 4, 4, C.ink); R(cx + 3, y + 7, 2, 2, '#dff2f7');
        R(cx - 1, y + 7, 3, 1, C.ink);
        break;
      case 'bow':
        R(cx + 2, y + 1, 2, 3, col); R(cx + 5, y + 1, 2, 3, col); R(cx + 4, y + 2, 1, 1, shade(col, -0.3));
        break;
      case 'sprout':
        P(cx, y - 2, '#4f7a3a'); P(cx, y - 3, '#4f7a3a'); R(cx - 2, y - 4, 2, 1, '#7fb35a'); R(cx + 1, y - 5, 2, 1, '#7fb35a');
        break;
      case 'headband':
        R(cx - shape.rows[4] - 1, y + 4, shape.rows[4] * 2 + 3, 2, col);
        R(cx + shape.rows[4] + 1, y + 5, 2, 2, col);
        break;
      case 'beret':
        ellipse(cx - 1, y - 1, 4, 1, col); P(cx - 1, y - 3, shade(col, -0.3));
        break;
      case 'scarf':
        R(x, shape.noriTop - 1, w, 2, col); R(x + 2, shape.noriTop + 1, 2, 3, col);
        break;
      case 'cap':
        R(cx - 3, y - 1, 7, 2, col); R(cx + 3, y, 3, 1, shade(col, -0.25));
        break;
      case 'crown':
        R(cx - 3, y - 2, 7, 2, C.gold); P(cx - 3, y - 3, C.gold); P(cx, y - 4, C.gold); P(cx + 3, y - 3, C.gold); P(cx, y - 2, C.shu);
        break;
      default:
        break;
    }
  }

  function miniOnigiri(x, y, flavorColor) {
    // 5x5 onigiri used for food on plates and on the tray
    R(x + 2, y, 1, 1, C.rice);
    R(x + 1, y + 1, 3, 1, C.rice);
    R(x, y + 2, 5, 1, C.rice);
    R(x, y + 3, 5, 2, C.nori);
    P(x + 2, y + 1, flavorColor || C.shu);
    P(x + 4, y + 2, C.riceSh);
  }

  // ---------------------------------------------------------------- menu
  // What guests order. With Onigiri, the menu is your Specials Book (every
  // Daily Special you've finished), next to the house onigiri, so it grows as
  // the Book does; golden guests order today's Daily Special. Without Onigiri,
  // the house onigiri flavours unlock as your restaurant levels up.
  const SPECIALS = INIT.specials || { found: false, book: [], today: null };
  const FLAVOR_LEVELS = { shake: 0, ume: 0, kombu: 3, tuna: 6, okaka: 10, mentai: 15 };
  const RARITY = {
    // w: how often guests order it; bonus: extra mon it tips (same as state.py)
    common: { jp: '並', name: 'Common', c: '#2fae5a', w: 1, bonus: 0 },
    uncommon: { jp: '上', name: 'Uncommon', c: '#2f7fe0', w: 0.8, bonus: 1 },
    rare: { jp: '特上', name: 'Rare', c: '#b23fd0', w: 0.6, bonus: 2 },
    epic: { jp: '極', name: 'Epic', c: '#e0701f', w: 0.45, bonus: 4 },
    legendary: { jp: '伝説', name: 'Legendary', c: '#d9a400', w: 0.3, bonus: 6 },
  };
  // golden guests tip this much more for today's special once it's finished
  // in Onigiri (same as main.py TODAY_DONE_BONUS)
  const TODAY_DONE_BONUS = 3;
  const todayDone = () => !!(SPECIALS.today && SPECIALS.today.done);
  // the main ingredient decides the colour of the filling or topping
  const INGREDIENTS = [
    [/aburi toro|otoro|chutoro|\btoro\b/, '#e8909a'], [/maguro|tekka|spicy tuna|tuna|negitoro/, '#d8404f'],
    [/sake|salmon|philadelphia|alaskan/, '#f08a6a'], [/hamachi|buri|yellowtail|kanpachi|negihama/, '#f3cdb0'],
    [/amaebi|ebi|shrimp|tempura/, '#f59a7a'], [/unagi|eel/, '#7a4a2a'], [/tamago|egg|uzura|futomaki/, '#f2cf3a'],
    [/ikura|tobiko|masago|tarako|mentai|red phoenix/, '#f06a3a'], [/uni|ankimo|kani miso/, '#e8a23a'],
    [/kani|crab|california|spider/, '#f07a5a'], [/tako|octopus/, '#d85060'], [/saba|aji|mackerel/, '#9aa8b8'],
    [/ika|hotate|scallop|tai\b|hirame|suzuki|engawa|shirako|boston/, '#f3efe6'],
    [/kappa|cucumber|avocado|asparagus|zucchini|wakame|green|vegetable|caterpillar/, '#6fae4a'],
    [/ume|plum/, '#c8304a'], [/oshinko|daikon/, '#e8d24a'], [/yamagobo|burdock|sweet potato|carrot/, '#e0843a'],
    [/shiitake|natto|kanpyo|gourd/, '#6b4a2a'], [/red pepper|jalapeno|volcano/, '#d8403a'], [/nasu|eggplant/, '#5a3a6a'],
    [/wagyu|foie/, '#c87a7a'], [/corn/, '#f2cf3a'], [/dragon/, '#4f9a4a'], [/rainbow/, '#e0508a'],
    [/matcha|pistachio/, '#7fb35a'], [/vanilla|milk carton|cream|eggnog/, '#f3e6c0'], [/chocolate|cocoa|mocha|brown sugar|espresso|cold brew/, '#6b4028'],
    [/raspberry|strawberry|candy cane|apple/, '#e0506a'], [/caramel|macchiato|gingerbread/, '#d89a4a'], [/rose/, '#f2a9c0'],
    [/gold/, '#e8c25a'], [/taro/, '#b9a0d0'], [/thai/, '#e8a05a'], [/fruit/, '#f08a6a'], [/banana/, '#f2d64a'],
    [/cheese/, '#f2cf5a'], [/cappuccino|latte|affogato|blue mountain|coffee/, '#b07a4a'], [/peppermint/, '#e8f0ea'],
    [/cookie|croissant|baguette|pain|danish|sourdough|bread|opera|wedding|cake|tiramisu/, '#d49a52'],
    [/truffle|oil/, '#b8902e'], [/milk tea|classic milk/, '#d8b48a'],
    [/temaki/, '#f08a6a'], [/chirashi/, '#f06a3a'], [/inari/, '#d49a52'], [/uramaki/, '#f07a5a'], [/north pole/, '#f3e6c0'],
  ];
  function dishKind(name) {
    const n = name.toLowerCase();
    const rules = [
      ['gunkan', /gunkan/], ['uramaki', /uramaki|roll$/], ['temaki', /temaki/], ['maki', /maki/], ['nigiri', /nigiri/],
      ['bowl', /chirashi|bowl|don\b/], ['inari', /inari/], ['boba', /boba|milk tea|thai tea|fruit tea|cheese foam/],
      ['macaron', /macaron/], ['sundae', /affogato|ice cream|parfait/], ['mochi', /mochi|dango/],
      ['cake', /cake|tiramisu/], ['cup', /latte|espresso|cappuccino|macchiato|cocoa|mocha|frappe/], ['bread', /croissant|baguette|pain au|danish|sourdough|artisan bread|\bbread\b/], ['cookie', /cookie/],
      ['milk', /milk carton/], ['cheese', /cheese/], ['bottle', /oil/], ['produce', /apple|banana|carrot/],
      ['cup', /latte|espresso|cappuccino|brew|macchiato|coffee|cocoa|mocha|frappe|matcha|special|tea/],
    ];
    for (const [k, re] of rules) if (re.test(n)) return k;
    return 'nigiri';
  }
  function dishColor(name) {
    const n = name.toLowerCase();
    for (const [re, c] of INGREDIENTS) if (re.test(n)) return c;
    const pal = ['#f08a6a', '#d8404f', '#6fae4a', '#f2cf3a', '#e8a23a', '#9aa8b8'];
    return pal[hash(n) % pal.length];
  }
  function makeDish(sp, from) {
    return { name: sp.name, desc: sp.desc || '', rarity: RARITY[sp.rarity] ? sp.rarity : 'common', kind: dishKind(sp.name), c: dishColor(sp.name), from };
  }
  const flavorDish = (f) => ({ name: `${f.name} onigiri`, jp: f.jp, desc: '', rarity: 'common', kind: 'onigiri', c: f.c, flavor: f, from: 'house' });
  function buildMenu() {
    const level = onigiri.level || 0;
    const house = FLAVORS.filter((f) => level >= (FLAVOR_LEVELS[f.id] || 0));
    const book = SPECIALS.found ? (SPECIALS.book || []).map((sp) => makeDish(sp, 'book')) : [];
    // with Onigiri the house keeps its two classics; the Book is the real menu
    const houseDishes = (book.length ? house.slice(0, 2) : house).map(flavorDish);
    return { house: houseDishes, book, today: SPECIALS.today ? makeDish(SPECIALS.today, 'today') : null };
  }
  const MENU_DISHES = buildMenu();
  const allDishes = () => MENU_DISHES.house.concat(MENU_DISHES.book);
  function pickFrom(list) {
    const total = list.reduce((a, d) => a + (RARITY[d.rarity] || RARITY.common).w, 0);
    let x = Math.random() * total;
    for (const d of list) { x -= (RARITY[d.rarity] || RARITY.common).w; if (x <= 0) return d; }
    return list[list.length - 1];
  }
  // What a guest orders: leech guests always want a sour plum, golden guests
  // the Daily Special, and everyone else something from the menu (they'll
  // often go for something already on the tray).
  function chooseDish(guest) {
    if (guest.kind === 'leech') return flavorDish(FLAVORS.find((f) => f.id === 'ume'));
    if (guest.kind === 'golden' && MENU_DISHES.today) return MENU_DISHES.today;
    if (trayDishes.length && Math.random() < 0.45) return pick(trayDishes);
    const { house, book } = MENU_DISHES;
    if (book.length && Math.random() < 0.75) return pickFrom(book);
    return house.length ? pick(house) : flavorDish(FLAVORS[0]);
  }
  const sameDish = (a, b) => a && b && a.name === b.name;

  // ------------------------------------------------------------ dish art
  // 9x7 sprites for the order bubble and the plates; 5x5 ones for the tray.
  // F / f = the dish's colour (and a darker shade), R / r = rice, N / n = nori.
  const DISH_ART = {
    nigiri: ['.........', '..FFFFF..', '.FfFFFfF.', '.RRRRRRR.', 'RRRRRRRRr', '.rrrrrrr.', '.........'],
    maki: ['..NNNNN..', '.NRRRRRN.', 'NRRFFFRRN', 'NRRFfFRRN', 'NRRRRRRRN', '.NRRRRRN.', '..NNNNN..'],
    uramaki: ['..rRkRr..', '.RRNNNRR.', 'RkNFFFNRR', 'RRNFfFNkR', 'RRNNNNNRR', '.RRRkRRR.', '..rRRRr..'],
    gunkan: ['..FfFfF..', '.FFFFFFF.', '.NNNNNNN.', '.NnNNNnN.', '.NNNNNNN.', '.rrrrrrr.', '.........'],
    temaki: ['.FFfFF...', 'RRRRRRN..', '.RRRRNN..', '..NNNN...', '...NNN...', '....N....', '.........'],
    bowl: ['.........', '.FfRFfRF.', 'UUUUUUUUU', '.UuuuuuU.', '..UUUUU..', '...UUU...', '.........'],
    inari: ['.........', '..rRRr...', '.bBBBBb..', 'bBBBBBBb.', 'BBBBBBBBb', '.BBBBBBb.', '.........'],
    cup: ['.........', '.WWWWWW..', '.CFFFFC..', '.CCCCCCcc', '.CCCCCC.c', '..CCCC.c.', '.........'],
    boba: ['....K....', '..LLKLL..', '..LFFFL..', '..LFFFL..', '..LFFFL..', '..LkkkL..', '...LLL...'],
    macaron: ['.........', '..FFFFF..', '.FFFFFFF.', '.WWWWWWW.', '.FFFFFFF.', '..fffff..', '.........'],
    cake: ['.........', '...WWp...', '..WWWWW..', '.FFFFFFF.', '.WWWWWWW.', '.FFFFFFF.', '.........'],
    bread: ['.........', '..fFFFf..', '.fFfFfFf.', 'fFFFFFFFf', '.fffffff.', '.........', '.........'],
    sundae: ['...FFF...', '..FFFFF..', '..WWWWW..', '..LLLLL..', '...LLL...', '....L....', '...LLL...'],
    mochi: ['.........', '...FFF...', '.FFFFFFF.', 'FFFFFFFFF', '.fffffff.', '.........', '.........'],
    cookie: ['.........', '..FFFFF..', '.FkFFkFF.', '.FFFFkFF.', '.FkFFFFF.', '..FFFFF..', '.........'],
    produce: ['....g....', '..FFgFF..', '.FFFFFFF.', '.FFFFFFF.', '.FFFFFFf.', '..fffff..', '.........'],
    milk: ['...LL....', '..LWWL...', '..LWWL...', '..LFFL...', '..LWWL...', '..LLLL...', '.........'],
    cheese: ['.........', '......FF.', '....FFFF.', '..FFkFFF.', 'FFFFFFkF.', 'FFfffff..', '.........'],
    bottle: ['....K....', '....F....', '...FFF...', '..FFFFF..', '..FfFFF..', '..FFFFF..', '.........'],
  };
  const DISH_MINI = {
    sushi: ['.FFF.', 'FFFFF', 'RRRRR', 'rrrrr', '.....'],
    roll: ['.NNN.', 'NRFRN', 'NFFFN', 'NRRRN', '.NNN.'],
    bowl: ['.FRF.', 'UUUUU', '.UUU.', '..U..', '.....'],
    cup: ['.FFF.', 'CCCCc', 'CCCC.', '.CC..', '.....'],
    sweet: ['.FFF.', 'FFFFF', 'WWWWW', 'FFFFF', '.fff.'],
  };
  const MINI_OF = { nigiri: 'sushi', gunkan: 'sushi', maki: 'roll', uramaki: 'roll', temaki: 'roll', inari: 'roll', bowl: 'bowl', cup: 'cup', boba: 'cup', milk: 'cup', bottle: 'cup', sundae: 'cup' };
  function dishPal(d) {
    return {
      F: d.c, f: shade(d.c, -0.25), R: C.rice, r: C.riceSh, N: C.nori, n: C.noriHi, W: '#fbf7ee', k: '#3b2d28', K: '#e8546a',
      U: '#3b4a8a', u: '#56679c', B: '#b87a3a', b: '#d49a52', C: '#f3ecd8', c: '#d8cdb4', L: '#cfe0e6', g: '#4f7a3a', p: '#e0506a',
    };
  }
  function paintRows(rows, x, y, pal, cols) {
    rows.forEach((row, j) => {
      for (let i = 0; i < Math.min(row.length, cols == null ? row.length : cols); i++) {
        const ch = row[i];
        if (ch !== '.' && pal[ch]) P(x + i, y + j, pal[ch]);
      }
    });
  }
  // big 9x7 dish with its top-left at (x, y); `cols` crops it (as it's eaten)
  function drawDish(d, x, y, cols) {
    if (!d || d.kind === 'onigiri') { bigOnigiri(x, y, d ? d.c : C.shu, cols); return; }
    paintRows(DISH_ART[d.kind] || DISH_ART.nigiri, x, y, dishPal(d), cols);
  }
  function drawDishMini(d, x, y) {
    if (!d || d.kind === 'onigiri') { miniOnigiri(x, y, d ? d.c : C.shu); return; }
    paintRows(DISH_MINI[MINI_OF[d.kind] || 'sweet'], x, y, dishPal(d));
  }
  function bigOnigiri(x, y, fc, cols) {
    const rows = ['...rRr...', '..rRFRr..', '.rRRFRRr.', '.RRRRRRR.', '.NNNNNNN.', '.NNnnnNN.', '.NNNNNNN.'];
    paintRows(rows, x, y, { R: C.rice, r: C.riceSh, F: fc, N: C.nori, n: C.noriHi }, cols);
  }
  function dishLabel(d) {
    if (!d) return '';
    const rar = RARITY[d.rarity] || RARITY.common;
    const where = d.from === 'today' ? `Onigiri's Daily Special today · ${rar.name}` : d.from === 'book' ? `${rar.name} · from your Specials Book` : 'House onigiri';
    const extra = d.from === 'today' && todayDone() ? TODAY_DONE_BONUS : 0;
    const tip = (d.from !== 'house' ? rar.bonus : 0) + extra;
    const bonus = tip ? ` · +${tip} mon tip${extra ? ' (prepared in Onigiri!)' : ''}` : '';
    return `<b>${esc(d.name)}</b> <span style="color:${rar.c}">●</span>\n${d.desc ? esc(d.desc) + '\n' : ''}${where}${bonus}`;
  }

  // -------------------------------------------------------- static layer
  const bg = document.createElement('canvas');
  bg.width = W;
  bg.height = H;
  // Drawing helpers write to gRef, so the same code can paint the static
  // background layer and the little decor icons in the shop.
  let gRef = g;
  function bindHelpers() {
    R = function (x, y, w, h, c) { gRef.fillStyle = c; gRef.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
    P = function (x, y, c) { gRef.fillStyle = c; gRef.fillRect(Math.round(x), Math.round(y), 1, 1); };
    ellipse = function (cx, cy, rx, ry, c) {
      gRef.fillStyle = c;
      for (let dy = -ry; dy <= ry; dy++) {
        const t = dy / (ry + 0.5);
        const hw = Math.round(rx * Math.sqrt(Math.max(0, 1 - t * t)));
        gRef.fillRect(Math.round(cx - hw), Math.round(cy + dy), hw * 2 + 1, 1);
      }
    };
  }
  bindHelpers();

  function paintBackground() {
    gRef = bg.getContext('2d');
    try {
      // wall planks
      for (let x = 0; x < W; x += 16) {
        R(x, 0, 16, 104, (x / 16) % 2 ? '#7f5230' : '#865733');
        R(x, 0, 1, 104, '#5e3c22');
        for (let i = 0; i < 9; i++) {
          const gx = x + 2 + ((x * 7 + i * 29) % 13);
          const gy = (x * 3 + i * 41) % 100;
          R(gx, gy, 1, 3 + (i % 3), '#744a2a');
        }
      }
      // top beam
      R(0, 0, W, 3, C.woodDk);
      R(0, 3, W, 1, '#6b4428');
      // wainscot
      R(0, 86, W, 2, C.woodDk);
      R(0, 88, W, 16, '#6e4527');
      for (let x = 6; x < W; x += 12) R(x, 88, 1, 16, '#5e3a20');
      // doma (earth floor) and the raised tatami platform
      R(0, 104, W, 24, '#8b7a64');
      for (let i = 0; i < 70; i++) P((i * 53) % W, 106 + ((i * 17) % 20), i % 2 ? '#7d6d58' : '#9a8972');
      R(0, 126, W, 3, C.woodDk);
      R(0, 125, W, 1, '#a8743f');
      R(0, 129, W, H - 129, C.tatami);
      for (let y = 131; y < H; y += 2) R(0, y, W, 1, C.tatamiLn);
      for (let x = 0; x < W; x += 80) R(x, 129, 2, H - 129, C.heri);
      R(0, 155, W, 2, C.heri);
    } finally {
      gRef = g;
    }
  }

  // --------------------------------------------------------------- window
  const WIN = { x: 12, y: 16, w: 82, h: 60 };
  let clouds = [{ x: 10, y: 8, s: 1 }, { x: 55, y: 16, s: 0 }, { x: 90, y: 5, s: 1 }];
  let stars = Array.from({ length: 16 }, (_, i) => ({ x: (i * 37) % 76, y: (i * 23) % 30, p: i }));

  function drawWindow(h) {
    const { x, y, w } = WIN;
    const ih = WIN.h;
    const [top, bottom] = skyColors(h);
    const ix = x + 2;
    const iy = y + 2;
    const iw = w - 4;
    const inh = ih - 4;
    gRef.save();
    gRef.beginPath();
    gRef.rect(ix, iy, iw, inh);
    gRef.clip();
    // banded sky
    const bands = 7;
    for (let i = 0; i < bands; i++) {
      R(ix, iy + Math.floor((inh * i) / bands), iw, Math.ceil(inh / bands) + 1, mix(top, bottom, i / (bands - 1)));
    }
    const night = h < 5.5 || h >= 19.5;
    if (raining) R(ix, iy, iw, inh, 'rgba(70,80,100,0.35)');
    // stars
    if (night && !raining) {
      for (const s of stars) if (Math.floor(time * 1.5 + s.p) % 5) P(ix + 2 + s.x, iy + 2 + s.y, '#f5f0d8');
    }
    // sun / moon
    if (!raining) {
      if (h >= 6 && h < 19) {
        const t = (h - 6) / 13;
        const sx = ix + 8 + t * (iw - 16);
        const sy = iy + 30 - Math.sin(t * Math.PI) * 24;
        ellipse(sx, sy, 4, 4, h > 17 ? '#f6b26b' : '#fff1b8');
      } else {
        ellipse(ix + iw - 18, iy + 9, 4, 4, '#f7efd0');
        ellipse(ix + iw - 16, iy + 8, 3, 3, top);
      }
    }
    // clouds
    for (const c of clouds) {
      const cx = ix + ((c.x + time * (c.s ? 1.2 : 0.7)) % (iw + 30)) - 15;
      const col = night ? '#3a3d62' : raining ? '#9aa3b3' : '#ffffff';
      ellipse(cx, iy + c.y, 6, 2, col);
      ellipse(cx + 5, iy + c.y - 1, 4, 2, col);
    }
    // Fuji
    const mcol = night ? '#2c2f55' : mix('#6a6fa8', top, 0.35);
    for (let r = 0; r < 20; r++) {
      const hw = Math.round(4 + r * 1.6);
      R(ix + 34 - hw, iy + inh - 26 + r, hw * 2, 1, mcol);
    }
    for (let r = 0; r < 5; r++) {
      const hw = Math.round(4 + r * 1.6);
      R(ix + 34 - hw, iy + inh - 26 + r, hw * 2, 1, night ? '#c9cbe6' : '#fbfbff');
    }
    P(ix + 31, iy + inh - 21, mcol); P(ix + 36, iy + inh - 21, mcol);
    // tree line & street
    const tcol = night ? '#1e2a2a' : SEASON === 'autumn' ? '#b5562f' : SEASON === 'spring' ? '#e7a7bd' : SEASON === 'winter' ? '#e8eef5' : '#4f7a3a';
    for (let i = 0; i < 12; i++) ellipse(ix + i * 7 + 2, iy + inh - 9, 4, 3, i % 2 ? tcol : shade(tcol, -0.12));
    R(ix, iy + inh - 6, iw, 6, night ? '#3a3440' : '#b8a88e');
    R(ix, iy + inh - 6, iw, 1, night ? '#4a4450' : '#cbbca2');
    // walkers outside
    for (const wk of walkers) {
      if (wk.penguin) {
        // a little coloured penguin, waddling side to side
        const sway = Math.floor(time * 5 + wk.p) % 2;
        const bx = ix + wk.x + sway;
        const by = iy + inh - 10;
        R(bx + 1, by, 3, 2, wk.c); R(bx, by + 2, 5, 3, wk.c);
        R(bx + 1 + (wk.dir > 0 ? 1 : 0), by + 2, 2, 3, '#fbfbf8');
        P(bx + (wk.dir > 0 ? 3 : 1), by + 1, '#fbfbf8');
        P(bx + (wk.dir > 0 ? 5 : -1), by + 1, '#f0a020');
        R(bx + sway, by + 5, 2, 1, '#f0a020'); R(bx + 3 - sway, by + 5, 2, 1, '#f0a020');
        if (raining) { R(bx - 2, by - 3, 9, 1, wk.u); R(bx - 1, by - 4, 7, 1, wk.u); R(bx + 2, by - 2, 1, 2, C.woodDk); }
        continue;
      }
      const bob = Math.floor(time * 6 + wk.p) % 2;
      const bx = ix + wk.x;
      const by = iy + inh - 10 - bob;
      R(bx + 2, by, 1, 1, wk.c);
      R(bx + 1, by + 1, 3, 1, wk.c);
      R(bx, by + 2, 5, 2, wk.c);
      R(bx, by + 4, 5, 2, shade(wk.c, -0.45));
      if (raining) {
        R(bx - 2, by - 3, 9, 1, wk.u);
        R(bx - 1, by - 4, 7, 1, wk.u);
        R(bx + 2, by - 2, 1, 2, C.woodDk);
      }
    }
    gRef.restore();
    // frame and shoji lattice
    R(x, y, w, 2, C.woodDk);
    R(x, y + ih - 2, w, 2, C.woodDk);
    R(x, y, 2, ih, C.woodDk);
    R(x + w - 2, y, 2, ih, C.woodDk);
    R(x + Math.round(w / 3), y, 1, ih, C.wood);
    R(x + Math.round((2 * w) / 3), y, 1, ih, C.wood);
    R(x, y + Math.round(ih / 2) - 6, w, 1, C.wood);
    // sudare (rolled bamboo blind)
    R(x + 2, y + 2, w - 4, 3, '#c9a869');
    for (let i = x + 3; i < x + w - 3; i += 3) P(i, y + 3, '#a8864a');
    // sill
    R(x - 2, y + ih, w + 4, 3, C.woodMd);
    R(x - 2, y + ih, w + 4, 1, C.woodHi);
    regions.push({ x, y, w, h: ih, label: `<b>窓</b> Window\n${SEASON_LABEL}${raining ? ' · rain' : ''}`, click: () => callSparrow() });
  }

  // -------------------------------------------------------------- lanterns
  // The paper lanterns light up together, as one string of lights.
  let lanternsOn = darkness(hourNow()) > 0.05;
  function chochin(cx, top, h, body, lit) {
    const rx = Math.round(h * 0.42);
    R(cx - 2, top, 5, 2, C.woodDk);
    for (let r = 0; r < h; r++) {
      const t = (r + 0.5) / h * 2 - 1;
      const hw = Math.max(1, Math.round(rx * Math.sqrt(1 - t * t * 0.85)));
      R(cx - hw, top + 2 + r, hw * 2 + 1, 1, lit ? shade(body, 0.12) : body);
    }
    for (let r = 2; r < h; r += 3) {
      const t = (r + 0.5) / h * 2 - 1;
      const hw = Math.max(1, Math.round(rx * Math.sqrt(1 - t * t * 0.85)));
      R(cx - hw, top + 2 + r, hw * 2 + 1, 1, shade(body, -0.18));
    }
    R(cx - 2, top + 2 + h, 5, 2, C.woodDk);
    if (lit) R(cx - 1, top + 4, 1, h - 4, 'rgba(255,245,200,0.45)');
  }

  const STRING_LANTERNS = [110, 136, 162, 188, 214];
  const FESTIVAL_LANTERNS = [[10, '#c8412f'], [30, '#f3e6c8'], [50, '#3b6ea5'], [70, '#e0a13a'], [88, '#c8412f']];
  function drawLanterns(lit) {
    // rope
    for (let x = 100; x < 232; x++) P(x, 5 + Math.round(Math.sin((x - 100) / 26 * Math.PI) * 2), '#2b1c12');
    STRING_LANTERNS.forEach((x, i) => {
      const sway = Math.round(Math.sin(time * 1.3 + i) * 0.6);
      R(x, 6, 1, 2, '#2b1c12');
      chochin(x + sway, 8, 7, i % 2 ? '#f3e6c8' : '#e8c897', lit);
    });
    regions.push({ x: 100, y: 4, w: 132, h: 16, label: '<b>提灯</b> Paper lanterns\nClick to switch them ' + (lanternsOn ? 'off' : 'on'), click: toggleLanterns });
    // festival string (decor)
    if (has('matsuri')) {
      for (let x = 0; x < 98; x++) P(x, 4 + Math.round(Math.sin(x / 24 * Math.PI) * 2), '#2b1c12');
      FESTIVAL_LANTERNS.forEach(([x, col], i) => {
        const sway = Math.round(Math.sin(time * 1.1 + i * 2) * 0.6);
        R(x, 5, 1, 2, '#2b1c12');
        chochin(x + sway, 6, 6, col, lit);
      });
      regions.push({ x: 0, y: 2, w: 98, h: 14, label: '<b>祭り提灯</b> Festival lanterns', click: toggleLanterns });
    }
    // big red akachochin by the door
    const sway = Math.round(Math.sin(time * 0.9) * 0.7);
    R(245, 14, 1, 6, '#2b1c12');
    chochin(245 + sway, 20, 16, '#c8412f', lit);
    regions.push({ x: 237, y: 18, w: 17, h: 22, label: '<b>赤提灯</b> Akachōchin\nThe red lantern of a cozy eatery', click: toggleLanterns });
  }

  function toggleLanterns() {
    lanternsOn = !lanternsOn;
    OKSound.blip();
  }

  // --------------------------------------------------------------- candles
  // Each table candle (and the igloo lamp) is its own little flame: click to
  // light or snuff it. The flame grows and fades, with sparks on lighting and
  // a curl of smoke when it goes out.
  const LAMP_IDS = ['t0', 't1', 't2', 'kama'];
  const lamps = {};
  {
    const dark = darkness(hourNow()) > 0.05;
    LAMP_IDS.forEach((id, i) => { lamps[id] = { on: dark, glow: dark ? 1 : 0, delay: 0, seed: i * 1.7 }; });
  }
  function updateLamps(dt) {
    for (const id of LAMP_IDS) {
      const l = lamps[id];
      if (l.delay > 0) { l.delay -= dt; continue; }
      if (l.on && l.glow < 1) l.glow = Math.min(1, l.glow + dt * 1.6);
      else if (!l.on && l.glow > 0) l.glow = Math.max(0, l.glow - dt * 1.1);
    }
  }
  // flame height wobbles a little, like a real candle
  const flicker = (l) => 0.82 + 0.1 * Math.sin(time * 11 + l.seed) + 0.08 * Math.sin(time * 23 + l.seed * 3);
  function lampOn(id, on, x, y, delay) {
    const l = lamps[id];
    if (l.on === on) return;
    l.on = on;
    l.delay = delay || 0;
    if (delay) return;
    if (on) {
      for (let i = 0; i < 5; i++) particles.push({ x: x + rand(-1, 1), y, vx: rand(-10, 10), vy: -rand(6, 16), life: rand(0.3, 0.6), c: pick(['#ffd27a', '#fff3c4', '#f7a23a']), type: 'spark' });
      OKSound.pluck(9);
    } else {
      for (let i = 0; i < 4; i++) particles.push({ x: x + rand(-1, 1), y: y - 1, vx: rand(-2, 2), vy: -rand(4, 8), life: rand(0.9, 1.6), c: 'rgba(214,210,224,0.75)', type: 'steam' });
      OKSound.pop();
    }
  }
  function toggleLamp(id, x, y) { lampOn(id, !lamps[id].on, x, y); }
  // A little candle flame: (cx, base) is its bottom centre; h its full height.
  function flame(cx, base, h, l) {
    if (l.glow <= 0.02) return;
    const fh = Math.max(1, Math.round(h * l.glow * flicker(l)));
    const sway = Math.round(Math.sin(time * 7 + l.seed) * 0.6);
    const a = gRef.globalAlpha;
    gRef.globalAlpha = a * Math.min(1, l.glow * 1.4);
    for (let j = 0; j < fh; j++) {
      const f = j / fh;
      const x = cx + (f > 0.5 ? sway : 0);
      const w = f < 0.4 && fh > 2 ? 3 : 1;
      R(x - Math.floor(w / 2), base - j, w, 1, f < 0.34 ? '#f59a3a' : f < 0.72 ? '#ffd27a' : '#fff3c4');
    }
    gRef.globalAlpha = a;
  }
  const lampTip = (l, what) => `${what}\n${l.on ? 'Click to snuff the candle' : 'Click to light the candle'}`;

  // ------------------------------------------------------------ menu tags
  const MENU = [
    { jp: '鮭', en: 'Salmon', c: C.paper },
    { jp: '梅', en: 'Pickled plum', c: C.paper },
    { jp: '昆布', en: 'Kombu', c: C.paper },
    { jp: '鰹', en: 'Bonito flakes', c: C.paper },
    { jp: '本日', en: "Today's special", c: C.shu },
  ];
  const KIND_JP = { nigiri: '握', maki: '巻', uramaki: '裏巻', gunkan: '軍艦', temaki: '手巻', bowl: '散', inari: '稲荷', boba: '茶', cup: '珈琲', macaron: '菓', cake: '菓', bread: '焼', sundae: '氷', mochi: '餅', cookie: '菓', produce: '果', milk: '乳', cheese: '乳', bottle: '油' };
  // a short Japanese label for a menu tag: the main ingredient if we know it
  const TAG_JP = [
    [/negitoro/, 'ネギトロ'], [/otoro|chutoro|\btoro\b/, 'トロ'], [/negihama|hamachi|buri|yellowtail/, '鰤'], [/kanpachi/, '間八'],
    [/maguro|tekka|tuna/, '鮪'], [/sake|salmon/, '鮭'], [/amaebi|ebi|shrimp/, '海老'], [/unagi|eel/, '鰻'],
    [/tamago|egg/, '玉子'], [/ikura/, 'いくら'], [/uni\b/, '雲丹'], [/kani|crab/, '蟹'], [/tako/, '蛸'], [/ika\b/, '烏賊'],
    [/saba/, '鯖'], [/aji\b/, '鯵'], [/\btai\b/, '鯛'], [/hotate|scallop/, '帆立'], [/kappa|cucumber/, '胡瓜'],
    [/oshinko|daikon/, '新香'], [/kanpyo|gourd/, '干瓢'], [/yamagobo|burdock/, '牛蒡'], [/ume/, '梅'], [/natto/, '納豆'],
    [/shiitake/, '椎茸'], [/futomaki/, '太巻'], [/dragon/, '龍'], [/rainbow/, '虹'], [/volcano/, '火山'], [/wagyu/, '和牛'],
    [/avocado/, '鰐梨'], [/sweet potato/, '芋'], [/matcha/, '抹茶'], [/macaron/, '菓子'], [/boba|milk tea/, 'タピ'],
  ];
  function tagJp(d) {
    const n = d.name.toLowerCase();
    for (const [re, jp] of TAG_JP) if (re.test(n)) return jp;
    return KIND_JP[d.kind] || '品';
  }
  function menuTags() {
    const tags = [];
    const used = new Set();
    for (const d of MENU_DISHES.book) {
      if (tags.length >= 4) break;
      const jp = tagJp(d);
      if (used.has(jp)) continue;
      used.add(jp);
      tags.push({ jp, label: dishLabel(d) });
    }
    const wall = ['shake', 'ume', 'kombu', 'okaka'].map((id) => FLAVORS.find((f) => f.id === id));
    for (const f of wall) {
      if (tags.length >= 4) break;
      const need = FLAVOR_LEVELS[f.id] || 0;
      const open = (onigiri.level || 0) >= need;
      if (used.has(f.jp)) continue;
      used.add(f.jp);
      tags.push(open
        ? { jp: f.jp, label: `<b>${f.jp}</b> ${f.name} onigiri\nOn the menu` }
        : { jp: f.jp, locked: true, label: `<b>${f.jp}</b> ${f.name} onigiri\nUnlocks at restaurant level ${need}` });
    }
    return tags;
  }
  const MENU_TAGS = menuTags();
  function specialTag() {
    const t = SPECIALS.today;
    if (!t) return `<b>本日</b> Today's special\n${S.today.reviews || 0} cards reviewed today`;
    const d = MENU_DISHES.today;
    const rar = RARITY[d.rarity] || RARITY.common;
    return `<b>本日</b> Today's special: <b>${esc(t.name)}</b> <span style="color:${rar.c}">●</span>\n${d.desc ? esc(d.desc) + '\n' : ''}` +
      (t.done ? `<b>済</b> ✓ Prepared in Onigiri! Golden guests tip +${TODAY_DONE_BONUS} more for it` : `${t.progress}/${t.target} cards in Onigiri · golden guests order it (finish it for +${TODAY_DONE_BONUS})`);
  }
  function drawMenu() {
    R(102, 20, 66, 2, C.woodDk);
    MENU.forEach((m, i) => {
      const x = 104 + i * 13;
      const sw = shake['menu' + i] > 0 ? Math.round(Math.sin(shake['menu' + i] * 30) * 1) : 0;
      const tag = i < 4 ? MENU_TAGS[i] : null;
      const paper = tag && tag.locked ? '#cfc3aa' : m.c;
      R(x + sw, 22, 10, 28, C.woodDk);
      R(x + 1 + sw, 23, 8, 26, paper);
      R(x + 1 + sw, 48, 8, 1, shade(paper, -0.15));
      if (i === 4 && todayDone()) { // 済 seal: today's special is done in Onigiri
        R(x + 2 + sw, 41, 6, 6, '#fff8ee');
        R(x + 2 + sw, 41, 6, 1, '#f3e6d2');
      }
      const label = i === 4 ? `${specialTag()}\nClick to play a note ♪` : tag ? `${tag.label}\nClick to play a note ♪` : `<b>${m.jp}</b> ${m.en}`;
      regions.push({ x, y: 22, w: 10, h: 28, label, click: () => { shake['menu' + i] = 0.4; OKSound.pluck(3 + i); } });
    });
  }

  // ------------------------------------------------------------------ door
  function drawDoor(h) {
    const x = 256;
    const y = 22;
    const w = 42;
    const dh = 104;
    const night = h < 5.5 || h >= 19.5;
    const [top] = skyColors(h);
    // outside view through the doorway
    R(x, y, w, dh, night ? '#262a44' : mix(top, '#f3e3c0', 0.55));
    R(x, y + dh - 18, w, 18, night ? '#3a3440' : '#b8a88e');
    for (let i = 0; i < 5; i++) R(x + 3 + i * 8, y + dh - 12 + (i % 2) * 4, 6, 2, night ? '#4a4450' : '#cbbca2');
    // guests waiting outside (up to 3 peeking silhouettes)
    const waiting = Math.min(3, S.guestsWaiting || 0);
    for (let i = 0; i < waiting; i++) {
      const gx = x + 6 + i * 12;
      const gy = y + dh - 22 - (Math.floor(time * 2 + i) % 2);
      const col = night ? '#8d8aa8' : '#efe6d4';
      R(gx + 3, gy, 1, 1, col); R(gx + 2, gy + 1, 3, 1, col); R(gx + 1, gy + 2, 5, 2, col); R(gx, gy + 4, 7, 3, col);
      R(gx, gy + 7, 7, 3, night ? '#3a4a5a' : '#6f8a7a');
      P(gx + 2, gy + 4, '#6a5a50'); P(gx + 4, gy + 4, '#6a5a50');
    }
    // frame
    R(x - 3, y - 3, w + 6, 3, C.woodDk);
    R(x - 3, y, 3, dh, C.woodDk);
    R(x + w, y, 3, dh, C.woodDk);
    R(x - 1, y, 1, dh, C.woodHi);
    // noren (split curtain in the restaurant's theme colour)
    const nc = theme;
    const panels = 3;
    const pw = Math.floor((w - 2) / panels);
    for (let p = 0; p < panels; p++) {
      const px = x + 1 + p * pw;
      const sway = Math.round(Math.sin(time * 2 + p) * norenSway * 3);
      for (let r = 0; r < 30; r++) {
        const off = Math.round((r / 30) * sway);
        R(px + off, y + r, pw - 1, 1, r < 2 ? shade(nc, -0.25) : nc);
      }
    }
    // emblem: white circle with an onigiri
    ellipse(x + w / 2, y + 16, 6, 6, '#fbf7ee');
    R(x + w / 2 - 0.5, y + 12, 1, 1, nc);
    R(x + w / 2 - 1.5, y + 13, 3, 1, nc);
    R(x + w / 2 - 2.5, y + 14, 5, 2, nc);
    R(x + w / 2 - 2.5, y + 16, 5, 3, shade(nc, -0.35));
    R(x - 3, y - 1, w + 6, 2, C.wood);
    regions.push({ x, y, w, h: 32, label: '<b>暖簾</b> Noren\nThe shop curtain. Hung out when you are open.', click: () => { norenSway = 1; OKSound.pop(); } });

    // open / preparing plaque
    const preparing = timer.phase === 'focus';
    R(239, 62, 13, 24, C.woodDk);
    R(240, 63, 11, 22, preparing ? '#e8dcc0' : '#f3e6c8');
    R(245, 58, 1, 4, '#2b1c12');
    regions.push({
      x: 239, y: 58, w: 13, h: 28,
      label: preparing ? '<b>準備中</b> Preparing\nA focus session is running. Guests are lining up.' : '<b>営業中</b> Open for business',
      click: () => OKSound.pop(),
    });
  }

  // ----------------------------------------------------------------- decor
  const DECOR = {
    bonsai: { x: 8, y: 102, w: 24, h: 24, draw: drawBonsai },
    furin: { x: 84, y: 18, w: 7, h: 18, draw: drawFurin },
    kakejiku: { x: 178, y: 18, w: 14, h: 46, draw: drawKakejiku },
    maneki: { x: 42, y: 91, w: 11, h: 13, draw: drawManeki },
    daruma: { x: 201, y: 45, w: 12, h: 13, draw: drawDaruma },
    kingyo: { x: 208, y: 91, w: 15, h: 13, draw: drawKingyo },
    sakura: { x: 237, y: 96, w: 16, h: 30, draw: drawSakura },
    radio: { x: 217, y: 46, w: 16, h: 12, draw: drawRadio },
    matsuri: { x: 0, y: 2, w: 98, h: 14, draw: () => {} },
    tanuki: { x: 302, y: 104, w: 17, h: 24, draw: drawTanuki },
    kamakura: { x: 83, y: 93, w: 15, h: 11, draw: drawKamakura },
  };

  // かまくら: a snow hut on the counter; the candle inside glows after dark
  function drawKamakura(x, y) {
    ellipse(x + 7, y + 7, 7, 5, '#f4f8fc');
    R(x, y + 7, 15, 4, '#f4f8fc');
    R(x + 1, y + 10, 13, 1, '#d3dde8');
    for (let i = 0; i < 3; i++) R(x + 2 + i * 4, y + 4 + (i % 2), 3, 1, '#dbe5ef');
    R(x + 1, y + 8, 12, 1, '#dbe5ef');
    const l = lamps.kama;
    const inside = mix('#5a6878', '#f7c86a', l.glow * flicker(l));
    ellipse(x + 7, y + 9, 3, 2, inside);
    R(x + 4, y + 9, 7, 2, inside);
    if (l.glow > 0.05) R(x + 5, y + 10, 5, 1, mix(inside, '#ffe39a', l.glow));
    flame(x + 7, y + 10, 3, l);
    P(x + 3, y + 3, '#ffffff'); P(x + 4, y + 2, '#ffffff');
  }

  function drawBonsai(x, y) {
    R(x, y + 20, 24, 2, C.woodDk); R(x + 2, y + 22, 2, 2, C.woodDk); R(x + 20, y + 22, 2, 2, C.woodDk);
    R(x + 6, y + 15, 12, 5, '#3b4a6b'); R(x + 6, y + 15, 12, 1, '#56678c');
    line(x + 12, y + 15, x + 10, y + 10, '#5a3a22'); line(x + 10, y + 10, x + 14, y + 6, '#5a3a22');
    line(x + 11, y + 11, x + 16, y + 9, '#5a3a22');
    const weeks = Math.min(3, Math.floor((S.today.date && S.firstSeen ? (new Date(S.today.date) - new Date(S.firstSeen)) / 6048e5 : 0)));
    ellipse(x + 8, y + 9, 4, 2, '#4f7a3a'); ellipse(x + 9, y + 8, 3, 1, '#6a9a4a');
    ellipse(x + 16, y + 7, 5, 2, '#4f7a3a'); ellipse(x + 16, y + 6, 3, 1, '#7fb35a');
    ellipse(x + 13, y + 4, 4, 2, '#4f7a3a'); ellipse(x + 13, y + 3, 2, 1, '#8cbf5e');
    if (weeks >= 1) { ellipse(x + 5, y + 12, 3, 1, '#4f7a3a'); }
    if (weeks >= 2) { ellipse(x + 20, y + 11, 3, 1, '#4f7a3a'); }
    if (weeks >= 3) { ellipse(x + 13, y + 1, 2, 1, '#8cbf5e'); }
  }
  function drawFurin(x, y) {
    const sw = Math.round(Math.sin(time * 2.2) * (shake.furin > 0 ? 2 : 0.6));
    R(x + 3, y, 1, 4, '#2b1c12');
    ellipse(x + 3, y + 6, 3, 2, '#bfe3ec');
    R(x, y + 7, 7, 1, '#bfe3ec');
    P(x + 2, y + 5, C.shu); P(x + 4, y + 6, C.shu);
    R(x + 3 + sw, y + 9, 1, 3, '#2b1c12');
    R(x + 2 + sw * 2, y + 12, 3, 6, '#e8d8a0');
  }
  function drawKakejiku(x, y) {
    R(x - 1, y, 16, 2, C.woodDk);
    R(x, y + 2, 14, 42, '#6b5a3a');
    R(x + 2, y + 4, 10, 38, '#efe6cf');
    R(x - 1, y + 44, 16, 2, C.woodDk);
    P(x - 2, y + 45, C.gold); P(x + 15, y + 45, C.gold);
    R(x + 7, y - 4, 1, 4, '#2b1c12');
  }
  function drawManeki(x, y, t) {
    const paw = Math.round((Math.sin(t * (shake.maneki > 0 ? 14 : 3)) + 1) * 1);
    ellipse(x + 5, y + 9, 5, 4, '#fbf7ee');
    ellipse(x + 5, y + 4, 4, 3, '#fbf7ee');
    P(x + 2, y, '#fbf7ee'); P(x + 8, y, '#fbf7ee'); P(x + 2, y + 1, '#f3aaa0'); P(x + 8, y + 1, '#f3aaa0');
    P(x + 3, y + 4, C.ink); P(x + 7, y + 4, C.ink); P(x + 5, y + 5, '#e57b7b');
    R(x + 1, y + 7, 9, 1, C.shu); P(x + 5, y + 8, C.gold);
    R(x + 9, y + 2 - paw, 2, 4, '#fbf7ee'); P(x + 9, y + 2 - paw, '#f3aaa0');
    P(x + 3, y + 10, '#e0a13a'); P(x + 6, y + 11, C.ink);
  }
  function drawDaruma(x, y) {
    const sw = shake.daruma > 0 ? Math.round(Math.sin(shake.daruma * 25) * 1) : 0;
    ellipse(x + 6 + sw, y + 7, 6, 6, C.shu);
    ellipse(x + 6 + sw, y + 5, 4, 3, '#fbf1e0');
    const done = (S.today.focus_done || 0);
    const eye = (ex, painted) => { R(ex, y + 4, 2, 2, painted ? C.ink : '#fbf1e0'); if (!painted) { P(ex, y + 4, '#caa'); } };
    eye(x + 3 + sw, done >= 1);
    eye(x + 7 + sw, done >= 4);
    R(x + 4 + sw, y + 10, 5, 1, C.gold);
    P(x + 2 + sw, y + 3, shade(C.shu, 0.25));
  }
  function drawKingyo(x, y) {
    ellipse(x + 7, y + 7, 7, 6, 'rgba(190,225,240,0.75)');
    R(x + 1, y + 5, 13, 7, 'rgba(120,180,220,0.55)');
    R(x + 2, y + 11, 11, 1, '#b8a88e');
    R(x + 3, y, 9, 1, '#dff2f7');
    fish.forEach((f) => {
      const fx = x + 3 + Math.round(f.x);
      const fy = y + 6 + f.y;
      R(fx, fy, 3, 2, '#f07a3a');
      P(f.dir > 0 ? fx - 1 : fx + 3, fy, '#f5a06a');
      P(f.dir > 0 ? fx + 2 : fx, fy, C.ink);
    });
    P(x + 4, y + 3, '#ffffff');
  }
  function drawSakura(x, y) {
    R(x + 5, y + 20, 7, 10, '#9ec5b0'); R(x + 5, y + 20, 7, 1, '#bfe0cd'); R(x + 6, y + 29, 5, 1, '#6e9a85');
    line(x + 8, y + 20, x + 6, y + 8, '#4a2f1c'); line(x + 7, y + 13, x + 13, y + 4, '#4a2f1c'); line(x + 6, y + 10, x + 2, y + 3, '#4a2f1c');
    [[2, 3], [5, 7], [13, 4], [11, 7], [6, 1], [9, 10], [3, 9], [14, 1]].forEach(([bx, by], i) => {
      R(x + bx - 1, y + by - 1, 3, 3, i % 2 ? '#f7c6d4' : '#f2a9c0');
      P(x + bx, y + by, '#fff0f4');
    });
  }
  function drawRadio(x, y) {
    R(x, y + 2, 16, 10, '#7a4d2c'); R(x, y + 2, 16, 1, '#a8743f');
    R(x + 2, y + 4, 7, 6, '#d9c8a0');
    for (let i = 0; i < 3; i++) R(x + 3, y + 5 + i * 2, 5, 1, '#8b7a64');
    ellipse(x + 12, y + 7, 2, 2, '#3e2717'); P(x + 12, y + 6, radioOn ? '#ffd27a' : '#6b5a3a');
    line(x + 13, y + 2, x + 15, y - 1, '#2b1c12');
  }
  function drawTanuki(x, y) {
    ellipse(x + 8, y + 16, 7, 7, '#8a6a4a');
    ellipse(x + 8, y + 17, 4, 5, '#e8d4b0');
    ellipse(x + 8, y + 7, 5, 4, '#8a6a4a');
    R(x + 4, y + 6, 3, 2, '#3e2717'); R(x + 10, y + 6, 3, 2, '#3e2717');
    P(x + 5, y + 6, '#fff'); P(x + 11, y + 6, '#fff');
    P(x + 8, y + 9, C.ink);
    ellipse(x + 8, y + 2, 7, 2, '#c9a869'); R(x + 6, y - 1, 5, 2, '#b8944f');
    R(x + 14, y + 13, 3, 6, '#f3e6c8'); R(x + 14, y + 13, 3, 1, C.shu);
  }

  function decorLabel(id) {
    const item = catalog.find((c) => c.id === id);
    if (!item) return '';
    if (id === 'kamakura') return lampTip(lamps.kama, `<b>${item.jp}</b> ${item.name}`);
    return `<b>${item.jp}</b> ${item.name}\n${item.desc}`;
  }

  // 漢数字: 10 → 十, 23 → 二十三, 105 → 百五, 2026 → 二千二十六
  function kanjiNum(n) {
    n = Math.max(0, Math.floor(n));
    if (n === 0) return '零';
    const d = '〇一二三四五六七八九';
    const units = ['', '十', '百', '千'];
    let out = '';
    const man = Math.floor(n / 10000);
    if (man) { out += kanjiNum(man) + '万'; n %= 10000; }
    String(n).padStart(4, '0').split('').forEach((ch, i) => {
      const v0 = +ch;
      const u = units[3 - i];
      if (!v0) return;
      out += (v0 === 1 && u ? '' : d[v0]) + u;
    });
    return out;
  }

  // Specials Book rewards (earned by collecting Onigiri specials)
  function drawRewards() {
    const book = MENU_DISHES.book;
    if (has('kin_gaku')) {
      // golden frame by the door with your first Epic special
      const x = 303;
      const y = 20;
      R(x, y, 15, 14, C.goldDk); R(x + 1, y + 1, 13, 12, C.gold); R(x + 2, y + 2, 11, 10, '#3e2717');
      const epic = book.find((d) => d.rarity === 'epic');
      if (epic) paintRows(DISH_ART[epic.kind] || DISH_ART.nigiri, x + 3, y + 3, dishPal(epic), 9);
      if (Math.floor(time * 2) % 4 === 0) P(x + 13, y + 1, '#fff6cc');
      R(x + 7, y - 3, 1, 3, '#2b1c12');
      regions.push({ x, y: y - 3, w: 15, h: 17, label: `<b>金の額</b> Golden frame\n${epic ? `Your first Epic special: ${esc(epic.name)}` : 'An Epic special from your Specials Book'}`, click: () => { OKSound.chime(); spawnHearts(x + 7, y, 1); } });
    }
    if (has('shinagaki')) {
      // specials board: how many you've collected (the number is drawn in hi-res text)
      const x = 303;
      const y = 40;
      R(x, y, 15, 34, '#5a3a22'); R(x + 1, y + 1, 13, 32, '#7a4d2c'); R(x + 2, y + 2, 11, 30, '#efe6cf');
      R(x + 7, y - 3, 1, 3, '#2b1c12');
      regions.push({ x, y: y - 3, w: 15, h: 37, label: `<b>品書き</b> Specials board · ${kanjiNum(book.length)}品\n${book.length} specials collected in your Onigiri Specials Book\nTap to open the menu`, click: openOshinagaki });
    }
    if (has('densetsu_bocho')) {
      // the legendary knife on a little rack above the chef
      const x = 107;
      const y = 62;
      R(x, y + 4, 28, 2, '#5a3a22');
      R(x + 4, y + 2, 5, 2, '#2b1c12'); R(x + 9, y + 2, 16, 2, '#dfe7ee'); R(x + 9, y + 2, 16, 1, '#ffffff'); P(x + 25, y + 3, '#dfe7ee');
      R(x + 8, y + 1, 1, 4, C.gold);
      if (Math.floor(time * 1.5) % 4 === 0) P(x + 12 + Math.floor(time * 6) % 12, y + 2, '#fff6cc');
      const leg = book.find((d) => d.rarity === 'legendary');
      regions.push({ x, y, w: 28, h: 7, label: `<b>伝説の包丁</b> Legendary knife\n${leg ? `For your first Legendary special: ${esc(leg.name)}` : 'For a Legendary special'}`, click: () => { OKSound.chime(); spawnHearts(x + 14, y, 2); } });
    }
  }

  // 柱時計: a clock on real time, either a wooden wall clock or a flip clock
  // (tap to swap; remembered in your settings). The hands and flip cards are
  // drawn in hi-res in drawText. It never chimes by itself.
  const CLOCK = { x: 224, y: 27, r: 7 };
  const flip = { shown: null, prev: null, t: [0, 0, 0, 0] }; // digits and per-card flip timers
  const FLIP_TIME = 0.5;
  const clockStyle = () => (conf.clock_style === 'flip' ? 'flip' : 'analog');
  function clockTime() {
    const now = new Date();
    const hh = now.getHours();
    const mm = now.getMinutes();
    return { now, hh, mm, h12: ((hh + 11) % 12) + 1, ampm: hh < 12 ? 'am' : 'pm' };
  }
  function drawClock() {
    const { x, y, r } = CLOCK;
    const t = clockTime();
    if (clockStyle() === 'flip') {
      // a little wooden stand for the flip cards
      R(x - 12, y - 6, 25, 13, C.woodDk); R(x - 11, y - 5, 23, 11, '#2a1d14');
      R(x - 10, y + 7, 3, 2, C.woodDk); R(x + 8, y + 7, 3, 2, C.woodDk);
      R(x, y - 9, 1, 3, '#2b1c12');
    } else {
      // pendulum box below the face
      R(x - 4, y + r, 9, 10, C.woodDk); R(x - 3, y + r + 1, 7, 8, '#3a2618');
      const sw = Math.round(Math.sin(time * 3.1) * 2);
      line(x, y + r + 1, x + sw, y + r + 6, C.gold); R(x + sw - 1, y + r + 6, 3, 2, C.gold);
      // face with a wooden rim and hour marks
      ellipse(x, y, r + 1, r + 1, C.woodDk);
      ellipse(x, y, r, r, '#5a3a22');
      ellipse(x, y, r - 1, r - 1, '#f6efdc');
      [[0, -1], [1, 0], [0, 1], [-1, 0]].forEach(([dx, dy]) => P(x + dx * (r - 2), y + dy * (r - 2), '#5a4632'));
      R(x, y - r - 3, 1, 2, '#2b1c12');
    }
    const other = clockStyle() === 'flip' ? 'the wall clock' : 'a flip clock';
    regions.push({ x: x - 13, y: y - r - 3, w: 27, h: r * 2 + 14, label: `<b>柱時計</b> Clock · ${t.h12}:${String(t.mm).padStart(2, '0')} ${t.ampm}\nTap to switch to ${other}`, click: swapClock });
  }
  function swapClock() {
    conf.clock_style = clockStyle() === 'flip' ? 'analog' : 'flip';
    send('conf', JSON.stringify({ clock_style: conf.clock_style }));
    flip.shown = null; // fresh cards, no flip on switching
    OKSound.koto(OKSound.scaleNote(0), 0, 1.2);
    OKSound.koto(OKSound.scaleNote(3), 0.18, 1.4);
  }
  function updateClock(dt) {
    if (clockStyle() !== 'flip') return;
    const t = clockTime();
    const digits = [t.h12 >= 10 ? '1' : '', String(t.h12 % 10), String(Math.floor(t.mm / 10)), String(t.mm % 10)];
    if (!flip.shown) { flip.shown = digits; flip.prev = digits.slice(); flip.t = [0, 0, 0, 0]; return; }
    digits.forEach((d, i) => {
      if (d !== flip.shown[i]) { flip.prev[i] = flip.shown[i]; flip.shown[i] = d; flip.t[i] = FLIP_TIME; }
    });
    for (let i = 0; i < 4; i++) flip.t[i] = Math.max(0, flip.t[i] - dt);
  }
  // hi-res: hands, or the four flip cards
  function drawClockHiRes(s) {
    const cx = (CLOCK.x + 0.5) * s;
    const cy = (CLOCK.y + 0.5) * s;
    if (clockStyle() !== 'flip') {
      const t = clockTime();
      const m = t.mm + t.now.getSeconds() / 60;
      const h = (t.hh % 12) + m / 60;
      const hand = (ang, len, w, col) => {
        v.strokeStyle = col;
        v.lineWidth = w * s;
        v.lineCap = 'round';
        v.beginPath();
        v.moveTo(cx, cy);
        v.lineTo(cx + Math.sin(ang) * len * s, cy - Math.cos(ang) * len * s);
        v.stroke();
      };
      hand((h / 12) * Math.PI * 2, 3.4, 0.9, '#2b2622');
      hand((m / 60) * Math.PI * 2, 5.1, 0.6, '#2b2622');
      v.fillStyle = C.shu;
      v.beginPath();
      v.arc(cx, cy, 0.7 * s, 0, Math.PI * 2);
      v.fill();
      return;
    }
    if (!flip.shown) return;
    const cw = 4.4 * s;
    const ch = 8 * s;
    const gap = 0.5 * s;
    const colon = 1.6 * s;
    const total = cw * 4 + gap * 2 + colon;
    let x0 = CLOCK.x * s + 0.5 * s - total / 2;
    const top = cy - ch / 2;
    v.textAlign = 'center';
    v.textBaseline = 'middle';
    v.font = `800 ${Math.round(6.4 * s)}px -apple-system,system-ui,"Helvetica Neue",sans-serif`;
    const half = (digit, x, which, k) => {
      // draw one half ('top' | 'bottom') of a card, squashed by k about the middle
      const mid = top + ch / 2;
      v.save();
      v.translate(0, mid);
      v.scale(1, Math.max(0.0001, k));
      v.translate(0, -mid);
      v.beginPath();
      if (which === 'top') v.rect(x, top, cw, ch / 2); else v.rect(x, mid, cw, ch / 2);
      v.clip();
      v.fillStyle = which === 'top' ? '#3a3230' : '#2e2826';
      v.fillRect(x, top, cw, ch);
      v.fillStyle = '#f3ecdc';
      if (digit) v.fillText(digit, x + cw / 2, mid + 0.2 * s);
      v.restore();
    };
    for (let i = 0; i < 4; i++) {
      const x = x0;
      const cur = flip.shown[i];
      const old = flip.prev[i];
      const tt = flip.t[i];
      if (tt > 0) {
        const p = 1 - tt / FLIP_TIME; // 0 → 1
        half(cur, x, 'top', 1); // new top, behind the falling flap
        half(old, x, 'bottom', 1); // old bottom, until the new one lands
        if (p < 0.5) half(old, x, 'top', 1 - p * 2); // the old top folds down
        else half(cur, x, 'bottom', (p - 0.5) * 2); // the new bottom drops into place
      } else {
        half(cur, x, 'top', 1);
        half(cur, x, 'bottom', 1);
      }
      // the split line and a little shine
      v.fillStyle = 'rgba(0,0,0,0.55)';
      v.fillRect(x, top + ch / 2 - 0.15 * s, cw, 0.3 * s);
      v.fillStyle = 'rgba(255,255,255,0.06)';
      v.fillRect(x, top, cw, ch * 0.18);
      x0 += cw + (i === 1 ? gap + colon + gap : gap);
      if (i === 1) {
        // blinking colon between hours and minutes
        if (Math.floor(Date.now() / 1000) % 2 === 0) {
          v.fillStyle = '#f3ecdc';
          v.fillRect(x + cw + gap + colon / 2 - 0.35 * s, cy - 1.6 * s, 0.7 * s, 0.7 * s);
          v.fillRect(x + cw + gap + colon / 2 - 0.35 * s, cy + 0.9 * s, 0.7 * s, 0.7 * s);
        }
      }
    }
  }

  function drawWallDecor() {
    drawClock();
    for (const id of ['kakejiku', 'furin']) {
      if (!has(id)) continue;
      const d = DECOR[id];
      d.draw(d.x, d.y, time);
      regions.push({ x: d.x, y: d.y, w: d.w, h: d.h, label: decorLabel(id), click: () => decorClick(id) });
    }
    // shelf
    R(197, 58, 38, 2, C.woodDk); R(199, 60, 2, 3, C.woodDk); R(231, 60, 2, 3, C.woodDk);
    if (!has('radio')) {
      R(220, 50, 5, 8, '#6f9a5c'); R(220, 50, 5, 1, '#8cbf5e');
      R(227, 52, 5, 6, '#c9793a'); R(227, 52, 5, 1, '#e0a13a');
    }
    for (const id of ['daruma', 'radio']) {
      if (!has(id)) continue;
      const d = DECOR[id];
      d.draw(d.x, d.y, time);
      regions.push({ x: d.x, y: d.y, w: d.w, h: d.h, label: decorLabel(id), click: () => decorClick(id) });
    }
  }
  function drawFloorDecor() {
    for (const id of ['bonsai', 'sakura', 'tanuki']) {
      if (!has(id)) continue;
      const d = DECOR[id];
      d.draw(d.x, d.y, time);
      regions.push({ x: d.x, y: d.y, w: d.w, h: d.h, label: decorLabel(id), click: () => decorClick(id) });
    }
  }
  function drawCounterDecor() {
    for (const id of ['maneki', 'kingyo', 'kamakura']) {
      if (!has(id)) continue;
      const d = DECOR[id];
      d.draw(d.x, d.y, time);
      regions.push({ x: d.x, y: d.y, w: d.w, h: d.h, label: decorLabel(id), click: () => decorClick(id) });
    }
  }

  function decorClick(id) {
    const d = DECOR[id];
    switch (id) {
      case 'furin': shake.furin = 1.2; OKSound.chime(); break;
      case 'maneki': shake.maneki = 1.2; OKSound.coin(); break;
      case 'daruma': shake.daruma = 0.6; OKSound.pop(); toast(dharmaText()); break;
      case 'kingyo':
        for (let i = 0; i < 4; i++) particles.push({ x: d.x + rand(4, 11), y: d.y + 1, vx: 0, vy: 4, life: 1.2, c: '#e0a13a', type: 'flake' });
        fish.forEach((f) => { f.y = 0; });
        send('bump', 'fish_fed');
        OKSound.pluck(7);
        break;
      case 'sakura':
        for (let i = 0; i < 10; i++) particles.push({ x: d.x + rand(0, 16), y: d.y + rand(0, 10), vx: rand(-8, 2), vy: rand(4, 10), life: rand(2, 4), c: pick(['#f7c6d4', '#f2a9c0']), type: 'petal' });
        OKSound.pluck(8);
        break;
      case 'radio': radioOn = !radioOn; OKSound.blip(); break;
      case 'tanuki':
        OKSound.koto(98, 0, 0.35); OKSound.koto(98, 0.18, 0.35);
        spawnHearts(d.x + 8, d.y + 10, 1);
        break;
      case 'bonsai':
        particles.push({ x: d.x + rand(6, 18), y: d.y + 6, vx: rand(-4, 4), vy: 6, life: 1.4, c: '#6a9a4a', type: 'leaf' });
        OKSound.pop();
        break;
      case 'kakejiku': OKSound.pluck(2); break; // the saying is in its tooltip
      case 'kamakura': toggleLamp('kama', d.x + 7, d.y + 8); break;
      default: break;
    }
  }
  const DARUMA_BONUS = 30; // same as state.py
  // A finished focus session: keep the daruma, mon and today's special in step
  // with Python, and celebrate the daruma's second eye.
  function focusCredited(info) {
    if (!info) return;
    if (typeof info.focusDone === 'number') S.today.focus_done = info.focusDone;
    if (typeof info.mon === 'number' && info.mon !== S.mon) {
      dispMon += info.mon - S.mon; // the daruma's wish, the rabbit's mochi
      S.mon = info.mon;
      bumpPurse();
    }
    if (SPECIALS.today && typeof info.specialDone === 'boolean') SPECIALS.today.done = info.specialDone;
    updateStatus();
    if (info.specialCheer) setTimeout(specialCheer, info.daruma ? 3400 : 400);
    if (info.daruma) {
      shake.daruma = 1.2;
      OKSound.coin();
      const d = DECOR.daruma;
      spawnHearts(d.x + 6, d.y + 4, 3);
      toast(`達磨 Both eyes painted! Wish granted: +${info.daruma} mon`);
    }
  }
  function dharmaText() {
    const n = S.today.focus_done || 0;
    if (n >= 4) return `達磨 Daruma: Both eyes painted. Wish granted for today (+${DARUMA_BONUS} mon)!`;
    if (n >= 1) return `達磨 Daruma: One eye painted. Finish 4 focus sessions today to paint the other (+${DARUMA_BONUS} mon).`;
    return `達磨 Daruma: Finish a focus session today to paint the first eye.`;
  }

  // -------------------------------------------------------------- counter
  function drawCounter() {
    const x = 38;
    const w = 190;
    R(x, 104, w, 4, C.woodTop);
    R(x, 104, w, 1, C.woodTopHi);
    R(x, 108, w, 18, C.woodMd);
    for (let i = x + 8; i < x + w; i += 14) R(i, 109, 1, 16, '#6a4226');
    R(x, 108, w, 1, '#5a3a22');
    R(x, 125, w, 1, '#4a2f1c');
    // rice cooker
    const rc = { x: 62, y: 92 };
    const lid = shake.cooker > 0 ? 2 : 0;
    R(rc.x, rc.y + 3, 16, 9, '#efe6d4'); R(rc.x, rc.y + 3, 16, 1, '#ffffff');
    R(rc.x + 1, rc.y + 1 - lid, 14, 3, '#dcd2bd'); R(rc.x + 6, rc.y - lid, 4, 1, '#b8ae98');
    R(rc.x + 3, rc.y + 7, 4, 2, '#6f9a5c'); P(rc.x + 12, rc.y + 8, Math.floor(time * 2) % 2 ? '#e0604b' : '#8a3a2a');
    regions.push({ x: rc.x, y: rc.y - 2, w: 16, h: 14, label: '<b>炊飯器</b> Rice cooker\nFresh rice, always', click: () => {
      shake.cooker = 0.6; OKSound.pop();
      for (let i = 0; i < 5; i++) particles.push({ x: rc.x + rand(4, 12), y: rc.y - 1, vx: rand(-2, 2), vy: -rand(6, 12), life: rand(0.8, 1.5), c: 'rgba(255,255,255,0.8)', type: 'steam' });
    } });
    // kettle
    const k = { x: 188, y: 94 };
    ellipse(k.x + 6, k.y + 6, 6, 4, '#3a3a3a'); R(k.x, k.y + 6, 13, 4, '#3a3a3a'); R(k.x + 2, k.y + 1, 9, 1, '#5a5a5a');
    line(k.x + 12, k.y + 5, k.x + 15, k.y + 2, '#3a3a3a');
    R(k.x + 4, k.y - 1, 5, 1, '#2b1c12');
    if (Math.random() < 0.05) particles.push({ x: k.x + 15, y: k.y + 1, vx: rand(-1, 1), vy: -rand(4, 7), life: rand(0.8, 1.4), c: 'rgba(255,255,255,0.6)', type: 'steam' });
    regions.push({ x: k.x, y: k.y - 2, w: 16, h: 12, label: '<b>鉄瓶</b> Tetsubin kettle\nGreen tea for the guests', click: () => {
      OKSound.pluck(9);
      for (let i = 0; i < 6; i++) particles.push({ x: k.x + 15, y: k.y + 1, vx: rand(-2, 2), vy: -rand(6, 12), life: rand(1, 1.8), c: 'rgba(255,255,255,0.75)', type: 'steam' });
    } });
    // tray of ready onigiri
    R(140, 102, 38, 2, '#3e2717');
    R(141, 101, 36, 1, '#5a3a22');
    trayDishes.forEach((d, i) => drawDishMini(d, 142 + i * 6, 96));
    const trayNames = [...new Set(trayDishes.map((d) => d.name))].slice(0, 3).map(esc).join(', ');
    regions.push({ x: 140, y: 94, w: 38, h: 10, label: `<b>お盆</b> Tray\n${trayDishes.length ? `${trayDishes.length} ready: ${trayNames}${trayDishes.length > 3 ? '…' : ''}\nGuests who ordered these get them straight away` : 'Empty. Tap the chef to make something from the menu'}`, click: () => chefClick() });
  }

  // ----------------------------------------------------------------- chef
  function drawChef() {
    const w = 25;
    const h = 30;
    const x = 108;
    let squash = 0;
    if (chef.state === 'make') squash = Math.floor(chef.t * 6) % 2;
    const bob = chef.state === 'idle' ? Math.round(Math.sin(time * 1.6) * 0.6) : 0;
    const y = 76 + squash + bob;
    const shape = onigiriShape(x, y, w, h - squash, { seed: 11 });
    // hachimaki headband with a red rising sun
    const band = y + 8;
    const hw = shape.rows[8] || 8;
    const golden = has('kin_hachimaki'); // 25 specials collected
    const cloth = golden ? C.gold : '#ffffff';
    R(shape.cx - hw - 1, band, hw * 2 + 3, 3, cloth);
    R(shape.cx - hw - 1, band + 2, hw * 2 + 3, 1, golden ? C.goldDk : '#e3dccd');
    R(shape.cx - 1, band, 3, 3, C.shu);
    R(shape.cx + hw + 1, band + 1, 3, 1, cloth); R(shape.cx + hw + 2, band + 2, 2, 2, cloth);
    if (golden && Math.floor(time * 2) % 5 === 0) P(shape.cx - hw + 1, band, '#fff6cc');
    if ((onigiri.level || 0) >= 20) { P(shape.cx - 5, band + 1, C.gold); P(shape.cx + 5, band + 1, C.gold); }
    face(shape.cx, y + 14, 5, {
      blink: chef.blink < 0.12,
      look: chef.look,
      mood: chef.state === 'make' && squash ? 'happy' : undefined,
    });
    // hands
    if (chef.state === 'make') {
      const p = Math.floor(chef.t * 6) % 2;
      ellipse(shape.cx - 6 + p, 102, 2, 1, C.rice);
      ellipse(shape.cx + 6 - p, 102, 2, 1, C.rice);
      drawDishMini(chef.dish, shape.cx - 2, 97 + p);
    }
    regions.push({ x, y: y - 1, w, h: 28, label: `<b>大将</b> Taishō, the head chef\n${chef.dish && chef.state === 'make' ? `Making ${esc(chef.dish.name)}…` : 'Tap to make something from the menu for the tray'}\n${menuSummary()}`, click: chefClick });
  }

  const CHEF_LINES = [
    ['いらっしゃいませ!', 'Welcome in!'],
    ['頑張って!', "You've got this!"],
    ['お疲れ様です', 'Thanks for your hard work'],
    ['継続は力なり', 'Consistency is power'],
    ['七転び八起き', 'Fall seven times, stand up eight'],
    ['少しずつ', 'Little by little'],
    ['一期一会', 'Treasure every encounter'],
    ['よし!', 'Alright!'],
    ['塵も積もれば山となる', 'Dust piles up into mountains'],
  ];
  function chefLine() {
    const reviews = S.today.reviews || 0;
    const options = CHEF_LINES.slice();
    if (reviews > 0) options.push([`今日は${reviews}枚!`, `${reviews} cards today. Nice!`]);
    if (timer.phase === 'break') options.push(['一休みしよう', 'Take a breather. You earned it']);
    if (timer.phase === 'focus') options.push(['集中タイム…', "Focus time. I'll keep the rice warm"]);
    if (pet.tummy < 40) options.push([`${pet.name}がお腹すいたって`, `${pet.name} looks hungry. Got a fish?`]);
    if (S.guestsWaiting > 0) options.push(['お客さんが待ってる!', `${S.guestsWaiting} guests are waiting outside!`]);
    return pick(options);
  }

  function chefClick() {
    if (chef.state === 'idle' && !orders.length) {
      if (trayDishes.length >= 6) {
        say(['お盆がいっぱい!', "The tray's full!"]);
        OKSound.blip();
        return;
      }
      chef.state = 'make';
      chef.t = 0;
      chef.target = null;
      chef.dish = pickFrom(allDishes());
      OKSound.pluck(4);
      say([chef.dish.jp || 'はい、お待ち!', `One ${chef.dish.name}, coming up!`]);
    } else if (chef.state === 'make' && chef.dish) {
      say(['もう少し!', `Almost done with the ${chef.dish.name}!`]);
    } else {
      say(chefLine());
    }
  }
  // "12 dishes on the menu (10 from your Specials Book)"
  function menuSummary() {
    const n = allDishes().length;
    const b = MENU_DISHES.book.length;
    if (b) return `${n} dishes on the menu (${b} from your Onigiri Specials Book)`;
    const locked = FLAVORS.length - MENU_DISHES.house.length;
    return `${n} onigiri on the menu${locked ? ` · ${locked} more unlock as your restaurant levels up` : ''}`;
  }

  // ----------------------------------------------------------------- Tama
  // The shop cat is a gentle virtual pet: needs come from Python (pet.py),
  // behaviour and drawing live here.
  let pet = Object.assign(
    { name: 'Tama', tummy: 60, love: 60, energy: 60, stage: 0, stageJp: '子猫', stageName: 'Kitten', trait: 'classic', fish: 0, gifts: {}, studyDays: 0 },
    INIT.pet || {}
  );
  let PET_STAGES = INIT.petStages || [];
  // Starter species: cat, puffle or Java sparrow (buncho). Same needs and
  // gifts for all; only the drawing and the words change.
  const SPECIES = INIT.petSpecies || { cat: { jp: '猫', name: 'Cat', they: 'she', them: 'her', their: 'her', food: 'fish', foodJp: '魚', toy: 'Feather toy', idle: 'Purring', tricks: ['Paw wave', 'Beckon', 'Roll over'] } };
  const sp = () => SPECIES[pet.species || 'cat'] || SPECIES.cat;
  // Puffle extras (penguins outside, the igloo lamp, puffle colours)
  // only appear once you have a puffle, as your starter or from the shop.
  const hasPuffle = () => pet.species === 'puffle' || S.owned.includes('puffle');
  const hasBird = () => pet.species === 'bird' || S.owned.includes('buncho');
  // The two pets that come in colours: puffle and Java sparrow.
  const colorKind = (kind) => (kind === 'bird'
    ? { kind, list: BIRD_COLORS, owned: S.birdColors || [], current: S.birdColor || '', noun: 'Java sparrow', jp: '文鳥の色', has: hasBird(), shopId: 'buncho', first: 'grey', swatch: (c) => (c.id === 'sakura' ? 'radial-gradient(circle at 32% 34%, #f5f2ec 0 16%, transparent 18%), radial-gradient(circle at 66% 62%, #f5f2ec 0 14%, transparent 16%), #8f949f' : c.hex) }
    : { kind: 'puffle', list: PUFFLE_COLORS, owned: S.puffleColors || [], current: S.puffleColor || '', noun: 'puffle', jp: 'パフルの色', has: hasPuffle(), shopId: 'puffle', first: 'blue', swatch: (c) => (c.id === 'rainbow' ? `linear-gradient(${RAINBOW.join(',')})` : c.hex) });
  function drawColorSample(kind, color, x, by, happy) {
    withPet({ species: kind, stage: 1 }, () => {
      if (kind === 'bird') drawBird(x, by, 1, { color, happy });
      else drawPuffle(x, by, { color, happy });
    });
  }
  const foods = () => sp().foods || sp().food + 's';
  const They = () => sp().they[0].toUpperCase() + sp().they.slice(1);
  const PUFFLE_COLORS = INIT.puffleColors || [{ id: 'blue', name: 'Blue', jp: '青', hex: '#3d7fd6', starter: true }];
  const PUFFLE_COLOR_PRICE = INIT.puffleColorPrice || 250;
  const RAINBOW = ['#e0463a', '#f08a2e', '#f2cf3a', '#4fb04a', '#3d7fd6', '#9a5bc8'];
  function puffleCols(id) {
    const c = PUFFLE_COLORS.find((x) => x.id === (id || S.puffleColor)) || PUFFLE_COLORS[0];
    return { id: c.id, a: c.hex, d: shade(c.hex, -0.3), l: shade(c.hex, 0.35) };
  }
  // Draw with a stand-in pet (shop icons, companions, the starter chooser).
  function withPet(tmp, fn) {
    const real = pet;
    pet = Object.assign({ stage: 2, trait: 'classic', style: {}, unlocks: {} }, tmp);
    try { fn(); } finally { pet = real; }
  }
  function voice(species) {
    const s0 = species || pet.species || 'cat';
    if (s0 === 'puffle') OKSound.squeak();
    else if (s0 === 'bird') OKSound.chirp();
    else OKSound.meow();
  }
  const PET_GIFTS = INIT.petGifts || [];
  const PET_RARE = INIT.petRareGifts || [];
  const PET_MILESTONES = INIT.petMilestones || {};
  const PETS_PER_DAY = INIT.petsPerDay || 20;
  const STAGE_SCALE = [0.72, 0.84, 1, 1.08];
  const FLOOR_Y = 174; // Tama's feet on the front strip of tatami
  const BED_X = 17;
  // The bed grows a spot for every pet who lives here (the crane sleeps
  // standing by the door); the food dish sits just past its end.
  const SLOT = 19;
  let bedSlots = 1;
  let BOWL_X = 38;
  const slotX = (i) => BED_X + i * SLOT;
  const bedExtra = () => (bedSlots - 1) * SLOT;
  const SUN_X = 64;
  const tama = { x: BED_X, y: FLOOR_Y, air: null, flap: null, dir: 1, state: 'sleep', t: 0, dur: rand(8, 16), target: null, then: null, hop: 0, paw: 0, blink: 2, wantsFish: false };
  let feather = null;
  let floorGifts = [];
  let giftTimer = 9;

  const CAT = {
    fur: '#fbf7ee',
    furSh: '#e6dccb',
    orange: '#e0a13a',
    black: '#3b3030',
    pink: '#f3aaa0',
  };
  function catColors() {
    if (pet.trait === 'night') return { a: '#4a4a5a', b: '#2a2a36' };
    if (pet.trait === 'scrappy') return { a: '#c9793a', b: '#3b3030' };
    return { a: CAT.orange, b: CAT.black };
  }
  const k = () => STAGE_SCALE[clamp(pet.stage || 0, 0, 3)];
  const petHappy = () => pet.tummy >= 70 && pet.love >= 70 && pet.energy >= 70;
  const petStyle = () => pet.style || {};
  const COLLAR = { red: '#c8412f', indigo: '#3b4a8a', matcha: '#6f9a5c', sakura: '#f2a9c0' };
  const collarColor = () => COLLAR[petStyle().collar] || COLLAR.red;
  const showCollar = () => (pet.stage || 0) >= 1 || (pet.unlocks && pet.unlocks.collar);
  function bellPx(x, y) {
    if (petStyle().bell) {
      R(x - 1, y, 2, 2, C.gold); P(x - 1, y, '#fff6cc');
      if (Math.floor(time * 3) % 3 === 0) P(x + 1, y - 1, '#fff6cc');
    } else P(x, y, C.gold);
  }
  const r = (n) => Math.max(1, Math.round(n * k()));

  function sunbeam() {
    const h = hourNow();
    return h >= 8 && h < 16.5 && !raining;
  }

  function drawTamaFloor() {
    // sunbeam from the window
    if (sunbeam()) {
      g.fillStyle = 'rgba(255,240,190,0.28)';
      for (let y = 160; y < 180; y++) g.fillRect(SUN_X - 16 + Math.round((y - 160) * 0.6), y, 34, 1);
    }
    // bed: zabuton, fancy cushion or kotatsu (care milestones)
    const bed = petStyle().bed || 'zabuton';
    const ex = bedExtra();
    if (bed === 'kotatsu') drawKotatsu();
    else if (bed === 'fancy') {
      R(BED_X - 12, FLOOR_Y - 4, 25 + ex, 5, '#3b4a8a');
      R(BED_X - 12, FLOOR_Y - 4, 25 + ex, 1, '#56679c');
      for (let i = -10; i <= 10 + ex; i += 4) { P(BED_X + i, FLOOR_Y - 2, C.gold); P(BED_X + i + 2, FLOOR_Y - 1, '#c9a24a'); }
      [[-13, -4], [13 + ex, -4], [-13, 0], [13 + ex, 0]].forEach(([dx, dy]) => P(BED_X + dx, FLOOR_Y + dy, C.gold));
    } else {
      // a row of zabuton, one per pet
      for (let i = 0; i < bedSlots; i++) {
        const cx = slotX(i);
        const w = i === 0 ? 23 : SLOT + 1;
        const x0 = i === 0 ? cx - 11 : cx - 8 + 3;
        R(x0, FLOOR_Y - 3, w, 4, '#8e3b46');
        R(x0, FLOOR_Y - 3, w, 1, '#ad5561');
        P(x0, FLOOR_Y - 3, '#6b2a33'); P(x0 + w - 1, FLOOR_Y - 3, '#6b2a33');
        P(i === 0 ? cx : cx + 3, FLOOR_Y - 2, '#e0a13a');
      }
    }
    regions.push({ x: BED_X - 13, y: FLOOR_Y - 11, w: 27 + ex, h: 13, label: `<b>寝床</b> Bed\nTap to tuck ${residents.some((a) => a.slot != null) ? 'everyone' : esc(pet.name)} in`, click: bedtime });
    // food bowl
    R(BOWL_X - 4, FLOOR_Y - 2, 9, 3, '#3b6ea5');
    R(BOWL_X - 3, FLOOR_Y - 2, 7, 1, '#dff2f7');
    R(BOWL_X - 4, FLOOR_Y - 2, 9, 1, '#5a8cc4');
    if (tama.state === 'eat') R(BOWL_X - 2, FLOOR_Y - 3, 5, 1, '#e8b8a0');
    regions.push({ x: BOWL_X - 5, y: FLOOR_Y - 5, w: 11, h: 7, label: `<b>ごはん皿</b> ${esc(pet.name)}'s food dish\n${pet.fish} ${pet.fish === 1 ? sp().food : foods()} saved · tap to feed`, click: () => petAction('feed') });
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  // Side view, facing `dir` (1 = right). (cx, by) is the bottom centre.
  function catSide(cx, by, dir, walkFrame, opts) {
    opts = opts || {};
    const col = catColors();
    const chub = pet.trait === 'chubby' ? 1 : 0;
    const bodyRx = r(6) + chub;
    const bodyRy = r(3) + (chub ? 1 : 0);
    const bodyY = by - r(3) - bodyRy + (opts.low ? 1 : 0);
    // legs
    const legH = r(3);
    const legs = [-bodyRx + 1, -bodyRx + 3, bodyRx - 3, bodyRx - 1];
    legs.forEach((lx, i) => {
      const lift = walkFrame && (i % 2 === (walkFrame % 2)) ? 1 : 0;
      R(cx + lx * dir - (dir < 0 ? 0 : 0), by - legH, 1, legH - lift, i < 2 ? CAT.furSh : CAT.fur);
    });
    // tail
    const sway = Math.round(Math.sin(time * 3) * 1.5);
    const tx = cx - (bodyRx + 1) * dir;
    for (let i = 0; i < r(7); i++) P(tx - Math.round(i * 0.35) * dir + (i > 3 ? sway * dir : 0), bodyY - i + 1, i > r(4) ? col.b : CAT.fur);
    // body
    ellipse(cx, bodyY + bodyRy - 1, bodyRx, bodyRy, CAT.fur);
    ellipse(cx - r(2) * dir, bodyY, r(2.5), Math.max(1, r(1.5)), col.a);
    ellipse(cx + r(2) * dir, bodyY + 1, r(1.8), 1, col.b);
    if (pet.stage >= 3) { R(cx - bodyRx + 1, bodyY - 1, bodyRx * 2 - 1, 2, '#2e3f5c'); R(cx - bodyRx + 1, bodyY - 1, bodyRx * 2 - 1, 1, '#f3e6c8'); }
    // head
    const hx = cx + (bodyRx - 1) * dir;
    const hy = bodyY - r(2) + (opts.headDown ? r(3) : 0);
    ellipse(hx, hy, r(3.5), r(3), CAT.fur);
    P(hx - r(2), hy - r(3) - 1, CAT.fur); P(hx + r(1), hy - r(3) - 1, CAT.fur);
    P(hx - r(2), hy - r(3), CAT.pink);
    if (pet.trait === 'scrappy') P(hx + r(2), hy - r(3), CAT.fur); else P(hx + r(1), hy - r(3) - 2, CAT.fur);
    ellipse(hx - r(1) * dir, hy - r(1), r(1.5), 1, col.a);
    if (pet.trait === 'night') P(hx, hy - r(2), '#ffe27a');
    // face
    if (opts.happy) { P(hx + r(1) * dir, hy, C.ink); P(hx + r(1) * dir + dir, hy - 1, C.ink); }
    else R(hx + r(1) * dir, hy - 1, 1, 2, C.ink);
    P(hx + r(3) * dir, hy + 1, CAT.pink);
    if (showCollar()) {
      const nx = hx - r(2.5) * dir;
      R(nx, hy, 1, r(3), collarColor());
      bellPx(nx + dir, hy + r(3));
      if (petStyle().bandana) {
        R(nx - dir, hy + 1, 2, 2, '#2e3f7a'); P(nx - dir * 2, hy + 2, '#2e3f7a'); P(nx - dir, hy + 1, '#ffffff');
      }
    }
  }

  // Front view, sitting. (cx, by) is the bottom centre.
  function catSit(cx, by, opts) {
    opts = opts || {};
    const col = catColors();
    const chub = pet.trait === 'chubby' ? 1 : 0;
    const bodyRx = r(5) + chub;
    const bodyRy = r(4);
    const bodyCy = by - bodyRy - 1;
    // tail curling round
    const sway = Math.round(Math.sin(time * (opts.fastTail ? 7 : 2)) * 1.5);
    R(cx + bodyRx - 1, by - 2, r(4), 2, col.b);
    R(cx + bodyRx + r(3) - 1, by - 3 - r(3) + sway, 2, r(3) + 1, col.b);
    ellipse(cx, bodyCy, bodyRx, bodyRy, CAT.fur);
    ellipse(cx - r(2), bodyCy + 1, r(2.5), r(2), col.a);
    if (pet.stage >= 3) { R(cx - bodyRx + 1, bodyCy - r(2), bodyRx * 2 - 1, r(3), '#2e3f5c'); R(cx - 1, bodyCy - r(2), 3, r(3), '#f3e6c8'); }
    // front paws
    R(cx - r(3), by - 2, r(2), 2, CAT.fur); R(cx + r(1), by - 2, r(2), 2, CAT.fur);
    P(cx - r(3), by - 1, CAT.furSh); P(cx + r(1) + r(2) - 1, by - 1, CAT.furSh);
    // head
    const hr = r(4.2);
    const hy = bodyCy - bodyRy - hr + 2;
    if (showCollar()) {
      const cy = hy + r(3.6) + 1;
      if (petStyle().bandana) {
        const bw = r(6) + 1;
        R(cx - Math.floor(bw / 2), cy, bw, 1, '#2e3f7a');
        R(cx - 2, cy + 1, 5, 1, '#2e3f7a'); R(cx - 1, cy + 2, 3, 1, '#2e3f7a'); P(cx, cy + 3, '#2e3f7a');
        P(cx - 1, cy + 1, '#ffffff'); P(cx + 1, cy + 2, '#ffffff'); P(cx + 2, cy, '#ffffff');
      } else {
        R(cx - r(3), cy, r(6) + 1, 1, collarColor());
        bellPx(cx, cy + 1);
      }
    }
    ellipse(cx, hy, hr, r(3.6), CAT.fur);
    // ears
    const ex = r(3);
    R(cx - ex - 1, hy - r(3.6) - 1, 2, 2, CAT.fur); P(cx - ex, hy - r(3.6), CAT.pink);
    if (pet.trait === 'scrappy') { R(cx + ex, hy - r(3.6), 2, 1, col.b); }
    else { R(cx + ex, hy - r(3.6) - 1, 2, 2, col.b); }
    ellipse(cx - r(2), hy - r(1.5), r(1.8), r(1.3), col.a);
    if (pet.trait === 'night') { P(cx + 1, hy - r(2.6), '#ffe27a'); P(cx + 2, hy - r(2.6) + 1, '#ffe27a'); }
    const spread = k() < 0.8 ? 1 : 2;
    const mood = opts.happy ? 'happy' : undefined;
    face(cx, hy - 1, spread, { mood, blink: opts.blink, look: opts.look || 0, blush: '#f7b9b0' });
    // raised paw (tricks and grooming)
    if (opts.paw) {
      const px = cx + (opts.paw > 0 ? bodyRx - 1 : -bodyRx);
      const up = opts.pawUp || 0;
      R(px, hy + 1 - up, 2, r(4), CAT.fur);
      P(px, hy + 1 - up, CAT.pink);
    }
  }

  function drawKotatsu() {
    // quilted blanket with a little table on top
    const ex = bedExtra();
    for (let y = 0; y < 8; y++) {
      const w = 22 + Math.round(y * 0.6);
      R(BED_X - Math.floor(w / 2), FLOOR_Y - 8 + y, w + ex, 1, y % 3 === 0 ? '#e0a13a' : '#c8412f');
    }
    for (let x = -10; x <= 10 + ex; x += 5) R(BED_X + x, FLOOR_Y - 8, 1, 8, '#a8322a');
    R(BED_X - 13, FLOOR_Y - 10, 27 + ex, 2, '#8a5a34');
    R(BED_X - 13, FLOOR_Y - 10, 27 + ex, 1, '#a8743f');
    // a mikan on top, of course
    R(BED_X + 5, FLOOR_Y - 12, 2, 2, '#f08a2e'); P(BED_X + 6, FLOOR_Y - 13, '#4f7a3a');
  }
  function catKotatsu() {
    // asleep under the kotatsu: only her head pokes out
    const col = catColors();
    // head pokes out on the left side, away from her food bowl
    const hx = BED_X - 14;
    const hy = FLOOR_Y - 3;
    ellipse(hx, hy, 3, 2, CAT.fur);
    P(hx - 2, hy - 3, CAT.fur); P(hx + 2, hy - 3, CAT.fur); P(hx + 2, hy - 2, col.a);
    R(hx - 2, hy, 1, 1, C.ink); R(hx + 1, hy, 2, 1, C.ink);
    sleepZ(hx - 1, hy - 7);
  }

  function catSleep(cx, by) {
    if ((petStyle().bed === 'kotatsu') && Math.abs(cx - BED_X) < 4) { catKotatsu(); return; }
    const col = catColors();
    const s = Math.max(0.85, k());
    const rx = Math.round(8 * s) + (pet.trait === 'chubby' ? 1 : 0);
    const ry = Math.max(2, Math.round(4 * s));
    const breath = Math.floor(time * 0.8) % 2;
    ellipse(cx, by - ry, rx, ry + (breath ? 0 : 0), CAT.fur);
    ellipse(cx - Math.round(3 * s), by - ry - 1, Math.round(3 * s), Math.max(1, Math.round(2 * s)), col.a);
    ellipse(cx + Math.round(3 * s), by - ry + 1, Math.round(2.5 * s), Math.max(1, Math.round(1.6 * s)), col.b);
    const hx = cx + rx - Math.round(2 * s);
    const hy = by - ry * 2 + 2;
    ellipse(hx, hy, Math.round(4 * s), Math.round(3 * s), CAT.fur);
    P(hx - Math.round(3 * s), hy - Math.round(3 * s), CAT.fur); P(hx + Math.round(2 * s), hy - Math.round(3 * s), CAT.fur);
    P(hx - Math.round(3 * s), hy - Math.round(3 * s) + 1, col.a);
    R(hx - Math.round(2 * s), hy, 2, 1, C.ink); R(hx + 1, hy, 2, 1, C.ink);
    if (pet.trait === 'night') P(hx, hy - 2, '#ffe27a');
    const tail = Math.round(Math.sin(time * 0.7));
    R(cx - rx - 1, by - 2 + tail, rx, 2, col.b);
    sleepZ(hx + 5, hy - 6);
  }

  function catRoll(cx, by) {
    // belly-up with paws in the air
    const col = catColors();
    const rx = r(7);
    ellipse(cx, by - r(3), rx, r(3), CAT.fur);
    ellipse(cx + r(2), by - r(4), r(2), 1, col.a);
    [-4, -2, 2, 4].forEach((lx, i) => R(cx + r(lx), by - r(6) - (Math.floor(time * 6 + i) % 2), 1, r(3), CAT.fur));
    ellipse(cx - rx, by - r(3), r(3.5), r(3), CAT.fur);
    face(cx - rx, by - r(3), 1, { mood: 'happy', blush: '#f7b9b0' });
  }

  // ------------------------------------------------------------ puffle
  // A round ball of fluff with a tuft on top. Front view; it bounces instead
  // of walking. (cx, by) is the bottom centre. o: squash, sleep, blink,
  // happy, look, flip (upside down mid-backflip), color (colour id).
  // The body shape (round, with a crown of spiky tufts that curl a little
  // clockwise) is built once per size as a pixel mask; the dark outline is
  // traced around it, so tufts and body share one clean line.
  const puffleMasks = {};
  function puffleMask(rx, ry, scrappy) {
    const key = `${rx},${ry},${scrappy ? 1 : 0}`;
    if (puffleMasks[key]) return puffleMasks[key];
    const L = Math.max(rx, ry) + 6;
    const w = L * 2 + 1;
    const h = L * 2 + 1;
    const inside = new Uint8Array(w * h);
    const scale = rx / 6.5;
    // [angle in degrees (-90 = straight up), length, base half-width in radians]
    const tufts = [[-165, 2.4, 0.2], [-138, 3.4, 0.24], [-110, 4.2, 0.24], [-80, 4.4, 0.24], [-52, 3.6, 0.24], [-24, 3, 0.22], [4, 2.2, 0.2], [172, 2, 0.2]];
    if (scrappy) tufts.push([-95, 5, 0.12], [-35, 4, 0.14], [26, 2.4, 0.18]);
    const tri = tufts.map(([deg, len, hw]) => {
      const a0 = (deg * Math.PI) / 180;
      const edge = (t) => [Math.cos(t) * rx * 0.92, Math.sin(t) * ry * 0.92];
      const lean = 0.2; // tips curl clockwise
      const tip = [Math.cos(a0 + lean) * (rx + len * scale), Math.sin(a0 + lean) * (ry + len * scale)];
      return [edge(a0 - hw), edge(a0 + hw), tip];
    });
    const inTri = (px, py, [p0, p1, p2]) => {
      const d = (ax, ay, bx, by2, cx0, cy0) => (ax - cx0) * (by2 - cy0) - (bx - cx0) * (ay - cy0);
      const d1 = d(px, py, p0[0], p0[1], p1[0], p1[1]);
      const d2 = d(px, py, p1[0], p1[1], p2[0], p2[1]);
      const d3 = d(px, py, p2[0], p2[1], p0[0], p0[1]);
      return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
    };
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dx = x - L;
        const dy = y - L;
        // slightly wider low down, like a settled ball of fluff
        const ryy = dy > 0 ? ry * 0.98 : ry;
        const rxx = rx + (dy > 0 ? 0.4 : 0);
        let hit = (dx * dx) / (rxx * rxx) + (dy * dy) / (ryy * ryy) <= 1.02;
        if (!hit) hit = tri.some((t) => inTri(dx, dy, t));
        inside[y * w + x] = hit ? 1 : 0;
      }
    }
    const at = (x, y) => (x >= 0 && y >= 0 && x < w && y < h ? inside[y * w + x] : 0);
    const kind = new Uint8Array(w * h); // 0 none, 1 outline, 2 fur, 3 shade, 4 light
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (at(x, y)) {
          const low = y - L > ry * 0.35 && (!at(x, y + 2) || !at(x + 2, y + 1));
          const high = y - L < -ry * 0.25 && x - L < rx * 0.2 && (!at(x - 1, y - 2) || !at(x - 2, y - 1));
          kind[y * w + x] = low ? 3 : high ? 4 : 2;
        } else if (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1) || at(x - 1, y - 1) || at(x + 1, y - 1) || at(x - 1, y + 1) || at(x + 1, y + 1)) {
          kind[y * w + x] = 1;
        }
      }
    }
    // top of the tallest tuft, where the two little hairs grow from
    let topY = L;
    for (let y = 0; y < h && topY === L; y++) for (let x = L - 3; x <= L + 3; x++) if (at(x, y)) { topY = y; break; }
    return (puffleMasks[key] = { w, h, L, kind, topY: topY - L });
  }

  function drawPuffle(cx, by, o) {
    o = o || {};
    const col = puffleCols(o.color);
    const line0 = col.id === 'black' ? '#121216' : col.id === 'white' ? '#7d8796' : shade(col.a, -0.62);
    const chub = pet.trait === 'chubby' ? 1 : 0;
    const rx = r(6.5) + chub + (o.squash ? 1 : 0);
    const ry = Math.max(4, r(6) - (o.squash ? 1 : 0));
    const cy = by - ry - 1;
    const flip = !!o.flip;
    const m = puffleMask(rx, ry, pet.trait === 'scrappy');
    const pal = [null, line0, col.a, col.d, col.l];
    for (let y = 0; y < m.h; y++) {
      const dy = y - m.L;
      const py = flip ? cy - dy : cy + dy;
      for (let x = 0; x < m.w; x++) {
        const kd = m.kind[y * m.w + x];
        if (!kd) continue;
        let c = pal[kd];
        if (col.id === 'rainbow' && kd > 1) c = RAINBOW[clamp(Math.floor(((dy + ry) / (2 * ry + 1)) * 6), 0, 5)];
        R(cx + x - m.L, py, 1, 1, c);
      }
    }
    // two thin hairs out of the top tuft
    const up = flip ? 1 : -1;
    const hy = cy + up * -m.topY;
    P(cx + 1, hy + up, line0); P(cx + 1, hy + up * 2, line0); P(cx, hy + up * 3, line0);
    P(cx + 2, hy + up, line0); P(cx + 3, hy + up * 2, line0);
    if (col.id === 'gold' && Math.floor(time * 3) % 3 === 0) P(cx + rx - 1, cy - ry + 1, '#fff6cc');
    if (pet.trait === 'night') P(cx + rx - 3, cy + up * (ry - 3), '#ffe27a');

    // one big white eye patch: two joined ovals, notched top and bottom
    const erx = Math.max(2, Math.round(rx * 0.32));
    const ery = Math.max(2, Math.round(ry * 0.42));
    const ex = Math.max(2, Math.round(rx * 0.3));
    const ey = cy + up * Math.max(1, Math.round(ry * 0.2));
    if (o.sleep || o.blink) {
      [-1, 1].forEach((sd) => { R(cx + sd * ex - 1, ey + 1, 3, 1, line0); P(cx + sd * ex - 2, ey, line0); P(cx + sd * ex + 2, ey, line0); });
    } else {
      [-1, 1].forEach((sd) => ellipse(cx + sd * ex, ey, erx + 1, ery + 1, C.ink));
      [-1, 1].forEach((sd) => ellipse(cx + sd * ex, ey, erx, ery, '#ffffff'));
      R(cx - ex, ey - ery + 1, ex * 2 + 1, ery * 2 - 1, '#ffffff');
      P(cx, ey - ery, C.ink); P(cx, ey - ery + 1, C.ink);
      P(cx, ey + ery, C.ink);
      R(cx - ex - erx + 1, ey + ery - 1, erx, 1, '#d6dae4');
      R(cx + ex, ey + ery - 1, erx, 1, '#d6dae4');
      if (o.happy) {
        [-1, 1].forEach((sd) => { P(cx + sd * ex - 1, ey + 1, C.ink); P(cx + sd * ex, ey, C.ink); P(cx + sd * ex + 1, ey + 1, C.ink); });
      } else {
        // tall oval pupils with a glint, set a little inward
        const lk = clamp(o.look || 0, -1, 1);
        const big = rx >= 7;
        // one pupil in the middle of each half of the patch (inner edge when big)
        [-1, 1].forEach((sd) => {
          const px = cx + sd * ex + lk - (big && sd > 0 ? 1 : 0);
          R(px, ey - 1, big ? 2 : 1, big ? 3 : 2, C.ink);
          if (big) P(px + (sd < 0 ? 0 : 1), ey - 1, '#ffffff');
        });
      }
    }
    // a lopsided smile under the eyes
    if (!o.sleep) {
      const my = flip ? ey - ery - 2 : ey + ery + 2;
      const d = flip ? -1 : 1;
      if (o.happy || o.open) {
        R(cx - 1, my, 5, 1, line0); R(cx, my + d, 3, 1, '#e8546a'); P(cx - 2, my - d, line0); P(cx + 4, my - d, line0);
      } else {
        P(cx - 1, my, line0); R(cx, my + d, 3, 1, line0); P(cx + 3, my, line0); P(cx + 4, my - d, line0);
      }
    }
    // accessories: a bow in the fur, a bandana, the bell, a tiny crown
    if (!flip && showCollar()) {
      const bx = cx + rx - 4;
      const byy = cy - ry + 1;
      R(bx, byy, 2, 2, collarColor()); R(bx + 3, byy, 2, 2, collarColor()); P(bx + 2, byy + 1, shade(collarColor(), -0.3));
    }
    if (!flip && petStyle().bandana) {
      R(cx - 4, cy + ry - 1, 9, 1, '#2e3f7a'); R(cx - 1, cy + ry, 3, 1, '#2e3f7a'); P(cx - 3, cy + ry - 1, '#ffffff');
    }
    if (!flip && petStyle().bell) bellPx(cx - rx + 2, cy + ry - 1);
    if (pet.stage >= 3 && !flip) {
      const t0 = hy - 5;
      R(cx - 3, t0, 5, 1, C.gold); P(cx - 3, t0 - 1, C.gold); P(cx - 1, t0 - 1, C.gold); P(cx + 1, t0 - 1, C.gold);
    }
  }

  // ------------------------------------------------------- Java sparrow
  // Side view facing `dir`: grey body, black cap, white cheeks, pink beak.
  // o: hop, sleep, blink, happy, wing ('up' | 'flap'), beakOpen, headDown.
  // Colours after the real buncho varieties (the first is free, like the puffle).
  const BIRD_BASE = { beak: '#f05a6e', beakDk: '#c9404f', ring: '#e0485a', foot: '#eea5ad' };
  // "under" is a slightly darker shade for the underside of the body and head,
  // the same flat shading the other animals use (no outlines).
  const BIRD_GREY = { body: '#8f949f', under: '#777c87', belly: '#c9bdc3', wing: '#6e737e', wingDk: '#51555f', tip: '#2c2c33', cap: '#1e1d23', capUnder: '#1e1d23', cheek: '#ffffff', tail: '#28272e' };
  const BIRD_PALS = {
    grey: BIRD_GREY,
    white: { body: '#f8f5ee', under: '#e2dccd', belly: '#fffdf8', wing: '#e8e2d6', wingDk: '#d6cebf', tip: '#c2b8a6', cap: '#f8f5ee', capUnder: '#e2dccd', cheek: '#ffffff', tail: '#d9d1c2', ring: '#f27b89' },
    sakura: Object.assign({}, BIRD_GREY, { speckle: true }),
    cinnamon: { body: '#c9a58a', under: '#b18d73', belly: '#e8d6c6', wing: '#a88267', wingDk: '#8a6650', tip: '#6e4f3d', cap: '#6b4a38', capUnder: '#5c3f30', cheek: '#fffaf4', tail: '#6b4a38' },
    silver: { body: '#b8bfcc', under: '#a1a8b6', belly: '#dfe2ea', wing: '#98a0af', wingDk: '#7d8595', tip: '#5d6473', cap: '#565c69', capUnder: '#4a505c', cheek: '#ffffff', tail: '#565c69' },
    cream: { body: '#ecdfc8', under: '#d9c8ab', belly: '#f7f0e3', wing: '#d8c6a7', wingDk: '#c4ae8c', tip: '#a99170', cap: '#b69c7b', capUnder: '#a28866', cheek: '#fffdf8', tail: '#b69c7b' },
  };
  const BIRD_COLORS = INIT.birdColors || [{ id: 'grey', name: 'Grey', jp: '並', hex: '#8f949f', starter: true }];
  function birdCols(id) {
    return Object.assign({}, BIRD_BASE, BIRD_PALS[id || S.birdColor] || BIRD_GREY);
  }
  // Side view facing `dir`: round body, a big head with a dark cap and white
  // cheek, a thick pink beak and a red eye ring. Flat shading like the other
  // animals. o: hop, sleep, blink, happy, wing ('up' | 'down' | 'glide' |
  // 'flap'), beakOpen, headDown, flying, color (colour id).
  function drawBird(cx, by, dir, o) {
    o = o || {};
    const head = birdBody(cx, by, dir, o, birdCols(o.color));
    if (o.sleep) sleepZ(head.x + 3, head.y - 7);
  }

  function birdBody(cx, by, dir, o, col) {
    const chub = pet.trait === 'chubby' ? 1 : 0;
    const bx = Math.round(cx);
    const y0 = by - (o.hop || 0);
    const brx = r(5.2) + chub;
    const bry = r(3.8) + (o.sleep ? 1 : 0);
    const bcy = y0 - r(2) - bry;
    // feet (tucked away in flight)
    if (!o.flying) {
      R(bx - 2, y0 - r(2), 1, r(2), col.foot); R(bx + 1, y0 - r(2), 1, r(2), col.foot);
      P(bx - 3, y0 - 1, col.foot); P(bx, y0 - 1, col.foot);
    }
    // tail: a dark wedge off the back
    const tx = bx - brx * dir;
    for (let i = 0; i < r(4); i++) R(dir > 0 ? tx - i - 1 : tx + i, bcy - 1 + Math.round(i * 0.5), 2, 1, col.tail);
    // body (with a darker rim underneath) and a soft pale belly
    ellipse(bx, bcy + 1, brx, bry, col.under);
    ellipse(bx, bcy, brx, bry, col.body);
    ellipse(bx + dir, bcy + Math.round(bry / 2), Math.max(1, brx - 2), Math.max(1, Math.round(bry / 2)), col.belly);
    // wing: folded, up, held out (glide) or down; flapping cycles up, out, down
    const wing = o.wing === 'flap' ? ['up', 'glide', 'down', 'glide'][Math.floor(time * (o.flying ? 16 : 10)) % 4] : o.wing;
    const wr = (dx, dy, w, c) => R(dir > 0 ? bx - dx - w + 1 : bx + dx, bcy + dy, w, 1, c);
    if (wing === 'up') {
      const n = r(6);
      for (let i = 0; i < n; i++) wr(Math.round(i * 0.7), -2 - i, Math.max(2, 4 - Math.floor(i / 2)), i > n - 3 ? col.tip : i > 1 ? col.wingDk : col.wing);
    } else if (wing === 'down') {
      const n = r(5);
      for (let i = 0; i < n; i++) wr(1 + Math.round(i * 0.5), 1 + i, Math.max(2, 4 - Math.floor(i / 2)), i > n - 3 ? col.tip : col.wingDk);
    } else if (wing === 'glide') {
      const n = r(9);
      wr(0, -2, n, col.wingDk);
      wr(1, -1, n - 2, col.wing);
      wr(n - 2, -3, 2, col.tip);
      wr(n - 1, -2, 1, col.tip);
    } else {
      ellipse(bx - dir, bcy - 1, Math.max(2, brx - 2), Math.max(1, bry - 2), col.wing);
      wr(brx - 2, 0, 2, col.wingDk);
    }
    // head: sits up front on the body, cap on top, a white cheek below the eye
    const hr = r(3.2);
    const hx = bx + (o.sleep ? r(2.4) : r(4)) * dir;
    const hy = bcy - bry + 1 + (o.headDown ? r(3) : 0) + (o.sleep ? 2 : 0);
    ellipse(hx - dir, hy + 1, hr, hr, col.capUnder);
    ellipse(hx, hy, hr, hr, col.cap);
    ellipse(hx + dir, hy + 1, Math.max(2, hr - 1), Math.max(1, hr - 2), col.cheek);
    if (col.speckle) {
      // 桜文鳥: white flecks scattered over the back, wing and cap
      [[-4, -2], [-2, -3], [0, -2], [-3, 0], [-1, 1], [2, -1], [3, 1], [-5, 0], [1, 2]].forEach(([dx, dy]) => P(bx + dx * dir, bcy + dy, '#f5f2ec'));
      P(hx - dir, hy - hr + 1, '#f5f2ec'); P(hx - 2 * dir, hy - 1, '#f5f2ec'); P(hx, hy - hr, '#f5f2ec');
    }
    if (pet.trait === 'night') P(hx - dir, hy - hr + 1, '#ffe27a');
    if (pet.trait === 'scrappy') { P(hx - dir, hy - hr - 1, col.cap); P(hx, hy - hr - 2, col.cap); }
    // eye with its red ring
    const ex = hx + dir;
    const ey = hy - 1;
    if (o.sleep || o.blink) R(ex - 1, ey, 2, 1, C.ink);
    else if (o.happy) { P(ex - 1, ey, C.ink); P(ex, ey - 1, C.ink); P(ex + 1, ey, C.ink); }
    else { P(ex, ey, C.ink); P(ex - dir, ey, col.ring); P(ex + dir, ey, col.ring); P(ex, ey - 1, col.ring); P(ex, ey + 1, col.ring); }
    // the famous thick pink beak
    if (!o.sleep) {
      const kx = hx + hr * dir;
      R(dir > 0 ? kx : kx - 2, hy - 1, 3, 2, col.beak);
      P(kx + 3 * dir, hy - (o.beakOpen ? 1 : 0), col.beak);
      R(dir > 0 ? kx : kx - 2, hy + 1, 3, 1, o.beakOpen ? col.beakDk : col.beak);
      if (o.beakOpen) P(kx + 2 * dir, hy + 1, '#ffffff');
    }
    // accessories
    // accessories sit round the neck, just behind the cheek
    const nx = hx - 2 * dir;
    const ny = hy + hr;
    if (showCollar()) {
      R(nx - 1, ny, 3, 1, collarColor());
      bellPx(nx, ny + 1);
    }
    if (petStyle().bandana) { R(nx - 1, ny, 3, 2, '#2e3f7a'); P(nx, ny + 2, '#2e3f7a'); P(nx - dir, ny, '#ffffff'); }
    if (pet.stage >= 3) { R(hx - 1, hy - hr - 2, 3, 1, C.gold); P(hx - 1, hy - hr - 3, C.gold); P(hx + 1, hy - hr - 3, C.gold); }
    return { x: hx, y: hy - hr };
  }

  // an n-by-n pixel Z: top bar, diagonal, bottom bar
  function zGlyph(x, y, n, c) {
    R(x, y, n, 1, c);
    for (let k = 1; k <= n - 2; k++) P(x + n - 1 - k, y + k, c);
    R(x, y + n - 1, n, 1, c);
  }
  // z Z Z: three Zs rise one after another over a sleeping pet, then a pause
  // (x, y: just above the pet's head)
  function sleepZ(x, y) {
    const c = time % 3;
    if (c >= 2.4) return;
    // 5x5 (the smallest that reads as a Z), a pixel apart, rising gently
    for (let k = 0; k < 3; k++) if (c >= k * 0.6) zGlyph(x - 1 + k * 6, y - 4 - k * 4, 5, '#8b7b69');
  }
  // Pets without a kotatsu head-poke sleep on top of it instead.
  function bedTop(x) {
    return petStyle().bed === 'kotatsu' && Math.abs(x - BED_X) < 5 ? 10 : 0;
  }

  function drawPuffleTama(x, by, st) {
    const blink = tama.blink < 0.12;
    const trick = st === 'trick' || st === 'beckon';
    if (st === 'sleep') {
      const lift = bedTop(x);
      drawPuffle(x, by - lift, { squash: true, sleep: true });
      sleepZ(x + 7, by - lift - 16);
    } else if (st === 'walk' || st === 'play-run') {
      const b = Math.abs(Math.sin(time * 9));
      drawPuffle(x, by - Math.round(b * 4), { squash: b < 0.2, look: tama.dir });
    } else if (st === 'eat') {
      drawPuffle(x, by, { squash: Math.floor(tama.t * 4) % 2 === 0, look: tama.dir, open: true });
    } else if (st === 'roll') {
      // backflip: up, upside down at the top, and back down
      const f = clamp(tama.t / tama.dur, 0, 1);
      const up = Math.round(Math.sin(f * Math.PI) * 14);
      drawPuffle(x, by - up, { flip: f > 0.3 && f < 0.7, happy: true });
    } else if (trick) {
      const s0 = pet.stage || 0;
      if (s0 >= 2 && st === 'trick') {
        // spin: it looks left and right very fast
        drawPuffle(x, by, { look: Math.floor(tama.t * 10) % 2 ? 1 : -1, squash: Math.floor(tama.t * 10) % 4 === 0, happy: tama.t > tama.dur - 0.5 });
      } else {
        const b = Math.abs(Math.sin(tama.t * 7));
        drawPuffle(x, by - Math.round(b * 7), { squash: b < 0.15, happy: true });
      }
      if (st === 'beckon' && Math.floor(time * 4) % 5 === 0) P(x + rand(-8, 8), by - rand(10, 22), '#fff6cc');
    } else {
      const breathe = Math.floor(time * 1.2) % 4 === 0;
      drawPuffle(x, by, { squash: breathe, blink, happy: st === 'purr' || st === 'groom', look: st === 'watch' || st === 'beg' ? -1 : 0 });
    }
  }

  // ----------------------------------------------------- 文鳥 flight
  // Birds fly in smooth arcs between perches around the room: they flap on
  // the way up, glide on the way down, flutter to land, and sometimes take a
  // lap of the room first. Works for any object with x, y (feet), dir, air.
  const PERCHES = [
    { x: 30, y: 76 }, { x: 74, y: 76 }, // window sill
    { x: 117, y: 20 }, { x: 155, y: 20 }, // menu rail
    { x: 290, y: 19 }, // top of the door frame
    { x: 183, y: 104 }, // counter
    { x: 70, y: 92 }, // on the rice cooker
    { x: 151, y: 60 }, // on the suggestion box
    { x: 245, y: 62 }, // on the "open" sign by the door
  ];
  const aloft = (o) => (o.y == null ? FLOOR_Y : o.y) < FLOOR_Y - 0.5;
  // Tables count too: a bird can stand on an empty place setting (where the
  // plate goes, beside the candle), and hops off when a guest sits down there.
  const TABLE_TOP = 146;
  function perchSpots() {
    return PERCHES.concat(seats.filter((st) => !st.guest).map((st) => ({ x: st.x, y: TABLE_TOP, seat: st })));
  }
  function freePerch(o, other) {
    const all = perchSpots();
    const opts = all.filter((p) => Math.hypot(p.x - o.x, p.y - o.y) > 30 && !(other && Math.hypot(p.x - other.x, p.y - (other.y || FLOOR_Y)) < 16));
    return pick(opts.length ? opts : all);
  }
  // Has a guest just sat down where this bird is standing?
  const seatTaken = (o) => !!(o.perch && o.perch.seat && o.perch.seat.guest);
  // A few loose waypoints for a lap of the room.
  function lap() {
    const n = 1 + Math.floor(Math.random() * 2);
    return Array.from({ length: n }, () => ({ x: rand(30, 290), y: rand(34, 120) }));
  }
  function flyTo(o, pts, then) {
    const [p, ...rest] = pts;
    const a = { x: o.x, y: o.y == null ? FLOOR_Y : o.y };
    const dx = p.x - a.x;
    const dist = Math.hypot(dx, p.y - a.y);
    // the arc peaks a little above the higher end, more for longer flights
    const top = Math.max(12, Math.min(a.y, p.y) - (8 + dist * 0.18 + rand(0, 8)));
    o.air = {
      a, b: { x: p.x, y: p.y },
      c1: { x: a.x + dx * 0.15, y: top + (a.y - top) * 0.15 },
      c2: { x: p.x - dx * 0.3, y: top },
      t: 0,
      dur: 0.7 + dist / rand(46, 58),
      last: rest.length === 0,
      then: rest.length ? () => flyTo(o, rest, then) : then,
    };
  }
  function bez(f, u) {
    const v = 1 - u;
    const k0 = v * v * v, k1 = 3 * v * v * u, k2 = 3 * v * u * u, k3 = u * u * u;
    return { x: k0 * f.a.x + k1 * f.c1.x + k2 * f.c2.x + k3 * f.b.x, y: k0 * f.a.y + k1 * f.c1.y + k2 * f.c2.y + k3 * f.b.y };
  }
  function updateFlight(o, dt) {
    const f = o.air;
    if (!f) return;
    f.t += dt;
    const u = clamp(f.t / f.dur, 0, 1);
    // ease in and out, gentler between the waypoints of a lap
    const e = f.last ? u * u * (3 - 2 * u) : u * (0.6 + 0.4 * u);
    const q = bez(f, e);
    const vx = q.x - o.x;
    const vy = q.y - o.y;
    o.x = q.x;
    o.y = q.y;
    if (Math.abs(vx) > 0.04) o.dir = vx > 0 ? 1 : -1;
    // flap to climb, take off and land; glide when coasting down
    o.flap = vy < -0.12 || u < 0.15 || (f.last && u > 0.82) ? 'flap' : 'glide';
    if (u >= 1) {
      o.air = null;
      o.y = f.b.y;
      o.flap = null;
      if (f.then) f.then();
    }
  }
  // a faint shadow on the tatami under a bird flying low
  function flightShadow(x, y) {
    if (y < 118 || y > FLOOR_Y - 3) return;
    g.fillStyle = `rgba(40,25,10,${0.1 + 0.12 * ((y - 118) / (FLOOR_Y - 118))})`;
    ellipseRaw(Math.round(x), FLOOR_Y, 4, 1);
  }

  // The pet sparrow's outings: to a perch, sometimes by way of a lap.
  function birdOuting() {
    const other = residents.find((a) => a.id === 'buncho');
    const perch = freePerch(tama, other);
    const pts = Math.random() < 0.3 ? [...lap(), perch] : [perch];
    tama.state = 'fly';
    tama.perch = null;
    flyTo(tama, pts, () => {
      // the seat may have been taken while it was on the way
      if (perch.seat && perch.seat.guest) { birdOuting(); return; }
      tama.perch = perch;
      tamaSet('perch', rand(7, 16));
      if (Math.random() < 0.4) voice();
    });
  }
  function birdLand(x, then) {
    tama.state = 'fly';
    flyTo(tama, [{ x: clamp(x, 8, 300), y: FLOOR_Y }], () => { if (then) then(); else tamaSet('sit', 4); });
  }

  function drawBirdTama(x, by, st) {
    const blink = tama.blink < 0.12;
    const d = tama.dir;
    if (tama.air || st === 'play-fly' || st === 'play-hover') {
      flightShadow(x, by);
      drawBird(x, by + Math.round(Math.sin(time * 16) * 0.6), d, { flying: true, wing: st === 'play-hover' ? 'flap' : tama.flap || 'flap', happy: st !== 'fly' });
    } else if (st === 'perch') {
      // looks around, sings now and then, preens
      const ph = Math.floor(tama.t * 1.2) % 8;
      drawBird(x, by, ph === 2 || ph === 3 ? -d : d, { blink, beakOpen: ph === 5 && Math.floor(tama.t * 6) % 2 === 0, wing: ph === 7 ? 'up' : null });
      if (ph === 5 && Math.floor(tama.t * 3) !== Math.floor((tama.t - 1 / 30) * 3)) particles.push({ x: x + d * 6, y: by - 16, vx: d * 5, vy: -7, life: 0.9, c: C.ink, type: 'note' });
    } else if (st === 'sleep') {
      drawBird(x, by - bedTop(x), d, { sleep: true });
    } else if (st === 'walk' || st === 'play-run') {
      drawBird(x, by, d, { hop: Math.floor(time * 8) % 2 ? 2 : 0 });
    } else if (st === 'eat') {
      drawBird(x, by, d, { headDown: Math.floor(tama.t * 5) % 2 === 0 });
    } else if (st === 'roll') {
      // a little loop through the air
      const f = clamp(tama.t / tama.dur, 0, 1);
      drawBird(x + Math.round(Math.sin(f * Math.PI * 2) * 8), by, f < 0.5 ? d : -d, { hop: Math.round(Math.sin(f * Math.PI) * 16), wing: 'flap', flying: f > 0.05 && f < 0.95, happy: true });
    } else if (st === 'trick' || st === 'beckon') {
      const s0 = pet.stage || 0;
      if (s0 >= 2 && st === 'trick') {
        drawBird(x, by, d, { beakOpen: Math.floor(tama.t * 6) % 2 === 0, happy: true });
        if (Math.floor(tama.t * 3) !== Math.floor((tama.t - 1 / 30) * 3)) particles.push({ x: x + d * 6, y: by - 16, vx: d * 6, vy: -8, life: 1, c: C.ink, type: 'note' });
      } else {
        drawBird(x, by, d, { wing: 'flap', happy: true, hop: Math.floor(tama.t * 6) % 2 });
      }
    } else {
      drawBird(x, by, d, { blink, happy: st === 'purr' || st === 'groom', wing: st === 'groom' ? 'up' : null });
    }
  }

  function drawTama() {
    if (!pet.species) return; // not chosen yet
    const x = Math.round(tama.x);
    const by = Math.round(tama.y == null ? FLOOR_Y : tama.y) - Math.round(tama.hop);
    const st = tama.state;
    const walkFrame = Math.floor(time * 8) % 4;
    if (pet.species === 'puffle') drawPuffleTama(x, by, st);
    else if (pet.species === 'bird') drawBirdTama(x, by, st);
    else if (st === 'sleep') catSleep(x, by);
    else if (st === 'walk' || st === 'play-run') catSide(x, by, tama.dir, walkFrame);
    else if (st === 'stretch') catSide(x, by, tama.dir, 0, { low: true, happy: true });
    else if (st === 'eat') catSide(x, by, tama.dir, 0, { headDown: Math.floor(tama.t * 4) % 2 === 0 });
    else if (st === 'roll') catRoll(x, by);
    else {
      const groom = st === 'groom';
      const trick = st === 'trick' || st === 'beckon';
      if (st === 'beckon' && Math.floor(time * 4) % 5 === 0) P(x + rand(-8, 8), by - rand(10, 22), '#fff6cc');
      const pawUp = groom ? 2 + (Math.floor(tama.t * 4) % 2) : trick ? 2 + Math.round(Math.abs(Math.sin(tama.t * 8)) * 3) : 0;
      catSit(x, by, {
        happy: st === 'purr' || groom || trick,
        blink: tama.blink < 0.12,
        look: st === 'watch' ? -1 : st === 'beg' ? -1 : 0,
        fastTail: st === 'purr' || st === 'play-sit',
        paw: groom || trick ? (groom ? -1 : 1) : 0,
        pawUp,
      });
    }
    if (st !== 'sleep' && st !== 'walk' && (st === 'beg' || tama.wantsFish)) drawThought(x + 6, by - 26);
    if (feather) drawFeather();
    regions.push({ x: x - 12, y: by - 20, w: 24, h: 21, label: tamaLabel(), click: () => petAction('pet') });
  }

  function drawThought(x, y) {
    R(x, y, 11, 7, C.ink); R(x + 1, y + 1, 9, 5, '#fffaf0');
    P(x + 1, y + 7, C.ink); P(x, y + 8, C.ink);
    if (pet.species === 'puffle') {
      // a puffle O
      R(x + 4, y + 2, 3, 1, '#c98a4a'); R(x + 4, y + 4, 3, 1, '#c98a4a'); P(x + 3, y + 3, '#c98a4a'); P(x + 7, y + 3, '#c98a4a');
    } else if (pet.species === 'bird') {
      // millet spray
      P(x + 3, y + 5, '#8a9a4a'); P(x + 4, y + 4, '#8a9a4a');
      [[5, 3], [6, 2], [7, 3], [6, 4], [5, 2], [7, 1]].forEach(([dx, dy]) => P(x + dx, y + dy, '#e8c25a'));
    } else {
      // tiny fish
      R(x + 3, y + 3, 4, 1, '#6a9ac4'); R(x + 4, y + 2, 2, 3, '#6a9ac4'); P(x + 7, y + 2, '#6a9ac4'); P(x + 7, y + 4, '#6a9ac4'); P(x + 3, y + 3, C.ink);
    }
  }

  function drawFeather() {
    const fx = Math.round(feather.x);
    const fy = Math.round(feather.y);
    line(fx, fy, fx + 8, fy - 14, '#8a5a34');
    if (pet.species === 'puffle') {
      // bouncy ball
      ellipse(fx, fy + 1, 2, 2, '#e8546a'); R(fx - 2, fy + 1, 5, 1, '#fbf7ee'); P(fx - 1, fy, '#fbf7ee');
    } else if (pet.species === 'bird') {
      // little bell
      R(fx - 1, fy, 3, 3, C.gold); P(fx, fy + 3, C.goldDk); P(fx - 1, fy, '#fff6cc');
    } else {
      R(fx - 1, fy, 3, 3, '#e8546a'); P(fx, fy + 3, '#f7c6d4'); P(fx - 2, fy + 1, '#f7c6d4'); P(fx + 2, fy + 2, '#3b6ea5');
    }
  }

  function meterDots(v) {
    const n = Math.round(clamp(v, 0, 100) / 20);
    return '●'.repeat(n) + '○'.repeat(5 - n);
  }
  function tamaLabel() {
    const mood = tama.state === 'beckon' ? 'Beckoning guests in (+1 tip)' : tama.state === 'sleep' ? 'Sound asleep' : tama.state === 'play-run' || tama.state === 'play-sit' ? 'Playing!' : tama.wantsFish ? `Hoping for a ${sp().food}…` : petHappy() ? 'Very happy (+1 tip)' : sp().idle;
    return `<b>${esc(pet.name)}</b> · ${pet.stageJp} ${pet.stageName}\n${mood}. Tap to pet.\nお腹 ${meterDots(pet.tummy)}  愛情 ${meterDots(pet.love)}  元気 ${meterDots(pet.energy)}`;
  }

  // ------------------------------------------------------- Tama behaviour
  function tamaGo(x, then) {
    if (pet.species === 'bird' && (aloft(tama) || Math.abs(x - tama.x) > 70)) { birdLand(x, then); return; }
    tama.target = clamp(x, 8, 300);
    tama.then = then;
    tama.state = 'walk';
    tama.t = 0;
  }
  function tamaSet(state, dur) {
    tama.state = state;
    tama.t = 0;
    tama.dur = dur;
  }

  function tamaDecide() {
    const h = hourNow();
    const sleepy = pet.energy < 35 || timer.phase === 'focus' || h >= 23.5 || h < 5.5;
    tama.wantsFish = pet.tummy < 40 && pet.fish > 0;
    if (pet.species === 'bird' && !sleepy && !tama.wantsFish) {
      if (aloft(tama)) {
        // from a perch: hop to another, take a lap and land, or glide down
        const roll0 = Math.random();
        if (roll0 < 0.45) birdOuting();
        else if (roll0 < 0.65) { tama.state = 'fly'; flyTo(tama, [...lap(), { x: rand(20, 290), y: FLOOR_Y }], () => tamaSet('sit', rand(4, 8))); }
        else birdLand(rand(20, 290), () => tamaSet('sit', rand(4, 8)));
        return;
      }
      if (Math.random() < 0.4) { birdOuting(); return; }
    }
    if (tama.wantsFish && Math.random() < 0.5) {
      tamaGo(BOWL_X + 12, () => { tama.dir = -1; tamaSet('beg', rand(6, 10)); if (Math.random() < 0.5) voice(); });
      return;
    }
    if (sleepy && Math.random() < 0.75) {
      const spot = sunbeam() && Math.random() < 0.6 ? SUN_X : BED_X;
      tamaGo(spot, () => tamaSet('sleep', rand(30, 70)));
      return;
    }
    if (petHappy() && Math.random() < 0.3) {
      // happy-cat bonus: she beckons guests in at the door, maneki-neko style
      tamaGo(246, () => { tama.dir = 1; tamaSet('beckon', rand(6, 10)); });
      return;
    }
    const roll = Math.random();
    if (roll < 0.35) tamaGo(rand(20, 290), () => tamaSet('sit', rand(5, 10)));
    else if (roll < 0.5) tamaSet('groom', rand(3, 5));
    else if (roll < 0.62 && sunbeam()) tamaGo(SUN_X, () => tamaSet('sleep', rand(20, 40)));
    else if (roll < 0.74) tamaGo(rand(40, 110), () => tamaSet('watch', rand(4, 7)));
    else if (roll < 0.82 && customers.length) tamaGo(clamp(pick(customers).x, 20, 280), () => tamaSet('sit', rand(4, 8)));
    else tamaSet('sit', rand(4, 8));
  }

  function updateTama(dt) {
    tama.t += dt;
    tama.blink -= dt;
    if (tama.blink < 0) tama.blink = rand(2.5, 5);
    tama.hop = Math.max(0, tama.hop - dt * 20);

    if (feather && pet.species === 'bird') {
      // the sparrow chases the bell toy through the air
      feather.t -= dt;
      if (feather.t <= 0) { endPlay(); return; }
      tama.air = null;
      const tx = clamp(feather.x, 10, 300);
      const ty = clamp(feather.y + 10, 26, FLOOR_Y);
      const dx = tx - tama.x;
      const dy = ty - tama.y;
      const d = Math.hypot(dx, dy);
      if (d > 3) {
        const step = Math.min(d, (40 + d * 0.8) * dt);
        tama.x += (dx / d) * step;
        tama.y += (dy / d) * step;
        if (Math.abs(dx) > 1) tama.dir = dx > 0 ? 1 : -1;
        tama.flap = dy < -0.5 || tama.y < FLOOR_Y - 1 ? 'flap' : 'glide';
        tama.state = tama.y < FLOOR_Y - 1 ? 'play-fly' : 'play-run';
      } else {
        tama.state = tama.y < FLOOR_Y - 1 ? 'play-hover' : 'play-sit';
        if (Math.random() < dt * 0.8) spawnHearts(tama.x, tama.y - 16, 1);
      }
      return;
    }
    if (tama.air) { updateFlight(tama, dt); return; }
    if (tama.state === 'perch' && Math.random() < dt * 0.04 && timer.phase !== 'focus') voice();
    if (tama.state === 'perch' && seatTaken(tama)) { tama.perch = null; voice(); birdOuting(); return; }
    if (tama.state !== 'perch') tama.perch = null;

    if (feather) {
      feather.t -= dt;
      if (feather.t <= 0) endPlay();
      else {
        const dx = clamp(feather.x, 10, 300) - tama.x;
        if (Math.abs(dx) > 4) {
          tama.state = 'play-run';
          tama.dir = dx > 0 ? 1 : -1;
          tama.x += Math.sign(dx) * Math.min(Math.abs(dx), 34 * dt);
        } else {
          if (tama.state !== 'play-sit') { tama.state = 'play-sit'; tama.t = 0; }
          if (feather.y > 150 && tama.hop === 0 && Math.random() < dt * 2.5) {
            tama.hop = 5;
            OKSound.pop();
            if (Math.random() < 0.4) spawnHearts(tama.x, 158, 1);
          }
        }
      }
      return;
    }

    if (tama.state === 'walk') {
      const speed = 12 + 6 * k();
      const dx = tama.target - tama.x;
      tama.dir = dx >= 0 ? 1 : -1;
      if (Math.abs(dx) <= speed * dt) {
        tama.x = tama.target;
        const then = tama.then;
        tama.then = null;
        if (then) then(); else tamaSet('sit', 4);
      } else {
        tama.x += tama.dir * speed * dt;
      }
      return;
    }
    if (tama.state === 'eat' && Math.floor(tama.t * 2) !== Math.floor((tama.t - dt) * 2)) {
      particles.push({ x: BOWL_X + rand(-2, 2), y: FLOOR_Y - 4, vx: rand(-5, 5), vy: -rand(5, 9), life: 0.4, c: '#e8b8a0', type: 'crumb' });
    }
    if (tama.state === 'sleep' && timer.phase === 'break' && tama.t > 4 && Math.random() < dt * 0.15) {
      // breaks are play time: she tends to wake up
      tamaSet('stretch', 1);
      return;
    }
    if (tama.t >= tama.dur) {
      if (tama.state === 'sleep') { tamaSet('stretch', 1.1); return; }
      if (tama.resume) { const r = tama.resume; tama.resume = null; tamaGo(r.x, r.then); return; }
      tamaDecide();
    }
  }

  function tamaReact(kind) {
    const hy = (tama.y == null ? FLOOR_Y : tama.y) - 16;
    // flying or chasing the toy: hearts, but no stopping
    if (tama.air || feather) { if (kind === 'pet') { spawnHearts(tama.x, hy, 2); voice(); } return; }
    // walking somewhere: stop for the pat, then carry on (to the bowl, to bed…)
    if (tama.state === 'walk') {
      if (kind !== 'pet') return;
      tama.resume = tama.target == null ? null : { x: tama.target, then: tama.then };
      tama.target = null;
      tama.then = null;
    }
    if (kind === 'pet') { tamaSet(aloft(tama) ? 'perch' : 'purr', 3.5); spawnHearts(tama.x, hy, 2); voice(); }
    else if (kind === 'brush') {
      tamaSet('purr', 4);
      for (let i = 0; i < 8; i++) particles.push({ x: tama.x + rand(-6, 6), y: FLOOR_Y - rand(4, 12), vx: rand(-8, 8), vy: -rand(2, 8), life: rand(0.8, 1.6), c: '#fbf7ee', type: 'steam' });
      OKSound.chime();
    } else if (kind === 'feed') {
      tamaGo(BOWL_X + 9, () => { tama.dir = -1; tamaSet('eat', 3.2); tama.wantsFish = false; OKSound.pop(); });
    } else if (kind === 'trick') {
      const s = pet.stage || 0;
      if (s >= 3) { tamaSet('roll', 2.5); }
      else { tamaSet('trick', 2.4); }
      OKSound.pluck(6 + s);
      setTimeout(() => spawnHearts(tama.x, (tama.y == null ? FLOOR_Y : tama.y) - 18, 2), 800);
    }
  }

  function petAction(kind) {
    if (kind === 'play') {
      // the same button turns the feather toy off again
      if (feather) { endPlay(); $('ok-pet').hidden = true; return; }
      startPlay();
      return;
    }
    send('pet', kind, (res) => {
      if (!res) return;
      if (res.pet) { pet = res.pet; renderPetPanel(); }
      if (res.ok) tamaReact(kind);
      else if (kind !== 'pet') toast(res.msg);
      if (res.ok && res.msg) toast(res.msg);
    });
    if (kind === 'pet' && tama.state === 'sleep') { tamaSet('stretch', 1); }
  }

  function startPlay() {
    send('pet', 'play', (res) => {
      if (!res) return;
      if (res.pet) { pet = res.pet; renderPetPanel(); }
      if (!res.ok) { toast(res.msg); return; }
      $('ok-pet').hidden = true;
      feather = { x: tama.x + 20, y: 160, t: 20 };
      renderPlayButton();
      toast(`遊ぼう! Wave the ${sp().toy.toLowerCase()} with your mouse. Press Esc to stop`);
      OKSound.pluck(7);
    });
  }
  function endPlay() {
    if (!feather) return;
    feather = null;
    renderPlayButton();
    spawnHearts(tama.x, (tama.y == null ? FLOOR_Y : tama.y) - 18, 2);
    if (pet.species === 'bird' && aloft(tama)) { tamaSet('fly', 99); birdOuting(); }
    else { tama.y = FLOOR_Y; tamaSet('sit', 3); }
    voice();
  }

  // ---------------------------------------------------------------- gifts
  const GIFT_SPRITES = {
    momiji: ['...r...', '.r.r.r.', '.rrrrr.', 'rrrrrrr', '.rrrrr.', '...b...', '...b...'],
    donguri: ['..BBB..', '.BBBBB.', '.bbbbb.', '.ooooo.', '.ooooo.', '..ooo..', '...o...'],
    matsubokkuri: ['...b...', '..bBb..', '.bBbBb.', '.BbBbB.', '.bBbBb.', '..bBb..', '...b...'],
    button: ['.ggggg.', 'gGGGGGg', 'gGhGhGg', 'gGGGGGg', 'gGhGhGg', 'gGGGGGg', '.ggggg.'],
    ribbon: ['rr...rr', 'rrr.rrr', '.rrRrr.', '..RRR..', '.rrRrr.', '.r...r.', 'r.....r'],
    hane: ['.....ww', '....wWw', '...wWw.', '..wWw..', '.wWw...', '.Ww....', 'b......'],
    biidama: ['..ccc..', '.cCCcc.', 'cCwcbcc', 'ccbbcCc', 'cCcbcCc', '.ccCcc.', '..ccc..'],
    kaigara: ['...p...', '..pPp..', '.pPpPp.', 'pPpPpPp', 'pPpPpPp', '.ppppp.', '..PPP..'],
    hanabira: ['.......', '..pp...', '.pPPp..', '.pPPPp.', '..pPPp.', '...pp..', '.......'],
    orizuru: ['......w', '.....ww', 'w...wWw', 'wwwwWw.', '.wWWWw.', '..www..', '...w...'],
    kosen: ['..yyy..', '.yYYYy.', 'yYYhYYy', 'yYhhhYy', 'yYYhYYy', '.yYYYy.', '..yyy..'],
    omikuji: ['..www..', '..wrw..', '..www..', '..wrw..', '..www..', '..wrw..', '..www..'],
    omamori: ['..rrr..', '.rYYYr.', '.rYwYr.', '.rYYYr.', '.rYyYr.', '.rYYYr.', '..rrr..'],
    koban: ['..yyy..', '.yYYYy.', '.yYhYy.', '.yYhYy.', '.yYhYy.', '.yYYYy.', '..yyy..'],
    kanzashi: ['.....pP', '....pPp', '.....p.', '....y..', '...y...', '..y....', '.y.....'],
  };
  const GIFT_PAL = {
    r: '#d9542f', R: '#a8322a', b: '#6a4428', B: '#5a3a22', o: '#c98a4a', g: '#3b6ea5', G: '#5a8cc4', h: '#22364f',
    w: '#fbf7ee', W: '#d8d2c6', c: '#8fd0e8', C: '#c9eef8', p: '#f2a9c0', P: '#f7c6d4', y: '#b8902e', Y: '#e8c25a',
  };
  function drawGiftSprite(id, x, y, ctx) {
    const rows = GIFT_SPRITES[id];
    if (!rows) return;
    const c = ctx || gRef;
    rows.forEach((row, j) => {
      for (let i = 0; i < row.length; i++) {
        const ch = row[i];
        if (ch === '.') continue;
        c.fillStyle = GIFT_PAL[ch] || '#000';
        c.fillRect(x + i, y + j, 1, 1);
      }
    });
  }

  function checkGift() {
    send('petgift', null, (res) => {
      if (!res || !res.gift) return;
      if (res.pet) pet = res.pet;
      if (res.state) S = Object.assign(S, res.state);
      const gx = clamp(tama.x + (tama.dir > 0 ? 10 : -10), 16, 296);
      floorGifts.push({ gift: res.gift, x: gx, t: 0 });
      tamaSet('sit', 5);
      voice();
      say([`${pet.name}が何か持ってきた!`, `${pet.name} brought you something!`], { x: tama.x, y: 150 });
    });
  }

  function drawFloorGifts() {
    for (const fg of floorGifts) {
      const bob = Math.round(Math.sin(time * 3 + fg.x) * 1);
      drawGiftSprite(fg.gift.id, fg.x - 3, FLOOR_Y - 7 + bob);
      if (Math.floor(time * 4) % 4 === 0) P(fg.x + 3, FLOOR_Y - 9 + bob, '#fff6cc');
      regions.push({ x: fg.x - 5, y: FLOOR_Y - 11, w: 11, h: 12, label: `<b>${fg.gift.jp}</b> A gift from ${esc(pet.name)}\nTap to pick it up`, click: () => collectGift(fg) });
    }
  }
  function collectGift(fg) {
    floorGifts = floorGifts.filter((x) => x !== fg);
    OKSound.coin();
    spawnHearts(fg.x, 160, 1);
    const gft = fg.gift;
    if (gft.id === 'kosen') { dispMon += 5; bumpPurse(); }
    if (gft.id === 'koban') { dispMon += 25; bumpPurse(); }
    if (gft.setBonus) { dispMon += gft.setBonus; bumpPurse(); setTimeout(() => setBonusModal(gft.setBonus), 400); }
    if (gft.rare) { OKSound.fanfare(); spawnHearts(fg.x, 158, 3); }
    if (gft.fortune) {
      modal(gft.fortune.jp, 'おみくじ · Fortune slip', `${esc(pet.name)} found a fortune for you:<br><b>${gft.fortune.text}</b>`, [['ありがとう<small>Thanks</small>', 'ok-hanko ok-hanko-wide', null]]);
    } else {
      toast(`${gft.jp} ${gft.name}: ${gft.desc}`);
    }
    renderPetPanel();
  }

  function setBonusModal(amount) {
    OKSound.fanfare();
    spawnHearts(40, 90, 4);
    modal('宝物', 'Keepsake collection complete!',
      `${esc(pet.name)} has brought you all 12 keepsakes.<br><b>+${amount} mon</b> and a <b>宝物棚 treasure shelf</b> for the wall.`,
      [['やった!<small>Wonderful</small>', 'ok-hanko ok-hanko-wide', null]]);
  }

  // 宝物棚: shows the keepsakes on the wall once the set is complete
  function drawTreasureShelf() {
    if (!has('takaramono')) return;
    const x = 14;
    const y = 86;
    R(x, y - 1, 60, 2, C.woodDk);
    R(x + 2, y + 1, 2, 3, C.woodDk); R(x + 56, y + 1, 2, 3, C.woodDk);
    const shown = PET_GIFTS.filter((gf) => (pet.gifts || {})[gf.id]).slice(0, 7);
    shown.forEach((gf, i) => drawGiftSprite(gf.id, x + 2 + i * 8, y - 8));
    regions.push({ x, y: y - 9, w: 60, h: 13, label: `<b>宝物棚</b> Treasure shelf\nAll 12 of ${esc(pet.name)}'s keepsakes, found!`, click: () => { OKSound.chime(); spawnHearts(x + 30, y - 10, 1); } });
  }

  // ----------------------------------------------------------- pet panel
  function drawPortrait(canvas) {
    canvas.width = 36;
    canvas.height = 30;
    const ctx = canvas.getContext('2d');
    const prev = gRef;
    gRef = ctx;
    if (pet.species === 'puffle') drawPuffle(18, 27, { happy: true });
    else if (pet.species === 'bird') drawBird(18, 27, 1, { happy: true });
    else catSit(17, 27, { happy: true });
    gRef = prev;
  }

  let petTab = 'care';
  function renderPetPanel() {
    renderPetButton();
    const panel = $('ok-pet');
    if (!panel || panel.hidden) return;
    const P0 = sp();
    drawPortrait($('ok-pet-portrait'));
    $('ok-pet-name').textContent = pet.name;
    const ti = pet.traitInfo || { jp: '', name: '', desc: '' };
    $('ok-pet-stage').innerHTML = `${pet.stageJp} ${pet.stageName}<span class="ok-pet-traitchip" title="${esc(ti.desc)}">${ti.jp} ${ti.name}</span>`;
    const next = pet.nextStageDays;
    const prevDays = (PET_STAGES[pet.stage] || { days: 0 }).days;
    if (next) {
      const frac = clamp((pet.studyDays - prevDays) / (next - prevDays), 0, 1);
      $('ok-pet-grow').style.width = frac * 100 + '%';
      $('ok-pet-growtext').textContent = `${pet.studyDays} study days · grows up at ${next}`;
    } else {
      $('ok-pet-grow').style.width = '100%';
      $('ok-pet-growtext').textContent = `${pet.studyDays} study days · fully grown`;
    }
    $('ok-pet-portrait').title = `${They()} eats while you review, gets a ${P0.food} for every guest you serve, and perks up after focus sessions. ${They()} never gets sick or runs away.`;
    document.querySelectorAll('#ok-pet-tabs [data-tab]').forEach((t) => t.classList.toggle('on', t.dataset.tab === petTab));
    document.querySelectorAll('#ok-pet .ok-tab').forEach((t) => { t.hidden = t.dataset.tab !== petTab; });

    // care: compact meters (the hint lives in the tooltip)
    const meters = [
      ['tummy', 'お腹', 'Tummy', pet.tummy, pet.tummy < 40 ? `Peckish. Reviews and ${foods()} help.` : pet.tummy > 85 ? 'Full and happy.' : 'Content.'],
      ['love', '愛情', 'Love', pet.love, pet.love < 40 ? 'Would love some attention.' : pet.love > 85 ? 'Adores you.' : 'Fond of you.'],
      ['energy', '元気', 'Energy', pet.energy, pet.energy < 35 ? `Sleepy. Focus sessions perk ${P0.them} up.` : pet.energy > 85 ? 'Bouncing off the walls.' : 'Lively.'],
    ];
    $('ok-pet-meters').innerHTML = meters.map(([id, jp, en, val, hint]) => {
      const n = Math.round(clamp(val, 0, 100) / 10);
      let segs = '';
      for (let i = 0; i < 10; i++) segs += `<i class="${i < n ? 'on' : ''}"></i>`;
      return `<div class="ok-meter ok-meter-${id}" title="${hint}"><span class="ok-meter-label"><b class="jp">${jp}</b> ${en}</span><span class="ok-meter-bar">${segs}</span></div>`;
    }).join('');
    const happy = petHappy();
    $('ok-pet-happy').className = 'ok-pet-happy' + (happy ? ' on' : '');
    $('ok-pet-happy').innerHTML = happy
      ? `<b>✦ Happy!</b> ${They()} beckons guests in: +1 tip each.`
      : '✦ All three at 70+ gives <b>+1 tip</b> from every guest.';
    $('ok-pet-foodjp').textContent = P0.foodJp;
    $('ok-pet-fish').textContent = pet.fish;
    document.querySelector('[data-pet="feed"]').title = `Feed ${P0.them} a ${P0.food} (${pet.fish} saved)`;
    renderPlayButton();
    const trickBtn = document.querySelector('[data-pet="trick"]');
    trickBtn.querySelector('small').textContent = pet.stage >= 1 ? P0.tricks[Math.min(3, pet.stage) - 1] : 'Trick';
    trickBtn.title = pet.stage >= 1 ? '' : `Learns tricks at ${(PET_STAGES[1] || {}).jp || 'the next stage'}`;
    trickBtn.disabled = pet.stage < 1;

    // style
    renderAccessories();

    // keepsakes
    const found = PET_GIFTS.filter((gf) => pet.gifts && pet.gifts[gf.id]).length;
    $('ok-pet-giftcount').textContent = `${found}/${PET_GIFTS.length}`;
    const fill = (box, list, rare) => {
      box.innerHTML = '';
      for (const gf of list) {
        const count = (pet.gifts || {})[gf.id] || 0;
        const cell = document.createElement('div');
        cell.className = 'ok-gift' + (rare ? ' ok-gift-rare' : '') + (count ? '' : ' unknown');
        if (count) {
          const cv = document.createElement('canvas');
          cv.width = 7;
          cv.height = 7;
          drawGiftSprite(gf.id, 0, 0, cv.getContext('2d'));
          cell.appendChild(cv);
          cell.title = `${gf.jp} ${gf.name}: ${gf.desc}`;
          cell.insertAdjacentHTML('beforeend', `<span>${gf.jp}</span><small>${esc(gf.name)}</small>${count > 1 ? `<em>×${count}</em>` : ''}`);
        } else {
          cell.innerHTML = rare ? '<b>★</b>' : '<b>?</b>';
          cell.title = rare ? 'A rare keepsake. Only brought when love is 90 or more.' : 'Not found yet. A happy, well-fed pet brings gifts now and then.';
        }
        box.appendChild(cell);
      }
    };
    fill($('ok-pet-gifts'), PET_GIFTS, false);
    fill($('ok-pet-rare'), PET_RARE, true);
    $('ok-pet-setnote').innerHTML = pet.setBonus
      ? '<b class="jp">宝物</b> Complete! The treasure shelf is on your wall.'
      : `Find all ${PET_GIFTS.length} for <b>+500 mon</b> and a treasure shelf.`;
  }
  document.querySelectorAll('#ok-pet-tabs [data-tab]').forEach((t) => t.addEventListener('click', () => {
    petTab = t.dataset.tab;
    OKSound.blip();
    renderPetPanel();
  }));

  // Footer: 猫 / パフル / 文鳥 Pet
  function renderPetButton() {
    const el = $('ok-pet-jp');
    if (el) el.textContent = sp().jp;
    $('ok-b-pet').title = pet.species ? `${pet.name}, your ${sp().name.toLowerCase()}` : 'Your pet';
  }

  // 遊ぶ ⇄ やめる: the toy button is a toggle
  function renderPlayButton() {
    const b = document.querySelector('[data-pet="play"]');
    if (!b) return;
    b.classList.toggle('on', !!feather);
    b.title = feather ? '' : sp().toy;
    b.innerHTML = feather
      ? '<b class="jp">やめる</b><small>Stop</small>'
      : '<b class="jp">遊ぶ</b><small>Play</small>';
  }

  // 身だしなみ: accessories unlocked by care milestones
  function renderAccessories() {
    const box = $('ok-pet-acc');
    const un = pet.unlocks || {};
    const st = petStyle();
    const have = { pets: pet.petPoints || 0, fish: pet.fishFed || 0 };
    const prog = (key) => {
      const m = PET_MILESTONES[key] || { kind: 'pets', need: 0 };
      const verb = m.kind === 'pets' ? 'Pets' : `${foods()[0].toUpperCase()}${foods().slice(1)} fed`;
      return `${verb} ${Math.min(have[m.kind], m.need)}/${m.need}`;
    };
    const chip = (key, value, label, on, swatch) =>
      `<button class="ok-chip${on ? ' on' : ''}" data-style="${key}" data-value="${value}">${swatch ? `<i style="background:${swatch}"></i>` : ''}${label}</button>`;
    const locked = (label, key) => `<span class="ok-acc-lock">🔒 ${label} <em>${prog(key)}</em></span>`;
    let html = '';
    if (pet.species === 'puffle' || pet.species === 'bird') {
      const ck = colorKind(pet.species);
      html += '<div class="ok-acc-row"><b class="jp">色</b><span>Colour</span><div>' +
        ck.list.filter((c) => ck.owned.includes(c.id)).map((c) => `<button class="ok-chip${ck.current === c.id ? ' on' : ''}" data-color="${c.id}"><i style="background:${ck.swatch(c)}"></i>${c.name}</button>`).join('') +
        '<button class="ok-chip ok-chip-more" data-shop="1">+ More in the shop</button></div></div>';
    }
    html += `<div class="ok-acc-row"><b class="jp">${pet.species === 'cat' || !pet.species ? '首輪' : 'リボン'}</b><span>${pet.species === 'puffle' ? 'Bow' : 'Collar'}</span><div>` +
      (un.collar ? Object.keys(COLLAR).map((c) => chip('collar', c, c[0].toUpperCase() + c.slice(1), st.collar === c || (!st.collar && c === 'red'), COLLAR[c])).join('') : locked(pet.species === 'puffle' ? 'Bow colours' : 'Collar colours', 'collar')) +
      '</div></div>';
    html += '<div class="ok-acc-row"><b class="jp">手ぬぐい</b><span>Bandana</span><div>' +
      (un.bandana ? chip('bandana', st.bandana ? '0' : '1', st.bandana ? 'Wearing it ✓' : 'Put it on', !!st.bandana) : locked('Bandana', 'bandana')) +
      '</div></div>';
    html += '<div class="ok-acc-row"><b class="jp">金の鈴</b><span>Golden bell</span><div>' +
      (un.bell ? chip('bell', st.bell ? '0' : '1', st.bell ? 'Wearing it ✓' : 'Put it on', !!st.bell) : locked('Golden bell', 'bell')) +
      '</div></div>';
    const bed = st.bed || 'zabuton';
    html += '<div class="ok-acc-row"><b class="jp">寝床</b><span>Bed</span><div>' +
      chip('bed', 'zabuton', '座布団 Cushion', bed === 'zabuton') +
      (un.fancy_bed ? chip('bed', 'fancy', '豪華座布団 Fancy cushion', bed === 'fancy') : locked('Fancy cushion', 'fancy_bed')) +
      (un.kotatsu ? chip('bed', 'kotatsu', 'こたつ Kotatsu', bed === 'kotatsu') : locked('Kotatsu', 'kotatsu')) +
      '</div></div>';
    html += `<div class="ok-acc-note">Unlocked by caring: pets count up to ${PETS_PER_DAY} a day (${pet.petsToday || 0} today).</div>`;
    box.innerHTML = html;
    box.querySelectorAll('[data-color]').forEach((b) => b.addEventListener('click', () => setPetColor(pet.species, b.dataset.color)));
    box.querySelectorAll('[data-shop]').forEach((b) => b.addEventListener('click', () => { togglePanel('ok-decor'); setTimeout(() => { const el = $('ok-colors-' + pet.species); if (el) el.scrollIntoView({ block: 'start' }); }, 30); }));
    box.querySelectorAll('[data-style]').forEach((b) => b.addEventListener('click', () => {
      const key = b.dataset.style;
      let value = b.dataset.value;
      if (key === 'bandana' || key === 'bell') value = value === '1';
      send('petstyle', JSON.stringify({ key, value }), (p) => {
        if (p) { pet = p; renderPetPanel(); }
        OKSound.pluck(6);
        if (key === 'bed' && tama.state !== 'walk') tamaGo(BED_X, () => tamaSet('sleep', rand(15, 30)));
        else tamaSet('purr', 2.5);
      });
    }));
  }

  document.querySelectorAll('[data-pet]').forEach((b) => b.addEventListener('click', () => petAction(b.dataset.pet)));
  $('ok-b-pet').addEventListener('click', () => { togglePanel('ok-pet'); renderPetPanel(); });
  // Double-click the name to rename: Enter or clicking away saves, Esc cancels.
  $('ok-pet-name').addEventListener('dblclick', () => {
    $('ok-pet-namewrap').classList.add('editing');
    const input = $('ok-pet-nameinput');
    input.value = pet.name;
    input.focus();
    input.select();
  });
  function saveName(keep) {
    const wrap = $('ok-pet-namewrap');
    if (!wrap.classList.contains('editing')) return;
    wrap.classList.remove('editing');
    const name = $('ok-pet-nameinput').value.trim();
    if (!keep || !name || name === pet.name) return;
    send('petname', name, (p) => { if (p) { pet = p; renderPetPanel(); voice(); } });
  }
  $('ok-pet-nameform').addEventListener('submit', (e) => { e.preventDefault(); saveName(true); });
  $('ok-pet-nameinput').addEventListener('blur', () => saveName(true));

  function greetOnOpen() {
    const away = INIT.petAway || 0;
    if (away < 3600) return false;
    tama.x = 262;
    tama.dir = -1;
    if (pet.species === 'bird') tama.y = 70;
    tamaGo(150, () => {
      tamaSet('purr', 4);
      spawnHearts(150, 156, 3);
      voice();
      const days = Math.floor(away / 86400);
      say(['おかえり!', days >= 2 ? `Welcome back! ${pet.name} missed you.` : 'Welcome back!'], { x: 150, y: 150 });
    });
    return true;
  }

  // ------------------------------------------------------ 仲間 companions
  // Animals you can buy as milestones. Each is drawn from small rectangles,
  // mirrored by facing direction. (cx, by) is the bottom centre.
  function mr(cx, by, dir) {
    return (dx, dy, w, h, c) => R(dir > 0 ? cx + dx : cx - dx - w + 1, by + dy, w, h, c);
  }

  const ANIMAL_ART = {
    // The three starter pets, as shop companions (drawn with a stand-in pet).
    mike(cx, by, dir, pose, f) {
      withPet({ species: 'cat', stage: 2, style: { collar: 'indigo' } }, () => {
        if (pose === 'rest' || pose === 'sleep') catSleep(cx, by);
        else if (pose === 'react') catSit(cx, by, { happy: true, fastTail: true });
        else catSide(cx, by, dir, f ? 1 : 2);
      });
    },
    puffle(cx, by, dir, pose, f) {
      withPet({ species: 'puffle', stage: 2 }, () => {
        if (pose === 'walk') { const b = Math.abs(Math.sin(time * 9 + cx)); drawPuffle(cx, by - Math.round(b * 4), { squash: b < 0.2, look: dir }); }
        else if (pose === 'react') { const b = Math.abs(Math.sin(time * 8)); drawPuffle(cx, by - Math.round(b * 7), { happy: true, squash: b < 0.15 }); }
        else drawPuffle(cx, by, { blink: Math.floor(time * 10 + cx) % 41 === 0, squash: pose === 'sleep' || Math.floor(time * 1.2 + cx) % 4 === 0, sleep: pose === 'sleep' });
      });
    },
    buncho(cx, by, dir, pose, f, a) {
      withPet({ species: 'bird', stage: 2 }, () => {
        if (pose === 'fly') { flightShadow(cx, by); drawBird(cx, by, dir, { flying: true, wing: (a && a.flap) || 'flap' }); }
        else if (pose === 'walk') drawBird(cx, by, dir, { hop: f ? 2 : 0 });
        else if (pose === 'react') drawBird(cx, by, dir, { wing: 'flap', happy: true, beakOpen: Math.floor(time * 6) % 2 === 0 });
        else drawBird(cx, by, dir, { sleep: pose === 'sleep', blink: Math.floor(time * 10 + cx) % 43 === 0 });
      });
    },
    usagi(cx, by, dir, pose, f) {
      const r = mr(cx, by, dir);
      const W = '#fbf7ee';
      const S = '#e2dccd';
      const Pk = '#f3aaa0';
      const K = '#2a2320';
      if (pose === 'rest') {
        r(-5, -5, 10, 5, W); r(-4, -6, 8, 1, W); r(-5, -1, 10, 1, S); r(-6, -4, 1, 2, W);
        r(2, -9, 5, 4, W); r(3, -10, 3, 1, W);
        r(-1, -11, 4, 1, W); r(-2, -10, 3, 1, W); r(0, -11, 2, 1, Pk);
        r(5, -8, 1, 1, K); r(7, -7, 1, 1, Pk);
        return;
      }
      const lift = pose === 'react' ? 3 : f ? 2 : 0;
      r(-5, -6 - lift, 9, 4, W); r(-4, -7 - lift, 7, 1, W); r(-5, -3 - lift, 8, 1, S);
      r(-7, -6 - lift, 2, 2, W); r(-7, -5 - lift, 1, 1, S);
      r(2, -10 - lift, 5, 4, W); r(3, -11 - lift, 3, 1, W);
      r(3, -16 - lift, 1, 5, W); r(5, -15 - lift, 1, 4, W); r(3, -15 - lift, 1, 3, Pk);
      r(5, -9 - lift, 1, 1, K); r(7, -8 - lift, 1, 1, Pk);
      if (lift) r(-3, -3, 5, 1, S);
      else { r(-4, -2, 2, 2, W); r(1, -2, 2, 2, W); }
    },
    kuro(cx, by, dir, pose, f) {
      const r = mr(cx, by, dir);
      const B = '#2b2b33';
      const B2 = '#1c1c22';
      const Y = '#f2d15a';
      if (pose === 'rest') {
        r(-6, -5, 11, 5, B); r(-5, -6, 9, 1, B); r(3, -7, 5, 4, B);
        r(3, -9, 1, 2, B); r(6, -9, 1, 2, B);
        r(4, -5, 1, 1, '#5a5a66'); r(6, -5, 1, 1, '#5a5a66');
        r(-7, -2, 6, 1, B2);
        return;
      }
      const hop = pose === 'react' ? 2 : 0;
      r(-5, -7 - hop, 10, 4, B);
      r(-4, -3 - hop, 1, 3, B2); r(-2, -3 - hop, 1, f ? 2 : 3, B); r(2, -3 - hop, 1, f ? 3 : 2, B); r(4, -3 - hop, 1, 3, B2);
      r(4, -10 - hop, 5, 4, B); r(4, -12 - hop, 1, 2, B); r(7, -12 - hop, 1, 2, B);
      r(7, -9 - hop, 1, 1, Y); r(9, -8 - hop, 1, 1, '#f3aaa0');
      const sway = Math.round(Math.sin(time * 3));
      r(-7, -11 - hop + sway, 1, 5, B); r(-6, -7 - hop, 1, 1, B);
    },
    shiba(cx, by, dir, pose, f) {
      const r = mr(cx, by, dir);
      const O = '#d9853b';
      const O2 = '#b96a2a';
      const C = '#f6e6c8';
      const K = '#2a2320';
      if (pose === 'rest') {
        r(-3, -9, 7, 9, O); r(1, -9, 3, 7, C); r(2, -2, 2, 2, C);
        r(1, -14, 6, 5, O); r(5, -11, 3, 2, C); r(7, -11, 1, 1, K); r(4, -13, 1, 1, K);
        r(1, -16, 2, 2, O); r(4, -16, 2, 2, O);
        r(-5, -3, 3, 2, O); r(-6, -4, 1, 1, C);
        return;
      }
      const hop = pose === 'react' ? 2 : 0;
      r(-6, -8 - hop, 11, 4, O); r(-5, -4 - hop, 9, 1, C);
      r(-5, -4 - hop, 2, f ? 3 : 4, O2); r(3, -4 - hop, 2, f ? 4 : 3, O);
      r(3, -8 - hop, 2, 4, C);
      r(4, -12 - hop, 5, 5, O); r(8, -9 - hop, 3, 2, C); r(10, -9 - hop, 1, 1, K); r(7, -11 - hop, 1, 1, K);
      r(5, -9 - hop, 3, 2, C);
      r(4, -14 - hop, 2, 2, O); r(7, -14 - hop, 2, 2, O);
      r(-8, -11 - hop, 3, 1, O); r(-9, -10 - hop, 1, 2, O); r(-8, -9 - hop, 2, 1, C); r(-6, -10 - hop, 1, 1, O);
    },
    kitsune(cx, by, dir, pose, f) {
      const r = mr(cx, by, dir);
      const O = '#e07b39';
      const W = '#fbf1e6';
      const K = '#2a2320';
      const D = '#3b2a22';
      if (pose === 'rest') {
        r(-5, -6, 10, 6, O); r(-6, -3, 12, 3, O); r(4, -3, 3, 3, W);
        r(2, -9, 5, 4, O); r(6, -7, 2, 2, W); r(2, -11, 2, 2, O); r(5, -11, 2, 2, O);
        r(4, -8, 1, 1, K);
        return;
      }
      const hop = pose === 'react' ? 2 : 0;
      r(-6, -8 - hop, 11, 4, O); r(-4, -4 - hop, 8, 1, W);
      r(-5, -4 - hop, 1, 4, D); r(-3, -4 - hop, 1, f ? 3 : 4, D); r(2, -4 - hop, 1, f ? 4 : 3, D); r(4, -4 - hop, 1, 4, D);
      r(4, -11 - hop, 5, 4, O); r(8, -9 - hop, 3, 2, W); r(10, -9 - hop, 1, 1, K); r(6, -10 - hop, 1, 1, K);
      r(4, -14 - hop, 2, 3, O); r(7, -14 - hop, 2, 3, O); r(4, -14 - hop, 1, 1, D); r(8, -14 - hop, 1, 1, D);
      const sway = Math.round(Math.sin(time * 2.5));
      r(-11, -10 - hop + sway, 5, 3, O); r(-12, -9 - hop + sway, 1, 2, O); r(-14, -9 - hop + sway, 2, 2, W);
    },
    tanuki_friend(cx, by, dir, pose, f) {
      const r = mr(cx, by, dir);
      const Br = '#8a6a4a';
      const Dk = '#3e2717';
      const Cr = '#e8d4b0';
      const L = '#fbf7ee';
      if (pose === 'rest' || pose === 'react') {
        const drum = pose === 'react' && Math.floor(time * 8) % 2;
        r(-5, -11, 10, 11, Br); r(-4, -12, 8, 1, Br); r(-3, -8, 6, 6, Cr);
        r(-3, -16, 7, 5, Br); r(-3, -14, 7, 2, Dk); r(-2, -14, 1, 1, L); r(2, -14, 1, 1, L);
        r(0, -12, 1, 1, Dk); r(-3, -17, 1, 1, Dk); r(3, -17, 1, 1, Dk);
        r(-5, -8 - (drum ? 1 : 0), 1, 3, Dk); r(4, -8 - (drum ? 0 : 1), 1, 3, Dk);
        r(-4, -1, 2, 1, Dk); r(2, -1, 2, 1, Dk);
        return;
      }
      r(-6, -9, 11, 6, Br); r(-5, -10, 9, 1, Br); r(-2, -7, 5, 3, Cr);
      r(-5, -3, 2, f ? 2 : 3, Dk); r(2, -3, 2, f ? 3 : 2, Dk);
      r(4, -12, 5, 5, Br); r(5, -10, 4, 2, Dk); r(7, -10, 1, 1, L); r(8, -9, 2, 1, Cr); r(9, -9, 1, 1, Dk);
      r(4, -13, 1, 1, Dk); r(7, -13, 1, 1, Dk);
      r(-9, -8, 3, 3, Br); r(-9, -7, 3, 1, Dk);
    },
    tsuru(cx, by, dir, pose, f) {
      const r = mr(cx, by, dir);
      const W = '#fbfbf8';
      const K = '#1e1e22';
      const Rd = '#d93a2e';
      const G = '#8b8b8b';
      const Bk = '#c9b28a';
      const lift = pose === 'react' ? 2 : 0;
      if (pose === 'walk' && f) { r(0, -8, 1, 8, G); r(2, -6, 1, 2, G); r(3, -8, 1, 3, G); }
      else { r(0, -8 - lift, 1, 8, G); r(2, -8 - lift, 1, 8, G); }
      r(-4, -14 - lift, 9, 6, W); r(-3, -15 - lift, 7, 1, W);
      r(-6, -13 - lift, 3, 4, K); r(-7, -11 - lift, 1, 2, K);
      r(3, -21 - lift, 2, 7, K);
      r(3, -24 - lift, 3, 3, W); r(4, -25 - lift, 2, 1, Rd); r(5, -23 - lift, 1, 1, K); r(6, -23 - lift, 3, 1, Bk);
      if (pose === 'react') {
        r(-10, -19, 7, 3, W); r(4, -19, 7, 3, W); r(-11, -18, 2, 2, K); r(10, -18, 2, 2, K);
      }
    },
  };

  const SLEEP_ART = new Set(['mike', 'puffle', 'buncho']); // others sleep in their rest pose
  const ANIMAL_SPEED = { usagi: 20, kuro: 16, shiba: 22, kitsune: 24, tanuki_friend: 10, tsuru: 8, mike: 16, puffle: 18, buncho: 14 };
  const isCompanion = (c) => c.kind === 'animal' || c.kind === 'pet';
  const residents = [];

  function syncResidents() {
    const want = catalog.filter((c) => isCompanion(c) && has(c.id)).map((c) => c.id);
    for (let i = residents.length - 1; i >= 0; i--) if (!want.includes(residents[i].id)) residents.splice(i, 1);
    setTimeout(assignSlots, 0);
    want.forEach((id, i) => {
      if (residents.some((a) => a.id === id)) return;
      residents.push({
        id,
        x: id === 'tsuru' ? 296 : 70 + ((i * 47) % 200),
        dir: Math.random() < 0.5 ? 1 : -1,
        y: FLOOR_Y,
        pose: 'rest',
        t: 0,
        dur: rand(2, 6),
        target: null,
      });
    });
  }

  // One bed spot per pet (after your own pet's), in shop order.
  function assignSlots() {
    let n = 1;
    for (const a of residents) a.slot = a.id === 'tsuru' ? null : n++;
    bedSlots = n;
    BOWL_X = BED_X + 11 + bedExtra() + 10;
  }

  // おやすみ: everyone heads to bed and sleeps for a while.
  function sendToBed(a, dur) {
    const sleep = () => { a.pose = 'sleep'; a.t = 0; a.dur = dur || rand(40, 70); };
    if (a.slot == null) { sleep(); return; }
    const x = slotX(a.slot);
    if (a.id === 'buncho' && (aloft(a) || Math.abs(a.x - x) > 40)) { a.pose = 'fly'; flyTo(a, [{ x, y: FLOOR_Y }], sleep); return; }
    if (Math.abs(a.x - x) < 2 && !aloft(a)) { sleep(); return; }
    a.air = null; a.y = FLOOR_Y;
    a.target = x; a.pose = 'walk'; a.t = 0; a.then = sleep;
  }
  function bedtime() {
    if (feather) endPlay();
    if (tama.state !== 'sleep') tamaGo(BED_X, () => tamaSet('sleep', rand(40, 70)));
    residents.forEach((a) => sendToBed(a));
    OKSound.phraseDown();
    say(['おやすみ…', residents.length ? 'Good night, everyone.' : `Good night, ${pet.name}.`], { x: BED_X + bedExtra() / 2, y: 150 });
  }

  function animalInfo(id) {
    return catalog.find((c) => c.id === id) || { jp: '', name: id, perk: '' };
  }

  function updateResidents(dt) {
    for (const a of residents) {
      a.t += dt;
      if (a.air) { updateFlight(a, dt); continue; }
      if (a.id === 'buncho' && seatTaken(a) && a.pose !== 'walk') { a.perch = null; a.dur = 0; a.pose = 'rest'; }
      if (a.pose === 'walk') {
        const speed = ANIMAL_SPEED[a.id] || 14;
        const dx = a.target - a.x;
        a.dir = dx >= 0 ? 1 : -1;
        if (Math.abs(dx) <= speed * dt) {
          a.x = a.target;
          const then = a.then;
          a.then = null;
          if (then) then(); else { a.pose = 'rest'; a.t = 0; a.dur = rand(4, 10); }
        }
        else a.x += a.dir * speed * dt;
        continue;
      }
      if (a.t < a.dur) continue;
      // decide what to do next
      if (timer.phase === 'focus' || darkness(hourNow()) > 0.3 && Math.random() < 0.5) {
        // focus time and night time: off to bed
        sendToBed(a, rand(20, 45));
        continue;
      }
      if (a.id === 'buncho') {
        // the shop sparrow flits between perches (and back down to the floor)
        const up = aloft(a);
        a.pose = 'fly';
        const dest = up && Math.random() < 0.4 ? { x: rand(52, 300), y: FLOOR_Y } : freePerch(a, tama);
        a.perch = null;
        flyTo(a, Math.random() < 0.25 ? [...lap(), dest] : [dest], () => {
          a.perch = dest.seat ? dest : null;
          a.pose = 'rest'; a.t = 0; a.dur = rand(6, 14);
          if (dest.seat && dest.seat.guest) a.dur = 0; // taken meanwhile: off again
        });
        continue;
      }
      let target;
      if (a.id === 'tsuru') target = rand(276, 306);
      else if (a.id === 'kuro' && tama.state === 'sleep' && Math.random() < 0.6) { sendToBed(a, rand(20, 40)); continue; }
      else target = rand(52, 300);
      a.target = target;
      a.pose = 'walk';
      a.t = 0;
    }
  }

  function residentGreet() {
    // the shiba trots to the door when a guest arrives
    const s = residents.find((a) => a.id === 'shiba');
    if (s && s.pose !== 'react' && Math.random() < 0.7) { s.target = 262; s.pose = 'walk'; s.t = 0; }
  }

  function reactResident(a) {
    if (a.air) return;
    a.then = null;
    a.pose = 'react';
    a.t = 0;
    a.dur = 1.3;
    spawnHearts(a.x, (a.y == null ? FLOOR_Y : a.y) - 22, 1);
    if (a.id === 'usagi') OKSound.pluck(9);
    else if (a.id === 'kuro' || a.id === 'mike') OKSound.meow();
    else if (a.id === 'puffle') OKSound.squeak();
    else if (a.id === 'buncho') OKSound.chirp();
    else if (a.id === 'shiba') { OKSound.pop(); setTimeout(() => OKSound.pop(), 140); }
    else if (a.id === 'kitsune') OKSound.koto(880, 0, 0.3);
    else if (a.id === 'tanuki_friend') { OKSound.koto(98, 0, 0.35); OKSound.koto(98, 0.18, 0.35); }
    else if (a.id === 'tsuru') OKSound.chime();
  }

  function drawResidents() {
    const walkFrame = Math.floor(time * (6)) % 2;
    for (const a of residents) {
      const art = ANIMAL_ART[a.id];
      if (!art) continue;
      const pose = a.pose === 'react' && a.t > a.dur ? 'rest' : a.pose;
      if (a.pose === 'react' && a.t > a.dur) { a.pose = 'rest'; a.t = 0; a.dur = rand(3, 8); }
      const ay = Math.round(a.y == null ? FLOOR_Y : a.y);
      const asleep = pose === 'sleep' && !a.air;
      art(Math.round(a.x), ay, a.dir, a.air ? 'fly' : asleep && !SLEEP_ART.has(a.id) ? 'rest' : pose, walkFrame, a);
      if (asleep) sleepZ(Math.round(a.x) + 5, ay - (a.id === 'tsuru' ? 30 : 18));
      const info = animalInfo(a.id);
      const h = a.id === 'tsuru' ? 27 : a.id === 'usagi' ? 17 : 17;
      regions.push({ x: a.x - 10, y: ay - h, w: 20, h, label: `<b>${info.jp}</b> ${info.name}\n${info.perk}`, click: () => reactResident(a) });
    }
  }

  // -------------------------------------------------------------- tables
  const TABLES = [[40, 56], [118, 56], [198, 36]];
  // With two place settings the candle sits between them; with one, at the
  // far end from it; with none, in the middle.
  function candleX(i) {
    const [tx, tw] = TABLES[i];
    const at = seats.filter((st) => st.x >= tx && st.x <= tx + tw).map((st) => st.x);
    if (at.length >= 2) return Math.round((at[0] + at[1]) / 2);
    if (at.length === 1) return at[0] - tx > tw / 2 ? tx + 5 : tx + tw - 6;
    return tx + Math.round(tw / 2);
  }
  function drawTables() {
    TABLES.forEach(([tx, tw], i) => {
      R(tx, 146, tw, 4, C.woodHi);
      R(tx, 146, tw, 1, C.woodTop);
      R(tx, 150, tw, 3, C.wood);
      R(tx + 3, 153, 3, 5, C.woodDk);
      R(tx + tw - 6, 153, 3, 5, C.woodDk);
      R(tx + 2, 158, tw - 4, 1, C.tatamiDk);
      // a little candle on each table (tap it to light or snuff)
      const l = lamps['t' + i];
      const cx = candleX(i);
      R(cx - 2, 145, 5, 1, '#8a5a34');
      R(cx - 1, 141, 2, 4, '#f3ecd8');
      P(cx, 141, '#fffaf0'); P(cx - 1, 144, '#dcd2bd');
      P(cx, 140, '#3b2d28');
      flame(cx, 139, 4, l);
      regions.push({ x: cx - 3, y: 134, w: 7, h: 12, label: lampTip(l, '<b>蝋燭</b> Candle'), click: () => toggleLamp('t' + i, cx, 138) });
    });
    for (const s of seats) {
      if (!s.guest) {
        // empty seat: a zabuton cushion peeking out
        R(s.x - 6, 144, 13, 2, theme);
        R(s.x - 6, 144, 13, 1, shade(theme, 0.2));
      }
    }
  }

  // ------------------------------------------------------------ customers
  function freeSeat() {
    return seats.find((s) => !s.guest);
  }

  function spawnCustomer(guest) {
    const seat = freeSeat();
    if (!seat) return false;
    const c = {
      id: nextId++,
      guest,
      look: guestLook(guest),
      x: DOOR_X,
      y: 132,
      path: [[DOOR_X, 150], [seat.x, 150]],
      state: 'walk',
      t: 0,
      seat,
      alpha: 0,
      cured: false,
      eaten: 0,
    };
    c.dish = chooseDish(guest);
    seat.guest = c;
    customers.push(c);
    norenSway = 1;
    residentGreet();
    if (!feather && (tama.state === 'sit' || tama.state === 'watch') && Math.random() < 0.3) tamaGo(262, () => { tama.dir = -1; tamaSet('sit', 4); });
    OKSound.pluck(0);
    return true;
  }

  function updateCustomer(c, dt) {
    c.t += dt;
    if (c.alpha < 1) c.alpha = Math.min(1, c.alpha + dt * 3);
    if (c.state === 'walk' || c.state === 'leave') {
      const target = c.path[0];
      if (!target) {
        if (c.state === 'walk') { c.state = 'sit'; c.t = 0; }
        else { c.gone = true; norenSway = 1; }
        return;
      }
      const dx = target[0] - c.x;
      const dy = target[1] - c.y;
      const dist = Math.hypot(dx, dy);
      const speed = 26;
      if (dist < 1) {
        c.x = target[0];
        c.y = target[1];
        c.path.shift();
      } else {
        c.x += (dx / dist) * Math.min(dist, speed * dt);
        c.y += (dy / dist) * Math.min(dist, speed * dt);
      }
      if (c.state === 'leave' && c.path.length === 1 && Math.abs(c.x - DOOR_X) < 3) c.alpha = Math.max(0, c.alpha - dt * 2);
      return;
    }
    if (c.state === 'sit' && c.t > 0.7) { c.state = 'order'; c.t = 0; OKSound.blip(); }
    else if (c.state === 'order' && c.t > 1.0) { c.state = 'wait'; c.t = 0; orders.push(c); }
    else if (c.state === 'eat') {
      if (Math.floor(c.t / 0.55) > c.eaten) {
        c.eaten++;
        OKSound.pop();
        particles.push({ x: c.x + rand(-2, 2), y: 142, vx: rand(-6, 6), vy: -rand(6, 12), life: 0.5, c: C.rice, type: 'crumb' });
      }
      if (c.t > 4.4) {
        c.state = 'happy';
        c.t = 0;
        c.cured = true;
        spawnHearts(c.x, 132, c.guest.kind === 'golden' ? 3 : 1);
        payFor(c);
      }
    } else if (c.state === 'happy' && c.t > 1.4) {
      c.state = 'leave';
      c.t = 0;
      c.plate = false;
      c.seat.guest = null;
      c.path = [[c.x, 150], [DOOR_X, 150], [DOOR_X, 134]];
    }
  }

  // Tips vary a little (same averages as state.py tip_for): regular ~3 with a
  // rare generous 8, sour plum 5-8, golden 10-15.
  function baseTip(kind) {
    if (kind === 'golden') return 10 + Math.floor(Math.random() * 6);
    if (kind === 'leech') return 5 + Math.floor(Math.random() * 4);
    const r = Math.random() * 100;
    return r < 35 ? 2 : r < 80 ? 3 : r < 95 ? 4 : 8;
  }
  function tipFor(c) {
    let amt = baseTip(c.guest.kind);
    c.generous = c.guest.kind !== 'golden' && c.guest.kind !== 'leech' && amt === 8;
    if (c.guest.kind === 'golden' && has('tanuki')) amt *= 2;
    if (c.guest.kind === 'leech' && has('kitsune')) amt *= 2;
    if (has('maneki')) amt += 1;
    if (has('shiba')) amt += 1;
    if (petHappy()) amt += 1;
    // rarer specials are worth more
    if (c.dish && c.dish.from !== 'house') amt += (RARITY[c.dish.rarity] || RARITY.common).bonus;
    if (c.dish && c.dish.from === 'today' && todayDone()) amt += TODAY_DONE_BONUS;
    return amt;
  }

  function payFor(c) {
    const amount = tipFor(c);
    coins.push({ x: c.x + 5, y: 143, amount, t: 0, fly: null, big: !!c.generous });
    if (c.generous) {
      toast(`心付け! A generous guest left ${amount} mon`);
      OKSound.coin();
      for (let i = 0; i < 8; i++) particles.push({ x: c.x + 5 + rand(-4, 4), y: 140 + rand(-3, 3), vx: rand(-10, 10), vy: -rand(8, 18), life: 0.9, c: '#fff1a8', type: 'spark' });
    }
    send('pay', JSON.stringify({ amount, deck: c.guest.deck || null }), (snap) => {
      if (snap && typeof snap.mon === 'number') {
        S = Object.assign(S, snap);
        updateStatus();
      }
    });
  }

  function drawCustomer(c) {
    const moving = c.state === 'walk' || c.state === 'leave';
    const hop = moving ? (Math.floor(c.t * 7) % 2) : c.state === 'eat' ? (Math.floor(c.t * 3.6) % 2) : c.state === 'happy' ? Math.round(Math.abs(Math.sin(c.t * 8)) * 2) : 0;
    const bottom = moving ? c.y : 152;
    g.globalAlpha = c.alpha;
    drawGuest(Math.round(c.x), Math.round(bottom), c, {
      hop,
      mood: c.state === 'happy' || (c.state === 'eat' && c.eaten % 2) ? 'happy' : undefined,
      mouth: c.state === 'eat' && !(c.eaten % 2) ? 'open' : undefined,
      blink: Math.floor((time + c.id * 1.7) * 10) % 37 === 0,
      look: c.state === 'wait' ? -1 : 0,
    });
    g.globalAlpha = 1;
    if (c.state === 'order' || c.state === 'wait') drawOrderBubble(c);
    if (!moving) {
      regions.push({ x: c.x - 8, y: bottom - 17, w: 17, h: 17, label: guestLabel(c), click: () => { spawnHearts(c.x, 134, 1); OKSound.pluck(5); } });
    }
  }

  function drawOrderBubble(c) {
    const bx = Math.round(c.x) + 4;
    const by = 119 - (c.state === 'order' ? Math.round(Math.max(0, 1 - c.t * 4) * 3) : 0);
    R(bx, by, 13, 11, C.ink);
    R(bx + 1, by + 1, 11, 9, '#fffaf0');
    P(bx + 1, by + 11, C.ink); P(bx + 2, by + 11, C.ink); P(bx + 1, by + 12, C.ink);
    // what they ordered
    drawDish(c.dish, bx + 2, by + 2);
    if (c.dish && c.dish.from === 'today') {
      if (Math.floor(time * 3) % 3 === 0) P(bx + 11, by + 1, '#fff6cc');
      if (todayDone() && Math.floor(time * 3 + 1) % 3 === 0) P(bx + 1, by + 9, '#fff6cc');
    }
  }

  function deckLeaf(deck) {
    if (!deck) return '';
    const parts = String(deck).split('::');
    return parts[parts.length - 1];
  }

  function guestLabel(c) {
    const base = guestLabelBase(c);
    return c.dish ? `${base}\nOrdered: ${esc(c.dish.name)}${c.dish.from === 'today' ? (todayDone() ? ' (Daily Special, prepared in Onigiri: tips more!)' : ' (Daily Special)') : ''}` : base;
  }
  function guestLabelBase(c) {
    const gst = c.guest;
    if (gst.kind === 'golden') return '<b>金のおにぎり</b> Golden guest\nCame by because you finished a focus session!';
    if (gst.kind === 'leech') {
      return c.cured
        ? `<b>梅干し</b> The sour plum is smiling!\nYou finally got that tricky card in “${deckLeaf(gst.deck)}”`
        : `<b>梅干し</b> A grumpy sour plum\nA leech card you just got right in “${deckLeaf(gst.deck)}”`;
    }
    return `<b>${c.look.flavor.jp}</b> A ${c.look.flavor.name.toLowerCase()} regular\nfrom “${deckLeaf(gst.deck)}” · ${gst.reviews || 10} reviews`;
  }

  // ----------------------------------------------------------- plates/food
  function launchPlate(c) {
    plates.push({ c, t: 0, dur: 0.9, fx: 134, fy: 98, tx: c.x - 2, ty: 141 });
    OKSound.pluck(6);
  }

  function updatePlates(dt) {
    for (const p of plates) {
      p.t += dt;
      if (p.t >= p.dur && !p.done) {
        p.done = true;
        if (p.c.state === 'wait') {
          p.c.state = 'eat';
          p.c.t = 0;
          p.c.plate = true;
        }
      }
    }
    plates = plates.filter((p) => !p.done);
  }

  function drawPlates() {
    for (const p of plates) {
      const k = clamp(p.t / p.dur, 0, 1);
      const x = lerp(p.fx, p.tx, k);
      const y = lerp(p.fy, p.ty, k) - Math.sin(k * Math.PI) * 20;
      R(x - 2, y + 5, 9, 1, '#ffffff');
      drawDishMini(p.c.dish, x, y);
    }
    for (const c of customers) {
      if (!c.plate) continue;
      const x = Math.round(c.x) - 4;
      R(x - 1, 147, 11, 1, '#ffffff');
      R(x, 148, 9, 1, '#d8d2c6');
      if (c.state === 'eat') {
        // eaten a bite at a time, from the right
        const left = 9 - Math.min(9, c.eaten);
        if (left > 0) drawDish(c.dish, x, 140, left);
      }
    }
  }

  // ---------------------------------------------------------------- coins
  function drawCoins() {
    for (const cn of coins) {
      let x = cn.x;
      let y = cn.y;
      if (cn.fly) {
        const k = clamp(cn.fly / 0.6, 0, 1);
        x = lerp(cn.x, 6, k * k);
        y = lerp(cn.y, 182, k * k) - Math.sin(k * Math.PI) * 18;
      } else {
        y -= Math.max(0, 1 - cn.t * 3) * 6;
      }
      const shine = Math.floor(time * 4 + cn.x) % 6 === 0;
      ellipse(x, y, 2, 2, C.goldDk);
      ellipse(x, y - 0.5, 2, 1, C.gold);
      P(x, y, C.goldDk);
      if (shine) P(x - 1, y - 1, '#fff6cc');
      if (cn.amount >= 6) { ellipse(x + 2, y + 1, 2, 1, C.goldDk); P(x + 2, y + 1, C.gold); }
      if (cn.big) { ellipse(x - 2, y + 1, 2, 1, C.goldDk); P(x - 2, y + 1, C.gold); if (Math.floor(time * 6) % 2) P(x + 1, y - 3, '#fff6cc'); }
      if (!cn.fly) regions.push({ x: x - 4, y: y - 4, w: 9, h: 8, label: `<b>文</b> ${cn.amount} mon tip\nClick to collect`, click: () => collectCoin(cn) });
    }
  }
  function collectCoin(cn) {
    if (cn.fly) return;
    cn.fly = 0.0001;
    OKSound.coin();
  }
  function updateCoins(dt) {
    for (const cn of coins) {
      cn.t += dt;
      if (cn.fly) {
        cn.fly += dt;
        if (cn.fly >= 0.6 && !cn.done) {
          cn.done = true;
          dispMon += cn.amount;
          bumpPurse();
        }
      } else if (cn.t > (rush ? 1.5 : 16)) {
        collectCoin(cn);
      }
    }
    coins = coins.filter((c) => !c.done);
  }

  // ------------------------------------------------------------- particles
  function spawnHearts(x, y, n) {
    for (let i = 0; i < n; i++) particles.push({ x: x + rand(-4, 4), y: y - i * 4, vx: rand(-2, 2), vy: -rand(8, 12), life: 1.3, c: '#f07a8a', type: 'heart' });
  }
  function weatherParticles(dt) {
    const ix = WIN.x + 2;
    const iy = WIN.y + 2;
    const iw = WIN.w - 4;
    let rate = 0;
    let type = null;
    if (raining && SEASON !== 'winter') { rate = 30; type = 'rain'; }
    else if (SEASON === 'winter') { rate = 6; type = 'snow'; }
    else if (SEASON === 'autumn') { rate = 1.2; type = 'momiji'; }
    else if (SEASON === 'spring') { rate = 1.6; type = 'petal-out'; }
    else if (SEASON === 'summer') {
      const h = hourNow();
      if (h >= 19 || h < 5) { rate = 0.8; type = 'firefly'; }
    }
    if (type && Math.random() < rate * dt) {
      const p = { x: ix + rand(0, iw), y: iy - 1, life: 6, clip: true, type };
      if (type === 'rain') Object.assign(p, { vx: -8, vy: 90, c: 'rgba(200,215,235,0.8)', life: 1 });
      if (type === 'snow') Object.assign(p, { vx: rand(-3, 3), vy: rand(6, 10), c: '#ffffff' });
      if (type === 'momiji') Object.assign(p, { vx: rand(-6, 2), vy: rand(6, 10), c: pick(['#d9542f', '#e8883a', '#c23b2a']) });
      if (type === 'petal-out') Object.assign(p, { vx: rand(-8, 0), vy: rand(5, 9), c: pick(['#f7c6d4', '#f2a9c0']) });
      if (type === 'firefly') Object.assign(p, { x: ix + rand(4, iw - 4), y: iy + rand(30, 50), vx: rand(-3, 3), vy: rand(-2, 2), c: '#d8f57a', life: 3 });
      particles.push(p);
    }
    if (has('sakura') && Math.random() < 0.25 * dt) {
      particles.push({ x: 240 + rand(0, 12), y: 98, vx: rand(-10, -3), vy: rand(4, 8), life: 4, c: pick(['#f7c6d4', '#f2a9c0']), type: 'petal' });
    }
  }
  function updateParticles(dt) {
    for (const p of particles) {
      p.life -= dt;
      if (p.type === 'firefly') {
        p.vx += rand(-6, 6) * dt;
        p.vy += rand(-6, 6) * dt;
      } else if (p.type === 'momiji' || p.type === 'petal' || p.type === 'petal-out' || p.type === 'snow') {
        p.vx += Math.sin(time * 2 + p.y) * 4 * dt;
      } else if (p.type === 'crumb' || p.type === 'coin') {
        p.vy += 60 * dt;
      } else if (p.type === 'spark') {
        p.vy += 14 * dt;
        p.vx *= 0.985;
      }
      p.x += (p.vx || 0) * dt;
      p.y += (p.vy || 0) * dt;
      if (p.clip && (p.y > WIN.y + WIN.h - 4 || p.x < WIN.x + 2 || p.x > WIN.x + WIN.w - 3)) p.life = 0;
      if ((p.type === 'petal' || p.type === 'coin') && p.y > 178) p.life = 0;
    }
    particles = particles.filter((p) => p.life > 0);
    if (particles.length > 400) particles.splice(0, particles.length - 400);
  }
  function drawParticles() {
    for (const p of particles) {
      if (p.type === 'heart') {
        g.globalAlpha = clamp(p.life, 0, 1);
        const x = Math.round(p.x);
        const y = Math.round(p.y);
        R(x, y, 2, 1, p.c); R(x + 3, y, 2, 1, p.c); R(x - 0, y + 1, 5, 1, p.c); R(x + 1, y + 2, 3, 1, p.c); P(x + 2, y + 3, p.c);
        g.globalAlpha = 1;
      } else if (p.type === 'rain') {
        R(p.x, p.y, 1, 3, p.c);
      } else if (p.type === 'steam') {
        g.globalAlpha = clamp(p.life, 0, 1) * 0.8;
        R(p.x, p.y, 2, 2, p.c);
        g.globalAlpha = 1;
      } else if (p.type === 'firefly') {
        if (Math.floor(time * 3 + p.x) % 3) P(p.x, p.y, p.c);
      } else if (p.type === 'spark') {
        g.globalAlpha = clamp(p.life / 1.2, 0, 1);
        P(p.x, p.y, p.c);
        g.globalAlpha = 1;
      } else if (p.type === 'note') {
        g.globalAlpha = clamp(p.life, 0, 1);
        const x = Math.round(p.x);
        const y = Math.round(p.y);
        R(x + 2, y, 1, 4, p.c); R(x, y + 3, 2, 2, p.c); P(x + 3, y, p.c);
        g.globalAlpha = 1;
      } else if (p.type === 'coin') {
        const x = Math.round(p.x);
        const y = Math.round(p.y);
        R(x - 1, y, 3, 1, C.gold); R(x - 1, y + 1, 3, 1, C.goldDk); P(x, y, '#fff6cc');
      } else if (p.type === 'momiji') {
        R(p.x, p.y, 2, 2, p.c); P(p.x + 1, p.y - 1, p.c);
      } else {
        R(p.x, p.y, p.type === 'snow' || p.type === 'petal' || p.type === 'petal-out' ? 2 : 1, p.type === 'petal' || p.type === 'petal-out' ? 1 : p.type === 'snow' ? 2 : 1, p.c);
      }
    }
  }

  function firework() {
    const ix = WIN.x + 2;
    const iy = WIN.y + 2;
    const x = ix + rand(10, WIN.w - 14);
    const y = iy + rand(8, 26);
    const col = pick(['#ffd27a', '#f07a8a', '#8fd0ff', '#b8f07a', '#ffffff']);
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      const sp = rand(10, 16);
      particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(0.9, 1.3), c: col, type: 'spark', clip: true });
    }
    if (OKSound.enabled) OKSound.koto(146.8, 0, 0.3);
  }

  // --------------------------------------------------------------- sparrow
  function callSparrow() {
    if (sparrow.on) return;
    Object.assign(sparrow, { on: true, t: 0, phase: 'in', x: WIN.x + WIN.w + 20, y: WIN.y - 10 });
  }
  function updateSparrow(dt) {
    if (!sparrow.on) return;
    sparrow.t += dt;
    const sx = WIN.x + 58;
    const sy = WIN.y + WIN.h - 3;
    if (sparrow.phase === 'in') {
      sparrow.x = lerp(sparrow.x, sx, dt * 3);
      sparrow.y = lerp(sparrow.y, sy, dt * 3);
      if (Math.abs(sparrow.x - sx) < 1) { sparrow.phase = 'sit'; sparrow.t = 0; OKSound.koto(1760, 0, 0.12); OKSound.koto(1975, 0.12, 0.12); }
    } else if (sparrow.phase === 'sit') {
      if (Math.random() < dt * 0.6) { sparrow.x += pick([-2, 2]); OKSound.koto(1864, 0, 0.1); }
      if (sparrow.t > 7) { sparrow.phase = 'out'; sparrow.t = 0; }
    } else {
      sparrow.x -= 60 * dt;
      sparrow.y -= 30 * dt;
      if (sparrow.x < -10) sparrow.on = false;
    }
  }
  function drawSparrow() {
    if (!sparrow.on) return;
    const x = Math.round(sparrow.x);
    const y = Math.round(sparrow.y);
    const flap = sparrow.phase !== 'sit' && Math.floor(time * 12) % 2;
    R(x, y - 3, 5, 3, '#8a5a34');
    R(x + 1, y - 2, 3, 2, '#e8d4b0');
    R(x + 3, y - 5, 3, 3, '#6a4428');
    P(x + 4, y - 4, C.ink);
    P(x + 6, y - 4, '#e0a13a');
    R(x - 1, y - 3 - (flap ? 2 : 0), 3, 1, '#5a3a22');
    if (sparrow.phase === 'sit') { P(x + 1, y, '#e0a13a'); P(x + 3, y, '#e0a13a'); }
  }

  // ---------------------------------------------------------------- lights
  function drawLighting(h) {
    const d = darkness(h);
    const dim = d > 0 ? d + (lanternsOn ? 0 : 0.18) : 0;
    if (dim > 0) {
      g.fillStyle = `rgba(22,14,40,${dim})`;
      g.fillRect(0, 0, W, H);
    }
    if (lanternsOn && d > 0.05) {
      g.globalCompositeOperation = 'lighter';
      const glows0 = STRING_LANTERNS.map((x) => [x, 12, 16]).concat([[245, 30, 26]]);
      if (has('matsuri')) FESTIVAL_LANTERNS.forEach(([x]) => glows0.push([x, 10, 12]));
      for (const [x, y, r] of glows0) {
        for (let k = 3; k >= 1; k--) {
          g.fillStyle = `rgba(255,160,70,${0.05 * d / 0.34})`;
          ellipseRaw(x, y, (r * k) / 3, (r * k) / 3.4);
        }
      }
      g.globalCompositeOperation = 'source-over';
    }
    // each lit candle throws its own warm halo (faint by day)
    const glows = [];
    if (has('kamakura')) glows.push(['kama', 90, 101, 9]);
    TABLES.forEach((t, i) => glows.push(['t' + i, candleX(i), 137, 11]));
    const strength = Math.max(0.3, d / 0.34);
    g.globalCompositeOperation = 'lighter';
    for (const [id, x, y, r] of glows) {
      const l = lamps[id];
      if (l.glow <= 0.02) continue;
      const f = l.glow * flicker(l);
      for (let k = 3; k >= 1; k--) {
        g.fillStyle = `rgba(255,160,70,${0.05 * strength * f})`;
        ellipseRaw(x, y, (r * k * (0.9 + 0.1 * f)) / 3, (r * k) / 3.4);
      }
    }
    g.globalCompositeOperation = 'source-over';
  }
  function ellipseRaw(cx, cy, rx, ry) {
    rx = Math.round(rx);
    ry = Math.round(ry);
    for (let dy = -ry; dy <= ry; dy++) {
      const t = dy / (ry + 0.5);
      const hw = Math.round(rx * Math.sqrt(Math.max(0, 1 - t * t)));
      g.fillRect(cx - hw, cy + dy, hw * 2 + 1, 1);
    }
  }

  // ------------------------------------------ 目安箱 suggestion box (wall)
  const MEYASU = { x: 144, y: 60, w: 15, h: 15 };
  function drawMeyasubako() {
    const { x, y } = MEYASU;
    R(x + 7, y - 3, 1, 3, '#2b1c12');
    R(x - 1, y, 17, 2, C.woodDk);
    R(x, y + 2, 15, 12, '#9a6a3c');
    R(x, y + 2, 15, 1, '#b98a54');
    R(x + 4, y + 4, 7, 1, '#2b1c12');
    R(x + 1, y + 7, 13, 6, '#efe3c4');
    R(x, y + 14, 15, 1, C.woodDk);
    regions.push({ x: x - 1, y: y - 3, w: 17, h: 18, label: '<b>目安箱</b> Suggestion box\nShare an idea or report a bug', click: feedbackModal });
  }

  // ------------------------------------------------------------ hi-res text
  function drawText() {
    const s = cssScale * dpr;
    v.textAlign = 'center';
    v.textBaseline = 'middle';
    v.font = `700 ${Math.round(5.2 * s)}px "Hiragino Mincho ProN","Yu Mincho","Noto Serif JP",serif`;
    MENU.forEach((m, i) => {
      const x = 104 + i * 13 + 5;
      const sw = shake['menu' + i] > 0 ? Math.round(Math.sin(shake['menu' + i] * 30) * 1) : 0;
      const tag = i < 4 ? MENU_TAGS[i] : null;
      v.fillStyle = i === 4 ? '#fff8ee' : tag && tag.locked ? 'rgba(43,38,34,0.35)' : '#2b2622';
      const chars = (tag ? tag.jp : m.jp).split('');
      const sealed = i === 4 && todayDone(); // 本日 moves up to make room for the 済 seal
      // up to four characters fit on a tag (ネギトロ), a little smaller when long
      const step = chars.length > 3 ? 6 : chars.length > 2 ? 7.5 : chars.length > 1 ? (sealed ? 7 : 9) : 0;
      if (chars.length > 2) v.font = `700 ${Math.round(4.4 * s)}px "Hiragino Mincho ProN","Yu Mincho","Noto Serif JP",serif`;
      chars.forEach((ch, k) => v.fillText(ch, (x + sw) * s, ((sealed ? 31.5 : 36) + (k - (chars.length - 1) / 2) * step) * s));
      if (chars.length > 2) v.font = `700 ${Math.round(5.2 * s)}px "Hiragino Mincho ProN","Yu Mincho","Noto Serif JP",serif`;
      if (sealed) {
        v.fillStyle = C.shu;
        v.font = `700 ${Math.round(4.4 * s)}px "Hiragino Mincho ProN","Yu Mincho","Noto Serif JP",serif`;
        v.fillText('済', (x + sw) * s, 44.2 * s);
        v.font = `700 ${Math.round(5.2 * s)}px "Hiragino Mincho ProN","Yu Mincho","Noto Serif JP",serif`;
      }
    });
    if (has('kakejiku')) {
      v.fillStyle = '#2b2622';
      v.font = `700 ${Math.round(7 * s)}px "Hiragino Mincho ProN","Yu Mincho","Noto Serif JP",serif`;
      v.fillText('継', 185 * s, 32 * s);
      v.fillText('続', 185 * s, 44 * s);
      v.fillStyle = '#c8412f';
      v.fillRect(187 * s, 54 * s, 3 * s, 3 * s);
    }
    // plaque
    const preparing = timer.phase === 'focus';
    v.fillStyle = preparing ? '#6b5a4a' : '#9a2f22';
    v.font = `700 ${Math.round(4.2 * s)}px "Hiragino Mincho ProN","Yu Mincho","Noto Serif JP",serif`;
    (preparing ? '準備中' : '営業中').split('').forEach((ch, k) => v.fillText(ch, 245.5 * s, (67.5 + k * 6.5) * s));
    if (has('shinagaki')) {
      v.fillStyle = '#2b2622';
      v.font = `700 ${Math.round(3.6 * s)}px "Hiragino Mincho ProN","Yu Mincho","Noto Serif JP",serif`;
      ['品', '書'].forEach((ch, k) => v.fillText(ch, 310.5 * s, (48 + k * 5.5) * s));
      // the count in kanji, top to bottom (十, 二十三, 百…)
      const kn = kanjiNum(MENU_DISHES.book.length).split('');
      const step = kn.length > 3 ? 3.9 : 5;
      v.fillStyle = '#9a2f22';
      v.font = `800 ${Math.round((kn.length > 3 ? 3.3 : 4) * s)}px "Hiragino Mincho ProN","Yu Mincho","Noto Serif JP",serif`;
      kn.forEach((ch, k) => v.fillText(ch, 310.5 * s, (61 + k * step) * s));
    }
    drawClockHiRes(s);
    // suggestion box label
    v.fillStyle = '#5a3a22';
    v.font = `700 ${Math.round(3.3 * s)}px "Hiragino Mincho ProN","Yu Mincho","Noto Serif JP",serif`;
    ['目', '安', '箱'].forEach((ch, k) => v.fillText(ch, (MEYASU.x + 3.5 + k * 4) * s, (MEYASU.y + 10.2) * s));
    // akachochin kanji
    v.fillStyle = 'rgba(30,14,10,0.85)';
    v.font = `700 ${Math.round(4.6 * s)}px "Hiragino Mincho ProN","Yu Mincho","Noto Serif JP",serif`;
    v.fillText('食', 245.5 * s, 26.5 * s);
    v.fillText('堂', 245.5 * s, 33 * s);
  }

  // ----------------------------------------------------------------- radio
  // Koto music in short phrases on the miyako-bushi scale: each phrase opens
  // with two strings plucked together (an octave or a fifth, as koto players
  // do), wanders a little, and settles back home on D before a short rest.
  let radioLeft = 0;
  function radioDyad(step, interval, when) {
    OKSound.koto(OKSound.scaleNote(step), when || 0, 1.5);
    OKSound.koto(OKSound.scaleNote(step + interval), (when || 0) + 0.035, 1.5); // a slight strum
  }
  function updateRadio(dt) {
    if (!radioOn || !has('radio')) return;
    radioTimer -= dt;
    if (radioTimer > 0) return;
    const note = () => particles.push({ x: 226 + rand(-2, 2), y: 44, vx: rand(-3, 3), vy: -8, life: 1.3, c: '#f3e6c8', type: 'note' });
    if (radioLeft <= 0) {
      // new phrase: an opening pair of strings
      radioStep = pick([0, 2, 3, 5]);
      radioDyad(radioStep, pick([5, 5, 3]));
      radioLeft = 5 + Math.floor(Math.random() * 5);
      radioTimer = 0.9;
      note();
      return;
    }
    radioLeft--;
    if (radioLeft === 0) {
      // cadence: home to D, an octave pair, then a breath
      radioStep = radioStep >= 3 ? 5 : 0;
      radioDyad(radioStep, 5);
      OKSound.koto(OKSound.scaleNote(0) / 2, 0.05, 2.2);
      radioTimer = pick([2.2, 2.7, 3.2]);
      note();
      return;
    }
    radioTimer = pick([0.45, 0.45, 0.9, 0.9, 1.35]);
    if (Math.random() < 0.85) {
      radioStep = clamp(radioStep + pick([-2, -1, -1, 1, 1, 2]), 0, 9);
      if (Math.random() < 0.15) {
        // now and then a quick grace note from the string above, just before
        OKSound.koto(OKSound.scaleNote(radioStep + 1), 0, 0.22);
        OKSound.koto(OKSound.scaleNote(radioStep), 0.07, 1.1);
      } else {
        OKSound.pluck(radioStep);
      }
      note();
    }
  }


  // ------------------------------------------------------------------ loop
  function update(dt) {
    time += dt;
    // Rush mode speeds up service (not Tama or the scenery) to catch up fast.
    const gdt = rush ? dt * 4 : dt;
    for (const k of Object.keys(shake)) shake[k] = Math.max(0, shake[k] - dt);
    norenSway = Math.max(0, norenSway - dt * 0.8);

    // chef
    chef.blink -= dt;
    if (chef.blink < 0) chef.blink = rand(2.5, 5);
    chef.lookT -= dt;
    if (chef.lookT < 0) { chef.look = pick([-1, 0, 0, 1]); chef.lookT = rand(2, 5); }
    if (chef.state === 'make') {
      chef.t += gdt;
      if (Math.floor(chef.t * 6) !== Math.floor((chef.t - gdt) * 6) && Math.floor(chef.t * 6) % 2) {
        particles.push({ x: 120 + rand(0, 3), y: 98, vx: rand(-8, 8), vy: -rand(8, 14), life: 0.45, c: C.rice, type: 'crumb' });
      }
      if (chef.t > 1.8) {
        chef.state = 'idle';
        if (chef.target) launchPlate(chef.target);
        else if (chef.dish) { trayDishes.push(chef.dish); send('bump', 'onigiri_made'); OKSound.pop(); }
        chef.target = null;
        chef.dish = null;
      }
    } else if (orders.length) {
      const c = orders.shift();
      if (c && c.state === 'wait') {
        // on the tray already? straight to the table. Otherwise the chef makes it.
        const i = trayDishes.findIndex((d) => sameDish(d, c.dish));
        if (i >= 0) { trayDishes.splice(i, 1); launchPlate(c); }
        else { chef.state = 'make'; chef.t = 0; chef.target = c; chef.dish = c.dish; }
      }
    }
    chef.lineT -= dt;
    if (chef.lineT < 0) { chef.lineT = rand(40, 80); if (!bubbleVisible()) say(chefLine()); }

    // Tama
    updateTama(dt);
    updateResidents(dt);
    giftTimer -= dt;
    if (giftTimer <= 0) { giftTimer = 600; checkGift(); }

    // fish
    for (const f of fish) {
      f.x += f.dir * dt * 2.2;
      if (f.x > 7 || f.x < 0) f.dir *= -1;
      f.y = clamp(f.y + (Math.random() < dt ? pick([-1, 1]) : 0), 0, 3);
    }

    // guests arrive
    spawnTimer -= gdt;
    if (spawnTimer <= 0) {
      spawnTimer = rush ? rand(1.2, 2) : rand(3.5, 6.5);
      if (!claiming && freeSeat() && (S.guestsWaiting || 0) > 0) {
        claiming = true;
        send('claim', null, (guest) => {
          claiming = false;
          if (guest && typeof guest === 'object') {
            S.guestsWaiting = Math.max(0, (S.guestsWaiting || 1) - 1);
            spawnCustomer(guest);
          } else {
            S.guestsWaiting = 0;
          }
          updateStatus();
        });
      }
    }
    customers.forEach((c) => updateCustomer(c, gdt));
    customers = customers.filter((c) => !c.gone);
    updatePlates(gdt);
    updateCoins(gdt);
    if (rush && !claiming && (S.guestsWaiting || 0) === 0 && customers.length === 0) {
      rush = false;
      renderRushBtn();
      toast('全員満足 · Everyone served! All caught up');
      OKSound.fanfare();
      spawnHearts(tama.x, 150, 2);
    }

    // outside world
    walkerTimer -= dt;
    if (walkerTimer <= 0) {
      walkerTimer = rand(9, 22);
      const dir = Math.random() < 0.5 ? 1 : -1;
      // now and then a penguin waddles by instead (more of them in winter)
      const penguin = hasPuffle() && Math.random() < (SEASON === 'winter' ? 0.45 : 0.15);
      walkers.push({ x: dir > 0 ? -6 : WIN.w - 2, dir, p: Math.random() * 10, penguin, c: penguin ? pick(['#3d7fd6', '#d8403a', '#4fb04a', '#f28dbb', '#34343c']) : pick(['#efe6d4', '#e8d4b0', '#f6d7c8']), u: pick(['#c8412f', '#3b6ea5', '#e0a13a']) });
    }
    walkers.forEach((wk) => { wk.x += wk.dir * dt * (wk.penguin ? 6 : 9); });
    walkers = walkers.filter((wk) => wk.x > -8 && wk.x < WIN.w + 2);

    windTimer -= dt;
    if (windTimer <= 0) {
      windTimer = rand(25, 50);
      if (has('furin')) shake.furin = 0.6; // a silent sway: it only rings when you tap it
      norenSway = Math.max(norenSway, 0.6);
    }

    if (festival) {
      fireworkTimer -= dt;
      if (fireworkTimer <= 0) { fireworkTimer = rand(1.2, 2.6); firework(); }
    }
    weatherParticles(dt);
    updateParticles(dt);
    updateSparrow(dt);
    updateRadio(dt);
    updateLamps(dt);
    updateParty(dt);
    updateClock(dt);
  }

  function render() {
    regions = [];
    const h = hourNow();
    lanternsAuto();
    g.drawImage(bg, 0, 0);
    const lit = lanternsOn;
    drawWindow(h);
    drawSparrow();
    drawMenu();
    drawWallDecor();
    drawMeyasubako();
    drawTreasureShelf();
    drawRewards();
    drawDoor(h);
    drawLanterns(lit);
    drawChef();
    drawCounter();
    drawCounterDecor();
    drawFloorDecor();
    // guests walking in or out pass behind the seated ones, never in front
    const walking = (c) => (c.state === 'walk' || c.state === 'leave' ? 0 : 1);
    customers.slice().sort((a, b) => walking(a) - walking(b) || a.y - b.y).forEach(drawCustomer);
    drawTables();
    drawPlates();
    drawCoins();
    drawTamaFloor();
    drawFloorGifts();
    drawResidents();
    drawTama();
    drawParticles();
    drawLighting(h);
    // hover outline
    if (hover) {
      g.strokeStyle = 'rgba(255,248,230,0.55)';
      g.lineWidth = 1;
      g.strokeRect(Math.round(hover.x) - 0.5, Math.round(hover.y) - 0.5, Math.round(hover.w) + 1, Math.round(hover.h) + 1);
    }
    v.imageSmoothingEnabled = false;
    v.clearRect(0, 0, view.width, view.height);
    v.drawImage(low, 0, 0, view.width, view.height);
    drawText();
    positionBubble();
  }

  let lanternAutoState = darkness(hourNow()) > 0.05;
  function lanternsAuto() {
    // At dusk the lanterns light up and the candles follow one by one; at
    // dawn they all go out (anything you toggle in between stays as you left it).
    const on = darkness(hourNow()) > 0.05;
    if (lanternAutoState !== on) {
      lanternAutoState = on;
      lanternsOn = on;
      LAMP_IDS.forEach((id, i) => lampOn(id, on, 0, 0, 0.8 + i * 0.6));
    }
  }

  let last = performance.now();
  let acc = 0;
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    acc += dt;
    if (acc >= 1 / 30) {
      update(acc);
      acc = 0;
      render();
    }
    requestAnimationFrame(frame);
  }

  // --------------------------------------------------------------- sizing
  function resize() {
    const stage = $('ok-stage');
    const sw = stage.clientWidth - 16;
    const sh = stage.clientHeight - 16;
    const s = Math.max(1, Math.min(sw / W, sh / H));
    cssScale = s;
    dpr = window.devicePixelRatio || 1;
    view.style.width = Math.round(W * s) + 'px';
    view.style.height = Math.round(H * s) + 'px';
    view.width = Math.round(W * s * dpr);
    view.height = Math.round(H * s * dpr);
  }

  // --------------------------------------------------------------- input
  function toLow(e) {
    const r = view.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  }
  function hit(p) {
    for (let i = regions.length - 1; i >= 0; i--) {
      const r = regions[i];
      if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) return r;
    }
    return null;
  }
  view.addEventListener('mousemove', (e) => {
    const p = toLow(e);
    if (feather) { feather.x = p.x; feather.y = p.y; }
    const r = hit(p);
    hover = r;
    view.style.cursor = r ? 'pointer' : 'default';
    const tip = $('ok-tip');
    if (r && r.label) {
      tip.innerHTML = r.label;
      tip.hidden = false;
      const stage = $('ok-stage').getBoundingClientRect();
      let tx = e.clientX - stage.left + 14;
      let ty = e.clientY - stage.top + 16;
      const tw = tip.offsetWidth;
      const th = tip.offsetHeight;
      if (tx + tw > stage.width - 6) tx = e.clientX - stage.left - tw - 10;
      if (ty + th > stage.height - 6) ty = e.clientY - stage.top - th - 10;
      tip.style.left = tx + 'px';
      tip.style.top = ty + 'px';
    } else {
      tip.hidden = true;
    }
  });
  // right-click ends the feather toy; the button does too
  view.addEventListener('contextmenu', (e) => { if (feather) { e.preventDefault(); endPlay(); } });
  view.addEventListener('mouseleave', () => { hover = null; $('ok-tip').hidden = true; });
  view.addEventListener('click', (e) => {
    if (feather) { tama.hop = 6; OKSound.pop(); return; }
    const r = hit(toLow(e));
    if (r && r.click) r.click();
  });

  // --------------------------------------------------------- speech bubble
  let bubbleTimer = null;
  let bubbleAnchor = null;
  function say(lineArr, anchor) {
    const el = $('ok-bubble');
    el.innerHTML = `<span class="jp">${lineArr[0]}</span><span class="en">${lineArr[1]}</span>`;
    el.hidden = false;
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
    bubbleAnchor = anchor || { x: 121, y: 70 };
    positionBubble();
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(() => { el.hidden = true; }, 4200);
  }
  function bubbleVisible() { return !$('ok-bubble').hidden; }
  function positionBubble() {
    const el = $('ok-bubble');
    if (el.hidden || !bubbleAnchor) return;
    const stage = $('ok-stage').getBoundingClientRect();
    const r = view.getBoundingClientRect();
    const ax = r.left - stage.left + (bubbleAnchor.x / W) * r.width;
    const ay = r.top - stage.top + (bubbleAnchor.y / H) * r.height;
    // keep the whole bubble inside the room; the tail still points at the spot
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const lo = r.left - stage.left + w / 2 + 6;
    const hi = r.right - stage.left - w / 2 - 6;
    const x = lo > hi ? (lo + hi) / 2 : clamp(ax, lo, hi);
    el.style.left = x + 'px';
    el.style.top = Math.max(ay, r.top - stage.top + h + 6) + 'px';
    el.style.setProperty('--tail', clamp(w / 2 + (ax - x), 16, w - 16) + 'px');
  }

  let toastTimer = null;
  function toast(text) {
    const el = $('ok-toast');
    el.textContent = text;
    el.hidden = false;
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 3800);
  }

  // ----------------------------------------------------------------- HUD
  function bumpPurse() {
    $('ok-mon').textContent = dispMon;
    const p = document.querySelector('.ok-purse');
    p.classList.remove('bump');
    void p.offsetWidth;
    p.classList.add('bump');
  }

  function updateStatus() {
    const el = $('ok-status');
    const waiting = S.guestsWaiting || 0;
    const per = conf.reviews_per_guest || 10;
    const inside = customers.length;
    if (timer.phase === 'focus' && timer.idle) {
      el.innerHTML = `<span class="jp">休止</span>Focus paused while you were away. It resumes when you answer a card.`;
    } else if (timer.phase === 'focus') {
      el.innerHTML = `<span class="jp">準備中</span>Focus session running. Guests are lining up while you study.`;
    } else if (waiting > 0) {
      el.innerHTML = `<span class="jp">行列</span>${waiting} guest${waiting === 1 ? '' : 's'} waiting outside · ${inside} inside` + (rush ? ' · serving at 4×' : '');
    } else if (inside > 0) {
      el.innerHTML = `<span class="jp">営業中</span>${inside} guest${inside === 1 ? '' : 's'} dining · every ${per} reviews brings another`;
    } else {
      el.innerHTML = `<span class="jp">静か</span>A quiet moment. Every ${per} reviews in a deck brings a guest here.`;
    }
  }

  function renderRushBtn() {
    const b = $('ok-b-rush');
    const waiting = (S.guestsWaiting || 0) + customers.length;
    b.hidden = !(waiting > 0 && timer.phase !== 'focus');
    b.classList.toggle('on', rush);
    b.innerHTML = rush ? '<span class="jp">文</span> Collect all' : '<span class="jp">急</span> Serve faster';
    b.title = rush ? 'Serving at 4×. Click again to collect every tip at once' : 'Serve waiting guests at 4× speed';
  }
  setInterval(renderRushBtn, 1000);

  function startRush() {
    rush = true;
    spawnTimer = 0;
    renderRushBtn();
    updateStatus();
    OKSound.pluck(6);
  }

  function serveAll() {
    send('serveall', null, (res) => {
      if (!res) return;
      if (res.state) S = Object.assign(S, res.state);
      if (res.pet) { pet = res.pet; renderPetPanel(); }
      const count = res.count || 0;
      if (!count) { toast('Nobody is waiting right now.'); return; }
      dispMon += res.mon || 0;
      bumpPurse();
      for (let i = 0; i < Math.min(60, count * 3); i++) {
        particles.push({ x: rand(20, 300), y: rand(-40, 0), vx: rand(-6, 6), vy: rand(10, 40), life: 4, c: C.gold, type: 'coin' });
      }
      OKSound.fanfare();
      setTimeout(() => OKSound.coin(), 300);
      spawnHearts(tama.x, 150, 3);
      updateStatus();
      renderRushBtn();
      const k = res.kinds || {};
      const extras = [];
      if (k.golden) extras.push(`${k.golden} golden`);
      if (k.leech) extras.push(`${k.leech} sour plum${k.leech === 1 ? '' : 's'}`);
      const deckCount = Object.keys(res.decks || {}).length;
      modal('全員満足', 'Everyone served!',
        `Served <b>${count}</b> guest${count === 1 ? '' : 's'}${extras.length ? ' (' + extras.join(', ') + ')' : ''}` +
        `${deckCount ? ` from <b>${deckCount}</b> deck${deckCount === 1 ? '' : 's'}` : ''}.<br>` +
        `Tips: <b>+${res.mon} mon</b> · ${esc(pet.name)} got <b>${Math.min(count, 20)}</b> ${Math.min(count, 20) === 1 ? sp().food : foods()} saved.`,
        [['やった!<small>Nice</small>', 'ok-hanko ok-hanko-wide', null]]);
    });
  }

  // After a big study session: choose how to catch up.
  function feedbackModal() {
    OKSound.pluck(4);
    modal('目安箱', 'Suggestion box',
      'Have an idea for the kitchen or found something broken?<br>Both open a short form on GitHub (a free account is needed).',
      [
        ['💡 Suggest a feature', 'ok-hanko', () => send('idea')],
        ['🐞 Report a bug', 'ok-foot-btn', () => send('report')],
        ['Close', 'ok-ghost', null],
      ]);
  }

  function renderHeader() {
    $('ok-name').textContent = onigiri.name || 'Onigiri Kitchen';
    $('ok-level').textContent = onigiri.level || 0;
    const frac = onigiri.xpNext ? clamp(onigiri.xpInto / onigiri.xpNext, 0, 1) : 0;
    $('ok-xpfill').style.width = frac * 100 + '%';
    document.querySelector('.ok-sign').title = onigiri.found
      ? `${onigiri.name}: level ${onigiri.level} (${onigiri.xpInto}/${onigiri.xpNext} XP)`
      : onigiri.levelFrom === 'study'
        ? `Level ${onigiri.level}: one level for every ${onigiri.daysPerLevel || 3} days you've studied (${onigiri.studyDays || 0} so far). With Onigiri installed, this follows your Onigiri restaurant level.`
        : 'Install Onigiri to link your restaurant level';
    $('ok-mon').textContent = dispMon;
  }

  // -------------------------------------------------------------- timer UI
  function fmt(ms) {
    const s = Math.max(0, Math.round(ms / 1000));
    if (s >= 3600) return Math.floor(s / 3600) + ':' + String(Math.floor(s / 60) % 60).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }
  // endless focus counts up: time studied so far, ticking while it runs
  function elapsed() {
    return (timer.elapsed || 0) + (timer.paused ? 0 : Math.max(0, Date.now() - (timer.now || Date.now())));
  }
  function remaining() {
    if (timer.endsAt && !timer.paused) return timer.endsAt - Date.now();
    return timer.remaining || 0;
  }
  function renderTimer() {
    const box = $('ok-timer');
    box.dataset.phase = timer.phase;
    box.classList.toggle('paused', !!timer.paused);
    const phase = $('ok-phase');
    const clock = $('ok-clock');
    const main = $('ok-t-main');
    const endlessMode = !!(INIT_TIMER_MODE.endless);
    $('ok-t-endless').classList.toggle('on', endlessMode);
    $('ok-t-endless').title = endlessMode ? 'Endless focus is on: no breaks. Tap to go back to the pomodoro countdown' : 'Endless focus: study without breaks';
    $('ok-t-skip').title = timer.endless ? 'Stop endless focus' : 'Skip to the next step';
    if (timer.phase === 'focus' && timer.endless) {
      phase.textContent = timer.idle ? '休止 · Paused while idle' : '無限 · Endless focus';
      clock.textContent = fmt(elapsed());
    } else if (timer.phase === 'focus') {
      phase.textContent = timer.idle
        ? '休止 · Paused while idle'
        : '集中 · Focus' + (timer.cardGoal ? ` · ${timer.focusCards}/${timer.cardGoal}` : '');
      clock.textContent = fmt(remaining());
    } else if (timer.phase === 'break') {
      phase.textContent = timer.longBreak ? '祭り · Long break' : '休憩 · Break';
      clock.textContent = fmt(remaining());
    } else {
      phase.textContent = endlessMode ? '待機 · Ready · no breaks' : '待機 · Ready';
      clock.textContent = endlessMode ? '0:00' : fmt((conf.focus_minutes || 25) * 60000);
    }
    // ▶ Start / ❚❚ Pause / ▶ Resume: same width every time, outlined while paused
    const PLAY = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 1.8v8.4L10 6z" fill="currentColor"/></svg>';
    const PAUSE = '<svg viewBox="0 0 12 12" aria-hidden="true"><rect x="2.4" y="1.8" width="2.6" height="8.4" rx="0.8" fill="currentColor"/><rect x="7" y="1.8" width="2.6" height="8.4" rx="0.8" fill="currentColor"/></svg>';
    const state = timer.phase === 'idle' ? 'start' : timer.paused ? 'resume' : 'pause';
    if (main.dataset.state !== state) {
      main.dataset.state = state;
      main.innerHTML = state === 'start' ? `${PLAY}開始<small>Start</small>` : state === 'resume' ? `${PLAY}再開<small>Resume</small>` : `${PAUSE}一時停止<small>Pause</small>`;
      main.title = state === 'start' ? (endlessMode ? 'Start endless focus (no breaks)' : 'Start a focus session') : state === 'resume' ? 'Resume the timer' : 'Pause the timer';
    }
    main.classList.toggle('ok-t-paused', state === 'resume');
    // dango skewer
    const sk = $('ok-skewer');
    const cycle = timer.cycle || conf.rounds_before_long_break || 4;
    if (sk.childElementCount !== cycle) {
      sk.innerHTML = '';
      for (let i = 0; i < cycle; i++) {
        const d = document.createElement('span');
        d.className = 'ok-dango c' + (i % 3);
        sk.appendChild(d);
      }
    }
    Array.from(sk.children).forEach((d, i) => {
      d.classList.toggle('done', i < (timer.rounds || 0));
      d.classList.toggle('now', timer.phase === 'focus' && i === (timer.rounds || 0));
    });
    festival = timer.phase === 'break' && !!timer.longBreak;
  }
  setInterval(renderTimer, 1000);

  $('ok-t-main').addEventListener('click', () => {
    const act = timer.phase === 'idle' ? 'start' : timer.paused ? 'resume' : 'pause';
    send('timer', act, (r) => r && OK.onTimer(r));
    OKSound.blip();
  });
  $('ok-t-endless').addEventListener('click', () => {
    send('timer', 'endless', (r) => {
      if (!r) return;
      INIT_TIMER_MODE.endless = !!r.endlessMode;
      OK.onTimer(r);
      toast(r.endlessMode ? '無限 · Endless focus: no breaks. Every session still counts' : 'Pomodoro breaks are back on');
      OKSound.blip();
    });
  });
  $('ok-t-skip').addEventListener('click', () => {
    send('timer', 'skip', (r) => r && OK.onTimer(r));
  });
  $('ok-t-set').addEventListener('click', () => togglePanel('ok-settings'));
  $('ok-report').addEventListener('click', () => send('report'));
  $('ok-idea').addEventListener('click', () => send('idea'));
  $('ok-tour-replay').addEventListener('click', () => { $('ok-settings').hidden = true; startTour(); });
  $('ok-b-rush').addEventListener('click', () => {
    // first click: serve at 4×; second click: collect everyone's tips at once
    if (rush) { rush = false; serveAll(); renderRushBtn(); updateStatus(); } else startRush();
  });
  $('ok-version').textContent = INIT.version ? 'v' + INIT.version : '';
  $('ok-t-reset').addEventListener('click', () => {
    send('timer', 'reset', (r) => r && OK.onTimer(r));
    toast('Cycle reset');
  });

  // Panels open right next to their button: above the footer buttons (Pet,
  // Shop), below the timer's ⚙. Centred on the button, kept on screen.
  const PANEL_BTN = { 'ok-pet': 'ok-b-pet', 'ok-decor': 'ok-b-decor', 'ok-settings': 'ok-t-set' };
  function placePanel(el) {
    const btn = $(PANEL_BTN[el.id]);
    if (!btn || el.hidden) return;
    const b = btn.getBoundingClientRect();
    const gap = 8;
    const above = b.top > window.innerHeight / 2;
    el.style.right = 'auto';
    if (above) {
      el.style.top = 'auto';
      el.style.bottom = window.innerHeight - b.top + gap + 'px';
      el.style.maxHeight = Math.max(200, b.top - gap - 16) + 'px';
    } else {
      el.style.bottom = 'auto';
      el.style.top = b.bottom + gap + 'px';
      el.style.maxHeight = Math.max(200, window.innerHeight - b.bottom - gap - 16) + 'px';
    }
    const w = el.offsetWidth;
    el.style.left = clamp(b.left + b.width / 2 - w / 2, 12, window.innerWidth - w - 12) + 'px';
  }
  function togglePanel(id) {
    const el = $(id);
    const show = el.hidden;
    document.querySelectorAll('.ok-panel').forEach((p) => { p.hidden = true; });
    el.hidden = !show;
    if (show && id === 'ok-settings') fillForm();
    if (show && id === 'ok-decor') renderDecor();
    if (show) placePanel(el);
  }
  window.addEventListener('resize', () => document.querySelectorAll('.ok-panel:not([hidden])').forEach(placePanel));
  document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => { $(b.dataset.close).hidden = true; }));
  // Clicking anywhere outside an open panel closes it. A click on the scene
  // only closes the panel (it doesn't also pet or tap whatever is there).
  document.addEventListener('click', (e) => {
    const open = document.querySelector('.ok-panel:not([hidden])');
    if (!open || open.contains(e.target)) return;
    if (e.target.closest('#ok-b-pet, #ok-b-decor, #ok-t-set, .ok-modal, .ok-tour')) return;
    open.hidden = true;
    if (e.target === view) e.stopPropagation();
  }, true);
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && (e.key === 'w' || e.key === 'W')) {
      e.preventDefault();
      send('close');
      return;
    }
    if (tourIdx >= 0) {
      if (e.key === 'Escape') { endTour(); e.preventDefault(); e.stopPropagation(); return; }
      if (e.key === 'ArrowRight' || e.key === 'Enter') { tourGo(tourIdx + 1); e.preventDefault(); return; }
      if (e.key === 'ArrowLeft') { tourGo(tourIdx - 1); e.preventDefault(); return; }
    }
    if (e.key === 'Escape' && feather) { endPlay(); e.preventDefault(); e.stopPropagation(); return; }
    if (e.key === 'Escape' && !$('ok-starter').hidden) { e.preventDefault(); e.stopPropagation(); return; }
    if (e.key === 'Escape' && e.target === $('ok-pet-nameinput')) { saveName(false); e.preventDefault(); e.stopPropagation(); return; }
    if (e.key === 'Escape') {
      const open = document.querySelector('.ok-panel:not([hidden]), .ok-modal:not([hidden])');
      if (open) { open.hidden = true; e.preventDefault(); e.stopPropagation(); }
    }
  }, true);

  function fillForm() {
    const f = $('ok-form');
    for (const el of f.elements) {
      if (!el.name) continue;
      if (el.type === 'checkbox') el.checked = !!conf[el.name];
      else if (conf[el.name] != null) el.value = conf[el.name];
    }
  }
  $('ok-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const updates = {};
    for (const el of e.target.elements) {
      if (!el.name) continue;
      updates[el.name] = el.type === 'checkbox' ? el.checked : Number(el.value);
    }
    send('conf', JSON.stringify(updates), (c) => {
      if (c) conf = c;
      OKSound.configure({ volume: conf.volume });
      renderTimer();
      updateStatus();
      $('ok-settings').hidden = true;
      toast('Saved · 保存しました');
    });
  });

  $('ok-b-sound').addEventListener('click', () => {
    conf.sound = !conf.sound;
    OKSound.configure({ sound: conf.sound });
    renderSoundBtn();
    send('conf', JSON.stringify({ sound: conf.sound }));
    if (conf.sound) OKSound.pluck(4);
  });
  function renderSoundBtn() {
    const b = $('ok-b-sound');
    b.classList.toggle('off', !conf.sound);
    b.title = conf.sound ? 'Mute' : 'Unmute';
    b.setAttribute('aria-label', b.title);
  }
  $('ok-b-decor').addEventListener('click', () => togglePanel('ok-decor'));

  // ----------------------------------------------------------------- decor
  const MON_SVG = document.querySelector('.ok-mon-icon').outerHTML;
  function renderDecor() {
    const grid = $('ok-decor-grid');
    grid.innerHTML = '';
    const level = onigiri.level || 0;
    const animals = catalog.filter((c) => c.kind === 'animal');
    const pets = catalog.filter((c) => c.kind === 'pet' && c.species !== pet.species);
    const decor = catalog.filter((c) => !isCompanion(c) && c.kind !== 'reward' && (!c.puffle || hasPuffle() || S.owned.includes(c.id)));
    const rewards = SPECIALS.found ? catalog.filter((c) => c.kind === 'reward') : [];
    const heading = (jp, en, sub) => {
      const h = document.createElement('div');
      h.className = 'ok-grid-head';
      h.innerHTML = `<b class="jp">${jp}</b> ${en}<span>${sub}</span>`;
      grid.appendChild(h);
    };
    const ordered = [];
    if (pets.length || animals.length) ordered.push({ head: ['ペット', 'Pets', 'Friends who move in · hover one to see its perk'] }, ...pets, ...animals);
    ordered.push({ colors: true });
    ordered.push({ head: ['飾り', 'Decor', 'Little touches for your restaurant'] }, ...decor);
    if (rewards.length) ordered.push({ head: ['記録', 'Specials rewards', 'Earned by collecting specials in your Onigiri Specials Book'] }, ...rewards);
    for (const item of ordered) {
      if (item.head) { heading(...item.head); continue; }
      if (item.colors) { renderColorShop(grid, heading); continue; }
      const owned = S.owned.includes(item.id);
      if (item.kind === 'reward' && !owned) {
        // progress towards it, no price
        const book = MENU_DISHES.book;
        const [k, n] = Object.entries(item.need || {})[0] || ['total', 0];
        const have = k === 'total' ? book.length : book.filter((d) => d.rarity === k).length;
        const card = document.createElement('div');
        card.className = 'ok-item locked';
        const icon = document.createElement('canvas');
        drawRewardIcon(icon, item.id);
        card.appendChild(icon);
        card.insertAdjacentHTML('beforeend', `<div><div class="ok-item-name"><span class="jp">${item.jp}</span><span>${item.name}</span></div><p>${item.desc}</p></div>` +
          `<div class="ok-item-foot"><span class="ok-lock">🔒 ${Math.min(have, n)}/${n} ${k === 'total' ? 'specials' : `${(RARITY[k] || {}).name || k} special${n === 1 ? '' : 's'}`}</span></div>`);
        grid.appendChild(card);
        continue;
      }
      const locked = !owned && level < item.level;
      const card = document.createElement('div');
      card.className = 'ok-item' + (locked ? ' locked' : '');
      const icon = document.createElement('canvas');
      drawIcon(icon, item.id);
      card.appendChild(icon);
      const body = document.createElement('div');
      body.innerHTML =
        `<div class="ok-item-name"><span class="jp">${item.jp}</span><span>${item.name}</span></div>` +
        (item.perk
          ? `<div class="ok-item-text"><p class="ok-desc">${item.desc}</p><p class="ok-perk">✦ ${item.perk}</p></div>`
          : `<p>${item.desc}</p>`);
      card.className += isCompanion(item) ? ' ok-animal' : '';
      card.appendChild(body);
      const foot = document.createElement('div');
      foot.className = 'ok-item-foot';
      if (owned) {
        const shown = !S.hidden.includes(item.id);
        foot.innerHTML = `<span class="ok-lock">${shown ? '✓ On display' : 'In storage'}</span>`;
        const b = document.createElement('button');
        b.className = 'ok-owned';
        b.textContent = shown ? 'Hide' : 'Show';
        b.onclick = () => send('toggle', item.id, (snap) => { if (snap) S = Object.assign(S, snap); syncResidents(); renderDecor(); });
        foot.appendChild(b);
      } else if (locked) {
        foot.innerHTML = `<span class="ok-price">${MON_SVG}${item.price}</span><span class="ok-lock">🔒 Lv ${item.level}</span>`;
      } else {
        foot.innerHTML = `<span class="ok-price">${MON_SVG}${item.price}</span>`;
        const b = document.createElement('button');
        b.textContent = '購入 Buy';
        b.disabled = S.mon < item.price;
        b.onclick = () => send('buy', item.id, (r) => {
          if (!r) return;
          if (r.state) S = Object.assign(S, r.state);
          if (r.ok) {
            dispMon = S.mon - coins.reduce((a, c) => a + (c.done ? 0 : c.amount), 0);
            renderHeader();
            OKSound.fanfare();
            spawnHearts(160, 90, 3);
            if (isCompanion(item)) {
              syncResidents();
              const a = residents.find((x) => x.id === item.id);
              if (a) { a.x = DOOR_X; a.target = 160; a.pose = 'walk'; }
              say([`${item.jp}が仲間になった!`, `${item.name} moved in!`], { x: 160, y: 150 });
              if (item.id === 'puffle' && !(S.puffleColors || []).length) setTimeout(() => openChooser('color', 'puffle'), 700);
              if (item.id === 'buncho' && !(S.birdColors || []).length) setTimeout(() => openChooser('color', 'bird'), 700);
            }
          }
          toast(r.msg);
          renderDecor();
        });
        foot.appendChild(b);
      }
      card.appendChild(foot);
      grid.appendChild(card);
    }
  }

  // パフルの色 / 文鳥の色: colours, shown once you have that pet (starter or shop).
  function renderColorShop(grid, heading) {
    for (const kind of ['puffle', 'bird']) {
      const ck = colorKind(kind);
      if (!ck.has) continue;
      heading(ck.jp, `${ck.noun[0].toUpperCase()}${ck.noun.slice(1)} colours`, `${PUFFLE_COLOR_PRICE} mon each · swap any time once owned`);
      grid.lastChild.id = 'ok-colors-' + kind;
      const row = document.createElement('div');
      row.className = 'ok-color-grid';
      for (const c of ck.list) {
        const have = ck.owned.includes(c.id);
        const b = document.createElement('button');
        b.className = 'ok-color' + (ck.current === c.id ? ' on' : '') + (have ? ' owned' : '');
        const cv = document.createElement('canvas');
        cv.width = 22;
        cv.height = 19;
        const prev = gRef;
        gRef = cv.getContext('2d');
        drawColorSample(kind, c.id, 11, 18, ck.current === c.id);
        gRef = prev;
        b.appendChild(cv);
        const free = !ck.owned.length && c.starter;
        b.insertAdjacentHTML('beforeend', `<span>${c.jp} ${c.name}</span><small>${ck.current === c.id ? '✓ Wearing' : have ? 'Owned' : free ? 'Free' : `${MON_SVG}${PUFFLE_COLOR_PRICE}`}</small>`);
        b.disabled = !have && !free && S.mon < PUFFLE_COLOR_PRICE;
        b.onclick = () => setPetColor(kind, c.id);
        row.appendChild(b);
      }
      grid.appendChild(row);
    }
  }

  function setPetColor(kind, id) {
    const ck = colorKind(kind);
    const c = ck.list.find((x) => x.id === id);
    const owned = ck.owned.includes(id);
    if (!c || ck.current === id) return;
    send('petcolor', JSON.stringify({ kind, color: id }), (r) => {
      if (!r) return;
      if (r.state) S = Object.assign(S, r.state);
      if (r.ok) {
        if (!owned && ck.owned.length) { dispMon = S.mon - coins.reduce((a, cn) => a + (cn.done ? 0 : cn.amount), 0); renderHeader(); OKSound.fanfare(); }
        else voice(kind);
        const who = pet.species === kind ? tama : residents.find((a) => a.id === ck.shopId) || { x: 160, y: FLOOR_Y };
        spawnHearts(who.x, (who.y == null ? FLOOR_Y : who.y) - 20, 2);
      }
      toast(r.msg);
      if (!$('ok-decor').hidden) renderDecor();
      renderPetPanel();
    });
  }
  const setPuffleColor = (id) => setPetColor('puffle', id);

  function drawRewardIcon(canvas, id) {
    canvas.width = 44;
    canvas.height = 30;
    const ctx = canvas.getContext('2d');
    const prev = gRef;
    gRef = ctx;
    const d = { name: 'Nigiri Otoro', kind: 'nigiri', c: '#e8909a' };
    if (id === 'kin_gaku') { R(15, 7, 15, 14, C.goldDk); R(16, 8, 13, 12, C.gold); R(17, 9, 11, 10, '#3e2717'); paintRows(DISH_ART.nigiri, 18, 10, dishPal(d), 9); }
    else if (id === 'shinagaki') { R(15, 2, 15, 26, '#5a3a22'); R(17, 4, 11, 22, '#efe6cf'); R(19, 8, 7, 1, '#2b2622'); R(19, 11, 7, 1, '#2b2622'); R(20, 17, 5, 4, '#9a2f22'); }
    else if (id === 'kin_hachimaki') { R(8, 12, 28, 5, C.gold); R(8, 16, 28, 1, C.goldDk); R(20, 12, 4, 5, C.shu); R(36, 13, 4, 2, C.gold); }
    else if (id === 'densetsu_bocho') { R(6, 16, 32, 2, '#5a3a22'); R(9, 12, 6, 3, '#2b1c12'); R(15, 12, 20, 3, '#dfe7ee'); R(15, 12, 20, 1, '#ffffff'); R(14, 11, 1, 5, C.gold); }
    gRef = prev;
  }
  function drawIcon(canvas, id) {
    if (id === 'shinagaki' || id === 'kin_hachimaki' || id === 'kin_gaku' || id === 'densetsu_bocho') { drawRewardIcon(canvas, id); return; }
    if (ANIMAL_ART[id]) {
      canvas.width = 44;
      canvas.height = 30;
      const ctx = canvas.getContext('2d');
      const prev = gRef;
      gRef = ctx;
      ANIMAL_ART[id](id === 'tsuru' ? 22 : 21, 28, 1, 'walk', 0);
      gRef = prev;
      return;
    }
    const d = DECOR[id];
    const pad = 4;
    const cw = id === 'matsuri' ? 60 : Math.max(d.w, d.h * 1.6) + pad * 2;
    const ch = id === 'matsuri' ? 30 : Math.max(d.h, d.w / 1.6) + pad * 2;
    canvas.width = Math.round(cw);
    canvas.height = Math.round(ch);
    const ctx = canvas.getContext('2d');
    const prev = gRef;
    gRef = ctx;
    const ox = Math.round((cw - d.w) / 2) - d.x;
    const oy = Math.round((ch - d.h) / 2) - d.y;
    ctx.translate(ox, oy);
    if (id === 'matsuri') {
      ctx.setTransform(1, 0, 0, 1, 0, 8);
      for (let x = 0; x < 60; x++) P(x, 1 + Math.round(Math.sin(x / 15 * Math.PI) * 2), '#2b1c12');
      [[8, '#c8412f'], [22, '#f3e6c8'], [36, '#3b6ea5'], [50, '#e0a13a']].forEach(([x, c]) => chochin(x, 2, 6, c, null));
    } else {
      const savedTime = time;
      d.draw(d.x, d.y, savedTime);
    }
    gRef = prev;
  }

  // ------------------------------------------------ 青海波 seigaiha pattern
  // Drawn on a canvas (rows painted top to bottom so each scale overlaps the
  // one above) in the restaurant's colour, then used as a tiling background.
  function renderSeigaiha() {
    const css = getComputedStyle(document.body);
    const bgc = (css.getPropertyValue('--paper') || '#f4ecdd').trim() || '#f4ecdd';
    const k = 2;
    const r = 10 * k;
    const tw = 2 * r;
    const th = r;
    // keep the lines visible: darken the colour on light themes, lighten on dark
    const lum = (hex) => { const [r0, g0, b0] = hexToRgb(hex); return (0.2126 * r0 + 0.7152 * g0 + 0.0722 * b0) / 255; };
    let bgLum = 0.9;
    try { if (/^#[0-9a-f]{3,8}$/i.test(bgc)) bgLum = lum(bgc); } catch (e) {}
    const stroke = bgLum > 0.5 ? shade(theme, -0.35) : shade(theme, 0.15);
    const cv = document.createElement('canvas');
    cv.width = tw;
    cv.height = th;
    const c = cv.getContext('2d');
    c.lineWidth = 1.3 * k;
    let row = 0;
    for (let y = -2 * r; y <= th + 2 * r; y += r / 2, row++) {
      const off = row % 2 ? r : 0;
      for (let x = off - 2 * r; x <= tw + 2 * r; x += 2 * r) {
        c.fillStyle = bgc;
        c.beginPath();
        c.arc(x, y, r, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = stroke;
        c.globalAlpha = 0.75;
        [0.93, 0.72, 0.51, 0.3].forEach((f) => {
          c.beginPath();
          c.arc(x, y, r * f, Math.PI, Math.PI * 2);
          c.stroke();
        });
        c.globalAlpha = 1;
      }
    }
    const root = document.documentElement.style;
    root.setProperty('--seigaiha', `url(${cv.toDataURL()})`);
    root.setProperty('--seigaiha-size', `${tw / k}px ${th / k}px`);
  }

  // ------------------------------------------------------------ tutorial
  const TOUR = [
    { jp: 'ようこそ', title: 'Welcome to your restaurant!', text: 'This little onigiri shop runs by itself. Watch it, or click around, since almost everything does something.' },
    { jp: '音', title: 'Sound on: highly recommended!', text: 'The kitchen is best with sound: soft koto music, wind chimes, your pet\'s little noises and celebration fanfares. It\'s on by default, and this speaker button mutes it any time.', dom: '#ok-b-sound' },
    { jp: 'お客さん', title: 'Guests come from studying', text: 'Every 10 reviews in a deck sends a guest from that deck. They wait outside the door until you visit, so nothing is lost if you study for a long time.', scene: () => ({ x: 254, y: 18, w: 48, h: 112 }) },
    { jp: '大将', title: 'The chef', text: () => (MENU_DISHES.book.length
      ? `Guests order from your menu: the ${MENU_DISHES.book.length} specials in your Onigiri Specials Book (it grows as you finish more). The chef cooks each order; tap him to make dishes ahead for the tray.`
      : 'Guests order onigiri from the menu on the wall, and more flavours unlock as your restaurant levels up. The chef cooks each order; tap him to make some ahead for the tray.'), scene: () => ({ x: 104, y: 72, w: 76, h: 34 }) },
    { jp: '文', title: 'Tips', text: 'Happy guests leave mon (文). Tap coins to collect them, or they collect themselves. Rarer dishes tip more. Spend mon in the shop.', dom: '.ok-purse' },
    { jp: '店', title: 'The shop', text: 'Spend mon on decor and pets: the starters you didn\'t pick and big milestone friends who move in, each with a perk. Some unlock at higher restaurant levels.', dom: '#ok-b-decor' },
    { jp: () => sp().jp, title: () => `${pet.name}, your ${sp().name.toLowerCase()}`, text: () => `A gentle virtual pet. ${They()} eats while you review, gets a ${sp().food} for every guest, and grows as you study. ${They()} can't get sick or run away. The Pet button opens ${sp().their} care card.`, scene: () => ({ x: tama.x - 14, y: 154, w: 28, h: 25 }), dom2: '#ok-b-pet' },
    { jp: 'タイマー', title: 'Pomodoro timer', text: 'Start a focus session and study. When the break starts, the restaurant opens for you. Each dango is one finished session. Rather skip the breaks? Tap ∞ for endless focus: it counts up, and every session still counts.', dom: '#ok-timer' },
    { jp: '大入り', title: 'Big study sessions', text: () => `Prefer to study in one go? Go ahead. When you come back, you can serve everyone at 4× speed or collect every tip at once.${conf.daily_card_goal === 0 ? '' : ` Reach ${conf.daily_card_goal || 100} cards in a day and your restaurant throws a little party (change the goal in ⚙).`}`, dom: '#ok-status' },
    { jp: '目安箱', title: 'Ideas & bugs', text: 'Use the suggestion box on the wall (or ⚙ settings) to suggest features or report bugs. You can replay this tour from ⚙.', scene: () => ({ x: MEYASU.x - 3, y: MEYASU.y - 5, w: MEYASU.w + 6, h: MEYASU.h + 7 }) },
  ];
  let tourIdx = -1;

  function sceneRect(rc) {
    const r = view.getBoundingClientRect();
    const sx = r.width / W;
    const sy = r.height / H;
    return { left: r.left + rc.x * sx, top: r.top + rc.y * sy, width: rc.w * sx, height: rc.h * sy };
  }

  function startTour() {
    document.querySelectorAll('.ok-panel').forEach((p) => { p.hidden = true; });
    $('ok-modal').hidden = true;
    $('ok-tour').hidden = false;
    tourGo(0);
  }

  function endTour() {
    tourIdx = -1;
    $('ok-tour').hidden = true;
    send('tutorial', 'done');
    S.tutorialDone = true;
  }

  function tourGo(i) {
    if (i < 0) return;
    if (i >= TOUR.length) { endTour(); OKSound.phraseUp(); return; }
    tourIdx = i;
    const step = TOUR[i];
    $('ok-tour-step').textContent = `${i + 1} / ${TOUR.length}`;
    const val = (v) => (typeof v === 'function' ? v() : v);
    $('ok-tour-jp').textContent = val(step.jp);
    $('ok-tour-title').textContent = val(step.title);
    $('ok-tour-text').textContent = val(step.text);
    $('ok-tour-back').disabled = i === 0;
    $('ok-tour-next').innerHTML = i === TOUR.length - 1 ? '始めよう<small>Let\'s start</small>' : '次へ<small>Next</small>';
    OKSound.pluck(2 + (i % 6));
    positionTour();
  }

  function positionTour() {
    if (tourIdx < 0) return;
    const step = TOUR[tourIdx];
    const spot = $('ok-tour-spot');
    const card = $('ok-tour-card');
    let rect = null;
    if (step.scene) rect = sceneRect(step.scene());
    else if (step.dom) {
      const el = document.querySelector(step.dom);
      if (el) rect = el.getBoundingClientRect();
    }
    const pad = 6;
    if (rect) {
      spot.style.left = rect.left - pad + 'px';
      spot.style.top = rect.top - pad + 'px';
      spot.style.width = rect.width + pad * 2 + 'px';
      spot.style.height = rect.height + pad * 2 + 'px';
      spot.classList.remove('none');
    } else {
      spot.style.left = window.innerWidth / 2 + 'px';
      spot.style.top = window.innerHeight / 2 + 'px';
      spot.style.width = '0px';
      spot.style.height = '0px';
      spot.classList.add('none');
    }
    // card: below the target if there's room, otherwise above; centred if no target
    const cw = card.offsetWidth;
    const ch = card.offsetHeight;
    let left;
    let top;
    if (!rect) {
      left = (window.innerWidth - cw) / 2;
      top = (window.innerHeight - ch) / 2;
    } else {
      left = rect.left + rect.width / 2 - cw / 2;
      top = rect.top + rect.height + pad + 12;
      if (top + ch > window.innerHeight - 12) top = rect.top - pad - 12 - ch;
      if (top < 12) top = Math.min(window.innerHeight - ch - 12, rect.top + rect.height + 12);
    }
    card.style.left = clamp(left, 12, window.innerWidth - cw - 12) + 'px';
    card.style.top = clamp(top, 12, window.innerHeight - ch - 12) + 'px';
  }
  setInterval(positionTour, 250);
  $('ok-tour-next').addEventListener('click', () => tourGo(tourIdx + 1));
  $('ok-tour-back').addEventListener('click', () => tourGo(tourIdx - 1));
  $('ok-tour-skip').addEventListener('click', endTour);

  // --------------------------------------------------- お品書き the menu
  // A washi-paper menu of everything the kitchen serves: today's special,
  // your Specials Book (rarest first) and the house onigiri.
  const RARITY_ORDER = ['legendary', 'epic', 'rare', 'uncommon', 'common'];
  function openOshinagaki() {
    OKSound.pluck(5);
    const el = $('ok-menu');
    const list = $('ok-menu-list');
    list.innerHTML = '';
    const entry = (d, note) => {
      const rar = RARITY[d.rarity] || RARITY.common;
      const row = document.createElement('div');
      row.className = 'ok-menu-item';
      const cv = document.createElement('canvas');
      cv.width = 11;
      cv.height = 9;
      const prev = gRef;
      gRef = cv.getContext('2d');
      drawDish(d, 1, 1);
      gRef = prev;
      row.appendChild(cv);
      // (always a tip cell, so the seals line up in a column)
      const tip = (d.from !== 'house' ? rar.bonus : 0) + (d.from === 'today' && todayDone() ? TODAY_DONE_BONUS : 0);
      const bonus = `<small class="ok-menu-tip">${tip ? `+${tip}文` : ''}</small>`;
      row.insertAdjacentHTML('beforeend',
        `<div class="ok-menu-name"><b>${esc(d.name)}</b>${d.desc ? `<span>${esc(d.desc)}</span>` : ''}${note ? `<em>${note}</em>` : ''}</div>` +
        (d.from === 'house' ? '<i class="ok-menu-seal house">定番</i>' : `<i class="ok-menu-seal" style="--seal:${rar.c}" title="${rar.name}">${rar.jp}</i>`) + bonus);
      list.appendChild(row);
    };
    const section = (jp, en) => list.insertAdjacentHTML('beforeend', `<div class="ok-menu-sec"><b>${jp}</b><span>${en}</span></div>`);
    const today = MENU_DISHES.today;
    if (today) {
      section('本日のおすすめ', "Today's special");
      const t = SPECIALS.today;
      entry(today, t.done ? `✓ Prepared in Onigiri today · golden guests tip +${TODAY_DONE_BONUS} more` : `${t.progress}/${t.target} cards in Onigiri · golden guests order it (finish it for +${TODAY_DONE_BONUS})`);
    }
    const book = MENU_DISHES.book.slice().sort((a, b) => RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity));
    if (book.length) {
      section('特製', `From your Specials Book · ${kanjiNum(book.length)}品 (${book.length})`);
      book.forEach((d) => entry(d));
    }
    section('定番', 'House onigiri');
    MENU_DISHES.house.forEach((d) => entry(d));
    const n = MENU_DISHES.book.length;
    $('ok-menu-count').textContent = n ? `${kanjiNum(n)}品` : '';
    $('ok-menu-count').title = `${n} specials`;
    el.hidden = false;
    list.scrollTop = 0;
  }
  $('ok-menu').addEventListener('click', (e) => { if (e.target === $('ok-menu') || e.target.closest('[data-close-menu]')) $('ok-menu').hidden = true; });

  // ------------------------------------------------- 相棒 starter chooser
  // First visit: pick a cat, a puffle (and its colour) or a Java sparrow.
  // The same card picks the free first colour for a puffle bought later.
  let chooser = null;
  function openChooser(mode, kind) {
    chooser = { mode, species: mode === 'color' ? kind || 'puffle' : 'cat', colors: { puffle: 'blue', bird: 'grey' } };
    const starter = mode !== 'color';
    $('ok-starter-kanji').textContent = starter ? '相棒' : '色';
    $('ok-starter-title').textContent = starter ? 'Choose your partner' : `Pick your ${colorKind(chooser.species).noun}'s colour`;
    $('ok-starter-text').textContent = starter
      ? 'Your pet lives in the restaurant and grows as you study. You can adopt the other two from the shop later.'
      : 'The first colour is free. More colours are in the shop.';
    const opts = $('ok-starter-opts');
    opts.hidden = !starter;
    opts.innerHTML = '';
    if (starter) {
      for (const id of ['cat', 'puffle', 'bird']) {
        const info = SPECIES[id] || {};
        const b = document.createElement('button');
        b.className = 'ok-starter-opt';
        b.dataset.species = id;
        b.innerHTML = `<canvas width="40" height="30"></canvas><b><span class="jp">${info.jp}</span> ${info.name}</b><small>${info.desc || ''}</small>`;
        b.onclick = () => { chooser.species = id; voice(id); renderChooser(); };
        opts.appendChild(b);
      }
    }
    $('ok-starter').hidden = false;
    renderChooser();
  }
  function renderChooser() {
    if (!chooser || $('ok-starter').hidden) return;
    const bounce = (tt) => Math.round(Math.abs(Math.sin(tt * 5)) * 3);
    document.querySelectorAll('.ok-starter-opt').forEach((b) => {
      const id = b.dataset.species;
      const on = chooser.species === id;
      b.classList.toggle('on', on);
      const cv = b.querySelector('canvas');
      const ctx = cv.getContext('2d');
      ctx.clearRect(0, 0, cv.width, cv.height);
      const prev = gRef;
      gRef = ctx;
      withPet({ species: id, stage: 1 }, () => {
        const up = on ? bounce(time) : 0;
        if (id === 'puffle') drawPuffle(20, 28 - up, { color: chooser.colors.puffle, happy: on, squash: on && up === 0 });
        else if (id === 'bird') drawBird(20, 28, 1, { color: chooser.colors.bird, hop: up, happy: on, wing: on && up > 1 ? 'up' : null });
        else catSit(20, 28 - up, { happy: on, fastTail: on });
      });
      gRef = prev;
    });
    // colour swatches for the puffle and the sparrow (starter colours are free)
    const cols = $('ok-starter-colors');
    const colored = chooser.species === 'puffle' || chooser.species === 'bird';
    cols.hidden = !colored;
    let label = (SPECIES[chooser.species] || {}).name || '';
    if (colored) {
      const ck = colorKind(chooser.species);
      if (cols.dataset.kind !== ck.kind) {
        cols.dataset.kind = ck.kind;
        cols.innerHTML = ck.list.filter((c) => c.starter).map((c) =>
          `<button class="ok-swatch" data-color="${c.id}" title="${c.jp} ${c.name}" style="background:${ck.swatch(c)}"></button>`).join('');
        cols.querySelectorAll('[data-color]').forEach((b) => b.addEventListener('click', () => { chooser.colors[ck.kind] = b.dataset.color; voice(ck.kind); renderChooser(); }));
      }
      cols.querySelectorAll('[data-color]').forEach((b) => b.classList.toggle('on', b.dataset.color === chooser.colors[ck.kind]));
      const c = ck.list.find((x) => x.id === chooser.colors[ck.kind]) || ck.list[0];
      label = chooser.mode === 'color' ? `${c.jp} ${c.name}` : `${c.name.toLowerCase()} ${ck.noun}`;
    }
    $('ok-starter-go').innerHTML = `この子にする<small>${chooser.mode === 'color' ? label : `Choose ${chooser.species === 'cat' ? 'cat' : label}`}</small>`;
  }
  setInterval(renderChooser, 100);
  $('ok-starter-go').addEventListener('click', () => {
    if (!chooser) return;
    const { mode, species } = chooser;
    const color = chooser.colors[species] || '';
    if (mode === 'color') {
      $('ok-starter').hidden = true;
      chooser = null;
      setPetColor(species, color);
      return;
    }
    send('choose', JSON.stringify({ species, color }), (res) => {
      if (!res || !res.pet) return;
      pet = res.pet;
      if (res.stages) PET_STAGES = res.stages;
      if (res.state) S = Object.assign(S, res.state);
      $('ok-starter').hidden = true;
      chooser = null;
      renderPetButton();
      // your new partner walks in from the door
      tama.x = DOOR_X;
      tama.dir = -1;
      if (pet.species === 'bird') tama.y = 70;
      tamaGo(150, () => {
        tamaSet('purr', 4);
        spawnHearts(150, 156, 3);
        voice();
        say(['よろしくね!', `${pet.name} the ${sp().name.toLowerCase()} moved in!`], { x: 150, y: 150 });
      });
      OKSound.fanfare();
      if (!S.tutorialDone) setTimeout(startTour, 2600);
    });
  });

  // --------------------------------------------------------------- modals
  function modal(kanji, title, body, buttons) {
    $('ok-card-kanji').textContent = kanji;
    $('ok-card-title').textContent = title;
    $('ok-card-body').innerHTML = body;
    const box = $('ok-card-btns');
    box.innerHTML = '';
    buttons.forEach(([label, cls, fn]) => {
      const b = document.createElement('button');
      b.className = cls;
      b.innerHTML = label;
      b.onclick = () => { $('ok-modal').hidden = true; if (fn) fn(); };
      box.appendChild(b);
    });
    $('ok-modal').hidden = false;
  }

  function breakWelcome(info) {
    const long = timer.longBreak || (info && info.long);
    const cards = info && info.cards != null ? info.cards : timer.focusCards;
    const waiting = S.guestsWaiting || 0;
    const mins = Math.round(remaining() / 60000);
    modal(
      long ? '祭り' : '休憩',
      long ? 'Festival night!' : 'Break time',
      `You studied <b>${cards || 0}</b> card${cards === 1 ? '' : 's'} that session.<br>` +
      (waiting ? `<b>${waiting}</b> guest${waiting === 1 ? ' is' : 's are'} waiting to be seated.` : 'The kitchen is warm and ready.') +
      (info && info.daruma ? `<br>達磨 Both eyes painted: <b>+${info.daruma}</b> mon!` : '') +
      `<br>Relax for about <b>${mins || 1}</b> minute${mins === 1 ? '' : 's'}.`,
      [['いただきます<small>&nbsp;Let\'s eat!</small>', 'ok-hanko ok-hanko-wide', () => OKSound.pluck(5)]]
    );
    if (OKSound.enabled) OKSound.phraseUp();
    if (long) { for (let i = 0; i < 3; i++) setTimeout(firework, i * 400); }
  }

  function breakOver() {
    modal(
      '再開',
      "Break's over",
      'Your guests will keep arriving while you study.<br>Every review sends someone your way. 頑張って! (You\'ve got this!)',
      [
        ['勉強<small>Back to studying</small>', 'ok-hanko ok-hanko-wide', () => send('study')],
        ['Stay a little', 'ok-ghost', null],
      ]
    );
    if (OKSound.enabled) OKSound.phraseDown();
  }

  // ------------------------------------------------------- 祭り little party
  // Reaching your daily card goal (⚙ settings) throws a small party: fireworks
  // across the room and in the window, lanterns on, pets cheering.
  let partyT = 0;
  let partyFire = 0;
  function roomFirework() {
    const x = rand(100, 300);
    const y = rand(18, 70);
    const col = pick(['#ffd27a', '#f07a8a', '#8fd0ff', '#b8f07a', '#ffffff', '#f2a9c0']);
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2;
      const sp = rand(14, 22);
      particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(0.9, 1.4), c: col, type: 'spark' });
    }
    if (OKSound.enabled) OKSound.koto(pick([146.8, 196, 220]), 0, 0.3);
  }
  function goalParty(goal) {
    partyT = 14;
    partyFire = 0;
    lanternsOn = true;
    OKSound.fanfare();
    say(['目標達成!', `Daily goal reached: ${goal} cards! Party time!`]);
    spawnHearts(tama.x, (tama.y == null ? FLOOR_Y : tama.y) - 20, 3);
    residents.forEach((a) => { if (!a.air) reactResident(a); });
    toast(`🎆 目標達成 · You reached your daily goal of ${goal} cards!`);
  }
  function updateParty(dt) {
    if (partyT <= 0) return;
    partyT -= dt;
    partyFire -= dt;
    if (partyFire <= 0) {
      partyFire = rand(0.35, 0.8);
      roomFirework();
      if (Math.random() < 0.5) firework();
    }
  }
  // New specials in your Book since your last visit: the chef announces them
  // and makes the first one for the tray, so a guest can try it.
  function newDishCheer(names) {
    const dishes = names.map((n) => MENU_DISHES.book.find((d) => d.name === n)).filter(Boolean);
    if (!dishes.length) return;
    const first = dishes[0];
    const list = dishes.length === 1 ? first.name
      : dishes.length === 2 ? `${dishes[0].name} and ${dishes[1].name}`
        : `${dishes.slice(0, 2).map((d) => d.name).join(', ')} and ${dishes.length - 2} more`;
    OKSound.fanfare();
    say(['新メニュー!', `New on the menu: ${list}!`]);
    toast(`新メニュー · ${dishes.length} new dish${dishes.length === 1 ? '' : 'es'} from your Onigiri Specials Book`);
    spawnHearts(121, 74, 2);
    if (chef.state === 'idle' && trayDishes.length < 6) {
      chef.state = 'make';
      chef.t = 0;
      chef.target = null;
      chef.dish = first;
    }
  }
  // Today's special is done in Onigiri: the chef cheers (once a day) and makes
  // it for the tray, for the next golden guest.
  function specialCheer() {
    const d = MENU_DISHES.today;
    if (!d) return;
    OKSound.fanfare();
    chef.lineT = 10;
    say(['本日の品、できました!', `${d.name}, fresh from Onigiri! Golden guests tip +${TODAY_DONE_BONUS} today.`]);
    spawnHearts(121, 74, 2);
    shake.menu4 = 0.4;
    if (chef.state === 'idle' && trayDishes.length < 6) {
      chef.state = 'make';
      chef.t = 0;
      chef.target = null;
      chef.dish = d;
    }
  }
  // Onigiri's restaurant levelled up since you were last here: the chef cheers.
  function levelUpCheer(lu) {
    const seatsThen = clamp(2 + Math.floor(lu.from / 5), 2, 5);
    const newSeat = seatCount > seatsThen;
    OKSound.fanfare();
    chef.lineT = 12;
    say(['おめでとう!', `Your restaurant reached level ${lu.to}!${newSeat ? ' A new seat opened up.' : ''}`]);
    for (let i = 0; i < 4; i++) setTimeout(roomFirework, 300 + i * 420);
    spawnHearts(121, 74, 3);
  }

  // "Focus started" only for the day's first session; after that the timer says it
  function focusStartToast() {
    const day = S.today.date || new Date().toDateString();
    try {
      if (localStorage.getItem('okFocusToast') === day) return;
      localStorage.setItem('okFocusToast', day);
    } catch (e) {}
    toast('集中 · Focus started. The kitchen will prep while you study.');
  }

  // ---------------------------------------------------------- python -> js
  window.OK = {
    onTimer(payload) {
      if (!payload) return;
      const prev = timer.phase;
      timer = payload.pomo || timer;
      if (typeof payload.endlessMode === 'boolean') INIT_TIMER_MODE.endless = payload.endlessMode;
      if (typeof payload.sound === 'boolean') { conf.sound = payload.sound; OKSound.configure(payload); renderSoundBtn(); }
      renderTimer();
      updateStatus();
      if (prev !== timer.phase && timer.phase === 'focus') focusStartToast();
    },
    onGuests(n) {
      S.guestsWaiting = n;
      updateStatus();
    },
    onFocusDone(info) {
      S.guestsWaiting = (S.guestsWaiting || 0) + (info && info.credited ? 1 : 0);
      if (info && info.credited) focusCredited(info);
      if (!$('ok-modal').hidden) return;
      breakWelcome(info);
    },
    // endless focus: a session's worth studied, credited quietly (no pop-up)
    onEndlessBlock(info) {
      S.guestsWaiting = (S.guestsWaiting || 0) + 1;
      focusCredited(info);
      updateStatus();
      renderTimer();
      OKSound.pluck(7);
    },
    onBreakDone() {
      breakOver();
    },
    onPet(p, grew) {
      if (!p) return;
      pet = p;
      renderPetPanel();
      if (grew) {
        OKSound.fanfare();
        spawnHearts(tama.x, 150, 4);
        toast(`🐾 ${pet.name} grew up! Now a ${pet.stageJp} ${pet.stageName}`);
      }
    },
    onGoal(goal) {
      goalParty(goal);
    },
    onReason(reason) {
      if (reason === 'break') breakWelcome();
    },
  };

  // ----------------------------------------------------------------- boot
  OKSound.configure({ sound: conf.sound !== false, volume: conf.volume != null ? conf.volume : 0.5 });
  paintBackground();
  syncResidents();
  renderPetButton();
  renderSeigaiha();
  renderHeader();
  renderTimer();
  renderSoundBtn();
  updateStatus();
  resize();
  window.addEventListener('resize', () => { resize(); positionBubble(); positionTour(); });
  // dev preview only: draw sprites onto a test canvas
  if (window.OK_DEBUG_HOOKS) {
    window.OKD = {
      tama, birdOuting, residents, bedtime, seats, MENU_DISHES, drawDish, drawDishMini, makeDish, openOshinagaki, specialTag, dharmaText,
      hitAt(x, y) { render(); const r = hit({ x, y }); return r && r.label; },
      step(n) { for (let i = 0; i < n; i++) update(1 / 30); },
      draw(ctx, fn) { const prev = gRef; gRef = ctx; try { fn({ drawBird, drawPuffle, catSit, withPet, ANIMAL_ART }); } finally { gRef = prev; } },
    };
  }
  if (window.OK_DEBUG_FF) for (let i = 0; i < window.OK_DEBUG_FF * 30; i++) update(1 / 30);
  requestAnimationFrame((t) => { last = t; requestAnimationFrame(frame); });

  setTimeout(() => {
    const t = INIT.takeout || {};
    if (t.count) toast(`Yesterday's ${t.count} waiting guest${t.count === 1 ? '' : 's'} took their food to go (+${t.mon} mon)`);
    if (!pet.species) { openChooser('starter'); return; }
    // good news on arrival, one after another
    const news = [];
    if (INIT.levelUp) news.push(() => levelUpCheer(INIT.levelUp));
    if ((INIT.newDishes || []).length) news.push(() => newDishCheer(INIT.newDishes));
    if (INIT.specialCheer) news.push(specialCheer);
    if (INIT.goalParty) news.push(() => goalParty(INIT.goalParty));
    news.forEach((fn, i) => setTimeout(fn, 250 + i * 3400));
    if (INIT.setBonusNow) { setBonusModal(500); return; }
    if (!S.tutorialDone && INIT.reason !== 'break') { startTour(); return; }
    const greeted = greetOnOpen();
    if (INIT.reason === 'break') breakWelcome();
    else if (!greeted) say(chefLine());
  }, 600);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
