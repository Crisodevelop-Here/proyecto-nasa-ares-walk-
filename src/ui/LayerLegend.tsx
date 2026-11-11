import { useMemo } from 'react'
import { RELIEF_RAMP, reliefLegend, slopeLegend, SLOPE_CLASSES, type RegionLayer } from '../region/regionLayers'
import type { Region } from '../region/regionTerrain'

const rgb = (c: [number, number, number]) => `rgb(${c.map(Math.round).join(',')})`
const m = (v: number) => `${Math.round(v).toLocaleString('es-ES')} m`

/** Explains the active map layer: what the colours mean and what it is for. */
export function LayerLegend({ region, layer }: { region: Region; layer: RegionLayer }) {
  const relief = useMemo(() => reliefLegend(region), [region])
  const slope = useMemo(() => slopeLegend(region), [region])
  if (layer === 'optical') return null
  return (
    <div className="card-in absolute bottom-16 left-2 w-[min(92vw,330px)] rounded-2xl border border-white/10 bg-[#141a2b]/88 p-3.5 text-white shadow-2xl backdrop-blur sm:left-6">
      {layer === 'topo' ? (
        <>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-orange-300">Relieve · mapa topográfico</p>
          <p className="mt-1 text-xs text-white/70">
            Como un mapa físico de la Tierra, con colores de Marte. Cada línea es una <b>curva de nivel</b>: todo lo que toca está a la misma altura. Las líneas juntas indican cuesta empinada y las separadas, terreno llano.
          </p>
          <div className="mt-2.5 h-3 rounded-full" style={{ background: `linear-gradient(90deg, ${RELIEF_RAMP.map(([t, c]) => `${rgb(c)} ${t * 100}%`).join(', ')})` }} />
          <div className="mt-1 flex justify-between font-mono text-[11px] text-white/60">
            <span>{m(relief.zMin)}</span>
            <span>desnivel {m(relief.zMax - relief.zMin)}</span>
            <span>{m(relief.zMax)}</span>
          </div>
          <p className="mt-2 text-[11px] text-white/50">
            Curvas cada <b className="text-white/80">{m(relief.interval)}</b>; la gruesa, cada {m(relief.interval * 5)}. Alturas sobre el nivel de referencia de Marte (MOLA).
          </p>
        </>
      ) : (
        <>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-orange-300">Pendiente · ¿por dónde se puede ir?</p>
          <p className="mt-1 text-xs text-white/70">Mide lo inclinado que está el suelo. Con esto se decide dónde aterrizar, dónde montar la base y por dónde pasa la ruta del rover o la caminata.</p>
          <ul className="mt-2.5 space-y-1">
            {SLOPE_CLASSES.map((c, i) => (
              <li key={c.label} className="flex items-center gap-2 text-xs">
                <span className="h-3 w-5 shrink-0 rounded-sm" style={{ background: rgb(c.color) }} />
                <span className="w-14 shrink-0 font-mono text-white/80">{c.label}</span>
                <span className="flex-1 text-white/65">{c.meaning}</span>
                <span className="w-10 text-right font-mono text-white/80">{Math.round(slope.share[i] * 100)}%</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-white/50">
            Pendiente máxima aquí: <b className="text-white/80">{slope.maxDeg.toFixed(1)}°</b>. Rayado = el rover no pasa. Con MOLA (~1,8 km por píxel) las cuestas cortas salen suavizadas; a escala EVA se usa HiRISE de 1 m.
          </p>
        </>
      )}
    </div>
  )
}
