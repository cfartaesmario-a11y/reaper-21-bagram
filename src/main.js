import * as THREE from 'three';
import { loadAssets } from './assets.js';
import { createTerrain } from './terrain.js';
import { createEnvironment } from './env.js';
import { buildAirbase } from './airbase.js';
import { createScenery } from './scenery.js';
import { createLife } from './life.js';
import { createTraffic } from './traffic.js';
import { Drone } from './drone.js';
import { Sensor } from './sensor.js';
import { FX } from './fx.js';
import { World } from './npc.js';
import { Weapons } from './weapons.js';
import { Audio } from './audio.js';
import { Player } from './player.js';
import { Cinematic } from './cinematic.js';
import { Campaign, MISSIONS } from './missions.js';
import { UI } from './ui.js';
import { CFG } from './config.js';
import { clamp, angDiff } from './util.js';

const canvas = document.getElementById('view');
// cede el hilo para repintar la barra de carga (con temporizador por si la pestaña está en segundo plano)
const nextFrame = () => new Promise((r) => { requestAnimationFrame(() => r()); setTimeout(r, 120); });

const CONTROLS = `<div class="keys">
  <h4>A PIE</h4>
  <div><b>W A S D</b><span>Moverse</span></div><div><b>Mayús</b><span>Correr</span></div>
  <div><b>Ratón</b><span>Mirar</span></div><div><b>F</b><span>Entrar / salir de la estación</span></div>
  <h4>PILOTAJE</h4>
  <div><b>W / S</b><span>Morro abajo / arriba</span></div><div><b>A / D</b><span>Alabeo · dirección en tierra</span></div>
  <div><b>Q / E</b><span>Timón</span></div><div><b>Mayús / Z</b><span>Más / menos motor</span></div>
  <div><b>B</b><span>Freno de estacionamiento</span></div><div><b>G</b><span>Tren de aterrizaje</span></div>
  <div><b>P</b><span>Piloto automático: rumbo → órbita</span></div><div><b>1 · 2 · 3</b><span>Exterior · sensor · cámara de morro</span></div>
  <h4>SENSOR Y ARMAMENTO</h4>
  <div><b>Ratón / rueda</b><span>Apuntar torreta / zoom</span></div><div><b>Espacio</b><span>Fijar punto u objetivo</span></div>
  <div><b>T</b><span>EO · IR blanco · IR negro</span></div><div><b>X</b><span>Centrar torreta</span></div>
  <div><b>M</b><span>Armar / asegurar armamento</span></div><div><b>L</b><span>Designador láser</span></div>
  <div><b>Tab</b><span>Cambiar arma</span></div><div><b>Clic / Intro</b><span>Disparar</span></div>
  <div><b>Esc</b><span>Pausa</span></div><div><b>R</b><span>Reiniciar (vuelo libre)</span></div>
</div>`;

async function boot() {
  const audio = new Audio();
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
  const PR = Math.min(window.devicePixelRatio || 1, 1.5);
  renderer.setPixelRatio(PR);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.6;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();

  const status = (t, f) => { document.getElementById('l-txt').textContent = t; document.getElementById('l-bar').style.width = `${Math.round(f * 100)}%`; };
  status('Cargando modelos y texturas', 0.02);
  const assets = await loadAssets(renderer, (f) => status('Cargando modelos y texturas', 0.02 + f * 0.5));
  status('Generando el valle de Bagram', 0.55); await nextFrame();
  const terrain = await createTerrain(renderer, assets.textures);
  scene.add(terrain.group);
  const ui = new UI(terrain, audio);
  status('Levantando el aeródromo', 0.7); await nextFrame();
  const env = createEnvironment(renderer, scene, assets);
  const airbase = buildAirbase({ assets, terrain });
  scene.add(airbase.group);
  status('Poblando aldeas y arbolado', 0.8); await nextFrame();
  const scenery = createScenery({ terrain, assets });
  scene.add(scenery.group);
  status('Desplegando personal y vehículos', 0.9); await nextFrame();
  const life = createLife({ assets, airbase });
  const traffic = createTraffic({ assets, airbase, terrain, scene });
  const fx = new FX(scene, terrain);
  const world = new World({ assets, terrain, scene, fx });
  const drone = new Drone(assets, terrain, airbase);
  scene.add(drone.group);
  const sensor = new Sensor(renderer, scene, drone, terrain, env);
  sensor.cage();
  const weapons = new Weapons({ assets, scene, drone, sensor, terrain, fx, world, audio });
  const player = new Player({ assets, airbase, terrain, scene });

  const camera = new THREE.PerspectiveCamera(55, 1, 0.3, 140000);
  const cine = new Cinematic(camera, ui);
  const LW = (x, y, z) => airbase.localToWorld(x, y, z);
  const L = (lx, lz) => { const v = terrain.toWorld(lx, lz); return { x: v.x, z: v.z }; };
  const site = (lx, lz) => { const p = L(lx, lz); let best = scenery.sites[0], bd = Infinity; for (const s of scenery.sites) { const d = (s[0] - p.x) ** 2 + (s[1] - p.z) ** 2; if (d < bd) { bd = d; best = s; } } return { x: best[0], z: best[1] }; };

  // ---------------------------------------------------------------- estado
  let mode = 'menu';            // menu | cine | foot | gcs
  let view = 'chase';           // chase | sensor | nose | free
  let freeFlight = false, paused = false, expectUnlock = false, time = 0;
  const chase = { yaw: 0.5, pitch: 0.2, dist: 30, heading: drone.heading };
  const free = { pos: new THREE.Vector3(), yaw: 0, pitch: -0.1 };
  const focus = new THREE.Vector3();
  const keys = new Set();
  const input = { pitch: 0, roll: 0, yaw: 0, throttle: 0 }, none = { pitch: 0, roll: 0, yaw: 0, throttle: 0 };
  const axis = (pos, neg) => (pos.some((k) => keys.has(k)) ? 1 : 0) - (neg.some((k) => keys.has(k)) ? 1 : 0);
  const unlock = () => { if (document.pointerLockElement) { expectUnlock = true; document.exitPointerLock(); } };
  const setView = (v) => { view = v; if (v === 'chase') unlock(); };

  const campaign = new Campaign({ world, drone, sensor, weapons, terrain, airbase, ui, fx, audio, L, site, onMissionEnd: (S) => debrief(S) });
  world.onExplode = (p) => { if (!campaign.S && terrain.insideBase(p.x, p.z, 150)) ui.toast('IMPACTO DENTRO DEL AERÓDROMO', true, 4); };

  const resize = () => {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    sensor.setSize(w, h, PR);
  };
  window.addEventListener('resize', resize); resize();

  // ---------------------------------------------------------------- flujo de juego
  const gcsDoor = LW(airbase.gcs.x, 1.6, airbase.gcs.z);
  const placePlayer = () => { const s = airbase.playerSpawn; player.place(s.x, s.z, CFG.heading + Math.atan2(airbase.gcs.x - s.x, -(airbase.gcs.z - s.z))); };

  function showMenu() {
    mode = 'menu'; paused = false; unlock(); campaign.abort(); freeFlight = false;
    ui.closePanel(); ui.gcsFrame(false); ui.prompt(null); ui.objective(null);
    drone.reset(); weapons.rearm(); player.obj.visible = false;
    const i = campaign.index, items = [];
    if (campaign.complete) items.push({ label: 'Campaña', sub: 'Completada · volver a empezar', info: '<p>Has terminado las cinco misiones. Puedes empezar de nuevo.</p>', fn: () => { campaign.reset(); startCampaign(); } });
    else items.push({ label: i ? 'Continuar campaña' : 'Campaña', sub: `Misión ${i + 1} de ${MISSIONS.length} · ${MISSIONS[i].name}`, info: '<p>Un turno como operador de MQ-9 en Bagram. Recorre la base, entra en la estación de control y acepta las tareas que te asigne el mando: reconocimiento, apoyo aéreo cercano, escolta y ataque.</p>', fn: () => startCampaign() });
    if (i && !campaign.complete) items.push({ label: 'Nueva campaña', sub: 'Borra el progreso', info: '<p>Empieza desde la primera misión.</p>', fn: () => { campaign.reset(); startCampaign(); } });
    items.push({ label: 'Vuelo libre', sub: 'Sin misiones', info: '<p>El aparato en la cabecera de la pista 03, armado y sin tareas. Hay vehículos abandonados al noroeste para practicar con el sensor y el armamento.</p>', fn: () => startFree() });
    items.push({ label: 'Controles', info: '<p>Teclado y ratón.</p>', fn: () => ui.panel({ tag: 'Ayuda', title: 'Controles', html: CONTROLS, actions: [{ label: 'Volver', primary: true, fn: () => ui.closePanel() }] }) });
    items.push({ label: 'Créditos', info: '<p>Modelos, terreno y texturas de terceros.</p>', fn: () => ui.panel({ tag: 'Créditos', title: 'Reaper 21', html: '<p>Terreno: Mapzen Terrain Tiles y Sentinel-2 cloudless (EOX, datos Copernicus 2016). Texturas: Poly Haven (CC0). Motor: three.js.</p><p>Modelos 3D con licencia CC BY de sus autores en Sketchfab: Tyler V Howell, MadTrollStudio, Raphael Escamilla, zakirakil, simonthedigger, xephoney, NA3dmodel, David_Holiday, manilov.ap, Muhamad Mirza Arrafi, ElectricL, Aidan Callaghan, Lex713, Sebastian Webster y Mehdi Shahsavan. Lista completa en CREDITS.md.</p><p>Es un juego: no representa operaciones, unidades ni personas reales.</p>', actions: [{ label: 'Volver', primary: true, fn: () => ui.closePanel() }] }) });
    ui.menu(items);
  }

  async function startCampaign() {
    audio.start(); await ui.fade(true); ui.hideMenu();
    placePlayer();
    if (campaign.index === 0) {
      mode = 'cine';
      const sp = airbase.playerSpawn, head = () => new THREE.Vector3(player.pos.x, player.pos.y + 1.5, player.pos.z);
      cine.play([
        { from: LW(-2600, 950, 5200), to: LW(-1300, 560, 3700), look: LW(300, 0, 200), dur: 9, title: 'Provincia de Parwan, Afganistán', sub: 'Aeródromo de Bagram · 06:12 hora local' },
        { from: LW(150, 4.5, 585), to: LW(262, 3.6, 700), look: LW(392, 2.6, 735), dur: 8, fov: 38, title: 'Escuadrón expedicionario de reconocimiento', sub: 'Sistemas aéreos pilotados a distancia' },
        { from: LW(300, 60, -80), to: LW(420, 34, 150), look: LW(572, 22, 330), look2: LW(420, 4, 600), dur: 8, title: 'Veinticuatro horas, siete días', sub: 'Alguien siempre está mirando' },
        { from: LW(sp.x + 11, 3.4, sp.z + 13), to: LW(sp.x + 3.2, 1.9, sp.z + 4.5), look: head, dur: 6, fov: 40, title: 'Reaper 21', sub: 'Tu turno empieza ahora' },
      ], enterFoot);
    } else enterFoot();
    ui.fade(false);
  }

  function enterFoot() {
    mode = 'foot'; ui.gcsFrame(false); player.obj.visible = true;
    ui.objective('Aeródromo de Bagram', campaign.complete ? 'Campaña completada. Puedes volver a la estación para volar libremente' : 'Entra en la estación de control en tierra (GCS)');
    if (campaign.index === 0 && !campaign.S) ui.radio('CENTURIÓN', 'Reaper Dos Uno, le esperamos en la estación. El aparato está en cabecera con el motor en marcha.');
  }

  async function enterGCS() {
    ui.prompt(null); unlock(); await ui.fade(true);
    mode = 'gcs'; setView('chase'); ui.gcsFrame(true); player.obj.visible = false;
    ui.fade(false);
    if (!campaign.S || campaign.S.done) offerTask();
  }
  async function exitGCS() {
    if (freeFlight) return;
    unlock(); drone.holdHere(); await ui.fade(true);
    mode = 'foot'; ui.gcsFrame(false); player.obj.visible = true; ui.fade(false);
    if (!campaign.S) ui.objective('Aeródromo de Bagram', 'Vuelve a la estación de control cuando quieras');
  }

  function offerTask() {
    if (campaign.complete) { ui.objective('Campaña completada', 'Vuelo libre: el aparato es tuyo'); weapons.rearm(); return; }
    const i = campaign.index, def = MISSIONS[i];
    audio.alarm();
    ui.panel({ tag: `Tarea entrante · Misión ${i + 1} de ${MISSIONS.length} · ${def.kind}`, title: def.name, html: campaign.briefHTML(i), actions: [{ label: 'Aceptar tarea', primary: true, fn: () => startMission(i) }, { label: 'Ahora no', fn: () => { ui.closePanel(); ui.objective('Estación de control', 'Pulsa Intro para pedir la tarea cuando estés listo'); } }] });
  }

  async function startMission(i) {
    ui.closePanel(); paused = false; await ui.fade(true);
    campaign.begin(i);
    const S = campaign.S, def = S.def, t = def.target ? def.target(S) : S.A, gy = terrain.getHeight(t.x, t.z);
    const P = (dx, dy, dz) => new THREE.Vector3(t.x + dx, gy + dy, t.z + dz);
    mode = 'cine';
    const shots = i === 4
      ? [{ from: LW(-60, 30, 2600), to: LW(-30, 12, 1900), look: LW(0, 0, 1500), dur: 6, title: `Misión ${i + 1}`, sub: def.name }]
      : [{ from: P(-900, 520, 700), to: P(-420, 300, 330), look: P(0, 0, 0), dur: 6.5, title: `Misión ${i + 1}`, sub: def.name }, { from: P(120, 26, 150), to: P(60, 12, 80), look: P(20, 2, 0), dur: 4.5, fov: 34 }];
    cine.play(shots, () => { mode = 'gcs'; setView(def.air ? 'sensor' : 'chase'); ui.gcsFrame(true); });
    ui.fade(false);
  }

  function debrief(S) {
    const ok = S.ok, last = campaign.complete;
    unlock();
    const actions = ok
      ? [last ? { label: 'Terminar campaña', primary: true, fn: () => { ui.closePanel(); campaign.abort(); showMenu(); } } : { label: 'Siguiente tarea', primary: true, fn: () => { ui.closePanel(); campaign.abort(); offerTask(); } }, { label: 'Salir de la estación', fn: () => { ui.closePanel(); campaign.abort(); drone.reset(); exitGCS(); } }]
      : [{ label: 'Reintentar', primary: true, fn: () => startMission(S.i) }, { label: 'Menú principal', fn: () => showMenu() }];
    ui.panel({ tag: ok ? 'Informe de misión' : 'Misión fracasada', title: ok ? (last ? 'Campaña completada' : 'Misión cumplida') : S.def.name, html: campaign.debriefHTML(), actions });
  }

  async function startFree() {
    audio.start(); await ui.fade(true); ui.hideMenu();
    freeFlight = true; mode = 'gcs'; setView('chase'); ui.gcsFrame(false);
    world.clear(); drone.reset(); weapons.rearm();
    const r = site(-2600, -4200);
    for (let k = 0; k < 4; k++) world.spawnVehicle({ model: k % 2 ? 'truck' : 'hilux', x: r.x + 60 + k * 16, z: r.z + (k % 2) * 14, faction: 'enemy', ry: k });
    ui.objective('Vuelo libre', 'Blancos de práctica al noroeste (vehículos abandonados)');
    ui.fade(false);
  }

  function pause() {
    if (mode === 'menu' || ui.panelOpen || cine.active) return;
    paused = true; unlock();
    const actions = [{ label: 'Reanudar', primary: true, fn: () => { ui.closePanel(); paused = false; } }];
    if (campaign.S && !campaign.S.done) actions.push({ label: 'Reiniciar misión', fn: () => startMission(campaign.S.i) });
    actions.push({ label: 'Controles', fn: () => ui.panel({ tag: 'Ayuda', title: 'Controles', html: CONTROLS, actions: [{ label: 'Volver', primary: true, fn: () => { ui.closePanel(); paused = false; pause(); } }] }) });
    actions.push({ label: 'Menú principal', fn: () => showMenu() });
    ui.panel({ tag: 'Pausa', title: 'Reaper 21', html: '', actions });
  }

  // ---------------------------------------------------------------- entrada
  const fire = () => { const why = weapons.fire(); if (why) ui.toast(why, true, 1.6); };
  window.addEventListener('keydown', (e) => {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    if (mode === 'menu') { ui.menuKey(e.code); if (e.code === 'Escape' && ui.panelOpen) ui.closePanel(); return; }
    if (cine.active) { if (e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape') cine.skip(); return; }
    if (e.code === 'Escape') { if (ui.panelOpen && paused) { ui.closePanel(); paused = false; } else pause(); return; }
    if (ui.panelOpen) { if (e.code === 'Enter' && ui.panelActions?.[0]) ui.panelActions[0].fn(); return; }
    keys.add(e.code);
    if (mode === 'foot') { if (e.code === 'KeyF' && player.distLocal(airbase.gcs.x, airbase.gcs.z) < 4.5) enterGCS(); return; }
    if (mode !== 'gcs') return;
    switch (e.code) {
      case 'Digit1': setView('chase'); break;
      case 'Digit2': setView('sensor'); break;
      case 'Digit3': setView('nose'); break;
      case 'Digit4': if (freeFlight) { setView('free'); free.pos.copy(camera.position); } break;
      case 'KeyG': drone.toggleGear(); break;
      case 'KeyB': drone.toggleBrake(); break;
      case 'KeyP': drone.cycleAutopilot(sensor.aim); break;
      case 'KeyR': if (freeFlight) { drone.reset(); weapons.rearm(); sensor.cage(); } break;
      case 'KeyT': sensor.nextMode(); break;
      case 'KeyX': sensor.cage(); break;
      case 'KeyM': weapons.master = !weapons.master; audio.click(); break;
      case 'KeyL': weapons.laser = !weapons.laser; audio.click(); break;
      case 'Tab': weapons.select(); audio.click(); break;
      case 'Enter': if (!campaign.S && !freeFlight) offerTask(); else fire(); break;
      case 'Space': sensor.toggleLock(world); break;
      case 'KeyF': exitGCS(); break;
    }
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());
  let dragging = false;
  canvas.addEventListener('mousedown', (e) => {
    if (mode === 'menu' || cine.active || ui.panelOpen) return;
    const locked = document.pointerLockElement === canvas;
    if (mode === 'gcs' && view === 'sensor' && locked && e.button === 0) { fire(); return; }
    if (mode === 'gcs' && (view === 'chase' || view === 'nose')) { dragging = true; return; }
    if (!locked) { try { canvas.requestPointerLock()?.catch?.(() => {}); } catch { /* sin captura de ratón */ } }
  });
  window.addEventListener('mouseup', () => { dragging = false; });
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement) return;
    if (expectUnlock) { expectUnlock = false; return; }
    if ((mode === 'foot' || mode === 'gcs') && !ui.panelOpen) pause();      // Esc con el ratón capturado
  });
  window.addEventListener('mousemove', (e) => {
    if (paused || mode === 'menu') return;
    const locked = document.pointerLockElement === canvas;
    if (mode === 'foot') { if (locked) player.look(e.movementX, e.movementY); return; }
    if (mode !== 'gcs') return;
    if (view === 'chase' && dragging) { chase.yaw -= e.movementX * 0.005; chase.pitch = clamp(chase.pitch + e.movementY * 0.004, -0.5, 1.4); }
    else if (view === 'sensor' && locked) sensor.slew(e.movementX, e.movementY);
    else if (view === 'free' && locked) { free.yaw += e.movementX * 0.0022; free.pitch = clamp(free.pitch - e.movementY * 0.0022, -1.5, 1.5); }
  });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (mode === 'foot') player.zoom(e.deltaY);
    else if (mode === 'gcs' && view === 'sensor') sensor.zoomBy(e.deltaY < 0 ? 1 : -1);
    else if (mode === 'gcs' && view === 'chase') chase.dist = clamp(chase.dist * (e.deltaY < 0 ? 0.88 : 1.14), 14, 400);
  }, { passive: false });

  // ---------------------------------------------------------------- cámaras
  const fwd = new THREE.Vector3(), tmp = new THREE.Vector3(), mb = new THREE.Vector3();
  const setFov = (f) => { if (camera.fov !== f) { camera.fov = f; camera.updateProjectionMatrix(); } };
  const updateCamera = (dt) => {
    if (mode === 'menu') {
      const a = time * 0.035 + 2.2;
      mb.copy(LW(330 + Math.cos(a) * 520, 60 + Math.sin(time * 0.05) * 14, 760 + Math.sin(a) * 620));
      camera.position.copy(mb); camera.lookAt(LW(392, 4, 760)); setFov(42); focus.copy(LW(392, 0, 760));
    } else if (mode === 'foot') { setFov(58); player.update(dt, { fwd: axis(['KeyW', 'ArrowUp'], ['KeyS', 'ArrowDown']), strafe: axis(['KeyD', 'ArrowRight'], ['KeyA', 'ArrowLeft']), run: keys.has('ShiftLeft') || keys.has('ShiftRight') }, camera); focus.copy(player.pos); }
    else if (view === 'chase') {
      setFov(55);
      chase.heading += angDiff(drone.heading, chase.heading) * (1 - Math.exp(-2.2 * dt));
      const a = chase.heading + Math.PI + chase.yaw, cp = Math.cos(chase.pitch);
      camera.position.set(drone.pos.x + Math.sin(a) * cp * chase.dist, drone.pos.y + Math.sin(chase.pitch) * chase.dist + 1.2, drone.pos.z - Math.cos(a) * cp * chase.dist);
      camera.position.y = Math.max(camera.position.y, terrain.getHeight(camera.position.x, camera.position.z) + 1.2);
      camera.up.set(0, 1, 0); camera.lookAt(tmp.copy(drone.pos).addScaledVector(drone.fwd, 4));
      focus.copy(drone.pos);
    } else if (view === 'nose') {
      setFov(62);
      camera.position.copy(drone.pos).addScaledVector(drone.fwd, 4.3).addScaledVector(drone.upv, 0.25);
      camera.quaternion.copy(drone.group.quaternion);
      focus.copy(drone.pos);
    } else if (view === 'free') {
      setFov(55);
      const sp = (keys.has('ShiftLeft') ? 240 : 30) * dt, cy = Math.cos(free.yaw), sy = Math.sin(free.yaw), cp = Math.cos(free.pitch);
      fwd.set(sy * cp, Math.sin(free.pitch), -cy * cp);
      free.pos.addScaledVector(fwd, axis(['KeyW'], ['KeyS']) * sp);
      free.pos.x += cy * axis(['KeyD'], ['KeyA']) * sp; free.pos.z += sy * axis(['KeyD'], ['KeyA']) * sp;
      free.pos.y = Math.max(free.pos.y + axis(['KeyE'], ['KeyQ']) * sp, terrain.getHeight(free.pos.x, free.pos.z) + 1.7);
      camera.position.copy(free.pos); camera.up.set(0, 1, 0); camera.lookAt(tmp.copy(free.pos).add(fwd));
      focus.copy(free.pos).addScaledVector(fwd, 45);
    }
  };

  // ---------------------------------------------------------------- bucle
  const clock = new THREE.Clock();
  const HINT = {
    foot: 'W A S D moverse · Mayús correr · F interactuar · Esc pausa',
    chase: '1 exterior · 2 sensor · 3 morro · P piloto automático · G tren · B freno · F salir de la estación',
    nose: '1 exterior · 2 sensor · 3 morro · P piloto automático · G tren · B freno',
    sensor: 'Ratón apuntar · rueda zoom · Espacio fijar · T modo · M armar · L láser · Tab arma · clic disparar',
    free: 'Cámara libre: W A S D · Q/E · Mayús rápido',
  };
  const frame = () => {
    requestAnimationFrame(frame);
    const raw = Math.min(clock.getDelta(), 0.05), dt = paused ? 0 : raw;
    time += raw;
    const flying = mode === 'gcs' && view !== 'free' && !ui.panelOpen;
    if (flying) {
      input.pitch = axis(['KeyS', 'ArrowDown'], ['KeyW', 'ArrowUp']); input.roll = axis(['KeyD', 'ArrowRight'], ['KeyA', 'ArrowLeft']);
      input.yaw = axis(['KeyE'], ['KeyQ']); input.throttle = axis(['ShiftLeft', 'ShiftRight', 'PageUp', 'NumpadAdd'], ['KeyZ', 'PageDown', 'NumpadSubtract']);
    }
    if (dt > 0 && mode !== 'cine') { for (let i = 0; i < 2; i++) drone.update(dt / 2, flying ? input : none); }
    else if (dt > 0 && mode === 'cine') drone.apply(dt);
    sensor.update();
    if (cine.active) { if (dt > 0) cine.update(dt, focus); if (player.obj.visible) player.mixer.update(dt); }
    else updateCamera(dt);
    if (mode === 'gcs' && view === 'sensor') focus.copy(sensor.aim || drone.pos);
    if (dt > 0) {
      life.update(dt, focus); traffic.update(dt, drone); world.update(dt, focus); weapons.update(dt); fx.update(dt);
      if (mode === 'gcs') campaign.update(dt);
    }
    env.focusShadow(focus);
    // interacción a pie
    if (mode === 'foot') ui.prompt(player.distLocal(airbase.gcs.x, airbase.gcs.z) < 4.5 ? 'Entrar en la estación de control' : null);
    // audio
    const sensorView = mode === 'gcs' && view === 'sensor';
    const lc = sensorView ? drone.pos : camera.position; audio.listener.x = lc.x; audio.listener.y = lc.y; audio.listener.z = lc.z;
    audio.setScene(mode === 'menu' || paused ? 'off' : mode === 'gcs' ? (view === 'chase' || view === 'free' ? 'ext' : 'gcs') : mode === 'cine' ? 'off' : 'foot', drone.throttle, camera.position.distanceTo(drone.pos));
    // render
    if (sensorView && !cine.active) sensor.render(time, fx);
    else { fx.setScale(camera, renderer.domElement.height); renderer.render(scene, camera); }
    ui.update(raw);
    const marker = mode === 'foot' ? (campaign.complete ? null : { pos: gcsDoor, label: 'GCS' }) : mode === 'gcs' ? campaign.marker() : null;
    ui.draw({ mode: cine.active ? 'cine' : mode, view, drone, sensor, weapons, camera: sensorView ? sensor.camera : camera, marker, yaw: player.camYaw, hint: paused || ui.panelOpen ? '' : mode === 'foot' ? HINT.foot : mode === 'gcs' ? HINT[view] : '' });
  };

  status('Compilando sombreadores', 0.96); await nextFrame();
  showMenu(); updateCamera(0.016); env.focusShadow(focus);
  renderer.compile(scene, camera);
  frame();
  ui.menuReady();

  // ganchos para depuración y pruebas automáticas
  window.__game = { renderer, scene, camera, drone, sensor, terrain, airbase, life, env, chase, free, world, weapons, fx, campaign, player, ui, cine, audio, keys, setView, startCampaign, startFree, startMission, enterGCS, get mode() { return mode; }, get view() { return view; } };
}

boot().catch((e) => { console.error(e); document.getElementById('l-txt').textContent = `Error: ${e.message}`; });
