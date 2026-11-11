/** Sonido sintetizado con Web Audio: motor, viento, radio, lanzamientos y explosiones con retardo por distancia. */
export class Audio {
  constructor() { this.ctx = null; this.listener = { x: 0, y: 0, z: 0 }; this.muffled = false; }

  /** Debe llamarse tras un gesto del usuario (clic en el menú). */
  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const c = this.ctx = new AC();
    this.master = c.createGain(); this.master.gain.value = 0.7; this.master.connect(c.destination);
    const n = c.sampleRate * 2, buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
    // motor: turbohélice = zumbido de palas + soplido
    this.engGain = c.createGain(); this.engGain.gain.value = 0;
    this.engFilter = c.createBiquadFilter(); this.engFilter.type = 'lowpass'; this.engFilter.frequency.value = 500;
    this.osc1 = c.createOscillator(); this.osc1.type = 'sawtooth'; this.osc2 = c.createOscillator(); this.osc2.type = 'square';
    const g2 = c.createGain(); g2.gain.value = 0.35;
    this.osc1.connect(this.engFilter); this.osc2.connect(g2).connect(this.engFilter);
    this.engFilter.connect(this.engGain).connect(this.master);
    this.osc1.start(); this.osc2.start();
    // ambiente (viento / sala)
    this.amb = c.createBufferSource(); this.amb.buffer = buf; this.amb.loop = true;
    this.ambFilter = c.createBiquadFilter(); this.ambFilter.type = 'bandpass'; this.ambFilter.frequency.value = 400; this.ambFilter.Q.value = 0.4;
    this.ambGain = c.createGain(); this.ambGain.gain.value = 0.0;
    this.amb.connect(this.ambFilter).connect(this.ambGain).connect(this.master); this.amb.start();
  }

  /** mode: 'ext' (cámara exterior), 'gcs' (dentro de la estación), 'foot', 'off' */
  setScene(mode, throttle = 0, dist = 30) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, k = 0.15;
    const f = 62 + throttle * 46;
    this.osc1.frequency.setTargetAtTime(f, t, k); this.osc2.frequency.setTargetAtTime(f * 2.01, t, k);
    const near = Math.min(1, 40 / Math.max(dist, 10));
    const eg = mode === 'ext' ? 0.16 * near * (0.5 + throttle * 0.5) : mode === 'foot' ? 0.03 * Math.min(1, 300 / Math.max(dist, 40)) : 0;
    this.engGain.gain.setTargetAtTime(eg, t, k);
    this.engFilter.frequency.setTargetAtTime(mode === 'ext' ? 420 + throttle * 500 : 220, t, k);
    this.ambGain.gain.setTargetAtTime(mode === 'gcs' ? 0.035 : mode === 'off' ? 0.02 : 0.06, t, 0.4);
    this.ambFilter.frequency.setTargetAtTime(mode === 'gcs' ? 140 : 520, t, 0.4);
    this.muffled = mode === 'gcs';
  }

  burst({ dur = 1, freq = 800, q = 0.7, gain = 0.5, type = 'lowpass', delay = 0, sweep = 0 }) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime + delay;
    const s = c.createBufferSource(); s.buffer = this.noise; s.loop = true;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * sweep), t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.master); s.start(t); s.stop(t + dur + 0.05);
  }
  tone(freq, dur, gain = 0.08, delay = 0, type = 'sine') {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.value = freq; g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }
  click() { this.tone(900, 0.05, 0.05); }
  hover() { this.tone(1400, 0.025, 0.02); }
  deny() { this.tone(180, 0.18, 0.09, 0, 'square'); }
  radio() { this.burst({ dur: 0.09, freq: 2400, q: 2, gain: 0.07, type: 'bandpass' }); this.tone(1250, 0.07, 0.035, 0.02); }
  alarm() { this.tone(880, 0.12, 0.06); this.tone(660, 0.14, 0.06, 0.16); }
  launch() { const m = this.muffled ? 0.25 : 1; this.burst({ dur: 2.2, freq: 2600, gain: 0.5 * m, sweep: 0.12, type: 'bandpass', q: 0.5 }); this.burst({ dur: 0.5, freq: 300, gain: 0.5 * m }); }
  release() { const m = this.muffled ? 0.3 : 1; this.burst({ dur: 0.25, freq: 500, gain: 0.3 * m }); this.tone(90, 0.2, 0.12 * m); }
  /** Explosión en p: el sonido llega con el retardo de la distancia al oyente (340 m/s). */
  boom(p, size = 1) {
    const d = Math.hypot(p.x - this.listener.x, p.y - this.listener.y, p.z - this.listener.z);
    if (this.muffled) { this.burst({ dur: 0.5, freq: 900, gain: 0.05, type: 'bandpass', delay: 0.3 }); return; }
    const delay = Math.min(d / 340, 14), g = Math.min(0.95, (220 * size) / Math.max(d, 60));
    this.burst({ dur: 2.6 + size, freq: 380, gain: g, sweep: 0.15, delay });
    this.burst({ dur: 0.28, freq: 2200, gain: g * 0.6, delay, sweep: 0.2 });
    this.tone(52, 1.2 + size * 0.4, g * 0.5, delay);
  }
}
