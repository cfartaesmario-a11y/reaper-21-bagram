import * as THREE from 'three';
import { CFG } from './config.js';
import { damp } from './util.js';

/**
 * Tráfico aéreo de la base: un C-130 que aterriza, rueda a plataforma y vuelve a despegar,
 * y una pareja de AH-64 patrullando el perímetro a baja cota.
 */
export function createTraffic({ assets, airbase, terrain, scene }) {
  const L = CFG.runwayLength, H0 = terrain.H0;
  const toW = (x, h, z, out) => { terrain.toWorld(x, z, out); out.y = H0 + h; return out; };

  // ------------------------------------------------------------------ C-130
  const herc = assets.spawn('c130');
  herc.visible = false; scene.add(herc);
  // [x, altura, z, velocidad, espera al llegar]
  const ROUTE = [
    [0, 500, 9500, 72], [0, 26, L / 2 + 380, 64], [0, 0.1, L / 2 - 260, 56], [0, 0.1, -500, 16], [0, 0.1, -880, 9],
    [200, 0.1, -900, 9], [200, 0.1, -560, 10], [300, 0.1, -535, 6], [420, 0.1, -535, 4, 55],
    [300, 0.1, -535, 6], [200, 0.1, -500, 10], [200, 0.1, L / 2 - 30, 16], [30, 0.1, L / 2 - 12, 6], [0, 0.1, L / 2 - 60, 4, 9],
    [0, 0.1, 500, 62], [0, 60, -500, 70], [0, 1100, -10500, 92, 70],
  ];
  const hs = { i: 0, wait: 12, speed: 72, pos: new THREE.Vector3(), yaw: 0, pitch: 0, active: false };
  const a3 = new THREE.Vector3(), b3 = new THREE.Vector3(), d3 = new THREE.Vector3();
  const runwayBusy = (drone) => {
    const [lx, lz] = terrain.toLocal(drone.pos.x, drone.pos.z);
    return drone.agl < 60 && Math.abs(lx) < 70 && Math.abs(lz) < L / 2 + 400;
  };
  const startCycle = () => { hs.i = 1; toW(...ROUTE[0].slice(0, 3), hs.pos); hs.speed = ROUTE[0][3]; hs.active = true; herc.visible = true; hs.yaw = CFG.heading; };
  const updateHerc = (dt, drone) => {
    if (hs.wait > 0) {
      hs.wait -= dt;
      // no entra en pista (ni aparece en final) con el RPA del jugador ocupándola
      if (hs.wait <= 0 && (!hs.active || hs.i === 14) && runwayBusy(drone)) hs.wait = 6;
      if (hs.wait <= 0 && !hs.active) startCycle();
      if (hs.active) herc.position.copy(hs.pos);
      return;
    }
    const w = ROUTE[hs.i];
    toW(w[0], w[1], w[2], b3);
    d3.subVectors(b3, hs.pos); const dist = d3.length();
    hs.speed = damp(hs.speed, w[3], w[3] > hs.speed ? 0.35 : 0.5, dt);
    const s = hs.speed * dt;
    if (dist <= s + 0.5) {
      hs.pos.copy(b3); hs.wait = w[4] || 0; hs.i++;
      if (hs.i >= ROUTE.length) { hs.active = false; herc.visible = false; hs.wait = 75; }
    } else {
      hs.pos.addScaledVector(d3, s / dist);
      const hor = Math.hypot(d3.x, d3.z);
      if (hor > 1) { let dy = Math.atan2(d3.x, -d3.z) - hs.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); hs.yaw += dy * Math.min(1, dt * 1.2); }
      const airborne = hs.pos.y - H0 > 1.5;
      hs.pitch = damp(hs.pitch, airborne ? Math.atan2(d3.y, hor) + (d3.y < 0 ? 0.09 : 0.05) : 0, 1.5, dt);
    }
    herc.position.copy(hs.pos);
    herc.rotation.set(hs.pitch, -hs.yaw, 0, 'YXZ');
  };

  // ------------------------------------------------------------------ AH-64
  const helos = [];
  const rotorMat = new THREE.MeshBasicMaterial({ color: 0x1b1b18, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false });
  for (let k = 0; k < 2; k++) {
    const g = new THREE.Group(), m = assets.spawn('apache');
    const bb = new THREE.Box3().setFromObject(m);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(7.3, 30).rotateX(-Math.PI / 2), rotorMat);
    disc.position.set(0, bb.max.y - 0.35, -1.4);
    g.add(m, disc); scene.add(g);
    helos.push({ g, th: 1.1 - k * 0.035, off: k * 55, alt: 120 + k * 18 });
  }
  const C = { x: 380, z: 0, rx: 1750, rz: 3050 };
  const updateHelos = (dt, t) => {
    for (const h of helos) {
      const rx = C.rx + h.off, rz = C.rz + h.off;
      const speed = 44, r = Math.hypot(rx * Math.sin(h.th), rz * Math.cos(h.th));
      h.th += (speed / r) * dt;
      const lx = C.x + Math.cos(h.th) * rx, lz = C.z + Math.sin(h.th) * rz;
      const tx = -Math.sin(h.th) * rx, tz = Math.cos(h.th) * rz;
      toW(lx, 0, lz, a3); toW(lx + tx, 0, lz + tz, b3);
      const alt = terrain.getHeight(a3.x, a3.z) + h.alt + Math.sin(t * 0.21 + h.off) * 14;
      h.g.position.set(a3.x, Math.max(alt, H0 + 60), a3.z);
      const yaw = Math.atan2(b3.x - a3.x, -(b3.z - a3.z));
      h.g.rotation.set(-0.09, -yaw, -0.2, 'YXZ');
    }
  };

  let time = 0;
  return {
    herc, helos,
    update(dt, drone) { time += dt; updateHerc(dt, drone); updateHelos(dt, time); },
  };
}
