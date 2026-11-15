import { describe, expect, it } from 'vitest'
import { gaitPose, MARS_G, mixPose, STAND, strideHz } from './gait'

describe('Mars suited gait', () => {
  it('steps slower than on Earth: pendulum scaling with √g', () => {
    expect(strideHz('walk')).toBeCloseTo(0.9 * Math.sqrt(MARS_G), 6)
    expect(strideHz('walk')).toBeLessThan(0.6)
    expect(strideHz('lope')).toBeGreaterThan(strideHz('walk'))
  })

  it('the suit limits the joints well below unsuited Earth walking', () => {
    let hip = 0
    let knee = 0
    let arm = 0
    for (let p = 0; p < 1; p += 0.01) {
      const g = gaitPose(p, 'walk')
      hip = Math.max(hip, Math.abs(g.hipL))
      knee = Math.max(knee, g.kneeL, g.kneeR)
      arm = Math.max(arm, Math.abs(g.armL - 0.05))
    }
    expect(hip).toBeLessThan(0.5)
    expect(knee).toBeLessThan(1)
    expect(arm).toBeLessThan(0.35)
  })

  it('legs alternate and the lope has a bigger float than the walk', () => {
    const g = gaitPose(0.25, 'walk')
    expect(g.hipL).toBeCloseTo(-g.hipR)
    const peak = (k: 'walk' | 'lope') => Math.max(...Array.from({ length: 100 }, (_, i) => gaitPose(i / 100, k).lift))
    expect(peak('lope')).toBeGreaterThan(peak('walk') * 2)
  })

  it('blends back to standing', () => {
    expect(mixPose(STAND, gaitPose(0.3, 'walk'), 0)).toEqual(STAND)
  })
})
