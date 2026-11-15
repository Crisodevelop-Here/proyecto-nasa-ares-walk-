import * as THREE from 'three'
import type { RoutePlan, Station } from '../types'

/** Live state of a guided traverse, shared by the scene (writes every frame) and the HUD. */
export interface TourState {
  active: boolean
  playing: boolean
  /** Distance travelled along the route (m). */
  d: number
  /** Playback multiplier (1 = the rover's whole route in about TOUR_SECONDS). */
  speed: number
  camera: TourCamera
  /** Rover traverse: show a suited astronaut walking the route instead of the rover. */
  astronaut: boolean
  /** Seconds left of the pause at the stop just reached. */
  hold: number
  /** Index into `arrivals` of the next stop to reach. */
  next: number
  /** Where the camera looks (world), so the orbit controls can take over smoothly on exit. */
  look: THREE.Vector3
}

export type TourCamera = 'chase' | 'pov' | 'drone'
export const TOUR_CAMERAS: { id: TourCamera; label: string }[] = [
  { id: 'chase', label: 'Seguir' },
  { id: 'pov', label: 'Cabina' },
  { id: 'drone', label: 'Dron' },
]

/** Seconds to play the whole route at ×1 (stop pauses not included). */
export const TOUR_SECONDS = 75
/** Seconds the traverse pauses at each stop. */
export const STOP_HOLD = 2.8

export const newTour = (): TourState => ({ active: false, playing: false, d: 0, speed: 1, camera: 'chase', astronaut: false, hold: 0, next: 0, look: new THREE.Vector3() })

export interface Arrival {
  /** Route distance (m) where the stop is reached. */
  d: number
  /** Mission clock (h) at arrival. */
  t: number
  station: Station
  /** 1-based position in the loop; the last arrival is the return to base. */
  n: number
  last: boolean
}

/** Stops in the order the traverse reaches them, with the distance at which each is reached. */
export function arrivals(plan: RoutePlan, stations: Record<string, Station>): Arrival[] {
  const out: Arrival[] = []
  plan.legs.forEach((leg, i) => {
    if (!leg.ok) return
    let last = -1
    for (let k = plan.points.length - 1; k >= 0; k--)
      if (plan.points[k].leg === i) {
        last = k
        break
      }
    const st = stations[leg.to]
    if (last < 0 || !st) return
    out.push({ d: plan.points[last].d, t: plan.points[last].t, station: st, n: out.length + 1, last: i === plan.legs.length - 1 })
  })
  return out
}

/** Downsampled elevation profile for the HUD: distance (m) and elevation (m). */
export function profile(plan: RoutePlan, n = 240) {
  const pts = plan.points
  if (!pts.length) return { d: [], z: [], zMin: 0, zMax: 1 }
  const total = pts[pts.length - 1].d || 1
  const d: number[] = []
  const z: number[] = []
  let k = 0
  for (let i = 0; i < n; i++) {
    const at = (total * i) / (n - 1)
    while (k < pts.length - 2 && pts[k + 1].d < at) k++
    const a = pts[k]
    const b = pts[Math.min(pts.length - 1, k + 1)]
    const f = b.d > a.d ? Math.min(1, Math.max(0, (at - a.d) / (b.d - a.d))) : 0
    d.push(at)
    z.push(a.z + (b.z - a.z) * f)
  }
  let zMin = Math.min(...z)
  let zMax = Math.max(...z)
  if (zMax - zMin < 5) zMax = zMin + 5
  const pad = (zMax - zMin) * 0.12
  zMin -= pad
  zMax += pad
  return { d, z, zMin, zMax }
}

/** Index of the route point at distance d (binary search). */
/**
 * Playback pace: mission hours of travel per second of animation. The same clock is used for the rover and
 * the astronaut, so each moves at its own real speed (the rover drives the route in TOUR_SECONDS; on foot
 * the same route takes about three times longer, and both slow down on climbs).
 */
export const tourHoursPerSecond = (reference: RoutePlan) => Math.max(1e-6, reference.walkHours) / TOUR_SECONDS

/** Ground speed on the route at distance `d`, in metres per mission hour (from the plan's timing). */
export function speedAt(plan: RoutePlan, d: number) {
  const p = plan.points
  if (p.length < 2) return 0
  const i = Math.min(p.length - 2, pointIndexAt(plan, d))
  const dt = p[i + 1].t - p[i].t
  return dt > 0 ? (p[i + 1].d - p[i].d) / dt : plan.distanceM / Math.max(1e-6, plan.walkHours)
}

export function pointIndexAt(plan: RoutePlan, d: number) {
  const p = plan.points
  let lo = 0
  let hi = p.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (p[mid].d < d) lo = mid
    else hi = mid
  }
  return lo
}

/** Point name on the traverse: the base is A, the destinations are B1, B2, B3… in visiting order. */
export const pointCode = (kind: 'habitat' | 'science', order: number) => (kind === 'habitat' ? 'A' : `B${order}`)
export const arrivalCode = (a: Arrival) => (a.last ? 'A' : `B${a.n}`)
