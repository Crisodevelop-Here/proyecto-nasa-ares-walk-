import * as THREE from 'three'
import { heightAt, type Terrain } from '../terrain/terrain'
import type { RoutePoint, UV } from '../types'

/** World units per metre (1 unit = 10 m) keeps the 2 km site at ~200 units. */
export const K = 0.1

export function toWorld(t: Terrain, p: UV, ex: number, lift = 0, out = new THREE.Vector3()) {
  const s = t.meta.sizeM * K
  return out.set((p.u - 0.5) * s, (heightAt(t, p) - t.meta.zMin) * K * ex + lift, (p.v - 0.5) * s)
}

export function toUV(t: Terrain, x: number, z: number): UV {
  const s = t.meta.sizeM * K
  return { u: x / s + 0.5, v: z / s + 0.5 }
}

/** Point at distance `d` (m) along the route, interpolated. */
export function pointAtDistance(points: RoutePoint[], d: number): { uv: UV; i: number } {
  if (!points.length) return { uv: { u: 0.5, v: 0.5 }, i: 0 }
  if (d <= 0) return { uv: points[0], i: 0 }
  const last = points[points.length - 1]
  if (d >= last.d) return { uv: last, i: points.length - 1 }
  let lo = 0
  let hi = points.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (points[mid].d < d) lo = mid
    else hi = mid
  }
  const a = points[lo]
  const b = points[hi]
  const f = (d - a.d) / (b.d - a.d || 1)
  return { uv: { u: a.u + (b.u - a.u) * f, v: a.v + (b.v - a.v) * f }, i: lo }
}
