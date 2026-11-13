import { locale, t } from '../i18n'
import * as THREE from 'three'

/** Globe radius in scene units. Mars mean radius is 3389.5 km, so 1 unit ≈ 339 km. */
export const R = 10
export const MARS_RADIUS_M = 3_389_500
/** Scene units per metre on the globe. */
export const UNITS_PER_M = R / MARS_RADIUS_M

const deg = Math.PI / 180

/** MOLA height texture range (see scripts/mola_to_png.py): 0 → MOLA_LO m, 1 → MOLA_HI m. */
export const MOLA_LO = -6957
export const MOLA_HI = 14649.6
/** Vertical exaggeration of the global relief so Tharsis and Valles Marineris read on screen. */
export const GLOBE_EXAGGERATION = 8
export const DISPLACEMENT_SCALE = (MOLA_HI - MOLA_LO) * UNITS_PER_M * GLOBE_EXAGGERATION
export const DISPLACEMENT_BIAS = -((0 - MOLA_LO) / (MOLA_HI - MOLA_LO)) * DISPLACEMENT_SCALE

/** HiRISE crop centre (from public/terrain/meta.json: nw −4.81868, 137.27734 · se −4.85364, 137.3123). */
export const SITE = { lat: -4.83616, lon: 137.29482 }

export interface Place {
  id: string
  name: string
  lat: number
  lon: number
  note: string
  main?: boolean
}

/** Named features, used to name the clicked spot. */
export const PLACES: Place[] = [
  { id: 'gale', name: 'Cráter Gale', lat: -5.4, lon: 137.8, note: 'Monte Sharp · Curiosity', main: true },
  { id: 'jezero', name: 'Cráter Jezero', lat: 18.4, lon: 77.5, note: 'Delta de un lago · Perseverance' },
  { id: 'olympus', name: 'Monte Olimpo', lat: 18.65, lon: -133.8, note: 'Volcán de 21 km de altura' },
  { id: 'valles', name: 'Valles Marineris', lat: -13.9, lon: -59.2, note: 'Cañón de 4.000 km' },
  { id: 'hellas', name: 'Cuenca Hellas', lat: -42.4, lon: 70.5, note: 'Cuenca de impacto de 7 km de profundidad' },
  { id: 'argyre', name: 'Cuenca Argyre', lat: -49.7, lon: -43.4, note: 'Cuenca de impacto' },
  { id: 'arsia', name: 'Arsia Mons', lat: -8.26, lon: -120.09, note: 'Volcán de Tharsis' },
  { id: 'pavonis', name: 'Pavonis Mons', lat: 1.48, lon: -112.96, note: 'Volcán de Tharsis' },
  { id: 'ascraeus', name: 'Ascraeus Mons', lat: 11.92, lon: -104.08, note: 'Volcán de Tharsis' },
  { id: 'elysium', name: 'Elysium Mons', lat: 25.02, lon: 147.21, note: 'Volcán' },
  { id: 'utopia', name: 'Utopia Planitia', lat: 46.7, lon: 117.5, note: 'Llanura con hielo enterrado' },
  { id: 'acidalia', name: 'Acidalia Planitia', lat: 46.7, lon: -22.0, note: 'Llanura del norte' },
  { id: 'chryse', name: 'Chryse Planitia', lat: 28.4, lon: -40.0, note: 'Desembocadura de canales de inundación' },
  { id: 'arabia', name: 'Arabia Terra', lat: 19.8, lon: 30.0, note: 'Tierras altas antiguas con capas' },
  { id: 'meridiani', name: 'Meridiani Planum', lat: -0.2, lon: -3.0, note: 'Hematita · Opportunity' },
  { id: 'gusev', name: 'Cráter Gusev', lat: -14.5, lon: 175.4, note: 'Spirit' },
  { id: 'syrtis', name: 'Syrtis Major', lat: 8.4, lon: 69.5, note: 'Meseta volcánica oscura' },
  { id: 'isidis', name: 'Isidis Planitia', lat: 12.9, lon: 87.0, note: 'Cuenca de impacto' },
  { id: 'noctis', name: 'Noctis Labyrinthus', lat: -6.9, lon: -102.2, note: 'Laberinto de cañones' },
  { id: 'npole', name: 'Casquete polar norte', lat: 88, lon: 0, note: 'Hielo de agua y CO₂' },
  { id: 'spole', name: 'Casquete polar sur', lat: -87, lon: 0, note: 'Hielo de CO₂ sobre hielo de agua' },
  { id: 'aeolis', name: 'Aeolis Mensae', lat: -3.0, lon: 142.0, note: 'Mesas erosionadas por el viento' },
  { id: 'tharsis', name: 'Meseta de Tharsis', lat: 1.0, lon: -100.0, note: 'Gran abultamiento volcánico' },
]

/** Position on the sphere matching three.js SphereGeometry UVs with longitude 0 at the texture centre. */
export function onSphere(lat: number, lon: number, r = R, out = new THREE.Vector3()) {
  const p = lat * deg
  const l = lon * deg
  return out.set(r * Math.cos(p) * Math.cos(l), r * Math.sin(p), -r * Math.cos(p) * Math.sin(l))
}

/** Inverse of onSphere: planet-local position → { lat, lon } in degrees (lon in −180..180). */
export function latLonOf(v: THREE.Vector3) {
  const r = v.length() || 1
  return { lat: Math.asin(Math.max(-1, Math.min(1, v.y / r))) / deg, lon: Math.atan2(-v.z, v.x) / deg }
}

export const wrapLon = (lon: number) => ((((lon + 180) % 360) + 360) % 360) - 180

export function formatLatLon(lat: number, lon: number, d = 2) {
  const f = (x: number) => Math.abs(x).toLocaleString(locale(), { minimumFractionDigits: d, maximumFractionDigits: d })
  return `${f(lat)}° ${lat < 0 ? 'S' : 'N'}, ${f(lon)}° ${lon < 0 ? t('O', 'W') : 'E'}`
}

/** Unit vector pointing north along the surface at (lat, lon). */
export function northAt(lat: number, lon: number) {
  const p = lat * deg
  const l = lon * deg
  return new THREE.Vector3(-Math.sin(p) * Math.cos(l), Math.cos(p), Math.sin(p) * Math.sin(l))
}

/**
 * Planet orientation that puts (lat, lon) on top of the world (+y), with local north toward −z
 * and east toward +x. The terrain's own frame (x east, y up, z south) then needs no rotation.
 */
export function topDownQuat(lat: number, lon: number) {
  const up = onSphere(lat, lon, 1)
  const north = northAt(lat, lon)
  const east = new THREE.Vector3().crossVectors(north, up)
  const basis = new THREE.Matrix4().makeBasis(east, up, north.clone().negate())
  return new THREE.Quaternion().setFromRotationMatrix(basis).invert()
}

export const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
export const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
