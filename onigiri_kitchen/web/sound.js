/* Onigiri Kitchen - tiny synthesized sounds (no audio files needed).
   Notes use the miyako-bushi scale (D Eb G A Bb) for a koto-like feel. */
(function () {
  if (window.OKSound) return;

  const SCALE = [293.66, 311.13, 392.0, 440.0, 466.16]; // D4 Eb4 G4 A4 Bb4
  let ctx = null;
  let master = null;
  let enabled = true;
  let volume = 0.5;

  function audio() {
    if (!enabled) return null;
    try {
      if (!ctx) {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        master = ctx.createGain();
        master.connect(ctx.destination);
      }
      if (ctx.state === 'suspended') ctx.resume();
      master.gain.value = 0.35 * volume;
      return ctx;
    } catch (e) {
      return null;
    }
  }

  function note(freq, when, dur, type, gain, detune) {
    const a = audio();
    if (!a) return;
    const t = a.currentTime + (when || 0);
    const osc = a.createOscillator();
    const g = a.createGain();
    osc.type = type || 'triangle';
    osc.frequency.value = freq;
    if (detune) osc.detune.value = detune;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain || 0.5, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (dur || 0.8));
    osc.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + (dur || 0.8) + 0.05);
  }

  // Plucked string: bright attack, quick decay, a quiet octave overtone.
  function koto(freq, when, dur) {
    note(freq, when, dur || 1.1, 'triangle', 0.45);
    note(freq * 2, when, (dur || 1.1) * 0.5, 'sine', 0.12, 4);
  }

  function scaleNote(i) {
    const octave = Math.floor(i / SCALE.length);
    return SCALE[((i % SCALE.length) + SCALE.length) % SCALE.length] * Math.pow(2, octave);
  }

  const OKSound = {
    configure(opts) {
      if (typeof opts.sound === 'boolean') enabled = opts.sound;
      if (typeof opts.volume === 'number') volume = Math.max(0, Math.min(1, opts.volume));
      if (master) master.gain.value = 0.35 * volume;
    },
    get enabled() { return enabled; },
    pluck(i) { koto(scaleNote(i == null ? Math.floor(Math.random() * 8) : i)); },
    coin() {
      note(1318.5, 0, 0.12, 'square', 0.12);
      note(1760, 0.07, 0.25, 'square', 0.1);
    },
    chime() {
      [2637, 3136, 3520].forEach((f, i) => note(f + Math.random() * 30, i * 0.09, 1.8, 'sine', 0.12));
    },
    meow() {
      const a = audio();
      if (!a) return;
      const t = a.currentTime;
      const osc = a.createOscillator();
      const g = a.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(620, t);
      osc.frequency.linearRampToValueAtTime(900, t + 0.12);
      osc.frequency.linearRampToValueAtTime(520, t + 0.4);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.25, t + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
      osc.connect(g);
      g.connect(master);
      osc.start(t);
      osc.stop(t + 0.5);
    },
    // Puffle: a quick rising "boing" squeak.
    squeak() {
      const a = audio();
      if (!a) return;
      const t = a.currentTime;
      const osc = a.createOscillator();
      const g = a.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(380, t);
      osc.frequency.exponentialRampToValueAtTime(1150, t + 0.09);
      osc.frequency.exponentialRampToValueAtTime(760, t + 0.2);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.09, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
      osc.connect(g);
      g.connect(master);
      osc.start(t);
      osc.stop(t + 0.28);
    },
    // Java sparrow: two little high chirps.
    chirp() {
      const a = audio();
      if (!a) return;
      [0, 0.13].forEach((d) => {
        const t = a.currentTime + d;
        const osc = a.createOscillator();
        const g = a.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(2600, t);
        osc.frequency.exponentialRampToValueAtTime(3900, t + 0.05);
        osc.frequency.exponentialRampToValueAtTime(3000, t + 0.09);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.12, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
        osc.connect(g);
        g.connect(master);
        osc.start(t);
        osc.stop(t + 0.12);
      });
    },
    pop() { note(520 + Math.random() * 80, 0, 0.12, 'sine', 0.3); },
    blip() { note(880, 0, 0.08, 'sine', 0.18); },
    // Phrase used when a focus session ends or a break starts.
    phraseUp() { [0, 2, 3, 5, 7].forEach((n, i) => koto(scaleNote(n), i * 0.14, 1.4)); },
    // Gentle descending phrase for "break's over".
    phraseDown() { [7, 5, 3, 2, 0].forEach((n, i) => koto(scaleNote(n), i * 0.18, 1.4)); },
    fanfare() {
      [0, 3, 5, 7, 10].forEach((n, i) => koto(scaleNote(n), i * 0.1, 1.6));
      setTimeout(() => OKSound.chime(), 600);
    },
    scaleNote,
    koto,
  };
  window.OKSound = OKSound;
})();
