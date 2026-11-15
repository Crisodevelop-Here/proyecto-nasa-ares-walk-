import { useState } from 'react'
import { COMMS_DELAY_MIN, doseAtElevation, pressureAtElevation, ROVER, SUIT, tempRange } from '../data/environment'
import { distanceKm, MISSIONS, type Milestone, type Mission } from '../data/missions'
import { ROVERS_WITH_FEED, type RoverWithFeed } from '../data/rawPhotos'
import type { Optical } from '../region/regionLayers'
import type { Region } from '../region/regionTerrain'
import type { View } from '../scene/MarsGlobe'
import { formatLatLon, PLACES } from '../scene/mars'
import type { RoutePlan, Station } from '../types'
import { locale, t, tr, useLang } from '../i18n'
import { LangToggle } from './GlobeOverlay'
import { RoverPhotos } from './RoverPhotos'
import type { GeologyState } from './LayerLegend'
import { plainUnit } from '../data/geology'

export type Tab = 'missions' | 'objectives' | 'route' | 'safety'
const TABS: { id: Tab; label: () => string }[] = [
  { id: 'missions', label: () => t('Misiones', 'Missions') },
  { id: 'objectives', label: () => t('Objetivos', 'Objectives') },
  { id: 'route', label: () => t('Ruta', 'Route') },
  { id: 'safety', label: () => t('Seguridad', 'Safety') },
]

const fmt = (n: number, d = 1) => n.toLocaleString(locale(), { minimumFractionDigits: d, maximumFractionDigits: d })
const km = (m: number) => `${fmt(m / 1000, m < 10_000 ? 1 : 0)} km`

export function placeName(lat: number, lon: number) {
  const near = PLACES.map((p) => ({ p, d: distanceKm(lat, lon, p.lat, p.lon) })).sort((a, b) => a.d - b.d)[0]
  if (near.d < 120) return { name: tr(near.p.name), note: tr(near.p.note) }
  if (near.d < 700) return { name: t('A {d} km de {p}', '{d} km from {p}', { d: Math.round(near.d / 10) * 10, p: tr(near.p.name) }), note: tr(near.p.note) }
  return { name: t('Zona sin nombre', 'Unnamed area'), note: t('Ninguna misión de superficie ha estado aquí', 'No surface mission has been here') }
}

/** Science objective for the spot: curated for past-mission sites, inferred from the terrain elsewhere. */
const MISSION_OBJECTIVE: Record<string, () => string> = {
  curiosity: () =>
    t(
      'Estudiar a pie las formaciones boxwork y las capas de sulfatos del Monte Sharp: dónde y cuándo circuló agua bajo la superficie, y si pudo albergar vida.',
      'Study Mount Sharp’s boxwork ridges and sulfate layers on foot: where and when water flowed underground, and whether it could have hosted life.',
    ),
  perseverance: () =>
    t(
      'Recoger muestras del delta y del borde de Jezero junto a rocas como Cheyava Falls, buscando biofirmas con instrumentos que un rover no puede llevar.',
      'Collect samples from Jezero’s delta and rim next to rocks like Cheyava Falls, looking for biosignatures with instruments a rover cannot carry.',
    ),
  opportunity: () =>
    t(
      'Leer la química de las capas con hematita y yeso de Meridiani para entender las aguas ácidas que la cubrieron.',
      'Read the chemistry of Meridiani’s hematite and gypsum layers to understand the acidic waters that covered it.',
    ),
  spirit: () =>
    t(
      'Muestrear la sílice de Home Plate: restos de fuentes termales, uno de los mejores ambientes para vida microbiana.',
      'Sample the silica at Home Plate: remains of hot springs, one of the best settings for microbial life.',
    ),
  sojourner: () =>
    t(
      'Comparar las rocas arrastradas por las inundaciones gigantes de Ares Vallis, que traen muestras de las tierras altas.',
      'Compare the rocks carried by the giant Ares Vallis floods, which bring samples from the highlands.',
    ),
  viking1: () =>
    t(
      'Repetir los experimentos de biología de Viking con instrumentos modernos y estudiar los oxidantes del suelo.',
      'Repeat Viking’s biology experiments with modern instruments and study the soil oxidants.',
    ),
  viking2: () => t('Medir la escarcha estacional y el hielo enterrado de Utopia como recurso de agua.', 'Measure Utopia’s seasonal frost and buried ice as a water resource.'),
  phoenix: () =>
    t(
      'Extraer hielo de agua del subsuelo ártico: agua, oxígeno y combustible para la tripulación.',
      'Extract water ice from the Arctic subsurface: water, oxygen and fuel for the crew.',
    ),
  insight: () =>
    t(
      'Desplegar una red de sismómetros para medir los sismos que afectarían a una base permanente.',
      'Deploy a seismometer network to measure the quakes that would affect a permanent base.',
    ),
}

function terrainObjective(lat: number, r: Region) {
  if (Math.abs(lat) > 55)
    return {
      title: t('Hielo de agua cerca de la superficie', 'Water ice near the surface'),
      text: t(
        'A esta latitud el hielo está a pocos centímetros. Objetivo: medir su pureza y profundidad como recurso para la tripulación.',
        'At this latitude the ice lies a few centimetres down. Goal: measure its purity and depth as a resource for the crew.',
      ),
    }
  if (r.centerZ > 6000)
    return {
      title: t('Volcanismo', 'Volcanism'),
      text: t(
        'Terreno alto y volcánico. Objetivo: muestrear coladas de lava para fecharlas y entender cuándo fue activo Marte.',
        'High volcanic ground. Goal: sample lava flows to date them and learn when Mars was active.',
      ),
    }
  if (r.centerZ < -3500)
    return {
      title: t('Cuenca baja: antiguos lagos', 'Low basin: ancient lakes'),
      text: t(
        'Las zonas bajas acumulan sedimentos de agua. Objetivo: buscar arcillas y sales que conserven química de un antiguo lago.',
        'Low areas collect water-laid sediments. Goal: look for clays and salts that keep the chemistry of an ancient lake.',
      ),
    }
  if (r.blockedFrac > 0.12)
    return {
      title: t('Capas expuestas en escarpes', 'Layers exposed in scarps'),
      text: t(
        'Las paredes empinadas dejan ver capas de roca de distintas épocas. Objetivo: leerlas en orden, de abajo arriba.',
        'Steep walls expose rock layers from different ages. Goal: read them in order, bottom to top.',
      ),
    }
  return {
    title: t('Corteza antigua con cráteres', 'Ancient cratered crust'),
    text: t(
      'Tierras altas de más de 3.500 millones de años. Objetivo: muestrear eyecta de cráteres que traen roca profunda a la superficie.',
      'Highlands over 3.5 billion years old. Goal: sample crater ejecta that brings deep rock to the surface.',
    ),
  }
}

interface Props {
  view: View
  focus: { lat: number; lon: number }
  region: Region | null
  optical: Optical | null
  geology: GeologyState
  plan: RoutePlan | null
  stops: Station[]
  sitePlan: RoutePlan | null
  siteAvailable: boolean
  missions: Mission[]
  tab: Tab
  setTab: (t: Tab) => void
  solarStorm: boolean
  setSolarStorm: (v: boolean) => void
  onMilestone: (m: Mission, s: Milestone) => void
  onEnterSite: () => void
  onBack: () => void
}

export function SidePanel(p: Props) {
  const name = placeName(p.focus.lat, p.focus.lon)
  // On phones the panel can be folded down to its header so the map stays visible.
  const [folded, setFolded] = useState(false)
  return (
    <aside className="card-in pointer-events-auto absolute inset-x-2 bottom-2 z-30 flex max-h-[58vh] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#141a2b]/88 text-white shadow-2xl backdrop-blur-md sm:inset-x-auto sm:bottom-4 sm:right-4 sm:top-4 sm:max-h-none sm:w-[420px]">
      <button type="button" onClick={() => setFolded((f) => !f)} aria-expanded={!folded} aria-controls="side-panel-content" className="flex w-full justify-center pt-2 sm:hidden">
        <span className="h-1.5 w-12 rounded-full bg-white/30" />
        <span className="sr-only">{folded ? t('Mostrar el panel', 'Show the panel') : t('Ocultar el panel', 'Hide the panel')}</span>
      </button>
      <header className="border-b border-white/10 px-5 pb-3 pt-2 sm:pt-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-300">
              {p.view === 'site'
                ? t('Escala EVA · HiRISE 1 m', 'EVA scale · HiRISE 1 m')
                : t('Vista regional · {s} × {s} km', 'Regional view · {s} × {s} km', { s: Math.round(p.region?.sizeKm ?? 120) })}
            </p>
            <h2 className="mt-1 text-2xl font-bold leading-tight tracking-tight">{p.view === 'site' ? t('Monte Sharp', 'Mount Sharp') : name.name}</h2>
            <p className="mt-0.5 font-mono text-xs text-white/55">
              {formatLatLon(p.focus.lat, p.focus.lon)}
              {p.view === 'site'
                ? t(' · recorte de 2 × 2 km', ' · 2 × 2 km crop')
                : p.region && t(' · {z} km de elevación', ' · {z} km elevation', { z: fmt(p.region.centerZ / 1000, 2) })}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <button
              type="button"
              onClick={p.onBack}
              aria-label={p.view === 'site' ? t('Volver a la vista regional', 'Back to the regional view') : t('Volver al globo', 'Back to the globe')}
              className="shrink-0 rounded-lg px-2.5 py-1.5 text-sm text-white/70 ring-1 ring-white/15 hover:bg-white/10 hover:text-white"
            >
              {p.view === 'site' ? t('← Región', '← Region') : t('← Globo', '← Globe')}
            </button>
            <LangToggle />
          </div>
        </div>
        <nav
          role="tablist"
          aria-label={t('Información del lugar', 'About this place')}
          className={`mt-3 grid-cols-4 ${folded ? 'hidden sm:grid' : 'grid'} gap-1 rounded-xl bg-black/25 p-1 text-sm`}
          onKeyDown={(e) => {
            // Arrow keys move between tabs, as screen-reader users expect.
            if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
            const i = TABS.findIndex((tab) => tab.id === p.tab)
            const next = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length]
            p.setTab(next.id)
            document.getElementById(`tab-${next.id}`)?.focus()
          }}
        >
          {TABS.map((tab) => (
            <button
              key={tab.id}
              id={`tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={p.tab === tab.id}
              aria-controls="side-panel-content"
              tabIndex={p.tab === tab.id ? 0 : -1}
              onClick={() => p.setTab(tab.id)}
              className={`rounded-lg py-1.5 font-medium transition ${p.tab === tab.id ? 'bg-orange-400 text-slate-900' : 'text-white/70 hover:bg-white/10'}`}
            >
              {tab.label()}
            </button>
          ))}
        </nav>
      </header>
      <div
        id="side-panel-content"
        role="tabpanel"
        aria-labelledby={`tab-${p.tab}`}
        tabIndex={0}
        className={`min-h-0 flex-1 overflow-y-auto ${folded ? 'hidden sm:block' : ''} px-5 py-4 text-sm leading-relaxed`}
      >
        {!p.region && p.view === 'region' ? (
          <p className="text-white/60">{t('Cargando relieve MOLA de la zona…', 'Loading MOLA relief for this area…')}</p>
        ) : p.tab === 'missions' ? (
          <MissionsTab {...p} />
        ) : p.tab === 'objectives' ? (
          <ObjectivesTab {...p} />
        ) : p.tab === 'route' ? (
          <RouteTab {...p} />
        ) : (
          <SafetyTab {...p} />
        )}
      </div>
    </aside>
  )
}

function MissionsTab({ focus, missions, onMilestone }: Props) {
  if (!missions.length) {
    const nearest = MISSIONS.map((m) => ({ m, d: distanceKm(focus.lat, focus.lon, m.lat, m.lon) })).sort((a, b) => a.d - b.d)[0]
    return (
      <div className="space-y-3">
        <p className="text-white/80">
          {t(
            'Ninguna misión de superficie ha pisado esta zona. Todo lo que sabemos de ella viene de órbita: relieve láser de MOLA (Mars Global Surveyor) e imágenes Viking.',
            'No surface mission has set foot here. Everything we know comes from orbit: MOLA laser relief (Mars Global Surveyor) and Viking images.',
          )}
        </p>
        <p className="text-white/60">
          {t('La misión más cercana es', 'The nearest mission is')} <b className="text-white">{nearest.m.name}</b>, {t('a {d} km', '{d} km away', { d: fmt(nearest.d, 0) })} (
          {tr(nearest.m.site)}).
        </p>
        <p className="rounded-xl bg-sky-400/10 p-3 text-sky-100/90">
          {t(
            'Una tripulación aquí haría ciencia inédita: sería la primera exploración de la zona sobre el terreno.',
            'A crew here would do brand-new science: the first exploration of this area on the ground.',
          )}
        </p>
      </div>
    )
  }
  return (
    <div className="space-y-5">
      {missions.map((m) => (
        <section key={m.id}>
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: m.color }} />
            <h3 className="text-base font-semibold">{m.name}</h3>
          </div>
          <p className="mt-0.5 text-xs text-white/50">
            {tr(m.site)} · {m.landed.slice(0, 4)}–{m.ended ? m.ended.slice(0, 4) : t('activo', 'active')}
            {m.distanceKm ? t(' · {d} km recorridos', ' · {d} km driven', { d: fmt(m.distanceKm, m.distanceKm < 1 ? 1 : 0) }) : ''}
          </p>
          <p className="mt-1.5 text-white/75">{tr(m.summary)}</p>
          {!m.ended && ROVERS_WITH_FEED.includes(m.id) && <RoverPhotos rover={m.id as RoverWithFeed} name={m.name} />}
          <ol className="mt-3 space-y-2 border-l border-white/15 pl-4">
            {m.milestones.map((s) => (
              <li key={s.sol} className="relative">
                <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-[#141a2b]" style={{ background: m.color }} />
                <button type="button" onClick={() => onMilestone(m, s)} className="w-full rounded-lg p-2 text-left transition hover:bg-white/5">
                  <p className="font-mono text-[11px] text-white/45">
                    Sol {s.sol} · {s.date}
                  </p>
                  <p className="font-semibold text-white">{tr(s.title)}</p>
                  <p className="mt-0.5 text-white/75">{tr(s.what)}</p>
                  {s.finding && <p className="mt-1 text-sky-200/90">→ {tr(s.finding)}</p>}
                  {s.instruments && <p className="mt-1 text-xs text-white/45">{s.instruments.map(tr).join(' · ')}</p>}
                </button>
                {m.rawImages && (
                  <a href={m.rawImages(s.sol)} target="_blank" rel="noreferrer" className="ml-2 text-xs text-orange-300 hover:underline">
                    {t('Ver lo que vio el rover ese sol ↗', 'See what the rover saw that sol ↗')}
                  </a>
                )}
              </li>
            ))}
          </ol>
          <a href={m.link} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-orange-300 hover:underline">
            {t('Página de la misión en NASA ↗', 'Mission page at NASA ↗')}
          </a>
        </section>
      ))}
      <p className="text-xs text-white/55">
        {t(
          'Las paradas intermedias del recorrido son aproximadas (±1 km). Haz clic en un hito para volar hasta él.',
          'Intermediate traverse points are approximate (±1 km). Click a milestone to fly to it.',
        )}
      </p>
    </div>
  )
}

function ObjectivesTab({ view, focus, region, optical, geology, missions }: Props) {
  const lang = useLang()
  const curated = missions.find((m) => MISSION_OBJECTIVE[m.id] && distanceKm(focus.lat, focus.lon, m.lat, m.lon) < 150)
  const obj =
    view === 'site'
      ? { title: t('Formaciones boxwork del Monte Sharp', 'Mount Sharp boxwork formations'), text: MISSION_OBJECTIVE.curiosity() }
      : curated
        ? { title: t('Continuar el trabajo de {m}', 'Continue the work of {m}', { m: curated.name }), text: MISSION_OBJECTIVE[curated.id]() }
        : region
          ? terrainObjective(focus.lat, region)
          : null
  const layers = [
    {
      type: t('Óptico', 'Optical'),
      src:
        optical?.source === 'trek'
          ? t('Mosaico Viking MDIM 2.1 (NASA Mars Trek)', 'Viking MDIM 2.1 mosaic (NASA Mars Trek)')
          : t('Color de la textura global (como el globo) + detalle de superficie procedural', 'Global texture colour (as on the globe) + procedural surface detail'),
    },
    {
      type: t('Topográfico', 'Topographic'),
      src: region?.source === 'mola32' ? t('MOLA MEGDR, 32 px/° (~1,8 km/px), MGS', 'MOLA MEGDR, 32 px/° (~1.8 km/px), MGS') : 'MOLA MEGDR 4 px/°, MGS',
    },
    { type: t('Pendiente / obstáculos', 'Slope / obstacles'), src: t('Derivado del relieve MOLA', 'Derived from MOLA relief') },
    {
      type: t('Geológico', 'Geologic'),
      src:
        geology.unit && typeof geology.unit === 'object'
          ? t('Mapa USGS–NASA SIM 3292 · aquí: {u}', 'USGS–NASA map SIM 3292 · here: {u}', { u: plainUnit(geology.unit.name, lang).kind.toLowerCase() })
          : t('Mapa geológico USGS–NASA SIM 3292 (vía Mars Trek)', 'USGS–NASA geologic map SIM 3292 (via Mars Trek)'),
    },
    { type: t('Radiación', 'Radiation'), src: t('Estimación según la altura del terreno y la columna de atmósfera', 'Estimate by terrain elevation and atmospheric column') },
    { type: t('Atmosférico', 'Atmospheric'), src: t('Presión y temperatura: REMS (Curiosity) y Viking', 'Pressure and temperature: REMS (Curiosity) and Viking') },
    { type: t('Histórico', 'Historical'), src: t('Recorridos e hitos de rovers y landers de NASA', 'Traverses and milestones of NASA rovers and landers') },
  ]
  if (view === 'site')
    layers.unshift(
      { type: t('Topográfico 1 m', 'Topographic 1 m'), src: t('DTM estéreo HiRISE (MRO)', 'HiRISE stereo DTM (MRO)') },
      { type: t('Espectral', 'Spectral'), src: t('Color mineral HiRISE IRB', 'HiRISE IRB mineral colour') },
    )
  return (
    <div className="space-y-4">
      {obj && (
        <section className="rounded-xl bg-orange-400/10 p-3.5">
          <p className="text-xs font-semibold uppercase tracking-wider text-orange-300">{t('Objetivo científico', 'Science objective')}</p>
          <p className="mt-1 text-base font-semibold">{obj.title}</p>
          <p className="mt-1 text-white/80">{obj.text}</p>
        </section>
      )}
      <section>
        <p className="text-xs font-semibold uppercase tracking-wider text-white/50">{t('{n} tipos de datos integrados', '{n} integrated data types', { n: layers.length })}</p>
        <ul className="mt-2 space-y-1.5">
          {layers.map((l) => (
            <li key={l.type} className="flex gap-2">
              <span className="text-emerald-300">✓</span>
              <span>
                <b>{l.type}</b> <span className="text-white/60">· {l.src}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <p className="text-xs font-semibold uppercase tracking-wider text-white/50">{t('Cómo trabaja la tripulación', 'How the crew works')}</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-white/80">
          <li>{t('Dos astronautas en pareja: uno muestrea y el otro documenta y vigila.', 'Two astronauts in a pair: one samples, the other documents and keeps watch.')}</li>
          <li>
            {t('Un rover presurizado los lleva entre paradas; solo salen en traje para trabajar.', 'A pressurized rover carries them between stops; they suit up only to work.')}
          </li>
          <li>
            {t('Cada salida en traje dura como máximo {h} h y lleva {o2} kg de O₂.', 'Each suited outing lasts at most {h} h and carries {o2} kg of O₂.', {
              h: SUIT.maxEvaHours,
              o2: fmt(SUIT.o2CapacityKg, 1),
            })}
          </li>
          <li>
            {t('Las rutas evitan pendientes de más de {r}° en rover y {s}° a pie.', 'Routes avoid slopes steeper than {r}° by rover and {s}° on foot.', {
              r: ROVER.maxSlopeDeg,
              s: SUIT.maxSlopeDeg,
            })}
          </li>
        </ul>
      </section>
    </div>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl bg-white/5 px-2 py-2.5 text-center">
      <p className="font-mono text-base font-semibold text-sky-300">{value}</p>
      <p className="text-xs text-white/55">{label}</p>
    </div>
  )
}

function RouteTab({ view, plan, stops, sitePlan, siteAvailable, onEnterSite }: Props) {
  if (view === 'site') {
    if (!sitePlan) return <p className="text-white/60">{t('Calculando la ruta a pie…', 'Planning the walking route…')}</p>
    return (
      <div className="space-y-4">
        <p className="text-white/80">
          {t(
            'Ruta a pie más segura (A*) desde el punto A (hábitat) por los puntos B1, B2 y B3 y de vuelta a A, sobre el relieve HiRISE de 1 m. Esquiva las pendientes de más de {s}°.',
            'Safest walking route (A*) from point A (habitat) through points B1, B2 and B3 and back to A, over 1 m HiRISE relief. Avoids slopes steeper than {s}°.',
            { s: SUIT.maxSlopeDeg },
          )}
        </p>
        <p className="rounded-xl bg-white/5 p-3 text-center font-mono text-sm text-sky-200">A → B1 → B2 → B3 → A</p>
        <div className="grid grid-cols-2 gap-2">
          <Stat value={km(sitePlan.distanceM)} label={t('a pie', 'on foot')} />
          <Stat value={`${fmt(sitePlan.totalHours)} h`} label={t('con 3 paradas', 'with 3 stops')} />
          <Stat value={`${fmt(sitePlan.o2Kg, 2)} kg`} label={t('de oxígeno', 'of oxygen')} />
          <Stat value={`${fmt(sitePlan.doseMSv, 2)} mSv`} label={t('de radiación', 'of radiation')} />
        </div>
        <Warnings plan={sitePlan} />
      </div>
    )
  }
  if (!plan) return <p className="text-white/60">{t('Calculando la ruta…', 'Planning the route…')}</p>
  return (
    <div className="space-y-4">
      <p className="text-white/80">
        {t(
          'Travesía en rover presurizado (A* sobre el relieve MOLA): sale del punto A (la base), pasa por los puntos B1 a B{n} y vuelve a A. Evita las pendientes de más de {s}°.',
          'Pressurized rover traverse (A* over MOLA relief): leaves point A (the base), passes points B1 to B{n} and returns to A. Avoids slopes steeper than {s}°.',
          { n: stops.length, s: ROVER.maxSlopeDeg },
        )}
      </p>
      <p className="rounded-xl bg-white/5 p-3 text-center font-mono text-sm text-orange-200">A → {stops.map((_, i) => `B${i + 1}`).join(' → ')} → A</p>
      <div className="grid grid-cols-3 gap-2">
        <Stat value={km(plan.distanceM)} label={t('en rover', 'by rover')} />
        <Stat value={`${fmt(plan.totalHours)} h`} label={t('total', 'total')} />
        <Stat value={`${Math.round(plan.ascentM)} m`} label={t('de subida', 'of climb')} />
      </div>
      <ol className="space-y-2">
        {stops.map((s, i) => (
          <li key={s.id} className="rounded-xl bg-white/5 p-3">
            <p className="font-semibold">
              <span className="mr-1.5 rounded-md bg-orange-400 px-1.5 font-mono text-xs text-slate-900">B{i + 1}</span>
              {s.emoji} {tr(s.name)}
            </p>
            <p className="mt-0.5 text-white/75">{tr(s.goal)}</p>
            <p className="mt-1 text-xs text-white/55">{tr(s.why)}</p>
            <p className="mt-1 text-xs text-white/55">
              {t('EVA de {m} min', '{m} min EVA', { m: s.workMin })} · {s.tools.map(tr).join(', ')}
            </p>
          </li>
        ))}
      </ol>
      {plan.distanceM / 1000 > ROVER.rangeKm && (
        <p className="rounded-lg bg-amber-400/10 p-2.5 text-amber-200">
          {t(
            'La travesía supera la autonomía del rover ({r} km): hace falta una parada de recarga o dividirla en dos soles.',
            'The traverse exceeds the rover’s range ({r} km): it needs a recharge stop or must be split over two sols.',
            { r: ROVER.rangeKm },
          )}
        </p>
      )}
      <Warnings plan={plan} />
      {siteAvailable && (
        <button type="button" onClick={onEnterSite} className="w-full rounded-xl bg-sky-400 px-4 py-3 font-semibold text-slate-900 transition hover:bg-sky-300">
          {t('Bajar a escala EVA: Monte Sharp con HiRISE de 1 m ↓', 'Go down to EVA scale: Mount Sharp with 1 m HiRISE ↓')}
        </button>
      )}
    </div>
  )
}

function Warnings({ plan }: { plan: RoutePlan }) {
  if (!plan.warnings.length) return <p className="text-xs text-emerald-300/80">{t('✓ Ruta viable con los límites actuales.', '✓ Route feasible within the current limits.')}</p>
  return (
    <ul className="space-y-1.5">
      {plan.warnings.map((w) => (
        <li key={w} className="rounded-lg bg-amber-400/10 p-2.5 text-amber-200">
          {w}
        </li>
      ))}
    </ul>
  )
}

function SafetyTab({ view, focus, region, plan, sitePlan, solarStorm, setSolarStorm }: Props) {
  const z = view === 'site' ? -4000 : (region?.centerZ ?? 0)
  const dose = doseAtElevation(z, solarStorm)
  const temp = tempRange(focus.lat)
  const pr = pressureAtElevation(z)
  const usePlan = view === 'site' ? sitePlan : plan
  return (
    <div className="space-y-4">
      <label className="flex cursor-pointer items-center justify-between rounded-xl bg-white/5 p-3">
        <span>
          <b>{t('Clima espacial: tormenta solar', 'Space weather: solar storm')}</b>
          <span className="block text-xs text-white/55">
            {t('Simula un evento de partículas solares (dosis ×30 durante horas)', 'Simulates a solar particle event (dose ×30 for hours)')}
          </span>
        </span>
        <input type="checkbox" checked={solarStorm} onChange={(e) => setSolarStorm(e.target.checked)} className="h-5 w-5 accent-orange-400" />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <Stat value={`${fmt(dose, 2)} mSv`} label={t('radiación por sol', 'radiation per sol')} />
        <Stat value={usePlan ? `${fmt(usePlan.doseMSv, 2)} mSv` : '—'} label={t('dosis de la salida', 'outing dose')} />
        <Stat value={`${fmt(pr, 1)} mbar`} label={t('presión (Tierra: 1013)', 'pressure (Earth: 1013)')} />
        <Stat value={`${temp.min}…${temp.max} °C`} label={t('temperatura del aire', 'air temperature')} />
        <Stat value={usePlan ? `${Math.round(usePlan.maxSlope)}°` : '—'} label={t('pendiente máx. en ruta', 'max. slope on route')} />
        <Stat
          value={region && view !== 'site' ? `${Math.round(region.blockedFrac * 100)} %` : '—'}
          label={t('zona > {s}° (intransitable)', 'area > {s}° (impassable)', { s: ROVER.maxSlopeDeg })}
        />
      </div>
      {solarStorm && (
        <p className="rounded-lg bg-red-500/15 p-2.5 text-red-200">
          {t(
            'Con tormenta solar, regresar al rover o al hábitat (blindados) y aplazar la salida.',
            'During a solar storm, return to the (shielded) rover or habitat and postpone the outing.',
          )}
        </p>
      )}
      <ul className="list-disc space-y-1 pl-5 text-white/75">
        <li>{t('Las zonas altas reciben más radiación porque tienen menos atmósfera encima.', 'High ground gets more radiation because there is less atmosphere above it.')}</li>
        <li>
          {t(
            'Retraso de comunicación con la Tierra: ~{m} min por trayecto. La tripulación decide sola.',
            'Communication delay with Earth: ~{m} min each way. The crew decides on its own.',
            {
              m: COMMS_DELAY_MIN,
            },
          )}
        </li>
        <li>
          {t(
            'Las tormentas de polvo son más frecuentes en primavera y verano del hemisferio sur (Ls 180°–360°).',
            'Dust storms are most frequent in southern-hemisphere spring and summer (Ls 180°–360°).',
          )}
        </li>
        <li>
          {t(
            'Rocas grandes y arena blanda (como la que atrapó a Spirit): revisar la capa de pendiente y la imagen antes de salir.',
            'Large rocks and soft sand (like the sand that trapped Spirit): check the slope layer and the image before heading out.',
          )}
        </li>
      </ul>
      <p className="text-xs text-white/55">
        {t(
          'Estimaciones de orden de magnitud a partir de datos publicados (REMS, Viking). No son especificaciones de NASA.',
          'Order-of-magnitude estimates from published data (REMS, Viking). Not NASA specifications.',
        )}
      </p>
    </div>
  )
}
