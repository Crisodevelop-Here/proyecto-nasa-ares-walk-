import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, type RefObject } from 'react'
import * as THREE from 'three'
import type { Terrain } from '../terrain/terrain'
import { STOP_HOLD, TOUR_SECONDS, type Arrival, type TourState } from '../tour/tour'
import type { RoutePlan, UV } from '../types'
import { K, pointAtDistance, toWorld } from './geo'
import { UNITS_PER_M } from './mars'
import { REGION_SCALE, regionLocal, regionPlacement } from './RegionTerrain'
import { SITE_EX, SITE_SCALE, sitePlacement } from './SiteTerrain'

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
  /** Called ~12 times a second and on every arrival, so the HUD can follow. */
  onTick: () => void
}

/** The rover (region) or the suited astronaut (EVA) driving / walking the planned route. */
export function Traveler({ mode, terrain: t, plan, arrivals, tour, onTick }: Props) {
  const { camera, scene } = useThree()
  const group = useRef<THREE.Group>(null)
  const avatar = useRef<THREE.Group>(null)
  const wheels = useRef<THREE.Group>(null)
  const legL = useRef<THREE.Group>(null)
  const legR = useRef<THREE.Group>(null)
  const armL = useRef<THREE.Group>(null)
  const armR = useRef<THREE.Group>(null)
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
        const v = (total / TOUR_SECONDS) * s.speed
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
    yaw.current += dYaw * (1 - Math.exp(-(mode === 'site' ? 7 : 3.2) * dt))
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
    const wantPitch = mode === 'site' ? 0 : Math.atan2(yF - yB, 2 * L)
    const wantRoll = mode === 'site' ? 0 : Math.atan2(yLft - yRgt, 2 * Wd)
    pitch.current = THREE.MathUtils.damp(pitch.current, wantPitch, 5, dt)
    roll.current = THREE.MathUtils.damp(roll.current, wantRoll, 5, dt)
    const bodyY = mode === 'site' ? pos.y : (yF + yB + yLft + yRgt) / 4
    if (avatar.current) {
      avatar.current.position.set(pos.x, Math.max(pos.y, bodyY), pos.z)
      avatar.current.rotation.set(-pitch.current, yaw.current, roll.current, 'YXZ')
      avatar.current.scale.setScalar(rig.size * K)
      // From the cab / helmet you don't see your own vehicle or suit.
      avatar.current.visible = s.camera !== 'pov'
    }
    if (moving) phase.current += ((total / TOUR_SECONDS) * s.speed * dt) / (mode === 'site' ? 1.6 : rig.size * 0.6)
    const ph = phase.current
    if (wheels.current)
      wheels.current.children.forEach((w, i) => {
        w.rotation.order = 'YXZ'
        w.rotation.x = ph * 2
        // Corner wheels steer (front one way, rear the other); the middle pair is fixed.
        w.rotation.y = i < 2 ? steer.current : i >= 4 ? -steer.current : 0
      })
    const swing = moving ? Math.sin(ph * Math.PI) * 0.6 : 0
    if (legL.current) legL.current.rotation.x = swing
    if (legR.current) legR.current.rotation.x = -swing
    if (armL.current) armL.current.rotation.x = -swing * 0.7
    if (armR.current) armR.current.rotation.x = swing * 0.7
    if (ring.current) {
      // Soft contact shadow under the vehicle / boots.
      ring.current.visible = s.camera !== 'pov'
      ring.current.position.set(pos.x, bodyY + 0.2 * K, pos.z)
      ring.current.rotation.set(-Math.PI / 2, 0, -yaw.current)
      ring.current.scale.set(rig.size * K * (mode === 'site' ? 0.5 : 0.95), rig.size * K * (mode === 'site' ? 0.5 : 1.25), 1)
    }

    // ---- dust kicked up by the wheels / boots ----
    const dp = dust.current
    if (dp && dustGeo) {
      const P = dustGeo.attributes.position as THREE.BufferAttribute
      const A = dustGeo.attributes.alpha as THREE.BufferAttribute
      if (moving) {
        dustAcc.current += dt * (mode === 'site' ? 18 : 40) * Math.min(2, s.speed)
        while (dustAcc.current > 1) {
          dustAcc.current--
          const i = dp.next
          dp.next = (dp.next + 1) % DUST
          const side = Math.random() < 0.5 ? -1 : 1
          const back = -L * (0.6 + Math.random() * 0.5)
          dp.p[i * 3] = pos.x + fx * back + fz * Wd * side * (mode === 'site' ? 0.2 : 1)
          dp.p[i * 3 + 1] = bodyY + rig.size * K * 0.08
          dp.p[i * 3 + 2] = pos.z + fz * back - fx * Wd * side * (mode === 'site' ? 0.2 : 1)
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
        dp.life[i] -= dt / (mode === 'site' ? 1.6 : 2.4)
        for (let c = 0; c < 3; c++) dp.p[i * 3 + c] += dp.v[i * 3 + c] * dt
        dp.v[i * 3 + 1] -= rig.size * K * 0.05 * dt // Mars' low gravity: dust hangs
        P.setXYZ(i, dp.p[i * 3], dp.p[i * 3 + 1], dp.p[i * 3 + 2])
        A.setX(i, Math.max(0, dp.life[i]) * 0.55)
      }
      P.needsUpdate = true
      A.needsUpdate = true
    }

    // Puff diameter in metres → pixels at unit view distance (fov 38°).
    dustMat.uniforms.uSize.value = (mode === 'site' ? 1.4 : rig.size * 0.55) * UNITS_PER_M * window.innerHeight * window.devicePixelRatio * 1.45
    // ---- camera ----
    // Behind the vehicle's own (eased) heading, so turns sweep smoothly instead of snapping.
    const dir = tmp.w.set(fx, 0, fz)
    const groundY = (uv: UV) => local(uv, 0, new THREE.Vector3()).y
    const camL = new THREE.Vector3()
    const lookL = new THREE.Vector3()
    const lookUV = pointAtDistance(plan.points, Math.min(total, s.d + rig.ahead)).uv
    if (s.camera === 'pov') {
      // From the cab / helmet: eye height, looking down the route.
      const bob = mode === 'site' && moving ? Math.abs(Math.sin(ph * Math.PI)) * 0.08 : 0
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
        <group ref={avatar}>{mode === 'region' ? <RoverModel wheels={wheels} /> : <AstronautModel legL={legL} legR={legR} armL={armL} armR={armR} />}</group>
      </group>
    </>
  )
}

/** A tube between two points (suspension bars, arm segments). */
function Strut({ a, b, r, color = '#c9ccd1', metal = 0.7 }: { a: [number, number, number]; b: [number, number, number]; r: number; color?: string; metal?: number }) {
  const { pos, quat, len } = useMemo(() => {
    const A = new THREE.Vector3(...a)
    const B = new THREE.Vector3(...b)
    const d = B.clone().sub(A)
    return {
      pos: A.clone().add(B).multiplyScalar(0.5),
      quat: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()),
      len: d.length(),
    }
  }, [a, b])
  return (
    <mesh position={pos} quaternion={quat}>
      <cylinderGeometry args={[r, r, len, 10]} />
      <meshStandardMaterial color={color} metalness={metal} roughness={0.35} />
    </mesh>
  )
}

/** Machined aluminium wheel, 52.5 cm across, with titanium spokes and grousers (cleats). */
function Wheel({ x, z }: { x: number; z: number }) {
  const R = 0.2625
  return (
    <group position={[x, R, z]}>
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[R, R, 0.4, 28, 1, true]} />
        <meshStandardMaterial color="#b9bcc0" metalness={0.85} roughness={0.35} side={THREE.DoubleSide} />
      </mesh>
      {/* hub cap and spokes on the outer face */}
      <mesh position={[Math.sign(x) * 0.2, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[R * 0.97, R * 0.97, 0.01, 28]} />
        <meshStandardMaterial color="#8d9196" metalness={0.8} roughness={0.4} />
      </mesh>
      {Array.from({ length: 6 }, (_, i) => (
        <mesh key={i} position={[Math.sign(x) * 0.205, 0, 0]} rotation={[(i * Math.PI) / 3, 0, 0]}>
          <boxGeometry args={[0.012, R * 1.85, 0.03]} />
          <meshStandardMaterial color="#d6d8db" metalness={0.9} roughness={0.25} />
        </mesh>
      ))}
      {/* grousers (Perseverance has 48; 24 read the same at this size) */}
      {Array.from({ length: 24 }, (_, i) => {
        const a = (i / 24) * Math.PI * 2
        return (
          <mesh key={i} position={[0, Math.cos(a) * (R + 0.008), Math.sin(a) * (R + 0.008)]} rotation={[a, 0, 0]}>
            <boxGeometry args={[0.4, 0.016, 0.022]} />
            <meshStandardMaterial color="#7d8186" metalness={0.8} roughness={0.5} />
          </mesh>
        )
      })}
    </group>
  )
}

/**
 * NASA Perseverance-style rover, modelled in metres (≈3 m long, 2.7 m wide, 2.2 m tall) and
 * scaled to 1 unit of length. Forward is +z. Parts: warm electronics box + equipment deck,
 * 6 aluminium wheels on a rocker-bogie, remote-sensing mast with Mastcam-Z/SuperCam head,
 * folded robotic arm with turret, MMRTG with fins at the back, high- and low-gain antennas.
 */
function RoverModel({ wheels }: { wheels: RefObject<THREE.Group | null> }) {
  const body = <meshStandardMaterial color="#ece8df" roughness={0.55} metalness={0.15} />
  const W = 1.12 // wheel track half-width
  const zF = 1.05
  const zM = 0.05
  const zR = -0.95
  return (
    <group scale={1 / 3}>
      {/* warm electronics box and the dark equipment deck on top */}
      <mesh position={[0, 0.98, 0.05]}>
        <boxGeometry args={[1.25, 0.5, 2.05]} />
        {body}
      </mesh>
      <mesh position={[0, 1.245, 0.05]}>
        <boxGeometry args={[1.42, 0.035, 2.2]} />
        <meshStandardMaterial color="#6f747b" roughness={0.6} metalness={0.4} />
      </mesh>
      {/* gold thermal blanket band */}
      <mesh position={[0, 0.76, 0.05]}>
        <boxGeometry args={[1.27, 0.06, 2.07]} />
        <meshStandardMaterial color="#c9a227" roughness={0.3} metalness={0.9} />
      </mesh>
      {/* deck boxes (instrument electronics) */}
      <mesh position={[-0.35, 1.33, -0.25]}>
        <boxGeometry args={[0.45, 0.14, 0.55]} />
        {body}
      </mesh>
      <mesh position={[0.3, 1.31, 0.35]}>
        <boxGeometry args={[0.35, 0.1, 0.4]} />
        <meshStandardMaterial color="#b4b8bd" metalness={0.6} roughness={0.4} />
      </mesh>

      {/* remote-sensing mast and its head */}
      <Strut a={[0.42, 1.26, 0.82]} b={[0.42, 2.0, 0.82]} r={0.045} color="#d9d6cf" metal={0.3} />
      <group position={[0.42, 2.08, 0.86]}>
        <mesh>
          <boxGeometry args={[0.46, 0.2, 0.26]} />
          {body}
        </mesh>
        {/* SuperCam: the big round eye */}
        <mesh position={[0, 0.02, 0.135]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.065, 0.065, 0.03, 20]} />
          <meshStandardMaterial color="#111827" metalness={0.9} roughness={0.08} />
        </mesh>
        {/* Mastcam-Z stereo pair and Navcams */}
        {[-0.16, 0.16].map((x) => (
          <mesh key={x} position={[x, 0.02, 0.135]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.035, 0.035, 0.05, 16]} />
            <meshStandardMaterial color="#0b0f19" metalness={0.9} roughness={0.1} />
          </mesh>
        ))}
        {[-0.08, 0.08].map((x) => (
          <mesh key={x} position={[x, -0.06, 0.135]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.02, 0.02, 0.03, 12]} />
            <meshStandardMaterial color="#0b0f19" metalness={0.9} roughness={0.1} />
          </mesh>
        ))}
      </group>

      {/* robotic arm folded across the front, turret (drill, PIXL, SHERLOC) on the end */}
      <Strut a={[-0.5, 1.0, 1.1]} b={[0.25, 1.1, 1.32]} r={0.05} />
      <Strut a={[0.25, 1.1, 1.32]} b={[-0.25, 1.15, 1.42]} r={0.045} />
      <group position={[-0.32, 1.06, 1.45]}>
        <mesh>
          <boxGeometry args={[0.26, 0.24, 0.24]} />
          <meshStandardMaterial color="#a7abb1" metalness={0.7} roughness={0.35} />
        </mesh>
        <Strut a={[0, -0.12, 0]} b={[0, -0.32, 0.02]} r={0.022} color="#e5e7eb" />
        <mesh position={[0.13, 0.02, 0]}>
          <boxGeometry args={[0.06, 0.12, 0.12]} />
          <meshStandardMaterial color="#c9a227" metalness={0.9} roughness={0.3} />
        </mesh>
      </group>

      {/* MMRTG: the nuclear power source, angled at the back, with cooling fins */}
      <group position={[0, 1.12, -1.18]} rotation={[-0.55, 0, 0]}>
        <mesh>
          <cylinderGeometry args={[0.22, 0.22, 0.68, 20]} />
          <meshStandardMaterial color="#2a2c30" metalness={0.6} roughness={0.5} />
        </mesh>
        {Array.from({ length: 8 }, (_, i) => (
          <mesh key={i} rotation={[0, (i * Math.PI) / 4, 0]} position={[Math.cos((i * Math.PI) / 4) * 0.3, 0, -Math.sin((i * Math.PI) / 4) * 0.3]}>
            <boxGeometry args={[0.18, 0.62, 0.012]} />
            <meshStandardMaterial color="#3a3d42" metalness={0.6} roughness={0.5} />
          </mesh>
        ))}
      </group>

      {/* high-gain antenna (hexagonal dish) and low-gain antenna */}
      <Strut a={[-0.45, 1.26, -0.65]} b={[-0.45, 1.5, -0.65]} r={0.03} />
      <mesh position={[-0.45, 1.56, -0.65]} rotation={[0.35, 0, 0.2]}>
        <cylinderGeometry args={[0.3, 0.3, 0.04, 6]} />
        <meshStandardMaterial color="#d1d5db" metalness={0.5} roughness={0.4} />
      </mesh>
      <Strut a={[0.5, 1.26, -0.7]} b={[0.5, 1.62, -0.7]} r={0.025} color="#e5e7eb" />

      {/* rocker-bogie suspension (titanium tubes): rocker pivot on the body side */}
      {[-1, 1].map((sd) => {
        const px = sd * 0.78
        const pivot: [number, number, number] = [px, 0.88, 0.25]
        const bogie: [number, number, number] = [sd * 0.95, 0.62, -0.45]
        return (
          <group key={sd}>
            <Strut a={pivot} b={[sd * 0.95, 0.62, zF - 0.05]} r={0.045} />
            <Strut a={[sd * 0.95, 0.62, zF - 0.05]} b={[sd * W, 0.3, zF]} r={0.04} />
            <Strut a={pivot} b={bogie} r={0.045} />
            <Strut a={bogie} b={[sd * W, 0.3, zM]} r={0.04} />
            <Strut a={bogie} b={[sd * W, 0.3, zR]} r={0.04} />
            <mesh position={pivot} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.07, 0.07, 0.12, 14]} />
              <meshStandardMaterial color="#8d9196" metalness={0.8} roughness={0.3} />
            </mesh>
          </group>
        )
      })}
      {/* differential bar across the deck */}
      <Strut a={[-0.75, 1.3, -0.05]} b={[0.75, 1.3, -0.05]} r={0.03} />

      <group ref={wheels}>{[zF, zM, zR].flatMap((z) => [-W, W].map((x) => <Wheel key={`${x}${z}`} x={x} z={z} />))}</group>
    </group>
  )
}

/** Suited astronaut, 1 unit ≈ height. Forward is +z. */
function AstronautModel({ legL, legR, armL, armR }: Record<'legL' | 'legR' | 'armL' | 'armR', RefObject<THREE.Group | null>>) {
  const suit = <meshStandardMaterial color="#f1f0ec" roughness={0.75} />
  return (
    <group>
      {/* legs pivot at the hip */}
      {[
        [legL, -0.08],
        [legR, 0.08],
      ].map(([ref, x]) => (
        <group key={String(x)} ref={ref as RefObject<THREE.Group>} position={[x as number, 0.46, 0]}>
          <mesh position={[0, -0.22, 0]}>
            <capsuleGeometry args={[0.065, 0.32, 4, 10]} />
            {suit}
          </mesh>
        </group>
      ))}
      <mesh position={[0, 0.66, 0]}>
        <capsuleGeometry args={[0.16, 0.22, 4, 14]} />
        {suit}
      </mesh>
      {/* life-support backpack */}
      <mesh position={[0, 0.7, -0.17]}>
        <boxGeometry args={[0.28, 0.34, 0.12]} />
        <meshStandardMaterial color="#d4d4d8" roughness={0.6} />
      </mesh>
      {[
        [armL, -0.21],
        [armR, 0.21],
      ].map(([ref, x]) => (
        <group key={String(x)} ref={ref as RefObject<THREE.Group>} position={[x as number, 0.8, 0]}>
          <mesh position={[0, -0.16, 0]}>
            <capsuleGeometry args={[0.05, 0.24, 4, 10]} />
            {suit}
          </mesh>
        </group>
      ))}
      <mesh position={[0, 0.98, 0]}>
        <sphereGeometry args={[0.13, 20, 16]} />
        {suit}
      </mesh>
      {/* gold visor */}
      <mesh position={[0, 0.98, 0.06]}>
        <sphereGeometry args={[0.105, 20, 16, -Math.PI / 2.2, Math.PI / 1.1, Math.PI / 3.2, Math.PI / 2.6]} />
        <meshStandardMaterial color="#d4a017" roughness={0.15} metalness={0.9} />
      </mesh>
      {/* NASA-ish orange shoulder band for visibility */}
      <mesh position={[0, 0.8, 0]}>
        <torusGeometry args={[0.165, 0.015, 8, 24]} />
        <meshBasicMaterial color="#fb923c" toneMapped={false} />
      </mesh>
    </group>
  )
}

/**
 * Martian daytime sky around the camera: butterscotch at the horizon (suspended dust), darker
 * brown overhead, and a pale halo around the small Sun. Fades in with `k`.
 */
const SKY_HORIZON = new THREE.Color('#d39a72')
const SKY_ZENITH = new THREE.Color('#8a5a40')
const SUN_DIR = new THREE.Vector3(0.78, 0.48, 0.4).normalize()
export function skyMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uK: { value: 0 }, uHorizon: { value: SKY_HORIZON.clone() }, uZenith: { value: SKY_ZENITH.clone() }, uSun: { value: SUN_DIR.clone() } },
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      varying vec3 vDir;
      void main() {
        vDir = normalize((modelMatrix * vec4(position, 1.0)).xyz - cameraPosition);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_fragment>
      uniform float uK;
      uniform vec3 uHorizon, uZenith, uSun;
      varying vec3 vDir;
      void main() {
        #include <logdepthbuf_fragment>
        vec3 d = normalize(vDir);
        float el = d.y;
        vec3 col = mix(uHorizon, uZenith, smoothstep(0.0, 0.75, el));
        col = mix(col, uHorizon * 1.08, smoothstep(0.08, -0.05, el)); // haze band at the horizon
        float s = max(dot(d, uSun), 0.0);
        col += vec3(0.95, 0.93, 0.9) * (pow(s, 24.0) * 0.35 + pow(s, 400.0) * 1.2); // halo + disc
        // Drawn first as an opaque backdrop (the globe and terrain cover it), so fade toward space black.
        gl_FragColor = vec4(mix(vec3(0.0012, 0.0015, 0.003), col, uK), 1.0);
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  })
}

function rand(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), a | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Boulders scattered around the route (visual only): basalt-dark, dust on top, power-law sizes,
 * denser near the path so the ground reads at driving / walking height.
 */
export function Rocks({
  plan,
  local,
  sizeM,
  mode,
}: {
  plan: RoutePlan
  local: (p: UV, lift: number, out: THREE.Vector3) => THREE.Vector3
  sizeM: number
  mode: 'region' | 'site'
}) {
  const mesh = useMemo(() => {
    const geo = new THREE.IcosahedronGeometry(1, 1)
    const r = rand(7)
    const pos = geo.attributes.position as THREE.BufferAttribute
    const v = new THREE.Vector3()
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i)
      // Same jitter for shared vertices (keyed by position) keeps the rock closed.
      const j = 0.6 + 0.8 * Math.abs((Math.sin(v.x * 12.9898 + v.y * 78.233 + v.z * 37.719) * 43758.5453) % 1)
      v.multiplyScalar(j)
      v.y *= 0.55
      if (v.y < -0.15) v.y = -0.15 // flat underside, sits on the ground like a real boulder
      pos.setXYZ(i, v.x, v.y, v.z)
    }
    void r
    geo.computeVertexNormals()
    const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.92, metalness: 0, flatShading: true })
    const N = mode === 'region' ? 9000 : 7000
    const im = new THREE.InstancedMesh(geo, mat, N)
    const rr = rand(Math.round(sizeM))
    const pts = plan.points
    // Rock sizes and spacing follow the patch (and the drawn vehicle), so a 120 km patch looks as rocky as a 30 km one.
    const kz = mode === 'region' ? sizeM / 30000 : 1
    const corridor = mode === 'region' ? 3200 * kz : 60 // m either side of the path
    const sMin = mode === 'region' ? 12 * kz : 0.12
    const sMax = mode === 'region' ? 120 * kz : 1.8
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const e = new THREE.Euler()
    const p = new THREE.Vector3()
    const sc = new THREE.Vector3()
    const col = new THREE.Color()
    // A thinned copy of the route, to keep boulders off the track wherever they are thrown.
    const track = pts.filter((_, i) => i % Math.max(1, Math.floor(pts.length / 400)) === 0)
    const clear = mode === 'region' ? 380 * kz : 3.5 // m kept free each side of the path
    const onTrack = (uv: UV) => track.some((tp) => Math.hypot((tp.u - uv.u) * sizeM, (tp.v - uv.v) * sizeM) < clear)
    for (let i = 0; i < N; i++) {
      let uv: UV
      if (i % 5 < 3) {
        // Near the route (what you see while driving / walking)…
        const a = pts[Math.floor(rr() * pts.length)]
        const b = pts[Math.min(pts.length - 1, pts.indexOf(a) + 1)]
        const dx = (b.u - a.u) * sizeM
        const dz = (b.v - a.v) * sizeM
        const l = Math.hypot(dx, dz) || 1
        const side = (rr() < 0.5 ? -1 : 1) * (clear + corridor * rr() ** 1.6)
        uv = { u: a.u + (-dz / l) * (side / sizeM) + (rr() - 0.5) * 0.004, v: a.v + (dx / l) * (side / sizeM) + (rr() - 0.5) * 0.004 }
      } else {
        // …and everywhere else on the patch, out to the horizon.
        uv = { u: 0.02 + rr() * 0.96, v: 0.02 + rr() * 0.96 }
      }
      if (uv.u < 0.01 || uv.v < 0.01 || uv.u > 0.99 || uv.v > 0.99 || onTrack(uv)) {
        m.makeScale(0, 0, 0)
        im.setMatrixAt(i, m)
        continue
      }
      const s = sMin / Math.sqrt(1 - rr() * (1 - (sMin / sMax) ** 2))
      local(uv, 0, p)
      p.y -= s * 0.25 * K
      e.set(rr() * 0.6, rr() * Math.PI * 2, rr() * 0.6)
      q.setFromEuler(e)
      sc.set(s * (0.8 + rr() * 0.6), s * (0.6 + rr() * 0.6), s * (0.8 + rr() * 0.6)).multiplyScalar(K)
      m.compose(p, q, sc)
      im.setMatrixAt(i, m)
      // Basalt grey-brown to dusty, a little variety.
      // Like the rocks in rover photos: grey-brown basalt, many with a tan dust coat.
      col.setHSL(0.025 + rr() * 0.03, 0.38 + rr() * 0.22, 0.22 + rr() * 0.2) // rust-coated basalt, the planet's red
      im.setColorAt(i, col)
    }
    im.instanceMatrix.needsUpdate = true
    if (im.instanceColor) im.instanceColor.needsUpdate = true
    im.frustumCulled = false
    return im
  }, [plan, local, sizeM, mode])
  return <primitive object={mesh} />
}

const DUST = 220

/** Soft round contact shadow. */
function blobTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const ctx = c.getContext('2d')!
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62)
  g.addColorStop(0, 'rgba(20,8,4,0.6)')
  g.addColorStop(0.55, 'rgba(20,8,4,0.35)')
  g.addColorStop(1, 'rgba(20,8,4,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 128, 128)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/** Reddish dust puffs: soft round points that grow and fade. */
function dustMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uSize: { value: 1 }, uColor: { value: new THREE.Color('#b8653d') } },
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      attribute float alpha;
      uniform float uSize;
      varying float vA;
      void main() {
        vA = alpha;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        // Grows as it fades: a puff spreading out.
        gl_PointSize = uSize * (1.6 - alpha) / -mv.z;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_fragment>
      uniform vec3 uColor;
      varying float vA;
      void main() {
        #include <logdepthbuf_fragment>
        float r = length(gl_PointCoord - 0.5) * 2.0;
        float a = smoothstep(1.0, 0.2, r) * vA;
        if (a < 0.01) discard;
        gl_FragColor = vec4(uColor, a);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
  })
}
