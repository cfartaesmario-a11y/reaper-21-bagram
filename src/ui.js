import * as THREE from 'three';
import { DEG, FT, KT, dms, angDiff, clamp } from './util.js';
import { SENSOR_MODES } from './sensor.js';
import { WEAPONS } from './weapons.js';

const $ = (id) => document.getElementById(id);
const W = '#f1efe9', DIM = 'rgba(241,239,233,0.6)', ACC = '#e3a548', BAD = '#e25a45';
const FONT = '"Bahnschrift","DIN Alternate","Roboto Condensed","Arial Narrow",Arial,sans-serif';

/** Interfaz: menú, paneles, subtítulos de radio y toda la simbología de vuelo y del sensor (dibujada en lienzo). */
export class UI {
  constructor(terrain, audio) {
    this.meta = terrain.meta; this.audio = audio;
    this.cv = $('hud'); this.c = this.cv.getContext('2d');
    this.queue = []; this.radioT = 0; this.toastT = 0; this.t = 0;
    this.v = new THREE.Vector3();
    this.navItems = []; this.navSel = 0;
    window.addEventListener('resize', () => this.resize()); this.resize();
  }
  resize() {
    const d = Math.min(window.devicePixelRatio || 1, 2);
    this.w = window.innerWidth; this.h = window.innerHeight;
    this.cv.width = this.w * d; this.cv.height = this.h * d; this.c.setTransform(d, 0, 0, d, 0, 0);
  }

  // ------------------------------------------------------------------ DOM
  loading(t, f) { $('l-txt').textContent = t; if (f !== undefined) $('l-bar').style.width = `${Math.round(f * 100)}%`; }
  menu(items) {
    this.navItems = items; this.navSel = 0;
    const nav = $('nav'); nav.innerHTML = '';
    items.forEach((it, i) => {
      const a = document.createElement('a');
      a.innerHTML = `${it.label}${it.sub ? `<small>${it.sub}</small>` : ''}`;
      a.addEventListener('mouseenter', () => { if (this.navSel !== i) { this.navSel = i; this.audio.hover(); this.menuSel(); } });
      a.addEventListener('click', () => { this.audio.click(); it.fn(); });
      nav.appendChild(a);
    });
    this.menuSel(); $('menu').classList.remove('hidden');
  }
  menuSel() {
    [...$('nav').children].forEach((a, i) => a.classList.toggle('sel', i === this.navSel));
    const it = this.navItems[this.navSel]; $('info').innerHTML = it ? `<h3>${it.label}</h3>${it.info || ''}` : '';
  }
  menuKey(code) {
    if ($('menu').classList.contains('hidden') || !$('panel').classList.contains('hidden')) return false;
    const n = this.navItems.length; if (!n) return false;
    if (code === 'ArrowDown' || code === 'KeyS') { this.navSel = (this.navSel + 1) % n; this.audio.hover(); this.menuSel(); return true; }
    if (code === 'ArrowUp' || code === 'KeyW') { this.navSel = (this.navSel + n - 1) % n; this.audio.hover(); this.menuSel(); return true; }
    if (code === 'Enter' || code === 'Space') { this.audio.click(); this.navItems[this.navSel].fn(); return true; }
    return false;
  }
  menuReady() { $('menu').classList.add('ready'); }
  hideMenu() { $('menu').classList.add('hidden'); }
  get menuOpen() { return !$('menu').classList.contains('hidden'); }

  objective(tag, text) { const o = $('objective'); if (!text) { o.classList.add('hidden'); return; } o.querySelector('small').textContent = tag; o.querySelector('b').textContent = text; o.classList.remove('hidden'); }
  /** Mensaje de radio con subtítulo (se encolan). */
  radio(who, text) { this.queue.push({ who, text, dur: clamp(1.8 + text.length * 0.055, 2.5, 9) }); }
  clearRadio() { this.queue.length = 0; this.radioT = 0; $('radio').classList.add('hidden'); }
  prompt(text) { const p = $('prompt'); if (!text) { p.classList.add('hidden'); return; } p.querySelector('span').textContent = text; p.classList.remove('hidden'); }
  toast(text, bad = false, dur = 3) { const t = $('toast'); t.textContent = text; t.classList.toggle('bad', bad); t.classList.remove('hidden'); this.toastT = dur; }
  panel({ tag = '', title = '', html = '', actions = [] }) {
    const p = $('panel'); p.querySelector('.tag').textContent = tag; p.querySelector('h2').textContent = title; p.querySelector('.body').innerHTML = html;
    const box = p.querySelector('.actions'); box.innerHTML = '';
    this.panelActions = actions;
    actions.forEach((a, i) => { const b = document.createElement('button'); b.textContent = a.label; if (a.primary) b.className = 'primary'; b.addEventListener('click', () => { this.audio.click(); a.fn(); }); box.appendChild(b); if (i === 0) setTimeout(() => b.focus(), 30); });
    p.classList.remove('hidden');
    if (document.pointerLockElement) document.exitPointerLock();
  }
  closePanel() { $('panel').classList.add('hidden'); this.panelActions = null; }
  get panelOpen() { return !$('panel').classList.contains('hidden'); }
  fade(on) { $('fade').classList.toggle('on', on); return new Promise((r) => setTimeout(r, 650)); }
  cine(on) { document.body.classList.toggle('cine', on); $('skip').classList.toggle('hidden', !on); if (!on) $('caption').classList.add('hidden'); }
  caption(h, p) { const c = $('caption'); if (!h) { c.classList.add('hidden'); return; } c.querySelector('h2').textContent = h; c.querySelector('p').textContent = p || ''; c.classList.remove('hidden'); c.style.animation = 'none'; void c.offsetWidth; c.style.animation = ''; }
  gcsFrame(on) { $('gcs-frame').classList.toggle('hidden', !on); }

  update(dt) {
    this.t += dt;
    if (this.radioT > 0) { this.radioT -= dt; if (this.radioT <= 0) $('radio').classList.add('hidden'); }
    if (this.radioT <= 0 && this.queue.length) {
      const m = this.queue.shift(), r = $('radio');
      r.querySelector('b').textContent = m.who; r.querySelector('span').textContent = m.text; r.classList.remove('hidden');
      this.radioT = m.dur; this.audio.radio();
    }
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) $('toast').classList.add('hidden'); }
  }

  // ------------------------------------------------------------------ lienzo
  txt(s, x, y, { size = 13, align = 'left', color = W, weight = 500, base = 'alphabetic' } = {}) {
    const c = this.c; c.font = `${weight} ${size}px ${FONT}`; c.textAlign = align; c.textBaseline = base; c.fillStyle = color; c.fillText(s, x, y);
  }
  line(pts, color = W, lw = 1.5) { const c = this.c; c.strokeStyle = color; c.lineWidth = lw; c.beginPath(); c.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); c.stroke(); }
  latlon(x, z) { return [dms(this.meta.lat - z / 110950, 'N', 'S'), dms(this.meta.lon + x / (111320 * Math.cos(this.meta.lat * DEG)), 'E', 'W')]; }

  /** s: { mode, view, drone, sensor, weapons, camera, marker, yaw, hint } */
  draw(s) {
    const c = this.c, w = this.w, h = this.h;
    c.clearRect(0, 0, w, h);
    if (s.mode === 'menu' || s.mode === 'cine') return;
    c.shadowColor = 'rgba(0,0,0,0.85)'; c.shadowBlur = 4;
    if (s.mode === 'foot') { this.compass(s.yaw / DEG, w / 2, 34, Math.min(460, w * 0.4), null); }
    else if (s.view === 'sensor') this.drawSensor(s);
    else this.drawFlight(s);
    if (s.marker && s.camera) this.marker(s.marker, s.camera);
    if (s.hint) this.txt(s.hint, w / 2, h - 22, { size: 12, align: 'center', color: DIM });
    c.shadowBlur = 0;
  }

  compass(hdg, cx, y, width, bug) {
    const c = this.c, ppd = width / 90;
    c.save(); c.beginPath(); c.rect(cx - width / 2, y - 26, width, 44); c.clip();
    const names = { 0: 'N', 90: 'E', 180: 'S', 270: 'O' };
    for (let a = Math.floor((hdg - 50) / 5) * 5; a <= hdg + 50; a += 5) {
      const x = cx + (a - hdg) * ppd, n = ((a % 360) + 360) % 360, major = n % 10 === 0;
      this.line([x, y, x, y + (major ? 9 : 5)], major ? W : DIM, 1.4);
      if (n % 30 === 0) this.txt(names[n] ?? String(n / 10).padStart(2, '0'), x, y - 6, { size: names[n] ? 15 : 12, align: 'center', weight: names[n] ? 700 : 500 });
    }
    if (bug !== null) { const dx = (angDiff(bug * DEG, hdg * DEG) / DEG) * ppd; if (Math.abs(dx) < width / 2) { c.strokeStyle = ACC; c.lineWidth = 2; c.strokeRect(cx + dx - 5, y - 1, 10, 9); } }
    c.restore();
    c.fillStyle = W; c.beginPath(); c.moveTo(cx - 6, y + 22); c.lineTo(cx, y + 12); c.lineTo(cx + 6, y + 22); c.closePath(); c.fill();
    this.txt(String(Math.round(((hdg % 360) + 360) % 360) % 360).padStart(3, '0'), cx, y + 40, { size: 17, align: 'center', weight: 600 });
  }

  tape(x, cy, value, step, pxPer, labelEvery, right) {
    const c = this.c, H = 210, dir = right ? 1 : -1;
    c.save(); c.beginPath(); c.rect(x - 70, cy - H / 2, 140, H); c.clip();
    const v0 = Math.floor((value - H / 2 / pxPer) / step) * step;
    for (let v = v0; v <= value + H / 2 / pxPer; v += step) {
      if (v < 0) continue;
      const y = cy - (v - value) * pxPer, major = Math.round(v / step) % labelEvery === 0;
      this.line([x, y, x + dir * (major ? 12 : 6), y], major ? W : DIM, 1.3);
      if (major && Math.abs(y - cy) > 22) this.txt(String(v), x + dir * 18, y, { size: 12, align: right ? 'left' : 'right', color: DIM, base: 'middle' });
    }
    c.restore();
    this.line([x, cy - H / 2, x, cy + H / 2], DIM, 1);
    c.fillStyle = 'rgba(10,11,12,0.72)'; c.strokeStyle = W; c.lineWidth = 1.5;
    const bx = right ? x + 8 : x - 92; c.fillRect(bx, cy - 18, 84, 36); c.strokeRect(bx, cy - 18, 84, 36);
  }

  drawFlight(s) {
    const d = s.drone, w = this.w, h = this.h, cy = h / 2, ap = d.ap;
    this.compass(d.headingDeg, w / 2, 34, Math.min(520, w * 0.42), ap.mode === 1 ? (ap.hdg / DEG + 360) % 360 : null);
    const lx = Math.max(110, w * 0.11), rx = w - Math.max(110, w * 0.11);
    this.tape(lx, cy, d.knots, 10, 2.6, 2, false);
    this.txt(String(Math.round(d.knots)), lx - 16, cy + 1, { size: 26, align: 'right', weight: 600, base: 'middle' });
    this.txt('KIAS', lx - 92, cy - 26, { size: 11, color: DIM });
    const altFt = d.pos.y / FT;
    this.tape(rx, cy, altFt, 100, 0.26, 5, true);
    this.txt(String(Math.round(altFt / 10) * 10), rx + 86, cy + 1, { size: 24, align: 'right', weight: 600, base: 'middle' });
    this.txt('FT MSL', rx + 92, cy - 26, { size: 11, align: 'right', color: DIM });
    const vs = Math.round(((d.vs / FT) * 60) / 50) * 50;
    this.txt(`V/S ${vs > 0 ? '+' : ''}${vs}`, rx + 92, cy + 134, { size: 13, align: 'right' });
    this.txt(`RA ${Math.max(0, Math.round(d.agl / FT / 10) * 10)}`, rx + 92, cy + 152, { size: 13, align: 'right', color: d.agl < 150 && !d.onGround ? ACC : W });
    this.txt(`G ${d.nz.toFixed(1)}`, lx - 92, cy + 134, { size: 13 });
    this.txt(`AOA ${(d.alpha / DEG).toFixed(0)}°`, lx - 92, cy + 152, { size: 13, color: d.alpha > 11 * DEG ? ACC : W });

    if (s.view === 'nose') this.ladder(s);

    // motor y sistemas
    const bx = 34, by = h - 96;
    this.txt('MOTOR', bx, by, { size: 11, color: DIM });
    this.c.strokeStyle = DIM; this.c.lineWidth = 1; this.c.strokeRect(bx, by + 8, 150, 7); this.c.fillStyle = W; this.c.fillRect(bx, by + 8, 150 * d.throttle, 7);
    this.txt(`${Math.round(d.throttle * 100)}%`, bx + 160, by + 16, { size: 13 });
    const moving = d.gearT > 0.05 && d.gearT < 0.95;
    this.chip(bx, by + 30, moving ? 'TREN ···' : d.gearDown ? 'TREN ABAJO' : 'TREN ARRIBA', moving ? ACC : d.gearDown ? W : DIM);
    this.chip(bx + 112, by + 30, d.brake ? 'FRENO' : 'FRENO —', d.brake && d.onGround ? ACC : DIM);
    this.chip(bx, by + 56, ap.mode === 0 ? 'AP —' : ap.mode === 1 ? `AP RUMBO ${String(Math.round((ap.hdg / DEG + 360) % 360)).padStart(3, '0')} · ${Math.round(ap.alt / FT / 100) * 100} FT · ${Math.round(ap.spd / KT)} KT` : `AP ÓRBITA ${ap.dir < 0 ? 'IZQ' : 'DCHA'} ${(ap.radius / 1000).toFixed(1)} KM · ${Math.round(ap.alt / FT / 100) * 100} FT`, ap.mode ? ACC : DIM);
    this.wpn(s);
    this.warn(s);
  }

  chip(x, y, text, color) { const c = this.c; c.font = `600 12px ${FONT}`; const tw = c.measureText(text).width + 16; c.strokeStyle = color; c.lineWidth = 1.2; c.strokeRect(x, y, tw, 20); this.txt(text, x + 8, y + 14, { size: 12, weight: 600, color }); return tw; }

  ladder(s) {
    const d = s.drone, c = this.c, w = this.w, h = this.h, ppd = h / s.camera.fov;
    c.save(); c.translate(w / 2, h / 2); c.rotate(-d.roll);
    const off = (d.pitch / DEG) * ppd;
    for (let p = -30; p <= 30; p += 5) {
      const y = off - p * ppd; if (Math.abs(y) > h * 0.32) continue;
      if (p === 0) { this.line([-w * 0.28, y, -60, y], W, 1.6); this.line([60, y, w * 0.28, y], W, 1.6); continue; }
      const l = p % 10 === 0 ? 70 : 38;
      c.setLineDash(p < 0 ? [7, 6] : []); this.line([-l - 46, y, -46, y], W, 1.4); this.line([46, y, l + 46, y], W, 1.4); c.setLineDash([]);
      if (p % 10 === 0) { this.txt(String(Math.abs(p)), -l - 54, y, { size: 12, align: 'right', base: 'middle' }); this.txt(String(Math.abs(p)), l + 54, y, { size: 12, base: 'middle' }); }
    }
    c.restore();
    // referencia de morro y vector velocidad
    this.line([w / 2 - 26, h / 2, w / 2 - 9, h / 2, w / 2, h / 2 + 9, w / 2 + 9, h / 2, w / 2 + 26, h / 2], W, 2);
    const fy = h / 2 + ((d.pitch - d.gamma) / DEG) * ppd;
    c.strokeStyle = ACC; c.lineWidth = 2; c.beginPath(); c.arc(w / 2, fy, 7, 0, 6.283); c.stroke();
    this.line([w / 2 - 20, fy, w / 2 - 7, fy], ACC, 2); this.line([w / 2 + 7, fy, w / 2 + 20, fy], ACC, 2); this.line([w / 2, fy - 7, w / 2, fy - 15], ACC, 2);
  }

  wpn(s) {
    const wp = s.weapons, w = this.w, h = this.h, x = w - 34, y = h - 110;
    this.txt('ARMAMENTO', x, y, { size: 11, align: 'right', color: DIM });
    this.txt(wp.master ? 'ARMADO' : 'SEGURO', x, y + 22, { size: 18, align: 'right', weight: 700, color: wp.master ? BAD : W });
    this.txt(`LÁSER ${wp.laser ? 'ARMADO' : 'OFF'}`, x, y + 42, { size: 13, align: 'right', color: wp.laser ? ACC : DIM });
    let yy = y + 62;
    for (const k of ['hellfire', 'gbu']) { const sel = wp.sel === k; this.txt(`${sel ? '▸ ' : ''}${WEAPONS[k].short}  ×${wp.left[k]}`, x, yy, { size: 14, align: 'right', weight: sel ? 700 : 500, color: sel ? W : DIM }); yy += 19; }
    const tti = wp.tti; if (tti >= 0) this.txt(`IMPACTO ${Math.ceil(tti)} s`, w / 2, h * 0.7, { size: 20, align: 'center', weight: 700, color: ACC });
  }

  warn(s) {
    const d = s.drone; let t = '', bad = false;
    if (d.crashed > 0) { t = `AERONAVE PERDIDA · ${d.crashReason}`; bad = true; }
    else if (d.stall) { t = 'PÉRDIDA'; bad = true; }
    else if (!d.onGround && d.agl < 130 && d.vs < -8) { t = 'TERRENO · ARRIBA'; bad = true; }
    else if (d.outOfArea) t = 'LÍMITE DEL ÁREA DE OPERACIONES';
    else if (d.hardLanding > 0) t = 'TOMA DURA';
    else if (!d.onGround && !d.gearDown && d.agl < 220 && d.vs < -1 && d.knots < 115) t = 'TREN';
    else if (d.onGround && d.brake && d.throttle > 0.05) t = 'FRENO DE ESTACIONAMIENTO';
    if (!t || (bad && Math.floor(this.t * 3) % 2)) return;
    this.txt(t, this.w / 2, this.h * 0.27, { size: 22, align: 'center', weight: 700, color: bad ? BAD : ACC });
  }

  drawSensor(s) {
    const sn = s.sensor, d = s.drone, wp = s.weapons, w = this.w, h = this.h, cx = w / 2, cy = h / 2;
    // retícula
    for (const [a, b] of [[-70, -22], [22, 70]]) { this.line([cx + a, cy, cx + b, cy], W, 1.6); this.line([cx, cy + a, cx, cy + b], W, 1.6); }
    this.c.fillStyle = W; this.c.fillRect(cx - 1.5, cy - 1.5, 3, 3);
    const mx = w * 0.16, my = h * 0.13, L = 44;
    for (const [x, y, sx, sy] of [[mx, my, 1, 1], [w - mx, my, -1, 1], [mx, h - my, 1, -1], [w - mx, h - my, -1, -1]]) this.line([x + sx * L, y, x, y, x, y + sy * L], 'rgba(241,239,233,0.8)', 1.6);
    const tx = mx + 14, ty = my + 22;
    this.txt(SENSOR_MODES[sn.mode], tx, ty, { size: 15, weight: 600 });
    this.txt(`FOV ${sn.fov.toFixed(1)}°  ×${Math.round(28 / sn.fov)}`, tx, ty + 20, { size: 13 });
    this.txt(sn.lockObj ? 'SEGUIMIENTO · OBJETIVO' : sn.lock ? 'SEGUIMIENTO · PUNTO' : 'MANUAL', tx, ty + 40, { size: 13, color: sn.lock ? ACC : DIM, weight: 600 });
    const rxx = w - mx - 14;
    this.txt(`AZ ${String(Math.round((((sn.az / DEG) % 360) + 360) % 360)).padStart(3, '0')}°   EL ${Math.round(sn.el / DEG)}°`, rxx, ty, { size: 13, align: 'right' });
    this.txt(wp.laser ? (wp.live.length ? 'LRD · DESIGNANDO' : 'LRD · ARMADO') : 'LRD · SEGURO', rxx, ty + 20, { size: 13, align: 'right', color: wp.laser ? ACC : DIM, weight: 600 });
    this.txt(`${wp.master ? 'ARMADO' : 'SEGURO'} · ${WEAPONS[wp.sel].short} ×${wp.left[wp.sel]}`, rxx, ty + 40, { size: 13, align: 'right', color: wp.master ? BAD : DIM, weight: 600 });
    if (wp.laser && Math.floor(this.t * 4) % 2) { this.c.strokeStyle = ACC; this.c.lineWidth = 1.5; this.c.strokeRect(cx - 9, cy - 9, 18, 18); }
    const by = h - my - 14;
    if (sn.aim) {
      const [la, lo] = this.latlon(sn.aim.x, sn.aim.z);
      this.txt(`${la}   ${lo}`, cx, by - 20, { size: 14, align: 'center' });
      this.txt(`ELEV ${Math.round(sn.aim.y / FT / 10) * 10} FT    DIST ${(sn.range / 1000).toFixed(2)} KM`, cx, by, { size: 14, align: 'center' });
    } else this.txt('SIN RETORNO', cx, by, { size: 14, align: 'center', color: DIM });
    // datos de la aeronave
    const ax = mx + 14, ay = h - my - 54;
    this.txt(`${Math.round(d.knots)} KT`, ax, ay, { size: 13 }); this.txt(`${Math.round(d.pos.y / FT / 10) * 10} FT`, ax, ay + 18, { size: 13 }); this.txt(`RUMBO ${String(Math.round(d.headingDeg) % 360).padStart(3, '0')}`, ax, ay + 36, { size: 13 });
    this.txt(d.ap.mode === 0 ? 'AP —' : d.ap.mode === 1 ? 'AP RUMBO' : 'AP ÓRBITA', ax, ay + 54, { size: 13, color: d.ap.mode ? ACC : DIM });
    const tti = wp.tti; if (tti >= 0) this.txt(`IMPACTO ${Math.ceil(tti)} s`, cx, cy + 110, { size: 20, align: 'center', weight: 700, color: ACC });
    this.warn(s);
  }

  marker(m, camera) {
    const v = this.v.copy(m.pos).project(camera), w = this.w, h = this.h;
    let x = (v.x * 0.5 + 0.5) * w, y = (-v.y * 0.5 + 0.5) * h;
    const behind = v.z > 1;
    if (behind) { x = w - x; y = h - 60; }
    x = clamp(x, 40, w - 40); y = clamp(y, 70, h - 70);
    const c = this.c; c.save(); c.translate(x, y); c.rotate(Math.PI / 4); c.strokeStyle = ACC; c.lineWidth = 2; c.strokeRect(-6, -6, 12, 12); c.restore();
    const dist = camera.position.distanceTo(m.pos);
    this.txt(m.label, x, y - 16, { size: 12, align: 'center', color: ACC, weight: 600 });
    this.txt(dist > 1000 ? `${(dist / 1000).toFixed(1)} km` : `${Math.round(dist)} m`, x, y + 24, { size: 12, align: 'center' });
  }
}
