// Environmental values with sources (approximate, to be refined with the official challenge resources).

/** Surface dose rate measured by RAD on Curiosity in Gale crater (Hassler et al., 2014). */
export const SURFACE_DOSE_MSV_PER_DAY = 0.64

/** A strong solar particle event can multiply the surface dose rate for hours. Demo factor. */
export const SPE_FACTOR = 30

/** Mars sol length in Earth hours. */
export const SOL_HOURS = 24.66

/** One-way light time Earth–Mars ranges from ~4 to ~22 min. Demo value. */
export const COMMS_DELAY_MIN = 14

/** Gale crater latitude (planetocentric). */
export const SITE_LAT = -4.84

/**
 * Typical air temperature at Gale through a sol (REMS on Curiosity: about −75 °C before dawn
 * to about −5 °C in the early afternoon). Smooth fit; hour = local mean solar time.
 */
export function airTempC(hour: number) {
  const min = -75
  const max = -5
  const phase = ((hour - 14 + 24) % 24) / 24 // peak at 14:00
  return Math.round(min + (max - min) * (0.5 + 0.5 * Math.cos(phase * 2 * Math.PI)))
}

/** Surface pressure at Gale is roughly 7–9 mbar (REMS), varying with season. */
export const PRESSURE_MBAR = 8.3

/** Sun direction for a local solar hour at the site (equinox approximation). */
export function sunDirection(hour: number) {
  const H = ((hour - 12) / 12) * Math.PI // hour angle
  const lat = (SITE_LAT * Math.PI) / 180
  // East = +x, Up = +y, South = +z (map v grows southward)
  const east = -Math.sin(H)
  const up = Math.cos(H) * Math.cos(lat)
  // At equinox the noon Sun sits toward the equator: north (−z) for a southern-hemisphere site.
  const south = Math.cos(H) * Math.sin(lat)
  const len = Math.hypot(east, up, south) || 1
  return { x: east / len, y: up / len, z: south / len, elevationDeg: (Math.asin(up / len) * 180) / Math.PI }
}

// Suit / EVA assumptions (order of magnitude, labelled as estimates in the UI).
export const SUIT = {
  /** Max walking speed on flat ground in a pressurized suit, km/h (Tobler 6 km/h scaled for suit). */
  vmaxKmh: 3.6,
  /** Steepest slope considered walkable in a suit, degrees. */
  maxSlopeDeg: 22,
  /** Slope above which the segment is flagged as caution, degrees. */
  cautionSlopeDeg: 12,
  /** Oxygen use at rest and while walking, kg/h. */
  o2RestKgH: 0.07,
  o2WalkKgH: 0.12,
  /** Usable oxygen in the portable life support system, kg. */
  o2CapacityKg: 1.0,
  /** Maximum planned EVA duration, hours. */
  maxEvaHours: 7,
}

/** Pressurized rover for regional traverses (order of magnitude, like NASA's SEV concept). */
export const ROVER = {
  vmaxKmh: 10,
  maxSlopeDeg: 15,
  cautionSlopeDeg: 8,
  /** Range on one charge, km. */
  rangeKm: 100,
}

/** Reference: RAD dose at Gale (elevation ≈ −4.5 km) and the atmospheric scale height. */
const GALE_Z_M = -4500
const SCALE_HEIGHT_M = 11_100
/**
 * Pressure (mbar) scales with exp(−z/H). Anchored to REMS at Gale. Seasonal swing ±10 %.
 */
export function pressureAtElevation(zM: number) {
  return PRESSURE_MBAR * Math.exp(-(zM - GALE_Z_M) / SCALE_HEIGHT_M)
}

/**
 * Surface dose rate estimate (mSv/day). Galactic cosmic rays dominate; the atmosphere shields
 * part of them, so high terrain gets more dose. Simple model: the shielded fraction
 * scales with column mass (∝ pressure), anchored to 0.64 mSv/day at Gale (RAD).
 * Rough estimate, not a measurement.
 */
export function doseAtElevation(zM: number, solarEvent = false) {
  const top = 0.95 // dose with almost no atmosphere (orbit-like, reduced by the planet below)
  const shield = (top - SURFACE_DOSE_MSV_PER_DAY) / PRESSURE_MBAR // per mbar at Gale
  const d = Math.max(0.3, top - shield * pressureAtElevation(zM))
  return d * (solarEvent ? SPE_FACTOR : 1)
}

/** Typical daily air temperature range (°C) by latitude, from Viking/REMS/MCS-style climatology. */
export function tempRange(lat: number) {
  const a = Math.abs(lat)
  const max = Math.round(-5 - 0.75 * Math.max(0, a - 10))
  const min = Math.round(-75 - 0.6 * Math.max(0, a - 20))
  return { min, max }
}
