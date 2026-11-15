// 3D models that travel the route: the pressurized rover and the suited astronaut.
import { useEffect, useMemo, type RefObject } from 'react'
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

/** Moving parts of the astronaut, driven by the gait animation. */
export type AstroParts = Record<'body' | 'legL' | 'legR' | 'kneeL' | 'kneeR' | 'armL' | 'armR', RefObject<THREE.Group | null>>

/** Off-white suit fabric: woven speckle with quilting seams (procedural, no external texture). */
function fabricTexture() {
  const S = 256
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')!
  g.fillStyle = '#ecebe5'
  g.fillRect(0, 0, S, S)
  let seed = 7
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  for (let i = 0; i < 9000; i++) {
    const v = 200 + rnd() * 50
    g.fillStyle = `rgba(${v},${v},${v - 6},0.35)`
    g.fillRect(rnd() * S, rnd() * S, 1.5, 1.5)
  }
  // Soft folds and quilted seams of the outer layer.
  g.lineWidth = 2
  for (let y = 16; y < S; y += 42) {
    g.strokeStyle = 'rgba(150,148,140,0.35)'
    g.beginPath()
    g.moveTo(0, y)
    for (let x = 0; x <= S; x += 16) g.lineTo(x, y + Math.sin(x * 0.05 + y) * 3)
    g.stroke()
  }
  g.setLineDash([3, 4])
  g.strokeStyle = 'rgba(120,118,110,0.45)'
  g.lineWidth = 1
  for (const x of [64, 192]) {
    g.beginPath()
    g.moveTo(x, 0)
    g.lineTo(x, S)
    g.stroke()
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(2, 2)
  return t
}

/** Small flag patch for the shoulder (stripes and canton, drawn on a canvas). */
function flagTexture() {
  const c = document.createElement('canvas')
  c.width = 76
  c.height = 40
  const g = c.getContext('2d')!
  for (let i = 0; i < 13; i++) {
    g.fillStyle = i % 2 ? '#f5f5f5' : '#b22234'
    g.fillRect(0, (i * 40) / 13, 76, 40 / 13 + 0.5)
  }
  g.fillStyle = '#3c3b6e'
  g.fillRect(0, 0, 30, 21.5)
  g.fillStyle = '#ffffff'
  for (let y = 0; y < 4; y++) for (let x = 0; x < 5; x++) g.fillRect(3 + x * 5.5, 3 + y * 5, 1.4, 1.4)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/** Corrugated hose between two points with a sag in the middle. */
function Hose({ a, b, sag, mat }: { a: [number, number, number]; b: [number, number, number]; sag: [number, number, number]; mat: THREE.Material }) {
  const geo = useMemo(() => {
    const A = new THREE.Vector3(...a)
    const B = new THREE.Vector3(...b)
    const M = A.clone()
      .add(B)
      .multiplyScalar(0.5)
      .add(new THREE.Vector3(...sag))
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3([A, M, B]), 24, 0.012, 8)
  }, [a, b, sag])
  return <mesh geometry={geo} material={mat} />
}

function suitMaterials() {
  const fabric = fabricTexture()
  return {
    suit: new THREE.MeshStandardMaterial({ color: '#ffffff', map: fabric, roughness: 0.92 }),
    soft: new THREE.MeshStandardMaterial({ color: '#dcdad3', map: fabric, roughness: 0.95 }),
    metal: new THREE.MeshStandardMaterial({ color: '#b8bcc2', metalness: 0.8, roughness: 0.3 }),
    grey: new THREE.MeshStandardMaterial({ color: '#8f949b', roughness: 0.6 }),
    dark: new THREE.MeshStandardMaterial({ color: '#2d3036', roughness: 0.5 }),
    glove: new THREE.MeshStandardMaterial({ color: '#5d6168', roughness: 0.7 }),
    boot: new THREE.MeshStandardMaterial({ color: '#c9c7c0', roughness: 0.85 }),
    sole: new THREE.MeshStandardMaterial({ color: '#4a4c50', roughness: 0.9 }),
    red: new THREE.MeshStandardMaterial({ color: '#c0262d', roughness: 0.4, metalness: 0.3 }),
    blue: new THREE.MeshStandardMaterial({ color: '#23408e', roughness: 0.4, metalness: 0.3 }),
    hose: new THREE.MeshStandardMaterial({ color: '#efede6', roughness: 0.8 }),
    glass: new THREE.MeshPhysicalMaterial({ color: '#cfd8e3', transparent: true, opacity: 0.28, roughness: 0.05, metalness: 0.2 }),
    // Gold sun visor: little metalness and a warm glow, so it reads gold without an environment map.
    visor: new THREE.MeshStandardMaterial({ color: '#e0b030', roughness: 0.22, metalness: 0.55, emissive: '#7a5410', emissiveIntensity: 0.55 }),
    flag: new THREE.MeshBasicMaterial({ map: flagTexture(), toneMapped: false }),
  }
}
type SuitMats = ReturnType<typeof suitMaterials>
type Ref = RefObject<THREE.Group | null>

/** One leg: hip → thigh → knee → shin → boot. */
function Leg({ hip, knee, x, m }: { hip: Ref; knee: Ref; x: number; m: SuitMats }) {
  return (
    <group ref={hip} position={[x, 0.47, 0]}>
      <mesh position={[0, -0.11, 0]} material={m.suit}>
        <capsuleGeometry args={[0.072, 0.12, 4, 12]} />
      </mesh>
      {/* thigh pocket */}
      <mesh position={[x < 0 ? -0.06 : 0.06, -0.11, 0.02]} material={m.soft}>
        <boxGeometry args={[0.03, 0.1, 0.08]} />
      </mesh>
      <group ref={knee} position={[0, -0.23, 0]}>
        <mesh rotation={[Math.PI / 2, 0, 0]} material={m.soft}>
          <torusGeometry args={[0.062, 0.016, 8, 16]} />
        </mesh>
        <mesh position={[0, -0.1, 0]} material={m.suit}>
          <capsuleGeometry args={[0.066, 0.12, 4, 12]} />
        </mesh>
        {/* boot with a dark sole */}
        <mesh position={[0, -0.2, 0.025]} material={m.boot}>
          <boxGeometry args={[0.12, 0.07, 0.2]} />
        </mesh>
        <mesh position={[0, -0.232, 0.025]} material={m.sole}>
          <boxGeometry args={[0.125, 0.016, 0.21]} />
        </mesh>
      </group>
    </group>
  )
}

/** One arm: shoulder → upper arm → elbow (slightly bent by the suit) → glove. */
function Arm({ arm, x, m }: { arm: Ref; x: number; m: SuitMats }) {
  return (
    <group ref={arm} position={[x, 0.82, 0]}>
      <mesh position={[0, -0.02, 0]} material={m.suit}>
        <sphereGeometry args={[0.07, 14, 10]} />
      </mesh>
      <mesh position={[0, -0.1, 0]} material={m.suit}>
        <capsuleGeometry args={[0.056, 0.12, 4, 12]} />
      </mesh>
      {x < 0 && (
        <mesh position={[-0.058, -0.07, 0]} rotation={[0, -Math.PI / 2, 0]} material={m.flag}>
          <planeGeometry args={[0.07, 0.037]} />
        </mesh>
      )}
      <group position={[0, -0.2, 0]} rotation={[-0.35, 0, 0]}>
        <mesh position={[0, -0.08, 0]} material={m.suit}>
          <capsuleGeometry args={[0.05, 0.1, 4, 12]} />
        </mesh>
        <mesh position={[0, -0.155, 0]} rotation={[Math.PI / 2, 0, 0]} material={x < 0 ? m.blue : m.red}>
          <torusGeometry args={[0.045, 0.012, 8, 16]} />
        </mesh>
        <mesh position={[0, -0.2, 0.005]} scale={[0.9, 1.1, 0.7]} material={m.glove}>
          <sphereGeometry args={[0.05, 12, 10]} />
        </mesh>
      </group>
    </group>
  )
}

/**
 * Suited astronaut, 1 unit ≈ height, feet at y = 0, forward is +z. Modelled after a classic NASA
 * EVA suit: quilted white outer layer, chest control box with red and blue connectors and hoses,
 * a large life-support backpack, bubble helmet with a gold visor, grey gloves and boots.
 */
export function AstronautModel({ body, legL, legR, kneeL, kneeR, armL, armR }: AstroParts) {
  const m = useMemo(suitMaterials, [])
  useEffect(() => () => Object.values(m).forEach((x) => (x.dispose(), 'map' in x && x.map?.dispose())), [m])
  return (
    <group ref={body}>
      <Leg hip={legL} knee={kneeL} x={-0.085} m={m} />
      <Leg hip={legR} knee={kneeR} x={0.085} m={m} />

      {/* Torso, waist and neck rings */}
      <mesh position={[0, 0.67, 0]} scale={[1, 1, 0.85]} material={m.suit}>
        <capsuleGeometry args={[0.17, 0.2, 6, 16]} />
      </mesh>
      <mesh position={[0, 0.5, 0]} rotation={[Math.PI / 2, 0, 0]} material={m.soft}>
        <torusGeometry args={[0.15, 0.018, 8, 24]} />
      </mesh>
      <mesh position={[0, 0.885, 0]} rotation={[Math.PI / 2, 0, 0]} material={m.blue}>
        <torusGeometry args={[0.1, 0.02, 8, 24]} />
      </mesh>

      {/* Chest control box, connectors and hoses to the backpack */}
      <mesh position={[0, 0.74, 0.15]} material={m.grey}>
        <boxGeometry args={[0.14, 0.09, 0.06]} />
      </mesh>
      <mesh position={[0, 0.745, 0.182]} material={m.dark}>
        <boxGeometry args={[0.08, 0.04, 0.006]} />
      </mesh>
      {(
        [
          [-0.07, 0.63, m.blue],
          [-0.03, 0.6, m.blue],
          [0.03, 0.6, m.red],
          [0.07, 0.63, m.red],
        ] as const
      ).map(([x, y, mat]) => (
        <mesh key={x} position={[x, y, 0.145]} rotation={[Math.PI / 2, 0, 0]} material={mat}>
          <cylinderGeometry args={[0.02, 0.02, 0.03, 12]} />
        </mesh>
      ))}
      <Hose a={[-0.07, 0.63, 0.16]} b={[-0.15, 0.78, -0.14]} sag={[-0.1, -0.12, 0.08]} mat={m.hose} />
      <Hose a={[0.07, 0.63, 0.16]} b={[0.15, 0.78, -0.14]} sag={[0.1, -0.12, 0.08]} mat={m.hose} />

      {/* Life-support backpack (PLSS) with the oxygen purge unit on top */}
      <mesh position={[0, 0.69, -0.21]} material={m.suit}>
        <boxGeometry args={[0.32, 0.38, 0.15]} />
      </mesh>
      <mesh position={[0, 0.69, -0.287]} material={m.soft}>
        <boxGeometry args={[0.26, 0.3, 0.006]} />
      </mesh>
      <mesh position={[0, 0.92, -0.2]} material={m.suit}>
        <boxGeometry args={[0.27, 0.09, 0.13]} />
      </mesh>
      <mesh position={[0.1, 0.97, -0.2]} rotation={[0, 0, Math.PI / 2]} material={m.metal}>
        <cylinderGeometry args={[0.012, 0.012, 0.05, 8]} />
      </mesh>

      <Arm arm={armL} x={-0.215} m={m} />
      <Arm arm={armR} x={0.215} m={m} />

      {/* Helmet: clear pressure bubble, white visor shell and gold sun visor (three.js sphere: φ = π/2 faces +z) */}
      <mesh position={[0, 0.99, 0]} material={m.glass}>
        <sphereGeometry args={[0.135, 24, 18]} />
      </mesh>
      <mesh position={[0, 0.99, -0.005]} material={m.suit}>
        <sphereGeometry args={[0.142, 24, 18, Math.PI / 2 + 0.95, Math.PI * 2 - 1.9, 0, Math.PI / 1.7]} />
      </mesh>
      <mesh position={[0, 0.99, 0.004]} material={m.visor}>
        <sphereGeometry args={[0.14, 24, 18, Math.PI / 2 - 0.9, 1.8, Math.PI / 4, Math.PI / 3]} />
      </mesh>
    </group>
  )
}
