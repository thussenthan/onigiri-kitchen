/* Onigiri Kitchen - 紙吹雪 (paper confetti) for "Congratulations, you finished
   this deck". Self-contained: it runs on Onigiri's congrats page and on plain
   Anki's built-in one. */
(function () {
  if (window.OKCelebrate) return;

  function hexToRgb(hex) {
    let h = String(hex || '').replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h.slice(0, 6), 16);
    return isNaN(n) ? null : [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  window.OKCelebrate = function (opts) {
    opts = opts || {};
    // The same celebration can be re-sent when Anki redraws the congrats page.
    // Remember when it started (per id) so a redraw continues it rather than
    // restarting, and skip it if it has already finished.
    let elapsed = 0;
    if (opts.id) {
      try {
        const key = 'okCelebrate:' + opts.id;
        const started = parseFloat(sessionStorage.getItem(key) || '0');
        if (started) elapsed = (Date.now() - started) / 1000;
        else sessionStorage.setItem(key, String(Date.now()));
      } catch (e) {}
      if (elapsed > 30) return;
    }
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const old = document.getElementById('ok-celebrate');
    if (old) old.remove();

    const root = document.createElement('div');
    root.id = 'ok-celebrate';
    root.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483000;';
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;';
    root.appendChild(canvas);

    // Banner: "おめでとう! Deck finished"
    const banner = document.createElement('div');
    const accent = opts.accent || getComputedStyle(document.documentElement).getPropertyValue('--accent-color').trim() || '#c8412f';
    banner.innerHTML =
      '<span style="font-family:\'Hiragino Mincho ProN\',\'Yu Mincho\',\'Noto Serif JP\',serif;font-weight:800;color:' + accent + ';margin-right:8px;font-size:17px">おめでとう!</span>' +
      '<span>' + (opts.deck ? 'Finished <b>' + String(opts.deck).replace(/[<>&"]/g, '') + '</b>' : 'Deck finished') + ' 🎉</span>';
    banner.style.cssText =
      'position:absolute;left:50%;top:22px;transform:translate(-50%,-14px);opacity:0;' +
      'padding:10px 20px;border-radius:999px;font:600 14px/1.3 -apple-system,system-ui,"Hiragino Sans",sans-serif;' +
      'background:var(--canvas-inset,#fffaf0);color:var(--fg,#2b2622);border:1px solid var(--border,#e0d4bf);' +
      'box-shadow:0 10px 30px rgba(0,0,0,.18);white-space:nowrap;transition:opacity .4s ease,transform .4s ease;';
    root.appendChild(banner);
    (document.body || document.documentElement).appendChild(root);
    requestAnimationFrame(() => { banner.style.opacity = '1'; banner.style.transform = 'translate(-50%,0)'; });
    setTimeout(() => { banner.style.opacity = '0'; banner.style.transform = 'translate(-50%,-10px)'; }, 3400);

    if (elapsed > 0.8) {
      banner.style.display = 'none';
      opts.sound = false;
    }
    if (opts.sound && window.OKSound) {
      try { OKSound.configure({ sound: true, volume: opts.volume != null ? opts.volume : 0.5 }); OKSound.fanfare(); } catch (e) {}
    }

    if (reduce) {
      setTimeout(() => root.remove(), 4200);
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    let W = 0;
    let H = 0;
    const ctx = canvas.getContext('2d');
    const parts = [];
    function size() {
      W = window.innerWidth || document.documentElement.clientWidth || 800;
      H = window.innerHeight || document.documentElement.clientHeight || 600;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // resizing a canvas clears it, so redraw the current frame
      if (typeof render === 'function') render();
    }
    size();
    window.addEventListener('resize', size);

    const palette = ['#c8412f', '#e8c25a', '#6f9a5c', '#3b6ea5', '#f2a9c0', '#f3e6c8', '#8e5aa8'];
    const themed = hexToRgb(accent) ? [accent, accent] : [];
    const colors = palette.concat(themed);
    const rand = (a, b) => a + Math.random() * (b - a);
    const pick = (a) => a[Math.floor(Math.random() * a.length)];

    function burst(x, y, dir, n) {
      for (let i = 0; i < n; i++) {
        const angle = (-Math.PI / 2) + dir * rand(0.15, 0.75);
        // launch speed that carries pieces to roughly 55–90% of the window height
        const speed = Math.sqrt(2 * 0.32 * H * rand(0.55, 0.9));
        const r = Math.random();
        parts.push({
          x, y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          rot: rand(0, Math.PI * 2),
          vr: rand(-0.25, 0.25),
          wob: rand(0, Math.PI * 2),
          kind: r < 0.06 ? 'onigiri' : 'paper',
          c: pick(colors),
          w: rand(6, 11),
          h: rand(9, 16),
          life: 1,
        });
      }
    }
    // two cannons from the bottom corners, then a gentle shower from the top
    burst(W * 0.08, H + 10, 1, 90);
    burst(W * 0.92, H + 10, -1, 90);
    // sakura petals only, drifting down from the top in gentle waves
    function petalWave(n) {
      for (let i = 0; i < n; i++) {
        parts.push({
          // spread out vertically, each with its own gentle fall speed
          x: rand(-20, W + 20), y: rand(-H * 0.5, -10), vx: rand(-0.8, 0.8), vy: rand(0.3, 1.2),
          term: rand(0.9, 2.1), wobSpeed: rand(0.04, 0.1),
          rot: rand(0, 6.28), vr: rand(-0.08, 0.08), wob: rand(0, 6.28),
          kind: 'petal', c: '#f2a9c0', w: rand(6, 10), h: rand(8, 12), life: 1,
        });
      }
    }
    // (scheduled relative to when this celebration first started)
    [[0.45, 45], [1.2, 35], [2.0, 30]].forEach(([at, n]) => {
      if (elapsed >= at) petalWave(n);
      else setTimeout(() => petalWave(n), (at - elapsed) * 1000);
    });

    function drawOnigiri(p) {
      const s = p.w * 1.2;
      ctx.fillStyle = '#fbf7ee';
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.7);
      ctx.quadraticCurveTo(s * 0.75, s * 0.35, s * 0.55, s * 0.5);
      ctx.lineTo(-s * 0.55, s * 0.5);
      ctx.quadraticCurveTo(-s * 0.75, s * 0.35, 0, -s * 0.7);
      ctx.fill();
      ctx.fillStyle = '#2f4a3c';
      ctx.fillRect(-s * 0.3, s * 0.05, s * 0.6, s * 0.45);
    }

    let last = performance.now();
    let start = last;
    let done = false;
    function step(now) {
      const dt = Math.min(2.5, (now - last) / 16.67);
      last = now;
      const t = (now - start) / 1000;
      for (const p of parts) {
        p.vy += 0.32 * dt;
        p.vx *= Math.pow(0.985, dt);
        p.vy = Math.min(p.vy, p.term || (p.kind === 'petal' ? 2.2 : 3.4));
        p.wob += (p.wobSpeed || 0.08) * dt;
        p.x += (p.vx + Math.sin(p.wob) * (p.kind === 'petal' ? 1.2 : 0.6)) * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
      }
      render();
      // finished once every piece has fallen off the screen (safety limit 30s)
      const onScreen = parts.some((p) => p.y < H + 40 && p.x > -60 && p.x < W + 60);
      if (!done && ((t > 2.2 && !onScreen) || t > 30)) { done = true; window.removeEventListener('resize', size); root.remove(); }
    }
    function render() {
      ctx.clearRect(0, 0, W, H);
      for (const p of parts) {
        if (p.life <= 0 || p.y > H + 40) continue;
        ctx.save();
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        if (p.kind === 'petal') {
          ctx.fillStyle = p.c2 || (p.c2 = Math.random() < 0.5 ? '#f7c6d4' : '#f2a9c0');
          ctx.beginPath();
          ctx.ellipse(0, 0, p.w * 0.55, p.w * 0.9, 0, 0, Math.PI * 2);
          ctx.fill();
        } else if (p.kind === 'onigiri') {
          drawOnigiri(p);
        } else {
          // paper strips flip as they tumble
          ctx.scale(1, Math.cos(p.wob * 2));
          ctx.fillStyle = p.c;
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        }
        ctx.restore();
      }
    }
    function frame(now) {
      step(now);
      if (!done) requestAnimationFrame(frame);
    }
    // for screenshots/tests: jump the animation forward, then hold still
    if (opts.preview) {
      for (let i = 0; i < opts.preview * 60; i++) step(last + 16.67);
      return;
    }
    // continuing after a page redraw: catch the animation up to where it was
    if (elapsed > 0) {
      for (let i = 0; i < Math.min(elapsed, 30) * 60; i++) step(last + 16.67);
      // re-align the clock with real time after catching up
      last = performance.now();
      start = last - elapsed * 1000;
    }
    requestAnimationFrame(frame);
  };
})();
