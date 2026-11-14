import type { RefObject } from 'react'
import { MISSIONS, type Mission } from '../data/missions'
import type { View } from '../scene/MarsGlobe'
import { setLang, t, tr, useLang } from '../i18n'

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
              {tr(m.site)} · {m.landed.slice(0, 4)}
            </p>
          </div>
        </div>
      ))}

      {/* Title + hover readout on the globe */}
      {view === 'globe' && (
        <div className="card-in pointer-events-none absolute left-4 top-4 max-w-md text-white sm:left-8 sm:top-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-300">NASA Space Apps 2026 · Martian Map</p>
          <h1 className="mt-1 text-4xl font-bold tracking-tight sm:text-5xl">ARES·WALK</h1>
          <p className="mt-2 text-sm text-white/70">
            {t(
              'Mapa 3D para planear caminatas de astronautas en Marte, con datos reales de misiones de NASA.',
              'A 3D map to plan astronaut walks on Mars, with real data from NASA missions.',
            )}
          </p>
        </div>
      )}
      {view === 'globe' && (
        <nav
          aria-label={t('Ir a una misión', 'Go to a mission')}
          className="card-in absolute inset-x-0 bottom-20 flex flex-row gap-1.5 overflow-x-auto px-4 pb-1 sm:inset-x-auto sm:bottom-auto sm:left-8 sm:top-44 sm:flex-col sm:items-start sm:overflow-visible sm:px-0"
        >
          <p className="hidden text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55 sm:block">{t('Ir a una misión', 'Go to a mission')}</p>
          {MISSIONS.filter((m) => m.kind === 'rover').map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => onPickMission(m)}
              className="flex shrink-0 items-center gap-2 rounded-full bg-[#141a2b]/75 px-3 py-1 text-sm text-white/85 ring-1 ring-white/10 backdrop-blur transition hover:bg-white/15"
            >
              <span className="h-2 w-2 rounded-full" style={{ background: m.color }} />
              {m.name.split(' (')[0]}
              <span className="text-xs text-white/55">{tr(m.site)}</span>
            </button>
          ))}
        </nav>
      )}
      {view === 'globe' && (
        <p
          ref={hoverEl}
          className="pointer-events-none absolute bottom-6 left-1/2 w-max max-w-[92vw] -translate-x-1/2 truncate rounded-full bg-[#141a2b]/80 px-4 py-2 font-mono text-xs text-white/80 ring-1 ring-white/10 backdrop-blur"
        >
          {t('Toca o haz clic en cualquier punto de Marte', 'Tap or click anywhere on Mars')}
        </p>
      )}
    </>
  )
}

/** Controls hint and data credits, bottom-left. */
export function Credits({ view }: { view: View }) {
  return (
    <p className="pointer-events-none absolute bottom-6 left-6 hidden text-[11px] leading-snug text-white/55 lg:block">
      {view === 'globe'
        ? t('Arrastra para girar · rueda para acercar · F pantalla completa', 'Drag to rotate · scroll to zoom · F full screen')
        : t('Esc volver · 1–4 capas · arrastra para girar', 'Esc back · 1–4 layers · drag to rotate')}
      <br />
      {t(
        'MOLA, HiRISE, Viking: NASA/JPL/GSFC/UArizona · Textura: NASA Mars Trek (Viking MDIM 2.1) · respaldo: Solar System Scope (CC BY 4.0)',
        'MOLA, HiRISE, Viking: NASA/JPL/GSFC/UArizona · Texture: NASA Mars Trek (Viking MDIM 2.1) · fallback: Solar System Scope (CC BY 4.0)',
      )}
    </p>
  )
}

/** Spanish / English switch. */
export function LangToggle({ className = '' }: { className?: string }) {
  const lang = useLang()
  return (
    <div
      role="group"
      aria-label={t('Idioma', 'Language')}
      className={`flex rounded-full bg-[#141a2b]/80 p-0.5 text-xs font-semibold ring-1 ring-white/10 backdrop-blur ${className}`}
    >
      {(['es', 'en'] as const).map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          aria-pressed={lang === l}
          onClick={() => setLang(l)}
          className={`rounded-full px-2.5 py-1 uppercase transition ${lang === l ? 'bg-orange-400 text-slate-900' : 'text-white/75 hover:text-white'}`}
        >
          {l}
          <span className="sr-only"> · {l === 'es' ? 'Español' : 'English'}</span>
        </button>
      ))}
    </div>
  )
}
