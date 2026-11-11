import * as THREE from 'three';
import { CFG } from './config.js';

const KEY = 'reaper21.campaign';
const V = (p, y = 0) => new THREE.Vector3(p.x, y, p.z);
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const lerp2 = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
const row = (k, v) => `<tr><td>${k}</td><td>${v}</td></tr>`;

/** Acumula segundos con el sensor sobre un punto (dentro de `tol` metros y con zoom suficiente). */
function observe(S, c, pos, dt, tol = 30, maxFov = 12) {
  const a = c.sensor.aim;
  if (a && dist(a, pos) < tol && c.sensor.fov <= maxFov) { S.obs += dt; S.unseen = 0; } else S.unseen += dt;
  return S.obs;
}

/**
 * Campaña. Cada misión: name, kind, brief (HTML), air (inicio en vuelo) y una lista de pasos
 * { obj, marker?, enter?, done } más reglas de fracaso propias.
 */
export const MISSIONS = [
  // ------------------------------------------------------------------ 1
  {
    name: 'Ojos en el valle', kind: 'Reconocimiento (ISR)',
    brief: () => `<p>Inteligencia sitúa a un facilitador de la red insurgente en la zona verde al noroeste del aeródromo. Se mueve en una <b>camioneta blanca</b>.</p>
      <table>${row('Tarea', 'Despegar, localizar el vehículo en el recinto ALFA y seguirlo hasta su destino.')}${row('Reglas', 'Armas en espera. Solo observación.')}${row('Indicativos', 'Tú: REAPER 21 · Mando: CENTURIÓN')}</table>`,
    setup(S, c) {
      S.A = c.site(-3300, -2500); S.B = c.site(-5400, 500);
      S.car = c.world.spawnVehicle({ model: 'hilux', x: S.A.x + 32, z: S.A.z + 6, faction: 'enemy', ry: 1 });
      c.world.spawnGroup(S.A.x + 26, S.A.z + 12, 3, 'enemy', 5);
      c.world.spawnGroup(S.A.x - 10, S.A.z - 40, 4, 'civilian', 14);
      S.meet = c.world.spawnGroup(S.B.x + 40, S.B.z, 8, 'enemy', 9);
      c.world.spawnVehicle({ model: 'truck', x: S.B.x + 52, z: S.B.z + 12, faction: 'enemy', ry: 2 });
    },
    onFire: (S) => { S.failed = 'Disparo no autorizado: la misión era solo de observación'; },
    steps: [
      { obj: 'Suelta el freno (B), da motor (Mayús) y despega por la pista 03', enter: (S, c) => c.ui.radio('TORRE BAGRAM', 'Reaper Dos Uno, viento en calma. Autorizado a despegar, pista cero tres.'), done: (S, c) => !c.drone.onGround && c.drone.agl > 90 },
      { obj: 'Sube el tren (G) y vuela hacia el recinto ALFA', marker: (S) => ({ pos: V(S.A, 1500), label: 'ALFA' }), enter: (S, c) => c.ui.radio('CENTURIÓN', 'Reaper Dos Uno, Centurión. Proceda al recinto Alfa. Buscamos una camioneta blanca. Armas en espera.'), done: (S, c) => dist(c.drone.pos, S.A) < 6000 },
      { obj: 'Vista de sensor (2): localiza la camioneta blanca y mantén la mira encima con zoom', marker: (S) => ({ pos: V(S.A, 1500), label: 'ALFA' }), enter: (S, c) => c.ui.radio('CENTURIÓN', 'Está en alcance del sensor. Use el piloto automático en órbita y confirme el vehículo.'), done: (S, c, dt) => observe(S, c, S.car.pos, dt, 28, 5) > 5 },
      {
        obj: 'El vehículo se mueve: síguelo sin perderlo (Espacio fija el seguimiento)', marker: (S) => ({ pos: V(S.car.pos, S.car.pos.y + 4), label: 'OBJETIVO' }),
        enter: (S, c) => { c.ui.radio('REAPER 21', 'Centurión, contacto. Camioneta blanca, tres individuos armados.'); c.ui.radio('CENTURIÓN', 'Recibido. Se pone en marcha. No lo pierda.'); c.world.drive(S.car, [lerp2(S.A, S.B, 0.5), { x: S.B.x + 44, z: S.B.z + 4 }], 13, () => { S.arrived = true; }); },
        done: (S, c, dt) => { observe(S, c, S.car.pos, dt, 60, 12); if (S.unseen > 45) S.failed = 'Has perdido el contacto con el vehículo'; return S.arrived; },
      },
      { obj: 'Confirma la reunión: mantén el sensor sobre el grupo', marker: (S) => ({ pos: V(S.B, 1500), label: 'BRAVO' }), enter: (S, c) => c.ui.radio('CENTURIÓN', 'Se ha detenido. Necesitamos confirmar quién le espera.'), done: (S, c, dt) => observe(S, c, { x: S.B.x + 40, z: S.B.z }, dt, 45, 5) > 6 },
    ],
    win: 'Reunión confirmada: ocho individuos armados y un camión. Inteligencia ya tiene su red.',
  },
  // ------------------------------------------------------------------ 2
  {
    name: 'Tropas en contacto', kind: 'Apoyo aéreo cercano (CAS)', air: { lx: -900, lz: 2600 },
    brief: () => `<p>Una patrulla aliada, indicativo <b>VÍBORA 21</b>, ha quedado fijada por fuego desde una línea de árboles al oeste de su posición. No pueden romper el contacto.</p>
      <table>${row('Tarea', 'Localizar la posición enemiga y destruirla.')}${row('Reglas', 'Fuego autorizado tras identificación positiva. <b>Peligro cercano:</b> aliados a 300 m al este del enemigo.')}${row('Armamento', '4 × AGM-114 · 2 × GBU-12')}</table>`,
    setup(S, c) {
      S.F = c.site(-4300, 2000); S.F = { x: S.F.x + 70, z: S.F.z + 10 };
      S.E = { x: S.F.x - 310, z: S.F.z + 50 };
      S.friends = c.world.spawnGroup(S.F.x, S.F.z, 8, 'friendly', 10);
      c.world.spawnVehicle({ model: 'humvee', x: S.F.x + 14, z: S.F.z - 8, faction: 'friendly', ry: 1.3 });
      c.world.spawnVehicle({ model: 'mrap', x: S.F.x + 18, z: S.F.z + 9, faction: 'friendly', ry: 1.5 });
      S.enemies = c.world.spawnGroup(S.E.x, S.E.z, 12, 'enemy', 34);
      c.world.fight(S.friends, S.enemies, 7);
    },
    target: (S) => S.F,
    steps: [
      { obj: 'Acude a la posición de VÍBORA 21', marker: (S) => ({ pos: V(S.F, 1500), label: 'VÍBORA 21' }), enter: (S, c) => { c.ui.radio('VÍBORA 21', '¡Cualquier estación, Víbora Dos Uno, tropas en contacto! Recibimos fuego efectivo desde el oeste.'); c.ui.radio('REAPER 21', 'Víbora, Reaper Dos Uno en ruta. Cuatro Hellfire y dos Paveway. Tres minutos.'); }, done: (S, c) => dist(c.drone.pos, S.F) < 6500 },
      { obj: 'Identifica la posición enemiga, 300 m al oeste de los aliados', marker: (S) => ({ pos: V(S.F, 1500), label: 'VÍBORA 21' }), enter: (S, c) => c.ui.radio('VÍBORA 21', 'Reaper, mi posición marcada. Enemigo trescientos metros al oeste, unos diez tiradores en la línea de árboles.'), done: (S, c, dt) => observe(S, c, S.E, dt, 50, 12) > 3 },
      {
        obj: 'Arma (M), láser (L) y dispara (clic). Neutraliza la posición enemiga', marker: (S) => ({ pos: V(S.E, 1500), label: 'ENEMIGO' }),
        enter: (S, c) => { c.ui.radio('REAPER 21', 'Víbora, tengo unos diez individuos con armas largas en la línea de árboles.'); c.ui.radio('VÍBORA 21', 'Ese es el blanco. Peligro cercano, iniciales Víctor Lima. Autorizado a atacar.'); },
        done: (S, c) => S.enemies.filter((e) => e.alive && !e.fled).length <= 2 && S.kills >= 6,
      },
    ],
    win: 'La posición enemiga ha sido destruida y VÍBORA 21 rompe el contacto sin bajas.',
  },
  // ------------------------------------------------------------------ 3
  {
    name: 'Ruta Vermont', kind: 'Escolta de convoy', air: { lx: 2200, lz: 1500 },
    brief: () => `<p>Un convoy logístico, indicativo <b>MULA 4</b>, regresa a Bagram por la ruta Vermont, al este del aeródromo. La ruta ha sufrido tres ataques esta semana.</p>
      <table>${row('Tarea', 'Reconocer la ruta por delante del convoy y eliminar cualquier amenaza antes de que llegue.')}${row('Reglas', 'Fuego autorizado contra quien coloque explosivos o prepare una emboscada.')}${row('Atención', 'El convoy no se detiene.')}</table>`,
    setup(S, c) {
      S.R0 = c.L(4300, -2000); S.R1 = c.L(CFG.wall.x1 + 260, 500); S.R2 = c.L(CFG.wall.x1 - 60, 500);
      S.P1 = lerp2(S.R0, S.R1, 0.44); S.P2r = lerp2(S.R0, S.R1, 0.76);
      const dx = S.R1.x - S.R0.x, dz = S.R1.z - S.R0.z, l = Math.hypot(dx, dz);
      S.P2 = { x: S.P2r.x - (dz / l) * 150, z: S.P2r.z + (dx / l) * 150 };
      S.convoy = ['mrap', 'truck', 'humvee'].map((m, i) => c.world.spawnVehicle({ model: m, x: S.R0.x - (dx / l) * i * 34, z: S.R0.z - (dz / l) * i * 34, faction: 'friendly', ry: Math.atan2(-dx, -dz) }));
      S.ied = c.world.spawnGroup(S.P1.x + 4, S.P1.z + 3, 3, 'enemy', 3, { tag: 'ied' });
      S.tech = c.world.spawnVehicle({ model: 'hilux', x: S.P2.x, z: S.P2.z, faction: 'enemy', ry: 2 });
      S.amb = c.world.spawnGroup(S.P2.x + 8, S.P2.z + 6, 6, 'enemy', 12, { tag: 'amb' });
    },
    target: (S) => S.P1,
    tick(S, c) {
      if (!S.rolling && S.t > 25) { S.rolling = true; S.convoy.forEach((v, i) => c.world.drive(v, [S.R1, S.R2], 8.5, i === 0 ? () => { S.home = true; } : null)); c.ui.radio('MULA 4', 'Mula Cuatro en marcha por Vermont. Ocho minutos para la puerta.'); }
      const lead = S.convoy[0];
      if (S.ied.some((e) => e.alive) && dist(lead.pos, S.P1) < 45) { c.fx.explosion(lead.pos.clone(), 1.6); c.audio.boom(lead.pos, 1.6); c.world.destroy(lead); S.failed = 'Un IED ha alcanzado al vehículo de cabeza del convoy'; }
      if (S.tech.alive && dist(lead.pos, S.P2r) < 190) { c.world.fight(S.amb, [lead], 9); S.failed = 'El convoy ha entrado en la zona de muerte de la emboscada'; }
    },
    steps: [
      { obj: 'Reconoce la ruta por delante del convoy', marker: (S) => ({ pos: V(S.P1, 1500), label: 'RUTA' }), enter: (S, c) => c.ui.radio('MULA 4', 'Reaper Dos Uno, Mula Cuatro. Tres vehículos, salimos en treinta segundos. Díganos qué tenemos delante.'), done: (S, c, dt) => observe(S, c, S.P1, dt, 45, 12) > 3 },
      { obj: 'Tres individuos enterrando algo en la ruta: elimínalos', marker: (S) => ({ pos: V(S.P1, 1500), label: 'IED' }), enter: (S, c) => { c.ui.radio('REAPER 21', 'Mula, tres individuos cavando en la calzada, un kilómetro y medio por delante de ustedes.'); c.ui.radio('CENTURIÓN', 'Reaper, Centurión. Acto hostil confirmado. Autorizado a atacar.'); }, done: (S) => S.ied.every((e) => !e.alive || e.fled) },
      { obj: 'Sigue reconociendo la ruta hacia la base', marker: (S) => ({ pos: V(S.P2, 1500), label: 'RUTA' }), enter: (S, c) => c.ui.radio('MULA 4', 'Buen efecto, Reaper. Seguimos avanzando.'), done: (S, c, dt) => observe(S, c, S.P2, dt, 55, 12) > 3 },
      { obj: 'Camioneta armada emboscada junto a la ruta: destrúyela', marker: (S) => ({ pos: V(S.P2, 1500), label: 'EMBOSCADA' }), enter: (S, c) => { c.ui.radio('REAPER 21', 'Camioneta con ametralladora y seis individuos a ciento cincuenta metros al norte de la ruta.'); c.ui.radio('CENTURIÓN', 'Autorizado.'); }, done: (S) => !S.tech.alive },
      { obj: 'Cubre al convoy hasta que cruce la puerta', marker: (S) => ({ pos: V(S.convoy[0].pos, S.convoy[0].pos.y + 5), label: 'MULA 4' }), enter: (S, c) => c.ui.radio('MULA 4', 'Ruta despejada. Gracias, Reaper.'), done: (S) => S.home },
    ],
    win: 'MULA 4 ha cruzado la puerta de Bagram sin un rasguño.',
  },
  // ------------------------------------------------------------------ 4
  {
    name: 'Luz verde', kind: 'Objetivo de alto valor', air: { lx: -600, lz: 3600 },
    brief: () => `<p>El facilitador que seguiste en la primera misión ha sido identificado: es el jefe de la célula que ataca la ruta Vermont. Pasa la mañana en un recinto <b>con civiles</b>.</p>
      <table>${row('Tarea', 'Vigilar el recinto y destruir su vehículo cuando esté en campo abierto.')}${row('Reglas', '<b>Prohibido atacar el recinto.</b> Espera la autorización de CENTURIÓN. Cero bajas civiles.')}${row('Atención', 'Si llega a su destino, se pierde la oportunidad.')}</table>`,
    setup(S, c) {
      S.C = c.site(-2700, 3500); S.D = c.site(-6400, 5600);
      S.car = c.world.spawnVehicle({ model: 'hilux', x: S.C.x + 30, z: S.C.z - 4, faction: 'enemy', ry: 0.5 }); S.car.crew = 3;
      c.world.spawnGroup(S.C.x + 27, S.C.z + 4, 3, 'enemy', 4);
      S.civ = c.world.spawnGroup(S.C.x - 6, S.C.z + 34, 9, 'civilian', 16);
      c.world.spawnGroup(S.C.x - 40, S.C.z - 20, 4, 'civilian', 8);
      c.world.spawnGroup(S.D.x + 20, S.D.z, 5, 'enemy', 8);
    },
    target: (S) => S.C,
    onFire: (S) => { if (!S.green) S.failed = 'Has disparado sin autorización'; },
    steps: [
      { obj: 'Localiza el vehículo del objetivo en el recinto', marker: (S) => ({ pos: V(S.C, 1500), label: 'RECINTO' }), enter: (S, c) => c.ui.radio('CENTURIÓN', 'Reaper Dos Uno, confirme la camioneta blanca en el recinto. Armas en espera.'), done: (S, c, dt) => observe(S, c, S.car.pos, dt, 28, 5) > 4 },
      {
        obj: 'Armas en espera: hay civiles. Vigila hasta que salga', marker: (S) => ({ pos: V(S.car.pos, S.car.pos.y + 4), label: 'OBJETIVO' }),
        enter: (S, c) => { c.ui.radio('REAPER 21', 'Positivo. Vehículo confirmado. Cuento más de diez civiles en el recinto, varios menores.'); c.ui.radio('CENTURIÓN', 'Recibido. No hay autorización. Mantenga el seguimiento.'); },
        done: (S, c) => { if (!S.left && S.stepT > 24) { S.left = true; c.ui.radio('REAPER 21', 'El objetivo sube al vehículo. Se mueve hacia el suroeste.'); c.world.drive(S.car, [lerp2(S.C, S.D, 0.5), { x: S.D.x + 24, z: S.D.z + 6 }], 12.5, () => { S.escaped = true; }); } return dist(S.car.pos, S.C) > 420; },
      },
      {
        obj: 'Luz verde: destruye el vehículo antes de que llegue a su destino', marker: (S) => ({ pos: V(S.car.pos, S.car.pos.y + 4), label: 'OBJETIVO' }),
        enter: (S, c) => { S.green = true; c.ui.radio('CENTURIÓN', 'Reaper Dos Uno, vehículo en campo abierto, sin civiles en el entorno. Luz verde. Repito, luz verde.'); },
        done: (S) => { if (S.escaped) S.failed = 'El objetivo ha llegado a su destino'; return !S.car.alive; },
      },
    ],
    win: 'Objetivo eliminado en campo abierto. Ninguna baja civil.',
  },
  // ------------------------------------------------------------------ 5
  {
    name: 'Regreso a casa', kind: 'Recuperación', air: { lx: 0, lz: 11500, alt: 750, towardBase: true },
    brief: () => `<p>Fin del turno. El equipo de recuperación tiene una avería en su estación y te toca traer el aparato a casa.</p>
      <table>${row('Tarea', 'Aterrizar en la pista 03 y detener el avión.')}${row('Consejo', 'Baja el tren (G), reduce a 95 nudos, apunta al umbral y recoge suavemente (S) antes de tocar.')}${row('Límites', 'Menos de 1 000 pies por minuto de descenso al tocar, alas niveladas.')}</table>`,
    setup(S, c) { S.TH = c.L(0, CFG.runwayLength / 2 - 200); },
    target: (S) => S.TH,
    steps: [
      { obj: 'Baja el tren (G) y establece la aproximación a la pista 03', marker: (S, c) => ({ pos: V(S.TH, c.terrain.H0 + 3), label: 'PISTA 03' }), enter: (S, c) => c.ui.radio('TORRE BAGRAM', 'Reaper Dos Uno, continúe aproximación pista cero tres. Viento en calma. Autorizado a aterrizar.'), done: (S, c) => c.drone.gearDown && dist(c.drone.pos, S.TH) < 3500 },
      { obj: 'Aterriza y detén el aparato en la pista', marker: (S, c) => ({ pos: V(S.TH, c.terrain.H0 + 3), label: 'PISTA 03' }), done: (S, c) => c.drone.onGround && c.drone.speed < 2 && c.terrain.insideBase(c.drone.pos.x, c.drone.pos.z, 0) },
    ],
    win: 'Aparato en tierra y entero. Buen turno, Reaper.',
  },
];

export class Campaign {
  constructor(ctx) {
    this.c = ctx; this.S = null;
    this.index = Math.min(Number(localStorage.getItem(KEY)) || 0, MISSIONS.length);
    ctx.weapons.onFire = (type) => { const S = this.S; ctx.ui.radio('REAPER 21', type === 'hellfire' ? 'Rifle.' : 'Arma fuera.'); if (S && !S.done) { S.fired++; S.def.onFire?.(S, type); } };
    ctx.weapons.onImpact = (p, type, rep) => this.impact(p, rep);
    ctx.drone.onCrash = () => { if (this.S && !this.S.done) this.S.failed = 'Aeronave perdida'; };
  }
  get complete() { return this.index >= MISSIONS.length; }
  reset() { this.index = 0; localStorage.setItem(KEY, '0'); }
  def(i = this.index) { return MISSIONS[i]; }

  begin(i = this.index) {
    const c = this.c, def = MISSIONS[i];
    c.world.clear(); c.ui.clearRadio();
    const S = this.S = { def, i, step: -1, t: 0, stepT: 0, obs: 0, unseen: 0, fired: 0, kills: 0, veh: 0, done: false, failed: '', endT: 0 };
    def.setup(S, c);
    let air = null;
    if (def.air) {
      let p = c.L(def.air.lx, def.air.lz); const tg = def.air.towardBase ? c.L(0, 0) : def.target(S);
      if (!def.air.towardBase) { const d = Math.hypot(p.x - tg.x, p.z - tg.z) || 1, k = 7800 / d; p = { x: tg.x + (p.x - tg.x) * k, z: tg.z + (p.z - tg.z) * k }; }   // relevo a 7,8 km del objetivo
      air = { x: p.x, z: p.z, alt: c.terrain.H0 + (def.air.alt || 1500), hdg: Math.atan2(tg.x - p.x, -(tg.z - p.z)), spd: 74 };
    }
    c.drone.reset(air); c.weapons.rearm(); c.sensor.cage();
    if (def.target) { const t = def.target(S); c.sensor.lock = new THREE.Vector3(t.x, c.terrain.getHeight(t.x, t.z), t.z); }
    this.advance();
  }

  advance() {
    const S = this.S; S.step++; S.stepT = 0; S.obs = 0; S.unseen = 0;
    if (S.step >= S.def.steps.length) { this.finish(true); return; }
    const st = S.def.steps[S.step];
    st.enter?.(S, this.c);
    this.c.ui.objective(`Misión ${S.i + 1} · ${S.def.name}`, st.obj);
    this.c.audio.tone(660, 0.12, 0.05); this.c.audio.tone(880, 0.16, 0.05, 0.12);
  }

  impact(p, rep) {
    const S = this.S, c = this.c;
    if (!S || S.done) return;
    S.kills += rep.enemy; S.veh += rep.vehicles.filter((v) => v.faction === 'enemy').length;
    if (rep.friendly || rep.vehicles.some((v) => v.faction === 'friendly')) S.failed = 'Fuego sobre fuerzas propias';
    else if (rep.civilian) S.failed = 'Bajas civiles';
    else if (c.terrain.insideBase(p.x, p.z, 150)) S.failed = 'Impacto dentro del aeródromo';
    else if (rep.enemy || rep.vehicles.length) c.ui.radio('REAPER 21', `Impacto. Buen efecto sobre el blanco${rep.enemy ? `, ${rep.enemy} ${rep.enemy === 1 ? 'baja' : 'bajas'}` : ''}.`);
    else c.ui.radio('REAPER 21', 'Impacto. Sin efecto sobre el blanco.');
  }

  marker() { const S = this.S; if (!S || S.done) return null; const st = S.def.steps[S.step]; return st?.marker ? st.marker(S, this.c) : null; }

  update(dt) {
    const S = this.S; if (!S) return;
    if (S.done) { if (S.endT > 0) { S.endT -= dt; if (S.endT <= 0) this.c.onMissionEnd(S); } return; }
    S.t += dt; S.stepT += dt;
    S.def.tick?.(S, this.c);
    if (!S.failed && S.def.steps[S.step].done(S, this.c, dt)) this.advance();
    if (S.failed && !S.done) this.finish(false);
  }

  finish(ok) {
    const S = this.S, c = this.c;
    S.done = true; S.ok = ok; S.endT = ok ? 4 : 3.5;
    c.ui.objective(null);
    c.ui.toast(ok ? 'MISIÓN CUMPLIDA' : `MISIÓN FRACASADA\n${S.failed}`, !ok, 3.4);
    if (ok) { c.audio.tone(523, 0.2, 0.06); c.audio.tone(659, 0.2, 0.06, 0.18); c.audio.tone(784, 0.4, 0.06, 0.36); if (S.i === this.index) { this.index++; localStorage.setItem(KEY, String(this.index)); } } else c.audio.alarm();
  }

  abort() { this.S = null; this.c.world.clear(); this.c.ui.objective(null); this.c.ui.clearRadio(); }

  briefHTML(i = this.index) { return MISSIONS[i].brief(); }
  debriefHTML() {
    const S = this.S, mm = Math.floor(S.t / 60), ss = String(Math.floor(S.t % 60)).padStart(2, '0');
    return `<p>${S.ok ? S.def.win : S.failed + '.'}</p><table>${row('Duración', `${mm}:${ss}`)}${row('Armas empleadas', `${this.c.weapons.fired.hellfire} × AGM-114 · ${this.c.weapons.fired.gbu} × GBU-12`)}${row('Bajas enemigas', S.kills)}${row('Vehículos destruidos', S.veh)}</table>`;
  }
}
