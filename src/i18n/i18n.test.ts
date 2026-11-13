import { afterEach, describe, expect, it } from 'vitest'
import { MISSIONS } from '../data/missions'
import { STATIONS } from '../data/stations'
import { SLOPE_CLASSES, REGION_LAYERS } from '../region/regionLayers'
import { LAYERS } from '../scene/SiteTerrain'
import { PLACES } from '../scene/mars'
import { TOUR_CAMERAS } from '../tour/tour'
import { DATA_EN } from './data.en'
import { getLang, setLang, t, tr } from '.'

const CODE_STRINGS = [
  'Base / rover presurizado',
  'Punto de salida y regreso de la travesía.',
  'Rover presurizado',
  'Recarga de O₂ y baterías',
  'Taladro de núcleos',
  'Espectrómetro de mano',
  'Cámara estéreo',
  'Martillo de roca',
  'Fobos',
  '27 km (dibujada ×14) · a 6.000 km de la superficie',
  '15 km (dibujada ×14) · 30 h por vuelta',
]

// Text that reads as Spanish (accents or common Spanish words) must have an English entry.
// Proper names such as "Yellowknife Bay · John Klein" or "Pahrump Hills" don't match and stay as is.
const looksSpanish = (s: string) => /[áéíóúñ¿¡]|\b(de|del|la|el|los|las|en|y|con|por|para|una?|que|se)\b/i.test(s)

function dataStrings() {
  const out = new Set<string>()
  const add = (s?: string) => s && out.add(s)
  for (const m of MISSIONS) {
    add(m.site)
    add(m.summary)
    for (const s of m.milestones) {
      add(s.title)
      add(s.what)
      add(s.finding)
      s.instruments?.forEach(add)
    }
  }
  for (const s of STATIONS) [s.name, s.goal, s.why, ...s.tools].forEach(add)
  for (const p of PLACES) [p.name, p.note].forEach(add)
  for (const c of SLOPE_CLASSES) add(c.meaning)
  for (const l of [...REGION_LAYERS, ...LAYERS, ...TOUR_CAMERAS]) add(l.label)
  // Fixed texts used in code through tr(): the regional base camp, mission-stop tools, the moons.
  for (const s of CODE_STRINGS) add(s)
  return [...out]
}

describe('English translation', () => {
  afterEach(() => setLang('es'))

  it('covers every Spanish line in the data files', () => {
    const missing = dataStrings().filter((s) => looksSpanish(s) && !DATA_EN[s])
    expect(missing).toEqual([])
  })

  it('has no stale entries that no longer exist in the data', () => {
    const used = new Set(dataStrings())
    expect(Object.keys(DATA_EN).filter((k) => !used.has(k))).toEqual([])
  })

  it('switches language and fills placeholders', () => {
    expect(getLang()).toBe('es')
    expect(t('Hola {n}', 'Hello {n}', { n: 3 })).toBe('Hola 3')
    expect(tr('Cráter Gale')).toBe('Cráter Gale')
    setLang('en')
    expect(t('Hola {n}', 'Hello {n}', { n: 3 })).toBe('Hello 3')
    expect(tr('Cráter Gale')).toBe('Gale crater')
    expect(tr('Pahrump Hills')).toBe('Pahrump Hills')
  })
})
