// USGS–NASA global geologic map of Mars: Tanaka et al. (2014), USGS Scientific Investigations Map 3292,
// as served by NASA Mars Trek (map tiles + an ArcGIS query that names the unit under a point).
// The official unit names are technical; plainUnit() explains them in everyday words.

export const GEOLOGY_LAYER = 'SIM3292_Global_Geology'
export const GEOLOGY_CAPS = `https://trek.nasa.gov/tiles/Mars/EQ/${GEOLOGY_LAYER}/1.0.0/WMTSCapabilities.xml`
const QUERY = `https://trek.nasa.gov/mars/trekarcgis/rest/services/${GEOLOGY_LAYER}/MapServer/0/query`
export const GEOLOGY_SOURCE = 'https://pubs.usgs.gov/sim/3292/'

export interface GeoUnit {
  /** Map symbol, e.g. "Htu". */
  code: string
  /** Official USGS name, e.g. "Hesperian transition undivided unit". */
  name: string
}

type Lang = 'es' | 'en'
const pick = (lang: Lang, es: string, en: string) => (lang === 'en' ? en : es)

// Period boundaries used by the map (Tanaka et al. 2014, Michael 2013 model ages), in billions of years.
const PERIODS = [
  {
    key: 'Noachian',
    es: 'Noeico',
    en: 'Noachian',
    ageEs: 'más de 3.700 millones de años',
    ageEn: 'over 3.7 billion years old',
    storyEs: 'la época más antigua, cuando corría agua líquida',
    storyEn: 'the oldest age, when liquid water flowed',
  },
  {
    key: 'Hesperian',
    es: 'Hespérico',
    en: 'Hesperian',
    ageEs: 'entre 3.700 y 3.000 millones de años',
    ageEn: '3.7 to 3.0 billion years old',
    storyEs: 'una época de volcanes y grandes inundaciones',
    storyEn: 'an age of volcanoes and huge floods',
  },
  {
    key: 'Amazonian',
    es: 'Amazónico',
    en: 'Amazonian',
    ageEs: 'menos de 3.000 millones de años',
    ageEn: 'under 3.0 billion years old',
    storyEs: 'el Marte frío y seco de hoy',
    storyEn: 'the cold, dry Mars of today',
  },
] as const

// Checked in order: the first keyword found in the official name wins.
const KINDS: { word: RegExp; es: string; en: string }[] = [
  { word: /polar cap/i, es: 'Casquete polar de hielo', en: 'Polar ice cap' },
  { word: /polar/i, es: 'Terreno polar (hielo y polvo en capas)', en: 'Polar ground (layered ice and dust)' },
  { word: /volcanic edifice/i, es: 'Volcán', en: 'Volcano' },
  { word: /volcanic field/i, es: 'Campo de pequeños volcanes', en: 'Field of small volcanoes' },
  { word: /volcanic/i, es: 'Lava de volcanes', en: 'Volcanic lava' },
  { word: /impact/i, es: 'Cráter de impacto y sus escombros', en: 'Impact crater and its debris' },
  { word: /outflow/i, es: 'Cauce de una gran inundación', en: 'Channel carved by a huge flood' },
  { word: /massif/i, es: 'Macizo montañoso', en: 'Mountain massif' },
  { word: /highland edifice/i, es: 'Montaña en las tierras altas', en: 'Mountain in the highlands' },
  { word: /highland/i, es: 'Tierras altas llenas de cráteres', en: 'Cratered highlands' },
  { word: /basin/i, es: 'Cuenca baja (fondo de antiguas llanuras)', en: 'Low basin (old plains floor)' },
  { word: /transition/i, es: 'Zona de transición entre tierras altas y llanuras', en: 'Transition between highlands and plains' },
  { word: /apron/i, es: 'Ladera de escombros (a veces con hielo)', en: 'Debris apron (sometimes icy)' },
]

export interface PlainUnit {
  /** What it is, in everyday words. */
  kind: string
  /** Geologic period(s) in plain words, e.g. "Hespérico". */
  period: string
  /** How old, e.g. "entre 3.700 y 3.000 millones de años". */
  age: string
  /** One-line story of that age. */
  story: string
}

/** Explains an official unit name ("Late Hesperian volcanic unit") in everyday words. */
export function plainUnit(name: string, lang: Lang): PlainUnit {
  const found = PERIODS.filter((p) => name.includes(p.key))
  const kind = KINDS.find((k) => k.word.test(name))
  const stage = /\bEarly\b/.test(name)
    ? pick(lang, 'temprano', 'Early')
    : /\bMiddle\b/.test(name)
      ? pick(lang, 'medio', 'Middle')
      : /\bLate\b/.test(name)
        ? pick(lang, 'tardío', 'Late')
        : ''
  const periods = found.map((p) => pick(lang, p.es, p.en))
  const period = lang === 'en' ? [stage, periods.join(' and ')].filter(Boolean).join(' ') : [periods.join(' y '), stage].filter(Boolean).join(' ')
  // PERIODS runs oldest first. Two periods ("Amazonian and Hesperian") span from the older to the younger.
  const oldest = found[0]
  const youngest = found.at(-1)
  let age = ''
  if (found.length === 1 && oldest) age = pick(lang, oldest.ageEs, oldest.ageEn)
  else if (oldest && youngest) age = pick(lang, `de distintas edades, desde el ${oldest.es} hasta el ${youngest.es}`, `of mixed age, from the ${oldest.en} to the ${youngest.en}`)
  return {
    kind: kind ? pick(lang, kind.es, kind.en) : name,
    period,
    age,
    story: found.length === 1 && oldest ? pick(lang, oldest.storyEs, oldest.storyEn) : '',
  }
}

/** Geologic unit under a point (planetocentric lat, east lon −180..180). Null if the point has none. */
export async function fetchGeoUnit(lat: number, lon: number, signal?: AbortSignal): Promise<GeoUnit | null> {
  const q = new URLSearchParams({
    geometry: `${lon},${lat}`,
    geometryType: 'esriGeometryPoint',
    inSR: '104905',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: 'Unit,UnitDesc',
    returnGeometry: 'false',
    f: 'json',
  })
  const res = await fetch(`${QUERY}?${q}`, { signal })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = (await res.json()) as { features?: { attributes: { Unit?: string; UnitDesc?: string } }[]; error?: unknown }
  if (data.error) throw new Error('query error')
  const a = data.features?.[0]?.attributes
  return a?.Unit && a.UnitDesc ? { code: a.Unit, name: a.UnitDesc } : null
}
