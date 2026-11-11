# Créditos y licencias

El código de este repositorio (carpeta `src/`, `css/`, `index.html`, `tools/`) se publica bajo licencia MIT.
Todo el sonido se sintetiza en tiempo real (Web Audio); no hay archivos de audio de terceros.
Los recursos de terceros conservan su propia licencia; se listan a continuación con las modificaciones aplicadas.

## Modelos 3D (Sketchfab, licencia CC BY 4.0)

Todos se han reescalado a tamaño real, reorientado y comprimido (texturas WebP ≤ 1024 px, salvo el MQ-9 a 2048 px; geometría Meshopt).
Algunos se han simplificado o recoloreado, como se indica.

| Archivo | Modelo | Autor | Enlace | Cambios adicionales |
|---|---|---|---|---|
| `mq9.glb` | MQ-9 Reaper | Tyler V Howell (TVHowell) | https://sketchfab.com/3d-models/eff549610fee4f20904f7b388a3a0830 | hélice y torreta separadas para animarlas; tren de aterrizaje añadido por código |
| `humvee.glb` | Low Poly Humvee FREE | MadTrollStudio | https://sketchfab.com/3d-models/c0e2ddcc4ccf4d49a9303303a6307bcf | — |
| `truck.glb` | Military Truck | Raphael Escamilla (Raffey) | https://sketchfab.com/3d-models/d3a85af5faef4fddb217b3fce073614c | malla simplificada |
| `mrap.glb` | Kirpi Mrap (Lowpoly + Free 3d Model) | zakirakil | https://sketchfab.com/3d-models/ab989d1db61345cf9c1bbb641985d6bd | malla simplificada, tinte arena |
| `fueltruck.glb` | Fuel Truck | simonthedigger (abdullahjavedyo90) | https://sketchfab.com/3d-models/443da3cd0f4547c980e52168bfbe7b76 | malla simplificada, tinte oliva |
| `hilux.glb` | Toyota Hilux | David_Holiday | https://sketchfab.com/3d-models/417915f419f945c8a424b2a7943eb25a | carrocería repintada en blanco |
| `c130.glb` | C130 | manilov.ap | https://sketchfab.com/3d-models/ce61f8750c9346a8b2e4e4160bd6c845 | repintado en gris táctico (sin librea) |
| `apache.glb` | Boeing AH-64D Apache Combat Helicopter | Muhamad Mirza Arrafi (MirzaArrafiERV_45) | https://sketchfab.com/3d-models/c3b58008c46b45048fdd7dd283a3c8c8 | — |
| `hellfire.glb` | Hellfire Missile | xephoney | https://sketchfab.com/3d-models/208e1de6721e439cbb1666ec9a6517e5 | — |
| `gbu12.glb` | Guided Bomb Unit - 12 (GBU 12) | NA3dmodel | https://sketchfab.com/3d-models/707162a980214a6e93735a0ce7c42668 | — |
| `hangar.glb` | j type hanger | ElectricL (ElectricLeo) | https://sketchfab.com/3d-models/d86713d61b4941378a6ad21569e0cbac | — |
| `hesco.glb` | Hesco Barrier | Aidan Callaghan | https://sketchfab.com/3d-models/33b47b984fb546e19b20211036d4b38d | — |
| `tower.glb` | Guard Tower [Free Asset] | Lex713 (LunarEclips3) | https://sketchfab.com/3d-models/963071f5fe404970a40b166bcee430b8 | — |
| `container.glb` | Classic Shipping Container (Free/Gameready) | Sebastian Webster | https://sketchfab.com/3d-models/772f4be391a245f699c54e6cf157c58d | malla simplificada |
| `tent.glb` | Tent_Military | Mehdi Shahsavan (ahmagh2e) | https://sketchfab.com/3d-models/e06d68ead08a4c44bfd5f826ecca4987 | malla simplificada, aclarada |

Licencia CC BY 4.0: https://creativecommons.org/licenses/by/4.0/

## Personaje

- `soldier.glb` — «Soldier» (personaje Vanguard de Mixamo con animaciones Idle/Walk/Run), tomado de los ejemplos de
  [three.js](https://github.com/mrdoob/three.js/tree/r170/examples/models/gltf).

## Terreno

- **Elevación:** Mapzen Terrain Tiles (formato Terrarium) alojados en AWS Open Data. Fuentes: SRTM (NASA/USGS), entre otras.
  https://registry.opendata.aws/terrain-tiles/
- **Imagen satélite:** *Sentinel-2 cloudless 2016* — https://s2maps.eu por EOX IT Services GmbH
  (contiene datos Copernicus Sentinel modificados, 2016). Licencia CC BY 4.0.
- Mosaico de 64 × 64 km centrado en 34.9461° N, 69.2650° E. La elevación se ha aplanado dentro del recinto del aeródromo.

## Texturas

- Poly Haven (CC0): `asphalt_02`, `sandy_gravel_02`, `corrugated_iron_02`, `clay_plaster`, `concrete_wall_008`, `sparse_grass`, `rocky_terrain_02`. https://polyhaven.com

## Motor

- [three.js](https://threejs.org) r170 — licencia MIT (copia en `vendor/three`).

## Nota

El aeródromo es una recreación libre: la pista 03/21 ocupa la posición y el rumbo reales, pero la distribución de edificios es inventada.
Este proyecto es un juego; no representa operaciones, unidades ni personas reales.
