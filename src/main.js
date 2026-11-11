import * as THREE from 'three';
import { loadAssets } from './assets.js';
import { createTerrain } from './terrain.js';
import { createEnvironment } from './env.js';
import { buildAirbase } from './airbase.js';
import { createScenery } from './scenery.js';
import { createLife } from './life.js';
import { Drone } from './drone.js';
import { Sensor } from './sensor.js';
import { HUD } from './hud.js';
import { DEG, clamp, damp, angDiff } from './util.js';

const $ = (id) => document.getElementById(id);
const canvas = $('view');
const status = (t, f) => { $('l-txt').textContent = t; if (f !== undefined) $('l-bar').style.width = `${Math.round(f * 100)}%`; };
// cede el hilo para repintar la barra de carga (con temporizador por si la pestaña está en segundo plano)
const nextFrame = () => new Promise((r) => { requestAnimationFrame(() => r()); setTimeout(r, 120); });

async function boot() {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
  const PR = Math.min(window.devicePixelRatio || 1, 1.5);
  renderer.setPixelRatio(PR);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.6;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();

  status('Cargando modelos y texturas…', 0.02);
  const assets = await loadAssets(renderer, (f) => status('Cargando modelos y texturas…', 0.02 + f * 0.5));
  status('Generando el valle de Bagram…', 0.55); await nextFrame();
  const terrain = await createTerrain(renderer, assets.textures);
  scene.add(terrain.group);
  status('Levantando el aeródromo…', 0.7); await nextFrame();
  const env = createEnvironment(renderer, scene, assets);
  const airbase = buildAirbase({ assets, terrain });
  scene.add(airbase.group);
  status('Poblando aldeas y arbolado…', 0.82); await nextFrame();
  const scenery = createScenery({ terrain, assets });
  scene.add(scenery.group);
  status('Desplegando personal y vehículos…', 0.9); await nextFrame();
  const life = createLife({ assets, airbase });
  const drone = new Drone(assets, terrain, airbase);
  scene.add(drone.group);
  const sensor = new Sensor(renderer, scene, drone, terrain, env);
  sensor.cage();
  const hud = new HUD(terrain);

  // ---------------------------------------------------------------- cámaras
  const camera = new THREE.PerspectiveCamera(55, 1, 0.5, 140000);
  let view = 'chase';
  const chase = { yaw: 0.5, pitch: 0.2, dist: 30, heading: drone.heading };
  const free = { pos: new THREE.Vector3(), yaw: 0, pitch: -0.12 };
  { const p = airbase.localToWorld(150, 14, 780); free.pos.copy(p); free.yaw = drone.heading - 1.9; }
  const focus = new THREE.Vector3();

  const resize = () => {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    sensor.setSize(w, h, PR);
  };
  window.addEventListener('resize', resize); resize();

  // ---------------------------------------------------------------- entrada
  const keys = new Set();
  let started = false;
  const setView = (v) => { view = v; if (v === 'chase' && document.pointerLockElement) document.exitPointerLock(); };
  window.addEventListener('keydown', (e) => {
    if (!started) return;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    keys.add(e.code);
    switch (e.code) {
      case 'Digit1': setView('chase'); break;
      case 'Digit2': setView('sensor'); break;
      case 'Digit3': setView('free'); break;
      case 'KeyC': setView({ chase: 'sensor', sensor: 'free', free: 'chase' }[view]); break;
      case 'KeyG': drone.toggleGear(); break;
      case 'KeyB': drone.toggleBrake(); break;
      case 'KeyP': drone.cycleAutopilot(); break;
      case 'KeyR': drone.reset(); sensor.cage(); break;
      case 'KeyH': hud.toggleHelp(); break;
      case 'KeyT': sensor.nextMode(); break;
      case 'KeyX': sensor.cage(); break;
      case 'Space': if (view === 'sensor') sensor.toggleLock(); break;
    }
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());
  let dragging = false;
  canvas.addEventListener('mousedown', () => { if (!started) return; if (view === 'chase') dragging = true; else if (!document.pointerLockElement) canvas.requestPointerLock?.(); });
  window.addEventListener('mouseup', () => { dragging = false; });
  window.addEventListener('mousemove', (e) => {
    const locked = document.pointerLockElement === canvas;
    if (view === 'chase' && dragging) { chase.yaw -= e.movementX * 0.005; chase.pitch = clamp(chase.pitch + e.movementY * 0.004, -0.5, 1.4); }
    else if (view === 'sensor' && (locked || e.buttons)) sensor.slew(e.movementX, e.movementY);
    else if (view === 'free' && (locked || e.buttons)) { free.yaw += e.movementX * 0.0022; free.pitch = clamp(free.pitch - e.movementY * 0.0022, -1.5, 1.5); }
  });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (view === 'sensor') sensor.zoomBy(e.deltaY < 0 ? 1 : -1);
    else if (view === 'chase') chase.dist = clamp(chase.dist * (e.deltaY < 0 ? 0.88 : 1.14), 14, 400);
  }, { passive: false });
  const axis = (pos, neg) => (pos.some((k) => keys.has(k)) ? 1 : 0) - (neg.some((k) => keys.has(k)) ? 1 : 0);
  const input = { pitch: 0, roll: 0, yaw: 0, throttle: 0 };
  const none = { pitch: 0, roll: 0, yaw: 0, throttle: 0 };

  // ---------------------------------------------------------------- cámaras: actualización
  const fwd = new THREE.Vector3(), tmp = new THREE.Vector3();
  const updateCamera = (dt) => {
    if (view === 'chase') {
      chase.heading += angDiff(drone.heading, chase.heading) * (1 - Math.exp(-2.2 * dt));
      const a = chase.heading + Math.PI + chase.yaw, cp = Math.cos(chase.pitch);
      camera.position.set(drone.pos.x + Math.sin(a) * cp * chase.dist, drone.pos.y + Math.sin(chase.pitch) * chase.dist + 1.2, drone.pos.z - Math.cos(a) * cp * chase.dist);
      const minY = terrain.getHeight(camera.position.x, camera.position.z) + 1.2;
      if (camera.position.y < minY) camera.position.y = minY;
      camera.lookAt(tmp.copy(drone.pos).addScaledVector(drone.fwd, 4));
      focus.copy(drone.pos);
    } else if (view === 'free') {
      const sp = (keys.has('ShiftLeft') ? 220 : 28) * dt;
      const cy = Math.cos(free.yaw), sy = Math.sin(free.yaw), cp = Math.cos(free.pitch);
      fwd.set(sy * cp, Math.sin(free.pitch), -cy * cp);
      free.pos.addScaledVector(fwd, axis(['KeyW', 'ArrowUp'], ['KeyS', 'ArrowDown']) * sp);
      free.pos.x += cy * axis(['KeyD', 'ArrowRight'], ['KeyA', 'ArrowLeft']) * sp; free.pos.z += sy * axis(['KeyD', 'ArrowRight'], ['KeyA', 'ArrowLeft']) * sp;
      free.pos.y += axis(['KeyE'], ['KeyQ']) * sp;
      free.pos.y = Math.max(free.pos.y, terrain.getHeight(free.pos.x, free.pos.z) + 1.7);
      camera.position.copy(free.pos);
      camera.lookAt(tmp.copy(free.pos).add(fwd));
      focus.copy(free.pos).addScaledVector(fwd, 45); focus.y = Math.min(focus.y, free.pos.y);
    }
  };

  // ---------------------------------------------------------------- bucle
  const clock = new THREE.Clock();
  let time = 0;
  const frame = () => {
    requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.05);
    time += dt;
    if (started && view !== 'free') {
      input.pitch = axis(['KeyS', 'ArrowDown'], ['KeyW', 'ArrowUp']);
      input.roll = axis(['KeyD', 'ArrowRight'], ['KeyA', 'ArrowLeft']);
      input.yaw = axis(['KeyE'], ['KeyQ']);
      input.throttle = axis(['ShiftLeft', 'ShiftRight', 'PageUp', 'NumpadAdd'], ['KeyZ', 'PageDown', 'NumpadSubtract']);
    }
    const steps = 2;
    for (let i = 0; i < steps; i++) drone.update(dt / steps, started && view !== 'free' ? input : none);
    sensor.update();
    updateCamera(dt);
    if (view === 'sensor') focus.copy(sensor.target || drone.pos);
    life.update(dt, focus);
    env.focusShadow(focus);
    if (view === 'sensor') sensor.render(time);
    else renderer.render(scene, camera);
    if (started) hud.update(dt, drone, sensor, view);
  };

  // precompilar sombreadores para que el primer fotograma no se atasque
  status('Compilando sombreadores…', 0.96); await nextFrame();
  updateCamera(0.016); env.focusShadow(focus);
  renderer.compile(scene, camera);
  frame();
  status(`Listo · ${scenery.compounds} recintos · ${scenery.trees} árboles`, 1);
  const go = $('go');
  go.disabled = false;
  const begin = () => { if (started) return; started = true; $('start').classList.add('hidden'); hud.show(); };
  go.addEventListener('click', begin);

  // ganchos para depuración y pruebas automáticas
  window.__game = { renderer, scene, camera, drone, sensor, terrain, airbase, life, env, chase, free, setView, begin, get view() { return view; }, keys };
  if (new URLSearchParams(location.search).has('auto')) begin();
}

boot().catch((e) => { console.error(e); status(`Error: ${e.message}`); });
