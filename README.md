# REAPER 21 — Operador RPA en Bagram

Simulador en navegador: un turno como operador de un MQ-9A desplegado en el aeródromo de Bagram (Afganistán).
Empiezas a pie en la base, entras en la estación de control en tierra y aceptas las tareas que te asigna el mando.

**Jugar:** https://cfartaesmario-a11y.github.io/reaper-21-bagram/

## Qué incluye

- **Menú principal** con campaña, vuelo libre, controles y créditos, sobre la base en vivo.
- **Campaña de cinco misiones** con cinemáticas, radio subtitulada, objetivos e informe final:
  1. *Ojos en el valle* — reconocimiento: despegar, localizar un vehículo y seguirlo.
  2. *Tropas en contacto* — apoyo aéreo cercano a una patrulla fijada, con aliados a 300 m.
  3. *Ruta Vermont* — escolta de un convoy: equipo de IED y emboscada por delante.
  4. *Luz verde* — objetivo de alto valor en un recinto con civiles; solo se autoriza en campo abierto.
  5. *Regreso a casa* — aproximación y aterrizaje.
- **Personaje a pie** por la base (tercera persona, colisiones con edificios) y acceso a la estación de control.
- **Modelo de vuelo físico:** sustentación, resistencia parásita e inducida, empuje de turbohélice dependiente de la
  velocidad, pérdida, limitador de ángulo de ataque, efecto de la energía en los virajes, rodaje, rotación y toma con
  límites de régimen de descenso. Piloto automático de rumbo/altitud/velocidad y de órbita alrededor del punto del sensor.
- **Sensor MTS-B:** EO e infrarrojo (blanco/negro caliente), cinco niveles de zoom, fijación de punto y seguimiento
  de vehículos y personas en movimiento.
- **Armamento:** 4 × AGM-114 Hellfire y 2 × GBU-12 con guiado láser semiactivo real (el arma sigue el punto que
  ilumina el designador), tiempo de vuelo, estela, explosión, humo, marcas en el suelo, sonido con retardo por
  distancia y efectos sobre personas y vehículos. Reglas de enfrentamiento: fuego amigo y bajas civiles hacen fracasar la misión.
- **Mundo vivo:** insurgentes, aliados y civiles con rutas y combates con trazadoras; convoyes; un C-130 que aterriza,
  rueda y vuelve a despegar; pareja de AH-64 patrullando el perímetro; más de 70 militares y decenas de vehículos en la base.
- **Escenario real:** 64 × 64 km del valle de Bagram con elevación real e imagen Sentinel-2, con cultivos, roca y
  suelo detallados por sombreador; más de 500 recintos de adobe y 26 000 árboles.

## Controles

| Tecla | Acción |
|---|---|
| W A S D · Mayús · ratón | A pie: moverse, correr, mirar |
| F | Entrar / salir de la estación de control |
| W / S · A / D · Q / E | Cabeceo · alabeo (dirección en tierra) · timón |
| Mayús / Z | Más / menos motor |
| B · G | Freno de estacionamiento · tren |
| P | Piloto automático: rumbo → órbita → apagado |
| 1 · 2 · 3 | Cámara exterior · sensor · cámara de morro con HUD |
| Ratón · rueda | Apuntar la torreta · zoom |
| Espacio | Fijar punto u objetivo |
| T · X | Modo EO/IR · centrar torreta |
| M · L · Tab | Armar · láser · cambiar arma |
| Clic / Intro | Disparar |
| Esc | Pausa |

Para disparar: arma (M), enciende el láser (L), mantén la retícula sobre el blanco y dispara. El arma sigue el láser hasta el impacto.

## Ejecutar en local

No hay paso de compilación. Sirve la carpeta con cualquier servidor estático:

```bash
node tools/serve.mjs
```

y abre http://localhost:8765

## Estructura

```
index.html         estructura de la interfaz
src/main.js        estados de juego, cámaras, entrada y bucle
src/ui.js          menú, paneles y simbología (lienzo)
src/missions.js    campaña
src/cinematic.js   secuencias de cámara
src/player.js      personaje a pie
src/drone.js       MQ-9A y modelo de vuelo
src/sensor.js      torreta EO/IR
src/weapons.js     Hellfire y Paveway
src/npc.js         personas y vehículos del área de operaciones
src/traffic.js     C-130 y AH-64
src/fx.js          partículas, explosiones y trazadoras
src/audio.js       sonido sintetizado
src/terrain.js     terreno real y sombreado
src/airbase.js     aeródromo
src/scenery.js     aldeas y arbolado
src/life.js        personal y vehículos de la base
assets/            modelos, texturas y terreno
```

## Créditos

Modelos, terreno y texturas de terceros: ver [CREDITS.md](CREDITS.md).
Es un juego: no representa operaciones, unidades ni personas reales.
