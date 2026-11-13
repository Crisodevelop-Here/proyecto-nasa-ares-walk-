import { describe, expect, it } from 'vitest'
import { distanceKm, MISSION_BY_ID, MISSIONS, missionsNear } from './missions'
import { STATION_BY_ID, STATIONS } from './stations'

const inLat = (x: number) => x >= -90 && x <= 90
const inLon = (x: number) => x >= -180 && x <= 180

describe('mission data', () => {
  it('has unique ids and valid landing sites', () => {
    expect(new Set(MISSIONS.map((m) => m.id)).size).toBe(MISSIONS.length)
    for (const m of MISSIONS) {
      expect(inLat(m.lat) && inLon(m.lon), m.id).toBe(true)
      expect(m.color, m.id).toMatch(/^#[0-9a-f]{6}$/i)
      expect(m.link, m.id).toMatch(/^https:\/\//)
      expect(Number.isNaN(Date.parse(m.landed)), m.id).toBe(false)
      expect(MISSION_BY_ID[m.id]).toBe(m)
    }
  })

  it('tracks and milestones are on the planet and milestones go forward in time', () => {
    for (const m of MISSIONS) {
      for (const [lat, lon] of m.track) expect(inLat(lat) && inLon(lon), m.id).toBe(true)
      for (let i = 0; i < m.milestones.length; i++) {
        const s = m.milestones[i]
        expect(inLat(s.lat) && inLon(s.lon), `${m.id} sol ${s.sol}`).toBe(true)
        expect(Number.isNaN(Date.parse(s.date)), `${m.id} sol ${s.sol}`).toBe(false)
        if (i > 0) expect(s.sol, `${m.id} sol ${s.sol}`).toBeGreaterThanOrEqual(m.milestones[i - 1].sol)
      }
    }
  })

  it('raw-image links point to NASA for the given sol', () => {
    for (const m of MISSIONS) if (m.rawImages) expect(m.rawImages(100)).toMatch(/^https:\/\/mars\.nasa\.gov\/.*100/)
  })
})

describe('distanceKm', () => {
  it('is zero at the same point and symmetric', () => {
    expect(distanceKm(-4.6, 137.4, -4.6, 137.4)).toBe(0)
    expect(distanceKm(0, 0, 10, 20)).toBeCloseTo(distanceKm(10, 20, 0, 0))
  })
  it('one degree along the equator is about 59 km on Mars', () => {
    expect(distanceKm(0, 0, 0, 1)).toBeCloseTo(59.16, 1)
  })
})

describe('missionsNear', () => {
  it('finds Curiosity from Gale crater, nearest first', () => {
    const near = missionsNear(-4.6, 137.4, 50)
    expect(near[0]?.m.id).toBe('curiosity')
    for (let i = 1; i < near.length; i++) expect(near[i].d).toBeGreaterThanOrEqual(near[i - 1].d)
  })
})

describe('EVA stations', () => {
  it('sit inside the HiRISE crop with unique ids', () => {
    expect(new Set(STATIONS.map((s) => s.id)).size).toBe(STATIONS.length)
    for (const s of STATIONS) {
      expect(s.u >= 0 && s.u <= 1 && s.v >= 0 && s.v <= 1, s.id).toBe(true)
      expect(STATION_BY_ID[s.id]).toBe(s)
    }
    expect(STATION_BY_ID.hab?.kind).toBe('habitat')
  })
})
