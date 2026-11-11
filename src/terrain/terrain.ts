import type { TerrainMeta, UV } from '../types'

/** Path-planning grid resolution (cells per side). 256 → ~8 m cells for a 2 km crop. */
export const NAV = 256

export interface Terrain {
  meta: TerrainMeta
  /** Elevation in metres, meta.grid × meta.grid, row-major from the north-west corner. */
  heights: Float32Array
  /** Navigation grids (NAV × NAV). */
  navZ: Float32Array
  navSlope: Float32Array
  navRough: Float32Array
  cellM: number
  /** Navigation grid size (cells per side). */
  nav: number
}

export async function loadTerrain(base = '/terrain'): Promise<Terrain> {
  const [meta, buf] = await Promise.all([
    fetch(`${base}/meta.json`).then((r) => r.json() as Promise<TerrainMeta>),
    fetch(`${base}/height.bin`).then((r) => r.arrayBuffer()),
  ])
  const raw = new Uint16Array(buf)
  const span = meta.zMax - meta.zMin
  const heights = new Float32Array(raw.length)
  for (let i = 0; i < raw.length; i++) heights[i] = meta.zMin + (raw[i] / 65535) * span
  return buildTerrain(meta, heights)
}

export function buildTerrain(meta: TerrainMeta, heights: Float32Array, NAV_ = NAV): Terrain {
  const NAV = NAV_
  const g = meta.grid
  const f = g / NAV
  const cellM = meta.sizeM / NAV
  const navZ = new Float32Array(NAV * NAV)
  for (let y = 0; y < NAV; y++)
    for (let x = 0; x < NAV; x++) {
      let s = 0
      for (let j = 0; j < f; j++) for (let i = 0; i < f; i++) s += heights[(y * f + j) * g + x * f + i]
      navZ[y * NAV + x] = s / (f * f)
    }
  const navSlope = new Float32Array(NAV * NAV)
  const navRough = new Float32Array(NAV * NAV)
  const at = (x: number, y: number) => navZ[Math.min(NAV - 1, Math.max(0, y)) * NAV + Math.min(NAV - 1, Math.max(0, x))]
  for (let y = 0; y < NAV; y++)
    for (let x = 0; x < NAV; x++) {
      const dzdx = (at(x + 1, y) - at(x - 1, y)) / (2 * cellM)
      const dzdy = (at(x, y + 1) - at(x, y - 1)) / (2 * cellM)
      navSlope[y * NAV + x] = (Math.atan(Math.hypot(dzdx, dzdy)) * 180) / Math.PI
      // Roughness: deviation from the plane through the 4 neighbours (m).
      const mean = (at(x + 1, y) + at(x - 1, y) + at(x, y + 1) + at(x, y - 1)) / 4
      navRough[y * NAV + x] = Math.abs(at(x, y) - mean)
    }
  return { meta, heights, navZ, navSlope, navRough, cellM, nav: NAV }
}

/** Bilinear elevation (m) at normalized coordinates. */
export function heightAt(t: Terrain, { u, v }: UV) {
  const g = t.meta.grid
  const x = Math.min(g - 1.001, Math.max(0, u * (g - 1)))
  const y = Math.min(g - 1.001, Math.max(0, v * (g - 1)))
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const fx = x - x0
  const fy = y - y0
  const h = t.heights
  const a = h[y0 * g + x0]
  const b = h[y0 * g + x0 + 1]
  const c = h[(y0 + 1) * g + x0]
  const d = h[(y0 + 1) * g + x0 + 1]
  return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy
}

export const uvToCell = ({ u, v }: UV, n = NAV) => ({
  x: Math.min(n - 1, Math.max(0, Math.floor(u * n))),
  y: Math.min(n - 1, Math.max(0, Math.floor(v * n))),
})

export const cellToUV = (x: number, y: number, n = NAV): UV => ({ u: (x + 0.5) / n, v: (y + 0.5) / n })

export function slopeAt(t: Terrain, p: UV) {
  const { x, y } = uvToCell(p, t.nav)
  return t.navSlope[y * t.nav + x]
}
