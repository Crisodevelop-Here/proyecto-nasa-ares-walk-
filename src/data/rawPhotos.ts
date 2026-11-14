// Latest raw photos from the active rovers, read live from NASA's public raw-image feeds.
// Both feeds allow browser requests (Access-Control-Allow-Origin: *). Images are hot-linked from mars.nasa.gov.

export interface RawPhoto {
  id: string
  sol: number
  /** ISO date the photo was taken (UTC, Earth). */
  date: string
  /** Instrument code as NASA names it (e.g. MCZ_LEFT, NAV_LEFT_B). */
  camera: string
  /** Small image for the grid. */
  thumb: string
  /** Bigger image for the enlarged view. */
  full: string
  /** NASA page for this photo. */
  link: string
  credit: string
}

export type RoverWithFeed = 'perseverance' | 'curiosity'
export const ROVERS_WITH_FEED: readonly string[] = ['perseverance', 'curiosity']

const FEED: Record<RoverWithFeed, string> = {
  perseverance: 'https://mars.nasa.gov/rss/api/?feed=raw_images&category=mars2020&feedtype=json&num=100&page=0&order=sol+desc',
  curiosity: 'https://mars.nasa.gov/api/v1/raw_image_items/?order=sol%20desc&per_page=100&page=0&condition_1=msl:mission',
}

/** NASA gallery for each rover, for "see more". */
export const GALLERY: Record<RoverWithFeed, string> = {
  perseverance: 'https://mars.nasa.gov/mars2020/multimedia/raw-images/',
  curiosity: 'https://mars.nasa.gov/msl/multimedia/raw-images/',
}

// ---- feed shapes (only the fields we read) ----
interface M20Item {
  imageid: string
  sol: number
  date_taken_utc: string
  sample_type: string
  camera: { instrument: string }
  image_files: { small?: string; medium?: string; large?: string; full_res?: string }
  link: string
  credit?: string
}
interface MslItem {
  id: number
  imageid: string
  sol: number
  date_taken: string
  instrument: string
  url: string
  extended?: { sample_type?: string }
}

/** Right-eye frames repeat the left-eye view of a stereo pair. */
const isRightEye = (camera: string) => /RIGHT/i.test(camera)

export function fromPerseverance(items: M20Item[]): RawPhoto[] {
  return items
    .filter((i) => i.sample_type?.toLowerCase() === 'full' && !isRightEye(i.camera.instrument) && i.image_files?.small)
    .map((i) => ({
      id: i.imageid,
      sol: i.sol,
      date: i.date_taken_utc,
      camera: i.camera.instrument,
      thumb: i.image_files.small ?? '',
      full: i.image_files.large ?? i.image_files.medium ?? i.image_files.small ?? '',
      link: i.link,
      credit: i.credit ?? 'NASA/JPL-Caltech',
    }))
}

export function fromCuriosity(items: MslItem[]): RawPhoto[] {
  return items
    .filter((i) => i.extended?.sample_type?.toLowerCase() === 'full' && !isRightEye(i.instrument) && i.url)
    .map((i) => ({
      id: i.imageid,
      sol: i.sol,
      date: i.date_taken,
      camera: i.instrument,
      // The Curiosity feed has a single size.
      thumb: i.url,
      full: i.url,
      link: `https://mars.nasa.gov/raw_images/${i.id}/`,
      credit: 'NASA/JPL-Caltech/MSSS',
    }))
}

/** Plain-language name of the camera. */
export function cameraName(code: string, lang: 'es' | 'en'): string {
  const c = code.toUpperCase()
  const pick = (es: string, en: string) => (lang === 'en' ? en : es)
  if (c.startsWith('MCZ')) return pick('Cámara principal (Mastcam-Z)', 'Main camera (Mastcam-Z)')
  if (c.startsWith('MAST')) return pick('Cámara principal (Mastcam)', 'Main camera (Mastcam)')
  if (c.startsWith('NAV')) return pick('Cámara para conducir', 'Driving camera')
  if (c.includes('HAZ')) return pick('Cámara de obstáculos', 'Hazard camera')
  if (c.includes('RMI')) return pick('Teleobjetivo del láser', 'Laser telephoto')
  if (c.startsWith('MAHLI') || c.startsWith('MHLI')) return pick('Lupa del brazo (MAHLI)', 'Arm hand lens (MAHLI)')
  if (c.startsWith('WATSON') || c.startsWith('SHERLOC')) return pick('Lupa del brazo (WATSON)', 'Arm hand lens (WATSON)')
  if (c.startsWith('SKYCAM')) return pick('Cámara del cielo', 'Sky camera')
  if (c.includes('CACHECAM')) return pick('Cámara de muestras', 'Sample camera')
  if (c.startsWith('HELI')) return pick('Helicóptero Ingenuity', 'Ingenuity helicopter')
  if (c.startsWith('EDL') || c.startsWith('MARDI')) return pick('Cámara de aterrizaje', 'Landing camera')
  return code
}

/** Fetch the newest full-frame photos (left eye only), at most `limit`. */
export async function fetchLatestPhotos(rover: RoverWithFeed, limit = 12, signal?: AbortSignal): Promise<RawPhoto[]> {
  const res = await fetch(FEED[rover], { signal })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = (await res.json()) as { images?: M20Item[]; items?: MslItem[] }
  const photos = rover === 'perseverance' ? fromPerseverance(data.images ?? []) : fromCuriosity(data.items ?? [])
  return photos.slice(0, limit)
}
