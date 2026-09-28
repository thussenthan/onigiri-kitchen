/* Onigiri Kitchen - dango timer chip for the main screens, plus the hook that
   makes Onigiri's restaurant widget open the kitchen. */
(function () {
  if (window.OKChip) return;
  const init = window.OK_CHIP_INIT || {};
  let data = init.timer || { pomo: { phase: 'idle' } };
  let lastPhase = data.pomo && data.pomo.phase;
  let chip = null;

  function send(cmd, cb) {
    if (typeof pycmd === 'function') pycmd('okitchen:' + cmd, cb);
  }

  function fmt(ms) {
    const s = Math.max(0, Math.round(ms / 1000));
    const m = Math.floor(s / 60);
    return m + ':' + String(s % 60).padStart(2, '0');
  }

  function remaining(p) {
    if (!p) return 0;
    if (p.endsAt && !p.paused) return p.endsAt - Date.now();
    return p.remaining || 0;
  }

  // Tiny pixel Tama: curled up napping during focus, sitting up otherwise.
  const CAT_SLEEP = ['........w.w', '..wwwwwwwww', '.wwoowwwkwk', 'wwoowwwwwww', 'kwwwwwwwww.', '.kkkkk.....'];
  const CAT_SIT = ['.w...k.', '.wwwwk.', 'wwkwkww', '.wwwww.', '.oowww.', 'wooowwk', 'wwwwwwk', '.w.w.kk'];
  const CAT_PAL = { w: '#fbf7ee', o: '#e0a13a', k: '#3b3030' };
  function pixelSvg(rows, cls) {
    let rects = '';
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const c = CAT_PAL[row[x]];
        if (c) rects += `<rect x="${x}" y="${y}" width="1.02" height="1.02" fill="${c}"/>`;
      }
    });
    return `<svg class="${cls}" viewBox="0 0 ${rows[0].length} ${rows.length}" shape-rendering="crispEdges" aria-hidden="true">${rects}</svg>`;
  }

  function build() {
    if (chip || !init.chip || !document.body) return;
    chip = document.createElement('div');
    chip.className = 'okc';
    chip.innerHTML =
      '<button class="okc-main" title="Open Onigiri Kitchen">' +
      '<span class="okc-dango"><i></i><i></i><i></i></span>' +
      '<span class="okc-label"></span><span class="okc-time"></span>' +
      '<span class="okc-cat">' + pixelSvg(CAT_SLEEP, 'okc-cat-sleep') + pixelSvg(CAT_SIT, 'okc-cat-sit') + '<span class="okc-z">z</span></span></button>' +
      '<span class="okc-actions">' +
      '<button class="okc-btn" data-act="toggle" title="Start / pause"></button>' +
      '<button class="okc-btn" data-act="skip" title="Skip to next">&#x23ED;&#xFE0E;</button>' +
      '</span>' +
      '<span class="okc-bar"><span></span></span>';
    chip.querySelector('.okc-main').addEventListener('click', (e) => {
      e.stopPropagation();
      send('open');
    });
    chip.querySelectorAll('.okc-btn').forEach((b) =>
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const p = data.pomo || {};
        let act = b.dataset.act;
        if (act === 'toggle') {
          if (p.phase === 'idle') act = 'start';
          else act = p.paused ? 'resume' : 'pause';
        }
        send('timer:' + act, (r) => r && OKChip.update(r));
      })
    );
    document.body.appendChild(chip);
    render();
  }

  function render() {
    if (!chip) return;
    const p = data.pomo || { phase: 'idle' };
    chip.dataset.phase = p.phase;
    chip.classList.toggle('paused', !!p.paused);
    const label = chip.querySelector('.okc-label');
    const time = chip.querySelector('.okc-time');
    const toggle = chip.querySelector('[data-act="toggle"]');
    if (p.phase === 'focus' && p.endless) {
      // endless focus: time studied, counting up
      label.textContent = p.idle ? '休止' : '無限';
      const el = (p.elapsed || 0) + (p.paused ? 0 : Math.max(0, Date.now() - (p.now || Date.now())));
      time.textContent = fmt(el);
    } else if (p.phase === 'focus') {
      label.textContent = p.idle ? '休止' : '集中';
      time.textContent = fmt(remaining(p));
    } else if (p.phase === 'break') {
      label.textContent = p.longBreak ? '祭り' : '休憩';
      time.textContent = fmt(remaining(p));
    } else {
      label.textContent = '食堂';
      time.textContent = p.rounds ? p.rounds + '/' + p.cycle : '';
    }
    toggle.innerHTML = p.phase === 'idle' || p.paused ? '&#x25B6;&#xFE0E;' : '&#x23F8;&#xFE0E;';
    chip.title =
      p.phase === 'focus' && p.idle ? 'Focus paused while you were away. Answer a card to resume.' :
      p.phase === 'focus' && p.endless ? 'Endless focus: no breaks' :
      p.phase === 'focus' ? 'Focus session' :
      p.phase === 'break' ? 'Break: your restaurant is open' : 'Onigiri Kitchen';
    const frac = p.endless
      ? (((p.elapsed || 0) + (p.paused ? 0 : Math.max(0, Date.now() - (p.now || Date.now())))) % (p.total || 1)) / (p.total || 1)
      : p.total ? 1 - remaining(p) / p.total : 0;
    chip.querySelector('.okc-bar span').style.width = (p.phase === 'idle' ? 0 : Math.min(100, frac * 100)) + '%';
  }

  function chimeOnChange() {
    const phase = data.pomo && data.pomo.phase;
    if (phase !== lastPhase && !data.kitchenOpen && window.OKSound) {
      OKSound.configure(data);
      if (lastPhase === 'focus' && phase === 'break') OKSound.phraseUp();
      else if (lastPhase === 'break') OKSound.phraseDown();
    }
    lastPhase = phase;
  }

  // ---------------------------------------------------------------- widget
  const SIGN_SVG =
    '<svg viewBox="0 0 24 24" class="rl-nav-icon" aria-hidden="true"><path fill="currentColor" d="M2 3h20v2h-1v3.5a2.5 2.5 0 0 1-2.5 2.5 2.5 2.5 0 0 1-2.2-1.3A2.5 2.5 0 0 1 14 11a2.5 2.5 0 0 1-2-1 2.5 2.5 0 0 1-2 1 2.5 2.5 0 0 1-2.3-1.3A2.5 2.5 0 0 1 5.5 11 2.5 2.5 0 0 1 3 8.5V5H2zm3 2v3.5a.5.5 0 0 0 1 0V5zm4 0v3.5a1 1 0 0 0 2 0V5zm4 0v3.5a1 1 0 0 0 2 0V5zm4 0v3.5a.5.5 0 0 0 1 0V5zM4 13h2v8h12v-8h2v10H4zm6 2h4v6h-4z"/></svg>';

  function hookWidget() {
    if (!init.widget) return;
    const widget = document.querySelector('.onigiri-restaurant-level-widget');
    if (!widget || widget.dataset.okHooked) return;
    widget.dataset.okHooked = '1';

    const nav = widget.querySelector('.rl-widget-nav-buttons');
    if (nav) {
      const btn = document.createElement('button');
      btn.className = 'rl-nav-btn ok-visit-btn';
      btn.title = 'Visit your restaurant';
      btn.innerHTML = SIGN_SVG;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        send('open');
      });
      nav.appendChild(btn);
    }

    const img = widget.querySelector('.restaurant-image-container');
    if (img) {
      img.classList.add('ok-visitable');
      img.setAttribute('data-ok-hint', 'いらっしゃいませ · Visit');
      // Capture phase runs before Onigiri's inline onclick. Shift-click
      // falls through, so Onigiri's own expand view still works.
      img.addEventListener(
        'click',
        (e) => {
          if (e.shiftKey) return;
          e.stopImmediatePropagation();
          e.stopPropagation();
          e.preventDefault();
          send('open');
        },
        true
      );
    }
  }

  window.OKChip = {
    update(next) {
      if (!next) return;
      data = next;
      chimeOnChange();
      render();
      // let the home-screen widget follow the timer too
      try { document.dispatchEvent(new CustomEvent('okitchen-timer', { detail: next })); } catch (e) {}
    },
  };

  function start() {
    build();
    hookWidget();
    // Onigiri re-renders parts of the page; re-hook when that happens.
    try {
      new MutationObserver(() => {
        hookWidget();
        if (chip && !chip.isConnected) {
          chip = null;
          build();
        }
      }).observe(document.body, { childList: true, subtree: true });
    } catch (e) {}
    setInterval(render, 1000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
