import * as THREE from 'three';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';
import { CFG } from './config.js';
import { clamp, damp } from './util.js';

/** El operador a pie por la base: cámara en tercera persona, andar/correr y colisiones con edificios. */
export class Player {
  constructor({ assets, airbase, terrain, scene }) {
    this.terrain = terrain; this.airbase = airbase;
    const proto = assets.models.soldier;
    this.obj = skeletonClone(proto.scene);
    this.obj.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
    this.mixer = new THREE.AnimationMixer(this.obj);
    this.act = {}; for (const n of ['Idle', 'Walk', 'Run']) this.act[n] = this.mixer.clipAction(THREE.AnimationClip.findByName(proto.animations, n));
    this.cur = 'Idle'; this.act.Idle.play();
    scene.add(this.obj);
    this.pos = this.obj.position;
    this.yaw = 0; this.camYaw = 0; this.camPitch = 0.16; this.camDist = 4.2;
    this.speed = 0; this.step = 0;
    this.obj.visible = false;
    this._c = new THREE.Vector3();
  }

  /** Coloca al personaje en coordenadas locales de la base. */
  place(lx, lz, yaw = 0) {
    this.terrain.toWorld(lx, lz, this.pos); this.pos.y = this.terrain.H0 + 0.06;
    this.yaw = this.camYaw = yaw; this.obj.rotation.y = -yaw; this.obj.visible = true;
  }
  look(dx, dy) { this.camYaw += dx * 0.0024; this.camPitch = clamp(this.camPitch + dy * 0.002, -0.35, 1.1); }
  zoom(d) { this.camDist = clamp(this.camDist * (d < 0 ? 0.9 : 1.1), 2.2, 9); }
  setAnim(n) { if (this.cur === n) return; this.act[this.cur].fadeOut(0.18); this.act[n].reset().fadeIn(0.18).play(); this.cur = n; }

  update(dt, inp, camera) {
    const f = inp.fwd, s = inp.strafe;
    const moving = f || s;
    const run = moving && inp.run;
    const target = moving ? (run ? 5.2 : 1.75) : 0;
    this.speed = damp(this.speed, target, 8, dt);
    if (moving) {
      const a = this.camYaw + Math.atan2(s, f);
      let d = a - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * Math.min(1, dt * 10);
    }
    if (this.speed > 0.05) {
      const nx = this.pos.x + Math.sin(this.yaw) * this.speed * dt, nz = this.pos.z - Math.cos(this.yaw) * this.speed * dt;
      this.collide(nx, nz);
      this.step += this.speed * dt;
    }
    this.obj.rotation.y = -this.yaw;
    this.setAnim(this.speed < 0.25 ? 'Idle' : this.speed > 3 ? 'Run' : 'Walk');
    this.act.Walk.timeScale = clamp(this.speed / 1.6, 0.6, 1.4); this.act.Run.timeScale = clamp(this.speed / 4.8, 0.7, 1.25);
    this.mixer.update(dt);

    // cámara al hombro
    const cp = Math.cos(this.camPitch), bx = -Math.sin(this.camYaw), bz = Math.cos(this.camYaw);
    const head = this._c.set(this.pos.x + Math.cos(this.camYaw) * 0.45, this.pos.y + 1.62, this.pos.z + Math.sin(this.camYaw) * 0.45);
    camera.position.set(head.x + bx * cp * this.camDist, head.y + Math.sin(this.camPitch) * this.camDist, head.z + bz * cp * this.camDist);
    camera.position.y = Math.max(camera.position.y, this.terrain.H0 + 0.35);
    camera.lookAt(head.x - bx * 6, head.y - Math.sin(this.camPitch) * 2.5, head.z - bz * 6);
  }

  /** Mueve al personaje resolviendo colisiones con los rectángulos de los edificios (coordenadas locales). */
  collide(nx, nz) {
    let [lx, lz] = this.terrain.toLocal(nx, nz);
    const W = CFG.wall, r = 0.45;
    lx = clamp(lx, W.x0 + 3, W.x1 - 3); lz = clamp(lz, W.z0 + 3, W.z1 - 3);
    for (const c of this.airbase.colliders) {
      const dx = lx - c.x, dz = lz - c.z, px = c.hw + r - Math.abs(dx), pz = c.hd + r - Math.abs(dz);
      if (px > 0 && pz > 0) { if (px < pz) lx += Math.sign(dx || 1) * px; else lz += Math.sign(dz || 1) * pz; }
    }
    this.terrain.toWorld(lx, lz, this._c);
    this.pos.x = this._c.x; this.pos.z = this._c.z;
  }

  /** Distancia a un punto local de la base. */
  distLocal(lx, lz) { const [x, z] = this.terrain.toLocal(this.pos.x, this.pos.z); return Math.hypot(x - lx, z - lz); }
}
