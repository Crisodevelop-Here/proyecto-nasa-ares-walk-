import { Html, useTexture } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { pointCode } from '../tour/tour'
import { STATION_BY_ID } from '../data/stations'
import type { Terrain } from '../terrain/terrain'
import type { RoutePlan } from '../types'
import { K, toWorld } from './geo'
import { R, smoothstep, UNITS_PER_M } from './mars'
import { tr } from '../i18n'

export type SiteLayer = 'ortho' | 'color' | 'slope'
export const LAYERS: { id: SiteLayer; label: string }[] = [
  { id: 'ortho', label: 'Imagen real' },
  { id: 'color', label: 'Color mineral' },
  { id: 'slope', label: 'Pendiente' },
]

/** Vertical exaggeration of the HiRISE terrain (same default as martian-map). */
export const SITE_EX = 1.5
const SEG = 511
/** Terrain group scale: geo units (K per metre) → globe scene units. */
export const SITE_SCALE = UNITS_PER_M / K

/** Where the terrain sits on top of the planet: its border's mean height lands on the sphere. */
export function sitePlacement(t: Terrain) {
  const g = t.meta.grid
  let border = 0
  let n = 0
  for (let i = 0; i < g; i++) {
    border += t.heights[i] + t.heights[(g - 1) * g + i] + t.heights[i * g] + t.heights[i * g + g - 1]
    n += 4
  }
  let mean = 0
  for (let i = 0; i < t.heights.length; i++) mean += t.heights[i]
  mean /= t.heights.length
  const borderLocal = (border / n - t.meta.zMin) * K * SITE_EX
  const meanLocal = (mean - t.meta.zMin) * K * SITE_EX
  return {
    groupY: R - borderLocal * SITE_SCALE,
    targetY: R + (meanLocal - borderLocal) * SITE_SCALE,
  }
}

/** Alpha mask that fades the crop's edges into the globe below. */
function edgeMask() {
  const size = 256
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')!
  const img = ctx.createImageData(size, size)
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const e = Math.min(x, y, size - 1 - x, size - 1 - y) / size
      const a = Math.round(smoothstep(0, 0.14, e) * 255)
      const i = (y * size + x) * 4
      img.data[i] = img.data[i + 1] = img.data[i + 2] = a
      img.data[i + 3] = 255
    }
  ctx.putImageData(img, 0, 0)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.NoColorSpace
  return tex
}

interface Props {
  terrain: Terrain
  plan: RoutePlan | null
  layer: SiteLayer
  /** True in the EVA (HiRISE) view: the terrain shows and the route draws itself. */
  active: boolean
  /** World position of the site target (top of the planet). */
  siteY: number
  /** During a guided walk: a thin trail and no pillars. */
  touring?: boolean
}

export function SiteTerrain({ terrain: t, plan, layer, active, siteY, touring = false }: Props) {
  const tex = useTexture({ ortho: '/terrain/ortho.jpg', color: '/terrain/color.jpg', slope: '/terrain/slope.jpg' })
  for (const v of Object.values(tex)) {
    v.colorSpace = THREE.SRGBColorSpace
    v.anisotropy = 16
  }
  const alpha = useMemo(edgeMask, [])
  const mat = useRef<THREE.MeshStandardMaterial>(null)
  const routeMat = useRef<THREE.MeshBasicMaterial>(null)
  const route = useRef<THREE.Mesh>(null)
  const group = useRef<THREE.Group>(null)
  const progress = useRef(0)
  const placement = useMemo(() => sitePlacement(t), [t])
  const target = useMemo(() => new THREE.Vector3(0, siteY, 0), [siteY])

  const geometry = useMemo(() => {
    const s = t.meta.sizeM * K
    const g = new THREE.PlaneGeometry(s, s, SEG, SEG)
    g.rotateX(-Math.PI / 2)
    const pos = g.attributes.position as THREE.BufferAttribute
    const v = new THREE.Vector3()
    for (let i = 0; i < pos.count; i++) {
      const col = i % (SEG + 1)
      const row = Math.floor(i / (SEG + 1))
      toWorld(t, { u: col / SEG, v: row / SEG }, SITE_EX, 0, v)
      pos.setY(i, v.y)
    }
    g.computeVertexNormals()
    return g
  }, [t])

  const tube = useMemo(() => {
    if (!plan?.points.length) return null
    const pts = plan.points.map((p) => toWorld(t, p, SITE_EX, touring ? 0.35 : 2.2))
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.2)
    return new THREE.TubeGeometry(curve, Math.min(4000, pts.length * 3), touring ? 0.09 : 1.0, 8, false)
  }, [plan, t, touring])

  const stops = useMemo(() => {
    if (!plan) return []
    const ids = Array.from(new Set(plan.legs.flatMap((l) => [l.from, l.to])))
    return ids.map((id) => STATION_BY_ID[id]).filter(Boolean)
  }, [plan])

  useFrame(({ camera }, dt) => {
    const d = camera.position.distanceTo(target)
    const show = active ? 1 - smoothstep(0.05, 0.3, d) : 0
    if (group.current) group.current.visible = show > 0.001
    if (mat.current) mat.current.opacity = show
    // The route draws itself once the camera is down and rewinds when leaving.
    const goal = active && d < 0.03 ? 1 : 0
    progress.current = goal ? Math.min(1, progress.current + dt / 4.5) : Math.max(0, progress.current - dt * 1.5)
    if (route.current && tube) {
      const idx = tube.index!.count
      const n = Math.floor((idx * progress.current) / 6) * 6
      tube.setDrawRange(0, n)
      route.current.visible = n > 0
    }
    if (routeMat.current) routeMat.current.opacity = show
  })

  return (
    <group ref={group} position={[0, placement.groupY, 0]} scale={SITE_SCALE} visible={false}>
      <mesh geometry={geometry} renderOrder={1}>
        <meshStandardMaterial ref={mat} map={tex[layer]} alphaMap={alpha} transparent roughness={1} metalness={0} />
      </mesh>
      {tube && (
        <mesh ref={route} geometry={tube} renderOrder={2}>
          <meshBasicMaterial ref={routeMat} color="#38bdf8" transparent toneMapped={false} />
        </mesh>
      )}
      {active &&
        stops.map((s, i) => {
          const p = toWorld(t, s, SITE_EX, 0)
          return (
            <group key={s.id} position={p}>
              <mesh position={[0, 6, 0]} visible={!touring}>
                <cylinderGeometry args={[0.5, 0.5, 12, 8]} />
                <meshBasicMaterial color={s.kind === 'habitat' ? '#fb923c' : '#fde68a'} toneMapped={false} />
              </mesh>
              <Html position={[0, touring ? 1.5 : 14, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
                <div className="whitespace-nowrap rounded-full bg-[#141a2b]/85 px-2.5 py-1 text-xs font-semibold text-white shadow-lg ring-1 ring-white/15 backdrop-blur">
                  <span
                    className={`mr-1.5 inline-grid h-5 min-w-5 place-items-center rounded-full px-1 font-mono text-[11px] font-bold ${s.kind === 'habitat' ? 'bg-slate-900 text-orange-300' : 'bg-orange-400 text-slate-900'}`}
                  >
                    {pointCode(s.kind, i)}
                  </span>
                  <span className="mr-1">{s.emoji}</span>
                  {tr(s.name)}
                </div>
              </Html>
            </group>
          )
        })}
    </group>
  )
}
