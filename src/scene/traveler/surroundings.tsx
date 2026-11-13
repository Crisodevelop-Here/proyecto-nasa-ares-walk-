// What surrounds the traveller during a guided traverse: sky, boulders along the route and dust.
import { useMemo } from 'react'
import * as THREE from 'three'
import type { RoutePlan, UV } from '../../types'
import { K } from '../geo'

/**
 * Martian daytime sky around the camera: butterscotch at the horizon (suspended dust), darker
 * brown overhead, and a pale halo around the small Sun. Fades in with `k`.
 */
export const SKY_HORIZON = new THREE.Color('#d39a72')
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

export const DUST = 220

/** Soft round contact shadow. */
export function blobTexture() {
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
export function dustMaterial() {
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
