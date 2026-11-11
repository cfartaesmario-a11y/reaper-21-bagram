import * as THREE from 'three';

const VERT = `
  attribute float size; attribute vec4 tint;
  uniform float scale; varying vec4 vTint;
  #include <common>
  #include <logdepthbuf_pars_vertex>
  void main() {
    vTint = tint;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp(size * scale / max(-mv.z, 0.1), 0.0, 900.0);
    #include <logdepthbuf_vertex>
  }`;
const FRAG = `
  varying vec4 vTint;
  #include <common>
  #include <logdepthbuf_pars_fragment>
  void main() {
    #include <logdepthbuf_fragment>
    vec2 p = gl_PointCoord - 0.5; float r = length(p) * 2.0;
    float a = smoothstep(1.0, 0.25, r);
    float n = 0.82 + 0.18 * sin(p.x * 23.0 + vTint.r * 40.0) * sin(p.y * 19.0 + vTint.g * 31.0);
    gl_FragColor = vec4(vTint.rgb * n, vTint.a * a);
  }`;

/** Conjunto de partículas en una sola llamada de dibujo (humo, polvo o fuego aditivo). */
class Pool {
  constructor(scene, max, additive) {
    this.max = max; this.n = 0; this.p = [];
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3); this.size = new Float32Array(max); this.tint = new Float32Array(max * 4);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('tint', new THREE.BufferAttribute(this.tint, 4).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: { scale: { value: 800 } }, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false; this.points.renderOrder = additive ? 21 : 20;
    scene.add(this.points);
  }
  add(o) { if (this.p.length >= this.max) this.p.shift(); this.p.push(o); }
  update(dt) {
    const P = this.p; let k = 0;
    for (let i = 0; i < P.length; i++) {
      const o = P[i]; o.t += dt;
      if (o.t >= o.life) continue;
      const f = o.t / o.life;
      o.x += o.vx * dt; o.y += o.vy * dt; o.z += o.vz * dt;
      const dr = Math.exp(-o.drag * dt); o.vx *= dr; o.vy = o.vy * dr + o.rise * dt; o.vz *= dr;
      this.pos[k * 3] = o.x; this.pos[k * 3 + 1] = o.y; this.pos[k * 3 + 2] = o.z;
      this.size[k] = o.s0 + (o.s1 - o.s0) * Math.sqrt(f);
      const a = o.a * Math.min(1, f * 12) * (1 - f) ** o.fade;
      this.tint[k * 4] = o.r * (1 - f * o.cool); this.tint[k * 4 + 1] = o.g * (1 - f * o.cool * 1.6); this.tint[k * 4 + 2] = o.b * (1 - f * o.cool * 2); this.tint[k * 4 + 3] = a;
      P[k++] = o;
    }
    P.length = k;
    const g = this.points.geometry;
    g.setDrawRange(0, k);
    g.attributes.position.needsUpdate = g.attributes.size.needsUpdate = g.attributes.tint.needsUpdate = true;
  }
}

/** Efectos visuales: estelas, explosiones, columnas de humo, polvo, trazadoras y marcas de impacto. */
export class FX {
  constructor(scene, terrain) {
    this.scene = scene; this.terrain = terrain;
    this.smoke = new Pool(scene, 2600, false);
    this.fire = new Pool(scene, 900, true);
    this.emitters = [];
    this.tracers = [];
    this.tracerGeo = new THREE.BoxGeometry(0.09, 0.09, 7);
    this.tracerMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
    this.flashes = [];
    this.scorchMat = new THREE.MeshBasicMaterial({ color: 0x0b0a08, transparent: true, opacity: 0.72, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -20 });
  }
  setScale(camera, heightPx) { const s = heightPx / (2 * Math.tan((camera.fov * Math.PI) / 360)); this.smoke.mat.uniforms.scale.value = s; this.fire.mat.uniforms.scale.value = s; }

  puff(pool, p, o) {
    pool.add({ x: p.x, y: p.y, z: p.z, vx: 0, vy: 0, vz: 0, t: 0, life: 2, s0: 1, s1: 4, a: 0.5, r: 0.6, g: 0.6, b: 0.6, drag: 0.8, rise: 0, fade: 1.2, cool: 0, ...o });
  }
  /** Estela de motor cohete. */
  trail(p, v) {
    const j = () => (Math.random() - 0.5) * 1.6;
    this.puff(this.smoke, p, { vx: -v.x * 0.03 + j(), vy: -v.y * 0.03 + j(), vz: -v.z * 0.03 + j(), life: 3.2 + Math.random() * 1.5, s0: 0.5, s1: 5.5, a: 0.5, r: 0.86, g: 0.86, b: 0.84, rise: 0.4 });
    this.puff(this.fire, p, { life: 0.09, s0: 2.2, s1: 0.6, a: 1, r: 1.6, g: 1.1, b: 0.5 });
  }
  /** Polvo levantado por un vehículo. */
  dust(p, k = 1) {
    this.puff(this.smoke, p, { vx: (Math.random() - 0.5) * 2, vy: 0.8 + Math.random(), vz: (Math.random() - 0.5) * 2, life: 3.5 + Math.random() * 2, s0: 1.5 * k, s1: 9 * k, a: 0.26, r: 0.66, g: 0.58, b: 0.45, rise: 0.25, drag: 0.6 });
  }
  /** Detonación: fogonazo, bola de fuego, metralla de tierra, columna de humo y marca en el suelo. */
  explosion(p, size = 1) {
    const R = (a) => (Math.random() - 0.5) * a;
    this.puff(this.fire, p, { y: p.y + 2, life: 0.16, s0: 60 * size, s1: 20 * size, a: 1, r: 2.4, g: 2.0, b: 1.4 });
    for (let i = 0; i < 26; i++) this.puff(this.fire, p, { y: p.y + 1.5, vx: R(26) * size, vy: (4 + Math.random() * 16) * size, vz: R(26) * size, life: 0.5 + Math.random() * 0.7, s0: 5 * size, s1: 13 * size, a: 0.95, r: 1.9, g: 1.0, b: 0.32, drag: 3.2, cool: 0.55 });
    for (let i = 0; i < 46; i++) { const a = Math.random() * 6.283, sp = (8 + Math.random() * 26) * size; this.puff(this.smoke, p, { y: p.y + 0.6, vx: Math.cos(a) * sp, vy: 1 + Math.random() * 5, vz: Math.sin(a) * sp, life: 4 + Math.random() * 4, s0: 3 * size, s1: 20 * size, a: 0.42, r: 0.56, g: 0.49, b: 0.38, drag: 1.9, rise: 0.3 }); }
    for (let i = 0; i < 34; i++) this.puff(this.smoke, p, { y: p.y + 2, vx: R(9) * size, vy: (7 + Math.random() * 20) * size, vz: R(9) * size, life: 7 + Math.random() * 7, s0: 5 * size, s1: 30 * size, a: 0.6, r: 0.17, g: 0.16, b: 0.15, drag: 1.1, rise: 1.6, fade: 1.6 });
    for (let i = 0; i < 22; i++) this.puff(this.smoke, p, { y: p.y + 1, vx: R(44) * size, vy: (14 + Math.random() * 30) * size, vz: R(44) * size, life: 1.6 + Math.random() * 1.4, s0: 0.8, s1: 1.8, a: 0.9, r: 0.2, g: 0.16, b: 0.12, drag: 0.5, rise: -9.8 });
    this.emitters.push({ p: p.clone(), t: 0, life: 26, rate: 9, acc: 0, kind: 'column', size });
    const s = new THREE.Mesh(new THREE.CircleGeometry(7 * size, 20).rotateX(-Math.PI / 2), this.scorchMat);
    s.position.set(p.x, this.terrain.getHeight(p.x, p.z) + 0.12, p.z); s.renderOrder = 8; this.scene.add(s);
  }
  /** Fuego persistente (vehículo destruido). */
  burn(p, life = 90) { this.emitters.push({ p: p.clone(), t: 0, life, rate: 12, acc: 0, kind: 'burn', size: 1 }); }
  /** Trazadora entre dos puntos. */
  tracer(a, b) {
    const m = new THREE.Mesh(this.tracerGeo, this.tracerMat);
    const d = new THREE.Vector3().subVectors(b, a), len = d.length();
    m.position.copy(a); m.lookAt(b); this.scene.add(m);
    this.tracers.push({ m, d: d.normalize(), left: len, speed: 520 });
    this.puff(this.fire, a, { y: a.y + 0.2, life: 0.07, s0: 2.4, s1: 1, a: 1, r: 2, g: 1.6, b: 0.8 });
  }
  update(dt) {
    for (let i = this.emitters.length - 1; i >= 0; i--) {
      const e = this.emitters[i]; e.t += dt; e.acc += e.rate * dt * (e.kind === 'burn' ? 1 : 1 - e.t / e.life);
      while (e.acc > 1) {
        e.acc -= 1; const R = (a) => (Math.random() - 0.5) * a;
        this.puff(this.smoke, e.p, { x: e.p.x + R(3), y: e.p.y + 1, z: e.p.z + R(3), vx: R(1.5) + 1.2, vy: 4 + Math.random() * 3, vz: R(1.5), life: 9 + Math.random() * 6, s0: 3 * e.size, s1: 26 * e.size, a: 0.5, r: 0.12, g: 0.115, b: 0.11, drag: 0.25, rise: 0.9, fade: 1.5 });
        if (e.kind === 'burn') this.puff(this.fire, e.p, { x: e.p.x + R(2), y: e.p.y + 0.8, z: e.p.z + R(2), vy: 2.5 + Math.random() * 2, life: 0.5 + Math.random() * 0.4, s0: 3, s1: 1.2, a: 0.9, r: 1.8, g: 0.8, b: 0.2, cool: 0.5 });
      }
      if (e.t > e.life) this.emitters.splice(i, 1);
    }
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i], s = t.speed * dt;
      t.m.position.addScaledVector(t.d, s); t.left -= s;
      if (t.left <= 0) { this.scene.remove(t.m); this.tracers.splice(i, 1); }
    }
    this.smoke.update(dt); this.fire.update(dt);
  }
}
