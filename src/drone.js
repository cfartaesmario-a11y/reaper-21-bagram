import * as THREE from 'three';
import { DEG, KT, clamp, damp, angDiff } from './util.js';

const G = 9.81;
export const GEAR_HEIGHT = 1.74;      // altura del origen del avión sobre el suelo con el tren apoyado
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _m = new THREE.Matrix4();

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
  m.add(new THREE.Mesh(new THREE.CylinderGeometry(r * 0.5, r * 0.5, w * 1.05, 10).rotateZ(Math.PI / 2), strutMat));
  return m;
}

/**
 * Monta un MQ-9A a partir del modelo: separa hélice y torreta del sensor para animarlas,
 * localiza las armas bajo las alas y añade el tren de aterrizaje.
 * Marco del avión: -Z morro, +X ala derecha, +Y arriba.
 */
export function buildReaper(assets) {
  const root = new THREE.Group();
  const model = assets.spawn('mq9');
  root.add(model);
  root.updateMatrixWorld(true);

  let propMesh = null, spinner = null;
  const camMeshes = [];
  const stores = { hellfire: [], gbu: [] };
  const box = new THREE.Box3(), size = new THREE.Vector3(), ctr = new THREE.Vector3();
  model.traverse((o) => {
    if (!o.isMesh) return;
    box.setFromObject(o); box.getSize(size); box.getCenter(ctr);
    if (o.material.name === 'CameraSystem_mat') camMeshes.push(o);
    if (o.material.name === 'Rocket_mat') stores.hellfire.push(o);
    if (o.material.name === 'Big_Rocket_mat') stores.gbu.push(o);
    if (ctr.z > 3.5 && size.z < 0.2 && size.x > 1.4) propMesh = o;
    if (ctr.z > 3.9 && size.x < 0.6 && size.y < 0.6 && size.z < 0.7) spinner = o;
  });

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

  const turret = new THREE.Group();
  const sensorPos = new THREE.Vector3(0, -0.62, -2.33);
  if (camMeshes.length) {
    const b2 = new THREE.Box3(); camMeshes.forEach((m) => b2.expandByObject(m));
    b2.getCenter(sensorPos);
    turret.position.copy(sensorPos); root.add(turret); turret.updateMatrixWorld(true);
    camMeshes.forEach((m) => turret.attach(m));
    sensorPos.y = b2.min.y - 0.12;
  }

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

  const nav = (color, x, y, z) => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color })); m.position.set(x, y, z); root.add(m); return m; };
  nav(0xff2a1e, -10.0, 0.0, 0.42); nav(0x2aff5a, 10.0, 0.0, 0.42);
  const strobe = nav(0xffffff, 0, 1.28, 3.6);

  const setGear = (t) => {            // 0 = abajo, 1 = recogido
    legs.forEach((g) => { g.rotation.x = -t * 1.5; });
    gear.visible = t < 0.98;
  };
  return { root, prop, turret, sensorPos, setGear, strobe, stores };
}

// ---- constantes aerodinámicas (MQ-9A a ~1500 m de altitud de campo)
const RHO = 1.02, WING = 38, MASS = 4200, WEIGHT = MASS * G;
const CL0 = 0.25, CLA = 5.2, A_MAX = 14 * DEG, CL_MAX = CL0 + CLA * A_MAX;
const CD0 = 0.022, CD_GEAR = 0.018, K_IND = 0.022;
const T_STATIC = 11000, POWER = 537000;      // empuje estático (N) y potencia útil de hélice (W)
const UP = new THREE.Vector3(0, 1, 0);

/**
 * MQ-9A pilotable. Modelo de vuelo de masa puntual con fuerzas reales (sustentación, resistencia
 * parásita e inducida, empuje de turbohélice dependiente de la velocidad, gravedad) y mando por
 * factor de carga, como el control de vuelo del aparato real. El avión entra en pérdida, pierde
 * energía en los virajes cerrados y necesita velocidad para rotar.
 */
export class Drone {
  constructor(assets, terrain, airbase) {
    this.terrain = terrain; this.airbase = airbase;
    Object.assign(this, buildReaper(assets));
    this.group = this.root;
    this.pos = this.group.position;
    this.vel = new THREE.Vector3();
    this.fwd = new THREE.Vector3(); this.upv = new THREE.Vector3(0, 1, 0); this.right = new THREE.Vector3(1, 0, 0);
    this.vStall = Math.sqrt((2 * WEIGHT) / (RHO * WING * CL_MAX));
    this.reset();
  }

  reset(air = null) {
    const s = this.airbase.spawn, w = this.airbase.localToWorld(s.x, 0, s.z);
    this.heading = this.airbase.runwayHeading;
    this.pos.set(w.x, this.groundLevel(w.x, w.z), w.z);
    this.vel.set(0, 0, 0); this.fwd.set(0, 0, 0);
    this.alpha = 0; this.mu = 0; this.muRate = 0; this.gamma = 0;
    this.pitch = 0; this.roll = 0; this.speed = 0; this.vs = 0; this.nz = 1;
    this.throttle = 0; this.gearT = 0; this.gearTarget = 0; this.brake = true;
    this.onGround = true; this.crashed = 0; this.crashReason = ''; this.hardLanding = 0;
    this.ap = { mode: 0, alt: 0, hdg: 0, spd: 0, dir: 1, center: new THREE.Vector3(), radius: 2600 };
    this.stall = false; this.outOfArea = false;
    this.stores.hellfire.forEach((m) => { m.visible = true; }); this.stores.gbu.forEach((m) => { m.visible = true; });
    if (air) this.placeAirborne(air);
    this.apply(0);
  }

  /** Coloca el avión ya en vuelo (relevo del equipo de lanzamiento): {x, z, alt, hdg, spd}. */
  placeAirborne({ x, z, alt, hdg, spd = 72 }) {
    this.pos.set(x, alt, z); this.heading = hdg;
    this.vel.set(Math.sin(hdg) * spd, 0, -Math.cos(hdg) * spd);
    this.speed = spd; this.onGround = false; this.brake = false; this.throttle = 0.6;
    this.gearT = 1; this.gearTarget = 1; this.alpha = 3 * DEG; this.mu = 0;
    this.ap.mode = 1; this.ap.alt = alt; this.ap.hdg = hdg; this.ap.spd = spd;
    this.fwd.set(Math.sin(hdg), 0, -Math.cos(hdg)); this.upv.set(0, 1, 0); this.right.set(Math.cos(hdg), 0, Math.sin(hdg));
  }

  groundLevel(x, z) {
    return this.terrain.getHeight(x, z) + (this.terrain.insideBase(x, z, 80) ? 0.09 : 0) + GEAR_HEIGHT;
  }
  get gearDown() { return this.gearT < 0.05; }
  get agl() { return this.pos.y - this.groundLevel(this.pos.x, this.pos.z); }
  get knots() { return this.speed / KT; }
  get headingDeg() { return (this.heading / DEG + 360) % 360; }

  toggleGear() { if (!this.onGround) this.gearTarget = this.gearTarget ? 0 : 1; }
  toggleBrake() { this.brake = !this.brake; }
  /** OFF → RUMBO/ALTITUD → ÓRBITA alrededor de `center` (punto del sensor) */
  cycleAutopilot(center) {
    if (this.onGround) return;
    const a = this.ap; a.mode = (a.mode + 1) % 3;
    if (a.mode === 1) { a.alt = this.pos.y; a.hdg = this.heading; a.spd = Math.max(this.speed, 55); }
    if (a.mode === 2) { a.center.copy(center || this.pos); a.radius = clamp(Math.hypot(a.center.x - this.pos.x, a.center.z - this.pos.z), 1800, 6000); }
  }
  /** Engancha el mantenimiento de rumbo y altitud (al dejar los mandos). */
  holdHere() { if (!this.onGround && !this.ap.mode) { this.ap.mode = 1; this.ap.alt = this.pos.y; this.ap.hdg = this.heading; this.ap.spd = Math.max(this.speed, 55); } }

  update(dt, inp) {
    if (dt <= 0) return;
    if (this.crashed > 0) { this.crashed -= dt; if (this.crashed <= 0) this.reset(); return; }
    if (this.hardLanding > 0) this.hardLanding -= dt;
    const a = this.ap;
    this.gearT = clamp(this.gearT + Math.sign(this.gearTarget - this.gearT) * dt / 3.2, 0, 1);

    // motor (con piloto automático, automando de gases sobre la velocidad seleccionada)
    if (a.mode && !this.onGround) {
      a.spd = clamp(a.spd + inp.throttle * 6 * dt, 48, 105);
      this.throttle = clamp(this.throttle + clamp((a.spd - this.speed) * 0.06, -0.4, 0.4) * dt, 0.05, 1);
    } else this.throttle = clamp(this.throttle + inp.throttle * 0.45 * dt, 0, 1);
    if (inp.throttle > 0 && this.onGround && this.throttle > 0.15) this.brake = false;

    if (this.onGround) this.groundStep(dt, inp); else this.airStep(dt, inp);
    if (this.crashed > 0) return;

    this.pitch = Math.asin(clamp(this.fwd.y, -1, 1));
    this.heading = (Math.atan2(this.fwd.x, -this.fwd.z) + Math.PI * 2) % (Math.PI * 2);
    this.roll = this.mu;
    this.vs = damp(this.vs, this.vel.y, 8, dt);

    const r = Math.hypot(this.pos.x, this.pos.z);
    this.outOfArea = r > this.terrain.half - 2500;
    if (r > this.terrain.half - 600) { this.crash('ENLACE PERDIDO · FUERA DEL ÁREA'); return; }
    this.apply(dt);
  }

  thrust(v) { return (0.04 + 0.96 * this.throttle) * Math.min(T_STATIC, POWER / Math.max(v, 1)); }

  groundStep(dt, inp) {
    this.ap.mode = 0;
    let v = this.speed, h = this.heading;
    const q = 0.5 * RHO * v * v;
    this.mu = damp(this.mu, 0, 10, dt);
    h += (inp.roll + inp.yaw) * clamp(v / 5, 0, 1) * ((30 * DEG) / (1 + v / 22)) * dt;
    // rotación: el timón de profundidad solo levanta el morro con presión dinámica suficiente
    const auth = clamp((v - this.vStall * 0.72) / 6, 0, 1);
    this.alpha = damp(this.alpha, inp.pitch > 0 ? 10 * DEG * auth : 0, inp.pitch > 0 ? 1.6 : 3, dt);
    const cl = CL0 * 0.6 + CLA * this.alpha;
    const lift = q * WING * cl, drag = q * WING * (CD0 + CD_GEAR + K_IND * cl * cl);
    const wow = Math.max(0, WEIGHT - lift);                       // peso sobre las ruedas
    let acc = (this.thrust(v) - drag - wow * (this.brake ? 0.42 : 0.018)) / MASS;
    if (v < 0.4 && acc < 0) { acc = 0; v = 0; }
    v = Math.max(0, v + acc * dt);
    this.speed = v;
    const sh = Math.sin(h), ch = Math.cos(h);
    this.pos.x += sh * v * dt; this.pos.z -= ch * v * dt;
    this.pos.y = this.groundLevel(this.pos.x, this.pos.z);
    this.vel.set(sh * v, 0, -ch * v);
    this.fwd.set(sh * Math.cos(this.alpha), Math.sin(this.alpha), -ch * Math.cos(this.alpha));
    this.right.set(ch, 0, sh); this.upv.crossVectors(this.right, this.fwd).normalize();
    this.gamma = 0; this.nz = 1; this.stall = false;
    if (lift > WEIGHT * 1.02 && this.alpha > 3 * DEG) { this.onGround = false; this.vel.y = 0.6; }   // despegue
    if (!this.terrain.insideBase(this.pos.x, this.pos.z, 60) && v > 18 && this.terrain.slope(this.pos.x, this.pos.z, 30) > 0.07) this.crash('SALIDA DE PISTA');
  }

  airStep(dt, inp) {
    const a = this.ap, vel = this.vel;
    const v = Math.max(vel.length(), 1);
    const q = 0.5 * RHO * v * v;
    const vhat = new THREE.Vector3().copy(vel).divideScalar(v);
    this.gamma = Math.asin(clamp(vhat.y, -1, 1));
    const track = Math.atan2(vhat.x, -vhat.z);
    const right0 = new THREE.Vector3().crossVectors(vhat, UP);
    if (right0.lengthSq() < 1e-4) right0.copy(this.right);
    right0.y = 0; right0.normalize();
    const up0 = new THREE.Vector3().crossVectors(right0, vhat).normalize();

    // mandos → alabeo y factor de carga pedido
    const qk = clamp(q / 2600, 0.15, 1.15);
    let nzCmd;
    if (a.mode) {
      a.alt += inp.pitch * 18 * dt;
      let wantTrack;
      if (a.mode === 1) { a.hdg += inp.roll * 14 * DEG * dt; wantTrack = a.hdg; }
      else {
        if (inp.roll) a.dir = Math.sign(inp.roll);
        const dx = a.center.x - this.pos.x, dz = a.center.z - this.pos.z, d = Math.hypot(dx, dz);
        wantTrack = Math.atan2(dx, -dz) - a.dir * (Math.PI / 2 - Math.atan(clamp((d - a.radius) / 900, -1.2, 1.2)));
      }
      let wantMu = clamp(angDiff(wantTrack, track) * 1.6, -32 * DEG, 32 * DEG);
      if (a.mode === 2) wantMu = clamp(wantMu + a.dir * Math.atan((v * v) / (G * a.radius)) * 0.9, -35 * DEG, 35 * DEG);
      this.mu = damp(this.mu, wantMu, 1.3, dt); this.muRate = 0;
      const wantGamma = clamp((a.alt - this.pos.y) * 0.0028, -0.11, 0.11);
      nzCmd = clamp(Math.cos(this.gamma) / Math.cos(this.mu) + (wantGamma - this.gamma) * (v / G) * 1.3, 0.3, 2.2);
    } else {
      this.muRate = damp(this.muRate, inp.roll * 62 * DEG * qk, 4.5, dt);
      this.mu += this.muRate * dt;
      if (!inp.roll) this.mu -= this.mu * 0.12 * dt;                  // ligera estabilidad lateral (diedro)
      this.mu = clamp(this.mu, -78 * DEG, 78 * DEG);
      const hold = Math.cos(this.gamma) + (1 / Math.cos(this.mu) - 1) * 0.65;   // mantiene la senda con mando neutro
      nzCmd = clamp(hold + inp.pitch * 1.5, -0.5, 3.0);
    }

    // ángulo de ataque necesario y aerodinámica
    // limitador de ángulo de ataque del control de vuelo: el avión se hunde antes que entrar en pérdida profunda
    const aCmd = clamp(((nzCmd * WEIGHT) / (q * WING) - CL0) / CLA, -5 * DEG, A_MAX - 1.2 * DEG);
    this.alpha = damp(this.alpha, aCmd, 3.2, dt);
    const cl = this.alpha <= A_MAX ? CL0 + CLA * this.alpha : CL_MAX - (this.alpha - A_MAX) * 5.5;
    const lift = q * WING * cl;
    const drag = q * WING * (CD0 + CD_GEAR * (1 - this.gearT) + K_IND * cl * cl + (this.alpha > A_MAX ? 0.08 : 0));
    this.nz = lift / WEIGHT;
    this.stall = this.alpha > A_MAX - 2.2 * DEG && this.nz < 0.93 && nzCmd > this.nz + 0.05;
    if (this.stall && !a.mode) this.mu += Math.sin(this.pos.x * 0.37 + this.pos.y) * 9 * DEG * dt;   // caída de ala

    const cm = Math.cos(this.mu), sm = Math.sin(this.mu), ca = Math.cos(this.alpha), sa = Math.sin(this.alpha);
    const liftDir = _b.copy(up0).multiplyScalar(cm).addScaledVector(right0, sm);
    this.fwd.copy(vhat).multiplyScalar(ca).addScaledVector(liftDir, sa).normalize();
    this.upv.copy(liftDir).multiplyScalar(ca).addScaledVector(vhat, -sa).normalize();
    const T = this.thrust(v);
    vel.addScaledVector(liftDir, (lift / MASS) * dt).addScaledVector(vhat, (-drag / MASS) * dt).addScaledVector(this.fwd, (T / MASS) * dt);
    vel.y -= G * dt;
    vel.addScaledVector(right0, inp.yaw * 1.6 * qk * dt);
    // turbulencia ligera, más marcada cerca del relieve
    const tb = clamp(1 - this.agl / 1500, 0.15, 1) * 0.35, t = performance.now() * 0.001;
    vel.y += Math.sin(t * 2.3 + this.pos.x * 0.01) * tb * dt;
    vel.addScaledVector(right0, Math.sin(t * 1.7 + 2.1) * tb * 0.6 * dt);

    this.pos.addScaledVector(vel, dt);
    this.speed = vel.length();
    this.right.crossVectors(this.upv, _a.copy(this.fwd).negate()).normalize();

    // contacto con el suelo
    const ground = this.groundLevel(this.pos.x, this.pos.z);
    if (this.pos.y <= ground) {
      const sink = -vel.y, pitch = Math.asin(clamp(this.fwd.y, -1, 1));
      let why = '';
      if (!this.gearDown) why = 'TOMA CON EL TREN RECOGIDO';
      else if (sink > 5.2) why = 'IMPACTO CONTRA EL TERRENO';
      else if (Math.abs(this.mu) > 13 * DEG) why = 'TOMA CON ALABEO EXCESIVO';
      else if (pitch < -4 * DEG) why = 'TOMA CON EL MORRO';
      else if (this.terrain.slope(this.pos.x, this.pos.z, 40) > 0.09) why = 'TERRENO NO APTO';
      if (why) { this.crash(why); return; }
      if (sink > 3.2) this.hardLanding = 3;
      this.onGround = true; this.pos.y = ground;
      this.heading = Math.atan2(vel.x, -vel.z); this.speed = Math.hypot(vel.x, vel.z);
      this.alpha = clamp(pitch, 0, 8 * DEG); this.mu = 0; a.mode = 0;
      const sh = Math.sin(this.heading), ch = Math.cos(this.heading);
      this.fwd.set(sh * Math.cos(this.alpha), Math.sin(this.alpha), -ch * Math.cos(this.alpha));
      this.right.set(ch, 0, sh); this.upv.crossVectors(this.right, this.fwd).normalize();
    }
  }

  crash(reason) {
    this.crashed = 4.5; this.crashReason = reason; this.speed = 0; this.throttle = 0; this.ap.mode = 0; this.vel.set(0, 0, 0);
    this.onCrash?.(this.pos.clone(), reason);
  }

  apply(dt = 0) {
    if (this.fwd.lengthSq() < 0.5) { this.fwd.set(Math.sin(this.heading), 0, -Math.cos(this.heading)); this.upv.set(0, 1, 0); this.right.set(Math.cos(this.heading), 0, Math.sin(this.heading)); }
    _m.makeBasis(this.right, this.upv, _a.copy(this.fwd).negate());
    this.group.quaternion.setFromRotationMatrix(_m);
    this.setGear(this.gearT);
    const rpm = 0.22 + this.throttle * 0.78;
    this.prop.rotation.z += rpm * 95 * dt;
    if (this.prop.userData.disc) { this.prop.userData.disc.visible = true; this.prop.userData.disc.material.opacity = 0.1 + rpm * 0.16; }
    this.strobe.visible = (performance.now() % 1200) < 90;
  }
}
