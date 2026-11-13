import type { RefObject } from 'react'
import { MISSIONS, type Mission } from '../data/missions'
import type { View } from '../scene/MarsGlobe'

interface Props {
  view: View
  /** Mission label elements, positioned every frame by the scene. */
  labels: RefObject<Record<string, HTMLElement | null>>
  /** Hover readout; the scene writes the lat/lon into it. */
  hoverEl: RefObject<HTMLParagraphElement | null>
  onPickMission: (m: Mission) => void
}

/** Everything drawn over the globe view: mission labels, title, mission shortcuts and the hover hint. */
export function GlobeOverlay({ view, labels, hoverEl, onPickMission }: Props) {
  return (
    <>
      {/* Mission labels on the globe, positioned every frame by the scene */}
      {MISSIONS.map((m) => (
        <div
          key={m.id}
          ref={(el) => {
            labels.current[m.id] = el
          }}
          className="pointer-events-none absolute left-0 top-0 transition-opacity duration-500"
          style={{ opacity: 0 }}
        >
          <div className="-mt-4 ml-3 whitespace-nowrap rounded-lg bg-black/60 px-2 py-0.5 shadow-lg backdrop-blur">
            <p className="text-xs font-semibold leading-tight" style={{ color: m.color }}>
              {m.name.split(' (')[0]}
            </p>
            <p className="text-[10px] leading-tight text-white/60">
              {m.site} · {m.landed.slice(0, 4)}
            </p>
          </div>
        </div>
      ))}

      {/* Title + hover readout on the globe */}
      {view === 'globe' && (
        <div className="card-in pointer-events-none absolute left-4 top-4 max-w-md text-white sm:left-8 sm:top-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-300">NASA Space Apps 2026 · Martian Map</p>
          <h1 className="mt-1 text-4xl font-bold tracking-tight sm:text-5xl">ARES·WALK</h1>
          <p className="mt-2 text-sm text-white/70">Mapa 3D para planear caminatas de astronautas en Marte, con datos reales de misiones de NASA.</p>
        </div>
      )}
      {view === 'globe' && (
        <div className="card-in absolute left-4 top-40 hidden flex-col items-start gap-1.5 sm:left-8 sm:top-44 sm:flex">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">Ir a una misión</p>
          {MISSIONS.filter((m) => m.kind === 'rover').map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => onPickMission(m)}
              className="flex items-center gap-2 rounded-full bg-[#141a2b]/75 px-3 py-1 text-sm text-white/85 ring-1 ring-white/10 backdrop-blur transition hover:bg-white/15"
            >
              <span className="h-2 w-2 rounded-full" style={{ background: m.color }} />
              {m.name.split(' (')[0]}
              <span className="text-xs text-white/45">{m.site}</span>
            </button>
          ))}
        </div>
      )}
      {view === 'globe' && (
        <p
          ref={hoverEl}
          className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-[#141a2b]/80 px-4 py-2 font-mono text-xs text-white/80 ring-1 ring-white/10 backdrop-blur"
        >
          Haz clic en cualquier punto de Marte para explorarlo
        </p>
      )}
    </>
  )
}

/** Controls hint and data credits, bottom-left. */
export function Credits({ view }: { view: View }) {
  return (
    <p className="pointer-events-none absolute bottom-6 left-6 hidden text-[11px] leading-snug text-white/55 lg:block">
      {view === 'globe' ? 'Arrastra para girar · rueda para acercar · F pantalla completa' : 'Esc volver · 1 2 3 capas · arrastra para girar'}
      <br />
      MOLA, HiRISE, Viking: NASA/JPL/GSFC/UArizona · Textura: NASA Mars Trek (Viking MDIM 2.1) · respaldo: Solar System Scope (CC BY 4.0)
    </p>
  )
}
