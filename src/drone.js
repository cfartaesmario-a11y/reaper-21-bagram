import * as THREE from 'three';
import { DEG, KT, clamp, damp, angDiff } from './util.js';

const G = 9.81;
export const GEAR_HEIGHT = 1.74;      // altura del origen del avión sobre el suelo con el tren apoyado

const strutMat = new THREE.MeshStandardMaterial({ color: 0x9aa0a3, roughness: 0.4, metalness: 0.8 });
const tyreMat = new THREE.MeshStandardMaterial({ color: 0x17181a, roughness: 0.9 });

function strut(a, b, r) {
  const d = new THREE.Vector3().subVectors(b, a), len = d.length();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 8), strutMat);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  m.castShadow = true;
  return m;
}
function wheel(p, r, w) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 16).rotateZ(Math.PI / 2), tyreMat);
  m.position.copy(p); m.castShadow = true;
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.5, r * 0.5, w * 1.05, 10).rotateZ(Math.PI / 2), strutMat);
  m.add(hub);
  return m;
}

/**
 * Monta un MQ-9A a partir del modelo: separa hélice y torreta del sensor para animarlas
 * y añade el tren de aterrizaje (el modelo original viene en configuración de vuelo).
 * Marco del avión: -Z morro, +X ala derecha, +Y arriba.
 */
export function buildReaper(assets) {
  const root = new THREE.Group();
  const model = assets.spawn('mq9');
  root.add(model);
  root.updateMatrixWorld(true);

  let propMesh = null, spinner = null;
  const camMeshes = [];
  const box = new THREE.Box3(), size = new THREE.Vector3(), ctr = new THREE.Vector3();
  model.traverse((o) => {
    if (!o.isMesh) return;
    box.setFromObject(o); box.getSize(size); box.getCenter(ctr);
    if (o.material.name === 'CameraSystem_mat') camMeshes.push(o);
    if (ctr.z > 3.5 && size.z < 0.2 && size.x > 1.4) propMesh = o;
    if (ctr.z > 3.9 && size.x < 0.6 && size.y < 0.6 && size.z < 0.7) spinner = o;
  });

  // --- hélice
  const prop = new THREE.Group();
  if (propMesh) {
    const hub = new THREE.Vector3();
    box.setFromObject(spinner || propMesh).getCenter(hub);
    const pc = new THREE.Vector3(); box.setFromObject(propMesh).getCenter(pc);
    prop.position.set(hub.x, hub.y, pc.z);
    root.add(prop); prop.updateMatrixWorld(true);
    prop.attach(propMesh);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1.08, 28), new THREE.MeshBasicMaterial({ color: 0x20201c, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }));
    disc.visible = false; prop.add(disc);
    prop.userData = { blades: propMesh, disc };
  }

  // --- torreta del sensor (MTS-B)
  const turret = new THREE.Group();
  const sensorPos = new THREE.Vector3(0, -0.62, -2.33);
  if (camMeshes.length) {
    const b2 = new THREE.Box3(); camMeshes.forEach((m) => b2.expandByObject(m));
    b2.getCenter(sensorPos);
    turret.position.copy(sensorPos); root.add(turret); turret.updateMatrixWorld(true);
    camMeshes.forEach((m) => turret.attach(m));
    sensorPos.y = b2.min.y - 0.12;
  }

  // --- tren de aterrizaje
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const gear = new THREE.Group();
  const legs = [];
  const leg = (pivot, build) => { const g = new THREE.Group(); g.position.copy(pivot); build(g); gear.add(g); legs.push(g); };
  const wy = -GEAR_HEIGHT;
  leg(V(0, -0.3, -2.95), (g) => {
    g.add(strut(V(0, 0, 0), V(0, wy + 0.3 + 0.24, -0.06), 0.045));
    g.add(strut(V(0, -0.2, 0.45), V(0, -0.85, -0.02), 0.025));
    g.add(wheel(V(0, wy + 0.3 + 0.21, -0.06), 0.21, 0.12));
  });
  for (const s of [-1, 1]) leg(V(s * 0.32, -0.22, 0.95), (g) => {
    g.add(strut(V(0, 0, 0), V(s * 1.22, wy + 0.22 + 0.36, 0.1), 0.05));
    g.add(strut(V(s * 0.1, -0.02, -0.5), V(s * 0.75, -0.7, 0.06), 0.028));
    g.add(wheel(V(s * 1.3, wy + 0.22 + 0.3, 0.1), 0.3, 0.16));
  });
  root.add(gear);

  // --- luces de navegación
  const nav = (color, x, y, z) => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color })); m.position.set(x, y, z); root.add(m); return m; };
  nav(0xff2a1e, -10.0, 0.0, 0.42); nav(0x2aff5a, 10.0, 0.0, 0.42);
  const strobe = nav(0xffffff, 0, 1.28, 3.6);

  const setGear = (t) => {            // 0 = abajo, 1 = recogido
    legs.forEach((g) => { g.rotation.x = -t * 1.5; });
    gear.visible = t < 0.98;
  };
  return { root, prop, turret, sensorPos, setGear, strobe };
}

/** MQ-9A pilotable con modelo de vuelo simplificado (suficiente para rodar, despegar, orbitar y aterrizar). */
export class Drone {
  constructor(assets, terrain, airbase) {
    this.terrain = terrain; this.airbase = airbase;
    Object.assign(this, buildReaper(assets));
    this.group = this.root;
    this.pos = this.group.position;
    this.vStall = 31; this.vRot = 37; this.vMax = 118; this.tMax = 3.1;
    this.d0 = (this.tMax * 0.65) / (this.vMax * this.vMax);
    this.fwd = new THREE.Vector3();
    this.reset();
  }

  reset() {
    const s = this.airbase.spawn, w = this.airbase.localToWorld(s.x, 0, s.z);
    this.pos.set(w.x, this.groundLevel(w.x, w.z), w.z);
    this.heading = this.airbase.runwayHeading;
    this.pitch = 0; this.roll = 0; this.speed = 0; this.vs = 0;
    this.pitchRate = 0; this.rollRate = 0;
    this.throttle = 0; this.gearT = 0; this.gearTarget = 0; this.brake = true;
    this.onGround = true; this.wasAir = false; this.crashed = 0; this.crashReason = '';
    this.ap = { mode: 0, alt: 0, hdg: 0, spd: 0, dir: -1 };
    this.stall = false;
    this.apply();
  }

  groundLevel(x, z) {
    return this.terrain.getHeight(x, z) + (this.terrain.insideBase(x, z, 80) ? 0.09 : 0) + GEAR_HEIGHT;
  }
  get gearDown() { return this.gearT < 0.05; }
  get agl() { return this.pos.y - this.groundLevel(this.pos.x, this.pos.z); }

  toggleGear() { if (!this.onGround) this.gearTarget = this.gearTarget ? 0 : 1; }
  toggleBrake() { this.brake = !this.brake; }
  cycleAutopilot() {
    if (this.onGround) return;
    const a = this.ap; a.mode = (a.mode + 1) % 3;
    if (a.mode === 1) { a.alt = this.pos.y; a.hdg = this.heading; a.spd = this.speed; }
  }

  update(dt, inp) {
    if (dt <= 0) return;
    if (this.crashed > 0) { this.crashed -= dt; if (this.crashed <= 0) this.reset(); return; }
    const a = this.ap;
    const prevY = this.pos.y;
    let v = this.speed;

    // --- tren
    this.gearT = clamp(this.gearT + Math.sign(this.gearTarget - this.gearT) * dt / 3.2, 0, 1);
    if (Math.abs(this.gearTarget - this.gearT) < 0.01) this.gearT = this.gearTarget;

    // --- motor
    if (a.mode && !this.onGround) {
      a.spd = clamp(a.spd + inp.throttle * 6 * dt, 45, 112);
      this.throttle = clamp(this.throttle + clamp((a.spd - v) * 0.08, -0.5, 0.5) * dt, 0, 1);
    } else {
      this.throttle = clamp(this.throttle + inp.throttle * 0.45 * dt, 0, 1);
    }
    if (inp.throttle > 0 && this.onGround && this.throttle > 0.15) this.brake = false;

    const auth = clamp(v / 42, 0, 1.15);
    const lf = clamp((v / this.vStall) ** 2, 0, 1);
    this.stall = !this.onGround && lf < 0.999;

    if (this.onGround) {
      // rodadura
      a.mode = 0;
      this.roll = damp(this.roll, 0, 10, dt);
      const steer = (inp.roll + inp.yaw) * clamp(v / 6, 0, 1) * (28 * DEG) / (1 + v / 30);
      this.heading += steer * dt;
      this.pitchRate = damp(this.pitchRate, v > 26 ? inp.pitch * 9 * DEG * auth : 0, 4, dt);
      this.pitch = clamp(this.pitch + this.pitchRate * dt, 0, 11 * DEG);
      if (v < 26 || inp.pitch <= 0) this.pitch = damp(this.pitch, 0, 2.5, dt);
      let acc = this.throttle * this.tMax * (1 - 0.35 * v / this.vMax) - this.d0 * 1.6 * v * v;
      const fr = this.brake ? 5.0 : 0.14;
      v += acc * dt;
      v = Math.max(0, v - fr * dt);
      if (this.brake && this.throttle < 0.2 && v < 0.3) v = 0;
    } else {
      // --- piloto automático
      let pIn = inp.pitch, rIn = inp.roll;
      if (a.mode) {
        a.alt += inp.pitch * 18 * dt;             // S (morro arriba) sube la altitud objetivo
        if (a.mode === 1) a.hdg += inp.roll * 14 * DEG * dt;
        else if (inp.roll) a.dir = Math.sign(inp.roll);
        const wantVs = clamp((a.alt - this.pos.y) * 0.18, -9, 9);
        const wantPitch = Math.asin(clamp(wantVs / Math.max(v, 30), -0.3, 0.3)) + 0.02;
        this.pitch = damp(this.pitch, wantPitch, 1.1, dt);
        const wantRoll = a.mode === 1 ? clamp(angDiff(a.hdg, this.heading) * 1.4, -25 * DEG, 25 * DEG) : a.dir * 18 * DEG;
        this.roll = damp(this.roll, wantRoll, 1.4, dt);
        pIn = 0; rIn = 0; this.pitchRate = 0; this.rollRate = 0;
      } else {
        this.pitchRate = damp(this.pitchRate, pIn * 13 * DEG * auth, 5, dt);
        this.rollRate = damp(this.rollRate, rIn * 42 * DEG * auth, 5, dt);
        this.roll += this.rollRate * dt;
        if (!rIn) this.roll = damp(this.roll, 0, 0.4, dt);
        this.pitch += this.pitchRate * dt;
        this.pitch -= (1 / Math.cos(this.roll) - 1) * 3.5 * DEG * dt;
        // protección de envolvente (como el control de vuelo real del RPA): limita el cabeceo
        // y baja el morro al acercarse a la velocidad de pérdida
        const vProt = this.vStall * 1.28;
        if (v < vProt && this.pitch > -4 * DEG) this.pitch -= (vProt - v) * 1.6 * DEG * dt;
        this.pitch = clamp(this.pitch, -28 * DEG, 22 * DEG);
      }
      // pérdida: el morro cae y el avión se hunde
      this.pitch -= (1 - lf) * 24 * DEG * dt;
      this.pitch = clamp(this.pitch, -50 * DEG, 45 * DEG);
      this.roll = clamp(this.roll, -72 * DEG, 72 * DEG);
      this.heading += (G * Math.tan(this.roll) / Math.max(v, 25) + inp.yaw * 6 * DEG * auth) * dt;

      const drag = this.d0 * (1 + 0.6 * (1 - this.gearT)) * v * v + 0.22 + 1.3 * (1 / Math.cos(this.roll) - 1);
      const acc = this.throttle * this.tMax * (1 - 0.35 * v / this.vMax) - drag - G * Math.sin(this.pitch);
      v = Math.max(0, v + acc * dt);
    }
    this.heading = (this.heading + Math.PI * 2) % (Math.PI * 2);
    this.speed = v;

    // --- integración
    const cp = Math.cos(this.pitch);
    this.fwd.set(Math.sin(this.heading) * cp, Math.sin(this.pitch), -Math.cos(this.heading) * cp);
    this.pos.addScaledVector(this.fwd, v * dt);
    this.pos.y -= (1 - lf) * 22 * dt;

    const ground = this.groundLevel(this.pos.x, this.pos.z);
    if (this.pos.y <= ground + 0.02) {
      const vsNow = (this.pos.y - prevY) / dt;
      if (this.wasAir) {
        const slope = this.terrain.slope(this.pos.x, this.pos.z, 40);
        let why = '';
        if (!this.gearDown) why = 'TREN RECOGIDO';
        else if (vsNow < -6.5) why = 'IMPACTO CONTRA EL TERRENO';
        else if (Math.abs(this.roll) > 16 * DEG) why = 'TOMA CON ALABEO EXCESIVO';
        else if (slope > 0.09) why = 'TERRENO NO APTO';
        if (why) { this.crash(why); return; }
      }
      this.pos.y = ground;
      this.onGround = true;
    } else {
      this.onGround = this.pos.y - ground < 0.06;
    }
    this.wasAir = this.pos.y - ground > 0.4;
    this.vs = damp(this.vs, (this.pos.y - prevY) / dt, 6, dt);

    // límite del área de operaciones
    const r = Math.hypot(this.pos.x, this.pos.z);
    this.outOfArea = r > this.terrain.half - 2500;
    if (r > this.terrain.half - 600) { this.crash('ENLACE PERDIDO · FUERA DEL ÁREA'); return; }

    this.apply(dt);
  }

  crash(reason) {
    this.crashed = 4; this.crashReason = reason; this.speed = 0; this.throttle = 0; this.ap.mode = 0;
  }

  apply(dt = 0) {
    this.group.rotation.set(this.pitch, -this.heading, -this.roll, 'YXZ');
    this.setGear(this.gearT);
    const rpm = 0.22 + this.throttle * 0.78;
    this.prop.rotation.z += rpm * 95 * dt;
    if (this.prop.userData.disc) { this.prop.userData.disc.visible = true; this.prop.userData.disc.material.opacity = 0.1 + rpm * 0.16; }
    this.strobe.visible = (performance.now() % 1200) < 90;
  }

  // lecturas para la instrumentación
  get knots() { return this.speed / KT; }
  get headingDeg() { return (this.heading / DEG + 360) % 360; }
}
