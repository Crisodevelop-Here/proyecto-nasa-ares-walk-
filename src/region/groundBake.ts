/**
 * Bakes the ground of a regional patch so it reads like the planet seen from orbit, only closer:
 * the large-scale colour comes from the same global texture as the globe (so the patch blends into
 * it), and the structure below MOLA's ~1.8 km pixels is added on top: small craters with rims and
 * dark floors, fractal roughness, bright dust on high ground, dark sand in lows and rock on slopes.
 *
 * The sub-MOLA detail is procedural (a plausible Martian surface, not measured data) and is used
 * only for the picture: the mesh, slopes and routes still come from MOLA alone.
 *
 * Pure function over typed arrays so it can run in a Web Worker.
 */

export interface GroundInput {
  /** Output size (px per side). */
  size: number
  /** Side of the patch in metres. */
  sizeM: number
  /** MOLA elevation grid (m), grid × grid, row-major from the north-west. */
  heights: Float32Array
  grid: number
  /** Global-texture colour under the patch, size × size RGBA. */
  base: Uint8ClampedArray
  /** Optional orbital image (e.g. Viking MDIM via Mars Trek), size × size RGBA: real detail. */
  photo?: Uint8ClampedArray
  /** Seed so the same spot always gets the same craters. */
  seed: number
  /** Vertical exaggeration used by the mesh (normals match it). */
  ex: number
}

export interface GroundOutput {
  albedo: Uint8ClampedArray
  normal: Uint8ClampedArray
}

// ---------- noise ----------

function hash(x: number, y: number, s: number) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(s, 1442695041)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

function valueNoise(x: number, y: number, s: number) {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const fx = x - xi
  const fy = y - yi
  const ux = fx * fx * (3 - 2 * fx)
  const uy = fy * fy * (3 - 2 * fy)
  const a = hash(xi, yi, s)
  const b = hash(xi + 1, yi, s)
  const c = hash(xi, yi + 1, s)
  const d = hash(xi + 1, yi + 1, s)
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy
}

function mulberry(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

// ---------- bake ----------

export function bakeGround(inp: GroundInput): GroundOutput {
  const S = inp.size
  const N = S * S
  const mpp = inp.sizeM / S
  const g = inp.grid
  const H = inp.heights

  // MOLA local relief (height above a ~12 % blur) and slope, sampled bilinearly per pixel.
  const rad = Math.max(2, Math.round(g * 0.06))
  const blur = boxBlur(H, g, rad)
  const relief = new Float32Array(g * g)
  let relStd = 0
  for (let i = 0; i < g * g; i++) {
    relief[i] = H[i] - blur[i]
    relStd += relief[i] * relief[i]
  }
  relStd = Math.sqrt(relStd / (g * g)) || 1
  const cellM = inp.sizeM / (g - 1)
  const slopeG = new Float32Array(g * g)
  for (let y = 0; y < g; y++)
    for (let x = 0; x < g; x++) {
      const at = (xx: number, yy: number) => H[Math.min(g - 1, Math.max(0, yy)) * g + Math.min(g - 1, Math.max(0, xx))]
      const dx = (at(x + 1, y) - at(x - 1, y)) / (2 * cellM)
      const dy = (at(x, y + 1) - at(x, y - 1)) / (2 * cellM)
      slopeG[y * g + x] = (Math.atan(Math.hypot(dx, dy)) * 180) / Math.PI
    }
  const gridAt = (arr: Float32Array, u: number, v: number) => {
    const x = Math.min(g - 1.001, Math.max(0, u * (g - 1)))
    const y = Math.min(g - 1.001, Math.max(0, v * (g - 1)))
    const x0 = x | 0
    const y0 = y | 0
    const fx = x - x0
    const fy = y - y0
    const i = y0 * g + x0
    return arr[i] * (1 - fx) * (1 - fy) + arr[i + 1] * fx * (1 - fy) + arr[i + g] * (1 - fx) * fy + arr[i + g + 1] * fx * fy
  }

  // Detail height (m, render only) and an albedo offset, both per pixel.
  const D = new Float32Array(N)
  const A = new Float32Array(N)

  // 1) Fractal roughness: octaves from ~1/6 of the patch down to ~3 px, amplitude ∝ wavelength.
  const s = inp.seed
  const lMax = Math.min(inp.sizeM / 6, 6000)
  const lMin = Math.max(3 * mpp, 30)
  const octaves: { f: number; a: number; s: number }[] = []
  for (let l = lMax; l >= lMin; l /= 2.1) octaves.push({ f: mpp / l, a: l * 0.012, s: s + octaves.length * 101 })
  const fLow = mpp / Math.min(inp.sizeM / 3, 15000)
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      let h = 0
      for (const o of octaves) {
        // Ridged octaves read as wind-eroded rock rather than soft hills.
        const n = valueNoise(x * o.f, y * o.f, o.s)
        h += (1 - Math.abs(2 * n - 1) - 0.5) * o.a
      }
      const i = y * S + x
      D[i] = h
      // Large patches of brighter dust and darker sand, plus a fine grain.
      A[i] = (valueNoise(x * fLow, y * fLow, s + 7) - 0.5) * 0.28 + (valueNoise(x * fLow * 4, y * fLow * 4, s + 9) - 0.5) * 0.12
    }

  // 2) Craters: Mars-like size–frequency (N(>D) ∝ D⁻²), from ~5 px to ~1/7 of the patch.
  const rnd = mulberry(s * 2654435761)
  const dMin = Math.max(6 * mpp, 60)
  const dMax = Math.max(dMin * 2, inp.sizeM / 7)
  const count = Math.round(Math.min(900, Math.max(160, (inp.sizeM / 1000) ** 2 * 0.35)))
  const lo = (dMin / dMax) ** 2
  // Prevailing wind (pixels: +x east, +y south) for the bright streaks behind craters.
  const wind = [0.92, 0.38]
  for (let c = 0; c < count; c++) {
    const dia = dMin / Math.sqrt(lo + (1 - lo) * rnd())
    const R = dia / 2 / mpp // px
    const cx = rnd() * S
    const cy = rnd() * S
    // Regional density: younger plains have fewer craters than old highlands.
    if (valueNoise((cx / S) * 3, (cy / S) * 3, s + 41) > 0.32 + 0.55 * rnd()) continue
    const fr = rnd()
    const k: CraterK = {
      fresh: fr * fr, // most craters are old
      cx: smooth(4000, 12000, dia), // simple bowl → complex crater
      fill: 0,
      phase: rnd() * 100,
      lobes: 5 + Math.floor(rnd() * 6),
    }
    k.fill = (1 - k.fresh) * (0.3 + 0.6 * rnd())
    const reach = R * 2.5
    const x0 = Math.max(0, Math.floor(cx - reach))
    const x1 = Math.min(S - 1, Math.ceil(cx + reach))
    const y0 = Math.max(0, Math.floor(cy - reach))
    const y1 = Math.min(S - 1, Math.ceil(cy + reach))
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const dx = x - cx
        const dy = y - cy
        const ang = Math.atan2(dy, dx)
        // Irregular rim: no perfect circles.
        const wob = 1 + 0.07 * Math.sin(ang * 3 + k.phase) + 0.04 * Math.sin(ang * 7 + k.phase * 1.7) + 0.02 * Math.sin(ang * 13 + k.phase * 2.3)
        const r = Math.hypot(dx, dy) / (R * wob)
        if (r > 2.5) continue
        const edge = 1.75 + 0.25 * Math.sin(ang * k.lobes + k.phase) // lobed rampart ejecta
        const i = y * S + x
        D[i] += craterProfile(r, k, edge) * dia
        // Albedo: dark sand/dunes on the floor, bright rim crest, bright fresh ejecta, wind streak.
        let a = 0
        if (r < 1) a -= (0.08 + 0.1 * (1 - k.fresh)) * smooth(0.85, 0.3, r) * (0.6 + 0.8 * valueNoise(x * 0.15, y * 0.15, s + c))
        a += 0.07 * k.fresh * Math.exp(-(((r - 1) / 0.08) ** 2))
        if (r > 1) a += 0.08 * k.fresh * smooth(edge, 1.05, r)
        const along = (dx * wind[0] + dy * wind[1]) / R
        const side = Math.abs(-dx * wind[1] + dy * wind[0]) / R
        if (along > 0.9) a += 0.06 * (0.4 + k.fresh) * smooth(5, 1, along) * smooth(0.9, 0.2, side / Math.max(0.3, 1 - (along - 1) * 0.18))
        A[i] += a
      }
  }

  // 3) Normals of the detail (tangent space: x = east, y = north), with the mesh's exaggeration.
  const normal = new Uint8ClampedArray(N * 4)
  const k = inp.ex / (2 * mpp)
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const i = y * S + x
      const e = D[y * S + Math.min(S - 1, x + 1)] - D[y * S + Math.max(0, x - 1)]
      const n = D[Math.max(0, y - 1) * S + x] - D[Math.min(S - 1, y + 1) * S + x] // north − south
      const nx = -e * k
      const ny = -n * k
      const l = Math.hypot(nx, ny, 1)
      normal[i * 4] = ((nx / l) * 0.5 + 0.5) * 255
      normal[i * 4 + 1] = ((ny / l) * 0.5 + 0.5) * 255
      normal[i * 4 + 2] = ((1 / l) * 0.5 + 0.5) * 255
      normal[i * 4 + 3] = 255
    }

  // 4) Albedo: globe colour × (real photo detail if any) × procedural structure.
  let photoMean = 0
  if (inp.photo) {
    for (let i = 0; i < N; i++) photoMean += inp.photo[i * 4] * 0.3 + inp.photo[i * 4 + 1] * 0.59 + inp.photo[i * 4 + 2] * 0.11
    photoMean = photoMean / N || 1
  }
  const procK = inp.photo ? 0.5 : 1
  const albedo = new Uint8ClampedArray(N * 4)
  for (let y = 0; y < S; y++) {
    const v = (y + 0.5) / S
    for (let x = 0; x < S; x++) {
      const u = (x + 0.5) / S
      const i = y * S + x
      const rel = gridAt(relief, u, v) / relStd // >0 high ground, <0 lows
      const sl = gridAt(slopeG, u, v)
      let m = 1 + procK * (A[i] + 0.07 * Math.tanh(rel) - 0.1 * smooth(6, 20, sl))
      if (inp.photo) {
        const p = inp.photo[i * 4] * 0.3 + inp.photo[i * 4 + 1] * 0.59 + inp.photo[i * 4 + 2] * 0.11
        m *= Math.min(1.7, Math.max(0.45, p / photoMean)) ** 0.85
      }
      let r = inp.base[i * 4] * m
      let gg = inp.base[i * 4 + 1] * m
      let b = inp.base[i * 4 + 2] * m
      // Dark ground is basaltic sand: greyer. Bright ground is dust: a touch more tan.
      const dark = smooth(1, 0.72, m) * 0.4
      const bright = smooth(1, 1.3, m)
      const lum = r * 0.3 + gg * 0.59 + b * 0.11
      r += (lum * 1.08 - r) * dark
      gg += (lum * 0.97 - gg) * dark
      b += (lum * 0.9 - b) * dark
      albedo[i * 4] = r * (1 + 0.03 * bright)
      albedo[i * 4 + 1] = gg * (1 + 0.04 * bright)
      albedo[i * 4 + 2] = b
      albedo[i * 4 + 3] = 255
    }
  }
  return { albedo, normal }
}

function boxBlur(src: Float32Array, g: number, r: number) {
  const tmp = new Float32Array(g * g)
  const out = new Float32Array(g * g)
  for (let y = 0; y < g; y++)
    for (let x = 0; x < g; x++) {
      let s = 0
      let n = 0
      for (let k = -r; k <= r; k++) {
        const xx = x + k
        if (xx < 0 || xx >= g) continue
        s += src[y * g + xx]
        n++
      }
      tmp[y * g + x] = s / n
    }
  for (let y = 0; y < g; y++)
    for (let x = 0; x < g; x++) {
      let s = 0
      let n = 0
      for (let k = -r; k <= r; k++) {
        const yy = y + k
        if (yy < 0 || yy >= g) continue
        s += tmp[yy * g + x]
        n++
      }
      out[y * g + x] = s / n
    }
  return out
}

interface CraterK {
  /** 0 = old, eroded; 1 = fresh. */
  fresh: number
  /** 0 = simple bowl; 1 = complex (flat floor, central peak, terraces). */
  cx: number
  /** How much of the old floor is buried by dust and sand (0..1). */
  fill: number
  phase: number
  lobes: number
}

/**
 * Martian crater profile in units of the crater diameter at normalised radius r (same model as the
 * globe shader): bowl or flat floor with central peak and terraced wall, raised rim, ejecta thinning
 * as r⁻³ with a lobed rampart edge, and old craters shallow and infilled.
 */
function craterProfile(r: number, k: CraterK, edge: number) {
  const depth = (0.2 + (0.09 - 0.2) * k.cx) * (0.25 + 0.75 * k.fresh)
  const rim = (0.035 + (0.02 - 0.035) * k.cx) * (0.3 + 0.7 * k.fresh)
  if (r < 1) {
    const floorR = 0.15 + 0.35 * k.cx
    const t = Math.min(1, Math.max(0, (r - floorR) / (1 - floorR)))
    let wall = t ** (2 - 0.6 * k.cx)
    wall += k.cx * k.fresh * 0.06 * Math.sin(t * 18) * t // terraces
    let h = -depth + (depth + rim) * wall
    h += k.cx * k.fresh * depth * 0.45 * Math.exp(-((r / 0.16) ** 2)) // central peak
    return Math.max(h, -depth * (1 - k.fill))
  }
  const blanket = (rim * (r ** -3 - 0.09)) / 0.91
  const rampart = k.fresh * rim * 0.55 * smooth(edge, edge - 0.18, r) * smooth(1, 1.15, r)
  return Math.max(0, blanket) + rampart
}
