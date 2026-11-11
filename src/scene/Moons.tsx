import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { View } from './MarsGlobe'
import { MARS_RADIUS_M, R } from './mars'

/**
 * Phobos and Deimos, Mars' two moons. Real orbit radii and shapes (tri-axial sizes in km), orbits
 * in Mars' equatorial plane, tidally locked (long axis toward Mars). Sizes are drawn ×6 so they read
 * at globe scale; periods are sped up keeping their real ratio (Phobos 7 h 39 min, Deimos 30 h 18 min).
 */
interface MoonSpec {
  id: string
  name: string
  /** Semi-axes in km. */
  axes: [number, number, number]
  orbitKm: number
  periodH: number
  color: string
  /** Big named crater: Stickney on Phobos. */
  bigCrater?: { lat: number; lon: number; r: number }
  note: string
}

const MOONS: MoonSpec[] = [
  { id: 'phobos', name: 'Fobos', axes: [13.5, 11, 9], orbitKm: 9376, periodH: 7.65, color: '#7b6a5c', bigCrater: { lat: 0, lon: 0.5, r: 0.42 }, note: '27 km (dibujada ×14) · a 6.000 km de la superficie' },
  { id: 'deimos', name: 'Deimos', axes: [7.5, 6, 5], orbitKm: 23460, periodH: 30.3, color: '#b09a84', note: '15 km (dibujada ×14) · 30 h por vuelta' },
]
const SIZE_BOOST = 14
/** Seconds of animation per hour of real orbit. */
const SEC_PER_H = 4.5

function rand(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), a | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Potato-shaped, cratered body: an ellipsoid with crater dents and lumps. */
function moonGeometry(spec: MoonSpec, seed: number) {
  const geo = new THREE.IcosahedronGeometry(1, 5)
  const pos = geo.attributes.position as THREE.BufferAttribute
  const rr = rand(seed)
  const craters: { c: THREE.Vector3; r: number; d: number }[] = []
  for (let i = 0; i < 38; i++) {
    const c = new THREE.Vector3().randomDirection()
    c.set(c.x + (rr() - 0.5) * 0.01, c.y, c.z).normalize()
    craters.push({ c, r: 0.08 + 0.22 * rr() ** 2, d: 0.03 + 0.05 * rr() })
  }
  if (spec.bigCrater) {
    const { lat, lon, r } = spec.bigCrater
    craters.push({ c: new THREE.Vector3(Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon)), r, d: 0.16 })
  }
  const lumps = Array.from({ length: 6 }, () => ({ c: new THREE.Vector3().randomDirection(), a: (rr() - 0.4) * 0.12 }))
  const v = new THREE.Vector3()
  const [ax, ay, az] = spec.axes
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize()
    let k = 1
    for (const l of lumps) k += l.a * Math.max(0, v.dot(l.c)) ** 3
    for (const cr of craters) {
      const ang = Math.acos(Math.min(1, v.dot(cr.c)))
      const t = ang / cr.r
      if (t < 1) k -= cr.d * (1 - t * t)
      else if (t < 1.35) k += cr.d * 0.25 * (1 - (t - 1) / 0.35) // raised rim
    }
    pos.setXYZ(i, v.x * ax * k, v.y * ay * k, v.z * az * k)
  }
  geo.computeVertexNormals()
  return geo
}

export function Moons({ view }: { view: View }) {
  const group = useRef<THREE.Group>(null)
  const bodies = useRef<(THREE.Group | null)[]>([])
  const labels = useRef<(HTMLDivElement | null)[]>([])
  const fade = useRef(1)
  const scale = (1000 * R) / MARS_RADIUS_M // scene units per km
  const geos = useMemo(() => MOONS.map((m, i) => moonGeometry(m, 11 + i * 97)), [])
  const orbits = useMemo(
    () =>
      MOONS.map((m) => {
        const r = m.orbitKm * scale
        const pts = Array.from({ length: 181 }, (_, i) => {
          const a = (i / 180) * Math.PI * 2
          return new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r)
        })
        return new THREE.BufferGeometry().setFromPoints(pts)
      }),
    [scale],
  )

  useFrame(({ clock }, dt) => {
    fade.current = THREE.MathUtils.damp(fade.current, view === 'globe' ? 1 : 0, 4, dt)
    if (group.current) group.current.visible = fade.current > 0.02
    const t = clock.elapsedTime
    MOONS.forEach((m, i) => {
      const b = bodies.current[i]
      if (!b) return
      const a = (t / (m.periodH * SEC_PER_H)) * Math.PI * 2 + i * 2.1
      const r = m.orbitKm * scale
      b.position.set(Math.cos(a) * r, 0, -Math.sin(a) * r)
      // Tidally locked: the long axis (x) always points at Mars.
      b.rotation.set(0, a + Math.PI, 0)
      const el = labels.current[i]
      if (el) el.style.opacity = String(fade.current)
    })
  })

  return (
    <group ref={group}>
      {MOONS.map((m, i) => (
        <group key={m.id}>
          <lineLoop geometry={orbits[i]}>
            <lineBasicMaterial color="#e8d5c4" transparent opacity={0.16} />
          </lineLoop>
          <group ref={(g) => void (bodies.current[i] = g)}>
            <mesh geometry={geos[i]} scale={scale * SIZE_BOOST}>
              <meshStandardMaterial color={m.color} roughness={1} metalness={0} />
            </mesh>
            <Html position={[0, scale * SIZE_BOOST * 34, 0]} center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
              <div ref={(el) => void (labels.current[i] = el)} className="whitespace-nowrap text-center transition-opacity">
                <p className="text-xs font-semibold text-white/85 drop-shadow">{m.name}</p>
                <p className="text-[10px] text-white/45">{m.note}</p>
              </div>
            </Html>
          </group>
        </group>
      ))}
    </group>
  )
}
