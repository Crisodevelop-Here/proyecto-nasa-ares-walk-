# ARES·WALK: Marte 3D explorable

Prototipo para NASA Space Apps 2026, reto *Interplanetary Survival Guide: Martian Map*.
Es un globo 3D de Marte en el que se puede hacer clic en **cualquier punto** para ver el terreno ampliado, una ruta posible y lo que hicieron allí las misiones de NASA.

## Cómo se usa

1. **Globo**: arrastra para girar y usa la rueda para acercar. Al pasar el ratón se ven lat/lon y el lugar (el giro se pausa). Los puntos de colores son misiones de NASA; también hay accesos directos a la izquierda.
2. **Clic en cualquier punto** → el planeta gira, la cámara baja y aparece el **terreno regional** en 3D (relieve MOLA real). Si cerca trabajó una misión, el área se ajusta a su recorrido (30–120 km); si no, mide 120 × 120 km.
3. **Panel lateral**:
   - **Misiones**: recorrido de cada rover sobre el terreno y línea de tiempo de hitos (sol, fecha, qué hizo, instrumentos, hallazgo). Incluye un enlace a las imágenes crudas que tomó el rover ese sol. Al hacer clic en un hito, la cámara vuela a él.
   - **Objetivos**: objetivo científico del sitio y la lista de datos integrados.
   - **Ruta**: travesía en rover presurizado calculada con A*, con paradas en hitos de misiones o en zonas de contraste de relieve. En Gale aparece **"Bajar a escala EVA"**: el Monte Sharp con HiRISE de 1 m y la ruta a pie.
   - **Seguridad**: radiación según la elevación, simulación de tormenta solar, presión, temperatura, pendientes, zona intransitable y retraso de comunicación.
4. **Capas** (teclas 1/2/3): óptica, relieve y pendiente. En el Monte Sharp: imagen real, color mineral y pendiente.
5. **Esc** vuelve atrás. **F** activa la pantalla completa.

## Cómo cumple los objetivos del reto

| Objetivo del reto | Dónde está |
|---|---|
| Mapa o interfaz para un astronauta en Marte | Globo → región → escala EVA, en un panel tipo tablet o pantalla del hábitat |
| Objetivos científicos y elección del lugar | Pestaña **Objetivos**: curados en sitios de misiones (p. ej. boxwork en el Monte Sharp) o inferidos del terreno (hielo, volcanes, lagos, capas) |
| Al menos 3 tipos de datos en capas | Óptico, topográfico, pendiente/obstáculos, radiación, atmosférico e histórico de misiones. En el Monte Sharp, además, DTM de 1 m y color mineral (espectral) |
| Datos de varias misiones de NASA | MGS/MOLA, Viking, MRO/HiRISE, Curiosity (RAD, REMS), Perseverance, MER, Pathfinder, Phoenix, InSight |
| Seguridad y clima espacial | Pestaña **Seguridad**: dosis por elevación (anclada a RAD), tormenta solar ×30, pendientes, % intransitable, comunicaciones y polvo |
| Movilidad en traje y obstáculos | Rutas A* que evitan pendientes de más de 22° a pie y de más de 15° en rover, y penalizan la rugosidad. Límites de O₂ y de duración de la EVA |
| Ruta con paradas científicas | Pestaña **Ruta** (rover regional y EVA a pie) |
| Imágenes de punto de vista | Enlaces por hito a las imágenes crudas del rover de ese sol |
| Rovers y trabajo en pareja | Travesía en rover presurizado y EVA de 2 astronautas en cada parada |

## Ejecutar

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # rutas, geometría, datos de misiones y ambiente
npm run build      # versión estática en dist/
```

## Datos

| Dato | Fuente | Notas |
|------|--------|-------|
| Relieve regional (`public/mola32/`, 648 tiles, ~127 MB) | MGS MOLA MEGDR 32 px/grado `megt90n000fb.img`, PDS Geosciences Node | Se genera con `scripts/mola_tiles.py`. Si falta, se usa el relieve global de 4 px/grado |
| Relieve del globo (`public/globe/mola_*`) | MOLA MEGDR 4 px/grado, `scripts/mola_to_png.py` | Dominio público |
| Imagen óptica regional | NASA Mars Trek WMTS, mosaico Viking MDIM 2.1 | Necesita internet; si no responde, se usa la textura global + sombreado MOLA |
| Textura global (`mars_4k.jpg`) | Solar System Scope, a partir de NASA MOLA/Viking | CC BY 4.0, hay que citarla |
| Terreno 1 m (`public/terrain/`) | HiRISE DTEEC_001488_1750_001752_1750 + PSP_001488_1750 | Dominio público |
| Misiones (`src/data/missions.ts`) | Aterrizajes y hitos publicados por NASA/JPL | Los puntos intermedios de los recorridos son **aproximados (±1 km)**; conviene sustituirlos por los archivos MMGIS oficiales |
| Radiación y ambiente | RAD y REMS de Curiosity, Viking (`src/data/environment.ts`) | Estimaciones de orden de magnitud |

Para regenerar los tiles:

```bash
curl -o data-src/megt90n000fb.img https://pds-geosciences.wustl.edu/mgs/mgs-m-mola-5-megdr-l3-v1/mgsl_300x/meg032/megt90n000fb.img
python3 -I scripts/mola_tiles.py data-src/megt90n000fb.img public/mola32
```

## Código

- `src/App.tsx`: estado (vista, foco, región, capas) y la interfaz principal.
- `src/scene/Stage.tsx`: canvas, luces y *Director* (vuelos de cámara y orientación del planeta hacia el punto elegido).
- `src/scene/MarsGlobe.tsx`: globo clicable, marcadores y recorridos de misiones.
- `src/scene/RegionTerrain.tsx`: malla regional con curvatura, ruta, recorridos e hitos.
- `src/scene/SiteTerrain.tsx`: terreno HiRISE del Monte Sharp (escala EVA).
- `src/region/regionTerrain.ts`: tiles MOLA → `Terrain`, encuadre por misión y elección de paradas.
- `src/region/regionLayers.ts`: capas óptica (Mars Trek o respaldo), relieve y pendiente.
- `src/route/`: A* y planificador, con perfiles para traje y rover.
- `src/ui/SidePanel.tsx`: pestañas Misiones, Objetivos, Ruta y Seguridad.
