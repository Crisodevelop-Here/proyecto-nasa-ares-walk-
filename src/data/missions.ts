// Past NASA surface missions: where they went and what they did.
//
// Coordinates are planetocentric latitude and east longitude in −180..180 (same convention as the globe).
// Landing sites are the published values. Intermediate waypoints are APPROXIMATE (±~1 km) and are
// meant to show the shape of the traverse, not to navigate by. Refine them with the official MMGIS
// traverse files (mars.nasa.gov/mmgis-maps/MSL, /M20) when they can be downloaded.

export interface Milestone {
  sol: number
  /** ISO date (UTC, Earth). */
  date: string
  lat: number
  lon: number
  title: string
  /** What the mission did there, concretely. */
  what: string
  /** Instruments or tools used. */
  instruments?: string[]
  /** Why it mattered. */
  finding?: string
}

export interface Mission {
  id: string
  name: string
  kind: 'rover' | 'lander' | 'helicopter'
  /** Landing date (ISO). */
  landed: string
  /** Last contact (ISO) or null if still active. */
  ended: string | null
  site: string
  lat: number
  lon: number
  color: string
  /** Total distance driven (km), if a rover. */
  distanceKm?: number
  summary: string
  /** Traverse waypoints [lat, lon] in order (approximate between milestones). */
  track: [number, number][]
  milestones: Milestone[]
  /** Link to see the mission's own point-of-view images for a sol. */
  rawImages?: (sol: number) => string
  link: string
}

const mslRaw = (sol: number) => `https://mars.nasa.gov/msl/multimedia/raw-images/?order=sol+desc&per_page=50&page=0&mission=msl&begin_sol=${sol}&end_sol=${sol}`
const m20Raw = (sol: number) => `https://mars.nasa.gov/mars2020/multimedia/raw-images/?af=&begin_sol=${sol}&end_sol=${sol}`

export const MISSIONS: Mission[] = [
  {
    id: 'curiosity',
    name: 'Curiosity (MSL)',
    kind: 'rover',
    landed: '2012-08-06',
    ended: null,
    site: 'Cráter Gale · Monte Sharp',
    lat: -4.5895,
    lon: 137.4417,
    color: '#38bdf8',
    distanceKm: 35,
    summary: 'Rover de propulsión nuclear (RTG) que sube por el Monte Sharp leyendo sus capas como un libro de historia del agua en Marte.',
    track: [
      [-4.5895, 137.4417],
      [-4.589, 137.446],
      [-4.6, 137.432],
      [-4.618, 137.416],
      [-4.637, 137.402],
      [-4.665, 137.383],
      [-4.68, 137.375],
      [-4.692, 137.37],
      [-4.712, 137.374],
      [-4.725, 137.38],
      [-4.745, 137.381],
      [-4.76, 137.388],
      [-4.77, 137.39],
      [-4.79, 137.395],
      [-4.8, 137.405],
      [-4.81, 137.418],
      [-4.83, 137.41],
    ],
    milestones: [
      { sol: 0, date: '2012-08-06', lat: -4.5895, lon: 137.4417, title: 'Bradbury Landing', what: 'Aterrizaje con la grúa aérea (sky crane). Primeras imágenes de las cámaras de navegación y de peligro.', instruments: ['Hazcam', 'Navcam', 'MARDI'], finding: 'Primer aterrizaje de precisión de un rover de 900 kg.' },
      { sol: 182, date: '2013-02-08', lat: -4.589, lon: 137.446, title: 'Yellowknife Bay · John Klein', what: 'Primera perforación de roca en otro planeta. El polvo se analizó en los laboratorios internos.', instruments: ['Taladro', 'CheMin', 'SAM'], finding: 'Arcillas y química de un lago antiguo de agua dulce: Gale fue habitable para microbios.' },
      { sol: 621, date: '2014-05-05', lat: -4.637, lon: 137.402, title: 'The Kimberley · Windjana', what: 'Perforación de una arenisca para estudiar los sedimentos de un antiguo río.', instruments: ['Taladro', 'ChemCam', 'APXS'], finding: 'Rocas ricas en potasio: magmas más variados de lo esperado.' },
      { sol: 759, date: '2014-09-24', lat: -4.665, lon: 137.383, title: 'Pahrump Hills', what: 'Llega a la base del Monte Sharp y perfora Confidence Hills, la primera muestra de la montaña.', instruments: ['Taladro', 'CheMin', 'Mastcam'], finding: 'Capas de lodo de un lago que duró millones de años.' },
      { sol: 1224, date: '2015-12-17', lat: -4.692, lon: 137.37, title: 'Dunas Bagnold · Gobabeb', what: 'Primer estudio de cerca de una duna activa fuera de la Tierra; recoge arena con la pala.', instruments: ['CHIMRA (pala)', 'MAHLI', 'CheMin'], finding: 'El viento clasifica los granos por mineral: el polvo que respirarán los astronautas.' },
      { sol: 1810, date: '2017-09-08', lat: -4.725, lon: 137.38, title: 'Vera Rubin Ridge', what: 'Sube a la cresta de hematita y la recorre durante más de un año.', instruments: ['ChemCam', 'Mastcam', 'Taladro'], finding: 'Agua subterránea alteró la roca después de que se secara el lago.' },
      { sol: 2384, date: '2019-04-06', lat: -4.745, lon: 137.381, title: 'Glen Torridon · unidad de arcillas', what: 'Perfora Aberlady y Kilmarie en la zona más rica en arcillas vista desde órbita.', instruments: ['Taladro', 'CheMin', 'SAM'], finding: 'Mayor concentración de arcillas de la misión: mucha agua en el pasado.' },
      { sol: 3925, date: '2023-08-18', lat: -4.8, lon: 137.405, title: 'Gediz Vallis Ridge', what: 'Alcanza la cresta de escombros de Gediz Vallis tras cuatro intentos y toma un panorama de 360°.', instruments: ['Mastcam', 'ChemCam'], finding: 'Restos dejados por inundaciones y aludes de lodo recientes en la historia de Gale.' },
      { sol: 4209, date: '2024-05-30', lat: -4.81, lon: 137.418, title: 'Cristales de azufre puro', what: 'Una rueda rompe una roca y deja ver cristales amarillos de azufre elemental.', instruments: ['Mastcam', 'MAHLI', 'APXS'], finding: 'Primera vez que se encuentra azufre puro en Marte; su origen aún no se explica.' },
      { sol: 4600, date: '2025-07-01', lat: -4.83, lon: 137.41, title: 'Formaciones boxwork', what: 'Recorre crestas en forma de red que se ven desde órbita a lo largo de kilómetros.', instruments: ['Mastcam', 'ChemCam', 'Taladro'], finding: 'Agua subterránea circuló por grietas y las selló con minerales: posible refugio para vida antigua.' },
    ],
    rawImages: mslRaw,
    link: 'https://science.nasa.gov/mission/msl-curiosity/',
  },
  {
    id: 'perseverance',
    name: 'Perseverance (Mars 2020)',
    kind: 'rover',
    landed: '2021-02-18',
    ended: null,
    site: 'Cráter Jezero',
    lat: 18.4447,
    lon: 77.4508,
    color: '#f472b6',
    distanceKm: 37,
    summary: 'Busca señales de vida antigua en el delta de un lago y guarda muestras selladas para traerlas a la Tierra.',
    track: [
      [18.4447, 77.4508],
      [18.4446, 77.4505],
      [18.437, 77.443],
      [18.43, 77.448],
      [18.445, 77.425],
      [18.457, 77.405],
      [18.465, 77.398],
      [18.48, 77.38],
      [18.485, 77.36],
      [18.49, 77.33],
    ],
    milestones: [
      { sol: 0, date: '2021-02-18', lat: 18.4447, lon: 77.4508, title: 'Octavia E. Butler Landing', what: 'Aterrizaje con navegación por terreno: el rover eligió en el aire un punto seguro.', instruments: ['Terrain-Relative Navigation', 'Cámaras EDL'], finding: 'Primer video de un aterrizaje en Marte.' },
      { sol: 58, date: '2021-04-19', lat: 18.4446, lon: 77.4505, title: 'Primer vuelo de Ingenuity', what: 'Ingenuity despega del "Wright Brothers Field", sube 3 m y aterriza.', instruments: ['Ingenuity'], finding: 'Primer vuelo propulsado y controlado en otro planeta.' },
      { sol: 60, date: '2021-04-20', lat: 18.4447, lon: 77.4508, title: 'MOXIE produce oxígeno', what: 'Convierte CO₂ de la atmósfera en 5,4 g de oxígeno.', instruments: ['MOXIE'], finding: 'Demuestra que los astronautas podrían fabricar O₂ en Marte (para respirar y como combustible).' },
      { sol: 190, date: '2021-09-01', lat: 18.437, lon: 77.443, title: 'Primera muestra: Rochette', what: 'Corta un núcleo de roca volcánica y lo sella en un tubo de titanio.', instruments: ['Taladro de núcleos', 'PIXL', 'SHERLOC'], finding: 'Roca alterada por agua varias veces: el piso de Jezero fue un lago.' },
      { sol: 653, date: '2022-12-21', lat: 18.457, lon: 77.405, title: 'Depósito Three Forks', what: 'Deja 10 tubos de muestras en el suelo como reserva para una futura misión de retorno.', instruments: ['Brazo robótico'], finding: 'Primer depósito de muestras en otro planeta.' },
      { sol: 1046, date: '2024-01-18', lat: 18.47, lon: 77.39, title: 'Último vuelo de Ingenuity', what: 'Tras 72 vuelos, Ingenuity daña una pala del rotor y termina su misión.', instruments: ['Ingenuity'], finding: '72 vuelos en lugar de los 5 planeados: el aire de Marte es volable.' },
      { sol: 1212, date: '2024-07-21', lat: 18.48, lon: 77.38, title: 'Cheyava Falls', what: 'Muestrea una roca con "manchas de leopardo" en el valle Neretva.', instruments: ['SHERLOC', 'PIXL', 'Taladro'], finding: 'Posible biofirma: el mejor candidato hasta ahora a rastro de vida antigua.' },
      { sol: 1370, date: '2024-12-12', lat: 18.49, lon: 77.33, title: 'Borde del cráter Jezero', what: 'Termina de subir el borde del cráter y estudia rocas de las más antiguas de Marte.', instruments: ['Mastcam-Z', 'SuperCam'], finding: 'Rocas de la corteza primitiva arrancadas por el impacto.' },
    ],
    rawImages: m20Raw,
    link: 'https://science.nasa.gov/mission/mars-2020-perseverance/',
  },
  {
    id: 'opportunity',
    name: 'Opportunity (MER-B)',
    kind: 'rover',
    landed: '2004-01-25',
    ended: '2018-06-10',
    site: 'Meridiani Planum',
    lat: -1.9462,
    lon: -5.5266,
    color: '#a3e635',
    distanceKm: 45.16,
    summary: 'Diseñado para 90 soles, funcionó casi 15 años y recorrió más de un maratón.',
    track: [
      [-1.9462, -5.5266],
      [-1.95, -5.473],
      [-1.985, -5.48],
      [-2.05, -5.5],
      [-2.12, -5.42],
      [-2.2, -5.33],
      [-2.28, -5.28],
      [-2.31, -5.32],
    ],
    milestones: [
      { sol: 0, date: '2004-01-25', lat: -1.9462, lon: -5.5266, title: 'Cráter Eagle', what: 'Aterriza con bolsas de aire dentro de un cráter pequeño y estudia el afloramiento El Capitán.', instruments: ['Pancam', 'Mini-TES', 'Microscopic Imager'], finding: 'Las "blueberries" de hematita y las capas de sal: Meridiani tuvo agua líquida.' },
      { sol: 133, date: '2004-06-08', lat: -1.95, lon: -5.473, title: 'Cráter Endurance', what: 'Entra en un cráter de 130 m para leer sus capas de roca hacia abajo.', instruments: ['RAT (abrasión)', 'APXS', 'Mössbauer'], finding: 'Cientos de capas formadas por dunas y agua subterránea.' },
      { sol: 339, date: '2005-01-06', lat: -1.985, lon: -5.48, title: 'Meteorito Heat Shield Rock', what: 'Encuentra junto a su escudo térmico un meteorito metálico.', instruments: ['Mini-TES', 'Mössbauer'], finding: 'Primer meteorito identificado en otro planeta.' },
      { sol: 951, date: '2006-09-27', lat: -2.05, lon: -5.5, title: 'Cráter Victoria', what: 'Recorre el borde de un cráter de 750 m y luego entra en él.', instruments: ['Pancam', 'Microscopic Imager'], finding: 'Gruesas capas de antiguas dunas expuestas en las paredes.' },
      { sol: 2681, date: '2011-08-09', lat: -2.28, lon: -5.28, title: 'Cráter Endeavour', what: 'Tras 3 años de viaje, llega al borde de un cráter de 22 km.', instruments: ['APXS', 'Microscopic Imager'], finding: 'Vetas de yeso (Homestake): agua circulando por grietas.' },
      { sol: 5111, date: '2018-06-10', lat: -2.31, lon: -5.32, title: 'Perseverance Valley', what: 'Una tormenta global de polvo tapa el Sol y el rover deja de comunicarse.', instruments: ['Paneles solares'], finding: 'Riesgo clave para humanos: las tormentas de polvo pueden durar meses.' },
    ],
    link: 'https://science.nasa.gov/mission/mars-exploration-rovers-spirit-and-opportunity/',
  },
  {
    id: 'spirit',
    name: 'Spirit (MER-A)',
    kind: 'rover',
    landed: '2004-01-04',
    ended: '2010-03-22',
    site: 'Cráter Gusev',
    lat: -14.5684,
    lon: 175.4726,
    color: '#fbbf24',
    distanceKm: 7.73,
    summary: 'Gemelo de Opportunity. Encontró pruebas de fuentes termales en las Colinas Columbia.',
    track: [
      [-14.5684, 175.4726],
      [-14.565, 175.478],
      [-14.58, 175.5],
      [-14.6, 175.53],
      [-14.62, 175.53],
      [-14.64, 175.53],
      [-14.6418, 175.5257],
    ],
    milestones: [
      { sol: 0, date: '2004-01-04', lat: -14.5684, lon: 175.4726, title: 'Columbia Memorial Station', what: 'Aterriza en las llanuras de lava de Gusev, un cráter que pudo tener un lago.', instruments: ['Pancam', 'Navcam'], finding: 'El suelo era basalto: el lago no se veía en la superficie.' },
      { sol: 65, date: '2004-03-11', lat: -14.565, lon: 175.478, title: 'Cráter Bonneville', what: 'Examina el borde de un cráter de 200 m y decide ir a las colinas.', instruments: ['Pancam', 'RAT'], finding: 'Poca alteración por agua en las llanuras.' },
      { sol: 581, date: '2005-08-21', lat: -14.6, lon: 175.53, title: 'Cumbre de Husband Hill', what: 'Sube 106 m hasta la cumbre: primer rover en escalar una montaña en otro planeta.', instruments: ['Pancam'], finding: 'Rocas alteradas por agua en las colinas.' },
      { sol: 1150, date: '2007-05-21', lat: -14.64, lon: 175.53, title: 'Home Plate · sílice', what: 'Una rueda atascada remueve el suelo y deja ver sílice casi pura (Gertrude Weise).', instruments: ['Mini-TES', 'APXS'], finding: 'Fuentes termales o fumarolas: ambientes que en la Tierra albergan microbios.' },
      { sol: 1892, date: '2009-05-01', lat: -14.6418, lon: 175.5257, title: 'Atascado en Troy', what: 'Las ruedas se hunden en arena suelta y el rover queda como estación fija hasta 2010.', instruments: ['Ruedas'], finding: 'Lección de movilidad: arena blanda bajo una costra firme.' },
    ],
    link: 'https://science.nasa.gov/mission/mars-exploration-rovers-spirit-and-opportunity/',
  },
  {
    id: 'sojourner',
    name: 'Sojourner (Mars Pathfinder)',
    kind: 'rover',
    landed: '1997-07-04',
    ended: '1997-09-27',
    site: 'Ares Vallis',
    lat: 19.13,
    lon: -33.22,
    color: '#c084fc',
    distanceKm: 0.1,
    summary: 'El primer rover en Marte: 10,6 kg, recorrió unos 100 m alrededor del lander.',
    track: [
      [19.13, -33.22],
      [19.1301, -33.2198],
      [19.1302, -33.2201],
      [19.1299, -33.2203],
    ],
    milestones: [
      { sol: 0, date: '1997-07-04', lat: 19.13, lon: -33.22, title: 'Carl Sagan Memorial Station', what: 'Pathfinder aterriza con bolsas de aire en una antigua llanura de inundación.', instruments: ['IMP (cámara)'], finding: 'Rocas redondeadas por enormes inundaciones.' },
      { sol: 3, date: '1997-07-07', lat: 19.1301, lon: -33.2198, title: 'Barnacle Bill', what: 'Primer análisis químico de una roca marciana con un rover.', instruments: ['APXS'], finding: 'Roca rica en sílice, parecida a la andesita terrestre.' },
      { sol: 10, date: '1997-07-14', lat: 19.1302, lon: -33.2201, title: 'Yogi', what: 'Analiza una gran roca y fotografía su textura.', instruments: ['APXS', 'Cámaras del rover'], finding: 'Composición más basáltica que Barnacle Bill.' },
    ],
    link: 'https://science.nasa.gov/mission/mars-pathfinder/',
  },
  {
    id: 'viking1',
    name: 'Viking 1',
    kind: 'lander',
    landed: '1976-07-20',
    ended: '1982-11-11',
    site: 'Chryse Planitia',
    lat: 22.27,
    lon: -47.95,
    color: '#e5e7eb',
    summary: 'Primer aterrizaje exitoso de EE. UU. en Marte y primeros experimentos de biología en otro planeta.',
    track: [],
    milestones: [{ sol: 0, date: '1976-07-20', lat: 22.27, lon: -47.95, title: 'Aterrizaje en Chryse', what: 'Primera foto desde la superficie de Marte; experimentos para detectar vida en el suelo.', instruments: ['Cámaras', 'Experimentos biológicos', 'GCMS'], finding: 'Resultados ambiguos: el suelo es químicamente reactivo (oxidantes).' }],
    link: 'https://science.nasa.gov/mission/viking-1/',
  },
  {
    id: 'viking2',
    name: 'Viking 2',
    kind: 'lander',
    landed: '1976-09-03',
    ended: '1980-04-11',
    site: 'Utopia Planitia',
    lat: 47.64,
    lon: 134.29,
    color: '#e5e7eb',
    summary: 'Gemelo de Viking 1, más al norte. Fotografió escarcha en invierno.',
    track: [],
    milestones: [{ sol: 0, date: '1976-09-03', lat: 47.64, lon: 134.29, title: 'Aterrizaje en Utopia', what: 'Mide el tiempo atmosférico durante más de un año marciano y fotografía escarcha.', instruments: ['Meteorología', 'Cámaras'], finding: 'Escarcha de agua estacional en la superficie.' }],
    link: 'https://science.nasa.gov/mission/viking-2/',
  },
  {
    id: 'phoenix',
    name: 'Phoenix',
    kind: 'lander',
    landed: '2008-05-25',
    ended: '2008-11-02',
    site: 'Vastitas Borealis',
    lat: 68.22,
    lon: -125.75,
    color: '#e5e7eb',
    summary: 'Excavó el suelo del Ártico marciano y tocó hielo de agua.',
    track: [],
    milestones: [{ sol: 20, date: '2008-06-19', lat: 68.22, lon: -125.75, title: 'Hielo bajo el suelo', what: 'Su pala destapa trozos blancos que se subliman en 4 días: hielo de agua.', instruments: ['Brazo robótico', 'TEGA', 'WCL'], finding: 'Hielo a pocos cm y percloratos en el suelo (tóxicos para humanos, útiles para O₂).' }],
    link: 'https://science.nasa.gov/mission/phoenix/',
  },
  {
    id: 'insight',
    name: 'InSight',
    kind: 'lander',
    landed: '2018-11-26',
    ended: '2022-12-15',
    site: 'Elysium Planitia',
    lat: 4.502,
    lon: 135.623,
    color: '#e5e7eb',
    summary: 'Escuchó el interior de Marte con un sismómetro.',
    track: [],
    milestones: [{ sol: 1222, date: '2022-05-04', lat: 4.502, lon: 135.623, title: 'Sismo de magnitud 5', what: 'Registra el mayor sismo detectado en otro planeta.', instruments: ['SEIS'], finding: 'Tamaño del núcleo y espesor de la corteza: riesgos sísmicos para una base.' }],
    link: 'https://science.nasa.gov/mission/insight/',
  },
]

export const MISSION_BY_ID = Object.fromEntries(MISSIONS.map((m) => [m.id, m])) as Record<string, Mission>

const deg = Math.PI / 180
const MARS_R_KM = 3389.5

/** Great-circle distance in km. */
export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const a = Math.sin(((lat2 - lat1) * deg) / 2) ** 2 + Math.cos(lat1 * deg) * Math.cos(lat2 * deg) * Math.sin(((lon2 - lon1) * deg) / 2) ** 2
  return 2 * MARS_R_KM * Math.asin(Math.min(1, Math.sqrt(a)))
}

/** Missions whose landing site or any milestone lies within `km` of a point, nearest first. */
export function missionsNear(lat: number, lon: number, km: number) {
  return MISSIONS.map((m) => {
    const pts = [[m.lat, m.lon], ...m.milestones.map((s) => [s.lat, s.lon])]
    return { m, d: Math.min(...pts.map(([a, b]) => distanceKm(lat, lon, a, b))) }
  })
    .filter((x) => x.d <= km)
    .sort((a, b) => a.d - b.d)
}
