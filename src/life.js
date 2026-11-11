import * as THREE from 'three';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';
import { rng } from './util.js';
import { buildReaper, GEAR_HEIGHT } from './drone.js';

/** Presencia militar viva: convoyes por los viales, centinelas, patrullas a pie y aeronaves en sus refugios. */
export function createLife({ assets, airbase }) {
  const base = airbase.group;
  const R = rng(99);
  const Y = 0.05;

  // ---------- RPA estacionados en los refugios
  airbase.shelters.slice(0, 3).forEach((s, i) => {
    const r = buildReaper(assets);
    r.root.position.set(s.x, GEAR_HEIGHT + 0.07, s.z);
    r.root.rotation.y = Math.PI / 2 + (i - 1) * 0.02;      // morro hacia la rodadura (-x)
    r.setGear(0);
    base.add(r.root);
  });

  // ---------- vehículos en ruta
  const movers = [];
  const defs = [['humvee', 0, 0.02, 9], ['mrap', 0, 0.03, 9], ['truck', 0, 0.52, 8], ['hilux', 1, 0.2, 11], ['humvee', 2, 0.55, 9], ['mrap', 1, 0.7, 7.5], ['hilux', 2, 0.1, 10]];
  for (const [name, ri, frac, speed] of defs) {
    const pts = airbase.routes[ri].map(([x, z]) => new THREE.Vector2(x, z));
    const segs = pts.map((p, i) => p.distanceTo(pts[(i + 1) % pts.length]));
    const total = segs.reduce((a, b) => a + b, 0);
    const obj = assets.spawn(name);
    base.add(obj);
    movers.push({ obj, pts, segs, total, s: frac * total, speed });
  }
  const at = (m, s, out) => {
    s = ((s % m.total) + m.total) % m.total;
    for (let i = 0; i < m.segs.length; i++) {
      if (s <= m.segs[i]) return out.copy(m.pts[i]).lerp(m.pts[(i + 1) % m.pts.length], s / m.segs[i]);
      s -= m.segs[i];
    }
    return out.copy(m.pts[0]);
  };
  const a2 = new THREE.Vector2(), b2 = new THREE.Vector2();

  // ---------- soldados
  const proto = assets.models.soldier;
  const clip = (n) => THREE.AnimationClip.findByName(proto.animations, n);
  const soldiers = [];
  let heatDone = false;
  const makeSoldier = (anim) => {
    const obj = skeletonClone(proto.scene);
    obj.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = true;
      if (!heatDone) assets.heatMaterials.push({ mat: o.material, heat: 0.95, emissive: o.material.emissive.clone(), intensity: o.material.emissiveIntensity, map: o.material.emissiveMap });
    });
    heatDone = true;
    const mixer = new THREE.AnimationMixer(obj);
    const act = mixer.clipAction(clip(anim)); act.play();
    mixer.update(R() * 3);
    base.add(obj);
    const s = { obj, mixer, world: new THREE.Vector3() };
    soldiers.push(s);
    return s;
  };
  const FACE = 0;             // el modelo ya mira a -Z
  for (const p of airbase.posts) { const s = makeSoldier('Idle'); s.obj.position.set(p.x, Y, p.z); s.obj.rotation.y = p.ry + FACE; }
  for (const [a, b] of airbase.patrols) for (let k = 0; k < 2; k++) {
    const s = makeSoldier('Walk');
    const A = new THREE.Vector2(a[0], a[1]), B = new THREE.Vector2(b[0], b[1]);
    const dir = B.clone().sub(A).normalize(), side = new THREE.Vector2(-dir.y, dir.x).multiplyScalar(k ? 0.9 : -0.9);
    s.patrol = { A: A.add(side), B: B.add(side), len: A.distanceTo(B), t: R() * 0.9 + k * 0.012, dirSign: 1, speed: 1.45 };
  }

  const tmp = new THREE.Vector3();
  const update = (dt, focus) => {
    for (const m of movers) {
      m.s += m.speed * dt;
      at(m, m.s, a2); at(m, m.s + 7, b2);
      const dx = b2.x - a2.x, dz = b2.y - a2.y, l = Math.hypot(dx, dz) || 1;
      m.obj.position.set(a2.x - (dz / l) * 1.8, Y, a2.y + (dx / l) * 1.8);
      m.obj.rotation.y = Math.atan2(-dx, -dz);
    }
    for (const s of soldiers) {
      if (s.patrol) {
        const p = s.patrol;
        p.t += (p.dirSign * p.speed * dt) / p.len;
        if (p.t > 1) { p.t = 1; p.dirSign = -1; } else if (p.t < 0) { p.t = 0; p.dirSign = 1; }
        s.obj.position.set(p.A.x + (p.B.x - p.A.x) * p.t, Y, p.A.y + (p.B.y - p.A.y) * p.t);
        s.obj.rotation.y = Math.atan2(-(p.B.x - p.A.x) * p.dirSign, -(p.B.y - p.A.y) * p.dirSign) + FACE;
      }
      // animar el esqueleto solo cerca del punto de interés
      s.obj.getWorldPosition(tmp);
      if (tmp.distanceToSquared(focus) < 650 * 650) s.mixer.update(dt);
    }
    airbase.radar.rotation.y -= dt * 1.3;
  };
  return { update, soldiers, movers };
}
