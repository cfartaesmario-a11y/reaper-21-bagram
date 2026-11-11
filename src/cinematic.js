import * as THREE from 'three';

const ease = (t) => t * t * (3 - 2 * t);

/**
 * Secuencias de cámara. Cada plano: { from, to, look, look2?, dur, fov?, title?, sub? }
 * (posiciones en mundo; `look` puede ser una función para seguir algo que se mueve).
 */
export class Cinematic {
  constructor(camera, ui) { this.camera = camera; this.ui = ui; this.shots = null; this.i = 0; this.t = 0; this.done = null; this.baseFov = camera.fov; this._l = new THREE.Vector3(); }
  get active() { return !!this.shots; }
  play(shots, done) { this.shots = shots; this.i = -1; this.done = done; this.ui.cine(true); this.next(); }
  next() {
    this.i++; this.t = 0;
    if (this.i >= this.shots.length) { this.stop(); return; }
    const s = this.shots[this.i];
    this.ui.caption(s.title || null, s.sub);
  }
  stop() {
    if (!this.shots) return;
    this.shots = null; this.ui.cine(false);
    this.camera.fov = this.baseFov; this.camera.updateProjectionMatrix();
    const d = this.done; this.done = null; d?.();
  }
  skip() { this.stop(); }
  /** Devuelve el punto de interés del plano (para sombras y animación). */
  update(dt, focus) {
    const s = this.shots[this.i]; this.t += dt;
    const k = ease(Math.min(1, this.t / s.dur));
    this.camera.position.lerpVectors(s.from, s.to, k);
    const a = typeof s.look === 'function' ? s.look() : s.look;
    if (s.look2) this._l.lerpVectors(a, s.look2, k); else this._l.copy(a);
    this.camera.lookAt(this._l);
    const fov = s.fov || this.baseFov;
    if (this.camera.fov !== fov) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
    focus.copy(s.focus || this._l);
    if (this.t >= s.dur) this.next();
  }
}
