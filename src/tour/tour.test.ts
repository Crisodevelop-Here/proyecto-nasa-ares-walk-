import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { STATION_BY_ID } from '../data/stations'
import { planRoute } from '../route/plan'
import { buildTerrain } from '../terrain/terrain'
import type { TerrainMeta } from '../types'
import { arrivalCode, arrivals, pointIndexAt, profile } from './tour'

// The real HiRISE crop of Mount Sharp shipped in public/terrain.
function siteTerrain() {
  const meta = JSON.parse(readFileSync('public/terrain/meta.json', 'utf8')) as TerrainMeta
  const buf = readFileSync('public/terrain/height.bin')
  const raw = new Uint16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2)
  const h = new Float32Array(raw.length)
  for (let i = 0; i < raw.length; i++) h[i] = meta.zMin + (raw[i] / 65535) * (meta.zMax - meta.zMin)
  return buildTerrain(meta, h)
}

const stops = ['boxwork', 'contact', 'mounds'].map((id) => STATION_BY_ID[id])
const plan = planRoute(siteTerrain(), STATION_BY_ID.hab, stops)

describe('guided traverse on Mount Sharp', () => {
  it('reaches every stop in order and ends back at the base', () => {
    const a = arrivals(plan, STATION_BY_ID)
    expect(a.map((x) => x.station.id)).toEqual(['boxwork', 'contact', 'mounds', 'hab'])
    expect(a.map(arrivalCode)).toEqual(['B1', 'B2', 'B3', 'A'])
    for (let i = 1; i < a.length; i++) expect(a[i].d).toBeGreaterThan(a[i - 1].d)
    expect(a.at(-1)!.d).toBeCloseTo(plan.distanceM, -1)
  })

  it('pointIndexAt finds the route point at a distance', () => {
    const p = plan.points
    expect(pointIndexAt(plan, 0)).toBe(0)
    const mid = p[Math.floor(p.length / 2)].d
    const i = pointIndexAt(plan, mid)
    expect(p[i].d).toBeLessThanOrEqual(mid)
    expect(p[i + 1].d).toBeGreaterThanOrEqual(mid)
  })

  it('elevation profile covers the whole route within its bounds', () => {
    const pr = profile(plan, 120)
    expect(pr.d).toHaveLength(120)
    expect(pr.d[0]).toBe(0)
    expect(pr.d.at(-1)).toBeCloseTo(plan.points.at(-1)!.d)
    for (const z of pr.z) {
      expect(z).toBeGreaterThan(pr.zMin)
      expect(z).toBeLessThan(pr.zMax)
    }
  })
})
