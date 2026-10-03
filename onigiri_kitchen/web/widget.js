/* Onigiri Kitchen - home-screen widget (Onigiri grid, or plain Anki's main
   screen). A tiny live pixel scene plus status and quick actions. */
(function () {
  if (window.OKWidget) return;

  const W = 64;
  const H = 40;

  function send(cmd, cb) {
    if (typeof pycmd === 'function') pycmd('okitchen:' + cmd, cb);
  }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }
  function shade(hex, amt) {
    let h = String(hex || '#d49083').replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h.slice(0, 6), 16);
    const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => (amt >= 0 ? v + (255 - v) * amt : v * (1 + amt)));
    return '#' + ch.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  }

  function mood(p) {
    if (!p) return '';
    if (p.energy < 35) return 'sleepy';
    if (p.tummy < 40) return 'hungry';
    if (p.love > 80) return 'adores you';
    return 'content';
  }

  // ------------------------------------------------------------- scene
  // The scene is 40px tall; the canvas width follows the widget's shape so
  // the scene fills any size (more wall on wide widgets) without cropping.
  // Tall, narrow widgets get a taller canvas instead (more wall above), so
  // pixels stay square.
  function fitCanvas(canvas) {
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const want = Math.max(40, Math.min(200, Math.round((H * r.width) / r.height)));
    const tall = Math.max(H, Math.round((want * r.height) / r.width));
    if (canvas.width !== want) canvas.width = want;
    if (canvas.height !== tall) canvas.height = tall;
    // narrow widgets lay their text over the scene (see widget.css)
    canvas.okwOverlay = getComputedStyle(canvas).position === 'absolute';
  }

  function drawScene(ctx, d, time) {
    const W = ctx.canvas.width;
    const off = ctx.canvas.height - H; // extra wall above the scene on tall widgets
    ctx.setTransform(1, 0, 0, 1, 0, off);
    const R = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); };
    const hour = new Date().getHours() + new Date().getMinutes() / 60;
    const night = hour < 6 || hour >= 19.5;
    const theme = d.theme || '#d49083';

    // wall & floor
    for (let x = 0; x < W; x += 8) {
      R(x, -off, 8, 29 + off, (x / 8) % 2 ? '#7f5230' : '#865733');
      R(x, -off, 1, 29 + off, '#5e3c22');
    }
    R(0, -off, W, 2, '#3e2717');
    R(0, 29, W, 11, '#cdbb7e');
    R(0, 29, W, 1, '#3e2717');
    for (let y = 31; y < H; y += 2) R(0, y, W, 1, '#c1ae70');

    // doorway with the noren in the kitchen's colour
    const dx = W >= 64 ? W - 26 : Math.max(2, W - 21);
    R(dx - 2, 5, 22, 2, '#3e2717');
    R(dx - 2, 7, 2, 22, '#3e2717');
    R(dx + 18, 7, 2, 22, '#3e2717');
    R(dx, 7, 18, 22, night ? '#262a44' : '#f3e3c0');
    R(dx, 24, 18, 5, night ? '#3a3440' : '#b8a88e');
    // guests waiting (up to 3 peeking in)
    const waiting = Math.min(3, d.guests || 0);
    for (let i = 0; i < waiting; i++) {
      const gx = dx + 2 + i * 5;
      const gy = 20 - (Math.floor(time * 2 + i) % 2);
      R(gx + 1, gy, 1, 1, '#fbf7ee');
      R(gx, gy + 1, 3, 1, '#fbf7ee');
      R(gx - 1 + 1, gy + 2, 3, 1, '#fbf7ee');
      R(gx, gy + 3, 3, 2, '#2f4a3c');
    }
    const sway = Math.round(Math.sin(time * 2) * 0.6);
    for (let p = 0; p < 3; p++) R(dx + 1 + p * 6 + (p === 1 ? sway : 0), 7, 5, 8, theme);
    R(dx, 7, 18, 1, shade(theme, -0.3));
    R(dx + 8, 10, 2, 2, '#fbf7ee');

    // red lantern
    const lit = night;
    const lx = dx - 7;
    R(lx + 2, 4, 1, 3, '#2b1c12');
    R(lx, 7, 5, 7, lit ? '#e0604b' : '#c8412f');
    R(lx + 1, 6, 3, 1, '#3e2717');
    R(lx + 1, 14, 3, 1, '#3e2717');
    if (lit) {
      ctx.fillStyle = 'rgba(255,170,80,0.18)';
      ctx.beginPath();
      ctx.arc(lx + 2.5, 10.5, 9, 0, Math.PI * 2);
      ctx.fill();
    }
    // wide widgets get a window with the sky
    if (W >= 84) {
      const wx = 4;
      R(wx, 6, 18, 14, '#3e2717');
      R(wx + 1, 7, 16, 12, night ? '#1b2044' : '#9fd0ea');
      if (!night) R(wx + 3, 13, 12, 6, '#6a6fa8');
      if (!night) R(wx + 7, 11, 4, 2, '#fbfbff');
      if (night) R(wx + 12, 9, 2, 2, '#f7efd0');
      R(wx + 9, 7, 1, 12, '#5a3a22');
    }

    // Tama (and any other pets you have, standing beside)
    const p = d.pet || {};
    const phase = (d.timer && d.timer.pomo && d.timer.pomo.phase) || 'idle';
    const sleepy = p.energy < 35 || phase === 'focus' || hour >= 23.5 || hour < 5.5;
    // the pet stands on the right when text covers the left of the scene
    const tx = ctx.canvas.okwOverlay ? W - (W > 50 ? 9 : 6) : W >= 84 ? Math.round(W * 0.42) : Math.min(14, dx - 10);

    // one pet of any species, centred on x (bottom row 37)
    const drawPet = (species, x, phase0) => {
      if (species === 'puffle') {
        // a tiny puffle: spiky outline, one white eye patch, a smile
        const c = d.puffleColor || '#3d7fd6';
        const o = shade(c, -0.62);
        const rows = sleepy
          ? ['...o.o.o...', '..ofofofo..', '.offfffffo.', 'offfffffffo', 'offoofoofo.', 'offfffffffo', 'offffmmfffo', '.offfffffo.', '..ooooooo..']
          : ['...o.o.o...', '..ofofofo..', '.offfffffo.', 'offwwwwwffo', 'offwkwkwffo', 'offwwwwwffo', 'offffmmfffo', '.offfffffo.', '..ooooooo..'];
        const pal = { o, f: c, w: '#ffffff', k: '#2a2320', m: o };
        const up = sleepy ? 0 : Math.round(Math.abs(Math.sin(time * 4 + phase0)) * 2);
        rows.forEach((row, j) => {
          for (let i = 0; i < row.length; i++) if (pal[row[i]]) R(x - 5 + i, 37 - rows.length + j - up, 1, 1, pal[row[i]]);
        });
      } else if (species === 'bird') {
        // a tiny Java sparrow in its colour: outline, cap, white cheek, pink beak
        const pal = {
          grey: ['#8f949f', '#1e1d23', '#232128'], white: ['#f6f3ec', '#f6f3ec', '#8e877c'], sakura: ['#8f949f', '#1e1d23', '#232128'],
          cinnamon: ['#c9a58a', '#6b4a38', '#4a3326'], silver: ['#b8bfcc', '#565c69', '#3a3f49'], cream: ['#ecdfc8', '#b69c7b', '#7a6650'],
        }[d.birdColor] || ['#8f949f', '#1e1d23', '#232128'];
        const [body, cap, line] = pal;
        const hop = sleepy ? 0 : Math.floor(time * 3 + phase0) % 4 === 0 ? 1 : 0;
        const rows = ['...LLLL..', '..LccccL.', '.LLcwwepL', 'LbbLwwwLp', 'LbbbbbbL.', '.LbbbbL..', '..LLLL...'];
        const map = { L: line, c: cap, w: sleepy ? cap : '#ffffff', e: sleepy ? cap : '#2a2320', p: '#f05a6e', b: body };
        rows.forEach((row, j) => {
          for (let i = 0; i < row.length; i++) if (map[row[i]]) R(x - 4 + i, 37 - rows.length + j - hop, 1, 1, map[row[i]]);
        });
        R(x - 1, 37 - hop, 1, 1, '#eea5ad'); R(x + 1, 37 - hop, 1, 1, '#eea5ad');
      } else if (sleepy) {
        R(x - 5, 33, 11, 4, '#fbf7ee');
        R(x - 4, 33, 3, 2, '#e0a13a');
        R(x + 2, 34, 3, 2, '#3b3030');
        R(x + 4, 31, 4, 3, '#fbf7ee');
        R(x + 4, 30, 1, 1, '#fbf7ee');
        R(x + 7, 30, 1, 1, '#fbf7ee');
        R(x - 6, 36, 5, 1, '#3b3030');
      } else {
        const tail = Math.round(Math.sin(time * 3 + phase0));
        R(x - 3, 31, 7, 6, '#fbf7ee');
        R(x - 3, 33, 3, 3, '#e0a13a');
        R(x - 3, 26, 7, 5, '#fbf7ee');
        R(x - 3, 25, 1, 1, '#fbf7ee');
        R(x + 3, 25, 1, 1, '#3b3030');
        R(x - 2, 28, 1, 1, '#2a2320');
        R(x + 2, 28, 1, 1, '#2a2320');
        R(x, 29, 1, 1, '#f3aaa0');
        if ((p.stage || 0) >= 1) R(x - 2, 31, 5, 1, '#c8412f');
        R(x + 4, 33 + tail, 1, 3, '#3b3030');
      }
    };
    if (p.species) {
      // the rest of your pets keep it company, to the side with room
      (d.companions || []).forEach((sp0, i) => {
        const step = 12 * (i + 1);
        const x = tx - step >= 7 ? tx - step : tx + step;
        if (x > 5 && x < W - 5) drawPet(sp0, x, 1.7 * (i + 1));
      });
      drawPet(p.species, tx, 0);
    }

    // z Z Z rising one after another while the pet naps (like in the kitchen);
    // up to the left when there's no room on the right
    if (p.species && sleepy && time % 3 < 2.4) {
      const c = time % 3;
      const zc = '#d8c8ab';
      ctx.globalAlpha = 0.5; // faint, so they don't draw the eye
      // start just past the pet's head (its right edge and top differ by
      // species) and rise up and to the right; up-left when there's no room
      const edge = p.species === 'cat' ? 8 : p.species === 'bird' ? 4 : 5;
      const top = p.species === 'puffle' ? 28 : 30;
      const right = tx + edge + 2 + 17 <= W;
      // 5x5 (the smallest that reads as a Z), a pixel apart, rising gently
      for (let k = 0; k < 3; k++) {
        if (c < k * 0.6) continue;
        const zx = right ? tx + edge + 2 + k * 6 : tx - edge - 7 - k * 6;
        const zy = top - 5 - k * 4;
        R(zx, zy, 5, 1, zc);
        for (let j = 1; j <= 3; j++) R(zx + 4 - j, zy + j, 1, 1, zc);
        R(zx, zy + 4, 5, 1, zc);
      }
      ctx.globalAlpha = 1;
    }
    if (night) {
      ctx.fillStyle = 'rgba(22,14,40,0.22)';
      ctx.fillRect(0, -off, W, H + off);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  // -------------------------------------------------------------- info
  function renderInfo(el, d) {
    const info = el.querySelector('.okw-info');
    const big = d.flash
      ? esc(d.flash)
      : d.guests > 0
        ? `<b>${d.guests}</b> guest${d.guests === 1 ? '' : 's'} waiting`
        : `Next guest in <b>${d.nextIn}</b> review${d.nextIn === 1 ? '' : 's'}`;
    const p = d.pet || {};
    // Onigiri already shows today's count, so the widget shows all-time stats
    // from Anki's review log (the timer lives in the corner chip).
    const st = d.stats || {};
    const num = (n) => (n >= 100000 ? Math.round(n / 1000) + 'k' : Number(n || 0).toLocaleString());
    // short forms for narrow widgets, so all four stats always fit
    const short = (n) => (n >= 10000 ? Math.round(n / 1000) + 'k' : n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : String(n || 0));
    // hours in one short unit: 18h, 3d, 1.3w, 2.1mo, 1.2y
    const span = (h) => {
      const one = (v) => (v >= 10 ? Math.round(v) : Math.round(v * 10) / 10);
      if (h < 24) return `${one(h)}h`;
      if (h < 24 * 7) return `${one(h / 24)}d`;
      if (h < 24 * 30.44) return `${one(h / 168)}w`;
      if (h < 24 * 365.25) return `${one(h / 730.5)}mo`;
      return `${one(h / 8766)}y`;
    };
    const two = (l, sh) => `<span class="okw-l">${l}</span><span class="okw-s">${sh}</span>`;
    const stat = (v, vs, label, ls, tip) => `<span class="okw-stat" title="${tip}"><b>${two(v, vs)}</b><small>${two(label, ls)}</small></span>`;
    // how long what's still due will take at your pace (the one thing about
    // today that Onigiri doesn't already show)
    const t = d.studyToday;
    const mins = (secs) => { const m = Math.round(secs / 60); return m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}` : `${m}m`; };
    const due = t && t.due ? t.due.total : 0;
    const leftTip = t ? (due ? `About ${mins(t.estimateSeconds)} left: ${due} cards due (${t.due.new} new, ${t.due.learn} learning, ${t.due.review} review), at your own pace` : 'Nothing due right now') : '';
    const left = t ? stat(due ? `~${mins(t.estimateSeconds)}` : 'done', due ? `~${mins(t.estimateSeconds)}` : 'done', due ? 'left' : 'all due', due ? 'left' : 'due', esc(leftTip)).replace('okw-stat"', 'okw-stat okw-stat-big"') : '';
    const allTip = st.hours != null ? `\nAll time: ${Number(st.total || 0).toLocaleString()} reviews in ${st.hours} hours.` : '';
    el.title = `Open Onigiri Kitchen${leftTip ? `\n${leftTip}.` : ''}${allTip}`;
    const stats = d.stats
      ? stat(num(st.total), short(st.total), 'reviews', 'reviews', `${Number(st.total || 0).toLocaleString()} reviews all time`) +
        stat(num(st.average), short(st.average), 'per day', '/day', 'Average reviews on the days you studied') +
        stat(num(st.days), short(st.days), st.days === 1 ? 'day' : 'days', st.days === 1 ? 'day' : 'days', 'Days studied (with at least one review)') +
        stat(`${st.bestStreak || 0}d`, `${st.bestStreak || 0}d`, 'best streak', 'best streak', 'Your longest-ever streak: the most days in a row you have reviewed') +
        (st.hours != null ? stat(span(st.hours), span(st.hours), 'studied', 'studied', `${st.hours} hours of reviewing, all time (as timed by Anki)`) : '') +
        left
      : '';
    info.innerHTML =
      `<div class="okw-top"><span class="okw-jp">食堂</span>Onigiri Kitchen</div>` +
      `<div class="okw-big">${big}</div>` +
      `<div class="okw-sub"><span title="${d.mon} mon (文): tips from your guests">文 ${d.mon}</span>${p.species ? `<span>🐾 ${esc(p.name || 'Tama')} · ${mood(p)}</span>` : ''}</div>` +
      `<div class="okw-row${d.guests > 0 ? ' okw-has-collect' : ''}">` +
      `<span class="okw-stats">${stats}</span>` +
      '' +
      (d.guests > 0 ? `<button class="okw-btn okw-collect" data-act="collect" title="Serve every waiting guest and collect all their tips">Collect all</button>` : '') +
      `<button class="okw-btn okw-primary" data-act="open">Visit</button>` +
      `</div>`;
    info.querySelectorAll('.okw-btn').forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation();
      if (b.dataset.act !== 'collect') { send('open'); return; }
      // serve everyone waiting right from the home screen
      b.disabled = true;
      send('collectall', (res) => {
        if (!res || !res.widget) return;
        const w = widgets.find((x) => x.el === el);
        if (!w) return;
        Object.assign(w.d, res.widget);
        w.d.flash = res.count ? `Collected ${res.count} guest${res.count === 1 ? '' : 's'} · +${res.mon} 文` : null;
        renderInfo(el, w.d);
        if (w.d.flash) setTimeout(() => { w.d.flash = null; renderInfo(el, w.d); }, 3500);
      });
    }));
  }

  // -------------------------------------------------------------- boot
  const widgets = [];

  function boot(el) {
    if (el.dataset.okwBooted) return;
    el.dataset.okwBooted = '1';
    let d;
    try {
      d = JSON.parse(el.querySelector('.okw-data').textContent);
    } catch (e) {
      return;
    }
    const canvas = el.querySelector('.okw-scene');
    const ctx = canvas.getContext('2d');
    const w = { el, d, ctx };
    widgets.push(w);
    renderInfo(el, d); // first, so the scene is measured at its final size
    fitCanvas(canvas);
    drawScene(ctx, d, performance.now() / 1000);
    el.addEventListener('click', () => send('open'));
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); send('open'); } });
  }

  function scan() {
    document.querySelectorAll('.okw').forEach(boot);
  }

  let last = 0;
  function frame(now) {
    if (now - last > 125 && !document.hidden) {
      last = now;
      for (const w of widgets) {
        if (!w.el.isConnected) continue;
        fitCanvas(w.ctx.canvas);
        drawScene(w.ctx, w.d, now / 1000);
      }
    }
    requestAnimationFrame(frame);
  }

  // Timer updates pushed through the chip (see chip.js): Tama naps in the
  // widget scene during focus sessions.
  document.addEventListener('okitchen-timer', (e) => {
    for (const w of widgets) w.d.timer = e.detail;
  });

  window.OKWidget = { scan };

  function start() {
    scan();
    try {
      new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
    } catch (e) {}
    requestAnimationFrame(frame);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
