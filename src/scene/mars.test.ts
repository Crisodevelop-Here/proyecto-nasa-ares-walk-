import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { formatLatLon, latLonOf, onSphere, R, smoothstep, topDownQuat, wrapLon } from './mars'

describe('globe geometry', () => {
  it('lat/lon → sphere → lat/lon round-trips', () => {
    for (const [lat, lon] of [
      [0, 0],
      [-4.6, 137.4],
      [18.4, 77.5],
      [-60, -170],
      [45, 179],
    ]) {
      const v = onSphere(lat, lon)
      expect(v.length()).toBeCloseTo(R)
      const back = latLonOf(v)
      expect(back.lat).toBeCloseTo(lat)
      expect(back.lon).toBeCloseTo(lon)
    }
  })

  it('topDownQuat puts the chosen spot on top of the world (+y)', () => {
    const q = topDownQuat(-4.6, 137.4)
    const top = onSphere(-4.6, 137.4, 1).applyQuaternion(q)
    expect(top.distanceTo(new THREE.Vector3(0, 1, 0))).toBeLessThan(1e-6)
  })

  it('wrapLon keeps longitudes in −180..180', () => {
    expect(wrapLon(190)).toBeCloseTo(-170)
    expect(wrapLon(-190)).toBeCloseTo(170)
    expect(wrapLon(540)).toBeCloseTo(-180)
    expect(wrapLon(45)).toBeCloseTo(45)
  })

  it('formats coordinates with hemispheres', () => {
    expect(formatLatLon(-4.71, 137.41)).toMatch(/S.*E$/)
    expect(formatLatLon(23.03, -47.86)).toMatch(/N.*O$/)
  })

  it('smoothstep is clamped to 0..1', () => {
    expect(smoothstep(0, 1, -5)).toBe(0)
    expect(smoothstep(0, 1, 5)).toBe(1)
    expect(smoothstep(0, 1, 0.5)).toBeCloseTo(0.5)
  })
})
