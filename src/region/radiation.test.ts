import { describe, expect, it } from 'vitest'
import { doseAtElevation } from '../data/environment'
import { DOSE_SCALE, radiationPixels } from './mapLayers'

describe('radiation layer', () => {
  it('scale runs from Hellas (least) to Olympus Mons (most)', () => {
    expect(DOSE_SCALE.min).toBeLessThan(doseAtElevation(-4500))
    expect(DOSE_SCALE.max).toBeGreaterThan(doseAtElevation(10_000))
  })

  it('colours high ground warmer (redder, less green) than low ground', () => {
    const g = 8
    const heights = new Float32Array(g * g)
    for (let y = 0; y < g; y++) for (let x = 0; x < g; x++) heights[y * g + x] = x < g / 2 ? -7000 : 15_000
    const S = 32
    const px = radiationPixels({ heights, grid: g, sizeM: 100_000, zMin: -7000, zMax: 15_000 }, S)
    const at = (x: number) => [px[(S / 2) * S * 4 + x * 4], px[(S / 2) * S * 4 + x * 4 + 1]]
    const [rLow, gLow] = at(2)
    const [rHigh, gHigh] = at(S - 3)
    expect(rHigh - gHigh).toBeGreaterThan(rLow - gLow)
  })
})
