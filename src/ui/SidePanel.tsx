import { COMMS_DELAY_MIN, doseAtElevation, pressureAtElevation, ROVER, SUIT, tempRange } from '../data/environment'
import { distanceKm, MISSIONS, type Milestone, type Mission } from '../data/missions'
import type { Optical } from '../region/regionLayers'
import type { Region } from '../region/regionTerrain'
import type { View } from '../scene/MarsGlobe'
import { formatLatLon, PLACES } from '../scene/mars'
import type { RoutePlan, Station } from '../types'

export type Tab = 'missions' | 'objectives' | 'route' | 'safety'
const TABS: { id: Tab; label: string }[] = [
  { id: 'missions', label: 'Misiones' },
  { id: 'objectives', label: 'Objetivos' },
  { id: 'route', label: 'Ruta' },
  { id: 'safety', label: 'Seguridad' },
]

const fmt = (n: number, d = 1) => n.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d })
const km = (m: number) => `${fmt(m / 1000, m < 10_000 ? 1 : 0)} km`

export function placeName(lat: number, lon: number) {
  const near = PLACES.map((p) => ({ p, d: distanceKm(lat, lon, p.lat, p.lon) })).sort((a, b) => a.d - b.d)[0]
  if (near.d < 120) return { name: near.p.name, note: near.p.note }
  if (near.d < 700) return { name: `A ${Math.round(near.d / 10) * 10} km de ${near.p.name}`, note: near.p.note }
  return { name: 'Zona sin nombre', note: 'Ninguna misión de superficie ha estado aquí' }
}

/** Science objective for the spot: curated for past-mission sites, inferred from the terrain elsewhere. */
const MISSION_OBJECTIVE: Record<string, string> = {
  curiosity: 'Estudiar a pie las formaciones boxwork y las capas de sulfatos del Monte Sharp: dónde y cuándo circuló agua bajo la superficie, y si pudo albergar vida.',
  perseverance: 'Recoger muestras del delta y del borde de Jezero junto a rocas como Cheyava Falls, buscando biofirmas con instrumentos que un rover no puede llevar.',
  opportunity: 'Leer la química de las capas con hematita y yeso de Meridiani para entender las aguas ácidas que la cubrieron.',
  spirit: 'Muestrear la sílice de Home Plate: restos de fuentes termales, uno de los mejores ambientes para vida microbiana.',
  sojourner: 'Comparar las rocas arrastradas por las inundaciones gigantes de Ares Vallis, que traen muestras de las tierras altas.',
  viking1: 'Repetir los experimentos de biología de Viking con instrumentos modernos y estudiar los oxidantes del suelo.',
  viking2: 'Medir la escarcha estacional y el hielo enterrado de Utopia como recurso de agua.',
  phoenix: 'Extraer hielo de agua del subsuelo ártico: agua, oxígeno y combustible para la tripulación.',
  insight: 'Desplegar una red de sismómetros para medir los sismos que afectarían a una base permanente.',
}

function terrainObjective(lat: number, r: Region) {
  if (Math.abs(lat) > 55)
    return {
      title: 'Hielo de agua cerca de la superficie',
      text: 'A esta latitud el hielo está a pocos centímetros. Objetivo: medir su pureza y profundidad como recurso para la tripulación.',
    }
  if (r.centerZ > 6000) return { title: 'Volcanismo', text: 'Terreno alto y volcánico. Objetivo: muestrear coladas de lava para fecharlas y entender cuándo fue activo Marte.' }
  if (r.centerZ < -3500)
    return {
      title: 'Cuenca baja: antiguos lagos',
      text: 'Las zonas bajas acumulan sedimentos de agua. Objetivo: buscar arcillas y sales que conserven química de un antiguo lago.',
    }
  if (r.blockedFrac > 0.12)
    return { title: 'Capas expuestas en escarpes', text: 'Las paredes empinadas dejan ver capas de roca de distintas épocas. Objetivo: leerlas en orden, de abajo arriba.' }
  return {
    title: 'Corteza antigua con cráteres',
    text: 'Tierras altas de más de 3.500 millones de años. Objetivo: muestrear eyecta de cráteres que traen roca profunda a la superficie.',
  }
}

interface Props {
  view: View
  focus: { lat: number; lon: number }
  region: Region | null
  optical: Optical | null
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
  return (
    <aside className="card-in pointer-events-auto absolute inset-x-2 bottom-2 z-30 flex max-h-[58vh] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#141a2b]/88 text-white shadow-2xl backdrop-blur-md sm:inset-x-auto sm:bottom-4 sm:right-4 sm:top-4 sm:max-h-none sm:w-[420px]">
      <header className="border-b border-white/10 px-5 pb-3 pt-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-300">
              {p.view === 'site' ? 'Escala EVA · HiRISE 1 m' : `Vista regional · ${Math.round(p.region?.sizeKm ?? 120)} × ${Math.round(p.region?.sizeKm ?? 120)} km`}
            </p>
            <h2 className="mt-1 text-2xl font-bold leading-tight tracking-tight">{p.view === 'site' ? 'Monte Sharp' : name.name}</h2>
            <p className="mt-0.5 font-mono text-xs text-white/55">
              {formatLatLon(p.focus.lat, p.focus.lon)}
              {p.view === 'site' ? ' · recorte de 2 × 2 km' : p.region && ` · ${fmt(p.region.centerZ / 1000, 2)} km de elevación`}
            </p>
          </div>
          <button
            type="button"
            onClick={p.onBack}
            aria-label={p.view === 'site' ? 'Volver a la vista regional' : 'Volver al globo'}
            className="shrink-0 rounded-lg px-2.5 py-1.5 text-sm text-white/70 ring-1 ring-white/15 hover:bg-white/10 hover:text-white"
          >
            {p.view === 'site' ? '← Región' : '← Globo'}
          </button>
        </div>
        <nav
          role="tablist"
          aria-label="Información del lugar"
          className="mt-3 grid grid-cols-4 gap-1 rounded-xl bg-black/25 p-1 text-sm"
          onKeyDown={(e) => {
            // Arrow keys move between tabs, as screen-reader users expect.
            if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
            const i = TABS.findIndex((t) => t.id === p.tab)
            const next = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length]
            p.setTab(next.id)
            document.getElementById(`tab-${next.id}`)?.focus()
          }}
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              id={`tab-${t.id}`}
              type="button"
              role="tab"
              aria-selected={p.tab === t.id}
              aria-controls="side-panel-content"
              tabIndex={p.tab === t.id ? 0 : -1}
              onClick={() => p.setTab(t.id)}
              className={`rounded-lg py-1.5 font-medium transition ${p.tab === t.id ? 'bg-orange-400 text-slate-900' : 'text-white/70 hover:bg-white/10'}`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>
      <div id="side-panel-content" role="tabpanel" aria-labelledby={`tab-${p.tab}`} tabIndex={0} className="min-h-0 flex-1 overflow-y-auto px-5 py-4 text-sm leading-relaxed">
        {!p.region && p.view === 'region' ? (
          <p className="text-white/60">Cargando relieve MOLA de la zona…</p>
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
          Ninguna misión de superficie ha pisado esta zona. Todo lo que sabemos de ella viene de órbita: relieve láser de MOLA (Mars Global Surveyor) e imágenes Viking.
        </p>
        <p className="text-white/60">
          La misión más cercana es <b className="text-white">{nearest.m.name}</b>, a {fmt(nearest.d, 0)} km ({nearest.m.site}).
        </p>
        <p className="rounded-xl bg-sky-400/10 p-3 text-sky-100/90">Una tripulación aquí haría ciencia inédita: sería la primera exploración de la zona sobre el terreno.</p>
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
            {m.site} · {m.landed.slice(0, 4)}–{m.ended ? m.ended.slice(0, 4) : 'activo'}
            {m.distanceKm ? ` · ${fmt(m.distanceKm, m.distanceKm < 1 ? 1 : 0)} km recorridos` : ''}
          </p>
          <p className="mt-1.5 text-white/75">{m.summary}</p>
          <ol className="mt-3 space-y-2 border-l border-white/15 pl-4">
            {m.milestones.map((s) => (
              <li key={s.sol} className="relative">
                <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-[#141a2b]" style={{ background: m.color }} />
                <button onClick={() => onMilestone(m, s)} className="w-full rounded-lg p-2 text-left transition hover:bg-white/5">
                  <p className="font-mono text-[11px] text-white/45">
                    Sol {s.sol} · {s.date}
                  </p>
                  <p className="font-semibold text-white">{s.title}</p>
                  <p className="mt-0.5 text-white/75">{s.what}</p>
                  {s.finding && <p className="mt-1 text-sky-200/90">→ {s.finding}</p>}
                  {s.instruments && <p className="mt-1 text-xs text-white/45">{s.instruments.join(' · ')}</p>}
                </button>
                {m.rawImages && (
                  <a href={m.rawImages(s.sol)} target="_blank" rel="noreferrer" className="ml-2 text-xs text-orange-300 hover:underline">
                    Ver lo que vio el rover ese sol ↗
                  </a>
                )}
              </li>
            ))}
          </ol>
          <a href={m.link} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-orange-300 hover:underline">
            Página de la misión en NASA ↗
          </a>
        </section>
      ))}
      <p className="text-xs text-white/40">Las paradas intermedias del recorrido son aproximadas (±1 km). Haz clic en un hito para volar hasta él.</p>
    </div>
  )
}

function ObjectivesTab({ view, focus, region, optical, missions }: Props) {
  const curated = missions.find((m) => MISSION_OBJECTIVE[m.id] && distanceKm(focus.lat, focus.lon, m.lat, m.lon) < 150)
  const obj =
    view === 'site'
      ? { title: 'Formaciones boxwork del Monte Sharp', text: MISSION_OBJECTIVE.curiosity }
      : curated
        ? { title: `Continuar el trabajo de ${curated.name}`, text: MISSION_OBJECTIVE[curated.id] }
        : region
          ? terrainObjective(focus.lat, region)
          : null
  const layers = [
    {
      type: 'Óptico',
      src: optical?.source === 'trek' ? 'Mosaico Viking MDIM 2.1 (NASA Mars Trek)' : 'Color de la textura global (como el globo) + detalle de superficie procedural',
    },
    { type: 'Topográfico', src: region?.source === 'mola32' ? 'MOLA MEGDR, 32 px/° (~1,8 km/px), MGS' : 'MOLA MEGDR 4 px/°, MGS' },
    { type: 'Pendiente / obstáculos', src: 'Derivado del relieve MOLA' },
    { type: 'Radiación', src: 'Modelo anclado a RAD (Curiosity), según la columna de atmósfera' },
    { type: 'Atmosférico', src: 'Presión y temperatura: REMS (Curiosity) y Viking' },
    { type: 'Histórico', src: 'Recorridos e hitos de rovers y landers de NASA' },
  ]
  if (view === 'site') layers.unshift({ type: 'Topográfico 1 m', src: 'DTM estéreo HiRISE (MRO)' }, { type: 'Espectral', src: 'Color mineral HiRISE IRB' })
  return (
    <div className="space-y-4">
      {obj && (
        <section className="rounded-xl bg-orange-400/10 p-3.5">
          <p className="text-xs font-semibold uppercase tracking-wider text-orange-300">Objetivo científico</p>
          <p className="mt-1 text-base font-semibold">{obj.title}</p>
          <p className="mt-1 text-white/80">{obj.text}</p>
        </section>
      )}
      <section>
        <p className="text-xs font-semibold uppercase tracking-wider text-white/50">{layers.length} tipos de datos integrados</p>
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
        <p className="text-xs font-semibold uppercase tracking-wider text-white/50">Cómo trabaja la tripulación</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-white/80">
          <li>Dos astronautas en pareja: uno muestrea y el otro documenta y vigila.</li>
          <li>Un rover presurizado los lleva entre paradas; solo salen en traje para trabajar.</li>
          <li>
            Cada salida en traje dura como máximo {SUIT.maxEvaHours} h y lleva {fmt(SUIT.o2CapacityKg, 1)} kg de O₂.
          </li>
          <li>
            Las rutas evitan pendientes de más de {ROVER.maxSlopeDeg}° en rover y {SUIT.maxSlopeDeg}° a pie.
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
    if (!sitePlan) return <p className="text-white/60">Calculando la ruta a pie…</p>
    return (
      <div className="space-y-4">
        <p className="text-white/80">
          Ruta a pie más segura (A*) desde el <b>punto A</b> (hábitat) por los puntos <b>B1, B2 y B3</b> y de vuelta a A, sobre el relieve HiRISE de 1 m. Esquiva las pendientes de
          más de {SUIT.maxSlopeDeg}°.
        </p>
        <p className="rounded-xl bg-white/5 p-3 text-center font-mono text-sm text-sky-200">A → B1 → B2 → B3 → A</p>
        <div className="grid grid-cols-2 gap-2">
          <Stat value={km(sitePlan.distanceM)} label="a pie" />
          <Stat value={`${fmt(sitePlan.totalHours)} h`} label="con 3 paradas" />
          <Stat value={`${fmt(sitePlan.o2Kg, 2)} kg`} label="de oxígeno" />
          <Stat value={`${fmt(sitePlan.doseMSv, 2)} mSv`} label="de radiación" />
        </div>
        <Warnings plan={sitePlan} />
      </div>
    )
  }
  if (!plan) return <p className="text-white/60">Calculando la ruta…</p>
  return (
    <div className="space-y-4">
      <p className="text-white/80">
        Travesía en rover presurizado (A* sobre el relieve MOLA): sale del <b>punto A</b> (la base), pasa por los puntos <b>B1 a B{stops.length}</b> y vuelve a A. Evita las
        pendientes de más de {ROVER.maxSlopeDeg}°.
      </p>
      <p className="rounded-xl bg-white/5 p-3 text-center font-mono text-sm text-orange-200">A → {stops.map((_, i) => `B${i + 1}`).join(' → ')} → A</p>
      <div className="grid grid-cols-3 gap-2">
        <Stat value={km(plan.distanceM)} label="en rover" />
        <Stat value={`${fmt(plan.totalHours)} h`} label="total" />
        <Stat value={`${Math.round(plan.ascentM)} m`} label="de subida" />
      </div>
      <ol className="space-y-2">
        {stops.map((s, i) => (
          <li key={s.id} className="rounded-xl bg-white/5 p-3">
            <p className="font-semibold">
              <span className="mr-1.5 rounded-md bg-orange-400 px-1.5 font-mono text-xs text-slate-900">B{i + 1}</span>
              {s.emoji} {s.name}
            </p>
            <p className="mt-0.5 text-white/75">{s.goal}</p>
            <p className="mt-1 text-xs text-white/50">{s.why}</p>
            <p className="mt-1 text-xs text-white/40">
              EVA de {s.workMin} min · {s.tools.join(', ')}
            </p>
          </li>
        ))}
      </ol>
      {plan.distanceM / 1000 > ROVER.rangeKm && (
        <p className="rounded-lg bg-amber-400/10 p-2.5 text-amber-200">
          La travesía supera la autonomía del rover ({ROVER.rangeKm} km): hace falta una parada de recarga o dividirla en dos soles.
        </p>
      )}
      <Warnings plan={plan} />
      {siteAvailable && (
        <button onClick={onEnterSite} className="w-full rounded-xl bg-sky-400 px-4 py-3 font-semibold text-slate-900 transition hover:bg-sky-300">
          Bajar a escala EVA: Monte Sharp con HiRISE de 1 m ↓
        </button>
      )}
    </div>
  )
}

function Warnings({ plan }: { plan: RoutePlan }) {
  if (!plan.warnings.length) return <p className="text-xs text-emerald-300/80">✓ Ruta viable con los límites actuales.</p>
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
  const t = tempRange(focus.lat)
  const pr = pressureAtElevation(z)
  const usePlan = view === 'site' ? sitePlan : plan
  return (
    <div className="space-y-4">
      <label className="flex cursor-pointer items-center justify-between rounded-xl bg-white/5 p-3">
        <span>
          <b>Clima espacial: tormenta solar</b>
          <span className="block text-xs text-white/55">Simula un evento de partículas solares (dosis ×30 durante horas)</span>
        </span>
        <input type="checkbox" checked={solarStorm} onChange={(e) => setSolarStorm(e.target.checked)} className="h-5 w-5 accent-orange-400" />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <Stat value={`${fmt(dose, 2)} mSv`} label="radiación por sol" />
        <Stat value={usePlan ? `${fmt(usePlan.doseMSv, 2)} mSv` : '—'} label="dosis de la salida" />
        <Stat value={`${fmt(pr, 1)} mbar`} label="presión (Tierra: 1013)" />
        <Stat value={`${t.min}…${t.max} °C`} label="temperatura del aire" />
        <Stat value={usePlan ? `${Math.round(usePlan.maxSlope)}°` : '—'} label="pendiente máx. en ruta" />
        <Stat value={region && view !== 'site' ? `${Math.round(region.blockedFrac * 100)} %` : '—'} label={`zona > ${ROVER.maxSlopeDeg}° (intransitable)`} />
      </div>
      {solarStorm && <p className="rounded-lg bg-red-500/15 p-2.5 text-red-200">Con tormenta solar, regresar al rover o al hábitat (blindados) y aplazar la salida.</p>}
      <ul className="list-disc space-y-1 pl-5 text-white/75">
        <li>Las zonas altas reciben más radiación porque tienen menos atmósfera encima.</li>
        <li>Retraso de comunicación con la Tierra: ~{COMMS_DELAY_MIN} min por trayecto. La tripulación decide sola.</li>
        <li>Las tormentas de polvo son más frecuentes en primavera y verano del hemisferio sur (Ls 180°–360°).</li>
        <li>Rocas grandes y arena blanda (como la que atrapó a Spirit): revisar la capa de pendiente y la imagen antes de salir.</li>
      </ul>
      <p className="text-xs text-white/40">Estimaciones de orden de magnitud a partir de datos publicados (RAD, REMS, Viking). No son especificaciones de NASA.</p>
    </div>
  )
}
