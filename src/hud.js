import { DEG, FT, KT, dms, angDiff } from './util.js';
import { SENSOR_MODES } from './sensor.js';

const $ = (id) => document.getElementById(id);
const HUD_COLOR = '#b8ffb0';

/** Instrumentación en pantalla: cinta de rumbo, horizonte artificial, lecturas y superposición del sensor. */
export class HUD {
  constructor(terrain) {
    this.meta = terrain.meta;
    this.el = Object.fromEntries(['hud', 'h-view', 'h-clock', 'h-ias', 'h-thr', 'h-thrv', 'h-alt', 'h-agl', 'h-vs', 'h-gear', 'h-brake', 'h-ap', 'h-lat', 'h-lon', 'h-hdg', 'h-gs', 'h-warn',
      'sensor', 's-mode', 's-fov', 's-zoom', 's-trk', 's-az', 's-el', 's-lat', 's-lon', 's-elev', 's-rng', 'help', 'h-adi', 'h-tape'].map((k) => [k, $(k)]));
    this.tape = this.el['h-tape'].getContext('2d');
    this.adi = this.el['h-adi'].getContext('2d');
    this.cache = {};
    this.t = 0;
  }
  show() { this.el.hud.classList.remove('hidden'); }
  toggleHelp() { this.el.help.classList.toggle('hidden'); }

  set(id, v) { if (this.cache[id] !== v) { this.cache[id] = v; this.el[id].textContent = v; } }
  cls(id, name, on) { const k = `${id}.${name}`; if (this.cache[k] !== on) { this.cache[k] = on; this.el[id].classList.toggle(name, on); } }

  latlon(x, z) {
    const lat = this.meta.lat - z / 110950, lon = this.meta.lon + x / (111320 * Math.cos(this.meta.lat * DEG));
    return [dms(lat, 'N', 'S'), dms(lon, 'E', 'W')];
  }

  update(dt, drone, sensor, view) {
    this.t += dt;
    const d = drone;
    this.set('h-view', { chase: 'EXTERIOR', sensor: 'SENSOR MTS-B', free: 'CÁMARA LIBRE' }[view]);
    const now = new Date();
    this.set('h-clock', `${now.toISOString().slice(11, 19)}Z`);
    this.set('h-ias', String(Math.round(d.knots)));
    this.set('h-gs', String(Math.round((d.speed * Math.cos(d.pitch)) / KT)));
    this.set('h-thrv', `${Math.round(d.throttle * 100)} %`);
    this.el['h-thr'].style.width = `${(d.throttle * 100).toFixed(0)}%`;
    this.set('h-alt', String(Math.round(d.pos.y / FT / 10) * 10));
    this.set('h-agl', String(Math.max(0, Math.round(d.agl / FT / 5) * 5)));
    this.set('h-vs', String(Math.round((d.vs / FT) * 60 / 50) * 50));
    this.set('h-hdg', String(Math.round(d.headingDeg) % 360).padStart(3, '0'));
    const [la, lo] = this.latlon(d.pos.x, d.pos.z);
    this.set('h-lat', la); this.set('h-lon', lo);

    const moving = d.gearT > 0.05 && d.gearT < 0.95;
    this.set('h-gear', moving ? 'TREN EN TRÁNSITO' : d.gearDown ? 'TREN ABAJO' : 'TREN ARRIBA');
    this.cls('h-gear', 'on', d.gearDown); this.cls('h-gear', 'warn', moving);
    this.set('h-brake', d.brake ? 'FRENO PUESTO' : 'FRENO LIBRE'); this.cls('h-brake', 'warn', d.brake && d.onGround);
    const ap = d.ap;
    this.set('h-ap', ap.mode === 0 ? 'AP OFF' : ap.mode === 1 ? `AP RUMBO ${String(Math.round((ap.hdg / DEG + 360) % 360)).padStart(3, '0')} · ${Math.round(ap.alt / FT / 100) * 100} FT` : `AP ÓRBITA ${ap.dir < 0 ? 'IZQ' : 'DCHA'} · ${Math.round(ap.alt / FT / 100) * 100} FT`);
    this.cls('h-ap', 'on', ap.mode > 0);

    // avisos
    let warn = '', bad = false;
    if (d.crashed > 0) { warn = `AERONAVE PERDIDA\n${d.crashReason}`; bad = true; }
    else if (d.stall) { warn = 'PÉRDIDA'; bad = true; }
    else if (!d.onGround && d.agl < 120 && d.vs < -7) { warn = 'TERRENO · ARRIBA'; bad = true; }
    else if (d.outOfArea) warn = 'LÍMITE DEL ÁREA DE OPERACIONES\nVIRE HACIA LA BASE';
    else if (!d.onGround && !d.gearDown && d.agl < 250 && d.vs < -1 && d.knots < 110) warn = 'TREN';
    else if (d.onGround && d.brake && d.throttle > 0.05) warn = 'FRENO DE ESTACIONAMIENTO';
    const blink = bad ? Math.floor(this.t * 3) % 2 === 0 : true;
    this.set('h-warn', blink ? warn : ''); this.cls('h-warn', 'bad', bad);

    this.drawTape(d.headingDeg, ap.mode === 1 ? (ap.hdg / DEG + 360) % 360 : null);
    this.drawADI(d.pitch, d.roll);

    // sensor
    const sv = view === 'sensor';
    this.cls('sensor', 'hidden', !sv);
    this.cls('h-adi', 'hidden', sv);
    if (sv) {
      this.set('s-mode', SENSOR_MODES[sensor.mode]);
      this.set('s-fov', `${sensor.fov.toFixed(1)}°`);
      this.set('s-zoom', `x${Math.round(28 / sensor.fov)}`);
      this.set('s-trk', sensor.lock ? 'SEGUIMIENTO: PUNTO FIJADO' : 'SEGUIMIENTO: MANUAL'); this.cls('s-trk', 'on', !!sensor.lock);
      this.set('s-az', String(Math.round(((sensor.az / DEG) % 360 + 360) % 360)).padStart(3, '0'));
      this.set('s-el', String(Math.round(sensor.el / DEG)));
      if (sensor.target) {
        const [a, o] = this.latlon(sensor.target.x, sensor.target.z);
        this.set('s-lat', a); this.set('s-lon', o);
        this.set('s-elev', String(Math.round(sensor.target.y / FT / 10) * 10));
        this.set('s-rng', (sensor.range / 1000).toFixed(2));
      } else { this.set('s-lat', '--'); this.set('s-lon', '--'); this.set('s-elev', '--'); this.set('s-rng', '--'); }
    }
  }

  drawTape(hdg, bug) {
    const c = this.tape, w = 520, h = 56, ppd = 5.2;
    c.clearRect(0, 0, w, h);
    c.strokeStyle = c.fillStyle = HUD_COLOR; c.lineWidth = 1.5; c.font = '13px Consolas, monospace'; c.textAlign = 'center';
    c.shadowColor = '#000'; c.shadowBlur = 3;
    const names = { 0: 'N', 90: 'E', 180: 'S', 270: 'O' };
    for (let a = Math.floor((hdg - 52) / 5) * 5; a <= hdg + 52; a += 5) {
      const x = w / 2 + (a - hdg) * ppd, n = ((a % 360) + 360) % 360;
      if (x < 6 || x > w - 6) continue;
      const major = n % 10 === 0;
      c.beginPath(); c.moveTo(x, 30); c.lineTo(x, major ? 42 : 36); c.stroke();
      if (n % 30 === 0) c.fillText(names[n] ?? String(n / 10).padStart(2, '0'), x, 24);
    }
    c.beginPath(); c.moveTo(w / 2 - 7, 56); c.lineTo(w / 2, 44); c.lineTo(w / 2 + 7, 56); c.closePath(); c.fill();
    if (bug !== null) {
      const dx = angDiff(bug * DEG, hdg * DEG) / DEG * ppd;
      if (Math.abs(dx) < w / 2 - 8) { c.strokeStyle = '#ffcf3a'; c.strokeRect(w / 2 + dx - 5, 30, 10, 9); }
    }
  }

  drawADI(pitch, roll) {
    const c = this.adi, s = 170, r = 78;
    c.clearRect(0, 0, s, s);
    c.save(); c.translate(s / 2, s / 2);
    c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.clip();
    c.rotate(-roll);
    const ppd = 3.2, off = (pitch / DEG) * ppd;
    c.fillStyle = 'rgba(70,120,170,0.55)'; c.fillRect(-200, -400 + off, 400, 400);
    c.fillStyle = 'rgba(120,88,50,0.6)'; c.fillRect(-200, off, 400, 400);
    c.strokeStyle = '#fff'; c.fillStyle = '#fff'; c.lineWidth = 1.5; c.font = '10px Consolas, monospace'; c.textAlign = 'left';
    c.beginPath(); c.moveTo(-200, off); c.lineTo(200, off); c.stroke();
    for (let p = -40; p <= 40; p += 10) {
      if (!p) continue;
      const y = off - p * ppd, l = 22;
      c.beginPath(); c.moveTo(-l, y); c.lineTo(l, y); c.stroke(); c.fillText(String(Math.abs(p)), l + 4, y + 3);
    }
    c.restore();
    c.save(); c.translate(s / 2, s / 2);
    c.strokeStyle = HUD_COLOR; c.lineWidth = 1.5; c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.stroke();
    c.strokeStyle = '#ffcf3a'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(-46, 0); c.lineTo(-16, 0); c.lineTo(-16, 7); c.moveTo(46, 0); c.lineTo(16, 0); c.lineTo(16, 7); c.stroke();
    c.fillStyle = '#ffcf3a'; c.fillRect(-2, -2, 4, 4);
    c.restore();
  }
}
