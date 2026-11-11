import * as THREE from 'three';
import { CFG } from './config.js';
import { smoothstep, clamp } from './util.js';

const loadOnce = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error(`no se pudo cargar ${src}`)); i.src = src; });
/** Carga una imagen con reintentos (las descargas grandes fallan a veces en conexiones inestables). */
async function loadImage(src, tries = 3) {
  for (let k = 0; ; k++) {
    try { return await loadOnce(k ? `${src}?r=${k}` : src); } catch (e) { if (k >= tries - 1) throw e; await new Promise((r) => setTimeout(r, 600)); }
  }
}

/**
 * Terreno real: elevación (Mapzen/AWS Terrain Tiles) + imagen Sentinel-2 del valle de Bagram.
 * Devuelve { mesh, getHeight(x,z), H0, size, toLocal, toWorld, greenness(x,z) }.
 */
export async function createTerrain(renderer, textures) {
  const meta = await (await fetch('assets/terrain/meta.json')).json();
  const [himg, simg] = await Promise.all([loadImage('assets/terrain/height.png'), loadImage('assets/terrain/satellite.jpg')]);

  const N = meta.heightPx, size = meta.sizeMeters, half = size / 2;
  const cv = document.createElement('canvas'); cv.width = cv.height = N;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  cx.drawImage(himg, 0, 0);
  const px = cx.getImageData(0, 0, N, N).data;
  const H = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) H[i] = (px[i * 4] * 256 + px[i * 4 + 1]) * meta.heightScale;

  // --- marco local de la base
  const ca = Math.cos(CFG.heading), sa = Math.sin(CFG.heading);
  // local (lx, lz) -> mundo: eje -z local apunta al rumbo de pista
  const toWorld = (lx, lz, out = new THREE.Vector3()) => out.set(CFG.baseX + lx * ca - lz * sa, 0, CFG.baseZ + lx * sa + lz * ca);
  const toLocal = (x, z) => { const dx = x - CFG.baseX, dz = z - CFG.baseZ; return [dx * ca + dz * sa, -dx * sa + dz * ca]; };

  const raw = (x, z) => {
    const fx = clamp((x / size + 0.5) * N - 0.5, 0, N - 1.001), fz = clamp((z / size + 0.5) * N - 0.5, 0, N - 1.001);
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
    const a = H[j * N + i], b = H[j * N + i + 1], c = H[(j + 1) * N + i], d = H[(j + 1) * N + i + 1];
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  };

  // --- aplanado del recinto
  let H0 = 0, n = 0;
  for (let lz = -1800; lz <= 1800; lz += 200) for (let lx = -100; lx <= 500; lx += 200) { const w = toWorld(lx, lz); H0 += raw(w.x, w.z); n++; }
  H0 = Math.round(H0 / n);
  const W = CFG.wall, fcx = (W.x0 + W.x1) / 2, fhw = (W.x1 - W.x0) / 2 + 330, fhl = (W.z1 - W.z0) / 2 + 330, margin = 900;
  const flatW = (x, z) => {
    const [lx, lz] = toLocal(x, z);
    return (1 - smoothstep(fhw, fhw + margin, Math.abs(lx - fcx))) * (1 - smoothstep(fhl, fhl + margin, Math.abs(lz)));
  };
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = ((i + 0.5) / N - 0.5) * size, z = ((j + 0.5) / N - 0.5) * size;
    if (Math.abs(x - CFG.baseX) > 5000 || Math.abs(z - CFG.baseZ) > 5000) continue;
    const w = flatW(x, z);
    if (w > 0) H[j * N + i] = H[j * N + i] * (1 - w) + H0 * w;
  }
  const getHeight = raw;

  // --- malla
  const SEG = 640;
  const geo = new THREE.PlaneGeometry(size, size, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, getHeight(pos.getX(i), pos.getZ(i)));
  geo.computeVertexNormals();
  geo.computeBoundingSphere(); geo.computeBoundingBox();

  const sat = new THREE.Texture(simg);
  sat.colorSpace = THREE.SRGBColorSpace;
  sat.anisotropy = renderer.capabilities.getMaxAnisotropy();
  sat.generateMipmaps = true; sat.minFilter = THREE.LinearMipmapLinearFilter;
  sat.needsUpdate = true;

  const mat = new THREE.MeshStandardMaterial({ map: sat, roughness: 1, metalness: 0 });
  const uni = {
    detailMap: { value: textures.gravel.map },
    grassMap: { value: textures.grass },
    rockMap: { value: textures.rock },
    baseRect: { value: new THREE.Vector4(fcx, 0, (W.x1 - W.x0) / 2 + 180, (W.z1 - W.z0) / 2 + 180) },
    baseRot: { value: new THREE.Vector4(CFG.baseX, CFG.baseZ, ca, sa) },
  };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uni);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos; varying vec3 vTN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(position, 1.0)).xyz; vTN = normal;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D detailMap; uniform sampler2D grassMap; uniform sampler2D rockMap;
        uniform vec4 baseRect; uniform vec4 baseRot; varying vec3 vWPos; varying vec3 vTN;
        const vec3 DM = vec3(0.324, 0.174, 0.086);   // color medio (lineal) de la textura de detalle
        float lum(vec3 c) { return dot(c, vec3(0.3, 0.55, 0.15)); }
        float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        {
          float dd = distance(vWPos, cameraPosition);
          vec2 xz = vWPos.xz;
          float f1 = 1.0 - smoothstep(30.0, 600.0, dd);
          float f2 = 1.0 - smoothstep(500.0, 7000.0, dd);
          vec3 d1 = texture2D(detailMap, xz * 0.11).rgb / DM;
          vec3 d2 = texture2D(detailMap, xz * 0.0137 + 0.37).rgb / DM;
          float d3 = lum(texture2D(detailMap, xz * 0.0017 + 0.11).rgb / DM);
          d1 = mix(vec3(lum(d1)), d1, 0.5); d2 = mix(vec3(lum(d2)), d2, 0.5);
          vec3 sat = diffuseColor.rgb;
          // clasificación a partir del propio satélite: vegetación y pendiente
          float veg = smoothstep(0.004, 0.035, sat.g - 0.5 * (sat.r + sat.b));
          float rock = smoothstep(0.84, 0.64, normalize(vTN).y);
          sat = mix(vec3(lum(sat)), sat, 1.2) * 0.94;
          // suelo seco
          vec3 soil = sat * mix(vec3(1.0), d1, f1 * 0.7) * mix(vec3(1.0), d2, f2 * 0.5) * mix(1.0, d3, 0.2);
          // cultivos y huertos: hierba real de cerca, surcos y variación entre parcelas
          float g1 = lum(texture2D(grassMap, xz * 0.16).rgb) / 0.052;
          float g2 = lum(texture2D(grassMap, xz * 0.021 + 0.5).rgb) / 0.052;
          vec2 cell = floor(xz / 140.0 + vec2(d3 * 0.6));
          float ang = hash2(cell) * 3.1416;
          float rows = sin(dot(xz, vec2(cos(ang), sin(ang))) * 2.1);
          float parcel = 0.93 + 0.14 * hash2(cell + 7.3);
          vec3 green = mix(sat, sat * vec3(0.8, 1.08, 0.7), 0.6) * parcel;
          green *= mix(1.0, g1, f1 * 0.75) * mix(1.0, g2, f2 * 0.3) * (1.0 + rows * 0.1 * f2);
          green = mix(green, vec3(0.085, 0.135, 0.04) * g1 * (0.9 + 0.2 * g2) * parcel, f1 * 0.5);
          // roca en las laderas
          float r1 = lum(texture2D(rockMap, xz * 0.05).rgb) / 0.07;
          float r2 = lum(texture2D(rockMap, xz * 0.006 + 0.3).rgb) / 0.07;
          vec3 stone = sat * mix(1.0, r1, f1 * 0.85) * mix(1.0, r2, f2 * 0.75) * 0.95;
          vec3 col = mix(soil, green, veg);
          col = mix(col, stone, rock * (1.0 - veg * 0.6));
          // suelo de grava del recinto militar
          vec2 dw = xz - baseRot.xy;
          vec2 l = vec2(dw.x * baseRot.z + dw.y * baseRot.w, -dw.x * baseRot.w + dw.y * baseRot.z);
          float nb = (d3 - 1.0) * 220.0 + (d2.r - 1.0) * 40.0;
          float wb = (1.0 - smoothstep(baseRect.z - 90.0, baseRect.z + 160.0, abs(l.x - baseRect.x) + nb))
                   * (1.0 - smoothstep(baseRect.w - 90.0, baseRect.w + 160.0, abs(l.y) + nb));
          vec3 gravel = vec3(0.50, 0.415, 0.29) * mix(vec3(1.0), d1, mix(0.3, 0.85, f1)) * mix(vec3(1.0), d2, 0.55) * mix(1.0, d3, 0.5);
          gravel = mix(gravel, soil * 1.05, 0.25);
          diffuseColor.rgb = mix(col, gravel, wb);
        }`);
  };

  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'terreno';

  // --- faldón exterior para que el horizonte no acabe en el borde del mosaico
  const group = new THREE.Group();
  group.add(mesh);
  const skirt = new THREE.Mesh(new THREE.PlaneGeometry(600000, 600000).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x8a7a5e, roughness: 1 }));
  skirt.position.y = 900;
  group.add(skirt);

  // --- muestreo de vegetación (verdor de la imagen satélite) para colocar árboles y aldeas
  const GS = 1024;
  const gc = document.createElement('canvas'); gc.width = gc.height = GS;
  const gx = gc.getContext('2d', { willReadFrequently: true });
  gx.drawImage(simg, 0, 0, GS, GS);
  const gp = gx.getImageData(0, 0, GS, GS).data;
  const greenness = (x, z) => {
    const i = clamp(Math.floor((x / size + 0.5) * GS), 0, GS - 1), j = clamp(Math.floor((z / size + 0.5) * GS), 0, GS - 1);
    const k = (j * GS + i) * 4;
    return (gp[k + 1] - (gp[k] + gp[k + 2]) * 0.5) / 255 + (1 - (gp[k] + gp[k + 1] + gp[k + 2]) / 765) * 0.25;
  };
  const slope = (x, z, d = 60) => Math.hypot(getHeight(x + d, z) - getHeight(x - d, z), getHeight(x, z + d) - getHeight(x, z - d)) / (2 * d);

  /** ¿Está el punto dentro de la plataforma aplanada del recinto? */
  const insideBase = (x, z, pad = 0) => { const [lx, lz] = toLocal(x, z); return lx > W.x0 - pad && lx < W.x1 + pad && lz > W.z0 - pad && lz < W.z1 + pad; };

  /** Intersección rayo-terreno por marcha (para el designador del sensor). */
  const raycast = (origin, dir, maxDist = 60000) => {
    let t = 0, step = 20;
    const p = new THREE.Vector3();
    let prevT = 0;
    while (t < maxDist) {
      p.copy(origin).addScaledVector(dir, t);
      if (Math.abs(p.x) > half || Math.abs(p.z) > half) return null;
      const h = getHeight(p.x, p.z);
      if (p.y <= h) {
        let a = prevT, b = t;
        for (let k = 0; k < 14; k++) { const m = (a + b) / 2; p.copy(origin).addScaledVector(dir, m); if (p.y <= getHeight(p.x, p.z)) b = m; else a = m; }
        p.copy(origin).addScaledVector(dir, b);
        return { point: p, distance: b };
      }
      prevT = t;
      step = clamp((p.y - h) * 0.5, 4, 400);
      t += step;
    }
    return null;
  };

  return { group, mesh, getHeight, H0, size, half, toWorld, toLocal, greenness, slope, insideBase, raycast, meta };
}
