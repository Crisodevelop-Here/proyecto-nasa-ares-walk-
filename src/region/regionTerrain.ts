import { ROVER } from '../data/environment'
import type { Milestone, Mission } from '../data/missions'
import { MOLA_HI, MOLA_LO, wrapLon } from '../scene/mars'
import { buildTerrain, uvToCell, type Terrain } from '../terrain/terrain'
import type { Station, TerrainMeta, UV } from '../types'

/** Default side of the regional patch (km), elevation grid and navigation grid. */
export const REGION_KM = 120
export const REGION_MIN_KM = 30
export const REGION_GRID = 256
export const REGION_NAV = 128
/** Vertical exaggeration of the regional relief. */
export const REGION_EX = 3

const MARS_R_M = 3_389_500
const deg = Math.PI / 180

export interface Region {
  lat: number
  lon: number
  /** Side of the patch in km. */
  sizeKm: number
  terrain: Terrain
  /** 'mola32' = 32 px/deg tiles (≈1.85 km/px); 'mola4' = global 4 px/deg fallback. */
  source: 'mola32' | 'mola4'
  /** Elevation at the centre and mean of the patch (m, MOLA areoid). */
  centerZ: number
  meanZ: number
  /** Fraction of the patch steeper than the rover limit. */
  blockedFrac: number
}

const cosLat = (lat: number) => Math.max(0.05, Math.cos(lat * deg))

type Frame = { lat: number; lon: number; sizeKm?: number }

export function uvToLatLon(r: Frame, { u, v }: UV) {
  const s = (r.sizeKm ?? REGION_KM) * 1000
  const north = (0.5 - v) * s
  const east = (u - 0.5) * s
  return { lat: Math.max(-90, Math.min(90, r.lat + north / MARS_R_M / deg)), lon: wrapLon(r.lon + east / (MARS_R_M * cosLat(r.lat)) / deg) }
}

export function latLonToUV(r: Frame, lat: number, lon: number): UV {
  const s = (r.sizeKm ?? REGION_KM) * 1000
  const north = (lat - r.lat) * deg * MARS_R_M
  const east = wrapLon(lon - r.lon) * deg * MARS_R_M * cosLat(r.lat)
  return { u: 0.5 + east / s, v: 0.5 - north / s }
}

export const insidePatch = ({ u, v }: UV, m = 0) => u >= m && u <= 1 - m && v >= m && v <= 1 - m

// ---------- MOLA 32 px/deg tiles ----------

const PPD = 32
const TILE = 320
const W = 360 * PPD
const H = 180 * PPD
const tiles = new Map<string, Promise<Int16Array | null>>()
/** Tiles kept in memory (~200 KB each); the least recently used are dropped. */
const MAX_TILES = 48

function loadTile(row: number, col: number) {
  const key = `r${row}_c${col}`
  let p = tiles.get(key)
  if (p) {
    // Mark as most recently used.
    tiles.delete(key)
    tiles.set(key, p)
  } else {
    p = fetch(`/mola32/${key}.bin`)
      .then((r) => (r.ok ? r.arrayBuffer() : null))
      .then((b) => (b && b.byteLength === TILE * TILE * 2 ? new Int16Array(b) : null))
      .catch(() => null)
    tiles.set(key, p)
    while (tiles.size > MAX_TILES) tiles.delete(tiles.keys().next().value!)
  }
  return p
}

const cubic = (p0: number, p1: number, p2: number, p3: number, t: number) => p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)))

async function mola32Sampler(lats: [number, number], lons: number[]) {
  // Tiles under the patch plus a few pixels around (bicubic sampling can cross a tile edge).
  const pad = 3 / PPD
  const rows = new Set<number>()
  const cols = new Set<number>()
  const r0 = Math.max(0, Math.floor((90 - Math.min(90, lats[1] + pad)) / 10))
  const r1 = Math.min(17, Math.floor((90 - Math.max(-90, lats[0] - pad)) / 10))
  for (let r = r0; r <= r1; r++) rows.add(r)
  for (const lon of lons) for (const d of [-pad, 0, pad]) cols.add(((Math.floor((wrapLon(lon + d) + 180) / 10) % 36) + 36) % 36)
  const loaded = new Map<string, Int16Array>()
  await Promise.all(
    [...rows].flatMap((r) =>
      [...cols].map(async (c) => {
        const t = await loadTile(r, c)
        if (!t) throw new Error('missing tile')
        loaded.set(`${r}_${c}`, t)
      }),
    ),
  )
  const px = (ix: number, iy: number) => {
    ix = ((ix % W) + W) % W
    iy = Math.min(H - 1, Math.max(0, iy))
    const t = loaded.get(`${(iy / TILE) | 0}_${(ix / TILE) | 0}`)
    return t ? t[(iy % TILE) * TILE + (ix % TILE)] : NaN
  }
  return (lat: number, lon: number) => {
    const x = (wrapLon(lon) + 180) * PPD - 0.5
    const y = (90 - lat) * PPD - 0.5
    const x0 = Math.floor(x)
    const y0 = Math.floor(y)
    const fx = x - x0
    const fy = y - y0
    // Bicubic (Catmull-Rom): bilinear on ~1.8 km pixels looks faceted once the patch is zoomed in.
    const ok = px(x0, y0)
    const at = (i: number, j: number) => {
      const z = px(x0 + i, y0 + j)
      return Number.isNaN(z) ? (Number.isNaN(ok) ? 0 : ok) : z
    }
    const row = (j: number) => cubic(at(-1, j), at(0, j), at(1, j), at(2, j), fx)
    return cubic(row(-1), row(0), row(1), row(2), fy)
  }
}

// ---------- fallback: the globe's 8-bit MOLA texture ----------

let globalPx: Promise<{ data: Uint8ClampedArray; w: number; h: number }> | null = null
function mola4Sampler() {
  globalPx ??= new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = img.width
      c.height = img.height
      const ctx = c.getContext('2d')!
      ctx.drawImage(img, 0, 0)
      resolve({ data: ctx.getImageData(0, 0, c.width, c.height).data, w: c.width, h: c.height })
    }
    img.onerror = reject
    img.src = '/globe/mola_height.png'
  })
  return globalPx.then(({ data, w, h }) => (lat: number, lon: number) => {
    const x = Math.min(w - 1, Math.max(0, Math.round(((wrapLon(lon) + 180) / 360) * w)))
    const y = Math.min(h - 1, Math.max(0, Math.round(((90 - lat) / 180) * h)))
    return MOLA_LO + (data[(y * w + x) * 4] / 255) * (MOLA_HI - MOLA_LO)
  })
}

/** Builds the regional terrain around (lat, lon) from MOLA, ready for A* and the 3D mesh. */
export async function buildRegion(lat: number, lon: number, sizeKm = REGION_KM): Promise<Region> {
  lat = Math.max(-84, Math.min(84, lat))
  const center = { lat, lon, sizeKm }
  const nw = uvToLatLon(center, { u: 0, v: 0 })
  const se = uvToLatLon(center, { u: 1, v: 1 })
  const lons: number[] = []
  const lonSpan = wrapLon(se.lon - nw.lon)
  for (let i = 0; i <= 8; i++) lons.push(nw.lon + (lonSpan * i) / 8)

  let sample: (lat: number, lon: number) => number
  let source: Region['source'] = 'mola32'
  try {
    sample = await mola32Sampler([se.lat, nw.lat], lons)
  } catch {
    sample = await mola4Sampler()
    source = 'mola4'
  }

  const g = REGION_GRID
  const heights = new Float32Array(g * g)
  let zMin = Infinity
  let zMax = -Infinity
  for (let y = 0; y < g; y++)
    for (let x = 0; x < g; x++) {
      const p = uvToLatLon(center, { u: x / (g - 1), v: y / (g - 1) })
      const z = sample(p.lat, p.lon)
      heights[y * g + x] = z
      if (z < zMin) zMin = z
      if (z > zMax) zMax = z
    }
  if (zMax - zMin < 1) zMax = zMin + 1

  const meta: TerrainMeta = {
    source: source === 'mola32' ? 'MGS MOLA MEGDR 32 px/grado (PDS)' : 'MGS MOLA MEGDR 4 px/grado (respaldo)',
    site: 'Región',
    sizeM: sizeKm * 1000,
    grid: g,
    zMin,
    zMax,
    metersPerPixel: (sizeKm * 1000) / g,
    nw: [nw.lat, nw.lon],
    se: [se.lat, se.lon],
  }
  const terrain = buildTerrain(meta, heights, REGION_NAV)
  // Roughness at ~1 km cells is tens of metres; rescale so it slows the rover rather than stopping it.
  for (let i = 0; i < terrain.navRough.length; i++) terrain.navRough[i] *= 0.02

  let mean = 0
  for (let i = 0; i < heights.length; i++) mean += heights[i]
  mean /= heights.length
  let blocked = 0
  for (let i = 0; i < terrain.navSlope.length; i++) if (terrain.navSlope[i] > ROVER.maxSlopeDeg) blocked++

  return { lat, lon, sizeKm, terrain, source, centerZ: heights[(g >> 1) * g + (g >> 1)], meanZ: mean, blockedFrac: blocked / terrain.navSlope.length }
}

// ---------- stops ----------

function flattestNear(t: Terrain, uv: UV, radius: number): UV {
  const n = t.nav
  const c = uvToCell(uv, n)
  const r = Math.max(1, Math.round(radius * n))
  let best = { x: c.x, y: c.y, s: Infinity }
  for (let y = c.y - r; y <= c.y + r; y++)
    for (let x = c.x - r; x <= c.x + r; x++) {
      if (x < 1 || y < 1 || x >= n - 1 || y >= n - 1) continue
      const s = t.navSlope[y * n + x] + 0.02 * Math.hypot(x - c.x, y - c.y)
      if (s < best.s) best = { x, y, s }
    }
  return { u: (best.x + 0.5) / n, v: (best.y + 0.5) / n }
}

/**
 * Base camp: next to the landing site of a past mission when there is one in the patch (a spot
 * already proven flat and safe to land on), otherwise the flattest ground near the centre.
 */
export function habitatFor(r: Region, missions: Mission[] = []): Station {
  const landing = missions.map((m) => ({ m, uv: latLonToUV(r, m.lat, m.lon) })).find((x) => insidePatch(x.uv, 0.06))
  const p = flattestNear(r.terrain, landing?.uv ?? { u: 0.5, v: 0.5 }, landing ? 0.02 : 0.06)
  return {
    id: 'hab',
    name: 'Base / rover presurizado',
    kind: 'habitat',
    emoji: '🏠',
    ...p,
    goal: 'Punto de salida y regreso de la travesía.',
    why: landing
      ? `Junto al sitio de aterrizaje de ${landing.m.name.split(' (')[0]}: terreno llano ya comprobado por una nave.`
      : 'La zona más llana cerca del punto elegido: el rover y la nave pueden estacionar.',
    tools: ['Rover presurizado', 'Recarga de O₂ y baterías'],
    workMin: 0,
  }
}

/** Min distance between two stops (fraction of the patch side), so labels and work areas don't overlap. */
const STOP_GAP = 0.07

/** Stops from past-mission milestones inside the patch (what they did is the reason to go). */
export function missionStops(r: Region, missions: Mission[], from: UV = { u: 0.5, v: 0.5 }, max = 3): Station[] {
  const inside: { m: Mission; s: Milestone; uv: UV }[] = []
  for (const m of missions)
    for (const s of m.milestones) {
      const uv = latLonToUV(r, s.lat, s.lon)
      if (insidePatch(uv, 0.04)) inside.push({ m, s, uv })
    }
  if (!inside.length) return []
  const dist = (a: UV, b: UV) => Math.hypot(a.u - b.u, a.v - b.v)
  // Spread the picks: greedy farthest-point from the base outward, never closer than STOP_GAP.
  const picks: typeof inside = []
  const pool = inside.filter((c) => dist(c.uv, from) >= STOP_GAP).sort((a, b) => b.s.sol - a.s.sol)
  while (picks.length < max && pool.length) {
    let bestI = -1
    let bestD = -1
    pool.forEach((c, i) => {
      const near = Math.min(...picks.map((p) => dist(c.uv, p.uv)), Infinity)
      if (near < STOP_GAP) return
      const d = Math.min(dist(c.uv, from) * 0.3, near)
      if (d > bestD) {
        bestD = d
        bestI = i
      }
    })
    if (bestI < 0) break
    picks.push(pool.splice(bestI, 1)[0])
  }
  return orderStops(
    picks.map(({ m, s, uv }) => ({
      id: `${m.id}-${s.sol}`,
      name: s.title,
      kind: 'science' as const,
      emoji: '📍',
      ...flattestNear(r.terrain, uv, 0.015),
      goal: `Volver a donde ${m.name.split(' ')[0]} trabajó (sol ${s.sol}) y ampliar su estudio con ojos humanos.`,
      why: s.finding ?? s.what,
      tools: ['Taladro de núcleos', 'Espectrómetro de mano', 'Cámara estéreo'],
      workMin: 45,
    })),
    from,
  )
}

/** Stops picked from the terrain: the cells with the most relief contrast that a rover can reach. */
export function terrainStops(r: Region, max = 3): Station[] {
  const t = r.terrain
  const n = t.nav
  const rad = 4
  const cands: { x: number; y: number; score: number; dz: number }[] = []
  for (let y = rad; y < n - rad; y += 2)
    for (let x = rad; x < n - rad; x += 2) {
      const d = Math.hypot((x + 0.5) / n - 0.5, (y + 0.5) / n - 0.5)
      if (d < 0.1 || d > 0.4) continue
      if (t.navSlope[y * n + x] > ROVER.maxSlopeDeg * 0.7) continue
      let s = 0
      let s2 = 0
      let k = 0
      for (let j = -rad; j <= rad; j++)
        for (let i = -rad; i <= rad; i++) {
          const z = t.navZ[(y + j) * n + x + i]
          s += z
          s2 += z * z
          k++
        }
      const mean = s / k
      const std = Math.sqrt(Math.max(0, s2 / k - mean * mean))
      cands.push({ x, y, score: std, dz: t.navZ[y * n + x] - mean })
    }
  cands.sort((a, b) => b.score - a.score)
  const picks: typeof cands = []
  for (const c of cands) {
    if (picks.length >= max) break
    if (picks.every((p) => Math.hypot(p.x - c.x, p.y - c.y) / n > 0.18)) picks.push(c)
  }
  return orderStops(
    picks.map((c, i) => {
      const high = c.dz > c.score * 0.3
      const low = c.dz < -c.score * 0.3
      return {
        id: `stop${i}`,
        name: `${high ? 'Escarpe con capas' : low ? 'Fondo de depresión' : 'Ladera de contraste'} ${String.fromCharCode(65 + i)}`,
        kind: 'science' as const,
        emoji: high ? '🏔️' : low ? '🪨' : '🧭',
        u: (c.x + 0.5) / n,
        v: (c.y + 0.5) / n,
        goal: high
          ? 'Fotografiar y muestrear las capas expuestas en el escarpe.'
          : low
            ? 'Buscar sedimentos finos depositados por agua o viento.'
            : 'Medir el cambio de roca a lo largo de la ladera.',
        why: `El relieve local varía ±${Math.round(c.score)} m: aquí afloran rocas de distintas épocas, algo que un humano interpreta en minutos.`,
        tools: ['Martillo de roca', 'Espectrómetro de mano', 'Cámara estéreo'],
        workMin: 40,
      }
    }),
  )
}

/** Nearest-neighbour order from the base, so the loop doesn't zig-zag. */
function orderStops(stops: Station[], from: UV = { u: 0.5, v: 0.5 }) {
  const out: Station[] = []
  let cur = from
  const pool = [...stops]
  while (pool.length) {
    let bi = 0
    pool.forEach((s, i) => {
      if (Math.hypot(s.u - cur.u, s.v - cur.v) < Math.hypot(pool[bi].u - cur.u, pool[bi].v - cur.v)) bi = i
    })
    cur = pool[bi]
    out.push(pool.splice(bi, 1)[0])
  }
  return out
}

/**
 * Where to centre the patch and how big to make it: if past missions worked near the click,
 * frame their whole traverse (so their path and milestones are readable); otherwise the default.
 */
export function frameFor(lat: number, lon: number, missions: { lat: number; lon: number; track: [number, number][]; milestones: { lat: number; lon: number }[] }[]) {
  const pts: [number, number][] = []
  for (const m of missions) pts.push([m.lat, m.lon], ...m.track, ...m.milestones.map((s) => [s.lat, s.lon] as [number, number]))
  if (!pts.length) return { lat, lon, sizeKm: REGION_KM }
  const lats = pts.map((p) => p[0])
  const lons = pts.map((p) => lon + wrapLon(p[1] - lon))
  const cLat = (Math.min(...lats) + Math.max(...lats)) / 2
  const cLon = wrapLon((Math.min(...lons) + Math.max(...lons)) / 2)
  const kmLat = (Math.max(...lats) - Math.min(...lats)) * deg * (MARS_R_M / 1000)
  const kmLon = (Math.max(...lons) - Math.min(...lons)) * deg * (MARS_R_M / 1000) * cosLat(cLat)
  const sizeKm = Math.min(REGION_KM, Math.max(REGION_MIN_KM, Math.max(kmLat, kmLon) * 1.6 + 8))
  return { lat: cLat, lon: cLon, sizeKm }
}
