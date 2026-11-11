import * as THREE from 'three';
import { clamp } from './util.js';

const G = 9.81;
const Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
export const WEAPONS = {
  hellfire: { name: 'AGM-114 HELLFIRE', short: 'AGM-114', range: 8500, blast: 13, size: 1.0 },
  gbu: { name: 'GBU-12 PAVEWAY II', short: 'GBU-12', range: 12000, blast: 34, size: 2.3 },
};

/**
 * Armamento del MQ-9: misiles Hellfire y bombas Paveway con guiado láser semiactivo.
 * El arma sigue en todo momento el punto que ilumina el designador de la torreta: si el láser
 * se apaga o la mira se mueve, el arma lo acusa.
 */
export class Weapons {
  constructor({ assets, scene, drone, sensor, terrain, fx, world, audio }) {
    Object.assign(this, { assets, scene, drone, sensor, terrain, fx, world, audio });
    this.live = [];
    this.box = new THREE.Box3();
    this.rearm();
  }
  rearm() {
    this.master = false; this.laser = false; this.sel = 'hellfire';
    this.left = { hellfire: this.drone.stores.hellfire.length, gbu: this.drone.stores.gbu.length };
    this.fired = { hellfire: 0, gbu: 0 };
    for (const w of this.live) this.scene.remove(w.obj);
    this.live.length = 0;
  }
  select() { this.sel = this.sel === 'hellfire' ? 'gbu' : 'hellfire'; }

  /** Motivo por el que no se puede disparar ('' si todo está en orden). */
  blocked() {
    const d = this.drone, W = WEAPONS[this.sel];
    if (!this.master) return 'ARMAMENTO EN SEGURO';
    if (!this.left[this.sel]) return 'SIN MUNICIÓN';
    if (d.onGround || d.agl < 120) return 'ALTURA INSUFICIENTE';
    if (!this.laser) return 'LÁSER NO ARMADO';
    const aim = this.sensor.aim;
    if (!aim) return 'SIN PUNTO DE MIRA';
    if (aim.distanceTo(d.pos) > W.range) return 'FUERA DE ALCANCE';
    return '';
  }

  fire() {
    const why = this.blocked();
    if (why) { this.audio?.deny(); return why; }
    const type = this.sel, d = this.drone;
    const idx = d.stores[type].findIndex((m) => m.visible);
    const store = d.stores[type][idx];
    store.visible = false; this.left[type]--; this.fired[type]++;
    d.root.updateMatrixWorld(true);
    const p = this.box.setFromObject(store).getCenter(new THREE.Vector3());
    if (!isFinite(p.x)) p.copy(d.pos);
    const obj = new THREE.Group();
    const m = this.assets.spawn(type === 'hellfire' ? 'hellfire' : 'gbu12');
    if (type === 'hellfire') m.position.y = -0.8; else m.position.set(0, -0.17, 0);
    obj.add(m); obj.position.copy(p); this.scene.add(obj);
    const w = { type, obj, pos: obj.position, vel: d.vel.clone(), t: 0, acc: 0, dir: d.fwd.clone(), lastAim: this.sensor.aim.clone() };
    this.live.push(w);
    this.audio?.[type === 'hellfire' ? 'launch' : 'release']();
    this.onFire?.(type);
    return '';
  }

  /** Segundos estimados hasta el impacto del arma en vuelo más antigua (o -1). */
  get tti() {
    const w = this.live[0]; if (!w) return -1;
    return w.lastAim.distanceTo(w.pos) / Math.max(w.vel.length(), 60);
  }

  update(dt) {
    const steps = 3, h = dt / steps;
    for (let i = this.live.length - 1; i >= 0; i--) {
      const w = this.live[i];
      let hit = null;
      for (let s = 0; s < steps && !hit; s++) hit = this.step(w, h);
      if (hit || w.t > 70) {
        this.scene.remove(w.obj); this.live.splice(i, 1);
        if (hit) this.detonate(hit, w.type);
      }
    }
  }

  step(w, dt) {
    w.t += dt;
    const aim = this.laser && this.sensor.aim ? w.lastAim.copy(this.sensor.aim) : null;
    const v = w.vel, sp = Math.max(v.length(), 1);
    const dir = w.dir.copy(v).divideScalar(sp);
    if (w.type === 'hellfire') {
      if (w.t < 0.3) v.y -= G * dt;                                   // caída libre antes de encender
      else {
        if (aim) {
          const to = new THREE.Vector3().subVectors(aim, w.pos), dist = to.length();
          if (dist > 1500 && w.t < 12) to.y += clamp(dist * 0.14, 0, 650);          // trayectoria elevada (ataque desde arriba)
          to.normalize();
          const ang = dir.angleTo(to), maxA = 0.62 * dt;
          if (ang > 1e-4) dir.lerp(to, Math.min(1, maxA / ang)).normalize();
        } else dir.y -= 0.02 * dt;
        let s = sp;
        if (w.t < 2.9) s = Math.min(440, s + 135 * dt); else s = Math.max(120, s - (0.00011 * s * s + 2) * dt);
        v.copy(dir).multiplyScalar(s);
        if (w.t < 2.9) { w.acc += dt * 90; while (w.acc > 1) { w.acc -= 1; this.fx.trail(w.pos, v); } }
        else { w.acc += dt * 14; while (w.acc > 1) { w.acc -= 1; this.fx.puff(this.fx.smoke, w.pos, { life: 1.6, s0: 0.4, s1: 2.2, a: 0.16, r: 0.8, g: 0.8, b: 0.8 }); } }
      }
      w.obj.quaternion.setFromUnitVectors(Y, dir);
    } else {
      v.y -= G * dt;
      v.multiplyScalar(1 - 0.00002 * sp * dt);
      if (aim && w.t > 1.2) {
        const to = new THREE.Vector3().subVectors(aim, w.pos).normalize();
        const d2 = new THREE.Vector3().copy(v).normalize();
        const ang = d2.angleTo(to), maxA = (30 / sp) * dt;
        if (ang > 1e-4) { d2.lerp(to, Math.min(1, maxA / ang)).normalize(); v.copy(d2).multiplyScalar(v.length()); }
      }
      w.obj.quaternion.setFromUnitVectors(Z, dir.copy(v).normalize());
    }
    const stepLen = v.length() * dt;
    if (aim && w.pos.distanceTo(aim) <= stepLen + 1.5) return aim.clone();
    w.pos.addScaledVector(v, dt);
    const gh = this.terrain.getHeight(w.pos.x, w.pos.z);
    if (w.pos.y <= gh + 0.4) return new THREE.Vector3(w.pos.x, gh, w.pos.z);
    return null;
  }

  detonate(p, type) {
    const W = WEAPONS[type];
    p.y = Math.max(p.y, this.terrain.getHeight(p.x, p.z));
    this.fx.explosion(p, W.size);
    const rep = this.world.explode(p, W.blast);
    this.audio?.boom(p, W.size);
    this.onImpact?.(p, type, rep);
  }
}
