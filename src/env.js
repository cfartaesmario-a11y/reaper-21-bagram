import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { CFG } from './config.js';

/** Cielo físico, sol con sombras, luz ambiente, calima y conmutación a escena térmica. */
export function createEnvironment(renderer, scene, assets) {
  const sunDir = new THREE.Vector3(
    Math.sin(CFG.sunAzimuth) * Math.cos(CFG.sunElevation), Math.sin(CFG.sunElevation), -Math.cos(CFG.sunAzimuth) * Math.cos(CFG.sunElevation));

  const sky = new Sky();
  sky.scale.setScalar(900000);
  const u = sky.material.uniforms;
  u.turbidity.value = 5.5; u.rayleigh.value = 1.7; u.mieCoefficient.value = 0.006; u.mieDirectionalG.value = 0.86;
  u.sunPosition.value.copy(sunDir);
  scene.add(sky);

  // reflejos: mapa de entorno generado a partir del propio cielo
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const sky2 = new Sky(); sky2.scale.setScalar(1000); Object.entries(u).forEach(([k, v]) => { sky2.material.uniforms[k].value = v.value; });
  envScene.add(sky2);
  const ground = new THREE.Mesh(new THREE.SphereGeometry(900, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x7a6a50, side: THREE.BackSide }));
  envScene.add(ground);
  scene.environment = pmrem.fromScene(envScene, 0, 1, 2000).texture;
  scene.environmentIntensity = 0.35;
  pmrem.dispose();

  const fogColor = new THREE.Color(0xb9b5aa);
  scene.fog = new THREE.FogExp2(fogColor.getHex(), 0.000021);

  const sun = new THREE.DirectionalLight(0xfff0dc, 4.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  const S = 150;
  Object.assign(sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 10, far: 1800 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.35;
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0xbdd4f2, 0x8c7958, 0.55);
  scene.add(hemi);

  const texel = (S * 2) / 4096;
  const right = new THREE.Vector3().crossVectors(sunDir, new THREE.Vector3(0, 1, 0)).normalize();
  const up = new THREE.Vector3().crossVectors(right, sunDir).normalize();
  const tmp = new THREE.Vector3();
  /** Centra el mapa de sombras en el punto de interés (ajustado al téxel para que no tiemble). */
  const focusShadow = (p) => {
    const r = Math.round(p.dot(right) / texel) * texel, v = Math.round(p.dot(up) / texel) * texel, d = p.dot(sunDir);
    tmp.set(0, 0, 0).addScaledVector(right, r).addScaledVector(up, v).addScaledVector(sunDir, d);
    sun.target.position.copy(tmp);
    sun.position.copy(tmp).addScaledVector(sunDir, 900);
    sun.target.updateMatrixWorld();
  };

  let thermal = false;
  const black = new THREE.Color(0x050505);
  /** En modo IR el cielo es frío (negro) y los cuerpos calientes emiten. */
  const setThermal = (on) => {
    if (on === thermal) return;
    thermal = on;
    sky.visible = !on;
    scene.background = on ? black : null;
    scene.fog.color.set(on ? 0x2a2a2a : fogColor.getHex());
    for (const h of assets.heatMaterials) {
      if (on) { h.mat.emissive.setScalar(1); h.mat.emissiveIntensity = h.heat * 2.4; h.mat.emissiveMap = null; }
      else { h.mat.emissive.copy(h.emissive); h.mat.emissiveIntensity = h.intensity; h.mat.emissiveMap = h.map; }
    }
  };

  return { sunDir, sun, hemi, sky, focusShadow, setThermal };
}
