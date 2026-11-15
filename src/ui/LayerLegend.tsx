import { useMemo } from 'react'
import { DOSE_RAMP, DOSE_SCALE, radiationLegend, RELIEF_RAMP, reliefLegend, slopeLegend, SLOPE_CLASSES, type RegionLayer } from '../region/regionLayers'
import type { Region } from '../region/regionTerrain'
import { GEOLOGY_SOURCE, plainUnit, type GeoUnit } from '../data/geology'
import { locale, t, tr, useLang } from '../i18n'
import { SPE_FACTOR } from '../data/environment'

/** Geology layer status: the unit under the patch centre and whether the map tiles loaded. */
export interface GeologyState {
  unit: GeoUnit | null | 'loading' | 'failed'
  map: 'loading' | 'ok' | 'failed'
}

const rgb = (c: [number, number, number]) => `rgb(${c.map(Math.round).join(',')})`
const m = (v: number) => `${Math.round(v).toLocaleString(locale())} m`

/** Explains the active map layer: what the colours mean and what it is for. */
export function LayerLegend({ region, layer, geology }: { region: Region; layer: RegionLayer; geology: GeologyState }) {
  const lang = useLang()
  const relief = useMemo(() => reliefLegend(region), [region])
  const slope = useMemo(() => slopeLegend(region), [region])
  const rad = useMemo(() => radiationLegend(region), [region])
  if (layer === 'optical') return null
  return (
    <div className="card-in absolute bottom-16 left-2 w-[min(92vw,330px)] rounded-2xl border border-white/10 bg-[#141a2b]/88 p-3.5 text-white shadow-2xl backdrop-blur sm:left-6">
      {layer === 'geology' ? (
        <GeologyLegend geology={geology} lang={lang} />
      ) : layer === 'radiation' ? (
        <RadiationLegendView low={rad.low} high={rad.high} />
      ) : layer === 'topo' ? (
        <>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-orange-300">{t('Relieve · mapa topográfico', 'Relief · topographic map')}</p>
          <p className="mt-1 text-xs text-white/70">
            {t(
              'Como un mapa físico de la Tierra, con colores de Marte. Cada línea es una curva de nivel: todo lo que toca está a la misma altura. Las líneas juntas indican cuesta empinada y las separadas, terreno llano.',
              'Like a physical map of Earth, in Mars colours. Each line is a contour: everything it touches is at the same height. Lines close together mean a steep slope; far apart, flat ground.',
            )}
          </p>
          <div className="mt-2.5 h-3 rounded-full" style={{ background: `linear-gradient(90deg, ${RELIEF_RAMP.map(([t, c]) => `${rgb(c)} ${t * 100}%`).join(', ')})` }} />
          <div className="mt-1 flex justify-between font-mono text-[11px] text-white/60">
            <span>{m(relief.zMin)}</span>
            <span>{t('desnivel {d}', 'relief {d}', { d: m(relief.zMax - relief.zMin) })}</span>
            <span>{m(relief.zMax)}</span>
          </div>
          <p className="mt-2 text-[11px] text-white/60">
            {t(
              'Curvas cada {a}; la gruesa, cada {b}. Alturas sobre el nivel de referencia de Marte (MOLA).',
              'Contours every {a}; the thick one every {b}. Heights above the Mars reference level (MOLA).',
              {
                a: m(relief.interval),
                b: m(relief.interval * 5),
              },
            )}
          </p>
        </>
      ) : (
        <>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-orange-300">{t('Pendiente · ¿por dónde se puede ir?', 'Slope · where can you go?')}</p>
          <p className="mt-1 text-xs text-white/70">
            {t(
              'Mide lo inclinado que está el suelo. Con esto se decide dónde aterrizar, dónde montar la base y por dónde pasa la ruta del rover o la caminata.',
              'Shows how steep the ground is. It decides where to land, where to set up the base and where the rover route or the walk can go.',
            )}
          </p>
          <ul className="mt-2.5 space-y-1">
            {SLOPE_CLASSES.map((c, i) => (
              <li key={c.label} className="flex items-center gap-2 text-xs">
                <span className="h-3 w-5 shrink-0 rounded-sm" style={{ background: rgb(c.color) }} />
                <span className="w-14 shrink-0 font-mono text-white/80">{c.label}</span>
                <span className="flex-1 text-white/70">{tr(c.meaning)}</span>
                <span className="w-10 text-right font-mono text-white/80">{Math.round(slope.share[i] * 100)}%</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-white/60">
            {t(
              'Pendiente máxima aquí: {s}°. Rayado = el rover no pasa. Con MOLA (~1,8 km por píxel) las cuestas cortas salen suavizadas; a escala EVA se usa HiRISE de 1 m.',
              'Max slope here: {s}°. Hatched = no rover. With MOLA (~1.8 km per pixel) short slopes come out smoothed; EVA scale uses 1 m HiRISE.',
              { s: slope.maxDeg.toFixed(1) },
            )}
          </p>
        </>
      )}
    </div>
  )
}

function GeologyLegend({ geology, lang }: { geology: GeologyState; lang: 'es' | 'en' }) {
  const { unit, map } = geology
  const plain = unit && typeof unit === 'object' ? plainUnit(unit.name, lang) : null
  return (
    <>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-orange-300">
        {t('Geología · ¿de qué está hecho el suelo?', 'Geology · what is the ground made of?')}
      </p>
      <p className="mt-1 text-xs text-white/70">
        {t(
          'Mapa oficial de la USGS y la NASA. Cada color es un tipo de terreno distinto: lava, cráteres, llanuras, hielo… y cada uno se formó en una época diferente de Marte.',
          'Official USGS–NASA map. Each colour is a different kind of ground: lava, craters, plains, ice… and each formed in a different age of Mars.',
        )}
      </p>
      <div className="mt-2.5 rounded-xl bg-white/5 p-2.5" aria-live="polite">
        <p className="text-[11px] uppercase tracking-wider text-white/50">{t('En el centro de esta zona', 'At the centre of this area')}</p>
        {unit === 'loading' ? (
          <p className="mt-0.5 text-xs text-white/60">{t('Consultando el mapa de la USGS…', 'Checking the USGS map…')}</p>
        ) : unit === 'failed' ? (
          <p className="mt-0.5 text-xs text-white/60">{t('No se pudo consultar (hace falta internet).', 'Could not check it (internet is needed).')}</p>
        ) : !unit || !plain ? (
          <p className="mt-0.5 text-xs text-white/60">{t('El mapa no tiene un tipo de terreno en este punto.', 'The map has no unit at this point.')}</p>
        ) : (
          <>
            <p className="mt-0.5 text-sm font-semibold">{plain.kind}</p>
            {plain.period && (
              <p className="text-xs text-white/75">
                {t('Época: {p}', 'Age: {p}', { p: plain.period })}
                {plain.age && ` · ${plain.age}`}
                {plain.story && ` · ${plain.story}`}
              </p>
            )}
            <p className="mt-1 font-mono text-[11px] text-white/45">
              {t('Nombre oficial', 'Official name')}: {unit.name} ({unit.code})
            </p>
          </>
        )}
      </div>
      <p className="mt-2 text-[11px] text-white/60">
        {map === 'failed'
          ? t(
              'No se pudo cargar el mapa de colores (hace falta internet); se muestra el relieve.',
              'The colour map could not load (internet is needed); the relief is shown instead.',
            )
          : map === 'loading'
            ? t('Cargando el mapa geológico…', 'Loading the geologic map…')
            : t('Se ve el relieve debajo de los colores.', 'The relief shows through the colours.')}{' '}
        <a href={GEOLOGY_SOURCE} target="_blank" rel="noreferrer" className="text-orange-300 hover:underline">
          USGS SIM 3292 ↗
        </a>
      </p>
    </>
  )
}

const msv = (v: number) => `${v.toLocaleString(locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })} mSv`

function RadiationLegendView({ low, high }: { low: number; high: number }) {
  const pct = Math.round((high / low - 1) * 100)
  return (
    <>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-orange-300">
        {t('Radiación · ¿dónde hay más protección?', 'Radiation · where is there more shelter?')}
      </p>
      <p className="mt-1 text-xs text-white/70">
        {t(
          'La atmósfera de Marte frena parte de la radiación del espacio. En lo bajo (cráteres, cuencas) hay más aire encima y llega menos; en lo alto (montañas, volcanes) llega más. Cada línea une puntos con la misma dosis.',
          'Mars’ atmosphere stops part of the radiation from space. Low ground (craters, basins) has more air overhead and gets less; high ground (mountains, volcanoes) gets more. Each line joins points with the same dose.',
        )}
      </p>
      <div className="mt-2.5 h-3 rounded-full" style={{ background: `linear-gradient(90deg, ${DOSE_RAMP.map(([t, c]) => `${rgb(c)} ${t * 100}%`).join(', ')})` }} />
      <div className="mt-1 flex justify-between font-mono text-[11px] text-white/60">
        <span>{msv(DOSE_SCALE.min)}</span>
        <span>{t('por sol · todo Marte', 'per sol · all of Mars')}</span>
        <span>{msv(DOSE_SCALE.max)}</span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-center">
        <div className="rounded-xl bg-white/5 p-2">
          <p className="font-mono text-sm text-sky-300">{msv(low)}</p>
          <p className="text-[11px] text-white/60">{t('parte más baja', 'lowest point')}</p>
        </div>
        <div className="rounded-xl bg-white/5 p-2">
          <p className="font-mono text-sm text-sky-300">{msv(high)}</p>
          <p className="text-[11px] text-white/60">{t('parte más alta (+{p} %)', 'highest point (+{p}%)', { p: pct })}</p>
        </div>
      </div>
      <p className="mt-2 text-[11px] text-white/60">
        {t(
          'Estimación según la altura (Guo et al., 2017), no una medición. La escala va del fondo de Hellas a la cima de Olympus Mons. Una tormenta solar puede multiplicar la dosis (hasta ×{f} en la simulación), y la atmósfera sola no basta: hacen falta refugios.',
          'Estimate from elevation (Guo et al., 2017), not a measurement. The scale runs from the floor of Hellas to the top of Olympus Mons. A solar storm can multiply the dose (up to ×{f} in the simulation), and the atmosphere alone is not enough: shelters are needed.',
          { f: SPE_FACTOR },
        )}
      </p>
    </>
  )
}
