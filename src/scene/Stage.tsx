import { OrbitControls } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Suspense, useEffect, useMemo, useRef, type ReactNode, type RefObject } from 'react'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { MISSIONS, type Mission } from '../data/missions'
import type { Terrain } from '../terrain/terrain'
import type { TourState } from '../tour/tour'
import type { RoutePlan } from '../types'
import { MarsGlobe, StarField, type View } from './MarsGlobe'
import { Moons } from './Moons'
import { ease, onSphere, R, SITE, topDownQuat } from './mars'
import { SiteTerrain, type SiteLayer } from './SiteTerrain'

const Y = new THREE.Vector3(0, 1, 0)
/** Mars' axial tilt (25.19°): the globe spins about its real, leaning axis. */
const TILT = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), (-25.19 * Math.PI) / 180)
/** Spin speed on the globe (rad/s): one turn in about 100 s. */
const SPIN_SPEED = 0.063
const SUN = new THREE.Vector3(0.78, 0.48, 0.4).normalize()

interface Rig {
  dir: [number, number, number]
  dist: number
  minDist: number
  maxDist: number
  maxPolar?: number
  sec: number
}

const RIGS: Record<View, Rig> = {
  globe: { dir: [0, 0.12, 1], dist: 34, minDist: 13, maxDist: 70, sec: 3 },
  region: { dir: [0.25, 0.85, 0.55], dist: 0.42, minDist: 0.03, maxDist: 2.5, maxPolar: 1.38, sec: 4.5 },
  site: { dir: [0.35, 0.55, 0.85], dist: 0.0095, minDist: 0.003, maxDist: 0.05, maxPolar: 1.35, sec: 5 },
}

/** A camera move: bump `key` to fly. `target`/`dist` override the view's default (e.g. a milestone). */
export interface Shot {
  key: number
  target?: THREE.Vector3
  dist?: number
}

interface DirectorProps {
  view: View
  focus: { lat: number; lon: number } | null
  shot: Shot
  siteY: number
  regionY: number
  /** Width of the regional patch in scene units (the camera frames it). */
  regionSpan: number
  planet: RefObject<THREE.Group | null>
  labels: RefObject<Record<string, HTMLElement | null>>
  /** Guided traverse: while active, the traveller drives the camera. */
  tour: RefObject<TourState>
  /** True while the pointer is over the globe: the spin pauses so clicks land where aimed. */
  hovering: RefObject<boolean>
}

interface Flight {
  t0: number
  dur: number
  fromTarget: THREE.Vector3
  fromDir: THREE.Vector3
  fromDist: number
  fromQ: THREE.Quaternion
}

function Director({ view, focus, shot, siteY, regionY, regionSpan, planet, labels, hovering, tour }: DirectorProps) {
  const { camera, size } = useThree()
  const controls = useRef<OrbitControlsImpl>(null)
  const flight = useRef<Flight | null>(null)
  const spin = useRef(-0.6)
  const spinRate = useRef(SPIN_SPEED)
  const first = useRef(true)
  const tmp = useMemo(() => new THREE.Vector3(), [])
  const q = useMemo(() => new THREE.Quaternion(), [])
  const rig = view === 'region' ? { ...RIGS.region, dist: regionSpan * 1.25, minDist: regionSpan * 0.06 } : RIGS[view]

  const targetOf = (): THREE.Vector3 => {
    if (shot.target) return shot.target
    if (view === 'globe') return new THREE.Vector3()
    return new THREE.Vector3(0, view === 'site' ? siteY : regionY, 0)
  }
  const focusQ = useMemo(() => {
    if (view === 'site') return topDownQuat(SITE.lat, SITE.lon)
    if (view === 'region' && focus) return topDownQuat(focus.lat, focus.lon)
    return null
  }, [view, focus])

  useEffect(() => {
    const c = controls.current
    const target = c ? c.target.clone() : new THREE.Vector3()
    const off = camera.position.clone().sub(target)
    if (first.current) {
      first.current = false
      camera.position.copy(new THREE.Vector3(...rig.dir).normalize().multiplyScalar(rig.dist))
      camera.lookAt(0, 0, 0)
      return
    }
    flight.current = {
      t0: performance.now(),
      dur: (shot.target ? 2 : rig.sec) * 1000,
      fromTarget: target,
      fromDir: off.clone().normalize(),
      fromDist: off.length(),
      fromQ: planet.current ? planet.current.quaternion.clone() : new THREE.Quaternion(),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shot.key])

  useFrame((_, dt) => {
    // Ease the spin down while the pointer is on the planet (so clicks land) and back up after.
    // Stops almost at once under the pointer (so the click lands where the readout says), restarts gently.
    const spinning = view === 'globe' && !hovering.current
    spinRate.current = THREE.MathUtils.damp(spinRate.current, spinning ? SPIN_SPEED : 0, spinning ? 1.5 : 14, dt)
    spin.current += dt * spinRate.current
    const goalQ = focusQ ?? q.copy(TILT).multiply(new THREE.Quaternion().setFromAxisAngle(Y, spin.current))
    const c = controls.current
    const f = flight.current

    if (tour.current?.active) {
      planet.current?.quaternion.copy(goalQ)
      flight.current = null
      if (c) {
        c.enabled = false
        c.target.copy(tour.current.look)
      }
      return
    }
    if (c && !c.enabled) c.enabled = true

    if (f) {
      const raw = Math.min(1, (performance.now() - f.t0) / f.dur)
      const e = ease(raw)
      planet.current?.quaternion.slerpQuaternions(f.fromQ, goalQ, ease(Math.min(1, raw / 0.7)))
      // Diving in, the look-at point reaches the surface early; flying out, it leaves it late.
      // Otherwise the camera, placed relative to a target inside the planet, crosses the globe.
      const diving = f.fromTarget.lengthSq() < 1
      const te = diving ? ease(Math.min(1, raw / 0.35)) : ease(Math.max(0, (raw - 0.45) / 0.55))
      const target = f.fromTarget.clone().lerp(targetOf(), te)
      // Going back out to the globe keeps the current viewing direction.
      const toDir = view === 'globe' ? f.fromDir.clone() : new THREE.Vector3(...rig.dir).normalize()
      const dir = f.fromDir.clone().applyQuaternion(new THREE.Quaternion().slerp(new THREE.Quaternion().setFromUnitVectors(f.fromDir, toDir), e))
      // Log-space distance: a constant-feeling dive across five orders of magnitude.
      const goalDist = shot.dist ?? (view === 'globe' ? Math.max(rig.dist, f.fromDist) : rig.dist)
      const dist = Math.exp(Math.log(f.fromDist) + (Math.log(goalDist) - Math.log(f.fromDist)) * e)
      camera.position.copy(target).addScaledVector(dir, dist)
      // Safety: never inside the planet while flying.
      const minR = R + Math.min(dist, 0.5) * 0.5
      if (raw < 1 && camera.position.length() < minR) camera.position.setLength(minR)
      camera.lookAt(target)
      if (c) c.target.copy(target)
      if (raw >= 1) flight.current = null
    } else {
      planet.current?.quaternion.copy(goalQ)
      // If the target moves after the flight (e.g. the terrain finished loading), follow it.
      if (c) {
        const goal = targetOf()
        const delta = goal.clone().sub(c.target)
        if (delta.lengthSq() > 1e-14) {
          const k = 1 - Math.exp(-6 * dt)
          c.target.addScaledVector(delta, k)
          camera.position.addScaledVector(delta, k)
        }
      }
    }

    if (c) {
      c.enabled = !flight.current
      c.minDistance = shot.dist ? Math.min(rig.minDist, shot.dist * 0.5) : rig.minDist
      c.maxDistance = rig.maxDist
      c.maxPolarAngle = rig.maxPolar ?? Math.PI
      c.rotateSpeed = view === 'globe' ? 0.5 : 0.35
      c.zoomSpeed = 0.6
    }

    // Mission labels on the globe, projected from the rotating planet.
    const p = planet.current
    if (!p) return
    for (const m of MISSIONS) {
      const el = labels.current?.[m.id]
      if (!el) continue
      onSphere(m.lat, m.lon, R * 1.03, tmp)
      p.localToWorld(tmp)
      const facing = tmp.clone().normalize().dot(camera.position.clone().sub(tmp).normalize()) > 0.15
      tmp.project(camera)
      el.style.transform = `translate(${((tmp.x + 1) / 2) * size.width}px, ${((1 - tmp.y) / 2) * size.height}px)`
      el.style.opacity = facing && view === 'globe' && !flight.current ? '1' : '0'
    }
  })

  return <OrbitControls ref={controls} makeDefault enablePan={false} enableDamping dampingFactor={0.08} />
}

interface StageProps {
  view: View
  focus: { lat: number; lon: number } | null
  shot: Shot
  siteTerrain: Terrain | null
  sitePlan: RoutePlan | null
  siteY: number
  siteLayer: SiteLayer
  touring?: boolean
  regionY: number
  regionSpan: number
  labels: RefObject<Record<string, HTMLElement | null>>
  tour: RefObject<TourState>
  onPick: (lat: number, lon: number, mission?: Mission) => void
  onHover: (p: { lat: number; lon: number } | null) => void
  /** Regional terrain (rendered by the caller so it can own its state). */
  children?: ReactNode
}

export function Stage({ view, focus, shot, siteTerrain, sitePlan, siteY, siteLayer, touring, regionY, regionSpan, labels, tour, onPick, onHover, children }: StageProps) {
  const planet = useRef<THREE.Group>(null)
  const hovering = useRef(false)
  const hover = (p: { lat: number; lon: number } | null) => {
    hovering.current = !!p
    onHover(p)
  }
  return (
    <Canvas
      camera={{ position: [0, 4, 36], fov: 38, near: 1e-6, far: 4000 }}
      dpr={[1, 2]}
      gl={{ logarithmicDepthBuffer: true, antialias: true }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping
        gl.toneMappingExposure = 1.1
      }}
    >
      <color attach="background" args={['#03040a']} />
      <ambientLight intensity={0.18} color="#c9d4ff" />
      <directionalLight position={SUN.clone().multiplyScalar(100)} intensity={3.2} color="#fff1e0" />
      <hemisphereLight args={['#ffd9b8', '#1a1020', 0.25]} />
      <StarField />
      <Suspense fallback={null}>
        <MarsGlobe ref={planet} view={view} onPick={onPick} onHover={hover} />
        {/* Phobos and Deimos orbit in Mars' equatorial plane (tilted with the planet's axis). */}
        <group quaternion={TILT}>
          <Moons view={view} />
        </group>
        {siteTerrain && <SiteTerrain terrain={siteTerrain} plan={sitePlan} layer={siteLayer} active={view === 'site'} siteY={siteY} touring={touring} />}
        {children}
      </Suspense>
      <Director view={view} focus={focus} shot={shot} siteY={siteY} regionY={regionY} regionSpan={regionSpan} planet={planet} labels={labels} hovering={hovering} tour={tour} />
    </Canvas>
  )
}
