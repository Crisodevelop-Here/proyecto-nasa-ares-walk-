import { describe, expect, it } from 'vitest'
import { doseAtElevation, pressureAtElevation, PRESSURE_MBAR, ROVER, SURFACE_DOSE_MSV_PER_DAY } from '../data/environment'
import { distanceKm, MISSIONS, missionsNear } from '../data/missions'
import { planRoute } from '../route/plan'
import { latLonOf, onSphere } from '../scene/mars'
import { buildTerrain } from '../terrain/terrain'
import type { Station, TerrainMeta } from '../types'
import { latLonToUV, uvToLatLon } from './regionTerrain'

describe('latLonOf', () => {
  it('inverts onSphere', () => {
    for (const [lat, lon] of [
      [-4.59, 137.44],
      [18.44, 77.45],
      [-14.57, 175.47],
      [68.2, -125.7],
      [0, -179.5],
    ]) {
      const p = latLonOf(onSphere(lat, lon, 10))
      expect(p.lat).toBeCloseTo(lat, 6)
      expect(p.lon).toBeCloseTo(lon, 6)
    }
  })
})

describe('regional patch mapping', () => {
  it('round-trips uv ↔ lat/lon, also across the antimeridian', () => {
    for (const c of [
      { lat: -5, lon: 137 },
      { lat: 40, lon: 179.8 },
    ])
      for (const uv of [
        { u: 0.1, v: 0.9 },
        { u: 0.5, v: 0.5 },
        { u: 0.95, v: 0.2 },
      ]) {
        const p = uvToLatLon(c, uv)
        const back = latLonToUV(c, p.lat, p.lon)
        expect(back.u).toBeCloseTo(uv.u, 6)
        expect(back.v).toBeCloseTo(uv.v, 6)
      }
  })
  it('north is up (v decreases)', () => {
    expect(latLonToUV({ lat: 0, lon: 0 }, 0.5, 0).v).toBeLessThan(0.5)
  })
})

describe('rover route on a regional grid', () => {
  const nav = 64
  const meta: TerrainMeta = { source: 't', site: 't', sizeM: 120_000, grid: nav * 2, zMin: 0, zMax: 1, metersPerPixel: 120_000 / (nav * 2), nw: [0, 0], se: [0, 0] }
  const st = (id: string, u: number, v: number): Station => ({ id, name: id, kind: id === 'hab' ? 'habitat' : 'science', emoji: '', u, v, goal: '', why: '', tools: [], workMin: 30 })

  it('uses a non-default nav size', () => {
    const t = buildTerrain(meta, new Float32Array(meta.grid * meta.grid), nav)
    expect(t.nav).toBe(nav)
    expect(t.navZ.length).toBe(nav * nav)
  })

  it('plans with the rover profile without EVA duration limits', () => {
    const t = buildTerrain(meta, new Float32Array(meta.grid * meta.grid), nav)
    const plan = planRoute(t, st('hab', 0.5, 0.5), [st('a', 0.9, 0.5), st('b', 0.5, 0.1)], { profile: ROVER })
    expect(plan.legs.every((l) => l.ok)).toBe(true)
    // ~40 + 57 + 40 km on flat ground at 10 km/h → well over the 7 h EVA limit, but feasible in a rover.
    expect(plan.distanceM / 1000).toBeGreaterThan(120)
    expect(plan.walkHours).toBeGreaterThan(7)
    expect(plan.feasible).toBe(true)
  })
})

describe('environment estimates', () => {
  it('match RAD and REMS at Gale', () => {
    expect(doseAtElevation(-4500)).toBeCloseTo(SURFACE_DOSE_MSV_PER_DAY, 6)
    expect(pressureAtElevation(-4500)).toBeCloseTo(PRESSURE_MBAR, 6)
  })
  it('high ground gets less atmosphere and more radiation', () => {
    expect(pressureAtElevation(20_000)).toBeLessThan(2)
    expect(doseAtElevation(20_000)).toBeGreaterThan(doseAtElevation(-4500))
    expect(doseAtElevation(-4500, true)).toBeGreaterThan(10)
  })
})

describe('missions', () => {
  it('have valid coordinates and milestones in order', () => {
    for (const m of MISSIONS) {
      for (const [lat, lon] of [[m.lat, m.lon], ...m.track, ...m.milestones.map((s) => [s.lat, s.lon] as [number, number])]) {
        expect(Math.abs(lat)).toBeLessThanOrEqual(90)
        expect(Math.abs(lon)).toBeLessThanOrEqual(180)
      }
      const sols = m.milestones.map((s) => s.sol)
      expect([...sols].sort((a, b) => a - b)).toEqual(sols)
      // Track stays near the landing site (rovers drive tens of km, not hundreds).
      for (const [lat, lon] of m.track) expect(distanceKm(m.lat, m.lon, lat, lon)).toBeLessThan(60)
    }
  })
  it('finds Curiosity from a click on Gale', () => {
    expect(missionsNear(-5.4, 137.8, 250)[0].m.id).toBe('curiosity')
  })
})
