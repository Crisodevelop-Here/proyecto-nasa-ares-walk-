import { describe, expect, it } from 'vitest'
import { airTempC, doseAtElevation, pressureAtElevation, PRESSURE_MBAR, SPE_FACTOR, sunDirection, SURFACE_DOSE_MSV_PER_DAY, tempRange } from './environment'

describe('environment model', () => {
  it('is anchored to Curiosity (RAD, REMS) at Gale, about −4.5 km', () => {
    expect(pressureAtElevation(-4500)).toBeCloseTo(PRESSURE_MBAR)
    expect(doseAtElevation(-4500)).toBeCloseTo(SURFACE_DOSE_MSV_PER_DAY, 2)
  })

  it('high ground has thinner air and more radiation', () => {
    expect(pressureAtElevation(10_000)).toBeLessThan(pressureAtElevation(-4500))
    expect(doseAtElevation(10_000)).toBeGreaterThan(doseAtElevation(-4500))
    expect(doseAtElevation(-8000)).toBeLessThan(doseAtElevation(-4500))
  })

  it('a solar storm multiplies the dose', () => {
    expect(doseAtElevation(0, true)).toBeCloseTo(doseAtElevation(0) * SPE_FACTOR)
  })

  it('air is warmest in the early afternoon and coldest before dawn', () => {
    expect(airTempC(14)).toBe(-5)
    expect(airTempC(2)).toBe(-75)
    for (let h = 0; h < 24; h++) {
      expect(airTempC(h)).toBeGreaterThanOrEqual(-75)
      expect(airTempC(h)).toBeLessThanOrEqual(-5)
    }
  })

  it('the Sun is up at noon and below the horizon at midnight', () => {
    expect(sunDirection(12).elevationDeg).toBeGreaterThan(80)
    expect(sunDirection(0).elevationDeg).toBeLessThan(0)
    const s = sunDirection(9)
    expect(Math.hypot(s.x, s.y, s.z)).toBeCloseTo(1)
  })

  it('polar latitudes are colder than the equator', () => {
    const eq = tempRange(0)
    const pole = tempRange(80)
    expect(pole.max).toBeLessThan(eq.max)
    expect(pole.min).toBeLessThan(eq.min)
    expect(eq.min).toBeLessThan(eq.max)
  })
})
