import { GEOLOGY_LAYER } from '../data/geology'
import { LITE } from '../perf'
import { wrapLon } from '../scene/mars'
import { bakeGround, type GroundOutput } from './groundBake'
import type { LayerJob } from './layers.worker'
import { classOf, contourInterval, MAP_SIZE, radiationPixels, slopeGrid, slopePixels, SLOPE_CLASSES, topoPixels, type HeightGrid } from './mapLayers'
import { doseAtElevation } from '../data/environment'
import { REGION_EX, REGION_GRID, uvToLatLon, type Region } from './regionTerrain'

export { DOSE_RAMP, DOSE_SCALE, RELIEF_RAMP, SLOPE_CLASSES, contourInterval } from './mapLayers'

export type RegionLayer = 'optical' | 'topo' | 'slope' | 'geology' | 'radiation'
export const REGION_LAYERS: { id: RegionLayer; label: string; data: string }[] = [
  { id: 'optical', label: 'Óptica', data: 'Imagen' },
  { id: 'topo', label: 'Relieve', data: 'Topografía' },
  { id: 'slope', label: 'Pendiente', data: 'Peligro' },
  { id: 'geology', label: 'Geología', data: 'Geología' },
  { id: 'radiation', label: 'Radiación', data: 'Radiación' },
]

const OUT = 1024

function canvas(size = OUT) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  return c
}

/** The patch's elevation grid in the plain form the map functions (and the worker) take. */
const heightGrid = (r: Region): HeightGrid => ({
  heights: r.terrain.heights,
  grid: REGION_GRID,
  sizeM: r.terrain.meta.sizeM,
  zMin: r.terrain.meta.zMin,
  zMax: r.terrain.meta.zMax,
})

export interface ReliefLegend {
  zMin: number
  zMax: number
  interval: number
}
export const reliefLegend = (r: Region): ReliefLegend => ({
  zMin: r.terrain.meta.zMin,
  zMax: r.terrain.meta.zMax,
  interval: contourInterval(r.terrain.meta.zMax - r.terrain.meta.zMin),
})

export interface SlopeLegend {
  /** Fraction of the patch in each class. */
  share: number[]
  maxDeg: number
}

export function slopeLegend(r: Region): SlopeLegend {
  const sl = slopeGrid(heightGrid(r), 256)
  const share = SLOPE_CLASSES.map(() => 0)
  let maxDeg = 0
  for (const v of sl) {
    share[classOf(v)]++
    maxDeg = Math.max(maxDeg, v)
  }
  return { share: share.map((n) => n / sl.length), maxDeg }
}

export interface RadiationLegend {
  /** Estimated dose (mSv per sol) at the lowest and highest point of the patch. */
  low: number
  high: number
}
export const radiationLegend = (r: Region): RadiationLegend => ({
  low: doseAtElevation(r.terrain.meta.zMin),
  high: doseAtElevation(r.terrain.meta.zMax),
})

/** Radiation map of the patch (computed in the worker). */
export async function radiationCanvas(r: Region) {
  return toCanvas(await runJob<Uint8ClampedArray>({ kind: 'radiation', inp: heightGrid(r) }), MAP_SIZE)
}

/** Relief map of the patch (computed in the worker). */
export async function topoCanvas(r: Region) {
  return toCanvas(await runJob<Uint8ClampedArray>({ kind: 'topo', inp: heightGrid(r) }), MAP_SIZE)
}

/** Slope map of the patch (computed in the worker). */
export async function slopeCanvas(r: Region) {
  return toCanvas(await runJob<Uint8ClampedArray>({ kind: 'slope', inp: heightGrid(r) }), MAP_SIZE)
}

// ---------- NASA Mars Trek WMTS layers: Viking MDIM 2.1 colour (optical) and USGS SIM 3292 (geology) ----------

const TREK_LAYER = 'Mars_Viking_MDIM21_ClrMosaic_global_232m'

interface Matrix {
  id: string
  w: number
  h: number
  tile: number
}
type Caps = { template: string; matrices: Matrix[] }
const capsCache = new Map<string, Promise<Caps>>()

/** Tile URL template and zoom levels of a Mars Trek layer (`ext` = tile format if the template is missing). */
function loadCaps(layer = TREK_LAYER, ext = 'jpg') {
  const hit = capsCache.get(layer)
  if (hit) return hit
  const caps: Promise<Caps> = fetch(`https://trek.nasa.gov/tiles/Mars/EQ/${layer}/1.0.0/WMTSCapabilities.xml`)
    .then((r) => {
      if (!r.ok) throw new Error(`caps ${r.status}`)
      return r.text()
    })
    .then((xml) => {
      const doc = new DOMParser().parseFromString(xml, 'application/xml')
      const all = (el: Element | Document, name: string) => Array.from(el.getElementsByTagNameNS('*', name))
      const res = all(doc, 'ResourceURL')[0]?.getAttribute('template')
      const template = res ?? `https://trek.nasa.gov/tiles/Mars/EQ/${layer}/1.0.0/default/default028mm/{TileMatrix}/{TileRow}/{TileCol}.${ext}`
      const set = all(doc, 'TileMatrixSet').find((s) => all(s, 'TileMatrix').length > 0)
      const matrices = (set ? all(set, 'TileMatrix') : []).map((m) => ({
        id: all(m, 'Identifier')[0]?.textContent?.trim() ?? '',
        w: Number(all(m, 'MatrixWidth')[0]?.textContent),
        h: Number(all(m, 'MatrixHeight')[0]?.textContent),
        tile: Number(all(m, 'TileWidth')[0]?.textContent) || 256,
      }))
      if (!matrices.length) throw new Error('no matrices')
      return { template, matrices }
    })
  capsCache.set(layer, caps)
  caps.catch(() => capsCache.delete(layer))
  return caps
}

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })

async function trekCanvas(r: Region, layer = TREK_LAYER, ext = 'jpg') {
  const { template, matrices } = await loadCaps(layer, ext)
  const nw = uvToLatLon(r, { u: 0, v: 0 })
  const se = uvToLatLon(r, { u: 1, v: 1 })
  const lonW = nw.lon
  const lonSpan = (wrapLon(se.lon - nw.lon) + 360) % 360 || 360
  const latN = nw.lat
  const latS = se.lat
  const latSpan = latN - latS
  // Finest matrix that needs at most ~25 tiles.
  let m = matrices[0]
  for (const cand of matrices) {
    const tileDeg = 360 / cand.w
    const n = (Math.ceil(lonSpan / tileDeg) + 1) * (Math.ceil(latSpan / (180 / cand.h)) + 1)
    if (n <= 25) m = cand
  }
  const tdx = 360 / m.w
  const tdy = 180 / m.h
  const c = canvas()
  const ctx = c.getContext('2d')!
  const jobs: Promise<void>[] = []
  const c0 = Math.floor((lonW + 180) / tdx)
  const c1 = Math.floor((lonW + lonSpan + 180) / tdx)
  const r0 = Math.max(0, Math.floor((90 - latN) / tdy))
  const r1 = Math.min(m.h - 1, Math.floor((90 - latS) / tdy))
  for (let row = r0; row <= r1; row++)
    for (let col = c0; col <= c1; col++) {
      const wc = ((col % m.w) + m.w) % m.w
      const url = template
        .replace('{TileMatrix}', m.id)
        .replace('{TileRow}', String(row))
        .replace('{TileCol}', String(wc))
        .replace('{Style}', 'default')
        .replace('{TileMatrixSet}', 'default028mm')
      const tLonW = col * tdx - 180
      const tLatN = 90 - row * tdy
      jobs.push(
        loadImage(url).then((img) => {
          const x = ((tLonW - lonW) / lonSpan) * OUT
          const y = ((latN - tLatN) / latSpan) * OUT
          ctx.drawImage(img, x, y, (tdx / lonSpan) * OUT, (tdy / latSpan) * OUT)
        }),
      )
    }
  await Promise.all(jobs)
  ctx.getImageData(0, 0, 1, 1) // throws if the canvas is tainted (no CORS)
  return c
}

let trekGlobe: Promise<HTMLCanvasElement> | null = null

/**
 * Whole-planet colour texture stitched from NASA Mars Trek tiles (Viking MDIM 2.1 colour mosaic),
 * the same imagery Mars Trek shows. Picks the finest tile level whose full width fits `maxWidth` px.
 * Rejects if Trek is unreachable or the tiles come without CORS; callers keep the bundled texture.
 */
export function trekGlobeCanvas(maxWidth = 4096): Promise<HTMLCanvasElement> {
  trekGlobe ??= (async () => {
    const { template, matrices } = await loadCaps()
    let m = matrices[0]
    for (const cand of matrices) if (cand.w * cand.tile <= maxWidth && cand.w * cand.tile > m.w * m.tile) m = cand
    const W = m.w * m.tile
    const c = document.createElement('canvas')
    c.width = W
    c.height = W / 2
    const ctx = c.getContext('2d')!
    // The Viking mosaic is flat and greyish next to lit 3D relief; lift colour a little so it reads like Mars Trek.
    ctx.filter = 'saturate(1.35) contrast(1.08)'
    const tw = W / m.w
    const th = W / 2 / m.h
    const queue: { row: number; col: number }[] = []
    for (let row = 0; row < m.h; row++) for (let col = 0; col < m.w; col++) queue.push({ row, col })
    // Few at a time, so the globe's ~128 tiles don't starve the regional photo requests.
    const worker = async () => {
      for (let job = queue.shift(); job; job = queue.shift()) {
        const { row, col } = job
        const url = template
          .replace('{TileMatrix}', m.id)
          .replace('{TileRow}', String(row))
          .replace('{TileCol}', String(col))
          .replace('{Style}', 'default')
          .replace('{TileMatrixSet}', 'default028mm')
        const img = await loadImage(url)
        ctx.drawImage(img, col * tw, row * th, tw, th)
      }
    }
    await Promise.all(Array.from({ length: 4 }, worker))
    ctx.getImageData(0, 0, 1, 1) // throws if the canvas is tainted (no CORS)
    return c
  })()
  trekGlobe.catch(() => {
    trekGlobe = null
  })
  return trekGlobe
}

let globeImg: Promise<HTMLImageElement> | null = null
// Baked ground photo + normal map size (light mode: 1024 px, about half the memory).
const GROUND = LITE ? 1024 : 1536

/** The texture the globe is wearing: the Mars Trek mosaic when it loads, else the bundled one. */
async function globeSource(): Promise<HTMLImageElement | HTMLCanvasElement> {
  const wait = new Promise<null>((res) => setTimeout(() => res(null), 15000))
  const trek = await Promise.race([trekGlobeCanvas().catch(() => null), wait])
  if (trek) return trek
  globeImg ??= loadImage('/globe/mars_4k.jpg')
  return globeImg
}

/** Global texture under the patch, softly upscaled (same colours as the globe). */
async function globeCrop(r: Region, S: number) {
  const img = await globeSource()
  const nw = uvToLatLon(r, { u: 0, v: 0 })
  const se = uvToLatLon(r, { u: 1, v: 1 })
  const lonSpan = (wrapLon(se.lon - nw.lon) + 360) % 360 || 360
  const sx = ((nw.lon + 180) / 360) * img.width
  const sy = ((90 - nw.lat) / 180) * img.height
  const sw = (lonSpan / 360) * img.width
  const sh = ((nw.lat - se.lat) / 180) * img.height
  // Pad the crop so the blur doesn't darken the edges.
  const pad = Math.max(sw, sh) * 0.15
  const c = canvas(S)
  const ctx = c.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.filter = `blur(${Math.round(S / Math.max(4, sw) / 2)}px)`
  ctx.drawImage(img, sx - pad, sy - pad, sw + 2 * pad, sh + 2 * pad, -pad * (S / sw), -pad * (S / sh), S * (1 + (2 * pad) / sw), S * (1 + (2 * pad) / sh))
  ctx.filter = 'none'
  return c
}

const pixels = (c: HTMLCanvasElement, S: number) => {
  const t = canvas(S)
  const ctx = t.getContext('2d')!
  ctx.drawImage(c, 0, 0, S, S)
  return ctx.getImageData(0, 0, S, S).data
}

function toCanvas(data: Uint8ClampedArray, S: number) {
  const c = canvas(S)
  c.getContext('2d')!.putImageData(new ImageData(data as Uint8ClampedArray<ArrayBuffer>, S, S), 0, 0)
  return c
}

export interface Optical {
  canvas: HTMLCanvasElement
  /** Tangent-space normal map of the baked ground detail (all layers use it). */
  normal: HTMLCanvasElement
  source: 'trek' | 'fallback'
}

// ---------- heavy image work in a Web Worker (falls back to the main thread) ----------

let worker: Worker | null | undefined
let seq = 0
const jobs = new Map<number, { resolve: (o: never) => void; job: LayerJob }>()

/** Same work on the main thread: used when workers are unavailable or one fails. */
function runHere(job: LayerJob): unknown {
  if (job.kind === 'bake') return bakeGround(job.inp)
  return job.kind === 'topo' ? topoPixels(job.inp) : job.kind === 'slope' ? slopePixels(job.inp) : radiationPixels(job.inp)
}

function failWorker() {
  worker?.terminate()
  worker = null
  // Finish whatever was in flight on the main thread.
  for (const [id, j] of jobs) {
    jobs.delete(id)
    j.resolve(runHere(j.job) as never)
  }
}

function runJob<T>(job: LayerJob): Promise<T> {
  if (worker === undefined) {
    try {
      worker = new Worker(new URL('./layers.worker.ts', import.meta.url), { type: 'module' })
      worker.onmessage = (e: MessageEvent<{ id: number; out?: unknown; error?: string }>) => {
        const j = jobs.get(e.data.id)
        if (!j) return
        jobs.delete(e.data.id)
        j.resolve((e.data.out ?? runHere(j.job)) as never)
      }
      worker.onerror = failWorker
    } catch {
      worker = null
    }
  }
  if (!worker) return Promise.resolve(runHere(job) as T)
  const id = ++seq
  return new Promise<T>((resolve) => {
    jobs.set(id, { resolve: resolve as (o: never) => void, job })
    worker!.postMessage({ id, job })
  })
}

export async function opticalCanvas(r: Region): Promise<Optical> {
  const S = GROUND
  const timeout = new Promise<null>((res) => setTimeout(() => res(null), 15000))
  const [base, photo] = await Promise.all([globeCrop(r, S), Promise.race([trekCanvas(r).catch(() => null), timeout])])
  const out = await runJob<GroundOutput>({
    kind: 'bake',
    inp: {
      size: S,
      sizeM: r.terrain.meta.sizeM,
      heights: r.terrain.heights,
      grid: REGION_GRID,
      base: pixels(base, S),
      photo: photo ? pixels(photo, S) : undefined,
      seed: (Math.round(r.lat * 100) * 73856093) ^ (Math.round(r.lon * 100) * 19349663),
      ex: REGION_EX,
    },
  })
  return { canvas: toCanvas(out.albedo, S), normal: toCanvas(out.normal, S), source: photo ? 'trek' : 'fallback' }
}

/**
 * USGS geologic map (SIM 3292, via Mars Trek) over the patch, drawn on top of the relief map so hills and
 * contours still show through the unit colours. Rejects if Trek is unreachable; callers keep the relief map.
 */
export async function geologyCanvas(r: Region, relief: HTMLCanvasElement): Promise<HTMLCanvasElement> {
  const geo = await trekCanvas(r, GEOLOGY_LAYER, 'png')
  const c = canvas()
  const ctx = c.getContext('2d')!
  ctx.drawImage(relief, 0, 0, OUT, OUT)
  ctx.globalAlpha = 0.8
  // Unit boundaries are crisp polygons: keep their edges sharp when scaled up.
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(geo, 0, 0)
  return c
}
