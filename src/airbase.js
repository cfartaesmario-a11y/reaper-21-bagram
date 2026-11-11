import * as THREE from 'three';
import { CFG } from './config.js';
import { boxGeo, cylGeo, mergedMesh, canvasTexture, rng, DEG, FT } from './util.js';

/**
 * Construye el aeródromo militar en coordenadas locales:
 *   +x = lado este de la pista (zona de vida, plataformas), z = eje de pista, -z = sentido de despegue pista 03.
 * Devuelve { group, routes, posts, radar, spawn, parkedSlots }.
 */
export function buildAirbase({ assets, terrain }) {
  const T = assets.textures;
  const L = CFG.runwayLength, W = CFG.runwayWidth, WALL = CFG.wall;
  const R = rng(20011007);
  const base = new THREE.Group();
  base.name = 'aerodromo';
  terrain.toWorld(0, 0, base.position);
  base.position.y = terrain.H0;
  base.rotation.y = -CFG.heading;

  // ---------- materiales
  const po = (m, k) => { m.polygonOffset = true; m.polygonOffsetFactor = -k; m.polygonOffsetUnits = -k * 4; return m; };
  const lin = (r, g, b) => new THREE.Color().setRGB(r, g, b);          // color lineal (puede superar 1 para aclarar texturas oscuras)
  const pbr = (t, color, extra = {}) => new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normalMap, roughnessMap: t.roughnessMap, color, roughness: 1, ...extra });
  const retile = (t, tile) => Object.fromEntries(Object.entries(t).map(([k, v]) => { const c = v.clone(); c.repeat.set(1 / tile, 1 / tile); return [k, c]; }));
  // losas de hormigón de plataforma: juntas cada 6 m, manchas y parches
  const slabMap = canvasTexture(1024, 1024, (c, w, h) => {
    const r = rng(31);
    c.fillStyle = '#b9b5a9'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { const v = 178 + Math.floor(r() * 9); c.fillStyle = `rgb(${v + 5},${v + 3},${v - 5})`; c.fillRect(i * 256, j * 256, 256, 256); }
    for (let i = 0; i < 9000; i++) { const v = r() < 0.5 ? 0 : 255; c.fillStyle = `rgba(${v},${v},${v},${0.02 + r() * 0.05})`; c.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 3); }
    for (let i = 0; i < 26; i++) { const x = r() * w, y = r() * h, g = c.createRadialGradient(x, y, 0, x, y, 20 + r() * 70); g.addColorStop(0, `rgba(40,36,30,${0.08 + r() * 0.16})`); g.addColorStop(1, 'rgba(40,36,30,0)'); c.fillStyle = g; c.fillRect(0, 0, w, h); }
    c.strokeStyle = 'rgba(52,48,42,0.85)'; c.lineWidth = 3;
    for (let i = 0; i <= 4; i++) { c.beginPath(); c.moveTo(i * 256, 0); c.lineTo(i * 256, h); c.stroke(); c.beginPath(); c.moveTo(0, i * 256); c.lineTo(w, i * 256); c.stroke(); }
    c.strokeStyle = 'rgba(30,28,24,0.5)'; c.lineWidth = 1.5;
    for (let i = 0; i < 9; i++) { let x = r() * w, y = r() * h; c.beginPath(); c.moveTo(x, y); for (let k = 0; k < 7; k++) { x += (r() - 0.5) * 60; y += (r() - 0.5) * 60; c.lineTo(x, y); } c.stroke(); }
  }, { repeat: true });
  slabMap.repeat.set(1 / 24, 1 / 24);
  const slabN = retile(T.wall, 5);
  const slab = { map: slabMap, normalMap: slabN.normalMap, roughnessMap: slabN.roughnessMap };
  const M = {
    road: po(pbr(T.asphalt, lin(1.55, 1.42, 1.2)), 1),
    taxi: po(pbr(T.asphalt, lin(1.05, 1.05, 1.03)), 2),
    apron: po(pbr(slab, lin(0.92, 0.9, 0.86)), 2),
    runway: po(pbr(T.asphalt, lin(0.6, 0.6, 0.62)), 3),
    white: po(new THREE.MeshStandardMaterial({ color: 0xe9e8e1, roughness: 0.9 }), 5),
    yellow: po(new THREE.MeshStandardMaterial({ color: 0xd9a514, roughness: 0.9 }), 4),
    rubber: po(new THREE.MeshStandardMaterial({ color: 0x0c0c0c, roughness: 1, transparent: true, opacity: 0.5, depthWrite: false }), 4),
    metal: pbr(T.metal, lin(3.3, 3.2, 2.9), { metalness: 0.3 }),
    metalDark: pbr(T.metal, lin(1.5, 1.6, 1.45), { metalness: 0.3 }),
    wall: pbr(T.wall, lin(1.25, 1.22, 1.15)),
    ply: pbr(T.wall, lin(1.5, 1.25, 0.95)),
    tan: new THREE.MeshStandardMaterial({ color: 0xb7a37c, roughness: 0.95, side: THREE.DoubleSide }),
    steel: new THREE.MeshStandardMaterial({ color: 0x777b7d, roughness: 0.55, metalness: 0.7 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x232527, roughness: 0.8 }),
    whitePaint: new THREE.MeshStandardMaterial({ color: 0xdedfda, roughness: 0.5, metalness: 0.1 }),
    red: new THREE.MeshStandardMaterial({ color: 0xb3261c, roughness: 0.6 }),
    orange: new THREE.MeshStandardMaterial({ color: 0xe0661a, roughness: 0.8, side: THREE.DoubleSide }),
    glass: new THREE.MeshStandardMaterial({ color: 0x2a4450, roughness: 0.08, metalness: 0.85, envMapIntensity: 1.6 }),
    earth: pbr(T.clay, lin(2.3, 2.9, 4.2)),
    olive: new THREE.MeshStandardMaterial({ color: 0x5a5f48, roughness: 0.75, metalness: 0.2 }),
  };
  M.hesco = new THREE.MeshStandardMaterial({
    roughness: 1,
    map: canvasTexture(256, 256, (c, w, h) => {
      c.fillStyle = '#9c8763'; c.fillRect(0, 0, w, h);
      const r = rng(7);
      for (let i = 0; i < 2600; i++) { c.fillStyle = `rgba(${60 + r() * 120},${50 + r() * 100},${30 + r() * 70},0.16)`; c.fillRect(r() * w, r() * h, 2 + r() * 6, 1 + r() * 3); }
      for (let y = 0; y < h; y += 2) { c.fillStyle = `rgba(0,0,0,${0.02 + 0.05 * Math.abs(Math.sin(y * 0.11))})`; c.fillRect(0, y, w, 1); }
      c.strokeStyle = 'rgba(205,205,200,0.85)'; c.lineWidth = 1.4;
      for (let i = 0; i <= 8; i++) { c.beginPath(); c.moveTo(i * 32, 0); c.lineTo(i * 32, h); c.stroke(); c.beginPath(); c.moveTo(0, i * 32); c.lineTo(w, i * 32); c.stroke(); }
      c.strokeStyle = 'rgba(40,35,25,0.55)'; c.lineWidth = 5; c.strokeRect(0, 0, w, h);
    }, { repeat: true }),
  });
  M.hesco.map.repeat.set(1 / 2.2, 1 / 2.2);
  M.hesco.color.setRGB(1.5, 1.45, 1.35);

  const G = {}; // listas de geometría por material
  const add = (k, g) => { (G[k] ||= []).push(g); return g; };
  /** Rectángulo de suelo con UV de mundo (los solapes no parpadean). */
  const rect = (k, x0, x1, z0, z1, y) => {
    const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
    g.rotateX(-Math.PI / 2); g.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
    const p = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i), p.getZ(i));
    return add(k, g);
  };
  const box = (k, w, h, d, x, y, z, ry = 0) => add(k, boxGeo(w, h, d, x, y, z, ry));
  const cyl = (k, rt, rb, h, x, y, z, seg = 14) => add(k, cylGeo(rt, rb, h, x, y, z, seg));

  const Y_ROAD = 0.04, Y_PAVE = 0.06, Y_RWY = 0.08, Y_MARK = 0.105, Y_LINE = 0.085;

  // ====================================================================== PISTA 03/21
  rect('taxi', -W / 2 - 8, W / 2 + 8, -L / 2 - 70, L / 2 + 70, Y_PAVE);           // arcenes y zonas de parada
  rect('runway', -W / 2, W / 2, -L / 2, L / 2, Y_RWY);
  // líneas de borde y eje
  rect('white', -W / 2 + 1.2, -W / 2 + 2.1, -L / 2, L / 2, Y_MARK);
  rect('white', W / 2 - 2.1, W / 2 - 1.2, -L / 2, L / 2, Y_MARK);
  for (let z = -L / 2 + 130; z < L / 2 - 130; z += 50) rect('white', -0.45, 0.45, z, z + 30, Y_MARK);
  for (const s of [1, -1]) {
    const e = s * L / 2;                       // extremo; s=1 es la cabecera 03 (sur)
    const zin = (d) => e - s * d;              // d metros pista adentro
    const span = (a, b) => [Math.min(zin(a), zin(b)), Math.max(zin(a), zin(b))];
    // umbral: 6 + 6 barras
    for (let i = 0; i < 6; i++) for (const side of [1, -1]) {
      const x = side * (3.2 + i * 3.4); const [a, b] = span(6, 36);
      rect('white', x - 0.9, x + 0.9, a, b, Y_MARK);
    }
    { const [a, b] = span(1.5, 3.3); rect('white', -W / 2 + 2, W / 2 - 2, a, b, Y_MARK); }
    // zona de contacto (500 ft triple, 1000 ft punto de visada, 1500/2000 doble, 2500/3000 simple)
    const tdz = [[500, 3], [1500, 2], [2000, 2], [2500, 1], [3000, 1]];
    for (const [ft, nbar] of tdz) for (const side of [1, -1]) for (let i = 0; i < nbar; i++) {
      const x = side * (9.5 + i * 3.0); const [a, b] = span(ft * FT, ft * FT + 22.5);
      rect('white', x - 0.9, x + 0.9, a, b, Y_MARK);
    }
    for (const side of [1, -1]) { const [a, b] = span(1000 * FT, 1000 * FT + 45); rect('white', side * 9 - 3, side * 9 + 3, a, b, Y_MARK); }
    // huellas de neumático
    { const [a, b] = span(260, 760); rect('rubber', -7, 7, a, b, Y_MARK - 0.012); }
    // chevrones de la zona de parada
    for (let i = 0; i < 4; i++) { const zc = e + s * (12 + i * 15); rect('yellow', -W / 2 + 3, W / 2 - 3, Math.min(zc, zc + s * 1.2), Math.max(zc, zc + s * 1.2), Y_LINE); }
  }
  // números de pista
  const numTex = (txt) => canvasTexture(256, 256, (c, w, h) => {
    c.clearRect(0, 0, w, h); c.fillStyle = '#e9e8e1'; c.font = 'bold 190px Arial, Helvetica, sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(txt, w / 2, h / 2 + 8);
  });
  const numbers = new THREE.Group();
  for (const [txt, s] of [['03', 1], ['21', -1]]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(20, 20).rotateX(-Math.PI / 2),
      po(new THREE.MeshStandardMaterial({ map: numTex(txt), alphaTest: 0.5, roughness: 0.9 }), 5));
    m.position.set(0, Y_MARK, s * (L / 2 - 58)); if (s < 0) m.rotation.y = Math.PI;
    m.receiveShadow = true; numbers.add(m);
  }
  base.add(numbers);

  // ====================================================================== RODADURAS
  const TX = 200, TW = 23;
  rect('taxi', TX - TW / 2, TX + TW / 2, -L / 2, L / 2, Y_PAVE);
  const links = [-L / 2 + 11.5, -900, 0, 900, L / 2 - 11.5];
  for (const z of links) {
    rect('taxi', W / 2 + 8, TX - TW / 2, z - TW / 2, z + TW / 2, Y_PAVE);
    rect('yellow', 3, TX, z - 0.15, z + 0.15, Y_LINE + 0.03);
    // barra de espera
    for (const o of [0, 0.9]) rect('yellow', 75 + o, 75.3 + o, z - TW / 2 + 1, z + TW / 2 - 1, Y_LINE);
  }
  rect('yellow', TX - 0.15, TX + 0.15, -L / 2, L / 2, Y_LINE);
  for (const sx of [-1, 1]) rect('yellow', TX + sx * (TW / 2 - 0.8) - 0.1, TX + sx * (TW / 2 - 0.8) + 0.1, -L / 2, L / 2, Y_LINE);

  // ====================================================================== PLATAFORMAS
  const AX0 = TX + TW / 2;
  const APR = { main: [AX0, 520, -760, 450], rpa: [AX0, 440, 560, 1010], helo: [AX0, 430, -1260, -900] };
  for (const a of Object.values(APR)) rect('apron', a[0], a[1], a[2], a[3], Y_PAVE);
  // borde pintado y puestos de estacionamiento
  for (const a of Object.values(APR)) {
    rect('yellow', a[1] - 3.2, a[1] - 3, a[2] + 3, a[3] - 3, Y_LINE);
    rect('yellow', a[0] + 3, a[1] - 3, a[2] + 3, a[2] + 3.2, Y_LINE);
    rect('yellow', a[0] + 3, a[1] - 3, a[3] - 3.2, a[3] - 3, Y_LINE);
  }

  // ====================================================================== VIALES
  const RW = 7, RX = 640;
  const P = { x0: WALL.x0 + 38, x1: WALL.x1 - 38, z0: WALL.z0 + 38, z1: WALL.z1 - 38 };
  rect('road', P.x0 - RW / 2, P.x1 + RW / 2, P.z0 - RW / 2, P.z0 + RW / 2, Y_ROAD);
  rect('road', P.x0 - RW / 2, P.x1 + RW / 2, P.z1 - RW / 2, P.z1 + RW / 2, Y_ROAD);
  rect('road', P.x0 - RW / 2, P.x0 + RW / 2, P.z0, P.z1, Y_ROAD);
  rect('road', P.x1 - RW / 2, P.x1 + RW / 2, P.z0, P.z1, Y_ROAD);
  rect('road', RX - RW / 2, RX + RW / 2, P.z0, P.z1, Y_ROAD);
  const GATE_Z = 500;
  for (const z of [-1320, -830, GATE_Z, 1060, 1520]) rect('road', RX, P.x1, z - RW / 2, z + RW / 2, Y_ROAD);
  rect('road', 520, RX, -150 - RW / 2, -150 + RW / 2, Y_ROAD);
  rect('road', 440, RX, 780 - RW / 2, 780 + RW / 2, Y_ROAD);
  rect('road', 430, RX, -1080 - RW / 2, -1080 + RW / 2, Y_ROAD);
  rect('road', P.x1, WALL.x1 + 300, GATE_Z - RW / 2, GATE_Z + RW / 2, Y_ROAD);   // acceso exterior

  // ====================================================================== MURO PERIMETRAL (HESCO)
  const wallRun = (xa, za, xb, zb) => {
    const len = Math.hypot(xb - xa, zb - za), ry = Math.atan2(-(zb - za), xb - xa), cx = (xa + xb) / 2, cz = (za + zb) / 2;
    box('hesco', len, 2.3, 1.5, cx, 0, cz, ry);
    box('hesco', len, 1.15, 1.0, cx, 2.3, cz, ry);
  };
  wallRun(WALL.x0, WALL.z0, WALL.x1, WALL.z0);
  wallRun(WALL.x0, WALL.z1, WALL.x1, WALL.z1);
  wallRun(WALL.x0, WALL.z0, WALL.x0, WALL.z1);
  wallRun(WALL.x1, WALL.z0, WALL.x1, GATE_Z - 9);
  wallRun(WALL.x1, GATE_Z + 9, WALL.x1, WALL.z1);

  const posts = [];        // puestos de soldados
  const towers = [];
  const addTower = (x, z, ry) => { towers.push({ x, z, ry }); };
  for (let z = WALL.z0 + 6; z <= WALL.z1 - 5; z += (WALL.z1 - WALL.z0 - 12) / 10) { addTower(WALL.x0 + 5, z, Math.PI / 2); addTower(WALL.x1 - 5, z, -Math.PI / 2); }
  for (let x = WALL.x0 + 405; x < WALL.x1 - 100; x += 395) { addTower(x, WALL.z0 + 5, 0); addTower(x, WALL.z1 - 5, Math.PI); }
  assets.instanced('tower', towers, base);

  // ====================================================================== PUNTO DE CONTROL DE ACCESO
  const hescoUnits = [];
  for (let i = 0; i < 5; i++) { hescoUnits.push({ x: WALL.x1 + 30 + i * 2.15, z: GATE_Z - 7.5, ry: 0 }, { x: WALL.x1 + 62 + i * 2.15, z: GATE_Z + 7.5, ry: 0 }); }
  for (let i = 0; i < 4; i++) { hescoUnits.push({ x: WALL.x1 - 24, z: GATE_Z - 12 - i * 2.15, ry: 0 }, { x: WALL.x1 - 24, z: GATE_Z + 12 + i * 2.15, ry: 0 }); }
  box('wall', 4.5, 2.9, 3.5, WALL.x1 - 14, 0, GATE_Z - 8.5); box('metalDark', 5.2, 0.2, 4.2, WALL.x1 - 14, 2.9, GATE_Z - 8.5);
  for (const s of [-1, 1]) { cyl('red', 0.09, 0.09, 1.1, WALL.x1 - 6, 0, GATE_Z + s * 5.2); }
  box('whitePaint', 0.12, 0.12, 9.5, WALL.x1 - 6, 1.05, GATE_Z);     // barrera
  for (let i = 0; i < 5; i++) box('red', 0.13, 0.13, 0.9, WALL.x1 - 6, 1.045, GATE_Z - 3.8 + i * 1.9);
  posts.push({ x: WALL.x1 - 9, z: GATE_Z - 4.5, ry: -Math.PI / 2 }, { x: WALL.x1 - 9, z: GATE_Z + 4.8, ry: -Math.PI / 2 }, { x: WALL.x1 - 16, z: GATE_Z - 5.5, ry: Math.PI / 2 });

  // ====================================================================== TORRE DE CONTROL
  {
    const x = 572, z = 330;
    box('wall', 26, 6.5, 16, x + 4, 0, z + 14); box('metalDark', 27, 0.3, 17, x + 4, 6.5, z + 14);
    box('wall', 7.5, 24, 7.5, x, 0, z);
    for (let i = 0; i < 5; i++) box('dark', 1.2, 1.4, 0.1, x, 4 + i * 4, z - 3.78);
    cyl('wall', 6.4, 4.2, 1.6, x, 24, z, 8);
    cyl('glass', 6.9, 6.1, 3.4, x, 25.6, z, 8);
    cyl('metalDark', 7.4, 7.4, 0.45, x, 29, z, 8);
    cyl('steel', 6.9, 6.9, 0.12, x, 26.6, z, 8);
    cyl('steel', 0.09, 0.09, 7, x + 2, 29.4, z + 1, 6); cyl('steel', 0.06, 0.06, 5, x - 2.5, 29.4, z - 1.5, 6);
    cyl('red', 0.22, 0.22, 0.35, x + 2, 36.4, z + 1, 8);
    add('whitePaint', new THREE.SphereGeometry(3.2, 20, 14).translate(x + 12, 9.2, z + 16));       // radomo
    cyl('wall', 2.2, 2.4, 2.9, x + 12, 6.5, z + 16, 12);
    posts.push({ x: x - 8, z: z + 6, ry: -Math.PI / 2 });
  }

  // ====================================================================== HANGARES Y ZONA DE OPERACIONES
  const hangars = [-650, -470, -290].map((z) => ({ x: 566, z, ry: Math.PI / 2 }));
  assets.instanced('hangar', hangars, base);
  for (const h of hangars) rect('apron', 520, 600, h.z - 26, h.z + 26, Y_PAVE);
  // nave de mantenimiento y parque de bomberos
  const shed = (x, z, w, d, h, mat = 'metal') => {
    box(mat, w, h, d, x, 0, z);
    box('metalDark', w + 1, 0.35, d + 1, x, h, z);
    for (let i = 0; i < Math.floor(w / 9); i++) box('dark', 5.5, h * 0.72, 0.15, x - w / 2 + 6 + i * 9, 0, z - d / 2 - 0.05);
    const n = 1 + Math.floor(R() * 3);
    for (let i = 0; i < n; i++) box('steel', 1.6, 1.1, 1.6, x + (R() - 0.5) * w * 0.7, h + 0.35, z + (R() - 0.5) * d * 0.6);
  };
  shed(566, -70, 60, 34, 9.5);
  shed(566, 100, 40, 24, 7, 'wall');
  shed(566, 190, 40, 20, 6.2, 'metal');
  for (let i = 0; i < 3; i++) box('red', 2.6, 3.1, 8.5, 548 + i * 9, 0, 132);        // camiones de bomberos (silueta)

  // ====================================================================== MÁSTILES DE ILUMINACIÓN
  const mast = (x, z) => {
    cyl('steel', 0.14, 0.24, 20, x, 0, z, 8); box('steel', 3.2, 0.25, 0.5, x, 20, z);
    for (const o of [-1.2, 0, 1.2]) box('whitePaint', 0.8, 0.5, 0.6, x + o, 19.5, z - 0.3);
    box('wall', 1.2, 0.6, 1.2, x, 0, z);
  };
  for (let z = -730; z <= 430; z += 232) mast(524, z);
  for (const z of [575, 995]) { mast(444, z); }
  for (const z of [-1250, -910]) mast(434, z);

  // ====================================================================== ZONA RPA: REFUGIOS Y ESTACIÓN DE CONTROL
  const shelters = new THREE.Group();
  const shellGeo = new THREE.CylinderGeometry(14, 14, 19, 22, 1, true, 0, Math.PI).rotateZ(Math.PI / 2).scale(1, 0.56, 1);
  const ribGeo = new THREE.TorusGeometry(14, 0.16, 6, 22, Math.PI).rotateY(Math.PI / 2).scale(1, 0.56, 1);
  const SHELTER_X = 392, shelterZ = [630, 735, 840, 945];
  const fab = new THREE.MeshStandardMaterial({ color: 0xc9b98f, roughness: 0.9, side: THREE.DoubleSide, emissive: 0x6b5f44, emissiveIntensity: 0.55 });
  for (const z of shelterZ) {
    const s = new THREE.Mesh(shellGeo, fab); s.position.set(SHELTER_X, 0, z); s.castShadow = s.receiveShadow = true; shelters.add(s);
    for (const dx of [-9.5, -4.75, 0, 4.75, 9.5]) add('steel', ribGeo.clone().translate(SHELTER_X + dx, 0, z));
    box('wall', 19, 0.5, 0.6, SHELTER_X, 0, z - 14); box('wall', 19, 0.5, 0.6, SHELTER_X, 0, z + 14);
    // puesto: T amarilla
    rect('yellow', SHELTER_X - 40, SHELTER_X + 6, z - 0.12, z + 0.12, Y_LINE);
    rect('yellow', SHELTER_X - 9, SHELTER_X - 8.76, z - 6, z + 6, Y_LINE);
  }
  base.add(shelters);
  // estación de control en tierra (GCS): contenedores, antenas parabólicas y mástil
  const containers = [];
  const GX = 468, GZ = 705;
  containers.push({ x: GX, z: GZ, ry: 0 }, { x: GX, z: GZ + 5, ry: 0 }, { x: GX + 8, z: GZ + 22, ry: Math.PI / 2 });
  const dish = (x, z, r, ry) => {
    cyl('steel', 0.18, 0.28, r * 1.25, x, 0, z, 8);
    const d = new THREE.SphereGeometry(r * 1.6, 20, 8, 0, Math.PI * 2, 0, 0.68);
    d.translate(0, -r * 1.6, 0).rotateX(Math.PI).rotateX(-0.95).rotateY(ry).translate(x, r * 1.35, z);
    add('dishWhite', d);
    box('wall', 2.4, 0.4, 2.4, x, 0, z);
  };
  dish(GX - 6, GZ + 14, 2.6, 0.6); dish(GX + 2, GZ + 14, 1.6, 0.9);
  cyl('steel', 0.1, 0.16, 16, GX + 12, 0, GZ - 4, 6);
  for (let i = 0; i < 4; i++) box('steel', 2.6 - i * 0.4, 0.06, 0.06, GX + 12, 12 + i * 1.1, GZ - 4);
  box('olive', 2.4, 1.6, 1.4, GX - 5, 0, GZ - 4); box('olive', 2.4, 1.6, 1.4, GX - 5, 0, GZ + 9);     // generadores
  for (let i = 0; i < 6; i++) hescoUnits.push({ x: GX - 10 + i * 2.15, z: GZ - 9, ry: 0 });
  posts.push({ x: GX - 3.5, z: GZ + 2.5, ry: -Math.PI / 2 }, { x: SHELTER_X - 14, z: shelterZ[0] + 6, ry: 0.8 }, { x: SHELTER_X - 12, z: shelterZ[2] - 7, ry: 2.4 }, { x: SHELTER_X - 16, z: shelterZ[1] + 3, ry: -1.2 });
  // armeros: bombas y misiles en carros
  const carts = [[SHELTER_X - 20, shelterZ[1] - 9], [SHELTER_X - 20, shelterZ[2] + 9]];
  const gbus = [], hells = [];
  for (const [cx, cz] of carts) {
    box('olive', 4.2, 0.18, 2.2, cx, 0.55, cz);
    for (const [ox, oz] of [[-1.6, -0.9], [1.6, -0.9], [-1.6, 0.9], [1.6, 0.9]]) add('dark', new THREE.CylinderGeometry(0.28, 0.28, 0.18, 12).rotateX(Math.PI / 2).translate(cx + ox, 0.28, cz + oz));
    box('steel', 0.08, 0.08, 2.0, cx - 3.0, 0.5, cz, Math.PI / 2);
    gbus.push({ x: cx - 0.2, y: 0.76, z: cz - 0.55, ry: Math.PI / 2 }, { x: cx - 0.2, y: 0.76, z: cz + 0.55, ry: Math.PI / 2 });
    for (let i = 0; i < 3; i++) hells.push({ x: cx + 1.0, y: 0.83, z: cz - 0.6 + i * 0.3, rx: Math.PI / 2, ry: Math.PI / 2 });
  }
  assets.instanced('gbu12', gbus, base);
  assets.instanced('hellfire', hells, base);

  // ====================================================================== ZONA DE VIDA: BARRACONES, TIENDAS, COMEDOR
  const tents = [];
  for (let i = 0; i < 9; i++) for (let j = 0; j < 4; j++) tents.push({ x: 712 + i * 46, z: -410 + j * 56, ry: (j % 2) * Math.PI });
  for (let i = 0; i < 6; i++) for (let j = 0; j < 2; j++) tents.push({ x: 720 + i * 46, z: -1250 + j * 56, ry: Math.PI / 2 });
  assets.instanced('tent', tents, base);
  for (let b = 0; b < 3; b++) for (let r = 0; r < 6; r++) for (let i = 0; i < 9; i++) {
    const x = 706 + b * 148 + i * 13.5, z = -790 + r * 58;
    if (z > -460) continue;
    box(i % 4 === 1 ? 'ply' : 'wall', 7, 2.9, 22, x, 0, z);
    box(r % 2 ? 'metal' : 'metalDark', 7.7, 0.22, 22.8, x, 2.9, z);
    box('dark', 1, 2.1, 0.1, x, 0, z - 11.05);
    if (R() < 0.5) box('steel', 1.1, 0.9, 0.9, x + 2.2, 0, z + 11.6);
  }
  // muros T de hormigón alrededor de los bloques
  const tRun = (xa, za, xb, zb) => { const len = Math.hypot(xb - xa, zb - za); box('wall', len, 3.7, 0.4, (xa + xb) / 2, 0, (za + zb) / 2, Math.atan2(-(zb - za), xb - xa)); };
  for (let b = 0; b < 3; b++) { const xa = 698 + b * 148, xb = xa + 124; tRun(xa, -806, xb, -806); tRun(xa, -806, xa, -620); tRun(xb, -700, xb, -470); }
  tRun(690, -445, 1105, -445); tRun(690, -205, 900, -205);
  // edificios grandes (comedor, gimnasio, PX, mando)
  shed(760, -90, 70, 34, 7.5, 'metal'); shed(900, -90, 54, 30, 7, 'wall'); shed(1040, -80, 46, 40, 9, 'metal');
  shed(760, 60, 60, 26, 6, 'wall'); shed(905, 70, 50, 30, 6.5, 'metal'); shed(1040, 80, 50, 34, 6, 'wall');
  shed(770, 250, 44, 22, 5.5, 'wall'); shed(880, 250, 44, 22, 5.5, 'metal'); shed(1000, 260, 60, 30, 8, 'metal');
  for (const [x, z] of [[720, 360], [800, 360], [880, 360], [960, 360], [1040, 360]]) shed(x, z, 50, 16, 4.2, R() < 0.5 ? 'wall' : 'ply');
  // depósitos de agua
  for (let i = 0; i < 3; i++) { cyl('whitePaint', 3.2, 3.2, 5.5, 1120, 0, 190 + i * 10, 16); }
  // mástil de comunicaciones
  cyl('steel', 0.25, 0.5, 42, 1085, 0, -200, 6);
  for (let i = 0; i < 6; i++) box('steel', 3.2 - i * 0.35, 0.1, 0.1, 1085, 14 + i * 5, -200, i);
  cyl('red', 0.3, 0.3, 0.5, 1085, 42, -200, 8);

  // ====================================================================== PARQUE MÓVIL
  rect('apron', 700, 1010, 570, 1000, Y_PAVE);
  shed(760, 965, 90, 40, 9, 'metal');
  const parked = { humvee: [], mrap: [], truck: [], fueltruck: [], hilux: [] };
  for (let i = 0; i < 12; i++) parked.humvee.push({ x: 716 + i * 5.6, z: 600, ry: Math.PI + (R() - 0.5) * 0.05 });
  for (let i = 0; i < 8; i++) parked.mrap.push({ x: 718 + i * 6.8, z: 650, ry: (R() - 0.5) * 0.05 });
  for (let i = 0; i < 6; i++) parked.mrap.push({ x: 718 + i * 6.8, z: 705, ry: Math.PI });
  for (let i = 0; i < 9; i++) parked.truck.push({ x: 716 + i * 5.4, z: 760, ry: (R() - 0.5) * 0.06 });
  for (let i = 0; i < 6; i++) parked.humvee.push({ x: 830 + i * 5.6, z: 600, ry: Math.PI });
  for (let i = 0; i < 5; i++) parked.hilux.push({ x: 890 + i * 4.6, z: 760, ry: i % 2 ? 0 : Math.PI });
  // vehículos repartidos por la base
  parked.humvee.push({ x: WALL.x1 - 20, z: GATE_Z + 14, ry: Math.PI / 2 }, { x: 540, z: 350, ry: 0.3 }, { x: 452, z: 690, ry: 1.2 }, { x: 300, z: -470, ry: 2 }, { x: 610, z: -110, ry: 0 });
  parked.mrap.push({ x: WALL.x1 + 22, z: GATE_Z + 9, ry: -Math.PI / 2 }, { x: 600, z: 265, ry: 0 }, { x: 420, z: -930, ry: 1.5 });
  parked.hilux.push({ x: 602, z: 150, ry: 0 }, { x: 606, z: 152, ry: 0 }, { x: 742, z: -150, ry: 1.57 }, { x: 990, z: 30, ry: 0 }, { x: 870, z: 225, ry: 1.57 });
  parked.truck.push({ x: 430, z: 590, ry: 1.2 }, { x: 600, z: -40, ry: 0 }, { x: 962, z: -155, ry: 1.57 });

  // ====================================================================== CONTENEDORES
  for (let r = 0; r < 4; r++) for (let i = 0; i < 9; i++) {
    const x = 1040 + r * 22, z = 600 + i * 7.2, n = 1 + Math.floor(R() * 2.4);
    for (let k = 0; k < n; k++) containers.push({ x, y: k * 2.45, z, ry: (R() - 0.5) * 0.04 });
  }
  for (let i = 0; i < 14; i++) containers.push({ x: 700 + R() * 380, z: 1090 + R() * 40, ry: Math.PI / 2 + (R() - 0.5) * 0.3 });
  for (let i = 0; i < 6; i++) containers.push({ x: 245 + i * 8, z: 470, ry: Math.PI / 2 });
  assets.instanced('container', containers, base);

  // ====================================================================== DEPÓSITO DE COMBUSTIBLE
  {
    const fx = 720, fz = 1180;
    rect('apron', fx - 14, fx + 150, fz - 18, fz + 100, Y_PAVE);
    for (let i = 0; i < 6; i++) for (let j = 0; j < 2; j++) {
      const x = fx + 10 + i * 13, z = fz + 12 + j * 26;
      add(i % 2 ? 'olive' : 'tankTan', new THREE.CapsuleGeometry(2.1, 14, 6, 14).rotateX(Math.PI / 2).translate(x, 2.9, z));
      for (const o of [-5, 5]) box('wall', 3.4, 1.0, 0.8, x, 0, z + o);
    }
    for (let i = 0; i < 3; i++) { cyl('whitePaint', 6.5, 6.5, 8, fx + 104, 0, fz + 8 + i * 22, 22); cyl('steel', 6.7, 6.7, 0.25, fx + 104, 8, fz + 8 + i * 22, 22); }
    const b = [fx - 12, fx + 122, fz - 14, fz + 68];
    box('hesco', b[1] - b[0], 1.6, 1.4, (b[0] + b[1]) / 2, 0, b[2]); box('hesco', b[1] - b[0], 1.6, 1.4, (b[0] + b[1]) / 2, 0, b[3]);
    box('hesco', 1.4, 1.6, b[3] - b[2], b[0], 0, (b[2] + b[3]) / 2); box('hesco', 1.4, 1.6, b[3] - b[2] - 16, b[1], 0, (b[2] + b[3]) / 2 + 8);
    box('metal', 16, 0.3, 9, fx + 60, 5, fz + 86); for (const [ox, oz] of [[-7, -4], [7, -4], [-7, 4], [7, 4]]) cyl('steel', 0.15, 0.15, 5, fx + 60 + ox, 0, fz + 86 + oz, 6);
    parked.fueltruck.push({ x: fx + 20, z: fz + 86, ry: Math.PI / 2 }, { x: fx + 60, z: fz + 86, ry: Math.PI / 2 }, { x: fx + 100, z: fz + 90, ry: Math.PI / 2 });
    posts.push({ x: fx + 126, z: fz + 2, ry: 0 });
  }
  parked.fueltruck.push({ x: 300, z: -600, ry: 0.5 });

  // ====================================================================== POLVORÍN
  {
    const igloo = new THREE.CylinderGeometry(6.5, 6.5, 22, 16, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).scale(1, 0.75, 1);
    for (let r = 0; r < 2; r++) for (let i = 0; i < 5; i++) {
      const x = 760 + i * 62, z = 1700 + r * 150;
      add('earth', igloo.clone().translate(x, 0, z));
      box('wall', 0.6, 5.6, 14.5, x - 11, 0, z); box('dark', 0.2, 3.4, 4.2, x - 11.35, 0, z);
      box('hesco', 34, 2.3, 1.5, x + 2, 0, z - 13); box('hesco', 34, 2.3, 1.5, x + 2, 0, z + 13); box('hesco', 1.5, 2.3, 27.5, x + 19, 0, z);
    }
    rect('road', 720, 1050, 1772, 1779, Y_ROAD); rect('road', 720, 727, 1520, 2000, Y_ROAD);
    posts.push({ x: 716, z: 1690, ry: -Math.PI / 2 });
  }

  // ====================================================================== LADO OESTE: RADAR, MANGAS, PAPI
  const radar = new THREE.Group();
  {
    const x = -250, z = -380;
    box('wall', 9, 3.2, 7, x + 9, 0, z); box('metalDark', 9.6, 0.25, 7.6, x + 9, 3.2, z);
    for (const [ox, oz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) cyl('steel', 0.14, 0.2, 13, x + ox, 0, z + oz, 6);
    for (let i = 1; i < 5; i++) { box('steel', 4.2, 0.1, 0.1, x, i * 2.8, z - 2); box('steel', 4.2, 0.1, 0.1, x, i * 2.8, z + 2); box('steel', 0.1, 0.1, 4.2, x - 2, i * 2.8, z); box('steel', 0.1, 0.1, 4.2, x + 2, i * 2.8, z); }
    box('steel', 5.4, 0.3, 5.4, x, 13, z);
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 4.2, 18, 1, true, -0.45, 0.9).translate(0, 0, -8.4), new THREE.MeshStandardMaterial({ color: 0xc8501e, roughness: 0.6, metalness: 0.3, side: THREE.DoubleSide }));
    ant.position.y = 3.2; ant.rotation.x = 0.12; ant.castShadow = true;
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 1.6, 10).translate(0, 0.8, 0), M.steel);
    const feed = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 5.5).translate(0, 1.8, 2.6), M.steel);
    radar.add(ant, ped, feed); radar.position.set(x, 13.3, z);
    base.add(radar);
  }
  const sockGeo = new THREE.CylinderGeometry(0.2, 0.55, 3.4, 10, 1, true).rotateZ(Math.PI / 2 + 0.25);
  for (const z of [L / 2 - 420, -L / 2 + 420]) { cyl('steel', 0.07, 0.09, 6.5, -75, 0, z, 6); add('orange', sockGeo.clone().translate(-73.2, 6.1, z)); }
  for (const s of [1, -1]) for (let i = 0; i < 4; i++) box('papi', 1.1, 0.5, 0.9, -s * (W / 2 + 14 + i * 9), 0, s * (L / 2 - 330));
  box('wall', 3, 2.6, 2.6, -120, 0, L / 2 - 310); cyl('steel', 0.1, 0.1, 12, -124, 0, L / 2 - 310, 6);                // senda de planeo

  // ====================================================================== AERONAVES ESTACIONADAS
  const c130s = [{ x: 330, z: -640, ry: Math.PI / 2 + 0.25 }, { x: 330, z: -430, ry: Math.PI / 2 + 0.25 }];
  assets.instanced('c130', c130s, base);
  const apaches = [];
  for (const z of [-1190, -1090, -990]) for (const x of [290, 370]) apaches.push({ x, z, ry: Math.PI / 2 });
  assets.instanced('apache', apaches, base);
  for (const a of apaches) { rect('yellow', a.x - 9, a.x + 9, a.z - 9.1, a.z - 8.9, Y_LINE); rect('yellow', a.x - 9, a.x + 9, a.z + 8.9, a.z + 9.1, Y_LINE); rect('yellow', a.x - 9.1, a.x - 8.9, a.z - 9, a.z + 9, Y_LINE); rect('yellow', a.x + 8.9, a.x + 9.1, a.z - 9, a.z + 9, Y_LINE); }
  for (const c of c130s) { rect('yellow', c.x - 30, c.x + 60, c.z - 0.12, c.z + 0.12, Y_LINE); }
  posts.push({ x: 318, z: -612, ry: 2 }, { x: 322, z: -609, ry: -1 }, { x: 300, z: -1140, ry: 0.4 }, { x: 352, z: -1040, ry: 2.8 }, { x: 345, z: -410, ry: 1 });

  for (const [k, list] of Object.entries(parked)) assets.instanced(k, list, base);
  assets.instanced('hesco', hescoUnits, base);

  // ====================================================================== BALIZAMIENTO
  const lights = { white: [], green: [], red: [], blue: [], amber: [] };
  for (let z = -L / 2; z <= L / 2 + 1; z += 60) for (const sx of [-1, 1]) lights[Math.abs(z) > L / 2 - 610 ? 'amber' : 'white'].push([sx * (W / 2 + 2.2), z]);
  for (const s of [1, -1]) {
    for (let i = -8; i <= 8; i++) { lights.green.push([i * 2.7, s * (L / 2 + 1.5)]); lights.red.push([i * 2.7, s * (L / 2 + 3.2)]); }
    for (let k = 1; k <= 9; k++) for (let i = -2; i <= 2; i++) lights.white.push([i * 1.4, s * (L / 2 + 6 + k * 30)]);   // luces de aproximación
    for (let i = -10; i <= 10; i++) lights.white.push([i * 1.6, s * (L / 2 + 6 + 300)]);
  }
  for (let z = -L / 2; z <= L / 2; z += 45) for (const sx of [-1, 1]) lights.blue.push([TX + sx * (TW / 2 + 1), z]);
  const lightGeo = new THREE.BoxGeometry(0.2, 0.22, 0.2).translate(0, 0.2, 0);
  const lcol = { white: 0xfff4d8, green: 0x35ff6a, red: 0xff3a2a, blue: 0x3d6dff, amber: 0xffb53a };
  const dummy = new THREE.Object3D();
  for (const [k, pts] of Object.entries(lights)) {
    const im = new THREE.InstancedMesh(lightGeo, new THREE.MeshBasicMaterial({ color: lcol[k] }), pts.length);
    pts.forEach(([x, z], i) => { dummy.position.set(x, 0.06, z); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); });
    im.name = `balizas-${k}`; base.add(im);
  }

  // ---------- materiales auxiliares y ensamblado
  M.dishWhite = new THREE.MeshStandardMaterial({ color: 0xd9d9d4, roughness: 0.5, side: THREE.DoubleSide });
  M.tankTan = new THREE.MeshStandardMaterial({ color: 0xa8956c, roughness: 0.8 });
  M.papi = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, emissive: 0xff6a4a, emissiveIntensity: 1.2 });
  const flat = new Set(['road', 'taxi', 'apron', 'runway', 'white', 'yellow', 'rubber']);
  const order = { road: 1, taxi: 2, apron: 2, runway: 3, rubber: 4, yellow: 5, white: 6 };
  for (const [k, list] of Object.entries(G)) {
    const m = mergedMesh(list, M[k], { cast: !flat.has(k), receive: true, name: k });
    if (flat.has(k)) m.renderOrder = order[k];
    base.add(m);
  }

  base.updateMatrixWorld(true);

  // rutas de patrulla motorizada (bucle por el vial perimetral y el eje central)
  const routes = [
    [[P.x0, P.z0], [P.x1, P.z0], [P.x1, P.z1], [P.x0, P.z1]],
    [[RX, P.z0], [P.x1, P.z0], [P.x1, GATE_Z], [RX, GATE_Z]],
    [[RX, P.z1], [RX, GATE_Z], [P.x1, GATE_Z], [P.x1, P.z1]],
  ];
  // patrullas a pie
  const patrols = [
    [[536, -700], [536, 400]], [[690, -445], [1105, -445]], [[232, 575], [432, 575]], [[650, 560], [650, 1000]],
    [[1030, 590], [1030, 990]], [[WALL.x1 - 30, GATE_Z - 60], [WALL.x1 - 30, GATE_Z + 60]], [[228, -1250], [428, -1250]], [[700, -210], [900, -210]],
  ];

  return {
    group: base, routes, patrols, posts, radar, runwayHeading: CFG.heading,
    spawn: { x: 0, z: L / 2 - 14 },                       // cabecera 03
    shelters: shelterZ.map((z) => ({ x: SHELTER_X + 1, z })),
    localToWorld: (x, y, z) => base.localToWorld(new THREE.Vector3(x, y, z)),
  };
}
