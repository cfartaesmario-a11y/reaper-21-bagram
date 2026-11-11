# REAPER 21 — Operador RPA en Bagram

Simulador en navegador: eres el operador de un MQ-9A desplegado en el aeródromo de Bagram (Afganistán).
Esta primera entrega contiene **solo el escenario y el dron funcional** (sin misiones todavía).

**Jugar:** https://cfartaesmario-a11y.github.io/reaper-21-bagram/

## Qué incluye

- **Escenario real:** 64 × 64 km del valle de Bagram con elevación real y imagen Sentinel-2; el Hindu Kush al fondo.
- **Aeródromo militar:** pista 03/21 de 3 600 m con señalización y balizamiento, rodaduras, plataformas, torre de control,
  hangares, refugios RPA con MQ-9 estacionados, estación de control en tierra, zona de vida (barracones y tiendas),
  parque móvil, depósito de combustible, polvorín, muro HESCO perimetral con torres de guardia y punto de control de acceso.
- **Presencia militar:** C-130 y AH-64 en plataforma, Humvees, MRAP, camiones y cisternas, convoyes circulando,
  centinelas y patrullas a pie animadas.
- **Entorno civil:** más de 500 recintos de adobe y 16 000 árboles colocados según la imagen satélite.
- **MQ-9A pilotable:** rodaje, despegue, vuelo, tren retráctil, piloto automático (rumbo/altitud y órbita) y aterrizaje.
- **Sensor MTS-B:** torreta estabilizada con 5 niveles de zoom, fijación de punto en tierra, coordenadas y distancia
  del objetivo, y modos EO / IR blanco-caliente / IR negro-caliente.

## Controles

| Tecla | Acción |
|---|---|
| W / S | Morro abajo / arriba |
| A / D | Alabeo (en tierra: dirección) |
| Q / E | Timón |
| Mayús / Z | Más / menos motor |
| B | Freno de estacionamiento |
| G | Tren de aterrizaje |
| P | Piloto automático: OFF → RUMBO → ÓRBITA |
| 1 · 2 · 3 | Vista exterior · sensor · cámara libre |
| Ratón | Mover cámara / torreta (clic para capturar el ratón) |
| Rueda | Zoom |
| Espacio | Sensor: fijar punto en tierra |
| T | Sensor: EO / IR blanco / IR negro |
| X | Sensor: centrar torreta |
| R | Volver a la cabecera de pista |
| H | Ayuda |

Despegue: suelta el freno (B), motor a fondo (Mayús) y tira suavemente (S) a partir de 75 nudos. Sube el tren con G.

## Ejecutar en local

No hay paso de compilación. Sirve la carpeta con cualquier servidor estático:

```bash
node tools/serve.mjs
```

y abre http://localhost:8765

## Estructura

```
index.html        interfaz e instrumentación
src/main.js       arranque, cámaras, entrada y bucle
src/terrain.js    terreno real y sombreado del suelo
src/airbase.js    aeródromo
src/scenery.js    aldeas y arbolado
src/life.js       vehículos, soldados y aeronaves estacionadas
src/drone.js      MQ-9A y modelo de vuelo
src/sensor.js     torreta EO/IR
src/hud.js        HUD
assets/           modelos, texturas y terreno
```

## Créditos

Modelos, terreno y texturas de terceros: ver [CREDITS.md](CREDITS.md).
