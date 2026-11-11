import { describe, expect, it } from 'vitest'
import { SUIT } from '../data/environment'
import { buildTerrain, NAV } from '../terrain/terrain'
import type { Station, TerrainMeta } from '../types'
import { astar, segmentHours, smoothPath, suitSpeed, type Grid } from './astar'
import { planRoute } from './plan'

const flatGrid = (n: number, cellM = 10): Grid => ({
  n,
  cellM,
  z: new Float32Array(n * n),
  slope: new Float32Array(n * n),
  rough: new Float32Array(n * n),
})

describe('suitSpeed', () => {
  it('is fastest on a gentle downhill and slower uphill', () => {
    expect(suitSpeed(-0.05, 0, 3.6)).toBeCloseTo(3.6)
    expect(suitSpeed(0.2, 0, 3.6)).toBeLessThan(suitSpeed(0, 0, 3.6))
  })
  it('roughness slows the walk', () => {
    expect(suitSpeed(0, 0.6, 3.6)).toBeCloseTo(suitSpeed(0, 0, 3.6) / 2)
  })
})

describe('astar', () => {
  it('walks straight on flat ground', () => {
    const g = flatGrid(20)
    const r = astar(g, 0, 19, SUIT)
    expect(r.path[0]).toBe(0)
    expect(r.path.at(-1)).toBe(19)
    expect(r.path).toHaveLength(20)
  })

  it('goes around a steep wall instead of through it', () => {
    const n = 20
    const g = flatGrid(n)
    // Vertical wall at x = 10, open only at the bottom row
    for (let y = 0; y < n - 1; y++) g.slope[y * n + 10] = 40
    const r = astar(g, 5 * n + 2, 5 * n + 17, SUIT)
    expect(r.path.length).toBeGreaterThan(0)
    expect(r.path.every((i) => g.slope[i] <= SUIT.maxSlopeDeg)).toBe(true)
    expect(r.path.some((i) => ((i / n) | 0) === n - 1)).toBe(true)
  })

  it('reports unreachable goals', () => {
    const n = 10
    const g = flatGrid(n)
    for (let y = 0; y < n; y++) g.slope[y * n + 5] = 40
    expect(astar(g, 0, 9, SUIT).path).toHaveLength(0)
  })
})

describe('smoothPath', () => {
  it('turns a grid zig-zag into one straight segment on flat ground', () => {
    const n = 30
    const g = flatGrid(n)
    const r = astar(g, 0, 7 * n + 25, SUIT)
    const s = smoothPath(g, r.path, SUIT)
    expect(s).toEqual([0, 7 * n + 25])
  })
  it('never cuts across a steep wall', () => {
    const n = 20
    const g = flatGrid(n)
    for (let y = 0; y < n - 1; y++) g.slope[y * n + 10] = 40
    const r = astar(g, 5 * n + 2, 5 * n + 17, SUIT)
    const s = smoothPath(g, r.path, SUIT)
    expect(s.length).toBeGreaterThan(2)
    for (let k = 1; k < s.length; k++) expect(segmentHours(g, s[k - 1], s[k], SUIT)).toBeLessThan(Infinity)
  })
})

describe('planRoute', () => {
  const meta: TerrainMeta = {
    source: 'test',
    site: 'test',
    sizeM: 2048,
    grid: NAV * 2,
    zMin: 0,
    zMax: 100,
    metersPerPixel: 4,
    nw: [0, 0],
    se: [0, 0],
  }
  const t = buildTerrain(meta, new Float32Array(meta.grid * meta.grid))
  const st = (id: string, u: number, v: number, workMin = 30): Station => ({
    id,
    name: id,
    kind: id === 'hab' ? 'habitat' : 'science',
    emoji: '',
    u,
    v,
    goal: '',
    why: '',
    tools: [],
    workMin,
  })

  it('makes a closed loop and adds up the EVA', () => {
    const plan = planRoute(t, st('hab', 0.1, 0.1, 0), [st('a', 0.5, 0.1), st('b', 0.5, 0.5)])
    expect(plan.legs).toHaveLength(3)
    expect(plan.legs.every((l) => l.ok)).toBe(true)
    // ~0.4 + 0.4 + 0.566 of 2048 m
    expect(plan.distanceM).toBeGreaterThan(2600)
    expect(plan.distanceM).toBeLessThan(3000)
    expect(plan.workHours).toBeCloseTo(1)
    expect(plan.o2Kg).toBeGreaterThan(0)
    expect(plan.feasible).toBe(true)
  })

  it('a solar storm multiplies the dose and warns', () => {
    const calm = planRoute(t, st('hab', 0.1, 0.1, 0), [st('a', 0.3, 0.3)])
    const storm = planRoute(t, st('hab', 0.1, 0.1, 0), [st('a', 0.3, 0.3)], { solarEvent: true })
    expect(storm.doseMSv).toBeGreaterThan(calm.doseMSv * 10)
    expect(storm.warnings.join(' ')).toMatch(/Tormenta solar/)
  })
})
