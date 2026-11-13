import { describe, expect, it } from 'vitest'
import { bakeGround, type GroundInput } from './groundBake'

const g = 32
const S = 64
const input = (seed: number): GroundInput => ({
  size: S,
  sizeM: 20_000,
  heights: new Float32Array(g * g).map((_, i) => Math.sin(i / 40) * 400 + (i % g) * 3),
  grid: g,
  base: new Uint8ClampedArray(S * S * 4).fill(150),
  seed,
  ex: 3,
})

describe('bakeGround', () => {
  it('returns opaque colour and normal maps of the requested size', () => {
    const out = bakeGround(input(1))
    expect(out.albedo).toHaveLength(S * S * 4)
    expect(out.normal).toHaveLength(S * S * 4)
    for (let i = 3; i < out.albedo.length; i += 4) expect(out.albedo[i]).toBe(255)
  })

  it('is deterministic: the same spot always gets the same craters', () => {
    expect(bakeGround(input(7)).albedo).toEqual(bakeGround(input(7)).albedo)
    expect(bakeGround(input(7)).albedo).not.toEqual(bakeGround(input(8)).albedo)
  })
})
