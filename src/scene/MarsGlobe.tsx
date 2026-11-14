import { useTexture } from '@react-three/drei'
import { LITE } from '../perf'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { forwardRef, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { MISSIONS, type Mission } from '../data/missions'
import { trekGlobeCanvas } from '../region/regionLayers'
import { groundUniforms } from './groundUniforms'
import { DISPLACEMENT_BIAS, DISPLACEMENT_SCALE, latLonOf, onSphere, R, smoothstep } from './mars'

/**
 * Procedural surface detail for the globe up close: Worley craters (bowl, raised rim, dark floor,
 * bright ejecta) at 80/28/10/3.5 km, plus dust/sand patches. Each octave fades out before it gets
 * smaller than a few pixels, so there is no shimmering from afar. Visual only (not measured data).
 */
export const DETAIL_GLSL = /* glsl */ `
vec3 dHash(vec3 p3) {
  p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yxz + 33.33);
  return fract((p3.xxy + p3.yxx) * p3.zyx);
}
float dNoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = dHash(i).x, b = dHash(i + vec3(1, 0, 0)).x, c = dHash(i + vec3(0, 1, 0)).x, d = dHash(i + vec3(1, 1, 0)).x;
  float e = dHash(i + vec3(0, 0, 1)).x, g = dHash(i + vec3(1, 0, 1)).x, h = dHash(i + vec3(0, 1, 1)).x, k = dHash(i + vec3(1, 1, 1)).x;
  return mix(mix(mix(a, b, f.x), mix(c, d, f.x), f.y), mix(mix(e, g, f.x), mix(h, k, f.x), f.y), f.z);
}
// Crater height profile (in units of the crater's diameter) at normalised radius r, Martian morphology:
//   simple bowl (small) → complex (big): flat floor, central peak, terraced wall; raised rim; ejecta
//   blanket with lobate "rampart" edge (impacts into ice-rich ground); old craters shallow and infilled.
// k: x = freshness 0..1, y = complexity 0..1, z = ejecta lobe edge radius, w = infill 0..1
float craterProfile(float r, vec4 k) {
  float fresh = k.x, cx = k.y, edge = k.z, fill = k.w;
  float depth = mix(0.2, 0.09, cx) * mix(0.25, 1.0, fresh);
  float rim = mix(0.035, 0.02, cx) * mix(0.3, 1.0, fresh);
  float h;
  if (r < 1.0) {
    float floorR = mix(0.15, 0.5, cx);
    float t = clamp((r - floorR) / (1.0 - floorR), 0.0, 1.0);
    // Steep upper wall, gentler lower wall; terraces on complex craters.
    float wall = pow(t, mix(2.0, 1.4, cx));
    wall += cx * fresh * 0.06 * sin(t * 18.0) * t;
    h = -depth + (depth + rim) * wall;
    // Central peak (complex craters only).
    h += cx * fresh * depth * 0.45 * exp(-pow(r / 0.16, 2.0));
    // Dust / sand infill flattens old floors.
    h = max(h, -depth * (1.0 - fill));
  } else {
    // Ejecta: thins as r^-3 and stops at a lobed rampart edge (fresh craters).
    float blanket = rim * (pow(r, -3.0) - 0.09) / 0.91;
    float rampart = fresh * rim * 0.55 * smoothstep(edge, edge - 0.18, r) * smoothstep(1.0, 1.15, r);
    h = max(0.0, blanket) + rampart;
  }
  return h;
}
// xyz = gradient of the crater height (object space, exaggerated), w = albedo offset.
// The gradient is analytic along r (numeric derivative of the profile): dFdx/dFdy work on 2×2
// pixel quads and make rims jagged.
vec4 craterOctave(vec3 p, float cell, float salt) {
  vec3 q = p / cell;
  vec3 c0 = floor(q);
  vec4 acc = vec4(0.0);
  vec3 up = normalize(p);
  // Prevailing wind (tangent to the surface): bright streaks form downwind of craters.
  vec3 wind = normalize(vec3(0.9, 0.15, 0.4));
  wind = normalize(wind - up * dot(wind, up));
  for (int z = -1; z <= 1; z++)
  for (int y = -1; y <= 1; y++)
  for (int x = -1; x <= 1; x++) {
    vec3 c = c0 + vec3(x, y, z);
    vec3 h = dHash(c + salt);
    vec3 h2 = dHash(c * 1.7 + salt + 11.0);
    // Crater density varies by region (terrains of different age).
    float density = 0.32 + 0.4 * dNoise(c * 0.11 + salt);
    if (h2.x > density) continue;
    float rad = mix(0.1, 0.42, h2.y * h2.y);
    vec3 dq = q - (c + 0.15 + 0.7 * h);
    float dist = length(dq);
    if (dist < 1e-6) continue;
    vec3 dir = dq / dist;
    // Irregular rim: the radius wobbles with direction (no perfect circles).
    float wob = 1.0 + 0.16 * (dNoise(dir * 3.0 + h * 13.0) - 0.5) + 0.06 * (dNoise(dir * 9.0 + h * 5.0) - 0.5);
    float r = dist / (rad * wob);
    if (r > 2.4) continue;
    vec3 h3 = dHash(c * 2.3 + salt + 29.0);
    float fresh = h3.x * h3.x; // most craters are old
    float dia = 2.0 * rad * cell;
    float cx = smoothstep(0.012, 0.035, dia); // ~4–12 km: simple → complex
    float edge = 1.75 + 0.35 * dNoise(dir * 5.0 + h * 3.0); // lobed rampart edge
    float fill = (1.0 - fresh) * (0.3 + 0.6 * h3.y);
    vec4 k = vec4(fresh, cx, edge, fill);
    float e = 0.01;
    float dhdr = (craterProfile(r + e, k) - craterProfile(max(0.0, r - e), k)) / (2.0 * e) * dia;
    acc.xyz += dhdr * dir / (rad * wob * cell);
    // Albedo: dark sand / dunes on the floor, bright rim crest, bright ejecta (fresh), wind streak.
    float a = 0.0;
    if (r < 1.0) a -= (0.08 + 0.1 * (1.0 - fresh)) * smoothstep(0.85, 0.3, r) * (0.6 + 0.8 * dNoise(q * 40.0 + h));
    a += 0.07 * fresh * exp(-pow((r - 1.0) / 0.08, 2.0));
    if (r > 1.0) a += 0.08 * fresh * smoothstep(edge, 1.05, r);
    float along = dot(dq / rad, wind);
    float side = length(dq / rad - wind * along);
    if (along > 0.9) a += 0.06 * (0.4 + fresh) * smoothstep(5.0, 1.0, along) * smoothstep(0.9, 0.2, side / max(0.3, 1.0 - (along - 1.0) * 0.18));
    acc.w += a;
  }
  return acc;
}
// xyz = height gradient, w = albedo offset.
vec4 surfaceDetail(vec3 p) {
  float px = length(fwidth(p)); // scene units per pixel
  vec4 d = vec4(0.0);
  float cell = 28.0 / 339.5; // craters up to ~24 km; the big ones are already in the real MOLA relief
  for (int o = 0; o < 4; o++) {
    float w = smoothstep(3.0 * px, 12.0 * px, cell * 0.25);
    if (w > 0.0) d += craterOctave(p, cell, float(o) * 17.0) * w;
    cell /= 2.85;
  }
  float pw = smoothstep(2.0 * px, 8.0 * px, 0.02);
  d.w += (dNoise(p * 40.0) - 0.5) * 0.28 + (dNoise(p * 160.0) - 0.5) * 0.12 * pw;
  d.xyz *= 3.0; // same vertical exaggeration as the regional terrain
  return d;
}
// Ground-level look on the whole planet (same as the regional terrain during a traverse):
// the planet's reddish mix with rust, ochre dust, dark sand and fields of stones (3D Worley cells
// in metres on the sphere). Albedo only; fades out when its features get smaller than a few pixels.
float stones3(vec3 m, float cell, float salt) {
  vec3 q = m / cell;
  vec3 c0 = floor(q);
  float cover = 0.0;
  for (int z = -1; z <= 1; z++)
  for (int y = -1; y <= 1; y++)
  for (int x = -1; x <= 1; x++) {
    vec3 c = c0 + vec3(x, y, z);
    vec3 h = dHash(c + salt);
    if (h.z > 0.62) continue;
    float rad = mix(0.12, 0.36, h.z * h.z * 2.6);
    float r = length(q - (c + 0.2 + 0.6 * h)) / rad;
    cover = max(cover, smoothstep(1.0, 0.82, r));
  }
  return cover;
}
vec3 groundLook(vec3 col, vec3 p) {
  vec3 m = p * 338950.0; // scene units → metres on the surface
  float pxs = length(fwidth(m));
  vec3 rust = vec3(0.42, 0.10, 0.035);
  vec3 ochre = vec3(0.55, 0.20, 0.07);
  vec3 darkSand = vec3(0.20, 0.06, 0.03);
  vec3 rock = vec3(0.13, 0.05, 0.03);
  float lum = dot(col, vec3(0.3, 0.59, 0.11));
  float n1 = dNoise(m / 900.0 + 3.1);
  float n2 = dNoise(m / 140.0 + 5.7);
  float n3 = dNoise(m / 2600.0 + 9.3);
  vec3 base = mix(rust, ochre, smoothstep(0.35, 0.75, n1));
  base = mix(base, darkSand, smoothstep(0.55, 0.8, n3) * 0.6);
  base *= 0.8 + 0.4 * mix(0.5, n2, smoothstep(2.0 * pxs, 8.0 * pxs, 140.0));
  base = mix(col * vec3(1.15, 0.95, 0.85), base * clamp(lum / 0.11, 0.6, 1.4), 0.55);
  float w1 = smoothstep(3.0 * pxs, 10.0 * pxs, 46.0 * 0.3);
  float w2 = smoothstep(3.0 * pxs, 10.0 * pxs, 17.0 * 0.3);
  float cover = 0.0;
  if (w1 > 0.0) cover = max(cover, stones3(m, 46.0, 1.0) * w1);
  if (w2 > 0.0) cover = max(cover, stones3(m, 17.0, 2.0) * w2);
  return mix(base, rock * (0.8 + 0.6 * n2), cover * 0.9);
}
vec3 detailBump(vec3 objPos, vec3 n, vec3 grad) {
  vec3 up = normalize(objPos);
  vec3 g = grad - up * dot(grad, up);
  float m = length(g);
  if (m > 1.4) g *= 1.4 / m; // soften: no pitch-black walls
  return normalize(n - uNM * g);
}
`

/** The focused spot always ends on top of the world (+y). */
const TOP = new THREE.Vector3(0, R, 0)

/** Fresnel halo on a back-facing shell. Includes the log-depth chunks so it sorts against the globe. */
const atmosphereMaterial = () =>
  new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color('#f0a26a') }, uOpacity: { value: 1 }, uEdge: { value: 0.33 } },
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      varying vec3 vNormal;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_fragment>
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uEdge;
      varying vec3 vNormal;
      void main() {
        #include <logdepthbuf_fragment>
        float a = pow(clamp(-vNormal.z / uEdge, 0.0, 1.0), 2.2) * uOpacity;
        gl_FragColor = vec4(uColor * a, a);
      }`,
    side: THREE.BackSide,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })

/** Background stars as plain Points (built-in material, so it works with the logarithmic depth buffer). */
export function StarField({ count = 6000, radius = 900 }) {
  const geo = useMemo(() => {
    const pos = new Float32Array(count * 3)
    const col = new Float32Array(count * 3)
    const c = new THREE.Color()
    for (let i = 0; i < count; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(radius)
      pos.set([v.x, v.y, v.z], i * 3)
      const t = Math.random()
      c.setHSL(t < 0.2 ? 0.08 : t < 0.35 ? 0.6 : 0.12, 0.35, 0.55 + Math.random() * 0.45)
      col.set([c.r, c.g, c.b], i * 3)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('color', new THREE.BufferAttribute(col, 3))
    return g
  }, [count, radius])
  return (
    <points name="stars" geometry={geo} renderOrder={-2} frustumCulled={false}>
      <pointsMaterial size={1.6} sizeAttenuation={false} vertexColors depthWrite={false} />
    </points>
  )
}

export type View = 'globe' | 'region' | 'site'

interface Props {
  view: View
  /** Low-end device: lighter sphere mesh and a 2048 px texture. */
  low?: boolean
  onPick: (lat: number, lon: number, mission?: Mission) => void
  onHover: (p: { lat: number; lon: number } | null) => void
}

/** The planet. Lives inside the oriented planet group; the focused spot ends on top (+y). */
export const MarsGlobe = forwardRef<THREE.Group, Props>(function MarsGlobe({ view, low = false, onPick, onHover }, ref) {
  const [map, height, normal] = useTexture(
    LITE ? ['/globe/mars_2k.jpg', '/globe/mola_height_lite.png', '/globe/mola_normal_lite.jpg'] : ['/globe/mars_4k.jpg', '/globe/mola_height.png', '/globe/mola_normal.jpg'],
  )
  map.colorSpace = THREE.SRGBColorSpace
  map.anisotropy = LITE ? 4 : 16
  normal.colorSpace = THREE.NoColorSpace

  const surface = useRef<THREE.MeshStandardMaterial>(null)
  // Swap in the NASA Mars Trek colour mosaic (Viking MDIM 2.1) once its tiles load; the bundled
  // texture stays if Trek is offline.
  useEffect(() => {
    let live = true
    let tex: THREE.CanvasTexture | null = null
    const mat = surface.current
    trekGlobeCanvas(LITE ? 2048 : 4096)
      .then((c) => {
        const m = mat
        if (!live || !m) return
        if (low && c.width > 2048) {
          const small = document.createElement('canvas')
          small.width = 2048
          small.height = 1024
          small.getContext('2d')!.drawImage(c, 0, 0, 2048, 1024)
          c = small
        }
        tex = new THREE.CanvasTexture(c)
        tex.colorSpace = THREE.SRGBColorSpace
        tex.anisotropy = low ? 4 : 16
        m.map = tex
        m.needsUpdate = true
      })
      .catch(() => {})
    return () => {
      live = false
      if (tex && mat?.map === tex) mat.map = map
      tex?.dispose()
    }
  }, [map, low])
  const atmo = useMemo(atmosphereMaterial, [])
  const markers = useRef<THREE.Group>(null)
  const markerFade = useRef(1)
  const atmoFade = useRef(1)
  // Near the HiRISE site, the 5 km/px global texture is blended toward the crop's mean tone
  // so the terrain reads as part of the ground instead of a patch on a blurry carpet.
  const siteUniforms = useMemo(
    () => ({
      uSiteMix: { value: 0 },
      uSiteColor: { value: new THREE.Color().setRGB(130 / 255, 107 / 255, 86 / 255, THREE.SRGBColorSpace) },
      uDetail: { value: 0 },
      // Points at the globe mesh's normalMatrix (set on mount), to bring the gradient to view space.
      uNM: { value: new THREE.Matrix3() },
    }),
    [],
  )
  const onBeforeCompile = useMemo(
    () => (shader: THREE.WebGLProgramParametersWithUniforms) => {
      Object.assign(shader.uniforms, siteUniforms)
      shader.uniforms.uTour = groundUniforms.uTour
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vObj;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position;')
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>\nuniform float uSiteMix;\nuniform vec3 uSiteColor;\nuniform float uDetail;\nuniform float uTour;\nuniform mat3 uNM;\nvarying vec3 vObj;\n${DETAIL_GLSL}`,
        )
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
          float siteLum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
          diffuseColor.rgb = mix(diffuseColor.rgb, uSiteColor * (0.85 + 0.6 * siteLum), uSiteMix);
          vec4 surfDetail = uDetail > 0.001 ? surfaceDetail(vObj) * uDetail : vec4(0.0);
          float dm = 1.0 + surfDetail.w;
          vec3 dc = diffuseColor.rgb * dm;
          float dl = dot(dc, vec3(0.3, 0.59, 0.11));
          // Dark ground leans grey (basaltic sand), like the regional terrain.
          diffuseColor.rgb = mix(dc, vec3(dl * 1.08, dl * 0.97, dl * 0.9), smoothstep(1.0, 0.72, dm) * 0.4);
          if (uTour > 0.001) diffuseColor.rgb = mix(diffuseColor.rgb, groundLook(diffuseColor.rgb, vObj), uTour);`,
        )
        .replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
          if (uDetail > 0.001) normal = detailBump(vObj, normal, surfDetail.xyz);`,
        )
    },
    [siteUniforms],
  )

  useFrame(({ camera }, dt) => {
    const alt = camera.position.length() - R
    const toTop = camera.position.distanceTo(TOP)
    const m = surface.current
    if (m) {
      // Flatten the exaggerated relief as we dive, so the close-up terrain sits on a smooth surface.
      const k = smoothstep(0.3, 2.5, toTop)
      m.displacementScale = DISPLACEMENT_SCALE * k
      m.displacementBias = DISPLACEMENT_BIAS * k
      m.normalScale.setScalar(k)
      // Surface detail (craters, dust and sand) fades in as the camera gets close to the ground.
      siteUniforms.uDetail.value = 1 - smoothstep(0.8, 6, alt)
      siteUniforms.uSiteMix.value = view === 'site' ? 0.85 * (1 - smoothstep(0.04, 0.5, toTop)) : 0
      // Close to the ground the globe stops writing depth: the terrain then always draws over it.
      m.depthWrite = alt > 0.4 && view === 'globe'
    }
    // Only on the globe view: on the terrain views the globe doesn't write depth, so the far side
    // of the atmosphere shell would be painted over the ground as an orange glare.
    atmoFade.current = THREE.MathUtils.damp(atmoFade.current, view === 'globe' ? 1 : 0, 5, dt)
    atmo.uniforms.uOpacity.value = smoothstep(0.15, 1.5, alt) * atmoFade.current
    markerFade.current = THREE.MathUtils.damp(markerFade.current, view === 'globe' ? 1 : 0, 4, dt)
    if (markers.current) {
      markers.current.visible = markerFade.current > 0.02
      markers.current.traverse((o) => {
        const mm = (o as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined
        if (mm && 'opacity' in mm) mm.opacity = markerFade.current
      })
    }
  })

  const tracks = useMemo(
    () =>
      MISSIONS.filter((m) => m.track.length > 1).map(
        (m) =>
          new THREE.Line(
            new THREE.BufferGeometry().setFromPoints(m.track.map(([la, lo]) => onSphere(la, lo, R * 1.004))),
            new THREE.LineBasicMaterial({ color: m.color, transparent: true }),
          ),
      ),
    [],
  )

  const toLatLon = (e: ThreeEvent<PointerEvent | MouseEvent>) => latLonOf(e.object.worldToLocal(e.point.clone()))

  return (
    <group ref={ref}>
      <mesh
        ref={(m: THREE.Mesh | null) => {
          if (m) siteUniforms.uNM.value = m.normalMatrix
        }}
        renderOrder={-1}
        onClick={(e) => {
          if (view !== 'globe' || e.delta > 5) return
          e.stopPropagation()
          const p = toLatLon(e)
          onPick(p.lat, p.lon)
        }}
        onPointerMove={(e) => {
          if (view !== 'globe') return
          onHover(toLatLon(e))
        }}
        onPointerOut={() => onHover(null)}
      >
        <sphereGeometry args={[R, low ? 256 : 512, low ? 128 : 256]} />
        <meshStandardMaterial
          ref={surface}
          map={map}
          displacementMap={height}
          displacementScale={DISPLACEMENT_SCALE}
          displacementBias={DISPLACEMENT_BIAS}
          normalMap={normal}
          roughness={1}
          metalness={0}
          onBeforeCompile={onBeforeCompile}
        />
      </mesh>
      <group ref={markers}>
        {tracks.map((l) => (
          <primitive key={l.id} object={l} />
        ))}
        {MISSIONS.map((m) => (
          <mesh
            key={m.id}
            position={onSphere(m.lat, m.lon, R * 1.012)}
            onClick={(e) => {
              if (view !== 'globe' || e.delta > 5) return
              e.stopPropagation()
              onPick(m.lat, m.lon, m)
            }}
            onPointerOver={() => (document.body.style.cursor = 'pointer')}
            onPointerOut={() => (document.body.style.cursor = '')}
          >
            <sphereGeometry args={[m.kind === 'rover' ? 0.075 : 0.055, 16, 16]} />
            <meshBasicMaterial color={m.color} transparent toneMapped={false} />
          </mesh>
        ))}
      </group>
      <mesh scale={1.06} material={atmo} raycast={() => null}>
        <sphereGeometry args={[R, 96, 48]} />
      </mesh>
    </group>
  )
})
