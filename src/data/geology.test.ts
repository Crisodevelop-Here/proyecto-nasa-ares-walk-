import { describe, expect, it } from 'vitest'
import { plainUnit } from './geology'

// All 39 unit names on the USGS SIM 3292 map, as the Mars Trek service returns them.
const UNITS = [
  'Amazonian and Hesperian impact unit',
  'Amazonian and Hesperian transition undivided unit',
  'Amazonian and Hesperian volcanic',
  'Amazonian and Noachian apron unit',
  'Amazonian apron unit',
  'Amazonian polar unit',
  'Amazonian polar undivided unit',
  'Amazonian volcanic edifice',
  'Hesperian and Noachian basin unit',
  'Hesperian and Noachian highland undivided unit',
  'Hesperian and Noachian transition unit',
  'Hesperian polar unit',
  'Hesperian polar edifice unit',
  'Hesperian transition unit',
  'Hesperian transition outflow unit',
  'Hesperian transition undivided unit',
  'Hesperian volcanic edifice unit',
  'Noachian highland edifice unit',
  'Noachian highland undivided unit',
  'Noachian volcanic edifice unit',
  'Early Amazonian basin unit',
  'Early Hesperian basin unit',
  'Early Hesperian highland unit',
  'Early Hesperian transition unit',
  'Early Hesperian volcanic unit',
  'Early Noachian highland unit',
  'Early Noachian highland massif unit',
  'Late Amazonian apron unit',
  'Late Amazonian polar cap unit',
  'Late Amazonian volcanic unit',
  'Late Amazonian volcanic field unit',
  'Late Hesperian basin unit',
  'Late Hesperian transition unit',
  'Late Hesperian volcanic unit',
  'Late Hesperian volcanic field unit',
  'Late Noachian highland unit',
  'Late Noachian volcanic unit',
  'Middle Noachian highland unit',
  'Middle Noachian highland massif unit',
]

describe('geologic units in plain words', () => {
  it('explains every unit on the map in both languages', () => {
    for (const name of UNITS)
      for (const lang of ['es', 'en'] as const) {
        const p = plainUnit(name, lang)
        expect(p.kind, name).not.toBe(name)
        expect(p.period, name).not.toBe('')
        expect(p.age, name).not.toBe('')
      }
  })

  it('reads the period and its stage', () => {
    const p = plainUnit('Late Hesperian volcanic unit', 'es')
    expect(p.kind).toBe('Lava de volcanes')
    expect(p.period).toBe('Hespérico tardío')
    expect(p.age).toBe('entre 3.700 y 3.000 millones de años')
    expect(plainUnit('Late Hesperian volcanic unit', 'en').period).toBe('Late Hesperian')
  })

  it('gives mixed units their full age range, oldest first', () => {
    const p = plainUnit('Amazonian and Noachian apron unit', 'es')
    expect(p.age).toBe('de distintas edades, desde el Noeico hasta el Amazónico')
    expect(p.story).toBe('')
  })

  it('tells volcanoes, caps and flood channels apart from plain lava, polar ground and transitions', () => {
    expect(plainUnit('Amazonian volcanic edifice', 'es').kind).toBe('Volcán')
    expect(plainUnit('Late Amazonian polar cap unit', 'es').kind).toBe('Casquete polar de hielo')
    expect(plainUnit('Hesperian transition outflow unit', 'en').kind).toBe('Channel carved by a huge flood')
  })
})
