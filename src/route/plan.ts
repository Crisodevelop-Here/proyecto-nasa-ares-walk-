import { t as say, tr } from '../i18n'
import { SPE_FACTOR, SUIT, SURFACE_DOSE_MSV_PER_DAY } from '../data/environment'
import { cellToUV, heightAt, uvToCell, type Terrain } from '../terrain/terrain'
import type { Leg, RoutePlan, RoutePoint, Station, UV } from '../types'
import { astar, smoothPath, suitSpeed, type Grid } from './astar'

export interface MobilityProfile {
  vmaxKmh: number
  maxSlopeDeg: number
  cautionSlopeDeg: number
}

export interface PlanOptions {
  solarEvent?: boolean
  /** Who moves: the suited astronaut (default, EVA limits apply) or a pressurized rover. */
  profile?: MobilityProfile
  /** Dose rate override (mSv/day) for the site; defaults to the Gale RAD value. */
  doseMSvPerDay?: number
}

/** Plans habitat → stops (in order) → habitat, leg by leg with A*. */
export function planRoute(t: Terrain, habitat: Station, stops: Station[], opts: PlanOptions = {}): RoutePlan {
  const NAV = t.nav
  const profile = opts.profile ?? SUIT
  const eva = profile === SUIT
  const grid: Grid = { n: NAV, cellM: t.cellM, z: t.navZ, slope: t.navSlope, rough: t.navRough }
  const sequence = [habitat, ...stops, habitat]
  const points: RoutePoint[] = []
  const legs: Leg[] = []
  const warnings: string[] = []
  let d = 0
  let time = 0

  for (let i = 0; i < sequence.length - 1; i++) {
    const a = sequence[i]
    const b = sequence[i + 1]
    const s = uvToCell(a, NAV)
    const e = uvToCell(b, NAV)
    const res = astar(grid, s.y * NAV + s.x, e.y * NAV + e.x, profile)
    if (!res.path.length) {
      legs.push({ from: a.id, to: b.id, distanceM: 0, hours: 0, ascentM: 0, descentM: 0, maxSlope: 0, ok: false })
      warnings.push(say('No hay un camino seguro de “{a}” a “{b}”.', 'There is no safe path from “{a}” to “{b}”.', { a: tr(a.name), b: tr(b.name) }))
      continue
    }
    // Straighten the grid path, then walk it in small steps over the full-resolution relief,
    // so the drawn line hugs the ground and the numbers match what is drawn.
    const corners = smoothPath(grid, res.path, profile).map((idx) => cellToUV(idx % NAV, (idx / NAV) | 0, NAV))
    corners[0] = { u: a.u, v: a.v }
    if (corners.length > 1) corners[corners.length - 1] = { u: b.u, v: b.v }
    else corners.push({ u: b.u, v: b.v })
    const stepUV = 0.5 / NAV
    let legD = 0
    let legH = 0
    let up = 0
    let down = 0
    let maxS = 0
    let prev: UV | null = null
    let prevZ = 0
    for (let c = 0; c < corners.length - 1; c++) {
      const p = corners[c]
      const q = corners[c + 1]
      const n = Math.max(1, Math.ceil(Math.hypot(q.u - p.u, q.v - p.v) / stepUV))
      for (let k = c === 0 ? 0 : 1; k <= n; k++) {
        const uv = { u: p.u + ((q.u - p.u) * k) / n, v: p.v + ((q.v - p.v) * k) / n }
        const z = heightAt(t, uv)
        const cell = uvToCell(uv, NAV)
        const ci = cell.y * NAV + cell.x
        const slope = t.navSlope[ci]
        if (prev) {
          const step = Math.hypot(uv.u - prev.u, uv.v - prev.v) * t.meta.sizeM
          if (step > 0) {
            const dz = z - prevZ
            legH += step / 1000 / suitSpeed(dz / step, t.navRough[ci], profile.vmaxKmh)
            if (dz > 0) up += dz
            else down -= dz
          }
          legD += step
          d += step
        }
        // Stops are shared between legs: don't repeat the first point of a later leg.
        if (!(i > 0 && c === 0 && k === 0)) {
          maxS = Math.max(maxS, slope)
          points.push({ ...uv, z, d, slope, t: time + legH, leg: i })
        }
        prev = uv
        prevZ = z
      }
    }
    time += legH
    legs.push({ from: a.id, to: b.id, distanceM: legD, hours: legH, ascentM: up, descentM: down, maxSlope: maxS, ok: true })
  }

  const walkHours = time
  const workHours = stops.reduce((s, x) => s + x.workMin / 60, 0)
  const totalHours = walkHours + workHours
  // Inside a pressurized rover only the work stops use suit oxygen.
  const o2Kg = (eva ? walkHours * SUIT.o2WalkKgH : 0) + workHours * SUIT.o2RestKgH
  const doseRate = ((opts.doseMSvPerDay ?? SURFACE_DOSE_MSV_PER_DAY) / 24) * (opts.solarEvent ? SPE_FACTOR : 1)
  const doseMSv = totalHours * doseRate
  const ascentM = legs.reduce((s, l) => s + l.ascentM, 0)
  const descentM = legs.reduce((s, l) => s + l.descentM, 0)
  const maxSlope = legs.reduce((s, l) => Math.max(s, l.maxSlope), 0)

  if (eva && totalHours > SUIT.maxEvaHours)
    warnings.push(say('La EVA dura {h} h: supera el máximo de {max} h.', 'The EVA lasts {h} h: over the {max} h maximum.', { h: totalHours.toFixed(1), max: SUIT.maxEvaHours }))
  if (o2Kg > SUIT.o2CapacityKg * 0.85) warnings.push(say('El oxígeno quedaría por debajo del 15 % de reserva.', 'Oxygen would drop below the 15 % reserve.'))
  if (opts.solarEvent) warnings.push(say('Tormenta solar: la dosis se multiplica. Considera aplazar la EVA.', 'Solar storm: the dose multiplies. Consider postponing the EVA.'))
  if (maxSlope > profile.cautionSlopeDeg)
    warnings.push(
      eva
        ? say('Hay tramos de hasta {s}° de pendiente: caminar en pareja y con bastones.', 'Some stretches reach {s}° of slope: walk in pairs and use poles.', {
            s: Math.round(maxSlope),
          })
        : say(
            'Hay tramos de hasta {s}° de pendiente: conducir despacio y revisar la ruta con el equipo.',
            'Some stretches reach {s}° of slope: drive slowly and review the route with the team.',
            {
              s: Math.round(maxSlope),
            },
          ),
    )

  const feasible = legs.every((l) => l.ok) && (eva ? totalHours <= SUIT.maxEvaHours : true) && o2Kg <= SUIT.o2CapacityKg
  return {
    points,
    legs,
    distanceM: d,
    walkHours,
    workHours,
    totalHours,
    ascentM,
    descentM,
    maxSlope,
    o2Kg,
    doseMSv,
    feasible,
    warnings,
  }
}
