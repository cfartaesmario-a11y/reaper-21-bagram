import * as THREE from 'three';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';

const TINT = { friendly: null, enemy: [0.34, 0.31, 0.28], civilian: [1.25, 1.4, 1.75] };
const HEAT = { friendly: 0.95, enemy: 0.95, civilian: 0.95 };
const burnt = new THREE.MeshStandardMaterial({ color: 0x141312, roughness: 1 });

/**
 * Actores del área de operaciones: personas (aliados, insurgentes, civiles) y vehículos que siguen rutas
 * sobre el terreno, combaten entre sí y sufren los efectos de las explosiones.
 */
export class World {
  constructor({ assets, terrain, scene, fx }) {
    Object.assign(this, { assets, terrain, scene, fx });
    this.persons = []; this.vehicles = []; this.fights = [];
    this.root = new THREE.Group(); this.root.name = 'actores'; scene.add(this.root);
    this.mats = {};
    this._v = new THREE.Vector3();
  }

  ground(x, z) { return this.terrain.getHeight(x, z) + (this.terrain.insideBase(x, z, 60) ? 0.06 : 0); }

  variant(faction, mat) {
    const key = `${faction}:${mat.uuid}`;
    if (!this.mats[key]) {
      const m = mat.clone(); const t = TINT[faction];
      if (t) m.color.setRGB(t[0], t[1], t[2]);
      this.assets.heatMaterials.push({ mat: m, heat: HEAT[faction], emissive: m.emissive.clone(), intensity: m.emissiveIntensity, map: m.emissiveMap });
      this.mats[key] = m;
    }
    return this.mats[key];
  }

  spawnPerson({ x, z, faction = 'enemy', anim = 'Idle', ry = Math.random() * 6.28, tag = '' }) {
    const proto = this.assets.models.soldier;
    const obj = skeletonClone(proto.scene);
    obj.traverse((o) => { if (o.isMesh) { o.material = this.variant(faction, o.material); o.castShadow = true; o.frustumCulled = true; } });
    const mixer = new THREE.AnimationMixer(obj);
    const actions = {};
    for (const n of ['Idle', 'Walk', 'Run']) actions[n] = mixer.clipAction(THREE.AnimationClip.findByName(proto.animations, n));
    const p = { kind: 'person', obj, mixer, actions, cur: null, faction, tag, alive: true, pos: obj.position, path: null, speed: 0, radius: 1.2 };
    obj.position.set(x, this.ground(x, z), z); obj.rotation.y = ry;
    this.setAnim(p, anim); mixer.update(Math.random() * 2);
    this.root.add(obj); this.persons.push(p);
    return p;
  }
  spawnGroup(cx, cz, n, faction, spread = 8, opts = {}) {
    const out = [];
    for (let i = 0; i < n; i++) { const a = (i / n) * 6.283 + Math.random(), r = spread * (0.35 + Math.random() * 0.65); out.push(this.spawnPerson({ x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r, faction, ...opts })); }
    return out;
  }
  setAnim(p, name) { if (p.cur === name) return; if (p.cur) p.actions[p.cur].stop(); p.actions[name].play(); p.cur = name; }
  /** Ordena caminar o correr hasta un punto (o por una lista de puntos). */
  moveTo(p, pts, { run = false, then = null } = {}) {
    p.path = (Array.isArray(pts) ? pts : [pts]).map((q) => new THREE.Vector3(q.x, 0, q.z));
    p.speed = run ? 4.6 : 1.45; p.then = then; this.setAnim(p, run ? 'Run' : 'Walk');
  }

  spawnVehicle({ model = 'hilux', x, z, faction = 'enemy', ry = 0, tag = '' }) {
    const obj = this.assets.spawn(model);
    const v = { kind: 'vehicle', obj, model, faction, tag, alive: true, pos: obj.position, path: null, speed: 0, radius: model === 'hilux' || model === 'humvee' ? 4 : 5.5, dust: 0, moving: false };
    obj.position.set(x, this.ground(x, z), z); obj.rotation.y = ry;
    this.root.add(obj); this.vehicles.push(v);
    return v;
  }
  drive(v, pts, speed = 12, then = null) { v.path = pts.map((q) => new THREE.Vector3(q.x, 0, q.z)); v.speed = speed; v.then = then; v.moving = true; }

  /** Intercambio de fuego entre dos grupos (solo visual: trazadoras y fogonazos). */
  fight(a, b, rate = 5) { const f = { a, b, rate, acc: 0, on: true }; this.fights.push(f); return f; }

  clear() {
    for (const a of [...this.persons, ...this.vehicles]) this.root.remove(a.obj);
    this.persons.length = 0; this.vehicles.length = 0; this.fights.length = 0;
  }

  /** Actor vivo más próximo a un punto (para el seguimiento del sensor). */
  pick(p, r = 14) {
    let best = null, bd = r * r;
    for (const a of this.vehicles) { if (!a.alive) continue; const d = (a.pos.x - p.x) ** 2 + (a.pos.z - p.z) ** 2; if (d < bd) { bd = d; best = a; } }
    if (best) return best;
    for (const a of this.persons) { if (!a.alive) continue; const d = (a.pos.x - p.x) ** 2 + (a.pos.z - p.z) ** 2; if (d < bd) { bd = d; best = a; } }
    return best;
  }

  kill(p) {
    if (!p.alive) return; p.alive = false; p.path = null;
    p.mixer.stopAllAction(); p.obj.rotation.x = -Math.PI / 2; p.obj.rotation.z = Math.random() * 6; p.obj.position.y += 0.22;
  }
  destroy(v) {
    if (!v.alive) return; v.alive = false; v.moving = false; v.path = null;
    v.obj.traverse((o) => { if (o.isMesh) o.material = burnt; });
    v.obj.rotation.z = (Math.random() - 0.5) * 0.2;
    this.fx.burn(v.pos.clone());
  }

  /** Aplica una explosión. Devuelve bajas por bando y vehículos destruidos. */
  explode(p, radius) {
    const rep = { enemy: 0, friendly: 0, civilian: 0, vehicles: [], persons: [] };
    for (const a of this.persons) {
      if (!a.alive) continue;
      const d = Math.hypot(a.pos.x - p.x, a.pos.z - p.z);
      if (d < radius) { this.kill(a); rep[a.faction]++; rep.persons.push(a); }
      else if (d < radius * 6 && a.faction !== 'friendly') {
        const k = 160 / Math.max(d, 1);
        this.moveTo(a, { x: a.pos.x + (a.pos.x - p.x) * k, z: a.pos.z + (a.pos.z - p.z) * k }, { run: true });
        a.fled = true;
      }
    }
    for (const v of this.vehicles) {
      if (!v.alive) continue;
      if (Math.hypot(v.pos.x - p.x, v.pos.z - p.z) < radius * 0.75 + v.radius) { this.destroy(v); rep.vehicles.push(v); rep[v.faction] += v.crew || 0; }
    }
    this.onExplode?.(p, radius, rep);
    return rep;
  }

  count(faction, tag) { let n = 0; for (const a of this.persons) if (a.alive && a.faction === faction && (!tag || a.tag === tag)) n++; return n; }

  update(dt, focus) {
    const v3 = this._v;
    for (const p of this.persons) {
      if (!p.alive) continue;
      if (p.path && p.path.length) {
        const t = p.path[0], dx = t.x - p.pos.x, dz = t.z - p.pos.z, d = Math.hypot(dx, dz), s = p.speed * dt;
        if (d <= s) { p.pos.x = t.x; p.pos.z = t.z; p.path.shift(); if (!p.path.length) { p.path = null; this.setAnim(p, 'Idle'); const f = p.then; p.then = null; f?.(p); } }
        else { p.pos.x += (dx / d) * s; p.pos.z += (dz / d) * s; p.obj.rotation.y = Math.atan2(-dx, -dz); }
        p.pos.y = this.ground(p.pos.x, p.pos.z);
      }
      if (p.pos.distanceToSquared(focus) < 640000) p.mixer.update(dt);
    }
    for (const v of this.vehicles) {
      if (!v.alive || !v.moving || !v.path) continue;
      const t = v.path[0], dx = t.x - v.pos.x, dz = t.z - v.pos.z, d = Math.hypot(dx, dz), s = v.speed * dt;
      if (d <= s) { v.path.shift(); if (!v.path.length) { v.path = null; v.moving = false; const f = v.then; v.then = null; f?.(v); } }
      else {
        v.pos.x += (dx / d) * s; v.pos.z += (dz / d) * s;
        let dy = Math.atan2(-dx, -dz) - v.obj.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        v.obj.rotation.y += dy * Math.min(1, dt * 3);
      }
      v.pos.y = this.ground(v.pos.x, v.pos.z);
      if (!this.terrain.insideBase(v.pos.x, v.pos.z, 0)) { v.dust += dt * v.speed * 0.5; while (v.dust > 1) { v.dust -= 1; this.fx.dust(v3.copy(v.pos).setY(v.pos.y + 0.4)); } }
    }
    for (const f of this.fights) {
      if (!f.on) continue;
      const A = f.a.filter((x) => x.alive && !x.fled), B = f.b.filter((x) => x.alive && !x.fled);
      if (!A.length || !B.length) { f.on = false; continue; }
      f.acc += f.rate * dt * (0.4 + Math.random());
      while (f.acc > 1) {
        f.acc -= 1;
        const [S, T] = Math.random() < 0.5 ? [A, B] : [B, A];
        const s = S[Math.floor(Math.random() * S.length)], t = T[Math.floor(Math.random() * T.length)];
        const a = new THREE.Vector3(s.pos.x, s.pos.y + 1.4, s.pos.z), b = new THREE.Vector3(t.pos.x + (Math.random() - 0.5) * 14, t.pos.y + Math.random() * 4, t.pos.z + (Math.random() - 0.5) * 14);
        this.fx.tracer(a, b);
        if (s.kind === 'person') s.obj.rotation.y = Math.atan2(-(b.x - a.x), -(b.z - a.z));
      }
    }
  }
}
