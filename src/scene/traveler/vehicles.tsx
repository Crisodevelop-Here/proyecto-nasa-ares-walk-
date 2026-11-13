// 3D models that travel the route: the pressurized rover and the suited astronaut.
import { useMemo, type RefObject } from 'react'
import * as THREE from 'three'

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
export function RoverModel({ wheels }: { wheels: RefObject<THREE.Group | null> }) {
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
export function AstronautModel({ legL, legR, armL, armR }: Record<'legL' | 'legR' | 'armL' | 'armR', RefObject<THREE.Group | null>>) {
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
