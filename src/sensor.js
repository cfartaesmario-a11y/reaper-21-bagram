import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { DEG, clamp, angDiff } from './util.js';

export const SENSOR_MODES = ['EO DÍA', 'IR BLANCO-CALIENTE', 'IR NEGRO-CALIENTE'];
const FOVS = [28, 12, 5, 2, 0.8];

const SensorShader = {
  uniforms: { tDiffuse: { value: null }, mode: { value: 0 }, time: { value: 0 }, res: { value: new THREE.Vector2(1, 1) }, exposure: { value: 0.62 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform int mode; uniform float time; uniform vec2 res; uniform float exposure; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    vec3 aces(vec3 x){ return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
    void main(){
      vec2 px = 1.0 / res;
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      if (mode == 0) {
        c = aces(c * exposure);
        c = mix(vec3(dot(c, vec3(0.299, 0.587, 0.114))), c, 0.82);
        c = pow(c, vec3(1.0 / 2.2));
      } else {
        vec3 s = c * 0.4;
        s += texture2D(tDiffuse, vUv + vec2(px.x * 1.3, 0.0)).rgb * 0.15;
        s += texture2D(tDiffuse, vUv - vec2(px.x * 1.3, 0.0)).rgb * 0.15;
        s += texture2D(tDiffuse, vUv + vec2(0.0, px.y * 1.3)).rgb * 0.15;
        s += texture2D(tDiffuse, vUv - vec2(0.0, px.y * 1.3)).rgb * 0.15;
        float l = dot(s, vec3(0.30, 0.50, 0.20)) * exposure * 1.25;
        l = l / (1.0 + l * 0.75);
        l = smoothstep(0.03, 0.98, pow(l, 0.85));
        if (mode == 2) l = 1.0 - l;
        c = vec3(l);
      }
      float n = hash(vUv * res + fract(time) * 91.7) - 0.5;
      c += n * (mode == 0 ? 0.025 : 0.055);
      c *= 1.0 - 0.04 * sin(vUv.y * res.y * 3.14159);
      vec2 q = vUv - 0.5;
      c *= 1.0 - dot(q, q) * 0.55;
      gl_FragColor = vec4(c, 1.0);
    }`,
};

/** Torreta multiespectral: cámara estabilizada con zoom, seguimiento de punto y modos EO / IR. */
export class Sensor {
  constructor(renderer, scene, drone, terrain, env) {
    this.renderer = renderer; this.scene = scene; this.drone = drone; this.terrain = terrain; this.env = env;
    this.camera = new THREE.PerspectiveCamera(FOVS[0], 1, 0.6, 140000);
    this.az = 0; this.el = -25 * DEG;       // acimut (rumbo verdadero) y elevación de la línea de mira
    this.zoom = 0; this.mode = 0;
    this.lock = null;                        // punto del terreno fijado
    this.lockObj = null;                     // actor seguido (vehículo o persona)
    this.aim = null;                         // punto que ilumina el designador láser
    this.target = null; this.range = 0;
    this.dir = new THREE.Vector3();
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, this.camera));
    this.fx = new ShaderPass(SensorShader);
    this.composer.addPass(this.fx);
    this._p = new THREE.Vector3();
  }

  get fov() { return FOVS[this.zoom]; }
  setSize(w, h, pr) {
    this.composer.setPixelRatio(pr); this.composer.setSize(w, h);
    this.fx.uniforms.res.value.set(w * pr, h * pr);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }
  zoomBy(d) { this.zoom = clamp(this.zoom + d, 0, FOVS.length - 1); this.camera.fov = this.fov; this.camera.updateProjectionMatrix(); }
  nextMode() { this.mode = (this.mode + 1) % 3; }
  slew(dx, dy) {
    if (this.lock) { this.lock = null; this.lockObj = null; }
    const k = this.fov * DEG / 900;
    this.az += dx * k; this.el = clamp(this.el - dy * k, -89.5 * DEG, 12 * DEG);
  }
  /** Fija el punto bajo la retícula; si hay un actor cerca, lo sigue aunque se mueva. */
  toggleLock(world) {
    if (this.lock) { this.lock = null; this.lockObj = null; return; }
    if (!this.target) return;
    this.lock = this.target.clone();
    this.lockObj = world ? world.pick(this.target, Math.max(10, this.range * this.fov * 0.0006)) : null;
  }
  /** Orienta la torreta hacia delante y abajo (posición de crucero). */
  cage() { this.lock = null; this.lockObj = null; this.az = this.drone.heading; this.el = -20 * DEG; }

  update() {
    const d = this.drone;
    d.root.updateMatrixWorld(true);
    const p = this._p.copy(d.sensorPos); d.root.localToWorld(p);
    this.camera.position.copy(p);
    if (this.lockObj) { if (this.lockObj.alive) this.lock.set(this.lockObj.pos.x, this.lockObj.pos.y + 0.9, this.lockObj.pos.z); else this.lockObj = null; }
    if (this.lock) {
      this.dir.subVectors(this.lock, p).normalize();
      this.az = Math.atan2(this.dir.x, -this.dir.z);
      this.el = Math.asin(clamp(this.dir.y, -1, 1));
    } else {
      const ce = Math.cos(this.el);
      this.dir.set(Math.sin(this.az) * ce, Math.sin(this.el), -Math.cos(this.az) * ce);
    }
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(p.clone().add(this.dir));
    d.turret.rotation.y = -angDiff(this.az, d.heading);
    const hit = this.terrain.raycast(p, this.dir);
    this.target = hit ? hit.point : null;
    this.range = hit ? hit.distance : 0;
    if (this.lockObj) { this.aim = this.lock; this.range = this.lock.distanceTo(p); } else this.aim = this.target;
  }

  render(time, fx) {
    fx?.setScale(this.camera, this.renderer.domElement.height);
    const ir = this.mode > 0;
    this.env.setThermal(ir);
    this.fx.uniforms.mode.value = this.mode;
    this.fx.uniforms.time.value = time;
    this.composer.render();
    if (ir) this.env.setThermal(false);
  }
}
