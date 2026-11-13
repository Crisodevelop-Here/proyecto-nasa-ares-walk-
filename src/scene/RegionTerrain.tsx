import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { pointCode } from '../tour/tour'
import type { Milestone, Mission } from '../data/missions'
import type { RegionLayer } from '../region/regionLayers'
import { insidePatch, latLonToUV, REGION_EX, type Region } from '../region/regionTerrain'
import type { Terrain } from '../terrain/terrain'
import type { RoutePlan, Station, UV } from '../types'
import { K, toWorld } from './geo'
import { DETAIL_GLSL } from './MarsGlobe'
import { groundUniforms } from './groundUniforms'
import { MARS_RADIUS_M, R, smoothstep, UNITS_PER_M } from './mars'

/** Region group scale: geo units (K per metre) → globe scene units. */
export const REGION_SCALE = UNITS_PER_M / K
const SEG = 255

/** Local position on the patch, bent down by the planet's curvature (real metres, not exaggerated). */
export function regionLocal(t: Terrain, p: UV, lift = 0, out = new THREE.Vector3()) {
  toWorld(t, p, REGION_EX, lift, out)
  const xm = out.x / K
  const zm = out.z / K
  out.y -= ((xm * xm + zm * zm) / (2 * MARS_RADIUS_M)) * K
  return out
}

/** The patch's mean border height lands on the sphere; the camera target sits on its mean height. */
export function regionPlacement(t: Terrain) {
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
  const borderLocal = (border / n - t.meta.zMin) * K * REGION_EX
  const meanLocal = (mean - t.meta.zMin) * K * REGION_EX
  return { groupY: R - borderLocal * REGION_SCALE, targetY: R + (meanLocal - borderLocal) * REGION_SCALE }
}

/** World position of a point on the patch (for camera shots). */
export function regionWorldPoint(t: Terrain, p: UV) {
  const local = regionLocal(t, p)
  return new THREE.Vector3(0, regionPlacement(t).groupY, 0).addScaledVector(local, REGION_SCALE)
}

function edgeMask() {
  const size = 256
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')!
  const img = ctx.createImageData(size, size)
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const e = Math.min(x, y, size - 1 - x, size - 1 - y) / size
      const a = Math.round(smoothstep(0, 0.08, e) * 255)
      const i = (y * size + x) * 4
      img.data[i] = img.data[i + 1] = img.data[i + 2] = a
      img.data[i + 3] = 255
    }
  ctx.putImageData(img, 0, 0)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.NoColorSpace
  return tex
}

/**
 * Fine ground texture for close-up views (rover / dron height): ridged noise from ~600 m down to
 * ~25 m as bump + albedo grain, each octave fading before it gets smaller than a few pixels.
 * Visual only.
 */

function groundDetail(shader: THREE.WebGLProgramParametersWithUniforms) {
  shader.uniforms.uScale = { value: REGION_SCALE }
  shader.uniforms.uTour = groundUniforms.uTour
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vLoc;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLoc = position;')
  shader.fragmentShader = shader.fragmentShader
    .replace(
      '#include <common>',
      `#include <common>
      uniform float uScale;
      uniform float uTour;
      uniform mat3 uNM; // used by a helper in DETAIL_GLSL (globe only)
      varying vec3 vLoc;
      ${DETAIL_GLSL}
      float groundH(vec2 m, out float alb) {
        float px = length(fwidth(m));
        float h = 0.0;
        alb = 0.0;
        float l = 600.0;
        for (int o = 0; o < 5; o++) {
          float w = smoothstep(4.0 * px, 16.0 * px, l * 0.5);
          if (w > 0.0) {
            float n = dNoise(vec3(m / l, float(o) * 7.31));
            h += (1.0 - abs(2.0 * n - 1.0) - 0.5) * l * 0.05 * w;
            alb += (n - 0.5) * 0.16 * w;
          }
          l /= 2.6;
        }
        return h;
      }
      // Scattered stones like in the Pathfinder / Curiosity photos: Worley cells, a stone per cell
      // (or none), dome-shaped. x = height (m), y = stone coverage 0..1.
      vec2 stones(vec2 m, float cell, float salt) {
        vec2 q = m / cell;
        vec2 c0 = floor(q);
        vec2 acc = vec2(0.0);
        for (int y = -1; y <= 1; y++)
        for (int x = -1; x <= 1; x++) {
          vec2 c = c0 + vec2(x, y);
          vec3 h = dHash(vec3(c, salt));
          if (h.z > 0.62) continue;
          float rad = mix(0.12, 0.36, h.z * h.z * 2.6);
          vec2 d = (q - (c + 0.2 + 0.6 * h.xy)) / rad;
          d.x *= 1.0 + 0.4 * h.y; // a bit elongated, not perfect discs
          float r = length(d);
          if (r < 1.0) {
            float dome = sqrt(1.0 - r * r);
            acc.x = max(acc.x, dome * rad * cell * 0.9);
            acc.y = max(acc.y, smoothstep(1.0, 0.82, r));
          }
        }
        return acc;
      }`,
    )
    .replace(
      '#include <map_fragment>',
      `#include <map_fragment>
      float gAlb;
      vec2 gM = vLoc.xz / ${K.toFixed(4)};
      float gH = groundH(gM, gAlb);
      diffuseColor.rgb *= 1.0 + gAlb;
      if (uTour > 0.001) {
        // The planet's own reddish mix (as on the globe), with rust, ochre dust and dark sand.
        vec3 rust = vec3(0.42, 0.10, 0.035);
        vec3 ochre = vec3(0.55, 0.20, 0.07);
        vec3 darkSand = vec3(0.20, 0.06, 0.03);
        vec3 rock = vec3(0.13, 0.05, 0.03);
        float lum = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
        float n1 = dNoise(vec3(gM / 900.0, 3.1));
        float n2 = dNoise(vec3(gM / 140.0, 5.7));
        float n3 = dNoise(vec3(gM / 2600.0, 9.3));
        vec3 base = mix(rust, ochre, smoothstep(0.35, 0.75, n1));
        base = mix(base, darkSand, smoothstep(0.55, 0.8, n3) * 0.6);
        base *= 0.8 + 0.4 * n2;
        // Keep the globe's own colour variation (bright and dark regions) under it.
        vec3 planet = diffuseColor.rgb * vec3(1.15, 0.95, 0.85);
        base = mix(planet, base * clamp(lum / 0.11, 0.6, 1.4), 0.55);
        float pxs = length(fwidth(gM));
        vec2 s1 = stones(gM, 46.0, 1.0) * smoothstep(3.0 * pxs, 10.0 * pxs, 46.0 * 0.3);
        vec2 s2 = stones(gM, 17.0, 2.0) * smoothstep(3.0 * pxs, 10.0 * pxs, 17.0 * 0.3);
        float cover = max(s1.y, s2.y);
        vec3 rk = rock * (0.8 + 0.6 * dNoise(vec3(gM / 9.0, 8.0)));
        base = mix(base, rk, cover * 0.9);
        diffuseColor.rgb = mix(diffuseColor.rgb, base, uTour);
        gH += (s1.x + s2.x) * 0.35 * uTour;
      }`,
    )
    .replace(
      '#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>
      {
        // Bump from the detail height (metres → local units × exaggeration → view units).
        float hv = gH * ${K.toFixed(4)} * ${REGION_EX.toFixed(1)} * uScale;
        vec3 sp = -vViewPosition;
        vec3 sx = dFdx(sp);
        vec3 sy = dFdy(sp);
        vec2 dh = vec2(dFdx(hv), dFdy(hv));
        vec3 r1 = cross(sy, normal);
        vec3 r2 = cross(normal, sx);
        float det = dot(sx, r1) * faceDirection;
        normal = normalize(abs(det) * normal - sign(det) * (dh.x * r1 + dh.y * r2));
      }`,
    )
}

/** Densified track inside the patch, split where it leaves the patch. */
function trackRuns(r: Region, track: [number, number][]) {
  const runs: UV[][] = []
  let cur: UV[] = []
  for (let i = 0; i < track.length; i++) {
    const a = latLonToUV(r, track[i][0], track[i][1])
    const b = i + 1 < track.length ? latLonToUV(r, track[i + 1][0], track[i + 1][1]) : null
    if (!insidePatch(a)) {
      if (cur.length > 1) runs.push(cur)
      cur = []
      continue
    }
    if (!b) {
      cur.push(a)
      break
    }
    const steps = Math.max(1, Math.ceil(Math.hypot(b.u - a.u, b.v - a.v) / 0.004))
    for (let k = 0; k < steps; k++) cur.push({ u: a.u + ((b.u - a.u) * k) / steps, v: a.v + ((b.v - a.v) * k) / steps })
  }
  if (cur.length > 1) runs.push(cur)
  return runs
}

interface Props {
  region: Region
  textures: Record<RegionLayer, THREE.Texture>
  normalMap: THREE.Texture | null
  layer: RegionLayer
  plan: RoutePlan | null
  stops: Station[]
  missions: Mission[]
  active: boolean
  /** During a guided traverse: thin lines on the ground, no pillars or mission markers. */
  touring?: boolean
  onMilestone: (m: Mission, s: Milestone) => void
}

export function RegionTerrain({ region, textures, normalMap, layer, plan, stops, missions, active, touring = false, onMilestone }: Props) {
  const t = region.terrain
  const alpha = useMemo(edgeMask, [])
  const mat = useRef<THREE.MeshStandardMaterial>(null)
  const group = useRef<THREE.Group>(null)
  // Screen labels, by priority (lower = more important). Overlapping lower-priority labels are hidden.
  const labels = useRef(new Map<string, { el: HTMLElement; pri: number }>())
  const declutterAt = useRef(0)
  const labelRef = (key: string, pri: number) => (el: HTMLElement | null) => {
    if (el) labels.current.set(key, { el, pri })
    else labels.current.delete(key)
  }
  const route = useRef<THREE.Mesh>(null)
  const routeBack = useRef<THREE.Mesh>(null)
  const fade = useRef(0)
  // Labels only once the terrain is on screen (not floating over the globe during the dive).
  const [near, setNear] = useState(false)
  const progress = useRef(0)
  const placement = useMemo(() => regionPlacement(t), [t])
  const target = useMemo(() => new THREE.Vector3(0, placement.targetY, 0), [placement])

  const geometry = useMemo(() => {
    const s = t.meta.sizeM * K
    const g = new THREE.PlaneGeometry(s, s, SEG, SEG)
    g.rotateX(-Math.PI / 2)
    const pos = g.attributes.position as THREE.BufferAttribute
    const v = new THREE.Vector3()
    for (let i = 0; i < pos.count; i++) {
      regionLocal(t, { u: (i % (SEG + 1)) / SEG, v: Math.floor(i / (SEG + 1)) / SEG }, 0, v)
      pos.setXYZ(i, v.x, v.y, v.z)
    }
    g.computeVertexNormals()
    return g
  }, [t])

  const lift = t.meta.sizeM * K * 0.0025
  // Outbound legs as a solid line, the way back thinner and translucent so the two don't merge.
  const tubes = useMemo(() => {
    if (!plan?.points.length) return null
    const lastLeg = plan.legs.length - 1
    // At ground level (traverse) the line is a thin painted trail, from orbit a bold one.
    const k = touring ? 0.12 : 1
    const make = (pts: UV[], r: number) => {
      if (pts.length < 2) return null
      r *= k
      const curve = new THREE.CatmullRomCurve3(
        pts.map((p) => regionLocal(t, p, lift * (touring ? 0.15 : 1))),
        false,
        'centripetal',
        0.2,
      )
      return new THREE.TubeGeometry(curve, Math.min(4000, pts.length * 2), r, 8, false)
    }
    const out = plan.points.filter((p) => p.leg < lastLeg)
    const back = plan.points.filter((p) => p.leg === lastLeg)
    // Join the two pieces at the last stop.
    if (out.length && back.length) back.unshift(out[out.length - 1])
    return { out: make(out.length ? out : back, lift * 0.9), back: out.length ? make(back, lift * 0.55) : null, split: out.length / plan.points.length }
  }, [plan, t, lift, touring])

  const tracks = useMemo(
    () =>
      missions.flatMap((m) =>
        trackRuns(region, m.track).map((run, i) => {
          const pts = run.map((p) => regionLocal(t, p, lift * (touring ? 0.1 : 0.6)))
          const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.3)
          return { key: `${m.id}-${i}`, color: m.color, geo: new THREE.TubeGeometry(curve, Math.min(2000, pts.length * 3), lift * (touring ? 0.06 : 0.55), 6, false) }
        }),
      ),
    [missions, region, t, lift, touring],
  )

  const marks = useMemo(
    () =>
      missions.flatMap((m) =>
        m.milestones
          .map((s) => ({ m, s, uv: latLonToUV(region, s.lat, s.lon) }))
          .filter((x) => insidePatch(x.uv, 0.01))
          .map((x) => ({ ...x, pos: regionLocal(t, x.uv, 0) })),
      ),
    [missions, region, t],
  )

  useFrame(({ camera }, dt) => {
    const d = camera.position.distanceTo(target)
    fade.current = THREE.MathUtils.damp(fade.current, active ? 1 : 0, 4, dt)
    groundUniforms.uTour.value = THREE.MathUtils.damp(groundUniforms.uTour.value, touring ? 1 : 0, 2.5, dt)
    const show = fade.current * (1 - smoothstep(2.5, 4, d))
    if (group.current) group.current.visible = show > 0.01
    const isNear = show > 0.6
    if (isNear !== near) setNear(isNear)
    if (mat.current) mat.current.opacity = show
    progress.current = active && plan ? Math.min(1, progress.current + dt / 4.5) : 0
    if (tubes) {
      const draw = (mesh: THREE.Mesh | null, geo: THREE.TubeGeometry | null, f: number) => {
        if (!mesh || !geo) return
        const n = Math.floor((geo.index!.count * Math.min(1, Math.max(0, f))) / 6) * 6
        geo.setDrawRange(0, n)
        mesh.visible = n > 0
      }
      const s = Math.max(0.01, tubes.split)
      draw(route.current, tubes.out, progress.current / s)
      draw(routeBack.current, tubes.back, (progress.current - s) / Math.max(0.01, 1 - s))
    }
    // ~10 times a second is enough for labels and saves layout work every frame.
    declutterAt.current -= dt
    if (declutterAt.current <= 0) {
      declutterAt.current = 0.1
      declutter(labels.current)
    }
  })

  const pillar = lift * 6
  return (
    <group ref={group} position={[0, placement.groupY, 0]} scale={REGION_SCALE} visible={false}>
      <mesh geometry={geometry} renderOrder={1}>
        {/* Self-lit fill: the side of a steep relief facing away from the sun otherwise goes black,
            hiding the data colours. Strong for the data maps (relief/slope), light for the photo. */}
        <meshStandardMaterial
          ref={mat}
          map={textures[layer]}
          emissive="#ffffff"
          emissiveMap={textures[layer]}
          emissiveIntensity={layer === 'optical' ? 0.12 : 0.4}
          normalMap={normalMap}
          key={normalMap ? 'n' : 'f'}
          alphaMap={alpha}
          transparent
          roughness={1}
          metalness={0}
          onBeforeCompile={groundDetail}
          customProgramCacheKey={() => 'region-ground-detail'}
        />
      </mesh>
      {tracks.map((tr) => (
        <mesh key={tr.key} geometry={tr.geo} renderOrder={2}>
          <meshBasicMaterial color={tr.color} transparent opacity={0.85} toneMapped={false} />
        </mesh>
      ))}
      {tubes?.out && (
        <mesh ref={route} geometry={tubes.out} renderOrder={3}>
          <meshBasicMaterial color="#fb923c" toneMapped={false} />
        </mesh>
      )}
      {tubes?.back && (
        <mesh ref={routeBack} geometry={tubes.back} renderOrder={3}>
          <meshBasicMaterial color="#fdba74" transparent opacity={0.6} toneMapped={false} />
        </mesh>
      )}
      {active &&
        near &&
        stops.map((s, i) => {
          const p = regionLocal(t, s, 0)
          return (
            <group key={s.id} position={p}>
              <mesh position={[0, pillar / 2, 0]} visible={!touring}>
                <cylinderGeometry args={[lift * 0.5, lift * 0.5, pillar, 8]} />
                <meshBasicMaterial color={s.kind === 'habitat' ? '#fb923c' : '#fde68a'} toneMapped={false} />
              </mesh>
              <Html position={[0, touring ? lift * 2 : pillar * 1.15, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
                <div
                  ref={labelRef(`stop-${s.id}`, i)}
                  className={`-translate-y-6 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold shadow-lg ring-1 backdrop-blur ${s.kind === 'habitat' ? 'bg-orange-400/90 text-slate-900 ring-orange-200/40' : 'bg-[#141a2b]/85 text-white ring-white/15'}`}
                >
                  <span
                    className={`mr-1.5 inline-grid h-5 min-w-5 place-items-center rounded-full px-1 font-mono text-[11px] font-bold ${s.kind === 'habitat' ? 'bg-slate-900 text-orange-300' : 'bg-orange-400 text-slate-900'}`}
                  >
                    {pointCode(s.kind, i)}
                  </span>
                  <span className="mr-1">{s.emoji}</span>
                  {s.name}
                </div>
              </Html>
            </group>
          )
        })}
      {active &&
        near &&
        !touring &&
        marks.map(({ m, s, pos }) => (
          <group key={`${m.id}-${s.sol}`} position={pos}>
            <mesh position={[0, pillar * 0.3, 0]}>
              <sphereGeometry args={[lift * 0.9, 12, 12]} />
              <meshBasicMaterial color={m.color} toneMapped={false} />
            </mesh>
            <Html position={[0, pillar * 0.55, 0]} center zIndexRange={[25, 0]}>
              <button
                ref={labelRef(`ms-${m.id}-${s.sol}`, 1000)}
                onClick={() => onMilestone(m, s)}
                className="whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-slate-900 shadow hover:scale-105"
                style={{ background: m.color }}
                title={`${s.title}: ${s.what}`}
              >
                {m.kind === 'lander' ? m.name : `Sol ${s.sol}`}
              </button>
            </Html>
          </group>
        ))}
    </group>
  )
}

/**
 * Hides labels that would sit on top of a more important one. Reads every label's on-screen box
 * first, then keeps them greedily by priority (route stops before mission milestones).
 */
function declutter(labels: Map<string, { el: HTMLElement; pri: number }>) {
  if (labels.size < 2) return
  const PAD = 4
  const items = [...labels.values()].map((l) => ({ ...l, r: l.el.getBoundingClientRect() }))
  items.sort((a, b) => a.pri - b.pri)
  const kept: DOMRect[] = []
  for (const it of items) {
    const { r } = it
    const hit = r.width > 0 && kept.some((k) => r.left < k.right + PAD && r.right > k.left - PAD && r.top < k.bottom + PAD && r.bottom > k.top - PAD)
    if (!hit) kept.push(r)
    const op = hit ? '0' : '1'
    if (it.el.style.opacity !== op) {
      it.el.style.opacity = op
      it.el.style.transition = 'opacity 150ms'
      it.el.style.pointerEvents = hit ? 'none' : ''
    }
  }
}
