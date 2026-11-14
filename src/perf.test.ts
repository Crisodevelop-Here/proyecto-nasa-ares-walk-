import { describe, expect, it } from 'vitest'
import { detectLite } from './perf'

describe('light mode detection', () => {
  it('turns on for 4 GB of RAM or less', () => {
    expect(detectLite('', { deviceMemory: 4, hardwareConcurrency: 4 })).toBe(true)
    expect(detectLite('', { deviceMemory: 2 })).toBe(true)
    expect(detectLite('', { deviceMemory: 8, hardwareConcurrency: 8 })).toBe(false)
  })

  it('turns on for 2 cores or fewer', () => {
    expect(detectLite('', { deviceMemory: 8, hardwareConcurrency: 2 })).toBe(true)
  })

  it('stays off when the browser does not say (Firefox, Safari)', () => {
    expect(detectLite('', {})).toBe(false)
    expect(detectLite('', undefined)).toBe(false)
  })

  it('obeys ?lite and ?full over the detection', () => {
    expect(detectLite('?lite', { deviceMemory: 8 })).toBe(true)
    expect(detectLite('?full', { deviceMemory: 2 })).toBe(false)
  })
})
