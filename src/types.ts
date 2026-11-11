export type LayerId = 'ortho' | 'color' | 'elev' | 'slope' | 'rough'

export interface TerrainMeta {
  source: string
  site: string
  sizeM: number
  grid: number
  zMin: number
  zMax: number
  metersPerPixel: number
  nw: [number, number]
  se: [number, number]
}

/** A point on the map in normalized coordinates: u = west→east, v = north→south (0..1). */
export interface UV {
  u: number
  v: number
}

export interface Station extends UV {
  id: string
  name: string
  kind: 'habitat' | 'science'
  emoji: string
  goal: string
  why: string
  tools: string[]
  /** Minutes of work at the stop. */
  workMin: number
}

export interface RoutePoint extends UV {
  /** Elevation in metres (areoid-referenced, from the DTM). */
  z: number
  /** Cumulative distance along the route in metres. */
  d: number
  /** Local slope at this point in degrees. */
  slope: number
  /** Cumulative walking time in hours. */
  t: number
  /** Index of the leg (0 = habitat → first stop). */
  leg: number
}

export interface Leg {
  from: string
  to: string
  distanceM: number
  hours: number
  ascentM: number
  descentM: number
  maxSlope: number
  ok: boolean
}

export interface RoutePlan {
  points: RoutePoint[]
  legs: Leg[]
  distanceM: number
  walkHours: number
  workHours: number
  totalHours: number
  ascentM: number
  descentM: number
  maxSlope: number
  o2Kg: number
  doseMSv: number
  feasible: boolean
  warnings: string[]
}
