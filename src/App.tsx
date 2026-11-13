import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { doseAtElevation, ROVER } from './data/environment'
import { distanceKm, MISSIONS, type Milestone, type Mission } from './data/missions'
import { STATION_BY_ID } from './data/stations'
import { opticalCanvas, REGION_LAYERS, slopeCanvas, topoCanvas, type Optical, type RegionLayer } from './region/regionLayers'
import { buildRegion, frameFor, habitatFor, insidePatch, latLonToUV, missionStops, terrainStops, type Region } from './region/regionTerrain'
import { planRoute } from './route/plan'
import type { View } from './scene/MarsGlobe'
import { formatLatLon, SITE, UNITS_PER_M } from './scene/mars'
import { RegionTerrain, regionPlacement, regionWorldPoint } from './scene/RegionTerrain'
import { LAYERS, sitePlacement, type SiteLayer } from './scene/SiteTerrain'
import { Stage, type Shot } from './scene/Stage'
import { loadTerrain, type Terrain } from './terrain/terrain'
import { placeName, SidePanel, type Tab } from './ui/SidePanel'
import { Traveler } from './scene/Traveler'
import { arrivals, newTour, TOUR_CAMERAS, type TourCamera, type TourState } from './tour/tour'
import { TourHud } from './ui/TourHud'
import { LayerLegend } from './ui/LayerLegend'
import { Credits, GlobeOverlay } from './ui/GlobeOverlay'
import { Loader } from './ui/Loader'
import { SUIT } from './data/environment'

const SITE_STOPS = ['boxwork', 'contact', 'mounds']
/** A click closer than this to a mission's site, track or milestone opens that mission's traverse. */
const SNAP_KM = 12

/** Canvas textures of the current region, disposed when another spot is picked. */
const regionTextures: THREE.Texture[] = []
function texture(c: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  regionTextures.push(t)
  return t
}

export default function App() {
  const [view, setView] = useState<View>('globe')
  const [focus, setFocus] = useState<{ lat: number; lon: number } | null>(null)
  const [frameKm, setFrameKm] = useState(120)
  const [shot, setShot] = useState<Shot>({ key: 0 })
  const [region, setRegion] = useState<Region | null>(null)
  const [optical, setOptical] = useState<Optical | null>(null)
  const [textures, setTextures] = useState<Record<RegionLayer, THREE.Texture> | null>(null)
  const [normalMap, setNormalMap] = useState<THREE.Texture | null>(null)
  const [layer, setLayer] = useState<RegionLayer>('optical')
  const [siteLayer, setSiteLayer] = useState<SiteLayer>('ortho')
  const [tab, setTab] = useState<Tab>('missions')
  const [solarStorm, setSolarStorm] = useState(false)
  const [siteTerrain, setSiteTerrain] = useState<Terrain | null>(null)
  const labels = useRef<Record<string, HTMLElement | null>>({})
  const hoverEl = useRef<HTMLParagraphElement>(null)
  const request = useRef(0)
  const tour = useRef<TourState>(newTour())
  /** Snapshot of the tour for the HUD; null when no traverse is running. */
  const [tourUI, setTourUI] = useState<TourState | null>(null)
  const tick = useCallback(() => setTourUI(tour.current.active ? { ...tour.current } : null), [])

  useEffect(() => {
    loadTerrain('/terrain').then(setSiteTerrain)
  }, [])

  const fly = useCallback((patch: Omit<Shot, 'key'> = {}) => setShot((s) => ({ key: s.key + 1, ...patch })), [])

  // ---- picking a spot ----
  const pick = useCallback(
    (clickLat: number, clickLon: number) => {
      const id = ++request.current
      tour.current.active = false
      setTourUI(null)
      // Only snap to a mission when the click is right on it (its landing site, a milestone or its
      // track): otherwise the patch is centred exactly where the user clicked.
      const onMission = MISSIONS.filter((m) =>
        [[m.lat, m.lon] as [number, number], ...m.track, ...m.milestones.map((x) => [x.lat, x.lon] as [number, number])].some(
          ([a, b]) => distanceKm(clickLat, clickLon, a, b) < SNAP_KM,
        ),
      )
      const { lat, lon, sizeKm } = frameFor(clickLat, clickLon, onMission)
      setFocus({ lat, lon })
      setFrameKm(sizeKm)
      setView('region')
      setTab('missions')
      setRegion(null)
      setOptical(null)
      setTextures(null)
      setNormalMap(null)
      regionTextures.splice(0).forEach((t) => t.dispose())
      fly()
      document.body.style.cursor = ''
      buildRegion(lat, lon, sizeKm).then(async (r) => {
        if (id !== request.current) return
        setRegion(r)
        const topo = texture(topoCanvas(r))
        const base = { optical: topo, topo, slope: texture(slopeCanvas(r)) }
        setTextures(base)
        const o = await opticalCanvas(r)
        if (id !== request.current) return
        setOptical(o)
        setTextures({ ...base, optical: texture(o.canvas) })
        const n = texture(o.normal)
        n.colorSpace = THREE.NoColorSpace
        setNormalMap(n)
      })
    },
    [fly],
  )

  const back = useCallback(() => {
    tour.current.active = false
    setTourUI(null)
    if (view === 'site') {
      setView('region')
      fly()
    } else if (view === 'region') {
      request.current++
      setView('globe')
      fly()
    }
  }, [view, fly])

  const enterSite = useCallback(() => {
    tour.current.active = false
    setTourUI(null)
    setView('site')
    setTab('route')
    fly()
  }, [fly])

  // ---- derived data ----
  // Missions that actually touched the patch on screen (landing, milestones or track inside it).
  const nearMissions = useMemo(() => {
    if (!focus) return []
    const frame = { lat: focus.lat, lon: focus.lon, sizeKm: region?.sizeKm ?? frameKm }
    return MISSIONS.filter((m) =>
      [[m.lat, m.lon] as [number, number], ...m.track, ...m.milestones.map((x) => [x.lat, x.lon] as [number, number])].some(([a, b]) => insidePatch(latLonToUV(frame, a, b))),
    )
  }, [focus, region, frameKm])
  const habitat = useMemo(() => (region ? habitatFor(region, nearMissions) : null), [region, nearMissions])
  const stops = useMemo(() => {
    if (!region || !habitat) return []
    const fromMissions = missionStops(region, nearMissions, habitat)
    return fromMissions.length >= 2 ? fromMissions : terrainStops(region)
  }, [region, nearMissions, habitat])
  const plan = useMemo(() => {
    if (!region || !habitat || !stops.length) return null
    return planRoute(region.terrain, habitat, stops, { profile: ROVER, solarEvent: solarStorm, doseMSvPerDay: doseAtElevation(region.meanZ) })
  }, [region, habitat, stops, solarStorm])
  const sitePlan = useMemo(
    () =>
      siteTerrain
        ? planRoute(
            siteTerrain,
            STATION_BY_ID.hab,
            SITE_STOPS.map((id) => STATION_BY_ID[id]),
            { solarEvent: solarStorm },
          )
        : null,
    [siteTerrain, solarStorm],
  )
  const siteY = useMemo(() => (siteTerrain ? sitePlacement(siteTerrain).targetY : 10), [siteTerrain])
  const regionY = useMemo(() => (region ? regionPlacement(region.terrain).targetY : 10), [region])
  const siteAvailable = !!region && !!siteTerrain && insidePatch(latLonToUV(region, SITE.lat, SITE.lon), 0.02)

  // ---- guided traverse ----
  const tourPlan = view === 'site' ? sitePlan : view === 'region' ? plan : null
  const tourArrivals = useMemo(() => {
    if (!tourPlan) return []
    const stations = view === 'site' ? STATION_BY_ID : Object.fromEntries([...(habitat ? [habitat] : []), ...stops].map((x) => [x.id, x]))
    return arrivals(tourPlan, stations)
  }, [tourPlan, view, habitat, stops])
  const startTour = useCallback(() => {
    const keep = tour.current
    tour.current = { ...newTour(), active: true, playing: true, speed: keep.speed, camera: keep.camera, look: keep.look }
    tick()
  }, [tick])
  const stopTour = useCallback(() => {
    tour.current.active = false
    tour.current.playing = false
    setTourUI(null)
    fly()
  }, [fly])
  const tourTotal = tourPlan?.points.at(-1)?.d ?? 0
  const togglePlay = useCallback(() => {
    const s = tour.current
    if (s.d >= tourTotal - 1) {
      s.d = 0
      s.next = 0
      s.hold = 0
      s.playing = true
    } else s.playing = !s.playing
    tick()
  }, [tourTotal, tick])
  const seek = useCallback(
    (d: number) => {
      const s = tour.current
      s.d = d
      s.hold = 0
      const n = tourArrivals.findIndex((a) => a.d > d + 0.5)
      s.next = n < 0 ? tourArrivals.length : n
      tick()
    },
    [tourArrivals, tick],
  )
  const setTourCamera = useCallback(
    (c: TourCamera) => {
      tour.current.camera = c
      tick()
    },
    [tick],
  )

  const onMilestone = useCallback(
    (_m: Mission, s: Milestone) => {
      if (view === 'site') return
      if (!region) return
      const uv = latLonToUV(region, s.lat, s.lon)
      if (!insidePatch(uv)) {
        pick(s.lat, s.lon)
        return
      }
      fly({ target: regionWorldPoint(region.terrain, uv), dist: 0.06 })
    },
    [region, view, fly, pick],
  )

  const onHover = useCallback((p: { lat: number; lon: number } | null) => {
    const el = hoverEl.current
    if (!el) return
    if (!p) {
      el.textContent = 'Toca o haz clic en cualquier punto de Marte'
      return
    }
    const n = placeName(p.lat, p.lon)
    el.textContent = `${formatLatLon(p.lat, p.lon)} · ${n.name}`
  }, [])

  // ---- keyboard ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (tour.current.active) {
        if (e.key === 'Escape') return stopTour()
        if (e.key === ' ') {
          e.preventDefault()
          return togglePlay()
        }
        if (e.key === 'c' || e.key === 'C') {
          const i = TOUR_CAMERAS.findIndex((c) => c.id === tour.current.camera)
          return setTourCamera(TOUR_CAMERAS[(i + 1) % TOUR_CAMERAS.length].id)
        }
      }
      if (e.key === 'Escape' || e.key === 'Backspace') back()
      else if (e.key === 'f' || e.key === 'F') {
        if (document.fullscreenElement) document.exitFullscreen()
        else document.documentElement.requestFullscreen().catch(() => {})
      } else if (['1', '2', '3'].includes(e.key)) {
        const i = Number(e.key) - 1
        if (view === 'site') setSiteLayer(LAYERS[i].id)
        else setLayer(REGION_LAYERS[i].id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [back, view, stopTour, togglePlay, setTourCamera])

  const layerButtons = view === 'site' ? LAYERS.map((l) => ({ id: l.id, label: l.label })) : REGION_LAYERS.map((l) => ({ id: l.id, label: l.label }))
  const currentLayer = view === 'site' ? siteLayer : layer

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#03040a] font-sans">
      <Stage
        view={view}
        focus={focus}
        shot={shot}
        siteTerrain={siteTerrain}
        sitePlan={sitePlan}
        siteY={siteY}
        siteLayer={siteLayer}
        touring={!!tourUI}
        regionY={regionY}
        regionSpan={(region?.sizeKm ?? frameKm) * 1000 * UNITS_PER_M}
        labels={labels}
        tour={tour}
        onPick={pick}
        onHover={onHover}
      >
        {region && textures && (
          <RegionTerrain
            region={region}
            textures={textures}
            normalMap={normalMap}
            layer={layer}
            plan={plan}
            stops={habitat ? [habitat, ...stops] : stops}
            missions={nearMissions}
            active={view === 'region'}
            touring={!!tourUI}
            onMilestone={onMilestone}
          />
        )}
        {view === 'region' && region && plan && (
          <Traveler key={`r${region.lat}${region.lon}`} mode="region" terrain={region.terrain} plan={plan} arrivals={tourArrivals} tour={tour} onTick={tick} />
        )}
        {view === 'site' && siteTerrain && sitePlan && <Traveler key="site" mode="site" terrain={siteTerrain} plan={sitePlan} arrivals={tourArrivals} tour={tour} onTick={tick} />}
      </Stage>

      <GlobeOverlay view={view} labels={labels} hoverEl={hoverEl} onPickMission={(m) => pick(m.lat, m.lon)} />

      {/* Layer switcher on the terrain */}
      {view !== 'globe' && !tourUI && (
        <div
          role="group"
          aria-label="Capas del mapa"
          className="card-in absolute left-2 top-2 flex gap-1 rounded-xl border border-white/10 bg-[#141a2b]/80 p-1 text-sm text-white backdrop-blur sm:left-6 sm:top-6"
        >
          {layerButtons.map((l, i) => (
            <button
              key={l.id}
              type="button"
              aria-pressed={currentLayer === l.id}
              aria-keyshortcuts={String(i + 1)}
              onClick={() => (view === 'site' ? setSiteLayer(l.id as SiteLayer) : setLayer(l.id as RegionLayer))}
              className={`rounded-lg px-3 py-1.5 font-medium transition ${currentLayer === l.id ? 'bg-orange-400 text-slate-900' : 'text-white/75 hover:bg-white/10'}`}
            >
              <span className="mr-1.5 font-mono text-xs opacity-60">{i + 1}</span>
              {l.label}
            </button>
          ))}
        </div>
      )}

      {view !== 'globe' && !tourUI && tourPlan && tourArrivals.length > 0 && (
        <button
          onClick={startTour}
          className="card-in absolute left-2 top-16 flex items-center gap-2 rounded-xl bg-orange-400 px-4 py-2.5 text-sm font-semibold text-slate-900 shadow-lg shadow-orange-500/30 transition hover:bg-orange-300 sm:left-6 sm:top-20"
        >
          <span className="text-base">▶</span> {view === 'site' ? 'Recorrer la EVA a pie' : 'Recorrer la ruta en rover'}
        </button>
      )}
      {view === 'region' && region && !tourUI && <LayerLegend region={region} layer={layer} />}
      {tourUI && tourPlan && (
        <TourHud
          mode={view === 'site' ? 'site' : 'region'}
          plan={tourPlan}
          arrivals={tourArrivals}
          tour={tourUI}
          baseName={view === 'site' ? STATION_BY_ID.hab.name : (habitat?.name ?? 'Base')}
          maxSlope={view === 'site' ? SUIT.maxSlopeDeg : ROVER.maxSlopeDeg}
          onPlay={togglePlay}
          onSeek={seek}
          onSpeed={(v) => {
            tour.current.speed = v
            tick()
          }}
          onCamera={setTourCamera}
          onExit={stopTour}
        />
      )}
      {view !== 'globe' && focus && !tourUI && (
        <SidePanel
          view={view}
          focus={view === 'site' ? SITE : focus}
          region={region}
          optical={optical}
          plan={plan}
          stops={stops}
          sitePlan={sitePlan}
          siteAvailable={siteAvailable}
          missions={nearMissions}
          tab={tab}
          setTab={setTab}
          solarStorm={solarStorm}
          setSolarStorm={setSolarStorm}
          onMilestone={onMilestone}
          onEnterSite={enterSite}
          onBack={back}
        />
      )}

      <Credits view={view} />

      <Loader />
    </div>
  )
}
