import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const DEG = Math.PI / 180;
export const KT = 0.514444;      // m/s por nudo
export const FT = 0.3048;        // m por pie

/** Generador pseudoaleatorio determinista (mulberry32). */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
/** Diferencia angular normalizada a [-PI, PI]. */
export const angDiff = (a, b) => { let d = (a - b) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
/** Suavizado exponencial independiente del framerate. */
export const damp = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));

/**
 * Caja con UV en metros (las texturas se repiten por tamaño real, no por cara).
 * El origen queda en el centro de la base (y = 0 es el suelo) salvo que se indique `centerY`.
 */
export function boxGeo(w, h, d, x = 0, y = 0, z = 0, ry = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) {
    const k = f * 4 + i;
    uv.setXY(k, uv.getX(k) * dims[f][0], uv.getY(k) * dims[f][1]);
  }
  g.translate(0, h / 2, 0);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  return g;
}

/** Plano horizontal (normal +Y) con UV en metros. */
export function planeGeo(w, d, x = 0, y = 0, z = 0, ry = 0) {
  const g = new THREE.PlaneGeometry(w, d);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w, uv.getY(i) * d);
  g.rotateX(-Math.PI / 2);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  return g;
}

/** Cilindro vertical apoyado en y. */
export function cylGeo(rTop, rBot, h, x = 0, y = 0, z = 0, seg = 16, open = false) {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, open);
  g.translate(x, y + h / 2, z);
  return g;
}

/** Une geometrías (descarta atributos que no compartan todas) y devuelve un Mesh. */
export function mergedMesh(geos, material, opts = {}) {
  if (!geos.length) return null;
  const clean = geos.map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(k)) n.deleteAttribute(k);
    return n;
  });
  const geo = mergeGeometries(clean, false);
  geos.forEach((g) => g.dispose());
  const m = new THREE.Mesh(geo, material);
  m.castShadow = opts.cast ?? true;
  m.receiveShadow = opts.receive ?? true;
  if (opts.name) m.name = opts.name;
  return m;
}

/** Textura de lienzo ya configurada. */
export function canvasTexture(w, h, draw, { repeat = false, srgb = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/** Formatea grados decimales como DMS militar (N34°56'46.0"). */
export function dms(v, pos, neg) {
  const h = v >= 0 ? pos : neg; v = Math.abs(v);
  const d = Math.floor(v), mf = (v - d) * 60, m = Math.floor(mf), s = (mf - m) * 60;
  return `${h}${String(d).padStart(2, '0')}°${String(m).padStart(2, '0')}'${s.toFixed(1).padStart(4, '0')}"`;
}
