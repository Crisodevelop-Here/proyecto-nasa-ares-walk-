/**
 * Relief and slope map pixels for a regional patch. Pure functions over typed arrays (no DOM, no
 * three.js), so they run in the same Web Worker as the ground bake and the page doesn't freeze.
 */
import { doseAtElevation, ROVER, SUIT } from '../data/environment'

/** The elevation grid of a regional patch. */
export interface HeightGrid {
  /** Elevation in metres, grid × grid, row-major from the north-west. */
  heights: Float32Array
  grid: number
  /** Side of the patch in metres. */
  sizeM: number
  zMin: number
  zMax: number
}

/** Output size of the relief and slope maps (px per side). */
export const MAP_SIZE = 1024

// ---------- shared helpers ----------

/** Hillshade (0..1) of the elevation grid, sun from the north-west at 35°. */
function shade(h: HeightGrid) {
  const g = h.grid
  const cell = h.sizeM / (g - 1)
  const out = new Float32Array(g * g)
  const at = (x: number, y: number) => h.heights[Math.min(g - 1, Math.max(0, y)) * g + Math.min(g - 1, Math.max(0, x))]
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

/** Bilinear elevation at fractional grid coordinates. */
function sampler(h: HeightGrid) {
  const g = h.grid
  const cell = h.sizeM / (g - 1)
  const at = (x: number, y: number) => h.heights[Math.min(g - 1, Math.max(0, y)) * g + Math.min(g - 1, Math.max(0, x))]
  const z = (fx: number, fy: number) => {
    const x0 = Math.floor(fx)
    const y0 = Math.floor(fy)
    const tx = fx - x0
    const ty = fy - y0
    return at(x0, y0) * (1 - tx) * (1 - ty) + at(x0 + 1, y0) * tx * (1 - ty) + at(x0, y0 + 1) * (1 - tx) * ty + at(x0 + 1, y0 + 1) * tx * ty
  }
  return { g, cell, z }
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

/** Nice contour interval giving about `n` lines over the range. */
export function contourInterval(range: number, n = 14) {
  const raw = range / n
  const steps = [1, 2, 2.5, 5, 10]
  const p = 10 ** Math.floor(Math.log10(raw))
  for (const s of steps) if (s * p >= raw) return s * p
  return 10 * p
}

/** Relief map (RGBA, size × size): tints + multi-sun hillshade + contour lines. */
export function topoPixels(h: HeightGrid, S = MAP_SIZE): Uint8ClampedArray {
  const { g, cell, z } = sampler(h)
  const { zMin, zMax } = h
  const interval = contourInterval(zMax - zMin)
  const data = new Uint8ClampedArray(S * S * 4)
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
      data[i * 4] = r0
      data[i * 4 + 1] = g0
      data[i * 4 + 2] = b0
      data[i * 4 + 3] = 255
    }
  return data
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
export const classOf = (deg: number) => SLOPE_CLASSES.findIndex((c) => deg < c.max)

/** Slope in degrees on an S × S grid over the patch. */
export function slopeGrid(h: HeightGrid, S: number) {
  const { g, cell, z } = sampler(h)
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

/** Slope map (RGBA, size × size) coloured by what the rover / a suited crew can do, light hillshade underneath. */
export function slopePixels(h: HeightGrid, S = MAP_SIZE): Uint8ClampedArray {
  const sl = slopeGrid(h, S)
  const s = shade(h)
  const g = h.grid
  const data = new Uint8ClampedArray(S * S * 4)
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
      for (let ch = 0; ch < 3; ch++) data[i * 4 + ch] = (a[ch] + (b[ch] - a[ch]) * t) * hs
      // Hatch the ground the rover cannot cross.
      if (v >= ROVER.maxSlopeDeg && (x + y) % 10 < 2) for (let ch = 0; ch < 3; ch++) data[i * 4 + ch] *= 0.45
      data[i * 4 + 3] = 255
    }
  return data
}

// ---------- radiation: estimated surface dose from the elevation (less atmosphere overhead = more dose) ----------

/**
 * Fixed scale for the whole planet, so a colour means the same dose everywhere: from the floor of
 * Hellas (about −8.2 km, the most air overhead) to the top of Olympus Mons (about +21.9 km).
 */
export const DOSE_SCALE = { min: doseAtElevation(-8200), max: doseAtElevation(21_900) }

/** Low dose (cool green) → high dose (red, then magenta). */
export const DOSE_RAMP: [number, [number, number, number]][] = [
  [0, [34, 120, 96]],
  [0.25, [120, 176, 80]],
  [0.5, [224, 200, 64]],
  [0.75, [232, 112, 48]],
  [1, [184, 40, 96]],
]
function doseColor(t: number): [number, number, number] {
  t = Math.min(1, Math.max(0, t))
  for (let i = 1; i < DOSE_RAMP.length; i++)
    if (t <= DOSE_RAMP[i][0]) {
      const [a, ca] = DOSE_RAMP[i - 1]
      const [b, cb] = DOSE_RAMP[i]
      const f = (t - a) / (b - a)
      return [ca[0] + (cb[0] - ca[0]) * f, ca[1] + (cb[1] - ca[1]) * f, ca[2] + (cb[2] - ca[2]) * f]
    }
  return DOSE_RAMP[DOSE_RAMP.length - 1][1]
}

/** Spacing of the equal-dose lines, mSv per sol. */
export const DOSE_STEP = 0.01

/** Radiation map (RGBA, size × size): dose colour on the planet-wide scale, light hillshade, equal-dose lines. */
export function radiationPixels(h: HeightGrid, S = MAP_SIZE): Uint8ClampedArray {
  const { g, z } = sampler(h)
  const s = shade(h)
  const k = (g - 1) / (S - 1)
  const D = new Float32Array(S * S)
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) D[y * S + x] = doseAtElevation(z(x * k, y * k))
  const data = new Uint8ClampedArray(S * S * 4)
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const i = y * S + x
      const [R, G, B] = doseColor((D[i] - DOSE_SCALE.min) / (DOSE_SCALE.max - DOSE_SCALE.min))
      const hs = 0.62 + 0.5 * s[Math.min(g - 1, Math.round(y * k)) * g + Math.min(g - 1, Math.round(x * k))]
      let r0 = R * hs
      let g0 = G * hs
      let b0 = B * hs
      // Equal-dose lines, like contour lines but in mSv.
      const band = Math.floor(D[i] / DOSE_STEP)
      const right = x + 1 < S ? Math.floor(D[i + 1] / DOSE_STEP) : band
      const down = y + 1 < S ? Math.floor(D[i + S] / DOSE_STEP) : band
      if (right !== band || down !== band) {
        r0 *= 0.55
        g0 *= 0.55
        b0 *= 0.55
      }
      data[i * 4] = r0
      data[i * 4 + 1] = g0
      data[i * 4 + 2] = b0
      data[i * 4 + 3] = 255
    }
  return data
}
