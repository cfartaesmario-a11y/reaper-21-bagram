import { DEG } from './util.js';

/** Parámetros del escenario: Aeródromo de Bagram (OAIX), provincia de Parwan, Afganistán. */
export const CFG = {
  name: 'AERÓDROMO DE BAGRAM',
  icao: 'OAIX',
  callsign: 'REAPER 21',

  // Posición y rumbo de la pista dentro del mosaico de terreno (metros desde el centro, rumbo verdadero).
  baseX: -60,
  baseZ: 215,
  heading: 24.5 * DEG,

  runwayLength: 3600,
  runwayWidth: 46,

  // Recinto de la base en coordenadas locales (x = lateral, z = eje de pista; -z es el sentido de la pista 03).
  wall: { x0: -420, x1: 1180, z0: -2150, z1: 2150 },

  sunElevation: 34 * DEG,
  sunAzimuth: 118 * DEG,      // desde el norte, sentido horario (mañana)

  worldLimit: 30500,          // radio útil del área de operaciones (m)
};
