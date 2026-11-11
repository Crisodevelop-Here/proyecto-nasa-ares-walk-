/**
 * A* over a square elevation grid. Cost = walking time in a pressurized suit:
 * Tobler's hiking function scaled for a suit, slowed by roughness, and cells steeper than
 * `maxSlopeDeg` are impassable.
 */
export interface Grid {
  n: number
  cellM: number
  z: Float32Array
  slope: Float32Array
  rough: Float32Array
}

export interface AStarOptions {
  vmaxKmh: number
  maxSlopeDeg: number
}

export interface AStarResult {
  /** Cell indices from start to goal (inclusive). Empty if unreachable. */
  path: number[]
  hours: number
}

/** Walking speed in km/h for a grade (dz/dx) and roughness (m). */
export function suitSpeed(grade: number, rough: number, vmaxKmh: number) {
  const tobler = vmaxKmh * Math.exp(-3.5 * Math.abs(grade + 0.05))
  return tobler / (1 + rough / 0.6)
}

const DX = [1, 1, 0, -1, -1, -1, 0, 1]
const DY = [0, 1, 1, 1, 0, -1, -1, -1]

class MinHeap {
  private k: number[] = []
  private p: number[] = []
  get size() {
    return this.k.length
  }
  push(key: number, pri: number) {
    const k = this.k
    const p = this.p
    k.push(key)
    p.push(pri)
    let i = k.length - 1
    while (i > 0) {
      const j = (i - 1) >> 1
      if (p[j] <= p[i]) break
      ;[k[i], k[j]] = [k[j], k[i]]
      ;[p[i], p[j]] = [p[j], p[i]]
      i = j
    }
  }
  pop() {
    const k = this.k
    const p = this.p
    const top = k[0]
    const lk = k.pop()!
    const lp = p.pop()!
    if (k.length) {
      k[0] = lk
      p[0] = lp
      let i = 0
      for (;;) {
        const l = 2 * i + 1
        const r = l + 1
        let m = i
        if (l < k.length && p[l] < p[m]) m = l
        if (r < k.length && p[r] < p[m]) m = r
        if (m === i) break
        ;[k[i], k[m]] = [k[m], k[i]]
        ;[p[i], p[m]] = [p[m], p[i]]
        i = m
      }
    }
    return top
  }
}

export function astar(g: Grid, start: number, goal: number, opt: AStarOptions): AStarResult {
  const { n, cellM, z, slope, rough } = g
  const total = n * n
  const cost = new Float64Array(total).fill(Infinity)
  const prev = new Int32Array(total).fill(-1)
  const closed = new Uint8Array(total)
  const gx = goal % n
  const gy = (goal / n) | 0
  const h = (i: number) => {
    const dx = (i % n) - gx
    const dy = ((i / n) | 0) - gy
    return (Math.hypot(dx, dy) * cellM) / 1000 / opt.vmaxKmh
  }
  const heap = new MinHeap()
  cost[start] = 0
  heap.push(start, h(start))

  while (heap.size) {
    const cur = heap.pop()
    if (cur === goal) break
    if (closed[cur]) continue
    closed[cur] = 1
    const cx = cur % n
    const cy = (cur / n) | 0
    for (let k = 0; k < 8; k++) {
      const x = cx + DX[k]
      const y = cy + DY[k]
      if (x < 0 || y < 0 || x >= n || y >= n) continue
      const nb = y * n + x
      if (closed[nb]) continue
      if (slope[nb] > opt.maxSlopeDeg && nb !== goal) continue
      const d = (k % 2 === 0 ? 1 : Math.SQRT2) * cellM
      const grade = (z[nb] - z[cur]) / d
      const v = suitSpeed(grade, rough[nb], opt.vmaxKmh)
      const c = cost[cur] + d / 1000 / v
      if (c < cost[nb]) {
        cost[nb] = c
        prev[nb] = cur
        heap.push(nb, c + h(nb))
      }
    }
  }

  if (!Number.isFinite(cost[goal])) return { path: [], hours: Infinity }
  const path: number[] = []
  for (let i = goal; i !== -1; i = prev[i]) path.push(i)
  path.reverse()
  return { path, hours: cost[goal] }
}

/** Bilinear elevation at fractional cell coordinates (cell centres at integer + 0.5). */
export function zAt(g: Grid, x: number, y: number) {
  const n = g.n
  const fx = Math.min(n - 1, Math.max(0, x - 0.5))
  const fy = Math.min(n - 1, Math.max(0, y - 0.5))
  const x0 = Math.min(n - 2, Math.floor(fx))
  const y0 = Math.min(n - 2, Math.floor(fy))
  const tx = fx - x0
  const ty = fy - y0
  const z = g.z
  const a = z[y0 * n + x0]
  const b = z[y0 * n + x0 + 1]
  const c = z[(y0 + 1) * n + x0]
  const d = z[(y0 + 1) * n + x0 + 1]
  return a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty
}

/**
 * Travel time (h) along the straight segment between two cells, or Infinity if it crosses
 * a cell steeper than the limit. Sampled every half cell with bilinear elevation.
 */
export function segmentHours(g: Grid, a: number, b: number, opt: AStarOptions) {
  const n = g.n
  const ax = (a % n) + 0.5
  const ay = ((a / n) | 0) + 0.5
  const bx = (b % n) + 0.5
  const by = ((b / n) | 0) + 0.5
  const len = Math.hypot(bx - ax, by - ay)
  const steps = Math.max(1, Math.ceil(len * 2))
  const stepM = (len / steps) * g.cellM
  let h = 0
  let pz = zAt(g, ax, ay)
  for (let k = 1; k <= steps; k++) {
    const x = ax + ((bx - ax) * k) / steps
    const y = ay + ((by - ay) * k) / steps
    const cell = Math.min(n - 1, Math.floor(y)) * n + Math.min(n - 1, Math.floor(x))
    if (cell !== b && cell !== a && g.slope[cell] > opt.maxSlopeDeg) return Infinity
    const z = zAt(g, x, y)
    h += stepM / 1000 / suitSpeed((z - pz) / stepM, g.rough[cell], opt.vmaxKmh)
    pz = z
  }
  return h
}

/**
 * String-pulls a grid path: replaces runs of 8-way steps with straight segments when the
 * segment is passable and not slower than the stair-stepped path (so the route stays optimal,
 * it just loses the 45° zig-zag of the grid).
 */
export function smoothPath(g: Grid, path: number[], opt: AStarOptions, tolerance = 1.03) {
  if (path.length < 3) return path.slice()
  // Cumulative time along the grid path, measured the same way as a segment.
  const cum = [0]
  for (let k = 1; k < path.length; k++) cum.push(cum[k - 1] + segmentHours(g, path[k - 1], path[k], opt))
  const out = [path[0]]
  let i = 0
  while (i < path.length - 1) {
    let best = i + 1
    let misses = 0
    for (let j = i + 2; j < path.length; j++) {
      const h = segmentHours(g, path[i], path[j], opt)
      if (h <= (cum[j] - cum[i]) * tolerance + 1e-9) {
        best = j
        misses = 0
      } else if (++misses > 12) break
    }
    out.push(path[best])
    i = best
  }
  return out
}
