import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CFG } from './config.js';
import { boxGeo, mergedMesh, rng } from './util.js';

/** Entorno civil del valle: aldeas de adobe (qalats) y arbolado, colocados según la imagen satélite. */
export function createScenery({ terrain, assets }) {
  const group = new THREE.Group(); group.name = 'entorno';
  const R = rng(4471);
  const T = assets.textures.clay;
  const mats = [[2.5, 3.2, 4.7], [2.1, 2.8, 4.2], [2.9, 3.7, 5.6]].map((c) => new THREE.MeshStandardMaterial({ map: T.map, normalMap: T.normalMap, roughnessMap: T.roughnessMap, color: new THREE.Color().setRGB(...c), roughness: 1 }));

  // ---------- aldeas
  const CELL = 2500;
  const chunks = new Map();
  const placed = [];
  const key = (x, z) => `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
  let tries = 0;
  while (placed.length < 520 && tries++ < 40000) {
    const ang = R() * Math.PI * 2, rad = 2600 + Math.sqrt(R()) * 12500;
    const x = CFG.baseX + Math.cos(ang) * rad, z = CFG.baseZ + Math.sin(ang) * rad;
    if (Math.abs(x) > terrain.half - 500 || Math.abs(z) > terrain.half - 500) continue;
    if (terrain.insideBase(x, z, 650)) continue;
    const g = terrain.greenness(x, z);
    if (g < 0.0 || g > 0.2 || terrain.slope(x, z, 40) > 0.05) continue;
    if (placed.some((p) => Math.abs(p[0] - x) < 70 && Math.abs(p[1] - z) < 70)) continue;
    placed.push([x, z]);
    const ry = R() * Math.PI, c = Math.cos(ry), s = Math.sin(ry);
    const w = 24 + R() * 26, d = 22 + R() * 24;
    const hs = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => terrain.getHeight(x + (a * w / 2) * c + (b * d / 2) * s, z - (a * w / 2) * s + (b * d / 2) * c));
    const y0 = Math.min(...hs) - 0.6, lift = Math.max(...hs) - y0;
    const mi = Math.floor(R() * 3);
    const list = chunks.get(`${key(x, z)}|${mi}`) || []; chunks.set(`${key(x, z)}|${mi}`, list);
    const put = (bw, bh, bd, ox, oz) => list.push(boxGeo(bw, bh + lift, bd, x + ox * c + oz * s, y0, z - ox * s + oz * c, ry));
    const wh = 2.8 + R() * 1.2;
    put(w, wh, 0.7, 0, -d / 2); put(w, wh, 0.7, 0, d / 2); put(0.7, wh, d, -w / 2, 0); put(0.7, wh, d - 5, w / 2, 2.5);
    const nb = 1 + Math.floor(R() * 3);
    for (let i = 0; i < nb; i++) {
      const bw = 7 + R() * 9, bd = 5 + R() * 5, side = i % 2 ? 1 : -1;
      put(bw, 3.2 + R() * 2.6, bd, (R() - 0.5) * (w - bw - 3), side * (d / 2 - bd / 2 - 0.6));
    }
    if (R() < 0.3) put(4, 6.5, 4, -w / 2 + 2.6, -d / 2 + 2.6);
  }
  for (const [k, list] of chunks) {
    const m = mergedMesh(list, mats[Number(k.split('|')[1])], { name: 'aldea' });
    group.add(m);
  }

  // ---------- arbolado
  const crown = new THREE.IcosahedronGeometry(1, 1).scale(1, 1.45, 1).translate(0, 1.9, 0);
  const trunk = new THREE.CylinderGeometry(0.09, 0.13, 1.1, 5).translate(0, 0.5, 0).toNonIndexed();
  const paint = (g, r, gr, b) => { const n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const sh = 0.75 + 0.25 * (g.attributes.position.getY(i) > 1.9 ? 1 : 0.6); a[i * 3] = r * sh; a[i * 3 + 1] = gr * sh; a[i * 3 + 2] = b * sh; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); g.deleteAttribute('uv'); };
  paint(crown, 1, 1, 1); paint(trunk, 0.55, 0.42, 0.3);
  const treeGeo = mergeGeometries([crown, trunk]);
  const treeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true });
  const tchunks = new Map();
  let count = 0; tries = 0;
  while (count < 26000 && tries++ < 420000) {
    const ang = R() * Math.PI * 2, rad = 2200 + Math.sqrt(R()) * 11500;
    const x = CFG.baseX + Math.cos(ang) * rad, z = CFG.baseZ + Math.sin(ang) * rad;
    if (Math.abs(x) > terrain.half - 300 || Math.abs(z) > terrain.half - 300) continue;
    const g = terrain.greenness(x, z);
    if (g < 0.095 || terrain.insideBase(x, z, 420) || terrain.slope(x, z, 30) > 0.12) continue;
    const k = key(x, z), l = tchunks.get(k) || []; tchunks.set(k, l);
    // pequeños grupos (huertos y alineaciones de álamos)
    const n = 1 + Math.floor(R() * 4), dirA = R() * Math.PI;
    for (let i = 0; i < n; i++) {
      const tx = x + Math.cos(dirA) * i * 7 + (R() - 0.5) * 3, tz = z + Math.sin(dirA) * i * 7 + (R() - 0.5) * 3;
      const tall = R() < 0.45;
      l.push({ x: tx, z: tz, y: terrain.getHeight(tx, tz) - 0.2, s: tall ? 2.6 + R() * 1.6 : 2.0 + R() * 1.2, sy: tall ? 1.5 + R() * 0.8 : 0.8 + R() * 0.4, c: 0.75 + R() * 0.5 });
      count++;
    }
  }
  const dummy = new THREE.Object3D(), col = new THREE.Color();
  for (const l of tchunks.values()) {
    const im = new THREE.InstancedMesh(treeGeo, treeMat, l.length);
    l.forEach((t, i) => {
      dummy.position.set(t.x, t.y, t.z); dummy.scale.set(t.s, t.s * t.sy, t.s); dummy.rotation.y = i; dummy.updateMatrix();
      im.setMatrixAt(i, dummy.matrix);
      im.setColorAt(i, col.setRGB(0.16 * t.c, 0.27 * t.c, 0.1 * t.c));
    });
    im.castShadow = true; im.receiveShadow = true; im.name = 'arboles';
    im.computeBoundingSphere(); im.computeBoundingBox();
    group.add(im);
  }
  return { group, compounds: placed.length, trees: count, sites: placed };
}
