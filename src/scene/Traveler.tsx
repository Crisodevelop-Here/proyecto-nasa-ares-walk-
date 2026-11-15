import { useFrame, useThree } from '@react-three/fiber'
import { Suspense, useEffect, useMemo, useRef, type RefObject } from 'react'
import * as THREE from 'three'
import type { Terrain } from '../terrain/terrain'
import { speedAt, STOP_HOLD, type Arrival, type TourState } from '../tour/tour'
import type { RoutePlan, UV } from '../types'
import { K, pointAtDistance, toWorld } from './geo'
import { UNITS_PER_M } from './mars'
import { REGION_SCALE, regionLocal, regionPlacement } from './RegionTerrain'
import { SITE_EX, SITE_SCALE, sitePlacement } from './SiteTerrain'
import { blobTexture, DUST, dustMaterial, Rocks, SKY_HORIZON, skyMaterial } from './traveler/surroundings'
import { gaitPose, mixPose, STAND, strideHz, type GaitKind } from './traveler/gait'
import { LITE } from '../perf'
import { ModelBoundary, NasaAstronaut, NasaRover } from './traveler/nasaModels'
import { AstronautModel, RoverModel } from './traveler/vehicles'

const SPACE = new THREE.Color('#03040a')
/** Daytime Martian sky near the horizon: dusty butterscotch (Viking / Curiosity colour images). */
const SKY = new THREE.Color('#b9875f').convertSRGBToLinear()

interface Rig {
  /** Avatar size (m). */
  size: number
  chase: { back: number; up: number }
  drone: { back: number; up: number }
  /** Eye height above the ground in the cab / helmet view (m, before exaggeration). */
  eye: number
  /** How far ahead the camera looks (m). */
  ahead: number
}

function rigFor(mode: 'region' | 'site', sizeM: number): Rig {
  if (mode === 'site') return { size: 5, chase: { back: 26, up: 11 }, drone: { back: 70, up: 85 }, eye: 2.4, ahead: 32 }
  const s = Math.min(300, Math.max(40, sizeM * 0.004))
  return { size: s, chase: { back: sizeM * 0.016, up: sizeM * 0.0065 }, drone: { back: sizeM * 0.07, up: sizeM * 0.075 }, eye: s * 0.9, ahead: sizeM * 0.03 }
}

interface Props {
  mode: 'region' | 'site'
  terrain: Terrain
  plan: RoutePlan
  arrivals: Arrival[]
  tour: RefObject<TourState>
  /** Mission hours of travel per second of animation (same clock for the rover and the astronaut). */
  hoursPerSecond: number
  /** Called ~12 times a second and on every arrival, so the HUD can follow. */
  onTick: () => void
}

/** The rover (region) or the suited astronaut (EVA) driving / walking the planned route. */
export function Traveler({ mode, terrain: t, plan, arrivals, tour, hoursPerSecond, onTick }: Props) {
  const { camera, scene } = useThree()
  const group = useRef<THREE.Group>(null)
  const avatar = useRef<THREE.Group>(null)
  const roverBody = useRef<THREE.Group>(null)
  const suitBody = useRef<THREE.Group>(null)
  const wheels = useRef<THREE.Group>(null)
  const body = useRef<THREE.Group>(null)
  const legL = useRef<THREE.Group>(null)
  const legR = useRef<THREE.Group>(null)
  const kneeL = useRef<THREE.Group>(null)
  const kneeR = useRef<THREE.Group>(null)
  const armL = useRef<THREE.Group>(null)
  const armR = useRef<THREE.Group>(null)
  /** Stride phase of the walk (strides) and how much of the walk pose is applied (0 = standing). */
  const stride = useRef(0)
  const stepMix = useRef(0)
  const ring = useRef<THREE.Mesh>(null)
  const sky = useRef(0)
  const lastTick = useRef(0)
  const phase = useRef(0)
  const yaw = useRef(NaN)
  const pitch = useRef(0)
  const roll = useRef(0)
  const steer = useRef(0)
  const dustAcc = useRef(0)
  const dust = useRef<{ p: Float32Array; v: Float32Array; life: Float32Array; next: number } | null>({
    p: new Float32Array(DUST * 3),
    v: new Float32Array(DUST * 3),
    life: new Float32Array(DUST),
    next: 0,
  })
  const dustGeo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(DUST * 3), 3))
    g.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array(DUST), 1))
    return g
  }, [])
  const dustMat = useMemo(() => dustMaterial(), [])
  const shadowTex = useMemo(blobTexture, [])
  const camPos = useRef<THREE.Vector3 | null>(null)
  const look = useRef(new THREE.Vector3())
  const fog = useMemo(() => new THREE.FogExp2(SKY.getHex(), 0), [])
  const skyMat = useMemo(skyMaterial, [])
  const skyDome = useRef<THREE.Mesh>(null)

  const sizeM = t.meta.sizeM
  const rig = useMemo(() => rigFor(mode, sizeM), [mode, sizeM])
  const total = plan.points.length ? plan.points[plan.points.length - 1].d : 0
  const groupY = useMemo(() => (mode === 'region' ? regionPlacement(t).groupY : sitePlacement(t).groupY), [mode, t])
  const scale = mode === 'region' ? REGION_SCALE : SITE_SCALE
  const local = useMemo(
    () =>
      mode === 'region'
        ? (p: UV, lift: number, out: THREE.Vector3) => regionLocal(t, p, lift, out)
        : (p: UV, lift: number, out: THREE.Vector3) => toWorld(t, p, SITE_EX, lift, out),
    [mode, t],
  )

  // Restore the space background when the traverse ends or this view unmounts.
  useEffect(
    () => () => {
      scene.background = SPACE.clone()
      scene.fog = null
      const stars = scene.getObjectByName('stars')
      if (stars) stars.visible = true
    },
    [scene],
  )

  const tmp = useMemo(() => ({ a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3(), w: new THREE.Vector3() }), [])

  useFrame((_, rawDt) => {
    const s = tour.current
    const dt = Math.min(rawDt, 0.1)
    if (!s || !group.current) return

    // ---- Martian sky and haze fade in while travelling ----
    sky.current = THREE.MathUtils.damp(sky.current, s.active ? 1 : 0, 2.5, dt)
    const k = sky.current
    skyMat.uniforms.uK.value = k
    if (skyDome.current) {
      skyDome.current.visible = k > 0.002
      skyDome.current.position.copy(camera.position)
    }
    if (k > 0.002) {
      scene.background = SPACE.clone().lerp(SKY, k * 0.85)
      fog.color.copy(SKY_HORIZON).convertSRGBToLinear()
      fog.density = (k * 1.1) / (sizeM * UNITS_PER_M)
      scene.fog = fog
    } else if (scene.fog === fog) {
      scene.fog = null
      scene.background = SPACE.clone()
    }
    const stars = scene.getObjectByName('stars')
    if (stars) stars.visible = k < 0.4

    group.current.visible = s.active
    if (!s.active || !plan.points.length) {
      camPos.current = null
      yaw.current = NaN
      return
    }

    // ---- advance along the route ----
    if (s.playing) {
      if (s.hold > 0) s.hold = Math.max(0, s.hold - dt)
      else {
        // Real ground speed on this stretch (slower uphill and on rough ground), on the shared clock.
        const v = speedAt(plan, s.d) * hoursPerSecond * s.speed
        s.d = Math.min(total, s.d + v * dt)
        const next = arrivals[s.next]
        if (next && s.d >= next.d - 0.5) {
          s.d = next.d
          s.next++
          if (next.last) s.playing = false
          else s.hold = STOP_HOLD
          onTick()
        }
        if (s.d >= total) s.playing = false
      }
    }
    const moving = s.playing && s.hold === 0
    // On foot: the EVA, or the astronaut silhouette chosen on the rover traverse.
    const walker = mode === 'site' || s.astronaut
    if (roverBody.current) roverBody.current.visible = !walker
    if (suitBody.current) suitBody.current.visible = walker

    // ---- avatar: heading eased toward the way ahead, body following the ground ----
    const here = pointAtDistance(plan.points, s.d).uv
    const pos = local(here, 0, tmp.a)
    // Aim at a point a few vehicle lengths ahead (like a driver looking through the curve).
    const aimD = Math.max(rig.size * 3, 2)
    const aheadD = Math.min(total, s.d + aimD)
    const fromD = Math.max(0, aheadD - aimD * 2)
    const aimTo = local(pointAtDistance(plan.points, aheadD).uv, 0, tmp.b)
    const aimFrom = local(pointAtDistance(plan.points, fromD).uv, 0, tmp.c)
    const wantYaw = Math.atan2(aimTo.x - aimFrom.x, aimTo.z - aimFrom.z)
    if (Number.isNaN(yaw.current)) yaw.current = wantYaw
    let dYaw = wantYaw - yaw.current
    dYaw = Math.atan2(Math.sin(dYaw), Math.cos(dYaw))
    // Turn rate: a rover turns deliberately, a walker quickly.
    yaw.current += dYaw * (1 - Math.exp(-(walker ? 7 : 3.2) * dt))
    steer.current = THREE.MathUtils.damp(steer.current, THREE.MathUtils.clamp(dYaw * 2.2, -0.45, 0.45), 6, dt)

    // Ground under the four corners → pitch and roll (rocker-bogie keeps all six wheels down).
    const fx = Math.sin(yaw.current)
    const fz = Math.cos(yaw.current)
    const L = rig.size * K * 0.5
    const Wd = rig.size * K * 0.45
    const gAt = (dx: number, dz: number) => {
      const u = (pos.x + dx) / (sizeM * K) + 0.5
      const v = (pos.z + dz) / (sizeM * K) + 0.5
      return local({ u: Math.min(1, Math.max(0, u)), v: Math.min(1, Math.max(0, v)) }, 0, tmp.c).y
    }
    const yF = gAt(fx * L, fz * L)
    const yB = gAt(-fx * L, -fz * L)
    const yLft = gAt(fz * Wd, -fx * Wd) // +x of the body when it faces +z
    const yRgt = gAt(-fz * Wd, fx * Wd)
    const wantPitch = walker ? 0 : Math.atan2(yF - yB, 2 * L)
    const wantRoll = walker ? 0 : Math.atan2(yLft - yRgt, 2 * Wd)
    pitch.current = THREE.MathUtils.damp(pitch.current, wantPitch, 5, dt)
    roll.current = THREE.MathUtils.damp(roll.current, wantRoll, 5, dt)
    const bodyY = walker ? pos.y : (yF + yB + yLft + yRgt) / 4
    if (avatar.current) {
      avatar.current.position.set(pos.x, Math.max(pos.y, bodyY), pos.z)
      avatar.current.rotation.set(-pitch.current, yaw.current, roll.current, 'YXZ')
      avatar.current.scale.setScalar(rig.size * K)
      // From the cab / helmet you don't see your own vehicle or suit.
      avatar.current.visible = s.camera !== 'pov'
    }
    if (moving) phase.current += (speedAt(plan, s.d) * hoursPerSecond * s.speed * dt) / (mode === 'site' ? 1.6 : rig.size * (walker ? 0.32 : 0.6))
    const ph = phase.current
    if (wheels.current)
      wheels.current.children.forEach((w, i) => {
        w.rotation.order = 'YXZ'
        w.rotation.x = ph * 2
        // Corner wheels steer (front one way, rear the other); the middle pair is fixed.
        w.rotation.y = i < 2 ? steer.current : i >= 4 ? -steer.current : 0
      })
    // ---- suited walk in Mars gravity (real-time cadence; the traverse itself is a time-lapse) ----
    // At ×2 and faster the crew is "hurrying": an Apollo-style lope instead of a walk.
    const gait: GaitKind = s.speed >= 2 ? 'lope' : 'walk'
    if (moving) stride.current += strideHz(gait) * dt
    stepMix.current = THREE.MathUtils.damp(stepMix.current, moving ? 1 : 0, 4, dt)
    const pose = mixPose(STAND, gaitPose(stride.current, gait), stepMix.current)
    if (legL.current) legL.current.rotation.x = -pose.hipL
    if (legR.current) legR.current.rotation.x = -pose.hipR
    if (kneeL.current) kneeL.current.rotation.x = pose.kneeL
    if (kneeR.current) kneeR.current.rotation.x = pose.kneeR
    if (armL.current) armL.current.rotation.x = -pose.armL
    if (armR.current) armR.current.rotation.x = -pose.armR
    if (body.current) {
      body.current.position.y = pose.lift
      body.current.rotation.x = pose.lean
    }
    if (ring.current) {
      // Soft contact shadow under the vehicle / boots.
      ring.current.visible = s.camera !== 'pov'
      ring.current.position.set(pos.x, bodyY + 0.2 * K, pos.z)
      ring.current.rotation.set(-Math.PI / 2, 0, -yaw.current)
      ring.current.scale.set(rig.size * K * (walker ? 0.5 : 0.95), rig.size * K * (walker ? 0.5 : 1.25), 1)
    }

    // ---- dust kicked up by the wheels / boots ----
    const dp = dust.current
    if (dp && dustGeo) {
      const P = dustGeo.attributes.position as THREE.BufferAttribute
      const A = dustGeo.attributes.alpha as THREE.BufferAttribute
      if (moving) {
        dustAcc.current += dt * (walker ? 18 : 40) * Math.min(2, s.speed)
        while (dustAcc.current > 1) {
          dustAcc.current--
          const i = dp.next
          dp.next = (dp.next + 1) % DUST
          const side = Math.random() < 0.5 ? -1 : 1
          const back = -L * (0.6 + Math.random() * 0.5)
          dp.p[i * 3] = pos.x + fx * back + fz * Wd * side * (walker ? 0.2 : 1)
          dp.p[i * 3 + 1] = bodyY + rig.size * K * 0.08
          dp.p[i * 3 + 2] = pos.z + fz * back - fx * Wd * side * (walker ? 0.2 : 1)
          const sp = rig.size * K * 0.35
          dp.v[i * 3] = -fx * sp * 0.4 + (Math.random() - 0.5) * sp * 0.5
          dp.v[i * 3 + 1] = sp * (0.25 + Math.random() * 0.35)
          dp.v[i * 3 + 2] = -fz * sp * 0.4 + (Math.random() - 0.5) * sp * 0.5
          dp.life[i] = 1
        }
      }
      for (let i = 0; i < DUST; i++) {
        if (dp.life[i] <= 0) {
          A.setX(i, 0)
          continue
        }
        dp.life[i] -= dt / (walker ? 1.6 : 2.4)
        for (let c = 0; c < 3; c++) dp.p[i * 3 + c] += dp.v[i * 3 + c] * dt
        dp.v[i * 3 + 1] -= rig.size * K * 0.05 * dt // Mars' low gravity: dust hangs
        P.setXYZ(i, dp.p[i * 3], dp.p[i * 3 + 1], dp.p[i * 3 + 2])
        A.setX(i, Math.max(0, dp.life[i]) * 0.55)
      }
      P.needsUpdate = true
      A.needsUpdate = true
    }

    // Puff diameter in metres → pixels at unit view distance (fov 38°).
    dustMat.uniforms.uSize.value = (mode === 'site' ? 1.4 : rig.size * (walker ? 0.3 : 0.55)) * UNITS_PER_M * window.innerHeight * window.devicePixelRatio * 1.45
    // ---- camera ----
    // Behind the vehicle's own (eased) heading, so turns sweep smoothly instead of snapping.
    const dir = tmp.w.set(fx, 0, fz)
    const groundY = (uv: UV) => local(uv, 0, new THREE.Vector3()).y
    const camL = new THREE.Vector3()
    const lookL = new THREE.Vector3()
    const lookUV = pointAtDistance(plan.points, Math.min(total, s.d + rig.ahead)).uv
    if (s.camera === 'pov') {
      // From the cab / helmet: eye height, looking down the route.
      const bob = walker ? pose.lift * rig.eye : 0
      camL.copy(pos).addScaledVector(dir, rig.size * 0.3 * K)
      camL.y += (rig.eye + bob) * K * (mode === 'region' ? 3 : SITE_EX)
      local(lookUV, rig.eye * K * 2, lookL)
    } else {
      const r = s.camera === 'drone' ? rig.drone : rig.chase
      camL.copy(pos).addScaledVector(dir, -r.back * K)
      camL.y += r.up * K
      local(lookUV, 0, lookL)
      lookL.lerp(pos, s.camera === 'drone' ? 0.6 : 0.62)
    }
    // Never below the ground (mountains between the camera and the avatar).
    const camUV = { u: camL.x / (sizeM * K) + 0.5, v: camL.z / (sizeM * K) + 0.5 }
    const minY = groundY({ u: Math.min(1, Math.max(0, camUV.u)), v: Math.min(1, Math.max(0, camUV.v)) }) + (s.camera === 'pov' ? rig.eye * 0.5 : rig.chase.up * 0.4) * K
    if (camL.y < minY) camL.y = minY

    const toW = (v: THREE.Vector3) => v.multiplyScalar(scale).add(new THREE.Vector3(0, groupY, 0))
    const camW = toW(camL)
    const lookW = toW(lookL)
    if (!camPos.current) {
      // Start from wherever the camera is, looking where it already looks: the move in is a glide.
      camPos.current = camera.position.clone()
      look.current.copy(camera.position).add(camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(camera.position.distanceTo(lookW)))
    }
    const rate = s.camera === 'pov' ? 6 : 3
    camPos.current.lerp(camW, 1 - Math.exp(-rate * dt))
    look.current.lerp(lookW, 1 - Math.exp(-(rate + 2) * dt))
    camera.position.copy(camPos.current)
    camera.lookAt(look.current)
    s.look.copy(look.current)

    const now = performance.now()
    if (now - lastTick.current > 80) {
      lastTick.current = now
      onTick()
    }
  })

  return (
    <>
      {/* Sky dome follows the camera (world space, outside the scaled terrain group). */}
      <mesh ref={skyDome} material={skyMat} renderOrder={-3} frustumCulled={false} visible={false}>
        <sphereGeometry args={[60, 48, 24]} />
      </mesh>
      <group ref={group} position={[0, groupY, 0]} scale={scale} visible={false}>
        <Rocks plan={plan} local={local} sizeM={sizeM} mode={mode} />
        <mesh ref={ring} renderOrder={4}>
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial map={shadowTex} transparent depthWrite={false} toneMapped={false} />
        </mesh>
        <points geometry={dustGeo} material={dustMat} frustumCulled={false} renderOrder={5} />
        <group ref={avatar}>
          {mode === 'region' && (
            <group ref={roverBody}>
              {/* NASA's Perseverance model; the light mode, or a failed or pending load, uses the built-in one. */}
              {LITE ? (
                <RoverModel wheels={wheels} />
              ) : (
                <ModelBoundary fallback={<RoverModel wheels={wheels} />}>
                  <Suspense fallback={<RoverModel wheels={wheels} />}>
                    <NasaRover />
                  </Suspense>
                </ModelBoundary>
              )}
            </group>
          )}
          <group ref={suitBody} visible={mode === 'site'}>
            {LITE ? (
              <AstronautModel body={body} legL={legL} legR={legR} kneeL={kneeL} kneeR={kneeR} armL={armL} armR={armR} />
            ) : (
              <ModelBoundary fallback={<AstronautModel body={body} legL={legL} legR={legR} kneeL={kneeL} kneeR={kneeR} armL={armL} armR={armR} />}>
                <Suspense fallback={<AstronautModel body={body} legL={legL} legR={legR} kneeL={kneeL} kneeR={kneeR} armL={armL} armR={armR} />}>
                  <NasaAstronaut body={body} legL={legL} legR={legR} kneeL={kneeL} kneeR={kneeR} armL={armL} armR={armR} />
                </Suspense>
              </ModelBoundary>
            )}
          </group>
        </group>
      </group>
    </>
  )
}
