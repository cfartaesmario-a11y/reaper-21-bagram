import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { DEG } from './util.js';

/**
 * Modelos 3D (ver CREDITS.md). Para cada uno:
 *  yaw   giro para que el frente del modelo mire a -Z
 *  len   longitud real (m) a lo largo de `axis` tras girar (z = largo, x = ancho/envergadura, y = alto)
 *  tint  multiplicador de color opcional;  heat  firma térmica (0..1) para el sensor IR
 */
const MODELS = {
  mq9:       { yaw: 90, len: 20.1, axis: 'x', ground: false },
  humvee:    { yaw: -90, len: 4.9, axis: 'z', heat: 0.55 },
  truck:     { yaw: -90, len: 5.3, axis: 'z', heat: 0.5 },
  mrap:      { yaw: 180, len: 7.1, axis: 'z', tint: 0xb9aa8a, heat: 0.6 },
  hilux:     { yaw: 90, len: 5.1, axis: 'z', heat: 0.5, paint: 0xd8d6cf },
  fueltruck: { yaw: 180, len: 15.2, axis: 'z', tint: 0x9a9a78, heat: 0.45 },
  c130:      { yaw: -125.5, len: 29.8, axis: 'z', heat: 0.35, repaint: 0x7d8387 },
  apache:    { yaw: 90, len: 17.2, axis: 'z', heat: 0.4 },
  hangar:    { yaw: 0, len: 64, axis: 'z' },
  hesco:     { yaw: 0, len: 2.1, axis: 'x' },
  tower:     { yaw: 0, len: 8.6, axis: 'y' },
  container: { yaw: 0, len: 6.06, axis: 'x' },
  tent:      { yaw: 0, len: 11.2, axis: 'x', boost: [1.9, 1.75, 1.35] },
  hellfire:  { yaw: 0, len: 1.63, axis: 'y' },
  gbu12:     { yaw: 0, len: 3.33, axis: 'z' },
  soldier:   { raw: true },
};

const TEXTURES = {
  asphalt:  ['asphalt_02', 9],
  gravel:   ['sandy_gravel_02', 6],
  metal:    ['corrugated_iron_02', 3],
  clay:     ['clay_plaster', 4],
  wall:     ['concrete_wall_008', 4],
};

export async function loadAssets(renderer, onProgress) {
  const manager = new THREE.LoadingManager();
  manager.onProgress = (_u, loaded, total) => onProgress?.(loaded / total);
  const gltf = new GLTFLoader(manager).setMeshoptDecoder(MeshoptDecoder);
  const tl = new THREE.TextureLoader(manager);
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const tex = (file, srgb, tile) => {
    const t = tl.load(`assets/textures/${file}.jpg`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(1 / tile, 1 / tile);       // las UV de la geometría van en metros
    t.anisotropy = aniso;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const textures = {};
  for (const [k, [name, tile]] of Object.entries(TEXTURES)) {
    textures[k] = { map: tex(`${name}_diff`, true, tile), normalMap: tex(`${name}_nor`, false, tile), roughnessMap: tex(`${name}_rough`, false, tile) };
  }
  // la textura de detalle del terreno se muestrea con coordenadas de mundo propias
  textures.gravel.map.repeat.set(1, 1);
  textures.grass = tex('sparse_grass_diff', true, 1);
  textures.rock = tex('rocky_terrain_02_diff', true, 1);

  const models = {};
  const heatMaterials = [];
  await Promise.all(Object.entries(MODELS).map(async ([name, def]) => {
    const g = await gltf.loadAsync(`assets/models/${name}.glb`);
    if (def.raw) { models[name] = { scene: g.scene, animations: g.animations }; return; }
    models[name] = { scene: normalize(g.scene, def, heatMaterials), def };
  }));

  /** Copia independiente (comparte geometría y materiales). */
  const spawn = (name) => models[name].scene.clone(true);

  /**
   * Muchas copias en pocas llamadas de dibujo: un InstancedMesh por cada malla del prototipo.
   * transforms: [{x, y, z, ry, rx, s}] en el espacio del `parent`.
   */
  const instanced = (name, transforms, parent, { cast = true, receive = true } = {}) => {
    const proto = models[name].scene;
    proto.updateMatrixWorld(true);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), e = new THREE.Euler();
    const out = [];
    proto.traverse((c) => {
      if (!c.isMesh) return;
      const im = new THREE.InstancedMesh(c.geometry, c.material, transforms.length);
      transforms.forEach((t, i) => {
        e.set(t.rx || 0, t.ry || 0, 0, 'YXZ'); q.setFromEuler(e); p.set(t.x, t.y || 0, t.z); s.setScalar(t.s || 1);
        m4.compose(p, q, s).multiply(c.matrixWorld);
        im.setMatrixAt(i, m4);
      });
      im.instanceMatrix.needsUpdate = true;
      im.castShadow = cast; im.receiveShadow = receive;
      im.computeBoundingSphere(); im.computeBoundingBox();
      im.name = `${name}-inst`;
      parent.add(im); out.push(im);
    });
    return out;
  };

  return { models, textures, spawn, instanced, heatMaterials };
}

function normalize(scene, def, heatMaterials) {
  const pivot = new THREE.Group();
  pivot.add(scene);
  scene.rotation.y = (def.yaw || 0) * DEG;
  pivot.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(pivot);
  const size = box.getSize(new THREE.Vector3());
  const k = def.len / size[def.axis];
  scene.scale.multiplyScalar(k);
  pivot.updateMatrixWorld(true);
  box.setFromObject(pivot);
  const c = box.getCenter(new THREE.Vector3());
  scene.position.x -= c.x; scene.position.z -= c.z;
  scene.position.y -= def.ground === false ? c.y : box.min.y;
  pivot.updateMatrixWorld(true);

  const seen = new Set();
  scene.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = true;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (seen.has(m)) continue; seen.add(m);
      if (def.repaint !== undefined && !m.transparent) { m.map = null; m.color.set(def.repaint); m.roughness = 0.55; m.metalness = 0.3; }
      if (def.paint !== undefined && m.color.getHSL({}).l < 0.08 && !m.map) { m.color.set(def.paint); m.roughness = 0.45; m.metalness = 0.2; }
      if (def.tint !== undefined) m.color.multiply(new THREE.Color(def.tint));
      if (def.boost) m.color.setRGB(...def.boost);
      if (m.map) m.map.anisotropy = 8;
      if (!m.metalnessMap) m.metalness = Math.min(m.metalness, 0.3);
      m.envMapIntensity = 0.9;
      if (def.heat) heatMaterials.push({ mat: m, heat: def.heat, emissive: m.emissive.clone(), intensity: m.emissiveIntensity, map: m.emissiveMap });
    }
  });
  return pivot;
}
