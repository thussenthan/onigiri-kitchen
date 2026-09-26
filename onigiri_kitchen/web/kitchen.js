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
  let dispMon = S.mon;
  const theme = onigiri.themeColor || '#D49083';
  document.documentElement.style.setProperty('--theme', theme);
  let rush = false;

  const SEAT_X = [54, 132, 82, 160, 216];
  const seatCount = clamp(2 + Math.floor((onigiri.level || 0) / 5), 2, 5);
  const seats = SEAT_X.slice(0, seatCount).map((x) => ({ x, guest: null }));
  const DOOR_X = 277;

  let time = 0;
  let lanternsOn = true;
  let hover = null;
  let regions = [];
  let customers = [];
  let particles = [];
  let coins = [];
  let plates = [];
  let walkers = [];
  let orders = [];
  let tray = 0;
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

  // ------------------------------------------------------------ menu tags
  const MENU = [
    { jp: '鮭', en: 'Salmon', c: C.paper },
    { jp: '梅', en: 'Pickled plum', c: C.paper },
    { jp: '昆布', en: 'Kombu', c: C.paper },
    { jp: '鰹', en: 'Bonito flakes', c: C.paper },
    { jp: '本日', en: "Today's special", c: C.shu },
  ];
  function drawMenu() {
    R(102, 20, 66, 2, C.woodDk);
    MENU.forEach((m, i) => {
      const x = 104 + i * 13;
      const sw = shake['menu' + i] > 0 ? Math.round(Math.sin(shake['menu' + i] * 30) * 1) : 0;
      R(x + sw, 22, 10, 28, C.woodDk);
      R(x + 1 + sw, 23, 8, 26, m.c);
      R(x + 1 + sw, 48, 8, 1, shade(m.c, -0.15));
      const label = i === 4
        ? `<b>本日</b> Today's special\n${S.today.reviews || 0} cards reviewed today`
        : `<b>${m.jp}</b> ${m.en}\nClick to play a note ♪`;
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
  };

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
    return `<b>${item.jp}</b> ${item.name}\n${item.desc}`;
  }

  function drawWallDecor() {
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
    for (const id of ['maneki', 'kingyo']) {
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
      case 'radio': radioOn = !radioOn; OKSound.blip(); toast(radioOn ? '♪ Radio on: a little koto music' : 'Radio off'); break;
      case 'tanuki':
        OKSound.koto(98, 0, 0.35); OKSound.koto(98, 0.18, 0.35);
        spawnHearts(d.x + 8, d.y + 10, 1);
        break;
      case 'bonsai':
        particles.push({ x: d.x + rand(6, 18), y: d.y + 6, vx: rand(-4, 4), vy: 6, life: 1.4, c: '#6a9a4a', type: 'leaf' });
        OKSound.pop();
        break;
      case 'kakejiku': OKSound.pluck(2); toast('継続は力なり · Consistency is power'); break;
      default: break;
    }
  }
  function dharmaText() {
    const n = S.today.focus_done || 0;
    if (n >= 4) return '達磨: both eyes painted. Wish granted for today!';
    if (n >= 1) return '達磨: one eye painted. Finish 4 focus sessions to paint the other.';
    return '達磨: finish a focus session today to paint the first eye.';
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
    for (let i = 0; i < tray; i++) miniOnigiri(142 + i * 6, 96, FLAVORS[i % FLAVORS.length].c);
    regions.push({ x: 140, y: 94, w: 38, h: 10, label: `<b>お盆</b> Tray\n${tray} onigiri ready${tray ? ', guests get them straight away' : '. Tap the chef to make some'}`, click: () => chefClick() });
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
    R(shape.cx - hw - 1, band, hw * 2 + 3, 3, '#ffffff');
    R(shape.cx - hw - 1, band + 2, hw * 2 + 3, 1, '#e3dccd');
    R(shape.cx - 1, band, 3, 3, C.shu);
    R(shape.cx + hw + 1, band + 1, 3, 1, '#ffffff'); R(shape.cx + hw + 2, band + 2, 2, 2, '#ffffff');
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
      miniOnigiri(shape.cx - 2, 97 + p, chef.target ? chef.target.look.flavor.c : C.shu);
    }
    regions.push({ x, y: y - 1, w, h: 28, label: '<b>大将</b> Taishō, the head chef\nTap to make an onigiri for the tray', click: chefClick });
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
      if (tray >= 6) {
        say(['お盆がいっぱい!', "The tray's full!"]);
        OKSound.blip();
        return;
      }
      chef.state = 'make';
      chef.t = 0;
      chef.target = null;
      OKSound.pluck(4);
      if (Math.random() < 0.35) say(chefLine());
    } else {
      say(chefLine());
    }
  }

  // ----------------------------------------------------------------- Tama
  // The shop cat is a gentle virtual pet: needs come from Python (pet.py),
  // behaviour and drawing live here.
  let pet = Object.assign(
    { name: 'Tama', tummy: 60, love: 60, energy: 60, stage: 0, stageJp: '子猫', stageName: 'Kitten', trait: 'classic', fish: 0, gifts: {}, studyDays: 0 },
    INIT.pet || {}
  );
  const PET_STAGES = INIT.petStages || [];
  const PET_GIFTS = INIT.petGifts || [];
  const STAGE_SCALE = [0.72, 0.84, 1, 1.08];
  const FLOOR_Y = 174; // Tama's feet on the front strip of tatami
  const BED_X = 17;
  const BOWL_X = 38;
  const SUN_X = 64;
  const tama = { x: BED_X, dir: 1, state: 'sleep', t: 0, dur: rand(8, 16), target: null, then: null, hop: 0, paw: 0, blink: 2, wantsFish: false };
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
    // zabuton bed
    R(BED_X - 11, FLOOR_Y - 3, 23, 4, '#8e3b46');
    R(BED_X - 11, FLOOR_Y - 3, 23, 1, '#ad5561');
    P(BED_X - 11, FLOOR_Y - 3, '#6b2a33'); P(BED_X + 11, FLOOR_Y - 3, '#6b2a33');
    P(BED_X, FLOOR_Y - 2, '#e0a13a');
    // food bowl
    R(BOWL_X - 4, FLOOR_Y - 2, 9, 3, '#3b6ea5');
    R(BOWL_X - 3, FLOOR_Y - 2, 7, 1, '#dff2f7');
    R(BOWL_X - 4, FLOOR_Y - 2, 9, 1, '#5a8cc4');
    if (tama.state === 'eat') R(BOWL_X - 2, FLOOR_Y - 3, 5, 1, '#e8b8a0');
    regions.push({ x: BOWL_X - 5, y: FLOOR_Y - 5, w: 11, h: 7, label: `<b>ごはん皿</b> ${esc(pet.name)}'s food dish\n${pet.fish} fish saved · tap to feed`, click: () => petAction('feed') });
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
    if ((pet.stage || 0) >= 1) {
      const nx = hx - r(2.5) * dir;
      R(nx, hy, 1, r(3), C.shu);
      P(nx + dir, hy + r(3), C.gold);
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
    if ((pet.stage || 0) >= 1) {
      const cy = hy + r(3.6) + 1;
      R(cx - r(3), cy, r(6) + 1, 1, C.shu);
      P(cx, cy + 1, C.gold);
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

  function catSleep(cx, by) {
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
    if (Math.floor(time) % 3 === 0) {
      const zy = hy - 6 - (time % 1) * 5;
      R(hx + 5, zy, 3, 1, '#8b7b69'); P(hx + 6, zy + 1, '#8b7b69'); R(hx + 5, zy + 2, 3, 1, '#8b7b69');
    }
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

  function drawTama() {
    const x = Math.round(tama.x);
    const by = FLOOR_Y - Math.round(tama.hop);
    const st = tama.state;
    const walkFrame = Math.floor(time * 8) % 4;
    if (st === 'sleep') catSleep(x, by);
    else if (st === 'walk' || st === 'play-run') catSide(x, by, tama.dir, walkFrame);
    else if (st === 'stretch') catSide(x, by, tama.dir, 0, { low: true, happy: true });
    else if (st === 'eat') catSide(x, by, tama.dir, 0, { headDown: Math.floor(tama.t * 4) % 2 === 0 });
    else if (st === 'roll') catRoll(x, by);
    else {
      const groom = st === 'groom';
      const trick = st === 'trick';
      const pawUp = groom ? 2 + (Math.floor(tama.t * 4) % 2) : trick ? 2 + Math.round(Math.abs(Math.sin(tama.t * 8)) * 3) : 0;
      catSit(x, by, {
        happy: st === 'purr' || groom || trick,
        blink: tama.blink < 0.12,
        look: st === 'watch' ? -1 : st === 'beg' ? -1 : 0,
        fastTail: st === 'purr' || st === 'play-sit',
        paw: groom || trick ? (groom ? -1 : 1) : 0,
        pawUp,
      });
      if (st === 'beg' || tama.wantsFish) drawThought(x + 6, by - 26);
    }
    if (feather) drawFeather();
    regions.push({ x: x - 12, y: by - 20, w: 24, h: 21, label: tamaLabel(), click: () => petAction('pet') });
  }

  function drawThought(x, y) {
    R(x, y, 11, 7, C.ink); R(x + 1, y + 1, 9, 5, '#fffaf0');
    P(x + 1, y + 7, C.ink); P(x, y + 8, C.ink);
    // tiny fish
    R(x + 3, y + 3, 4, 1, '#6a9ac4'); R(x + 4, y + 2, 2, 3, '#6a9ac4'); P(x + 7, y + 2, '#6a9ac4'); P(x + 7, y + 4, '#6a9ac4'); P(x + 3, y + 3, C.ink);
  }

  function drawFeather() {
    const fx = Math.round(feather.x);
    const fy = Math.round(feather.y);
    line(fx, fy, fx + 8, fy - 14, '#8a5a34');
    R(fx - 1, fy, 3, 3, '#e8546a'); P(fx, fy + 3, '#f7c6d4'); P(fx - 2, fy + 1, '#f7c6d4'); P(fx + 2, fy + 2, '#3b6ea5');
  }

  function meterDots(v) {
    const n = Math.round(clamp(v, 0, 100) / 20);
    return '●'.repeat(n) + '○'.repeat(5 - n);
  }
  function tamaLabel() {
    const mood = tama.state === 'sleep' ? 'Sound asleep' : tama.state === 'play-run' || tama.state === 'play-sit' ? 'Playing!' : tama.wantsFish ? 'Hoping for a fish…' : 'Purring';
    return `<b>${esc(pet.name)}</b> · ${pet.stageJp} ${pet.stageName}\n${mood}. Tap to pet.\nお腹 ${meterDots(pet.tummy)}  愛情 ${meterDots(pet.love)}  元気 ${meterDots(pet.energy)}`;
  }

  // ------------------------------------------------------- Tama behaviour
  function tamaGo(x, then) {
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
    if (tama.wantsFish && Math.random() < 0.5) {
      tamaGo(BOWL_X + 12, () => { tama.dir = -1; tamaSet('beg', rand(6, 10)); if (Math.random() < 0.5) OKSound.meow(); });
      return;
    }
    if (sleepy && Math.random() < 0.75) {
      const spot = sunbeam() && Math.random() < 0.6 ? SUN_X : BED_X;
      tamaGo(spot, () => tamaSet('sleep', rand(30, 70)));
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
      tamaDecide();
    }
  }

  function tamaReact(kind) {
    if (tama.state === 'walk' || feather) return;
    if (kind === 'pet') { tamaSet('purr', 3.5); spawnHearts(tama.x, 158, 2); OKSound.meow(); }
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
      setTimeout(() => spawnHearts(tama.x, 156, 2), 800);
    }
  }

  function petAction(kind) {
    if (kind === 'play') { startPlay(); return; }
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
      toast('遊ぼう! Move your mouse to wave the feather toy');
      OKSound.pluck(7);
    });
  }
  function endPlay() {
    feather = null;
    tamaSet('sit', 3);
    spawnHearts(tama.x, 156, 2);
    OKSound.meow();
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
      OKSound.meow();
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
    if (gft.fortune) {
      modal(gft.fortune.jp, 'おみくじ · Fortune slip', `${esc(pet.name)} found a fortune for you:<br><b>${gft.fortune.text}</b>`, [['ありがとう<small>Thanks</small>', 'ok-hanko ok-hanko-wide', null]]);
    } else {
      toast(`${gft.jp} ${gft.name}: ${gft.desc}`);
    }
    renderPetPanel();
  }

  // ----------------------------------------------------------- pet panel
  function drawPortrait(canvas) {
    canvas.width = 30;
    canvas.height = 25;
    const ctx = canvas.getContext('2d');
    const prev = gRef;
    gRef = ctx;
    catSit(14, 23, { happy: true });
    gRef = prev;
  }

  function renderPetPanel() {
    const panel = $('ok-pet');
    if (!panel || panel.hidden) return;
    drawPortrait($('ok-pet-portrait'));
    $('ok-pet-name').textContent = pet.name;
    $('ok-pet-stage').textContent = `${pet.stageJp} ${pet.stageName}`;
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
    const ti = pet.traitInfo || { jp: '三毛', name: 'Classic calico', desc: '' };
    $('ok-pet-trait').innerHTML = `<b>${ti.jp}</b> ${ti.name} <span>${ti.desc}</span>`;
    const meters = [
      ['tummy', 'お腹', 'Tummy', pet.tummy, pet.tummy < 40 ? 'Peckish. Reviews and fish help.' : pet.tummy > 85 ? 'Full and happy.' : 'Content.'],
      ['love', '愛情', 'Love', pet.love, pet.love < 40 ? 'Would love some attention.' : pet.love > 85 ? 'Adores you.' : 'Fond of you.'],
      ['energy', '元気', 'Energy', pet.energy, pet.energy < 35 ? 'Sleepy. Focus sessions perk her up.' : pet.energy > 85 ? 'Bouncing off the walls.' : 'Lively.'],
    ];
    $('ok-pet-meters').innerHTML = meters.map(([id, jp, en, val, hint]) => {
      const n = Math.round(clamp(val, 0, 100) / 10);
      let segs = '';
      for (let i = 0; i < 10; i++) segs += `<i class="${i < n ? 'on' : ''}"></i>`;
      return `<div class="ok-meter ok-meter-${id}"><span class="ok-meter-label"><b class="jp">${jp}</b> ${en}</span><span class="ok-meter-bar">${segs}</span><span class="ok-meter-hint">${hint}</span></div>`;
    }).join('');
    $('ok-pet-fish').textContent = pet.fish;
    const trickBtn = document.querySelector('[data-pet="trick"]');
    const trickNames = ['', 'Paw wave', 'Beckon', 'Roll over'];
    trickBtn.querySelector('small').textContent = pet.stage >= 1 ? trickNames[Math.min(3, pet.stage)] : 'At 若猫';
    trickBtn.disabled = pet.stage < 1;
    // keepsake box
    const box = $('ok-pet-gifts');
    box.innerHTML = '';
    const found = PET_GIFTS.filter((gf) => pet.gifts && pet.gifts[gf.id]).length;
    $('ok-pet-giftcount').textContent = `${found} / ${PET_GIFTS.length}`;
    for (const gf of PET_GIFTS) {
      const count = (pet.gifts || {})[gf.id] || 0;
      const cell = document.createElement('div');
      cell.className = 'ok-gift' + (count ? '' : ' unknown');
      if (count) {
        const cv = document.createElement('canvas');
        cv.width = 7;
        cv.height = 7;
        drawGiftSprite(gf.id, 0, 0, cv.getContext('2d'));
        cell.appendChild(cv);
        cell.title = `${gf.jp} ${gf.name}: ${gf.desc}`;
        cell.insertAdjacentHTML('beforeend', `<span>${gf.jp}</span>${count > 1 ? `<em>×${count}</em>` : ''}`);
      } else {
        cell.innerHTML = '<b>?</b><span>???</span>';
        cell.title = 'Not found yet. A happy, well-fed cat brings gifts now and then.';
      }
      box.appendChild(cell);
    }
  }

  document.querySelectorAll('[data-pet]').forEach((b) => b.addEventListener('click', () => petAction(b.dataset.pet)));
  $('ok-b-pet').addEventListener('click', () => { togglePanel('ok-pet'); renderPetPanel(); });
  $('ok-pet-rename').addEventListener('click', () => {
    const wrap = $('ok-pet-namewrap');
    wrap.classList.add('editing');
    const input = $('ok-pet-nameinput');
    input.value = pet.name;
    input.focus();
    input.select();
  });
  $('ok-pet-nameform').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('ok-pet-nameinput').value.trim();
    $('ok-pet-namewrap').classList.remove('editing');
    if (!name || name === pet.name) return;
    send('petname', name, (p) => { if (p) { pet = p; renderPetPanel(); OKSound.meow(); } });
  });

  function greetOnOpen() {
    const away = INIT.petAway || 0;
    if (away < 3600) return false;
    tama.x = 262;
    tama.dir = -1;
    tamaGo(150, () => {
      tamaSet('purr', 4);
      spawnHearts(150, 156, 3);
      OKSound.meow();
      const days = Math.floor(away / 86400);
      say(['おかえり!', days >= 2 ? `Welcome back! ${pet.name} missed you.` : 'Welcome back!'], { x: 150, y: 150 });
    });
    return true;
  }

  // -------------------------------------------------------------- tables
  const TABLES = [[40, 56], [118, 56], [198, 36]];
  function drawTables() {
    for (const [tx, tw] of TABLES) {
      R(tx, 146, tw, 4, C.woodHi);
      R(tx, 146, tw, 1, C.woodTop);
      R(tx, 150, tw, 3, C.wood);
      R(tx + 3, 153, 3, 5, C.woodDk);
      R(tx + tw - 6, 153, 3, 5, C.woodDk);
      R(tx + 2, 158, tw - 4, 1, C.tatamiDk);
    }
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
    seat.guest = c;
    customers.push(c);
    norenSway = 1;
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

  function tipFor(c) {
    let amt = c.guest.kind === 'golden' ? 12 : c.guest.kind === 'leech' ? 6 : 3;
    if (c.guest.kind === 'golden' && has('tanuki')) amt *= 2;
    if (has('maneki')) amt += 1;
    return amt;
  }

  function payFor(c) {
    const amount = tipFor(c);
    coins.push({ x: c.x + 5, y: 143, amount, t: 0, fly: null });
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
    // a clearer 9x7 onigiri with its filling
    const ix = bx + 2;
    const iy = by + 2;
    const fc = c.guest.kind === 'leech' ? '#9a3b7a' : c.look.flavor.c;
    R(ix + 3, iy, 3, 1, C.riceSh);
    R(ix + 2, iy + 1, 5, 1, C.riceSh);
    R(ix + 1, iy + 2, 7, 2, C.riceSh);
    R(ix + 4, iy, 1, 1, C.outline);
    R(ix + 3, iy + 1, 3, 1, '#e8e0d0');
    R(ix + 3, iy + 1, 3, 2, fc);
    R(ix + 1, iy + 4, 7, 3, C.nori);
    R(ix + 3, iy + 4, 3, 3, C.noriHi);
  }

  function deckLeaf(deck) {
    if (!deck) return '';
    const parts = String(deck).split('::');
    return parts[parts.length - 1];
  }

  function guestLabel(c) {
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
      miniOnigiri(x, y, p.c.look.flavor.c);
    }
    for (const c of customers) {
      if (!c.plate) continue;
      const x = Math.round(c.x) - 4;
      R(x - 1, 147, 11, 1, '#ffffff');
      R(x, 148, 9, 1, '#d8d2c6');
      if (c.state === 'eat') {
        const left = 3 - Math.min(3, Math.floor(c.eaten / 2.5));
        if (left > 0) {
          const fx = x + 2;
          if (left >= 3) miniOnigiri(fx, 142, c.look.flavor.c);
          else if (left === 2) { R(fx, 144, 5, 1, C.rice); R(fx, 145, 5, 2, C.nori); P(fx + 2, 144, c.look.flavor.c); }
          else R(fx + 1, 145, 3, 2, C.nori);
        }
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
      const glows = STRING_LANTERNS.map((x) => [x, 12, 16]).concat([[245, 30, 26]]);
      if (has('matsuri')) FESTIVAL_LANTERNS.forEach(([x]) => glows.push([x, 10, 12]));
      for (const [x, y, r] of glows) {
        for (let k = 3; k >= 1; k--) {
          g.fillStyle = `rgba(255,160,70,${0.05 * d / 0.34})`;
          ellipseRaw(x, y, (r * k) / 3, (r * k) / 3.4);
        }
      }
      g.globalCompositeOperation = 'source-over';
    }
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
      v.fillStyle = i === 4 ? '#fff8ee' : '#2b2622';
      const chars = m.jp.split('');
      const step = chars.length > 1 ? 9 : 0;
      chars.forEach((ch, k) => v.fillText(ch, (x + sw) * s, (36 + (k - (chars.length - 1) / 2) * step) * s));
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
  function updateRadio(dt) {
    if (!radioOn || !has('radio')) return;
    radioTimer -= dt;
    if (radioTimer <= 0) {
      radioTimer = pick([0.45, 0.45, 0.9, 0.9, 1.35]);
      if (Math.random() < 0.8) {
        radioStep = clamp(radioStep + pick([-2, -1, -1, 1, 1, 2]), 0, 9);
        OKSound.pluck(radioStep);
        particles.push({ x: 226 + rand(-2, 2), y: 44, vx: rand(-3, 3), vy: -8, life: 1.3, c: '#f3e6c8', type: 'note' });
      }
      if (Math.random() < 0.25) OKSound.koto(OKSound.scaleNote(0) / 2, 0.05, 1.8);
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
        else { tray = Math.min(6, tray + 1); send('bump', 'onigiri_made'); OKSound.pop(); }
        chef.target = null;
      }
    } else if (orders.length) {
      const c = orders.shift();
      if (c && c.state === 'wait') {
        if (tray > 0) { tray--; launchPlate(c); }
        else { chef.state = 'make'; chef.t = 0; chef.target = c; }
      }
    }
    chef.lineT -= dt;
    if (chef.lineT < 0) { chef.lineT = rand(40, 80); if (!bubbleVisible()) say(chefLine()); }

    // Tama
    updateTama(dt);
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
      walkers.push({ x: dir > 0 ? -6 : WIN.w - 2, dir, p: Math.random() * 10, c: pick(['#efe6d4', '#e8d4b0', '#f6d7c8']), u: pick(['#c8412f', '#3b6ea5', '#e0a13a']) });
    }
    walkers.forEach((wk) => { wk.x += wk.dir * dt * 9; });
    walkers = walkers.filter((wk) => wk.x > -8 && wk.x < WIN.w + 2);

    windTimer -= dt;
    if (windTimer <= 0) {
      windTimer = rand(25, 50);
      if (has('furin')) { shake.furin = 1; OKSound.chime(); }
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
  }

  function render() {
    regions = [];
    const h = hourNow();
    lanternsAuto();
    const lit = lanternsOn && darkness(h) > 0.05;
    g.drawImage(bg, 0, 0);
    drawWindow(h);
    drawSparrow();
    drawMenu();
    drawWallDecor();
    drawMeyasubako();
    drawDoor(h);
    drawLanterns(lit);
    drawChef();
    drawCounter();
    drawCounterDecor();
    drawFloorDecor();
    customers.slice().sort((a, b) => a.y - b.y).forEach(drawCustomer);
    drawTables();
    drawPlates();
    drawCoins();
    drawTamaFloor();
    drawFloorGifts();
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

  let lanternAutoState = null;
  function lanternsAuto() {
    // Lanterns switch themselves on at dusk (unless the user toggled them).
    const on = darkness(hourNow()) > 0.05;
    if (lanternAutoState !== on) {
      lanternAutoState = on;
      if (on) lanternsOn = true;
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
    el.style.left = (r.left - stage.left + (bubbleAnchor.x / W) * r.width) + 'px';
    el.style.top = (r.top - stage.top + (bubbleAnchor.y / H) * r.height) + 'px';
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
    if (timer.phase === 'focus') {
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
    b.innerHTML = rush ? '<span class="jp">急</span> 4× on' : '<span class="jp">急</span> Serve faster';
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
      modal('完売', 'Sold out!',
        `Served <b>${count}</b> guest${count === 1 ? '' : 's'}${extras.length ? ' (' + extras.join(', ') + ')' : ''}` +
        `${deckCount ? ` from <b>${deckCount}</b> deck${deckCount === 1 ? '' : 's'}` : ''}.<br>` +
        `Tips: <b>+${res.mon} mon</b> · ${esc(pet.name)} got <b>${Math.min(count, 20)}</b> fish saved.`,
        [['やった!<small>Nice</small>', 'ok-hanko ok-hanko-wide', null]]);
    });
  }

  // After a big study session: choose how to catch up.
  function maybeCatchUp() {
    const waiting = S.guestsWaiting || 0;
    if (waiting < 6 || !$('ok-modal').hidden) return false;
    modal('大入り', `Full house! ${waiting} guests are waiting`,
      'Great study session! Nothing was lost. How would you like to catch up?',
      [
        ['<span class="jp">急</span> Serve everyone at 4×', 'ok-hanko', startRush],
        ['<span class="jp">文</span> Collect all tips now', 'ok-foot-btn', serveAll],
        ['At my own pace', 'ok-ghost', null],
      ]);
    return true;
  }

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
      : 'Install Onigiri to link your restaurant level';
    $('ok-mon').textContent = dispMon;
  }

  // -------------------------------------------------------------- timer UI
  function fmt(ms) {
    const s = Math.max(0, Math.round(ms / 1000));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
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
    if (timer.phase === 'focus') {
      phase.textContent = '集中 · Focus' + (timer.cardGoal ? ` · ${timer.focusCards}/${timer.cardGoal}` : '');
      clock.textContent = fmt(remaining());
    } else if (timer.phase === 'break') {
      phase.textContent = timer.longBreak ? '祭り · Long break' : '休憩 · Break';
      clock.textContent = fmt(remaining());
    } else {
      phase.textContent = '待機 · Ready';
      clock.textContent = fmt((conf.focus_minutes || 25) * 60000);
    }
    if (timer.phase === 'idle') main.innerHTML = '開始<small>Start</small>';
    else if (timer.paused) main.innerHTML = '再開<small>Resume</small>';
    else main.innerHTML = '一時停止<small>Pause</small>';
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
  $('ok-t-skip').addEventListener('click', () => {
    send('timer', 'skip', (r) => r && OK.onTimer(r));
  });
  $('ok-t-set').addEventListener('click', () => togglePanel('ok-settings'));
  $('ok-report').addEventListener('click', () => send('report'));
  $('ok-idea').addEventListener('click', () => send('idea'));
  $('ok-tour-replay').addEventListener('click', () => { $('ok-settings').hidden = true; startTour(); });
  $('ok-b-rush').addEventListener('click', () => {
    if (rush) { rush = false; renderRushBtn(); updateStatus(); } else startRush();
  });
  $('ok-version').textContent = INIT.version ? 'v' + INIT.version : '';
  $('ok-t-reset').addEventListener('click', () => {
    send('timer', 'reset', (r) => r && OK.onTimer(r));
    toast('Cycle reset');
  });

  function togglePanel(id) {
    const el = $(id);
    const show = el.hidden;
    document.querySelectorAll('.ok-panel').forEach((p) => { p.hidden = true; });
    el.hidden = !show;
    if (show && id === 'ok-settings') fillForm();
    if (show && id === 'ok-decor') renderDecor();
  }
  document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => { $(b.dataset.close).hidden = true; }));
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
    $('ok-sound-label').textContent = conf.sound ? 'Sound on' : 'Sound off';
    $('ok-b-sound').classList.toggle('off', !conf.sound);
  }
  $('ok-b-decor').addEventListener('click', () => togglePanel('ok-decor'));

  // ----------------------------------------------------------------- decor
  const MON_SVG = document.querySelector('.ok-mon-icon').outerHTML;
  function renderDecor() {
    const grid = $('ok-decor-grid');
    grid.innerHTML = '';
    const level = onigiri.level || 0;
    for (const item of catalog) {
      const owned = S.owned.includes(item.id);
      const locked = !owned && level < item.level;
      const card = document.createElement('div');
      card.className = 'ok-item' + (locked ? ' locked' : '');
      const icon = document.createElement('canvas');
      drawIcon(icon, item.id);
      card.appendChild(icon);
      const body = document.createElement('div');
      body.innerHTML =
        `<div class="ok-item-name"><span class="jp">${item.jp}</span><span>${item.name}</span></div>` +
        `<p>${item.desc}</p>`;
      card.appendChild(body);
      const foot = document.createElement('div');
      foot.className = 'ok-item-foot';
      if (owned) {
        const shown = !S.hidden.includes(item.id);
        foot.innerHTML = `<span class="ok-lock">${shown ? '✓ On display' : 'In storage'}</span>`;
        const b = document.createElement('button');
        b.className = 'ok-owned';
        b.textContent = shown ? 'Hide' : 'Show';
        b.onclick = () => send('toggle', item.id, (snap) => { if (snap) S = Object.assign(S, snap); renderDecor(); });
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

  function drawIcon(canvas, id) {
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
      [[8, '#c8412f'], [22, '#f3e6c8'], [36, '#3b6ea5'], [50, '#e0a13a']].forEach(([x, c]) => chochin(x, 2, 6, c, false));
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
    { jp: 'お客さん', title: 'Guests come from studying', text: 'Every 10 reviews in a deck sends a guest from that deck. They wait outside the door until you visit, so nothing is lost if you study for a long time.', scene: () => ({ x: 254, y: 18, w: 48, h: 112 }) },
    { jp: '大将', title: 'The chef', text: 'Guests are served automatically. Tap the chef to prep onigiri for the tray so guests are served straight away.', scene: () => ({ x: 104, y: 72, w: 76, h: 34 }) },
    { jp: '文', title: 'Tips', text: 'Happy guests leave mon (文). Tap coins to collect them, or they collect themselves. Spend mon on decor.', dom: '.ok-purse' },
    { jp: '飾り', title: 'Decor', text: 'Buy decorations with your mon. Some pieces unlock at higher Onigiri restaurant levels.', dom: '#ok-b-decor' },
    { jp: 'タマ', title: 'Tama, the shop cat', text: 'A gentle virtual pet. She eats scraps while you review, gets a fish for every guest, and grows as you study. She can\'t get sick or run away.', scene: () => ({ x: tama.x - 14, y: 154, w: 28, h: 25 }), dom2: '#ok-b-pet' },
    { jp: 'タイマー', title: 'Pomodoro timer', text: 'Start a focus session and study. When the break starts, the restaurant opens for you. Each dango is one finished session.', dom: '#ok-timer' },
    { jp: '大入り', title: 'Big study sessions', text: 'Prefer to study in one go? Go ahead. When you come back, you can serve everyone at 4× speed or collect every tip at once.', dom: '#ok-status' },
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
    setTimeout(maybeCatchUp, 400);
  }

  function tourGo(i) {
    if (i < 0) return;
    if (i >= TOUR.length) { endTour(); OKSound.phraseUp(); return; }
    tourIdx = i;
    const step = TOUR[i];
    $('ok-tour-step').textContent = `${i + 1} / ${TOUR.length}`;
    $('ok-tour-jp').textContent = step.jp;
    $('ok-tour-title').textContent = step.title;
    $('ok-tour-text').textContent = step.text;
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
      `<br>Relax for about <b>${mins || 1}</b> minute${mins === 1 ? '' : 's'}.`,
      [['いただきます<small>&nbsp;Let\'s eat!</small>', 'ok-hanko ok-hanko-wide', () => { OKSound.pluck(5); setTimeout(maybeCatchUp, 300); }]]
    );
    if (OKSound.enabled) OKSound.phraseUp();
    if (long) { for (let i = 0; i < 3; i++) setTimeout(firework, i * 400); }
  }

  function breakOver() {
    modal(
      '再開',
      "Break's over",
      'Your guests will keep arriving while you study.<br>Every review sends someone your way. 頑張って!',
      [
        ['勉強<small>Back to studying</small>', 'ok-hanko ok-hanko-wide', () => send('study')],
        ['Stay a little', 'ok-ghost', null],
      ]
    );
    if (OKSound.enabled) OKSound.phraseDown();
  }

  // ---------------------------------------------------------- python -> js
  window.OK = {
    onTimer(payload) {
      if (!payload) return;
      const prev = timer.phase;
      timer = payload.pomo || timer;
      if (typeof payload.sound === 'boolean') { conf.sound = payload.sound; OKSound.configure(payload); renderSoundBtn(); }
      renderTimer();
      updateStatus();
      if (prev !== timer.phase && timer.phase === 'focus') toast('集中 · Focus started. The kitchen will prep while you study.');
    },
    onGuests(n) {
      S.guestsWaiting = n;
      updateStatus();
    },
    onFocusDone(info) {
      S.guestsWaiting = (S.guestsWaiting || 0) + (info && info.credited ? 1 : 0);
      if (!$('ok-modal').hidden) return;
      breakWelcome(info);
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
    onReason(reason) {
      if (reason === 'break') breakWelcome();
    },
  };

  // ----------------------------------------------------------------- boot
  OKSound.configure({ sound: conf.sound !== false, volume: conf.volume != null ? conf.volume : 0.5 });
  paintBackground();
  renderSeigaiha();
  renderHeader();
  renderTimer();
  renderSoundBtn();
  updateStatus();
  resize();
  window.addEventListener('resize', () => { resize(); positionBubble(); positionTour(); });
  if (window.OK_DEBUG_FF) for (let i = 0; i < window.OK_DEBUG_FF * 30; i++) update(1 / 30);
  requestAnimationFrame((t) => { last = t; requestAnimationFrame(frame); });

  setTimeout(() => {
    const t = INIT.takeout || {};
    if (t.count) toast(`Yesterday's ${t.count} waiting guest${t.count === 1 ? '' : 's'} took their food to go (+${t.mon} mon)`);
    if (!S.tutorialDone && INIT.reason !== 'break') { startTour(); return; }
    const greeted = greetOnOpen();
    if (INIT.reason === 'break') breakWelcome();
    else if (!maybeCatchUp() && !greeted) say(chefLine());
  }, 600);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
