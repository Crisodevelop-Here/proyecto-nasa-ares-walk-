/**
 * Suited walking gait in Martian gravity, for the astronaut animation.
 *
 * - A walking leg swings like a pendulum, so stride frequency scales with √g: on Mars (0.38 g) about
 *   0.62× Earth's (Kram et al.; Froude-number similarity, Carr & Newman 2009).
 * - Joint range of motion shrinks in reduced gravity and in a pressurized suit ("like being inside a
 *   balloon"), so hips, knees and arms move much less than unsuited on Earth.
 * - Each step has a short float, and the crew leans forward against the life-support backpack.
 * - At 0.38 g walking is still the usual gait (the walk–run Froude number stays ≈ 0.5 down to ~0.4 g),
 *   but the walk–run transition comes at ≈ 0.62× Earth's speed, so a hurried crew lopes like on Apollo.
 */

/** Mars surface gravity relative to Earth. */
export const MARS_G = 0.38

/** Unsuited comfortable walking stride frequency on Earth (strides per second). */
const EARTH_STRIDE_HZ = 0.9

export type GaitKind = 'walk' | 'lope'

/** Stride frequency on Mars (strides per second): pendulum scaling with √g; a lope is a bit quicker. */
export const strideHz = (kind: GaitKind) => EARTH_STRIDE_HZ * Math.sqrt(MARS_G) * (kind === 'lope' ? 1.25 : 1)

export interface GaitPose {
  /** Hip flexion of each leg (rad, + = leg forward). */
  hipL: number
  hipR: number
  /** Knee flexion of each leg (rad, ≥ 0 = shin back). */
  kneeL: number
  kneeR: number
  /** Shoulder swing (rad, + = arm forward). */
  armL: number
  armR: number
  /** Body lift (fraction of height) and forward lean (rad). */
  lift: number
  lean: number
}

/** Ranges limited by the suit (rad). Unsuited Earth walking is roughly hip ±0.5, knee 1.0, arms ±0.35. */
const RANGE = {
  walk: { hip: 0.3, knee: 0.42, arm: 0.1, lift: 0.018, lean: 0.07 },
  lope: { hip: 0.4, knee: 0.6, arm: 0.16, lift: 0.07, lean: 0.14 },
}

/** Standing still in the suit: knees and arms slightly bent, small forward lean. */
export const STAND: GaitPose = { hipL: 0, hipR: 0, kneeL: 0.06, kneeR: 0.06, armL: 0.05, armR: 0.05, lift: 0, lean: 0.05 }

/** Pose at stride phase `p` (in strides; 1 = one full left + right cycle). */
export function gaitPose(p: number, kind: GaitKind): GaitPose {
  const r = RANGE[kind]
  const a = p * 2 * Math.PI
  const hipL = Math.sin(a) * r.hip
  const hipR = -hipL
  // The knee bends only while the leg swings forward (the first half of its cycle), then stays near straight.
  const knee = (x: number) => 0.06 + Math.max(0, Math.sin(x)) ** 2 * r.knee
  const lift =
    kind === 'walk'
      ? // Two small rises per stride, over the standing leg.
        Math.abs(Math.cos(a)) * r.lift
      : // Lope: a float after each push-off, with a short flight in the low gravity.
        Math.max(0, Math.sin(2 * a)) * r.lift
  return {
    hipL,
    hipR,
    kneeL: knee(a + Math.PI / 2),
    kneeR: knee(a - Math.PI / 2),
    // Arms swing opposite to the legs, but the suit keeps them small.
    armL: -hipL * (r.arm / r.hip) + 0.05,
    armR: -hipR * (r.arm / r.hip) + 0.05,
    lift,
    lean: r.lean,
  }
}

/** Blend two poses (t = 0 → a, 1 → b). */
export function mixPose(a: GaitPose, b: GaitPose, t: number): GaitPose {
  const out = { ...a }
  for (const k of Object.keys(a) as (keyof GaitPose)[]) out[k] = a[k] + (b[k] - a[k]) * t
  return out
}
