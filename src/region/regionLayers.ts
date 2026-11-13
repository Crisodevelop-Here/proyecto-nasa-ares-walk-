import { ROVER, SUIT } from '../data/environment'
import { wrapLon } from '../scene/mars'
import { bakeGround, type GroundInput, type GroundOutput } from './groundBake'
import { REGION_EX, REGION_GRID, uvToLatLon, type Region } from './regionTerrain'

export type RegionLayer = 'optical' | 'topo' | 'slope'
export const REGION_LAYERS: { id: RegionLayer; label: string; data: string }[] = [
  { id: 'optical', label: 'Óptica', data: 'Imagen' },
  { id: 'topo', label: 'Relieve', data: 'Topografía' },
  { id: 'slope', label: 'Pendiente', data: 'Peligro' },
]

const OUT = 1024

function canvas(size = OUT) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  return c
}

/** Hillshade (0..1) of the elevation grid, sun from the north-west at 35°. */
function shade(r: Region) {
  const g = REGION_GRID
  const h = r.terrain.heights
  const cell = r.terrain.meta.sizeM / (g - 1)
  const out = new Float32Array(g * g)
  const at = (x: number, y: number) => h[Math.min(g - 1, Math.max(0, y)) * g + Math.min(g - 1, Math.max(0, x))]
  const ex = 3
  const sun = [-0.5, 0.5, 0.71] // toward the sun: east (−0.5 = west), north, up
  const sl = Math.hypot(...sun)
  for (let y = 0; y < g; y++)
    for (let x = 0; x < g; x++) {
      const dzdx = ((at(x + 1, y) - at(x - 1, y)) / (2 * cell)) * ex
      const dzdn = ((at(x, y - 1) - at(x, y + 1)) / (2 * cell)) * ex // +north
      const nx = -dzdx
      const ny = -dzdn
      const nz = 1
      const nl = Math.hypot(nx, ny, nz)
      out[y * g + x] = Math.max(0, (nx * sun[0] + ny * sun[1] + nz * sun[2]) / (nl * sl))
    }
  return out
}

// ---------- relief: an Earth atlas map (hypsometric tints + hillshade + contour lines), Martian palette ----------

/**
 * Hypsometric tints in the spirit of Earth's physical atlases (lowlands → uplands → peaks),
 * shifted to Martian hues: no sea blue, deep basins in cold violet-grey, plains in olive-ochre,
 * uplands in rust and the highest ground in pale dust.
 */
export const RELIEF_RAMP: [number, [number, number, number]][] = [
  [0, [72, 80, 128]],
  [0.14, [78, 122, 136]],
  [0.3, [96, 128, 92]],
  [0.46, [176, 162, 96]],
  [0.62, [196, 124, 66]],
  [0.78, [150, 78, 50]],
  [0.9, [196, 160, 136]],
  [1, [246, 240, 232]],
]
function ramp(t: number): [number, number, number] {
  t = Math.min(1, Math.max(0, t))
  for (let i = 1; i < RELIEF_RAMP.length; i++)
    if (t <= RELIEF_RAMP[i][0]) {
      const [a, ca] = RELIEF_RAMP[i - 1]
      const [b, cb] = RELIEF_RAMP[i]
      const f = (t - a) / (b - a)
      return [ca[0] + (cb[0] - ca[0]) * f, ca[1] + (cb[1] - ca[1]) * f, ca[2] + (cb[2] - ca[2]) * f]
    }
  return RELIEF_RAMP[RELIEF_RAMP.length - 1][1]
}

/** Bilinear elevation and its gradient at fractional grid coordinates. */
function sampler(r: Region) {
  const g = REGION_GRID
  const h = r.terrain.heights
  const cell = r.terrain.meta.sizeM / (g - 1)
  const at = (x: number, y: number) => h[Math.min(g - 1, Math.max(0, y)) * g + Math.min(g - 1, Math.max(0, x))]
  const z = (fx: number, fy: number) => {
    const x0 = Math.floor(fx)
    const y0 = Math.floor(fy)
    const tx = fx - x0
    const ty = fy - y0
    return at(x0, y0) * (1 - tx) * (1 - ty) + at(x0 + 1, y0) * tx * (1 - ty) + at(x0, y0 + 1) * (1 - tx) * ty + at(x0 + 1, y0 + 1) * tx * ty
  }
  return { g, cell, z }
}

/** Nice contour interval giving about `n` lines over the range. */
export function contourInterval(range: number, n = 14) {
  const raw = range / n
  const steps = [1, 2, 2.5, 5, 10]
  const p = 10 ** Math.floor(Math.log10(raw))
  for (const s of steps) if (s * p >= raw) return s * p
  return 10 * p
}

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

export function topoCanvas(r: Region) {
  const S = OUT
  const { g, cell, z } = sampler(r)
  const { zMin, zMax, interval } = reliefLegend(r)
  const c = canvas(S)
  const ctx = c.getContext('2d')!
  const img = ctx.createImageData(S, S)
  const k = (g - 1) / (S - 1)
  const Z = new Float32Array(S * S)
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) Z[y * S + x] = z(x * k, y * k)
  const px = cell * k // metres per output pixel
  // Several suns (NW strongest, plus W and N) like a cartographic hillshade, with relief exaggerated
  // so gentle Martian plains still read.
  const suns = [
    [-0.6, 0.6, 0.53, 0.55],
    [-0.85, 0, 0.53, 0.25],
    [0, 0.85, 0.53, 0.2],
  ]
  const ex = 6
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const i = y * S + x
      const zx = (Z[y * S + Math.min(S - 1, x + 1)] - Z[y * S + Math.max(0, x - 1)]) / (2 * px)
      const zn = (Z[Math.max(0, y - 1) * S + x] - Z[Math.min(S - 1, y + 1) * S + x]) / (2 * px)
      const nx = -zx * ex
      const ny = -zn * ex
      const nl = Math.hypot(nx, ny, 1)
      let sh = 0
      for (const [sx, sy, sz, w] of suns) sh += (w * Math.max(0, (nx * sx + ny * sy + sz) / Math.hypot(sx, sy, sz))) / nl
      const [R, G, B] = ramp((Z[i] - zMin) / (zMax - zMin))
      const lit = 0.5 + 0.9 * sh
      let r0 = R * lit
      let g0 = G * lit
      let b0 = B * lit
      // Contour lines: where the interval band changes between neighbours. Every 5th is bolder.
      const band = Math.floor(Z[i] / interval)
      const right = x + 1 < S ? Math.floor(Z[i + 1] / interval) : band
      const down = y + 1 < S ? Math.floor(Z[i + S] / interval) : band
      if (right !== band || down !== band) {
        const idx = Math.max(band, right, down)
        const major = ((idx % 5) + 5) % 5 === 0
        const a = major ? 0.55 : 0.28
        r0 = r0 * (1 - a) + 40 * a
        g0 = g0 * (1 - a) + 22 * a
        b0 = b0 * (1 - a) + 14 * a
      }
      img.data[i * 4] = r0
      img.data[i * 4 + 1] = g0
      img.data[i * 4 + 2] = b0
      img.data[i * 4 + 3] = 255
    }
  ctx.putImageData(img, 0, 0)
  return c
}

// ---------- slope: where the rover and the crew can go ----------

/** Slope classes, tied to the rover and suit limits used by the route planner. */
export const SLOPE_CLASSES: { max: number; color: [number, number, number]; label: string; meaning: string }[] = [
  { max: 2, color: [24, 110, 84], label: '0–2°', meaning: 'Llano: aterrizaje, base y campamento' },
  { max: 5, color: [86, 168, 96], label: '2–5°', meaning: 'Rover a toda velocidad' },
  { max: ROVER.cautionSlopeDeg, color: [206, 200, 74], label: `5–${ROVER.cautionSlopeDeg}°`, meaning: 'Rover con precaución' },
  { max: ROVER.maxSlopeDeg, color: [236, 140, 48], label: `${ROVER.cautionSlopeDeg}–${ROVER.maxSlopeDeg}°`, meaning: 'Rover lento; mejor a pie' },
  { max: SUIT.maxSlopeDeg, color: [214, 58, 58], label: `${ROVER.maxSlopeDeg}–${SUIT.maxSlopeDeg}°`, meaning: 'Rover no pasa: solo a pie, en pareja' },
  { max: 90, color: [112, 30, 92], label: `> ${SUIT.maxSlopeDeg}°`, meaning: 'Intransitable incluso a pie' },
]
const classOf = (deg: number) => SLOPE_CLASSES.findIndex((c) => deg < c.max)

export interface SlopeLegend {
  /** Fraction of the patch in each class. */
  share: number[]
  maxDeg: number
}

function slopeGrid(r: Region, S: number) {
  const { g, cell, z } = sampler(r)
  const k = (g - 1) / (S - 1)
  const out = new Float32Array(S * S)
  const d = Math.max(1, k) // one grid cell
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const fx = x * k
      const fy = y * k
      const dx = (z(fx + d, fy) - z(fx - d, fy)) / (2 * cell * d)
      const dy = (z(fx, fy + d) - z(fx, fy - d)) / (2 * cell * d)
      out[y * S + x] = (Math.atan(Math.hypot(dx, dy)) * 180) / Math.PI
    }
  return out
}

export function slopeLegend(r: Region): SlopeLegend {
  const sl = slopeGrid(r, 256)
  const share = SLOPE_CLASSES.map(() => 0)
  let maxDeg = 0
  for (const v of sl) {
    share[classOf(v)]++
    maxDeg = Math.max(maxDeg, v)
  }
  return { share: share.map((n) => n / sl.length), maxDeg }
}

/** Slope coloured by what the rover / a suited crew can do, with a light hillshade underneath. */
export function slopeCanvas(r: Region) {
  const S = OUT
  const sl = slopeGrid(r, S)
  const s = shade(r)
  const g = REGION_GRID
  const c = canvas(S)
  const ctx = c.getContext('2d')!
  const img = ctx.createImageData(S, S)
  const k = (g - 1) / (S - 1)
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const i = y * S + x
      const v = sl[i]
      const ci = classOf(v)
      // Blend toward the next class near the boundary, so the map reads as a continuous field.
      const lo = ci > 0 ? SLOPE_CLASSES[ci - 1].max : 0
      const hi = SLOPE_CLASSES[ci].max
      const f = Math.min(1, Math.max(0, (v - lo) / Math.max(0.01, Math.min(hi, 40) - lo)))
      const a = SLOPE_CLASSES[ci].color
      const b = SLOPE_CLASSES[Math.min(SLOPE_CLASSES.length - 1, ci + 1)].color
      const t = Math.max(0, f - 0.75) * 1.4
      const hs = 0.6 + 0.55 * s[Math.min(g - 1, Math.round(y * k)) * g + Math.min(g - 1, Math.round(x * k))]
      for (let ch = 0; ch < 3; ch++) img.data[i * 4 + ch] = (a[ch] + (b[ch] - a[ch]) * t) * hs
      // Hatch the ground the rover cannot cross.
      if (v >= ROVER.maxSlopeDeg && (x + y) % 10 < 2) for (let ch = 0; ch < 3; ch++) img.data[i * 4 + ch] *= 0.45
      img.data[i * 4 + 3] = 255
    }
  ctx.putImageData(img, 0, 0)
  return c
}

// ---------- optical: NASA Mars Trek WMTS (Viking MDIM 2.1 colour), with offline fallback ----------

const TREK_LAYER = 'Mars_Viking_MDIM21_ClrMosaic_global_232m'
const TREK_CAPS = `https://trek.nasa.gov/tiles/Mars/EQ/${TREK_LAYER}/1.0.0/WMTSCapabilities.xml`

interface Matrix {
  id: string
  w: number
  h: number
  tile: number
}
let caps: Promise<{ template: string; matrices: Matrix[] }> | null = null

function loadCaps() {
  caps ??= fetch(TREK_CAPS)
    .then((r) => {
      if (!r.ok) throw new Error(`caps ${r.status}`)
      return r.text()
    })
    .then((xml) => {
      const doc = new DOMParser().parseFromString(xml, 'application/xml')
      const all = (el: Element | Document, name: string) => Array.from(el.getElementsByTagNameNS('*', name))
      const res = all(doc, 'ResourceURL')[0]?.getAttribute('template')
      const template = res ?? `https://trek.nasa.gov/tiles/Mars/EQ/${TREK_LAYER}/1.0.0/default/default028mm/{TileMatrix}/{TileRow}/{TileCol}.jpg`
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
  caps.catch(() => {
    caps = null
  })
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

async function trekCanvas(r: Region) {
  const { template, matrices } = await loadCaps()
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
const GROUND = 1536

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

// ---------- ground bake in a Web Worker (falls back to the main thread) ----------

let bakeWorker: Worker | null | undefined
let bakeSeq = 0
const bakeJobs = new Map<number, { resolve: (o: GroundOutput) => void; inp: GroundInput }>()

function failWorker() {
  bakeWorker?.terminate()
  bakeWorker = null
  // Finish whatever was in flight on the main thread.
  for (const [id, job] of bakeJobs) {
    bakeJobs.delete(id)
    job.resolve(bakeGround(job.inp))
  }
}

function bakeOffThread(inp: GroundInput): Promise<GroundOutput> {
  if (bakeWorker === undefined) {
    try {
      bakeWorker = new Worker(new URL('./groundBake.worker.ts', import.meta.url), { type: 'module' })
      bakeWorker.onmessage = (e: MessageEvent<{ id: number; out?: GroundOutput; error?: string }>) => {
        const job = bakeJobs.get(e.data.id)
        if (!job) return
        bakeJobs.delete(e.data.id)
        job.resolve(e.data.out ?? bakeGround(job.inp))
      }
      bakeWorker.onerror = failWorker
    } catch {
      bakeWorker = null
    }
  }
  if (!bakeWorker) return Promise.resolve(bakeGround(inp))
  const id = ++bakeSeq
  return new Promise((resolve) => {
    bakeJobs.set(id, { resolve, inp })
    bakeWorker!.postMessage({ id, inp })
  })
}

export async function opticalCanvas(r: Region): Promise<Optical> {
  const S = GROUND
  const timeout = new Promise<null>((res) => setTimeout(() => res(null), 15000))
  const [base, photo] = await Promise.all([globeCrop(r, S), Promise.race([trekCanvas(r).catch(() => null), timeout])])
  const out = await bakeOffThread({
    size: S,
    sizeM: r.terrain.meta.sizeM,
    heights: r.terrain.heights,
    grid: REGION_GRID,
    base: pixels(base, S),
    photo: photo ? pixels(photo, S) : undefined,
    seed: (Math.round(r.lat * 100) * 73856093) ^ (Math.round(r.lon * 100) * 19349663),
    ex: REGION_EX,
  })
  return { canvas: toCanvas(out.albedo, S), normal: toCanvas(out.normal, S), source: photo ? 'trek' : 'fallback' }
}
